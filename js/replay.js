/* GraphBranch — modo Replay: la historia del repo como time-lapse, al estilo de Gource.
   Toma una foto de lo que ya está cargado (sin consultas extra a GitHub) y la reproduce desde el
   commit más antiguo: los commits llegan en orden, las ramas nacen, crecen y se fusionan (las ya
   borradas reaparecen mientras existieron, con el nombre que dejó su merge), una fecha grande
   marca el tiempo y unos rótulos cuentan los hitos. Los periodos sin actividad se comprimen, así
   que la historia entera dura menos de un minuto a velocidad normal. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const { t } = i18n;
  const M = i18n.msg;
  const DURATION = 45; // segundos que dura toda la historia a 1×
  const SPEEDS = [0.5, 1, 2, 4];
  const UPDATE_MS = 90; // cada cuánto se recalcula el grafo al reproducir (la fecha corre a cada cuadro)
  const CAPTION_MS = 2600;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Primer elemento de `list` (índices decrecientes) con índice menor que k. Búsqueda binaria. */
  function firstBelow(list, idx, k) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (idx.get(list[mid]) < k) hi = mid;
      else lo = mid + 1;
    }
    return list[lo] || null;
  }

  /** Cantidad de valores de `arr` (creciente) menores o iguales a v. */
  function countUpTo(arr, v) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** "Título (#12)" → { num: 12, title: 'Título' }: así quedan los PR fusionados con squash. */
  const squashOf = (line) => {
    const m = /^(.*\S)\s*\(#(\d+)\)\s*$/.exec(line);
    return m ? { num: Number(m[2]), title: m[1] } : null;
  };

  class Replay {
    constructor({ root, onFrame, onExit, onState, onEnd }) {
      this.root = root;
      this.onFrame = onFrame;
      this.onExit = onExit;
      this.onState = onState;
      this.onEnd = onEnd;
      this.active = false;
      this.playing = false;
      this.speedIdx = 1;
      this.el = {
        date: root.querySelector('.rp-date'),
        time: root.querySelector('.rp-time'),
        caption: root.querySelector('.rp-caption'),
        play: root.querySelector('.rp-play'),
        range: root.querySelector('.rp-range'),
        marks: root.querySelector('.rp-marks'),
        speed: root.querySelector('.rp-speed'),
        exit: root.querySelector('.rp-exit'),
      };
      this.tick = this.tick.bind(this);
      this.el.play.addEventListener('click', () => this.toggle());
      this.el.speed.addEventListener('click', () => this.setSpeed((this.speedIdx + 1) % SPEEDS.length));
      this.el.exit.addEventListener('click', () => this.stop());
      // arrastrar la línea de tiempo salta a ese momento (sin animar cada commit intermedio)
      this.el.range.addEventListener('input', () => {
        this.u = (Number(this.el.range.value) / 1000) * this.U;
        this.seek(true);
        this.renderClock();
      });
      this.el.range.addEventListener('pointerdown', () => (this.wasPlaying = this.playing) && this.pause());
      this.el.range.addEventListener('change', () => this.wasPlaying && this.u < this.U && this.play());
      this.relocalize();
    }

    /* ---------- línea de tiempo ---------- */

    /** Prepara la reproducción a partir de una foto de los datos. Devuelve false si no hay historia. */
    build(data, events) {
      const full = new GB.Layout().compute(data);
      const nodes = [...full.nodes].sort((a, b) => a.x - b.x);
      if (nodes.length < 2) return false;
      const seq = (this.seq = nodes.map((n) => n.commit));
      const idx = (this.idx = new Map(seq.map((c, i) => [c.sha, i])));
      const def = data.repo.defaultBranch;
      this.def = def;
      this.base = data;
      this.commits = new Map(data.commits); // copia: el sondeo en vivo sigue podando la original

      /* fechas (nunca hacia atrás) y tiempo comprimido: los huecos largos se acortan y cada commit
         tiene al menos un instante propio, así las ráfagas también se ven */
      const dates = [];
      for (const c of seq) dates.push(Math.max(c.date || 0, dates.length ? dates[dates.length - 1] : 0));
      const gaps = dates.slice(1).map((d, i) => d - dates[i]).filter((g) => g > 0).sort((a, b) => a - b);
      const median = gaps.length ? gaps[gaps.length >> 1] : 3600e3;
      const cap = clamp(median * 4, 10 * 60e3, 2 * 86400e3);
      const squeezed = dates.map((d, i) => (i ? Math.min(d - dates[i - 1], cap) : 0));
      const step = Math.max(1, squeezed.reduce((a, b) => a + b, 0) / seq.length) * 0.35;
      this.dates = dates;
      this.pos = [];
      let u = 0;
      for (let i = 0; i < seq.length; i++) this.pos.push((u += squeezed[i] + step));
      this.U = u + step;

      /* ramas vivas: sus commits propios (los que el layout les asigna), del más nuevo al más viejo */
      const byChain = new Map();
      for (const n of nodes) (byChain.get(n.chain) || byChain.set(n.chain, []).get(n.chain)).push(n.sha);
      for (const list of byChain.values()) list.sort((a, b) => idx.get(b) - idx.get(a));
      this.live = [];
      for (const b of data.branches.values()) {
        if (!idx.has(b.sha)) continue;
        const own = byChain.get('b:' + b.name) || [];
        const born = own.length ? idx.get(own[own.length - 1]) : idx.get(b.sha);
        this.live.push({ name: b.name, sha: b.sha, own, born, protected: !!b.protected });
      }

      /* ramas ya borradas: la cadena lateral de cada merge vive desde su primer commit hasta que se
         fusiona, con el nombre que dejó el mensaje del merge */
      const names = new Map(full.ghostLabels.map((g) => [g.id, g.name]));
      const ownerName = (sha) => {
        const chain = full.nodeOf.get(sha)?.chain || '';
        return chain.startsWith('b:') ? chain.slice(2) : names.get(chain) || null;
      };
      this.synth = [];
      this.marks = new Map(); // índice de commit -> hito (rótulo y efecto)
      const mark = (i, m) => {
        const prev = this.marks.get(i);
        if (!prev || m.rank > prev.rank) this.marks.set(i, m);
      };
      for (const n of nodes) {
        const c = n.commit;
        const line = U.firstLine(c.message);
        const i = idx.get(c.sha);
        if (n.merge) {
          const pr = /#(\d+)/.exec(line);
          // GitLab: "Merge branch 'x' into 'main'", y abajo "See merge request grupo/proyecto!12"
          const mr = !pr && /See merge request \S*!(\d+)/.exec(c.message || '');
          const base = ownerName(c.sha) || def;
          let head = null;
          for (const p of c.parents.slice(1)) {
            const pn = full.nodeOf.get(p);
            if (!pn || pn.chain.startsWith('b:')) continue; // una rama viva la representa
            const own = (byChain.get(pn.chain) || []).filter((s) => idx.get(s) <= idx.get(p));
            if (!own.length) continue;
            head = names.get(pn.chain) || U.mergedBranchName(c.message) || (pr ? `#${pr[1]}` : U.shortSha(p));
            const born = idx.get(own[own.length - 1]);
            this.synth.push({ name: head, own, born, end: i });
            mark(born, { rank: 1, kind: 'branch-create', name: head });
          }
          head ||= U.mergedBranchName(c.message);
          const lines = String(c.message || '').split('\n').map((s) => s.trim()).filter(Boolean);
          const detail = (pr || mr) && lines[1] ? lines[1] : head || '';
          mark(i, {
            rank: 2,
            kind: 'pr-merge',
            head,
            base,
            title: pr
              ? M('act.prMergedInto', { num: Number(pr[1]), base })
              : mr
                ? M('act.mrMergedInto', { num: Number(mr[1]), base })
                : M('act.merge', { name: base }),
            detail,
          });
        } else if (n.chain === 'b:' + def) {
          const sq = squashOf(line);
          if (sq) mark(i, { rank: 2, kind: 'pr-squash', title: M('act.prMergedInto', { num: sq.num, base: def }), detail: sq.title });
        }
      }
      for (const l of this.live) if (l.name !== def && l.own.length) mark(l.born, { rank: 1, kind: 'branch-create', name: l.name });
      for (const m of this.marks.values()) if (m.kind === 'branch-create') m.title = M('act.branchCreated', { name: m.name });

      // releases del panel de actividad (los commits no dicen cuándo se publicó cada una)
      for (const a of events) {
        if (a.kind !== 'release' || !a.time || a.time < dates[0]) continue;
        const i = Math.min(seq.length - 1, countUpTo(dates, a.time));
        mark(i, { rank: 3, kind: 'release', title: a.title, detail: a.detail, act: a });
      }
      this.renderMarks();
      return true;
    }

    /** Datos del repo tal como estaban tras los primeros k commits. */
    frameData(k) {
      const branches = new Map();
      const add = (name, sha, extra) =>
        branches.set(name, { name, sha, isDefault: name === this.def, protected: false, movedAt: 0, ...extra });
      for (const l of this.live) {
        if (l.born >= k) continue;
        const sha = l.own.length ? firstBelow(l.own, this.idx, k) : l.sha;
        if (sha) add(l.name, sha, { protected: l.protected });
      }
      for (const s of this.synth) {
        if (s.born >= k || s.end < k || branches.has(s.name)) continue;
        const sha = firstBelow(s.own, this.idx, k);
        if (sha) add(s.name, sha);
      }
      return {
        repo: this.base.repo,
        commits: this.commits, // los ancestros de una cabeza visible siempre son anteriores: basta con las cabezas
        branches,
        pulls: new Map(),
        totalBranches: branches.size,
      };
    }

    /** Lo que pasó entre los commits k0 y k1: hitos (rótulo, efecto) y pushes por rama (sonido). */
    stepActs(k0, k1, L) {
      const acts = [];
      const pushes = new Map();
      const now = Date.now();
      let best = null;
      for (let i = k0; i < k1; i++) {
        const c = this.seq[i];
        const chain = L.nodeOf.get(c.sha)?.chain || '';
        const branch = chain.startsWith('b:') ? chain.slice(2) : null;
        if (branch) pushes.set(branch, (pushes.get(branch) || 0) + 1);
        const m = this.marks.get(i);
        if (!m) continue;
        if (!best || m.rank >= best.rank) best = m;
        if (m.kind === 'pr-merge')
          acts.push({ kind: 'pr-merge', ref: m.head ? `${m.head} → ${m.base}` : '', branch: m.base, time: now });
        else if (m.kind === 'pr-squash') acts.push({ kind: 'pr-merge', ref: '', branch: this.def, time: now }); // el cometa llega de fuera
        else if (m.kind === 'release') acts.push({ ...m.act, time: now });
        else if (m.kind === 'branch-create') acts.push({ kind: 'branch-create', branch: m.name, time: now });
      }
      for (const [branch, n] of pushes) acts.push({ kind: 'push', branch, title: M('act.pushNew', { n, name: branch }), time: now - 1 });
      if (best) this.caption(best);
      return acts;
    }

    /* ---------- reproducción ---------- */

    start(data, events = []) {
      this.stop(true);
      if (!this.build(data, events)) return false;
      this.layout = new GB.Layout(); // propio: colores y carriles estables durante toda la reproducción
      this.active = true;
      this.root.hidden = false;
      this.k = -1;
      this.u = 0;
      this.lastUpdate = 0;
      this.el.caption.textContent = '';
      this.seek(true);
      this.renderClock();
      this.onState?.(true);
      this.play();
      return true;
    }

    /** Sale del modo (`silent`: sin avisar, porque otra cosa ya va a redibujar). */
    stop(silent) {
      if (!this.active) return;
      this.pause();
      this.active = false;
      this.root.hidden = true;
      clearTimeout(this.captionTimer);
      this.seq = this.commits = this.layout = null;
      this.onState?.(false);
      if (!silent) this.onExit?.();
    }

    play() {
      if (!this.active) return;
      if (this.u >= this.U) {
        // terminada: vuelve a empezar
        this.u = 0;
        this.seek(true);
      }
      this.playing = true;
      this.last = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.tick);
      this.renderPlay();
    }

    pause() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.renderPlay();
    }

    toggle() {
      if (this.playing) this.pause();
      else this.play();
    }

    setSpeed(i) {
      this.speedIdx = i;
      this.el.speed.textContent = `${SPEEDS[i]}×`;
      this.el.speed.setAttribute('aria-label', `${t('replay.speed')}: ${SPEEDS[i]}×`);
    }

    tick(now) {
      if (!this.active || !this.playing) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.u = Math.min(this.U, this.u + (dt * SPEEDS[this.speedIdx] * this.U) / DURATION);
      if (now - this.lastUpdate >= UPDATE_MS || this.u >= this.U) {
        this.lastUpdate = now;
        this.seek(false);
      }
      this.renderClock();
      if (this.u >= this.U) {
        this.pause();
        return this.onEnd?.(); // la historia completa, de punta a punta
      }
      this.raf = requestAnimationFrame(this.tick);
    }

    /** Lleva el grafo a la posición actual. `jump`: salto (arrastre, inicio) sin animar lo intermedio. */
    seek(jump) {
      const k = Math.max(1, countUpTo(this.pos, this.u));
      if (k === this.k) return;
      const k0 = this.k;
      this.k = k;
      const back = k < k0;
      if (back) this.layout = new GB.Layout(); // hacia atrás: colores y carriles como la primera vez
      const data = this.frameData(k);
      const L = this.layout.compute(data);
      const leap = jump || back || k0 < 0;
      this.onFrame(data, L, { jump: leap, acts: leap ? [] : this.stepActs(k0, k, L), quiet: reduceMotion() });
    }

    /* ---------- interfaz ---------- */

    /** Fecha del momento actual, interpolada dentro del hueco entre dos commits. */
    dateAt(u) {
      const i = clamp(countUpTo(this.pos, u) - 1, 0, this.seq.length - 1);
      const j = Math.min(i + 1, this.seq.length - 1);
      const span = this.pos[j] - this.pos[i];
      const f = span > 0 ? clamp((u - this.pos[i]) / span, 0, 1) : 0;
      return this.dates[i] + (this.dates[j] - this.dates[i]) * f;
    }

    renderClock() {
      if (!this.active) return;
      const ms = this.dateAt(this.u);
      const loc = i18n.locale;
      this.el.date.textContent = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
      this.el.time.textContent = i18n.fmtTime(ms);
      const v = Math.round((this.u / this.U) * 1000);
      if (Number(this.el.range.value) !== v) this.el.range.value = v;
      this.el.range.setAttribute('aria-valuetext', `${this.el.date.textContent} ${this.el.time.textContent}`);
    }

    renderPlay() {
      const label = t(this.playing ? 'ctl.pause' : 'ctl.resume');
      this.el.play.setAttribute('aria-pressed', this.playing ? 'false' : 'true');
      this.el.play.title = label;
      this.el.play.setAttribute('aria-label', label);
    }

    /** Marcas en la línea de tiempo: merges y releases. */
    renderMarks() {
      const html = [];
      for (const [i, m] of this.marks) {
        if (m.kind === 'branch-create') continue;
        const left = ((this.pos[i] / this.U) * 100).toFixed(2);
        html.push(`<span class="rp-mark ${m.kind === 'release' ? 'release' : 'merge'}" style="left:${left}%"></span>`);
      }
      this.el.marks.innerHTML = html.join('');
    }

    caption(m) {
      const title = i18n.text(m.title);
      const detail = i18n.text(m.detail);
      this.el.caption.innerHTML = `<span class="rp-cap-title">${U.esc(title)}</span>${detail ? `<span class="rp-cap-detail">${U.esc(U.truncate(detail, 90))}</span>` : ''}`;
      this.el.caption.classList.remove('show');
      void this.el.caption.offsetWidth;
      this.el.caption.classList.add('show');
      clearTimeout(this.captionTimer);
      this.captionTimer = setTimeout(() => this.el.caption.classList.remove('show'), CAPTION_MS);
    }

    relocalize() {
      this.el.speed.title = t('replay.speed');
      this.setSpeed(this.speedIdx);
      this.el.range.setAttribute('aria-label', t('replay.position'));
      this.renderPlay();
      this.renderClock();
    }
  }

  GB.Replay = Replay;
})(window.GB);
