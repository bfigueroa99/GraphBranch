/* GraphBranch — vista 3D con Three.js.
   El tiempo avanza hacia la cámara (eje Z): lo más nuevo queda adelante y la
   historia se pierde en la niebla. La rama por defecto es el tronco central;
   las demás se reparten a su alrededor en una espiral (girasol), las más
   activas más cerca del tronco, así caben decenas de ramas sin taparse.
   Recibe el mismo layout que la vista 2D. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const tr = i18n.t;
  const SP = 2.0; // distancia entre commits en el eje del tiempo
  const LANE_C = 3.0; // escala de la espiral de carriles
  const GOLDEN = 2.399963229728653;
  const DUR = 700;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOutBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const CI_SVG = {
    running: '<svg class="h3-ci ci-running" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4.5"/></svg>',
    ok: '<svg class="h3-ci ci-ok" viewBox="-6 -6 12 12" aria-hidden="true"><path d="M-4,0.2L-1.3,2.9L4,-2.6"/></svg>',
    fail: '<svg class="h3-ci ci-fail" viewBox="-6 -6 12 12" aria-hidden="true"><path d="M-3.4,-3.4L3.4,3.4M3.4,-3.4L-3.4,3.4"/></svg>',
    cancel: '<svg class="h3-ci ci-cancel" viewBox="-6 -6 12 12" aria-hidden="true"><path d="M-3.6,0H3.6"/></svg>',
  };

  function lane(row) {
    if (row <= 0) return [0, 0];
    const r = LANE_C * Math.sqrt(row);
    const a = row * GOLDEN + Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  function spriteTexture(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  class Graph3D {
    static supported() {
      if (!window.THREE || !THREE.OrbitControls) return false;
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        return false;
      }
    }

    constructor(wrap, opts = {}) {
      this.wrap = wrap;
      this.opts = opts;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'g3-canvas';
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', tr('graph.aria3d'));
      wrap.appendChild(this.canvas);

      this.labelLayer = document.createElement('div');
      this.labelLayer.className = 'g3-labels';
      wrap.appendChild(this.labelLayer);

      this.tip = document.createElement('div');
      this.tip.className = 'tip';
      this.tip.hidden = true;
      this.tip.setAttribute('role', 'dialog');
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      wrap.appendChild(this.tip);
      GB.graphShared.wirePinButton(this.tip, (name) => this.opts.onTogglePin?.(name));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 800);
      this.camera.position.set(16, 11, 22);
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      Object.assign(this.controls, {
        enableDamping: true,
        dampingFactor: 0.08,
        rotateSpeed: 0.6,
        zoomSpeed: 0.9,
        panSpeed: 0.8,
        screenSpacePanning: true,
        minDistance: 4,
        maxDistance: 220,
        autoRotateSpeed: 0.35,
      });
      this.controls.addEventListener('start', () => {
        this.interacting = true;
        this.dragFrom = this.controls.target.clone();
        this.fly = null;
      });
      this.controls.addEventListener('end', () => {
        this.interacting = false;
        this.lastInteract = performance.now();
        if (this.dragFrom && this.dragFrom.distanceTo(this.controls.target) > 0.4) this.setFollowing(false);
      });

      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const sun = new THREE.DirectionalLight(0xffffff, 0.75);
      sun.position.set(12, 24, 18);
      this.scene.add(sun);

      this.gEdges = new THREE.Group();
      this.gNodes = new THREE.Group();
      this.gFx = new THREE.Group();
      this.gDays = new THREE.Group();
      this.scene.add(this.gDays, this.gEdges, this.gNodes, this.gFx);

      this.geo = {
        sphere: new THREE.SphereGeometry(0.42, 22, 16),
        torus: new THREE.TorusGeometry(0.48, 0.13, 10, 30),
      };
      this.glowTex = spriteTexture((g) => {
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
      });
      this.ringTex = spriteTexture((g) => {
        g.strokeStyle = '#fff';
        g.lineWidth = 7;
        g.beginPath();
        g.arc(64, 64, 52, 0, Math.PI * 2);
        g.stroke();
      });
      this.mats = new Map();

      this.nodes = new Map();
      this.edges = new Map();
      this.heads = new Map();
      this.pointers = new Map();
      this.days = new Map();
      this.ripples = [];
      this.dying = [];
      this.pickables = [];
      this.maxX = 0;
      this.radius = 4;
      this.following = true;
      this.spin = !!U.store.get('spin3d', true);
      this.active = false;
      this.placed = false;
      this.lastInteract = 0;
      this.mouse = null;
      this.raycaster = new THREE.Raycaster();

      this.readTheme();
      const onTheme = () => this.readTheme();
      window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', onTheme);
      new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

      this.bindPointer();
      new ResizeObserver(() => this.resize()).observe(wrap);
      this.frame = this.frame.bind(this);
    }

    /* ---------- tema y materiales ---------- */

    readTheme() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      this.colors = { ghost: v('--ghost', '#b4bdb9') };
      for (let i = 0; i <= 8; i++) this.colors['c' + i] = v('--s' + i, '#888888');
      const bg = new THREE.Color(v('--surface', '#ffffff'));
      const hsl = {};
      bg.getHSL(hsl);
      this.dark = hsl.l < 0.5;
      this.inkMuted = new THREE.Color(v('--ink-3', '#78837f'));
      this.lineColor = new THREE.Color(v('--line-strong', '#c9d1cd'));
      this.scene.fog = new THREE.Fog(bg, 34, 130);
      for (const [key, m] of this.mats) this.paint(key, m);
      if (this.dayMat) this.dayMat.color.copy(this.lineColor);
      if (this.dust) this.dust.material.color.copy(this.inkMuted);
      this.needsRender = true;
    }

    paint(key, m) {
      const col = new THREE.Color(this.colors[key] || this.colors.c0);
      const ghost = key === 'ghost';
      m.node.color.copy(col);
      m.node.emissive.copy(col);
      m.node.emissiveIntensity = this.dark ? 0.55 : 0.22;
      m.edge.color.copy(col);
      m.edge.emissive.copy(col);
      m.edge.emissiveIntensity = this.dark ? 0.45 : 0.15;
      m.edge.opacity = ghost ? 0.5 : 1;
      m.stub.color.copy(col);
      m.halo.color.copy(col);
      m.halo.opacity = this.dark ? 0.7 : 0.4;
      m.halo.blending = this.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.halo.needsUpdate = true;
      m.ring.color.copy(col);
      m.line.color.copy(col);
    }

    mat(key) {
      let m = this.mats.get(key);
      if (m) return m;
      m = {
        node: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }),
        edge: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, transparent: key === 'ghost' }),
        stub: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }),
        halo: new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false }),
        ring: new THREE.SpriteMaterial({ map: this.ringTex, transparent: true, depthWrite: false }),
        line: new THREE.LineDashedMaterial({ dashSize: 0.3, gapSize: 0.22, transparent: true, opacity: 0.85 }),
      };
      this.mats.set(key, m);
      this.paint(key, m);
      return m;
    }

    /* ---------- tamaño y ciclo de dibujo ---------- */

    resize() {
      const W = this.wrap.clientWidth;
      const H = this.wrap.clientHeight;
      if (!W || !H) return;
      this.W = W;
      this.H = H;
      this.renderer.setSize(W, H, false);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      this.needsRender = true;
    }

    setActive(on) {
      this.active = on;
      if (on) {
        this.resize();
        if (!this.raf) this.raf = requestAnimationFrame(this.frame);
      } else {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.unpin();
      }
    }

    pos(x, row) {
      const [lx, ly] = lane(row);
      return new THREE.Vector3(lx, ly, x * SP);
    }

    cur(it, now) {
      if (!it.t0) return it.toV;
      const p = clamp((now - it.t0) / DUR, 0, 1);
      if (p >= 1) {
        it.t0 = 0;
        return it.toV;
      }
      this.needsRender = true;
      return it.fromV.clone().lerp(it.toV, ease(p));
    }

    retarget(it, x, row, now, animate) {
      const to = this.pos(x, row);
      if (it.toV && it.toV.distanceTo(to) < 1e-6) return false;
      it.fromV = it.curV ? it.curV.clone() : to;
      it.toV = to;
      it.t0 = animate && it.curV ? now : 0;
      return true;
    }

    /* ---------- actualización de datos ---------- */

    update(L, ctx = {}) {
      const now = performance.now();
      const fx = !ctx.initial && !reduceMotion();
      this.layout = L;
      this.ctx = ctx;
      this.maxX = L.maxX;
      this.ghostNames = new Map(L.ghostLabels.map((g) => [g.id, g.name]));
      this.radius = LANE_C * Math.sqrt(Math.max(1, L.rows.length - 1)) + 2.4;

      /* nodos */
      const seen = new Set();
      for (const n of L.nodes) {
        seen.add(n.sha);
        let it = this.nodes.get(n.sha);
        if (!it) {
          it = { group: new THREE.Group() };
          this.retarget(it, n.x, n.row, now, false);
          this.nodes.set(n.sha, it);
          this.gNodes.add(it.group);
          if (fx) {
            it.born = now;
            this.ripple(it, n.color);
          }
        } else this.retarget(it, n.x, n.row, now, fx);
        const kind = `${n.color}|${n.merge}|${n.heads.length > 0}`;
        if (it.kind !== kind) this.styleNode(it, n);
        it.kind = kind;
        it.data = n;
      }
      for (const [sha, it] of this.nodes) {
        if (seen.has(sha)) continue;
        this.nodes.delete(sha);
        this.dying.push({ obj: it.group, t0: now, from: it.group.scale.x });
      }
      this.pickables = [...this.nodes.values()].map((it) => it.mesh);

      /* aristas */
      const seenE = new Set();
      for (const e of L.edges) {
        seenE.add(e.id);
        let it = this.edges.get(e.id);
        if (!it) {
          it = { mesh: null, key: '' };
          this.edges.set(e.id, it);
          if (fx && e.kind !== 'stub') it.born = now;
        }
        if (it.data && it.data.color !== e.color) it.key = ''; // repintar
        it.data = e;
      }
      for (const [id, it] of this.edges) {
        if (seenE.has(id)) continue;
        this.edges.delete(id);
        this.disposeMesh(it.mesh);
      }

      /* cabezas de rama: etiqueta HTML + línea punteada si la rama no tiene commits propios */
      const seenH = new Set();
      for (const h of L.heads) {
        seenH.add(h.name);
        let it = this.heads.get(h.name);
        const isNew = !it;
        if (!it) {
          it = { el: document.createElement('button') };
          it.el.type = 'button';
          it.el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.showTip(it.data.sha, true, it.data.name);
          });
          this.labelLayer.appendChild(it.el);
          this.heads.set(h.name, it);
          this.retarget(it, h.x, h.row, now, false);
        } else if (this.retarget(it, h.x, h.row, now, fx) && fx && it.data.sha !== h.sha) this.flash(it.el);
        it.data = h;
        this.buildHead(it, h, ctx);
        if (isNew && fx) this.flash(it.el);

        let p = this.pointers.get(h.name);
        if (!h.own) {
          if (!p) {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
            p = { line: new THREE.Line(g, this.mat(h.color).line) };
            this.pointers.set(h.name, p);
            this.gEdges.add(p.line);
          }
          p.line.material = this.mat(h.color).line;
        } else if (p) {
          this.disposeMesh(p.line);
          this.pointers.delete(h.name);
        }
      }
      for (const [name, it] of this.heads) {
        if (seenH.has(name)) continue;
        it.el.classList.add('exit');
        setTimeout(() => it.el.remove(), 420);
        this.heads.delete(name);
        const p = this.pointers.get(name);
        if (p) (this.disposeMesh(p.line), this.pointers.delete(name));
      }

      this.updateDays(L);
      this.updateDust();

      if (this.pinned && !this.nodes.has(this.pinned)) this.unpin();
      if (!this.placed && L.nodes.length) {
        this.placeCamera();
        this.placed = true;
      }
      this.needsRender = true;
    }

    styleNode(it, n) {
      if (it.mesh) it.group.remove(it.mesh);
      if (it.halo) it.group.remove(it.halo);
      const m = this.mat(n.color);
      it.mesh = new THREE.Mesh(n.merge ? this.geo.torus : this.geo.sphere, m.node);
      it.mesh.userData.sha = n.sha;
      it.group.add(it.mesh);
      const isHead = n.heads.length > 0;
      it.mesh.scale.setScalar(isHead ? 1.55 : 1);
      it.halo = null;
      if (isHead) {
        it.halo = new THREE.Sprite(m.halo);
        it.halo.scale.setScalar(3.2);
        it.group.add(it.halo);
      }
    }

    ripple(it, color) {
      const s = new THREE.Sprite(this.mat(color).ring.clone());
      s.position.copy(it.toV);
      s.scale.setScalar(1);
      this.gFx.add(s);
      this.ripples.push({ sprite: s, t0: performance.now() });
    }

    flash(el) {
      el.classList.remove('moved');
      void el.offsetWidth;
      el.classList.add('moved');
      clearTimeout(el.__flash);
      el.__flash = setTimeout(() => el.classList.remove('moved'), 2600);
    }

    buildHead(it, h, ctx) {
      const ci = ctx.ci?.get(h.name);
      const pr = ctx.prs?.get(h.name);
      const pinned = ctx.pins?.has(h.name);
      const moved = it.el.classList.contains('moved') ? ' moved' : '';
      it.el.className = `g3-head ${h.color}${h.isDefault ? ' default' : ''}${moved}`;
      const aria = [tr(h.isDefault ? 'branch.ariaDefault' : 'branch.aria', { name: h.name })];
      if (ci) aria.push(GB.graphShared.ciLabel(ci.state));
      if (pr) aria.push(tr(pr.draft ? 'branch.prDraftAria' : 'branch.prAria', { num: pr.number, base: pr.base }));
      if (pinned) aria.push(tr('branch.pinned'));
      it.el.setAttribute('aria-label', aria.join(', '));
      it.w = 0;
      it.el.innerHTML =
        `<span class="h3-dot" aria-hidden="true"></span><span class="h3-name">${U.esc(U.truncate(h.name, 34))}</span>` +
        (ci ? CI_SVG[ci.state] : '') +
        (pr ? `<span class="h3-pr${pr.draft ? ' draft' : ''}">#${pr.number}</span>` : '') +
        (pinned ? `<span class="h3-pin" title="${U.esc(tr('branch.pinned'))}" aria-hidden="true"></span>` : '');
    }

    updateDays(L) {
      const R = this.radius + 1.2;
      if (!this.dayMat) {
        this.dayMat = new THREE.MeshBasicMaterial({ color: this.lineColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
      }
      if (this.dayR !== R) {
        this.dayGeo?.dispose();
        this.dayGeo = new THREE.RingGeometry(R - 0.05, R, 96);
        for (const d of this.days.values()) d.mesh.geometry = this.dayGeo;
        this.dayR = R;
      }
      const seen = new Set();
      for (const d of L.days) {
        seen.add(d.id);
        let it = this.days.get(d.id);
        if (!it) {
          it = { mesh: new THREE.Mesh(this.dayGeo, this.dayMat), el: document.createElement('span') };
          it.el.className = 'g3-day';
          this.labelLayer.appendChild(it.el);
          this.gDays.add(it.mesh);
          this.days.set(d.id, it);
        }
        it.data = d;
        it.mesh.position.set(0, 0, (d.x - 0.5) * SP);
        it.el.textContent = i18n.dayLabel(d.time);
      }
      for (const [id, it] of this.days) {
        if (seen.has(id)) continue;
        this.gDays.remove(it.mesh);
        it.el.remove();
        this.days.delete(id);
      }
    }

    /** Polvo tenue alrededor del tronco: da profundidad y sensación de espacio. */
    updateDust() {
      const len = (this.maxX + 30) * SP;
      if (this.dust && this.dustLen >= len - 20 && this.dustR === this.radius) return;
      if (this.dust) (this.scene.remove(this.dust), this.dust.geometry.dispose());
      const n = Math.min(1600, Math.round(len * 4));
      const pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = this.radius * (0.9 + Math.random() * 1.4);
        pts[i * 3] = Math.cos(a) * r;
        pts[i * 3 + 1] = Math.sin(a) * r;
        pts[i * 3 + 2] = Math.random() * len - 15 * SP;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.dust = new THREE.Points(
        g,
        new THREE.PointsMaterial({ color: this.inkMuted, map: this.glowTex, size: 0.22, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      this.dustLen = len;
      this.dustR = this.radius;
      this.scene.add(this.dust);
    }

    disposeMesh(obj) {
      if (!obj) return;
      obj.parent?.remove(obj);
      obj.geometry?.dispose();
    }

    /* ---------- cámara ---------- */

    followPoint() {
      return new THREE.Vector3(0, 0, Math.max(0, this.maxX * SP - 7));
    }

    defaultOffset() {
      // más lejos en paneles angostos (celular) para que la escena no se corte
      const aspect = this.W && this.H ? this.W / this.H : 1.6;
      const d = (13 + this.radius * 1.6) * clamp(1.6 / aspect, 1, 1.9);
      return new THREE.Vector3(0.55, 0.4, 0.74).normalize().multiplyScalar(d);
    }

    placeCamera() {
      const t = this.followPoint();
      this.controls.target.copy(t);
      this.camera.position.copy(t).add(this.defaultOffset());
      this.controls.update();
    }

    flyTo(target, camPos, dur = 900) {
      this.fly = {
        t0: performance.now(),
        dur: reduceMotion() ? 1 : dur,
        fromT: this.controls.target.clone(),
        toT: target,
        fromC: this.camera.position.clone(),
        toC: camPos,
      };
    }

    setFollowing(v) {
      if (this.following === v) return;
      this.following = v;
      this.opts.onFollowChange?.(v);
      if (v) {
        const t = this.followPoint();
        const off = this.camera.position.clone().sub(this.controls.target);
        if (off.length() > 90 || off.length() < 6) off.copy(this.defaultOffset());
        this.flyTo(t, t.clone().add(off));
      }
    }

    setSpin(on) {
      this.spin = on;
      U.store.set('spin3d', on);
      this.lastInteract = 0;
    }

    zoomBy(f) {
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1 / f);
      const len = clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
      off.setLength(len);
      this.flyTo(this.controls.target.clone(), this.controls.target.clone().add(off), 350);
    }

    focusSha(sha) {
      const it = this.nodes.get(sha);
      if (!it) return false;
      this.setFollowing(false);
      const t = it.toV.clone();
      const off = this.camera.position.clone().sub(this.controls.target).setLength(15);
      this.flyTo(t, t.clone().add(off));
      if (!reduceMotion()) this.ripple(it, it.data.color);
      return true;
    }

    focusBranch(name) {
      const h = this.heads.get(name);
      if (!h) return false;
      this.focusSha(h.data.sha);
      this.flash(h.el);
      return true;
    }

    hasBranch(name) {
      return this.heads.has(name);
    }

    /* ---------- puntero: hover y clic ---------- */

    bindPointer() {
      let down = null;
      this.canvas.addEventListener('pointermove', (ev) => {
        const r = this.canvas.getBoundingClientRect();
        this.mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top, moved: true };
      });
      this.canvas.addEventListener('pointerleave', () => {
        this.mouse = null;
        if (!this.pinned) this.hideTip();
        this.canvas.style.cursor = '';
      });
      this.canvas.addEventListener('pointerdown', (ev) => {
        down = { x: ev.clientX, y: ev.clientY };
      });
      this.canvas.addEventListener('pointerup', (ev) => {
        if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return (down = null);
        down = null;
        const r = this.canvas.getBoundingClientRect();
        const sha = this.pick(ev.clientX - r.left, ev.clientY - r.top);
        if (sha) this.showTip(sha, true);
        else this.unpin();
      });
      this.wrap.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') this.unpin();
      });
    }

    pick(x, y) {
      if (!this.W) return null;
      this.raycaster.setFromCamera({ x: (x / this.W) * 2 - 1, y: -(y / this.H) * 2 + 1 }, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      return hit ? hit.object.userData.sha : null;
    }

    showTip(sha, pin, branchName) {
      const it = this.nodes.get(sha);
      if (!it) return;
      this.tip.innerHTML = GB.graphShared.tipHTML(it.data, this.ctx || {}, { pin, branchName, ghostNames: this.ghostNames });
      this.tip.hidden = false;
      this.tip.classList.toggle('pinned', !!pin);
      this.tipSha = sha;
      if (pin) this.pinned = sha;
      this.placeTip();
    }

    placeTip() {
      const it = this.nodes.get(this.tipSha);
      if (!it || !it.curV) return this.hideTip();
      const p = this.project(it.curV);
      if (!p) return;
      const w = this.tip.offsetWidth;
      const h = this.tip.offsetHeight;
      let left = p.x + 16;
      let top = p.y - h - 14;
      if (left + w > this.W - 8) left = p.x - w - 16;
      if (left < 8) left = clamp(p.x - w / 2, 8, Math.max(8, this.W - w - 8));
      if (top < 8) top = p.y + 16;
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

    /** Cambio de idioma: etiquetas accesibles, días del eje y rótulos de las ramas. */
    relocalize() {
      this.canvas.setAttribute('aria-label', tr('graph.aria3d'));
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      this.unpin();
      for (const d of this.days.values()) if (d.data) d.el.textContent = i18n.dayLabel(d.data.time);
      for (const it of this.heads.values()) if (it.data) this.buildHead(it, it.data, this.ctx || {});
    }

    project(v) {
      const p = v.clone().project(this.camera);
      if (p.z > 1 || p.z < -1) return null;
      return { x: (p.x + 1) * 0.5 * this.W, y: (1 - p.y) * 0.5 * this.H };
    }

    /* ---------- cuadro a cuadro ---------- */

    edgeCurve(kind, a, b) {
      if (kind === 'line' || (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3)) return new THREE.LineCurve3(a, b);
      const V = THREE.Vector3;
      const d = Math.max(0.4, Math.min(SP * 1.7, b.z - a.z));
      const path = new THREE.CurvePath();
      if (kind === 'fork') {
        const m = new V(b.x, b.y, a.z + d);
        path.add(new THREE.CubicBezierCurve3(a, new V(a.x, a.y, a.z + d * 0.6), new V(b.x, b.y, a.z + d * 0.4), m));
        if (b.z - m.z > 0.01) path.add(new THREE.LineCurve3(m, b));
      } else {
        const m = new V(a.x, a.y, b.z - d);
        if (m.z - a.z > 0.01) path.add(new THREE.LineCurve3(a, m));
        path.add(new THREE.CubicBezierCurve3(m, new V(a.x, a.y, b.z - d * 0.4), new V(b.x, b.y, b.z - d * 0.6), b));
      }
      return path;
    }

    buildEdge(it, a, b) {
      const e = it.data;
      const m = this.mat(e.color);
      let curve;
      let segs;
      let radius = e.color === 'ghost' ? 0.07 : 0.11;
      let material = m.edge;
      if (e.kind === 'stub') {
        curve = new THREE.LineCurve3(b.clone().setZ(b.z - SP * 0.9), b);
        segs = 1;
        radius = 0.06;
        material = m.stub;
      } else {
        curve = this.edgeCurve(e.kind, a, b);
        segs = curve.isLineCurve3 ? 1 : clamp(Math.ceil(curve.getLength() / 0.22), 14, 160);
      }
      const geo = new THREE.TubeGeometry(curve, segs, radius, 6, false);
      if (it.mesh) {
        it.mesh.geometry.dispose();
        it.mesh.geometry = geo;
        it.mesh.material = material;
      } else {
        it.mesh = new THREE.Mesh(geo, material);
        this.gEdges.add(it.mesh);
      }
      it.segs = segs;
    }

    frame(now) {
      this.raf = this.active ? requestAnimationFrame(this.frame) : 0;
      if (!this.active || !this.W) return;

      /* cámara: vuelo animado, seguimiento de lo último y giro lento */
      if (this.fly) {
        const f = this.fly;
        const p = ease(clamp((now - f.t0) / f.dur, 0, 1));
        this.controls.target.lerpVectors(f.fromT, f.toT, p);
        this.camera.position.lerpVectors(f.fromC, f.toC, p);
        if (p >= 1) this.fly = null;
        this.needsRender = true;
      } else if (this.following && !this.interacting) {
        const t = this.followPoint();
        const delta = t.sub(this.controls.target).multiplyScalar(0.06);
        if (delta.lengthSq() > 1e-8) {
          this.controls.target.add(delta);
          this.camera.position.add(delta);
          this.needsRender = true;
        }
      }
      const idle = now - this.lastInteract > 4000;
      this.controls.autoRotate = this.spin && this.following && idle && !this.interacting && !this.pinned && !this.tipSha && !reduceMotion();
      if (this.controls.update() || this.controls.autoRotate) this.needsRender = true;

      /* nodos */
      for (const it of this.nodes.values()) {
        const v = this.cur(it, now);
        if (!it.curV || !it.curV.equals(v)) {
          it.curV = v.clone();
          it.group.position.copy(v);
          this.needsRender = true;
        }
        if (it.born) {
          const p = clamp((now - it.born) / 550, 0, 1);
          it.group.scale.setScalar(Math.max(0.001, easeOutBack(p)));
          if (p >= 1) it.born = 0;
          this.needsRender = true;
        }
      }
      for (const d of this.dying.splice(0)) {
        const p = clamp((now - d.t0) / 350, 0, 1);
        d.obj.scale.setScalar(Math.max(0.001, d.from * (1 - p)));
        if (p < 1) this.dying.push(d);
        else this.gNodes.remove(d.obj);
        this.needsRender = true;
      }

      /* aristas: se reconstruyen solo si sus extremos se movieron */
      for (const it of this.edges.values()) {
        const e = it.data;
        const b = this.nodes.get(e.to)?.curV;
        const a = e.from ? this.nodes.get(e.from)?.curV : b;
        if (!a || !b) continue;
        const key = `${a.x.toFixed(3)},${a.y.toFixed(3)},${a.z.toFixed(3)}|${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)}`;
        if (key !== it.key) {
          this.buildEdge(it, a, b);
          it.key = key;
          this.needsRender = true;
        }
        if (it.born) {
          const p = clamp((now - it.born) / DUR, 0, 1);
          it.mesh.geometry.setDrawRange(0, Math.ceil(p * it.segs) * 6 * 6);
          if (p >= 1) {
            it.born = 0;
            it.mesh.geometry.setDrawRange(0, Infinity);
          }
          this.needsRender = true;
        }
      }

      /* ondas de commits nuevos */
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        const p = clamp((now - r.t0) / 1500, 0, 1);
        r.sprite.scale.setScalar(1 + p * 9);
        r.sprite.material.opacity = 0.9 * (1 - p);
        if (p >= 1) {
          this.gFx.remove(r.sprite);
          r.sprite.material.dispose();
          this.ripples.splice(i, 1);
        }
        this.needsRender = true;
      }

      /* cabezas: posición animada (la etiqueta viaja al nuevo commit) */
      for (const [name, it] of this.heads) {
        const v = this.cur(it, now);
        it.curV = v.clone();
        const p = this.pointers.get(name);
        if (p) {
          const node = this.nodes.get(it.data.sha)?.curV;
          if (node) {
            const pos = p.line.geometry.attributes.position;
            pos.setXYZ(0, node.x, node.y, node.z);
            pos.setXYZ(1, v.x, v.y, v.z);
            pos.needsUpdate = true;
            p.line.computeLineDistances();
          }
        }
      }

      if (this.needsRender) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
        this.placeLabels();
      }

      /* hover */
      if (this.mouse?.moved && !this.interacting) {
        this.mouse.moved = false;
        const sha = this.pick(this.mouse.x, this.mouse.y);
        this.canvas.style.cursor = sha ? 'pointer' : '';
        if (!this.pinned) {
          if (sha && sha !== this.tipSha) this.showTip(sha, false);
          else if (!sha && this.tipSha) this.hideTip();
        }
      }
    }

    placeLabels() {
      const camPos = this.camera.position;
      const axis = new THREE.Vector3();
      for (const it of this.heads.values()) {
        if (!it.curV) continue;
        const p = this.project(it.curV);
        const dist = camPos.distanceTo(it.curV);
        const vis = p && p.x > -40 && p.x < this.W + 40 && p.y > -20 && p.y < this.H + 20 && dist < 160;
        it.el.style.display = vis ? '' : 'none';
        if (!vis) continue;
        // la etiqueta se aleja del tronco en pantalla, así las ramas vecinas no se pisan
        const q = this.project(axis.set(0, 0, it.curV.z));
        let dx = q ? p.x - q.x : 1;
        let dy = q ? p.y - q.y : -0.4;
        const len = Math.hypot(dx, dy);
        if (len < 4) (dx = 0.7), (dy = -0.7);
        else (dx /= len), (dy /= len);
        const off = it.data.own ? 18 : 12;
        const w = it.w || (it.w = it.el.offsetWidth);
        const x = clamp(p.x + dx * off - (dx < -0.2 ? w : 0), 4, Math.max(4, this.W - w - 4));
        const y = p.y + dy * off - 11;
        it.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
        it.el.style.opacity = clamp(1.15 - (dist - 30) / 80, 0.3, 1).toFixed(2);
        it.el.style.zIndex = String(1000 - Math.round(dist));
      }
      const top = new THREE.Vector3();
      for (const d of this.days.values()) {
        top.set(0, (this.dayR || this.radius) + 0.7, d.mesh.position.z);
        const p = this.project(top);
        const dist = camPos.distanceTo(top);
        const vis = p && p.x > 0 && p.x < this.W - 40 && p.y > 4 && p.y < this.H - 10 && dist < 120;
        d.el.style.display = vis ? '' : 'none';
        if (vis) {
          d.el.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`;
          d.el.style.opacity = clamp(1.1 - (dist - 30) / 80, 0.25, 1).toFixed(2);
        }
      }
      if (this.tipSha && !this.tip.hidden) this.placeTip();
    }

    clear() {
      for (const it of this.nodes.values()) this.gNodes.remove(it.group);
      for (const it of this.edges.values()) this.disposeMesh(it.mesh);
      for (const p of this.pointers.values()) this.disposeMesh(p.line);
      for (const it of this.heads.values()) it.el.remove();
      for (const d of this.days.values()) (this.gDays.remove(d.mesh), d.el.remove());
      for (const r of this.ripples) this.gFx.remove(r.sprite);
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.days]) m.clear();
      this.ripples = [];
      this.dying = [];
      this.pickables = [];
      this.layout = null;
      this.maxX = 0;
      this.placed = false;
      this.fly = null;
      this.unpin();
      this.following = true;
      this.opts.onFollowChange?.(true);
      this.needsRender = true;
    }
  }

  GB.Graph3D = Graph3D;
})(window.GB);
