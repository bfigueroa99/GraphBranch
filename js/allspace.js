/* GraphBranch — todos los repos en 3D: la vista conjunta como una sola escena. Cada repo seguido es una torre, en
   el suelo de una misma ciudad: su rama por defecto sube por el centro y las demás, alrededor, en la misma espiral
   (girasol) que la vista 3D de un repo, con lo más nuevo arriba. Las torres se reparten en un anillo (con muchos
   repos, en una espiral) y cada una lleva su nombre y sus cifras en un rótulo, que es un botón: abre el repo en su
   pestaña. Lo que llega a un repo enciende su torre con una onda en el suelo.

   No hace consultas: dibuja los layouts que la vista conjunta ya calcula para cada tarjeta. Todos los commits van en
   una sola nube de puntos y todas las aristas en un solo objeto de líneas (dos llamadas de dibujo, haya los repos que
   haya); cada torre muestra como mucho sus MAX_NODES commits más nuevos y se aprieta en altura si es muy larga. Con
   movimiento reducido no gira: se dibuja solo cuando algo cambia. Todo texto del repo entra con textContent. */
(function (GB) {
  'use strict';

  const GOLDEN = 2.399963229728653;
  const SPACING = 42; // distancia entre torres vecinas
  const STEP = 0.55; // altura de cada commit…
  const HEIGHT = 36; // …hasta que la torre llega a esta altura: las más largas se aprietan
  const BASE = 0.8; // altura del commit más viejo que se ve
  const RADIUS = 11; // radio de la espiral de ramas de una torre, como mucho
  const LANE_C = 1.6; // escala de la espiral (con muchas ramas, menos: no pasa de RADIUS)
  const MAX_NODES = 3000; // commits por torre (los más nuevos)
  const RIPPLE = 2600; // lo que dura la onda de una novedad
  const NEWS = 4000; // lo que el rótulo de un repo queda encendido tras una novedad
  const AMBIENT_MS = 31; // girando sola, se dibuja a ~30 fps
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => !!motionQuery?.matches;

  /** `?all=3d`: la vista conjunta abre en 3D; `?all=2d` (o cards, tarjetas), con las tarjetas. null si no lo dice. */
  function viewParam(q) {
    const v = String(q?.get?.('all') ?? '').trim();
    if (/^3d$/i.test(v)) return '3d';
    if (/^(2d|cards|tarjetas)$/i.test(v)) return '2d';
    return null;
  }

  /** Dónde va cada una de `n` torres en el suelo ([x, z]): una sola al centro; hasta 8, en un anillo donde las vecinas
      quedan a `spacing`; más, en una espiral de girasol con el mismo aire entre vecinas. */
  function place(n, spacing = SPACING) {
    n = Math.max(0, Math.floor(n) || 0);
    if (n <= 1) return n ? [[0, 0]] : [];
    if (n <= 8) {
      const r = Math.max(spacing / 2, spacing / (2 * Math.sin(Math.PI / n)));
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [r1(Math.cos(a) * r), r1(Math.sin(a) * r)];
      });
    }
    const c = spacing / 1.7;
    return Array.from({ length: n }, (_, i) => {
      const r = c * Math.sqrt(i + 0.5);
      const a = i * GOLDEN;
      return [r1(Math.cos(a) * r), r1(Math.sin(a) * r)];
    });
  }
  const r1 = (x) => Math.round(x * 1000) / 1000;

  /** El carril de una rama alrededor del tronco ([x, z]): el 0 (la rama por defecto) al centro, los demás en espiral. */
  function lane(row, c = LANE_C) {
    if (row <= 0) return [0, 0];
    const r = c * Math.sqrt(row);
    const a = row * GOLDEN + Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /** La torre de un repo, en sus coordenadas (el tronco en x = z = 0, el suelo en y = 0), a partir del layout de su
      grafo (GB.Layout): sus `max` commits más nuevos ({ sha, x, y, z, color, head }: `head`, la punta de una rama) y las
      aristas entre ellos ({ a: [x, y, z], b: [x, y, z], color, kind }). `top`: la altura del más nuevo; `radius`: el de
      su espiral. Las ramas más allá de las que caben en RADIUS se aprietan, no se salen. */
  function tower(L, { max = MAX_NODES } = {}) {
    const all = L?.nodes || [];
    const kept = all.length > max ? [...all].sort((a, b) => b.x - a.x).slice(0, max) : all;
    if (!kept.length) return { nodes: [], edges: [], top: BASE, radius: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of kept) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
    }
    const rows = Math.max(1, (L.rows?.length || 1) - 1);
    const c = Math.min(LANE_C, RADIUS / Math.sqrt(rows));
    const step = Math.min(STEP, HEIGHT / Math.max(1, maxX - minX));
    const heads = new Set((L.heads || []).map((h) => h.sha));
    const at = new Map();
    let radius = 0;
    const nodes = kept.map((n) => {
      const [x, z] = lane(n.row, c);
      const p = { sha: n.sha, x: r1(x), y: r1(BASE + (n.x - minX) * step), z: r1(z), color: n.color, head: heads.has(n.sha) };
      radius = Math.max(radius, Math.hypot(x, z));
      at.set(n.sha, p);
      return p;
    });
    const edges = [];
    for (const e of L.edges || []) {
      const a = e.from && at.get(e.from);
      const b = e.to && at.get(e.to);
      if (!a || !b) continue;
      edges.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], color: e.color, kind: e.kind });
    }
    return { nodes, edges, top: r1(BASE + (maxX - minX) * step), radius: r1(radius) };
  }

  /** ¿Se puede dibujar en 3D? El canvas y el contexto ya creados (crear otro cuesta), o null. */
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

  /** Un punto redondo y difuso: cada commit es una luz. */
  function dotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  class Space {
    /** `wrap`: donde va la escena (se llena aquí). `opts`: { onOpen(key), text(k, p), num(n) }. */
    constructor(wrap, opts = {}) {
      this.wrap = wrap;
      this.opts = opts;
      this.repos = new Map(); // clave -> { key, name, state, L, stats, t: tower, pos, el, newsAt, newsTimer }
      this.order = [];
      this.active = false;
      this.hold = false;
      this.raf = 0;
      this.lastDraw = 0;
      this.dirty = false;
      this.ripples = [];
      this.wrap.classList.add('as-wrap');
      this.wrap.setAttribute('role', 'group');
      this.labels = document.createElement('div');
      this.labels.className = 'as-labels';
      this.note = document.createElement('p');
      this.note.className = 'as-nogl';
      this.note.hidden = true;
      this.wrap.append(this.labels, this.note);
      this.labels.addEventListener('click', (e) => {
        const b = e.target.closest?.('.as-label[data-key]');
        if (b) this.opts.onOpen?.(b.dataset.key);
      });
      // con el puntero sobre un rótulo la ciudad deja de girar: el rótulo se queda quieto para el clic
      const still = (on) => {
        this.still = on;
        if (this.controls) this.controls.autoRotate = this.spinning();
        this.kick();
      };
      this.labels.addEventListener('pointerover', (e) => e.target.closest?.('.as-label') && still(true));
      this.labels.addEventListener('pointerout', (e) => !e.relatedTarget?.closest?.('.as-label') && still(false));
      this.labels.addEventListener('focusin', (e) => {
        const b = e.target.closest?.('.as-label[data-key]');
        // con el teclado, la cámara va a la torre del rótulo enfocado (con el puntero se ve dónde se hace clic)
        if (b && b.matches(':focus-visible')) this.focus(b.dataset.key);
      });
      try {
        this.setup();
      } catch (err) {
        console.error(err);
        this.gl = false;
      }
      if (!this.gl) this.wrap.classList.add('is-flat');
      this.note.hidden = !!this.gl; // sin 3D, los rótulos quedan en una lista y la nota dice por qué
      this.note.textContent = this.opts.text?.('webgl.missing') || '';
      this.resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
      this.resizeObs?.observe(this.wrap);
      motionQuery?.addEventListener?.('change', () => {
        if (this.controls) this.controls.autoRotate = this.spinning();
        this.kick();
      });
    }

    setup() {
      const p = probe();
      this.gl = !!p;
      if (!p) return;
      this.renderer = new THREE.WebGLRenderer({ canvas: p.canvas, context: p.context, antialias: true, alpha: true });
      this.renderer.setClearColor(0x000000, 0);
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'as-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.wrap.prepend(this.canvas);
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xffffff, 120, 420);
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
      this.camera.position.set(0, 46, 92);
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.6, zoomSpeed: 0.9, autoRotate: this.spinning(), autoRotateSpeed: 0.35, minDistance: 8, maxDistance: 600, maxPolarAngle: Math.PI * 0.47, screenSpacePanning: false });
      this.controls.target.set(0, 14, 0);
      this.controls.addEventListener('change', () => this.kick());
      this.controls.addEventListener('start', () => {
        this.dragging = true;
        this.moved = true; // desde ahora la cámara es de quien mira: los datos nuevos no la vuelven a encuadrar
        this.goal = null; // quien arrastra manda sobre el viaje a una torre
      });
      this.controls.addEventListener('end', () => (this.dragging = false));
      this.dot = dotTexture();
      this.nodeMat = new THREE.PointsMaterial({ size: 1.15, sizeAttenuation: true, vertexColors: true, map: this.dot, transparent: true, alphaTest: 0.05, depthWrite: false });
      this.headMat = new THREE.PointsMaterial({ size: 2.3, sizeAttenuation: true, vertexColors: true, map: this.dot, transparent: true, alphaTest: 0.05, depthWrite: false });
      this.edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
      this.baseMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      this.discMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
      this.rippleMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
      this.nodes = new THREE.Points(new THREE.BufferGeometry(), this.nodeMat);
      this.heads = new THREE.Points(new THREE.BufferGeometry(), this.headMat);
      this.edges = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMat);
      this.bases = new THREE.Group();
      this.rippleGroup = new THREE.Group();
      this.ringGeo = new THREE.RingGeometry(0.94, 1, 72);
      this.discGeo = new THREE.CircleGeometry(1, 72);
      this.scene.add(this.bases, this.edges, this.nodes, this.heads, this.rippleGroup);
      this.tmp = new THREE.Vector3();
      this.theme();
    }

    /** ¿Gira sola? Sin movimiento reducido, sin la pausa del modo TV y sin el puntero sobre un rótulo. */
    spinning() {
      return !reduceMotion() && !this.hold && !this.still;
    }

    /** Los colores del tema, leídos del contenedor (tiene que estar en la página). */
    theme() {
      const cs = getComputedStyle(this.wrap);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      this.colors = { ghost: v('--ghost', '#b4bdb9') };
      for (let i = 1; i <= 8; i++) this.colors['c' + i] = v('--s' + i, '#888888');
      this.colorObjs = new Map();
      if (!this.gl) return;
      const bg = new THREE.Color(v('--surface', '#ffffff'));
      const hsl = {};
      bg.getHSL(hsl);
      this.dark = hsl.l < 0.5;
      this.scene.fog.color.copy(bg);
      this.lineCol = new THREE.Color(v('--line-strong', '#c9d1cd'));
      this.inkCol = new THREE.Color(v('--ink-3', '#636e6a'));
      this.goodCol = new THREE.Color(v('--good', '#0a8f0a'));
      const blend = this.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      for (const m of [this.nodeMat, this.headMat, this.rippleMat]) {
        m.blending = blend;
        m.needsUpdate = true;
      }
      this.edgeMat.opacity = this.dark ? 0.55 : 0.75;
      this.baseMat.color.copy(this.lineCol);
      this.discMat.color.copy(this.inkCol);
      this.discMat.opacity = this.dark ? 0.12 : 0.06;
      this.rippleMat.color.copy(this.goodCol);
    }

    /** El color de una clase de rama ('ghost' o 'c<n>'): del 1 al 8 los del CSS, del 9 en adelante la paleta generada. */
    col(key) {
      let c = this.colorObjs.get(key);
      if (c) return c;
      let hex = this.colors[key];
      if (!hex) {
        const n = Number(/^c(\d+)$/.exec(key || '')?.[1]);
        hex = n > (GB.palette?.base || 8) && GB.palette?.hex ? GB.palette.hex(n, this.dark) : this.colors.ghost;
      }
      this.colorObjs.set(key, (c = new THREE.Color(hex)));
      return c;
    }

    /** Los repos, en el orden de las pestañas: [{ key, name, state, stateText }]. Los que ya no están se van; las torres
        se reparten de nuevo. */
    sync(items) {
      const keep = new Set(items.map((it) => it.key));
      for (const [k, r] of this.repos) {
        if (keep.has(k)) continue;
        r.el.remove();
        clearTimeout(r.newsTimer);
        this.repos.delete(k);
      }
      items.forEach((it, i) => {
        let r = this.repos.get(it.key);
        if (!r) this.repos.set(it.key, (r = { key: it.key, L: null, stats: null, t: null, el: this.makeLabel(it.key), newsAt: 0 }));
        r.name = it.name;
        r.state = it.state || 'loading';
        r.stateText = it.stateText || '';
        if (this.labels.children[i] !== r.el) this.labels.insertBefore(r.el, this.labels.children[i] || null);
        this.paintLabel(r);
      });
      const order = items.map((it) => it.key).join('\n');
      if (order !== this.order.join('\n')) {
        this.order = items.map((it) => it.key);
        const at = place(this.order.length);
        this.order.forEach((k, i) => (this.repos.get(k).pos = at[i]));
        this.reframe = true; // con otros repos, la cámara vuelve a encuadrar la ciudad entera (al dibujarla)
        this.dirty = true;
      }
      this.wrap.setAttribute('aria-label', this.opts.text?.('all.spaceAria', { n: this.order.length }) || '');
      // con muchas torres, los rótulos solo con el nombre (las cifras siguen en su nombre accesible y en las tarjetas)
      this.wrap.classList.toggle('is-many', this.order.length > 8);
      this.kick();
    }

    makeLabel(key) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'as-label';
      b.dataset.key = key;
      const head = document.createElement('span');
      head.className = 'as-lhead';
      const dot = document.createElement('span');
      dot.className = 'as-dot';
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'as-name';
      name.dir = 'ltr';
      head.append(dot, name);
      const stats = document.createElement('span');
      stats.className = 'as-stats';
      b.append(head, stats);
      return b;
    }

    /** El rótulo de una torre: nombre, estado y cifras (solo lo que cambió). */
    paintLabel(r) {
      const t = this.opts.text || ((k) => k);
      const num = this.opts.num || String;
      const set = (n, s) => n.textContent !== s && (n.textContent = s);
      r.el.dataset.state = r.state;
      set(r.el.querySelector('.as-name'), r.name);
      const s = r.stats;
      set(r.el.querySelector('.as-stats'), s ? t('all.stats', { branches: num(s.branches), commits: num(s.commits), prs: num(s.prs) }) : r.stateText || '');
      const label = [r.name, r.state === 'live' ? '' : r.stateText, s ? r.el.querySelector('.as-stats').textContent : '', t('all.open')].filter(Boolean).join(', ');
      if (r.el.getAttribute('aria-label') !== label) r.el.setAttribute('aria-label', label);
      r.el.title = `${r.name} · ${t('all.open')}`;
    }

    /** Lo nuevo de un repo: su layout (el de su tarjeta) y sus cifras ({ branches, commits, prs }). */
    update(key, L, stats) {
      const r = this.repos.get(key);
      if (!r) return;
      r.L = L;
      r.stats = stats || null;
      r.t = null; // la torre se rehace al dibujar
      this.paintLabel(r);
      this.dirty = true;
      this.kick();
    }

    /** Una novedad en un repo: una onda sale del pie de su torre y su rótulo se enciende un momento. */
    celebrate(key) {
      const r = this.repos.get(key);
      if (!r) return;
      r.el.classList.remove('as-news');
      void r.el.offsetWidth;
      r.el.classList.add('as-news');
      clearTimeout(r.newsTimer);
      r.newsTimer = setTimeout(() => r.el.classList.remove('as-news'), NEWS);
      if (!this.gl || !r.pos || reduceMotion()) return;
      const mesh = new THREE.Mesh(this.ringGeo, this.rippleMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.pos[0], 0.05, r.pos[1]);
      this.rippleGroup.add(mesh);
      this.ripples.push({ mesh, t0: performance.now(), r: Math.max(4, (r.t?.radius || 0) + 2) });
      this.kick();
    }

    /** La cámara va hacia la torre de un repo (sin cambiar cuánto se ve). */
    focus(key) {
      const r = this.repos.get(key);
      if (!r?.pos || !this.gl) return;
      this.moved = true;
      this.goal = new THREE.Vector3(r.pos[0], Math.max(8, (r.t?.top || 10) * 0.5), r.pos[1]);
      this.kick();
    }

    /** La cámara a la distancia que deja ver la ciudad entera: todas las torres, de lado a lado y con sus rótulos
        arriba, desde algo más alto que ellas. `top`: la altura de la torre más alta. */
    fitCamera(top = HEIGHT) {
      if (!this.gl) return;
      this.reframe = false;
      const n = this.order.length;
      const span = (n <= 1 ? 0 : Math.max(...place(n).map(([x, z]) => Math.hypot(x, z)))) + RADIUS + 4;
      const high = top + 10; // con el rótulo
      const vfov = (this.camera.fov * Math.PI) / 360;
      const hfov = Math.atan(Math.tan(vfov) * Math.max(0.5, this.camera.aspect || 1));
      const tilt = 0.52; // radianes sobre el horizonte: desde arriba, las torres de atrás no tapan a las de adelante
      // de alto: las torres y el suelo de la ciudad visto en escorzo (las de adelante bajan, las de atrás suben)
      const tall = high * Math.cos(tilt) + 2 * span * Math.sin(tilt);
      const d = Math.max(40, (tall * 0.56) / Math.tan(vfov), span / Math.tan(hfov)) * 1.1;
      this.controls.target.set(0, high * 0.42, 0);
      const dir = this.camera.position.clone().sub(this.controls.target);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(Math.cos(tilt) * d);
      dir.y = Math.sin(tilt) * d;
      this.camera.position.copy(this.controls.target).add(dir);
      this.controls.maxDistance = Math.max(600, d * 3);
      this.scene.fog.near = d * 1.1;
      this.scene.fog.far = d * 3.6;
      this.camera.far = Math.max(2000, d * 6);
      this.camera.updateProjectionMatrix();
    }

    /** Rehace las nubes de puntos y las líneas con las torres de todos (dos llamadas de dibujo en total). */
    build() {
      this.dirty = false;
      if (!this.gl) return;
      let nN = 0;
      let nH = 0;
      let nE = 0;
      let top = 0;
      const list = this.order.map((k) => this.repos.get(k)).filter((r) => r?.pos);
      for (const r of list) {
        if (!r.t) r.t = tower(r.L);
        for (const n of r.t.nodes) n.head ? nH++ : nN++;
        nE += r.t.edges.length;
        if (r.t.nodes.length) top = Math.max(top, r.t.top);
      }
      // mientras nadie mueva la cámara, encuadra la ciudad entera cada vez que crece (los repos cargan de a uno);
      // después manda quien mira, salvo que cambien los repos
      if (top && (this.reframe || !this.moved)) {
        this.framed = true;
        this.fitCamera(top);
      }
      const nodePos = new Float32Array(nN * 3);
      const nodeCol = new Float32Array(nN * 3);
      const headPos = new Float32Array(nH * 3);
      const headCol = new Float32Array(nH * 3);
      const edgePos = new Float32Array(nE * 6);
      const edgeCol = new Float32Array(nE * 6);
      let i = 0;
      let h = 0;
      let e = 0;
      for (const r of list) {
        const [ox, oz] = r.pos;
        for (const n of r.t.nodes) {
          const c = this.col(n.color);
          if (n.head) {
            headPos.set([ox + n.x, n.y, oz + n.z], h * 3);
            headCol.set([c.r, c.g, c.b], h * 3);
            h++;
          } else {
            nodePos.set([ox + n.x, n.y, oz + n.z], i * 3);
            nodeCol.set([c.r, c.g, c.b], i * 3);
            i++;
          }
        }
        for (const x of r.t.edges) {
          const c = this.col(x.color);
          edgePos.set([ox + x.a[0], x.a[1], oz + x.a[2], ox + x.b[0], x.b[1], oz + x.b[2]], e * 6);
          edgeCol.set([c.r, c.g, c.b, c.r, c.g, c.b], e * 6);
          e++;
        }
      }
      const put = (obj, pos, col) => {
        obj.geometry.dispose();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.computeBoundingSphere();
        obj.geometry = g;
      };
      put(this.nodes, nodePos, nodeCol);
      put(this.heads, headPos, headCol);
      put(this.edges, edgePos, edgeCol);
      // el pie de cada torre: un aro y un disco tenue, del tamaño de su espiral
      for (const m of [...this.bases.children]) this.bases.remove(m);
      for (const r of list) {
        const size = Math.max(3, r.t.radius + 1.6);
        for (const [geo, mat] of [
          [this.ringGeo, this.baseMat],
          [this.discGeo, this.discMat],
        ]) {
          const m = new THREE.Mesh(geo, mat);
          m.rotation.x = -Math.PI / 2;
          m.position.set(r.pos[0], 0.02, r.pos[1]);
          m.scale.setScalar(size);
          this.bases.add(m);
        }
      }
      this.needsRender = true;
    }

    /** Pone (o quita) la escena en marcha: solo se dibuja mientras se ve. */
    setActive(on) {
      this.active = !!on;
      if (this.active) {
        this.resize();
        this.kick();
      }
    }

    /** La pausa del modo TV: deja de girar. */
    setHold(on) {
      this.hold = !!on;
      if (this.controls) this.controls.autoRotate = this.spinning();
      this.kick();
    }

    kick() {
      this.needsRender = true;
      if (!this.raf && this.active) this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    resize() {
      if (!this.gl || !this.wrap.isConnected) return;
      const w = this.wrap.clientWidth;
      const h = this.wrap.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      const first = !this.w;
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (first && this.framed) this.reframe = this.dirty = true; // se encuadró sin saber la forma del lienzo
      this.kick();
    }

    frame(now) {
      this.raf = 0;
      if (!this.active || !this.wrap.isConnected) return;
      if (this.dirty) this.build();
      let moving = false;
      if (this.gl) {
        if (this.goal) {
          // la cámara y su centro se mueven juntos hacia la torre: se ve igual, desde otro lugar
          const d = this.goal.clone().sub(this.controls.target);
          if (d.length() < 0.05) this.goal = null;
          else {
            d.multiplyScalar(0.12);
            this.controls.target.add(d);
            this.camera.position.add(d);
          }
          moving = true;
        }
        for (const x of [...this.ripples]) {
          const p = (now - x.t0) / RIPPLE;
          if (p >= 1) {
            this.rippleGroup.remove(x.mesh);
            x.mesh.material.dispose();
            this.ripples.splice(this.ripples.indexOf(x), 1);
            continue;
          }
          x.mesh.scale.setScalar(x.r * (0.3 + 1.4 * p));
          x.mesh.material.opacity = 0.65 * (1 - p);
          moving = true;
        }
        const spin = this.controls.autoRotate;
        const changed = this.controls.update();
        if (changed || moving) this.needsRender = true;
        const due = this.needsRender && (!spin || moving || this.dragging || now - this.lastDraw >= AMBIENT_MS);
        if (due) {
          this.renderer.render(this.scene, this.camera);
          this.placeLabels();
          this.lastDraw = now;
          this.needsRender = false;
        }
        if (spin || moving || changed || this.dragging || this.needsRender) this.kick(); // con la inercia, hasta que se detiene
      } else this.placeLabels();
    }

    /** Cada rótulo sobre su torre, en la pantalla (o escondido si quedó detrás de la cámara). Sin 3D, en una lista. */
    placeLabels() {
      if (!this.gl) return;
      const w = this.w || this.wrap.clientWidth;
      const h = this.h || this.wrap.clientHeight;
      for (const k of this.order) {
        const r = this.repos.get(k);
        if (!r?.pos) continue;
        this.tmp.set(r.pos[0], (r.t?.top ?? 4) + 3, r.pos[1]).project(this.camera);
        const off = this.tmp.z > 1 || this.tmp.x < -1.2 || this.tmp.x > 1.2 || this.tmp.y < -1.2 || this.tmp.y > 1.2;
        r.el.classList.toggle('is-off', off);
        if (off) continue;
        const x = Math.round((this.tmp.x * 0.5 + 0.5) * w);
        const y = Math.round((-this.tmp.y * 0.5 + 0.5) * h);
        const tr = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        if (r.el.style.transform !== tr) r.el.style.transform = tr;
        // lo más cercano, encima
        const z = String(Math.round((1 - this.tmp.z) * 1e5));
        if (r.el.style.zIndex !== z) r.el.style.zIndex = z;
      }
    }

    /** Releer los colores (cambió el tema) y volver a dibujar. */
    retheme() {
      if (!this.wrap.isConnected) return;
      this.theme();
      this.dirty = true;
      this.kick();
    }

    /** Cambió el idioma: los rótulos y el nombre de la escena. */
    relocalize() {
      for (const r of this.repos.values()) this.paintLabel(r);
      this.note.textContent = this.opts.text?.('webgl.missing') || '';
      this.wrap.setAttribute('aria-label', this.opts.text?.('all.spaceAria', { n: this.order.length }) || '');
    }
  }

  GB.allspace = { viewParam, place, lane, tower, create: (wrap, opts) => new Space(wrap, opts), MAX_NODES, HEIGHT, RADIUS };
})(window.GB);
