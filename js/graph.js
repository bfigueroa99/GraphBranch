/* GraphBranch — render del grafo en SVG.
   Zoom semántico: el zoom estira solo el eje del tiempo (X); los nodos y el
   texto mantienen su tamaño. Rueda = desplazar, Ctrl/⌘ + rueda o pellizco = zoom.
   Cada elemento anima desde su posición actual a la nueva en cada actualización.
   Encima del SVG van una capa canvas con los efectos de cada evento (como en la vista 3D)
   y, abajo, el minimapa: el grafo entero en miniatura con la ventana a la vista. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const tr = i18n.t; // `t` ya se usa aquí para otras cosas (transformaciones, textos SVG)
  const NS = 'http://www.w3.org/2000/svg';
  const SPACING = 28;
  const LANE_MIN = 34;
  const LANE_MAX = 54;
  const TOP = 34;
  const DUR = 650;
  const MINI_H = 30; // alto del minimapa
  const MINI_ZONE = 44; // franja de abajo que ocupa, con su margen
  const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  const LABEL_FONT = '500 12px ' + MONO;
  const SMALL_FONT = '500 11px ' + MONO;
  const GHOST_FONT = 'italic 500 10.5px ' + MONO;

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOut = (p) => 1 - (1 - p) ** 3;
  const TAU = Math.PI * 2;

  /** '#rrggbb' -> 'rgba(r,g,b,a)' (los gradientes del canvas piden el alfa en el color). */
  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
    if (!m) return `rgba(128,128,128,${a})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  /** Luminosidad (0..1) de un color '#rrggbb': decide si el tema es oscuro. */
  function lightness(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
    if (!m) return 1;
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  }

  function mk(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  function measure(text, font) {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }
  function fitText(text, font, max) {
    if (measure(text, font) <= max) return text;
    let s = text;
    while (s.length > 1 && measure(s + '…', font) > max) s = s.slice(0, -1);
    return s + '…';
  }

  function edgePath(kind, x1, y1, x2, y2, S) {
    if (kind === 'line' || Math.abs(y1 - y2) < 0.5) return `M${r1(x1)},${r1(y1)}L${r1(x2)},${r1(y2)}`;
    const d = Math.max(4, Math.min(S * 0.95, x2 - x1));
    if (kind === 'fork') {
      const xm = x1 + d;
      return `M${r1(x1)},${r1(y1)}C${r1(x1 + d * 0.6)},${r1(y1)} ${r1(xm - d * 0.6)},${r1(y2)} ${r1(xm)},${r1(y2)}L${r1(x2)},${r1(y2)}`;
    }
    const xm = x2 - d;
    return `M${r1(x1)},${r1(y1)}L${r1(xm)},${r1(y1)}C${r1(xm + d * 0.6)},${r1(y1)} ${r1(x2 - d * 0.6)},${r1(y2)} ${r1(x2)},${r1(y2)}`;
  }

  function cubicPoints(out, x0, y0, x1, y1, x2, y2, x3, y3, n = 18) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    return out;
  }

  /** La misma curva que edgePath, como polilínea: para que un efecto la recorra. */
  function edgePoints(kind, x1, y1, x2, y2, S) {
    if (kind === 'line' || Math.abs(y1 - y2) < 0.5)
      return [
        [x1, y1],
        [x2, y2],
      ];
    const d = Math.max(4, Math.min(S * 0.95, x2 - x1));
    if (kind === 'fork') {
      const xm = x1 + d;
      return cubicPoints([], x1, y1, x1 + d * 0.6, y1, xm - d * 0.6, y2, xm, y2).concat([[x2, y2]]);
    }
    const xm = x2 - d;
    return cubicPoints([[x1, y1]], xm, y1, xm + d * 0.6, y1, x2 - d * 0.6, y2, x2, y2);
  }

  /** Arco que sube y baja de A a B (para el cometa de un PR fusionado sin commit de merge). */
  function arcPoints(a, b, top) {
    const dx = b.x - a.x;
    const side = Math.abs(dx) < 40 ? 70 : 0; // extremos casi en vertical: el arco se abre hacia la derecha
    const lift = Math.max(top, Math.min(a.y, b.y) - 36 - Math.hypot(dx, b.y - a.y) * 0.3);
    return cubicPoints([], a.x, a.y, a.x + dx * 0.25 + side, lift, b.x - dx * 0.25 + side, lift, b.x, b.y, 28);
  }

  /** Largo acumulado de una polilínea y el punto a una fracción de su largo. */
  function measurePath(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function pointAt(pts, cum, f) {
    const total = cum[cum.length - 1];
    const d = clamp(f, 0, 1) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const k = clamp((d - cum[i - 1]) / seg, 0, 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  }

  /** Contenido del detalle de un commit (lo usan las vistas 2D y 3D). */
  function tipHTML(node, ctx, { pin = false, branchName = null, ghostNames = null } = {}) {
    const c = node.commit;
    const heads = node.heads;
    const parents = c.parents.length;
    const rows = [];
    if (heads.length) rows.push(`<span class="tip-refs">${heads.map((h) => `<code>${U.esc(h)}</code>`).join(' ')}</span>`);
    if (node.chain.startsWith('g:')) {
      const gname = ghostNames?.get(node.chain);
      rows.push(`<span>${gname ? i18n.html('tip.fromBranch', { name: gname }) : U.esc(tr('tip.fromGhost'))}</span>`);
    } else if (node.color === 'ghost') {
      rows.push(`<span>${i18n.html('tip.fromMerged', { name: node.chain.slice(2) })}</span>`);
    }
    const branch = branchName || heads[0];
    if (branch) {
      const pr = ctx.prs?.get(branch);
      if (pr) rows.push(`<span>${i18n.html(pr.draft ? 'tip.prDraft' : 'tip.pr', { num: pr.number, base: pr.base })}${pr.url ? ` · <a href="${U.esc(pr.url)}" target="_blank" rel="noopener">${U.esc(tr('tip.viewPr'))}</a>` : ''}</span>`);
    }
    return `
      <div class="tip-head">${U.avatarHTML(c.author, 22)}<span class="tip-author">${U.esc(c.author.name || tr('author.unknown'))}</span><span class="tip-time" title="${U.esc(U.fmtDateTime(c.date))}">${U.timeAgo(c.date)}</span></div>
      <p class="tip-msg">${U.esc(U.firstLine(c.message))}</p>
      <p class="tip-meta"><code>${U.shortSha(c.sha)}</code>${parents > 1 ? ` · ${U.esc(tr('tip.mergeOf', { n: parents }))}` : ''}</p>
      ${rows.length ? `<p class="tip-extra">${rows.join('')}</p>` : ''}
      ${pin && (c.url || (branch && ctx.canPin)) ? `<div class="tip-actions">
        ${c.url ? `<a class="tip-link" href="${U.esc(c.url)}" target="_blank" rel="noopener">${U.esc(tr('tip.openCommit'))} ↗</a>` : ''}
        ${branch && ctx.canPin ? pinButtonHTML(branch, !!ctx.pins?.has(branch)) : ''}
      </div>` : ''}`;
  }

  const pinLabel = (branch, on) => i18n.html(on ? 'tip.unpin' : 'tip.pin', { branch: U.truncate(branch, 28) });

  function pinButtonHTML(branch, on) {
    return `<button type="button" class="tip-pin" data-branch="${U.esc(branch)}" aria-pressed="${on}">${pinLabel(branch, on)}</button>`;
  }

  /** Conecta el botón "Fijar" de un tooltip con la acción de la app. */
  function wirePinButton(tip, onTogglePin) {
    tip.addEventListener('click', (ev) => {
      const b = ev.target.closest('.tip-pin');
      if (!b) return;
      const on = !!onTogglePin?.(b.dataset.branch);
      // se actualiza en su lugar (no con outerHTML): el botón conserva el foco de quien lo pulsó con el teclado
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = pinLabel(b.dataset.branch, on);
    });
  }

  /* Con miles de ramas el SVG tendría decenas de miles de elementos: cada commit, arista,
     etiqueta y fila de la leyenda crea su elemento recién la primera vez que entra en pantalla
     (fuera de ella solo existe como dato), los eventos se escuchan una vez por grupo y no por
     elemento, y las bandas de fondo son solo las de las filas a la vista. */
  class Graph {
    constructor(wrap, opts = {}) {
      this.wrap = wrap;
      this.opts = opts;
      this.svg = mk('svg', { class: 'graph-svg', 'aria-label': tr('graph.aria2d') }, wrap);
      this.gBands = mk('g', { class: 'bands' }, this.svg);
      this.gDays = mk('g', { class: 'days' }, this.svg);
      this.gEdges = mk('g', { class: 'edges' }, this.svg);
      this.gGhosts = mk('g', { class: 'ghost-labels' }, this.svg);
      this.gPointers = mk('g', { class: 'pointers' }, this.svg);
      this.gNodes = mk('g', { class: 'nodes' }, this.svg);
      this.gHeads = mk('g', { class: 'heads' }, this.svg);
      this.gLegend = mk('g', { class: 'legend' }, this.svg);
      this.legendBg = mk('rect', { class: 'legend-bg', x: 0, y: 0 }, this.gLegend);
      this.gAxis = mk('g', { class: 'axis' }, this.svg);
      this.axisBg = mk('rect', { class: 'axis-bg', x: 0, y: 0, height: TOP - 6 }, this.gAxis);

      // efectos de cada evento: un canvas encima del SVG que solo dibuja mientras hay alguno
      this.fxCv = document.createElement('canvas');
      this.fxCv.className = 'graph-fx';
      this.fxCv.setAttribute('aria-hidden', 'true');
      wrap.appendChild(this.fxCv);
      this.fxCtx = this.fxCv.getContext('2d');

      // minimapa: el grafo entero en miniatura; un clic o un arrastre llevan la vista hasta ahí
      this.miniEl = document.createElement('div');
      this.miniEl.className = 'g-mini';
      this.miniEl.setAttribute('aria-hidden', 'true'); // con teclado se navega con las flechas
      this.miniEl.title = tr('minimap.title');
      this.miniCv = document.createElement('canvas');
      this.miniCv.className = 'g-mini-cv';
      this.miniEl.appendChild(this.miniCv);
      wrap.appendChild(this.miniEl);
      this.miniCtx = this.miniCv.getContext('2d');
      this.miniBase = document.createElement('canvas'); // el grafo en miniatura: se rehace solo cuando cambia
      this.miniDirty = true;
      this.miniWin = null;
      this.miniGrab = null;

      this.tip = document.createElement('div');
      this.tip.className = 'tip';
      this.tip.hidden = true;
      this.tip.setAttribute('role', 'dialog');
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      wrap.appendChild(this.tip);

      this.nodes = new Map();
      this.edges = new Map();
      this.heads = new Map();
      this.pointers = new Map();
      this.legend = new Map();
      this.days = new Map();
      this.ghostLabels = new Map(); // nombres de las ramas ya fusionadas y borradas, sobre su tramo gris
      this.byChain = new Map(); // cadena -> elementos, para resaltar una rama sin recorrer todo
      this.hlChain = null;
      this.bands = [];
      this.maxX = 0;
      this.rowCount = 0;
      this.following = true;
      this.pinned = null;
      this.fx = []; // efectos en curso: cada uno dibuja su cuadro y dice si sigue
      this.sparks = []; // chispas sueltas (fuegos artificiales, polvo, estelas)
      this.pending = []; // efectos programados para dentro de un momento
      this.gone = new Map(); // ramas recién borradas: dónde estaban, para sus efectos
      this.lastFireworks = -1e9;
      this.W = wrap.clientWidth || 800;
      this.H = wrap.clientHeight || 400;
      this.dpr = 1;
      this.metrics();
      this.lane = { from: 40, to: 40, t0: 0 };
      this.t = d3.zoomIdentity.translate(this.padLeft, 0);

      this.zoom = d3
        .zoom()
        .scaleExtent([0.2, 3])
        .extent(() => [
          [0, 0],
          [this.W, this.H],
        ])
        .filter((ev) => (ev.type === 'wheel' ? ev.ctrlKey || ev.metaKey : !ev.button))
        .constrain((t) => this.constrain(t))
        .on('zoom', (ev) => {
          this.t = ev.transform;
          if (ev.sourceEvent) this.setFollowing(false);
          this.requestDraw();
        });
      this.sel = d3.select(this.svg).call(this.zoom).on('dblclick.zoom', null);
      this.svg.__zoom = this.t;

      this.svg.addEventListener(
        'wheel',
        (ev) => {
          if (ev.ctrlKey || ev.metaKey) return;
          const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? this.H : 1;
          let dx = ev.deltaX * unit;
          let dy = ev.deltaY * unit;
          if (ev.shiftKey && !dx) [dx, dy] = [dy, 0];
          // sobre la leyenda la rueda recorre las ramas (los carriles); en el resto, la historia
          const overLegend = ev.clientX - this.svg.getBoundingClientRect().left < this.padLeft;
          const vertical = this.contentH() > this.viewH && Math.abs(dy) > Math.abs(dx) * 1.2 && (ev.altKey || overLegend);
          const moveX = vertical ? 0 : Math.abs(dx) > Math.abs(dy) ? dx : dy;
          const moveY = vertical ? dy : 0;
          if (!moveX && !moveY) return;
          ev.preventDefault();
          this.setFollowing(false);
          this.sel.call(this.zoom.translateBy, -moveX / this.t.k, -moveY / this.t.k);
        },
        { passive: false },
      );

      this.svg.addEventListener('click', (ev) => {
        if (!ev.target.closest('.node, .head')) this.unpin();
      });
      wirePinButton(this.tip, (name) => this.opts.onTogglePin?.(name));
      this.bindGroups();
      this.bindKeys();
      this.bindMini();

      this.readTheme();
      U.onThemeChange(() => this.readTheme());

      new ResizeObserver(() => this.resize()).observe(wrap);
      document.fonts?.ready.then(() => this.relabel());
    }

    /** Teclado (tras un clic en el grafo): flechas para recorrer la historia y los carriles,
        Re Pág / Av Pág de a una pantalla de carriles, Inicio y Fin para el principio y lo último,
        + y - para el zoom. Con Mayús, pasos más largos. */
    bindKeys() {
      this.wrap.tabIndex = 0;
      this.wrap.addEventListener('pointerdown', (ev) => {
        if (!this.wrap.contains(document.activeElement) && !ev.target.closest('.tip')) this.wrap.focus({ preventScroll: true });
      });
      this.wrap.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          if (this.pinned) ev.preventDefault(); // Esc cerró la ficha: no hace nada más (salir del modo TV)
          return this.unpin();
        }
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('.tip')) return;
        const lane = this.lane.to;
        const page = Math.max(lane, Math.floor((this.viewH - TOP) / lane - 1) * lane);
        const big = ev.shiftKey;
        let dx = 0;
        let dy = 0;
        switch (ev.key) {
          case 'ArrowLeft':
            dx = big ? 320 : 80;
            break;
          case 'ArrowRight':
            dx = -(big ? 320 : 80);
            break;
          case 'ArrowUp':
            dy = lane * (big ? 5 : 1);
            break;
          case 'ArrowDown':
            dy = -lane * (big ? 5 : 1);
            break;
          case 'PageUp':
            dy = page;
            break;
          case 'PageDown':
            dy = -page;
            break;
          case 'Home':
            ev.preventDefault();
            this.setFollowing(false);
            return this.glide(d3.zoomIdentity.translate(this.padLeft, this.t.y).scale(this.t.k));
          case 'End':
            ev.preventDefault();
            if (this.following) this.follow(!reduceMotion());
            else this.setFollowing(true);
            return;
          case '+':
          case '=':
            ev.preventDefault();
            return this.zoomBy(1.25);
          case '-':
          case '_':
            ev.preventDefault();
            return this.zoomBy(0.8);
          default:
            return;
        }
        ev.preventDefault();
        this.setFollowing(false); // seguir lo último vuelve arriba y a la derecha: se suelta
        const far = Math.abs(dx) > 100 || Math.abs(dy) > lane * 1.5;
        if (far) this.glide(this.t.translate(dx / this.t.k, dy / this.t.k), 220);
        else this.sel.interrupt().call(this.zoom.translateBy, dx / this.t.k, dy / this.t.k);
      });
    }

    /** Lleva la vista a una transformación con una transición corta (o al instante sin movimiento). */
    glide(target, ms = 320) {
      const t = this.constrain(target);
      if (reduceMotion()) this.sel.interrupt().call(this.zoom.transform, t);
      else this.sel.transition().duration(ms).ease(d3.easeCubicOut).call(this.zoom.transform, t);
    }

    /** Un oyente por grupo (commits, etiquetas, leyenda) en vez de uno por elemento. */
    bindGroups() {
      const within = (ev, sel) => {
        const el = ev.target.closest?.(sel);
        return el && !el.contains(ev.relatedTarget) ? el : null; // entrar o salir de verdad, no pasar de un hijo a otro
      };
      // pasar por un commit resalta su rama (como en la vista 3D) y muestra su detalle
      this.gNodes.addEventListener('pointerover', (ev) => {
        const g = within(ev, '.node');
        if (!g) return;
        this.highlight(this.nodes.get(g.__sha)?.data.chain || null);
        if (!this.pinned) this.showTip(g.__sha, false);
      });
      this.gNodes.addEventListener('pointerout', (ev) => {
        if (!within(ev, '.node')) return;
        this.highlight(null);
        if (!this.pinned) this.hideTip();
      });
      this.gNodes.addEventListener('click', (ev) => {
        const g = ev.target.closest('.node');
        if (!g) return;
        ev.stopPropagation();
        this.showTip(g.__sha, true);
      });

      const head = (ev) => this.heads.get(ev.target.closest('.head')?.__name);
      this.gHeads.addEventListener('click', (ev) => {
        const it = head(ev);
        if (!it) return;
        ev.stopPropagation();
        this.showTip(it.data.sha, true, it.data.name);
      });
      this.gHeads.addEventListener('keydown', (ev) => {
        const it = head(ev);
        if (!it || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        this.showTip(it.data.sha, true, it.data.name);
      });
      this.gHeads.addEventListener('pointerover', (ev) => {
        const g = within(ev, '.head');
        if (g) this.highlight(this.heads.get(g.__name)?.data.chain || null);
      });
      this.gHeads.addEventListener('pointerout', (ev) => {
        if (within(ev, '.head')) this.highlight(null);
      });

      const row = (ev) => this.legend.get(ev.target.closest('.legend-item')?.__id);
      this.gLegend.addEventListener('pointerover', (ev) => {
        const g = within(ev, '.legend-item');
        const chain = g && this.legend.get(g.__id)?.data.chain;
        if (chain) this.highlight(chain);
      });
      this.gLegend.addEventListener('pointerout', (ev) => {
        if (within(ev, '.legend-item')) this.highlight(null);
      });
      this.gLegend.addEventListener('click', (ev) => {
        const it = row(ev);
        if (!it) return;
        ev.stopPropagation();
        if (!it.data.ghost) this.focusBranch(it.data.name);
      });
    }

    /* ---------- geometría ---------- */

    metrics() {
      const narrow = this.W < 640;
      this.padLeft = narrow ? 96 : 150;
      this.labelPad = narrow ? Math.min(190, this.W * 0.5) : 260;
      this.legendW = this.padLeft - 22;
      // el minimapa ocupa la franja de abajo, salvo en un panel muy bajo
      this.miniOn = this.H >= 320;
      this.viewH = this.H - (this.miniOn ? MINI_ZONE : 0);
      this.miniEl.hidden = !this.miniOn;
      this.miniW = Math.max(40, this.W - this.padLeft - 12);
      this.miniCv.style.left = this.padLeft + 'px';
      this.miniCv.style.width = this.miniW + 'px';
      this.miniCv.style.height = MINI_H + 'px';
      this.miniDirty = true;
    }

    contentH() {
      return TOP + this.rowCount * this.lane.to + 14;
    }

    /** Alto de carril: se estira para llenar el panel cuando hay pocas ramas. */
    fitLanes(animate) {
      const target = clamp(Math.floor((this.viewH - TOP - 18) / Math.max(1, this.rowCount)), LANE_MIN, LANE_MAX);
      if (target === this.lane.to) return;
      const now = performance.now();
      this.lane = { from: this.laneNow(now), to: target, t0: animate ? now : 0 };
    }

    laneNow(now) {
      const l = this.lane;
      if (!l.t0) return l.to;
      const p = clamp((now - l.t0) / DUR, 0, 1);
      if (p >= 1) {
        l.t0 = 0;
        return l.to;
      }
      return l.from + (l.to - l.from) * ease(p);
    }

    constrain(t) {
      let { k, x, y } = t;
      if (this.t && Math.abs(k - this.t.k) > 1e-9) y = this.t.y;
      const span = this.maxX * SPACING * k;
      x = clamp(x, Math.min(this.padLeft, this.W * 0.45 - span), Math.max(this.padLeft, this.W * 0.55));
      const ch = this.contentH();
      y = ch <= this.viewH ? 0 : clamp(y, this.viewH - ch, 0);
      return d3.zoomIdentity.translate(x, y).scale(k);
    }

    resize() {
      const W = this.wrap.clientWidth;
      const H = this.wrap.clientHeight;
      if (!W || !H) return;
      // vuelve a verse con el mismo tamaño (de la vista 3D a la 2D): lo que esperaba se dibuja ahora
      if (W === this.W && H === this.H && this.sized) return this.requestDraw();
      this.sized = true;
      this.W = W;
      this.H = H;
      this.metrics();
      this.fitLanes(false);
      this.svg.setAttribute('width', W);
      this.svg.setAttribute('height', H);
      // los canvas a la densidad de la pantalla (hasta 2x: son efectos y una miniatura)
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.fxCv.width = Math.round(W * this.dpr);
      this.fxCv.height = Math.round(H * this.dpr);
      this.fxPainted = false;
      this.miniCv.width = Math.round(this.miniW * this.dpr);
      this.miniCv.height = Math.round(MINI_H * this.dpr);
      this.miniBase.width = this.miniCv.width;
      this.miniBase.height = this.miniCv.height;
      this.relabel();
      if (this.following) this.follow(false);
      else this.sel.call(this.zoom.transform, this.constrain(this.t));
      this.requestDraw();
    }

    /** Posición actual de un elemento animado (en it.cx, it.cr); devuelve si sigue moviéndose. */
    step(it, now) {
      if (it.t0 > 0) {
        const p = clamp((now - it.t0) / DUR, 0, 1);
        if (p < 1) {
          const e = ease(p);
          it.cx = it.from.x + (it.to.x - it.from.x) * e;
          it.cr = it.from.row + (it.to.row - it.from.row) * e;
          return true;
        }
        it.t0 = 0;
      }
      it.cx = it.to.x;
      it.cr = it.to.row;
      return false;
    }

    retarget(it, x, row, now, animate) {
      this.step(it, now);
      if (Math.abs(it.cx - x) < 1e-6 && Math.abs(it.cr - row) < 1e-6) return false;
      it.from = { x: it.cx, row: it.cr };
      it.to = { x, row };
      it.t0 = animate ? now : 0;
      return true;
    }

    exit(el) {
      if (!el) return;
      el.classList.add('exit');
      el.style.pointerEvents = 'none';
      setTimeout(() => el.remove(), 450);
    }

    /** Clase temporal (`enter`, `moved`) que dura `ms` desde `since`; si el elemento aún no existe, se aplica al crearlo. */
    mark(it, cls, ms, since = performance.now()) {
      (it.marks ||= {})[cls] = since + ms;
      if (it.el) this.applyMark(it, cls, true);
    }

    applyMark(it, cls, restart) {
      const el = it.el;
      const left = it.marks[cls] - performance.now();
      clearTimeout(el['__t' + cls]);
      if (left <= 0) {
        delete it.marks[cls];
        el.classList.remove(cls);
        return;
      }
      if (restart) {
        el.classList.remove(cls);
        void el.getBoundingClientRect(); // vuelve a empezar la animación
      }
      el.classList.add(cls);
      el['__t' + cls] = setTimeout(() => el.classList.remove(cls), left);
    }

    /** Al crear un elemento: sus clases temporales pendientes y el resaltado de su rama. */
    dress(it, chain) {
      for (const cls in it.marks || {}) this.applyMark(it, cls, false);
      if (this.hlChain && chain === this.hlChain) it.el.classList.add('hl');
    }

    /* ---------- actualización de datos ---------- */

    /**
     * @param L     resultado de Layout.compute
     * @param ctx   { initial, calm, prs: Map rama->PR, pins, canPin }
     */
    update(L, ctx = {}) {
      const now = performance.now();
      const still = ctx.initial || ctx.calm || reduceMotion(); // sin animación: carga inicial o ramas que esperaban
      const animate = !still;
      const fx = !still;
      this.layout = L;
      this.ctx = ctx;
      this.replaying = !!ctx.replay; // el Replay trae su propia línea de tiempo: el minimapa espera
      this.maxX = L.maxX;
      this.rowCount = L.rows.length;
      this.fitLanes(animate);
      this.ghostNames = new Map(L.ghostLabels.map((g) => [g.id, g.name]));
      const byChain = new Map();
      const index = (it, chain) => (byChain.get(chain) || byChain.set(chain, []).get(chain)).push(it);

      /* nodos */
      const seen = new Set();
      for (const n of L.nodes) {
        seen.add(n.sha);
        let it = this.nodes.get(n.sha);
        if (!it) {
          it = { el: null, from: { x: n.x, row: n.row }, to: { x: n.x, row: n.row }, t0: 0, cx: n.x, cr: n.row };
          this.nodes.set(n.sha, it);
          if (fx) {
            it.ripple = now;
            this.mark(it, 'enter', 900, now);
          }
        } else this.retarget(it, n.x, n.row, now, animate);
        it.data = n;
        it.cls = `node ${n.color}${n.merge ? ' merge' : ''}${n.heads.length ? ' is-head' : ''}`;
        if (it.el) this.paintNode(it);
        index(it, n.chain);
      }
      for (const [id, it] of this.nodes) if (!seen.has(id)) (this.exit(it.el), this.nodes.delete(id));

      /* aristas */
      const seenE = new Set();
      for (const e of L.edges) {
        seenE.add(e.id);
        let it = this.edges.get(e.id);
        if (!it) {
          it = { el: null };
          this.edges.set(e.id, it);
          if (fx && e.kind !== 'stub') this.mark(it, 'enter', 900, now);
        } else if (it.el && it.data.kind !== e.kind && (it.data.kind === 'stub') !== (e.kind === 'stub')) {
          it.el.remove(); // de recta a línea punteada (o al revés) cambia el elemento: se rehace al dibujar
          it.el = null;
          it.vis = false;
        }
        it.data = e;
        it.cls = `edge ${e.kind} ${e.color}`;
        if (it.el) this.paintEdge(it);
        index(it, e.chain);
      }
      for (const [id, it] of this.edges) if (!seenE.has(id)) (this.exit(it.el), this.edges.delete(id));

      /* cabezas de rama */
      const seenH = new Set();
      for (const h of L.heads) {
        seenH.add(h.name);
        let it = this.heads.get(h.name);
        if (!it) {
          it = { el: null, from: { x: h.x, row: h.row }, to: { x: h.x, row: h.row }, t0: 0, cx: h.x, cr: h.row };
          this.heads.set(h.name, it);
          if (fx) {
            this.mark(it, 'enter', 600, now);
            this.mark(it, 'moved', 2600, now);
          }
        } else {
          const moved = this.retarget(it, h.x, h.row, now, animate);
          if (moved && fx && it.data.sha !== h.sha) this.mark(it, 'moved', 2600, now);
        }
        this.gone.delete(h.name);
        it.data = h;
        if (it.el) this.buildHead(it, h, ctx);
        index(it, h.chain);

        let p = this.pointers.get(h.name);
        if (!h.own) {
          if (!p) this.pointers.set(h.name, (p = { el: null }));
          p.cls = `pointer ${h.color}`;
          p.chain = h.chain;
          if (p.el) p.el.setAttribute('class', p.cls);
          index(p, h.chain);
        } else if (p) {
          this.exit(p.el);
          this.pointers.delete(h.name);
        }
      }
      for (const [name, g] of this.gone) if (now - g.t > 60000) this.gone.delete(name);
      for (const [name, it] of this.heads) {
        if (seenH.has(name)) continue;
        // dónde estaba: ahí se deshace en polvo si el evento de la rama borrada llega después
        const node = this.nodes.get(it.data.sha);
        this.step(it, now);
        this.gone.set(name, { x: node ? node.to.x : it.cx, row: it.cr, w: it.w || 60, color: it.data.color, t: now });
        this.exit(it.el);
        this.heads.delete(name);
        const p = this.pointers.get(name);
        if (p) (this.exit(p.el), this.pointers.delete(name));
      }

      /* leyenda fija a la izquierda */
      const seenL = new Set();
      for (const r of L.rows) {
        seenL.add(r.id);
        let it = this.legend.get(r.id);
        if (!it) {
          it = { el: null, from: { x: 0, row: r.row }, to: { x: 0, row: r.row }, t0: 0, cx: 0, cr: r.row };
          this.legend.set(r.id, it);
        } else this.retarget(it, 0, r.row, now, animate);
        it.data = r;
        if (it.el) this.buildLegend(it, r);
        if (r.chain) index(it, r.chain);
      }
      for (const [id, it] of this.legend) if (!seenL.has(id)) (this.exit(it.el), this.legend.delete(id));

      /* nombres de las ramas ya fusionadas y borradas (los dice su merge), sobre su tramo gris */
      const seenG = new Set();
      for (const g of L.ghostLabels) {
        seenG.add(g.id);
        let it = this.ghostLabels.get(g.id);
        if (!it) {
          it = { el: null, from: { x: g.x0, row: g.row }, to: { x: g.x0, row: g.row }, t0: 0, cx: g.x0, cr: g.row };
          this.ghostLabels.set(g.id, it);
        } else this.retarget(it, g.x0, g.row, now, animate);
        if (it.data?.name !== g.name) it.fit = null;
        it.data = g;
        index(it, g.chain);
      }
      for (const [id, it] of this.ghostLabels) if (!seenG.has(id)) (this.exit(it.el), this.ghostLabels.delete(id));
      this.miniDirty = true;

      if (this.hlChain) for (const it of this.byChain.get(this.hlChain) || []) it.el?.classList.remove('hl');
      this.byChain = byChain;
      if (this.hlChain) this.highlight(this.hlChain, true);

      /* días */
      const seenD = new Set();
      for (const d of L.days) {
        seenD.add(d.id);
        let it = this.days.get(d.id);
        if (!it) {
          it = { line: mk('line', { class: 'day-line' }, this.gDays), label: mk('text', { class: 'day-label', y: 19 }, this.gAxis) };
          this.days.set(d.id, it);
        }
        it.data = d;
        this.dayLabel(it);
      }
      for (const [id, it] of this.days) if (!seenD.has(id)) (it.line.remove(), it.label.remove(), this.days.delete(id));

      if (this.pinned && !this.nodes.has(this.pinned.sha)) this.unpin();

      if (ctx.initial) {
        this.sel.call(this.zoom.transform, this.followTarget());
      } else if (this.following) this.follow(animate);
      else this.sel.call(this.zoom.transform, this.constrain(this.t));
      this.requestDraw();
    }

    dayText(ms) {
      return i18n.dayLabel(ms);
    }

    dayLabel(it) {
      const text = this.dayText(it.data.time);
      if (it.text === text) return;
      it.text = it.label.textContent = text;
      it.w = measure(text, SMALL_FONT); // se mide una vez, no en cada cuadro
    }

    /* ---------- elementos (se crean al entrar en pantalla) ---------- */

    makeNode(it) {
      const g = mk('g', null, this.gNodes);
      mk('circle', { class: 'halo', r: 10 }, g);
      mk('circle', { class: 'dot', r: 4.5 }, g);
      mk('circle', { class: 'hit', r: 12 }, g);
      g.__sha = it.data.sha;
      it.el = g;
      this.paintNode(it);
      this.dress(it, it.data.chain);
      if (it.ripple && performance.now() - it.ripple < 600) this.ripple(it);
      if (it.focus && performance.now() - it.focus < 1200) this.ripple(it, true);
      it.ripple = it.focus = 0;
    }

    paintNode(it) {
      const cls = it.cls + (it.el.classList.contains('enter') ? ' enter' : '') + (it.el.classList.contains('hl') ? ' hl' : '');
      if (it.el.getAttribute('class') !== cls) it.el.setAttribute('class', cls);
    }

    makeEdge(it) {
      it.el = mk('path', it.data.kind === 'stub' ? null : { pathLength: 1 }, this.gEdges);
      this.paintEdge(it);
      this.dress(it, it.data.chain);
    }

    paintEdge(it) {
      const cls = it.cls + (it.el.classList.contains('enter') ? ' enter' : '') + (it.el.classList.contains('hl') ? ' hl' : '');
      if (it.el.getAttribute('class') !== cls) it.el.setAttribute('class', cls);
    }

    makeHead(it) {
      const el = mk('g', { class: 'head', tabindex: 0, role: 'button' }, this.gHeads);
      el.__name = it.data.name;
      it.el = el;
      this.buildHead(it, it.data, this.ctx || {});
      this.dress(it, it.data.chain);
    }

    makeLegend(it) {
      it.el = mk('g', { class: 'legend-item' }, this.gLegend);
      it.el.__id = it.data.id;
      this.buildLegend(it, it.data);
      this.dress(it, it.data.chain);
    }

    makeGhostLabel(it) {
      it.el = mk('text', { class: 'ghost-label', dy: '-0.45em' }, this.gGhosts);
      it.fit = null;
      this.dress(it, it.data.chain);
    }

    ripple(it, focus) {
      const c = mk('circle', { class: focus ? 'ripple focus' : 'ripple', r: focus ? 6 : 5 }, it.el);
      setTimeout(() => c.remove(), 1700);
    }

    /** Etiqueta de rama: se rehace solo si cambió lo que muestra (en cada sondeo llegan las mismas ramas). */
    buildHead(it, h, ctx) {
      const g = it.el;
      const pr = ctx.prs?.get(h.name);
      const pinned = !!ctx.pins?.has(h.name);
      const hl = g.classList.contains('hl') ? ' hl' : '';
      const keep = ['moved', 'enter'].filter((c) => g.classList.contains(c)).map((c) => ' ' + c).join('');
      g.setAttribute('class', `head ${h.color}${h.isDefault ? ' default' : ''}${h.own ? '' : ' pointer-head'}${keep}${hl}`);
      const key = `${h.name}\n${h.isDefault}\n${pinned}\n${pr ? `${pr.number}:${pr.draft}:${pr.base}` : ''}\n${i18n.locale}`;
      if (it.key === key) return;
      it.key = key;
      g.textContent = '';
      const bg = mk('rect', { class: 'h-bg', x: 0, y: -11, height: 22, rx: 11 }, g);
      mk('circle', { class: 'h-dot', cx: 11, cy: 0, r: 3.5 }, g);
      let x = 20;
      const name = fitText(h.name, LABEL_FONT, 210);
      const t = mk('text', { class: 'h-name', x, y: 0, dy: '0.35em' }, g);
      t.textContent = name;
      x += measure(name, LABEL_FONT) + 8;
      const aria = [tr(h.isDefault ? 'branch.ariaDefault' : 'branch.aria', { name: h.name })];
      if (pinned) {
        const pg = mk('g', { class: 'h-pin', transform: `translate(${x + 4},0)` }, g);
        mk('path', { d: 'M0,-4L4,0L0,4L-4,0Z' }, pg);
        mk('title', null, pg).textContent = tr('branch.pinned');
        x += 13;
        aria.push(tr('branch.pinned'));
      }
      if (pr) {
        const label = `#${pr.number}`;
        const pt = mk('text', { class: `h-pr${pr.draft ? ' draft' : ''}`, x, y: 0, dy: '0.35em' }, g);
        pt.textContent = label;
        x += measure(label, SMALL_FONT) + 8;
        aria.push(tr(pr.draft ? 'branch.prDraftAria' : 'branch.prAria', { num: pr.number, base: pr.base }));
      }
      bg.setAttribute('width', Math.round(x + 2));
      g.setAttribute('aria-label', aria.join(', '));
      it.w = x + 2;
    }

    buildLegend(it, r) {
      const g = it.el;
      const hl = g.classList.contains('hl') ? ' hl' : '';
      g.setAttribute('class', `legend-item ${r.color}${r.ghost ? ' ghost-row' : ''}${hl}`);
      const name = r.ghost ? tr('legend.merged') : r.name;
      const key = `${name}\n${r.ghost}\n${this.legendW}`;
      if (it.key === key) return;
      it.key = key;
      g.textContent = '';
      mk('rect', { class: 'l-bg', x: 0, y: -10, height: 20, rx: 10, width: this.legendW }, g);
      mk('circle', { class: 'l-dot', cx: 10, cy: 0, r: 3.5 }, g);
      const t = mk('text', { class: 'l-name', x: 19, y: 0, dy: '0.35em' }, g);
      t.textContent = fitText(name, SMALL_FONT, this.legendW - 26);
      if (!r.ghost) mk('title', null, g).textContent = r.name;
    }

    /** Cambio de idioma: etiquetas accesibles, días del eje y rótulos de las ramas. */
    relocalize() {
      this.svg.setAttribute('aria-label', tr('graph.aria2d'));
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      this.miniEl.title = tr('minimap.title');
      this.unpin();
      for (const d of this.days.values()) this.dayLabel(d);
      this.relabel();
    }

    /** Vuelve a medir y escribir los rótulos (fuentes recién cargadas, otro ancho u otro idioma). */
    relabel() {
      if (!this.layout) return;
      for (const it of this.heads.values()) {
        it.key = null;
        if (it.el) this.buildHead(it, it.data, this.ctx || {});
      }
      for (const it of this.legend.values()) {
        it.key = null;
        if (it.el) this.buildLegend(it, it.data);
      }
      for (const d of this.days.values()) (d.text = null), this.dayLabel(d);
      for (const it of this.ghostLabels.values()) it.fit = null;
      this.requestDraw();
    }

    /* ---------- dibujo por cuadro ---------- */

    /** Pide un cuadro. `full` = recolocar el grafo; sin él solo avanzan los efectos (con miles de
        commits, un fuego artificial no vuelve a recorrerlos todos en cada cuadro). */
    requestDraw(full = true) {
      if (full) this.full = true;
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        const now = performance.now();
        let more = false;
        if (this.full) {
          this.full = false;
          if (this.draw(now)) more = this.full = true;
          this.drawMini();
        }
        if (this.drawFx(now)) more = true;
        if (more) this.requestDraw(false);
      });
    }

    /** Muestra u oculta un elemento; lo crea la primera vez que hace falta. */
    show(it, vis, make) {
      if (vis && !it.el) {
        make.call(this, it);
        it.vis = true;
        return;
      }
      if (it.vis === vis || !it.el) return;
      it.vis = vis;
      it.el.style.display = vis ? '' : 'none';
    }

    draw(now) {
      let active = false;
      const t = this.t;
      const S = SPACING * t.k;
      const X = (u) => t.x + u * S;
      const lane = this.laneNow(now);
      if (this.lane.t0) active = true;
      const Y = (r) => t.y + TOP + r * lane + lane / 2;
      const VH = this.viewH;
      this.geo = { tx: t.x, ty: t.y, S, lane }; // para los efectos, que se dibujan en otros cuadros

      // solo se tocan en el DOM los elementos que caen dentro (o cerca) de la vista
      const M = 40;
      for (const it of this.nodes.values()) {
        if (this.step(it, now)) active = true;
        it.px = X(it.cx);
        it.py = Y(it.cr);
        const vis = it.px > -M && it.px < this.W + M && it.py > -M && it.py < VH + M;
        this.show(it, vis, this.makeNode);
        if (vis) it.el.setAttribute('transform', `translate(${r1(it.px)},${r1(it.py)})`);
      }

      for (const it of this.edges.values()) {
        const e = it.data;
        const b = this.nodes.get(e.to);
        if (!b) continue;
        if (e.kind === 'stub') {
          this.show(it, b.vis, this.makeEdge);
          if (b.vis) it.el.setAttribute('d', `M${r1(b.px)},${r1(b.py)}h${-r1(Math.min(S * 0.85, 24))}`);
          continue;
        }
        const a = this.nodes.get(e.from);
        if (!a) continue;
        const vis = Math.max(a.px, b.px) > -M && Math.min(a.px, b.px) < this.W + M && Math.max(a.py, b.py) > -M && Math.min(a.py, b.py) < VH + M;
        this.show(it, vis, this.makeEdge);
        if (vis) it.el.setAttribute('d', edgePath(e.kind, a.px, a.py, b.px, b.py, S));
      }

      // el nombre va sobre el tramo gris, entre la curva de donde nace y la de su merge; si el
      // tramo empieza bajo la leyenda, el nombre se queda pegado a ella (como las fechas del eje)
      const bend = S * 0.95 + 4; // lo que ocupa cada curva (ver edgePath)
      for (const it of this.ghostLabels.values()) {
        if (this.step(it, now)) active = true;
        const g = it.data;
        const x0 = Math.max(X(it.cx) + bend, this.padLeft + 4);
        const room = X(it.cx + (g.x1 - g.x0)) - bend - x0;
        const y = Y(it.cr);
        const vis = room >= 44 && x0 < this.W + M && y > TOP && y < VH + M;
        this.show(it, vis, this.makeGhostLabel);
        if (!vis) continue;
        const fit = Math.min(40, Math.floor(room / 12)); // se vuelve a recortar solo al cambiar de ancho
        if (it.fit !== fit) {
          it.fit = fit;
          it.el.textContent = fitText(g.name, GHOST_FONT, fit * 12);
        }
        it.el.setAttribute('x', r1(x0));
        it.el.setAttribute('y', r1(y));
      }

      for (const [name, it] of this.heads) {
        if (this.step(it, now)) active = true;
        const hx = X(it.cx);
        const hy = Y(it.cr);
        let lx = hx + 11;
        const p = this.pointers.get(name);
        if (!it.data.own) lx = hx + Math.max(16, S * 0.8);
        it.lx = lx;
        it.ly = hy;
        // bajo la leyenda no se dibuja: la leyenda ya nombra la fila y lleva a la rama
        const vis = lx > this.padLeft - 4 && lx < this.W + M && hy > -M && hy < VH + M;
        this.show(it, vis, this.makeHead);
        if (vis) it.el.setAttribute('transform', `translate(${r1(lx)},${r1(hy)})`);
        if (!p) continue;
        const node = this.nodes.get(it.data.sha);
        this.show(p, vis && !!node, this.makePointer);
        if (!vis || !node) continue;
        const x1 = node.px;
        const y1 = node.py;
        p.el.setAttribute(
          'd',
          Math.abs(y1 - hy) < 0.5
            ? `M${r1(x1)},${r1(y1)}L${r1(lx)},${r1(hy)}`
            : `M${r1(x1)},${r1(y1)}C${r1(x1 + (lx - x1) * 0.7)},${r1(y1)} ${r1(x1 + (lx - x1) * 0.2)},${r1(hy)} ${r1(lx)},${r1(hy)}`,
        );
      }

      this.legendBg.setAttribute('width', this.padLeft - 8);
      this.legendBg.setAttribute('height', this.H);
      for (const it of this.legend.values()) {
        if (this.step(it, now)) active = true;
        const y = Y(it.cr);
        const vis = y > -M && y < VH + M;
        this.show(it, vis, this.makeLegend);
        if (vis) it.el.setAttribute('transform', `translate(8,${r1(y)})`);
      }

      this.drawBands(t.y, lane);

      this.axisBg.setAttribute('width', this.W);
      // etiquetas de día: gana la más reciente; el día que ya empezó fuera de vista queda fijo a la izquierda
      const days = [...this.days.values()].sort((a, b) => b.data.x - a.data.x);
      let minLeft = this.W - 4;
      let stuck = false;
      for (const d of days) {
        const x = X(d.data.x) - S / 2;
        d.line.setAttribute('x1', r1(x));
        d.line.setAttribute('x2', r1(x));
        d.line.setAttribute('y1', TOP - 6);
        d.line.setAttribute('y2', VH);
        d.line.style.display = x > this.padLeft - 6 ? '' : 'none';
        let lx = x + 6;
        if (x <= this.padLeft) {
          lx = this.padLeft + 6;
          if (stuck) {
            d.label.style.display = 'none';
            continue;
          }
          stuck = true;
        }
        const ok = lx + d.w < minLeft;
        d.label.setAttribute('x', r1(lx));
        d.label.style.display = ok ? '' : 'none';
        if (ok) minLeft = lx - 12;
      }

      if (this.tipSha && !this.tip.hidden) this.placeTip();
      return active;
    }

    makePointer(p) {
      p.el = mk('path', { class: p.cls }, this.gPointers);
      this.dress(p, p.chain);
    }

    /** Bandas de fondo: solo las de las filas a la vista (con miles de ramas, unas pocas decenas). */
    drawBands(ty, lane) {
      const first = Math.max(0, Math.floor((-ty - TOP) / lane));
      const last = Math.min(this.rowCount - 1, Math.ceil((this.viewH - ty - TOP) / lane));
      const n = Math.max(0, last - first + 1);
      while (this.bands.length < n) this.bands.push(mk('rect', { class: 'band', x: 0 }, this.gBands));
      while (this.bands.length > n) this.bands.pop().remove();
      this.bands.forEach((b, k) => {
        const i = first + k;
        b.setAttribute('class', i % 2 ? 'band odd' : 'band');
        b.setAttribute('width', this.W);
        b.setAttribute('y', r1(ty + TOP + i * lane));
        b.setAttribute('height', r1(lane));
      });
    }

    /* ---------- seguimiento en vivo, zoom y foco ---------- */

    /** Lo último: el extremo derecho del tiempo y las primeras filas, donde quedan las ramas más activas. */
    followTarget() {
      const S = SPACING * this.t.k;
      const x = Math.min(this.padLeft, this.W - this.labelPad - this.maxX * S);
      return d3.zoomIdentity.translate(x, 0).scale(this.t.k);
    }

    follow(animate) {
      const target = this.followTarget();
      if (animate && this.wrap.clientWidth) this.sel.transition().duration(700).ease(d3.easeCubicOut).call(this.zoom.transform, target);
      else this.sel.interrupt().call(this.zoom.transform, target);
    }

    setFollowing(v) {
      if (this.following === v) return;
      this.following = v;
      this.opts.onFollowChange?.(v);
      if (v) this.follow(!reduceMotion());
    }

    zoomBy(factor) {
      const px = this.following ? this.W - this.labelPad : this.W / 2;
      this.sel
        .transition()
        .duration(reduceMotion() ? 0 : 260)
        .call(this.zoom.scaleBy, factor, [px, this.H / 2])
        .on('end', () => this.following && this.follow(false));
    }

    focusSha(sha) {
      const it = this.nodes.get(sha);
      if (!it) return false;
      this.setFollowing(false);
      const S = SPACING * this.t.k;
      const rowY = TOP + it.to.row * this.lane.to + this.lane.to / 2;
      let y = this.t.y;
      if (rowY + y < TOP + 12 || rowY + y > this.viewH - 24) y = this.viewH / 2 - rowY;
      const target = this.constrain(d3.zoomIdentity.translate(this.W * 0.45 - it.to.x * S, y).scale(this.t.k));
      this.sel.transition().duration(reduceMotion() ? 0 : 600).ease(d3.easeCubicInOut).call(this.zoom.transform, target);
      if (!reduceMotion()) {
        // el commit puede estar lejos: si aún no tiene elemento, la onda sale cuando llegue a la vista
        if (it.el) this.ripple(it, true);
        else it.focus = performance.now();
      }
      return true;
    }

    focusBranch(name) {
      const h = this.heads.get(name);
      if (!h) return false;
      this.focusSha(h.data.sha);
      this.mark(h, 'moved', 1800);
      return true;
    }

    hasBranch(name) {
      return this.heads.has(name);
    }

    /** Resalta una cadena (rama): solo se tocan sus elementos y los del resaltado anterior. */
    highlight(chain, force) {
      if (chain === this.hlChain && !force) return;
      const set = (c, on) => {
        for (const it of this.byChain.get(c) || []) it.el?.classList.toggle('hl', on);
      };
      if (this.hlChain && this.hlChain !== chain) set(this.hlChain, false);
      this.hlChain = chain;
      this.svg.classList.toggle('dimmed', !!chain);
      if (chain) set(chain, true);
    }

    /* ---------- tema ---------- */

    /** Colores para los canvas (el SVG los toma del CSS solo): los de la página en el tema actual. */
    readTheme() {
      const cs = getComputedStyle(this.wrap);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      this.colors = { ghost: v('--ghost', '#b4bdb9') };
      for (let i = 1; i <= 8; i++) this.colors['c' + i] = v('--s' + i, '#888888');
      const surface = v('--surface', '#fbfcfb');
      this.dark = lightness(surface) < 0.5;
      this.pal = {
        surface,
        ink2: v('--ink-2', '#48534f'),
        ink3: v('--ink-3', '#636e6a'),
        good: v('--good', '#0a8f0a'),
        warn: v('--warn', '#c98a00'),
        bad: v('--bad', '#d03b3b'),
        spark: this.dark ? '#fff1dc' : v('--ink-3', '#636e6a'), // la luz de un cohete o de una estrella fugaz
      };
      this.miniDirty = true;
      this.requestDraw();
    }

    /** Color de una clase ('ghost' o 'c<n>'): del 1 al 8 los del CSS, del 9 en adelante la paleta generada. */
    colorHex(key) {
      let hex = this.colors[key];
      if (!hex) {
        const n = Number(/^c(\d+)$/.exec(key)?.[1]);
        hex = this.colors[key] = n > GB.palette.base ? GB.palette.hex(n, this.dark) : this.colors.ghost;
      }
      return hex;
    }

    /* ---------- minimapa ---------- */

    bindMini() {
      const cv = this.miniCv;
      const local = (ev) => {
        const r = cv.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
      };
      const inWin = (p) => {
        const w = this.miniWin;
        return !!w && p.x >= w.x0 - 3 && p.x <= w.x1 + 3 && p.y >= w.y0 - 3 && p.y <= w.y1 + 3;
      };
      cv.addEventListener('pointerdown', (ev) => {
        if (ev.button || !this.miniMap) return;
        ev.preventDefault();
        cv.setPointerCapture?.(ev.pointerId);
        const p = local(ev);
        const w = this.miniWin;
        const grab = inWin(p);
        // la ventana se arrastra desde donde se la tomó; un clic fuera de ella la lleva hasta ahí
        this.miniGrab = grab ? { dx: p.x - (w.x0 + w.x1) / 2, dy: p.y - (w.y0 + w.y1) / 2 } : { dx: 0, dy: 0 };
        cv.classList.add('grabbing');
        this.miniGo(p.x - this.miniGrab.dx, p.y - this.miniGrab.dy, !grab);
      });
      cv.addEventListener('pointermove', (ev) => {
        const p = local(ev);
        if (!this.miniGrab) return cv.classList.toggle('grab', inWin(p));
        this.miniGo(p.x - this.miniGrab.dx, p.y - this.miniGrab.dy, false);
      });
      const end = () => {
        this.miniGrab = null;
        cv.classList.remove('grabbing');
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      // la rueda sobre el minimapa recorre la historia, como sobre el grafo
      cv.addEventListener(
        'wheel',
        (ev) => {
          ev.preventDefault();
          const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? this.W : 1;
          const d = (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) * unit;
          if (!d) return;
          this.setFollowing(false);
          this.sel.call(this.zoom.translateBy, -d / this.t.k, 0);
        },
        { passive: false },
      );
    }

    /** Centra la vista en un punto del minimapa. */
    miniGo(x, y, animate) {
      const m = this.miniMap;
      if (!m) return;
      const u = clamp((x - m.x0) / m.sx, 0, m.n);
      const r = clamp((y - m.y0) / m.rh, 0, m.rows);
      const lane = this.lane.to;
      const tx = (this.padLeft + this.W) / 2 - u * SPACING * this.t.k;
      const ty = (TOP + this.viewH) / 2 - TOP - r * lane;
      this.setFollowing(false);
      const target = d3.zoomIdentity.translate(tx, ty).scale(this.t.k);
      if (animate) this.glide(target, 380);
      else this.sel.interrupt().call(this.zoom.transform, this.constrain(target));
    }

    /** El grafo entero en miniatura, una línea por arista agrupada por color; se rehace solo cuando
        cambian los datos, el tamaño o el tema (con miles de ramas, unas pocas llamadas de dibujo). */
    renderMiniBase() {
      const L = this.layout;
      const g = this.miniBase.getContext('2d');
      const cw = this.miniW;
      const ch = MINI_H;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, cw, ch);
      if (!L || !L.nodes.length) return (this.miniMap = null);
      const n = Math.max(1, L.maxX);
      const rows = Math.max(1, L.rows.length);
      const m = (this.miniMap = { n, rows, x0: 4, y0: 3, sx: (cw - 8) / n, rh: (ch - 6) / rows });
      const mx = (u) => m.x0 + u * m.sx;
      const my = (r) => m.y0 + (r + 0.5) * m.rh;
      const paths = new Map();
      const path = (color) => paths.get(color) || paths.set(color, new Path2D()).get(color);
      for (const e of L.edges) {
        if (e.kind === 'stub') continue;
        const a = L.nodeOf.get(e.from);
        const b = L.nodeOf.get(e.to);
        if (!a || !b) continue;
        const p = path(e.color);
        const [ax, ay, bx, by] = [mx(a.x), my(a.row), mx(b.x), my(b.row)];
        p.moveTo(ax, ay);
        if (ay !== by && e.kind === 'fork') p.lineTo(Math.min(bx, ax + 3), by);
        else if (ay !== by && e.kind === 'merge') p.lineTo(Math.max(ax, bx - 3), ay);
        p.lineTo(bx, by);
      }
      // cada cabeza, un punto: así también se ven las ramas de un solo commit
      for (const h of L.heads) {
        const p = path(h.color);
        p.moveTo(mx(h.x) + 0.6, my(h.row));
        p.arc(mx(h.x), my(h.row), 0.6, 0, TAU);
      }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = clamp(m.rh * 0.55, 1, 2.6);
      for (const [color, p] of paths) {
        g.globalAlpha = color === 'ghost' ? 0.85 : 1;
        g.strokeStyle = this.colorHex(color);
        g.stroke(p);
      }
      g.globalAlpha = 1;
    }

    /** Minimapa: la miniatura y encima la ventana de lo que se ve (lo de fuera, atenuado). */
    drawMini() {
      if (!this.miniOn || this.wrap.hidden || this.replaying) return;
      if (this.miniDirty) {
        this.miniDirty = false;
        this.renderMiniBase();
      }
      const c = this.miniCtx;
      const m = this.miniMap;
      const geo = this.geo;
      const cw = this.miniW;
      const ch = MINI_H;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, cw, ch);
      if (!m || !geo) return (this.miniWin = null);
      c.drawImage(this.miniBase, 0, 0, cw, ch);
      let x0 = clamp(m.x0 + ((this.padLeft - geo.tx) / geo.S) * m.sx, 0, cw);
      let x1 = clamp(m.x0 + ((this.W - geo.tx) / geo.S) * m.sx, 0, cw);
      let y0 = clamp(m.y0 + (-geo.ty / geo.lane) * m.rh, 0, ch);
      let y1 = clamp(m.y0 + ((this.viewH - TOP - geo.ty) / geo.lane) * m.rh, 0, ch);
      if (x1 - x0 < 6) x1 = (x0 = clamp((x0 + x1) / 2 - 3, 0, cw - 6)) + 6;
      if (y1 - y0 < 4) y1 = (y0 = clamp((y0 + y1) / 2 - 2, 0, ch - 4)) + 4;
      this.miniWin = { x0, x1, y0, y1 };
      c.fillStyle = this.pal.surface;
      c.globalAlpha = 0.62;
      c.beginPath();
      c.rect(0, 0, cw, ch);
      c.rect(x0, y0, x1 - x0, y1 - y0);
      c.fill('evenodd');
      c.globalAlpha = 1;
      c.strokeStyle = this.pal.ink2;
      c.lineWidth = 1;
      c.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
    }

    /* ---------- efectos: cada tipo de evento con el suyo, como en la vista 3D ---------- */

    /** Efectos de las actividades que acaban de llegar: solo con la vista 2D a la vista y con
        movimiento. Cada tipo tiene un tope por tanda, así una ráfaga no satura el grafo. */
    celebrate(acts) {
      if (!acts?.length || this.wrap.hidden || document.hidden || !this.nodes.size || reduceMotion()) return;
      const now = performance.now();
      const prHead = new Map([...(this.ctx?.prs?.values() || [])].map((p) => [p.number, p.head]));
      const count = {};
      const room = (kind, max) => (count[kind] = (count[kind] || 0) + 1) <= max;
      let delay = 0;
      for (const a of [...acts].sort((x, y) => x.time - y.time)) {
        const [head, base] = String(a.ref || '').split(' → ');
        const branch = a.branch || prHead.get(a.number) || null;
        switch (a.kind) {
          case 'pr-merge':
            if (room('comet', 4)) this.later((delay += 200), () => this.comet(head, base || a.branch));
            break;
          case 'pr-open':
            if (room('beacon', 4)) this.later((delay += 150), () => this.beacon(a.branch || head));
            break;
          case 'release':
            if (now - this.lastFireworks > 15000) {
              this.lastFireworks = now;
              this.later(delay, () => this.fireworks());
            }
            break;
          case 'star':
          case 'fork':
            if (room('star', 2)) this.later((delay += 400), () => this.shootingStar(a.kind === 'fork'));
            break;
          case 'force':
            this.alarm(branch, this.pal.bad, false);
            break;
          case 'review-ok':
            this.alarm(branch, this.pal.good, true);
            break;
          case 'review-changes':
            this.alarm(branch, this.pal.warn, false);
            break;
          case 'branch-delete':
          case 'branch-delete-unmerged':
            if (room('puff', 6)) this.puff(a.branch);
            break;
        }
      }
      this.requestDraw(false);
    }

    later(ms, fn) {
      if (this.pending.length < 40) this.pending.push({ at: performance.now() + ms, fn });
    }

    defaultName() {
      for (const h of this.heads.values()) if (h.data.isDefault) return h.data.name;
      return null;
    }

    /** Dónde está una rama en pantalla: su commit cabeza, o dónde se la vio por última vez si se
        acaba de borrar. Se pregunta en cada cuadro: los efectos siguen a la rama si se mueve. */
    branchAt(name) {
      const g = this.geo;
      if (!name || !g) return null;
      const h = this.heads.get(name);
      if (h) {
        const n = this.nodes.get(h.data.sha);
        return n?.px != null ? { x: n.px, y: n.py, w: h.w || 60, color: h.data.color } : null;
      }
      const d = this.gone.get(name);
      return d ? { x: g.tx + d.x * g.S, y: g.ty + TOP + d.row * g.lane + g.lane / 2, w: d.w, color: d.color } : null;
    }

    /** Chispa suelta, en pantalla. Las del grafo se mueven con él al desplazarlo; las del cielo (`sky`), no. */
    spark(x, y, col, o) {
      const g = this.geo || { tx: 0, ty: 0 };
      const s = { vx: 0, vy: 0, t: 0, life: 1, size: 1.5, drag: 2.8, g: 0, col, ...o };
      s.x = s.sky ? x : x - g.tx;
      s.y = s.sky ? y : y - g.ty;
      this.sparks.push(s);
    }

    burst(x, y, col, n, speed, o) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = speed * (0.35 + Math.random() * 0.65);
        this.spark(x, y, col, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ...o });
      }
    }

    /** Un punto de luz: halo del color y centro claro. */
    glowDot(c, x, y, r, col, a) {
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a));
      gr.addColorStop(1, rgba(col, 0));
      c.globalAlpha = 1;
      c.fillStyle = gr;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.globalAlpha = a;
      c.fillStyle = this.dark ? '#fff8ee' : col;
      c.beginPath();
      c.arc(x, y, Math.max(1.2, r * 0.22), 0, TAU);
      c.fill();
    }

    /** Onda que se abre sobre una rama (y la sigue si se mueve). */
    ripple(name, col, k = 1) {
      const t0 = performance.now();
      this.fx.push((now, c) => {
        const p = (now - t0) / 1300;
        const at = this.branchAt(name);
        if (p >= 1 || !at) return false;
        c.globalAlpha = (this.dark ? 0.9 : 0.75) * (1 - p) ** 1.5;
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(at.x, at.y, (5 + 30 * easeOut(p)) * k, 0, TAU);
        c.stroke();
        return true;
      });
    }

    /** PR fusionado: un cometa recorre la curva del merge, de la rama del PR a su base, y aterriza
        con una onda. Sin commit de merge (squash o rebase), cruza en arco desde la rama del PR, o
        desde fuera del grafo si ya no está. */
    comet(head, base) {
      const target = this.heads.has(base) ? base : this.defaultName();
      if (!target || !this.branchAt(target)) return;
      const src = this.branchAt(head);
      const col = this.colorHex(src && src.color !== 'ghost' ? src.color : this.heads.get(target).data.color);
      const route = () => {
        const to = this.branchAt(target);
        if (!to) return null;
        const tip = this.nodes.get(this.heads.get(target)?.data.sha);
        const parents = tip?.data.commit.parents || [];
        for (let i = 1; i < parents.length; i++) {
          const p = this.nodes.get(parents[i]);
          if (p?.px == null) continue;
          // si la rama del PR empieza muy atrás, el cometa sale desde el borde de la vista
          const x1 = Math.max(p.px, Math.min(tip.px - this.geo.S, this.padLeft - 20));
          return edgePoints('merge', x1, p.py, tip.px, tip.py, this.geo.S);
        }
        return arcPoints(this.branchAt(head) || { x: this.W + 40, y: TOP }, to, TOP + 4);
      };
      const t0 = performance.now();
      const DUR_C = 1400;
      let landed = false;
      this.fx.push((now, c) => {
        const pts = route();
        if (!pts) return false;
        const p = (now - t0) / DUR_C;
        const q = p < 1 ? 0 : (now - t0 - DUR_C) / 700; // la estela entra en la base y se apaga
        if (q >= 1) return false;
        const cum = measurePath(pts);
        const front = p < 1 ? 1 - (1 - p) ** 2 : 1; // sale disparado y frena al llegar
        if (p >= 1 && !landed) {
          landed = true;
          const [bx, by] = pts[pts.length - 1];
          this.burst(bx, by, col, 26, 140, { life: 0.7, size: 1.6, drag: 3 });
          this.ripple(target, col, 1.4);
        }
        if (p < 1) {
          // el camino, apenas marcado mientras viaja
          c.globalAlpha = 0.16;
          c.strokeStyle = col;
          c.lineWidth = 2;
          c.beginPath();
          pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
        }
        // la estela: de atrás hacia la cabeza, cada vez más gruesa y más opaca
        const len = 0.3 * (1 - q);
        const tail = front - len;
        let prev = pointAt(pts, cum, tail);
        c.strokeStyle = col;
        for (let j = 1; j <= 14; j++) {
          const f = j / 14;
          const pt = pointAt(pts, cum, tail + len * f);
          c.globalAlpha = f * (1 - q) * 0.95;
          c.lineWidth = 1 + 3.2 * f;
          c.beginPath();
          c.moveTo(prev[0], prev[1]);
          c.lineTo(pt[0], pt[1]);
          c.stroke();
          prev = pt;
        }
        if (p < 1) {
          this.glowDot(c, prev[0], prev[1], 11, col, 0.9);
          if (Math.random() < 0.6) this.spark(prev[0], prev[1], col, { vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.5, size: 1.2 });
        }
        return true;
      });
    }

    /** PR abierto: un haz de luz se levanta sobre la rama y la sigue si se mueve. */
    beacon(name) {
      const at0 = this.branchAt(name);
      if (!at0) return;
      const col = this.colorHex(at0.color);
      this.ripple(name, col);
      const t0 = performance.now();
      this.fx.push((now, c) => {
        const s = (now - t0) / 1000;
        const at = this.branchAt(name);
        if (s >= 3.4 || !at) return false;
        const h = (30 + this.geo.lane * 1.6) * easeOut(clamp(s / 0.6, 0, 1));
        const o = clamp(s / 0.25, 0, 1) * clamp((3.4 - s) / 0.9, 0, 1);
        const gr = c.createLinearGradient(0, at.y, 0, at.y - h);
        gr.addColorStop(0, rgba(col, (this.dark ? 0.7 : 0.5) * o));
        gr.addColorStop(1, rgba(col, 0));
        c.globalAlpha = 1;
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(at.x - 3, at.y);
        c.lineTo(at.x + 3, at.y);
        c.lineTo(at.x + 10, at.y - h);
        c.lineTo(at.x - 10, at.y - h);
        c.closePath();
        c.fill();
        this.glowDot(c, at.x, at.y - h * 0.92, 8 + 2 * Math.sin(s * 7), col, 0.75 * o);
        return true;
      });
    }

    /** Release publicado: fuegos artificiales sobre la rama por defecto. */
    fireworks() {
      const at = this.branchAt(this.defaultName());
      const cx = clamp(at ? at.x - 60 : (this.padLeft + this.W) / 2, this.padLeft + 70, this.W - 70);
      for (let i = 0; i < 4; i++) this.later(i * 420, () => this.rocket(cx + (Math.random() - 0.5) * 220));
    }

    /** Un cohete sube desde abajo y estalla en lo alto (al llegar arriba del todo, ver explode). */
    rocket(x) {
      const apex = TOP + (this.viewH - TOP) * (0.12 + Math.random() * 0.25);
      const g = 380;
      const v = Math.sqrt(2 * g * Math.max(40, this.viewH - apex));
      this.spark(x, this.viewH, this.pal.spark, {
        sky: true,
        vx: (Math.random() - 0.5) * 50,
        vy: -v,
        g,
        drag: 0,
        life: v / g,
        size: 1.6,
        trail: 0.045,
        boom: true,
      });
    }

    /** El cohete estalla en chispas de dos colores de la paleta, que caen y titilan. */
    explode(s) {
      const pick = () => this.colorHex('c' + (1 + Math.floor(Math.random() * 8)));
      const cols = [pick(), pick()];
      const size = clamp((this.viewH - TOP) / 380, 0.7, 1.3); // más grandes cuanto más alto es el panel
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * TAU;
        const sp = (120 + Math.random() * 130) * size; // con mucho freno: se abren en esfera y quedan flotando
        this.spark(s.x, s.y, cols[i % 2], {
          sky: true,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          g: 45,
          drag: 2.3,
          life: 1.3 + Math.random() * 0.8,
          size: 1.6 + Math.random(),
          twinkle: Math.random() * 10,
        });
      }
      this.spark(s.x, s.y, this.dark ? '#fff1dc' : cols[0], { sky: true, glow: true, life: 0.35, size: 28, drag: 0 }); // el fogonazo
    }

    /** Estrella o fork nuevos: una estrella fugaz cruza la parte alta del grafo. */
    shootingStar(fork) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const span = this.W - this.padLeft;
      const x = side > 0 ? this.padLeft + span * (0.05 + Math.random() * 0.2) : this.W - span * (0.05 + Math.random() * 0.2);
      const y = TOP + (this.viewH - TOP) * (0.04 + Math.random() * 0.2);
      const col = fork ? this.colorHex('c2') : this.pal.spark;
      this.spark(x, y, col, { sky: true, vx: side * span * 0.85, vy: (this.viewH - TOP) * 0.22, life: 1.1, size: 2, drag: 0, trail: 0.09, streak: true });
    }

    /** Revisión o force-push: dos ondas del color del estado sobre la rama (y chispas si es una aprobación). */
    alarm(name, col, cheer) {
      const at = this.branchAt(name);
      if (!at) return;
      this.ripple(name, col);
      this.later(180, () => this.ripple(name, col, 0.7));
      if (!cheer) return;
      for (let i = 0; i < 14; i++)
        this.spark(at.x, at.y, col, {
          vx: (Math.random() - 0.5) * 120,
          vy: -40 - Math.random() * 110,
          g: 140,
          drag: 1.2,
          life: 0.8 + Math.random() * 0.4,
          size: 1.6,
        });
    }

    /** Rama borrada: su etiqueta se deshace en polvo de su color que sube despacio. */
    puff(name) {
      const at = this.branchAt(name);
      if (!at) return;
      const col = this.colorHex(at.color);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * TAU;
        const sp = 8 + Math.random() * 40;
        this.spark(at.x + 11 + Math.random() * at.w, at.y + (Math.random() - 0.5) * 14, col, {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 12,
          g: -26,
          drag: 1.1,
          life: 1.3 + Math.random() * 0.9,
          size: 1.2 + Math.random() * 1.1,
        });
      }
    }

    /** Un cuadro de efectos (solo mientras hay alguno; al terminar, la capa queda vacía). */
    drawFx(now) {
      for (let i = this.pending.length - 1; i >= 0; i--) if (now >= this.pending[i].at) this.pending.splice(i, 1)[0].fn();
      const c = this.fxCtx;
      if (!this.fx.length && !this.sparks.length) {
        if (this.fxPainted) {
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.clearRect(0, 0, this.fxCv.width, this.fxCv.height);
          this.fxPainted = false;
        }
        this.fxLast = 0;
        return this.pending.length > 0;
      }
      const dt = this.fxLast ? Math.min(0.05, (now - this.fxLast) / 1000) : 1 / 60;
      this.fxLast = now;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.W, this.H);
      this.fxPainted = true;
      c.save();
      c.beginPath();
      c.rect(this.padLeft - 6, 0, this.W, this.viewH); // nada sobre la leyenda ni el minimapa
      c.clip();
      c.globalCompositeOperation = this.dark ? 'lighter' : 'source-over';
      c.lineCap = 'round';
      for (let i = this.fx.length - 1; i >= 0; i--) if (!this.fx[i](now, c)) this.fx.splice(i, 1);
      this.stepSparks(c, dt);
      c.restore();
      return true;
    }

    stepSparks(c, dt) {
      const g = this.geo || { tx: 0, ty: 0 };
      const list = this.sparks;
      if (list.length > 900) list.splice(0, list.length - 900);
      // hacia atrás: lo que se agrega en el cuadro (un estallido) se mueve desde el siguiente
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        s.t += dt;
        if (s.t >= s.life) {
          list[i] = list[list.length - 1]; // el orden no importa: se quita sin desplazar
          list.pop();
          if (s.boom) this.explode(s);
          continue;
        }
        if (s.g) s.vy += s.g * dt;
        if (s.drag) {
          const k = Math.exp(-s.drag * dt);
          s.vx *= k;
          s.vy *= k;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const x = s.sky ? s.x : s.x + g.tx;
        const y = s.sky ? s.y : s.y + g.ty;
        const p = s.t / s.life;
        let a = s.boom ? 1 : (1 - p) ** 1.4;
        if (s.twinkle) a *= 0.55 + 0.45 * Math.sin(s.t * 22 + s.twinkle);
        if (s.glow) {
          this.glowDot(c, x, y, s.size * (0.6 + 0.4 * p), s.col, a * 0.8);
          continue;
        }
        if (s.trail) {
          const bx = x - s.vx * s.trail;
          const by = y - s.vy * s.trail;
          if (s.streak) {
            const gr = c.createLinearGradient(bx, by, x, y);
            gr.addColorStop(0, rgba(s.col, 0));
            gr.addColorStop(1, rgba(s.col, a));
            c.strokeStyle = gr;
            c.globalAlpha = 1;
          } else {
            c.strokeStyle = s.col;
            c.globalAlpha = a;
          }
          c.lineWidth = s.size;
          c.beginPath();
          c.moveTo(bx, by);
          c.lineTo(x, y);
          c.stroke();
          if (s.streak) this.glowDot(c, x, y, 6, s.col, a * 0.8);
          continue;
        }
        c.globalAlpha = a;
        c.fillStyle = s.col;
        c.beginPath();
        c.arc(x, y, s.size * (1 - p * 0.4), 0, TAU);
        c.fill();
      }
    }

    /* ---------- tooltip ---------- */

    showTip(sha, pin, branchName) {
      const it = this.nodes.get(sha);
      if (!it) return;
      this.tip.innerHTML = tipHTML(it.data, this.ctx || {}, { pin, branchName, ghostNames: this.ghostNames });
      this.tip.hidden = false;
      this.tip.classList.toggle('pinned', !!pin);
      this.tipSha = sha;
      if (pin) this.pinned = { sha };
      this.placeTip();
    }

    placeTip() {
      const it = this.nodes.get(this.tipSha);
      if (!it) return this.hideTip();
      const w = this.tip.offsetWidth;
      const h = this.tip.offsetHeight;
      let left = it.px + 16;
      let top = it.py - h - 12;
      if (left + w > this.W - 8) left = it.px - w - 16;
      if (left < 8) left = clamp(it.px - w / 2, 8, Math.max(8, this.W - w - 8));
      if (top < 8) top = it.py + 16;
      this.tip.style.transform = `translate(${Math.round(left)}px,${Math.round(clamp(top, 8, Math.max(8, this.H - h - 8)))}px)`;
    }

    hideTip() {
      this.tip.hidden = true;
      this.tipSha = null;
    }

    unpin() {
      this.pinned = null;
      this.hideTip();
    }

    clear() {
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend, this.ghostLabels]) for (const it of m.values()) it.el?.remove();
      for (const d of this.days.values()) (d.line.remove(), d.label.remove());
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend, this.ghostLabels, this.days, this.byChain, this.gone]) m.clear();
      this.fx = [];
      this.sparks = [];
      this.pending = [];
      this.miniDirty = true;
      this.bands.forEach((b) => b.remove());
      this.bands = [];
      this.hlChain = null;
      this.svg.classList.remove('dimmed');
      this.layout = null;
      this.maxX = 0;
      this.rowCount = 0;
      this.unpin();
      this.following = true;
      this.opts.onFollowChange?.(true);
      this.t = d3.zoomIdentity.translate(this.padLeft, 0);
      this.svg.__zoom = this.t;
      this.requestDraw();
    }
  }

  GB.Graph = Graph;
  GB.graphShared = { tipHTML, wirePinButton, measure, fitText, LABEL_FONT, SMALL_FONT };
})(window.GB);
