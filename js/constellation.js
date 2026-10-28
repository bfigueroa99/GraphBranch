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

  /** Los repos en el orden pedido: `tabs` (el de las pestañas), `activity` (más commits cargados primero) o
      `name` (alfabético, sin mayúsculas ni acentos). Empata por el orden de las pestañas; no toca `items`. */
  function sortItems(items, mode) {
    const list = items.map((it, idx) => ({ it, idx }));
    if (mode === 'activity') list.sort((a, b) => (b.it.commits || 0) - (a.it.commits || 0) || a.idx - b.idx);
    else if (mode === 'name') list.sort((a, b) => String(a.it.name).localeCompare(String(b.it.name), undefined, { sensitivity: 'base', numeric: true }) || a.idx - b.idx);
    return list.map((x) => x.it);
  }

  /** `?order=activity` o `?order=name`: el orden con que abre la constelación. Lo que no se conoce (o falta) es `null`: queda el de las pestañas. */
  function orderParam(q) {
    const v = String(q.get('order') || '').trim().toLowerCase();
    return v === 'activity' || v === 'name' ? v : null;
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
    if (select) select.addEventListener('change', () => setOrder(select.value, true));
    /** Cambia el orden (el de Tab y el de lector de pantalla) y, si lo pidió la persona, lo anuncia. */
    function setOrder(next, announce) {
      mode = ['activity', 'name'].includes(next) ? next : 'tabs';
      if (select) select.value = mode;
      draw();
      if (announce && status) status.textContent = text('constellation.ordered', { order: text('constellation.order' + mode[0].toUpperCase() + mode.slice(1)) });
    }
    function render(list) {
      items = list;
      if (status) status.textContent = '';
      draw();
    }
    function draw() {
      const shown = sortItems(items, mode);
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
    return { render, setOrder };
  }

  GB.constellation = { place, sortItems, orderParam, radiusOf, hueOf, mount };
})(window.GB);
