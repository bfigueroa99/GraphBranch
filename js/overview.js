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

  /** Los grupos del Launchpad, en el orden en que se muestran. */
  const PR_GROUPS = ['draft', 'failing', 'approved', 'waiting'];

  const PR_GROUP_KEY = { draft: 'all.prs.draft', failing: 'all.prs.failing', approved: 'all.prs.approved', waiting: 'all.prs.waiting' };

  /** En qué grupo cae un PR abierto: borrador, checks en rojo, aprobado o esperando revisión (en ese orden de prioridad). */
  function prGroup(p) {
    if (p.draft) return 'draft';
    if (p.ci === 'failure') return 'failing';
    if (p.review === 'approved') return 'approved';
    return 'waiting';
  }

  /** Los PRs abiertos de varios repos, agrupados por estado: `entries` es [{ key, name, pulls: iterable de PRs }].
      Devuelve solo los grupos con PRs, [{ id, items }], cada uno del más nuevo al más viejo. */
  function groupPulls(entries) {
    const by = new Map(PR_GROUPS.map((g) => [g, []]));
    for (const e of entries) {
      for (const p of e.pulls || []) {
        by.get(prGroup(p)).push({
          key: e.key,
          repo: e.name,
          number: p.number,
          title: p.title || '',
          head: p.head || '',
          user: p.user?.login || p.user?.name || '',
          createdAt: p.createdAt || 0,
        });
      }
    }
    for (const items of by.values()) items.sort((a, b) => b.createdAt - a.createdAt || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.number - b.number));
    return PR_GROUPS.map((id) => ({ id, items: by.get(id) })).filter((g) => g.items.length);
  }

  /**
   * Monta la cuadrícula en `root`. Opciones:
   *   text(key, params), num(n), ago(ms), dateTime(ms): textos y formatos de la página
   *   onOpen(key): abrir ese repo en su pestaña; onDiff(key, sha): ver los cambios de un commit de ese repo
   *   diffing() → ¿está abierto el panel de cambios? (entonces un clic en un commit muestra los suyos)
   *   onStats(list): las cifras de todas las tarjetas, para los totales de la cabecera
   *   canDiff(key) → ¿se pueden ver los cambios de los commits de ese repo?
   *   prsRoot, onOpenPr(key, head): el Launchpad (los PRs de todos los repos por estado) y la salida de una fila
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
    function setPulls(entries) {
      const box = opts.prsRoot;
      if (!box) return;
      const groups = groupPulls(entries);
      const sig = JSON.stringify(groups);
      if (sig === prSig) return;
      prSig = sig;
      const t = opts.text;
      const num = opts.num || String;
      const total = groups.reduce((n, g) => n + g.items.length, 0);
      box.hidden = !total;
      box.replaceChildren();
      if (!total) return;
      box.append(mk('h3', 'ap-title', t('all.prs.title', { n: num(total) })));
      const cols = mk('div', 'ap-groups');
      for (const g of groups) {
        const sec = mk('section', 'ap-group');
        sec.dataset.group = g.id;
        sec.append(mk('h4', 'ap-gname', `${t(PR_GROUP_KEY[g.id])} · ${num(g.items.length)}`));
        const ul = mk('ul', 'ap-list');
        for (const it of g.items) {
          const li = mk('li');
          const b = mk('button', 'ap-row');
          b.type = 'button';
          b.dataset.key = it.key;
          b.dataset.number = String(it.number);
          const title = mk('span', 'ap-t', `#${it.number} ${it.title}`);
          const meta = mk('span', 'ap-m', [it.repo, it.head, it.user].filter(Boolean).join(' · '));
          title.dir = meta.dir = 'auto';
          b.append(title, meta);
          const label = t('all.prs.open', { num: it.number, repo: it.repo, title: GB.U.truncate(it.title, 80) });
          b.setAttribute('aria-label', label);
          b.title = label;
          b.addEventListener('click', () => opts.onOpenPr?.(it.key, it.head));
          li.append(b);
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
        cards.get(key)?.graph.celebrate(acts);
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

  GB.overview = { allParam, lastCommit, summary, totals, prGroup, groupPulls, mount };
})(window.GB);
