/* GraphBranch — vista conjunta: todos los repos seguidos en una misma pantalla, cada uno en su tarjeta con su
   estado, sus cifras, su último commit y su grafo 2D en vivo (una instancia de GB.Graph por repo, con su propio
   layout). No hace consultas: dibuja lo que cada pestaña ya cargó y se pone al día con sus novedades. Todo texto
   que viene del repo entra con textContent. */
(function (GB) {
  'use strict';

  /** `?all=1`: la página abre con la vista conjunta (si hay más de un repo). `?all=0` la apaga aunque se recordara.
      null si no lo dice. */
  function allParam(q) {
    if (!q.has('all')) return null;
    return !/^(0|false|no|off)$/i.test(q.get('all') || '');
  }

  /** `?by=login`: el filtro por persona del Launchpad (se compara sin tocar mayúsculas contra las personas de los PRs, así
      que un login desconocido no filtra nada). '' si no lo dice o viene vacío. */
  function personParam(q) {
    return (q.get('by') || '').trim().slice(0, 100);
  }

  /** El commit más nuevo de lo cargado (por fecha; a igual fecha, el primero que llegó). */
  function lastCommit(data) {
    let best = null;
    for (const c of data.commits.values()) if (!best || (c.date || 0) > (best.date || 0)) best = c;
    return best;
  }

  /** Las cifras de una tarjeta: ramas a la vista, commits en el grafo, PRs abiertos y la fecha del último commit. */
  function summary(data, L) {
    const last = lastCommit(data);
    return {
      branches: data.branches.size,
      commits: L ? L.nodes.length : data.commits.size,
      prs: Math.max(data.totalPulls || 0, data.pulls.size),
      last,
      lastAt: last?.date || 0,
    };
  }

  /** Los totales de la cabecera: repos, ramas y PRs abiertos de todas las tarjetas. */
  function totals(list) {
    return list.reduce((t, s) => ({ repos: t.repos + 1, branches: t.branches + (s.branches || 0), prs: t.prs + (s.prs || 0) }), { repos: 0, branches: 0, prs: 0 });
  }

  /** Más ramas que estas entre todos los repos a la vez y la vista conjunta empieza a ir lenta (con 20 repos se llega fácil). */
  const HEAVY_BRANCHES = 1500;
  const heavy = (sum) => (sum.branches || 0) > HEAVY_BRANCHES;

  /** Cuántas columnas y filas reparten `n` tarjetas en un área de `w`×`h` píxeles para que entren todas sin desplazarse
      (el modo TV de la vista conjunta): la grilla en que cada tarjeta puede ser más grande sin dejar de tener la forma
      `ratio` (ancho/alto). A igual tamaño, la que deja menos huecos. Devuelve { cols, rows }. */
  function fitGrid(n, w, h, ratio = 1.5) {
    n = Math.max(1, Math.floor(n) || 1);
    if (!(w > 0) || !(h > 0)) return { cols: Math.min(n, 2), rows: Math.ceil(n / Math.min(n, 2)) };
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const size = Math.min(w / cols / ratio, h / rows); // el alto de la tarjeta más grande que cabe en cada celda
      const holes = cols * rows - n;
      if (!best || size > best.size + 0.5 || (Math.abs(size - best.size) <= 0.5 && holes < best.holes)) best = { cols, rows, size, holes };
    }
    return { cols: best.cols, rows: best.rows };
  }

  /** Los grupos del Launchpad, en el orden en que se muestran. */
  const PR_GROUPS = ['draft', 'failing', 'approved', 'waiting'];

  const PR_GROUP_KEY = { draft: 'all.prs.draft', failing: 'all.prs.failing', approved: 'all.prs.approved', waiting: 'all.prs.waiting', issues: 'all.issues.title' };

  /** El grupo de los issues abiertos, después de los de PRs. */
  const ISSUE_GROUP = 'issues';

  /** La identidad de un PR para fijarlo: repo y número, nunca el título. */
  const pinId = (key, number) => `${key}#${number}`;

  /** La identidad de un issue para fijarlo o posponerlo: repo y número, distinta de la de un PR (en GitLab, Bitbucket o
      Azure los issues y los PRs se numeran aparte y el mismo número puede ser de los dos). */
  const issuePinId = (key, number) => `${key}#issue-${number}`;

  /** Los issues abiertos de un repo según su actividad ya cargada (los `issue-open` e `issue-close`, en cualquier orden y
      sin consultar nada): cada número una vez, abierto si su último evento lo abrió (o lo reabrió). Del más nuevo al más
      viejo: [{ number, title, url, user, createdAt }], con quien lo abrió y la hora de la primera apertura que se vio.
      Lo que no trae número no cuenta: no se puede fijar ni saber si se cerró. */
  function openIssues(acts) {
    const last = new Map(); // número -> su último evento
    const first = new Map(); // número -> su primera apertura
    for (const a of acts || []) {
      if (!a || (a.kind !== 'issue-open' && a.kind !== 'issue-close') || a.number == null || !Number.isFinite(a.time)) continue;
      const n = String(a.number);
      const prev = last.get(n);
      // a la misma hora, el cierre gana: mejor esconder un issue abierto que mostrar uno ya cerrado
      if (!prev || a.time > prev.time || (a.time === prev.time && a.kind === 'issue-close')) last.set(n, a);
      if (a.kind === 'issue-open' && (!first.has(n) || a.time < first.get(n).time)) first.set(n, a);
    }
    const out = [];
    for (const [n, a] of last) {
      if (a.kind !== 'issue-open') continue;
      const o = first.get(n) || a;
      out.push({
        number: a.number,
        title: (a.detail || o.detail || '').toString(),
        url: typeof a.url === 'string' && /^https?:\/\//i.test(a.url) ? a.url : '',
        user: o.actor?.login || o.actor?.name || '',
        createdAt: o.time,
      });
    }
    return out.sort((x, y) => y.createdAt - x.createdAt || (Number(y.number) || 0) - (Number(x.number) || 0));
  }

  /** Cuánto dura posponer un PR del Launchpad: un día. */
  const SNOOZE_MS = 24 * 60 * 60 * 1000;

  /** Los PRs pospuestos que siguen vigentes: de { pinId: hasta (ms) } deja solo los que vencen después de `now`
      (los vencidos, los valores que no son números y lo que no es un objeto se descartan). */
  function liveSnoozes(snoozed, now = Date.now()) {
    const out = {};
    if (!snoozed || typeof snoozed !== 'object' || Array.isArray(snoozed)) return out;
    for (const [id, until] of Object.entries(snoozed)) if (Number.isFinite(until) && until > now) out[id] = until;
    return out;
  }

  /** En qué grupo cae un PR abierto: borrador, checks en rojo, aprobado o esperando revisión (en ese orden de prioridad). */
  function prGroup(p) {
    if (p.draft) return 'draft';
    if (p.ci === 'failure') return 'failing';
    if (p.review === 'approved') return 'approved';
    return 'waiting';
  }

  /** Quién abrió un PR ('' si no se sabe). */
  const prAuthor = (p) => p.user?.login || p.user?.name || '';

  /** Los nombres de una lista de personas de un PR (`requested`, `assignees`): solo textos no vacíos; lo demás no cuenta. */
  const names = (list) => (Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u) : []);

  /** Todas las personas de un PR, sin repetir: quien lo abrió, a quienes se les pidió revisión y quienes están asignados. */
  const prPeople = (p) => [...new Set([prAuthor(p), ...names(p.requested), ...names(p.assignees)].filter(Boolean))];

  /** Qué tiene que ver `who` con un PR: 'author' si lo abrió, 'review' si se le pidió revisión, 'assignee' si está
      asignado (en ese orden, si es más de una cosa); '' si nada. Como el filtro, distingue mayúsculas. */
  function prRole(p, who) {
    if (!who) return '';
    if (prAuthor(p) === who) return 'author';
    if (names(p.requested).includes(who)) return 'review';
    if (names(p.assignees).includes(who)) return 'assignee';
    return '';
  }

  /** Las personas de los PRs de varios repos (los mismos `entries` de `groupPulls`): quienes los abrieron, a quienes se
      les pidió revisión y quienes están asignados, más quienes abrieron sus issues abiertos, sin repetir y en orden
      alfabético. */
  function prAuthors(entries) {
    const set = new Set();
    for (const e of entries) for (const p of e.pulls || []) for (const u of prPeople(p)) set.add(u);
    for (const e of entries) for (const i of e.issues || []) if (i.user) set.add(i.user);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : 1));
  }

  /** Los repos que tienen PRs o issues abiertos (los mismos `entries`), en orden alfabético: [{ key, name, n }], con `n`
      los PRs más los issues. */
  function prRepos(entries) {
    const out = [];
    for (const e of entries) { const n = [...(e.pulls || [])].length + [...(e.issues || [])].length; if (n) out.push({ key: e.key, name: e.name, n }); }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : 1));
  }

  /** En cuántos PRs abiertos está cada persona (los mismos `entries`), como autora, revisora pedida o asignada, más los
      issues abiertos que abrió; cada uno cuenta una vez por persona: { login: n }, con lo ya cargado y sin consultar nada. */
  function prCounts(entries) {
    const n = {};
    for (const e of entries) for (const p of e.pulls || []) for (const u of prPeople(p)) n[u] = (n[u] || 0) + 1;
    for (const e of entries) for (const i of e.issues || []) if (i.user) n[i.user] = (n[i.user] || 0) + 1;
    return n;
  }

  /** Los PRs abiertos de varios repos, agrupados por estado: `entries` es [{ key, name, pulls: iterable de PRs }].
      Devuelve solo los grupos con PRs, [{ id, items }], cada uno del más nuevo al más viejo; los fijados (`pinned`: un Set
      de `pinId`) van arriba de su grupo, con `pinned: true`; los pospuestos (`snoozed`: { pinId: hasta (ms) }) que no
      vencieron a la hora `now` van al final de su grupo, con `snoozed: true`. Fijar gana a posponer. Con `author`, solo
      los PRs en que esa persona está (los abrió, se le pidió revisión o está asignada), cada uno con su `role`.
      Los issues abiertos de cada entrada (`issues`, los de `openIssues`) van en un último grupo, `issues`, con
      `issue: true` y su `url`; se fijan y se posponen igual (con `issuePinId`), y con `author` quedan los que abrió. Cada
      fila lleva su `id` (el de fijarla). */
  function groupPulls(entries, pinned, author = '', repoKey = '', snoozed = null, now = Date.now()) {
    const live = liveSnoozes(snoozed, now);
    const isPinned = (id) => !!pinned?.has?.(id);
    const isSnoozed = (id) => Object.hasOwn(live, id);
    const by = new Map([...PR_GROUPS, ISSUE_GROUP].map((g) => [g, []]));
    for (const e of entries) {
      if (repoKey && e.key !== repoKey) continue;
      for (const p of e.pulls || []) {
        const role = prRole(p, author);
        if (author && !role) continue;
        const id = pinId(e.key, p.number);
        by.get(prGroup(p)).push({
          id,
          key: e.key,
          repo: e.name,
          number: p.number,
          title: p.title || '',
          head: p.head || '',
          user: prAuthor(p),
          role, // con una persona elegida: por qué está su PR ('author', 'review' o 'assignee'); sin ella, ''
          createdAt: p.createdAt || 0,
          pinned: isPinned(id),
          snoozed: !isPinned(id) && isSnoozed(id),
        });
      }
      for (const i of e.issues || []) {
        if (author && i.user !== author) continue;
        const id = issuePinId(e.key, i.number);
        by.get(ISSUE_GROUP).push({
          id,
          issue: true,
          key: e.key,
          repo: e.name,
          number: i.number,
          title: i.title || '',
          head: '',
          url: i.url || '',
          user: i.user || '',
          role: author ? 'author' : '',
          createdAt: i.createdAt || 0,
          pinned: isPinned(id),
          snoozed: !isPinned(id) && isSnoozed(id),
        });
      }
    }
    const rank = (x) => (x.pinned ? 0 : x.snoozed ? 2 : 1);
    for (const items of by.values()) items.sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.number - b.number));
    return [...PR_GROUPS, ISSUE_GROUP].map((id) => ({ id, items: by.get(id) })).filter((g) => g.items.length);
  }

  /**
   * Monta la cuadrícula en `root`. Opciones:
   *   text(key, params), num(n), ago(ms), dateTime(ms): textos y formatos de la página
   *   onOpen(key): abrir ese repo en su pestaña; onDiff(key, sha): ver los cambios de un commit de ese repo
   *   diffing() → ¿está abierto el panel de cambios? (entonces un clic en un commit muestra los suyos)
   *   onStats(list): las cifras de todas las tarjetas, para los totales de la cabecera
   *   canDiff(key) → ¿se pueden ver los cambios de los commits de ese repo?
   *   person: la persona con la que abre el Launchpad (`?by=`); onPerson(login): se eligió otra ('' = todas)
   *   getPins(): los PRs fijados (lista de pinId); onPin(id, on): fijar o soltar uno
   *   getSnoozes(): los PRs pospuestos ({ pinId: hasta (ms) }); onSnooze(id, on): posponer uno un día o dejar de posponerlo
   *   prsRoot, onOpenPr(key, head): el Launchpad (los PRs de todos los repos por estado) y la salida de una fila
   *   onOpenIssue(key): la salida de un issue sin enlace (el que tiene `url` se abre en una pestaña nueva, como un enlace)
   * Devuelve { sync(items), draw(key, data, ctx), stats(), celebrate(key, acts), focus(key, { sha, branch }), select(key, sha),
   *   graphOf(key), layoutOf(key), relocalize(), size }.
   */
  function mount(root, opts) {
    const cards = new Map(); // clave -> { key, el, graph, layout, L, data, stats, name }
    const mk = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const setText = (node, s) => node.textContent !== s && (node.textContent = s);

    function makeCard(it) {
      const t = opts.text;
      const el = mk('article', 'rc-card');
      el.dataset.key = it.key;
      const head = mk('header', 'rc-head');
      const dot = mk('span', 'rc-dot');
      dot.setAttribute('aria-hidden', 'true');
      const h = mk('h3', 'rc-title');
      const open = mk('button', 'rc-open');
      open.type = 'button';
      open.append(mk('span', 'rc-name'), mk('span', 'sr-only rc-sr'));
      open.querySelector('.rc-name').dir = 'ltr';
      open.addEventListener('click', () => opts.onOpen(it.key));
      h.append(open);
      const badge = mk('span', 'badge rc-badge');
      head.append(dot, h, badge);
      const stats = mk('p', 'rc-stats');
      const last = mk('button', 'rc-last');
      last.type = 'button';
      last.hidden = true;
      last.append(mk('span', 'rc-lmsg'), mk('span', 'rc-lmeta'));
      last.addEventListener('click', () => card.stats?.last && opts.onDiff(it.key, card.stats.last.sha));
      const stage = mk('div', 'rc-stage');
      const wrap = mk('div', 'graph-wrap rc-graph');
      stage.append(wrap);
      el.append(head, stats, last, stage);
      const card = { key: it.key, el, layout: new GB.Layout(), L: null, data: null, stats: null, name: it.name, ui: { dot, open, badge, stats, last } };
      card.graph = new GB.Graph(wrap, {
        onDiff: (sha) => opts.onDiff(it.key, sha),
        diffing: () => !!opts.diffing?.(),
      });
      card.graph.svg.setAttribute('aria-label', t('all.graphAria', { repo: it.name }));
      return card;
    }

    /** La cabecera de una tarjeta: nombre, estado y etiqueta del servicio (solo lo que cambió). */
    function paintHead(card, it) {
      const t = opts.text;
      card.name = it.name;
      card.el.dataset.state = it.state || 'loading';
      card.el.classList.toggle('demo', !!it.demo);
      setText(card.ui.open.querySelector('.rc-name'), it.name);
      setText(card.ui.open.querySelector('.rc-sr'), [it.state === 'live' ? '' : it.stateText, t('all.open')].filter(Boolean).map((s) => `, ${s}`).join(''));
      card.ui.open.title = `${it.name} · ${it.stateText} · ${t('all.open')}`;
      setText(card.ui.badge, it.badge || '');
      card.ui.badge.hidden = !it.badge;
      card.ui.badge.classList.toggle('demo', !!it.demo);
      card.graph.svg.setAttribute('aria-label', t('all.graphAria', { repo: it.name }));
    }

    /** Las tarjetas que corresponden a `items` ([{ key, name, state, stateText, badge, demo }]), en ese orden:
        crea las nuevas, quita las de los repos que ya no se siguen y repinta las cabeceras. */
    function sync(items) {
      const keep = new Set(items.map((it) => it.key));
      for (const [k, c] of cards) {
        if (keep.has(k)) continue;
        c.graph.clear();
        c.el.remove();
        cards.delete(k);
      }
      items.forEach((it, i) => {
        let c = cards.get(it.key);
        if (!c) cards.set(it.key, (c = makeCard(it)));
        // solo se mueve lo que no está en su lugar: mover una tarjeta le quitaría el foco
        if (root.children[i] !== c.el) root.insertBefore(c.el, root.children[i] || null);
        paintHead(c, it);
      });
      root.dataset.n = String(items.length);
    }

    /** Cifras y último commit de una tarjeta. */
    function paintStats(card) {
      const t = opts.text;
      const s = card.stats;
      const num = opts.num || String;
      const line = t('all.stats', { branches: num(s.branches), commits: num(s.commits), prs: num(s.prs) });
      setText(card.ui.stats, s.lastAt ? `${line} · ${opts.ago(s.lastAt)}` : line);
      card.ui.stats.title = s.lastAt ? opts.dateTime(s.lastAt) : '';
      const c = s.last;
      card.ui.last.hidden = !c;
      if (!c) return;
      const msg = String(c.message || '').split('\n')[0];
      setText(card.ui.last.querySelector('.rc-lmsg'), msg);
      const who = c.author?.name || c.author?.login || t('author.unknown');
      setText(card.ui.last.querySelector('.rc-lmeta'), `${c.sha.slice(0, 7)} · ${who}`);
      const label = t('all.lastCommit', { msg: GB.U.truncate(msg, 80), who, when: c.date ? opts.ago(c.date) : '' });
      card.ui.last.setAttribute('aria-label', label);
      card.ui.last.title = label;
      card.ui.last.disabled = !opts.canDiff?.(card.key);
    }

    /** Dibuja el grafo de un repo (sus datos ya filtrados como se quieran ver) y sus cifras. `ctx` es el de GB.Graph. */
    function draw(key, data, ctx) {
      const card = cards.get(key);
      if (!card) return null;
      const L = card.layout.compute(data);
      card.L = L;
      card.data = data;
      card.graph.update(L, ctx);
      card.stats = summary(data, L);
      paintStats(card);
      opts.onStats?.(stats());
      return L;
    }

    /** Las cifras de las tarjetas ya dibujadas. */
    const stats = () => [...cards.values()].filter((c) => c.stats).map((c) => c.stats);

    /** El Launchpad: los PRs abiertos de todos los repos, por estado. Solo se repinta si cambió algo (así no pierde el foco). */
    let prSig = '';
    let lastEntries = [];
    let prPerson = opts.person || ''; // el filtro por persona del Launchpad ('' = todas; autora, revisora pedida o asignada); viaja en ?by=
    let prRepo = ''; // el filtro por repo ('' = todos); no se recuerda ni viaja en la URL
    let snoozeTimer = 0; // repinta cuando vence el primer PR pospuesto, para que vuelva a su lugar sin esperar datos nuevos
    function setPulls(entries) {
      lastEntries = entries.map((e) => ({ ...e, pulls: [...(e.pulls || [])], issues: [...(e.issues || [])] })); // `pulls` puede ser un iterador, de un solo uso
      entries = lastEntries;
      const box = opts.prsRoot;
      if (!box) return;
      const pins = new Set(opts.getPins?.() || []);
      const people = prAuthors(entries);
      const counts = prCounts(entries);
      // la persona sin PRs abiertos (o desconocida, o aún sin cargar) no filtra; se recuerda por si sus PRs llegan después
      const who = people.find((u) => u === prPerson) || people.find((u) => u.toLowerCase() === prPerson.toLowerCase()) || '';
      const repos = prRepos(entries);
      const repo = repos.find((r) => r.key === prRepo)?.key || ''; // un repo sin PRs abiertos no filtra
      const now = Date.now();
      const snoozes = liveSnoozes(opts.getSnoozes?.(), now);
      const groups = groupPulls(entries, pins, who, repo, snoozes, now);
      if (snoozeTimer) clearTimeout(snoozeTimer);
      snoozeTimer = 0;
      const next = Math.min(...Object.values(snoozes));
      if (Number.isFinite(next)) snoozeTimer = setTimeout(() => setPulls(lastEntries), Math.min(next - now + 50, 2 ** 31 - 1));
      const sig = JSON.stringify([groups, people, counts, who, repos, repo]);
      if (sig === prSig) return;
      prSig = sig;
      const t = opts.text;
      const num = opts.num || String;
      const total = groups.reduce((n, g) => n + (g.id === ISSUE_GROUP ? 0 : g.items.length), 0); // el título cuenta los PRs
      box.hidden = !people.length && !groups.length;
      box.replaceChildren();
      if (box.hidden) return;
      box.append(mk('h3', 'ap-title', t('all.prs.title', { n: num(total) })));
      if (people.length > 1) {
        const sel = mk('select', 'ap-person');
        sel.setAttribute('aria-label', t('all.prs.person'));
        sel.title = t('all.prs.person');
        sel.append(new Option(t('all.prs.everyone'), ''));
        for (const u of people) sel.append(new Option(`${u} (${num(counts[u])})`, u));
        sel.value = who;
        sel.addEventListener('change', () => {
          prPerson = sel.value;
          opts.onPerson?.(prPerson);
          setPulls(lastEntries);
          box.querySelector('.ap-person')?.focus(); // el repintado reemplaza el selector: el foco vuelve a él
        });
        box.append(sel);
      }
      if (repos.length > 1) {
        const sel = mk('select', 'ap-repo');
        sel.setAttribute('aria-label', t('all.prs.repo'));
        sel.title = t('all.prs.repo');
        sel.append(new Option(t('all.prs.allRepos'), ''));
        for (const r of repos) sel.append(new Option(`${r.name} (${num(r.n)})`, r.key));
        sel.value = repo;
        sel.addEventListener('change', () => {
          prRepo = sel.value;
          setPulls(lastEntries);
          box.querySelector('.ap-repo')?.focus();
        });
        box.append(sel);
      }
      const cols = mk('div', 'ap-groups');
      for (const g of groups) {
        const sec = mk('section', 'ap-group');
        sec.dataset.group = g.id;
        sec.append(mk('h4', 'ap-gname', `${t(PR_GROUP_KEY[g.id])} · ${num(g.items.length)}`));
        const ul = mk('ul', 'ap-list');
        for (const it of g.items) {
          const li = mk('li');
          li.dataset.pin = it.id;
          // un issue con su enlace es un enlace (se abre en el sitio del repo); un PR, o un issue sin enlace, un botón
          const link = !!(it.issue && it.url);
          const b = mk(link ? 'a' : 'button', 'ap-row');
          if (link) {
            b.href = it.url;
            b.target = '_blank';
            b.rel = 'noopener';
          } else b.type = 'button';
          b.dataset.key = it.key;
          b.dataset.number = String(it.number);
          const title = mk('span', 'ap-t', `#${it.number} ${it.title}`);
          const meta = mk('span', 'ap-m', [it.repo, it.head, it.user].filter(Boolean).join(' · '));
          title.dir = meta.dir = 'auto';
          b.append(title, meta);
          // con una persona elegida, el PR que no abrió ella dice por qué está: se le pidió revisión o está asignada
          const role = it.role === 'review' || it.role === 'assignee' ? t(`all.prs.role.${it.role}`, { who: who }) : '';
          if (role) {
            const chip = mk('span', 'ap-role', role);
            chip.dir = 'auto'; // lleva un login: en derecha a izquierda no se desordena
            b.append(chip);
          }
          const label = [t(it.issue ? 'all.issues.open' : 'all.prs.open', { num: it.number, repo: it.repo, title: GB.U.truncate(it.title, 80) }), role].filter(Boolean).join('. ');
          b.setAttribute('aria-label', label);
          b.title = label;
          if (it.issue) {
            if (!it.url) b.addEventListener('click', () => opts.onOpenIssue?.(it.key));
          } else b.addEventListener('click', () => opts.onOpenPr?.(it.key, it.head));
          const kind = it.issue ? 'all.issues' : 'all.prs';
          const refocus = (cls) => [...box.querySelectorAll(cls)].find((x) => x.closest('li')?.dataset.pin === it.id)?.focus();
          li.append(b);
          const pin = mk('button', 'ap-pin');
          pin.type = 'button';
          pin.textContent = '📌';
          pin.setAttribute('aria-pressed', String(it.pinned));
          const plabel = t(`${kind}.${it.pinned ? 'unpin' : 'pin'}`, { num: it.number, repo: it.repo });
          pin.setAttribute('aria-label', plabel);
          pin.title = plabel;
          pin.addEventListener('click', () => {
            opts.onPin?.(it.id, !it.pinned);
            setPulls(lastEntries);
            refocus('.ap-pin'); // el repintado reemplaza la fila: el foco vuelve a su botón de fijar
          });
          const zz = mk('button', 'ap-snooze');
          zz.type = 'button';
          zz.textContent = '💤';
          zz.setAttribute('aria-pressed', String(it.snoozed));
          const zlabel = t(`${kind}.${it.snoozed ? 'unsnooze' : 'snooze'}`, { num: it.number, repo: it.repo });
          zz.setAttribute('aria-label', zlabel);
          zz.title = zlabel;
          zz.addEventListener('click', () => {
            opts.onSnooze?.(it.id, !it.snoozed);
            setPulls(lastEntries);
            refocus('.ap-snooze'); // la fila baja (o sube) en su grupo: el foco la sigue a su botón de posponer
          });
          li.classList.toggle('pinned', it.pinned);
          li.classList.toggle('snoozed', it.snoozed);
          li.append(pin, zz);
          ul.append(li);
        }
        sec.append(ul);
        cols.append(sec);
      }
      box.append(cols);
    }

    return {
      sync,
      draw,
      setPulls,
      stats,
      /** Los efectos de lo que acaba de llegar, en la tarjeta de su repo. */
      celebrate(key, acts) {
        const card = cards.get(key);
        if (!card) return;
        card.graph.celebrate(acts);
        // la tarjeta se enciende un momento: en una pantalla compartida se ve desde lejos dónde pasó algo
        card.el.classList.remove('rc-news');
        void card.el.offsetWidth; // vuelve a arrancar la animación si llega otra novedad mientras dura
        card.el.classList.add('rc-news');
        clearTimeout(card.newsTimer);
        card.newsTimer = setTimeout(() => card.el.classList.remove('rc-news'), 4000);
      },
      /** Lleva la vista a la tarjeta de un repo y, si se dice, a un commit (o una rama) de su grafo. */
      focus(key, { sha = null, branch = null } = {}) {
        const card = cards.get(key);
        if (!card) return false;
        card.el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        if (sha && card.graph.focusSha(sha)) return true;
        if (branch) card.graph.focusBranch(branch);
        return true;
      },
      /** El commit cuyos cambios se ven queda marcado en su tarjeta (y en ninguna otra). */
      select(key, sha) {
        for (const c of cards.values()) c.graph.select(c.key === key ? sha : null);
      },
      graphOf: (key) => cards.get(key)?.graph || null,
      layoutOf: (key) => cards.get(key)?.L || null,
      /** Cambió el idioma: textos de las tarjetas y de sus grafos. */
      relocalize() {
        for (const c of cards.values()) {
          c.graph.relocalize();
          if (c.stats) paintStats(c);
        }
        prSig = ''; // los títulos del Launchpad cambian de idioma
      },
      get size() {
        return cards.size;
      },
    };
  }

  GB.overview = { allParam, personParam, lastCommit, summary, totals, heavy, HEAVY_BRANCHES, fitGrid, prGroup, prRole, groupPulls, prAuthors, prRepos, prCounts, pinId, issuePinId, openIssues, SNOOZE_MS, liveSnoozes, mount };
})(window.GB);
