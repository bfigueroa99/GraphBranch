/* GraphBranch — constelación de repos: cada repo seguido es una galaxia, para ver más repos de los que caben
   en pestañas. Una galaxia es un botón (se recorre con Tab y se abre con Intro) con su nombre, sus cifras, cuánto
   hace de su commit más reciente ya cargado y, si hay, las novedades sin ver; el tamaño sale de los commits cargados y el color, del nombre. No hace
   ninguna consulta: parte del estado ya cargado. Los repos de una organización (o un usuario) seguida que no tienen
   pestaña son galaxias tenues, con la fecha de su último push de la lista que ya se pidió (`ghostItems`). Todo texto
   entra con textContent. */
(function (GB) {
  'use strict';

  const GOLDEN = 2.399963229728653;
  const R_MIN = 1; // radios relativos: la galaxia más grande mide R_MAX veces la más chica
  const R_MAX = 2.4;
  const PAD = 4; // margen del cuadro, en % del lado
  const ORDERS = ['activity', 'recent', 'prs', 'issues', 'stars', 'forks', 'new', 'name']; // los órdenes que no son el de las pestañas (el selector y ?order=)
  const ORG_MAX = 100; // los repos de una organización seguida que caben en la constelación: una página de su lista

  /** Los repos de las organizaciones (o usuarios) seguidas que no tienen pestaña, cada uno una galaxia tenue: `lists`
      ({ dueño: [{ owner, name, pushedAt }] }, la lista de push más reciente que ya se pidió al seguirla), `open` (las
      claves con pestaña) y `keyOf({ owner, name })`. Hasta ORG_MAX por dueño, en el orden de su lista y sin repetir;
      `last` es su último push (ms, o `null`). No hace ninguna consulta. */
  function ghostItems(lists, open, keyOf) {
    const seen = new Set(open);
    const out = [];
    for (const list of Object.values(lists || {})) {
      for (const p of (Array.isArray(list) ? list : []).slice(0, ORG_MAX)) {
        if (!p || !p.owner || !p.name) continue;
        const key = keyOf({ owner: p.owner, name: p.name });
        if (seen.has(key)) continue;
        seen.add(key);
        const at = Date.parse(p.pushedAt);
        out.push({ key, name: `${p.owner}/${p.name}`, owner: p.owner, repo: p.name, ghost: true, state: 'ghost', commits: 0, branches: 0, last: Number.isFinite(at) ? at : null });
      }
    }
    return out;
  }

  /** Tamaño relativo de una galaxia según sus commits: crece con la raíz y se queda entre R_MIN y R_MAX. */
  function radiusOf(commits, maxCommits) {
    if (!(commits > 0) || !(maxCommits > 0)) return R_MIN;
    return R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(1, commits / maxCommits));
  }

  /** Dispone `items` ([{ key, commits }]) en un cuadro de 100×100: la más grande al centro y las demás en
      espiral dorada a su alrededor, sin tocarse. Devuelve [{ key, x, y, r }] en % del lado, en el orden dado. */
  function place(items) {
    const maxCommits = Math.max(0, ...items.map((i) => i.commits || 0));
    const order = items
      .map((it, idx) => ({ it, idx, r: radiusOf(it.commits, maxCommits) }))
      .sort((a, b) => (b.it.commits || 0) - (a.it.commits || 0) || a.idx - b.idx);
    const put = [];
    order.forEach((o, i) => {
      const a = i * GOLDEN;
      let d = i ? Math.sqrt(i) * R_MIN : 0;
      const at = (dist) => ({ x: Math.cos(a) * dist, y: Math.sin(a) * dist });
      // se aleja del centro hasta que cabe sin tocar a las ya puestas (con un poco de aire); el punto se calcula una vez
      // por paso, no una por galaxia ya puesta: con los repos de una organización son 120 y el cuadrático pesaba
      const fits = (q) => !put.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < p.r + o.r + 0.3);
      let q = at(d);
      while (!fits(q)) q = at((d += 0.1));
      put.push({ key: o.it.key, ...q, r: o.r, idx: o.idx });
    });
    if (!put.length) return [];
    // todo cabe en el cuadro: una sola escala para posiciones y radios (así nada se toca)
    const ext = Math.max(...put.map((p) => Math.max(Math.abs(p.x) + p.r, Math.abs(p.y) + p.r)));
    const k = (50 - PAD) / ext;
    return put
      .sort((a, b) => a.idx - b.idx)
      .map((p) => ({ key: p.key, x: 50 + p.x * k, y: 50 + p.y * k, r: p.r * k }));
  }

  /** Los repos en el orden pedido: `tabs` (el de las pestañas), `activity` (más commits cargados primero), `recent` (el commit más reciente ya cargado primero; los que cargan o están vacíos, sin `last`, al final), `prs` (más pull requests abiertos primero), `issues` (más issues abiertos primero), `stars` (más estrellas primero), `forks` (más forks primero), `new` (más ramas nuevas de la semana primero) o
      `name` (alfabético, sin mayúsculas ni acentos). Empata por el orden de las pestañas; no toca `items`. */
  function sortItems(items, mode) {
    const list = items.map((it, idx) => ({ it, idx }));
    if (mode === 'activity') list.sort((a, b) => (b.it.commits || 0) - (a.it.commits || 0) || a.idx - b.idx);
    else if (mode === 'recent') {
      const at = (it) => (Number.isFinite(it.last) ? it.last : -Infinity);
      list.sort((a, b) => (at(b.it) === at(a.it) ? 0 : at(b.it) > at(a.it) ? 1 : -1) || a.idx - b.idx);
    } else if (mode === 'prs') list.sort((a, b) => (b.it.prs || 0) - (a.it.prs || 0) || a.idx - b.idx);
    else if (mode === 'issues') list.sort((a, b) => (b.it.issues || 0) - (a.it.issues || 0) || a.idx - b.idx);
    else if (mode === 'stars') list.sort((a, b) => (b.it.stars || 0) - (a.it.stars || 0) || a.idx - b.idx);
    else if (mode === 'forks') list.sort((a, b) => (b.it.forks || 0) - (a.it.forks || 0) || a.idx - b.idx);
    else if (mode === 'new') list.sort((a, b) => (b.it.fresh || 0) - (a.it.fresh || 0) || a.idx - b.idx);
    else if (mode === 'name') list.sort((a, b) => String(a.it.name).localeCompare(String(b.it.name), undefined, { sensitivity: 'base', numeric: true }) || a.idx - b.idx);
    return list.map((x) => x.it);
  }

  /** Issues abiertos de un repo con lo que ya se cargó, sin consultas nuevas: `repo.openIssues` si la API los da
      aparte (GitLab, Gitea, Forgejo, Codeberg); si da issues y PRs juntos (`repo.openItems`, el `open_issues_count`
      de GitHub), se restan los PRs abiertos conocidos. `null` si no se sabe (Bitbucket, Azure, un repo local). */
  function openIssues(data) {
    const repo = data?.repo || {};
    if (Number.isFinite(repo.openIssues)) return Math.max(0, repo.openIssues);
    if (!Number.isFinite(repo.openItems)) return null;
    const prs = Math.max(data.totalPulls || 0, data.pulls?.size || 0);
    return Math.max(0, repo.openItems - prs);
  }

  /** Estrellas de un repo con lo que ya se cargó, sin consultas nuevas: el total que trae la consulta del repo
      (GitHub, GitLab, Gitea, Forgejo, Codeberg). `null` si la fuente no lo da (Bitbucket Cloud y Data Center, Azure, un repo local, la demo). */
  function starsOf(data) {
    const n = data?.repo?.stars;
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }

  /** Forks de un repo con lo que ya se cargó, sin consultas nuevas: el total que trae la consulta del repo
      (GitHub, GitLab, Gitea, Forgejo, Codeberg). `null` si la fuente no lo da (Bitbucket Cloud y Data Center, Azure, un repo local, la demo).
      Es un número (`repo.forks`), no la lista de forks activos del panel de salud (`data.forks`). */
  function forksOf(data) {
    const n = data?.repo?.forks;
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }

  /** Ramas creadas en los últimos `days` días (hasta `now`) según la actividad ya cargada de un repo: cada nombre
      cuenta una vez (la misma rama vista por el feed y por la comparación en vivo, o borrada y creada otra vez, no
      suma dos), como en el resumen de la semana. */
  function newBranches(acts = [], now = Date.now(), days = 7) {
    const since = now - days * 864e5;
    const names = new Set();
    for (const a of acts) {
      if (!a || a.kind !== 'branch-create' || !a.time || !(a.time > since && a.time <= now)) continue;
      const k = a.branch ? `b:${a.branch}` : a.id;
      if (k != null) names.add(k);
    }
    return names.size;
  }

  /** `?order=activity`, `?order=recent`, `?order=prs`, `?order=issues`, `?order=stars`, `?order=forks`, `?order=new` o `?order=name`: el orden con que abre la constelación. Lo que no se conoce (o falta) es `null`: queda el de las pestañas. */
  function orderParam(q) {
    const v = String(q.get('order') || '').trim().toLowerCase();
    return ORDERS.includes(v) ? v : null;
  }

  /** Minúsculas y sin acentos, para comparar nombres. */
  function fold(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** `?constellation=texto`: lo que tiene que contener el nombre de un repo para quedar en la constelación. Vacío o ausente es `''` (sin filtro). */
  function filterParam(q) {
    return String(q.get('constellation') || '').trim().slice(0, 100);
  }

  /** Los repos cuyo nombre contiene `text` (sin mayúsculas ni acentos); sin texto, todos. No toca `items`. */
  function filterItems(items, text) {
    const f = fold(String(text || '').trim());
    return f ? items.filter((it) => fold(it.name).includes(f)) : items.slice();
  }

  /** `?recent=N`: solo los repos con actividad en los últimos N días (`?recent=30` es el mes). Falta, no es un número o no es positivo: `null` (sin filtro); se acota a 3650 días. */
  function recentParam(q) {
    const raw = String(q.get('recent') ?? '').trim();
    const n = raw === '' ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : null;
  }

  /** Los repos con algún commit en los últimos `days` días contados desde `now`. `it.last` es la fecha (ms) de su commit más reciente; sin ella, el repo se conserva solo mientras carga (`state: 'loading'`); ya cargado o con error no tiene actividad que mostrar. Sin `days`, todos. No toca `items`. */
  function recentItems(items, days, now = Date.now()) {
    if (!(days > 0)) return items.slice();
    const from = now - days * 864e5;
    return items.filter((it) => (Number.isFinite(it.last) ? it.last >= from : it.state === 'loading'));
  }

  /** Tono (0–359) estable para un nombre. */
  function hueOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  const SVG = 'http://www.w3.org/2000/svg';

  /** El disco con dos brazos de una galaxia, en un viewBox de 100×100. */
  function disc(hue) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (let arm = 0; arm < 2; arm++) {
      const pts = [];
      for (let t = 0.4; t <= 4.6; t += 0.2) {
        const th = t + arm * Math.PI;
        pts.push(`${(Math.cos(th) * t * 9.5).toFixed(1)},${(Math.sin(th) * t * 9.5).toFixed(1)}`);
      }
      const p = document.createElementNS(SVG, 'polyline');
      p.setAttribute('points', pts.join(' '));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', `hsl(${hue} 80% 68%)`);
      p.setAttribute('stroke-width', '5');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('opacity', '0.75');
      svg.appendChild(p);
    }
    const core = document.createElementNS(SVG, 'circle');
    core.setAttribute('r', '7');
    core.setAttribute('fill', `hsl(${hue} 90% 85%)`);
    svg.appendChild(core);
    return svg;
  }

  /** Los mismos 30 días de las ramas quietas de la vista de texto (`GB.textview.QUIET_DAYS`). */
  const QUIET_DAYS = 30;

  /** Una galaxia quieta: su commit más reciente ya cargado (`it.last`) tiene más de QUIET_DAYS días a `now`. Sin `last`, o mientras la pestaña carga, no es quieta: no hay fecha que lo diga. */
  function isQuiet(it, now = Date.now()) {
    return it.state !== 'loading' && Number.isFinite(it.last) && now - it.last > QUIET_DAYS * 864e5;
  }

  /** Lo que dice una galaxia: `label` (su nombre accesible) y `title` (su globo). Nombre, commits y ramas, cuánto hace de
      su commit más reciente ya cargado (`it.last`, con `ago(ms)`, el formato relativo de la app: nada si carga o está
      vacía, sin `last`), si está quieta («sin actividad hace más de 30 días») y, solo en `label`, las novedades sin ver.
      Una galaxia sin pestaña (`it.ghost`) dice su nombre, su último push, si está quieta y que no tiene pestaña. */
  function describe(it, { text, fmt = String, ago = null, now = Date.now() }) {
    if (it.ghost) {
      // sin pestaña no hay nada cargado: ni commits ni ramas que contar, solo su último push (de la lista de su dueño)
      const pushed = ago && Number.isFinite(it.last) ? text('constellation.pushed', { ago: ago(it.last) }) : '';
      const parts = [it.name, pushed, isQuiet(it, now) ? text('textview.quiet') : '', text('constellation.ghost')].filter(Boolean);
      return { label: parts.join(', '), title: parts.join(' · ') };
    }
    const stats = text('constellation.stats', { commits: fmt(it.commits || 0), branches: fmt(it.branches || 0) });
    const when = ago && Number.isFinite(it.last) ? ago(it.last) : '';
    const quiet = isQuiet(it, now) ? text('textview.quiet') : '';
    return {
      label: [it.name, stats, when, quiet, it.unread ? text('tabs.unread', { n: it.unread }) : ''].filter(Boolean).join(', '),
      title: [it.name, stats, when, quiet].filter(Boolean).join(' · '),
    };
  }

  /** Monta la constelación en `root`. `text(key, params)`: traductor; `fmt(n)`: número; `ago(ms)`: «hace 3 h»; `onGo(key)`: Intro sobre una galaxia. */
  function mount(root, { text, fmt = String, ago = null, onGo, select = null, status = null }) {
    let items = [];
    let mode = 'tabs';
    let filter = '';
    let recent = null;
    if (select) select.addEventListener('change', () => setOrder(select.value, true));
    /** Cambia el orden (el de Tab y el de lector de pantalla) y, si lo pidió la persona, lo anuncia. */
    function setOrder(next, announce) {
      mode = ORDERS.includes(next) ? next : 'tabs';
      if (select) select.value = mode;
      draw();
      if (announce && status) status.textContent = text('constellation.ordered', { order: text(mode === 'prs' ? 'stats.prs' : 'constellation.order' + mode[0].toUpperCase() + mode.slice(1)) });
    }
    /** Deja solo los repos cuyo nombre contiene `next` (`''`: todos). */
    function setFilter(next) {
      filter = String(next || '').trim();
      draw();
    }
    /** Deja solo los repos con actividad en los últimos `days` días (`null`: todos). */
    function setRecent(days) {
      recent = days > 0 ? days : null;
      draw();
    }
    function visible() {
      return recentItems(filterItems(items, filter), recent);
    }
    function render(list) {
      items = list;
      draw();
      // el aviso nombra el filtro con las mismas palabras de siempre: el texto y/o «≤ N d» (sin texto nuevo que traducir)
      const label = [filter, recent ? `≤ ${fmt(recent)} d` : ''].filter(Boolean).join(' · ');
      if (status) status.textContent = label ? text('constellation.filtered', { filter: label, shown: fmt(visible().length), total: fmt(items.length) }) : '';
    }
    function draw() {
      const shown = sortItems(visible(), mode);
      const had = document.activeElement?.closest?.('.cs-gx') ? document.activeElement.dataset.key : null;
      root.textContent = '';
      const spots = place(shown);
      shown.forEach((it, i) => {
        const s = spots[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cs-gx';
        b.dataset.key = it.key;
        b.dataset.state = it.state || 'live';
        if (isQuiet(it)) b.dataset.quiet = 'true';
        if (it.active) b.setAttribute('aria-current', 'true');
        b.style.left = `${s.x - s.r}%`;
        b.style.top = `${s.y - s.r}%`;
        b.style.width = b.style.height = `${s.r * 2}%`;
        const said = describe(it, { text, fmt, ago });
        b.setAttribute('aria-label', said.label);
        b.title = said.title;
        b.appendChild(disc(hueOf(it.name)));
        const name = document.createElement('span');
        name.className = 'cs-name';
        name.dir = 'ltr';
        name.setAttribute('aria-hidden', 'true');
        name.textContent = it.name;
        b.appendChild(name);
        if (it.unread) {
          const n = document.createElement('span');
          n.className = 'cs-n';
          n.setAttribute('aria-hidden', 'true');
          n.textContent = it.unread > 99 ? '99+' : fmt(it.unread);
          b.appendChild(n);
        }
        b.addEventListener('click', () => onGo(it.key));
        root.appendChild(b);
      });
      if (had) [...root.children].find((n) => n.dataset.key === had)?.focus();
    }
    return { render, setOrder, setFilter, setRecent };
  }

  GB.constellation = { place, sortItems, describe, ghostItems, ORG_MAX, openIssues, starsOf, forksOf, newBranches, orderParam, filterParam, filterItems, isQuiet, QUIET_DAYS, recentParam, recentItems, radiusOf, hueOf, mount };
})(window.GB);
