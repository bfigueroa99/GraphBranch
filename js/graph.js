/* GraphBranch — render del grafo en SVG.
   Zoom semántico: el zoom estira solo el eje del tiempo (X); los nodos y el
   texto mantienen su tamaño. Rueda = desplazar, Ctrl/⌘ + rueda o pellizco = zoom.
   Cada elemento anima desde su posición actual a la nueva en cada actualización. */
(function (GB) {
  'use strict';
  const { U } = GB;
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

  const CI_LABEL = { running: 'CI en curso', ok: 'CI aprobado', fail: 'CI falló', cancel: 'CI cancelado' };

  /** Contenido del detalle de un commit (lo usan las vistas 2D y 3D). */
  function tipHTML(node, ctx, { pin = false, branchName = null, ghostNames = null } = {}) {
    const c = node.commit;
    const heads = node.heads;
    const parents = c.parents.length;
    const rows = [];
    if (heads.length) rows.push(`<span class="tip-refs">${heads.map((h) => `<code>${U.esc(h)}</code>`).join(' ')}</span>`);
    if (node.chain.startsWith('g:')) {
      const gname = ghostNames?.get(node.chain);
      rows.push(`<span>${gname ? `De la rama <code>${U.esc(gname)}</code>, ya fusionada y eliminada` : 'De una rama ya fusionada y eliminada'}</span>`);
    }
    const branch = branchName || heads[0];
    if (branch) {
      const pr = ctx.prs?.get(branch);
      const ci = ctx.ci?.get(branch);
      if (pr) rows.push(`<span>PR #${pr.number}${pr.draft ? ' (borrador)' : ''} → <code>${U.esc(pr.base)}</code>${pr.url ? ` · <a href="${U.esc(pr.url)}" target="_blank" rel="noopener">ver PR</a>` : ''}</span>`);
      if (ci) rows.push(`<span class="tip-ci ci-${ci.state}">${CI_LABEL[ci.state]}${ci.name ? ` · ${U.esc(ci.name)}` : ''}${ci.url ? ` · <a href="${U.esc(ci.url)}" target="_blank" rel="noopener">ver ejecución</a>` : ''}</span>`);
    }
    return `
      <div class="tip-head">${U.avatarHTML(c.author, 22)}<span class="tip-author">${U.esc(c.author.name)}</span><span class="tip-time" title="${U.esc(U.fmtDateTime(c.date))}">${U.timeAgo(c.date)}</span></div>
      <p class="tip-msg">${U.esc(U.firstLine(c.message))}</p>
      <p class="tip-meta"><code>${U.shortSha(c.sha)}</code>${parents > 1 ? ` · merge de ${parents} padres` : ''}</p>
      ${rows.length ? `<p class="tip-extra">${rows.join('')}</p>` : ''}
      ${pin && (c.url || (branch && ctx.canPin)) ? `<div class="tip-actions">
        ${c.url ? `<a class="tip-link" href="${U.esc(c.url)}" target="_blank" rel="noopener">Abrir commit en GitHub ↗</a>` : ''}
        ${branch && ctx.canPin ? pinButtonHTML(branch, !!ctx.pins?.has(branch)) : ''}
      </div>` : ''}`;
  }

  function pinButtonHTML(branch, on) {
    return `<button type="button" class="tip-pin" data-branch="${U.esc(branch)}" aria-pressed="${on}">${on ? 'Dejar de fijar' : 'Fijar'} <code>${U.esc(U.truncate(branch, 28))}</code></button>`;
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

  class Graph {
    constructor(wrap, opts = {}) {
      this.wrap = wrap;
      this.opts = opts;
      this.svg = mk('svg', { class: 'graph-svg', 'aria-label': 'Grafo de ramas y commits' }, wrap);
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
      this.tip.setAttribute('aria-label', 'Detalle del commit');
      wrap.appendChild(this.tip);

      this.nodes = new Map();
      this.edges = new Map();
      this.heads = new Map();
      this.pointers = new Map();
      this.legend = new Map();
      this.days = new Map();
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

      new ResizeObserver(() => this.resize()).observe(wrap);
      document.fonts?.ready.then(() => this.relabel());
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

    cur(it, now) {
      if (it.t0 <= 0) return { x: it.to.x, row: it.to.row, moving: false };
      const p = clamp((now - it.t0) / DUR, 0, 1);
      if (p >= 1) {
        it.t0 = 0;
        return { x: it.to.x, row: it.to.row, moving: false };
      }
      const e = ease(p);
      return { x: it.from.x + (it.to.x - it.from.x) * e, row: it.from.row + (it.to.row - it.from.row) * e, moving: true };
    }

    retarget(it, x, row, now, animate) {
      const c = this.cur(it, now);
      if (Math.abs(c.x - x) < 1e-6 && Math.abs(c.row - row) < 1e-6) return false;
      it.from = { x: c.x, row: c.row };
      it.to = { x, row };
      it.t0 = animate ? now : 0;
      return true;
    }

    exit(el) {
      el.classList.add('exit');
      el.style.pointerEvents = 'none';
      setTimeout(() => el.remove(), 450);
    }

    /* ---------- actualización de datos ---------- */

    /**
     * @param L     resultado de Layout.compute
     * @param ctx   { initial, ci: Map rama->estado, prs: Map rama->PR, repoUrl }
     */
    update(L, ctx = {}) {
      const now = performance.now();
      const animate = !ctx.initial && !reduceMotion();
      const fx = !ctx.initial && !reduceMotion();
      this.layout = L;
      this.ctx = ctx;
      this.maxX = L.maxX;
      this.rowCount = L.rows.length;
      this.fitLanes(animate);
      this.ghostNames = new Map(L.ghostLabels.map((g) => [g.id, g.name]));

      /* nodos */
      const seen = new Set();
      for (const n of L.nodes) {
        seen.add(n.sha);
        let it = this.nodes.get(n.sha);
        if (!it) {
          it = { el: this.makeNode(n), from: { x: n.x, row: n.row }, to: { x: n.x, row: n.row }, t0: 0 };
          this.nodes.set(n.sha, it);
          if (fx) {
            it.el.classList.add('enter');
            setTimeout(() => it.el.classList.remove('enter'), 900);
            this.ripple(it);
          }
        } else this.retarget(it, n.x, n.row, now, animate);
        it.data = n;
        it.el.setAttribute('class', `node ${n.color}${n.merge ? ' merge' : ''}${n.heads.length ? ' is-head' : ''}${it.el.classList.contains('enter') ? ' enter' : ''}`);
        it.el.dataset.chain = n.chain;
      }
      for (const [id, it] of this.nodes) if (!seen.has(id)) (this.exit(it.el), this.nodes.delete(id));

      /* aristas */
      const seenE = new Set();
      for (const e of L.edges) {
        seenE.add(e.id);
        let it = this.edges.get(e.id);
        if (!it) {
          it = { el: mk('path', e.kind === 'stub' ? null : { pathLength: 1 }, this.gEdges) };
          this.edges.set(e.id, it);
          if (fx && e.kind !== 'stub') {
            it.el.classList.add('enter');
            setTimeout(() => it.el.classList.remove('enter'), 900);
          }
        }
        it.data = e;
        it.el.setAttribute('class', `edge ${e.kind} ${e.color}${it.el.classList.contains('enter') ? ' enter' : ''}`);
        it.el.dataset.chain = e.chain;
      }
      for (const [id, it] of this.edges) if (!seenE.has(id)) (this.exit(it.el), this.edges.delete(id));

      /* cabezas de rama */
      const seenH = new Set();
      for (const h of L.heads) {
        seenH.add(h.name);
        let it = this.heads.get(h.name);
        const isNew = !it;
        if (!it) {
          const el = mk('g', { class: 'head', tabindex: 0, role: 'button' }, this.gHeads);
          it = { el, from: { x: h.x, row: h.row }, to: { x: h.x, row: h.row }, t0: 0 };
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.showTip(it.data.sha, true, it.data.name);
          });
          el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              this.showTip(it.data.sha, true, it.data.name);
            }
          });
          el.addEventListener('pointerenter', () => this.highlight(it.data.chain));
          el.addEventListener('pointerleave', () => this.highlight(null));
          this.heads.set(h.name, it);
          if (fx) el.classList.add('enter');
        } else {
          const moved = this.retarget(it, h.x, h.row, now, animate);
          if (moved && fx && it.data.sha !== h.sha) this.flash(it.el, 'moved', 2600);
        }
        it.data = h;
        this.buildHead(it, h, ctx);
        if (isNew && fx) this.flash(it.el, 'moved', 2600);

        let p = this.pointers.get(h.name);
        if (!h.own) {
          if (!p) {
            p = { el: mk('path', { class: 'pointer' }, this.gPointers) };
            this.pointers.set(h.name, p);
          }
          p.el.setAttribute('class', `pointer ${h.color}`);
          p.el.dataset.chain = h.chain;
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
          const el = mk('g', { class: 'legend-item' }, this.gLegend);
          it = { el, from: { x: 0, row: r.row }, to: { x: 0, row: r.row }, t0: 0 };
          el.addEventListener('pointerenter', () => it.data.chain && this.highlight(it.data.chain));
          el.addEventListener('pointerleave', () => this.highlight(null));
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!it.data.ghost) this.focusBranch(it.data.name);
          });
          this.legend.set(r.id, it);
        } else this.retarget(it, 0, r.row, now, animate);
        it.data = r;
        this.buildLegend(it, r);
      }
      for (const [id, it] of this.legend) if (!seenL.has(id)) (this.exit(it.el), this.legend.delete(id));

      /* bandas de fondo por fila */
      while (this.bands.length < this.rowCount) this.bands.push(mk('rect', { class: 'band' }, this.gBands));
      while (this.bands.length > this.rowCount) this.bands.pop().remove();
      this.bands.forEach((b, i) => b.setAttribute('class', i % 2 ? 'band odd' : 'band'));

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
        it.label.textContent = this.dayText(d.time);
      }
      for (const [id, it] of this.days) if (!seenD.has(id)) (it.line.remove(), it.label.remove(), this.days.delete(id));

      if (this.pinned && !this.nodes.has(this.pinned.sha)) this.unpin();

      if (ctx.initial) {
        this.sel.call(this.zoom.transform, this.followTarget());
      } else if (this.following) this.follow(!reduceMotion());
      else this.sel.call(this.zoom.transform, this.constrain(this.t));
      this.requestDraw();
    }

    dayText(ms) {
      const today = U.dayKey(Date.now());
      const yest = U.dayKey(Date.now() - 864e5);
      const k = U.dayKey(ms);
      if (k === today) return 'hoy';
      if (k === yest) return 'ayer';
      return new Date(ms).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    makeNode(n) {
      const g = mk('g', { class: 'node' }, this.gNodes);
      mk('circle', { class: 'halo', r: 10 }, g);
      mk('circle', { class: 'dot', r: 4.5 }, g);
      mk('circle', { class: 'hit', r: 12 }, g);
      g.addEventListener('pointerenter', () => {
        if (!this.pinned) this.showTip(g.__sha, false);
      });
      g.addEventListener('pointerleave', () => {
        if (!this.pinned) this.hideTip();
      });
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.showTip(g.__sha, true);
      });
      g.__sha = n.sha;
      return g;
    }

    ripple(it) {
      const c = mk('circle', { class: 'ripple', r: 5 }, it.el);
      setTimeout(() => c.remove(), 1700);
    }

    flash(el, cls, ms) {
      el.classList.remove(cls);
      void el.getBBox?.();
      el.classList.add(cls);
      clearTimeout(el['__t' + cls]);
      el['__t' + cls] = setTimeout(() => el.classList.remove(cls), ms);
    }

    buildHead(it, h, ctx) {
      const g = it.el;
      const keep = g.classList.contains('moved') ? ' moved' : '';
      const enter = g.classList.contains('enter') ? ' enter' : '';
      g.setAttribute('class', `head ${h.color}${h.isDefault ? ' default' : ''}${h.own ? '' : ' pointer-head'}${keep}${enter}`);
      g.dataset.chain = h.chain;
      g.textContent = '';
      const ci = ctx.ci?.get(h.name);
      const pr = ctx.prs?.get(h.name);
      const bg = mk('rect', { class: 'h-bg', x: 0, y: -11, height: 22, rx: 11 }, g);
      mk('circle', { class: 'h-dot', cx: 11, cy: 0, r: 3.5 }, g);
      let x = 20;
      const name = fitText(h.name, LABEL_FONT, 210);
      const t = mk('text', { class: 'h-name', x, y: 0, dy: '0.35em' }, g);
      t.textContent = name;
      x += measure(name, LABEL_FONT) + 8;
      const aria = [`Rama ${h.name}${h.isDefault ? ' (por defecto)' : ''}`];
      if (ci) {
        const ig = mk('g', { class: `h-ci ci-${ci.state}`, transform: `translate(${x + 6},0)` }, g);
        mk('title', null, ig).textContent = CI_LABEL[ci.state];
        if (ci.state === 'running') mk('circle', { class: 'spin', r: 4.5 }, ig);
        else if (ci.state === 'ok') mk('path', { d: 'M-4,0.2L-1.3,2.9L4,-2.6' }, ig);
        else if (ci.state === 'fail') mk('path', { d: 'M-3.4,-3.4L3.4,3.4M3.4,-3.4L-3.4,3.4' }, ig);
        else mk('path', { d: 'M-3.6,0H3.6' }, ig);
        x += 18;
        aria.push(CI_LABEL[ci.state]);
      }
      if (ctx.pins?.has(h.name)) {
        const pg = mk('g', { class: 'h-pin', transform: `translate(${x + 4},0)` }, g);
        mk('path', { d: 'M0,-4L4,0L0,4L-4,0Z' }, pg);
        mk('title', null, pg).textContent = 'Rama fijada';
        x += 13;
        aria.push('fijada');
      }
      if (pr) {
        const label = `#${pr.number}`;
        const pt = mk('text', { class: `h-pr${pr.draft ? ' draft' : ''}`, x, y: 0, dy: '0.35em' }, g);
        pt.textContent = label;
        x += measure(label, SMALL_FONT) + 8;
        aria.push(`PR #${pr.number}${pr.draft ? ' borrador' : ''} hacia ${pr.base}`);
      }
      bg.setAttribute('width', Math.round(x + 2));
      g.setAttribute('aria-label', aria.join(', '));
      it.w = x + 2;
    }

    buildLegend(it, r) {
      const g = it.el;
      g.setAttribute('class', `legend-item ${r.color}${r.ghost ? ' ghost-row' : ''}`);
      g.textContent = '';
      mk('rect', { class: 'l-bg', x: 0, y: -10, height: 20, rx: 10, width: this.legendW }, g);
      mk('circle', { class: 'l-dot', cx: 10, cy: 0, r: 3.5 }, g);
      const t = mk('text', { class: 'l-name', x: 19, y: 0, dy: '0.35em' }, g);
      t.textContent = fitText(r.name, SMALL_FONT, this.legendW - 26);
      if (!r.ghost) mk('title', null, g).textContent = r.name;
    }

    relabel() {
      if (!this.layout) return;
      for (const it of this.heads.values()) this.buildHead(it, it.data, this.ctx || {});
      for (const it of this.legend.values()) this.buildLegend(it, it.data);
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
      const show = (it, vis) => {
        if (it.vis === vis) return;
        it.vis = vis;
        it.el.style.display = vis ? '' : 'none';
      };
      for (const it of this.nodes.values()) {
        const c = this.cur(it, now);
        if (c.moving) active = true;
        it.px = X(c.x);
        it.py = Y(c.row);
        const vis = it.px > -M && it.px < this.W + M && it.py > -M && it.py < this.H + M;
        show(it, vis);
        if (vis) it.el.setAttribute('transform', `translate(${r1(it.px)},${r1(it.py)})`);
      }

      for (const it of this.edges.values()) {
        const e = it.data;
        const b = this.nodes.get(e.to);
        if (!b) continue;
        if (e.kind === 'stub') {
          show(it, b.vis);
          if (b.vis) it.el.setAttribute('d', `M${r1(b.px)},${r1(b.py)}h${-r1(Math.min(S * 0.85, 24))}`);
          continue;
        }
        const a = this.nodes.get(e.from);
        if (!a) continue;
        const vis =
          Math.max(a.px, b.px) > -M && Math.min(a.px, b.px) < this.W + M && Math.max(a.py, b.py) > -M && Math.min(a.py, b.py) < this.H + M;
        show(it, vis);
        if (vis) it.el.setAttribute('d', edgePath(e.kind, a.px, a.py, b.px, b.py, S));
      }

      for (const [name, it] of this.heads) {
        const c = this.cur(it, now);
        if (c.moving) active = true;
        const hx = X(c.x);
        const hy = Y(c.row);
        let lx = hx + 11;
        if (!it.data.own) {
          const node = this.nodes.get(it.data.sha);
          lx = hx + Math.max(16, S * 0.8);
          const p = this.pointers.get(name);
          if (node && p) {
            const x1 = node.px;
            const y1 = node.py;
            p.el.setAttribute(
              'd',
              Math.abs(y1 - hy) < 0.5
                ? `M${r1(x1)},${r1(y1)}L${r1(lx)},${r1(hy)}`
                : `M${r1(x1)},${r1(y1)}C${r1(x1 + (lx - x1) * 0.7)},${r1(y1)} ${r1(x1 + (lx - x1) * 0.2)},${r1(hy)} ${r1(lx)},${r1(hy)}`,
            );
          }
        }
        it.lx = lx;
        it.ly = hy;
        // bajo la leyenda no se dibuja: la leyenda ya nombra la fila y lleva a la rama
        const vis = lx > this.padLeft - 4 && lx < this.W + M && hy > -M && hy < this.H + M;
        show(it, vis);
        const p = this.pointers.get(name);
        if (p) show(p, vis);
        if (vis) it.el.setAttribute('transform', `translate(${r1(lx)},${r1(hy)})`);
      }

      this.legendBg.setAttribute('width', this.padLeft - 8);
      this.legendBg.setAttribute('height', this.H);
      for (const it of this.legend.values()) {
        const c = this.cur(it, now);
        if (c.moving) active = true;
        it.el.setAttribute('transform', `translate(8,${r1(Y(c.row))})`);
      }

      this.bands.forEach((b, i) => {
        b.setAttribute('x', 0);
        b.setAttribute('width', this.W);
        b.setAttribute('y', r1(t.y + TOP + i * lane));
        b.setAttribute('height', r1(lane));
      });

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
        const w = measure(d.label.textContent, SMALL_FONT);
        let lx = x + 6;
        if (x <= this.padLeft) {
          lx = this.padLeft + 6;
          if (stuck) {
            d.label.style.display = 'none';
            continue;
          }
          stuck = true;
        }
        const ok = lx + w < minLeft;
        d.label.setAttribute('x', r1(lx));
        d.label.style.display = ok ? '' : 'none';
        if (ok) minLeft = lx - 12;
      }

      if (this.tipSha && !this.tip.hidden) this.placeTip();
      return active;
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
        const c = mk('circle', { class: 'ripple focus', r: 6 }, it.el);
        setTimeout(() => c.remove(), 1700);
      }
      return true;
    }

    focusBranch(name) {
      const h = this.heads.get(name);
      if (!h) return false;
      this.focusSha(h.data.sha);
      this.flash(h.el, 'moved', 1800);
      return true;
    }

    hasBranch(name) {
      return this.heads.has(name);
    }

    highlight(chain) {
      this.svg.classList.toggle('dimmed', !!chain);
      const all = [this.nodes, this.edges, this.heads, this.pointers, this.legend];
      for (const m of all) for (const it of m.values()) it.el.classList.toggle('hl', !!chain && it.el.dataset.chain === chain);
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
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend])
        for (const it of m.values()) it.el.remove();
      for (const d of this.days.values()) (d.line.remove(), d.label.remove());
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.legend, this.days]) m.clear();
      this.bands.forEach((b) => b.remove());
      this.bands = [];
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
  GB.graphShared = { tipHTML, wirePinButton, CI_LABEL, measure, fitText, LABEL_FONT, SMALL_FONT };
})(window.GB);
