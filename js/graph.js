/* GraphBranch — render del grafo en SVG.
   Zoom semántico: el zoom estira solo el eje del tiempo (X); los nodos y el
   texto mantienen su tamaño. Rueda = desplazar, Ctrl/⌘ + rueda o pellizco = zoom.
   Cada elemento anima desde su posición actual a la nueva en cada actualización. */
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
  const LABEL_FONT = '500 12px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  const SMALL_FONT = '500 11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

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

  function pinButtonHTML(branch, on) {
    return `<button type="button" class="tip-pin" data-branch="${U.esc(branch)}" aria-pressed="${on}">${i18n.html(on ? 'tip.unpin' : 'tip.pin', { branch: U.truncate(branch, 28) })}</button>`;
  }

  /** Conecta el botón "Fijar" de un tooltip con la acción de la app. */
  function wirePinButton(tip, onTogglePin) {
    tip.addEventListener('click', (ev) => {
      const b = ev.target.closest('.tip-pin');
      if (!b) return;
      const on = !!onTogglePin?.(b.dataset.branch);
      b.outerHTML = pinButtonHTML(b.dataset.branch, on);
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
      this.gPointers = mk('g', { class: 'pointers' }, this.svg);
      this.gNodes = mk('g', { class: 'nodes' }, this.svg);
      this.gHeads = mk('g', { class: 'heads' }, this.svg);
      this.gLegend = mk('g', { class: 'legend' }, this.svg);
      this.legendBg = mk('rect', { class: 'legend-bg', x: 0, y: 0 }, this.gLegend);
      this.gAxis = mk('g', { class: 'axis' }, this.svg);
      this.axisBg = mk('rect', { class: 'axis-bg', x: 0, y: 0, height: TOP - 6 }, this.gAxis);

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
      this.byChain = new Map(); // cadena -> elementos, para resaltar una rama sin recorrer todo
      this.hlChain = null;
      this.bands = [];
      this.maxX = 0;
      this.rowCount = 0;
      this.following = true;
      this.pinned = null;
      this.W = wrap.clientWidth || 800;
      this.H = wrap.clientHeight || 400;
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
          const vertical = this.contentH() > this.H && Math.abs(dy) > Math.abs(dx) * 1.2 && ev.altKey;
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
      this.wrap.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') this.unpin();
      });
      wirePinButton(this.tip, (name) => this.opts.onTogglePin?.(name));
      this.bindGroups();

      new ResizeObserver(() => this.resize()).observe(wrap);
      document.fonts?.ready.then(() => this.relabel());
    }

    /** Un oyente por grupo (commits, etiquetas, leyenda) en vez de uno por elemento. */
    bindGroups() {
      const within = (ev, sel) => {
        const el = ev.target.closest?.(sel);
        return el && !el.contains(ev.relatedTarget) ? el : null; // entrar o salir de verdad, no pasar de un hijo a otro
      };
      this.gNodes.addEventListener('pointerover', (ev) => {
        const g = within(ev, '.node');
        if (g && !this.pinned) this.showTip(g.__sha, false);
      });
      this.gNodes.addEventListener('pointerout', (ev) => {
        if (within(ev, '.node') && !this.pinned) this.hideTip();
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
    }

    contentH() {
      return TOP + this.rowCount * this.lane.to + 14;
    }

    /** Alto de carril: se estira para llenar el panel cuando hay pocas ramas. */
    fitLanes(animate) {
      const target = clamp(Math.floor((this.H - TOP - 18) / Math.max(1, this.rowCount)), LANE_MIN, LANE_MAX);
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
      y = ch <= this.H ? 0 : clamp(y, this.H - ch, 0);
      return d3.zoomIdentity.translate(x, y).scale(k);
    }

    resize() {
      const W = this.wrap.clientWidth;
      const H = this.wrap.clientHeight;
      if (!W || !H || (W === this.W && H === this.H)) return;
      this.W = W;
      this.H = H;
      this.metrics();
      this.fitLanes(false);
      this.svg.setAttribute('width', W);
      this.svg.setAttribute('height', H);
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
      for (const [name, it] of this.heads) {
        if (seenH.has(name)) continue;
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
      const key = `${r.name}\n${r.ghost}\n${this.legendW}`;
      if (it.key === key) return;
      it.key = key;
      g.textContent = '';
      mk('rect', { class: 'l-bg', x: 0, y: -10, height: 20, rx: 10, width: this.legendW }, g);
      mk('circle', { class: 'l-dot', cx: 10, cy: 0, r: 3.5 }, g);
      const t = mk('text', { class: 'l-name', x: 19, y: 0, dy: '0.35em' }, g);
      t.textContent = fitText(r.name, SMALL_FONT, this.legendW - 26);
      if (!r.ghost) mk('title', null, g).textContent = r.name;
    }

    /** Cambio de idioma: etiquetas accesibles, días del eje y rótulos de las ramas. */
    relocalize() {
      this.svg.setAttribute('aria-label', tr('graph.aria2d'));
      this.tip.setAttribute('aria-label', tr('tip.aria'));
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
      this.requestDraw();
    }

    /* ---------- dibujo por cuadro ---------- */

    requestDraw() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        if (this.draw(performance.now())) this.requestDraw();
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

      // solo se tocan en el DOM los elementos que caen dentro (o cerca) de la vista
      const M = 40;
      for (const it of this.nodes.values()) {
        if (this.step(it, now)) active = true;
        it.px = X(it.cx);
        it.py = Y(it.cr);
        const vis = it.px > -M && it.px < this.W + M && it.py > -M && it.py < this.H + M;
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
        const vis =
          Math.max(a.px, b.px) > -M && Math.min(a.px, b.px) < this.W + M && Math.max(a.py, b.py) > -M && Math.min(a.py, b.py) < this.H + M;
        this.show(it, vis, this.makeEdge);
        if (vis) it.el.setAttribute('d', edgePath(e.kind, a.px, a.py, b.px, b.py, S));
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
        const vis = lx > this.padLeft - 4 && lx < this.W + M && hy > -M && hy < this.H + M;
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
        const vis = y > -M && y < this.H + M;
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
        d.line.setAttribute('y2', this.H);
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
      const last = Math.min(this.rowCount - 1, Math.ceil((this.H - ty - TOP) / lane));
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
      if (rowY + y < TOP + 12 || rowY + y > this.H - 24) y = this.H / 2 - rowY;
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
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend]) for (const it of m.values()) it.el?.remove();
      for (const d of this.days.values()) (d.line.remove(), d.label.remove());
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend, this.days, this.byChain]) m.clear();
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
