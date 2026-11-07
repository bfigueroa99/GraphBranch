/* GraphBranch — la corteza del enjambre: los participantes de la vista de agentes dentro de un cerebro en 3D, a rayos X.
   Cada uno está en el lóbulo de lo que más hace (swarm.js, place) y quien más integra, al centro; sus vínculos cruzan
   el volumen y las interacciones más recientes viajan por ellos como pulsos. Al lado, tres cortes (axial, coronal y
   sagital) por donde está el elegido, en un canvas 2D: se ven también sin WebGL.

   El elemento (`host`) es uno solo y sobrevive a que el tablero se rehaga: quien lo muestra lo vuelve a poner en su
   lugar. Con movimiento reducido no gira ni late: se dibuja solo cuando algo cambia. Los rótulos son botones (con su
   nombre accesible) y elegir uno avisa a `onPick`. Todo texto llega ya traducido y va como texto, nunca como HTML. */
(function (GB) {
  'use strict';

  const POINTS = 6000;
  const SLAB = 0.07; // medio grosor de un corte
  const NEAR = 0.3; // qué tan cerca del corte tiene que estar alguien para verse en él
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => !!motionQuery?.matches;
  let cloudCache = null;
  const cloud = () => cloudCache || (cloudCache = GB.swarm.cloud(POINTS, 7));

  /** Los tres cortes: qué eje se corta y qué ejes quedan a lo ancho y a lo alto (con su sentido en pantalla). */
  const PLANES = [
    { id: 'axial', cut: 1, h: 0, v: 2, flipV: true }, // desde arriba: adelante, arriba
    { id: 'coronal', cut: 2, h: 0, v: 1, flipV: true }, // de frente
    { id: 'sagittal', cut: 0, h: 2, v: 1, flipV: true }, // de lado: adelante, a la derecha
  ];
  const AXES = ['x', 'y', 'z'];

  /** ¿Se puede dibujar en 3D? Devuelve el canvas y el contexto ya creados (crear otro cuesta) o null. */
  function probe() {
    if (!window.THREE || !THREE.OrbitControls) return null;
    try {
      const canvas = document.createElement('canvas');
      const attrs = { alpha: true, depth: true, stencil: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false };
      const context = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
      return context ? { canvas, context } : null;
    } catch {
      return null;
    }
  }

  /** Un punto difuso (para la nube, los halos y los pulsos). */
  function dotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** La curva de un vínculo: de p a q, combada hacia afuera para que cruce el volumen y no el centro. */
  function curveOf(p, q) {
    const a = new THREE.Vector3(...p);
    const b = new THREE.Vector3(...q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const out = mid.length() > 0.05 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const ctrl = mid.add(out.multiplyScalar(0.18 + 0.22 * a.distanceTo(b)));
    return new THREE.QuadraticBezierCurve3(a, ctrl, b);
  }

  class Cortex {
    constructor({ onPick } = {}) {
      this.onPick = onPick;
      this.host = document.createElement('div');
      this.host.className = 'sw-viz';
      this.stage = document.createElement('div');
      this.stage.className = 'sw-stage';
      this.stage.setAttribute('role', 'group');
      this.labels = document.createElement('div');
      this.labels.className = 'sw-labels';
      this.note = document.createElement('p');
      this.note.className = 'sw-nogl';
      this.note.hidden = true;
      this.stage.append(this.labels, this.note);
      this.slices = document.createElement('div');
      this.slices.className = 'sw-slices';
      this.cuts = PLANES.map((pl) => {
        const fig = document.createElement('figure');
        fig.className = 'sw-slice';
        fig.dataset.plane = pl.id;
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        const cap = document.createElement('figcaption');
        fig.append(canvas, cap);
        this.slices.append(fig);
        return { ...pl, fig, canvas, cap };
      });
      this.host.append(this.stage, this.slices);
      this.model = null;
      this.text = null;
      this.sig = '';
      this.active = false;
      this.raf = 0;
      this.nodes = new Map(); // key -> { pos, mesh, halo, label }
      this.curves = new Map(); // from>to -> curve
      this.seen = null; // los pulsos ya vistos: uno nuevo destella
      this.flash = new Map(); // id -> cuándo llegó
      this.labels.addEventListener('click', (e) => {
        const b = e.target.closest?.('.sw-label[data-key]');
        if (b) this.onPick?.(b.dataset.key);
      });
      try {
        this.setup3d();
      } catch (err) {
        console.error(err);
        this.gl = false;
      }
      if (!this.gl) this.stage.classList.add('is-flat');
      this.resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resized()) : null;
      this.resizeObs?.observe(this.host);
      // fuera de la pantalla (el tablero se desplazó más abajo) no se dibuja: vuelve al asomarse
      this.visible = true;
      this.seenObs =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver((entries) => {
              this.visible = entries.some((e) => e.isIntersecting);
              if (this.visible) this.kick();
            })
          : null;
      this.seenObs?.observe(this.stage);
      motionQuery?.addEventListener?.('change', () => {
        if (this.controls) this.controls.autoRotate = !reduceMotion();
        this.kick();
      });
    }

    setup3d() {
      const p = probe();
      this.gl = !!p;
      if (!p) return;
      this.renderer = new THREE.WebGLRenderer({ canvas: p.canvas, context: p.context, antialias: true, alpha: true });
      this.renderer.setClearColor(0x000000, 0);
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'sw-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.stage.prepend(this.canvas);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
      this.camera.position.set(2.35, 1.05, 2.35);
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      Object.assign(this.controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, autoRotate: !reduceMotion(), autoRotateSpeed: 0.55 });
      this.controls.target.set(0, -0.06, 0);
      // en una pantalla táctil, deslizar hacia arriba o abajo sigue moviendo la página; de lado, gira la corteza
      this.canvas.style.touchAction = 'pan-y';
      this.controls.addEventListener('change', () => this.kick());
      this.controls.addEventListener('start', () => (this.dragging = true));
      this.controls.addEventListener('end', () => (this.dragging = false));
      this.dot = dotTexture();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(cloud(), 3));
      this.brainMat = new THREE.PointsMaterial({ size: 0.026, sizeAttenuation: true, map: this.dot, transparent: true, depthWrite: false, opacity: 0.55 });
      this.brain = new THREE.Points(geo, this.brainMat);
      // el barrido: un anillo que recorre la corteza de arriba abajo, como el de un escáner
      const ring = [];
      for (let i = 0; i < 96; i++) ring.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), 0, Math.sin((i / 96) * Math.PI * 2)));
      this.sweepMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
      this.sweep = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring), this.sweepMat);
      this.gLinks = new THREE.Group();
      this.gNodes = new THREE.Group();
      this.gPulses = new THREE.Group();
      this.scene.add(this.brain, this.sweep, this.gLinks, this.gNodes, this.gPulses);
      this.nodeGeo = new THREE.SphereGeometry(0.034, 18, 12);
      this.tmp = new THREE.Vector3();
    }

    /** Los colores del tema, leídos del elemento (tiene que estar en la página). */
    theme() {
      const cs = getComputedStyle(this.host);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      this.colors = { cortex: v('--cortex', '#0e7490'), ink: v('--ink-3', '#636e6a'), line: v('--line-strong', '#c9d1cd') };
      for (let i = 0; i <= 8; i++) this.colors['s' + i] = v('--ag' + i, i ? '#888888' : v('--ink-3', '#636e6a'));
      if (!this.gl) return;
      const bg = new THREE.Color(v('--surface', '#ffffff'));
      const hsl = {};
      bg.getHSL(hsl);
      this.dark = hsl.l < 0.5;
      const blend = this.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.brainMat.color.set(this.colors.cortex);
      this.brainMat.opacity = this.dark ? 0.5 : 0.62;
      this.brainMat.size = this.dark ? 0.026 : 0.03;
      this.brainMat.blending = blend;
      this.sweepMat.color.set(this.colors.cortex);
      this.blend = blend;
      this.brainMat.needsUpdate = true;
    }

    /** La pone (o la quita) en marcha: solo se anima mientras se ve. */
    setActive(on) {
      this.active = !!on;
      if (this.active) this.kick();
    }

    kick() {
      if (!this.raf && this.active) this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    resized() {
      if (!this.host.isConnected) return;
      this.drawSlices();
      if (!this.gl) return;
      const w = this.stage.clientWidth;
      const h = this.stage.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w !== this.w || h !== this.h || dpr !== this.dpr) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        // en un marco angosto se aleja: el cerebro entero entra a lo ancho
        const far = w / h < 1.1 ? 1.3 : 1;
        this.camera.position.setLength(2.85 * far);
        this.camera.updateProjectionMatrix();
      }
      this.kick();
    }

    /** Lo que se dibuja: { nodes: [{ key, label, sub, title, slot, agent, w, pos }], links: [{ from, to, slot, w }],
        pulses: [{ id, from, to, slot }], sel, focus } y los textos { aria, noGl, planes: { axial, coronal, sagittal } }.
        Si nada cambió, no se rehace. */
    update(model, text) {
      const sig = JSON.stringify([model, text]);
      if (sig === this.sig) return;
      const fresh = !this.model;
      this.sig = sig;
      this.model = model;
      this.text = text;
      if (!this.colors || fresh) this.theme();
      this.stage.setAttribute('aria-label', text.aria);
      this.note.hidden = this.gl;
      this.note.textContent = text.noGl;
      for (const c of this.cuts) c.fig.setAttribute('aria-label', text.planes[c.id]);
      // los pulsos nuevos (los que no estaban en la vuelta anterior) destellan al llegar
      const ids = new Set(model.pulses.map((p) => p.id));
      const now = performance.now();
      if (this.seen && !reduceMotion()) for (const id of ids) if (!this.seen.has(id)) this.flash.set(id, now);
      for (const id of this.flash.keys()) if (!ids.has(id)) this.flash.delete(id);
      this.seen = ids;
      this.buildLabels();
      if (this.gl) this.build3d();
      this.drawSlices();
      this.kick();
    }

    /** Los rótulos: un botón por participante, con su color, su nombre y su rol. El foco se queda en el que lo tenía. */
    buildLabels() {
      const had = this.labels.contains(document.activeElement) ? document.activeElement.dataset.key : null;
      this.labels.textContent = '';
      for (const n of this.model.nodes) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sw-label ag-s${n.slot}${n.agent ? ' is-agent' : ''}${this.model.sel === n.key ? ' is-sel' : ''}`;
        b.dataset.key = n.key;
        b.setAttribute('aria-pressed', String(this.model.sel === n.key));
        b.setAttribute('aria-label', n.title);
        const name = document.createElement('b');
        name.textContent = n.label;
        const sub = document.createElement('span');
        sub.textContent = n.sub;
        b.append(name, sub);
        this.labels.append(b);
        if (!this.gl) {
          // sin 3D, los rótulos van en una lista
          b.classList.add('is-flat');
        }
      }
      this.sizes = null; // se miden de nuevo al ponerlos
      if (had) [...this.labels.children].find((b) => b.dataset.key === had)?.focus({ preventScroll: true });
    }

    clear(group) {
      for (const o of [...group.children]) {
        group.remove(o);
        if (o.geometry && o.geometry !== this.nodeGeo) o.geometry.dispose();
        o.material?.dispose?.();
      }
    }

    build3d() {
      const m = this.model;
      this.clear(this.gNodes);
      this.clear(this.gLinks);
      this.clear(this.gPulses);
      this.nodes.clear();
      this.curves.clear();
      const col = (slot) => new THREE.Color(this.colors['s' + slot] || this.colors.s0);
      const sel = m.sel;
      const near = new Set(sel ? [sel] : []);
      if (sel) for (const l of m.links) if (l.from === sel || l.to === sel) near.add(l.from).add(l.to);
      const pos = new Map(m.nodes.map((n) => [n.key, n.pos]));
      for (const l of m.links) {
        const p = pos.get(l.from);
        const q = pos.get(l.to);
        if (!p || !q) continue;
        const curve = curveOf(p, q);
        this.curves.set(l.from + '>' + l.to, curve);
        const on = !sel || l.from === sel || l.to === sel;
        const mat = new THREE.LineBasicMaterial({ color: col(l.slot), transparent: true, opacity: on ? 0.3 + 0.6 * l.w : 0.08, depthWrite: false, blending: this.blend });
        this.gLinks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), mat));
      }
      for (const n of m.nodes) {
        const c = col(n.slot);
        const dim = sel && !near.has(n.key);
        const mesh = new THREE.Mesh(this.nodeGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: dim ? 0.35 : 1 }));
        mesh.position.set(...n.pos);
        mesh.scale.setScalar((n.agent ? 1 : 0.8) * (0.85 + 0.6 * n.w) * (n.key === sel ? 1.35 : 1));
        // el halo de las personas, apenas: en el tema claro un halo gris ensucia la corteza
        const glow = (n.agent ? 0.42 : 0.16) * (this.dark ? 1 : 0.75);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: c, transparent: true, opacity: dim ? glow * 0.3 : glow, depthWrite: false, blending: this.blend }));
        halo.position.copy(mesh.position);
        halo.scale.setScalar(0.16 + 0.2 * n.w + (n.key === sel ? 0.14 : 0));
        this.gNodes.add(mesh, halo);
        this.nodes.set(n.key, { pos: n.pos, halo, base: halo.scale.x });
      }
      this.pulses = m.pulses
        .map((p, i) => {
          const curve = this.curves.get(p.from + '>' + p.to);
          if (!curve) return null;
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: col(p.slot), transparent: true, opacity: 0.95, depthWrite: false, blending: this.blend }));
          s.scale.setScalar(0.07);
          this.gPulses.add(s);
          return { id: p.id, curve, sprite: s, phase: (i * 0.618) % 1, dim: sel && p.from !== sel && p.to !== sel };
        })
        .filter(Boolean);
    }

    frame(t) {
      this.raf = 0;
      if (!this.active || !this.visible || !this.host.isConnected) return;
      if (!this.w) this.resized();
      const still = reduceMotion();
      let moving = false;
      if (this.gl && this.w) {
        moving = this.controls.update() || this.controls.autoRotate || this.dragging;
        // el barrido sube y baja; los pulsos viajan por sus vínculos (con movimiento reducido, quietos y sin barrido)
        this.sweep.visible = !still;
        if (!still) {
          const [RX, RY, RZ] = GB.swarm.SHAPE;
          const y = RY * 0.92 * Math.sin(t / 2400);
          const k = Math.sqrt(Math.max(0, 1 - (y / RY) ** 2));
          this.sweep.position.y = y;
          this.sweep.scale.set(RX * k * 1.03 + 0.001, 1, RZ * k * 1.03 + 0.001);
          moving = true;
        }
        for (const p of this.pulses || []) {
          p.sprite.visible = !still;
          if (still) continue;
          const u = (t / 2600 + p.phase) % 1;
          p.curve.getPoint(u, this.tmp);
          p.sprite.position.copy(this.tmp);
          const born = this.flash.get(p.id);
          const age = born ? (t - born) / 2600 : 9;
          if (age > 3) this.flash.delete(p.id);
          p.sprite.scale.setScalar(age < 3 ? 0.07 + 0.12 * (1 - age / 3) : 0.07);
          p.sprite.material.opacity = p.dim ? 0.2 : 0.95;
        }
        this.renderer.render(this.scene, this.camera);
        this.placeLabels();
      }
      if (moving) this.kick();
    }

    /** Cada rótulo junto a su participante en la pantalla; los del fondo, más tenues. Uno que se pisaría con otro ya
        puesto se esconde (primero va el elegido y después los de más interacciones), salvo que tenga el foco. */
    placeLabels() {
      const cam = this.camera;
      const mid = cam.position.length();
      const all = [...this.labels.children];
      if (!this.sizes) this.sizes = new Map(all.map((b) => [b, [b.offsetWidth, b.offsetHeight]]));
      const sel = all.find((b) => b.dataset.key === this.model?.sel);
      const placed = [];
      for (const b of sel ? [sel, ...all.filter((x) => x !== sel)] : all) {
        const n = this.nodes.get(b.dataset.key);
        if (!n) continue;
        this.tmp.set(...n.pos).project(cam);
        const nx = (this.tmp.x * 0.5 + 0.5) * this.w;
        const ny = (-this.tmp.y * 0.5 + 0.5) * this.h;
        const d = cam.position.distanceTo(this.tmp.set(...n.pos));
        const [bw, bh] = this.sizes.get(b) || [0, 0];
        // a la derecha del nodo; si no cabe, a su izquierda (y nunca fuera del marco)
        const x = Math.round(Math.max(2, nx + 9 + bw > this.w - 2 ? nx - 9 - bw : nx + 9));
        const y = Math.round(Math.min(Math.max(2, ny - 11), this.h - bh - 2));
        const hit = placed.some((r) => x < r[0] + r[2] && r[0] < x + bw && y < r[1] + r[3] && r[1] < y + bh);
        if (!hit) placed.push([x, y, bw, bh]);
        b.style.transform = `translate(${x}px, ${y}px)`;
        b.classList.toggle('is-far', d > mid + 0.15);
        b.classList.toggle('is-hidden', hit);
      }
    }

    /** Los tres cortes por donde está `focus`: la nube tenue entera, la capa del corte en el color de la corteza, quien
        cae cerca del corte con su color y una cruz donde está el elegido. */
    drawSlices() {
      if (!this.model || !this.host.isConnected) return;
      const pts = cloud();
      const m = this.model;
      const focus = m.nodes.find((n) => n.key === m.focus) || null;
      const at = focus ? focus.pos : [0, 0, 0];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of this.cuts) {
        const W = c.canvas.clientWidth;
        const H = c.canvas.clientHeight;
        const cut = at[c.cut];
        c.cap.textContent = `${this.text.planes[c.id]} · ${AXES[c.cut]} ${cut >= 0 ? '+' : '−'}${Math.abs(cut).toFixed(2)}`;
        if (!W || !H) continue;
        c.canvas.width = Math.round(W * dpr);
        c.canvas.height = Math.round(H * dpr);
        const g = c.canvas.getContext('2d');
        if (!g) continue;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const S = GB.swarm.SHAPE;
        const scale = Math.min((W - 10) / (2 * (S[c.h] + 0.04)), (H - 10) / (2 * (S[c.v] + 0.04)));
        const X = (p) => W / 2 + p[c.h] * scale;
        const Y = (p) => H / 2 + (c.flipV ? -1 : 1) * p[c.v] * scale - (c.v === 1 ? 0.12 * scale : 0);
        const p = [0, 0, 0];
        g.fillStyle = this.colors.ink;
        g.globalAlpha = 0.12;
        for (let i = 0; i < pts.length; i += 3) {
          p[0] = pts[i];
          p[1] = pts[i + 1];
          p[2] = pts[i + 2];
          g.fillRect(X(p) - 0.5, Y(p) - 0.5, 1, 1);
        }
        g.fillStyle = this.colors.cortex;
        g.globalAlpha = 0.85;
        for (let i = 0; i < pts.length; i += 3) {
          if (Math.abs(pts[i + c.cut] - cut) > SLAB) continue;
          p[0] = pts[i];
          p[1] = pts[i + 1];
          p[2] = pts[i + 2];
          g.fillRect(X(p) - 0.8, Y(p) - 0.8, 1.6, 1.6);
        }
        g.globalAlpha = 1;
        if (focus) {
          g.strokeStyle = this.colors.ink;
          g.setLineDash([3, 3]);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(X(at), 4);
          g.lineTo(X(at), H - 4);
          g.moveTo(4, Y(at));
          g.lineTo(W - 4, Y(at));
          g.stroke();
          g.setLineDash([]);
        }
        for (const n of m.nodes) {
          if (Math.abs(n.pos[c.cut] - cut) > NEAR) continue;
          g.fillStyle = this.colors['s' + n.slot] || this.colors.s0;
          g.beginPath();
          g.arc(X(n.pos), Y(n.pos), n.key === m.focus ? 4 : 3, 0, Math.PI * 2);
          g.fill();
          if (n.key === m.focus) {
            g.strokeStyle = g.fillStyle;
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(X(n.pos), Y(n.pos), 8, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }
    }

    /** Releer los colores (cambió el tema) y volver a dibujar. */
    retheme() {
      if (!this.model || !this.host.isConnected) return;
      this.theme();
      if (this.gl) this.build3d();
      this.drawSlices();
      this.kick();
    }
  }

  GB.cortex = { create: (opts) => new Cortex(opts), PLANES };
})(window.GB);
