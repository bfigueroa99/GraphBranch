/* GraphBranch — constelación de repos: cada repo seguido es una galaxia, para ver más repos de los que caben
   en pestañas. Una galaxia es un botón (se recorre con Tab y se abre con Intro) con su nombre, sus cifras y,
   si hay, las novedades sin ver; el tamaño sale de los commits cargados y el color, del nombre. No hace
   ninguna consulta: parte del estado ya cargado. Todo texto entra con textContent. */
(function (GB) {
  'use strict';

  const GOLDEN = 2.399963229728653;
  const R_MIN = 1; // radios relativos: la galaxia más grande mide R_MAX veces la más chica
  const R_MAX = 2.4;
  const PAD = 4; // margen del cuadro, en % del lado
  const ORDERS = ['activity', 'recent', 'prs', 'issues', 'stars', 'forks', 'new', 'name']; // los órdenes que no son el de las pestañas (el selector y ?order=)

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
      // se aleja del centro hasta que cabe sin tocar a las ya puestas (con un poco de aire)
      while (put.some((p) => Math.hypot(p.x - at(d).x, p.y - at(d).y) < p.r + o.r + 0.3)) d += 0.1;
      put.push({ key: o.it.key, ...at(d), r: o.r, idx: o.idx });
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

  /** Monta la constelación en `root`. `text(key, params)`: traductor; `fmt(n)`: número; `onGo(key)`: Intro sobre una galaxia. */
  function mount(root, { text, fmt = String, onGo, select = null, status = null }) {
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
        if (it.active) b.setAttribute('aria-current', 'true');
        b.style.left = `${s.x - s.r}%`;
        b.style.top = `${s.y - s.r}%`;
        b.style.width = b.style.height = `${s.r * 2}%`;
        const stats = text('constellation.stats', { commits: fmt(it.commits || 0), branches: fmt(it.branches || 0) });
        b.setAttribute('aria-label', [it.name, stats, it.unread ? text('tabs.unread', { n: it.unread }) : ''].filter(Boolean).join(', '));
        b.title = `${it.name} · ${stats}`;
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

  GB.constellation = { place, sortItems, openIssues, starsOf, forksOf, newBranches, orderParam, filterParam, filterItems, recentParam, recentItems, radiusOf, hueOf, mount };
})(window.GB);
