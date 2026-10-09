/* GraphBranch — vista 3D con Three.js.
   El tiempo avanza hacia la cámara (eje Z): lo más nuevo queda adelante, junto
   al anillo del presente, y la historia se pierde en la niebla. La rama por
   defecto es el tronco central; las demás se reparten a su alrededor en una
   espiral (girasol), las más activas más cerca del tronco, así caben decenas
   de ramas sin taparse. Recibe el mismo layout que la vista 2D.

   Rendimiento: los commits y todas las aristas se dibujan con InstancedMesh
   (unas pocas llamadas de dibujo aunque haya miles de ramas): las curvas de
   bifurcación y merge son tramos rectos instanciados, más densos donde la
   curva dobla, y las líneas punteadas van todas en un solo objeto. Los halos
   son cuadrados instanciados. Las matrices se reescriben solo mientras algo
   se mueve; en reposo cada cuadro solo avanza los uniformes de los efectos
   (pulsos, polvo, estrellas) y se dibuja a ~30 fps, o nada si el sistema pide
   reducir el movimiento. Las etiquetas de rama son HTML: se crean al
   mostrarse y, con muchas ramas, solo se ven las más cercanas que no se pisan.
   Al pasar el puntero por una etiqueta su rama se resalta y lo demás se funde
   con el fondo; de cerca, cada commit muestra su mensaje.

   Modo galaxias (galaxy.js): el mismo layout, en otro lugar. Cada rama es una galaxia, sus
   commits un brazo en espiral y sus archivos, planetas que aparecen al acercarse; el valle,
   el anillo del presente y los días dejan paso al espacio. Todo lo demás (efectos, director,
   vuelo, Replay) sigue igual: solo cambian las posiciones de destino y las curvas. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const tr = i18n.t;
  const SP = 2.0; // distancia entre commits en el eje del tiempo
  const LANE_C = 3.0; // escala de la espiral de carriles
  const GOLDEN = 2.399963229728653;
  const DUR = 700; // reacomodo de commits y etiquetas
  const MORPH = 1500; // al cambiar entre el valle y las galaxias, cada commit vuela a su lugar nuevo
  const ARRIVE = 650; // vuelo de un commit nuevo desde el presente hasta su lugar
  const ARRIVE_Z = 7; // desde cuán lejos (hacia la cámara) llega
  const NODE_R = 0.42;
  const HEAD_SCALE = 1.55;
  const EDGE_R = 0.055; // radio de las aristas: finas, como líneas
  const GHOST_R = 0.035;
  const RADIAL = 12; // lados de los tubos (de cerca, menos se ven como facetas)
  const RADIAL_MID = 8; // con miles de tramos
  const THIN_D = 12; // a menos de esta distancia de la cámara los tubos se afinan: tope de grosor aparente
  const AMBIENT_MS = 31; // en reposo, los efectos se dibujan a ~30 fps
  const MAX_PIXELS = 4.6e6; // tope de píxeles del lienzo (pantallas 4K a pantalla completa)
  const SPIN_SPEED = 0.037; // rad/s del giro lento
  const SWAY = 0.55; // en el valle el giro es un vaivén: hasta tantos radianes a cada lado…
  const SWAY_T = 95; // …en tantos segundos de ida y vuelta (a la misma velocidad que el giro)
  const CURVE_SEGS = 18; // tramos de una curva lejana (las cortas, menos)
  const MAX_LABELS = 160; // etiquetas de rama a la vez, como mucho
  const FADE_MAX = 60; // hasta tantas ramas a la vista las tapadas se atenúan; con más, se ocultan
  const NOTE_D = 19; // a menos de esta distancia de la cámara (en la vista general, más), cada commit muestra su mensaje
  const MAX_NOTES = 14; // mensajes a la vez, como mucho
  const DIM = 0.82; // con una rama resaltada, cuánto se funde lo demás con el fondo
  const HL_MS = 220; // lo que tarda en apagarse o volver
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeOutBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => !!motionQuery?.matches;

  function lane(row) {
    if (row <= 0) return [0, 0];
    const r = LANE_C * Math.sqrt(row);
    const a = row * GOLDEN + Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /* ---------- shaders ---------- */

  /* Materiales estándar retocados: el emisivo toma el color de cada instancia, los commits
     tienen un brillo de borde (parecen esferas de vidrio) y las ramas vivas llevan pulsos de
     luz que viajan hacia el presente. Los pulsos dependen de la posición en el mundo, así
     que recorren igual las rectas instanciadas y las curvas. */
  const EMISSIVE = '#include <emissivemap_fragment>';
  const TINT_GLSL = `
    #ifdef USE_COLOR
      totalEmissiveRadiance *= vColor;
    #endif`;
  /* lo que ya se perdió en la niebla no se dibuja: se saca del recorte la instancia entera
     (por su extremo más cercano, así ningún tubo queda a medias) */
  const FOG_CULL_GLSL = `
    #ifdef USE_INSTANCING
      float gbNear = min( -( modelViewMatrix * instanceMatrix[ 3 ] ).z, -( modelViewMatrix * ( instanceMatrix[ 3 ] + instanceMatrix[ 2 ] ) ).z );
      if ( gbNear > gbFog.y + 2.0 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #endif`;

  function nodeHook(uniforms) {
    return (sh) => {
      sh.uniforms.gbRim = uniforms.rim;
      sh.uniforms.gbFog = uniforms.fog;
      sh.vertexShader = 'uniform vec2 gbFog;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>${FOG_CULL_GLSL}`);
      sh.fragmentShader =
        'uniform float gbRim;\n' +
        sh.fragmentShader.replace(
          EMISSIVE,
          `${EMISSIVE}${TINT_GLSL}
          float gbF = 1.0 - abs( dot( normal, normalize( vViewPosition ) ) );
          totalEmissiveRadiance += diffuseColor.rgb * gbF * gbF * gbF * gbRim;`,
        );
    };
  }

  /* Tope de grosor aparente: un tubo que pasa junto a la cámara se afina (como una línea de ancho
     fijo en pantalla) en vez de volverse una cañería que tapa la vista. El cilindro unitario va por
     z de 0 a 1, así que (0, 0, position.z) es el punto del eje bajo cada vértice. */
  const THIN_GLSL = `
    #include <begin_vertex>
    #ifdef USE_INSTANCING
      vec3 gbAxis = ( instanceMatrix * vec4( 0.0, 0.0, position.z, 1.0 ) ).xyz;
      float gbDepth = -( modelViewMatrix * vec4( gbAxis, 1.0 ) ).z;
      transformed.xy *= clamp( gbDepth / gbThin, 0.05, 1.0 );
    #else
      vec3 gbAxis = transformed;
    #endif`;

  /** Tubos sin pulsos (tramos de la historia que sigue): solo el afinado junto a la cámara. */
  function thinHook(thin) {
    return (sh) => {
      sh.uniforms.gbThin = thin;
      sh.vertexShader = 'uniform float gbThin;\n' + sh.vertexShader.replace('#include <begin_vertex>', THIN_GLSL);
    };
  }

  function flowHook(flow, time, fog, thin) {
    return (sh) => {
      sh.uniforms.gbFlow = flow;
      sh.uniforms.gbTime = time;
      sh.uniforms.gbFog = fog;
      sh.uniforms.gbThin = thin;
      // el pulso se mide sobre el eje del tubo, no sobre su superficie: así su frente es
      // perpendicular al tubo y no una cuña (de cerca se veía como una punta de flecha)
      sh.vertexShader =
        'uniform vec2 gbFog;\nuniform float gbThin;\nvarying vec3 vGbPos;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', THIN_GLSL).replace(
          '#include <project_vertex>',
          `#include <project_vertex>${FOG_CULL_GLSL}
          vGbPos = ( modelMatrix * vec4( gbAxis, 1.0 ) ).xyz;`,
        );
      sh.fragmentShader =
        'uniform float gbFlow;\nuniform float gbTime;\nvarying vec3 vGbPos;\n' +
        sh.fragmentShader.replace(
          EMISSIVE,
          `${EMISSIVE}${TINT_GLSL}
          float gbQ = fract( vGbPos.z * 0.11 - gbTime * 0.24 + length( vGbPos.xy ) * 0.37 );
          // cometa: la cola sube despacio y el frente se apaga suave, sin corte seco
          float gbP = smoothstep( 0.6, 0.93, gbQ ) * ( 1.0 - smoothstep( 0.93, 1.0, gbQ ) );
          totalEmissiveRadiance += mix( diffuseColor.rgb, vec3( 1.0 ), 0.35 ) * gbP * gbFlow;`,
        );
    };
  }

  /* halos: cuadrados que miran a la cámara; se desvanecen con la misma niebla de la escena */
  const GLOW_VS = `
    attribute vec3 iPos;
    attribute vec4 iColor;
    attribute vec2 iSize;
    uniform float uTime;
    uniform vec2 uFog;
    varying vec2 vUv;
    varying vec4 vColor;
    void main() {
      float beat = iSize.y * sin( uTime * 2.4 + iPos.z * 0.45 );
      vec4 mv = modelViewMatrix * vec4( iPos, 1.0 );
      // tamaño aparente con tope: un halo que pasa junto a la cámara no tapa la vista
      float size = min( iSize.x, max( 0.05, -mv.z ) * 0.16 );
      mv.xy += position.xy * size * ( 1.0 + 0.14 * beat );
      gl_Position = projectionMatrix * mv;
      vUv = uv;
      float fade = 1.0 - smoothstep( uFog.x, uFog.y, -mv.z );
      vColor = vec4( iColor.rgb, iColor.a * fade * ( 1.0 + 0.25 * beat ) );
      if ( vColor.a < 0.004 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); // perdido en la niebla: fuera del recorte
    }`;
  const GLOW_FS = `
    varying vec2 vUv;
    varying vec4 vColor;
    void main() {
      float d = length( vUv - 0.5 ) * 2.0;
      if ( d >= 1.0 ) discard;
      float a = 1.0 - d;
      a = a * a * 0.7 + pow( a, 6.0 ) * 0.3;
      gl_FragColor = vec4( vColor.rgb, a * vColor.a );
    }`;

  /* anillo del presente: línea fina, halo que respira y marcas que giran despacio */
  const PORTAL_VS = `
    varying vec2 vP;
    void main() {
      vP = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;
  const PORTAL_FS = `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    uniform float uFlash;
    varying vec2 vP;
    void main() {
      vec2 p = vP;
      float r = length( p );
      float dl = ( r - 1.0 ) / 0.006;
      float dh = ( r - 1.0 ) / 0.04;
      float line = exp( -dl * dl );
      float halo = exp( -dh * dh );
      float ang = atan( p.y, p.x ) / 6.2831853 + uTime * 0.006;
      float ticks = step( 0.9, fract( ang * 120.0 ) ) * step( 1.018, r ) * step( r, 1.034 );
      float major = step( 0.985, fract( ang * 12.0 ) ) * step( 1.018, r ) * step( r, 1.05 );
      float inner = smoothstep( 0.9, 1.0, r ) * ( 1.0 - step( 1.0, r ) ) * 0.05;
      float k = line * 0.6 + halo * ( 0.1 + 0.05 * sin( uTime * 1.3 ) ) + ticks * 0.16 + major * 0.3 + inner;
      k += uFlash * ( halo * 0.7 + line * 0.4 + inner * 3.0 );
      gl_FragColor = vec4( uColor, clamp( k, 0.0, 1.0 ) * uOpacity );
    }`;

  /* PR fusionado: un cometa recorre el tubo del arco y deja una estela que se apaga */
  const ARC_VS = `
    varying float vU;
    void main() {
      vU = uv.x;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;
  const ARC_FS = `
    uniform vec3 uColor;
    uniform float uHead;
    uniform float uOpacity;
    varying float vU;
    uniform float uPath;
    void main() {
      float d = uHead - vU;
      // por delante del cometa, el trayecto apenas insinuado; por detrás, la estela que se apaga
      float a = ( d < 0.0 ? uPath : exp( -d * 2.5 ) ) * uOpacity;
      if ( a < 0.004 ) discard;
      gl_FragColor = vec4( mix( uColor, vec3( 1.0 ), d < 0.0 ? 0.0 : exp( -d * 30.0 ) * 0.7 ), a );
    }`;

  /* PR abierto: un haz vertical que se desvanece hacia arriba, con bandas de luz que suben */
  const BEAM_VS = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;
  const BEAM_FS = `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      float fall = pow( 1.0 - vUv.y, 1.5 );
      float bands = 0.72 + 0.28 * sin( vUv.y * 24.0 - uTime * 6.0 );
      gl_FragColor = vec4( mix( uColor, vec3( 1.0 ), 0.2 ), fall * bands * uOpacity );
    }`;

  /* estrellas lejanas: siguen a la cámara (solo giran con la vista) y titilan */
  const STAR_VS = `
    attribute float aSeed;
    uniform float uTime;
    uniform float uPx;
    uniform float uAll;
    varying float vA;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_PointSize = ( 0.9 + aSeed * aSeed * 2.3 ) * uPx;
      vA = ( 0.3 + 0.7 * aSeed ) * ( 0.75 + 0.25 * sin( uTime * ( 0.5 + aSeed * 1.9 ) + aSeed * 91.0 ) );
      vA *= mix( smoothstep( -0.02, 0.12, normalize( position ).y ), 1.0, uAll ); // bajo el horizonte está el suelo (en el espacio, no)
    }`;
  /* polvo alrededor de las ramas: deriva despacio hacia el pasado, en una ventana que sigue a la vista */
  const DUST_VS = `
    attribute float aSeed;
    uniform float uTime;
    uniform float uR;
    uniform float uZ0;
    uniform float uLen;
    uniform float uScale;
    uniform vec2 uFog;
    varying float vA;
    void main() {
      float z = uZ0 + mod( position.z * uLen - uTime * 0.35 - uZ0, uLen );
      float ang = position.x + sin( uTime * 0.07 + aSeed * 6.2831 ) * 0.04;
      float r = uR * position.y;
      vec4 mv = modelViewMatrix * vec4( cos( ang ) * r, sin( ang ) * r, z, 1.0 );
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max( 1.0, ( 0.09 + aSeed * 0.15 ) * uScale / max( 0.1, -mv.z ) );
      float u = ( z - uZ0 ) / uLen;
      vA = ( 1.0 - smoothstep( uFog.x, uFog.y, -mv.z ) ) * smoothstep( 0.0, 0.1, u ) * smoothstep( 1.0, 0.9, u ) * ( 0.35 + 0.65 * aSeed );
    }`;
  const POINT_FS = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vA;
    void main() {
      float d = length( gl_PointCoord - 0.5 ) * 2.0;
      float a = 1.0 - smoothstep( 0.0, 1.0, d );
      gl_FragColor = vec4( uColor, a * a * vA * uOpacity );
    }`;

  /* el mapa del repo pintado en el fondo del valle: la sombra de cada rama, que se pierde con la niebla */
  const GROUND_VS = `
    uniform vec2 uFog;
    varying vec3 vC;
    varying float vA;
    void main() {
      vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mv;
      vC = instanceColor;
      vA = 1.0 - smoothstep( uFog.x, uFog.y * 1.3, -mv.z );
    }`;
  const GROUND_FS = `
    uniform float uOpacity;
    varying vec3 vC;
    varying float vA;
    void main() {
      gl_FragColor = vec4( vC, vA * uOpacity );
    }`;

  /* ---------- lotes instanciados ---------- */

  const nextCap = (n) => Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

  /** Marca para subir a la GPU solo los primeros `count` valores del atributo. */
  function upload(attr, count) {
    attr.updateRange.offset = 0;
    attr.updateRange.count = Math.max(1, count);
    attr.needsUpdate = true;
  }

  /** InstancedMesh que crece según haga falta. Se rellena entero en cada pasada: begin(n), point/segment…, end(). */
  class Instances {
    constructor(parent, geo, mat) {
      this.parent = parent;
      this.geo = geo;
      this.mat = mat;
      this.cap = 0;
      this.n = 0;
      this.mesh = null;
    }

    setGeometry(geo) {
      if (geo === this.geo) return;
      this.geo = geo;
      if (this.mesh) this.mesh.geometry = geo;
    }

    begin(max) {
      if (!this.mesh || max > this.cap) this.alloc(nextCap(max));
      this.n = 0;
      this.m = this.mesh.instanceMatrix.array;
      this.c = this.mesh.instanceColor.array;
    }

    alloc(cap) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // las instancias se reparten por toda la escena
      mesh.count = 0;
      if (this.mesh) {
        this.parent.remove(this.mesh);
        this.mesh.dispose();
      }
      this.parent.add(mesh);
      this.mesh = mesh;
      this.cap = cap;
    }

    color(col) {
      const o = this.n * 3;
      this.c[o] = col.r;
      this.c[o + 1] = col.g;
      this.c[o + 2] = col.b;
      this.n++;
    }

    /** Esfera o toro: escala uniforme, sin rotación. */
    point(x, y, z, s, col) {
      if (this.n >= this.cap) return;
      const m = this.m;
      const o = this.n * 16;
      m.fill(0, o, o + 16);
      m[o] = m[o + 5] = m[o + 10] = s;
      m[o + 12] = x;
      m[o + 13] = y;
      m[o + 14] = z;
      m[o + 15] = 1;
      this.color(col);
    }

    /** Tubo recto de a a b con radio r (el cilindro unitario va de z = 0 a z = 1), alargado `ext`
        por cada punta: así los tramos de una curva se solapan y no dejan huecos en los codos. */
    segment(ax, ay, az, bx, by, bz, r, col, ext = 0) {
      if (this.n >= this.cap) return;
      let dx = bx - ax;
      let dy = by - ay;
      let dz = bz - az;
      let len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) return;
      dx /= len;
      dy /= len;
      dz /= len;
      if (ext) {
        ax -= dx * ext;
        ay -= dy * ext;
        az -= dz * ext;
        len += ext * 2;
      }
      // base ortonormal (u, v, d): u = d × eje Y, o d × eje X si d es casi vertical
      let ux = -dz;
      let uy = 0;
      let uz = dx;
      if (Math.abs(dy) > 0.9) (ux = 0), (uy = dz), (uz = -dy);
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const m = this.m;
      const o = this.n * 16;
      m[o] = ux * r;
      m[o + 1] = uy * r;
      m[o + 2] = uz * r;
      m[o + 3] = 0;
      m[o + 4] = (dy * uz - dz * uy) * r;
      m[o + 5] = (dz * ux - dx * uz) * r;
      m[o + 6] = (dx * uy - dy * ux) * r;
      m[o + 7] = 0;
      m[o + 8] = dx * len;
      m[o + 9] = dy * len;
      m[o + 10] = dz * len;
      m[o + 11] = 0;
      m[o + 12] = ax;
      m[o + 13] = ay;
      m[o + 14] = az;
      m[o + 15] = 1;
      this.color(col);
    }

    end() {
      this.mesh.count = this.n;
      this.mesh.visible = this.n > 0;
      // a la GPU sube solo lo usado, no toda la capacidad (con miles de ramas son megas por cuadro)
      upload(this.mesh.instanceMatrix, this.n * 16);
      upload(this.mesh.instanceColor, this.n * 3);
    }
  }

  /** Halos: cuadrados instanciados que miran a la cámara (sin el tope de tamaño de los puntos de WebGL). */
  class GlowLayer {
    constructor(parent, material) {
      this.parent = parent;
      this.material = material;
      this.cap = 0;
      this.n = 0;
      this.mesh = null;
    }

    begin(max) {
      if (!this.mesh || max > this.cap) this.alloc(nextCap(max));
      this.n = 0;
    }

    alloc(cap) {
      const base = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.attributes.position);
      g.setAttribute('uv', base.attributes.uv);
      const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', (this.pos = attr(3)));
      g.setAttribute('iColor', (this.col = attr(4)));
      g.setAttribute('iSize', (this.size = attr(2)));
      g.instanceCount = 0;
      if (this.mesh) {
        this.mesh.geometry.dispose();
        this.mesh.geometry = g;
      } else {
        this.mesh = new THREE.Mesh(g, this.material);
        this.mesh.frustumCulled = false;
        this.parent.add(this.mesh);
      }
      this.cap = cap;
    }

    push(x, y, z, col, alpha, size, pulse) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      const p = this.pos.array;
      const c = this.col.array;
      const s = this.size.array;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
      c[i * 4] = col.r;
      c[i * 4 + 1] = col.g;
      c[i * 4 + 2] = col.b;
      c[i * 4 + 3] = alpha;
      s[i * 2] = size;
      s[i * 2 + 1] = pulse;
    }

    end() {
      this.mesh.geometry.instanceCount = this.n;
      this.mesh.visible = this.n > 0;
      upload(this.pos, this.n * 3);
      upload(this.col, this.n * 4);
      upload(this.size, this.n * 2);
    }
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
      this.dprMax = Math.min(window.devicePixelRatio || 1, 2);
      this.dprLimit = this.dprMax; // baja sola si el equipo no da abasto
      this.dpr = this.dprMax;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(this.dpr);
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'g3-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      wrap.appendChild(this.canvas);
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', tr('graph.aria3d'));

      this.labelLayer = document.createElement('div');
      this.labelLayer.className = 'g3-labels';
      wrap.appendChild(this.labelLayer);

      // fundido para los cortes del director de cámara (va debajo de la ficha)
      this.fadeEl = document.createElement('div');
      this.fadeEl.className = 'g3-fade';
      wrap.appendChild(this.fadeEl);

      this.tip = document.createElement('div');
      this.tip.className = 'tip';
      this.tip.hidden = true;
      this.tip.setAttribute('role', 'dialog');
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      wrap.appendChild(this.tip);
      GB.graphShared.wirePinButton(this.tip, (name) => this.opts.onTogglePin?.(name));

      /* vectores de trabajo: el cuadro a cuadro no crea objetos */
      this.Y = new THREE.Vector3(0, 1, 0);
      this.tmpA = new THREE.Vector3();
      this.tmpB = new THREE.Vector3();
      this.tmpP = new THREE.Vector3();
      this.tmp2 = new THREE.Vector2();
      this.tmpCol = new THREE.Color();
      this.tmpDim = new THREE.Color();
      this.white = new THREE.Color(1, 1, 1);
      this.warmWhite = new THREE.Color(1, 0.93, 0.78);
      this.sph = new THREE.Spherical();

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xffffff, 34, 130);
      this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 900);
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
      });
      this.controls.addEventListener('start', () => {
        this.touch();
        this.interacting = true;
        this.dragFrom = this.controls.target.clone();
        this.fly = null;
      });
      this.controls.addEventListener('end', () => {
        this.interacting = false;
        this.lastInteract = performance.now();
        if (this.dragFrom && this.dragFrom.distanceTo(this.controls.target) > 0.4) this.setFollowing(false);
      });

      /* luz: cielo y suelo para dar volumen, un sol fijo y una luz cálida en el presente
         (lo nuevo queda iluminado; el pasado, en penumbra) */
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x808080, 0.55);
      this.sun = new THREE.DirectionalLight(0xffffff, 0.7);
      this.sun.position.set(12, 24, 18);
      this.nowLight = new THREE.PointLight(0xffffff, 0.6, 60, 1.4);
      this.scene.add(this.hemi, this.sun, this.nowLight);

      this.gEdges = new THREE.Group();
      this.gNodes = new THREE.Group();
      this.gFx = new THREE.Group();
      this.gDays = new THREE.Group();
      this.gGround = new THREE.Group();
      this.scene.add(this.gGround, this.gDays, this.gEdges, this.gNodes, this.gFx);

      /* uniformes compartidos por todos los materiales */
      this.u = {
        time: { value: 0 },
        fog: { value: new THREE.Vector2(34, 130) },
        flow: { value: 0 },
        noFlow: { value: 0 },
        rim: { value: 0.8 },
        thin: { value: THIN_D },
      };

      this.geo = {
        sphere: new THREE.SphereGeometry(NODE_R, 20, 14),
        sphereLo: new THREE.SphereGeometry(NODE_R, 12, 9),
        sphereMin: new THREE.SphereGeometry(NODE_R, 8, 6),
        torus: new THREE.TorusGeometry(0.48, 0.13, 10, 30),
        torusLo: new THREE.TorusGeometry(0.48, 0.13, 6, 16),
        // con tapas: de cerca, una punta que sobresale en un codo o mira a la cámara no se ve hueca
        tube: new THREE.CylinderGeometry(1, 1, 1, RADIAL, 1, false).rotateX(Math.PI / 2).translate(0, 0, 0.5),
        tubeMid: new THREE.CylinderGeometry(1, 1, 1, RADIAL_MID, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
        tubeLo: new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
        ring: new THREE.RingGeometry(0.94, 1, 72),
        portal: new THREE.RingGeometry(0.9, 1.1, 160, 1), // solo el anillo: el sombreador no corre en toda la pantalla
        beam: new THREE.CylinderGeometry(0.22, 0.6, 1, 18, 1, true).translate(0, 0.5, 0),
      };

      this.flowLive = flowHook(this.u.flow, this.u.time, this.u.fog, this.u.thin);
      this.nodeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, roughness: 0.32, metalness: 0.1 });
      this.nodeMat.onBeforeCompile = nodeHook(this.u);
      this.lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, roughness: 0.5, metalness: 0.05 });
      this.lineMat.onBeforeCompile = this.flowLive;
      this.ghostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.5 });
      this.ghostMat.onBeforeCompile = flowHook(this.u.noFlow, this.u.time, this.u.fog, this.u.thin);
      this.stubMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.stubMat.onBeforeCompile = thinHook(this.u.thin);
      // líneas punteadas de las ramas sin commits propios: todas en un solo objeto, con color por vértice
      this.pointerLines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.3, gapSize: 0.22, transparent: true, opacity: 0.85 }),
      );
      this.pointerLines.frustumCulled = false;
      this.pointerCap = 0;

      this.iSphere = new Instances(this.gNodes, this.geo.sphere, this.nodeMat);
      this.iTorus = new Instances(this.gNodes, this.geo.torus, this.nodeMat);
      this.iLine = new Instances(this.gEdges, this.geo.tube, this.lineMat);
      this.iGhost = new Instances(this.gEdges, this.geo.tube, this.ghostMat);
      this.iStub = new Instances(this.gEdges, this.geo.tube, this.stubMat);
      this.groundMat = new THREE.ShaderMaterial({
        uniforms: { uFog: this.u.fog, uOpacity: { value: 0.3 } },
        vertexShader: GROUND_VS,
        fragmentShader: GROUND_FS,
        transparent: true,
        depthWrite: false,
      });
      this.iGround = new Instances(this.gGround, this.geo.tubeLo, this.groundMat);
      this.gEdges.add(this.pointerLines);

      const glowMat = (this.glowMat = () =>
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.u.time, uFog: this.u.fog },
          vertexShader: GLOW_VS,
          fragmentShader: GLOW_FS,
          transparent: true,
          depthWrite: false,
        }));
      this.halos = new GlowLayer(this.gNodes, glowMat());
      this.sparks = new GlowLayer(this.gFx, glowMat());

      this.portal = new THREE.Mesh(
        this.geo.portal,
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color() }, uTime: this.u.time, uOpacity: { value: 1 }, uFlash: { value: 0 } },
          vertexShader: PORTAL_VS,
          fragmentShader: PORTAL_FS,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.portal.visible = false;
      this.scene.add(this.portal);

      this.makeStars();
      this.makeDust();
      this.world = GB.World ? new GB.World(this) : null; // valle, cielo, nubes y lo del vuelo (world.js)
      this.galaxy = false; // modo galaxias: cada rama, una galaxia; sus archivos, planetas (galaxy.js)
      this.gx = GB.Galaxy ? new GB.Galaxy(this) : null;
      this.colorObjs = new Map();

      this.nodes = new Map();
      this.edges = new Map();
      this.heads = new Map();
      this.pointers = new Set(); // ramas sin commits propios: una línea punteada de su cabeza a la etiqueta
      this.days = new Map();
      this.ripples = [];
      this.sparkList = [];
      this.pending = []; // efectos programados: { at, fn }
      this.fx = []; // efectos en curso (arcos, faros): { mesh, step(now) → sigue vivo }
      this.fxGlows = []; // halos que los efectos piden en este cuadro
      this.goneHeads = new Map(); // ramas recién borradas: dónde estaban, para sus efectos
      this.dying = [];
      this.keys = new Set();
      this.maxX = 0;
      this.sp = SP;
      this.radius = 4;
      this.following = true;
      this.hold = false; // pausa: sin giro, sin director y con el fondo quieto
      this.spin = !!U.store.get('spin3d', true);
      this.spinAmt = 0;
      this.swayT = 0; // reloj del vaivén: solo corre mientras la vista se mece
      this.hlHover = null; // rama (cadena) con la etiqueta bajo el puntero…
      this.hlFocus = null; // …o con el foco del teclado…
      this.hlPin = null; // …o la de la ficha abierta desde su etiqueta
      this.hlChain = null; // la resaltada ahora (sigue mientras se apaga)
      this.hlAmt = 0;
      this.notes = []; // mensajes de los commits cercanos: elementos que se reusan
      this.flashAmt = 0;
      this.active = false;
      this.onScreen = true;
      this.placed = false;
      this.lastInteract = 0;
      this.lastRender = 0;
      this.mouse = null;
      this.hoverSha = null;
      this.raycaster = new THREE.Raycaster();

      this.readTheme();
      U.onThemeChange(() => this.readTheme());
      motionQuery?.addEventListener?.('change', () => this.applyMotion());

      this.bindPointer();
      this.bindKeys();
      this.bindLabels();
      this.flight = GB.Flight ? new GB.Flight(this) : null;
      this.director = GB.Director ? new GB.Director(this) : null;
      this.ride = null;
      window.addEventListener('gamepadconnected', () => (this.padSeen = true));
      new ResizeObserver(() => this.resize()).observe(wrap);
      // fuera de pantalla (por ejemplo, al bajar en el celular) no se dibuja
      new IntersectionObserver((entries) => {
        this.onScreen = entries[entries.length - 1].isIntersecting;
        this.needsRender = true;
      }).observe(wrap);
      this.frame = this.frame.bind(this);
      if (U.store.get('galaxy3d', false)) this.setGalaxy(true);
    }

    makeStars() {
      const N = 1600;
      const pos = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const z = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z) * 380;
        pos.set([Math.cos(a) * r, Math.sin(a) * r, z * 380], i * 3);
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.stars = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.u.time, uPx: { value: this.dpr }, uAll: { value: 0 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
          vertexShader: STAR_VS,
          fragmentShader: POINT_FS,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.stars.frustumCulled = false;
      this.stars.renderOrder = -1;
      this.scene.add(this.stars);
    }

    makeDust() {
      const N = 1400;
      const pos = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos.set([Math.random() * Math.PI * 2, 0.9 + Math.random() * 1.5, Math.random()], i * 3);
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.dust = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.u.time,
            uFog: this.u.fog,
            uR: { value: 4 },
            uZ0: { value: -120 },
            uLen: { value: 175 },
            uScale: { value: 800 },
            uColor: { value: new THREE.Color() },
            uOpacity: { value: 1 },
          },
          vertexShader: DUST_VS,
          fragmentShader: POINT_FS,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
    }

    /* ---------- tema y materiales ---------- */

    readTheme() {
      // del contenedor: en el modo galaxias trae los colores del tema oscuro (el espacio es oscuro)
      const cs = getComputedStyle(this.wrap);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      this.colors = { ghost: v('--ghost', '#b4bdb9') };
      for (let i = 1; i <= 8; i++) this.colors['c' + i] = v('--s' + i, '#888888');
      this.colorObjs = new Map();
      this.bg = new THREE.Color(v('--surface', '#ffffff'));
      const hsl = {};
      this.bg.getHSL(hsl);
      const dark = (this.dark = hsl.l < 0.5);
      const ink = new THREE.Color(v('--ink', '#101614'));
      const ink2 = new THREE.Color(v('--ink-2', '#48534f'));
      const ink3 = new THREE.Color(v('--ink-3', '#636e6a'));
      this.lineColor = new THREE.Color(v('--line-strong', '#c9d1cd'));
      this.sevCol = { good: new THREE.Color(v('--good', '#0a8f0a')), warn: new THREE.Color(v('--warn', '#c98a00')), bad: new THREE.Color(v('--bad', '#d03b3b')) };
      this.scene.fog.color.copy(this.bg);
      // el espacio: más oscuro que el fondo, para que lo lejano se pierda en la noche
      this.spaceCol = this.bg.clone().lerp(new THREE.Color(0x020409), 0.62);
      if (this.galaxy) this.scene.fog.color.copy(this.spaceCol);

      this.hemi.color.set(dark ? 0xdfe8ff : 0xffffff);
      this.hemi.groundColor.set(dark ? 0x1c1712 : 0x9a948c);
      this.hemi.intensity = dark ? 0.6 : 0.62;
      this.sun.intensity = dark ? 0.6 : 0.62;
      this.nowLight.color.set(dark ? 0xfff1dc : 0xffffff);
      this.nodeMat.emissiveIntensity = dark ? 0.5 : 0.2;
      this.u.rim.value = dark ? 0.85 : 0.28;
      this.lineMat.emissiveIntensity = dark ? 0.42 : 0.14;
      this.ghostMat.emissiveIntensity = dark ? 0.45 : 0.15;

      const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      for (const m of [this.halos.material, this.sparks.material, this.portal.material, this.stars.material, this.dust.material]) {
        m.blending = blend;
        m.needsUpdate = true;
      }
      const su = this.stars.material.uniforms;
      su.uColor.value.copy(dark ? ink : ink3);
      su.uOpacity.value = this.galaxy ? 0.95 : dark ? 0.8 : 0.32;
      su.uAll.value = this.galaxy ? 1 : 0;
      const du = this.dust.material.uniforms;
      du.uColor.value.copy(dark ? ink2 : ink3);
      du.uOpacity.value = dark ? 0.6 : 0.5;
      const pu = this.portal.material.uniforms;
      pu.uColor.value.copy(dark ? ink2 : ink3).lerp(new THREE.Color(this.colors.c1), 0.4);
      this.portalAlpha = dark ? 0.9 : 0.55;

      if (this.dayMat) this.dayMat.color.copy(this.lineColor);
      for (const r of this.ripples) r.mesh.material.blending = blend;
      this.groundMat.uniforms.uOpacity.value = dark ? 0.32 : 0.22;
      this.world?.readTheme();
      this.gx?.readTheme();
      this.applyMotion();
      this.dirtyNodes = this.dirtyEdges = true;
      this.needsRender = true;
    }

    /** Con "reducir movimiento" no hay pulsos, deriva ni giro: la escena queda quieta. */
    applyMotion() {
      this.motion = !reduceMotion();
      this.u.flow.value = this.motion ? (this.dark ? 0.9 : 0.45) : 0;
      this.needsRender = true;
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

    col(key) {
      let c = this.colorObjs.get(key);
      if (!c) this.colorObjs.set(key, (c = new THREE.Color(this.colorHex(key))));
      return c;
    }

    /* ---------- tamaño y ciclo de dibujo ---------- */

    resize() {
      const W = this.wrap.clientWidth;
      const H = this.wrap.clientHeight;
      if (!W || !H) return;
      this.W = W;
      this.H = H;
      // en pantallas enormes no hace falta dibujar más de ~4,6 millones de píxeles
      this.dpr = Math.min(this.dprLimit, Math.max(1, Math.sqrt(MAX_PIXELS / (W * H))));
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(W, H, false);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      this.stars.material.uniforms.uPx.value = this.dpr;
      this.dust.material.uniforms.uScale.value = (H * this.dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
      this.world?.resize();
      this.gx?.resize();
      this.needsRender = true;
    }

    setActive(on) {
      this.active = on;
      this.syncSpace();
      if (on) {
        this.resize();
        this.lastNow = 0;
        if (!this.raf) this.raf = requestAnimationFrame(this.frame);
      } else {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.keys.clear();
        this.gx?.endHyper(); // antes que el vuelo: el campo de visión que queda es el de la órbita
        this.flight?.exit();
        this.world?.showHud(false);
        this.director?.end();
        this.ride = null;
        this.gx?.sleep(); // el zumbido del espacio se apaga con la vista
        this.controls.enabled = true;
        this.unpin();
      }
    }

    pos(x, row) {
      const [lx, ly] = lane(row);
      return new THREE.Vector3(lx, ly, x * SP);
    }

    /** Mueve un commit o una etiqueta hacia `to`, con animación o de golpe. */
    retarget(it, to, now, animate) {
      if (it.toV.equals(to)) return false;
      it.fromV.copy(it.curV);
      it.toV = to;
      it.dur = DUR;
      it.easing = ease;
      it.t0 = animate ? now : 0;
      if (!animate) it.curV.copy(to);
      return true;
    }

    /* ---------- actualización de datos ---------- */

    update(L, ctx = {}) {
      const now = performance.now();
      // las ramas que esperaban su historia llegan sin efectos; y si la vista no se ve (2D, pestaña oculta)
      // tampoco: sus efectos esperarían en cola a que vuelva y saldrían todos juntos
      const fx = this.active && !document.hidden && !ctx.initial && !ctx.calm && this.motion;
      const morph = !!ctx.morph; // cambio de modo: todo vuela a su lugar nuevo, sin efectos de llegada
      this.layout = L;
      this.ctx = ctx;
      this.maxX = L.maxX;
      this.ghostNames = new Map(L.ghostLabels.map((g) => [g.id, g.name]));
      const gal = this.galaxy ? this.gx : null;
      this.radius = gal ? gal.layout(L) : LANE_C * Math.sqrt(Math.max(1, L.rows.length - 1)) + 2.4;
      const slow = (it) => {
        it.dur = MORPH + Math.random() * 500;
        it.easing = ease;
      };
      // con miles de ramas la espiral es grande: la cámara puede alejarse lo necesario para verla entera
      this.controls.maxDistance = Math.max(220, this.radius * 3 + 60);
      const far = Math.max(900, this.radius * 6 + 400, this.world ? this.world.reach(this.radius) : 0); // y el valle hasta el horizonte
      if (this.camera.far !== far) {
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
      }

      /* nodos: los nuevos llegan volando desde el presente */
      const seen = new Set();
      const arrivals = [];
      for (const n of L.nodes) {
        seen.add(n.sha);
        let it = this.nodes.get(n.sha);
        const to = gal?.posOf.get(n.sha) || this.pos(n.x, n.row);
        if (!it) {
          it = { sha: n.sha, curV: to.clone(), fromV: to.clone(), toV: to, t0: 0, dur: DUR, easing: ease, born: 0, hov: 0 };
          this.nodes.set(n.sha, it);
          if (fx) {
            it.fromV.z += ARRIVE_Z;
            it.curV.copy(it.fromV);
            it.t0 = it.born = now;
            it.dur = ARRIVE;
            it.easing = easeOut;
            arrivals.push(it);
          }
        } else if (this.retarget(it, to, now, fx || morph) && morph) slow(it);
        it.data = n;
      }
      for (const [sha, it] of this.nodes) {
        if (seen.has(sha)) continue;
        this.nodes.delete(sha);
        if (fx) this.dying.push({ it, t0: now });
      }
      // la onda y las chispas, solo para los más nuevos (una rama que aparece trae toda su historia)
      arrivals.sort((a, b) => b.data.x - a.data.x);
      // en el Replay llegan commits sin parar: una sola onda por tanda
      for (const it of arrivals.slice(0, ctx.replay ? 1 : 8)) this.later(ARRIVE * 0.9, () => this.nodes.get(it.sha) === it && this.burst(it.toV, this.col(it.data.color)));

      /* aristas */
      const seenE = new Set();
      for (const e of L.edges) {
        seenE.add(e.id);
        let it = this.edges.get(e.id);
        if (!it) {
          it = { pts: null, born: fx && e.kind !== 'stub' ? now : 0 };
          this.edges.set(e.id, it);
        } else if (it.data.kind !== e.kind) it.pts = null; // rehacer la curva
        it.data = e;
      }
      for (const id of [...this.edges.keys()]) if (!seenE.has(id)) this.edges.delete(id);

      /* cabezas de rama: etiqueta HTML (se crea al mostrarse) + línea punteada si la rama no tiene commits propios */
      const seenH = new Set();
      for (const h of L.heads) {
        seenH.add(h.name);
        let it = this.heads.get(h.name);
        const to = gal?.headPos.get(h.name) || this.pos(h.x, h.row);
        if (!it) {
          it = { el: null, curV: to.clone(), fromV: to.clone(), toV: to, t0: 0, dur: DUR, easing: ease };
          this.heads.set(h.name, it);
          this.goneHeads.delete(h.name);
          it.data = h;
          this.buildHead(it, h, ctx);
          if (fx) this.flash(it);
        } else {
          const moved = this.retarget(it, to, now, fx || morph);
          if (moved && morph) slow(it);
          // en el modo galaxias la etiqueta queda en el núcleo: destella igual con cada push
          else if ((moved || gal) && fx && it.data.sha !== h.sha) this.flash(it);
          it.data = h;
          this.buildHead(it, h, ctx);
        }

        if (h.color !== 'ghost') it.liveColor = h.color; // al fusionarse se vuelve gris; los efectos usan su color de antes
        if (h.own) this.pointers.delete(h.name);
        else this.pointers.add(h.name);
      }
      for (const [name, g] of this.goneHeads) if (now - g.t > 60000) this.goneHeads.delete(name);
      for (const [name, it] of this.heads) {
        if (seenH.has(name)) continue;
        this.goneHeads.set(name, { pos: it.curV.clone(), color: it.liveColor || it.data.color, t: now });
        const el = it.el;
        if (el) {
          el.classList.add('exit');
          setTimeout(() => el.remove(), 420);
        }
        this.heads.delete(name);
        this.pointers.delete(name);
      }

      this.updateDays(L);
      this.portalTarget = L.nodes.length && !gal ? { z: (L.maxX + 1.4) * SP, r: this.radius + 1.2 } : null;

      if (this.pinned && !this.nodes.has(this.pinned)) this.unpin();
      if (this.hoverSha && !this.nodes.has(this.hoverSha)) this.hoverSha = null;
      this.world?.onLayout();
      if (!this.placed && L.nodes.length) {
        this.placeCamera(true);
        this.placed = true;
      }
      this.dirtyNodes = this.dirtyEdges = true;
      this.needsRender = true;
    }

    /** Destello de una etiqueta que se movió o llegó; si aún no se muestra, destella al aparecer. */
    flash(it) {
      it.flashAt = performance.now();
      const el = it.el;
      if (!el) return;
      el.classList.remove('moved');
      void el.offsetWidth;
      el.classList.add('moved');
      clearTimeout(el.__flash);
      el.__flash = setTimeout(() => el.classList.remove('moved'), 2600);
    }

    /** Contenido de la etiqueta de una rama. Se arma como texto y se escribe en el DOM solo si cambió
        y la etiqueta existe (en cada sondeo llegan las mismas ramas). */
    buildHead(it, h, ctx) {
      const pr = ctx.prs?.get(h.name);
      const pinned = ctx.pins?.has(h.name);
      it.cls = `g3-head ${h.color}${h.isDefault ? ' default' : ''}`;
      if (it.el) {
        const cls = it.cls + (it.el.classList.contains('moved') ? ' moved' : '');
        if (it.el.className !== cls) it.el.className = cls;
      }
      const aria = [tr(h.isDefault ? 'branch.ariaDefault' : 'branch.aria', { name: h.name })];
      if (pr) aria.push(tr(pr.draft ? 'branch.prDraftAria' : 'branch.prAria', { num: pr.number, base: pr.base }));
      if (pinned) aria.push(tr('branch.pinned'));
      const name = U.truncate(h.name, 34);
      const html =
        `<span class="h3-dot" aria-hidden="true"></span><span class="h3-name">${U.esc(name)}</span>` +
        (pr ? `<span class="h3-pr${pr.draft ? ' draft' : ''}">#${pr.number}</span>` : '') +
        (pinned ? `<span class="h3-pin" title="${U.esc(tr('branch.pinned'))}" aria-hidden="true"></span>` : '');
      const label = aria.join(', ');
      if (it.html === html && it.label === label) return;
      it.html = html;
      it.label = label;
      // ancho estimado (fuente monoespaciada, mismos rellenos que el CSS): sirve para ver qué etiquetas se pisan sin medir el DOM
      const { measure, LABEL_FONT, SMALL_FONT } = GB.graphShared;
      it.w = Math.ceil(33 + measure(name, LABEL_FONT) * (h.isDefault ? 1.04 : 1) + (pr ? 6 + measure('#' + pr.number, SMALL_FONT) : 0) + (pinned ? 13 : 0));
      if (!it.el) return;
      it.el.setAttribute('aria-label', label);
      it.el.innerHTML = html;
    }

    makeHead(it) {
      const el = document.createElement('button');
      el.type = 'button';
      el.__name = it.data.name;
      el.className = it.cls;
      el.setAttribute('aria-label', it.label);
      el.innerHTML = it.html;
      this.labelLayer.appendChild(el);
      it.el = el;
      it.st = {};
      if (performance.now() - (it.flashAt || -1e9) < 2000) this.flash(it);
    }

    /** Un oyente para todas las etiquetas de rama (se crean y se van a medida que se muestran). */
    bindLabels() {
      const headOf = (ev) => this.heads.get(ev.target.closest?.('.g3-head')?.__name);
      this.labelLayer.addEventListener('click', (ev) => {
        const it = headOf(ev);
        if (!it) return;
        ev.stopPropagation();
        this.touch(); // quien abre una ficha quiere leerla: el director espera
        this.showTip(it.data.sha, true, it.data.name);
      });
      // pasar por una etiqueta (o llegar con el teclado) resalta su rama entera, como en la vista 2D
      const enter = (ev) => {
        const it = headOf(ev);
        if (!it) return;
        // el foco cuenta si llegó con el teclado: tras un clic, la rama queda resaltada solo mientras su ficha esté abierta
        if (ev.type === 'focusin') return void (this.hlFocus = ev.target.matches?.(':focus-visible') ? it.data.chain : null);
        this.setHover(it.data.sha);
        this.hlHover = it.data.chain;
      };
      const leave = (ev) => {
        if (ev.type === 'focusout') return void (this.hlFocus = null);
        const el = ev.target.closest?.('.g3-head');
        if (!el || el.contains(ev.relatedTarget)) return;
        const it = this.heads.get(el.__name);
        if (it && this.hoverSha === it.data.sha) this.setHover(null);
        this.hlHover = null;
      };
      this.labelLayer.addEventListener('pointerover', enter);
      this.labelLayer.addEventListener('focusin', enter);
      this.labelLayer.addEventListener('pointerout', leave);
      this.labelLayer.addEventListener('focusout', leave);
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
        this.dayText(it);
      }
      for (const [id, it] of this.days) {
        if (seen.has(id)) continue;
        this.gDays.remove(it.mesh);
        it.el.remove();
        this.days.delete(id);
      }
    }

    /** Texto de la fecha de un día y su ancho estimado (mismo tipo y rellenos que el CSS), para que no se pisen. */
    dayText(it) {
      const text = i18n.dayLabel(it.data.time);
      if (it.el.textContent === text) return;
      it.el.textContent = text;
      it.w = Math.ceil(GB.graphShared.measure(text, GB.graphShared.SMALL_FONT) + 12);
    }

    /* ---------- cámara ---------- */

    followPoint(out) {
      if (this.galaxy) return this.gx.home(out); // en el espacio, el centro del universo
      return out.set(0, 0, Math.max(0, this.maxX * SP - 7));
    }

    defaultOffset() {
      // más lejos en paneles angostos (celular) para que la escena no se corte
      const aspect = this.W && this.H ? this.W / this.H : 1.6;
      if (this.galaxy) {
        // el universo desde arriba y de lado: se ven las galaxias de frente y sus puentes
        const d = (16 + Math.min(this.radius, 420) * 1.7) * clamp(1.6 / aspect, 1, 1.9);
        return new THREE.Vector3(0.5, 0.68, 0.62).normalize().multiplyScalar(d);
      }
      // de tres cuartos y desde la izquierda: el pasado queda a la izquierda y el presente a la derecha,
      // como en la vista 2D, y las ramas se ven abrirse y volver; un poco baja: se ve el horizonte
      const d = (13 + this.radius * 1.6) * clamp(1.6 / aspect, 1, 1.9);
      return new THREE.Vector3(-0.68, 0.34, 0.64).normalize().multiplyScalar(d);
    }

    /** Primera vista: con movimiento, la cámara entra desde lejos y en arco, desde el pasado hasta su lugar. */
    placeCamera(intro) {
      const t = this.followPoint(new THREE.Vector3());
      const off = this.defaultOffset();
      this.controls.target.copy(t);
      if (intro && this.motion) {
        const from = off.clone().applyAxisAngle(this.Y, this.galaxy ? 1.1 : -1.1).multiplyScalar(2.6);
        from.y += off.length() * 0.8;
        this.camera.position.copy(t).add(from);
        this.controls.update();
        this.flyTo(t, t.clone().add(off), 2600);
      } else {
        this.camera.position.copy(t).add(off);
        this.controls.update();
      }
    }

    /** Vuelo de cámara: el objetivo avanza en línea recta y la cámara orbita a su alrededor
        (interpolación esférica); en saltos largos se aleja un poco a mitad de camino. */
    flyTo(target, camPos, dur = 900) {
      const c = this.controls;
      const s0 = new THREE.Spherical().setFromVector3(this.tmpA.copy(this.camera.position).sub(c.target));
      const s1 = new THREE.Spherical().setFromVector3(this.tmpA.copy(camPos).sub(target));
      let dth = (s1.theta - s0.theta) % (Math.PI * 2);
      if (dth > Math.PI) dth -= Math.PI * 2;
      else if (dth < -Math.PI) dth += Math.PI * 2;
      this.fly = {
        t0: performance.now(),
        dur: this.motion ? dur : 1,
        fromT: c.target.clone(),
        toT: target.clone(),
        s0,
        s1,
        dth,
        hop: clamp(c.target.distanceTo(target) / 80, 0, 1) * 0.4,
      };
    }

    setFollowing(v) {
      if (v) {
        this.flight?.exit();
        if (this.ride) this.endRide();
      }
      if (this.following === v) return;
      this.following = v;
      this.opts.onFollowChange?.(v);
      if (v) {
        const t = this.followPoint(new THREE.Vector3());
        const off = this.camera.position.clone().sub(this.controls.target);
        if (off.length() > 90 || off.length() < 6) off.copy(this.defaultOffset());
        this.flyTo(t, t.clone().add(off));
      }
    }

    /** Modo galaxias: cada rama, una galaxia. Con movimiento, cada commit vuela a su lugar nuevo y la
        cámara, a la vista general del modo. */
    setGalaxy(on) {
      on = !!on && !!this.gx;
      if (on === this.galaxy) return;
      this.galaxy = on;
      U.store.set('galaxy3d', on);
      this.syncSpace();
      if (this.ride) this.endRide();
      this.unpin();
      this.gx.setOn(on);
      this.world?.setSpace(on);
      this.flight?.relocalize(); // la ayuda del vuelo nombra el hiperimpulsor solo en el espacio
      for (const e of this.edges.values()) e.pts = null; // las curvas se rehacen con la forma del modo
      this.readTheme();
      if (this.layout) {
        this.update(this.layout, { ...this.ctx, initial: true, morph: this.motion });
        if (!this.flight?.on) {
          const t = this.followPoint(new THREE.Vector3());
          this.flyTo(t, t.clone().add(this.defaultOffset()), 2200);
          if (!this.following) {
            this.following = true;
            this.opts.onFollowChange?.(true);
          }
        }
      }
      this.needsRender = true;
      this.opts.onGalaxyChange?.(on);
    }

    /** El espacio es oscuro: la vista y lo que flota sobre ella (fecha del Replay, rótulos) toman el tema oscuro. */
    syncSpace() {
      this.wrap.classList.toggle('space', this.galaxy);
      this.wrap.parentElement?.classList.toggle('space', this.galaxy && this.active);
    }

    /** Escala de los efectos (faros, ondas, cometas): en el espacio, la de una galaxia. */
    get fxR() {
      return this.galaxy ? 12 : this.radius;
    }

    setSpin(on) {
      this.spin = on;
      U.store.set('spin3d', on);
      this.lastInteract = 0;
    }

    /** El usuario movió la cámara: el director se la cede (y la retoma cuando vuelve la calma). */
    touch() {
      this.lastInteract = performance.now();
      this.director?.yieldControl();
    }

    /** Pausa (WCAG 2.2.2): se detienen el giro, el director y la animación de fondo. */
    setHold(on) {
      this.hold = on;
      this.director?.setPaused(on);
      this.needsRender = true;
    }

    setFade(on) {
      this.fadeEl.classList.toggle('on', on);
    }

    /** Cambió el tamaño del texto (modo TV): las etiquetas se vuelven a ubicar con la escala nueva. */
    restyle() {
      this.labelZ = 0;
      this.needsRender = true;
    }

    /** Cuánto crece el texto de las etiquetas (en modo TV, con la pantalla); el ancho estimado es a escala 1. */
    labelScale() {
      if (!this.labelZ) {
        const root = document.documentElement;
        this.labelZ = (root.classList.contains('tv') && Number(getComputedStyle(root).getPropertyValue('--tvz'))) || 1;
      }
      return this.labelZ;
    }

    zoomBy(f) {
      this.touch();
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1 / f);
      off.setLength(clamp(off.length(), this.controls.minDistance, this.controls.maxDistance));
      this.flyTo(this.controls.target.clone(), this.controls.target.clone().add(off), 350);
    }

    focusSha(sha, dist = 15) {
      const it = this.nodes.get(sha);
      if (!it) return false;
      this.touch();
      this.flight?.exit();
      if (this.ride) this.endRide();
      this.setFollowing(false);
      const t = it.toV.clone();
      const off = this.camera.position.clone().sub(this.controls.target).setLength(dist);
      this.flyTo(t, t.clone().add(off));
      if (this.motion) this.ripple(it.toV, this.col(it.data.color));
      return true;
    }

    focusBranch(name) {
      const h = this.heads.get(name);
      if (!h) return false;
      const G = this.galaxy && this.gx.galaxyOf(name);
      if (G) {
        // entrar en la galaxia: su sistema entero desde el mirador (fuera de la última órbita, algo por
        // encima de su plano, del lado donde ya estaba la cámara); si sus archivos llegan después, se reencuadra
        this.touch();
        this.flight?.exit();
        if (this.ride) this.endRide();
        this.setFollowing(false);
        const t = G.c.clone();
        const dir = new THREE.Vector3();
        const dist = this.gx.vantage(G, dir);
        this.flyTo(t, t.clone().addScaledVector(dir, dist), 1400);
        this.gx.park(G);
        this.flash(h);
        return true;
      }
      this.focusSha(h.data.sha);
      this.flash(h);
      return true;
    }

    hasBranch(name) {
      return this.heads.has(name);
    }

    /* ---------- puntero y teclado ---------- */

    bindPointer() {
      let down = null;
      this.canvas.addEventListener('pointermove', (ev) => {
        this.hlHover = null; // el puntero ya no está sobre una etiqueta
        if (this.flight?.on) return; // en vuelo apunta la mira
        const r = this.canvas.getBoundingClientRect();
        this.mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top, moved: true };
      });
      this.canvas.addEventListener('pointerleave', () => {
        this.mouse = null;
        this.setHover(null);
        if (!this.pinned) this.hideTip();
        this.canvas.style.cursor = '';
      });
      this.canvas.addEventListener('pointerdown', (ev) => {
        this.touch();
        if (this.ride) this.endRide();
        down = { x: ev.clientX, y: ev.clientY };
        this.wrap.focus({ preventScroll: true }); // así funcionan las flechas y la tecla F
      });
      this.canvas.addEventListener('pointerup', (ev) => {
        if (this.flight?.on) return (down = null);
        if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return (down = null);
        down = null;
        const r = this.canvas.getBoundingClientRect();
        this.openAt(ev.clientX - r.left, ev.clientY - r.top);
      });
      // doble clic: volar de cerca hasta ese commit (en el espacio, si es de otra galaxia, entrar en ella)
      this.canvas.addEventListener('dblclick', (ev) => {
        if (this.flight?.on) return;
        const r = this.canvas.getBoundingClientRect();
        const hit = this.pickAny(ev.clientX - r.left, ev.clientY - r.top);
        if (hit?.sha) {
          const G = this.galaxy ? this.gx.galOf.get(hit.sha) : null;
          if (G && this.gx.focus !== G && this.heads.has(G.name)) this.focusBranch(G.name);
          else this.focusSha(hit.sha, 7);
        } else if (hit?.file) this.focusPoint(hit.file.pos, 6);
      });
      this.canvas.addEventListener(
        'wheel',
        () => {
          this.touch();
          if (this.ride) this.endRide();
        },
        { passive: true },
      );
    }

    /** Flechas ← → giran, ↑ ↓ viajan por la historia, + y − acercan; se mantienen pulsadas. */
    bindKeys() {
      const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', _: 'out' };
      this.wrap.addEventListener('keydown', (ev) => {
        if (this.ride && !ev.target.closest?.('.tip')) this.endRide();
        if (ev.key === 'Escape') {
          if (this.pinned) ev.preventDefault(); // Esc cerró la ficha: no hace nada más (salir del modo TV)
          return this.unpin();
        }
        if (this.flight?.on) return; // en vuelo, las teclas las maneja flight.js
        const k = KEYS[ev.key];
        if (!k || ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('.tip')) return;
        ev.preventDefault();
        this.touch();
        this.keys.add(k);
        this.fly = null;
      });
      this.wrap.addEventListener('keyup', (ev) => this.keys.delete(KEYS[ev.key]));
      this.wrap.addEventListener('focusout', () => this.keys.clear());
    }

    stepKeys(dt) {
      const k = this.keys;
      const c = this.controls;
      const off = this.tmpB.copy(this.camera.position).sub(c.target);
      const turn = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
      const zoom = (k.has('out') ? 1 : 0) - (k.has('in') ? 1 : 0);
      const go = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
      if (turn) off.applyAxisAngle(this.Y, turn * 1.2 * dt);
      if (zoom) off.setLength(clamp(off.length() * Math.exp(zoom * 1.3 * dt), c.minDistance, c.maxDistance));
      if (go && this.galaxy) {
        // en el espacio no hay eje del tiempo: ↑ avanza hacia donde mira la cámara
        c.target.addScaledVector(this.tmpA.copy(off).normalize(), -go * (6 + off.length() * 0.5) * dt);
        this.setFollowing(false);
      } else if (go) {
        // ↑ avanza hacia donde mira la cámara (de frente al pasado, hacia lo antiguo)
        const dz = go * (off.z >= 0 ? -1 : 1) * (6 + off.length() * 0.5) * dt;
        c.target.z = clamp(c.target.z + dz, -SP * 4, this.maxX * SP + SP * 4);
        this.setFollowing(false);
      }
      this.camera.position.copy(c.target).add(off);
      this.lastInteract = performance.now();
    }

    pick(x, y) {
      if (!this.W) return null;
      this.raycaster.setFromCamera(this.tmp2.set((x / this.W) * 2 - 1, -(y / this.H) * 2 + 1), this.camera);
      const ray = this.raycaster.ray;
      const far = this.scene.fog.far;
      let best = null;
      let bestT = Infinity;
      // prueba rayo-esfera contra el centro de cada commit: sin recorrer triángulos
      for (const it of this.nodes.values()) {
        const r = (it.data.merge ? 0.61 : NODE_R) * (it.data.heads.length ? HEAD_SCALE : 1) + 0.12;
        if (ray.distanceSqToPoint(it.curV) > r * r) continue;
        const t = this.tmpP.copy(it.curV).sub(ray.origin).dot(ray.direction);
        if (t > 0 && t < bestT && t < far) (bestT = t), (best = it.sha);
      }
      this.pickT = bestT;
      return best;
    }

    /** Lo que está bajo el puntero: un commit ({ sha }) o, en el modo galaxias, un planeta ({ file }). */
    pickAny(x, y) {
      if (!this.W) return null;
      const sha = this.pick(x, y);
      const hit = this.galaxy ? this.gx.pick(this.raycaster.ray, this.scene.fog.far) : null;
      if (hit && (!sha || hit.t < this.pickT)) return { file: hit.p };
      return sha ? { sha } : null;
    }

    /** Clic: abre el detalle de lo que haya ahí (o cierra el que estaba abierto). */
    openAt(x, y) {
      const hit = this.pickAny(x, y);
      if (hit?.sha) this.showTip(hit.sha, true);
      else if (hit?.file) this.showFileTip(hit.file, true);
      else this.unpin();
    }

    /** Vuela de cerca hasta un punto (un planeta: sigue girando, la cámara se queda donde pasaba). */
    focusPoint(v, dist) {
      this.touch();
      this.setFollowing(false);
      const t = v.clone();
      const off = this.camera.position.clone().sub(this.controls.target).setLength(dist);
      this.flyTo(t, t.clone().add(off));
    }

    setHover(sha) {
      if (this.hoverSha === sha) return;
      this.hoverSha = sha;
      this.dirtyNodes = true;
    }

    showTip(sha, pin, branchName) {
      const it = this.nodes.get(sha);
      if (!it) return;
      this.tipFile = null;
      this.pinFile = false;
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      this.tip.innerHTML = GB.graphShared.tipHTML(it.data, this.ctx || {}, { pin, branchName, ghostNames: this.ghostNames });
      const ride = branchName || (it.data.chain.startsWith('b:') ? it.data.chain.slice(2) : null);
      const action = (text, fn) => {
        let actions = this.tip.querySelector('.tip-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'tip-actions';
          this.tip.appendChild(actions);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tip-ride';
        b.textContent = text;
        b.addEventListener('click', () => fn(b));
        actions.appendChild(b);
      };
      if (pin && ride && this.motion) action(tr('ride.label'), () => this.rideBranch(ride));
      // en el espacio, saltar con el hiperimpulsor hasta la galaxia de la rama (si no se está ya en ella)
      const G = pin && ride && this.galaxy ? this.gx.galaxyOf(ride) : null;
      if (G && G !== this.gx.focus) action(tr('galaxy.jump'), () => this.gx.jumpTo(G));
      // marcar la rama como destino: una columna de luz la señala y la brújula del vuelo lleva hasta ella
      const mark = () => tr(this.world.waypoint === ride ? 'world.unmark' : 'world.mark');
      if (pin && ride && this.world && this.heads.has(ride))
        action(mark(), (b) => {
          this.world.setWaypoint(ride);
          b.textContent = mark();
        });
      this.tip.hidden = false;
      this.tip.classList.toggle('pinned', !!pin);
      this.tipSha = sha;
      if (pin) this.pinned = sha;
      // abierta desde la etiqueta de una rama (también con un toque, sin puntero): la rama queda resaltada
      this.hlPin = pin && branchName ? this.heads.get(branchName)?.data.chain || null : null;
      this.placeTip();
    }

    /** Detalle de un archivo (un planeta del modo galaxias). */
    showFileTip(file, pin) {
      if (!this.gx) return;
      this.tip.innerHTML = this.gx.tipHTML(file, pin);
      this.tip.setAttribute('aria-label', tr('file.aria'));
      this.tip.hidden = false;
      this.tip.classList.toggle('pinned', !!pin);
      this.tipSha = null;
      this.tipFile = file;
      if (pin) {
        this.pinned = null;
        this.pinFile = true;
      }
      this.placeTip();
    }

    placeTip() {
      const v = this.tipFile ? this.tipFile.pos : this.nodes.get(this.tipSha)?.curV;
      if (!v) return this.hideTip();
      const p = this.project(v);
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
      this.tipFile = null;
      this.hlPin = null;
    }

    unpin() {
      this.pinned = null;
      this.pinFile = false;
      this.hideTip();
    }

    /** Cambio de idioma: etiquetas accesibles, días del eje y rótulos de las ramas. */
    relocalize() {
      this.flight?.relocalize();
      this.world?.relocalize();
      this.gx?.relocalize();
      this.wrap.setAttribute('aria-label', tr('graph.aria3d'));
      this.tip.setAttribute('aria-label', tr('tip.aria'));
      this.unpin();
      for (const d of this.days.values()) if (d.data) this.dayText(d);
      for (const it of this.heads.values()) {
        if (!it.data) continue;
        it.html = null;
        this.buildHead(it, it.data, this.ctx || {});
      }
    }

    project(v) {
      const p = this.tmpP.copy(v).project(this.camera);
      if (p.z > 1 || p.z < -1) return null;
      return { x: (p.x + 1) * 0.5 * this.W, y: (1 - p.y) * 0.5 * this.H };
    }

    /* ---------- recorrer una rama ---------- */

    /** Recorre una rama en primera persona, desde el commit del que nace hasta su cabeza, como una
        montaña rusa. `auto`: lo pide el director de cámara (no el usuario). */
    rideBranch(name, auto = false) {
      const L = this.layout;
      if (!L) return;
      const key = 'b:' + name;
      let list = L.nodes.filter((n) => n.chain === key).sort((a, b) => a.x - b.x);
      const head = L.heads.find((h) => h.name === name);
      if (!list.length && head) list = [L.nodeOf.get(head.sha)].filter(Boolean);
      if (!list.length) return;
      const fork = L.nodeOf.get(list[0].commit.parents[0]);
      if (fork) list.unshift(fork);
      const lift = new THREE.Vector3(0, 0.9, 0);
      const pts = list.map((n) => this.nodes.get(n.sha)?.toV).filter(Boolean).map((v) => v.clone().add(lift));
      if (!pts.length) return;
      // un tramo de entrada desde el pasado, para subirse a la vía en marcha (en el espacio, desde atrás del primer tramo)
      const back = this.galaxy && pts.length > 1 ? pts[0].clone().sub(pts[1]).setLength(SP * 3) : new THREE.Vector3(0, 0, -SP * 3);
      pts.unshift(pts[0].clone().add(back).add(new THREE.Vector3(0, 1.2, 0)));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      if (!auto) this.touch();
      this.flight?.exit();
      this.fly = null;
      this.setFollowing(false);
      this.unpin();
      this.controls.enabled = false;
      this.ride = { name, curve, auto, t0: performance.now(), dur: clamp(curve.getLength() / 7, 3, 20) * 1000 };
    }

    stepRide(now) {
      const r = this.ride;
      const cam = this.camera;
      const p = clamp((now - r.t0) / r.dur, 0, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      r.curve.getPointAt(e, cam.position);
      if (e < 0.995) {
        r.curve.getPointAt(Math.min(1, e + 0.035), this.tmpB);
        cam.lookAt(this.tmpB);
      } else if (!this.galaxy) cam.lookAt(this.tmpB.copy(cam.position).add(this.tmpA.set(0, -0.25, 1))); // al final, mirar al presente
      if (p >= 1) {
        this.endRide();
        const G = this.galaxy && this.gx.galaxyOf(r.name);
        if (G) {
          // llegó al núcleo: la cámara se aleja hasta ver la galaxia entera
          const t = G.c.clone();
          this.flyTo(t, t.clone().addScaledVector(G.w, G.R * 2 + 8).addScaledVector(G.u, G.R * 0.8), 1600);
        } else {
          const t = this.controls.target;
          this.flyTo(t.clone(), t.clone().add(new THREE.Vector3(5, 3.5, 10)), 1400);
        }
      }
      return true;
    }

    /** Termina el recorrido: la cámara vuelve a orbitar alrededor de lo que tiene delante. */
    endRide() {
      if (!this.ride) return;
      this.ride = null;
      const fwd = this.tmpA.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, 8);
      this.controls.enabled = true;
      this.controls.update();
      this.needsRender = true;
    }

    /** Start en el mando: entra o sale del modo vuelo. */
    padToggle() {
      if (!this.padSeen || !this.flight) return;
      const pads = navigator.getGamepads?.() || [];
      let pressed = false;
      for (const p of pads) if (p?.connected && p.buttons[9]?.pressed) pressed = true;
      if (pressed && !this.padStart) this.flight.toggle();
      this.padStart = pressed;
    }

    /* ---------- cuadro a cuadro ---------- */

    frame(now) {
      this.raf = this.active ? requestAnimationFrame(this.frame) : 0;
      if (!this.active || !this.W || !this.onScreen) {
        this.lastNow = 0;
        return;
      }
      const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
      this.lastNow = now;
      if (this.motion && !this.hold) this.u.time.value += dt;

      const camMoved = this.stepCamera(now, dt);
      const sceneMoved = this.stepScene(now, dt);
      const worldMoved = !!this.world?.step(now, dt);
      const spaceMoved = !!this.gx?.step(now, dt);
      const full = this.needsRender || camMoved || sceneMoved || worldMoved || spaceMoved;
      // en reposo los pulsos, el polvo y las estrellas siguen vivos, pero a ~30 fps
      const ambient = this.motion && !this.hold && this.nodes.size > 0 && now - this.lastRender >= AMBIENT_MS;
      if (full || ambient) {
        this.beforeRender();
        this.renderer.render(this.scene, this.camera);
        if (full) this.placeLabels();
        if (full && this.prevFull) this.adapt(now - this.lastRender, now);
        this.lastRender = now;
        this.needsRender = false;
      }
      this.prevFull = full;
      this.hover();
      const w = this.world;
      if (w) {
        // en vuelo: brújula, minimapa e indicadores; volando o recorriendo una rama, se descubre el mapa
        // (el recorrido que pide el director de cámara no cuenta: nadie está explorando)
        const fly = !!this.flight?.on;
        if (fly !== !!w.hudOn) w.showHud(fly);
        if (fly) w.hud(now);
        if ((fly || (this.ride && !this.ride.auto)) && this.nodes.size && !this.gx?.hyper) w.explore(now); // en el túnel no se descubre nada
      }
    }

    stepCamera(now, dt) {
      const c = this.controls;
      const cam = this.camera;
      let moved = false;
      this.padToggle();
      if (this.gx?.hyper) return true; // en pleno salto hiperespacial la cámara la lleva galaxy.js
      // el director decide el plano antes que nada: puede lanzar un vuelo, un corte o un paseo
      const directed = this.director ? this.director.step(now, dt) : false;
      if (this.ride) return this.stepRide(now);
      if (this.flight?.on) return this.flight.step(dt);
      if (directed) moved = true;
      if (this.fly) {
        const f = this.fly;
        const p = ease(clamp((now - f.t0) / f.dur, 0, 1));
        c.target.lerpVectors(f.fromT, f.toT, p);
        const r = f.s0.radius * Math.pow(f.s1.radius / f.s0.radius, p) * (1 + f.hop * Math.sin(Math.PI * p));
        this.sph.set(r, f.s0.phi + (f.s1.phi - f.s0.phi) * p, f.s0.theta + f.dth * p);
        cam.position.setFromSpherical(this.sph).add(c.target);
        if (p >= 1) this.fly = null;
        moved = true;
      } else {
        if (this.keys.size) {
          this.stepKeys(dt);
          moved = true;
        }
        if (this.following && !this.interacting) {
          // seguimiento suave, igual a 60 o a 144 Hz
          const d = this.followPoint(this.tmpA).sub(c.target).multiplyScalar(1 - Math.exp(-dt * 3.6));
          if (d.lengthSq() > 1e-8) {
            c.target.add(d);
            cam.position.add(d);
            moved = true;
          }
        }
        const spin =
          this.spin &&
          this.following &&
          this.motion &&
          !this.hold &&
          !this.interacting &&
          !this.keys.size &&
          !this.pinned &&
          !this.tipSha &&
          !this.tipFile &&
          now - this.lastInteract > 4000;
        // el giro arranca y se detiene con suavidad
        this.spinAmt = clamp(this.spinAmt + (spin ? dt : -dt * 3) / 1.5, 0, 1);
        if (this.spinAmt > 0) {
          const e = ease(this.spinAmt);
          let w = SPIN_SPEED;
          if (!this.galaxy) {
            // en el valle, un vaivén alrededor de donde se dejó la vista: no termina mirando la historia
            // desde atrás y el tiempo se sigue leyendo de un lado al otro (en el espacio, giro entero)
            const k = (Math.PI * 2) / SWAY_T;
            w = SWAY * k * Math.cos(this.swayT * k);
            this.swayT += dt * e;
          }
          const off = this.tmpB.copy(cam.position).sub(c.target).applyAxisAngle(this.Y, -w * e * dt);
          cam.position.copy(c.target).add(off);
          moved = true;
        }
      }
      this.world?.limitOrbit(c, cam);
      if (c.update()) moved = true;
      return moved;
    }

    stepScene(now, dt) {
      let changed = this.stepHighlight(dt);
      if (this.dirtyNodes || this.dirtyEdges || this.nodeAnim || this.edgeAnim) {
        const { moving, anim } = this.stepNodes(now, dt);
        this.writeNodes(now);
        if (this.dirtyEdges || moving || this.edgeAnim) {
          this.edgeAnim = this.writeEdges(now);
          this.writePointers();
        }
        this.nodeAnim = anim;
        this.dirtyNodes = this.dirtyEdges = false;
        changed = true;
      }
      if (this.stepFx(now, dt)) changed = true;
      if (this.stepPortal(dt)) changed = true;
      return changed;
    }

    /** Rama resaltada: lo demás se funde con el fondo con suavidad y vuelve igual; de una rama a otra
        cambia sin pasar por el apagado. En el espacio cada rama ya es su propia galaxia: no hace falta. */
    stepHighlight(dt) {
      let want = this.galaxy ? null : this.hlHover || this.hlFocus || this.hlPin;
      if (want && !this.heads.has(want.slice(2))) want = null; // la rama ya no está: nada se queda apagado
      let changed = false;
      if (want && want !== this.hlChain) {
        this.hlChain = want;
        changed = this.hlAmt > 0;
      }
      const to = want ? 1 : 0;
      if (this.hlAmt !== to) {
        this.hlAmt = this.motion ? clamp(this.hlAmt + ((to ? 1 : -1) * dt * 1000) / HL_MS, 0, 1) : to;
        if (!this.hlAmt) this.hlChain = null;
        changed = true;
      }
      if (changed) this.dirtyNodes = this.dirtyEdges = true;
      return changed;
    }

    /** Color de una clase: apagado hacia el fondo si hay una rama resaltada y esto no es de ella (`lit`).
        Devuelve un color de trabajo: hay que usarlo antes de pedir otro. */
    tint(key, lit) {
      const c = this.col(key);
      if (!this.hlAmt || lit) return c;
      return this.tmpDim.copy(c).lerp(this.bg, this.hlAmt * DIM);
    }

    lerpItem(it, now) {
      if (!it.t0) return false;
      const p = clamp((now - it.t0) / it.dur, 0, 1);
      it.curV.lerpVectors(it.fromV, it.toV, it.easing(p));
      if (p >= 1) it.t0 = 0;
      return true;
    }

    stepNodes(now, dt) {
      let moving = this.dying.length > 0;
      let anim = moving;
      const k = 1 - Math.exp(-dt * 14);
      for (const it of this.nodes.values()) {
        if (this.lerpItem(it, now)) moving = true;
        if (it.born && now - it.born >= 550) it.born = 0;
        if (it.born) anim = true;
        const hov = it.sha === this.hoverSha ? 1 : 0;
        if (Math.abs(it.hov - hov) > 0.01) {
          it.hov += (hov - it.hov) * k;
          anim = true;
        } else it.hov = hov;
      }
      for (const it of this.heads.values()) if (this.lerpItem(it, now)) moving = true;
      for (let i = this.dying.length - 1; i >= 0; i--) if (now - this.dying[i].t0 >= 350) this.dying.splice(i, 1);
      return { moving, anim: anim || moving };
    }

    writeNodes(now) {
      const n = this.nodes.size + this.dying.length;
      // con miles de commits, esferas y anillos más sencillos: a esa distancia no se nota
      this.iSphere.setGeometry(n > 6000 ? this.geo.sphereMin : n > 1500 ? this.geo.sphereLo : this.geo.sphere);
      this.iTorus.setGeometry(n > 1500 ? this.geo.torusLo : this.geo.torus);
      const gals = this.galaxy ? this.gx.gals : null;
      this.iSphere.begin(n);
      this.iTorus.begin(n);
      this.halos.begin(n + (gals ? gals.size : 0));
      const dark = this.dark;
      // el núcleo de cada galaxia brilla, también de canto
      if (gals) {
        const c = this.tmpCol;
        for (const G of gals.values()) {
          c.copy(this.col(G.color)).lerp(this.warmWhite, 0.45);
          this.halos.push(G.c.x, G.c.y, G.c.z, c, G.color === 'ghost' ? 0.25 : 0.5, 3.2 + G.R * 0.45, 0.35);
        }
      }
      const put = (it, s) => {
        const d = it.data;
        const v = it.curV;
        const head = d.heads.length > 0;
        // de la rama resaltada: sus commits y su cabeza, aunque no tenga commits propios
        const lit = !this.hlAmt || d.chain === this.hlChain || (head && d.heads.includes(this.hlChain.slice(2)));
        const col = this.tint(d.color, lit);
        const a = lit ? 1 : 1 - this.hlAmt * 0.9; // los halos de lo apagado casi se van
        const k = s * (1 + 0.3 * it.hov);
        (d.merge ? this.iTorus : this.iSphere).point(v.x, v.y, v.z, (head ? HEAD_SCALE : 1) * k, col);
        if (head) this.halos.push(v.x, v.y, v.z, col, ((dark ? 0.72 : 0.4) + 0.2 * it.hov) * a, 3.3 * k, 1);
        else if (dark && d.color !== 'ghost') this.halos.push(v.x, v.y, v.z, col, (0.26 + 0.4 * it.hov) * a, 1.7 * k, 0);
        else if (it.hov > 0.01) this.halos.push(v.x, v.y, v.z, col, 0.4 * it.hov * a, 2.2 * k, 0);
      };
      for (const it of this.nodes.values()) put(it, it.born ? Math.max(0.001, easeOutBack(clamp((now - it.born) / 550, 0, 1))) : 1);
      for (const d of this.dying) put(d.it, Math.max(0.001, 1 - clamp((now - d.t0) / 350, 0, 1)));
      this.iSphere.end();
      this.iTorus.end();
      this.halos.end();
    }

    /** Todas las aristas al lote instanciado: las rectas, un tramo; las curvas, varios (ver curvePoints). */
    writeEdges(now) {
      let anim = false;
      const count = { line: 0, ghost: 0, stub: 0, ground: 0 }; // tramos de cada lote, para reservar lo justo
      for (const it of this.edges.values()) {
        const e = it.data;
        count[e.kind === 'stub' ? 'stub' : e.color === 'ghost' ? 'ghost' : 'line'] += e.kind === 'fork' || e.kind === 'merge' ? CURVE_SEGS + 1 : 1;
        if (e.kind !== 'stub' && !this.galaxy) count.ground++; // su sombra en el suelo: un tramo recto (en el espacio no hay suelo)
      }
      // con miles de tramos, tubos de ocho lados y sin tapas; con decenas de miles, de cinco
      const segs = count.line + count.ghost;
      const tube = segs > 20000 ? this.geo.tubeLo : segs > 6000 ? this.geo.tubeMid : this.geo.tube;
      this.iLine.setGeometry(tube);
      this.iGhost.setGeometry(tube);
      this.iLine.begin(count.line);
      this.iGhost.begin(count.ghost);
      this.iStub.begin(count.stub * 3);
      this.iGround.begin(count.ground);
      for (const it of this.edges.values()) {
        const e = it.data;
        const b = this.nodes.get(e.to)?.curV;
        if (!b) continue;
        const col = this.tint(e.color, e.chain === this.hlChain);
        if (e.kind === 'stub') {
          this.stub(b, col, this.galaxy ? this.gx.stubDir(e.to, this.tmpP) : null);
          continue;
        }
        const a = this.nodes.get(e.from)?.curV;
        if (!a) continue;
        let p = 1;
        if (it.born) {
          p = clamp((now - it.born) / DUR, 0, 1);
          if (p >= 1) it.born = 0;
          else anim = true;
        }
        const ghost = e.color === 'ghost';
        const r = ghost ? GHOST_R : EDGE_R;
        if (!this.galaxy) this.iGround.segment(a.x, 0, a.z, a.x + (b.x - a.x) * p, 0, a.z + (b.z - a.z) * p, ghost ? 0.08 : 0.14, col);
        const lot = ghost ? this.iGhost : this.iLine;
        if (e.kind === 'line' || (!this.galaxy && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3)) {
          lot.segment(a.x, a.y, a.z, a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, a.z + (b.z - a.z) * p, r, col);
          continue;
        }
        // la curva crece desde su origen mientras nace
        const pts = this.curvePoints(it, a, b);
        const segs = pts.length / 3 - 1;
        const upto = p * segs;
        for (let s = 0; s < segs && s < upto; s++) {
          const f = Math.min(1, upto - s);
          const o = s * 3;
          lot.segment(
            pts[o],
            pts[o + 1],
            pts[o + 2],
            pts[o] + (pts[o + 3] - pts[o]) * f,
            pts[o + 1] + (pts[o + 4] - pts[o + 1]) * f,
            pts[o + 2] + (pts[o + 5] - pts[o + 2]) * f,
            r,
            col,
            r * 0.6,
          );
        }
      }
      this.iLine.end();
      this.iGhost.end();
      this.iStub.end();
      this.iGround.end();
      return anim;
    }

    /** La historia sigue más atrás: tres trazos que se funden con el fondo (en el espacio, brazo afuera). */
    stub(b, col, dir) {
      const c = this.tmpCol;
      const dash = (from, to, fade) => {
        c.copy(col).lerp(this.galaxy ? this.spaceCol : this.bg, fade);
        if (dir) this.iStub.segment(b.x + dir.x * SP * from, b.y + dir.y * SP * from, b.z + dir.z * SP * from, b.x + dir.x * SP * to, b.y + dir.y * SP * to, b.z + dir.z * SP * to, 0.035, c);
        else this.iStub.segment(b.x, b.y, b.z - SP * to, b.x, b.y, b.z - SP * from, 0.035, c);
      };
      dash(0.12, 0.42, 0.35);
      dash(0.55, 0.8, 0.6);
      dash(0.93, 1.12, 0.82);
    }

    /**
     * Puntos de una curva de bifurcación (sale de `a` y se abre hasta el carril de `b`) o de merge
     * (deja su carril y entra en `b`): una Bézier cúbica con muestras más juntas en las puntas, donde
     * dobla, más el tramo recto hasta el otro extremo. Se recalcula solo si los extremos se movieron.
     */
    curvePoints(it, a, b) {
      if (it.pts && it.ax === a.x && it.ay === a.y && it.az === a.z && it.bx === b.x && it.by === b.y && it.bz === b.z) return it.pts;
      const pts = this.galaxy ? this.gx.curve(it, a, b) : this.laneCurve(it, a, b);
      it.pts = pts;
      it.ax = a.x;
      it.ay = a.y;
      it.az = a.z;
      it.bx = b.x;
      it.by = b.y;
      it.bz = b.z;
      return pts;
    }

    laneCurve(it, a, b) {
      const fork = it.data.kind === 'fork';
      const d = Math.max(0.4, Math.min(SP * 1.7, b.z - a.z));
      // P0..P3 de la Bézier; la recta va después (bifurcación) o antes (merge)
      const p0 = fork ? a : this.tmpA.set(a.x, a.y, b.z - d);
      const p3 = fork ? this.tmpB.set(b.x, b.y, a.z + d) : b;
      const z1 = fork ? a.z + d * 0.6 : b.z - d * 0.4;
      const z2 = fork ? a.z + d * 0.4 : b.z - d * 0.6;
      const straight = fork ? b.z - p3.z > 0.01 : p0.z - a.z > 0.01;
      const N = clamp(Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.8) + 6, 8, CURVE_SEGS);
      const pts = new Float32Array((N + 1 + (straight ? 1 : 0)) * 3);
      let o = 0;
      const put = (x, y, z) => {
        pts[o++] = x;
        pts[o++] = y;
        pts[o++] = z;
      };
      if (straight && !fork) put(a.x, a.y, a.z);
      for (let i = 0; i <= N; i++) {
        const t = 0.5 - 0.5 * Math.cos((Math.PI * i) / N);
        const u = 1 - t;
        const w0 = u * u * u;
        const w1 = 3 * u * u * t;
        const w2 = 3 * u * t * t;
        const w3 = t * t * t;
        // P1 está sobre el carril de a y P2 sobre el de b: solo cambia su z
        put(
          (w0 + w1) * a.x + (w2 + w3) * b.x,
          (w0 + w1) * a.y + (w2 + w3) * b.y,
          w0 * p0.z + w1 * z1 + w2 * z2 + w3 * p3.z,
        );
      }
      if (straight && fork) put(b.x, b.y, b.z);
      return pts;
    }

    /** Líneas punteadas de la cabeza de cada rama sin commits propios hasta su etiqueta, en un solo objeto. */
    writePointers() {
      const geo = this.pointerLines.geometry;
      const need = this.pointers.size * 2;
      if (need > this.pointerCap) {
        this.pointerCap = Math.max(64, 2 ** Math.ceil(Math.log2(need)));
        const attr = (size) => new THREE.BufferAttribute(new Float32Array(this.pointerCap * size), size).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', attr(3));
        geo.setAttribute('color', attr(3));
        geo.setAttribute('lineDistance', attr(1));
      }
      if (!this.pointerCap) return;
      const pos = geo.attributes.position.array;
      const colors = geo.attributes.color.array;
      const dist = geo.attributes.lineDistance.array;
      let k = 0;
      for (const name of this.pointers) {
        const h = this.heads.get(name);
        const node = h && this.nodes.get(h.data.sha)?.curV;
        if (!node) continue;
        const col = this.tint(h.data.color, h.data.chain === this.hlChain);
        const v = h.curV;
        pos.set([node.x, node.y, node.z, v.x, v.y, v.z], k * 3);
        colors.set([col.r, col.g, col.b, col.r, col.g, col.b], k * 3);
        dist[k] = 0;
        dist[k + 1] = node.distanceTo(v);
        k += 2;
      }
      geo.setDrawRange(0, k);
      upload(geo.attributes.position, k * 3);
      upload(geo.attributes.color, k * 3);
      upload(geo.attributes.lineDistance, k);
      this.pointerLines.visible = k > 0;
    }

    /* ---------- efectos ---------- */

    /** Onda que se expande en el plano del commit (perpendicular al tiempo). */
    ripple(v, col, k = 1) {
      const mesh = new THREE.Mesh(
        this.geo.ring,
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: this.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      mesh.position.copy(v);
      mesh.scale.setScalar(0.6);
      if (this.galaxy) mesh.quaternion.copy(this.camera.quaternion); // en el espacio no hay eje del tiempo: de frente
      this.gFx.add(mesh);
      this.ripples.push({ mesh, t0: performance.now(), k });
    }

    /** Llegada de un commit: onda, chispas y un destello del presente. */
    burst(v, col) {
      this.ripple(v, col);
      const spark = col.clone().lerp(new THREE.Color(0xffffff), this.dark ? 0.45 : 0.1);
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2.5 + Math.random() * 4.5;
        this.sparkList.push({
          x: v.x,
          y: v.y,
          z: v.z,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          vz: (Math.random() - 0.35) * 3,
          t: 0,
          life: 0.6 + Math.random() * 0.5,
          size: 0.35 + Math.random() * 0.35,
          col: spark,
        });
      }
      if (this.sparkList.length > 480) this.sparkList.splice(0, this.sparkList.length - 480);
      this.flashAmt = Math.min(1, this.flashAmt + 0.6);
    }

    /* ---------- celebraciones: cada tipo de evento con su efecto ---------- */

    /** Efectos de las actividades que acaban de llegar: solo en vivo, con la vista 3D activa y con
        movimiento. Cada tipo tiene un tope por tanda, así una ráfaga no satura la escena. */
    celebrate(acts) {
      this.director?.push(acts); // el director decide qué filmar (también sin movimiento: con cortes)
      if (!this.active || !this.motion || !this.nodes.size || !acts?.length) return;
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
            if (room('arc', 4)) this.later((delay += 200), () => this.mergeArc(head, base || a.branch));
            break;
          case 'pr-open':
            if (room('beacon', 4)) this.later((delay += 150), () => this.beacon(a.branch || head));
            break;
          case 'release':
            if (now - (this.lastFireworks ?? -1e9) > 15000) {
              this.lastFireworks = now;
              this.later(delay, () => this.fireworks());
            }
            break;
          case 'star':
          case 'fork':
            if (room('star', 2)) this.later((delay += 400), () => this.shootingStar(a.kind === 'fork'));
            break;
          case 'force':
            this.alarm(branch, this.sevCol.bad, false);
            break;
          case 'review-ok':
            this.alarm(branch, this.sevCol.good, true);
            break;
          case 'review-changes':
            this.alarm(branch, this.sevCol.warn, false);
            break;
          case 'branch-delete':
          case 'branch-delete-unmerged':
            if (room('puff', 6)) this.puff(a.branch);
            break;
        }
      }
    }

    later(ms, fn) {
      this.pending.push({ at: performance.now() + ms, fn });
    }

    /** Dónde está una rama: su commit cabeza (posición actual y final), o dónde se la vio por última
        vez si se acaba de borrar. */
    branchPos(name) {
      const h = name && this.heads.get(name);
      if (h && this.galaxy) return { pos: h.curV, toV: h.toV, color: h.liveColor || h.data.color }; // el núcleo de su galaxia
      if (h) {
        const node = this.nodes.get(h.data.sha);
        return { pos: node?.curV || h.curV, toV: node?.toV || h.toV, color: h.liveColor || h.data.color };
      }
      const g = name && this.goneHeads.get(name);
      return g ? { pos: g.pos, toV: g.pos, color: g.color } : null;
    }

    defaultHead() {
      for (const h of this.heads.values()) if (h.data.isDefault) return h.data.name;
      return null;
    }

    /** Lado de la pantalla donde está una rama, de -1 a 1: el sonido sale de ahí. */
    panOf(name) {
      const at = this.active && this.W ? this.branchPos(name) : null;
      if (!at) return 0;
      const p = this.tmpP.copy(at.pos).project(this.camera);
      return p.z > 1 ? 0 : clamp(p.x, -1, 1);
    }

    /** Una chispa suelta en una dirección al azar. */
    spark(v, col, size, life, speed, extra) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - y * y) * speed;
      this.sparkList.push({ x: v.x, y: v.y, z: v.z, vx: Math.cos(a) * r, vy: y * speed, vz: Math.sin(a) * r, t: 0, life, size, col, ...extra });
    }

    /** PR fusionado: un cometa viaja en arco desde la rama del PR hasta su base y aterriza con una onda. */
    mergeArc(head, base) {
      const to = this.branchPos(base) || this.branchPos(this.defaultHead());
      if (!to) return;
      const from = this.branchPos(head);
      const B = to.toV.clone();
      let A;
      if (from) A = from.pos.clone();
      else {
        // la rama del PR no está en el grafo: el cometa llega desde fuera de la espiral
        const out = this.tmpA.set(B.x, B.y, 0);
        if (out.lengthSq() < 0.01) out.set(0, 1, 0);
        out.normalize().multiplyScalar(this.fxR * 0.9 + 3);
        A = B.clone().add(out).setZ(B.z - 8);
      }
      if (A.distanceTo(B) < 0.5) A.y += 3;
      // el arco se abre hacia afuera del tronco, más alto cuanto más lejos están los extremos
      const lift = this.galaxy ? this.tmpA.set(0, 1, 0) : this.tmpA.set((A.x + B.x) / 2, (A.y + B.y) / 2, 0);
      if (lift.lengthSq() < 0.01) lift.set(0, 1, 0);
      lift.normalize().multiplyScalar(3 + A.distanceTo(B) * 0.35);
      const curve = new THREE.CubicBezierCurve3(A, A.clone().add(lift), B.clone().add(lift), B);
      const col = this.col(from && from.color !== 'ghost' ? from.color : to.color).clone();
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 72, 0.12, 6, false),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: col }, uHead: { value: 0 }, uOpacity: { value: 1 }, uPath: { value: this.dark ? 0.14 : 0.2 } },
          vertexShader: ARC_VS,
          fragmentShader: ARC_FS,
          transparent: true,
          depthWrite: false,
          blending: this.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      this.gFx.add(mesh);
      const glow = col.clone().lerp(this.white, 0.5);
      const u = mesh.material.uniforms;
      const t0 = performance.now();
      const dur = 1400;
      let landed = false;
      this.fx.push({
        mesh,
        step: (now) => {
          const p = (now - t0) / dur;
          if (p < 1) {
            const e = 1 - (1 - clamp(p, 0, 1)) ** 2; // sale disparado y frena al aterrizar
            u.uHead.value = e;
            const c = curve.getPoint(e, this.tmpP);
            this.fxGlows.push({ x: c.x, y: c.y, z: c.z, col: glow, a: 1, size: 2.4 });
            if (Math.random() < 0.8) this.spark(c, glow, 0.5, 0.6, 0.6);
            return true;
          }
          if (!landed) {
            landed = true;
            this.burst(B, col);
            this.ripple(B, col, 1.7);
          }
          const q = (now - t0 - dur) / 700; // la estela entra en la base y se apaga
          u.uHead.value = 1 + q * 0.8;
          u.uPath.value = 0;
          u.uOpacity.value = Math.max(0, 1 - q);
          return q < 1;
        },
      });
    }

    /** PR abierto: un faro de luz se levanta sobre la rama y la sigue si se mueve. */
    beacon(name) {
      const at = this.branchPos(name);
      if (!at) return;
      const col = this.col(at.color).clone();
      const mesh = new THREE.Mesh(
        this.geo.beam,
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: col }, uOpacity: { value: 0 }, uTime: this.u.time },
          vertexShader: BEAM_VS,
          fragmentShader: BEAM_FS,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: this.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      mesh.position.copy(at.pos);
      mesh.scale.set(1, 0.01, 1);
      this.gFx.add(mesh);
      this.ripple(at.pos, col);
      const top = col.clone().lerp(this.white, 0.4);
      const H = 7 + this.fxR * 0.3;
      const peak = this.dark ? 1 : 0.65;
      const t0 = performance.now();
      this.fx.push({
        mesh,
        step: (now) => {
          const s = (now - t0) / 1000;
          const here = this.branchPos(name);
          if (here) mesh.position.copy(here.pos);
          mesh.scale.y = H * easeOut(clamp(s / 0.6, 0, 1));
          const o = clamp(s / 0.25, 0, 1) * clamp((3.4 - s) / 0.9, 0, 1);
          mesh.material.uniforms.uOpacity.value = peak * o;
          this.fxGlows.push({ x: mesh.position.x, y: mesh.position.y + mesh.scale.y, z: mesh.position.z, col: top, a: 0.7 * o, size: 1.5 });
          return s < 3.4;
        },
      });
    }

    /** Release publicado: fuegos artificiales sobre la rama por defecto. */
    fireworks() {
      const at = this.branchPos(this.defaultHead());
      if (!at) return;
      const from = at.pos.clone();
      for (let i = 0; i < 4; i++) this.later(i * 420, () => this.rocket(from));
      this.flashAmt = 1;
    }

    rocket(from) {
      const a = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * 2;
      this.sparkList.push({
        x: from.x,
        y: from.y,
        z: from.z,
        vx: Math.cos(a) * out,
        vy: 10 + Math.random() * 4,
        vz: Math.sin(a) * out + 1.5,
        t: 0,
        life: 0.95 + Math.random() * 0.3,
        size: 0.6,
        col: this.warmWhite,
        g: 7,
        drag: 0.4,
        trail: 0.025,
        boom: true,
      });
    }

    /** El cohete estalla en una esfera de chispas de dos colores de la paleta, que caen y titilan. */
    explode(s) {
      const pick = () => this.col('c' + (1 + Math.floor(Math.random() * 8))).clone().lerp(this.white, this.dark ? 0.25 : 0);
      const cols = [pick(), pick()];
      for (let i = 0; i < 90; i++) {
        this.spark(s, cols[i % 2], 0.55 + Math.random() * 0.35, 1.3 + Math.random() * 0.7, 4.5 + Math.random() * 3.5, {
          g: 2.6,
          drag: 1.3,
          twinkle: Math.random() * 10,
        });
      }
      this.spark(s, this.warmWhite, 4, 0.35, 0); // el fogonazo del estallido
      this.flashAmt = Math.min(1, this.flashAmt + 0.4);
    }

    /** Estrella o fork nuevos: una estrella fugaz cruza el cielo, delante de la cámara. */
    shootingStar(fork) {
      const e = this.camera.matrixWorld.elements;
      const right = new THREE.Vector3(e[0], e[1], e[2]);
      const up = new THREE.Vector3(e[4], e[5], e[6]);
      const fwd = new THREE.Vector3(-e[8], -e[9], -e[10]);
      const D = 42;
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = this.camera.position
        .clone()
        .addScaledVector(fwd, D)
        .addScaledVector(up, D * (0.22 + Math.random() * 0.12))
        .addScaledVector(right, -side * D * 0.7);
      const v = right.multiplyScalar(side * D * 1.1).addScaledVector(up, -D * 0.25);
      const col = fork ? this.col('c2').clone().lerp(this.white, 0.45) : this.warmWhite;
      this.sparkList.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, t: 0, life: 1.25, size: 1.1, col, drag: 0, trail: 0.01, trailLife: 0.55, env: 1 });
    }

    /** Rama borrada: se deshace en polvo de su color que sube despacio. */
    puff(name) {
      const at = this.branchPos(name);
      if (!at) return;
      const col = this.col(at.color);
      for (let i = 0; i < 28; i++) this.spark(at.pos, col, 0.3 + Math.random() * 0.25, 1.3 + Math.random() * 0.9, 0.6 + Math.random() * 1.6, { g: -0.5, drag: 1.1 });
    }

    /** Revisión o force-push: dos ondas del color del estado sobre la rama (y chispas si es una aprobación). */
    alarm(name, col, cheer) {
      const at = this.branchPos(name);
      if (!at) return;
      const pos = at.pos.clone();
      this.ripple(pos, col);
      this.later(180, () => this.ripple(pos, col, 0.7));
      if (cheer) {
        const c = col.clone().lerp(this.white, 0.4);
        for (let i = 0; i < 14; i++) this.spark(pos, c, 0.35, 0.8 + Math.random() * 0.4, 2.5 + Math.random() * 2, { g: -2 });
      }
    }

    stepFx(now, dt) {
      let changed = false;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const f = this.pending[i];
        if (now < f.at) continue;
        this.pending.splice(i, 1);
        if (now - f.at < 1000) f.fn(); // uno muy atrasado (la vista estuvo quieta) ya no viene a cuento
      }
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        if (!f.step(now)) {
          this.gFx.remove(f.mesh);
          if (f.mesh.geometry !== this.geo.beam) f.mesh.geometry.dispose();
          f.mesh.material.dispose();
          this.fx.splice(i, 1);
        }
        changed = true;
      }
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        const p = clamp((now - r.t0) / 1300, 0, 1);
        r.mesh.scale.setScalar((0.6 + 7 * easeOut(p)) * r.k * clamp(this.fxR / 8, 0.5, 1.2)); // proporcional al grafo
        r.mesh.material.opacity = (this.dark ? 0.85 : 0.55) * Math.pow(1 - p, 1.5);
        if (p >= 1) {
          this.gFx.remove(r.mesh);
          r.mesh.material.dispose();
          this.ripples.splice(i, 1);
        }
        changed = true;
      }
      if (this.sparkList.length || this.fxGlows.length || this.sparks.n) {
        const list = this.sparkList;
        this.sparks.begin(list.length + this.fxGlows.length);
        // hacia atrás: lo que se agrega en el cuadro (estelas, explosiones) se mueve desde el siguiente
        for (let i = list.length - 1; i >= 0; i--) {
          const s = list[i];
          s.t += dt;
          if (s.t >= s.life) {
            list[i] = list[list.length - 1]; // el orden no importa: se quita sin desplazar
            list.pop();
            if (s.boom) this.explode(s);
            continue;
          }
          const drag = Math.exp(-(s.drag ?? 2.8) * dt);
          if (s.g) s.vy -= s.g * dt;
          s.vx *= drag;
          s.vy *= drag;
          s.vz *= drag;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;
          if (s.trail) {
            for (s.acc = (s.acc || 0) + dt; s.acc >= s.trail; s.acc -= s.trail)
              list.push({ x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, t: 0, life: s.trailLife || 0.35, size: s.size * 0.55, col: s.col });
          }
          const q = 1 - s.t / s.life;
          let a = s.env ? Math.sin(Math.PI * (1 - q)) : q * q;
          if (s.twinkle) a *= 0.55 + 0.45 * Math.sin(s.t * 38 + s.twinkle);
          this.sparks.push(s.x, s.y, s.z, s.col, a, s.size * (0.6 + 0.4 * q), 0);
        }
        for (const g of this.fxGlows) this.sparks.push(g.x, g.y, g.z, g.col, g.a, g.size, 0);
        this.fxGlows.length = 0;
        if (list.length > 1600) list.splice(0, list.length - 1600);
        this.sparks.end();
        changed = true;
      }
      if (this.flashAmt > 0) {
        this.flashAmt = Math.max(0, this.flashAmt - dt * 1.4);
        changed = true;
      }
      this.nowLight.intensity = (this.dark ? 0.75 : 0.45) + this.flashAmt * 1.1;
      this.portal.material.uniforms.uFlash.value = this.flashAmt;
      return changed;
    }

    /** El anillo del presente avanza con suavidad cuando llegan commits. */
    stepPortal(dt) {
      const t = this.portalTarget;
      this.portal.visible = !!t;
      if (!t) return false;
      if (this.portalZ == null) (this.portalZ = t.z), (this.portalR = t.r);
      const dz = t.z - this.portalZ;
      const dr = t.r - this.portalR;
      const moving = Math.abs(dz) > 1e-3 || Math.abs(dr) > 1e-3;
      if (moving) {
        const k = this.motion ? 1 - Math.exp(-dt * 4) : 1;
        this.portalZ += dz * k;
        this.portalR += dr * k;
      }
      this.portal.position.set(0, 0, this.portalZ);
      this.portal.scale.setScalar(this.portalR);
      this.nowLight.position.set(this.portalR * 0.4, this.portalR * 0.7, this.portalZ + 4);
      return moving;
    }

    beforeRender() {
      const c = this.controls;
      const free = this.flight?.on || this.ride; // la cámara va suelta: niebla y polvo la siguen a ella
      // la niebla acompaña al zoom: lo que miras queda nítido y la historia se pierde detrás
      const space = this.galaxy;
      // en el espacio, la niebla deja ver los commits de las galaxias vecinas; las lejanas son solo su disco
      const near = (free ? (space ? 20 : 14) : this.camera.position.distanceTo(c.target)) * 0.8 + (space ? 12 : 6);
      const far = near + (space ? 170 : 70 + this.radius * 2.5);
      this.scene.fog.near = near;
      this.scene.fog.far = far;
      this.u.fog.value.set(near, far);
      this.stars.position.copy(this.camera.position);
      this.dust.visible = !space;
      this.gGround.visible = !space;
      this.gDays.visible = !space;
      if (this.world) {
        this.world.beforeRender();
        this.gGround.position.y = this.world.groundY + 0.12;
      }
      // el anillo del presente se desvanece cuando la cámara lo atraviesa o queda de canto
      if (this.portal.visible) {
        const cam = this.camera.position;
        const r = this.portalR;
        const near = Math.hypot(cam.x, cam.y, cam.z - this.portalZ) / r;
        const edgeOn = Math.abs(cam.z - this.portalZ) / Math.max(1e-3, Math.hypot(cam.x, cam.y, cam.z - this.portalZ));
        this.portal.material.uniforms.uOpacity.value = this.portalAlpha * clamp((near - 1.1) / 1.2, 0, 1) * clamp(edgeOn * 3, 0.25, 1);
      }
      const du = this.dust.material.uniforms;
      du.uZ0.value = (free ? this.camera.position.z - 25 : c.target.z) - 120;
      du.uR.value = this.radius;
    }

    /** Si los cuadros tardan de más con la cámara en movimiento, baja la resolución (nunca de 1×). */
    adapt(ft, now) {
      if (ft > 80 || this.dpr <= 1) return; // pestaña recién vuelta o ya al mínimo
      this.ftAvg = this.ftAvg ? this.ftAvg * 0.94 + ft * 0.06 : ft;
      if (this.ftAvg > 27 && now - (this.dprAt || 0) > 2500) {
        this.dprLimit = Math.max(1, this.dpr - 0.25);
        this.dprAt = now;
        this.ftAvg = 0;
        this.resize();
      }
    }

    hover() {
      if (!this.mouse?.moved || this.interacting) return;
      this.mouse.moved = false;
      const hit = this.pickAny(this.mouse.x, this.mouse.y);
      const sha = hit?.sha || null;
      const file = hit?.file || null;
      this.canvas.style.cursor = hit ? 'pointer' : '';
      this.setHover(sha);
      this.gx?.setHover(file);
      if (!this.pinned && !this.pinFile) {
        if (sha && sha !== this.tipSha) this.showTip(sha, false);
        else if (file && file !== this.tipFile) this.showFileTip(file, false);
        else if (!hit && (this.tipSha || this.tipFile)) this.hideTip();
      }
    }

    /**
     * Etiquetas de rama: se proyectan todas (es solo cálculo), se ordenan por cercanía (la rama por
     * defecto primero) y se ubican mientras no se pisen, con una grilla para no comparar cada una
     * con todas. Con pocas ramas las tapadas se atenúan; con muchas se ocultan y hay un tope, así
     * miles de ramas no llenan la pantalla ni el DOM.
     */
    placeLabels() {
      const camPos = this.camera.position;
      const axis = this.tmpA;
      const space = this.galaxy;
      const reach = space ? Math.max(260, this.radius * 2.4) : Math.max(160, this.radius * 1.3); // en grafos enormes la cámara está más lejos
      const range = space ? Math.max(140, this.radius * 2) : Math.max(80, this.radius * 2);
      const z = this.labelScale();
      const cand = [];
      for (const it of this.heads.values()) {
        const dist = camPos.distanceTo(it.curV);
        const p = dist < reach ? this.project(it.curV) : null;
        if (p && p.x > -40 && p.x < this.W + 40 && p.y > -20 && p.y < this.H + 20) cand.push({ it, px: p.x, py: p.y, dist });
        else if (it.el) this.setStyle(it, 'display', 'none');
      }
      const hl = this.hlAmt ? this.hlChain : null;
      // la etiqueta de la rama resaltada se ubica primero: nunca queda tapada ni oculta
      cand.sort((a, b) => (b.it.data.chain === hl) - (a.it.data.chain === hl) || b.it.data.isDefault - a.it.data.isDefault || a.dist - b.dist);
      const crowd = cand.length > FADE_MAX;
      const CELL = 96;
      const grid = new Map();
      const cells = (r, fn) => {
        for (let cx = Math.floor((r.x - 4) / CELL); cx <= Math.floor((r.x + r.w + 4) / CELL); cx++)
          for (let cy = Math.floor(r.y / CELL); cy <= Math.floor((r.y + r.h + 2) / CELL); cy++) if (fn(cx * 4099 + cy)) return true;
        return false;
      };
      const hits = (s) =>
        cells(s, (key) => (grid.get(key) || []).some((r) => s.x < r.x + r.w + 4 && r.x < s.x + s.w + 4 && s.y < r.y + r.h + 2 && r.y < s.y + s.h + 2));
      let shown = 0;
      for (const s of cand) {
        const it = s.it;
        if (shown >= MAX_LABELS) {
          if (it.el) this.setStyle(it, 'display', 'none');
          continue;
        }
        // la etiqueta se aleja del tronco en pantalla, así las ramas vecinas no se pisan
        // (en el espacio, sobre el núcleo de su galaxia, un poco arriba a la derecha)
        const q = space ? null : this.project(axis.set(0, 0, it.curV.z));
        let dx = q ? s.px - q.x : 1;
        let dy = q ? s.py - q.y : -0.4;
        const len = Math.hypot(dx, dy);
        if (space) (dx = 0.62), (dy = -0.78);
        else if (len < 4) (dx = 0.7), (dy = -0.7);
        else (dx /= len), (dy /= len);
        const off = it.data.own ? 18 : 12;
        s.w = Math.ceil(it.w * z);
        s.h = Math.ceil(22 * z);
        s.x = clamp(s.px + dx * off - (dx < -0.2 ? s.w : 0), 4, Math.max(4, this.W - s.w - 4));
        s.y = s.py + dy * off - s.h / 2;
        const hit = hits(s);
        if (hit && crowd) {
          if (it.el) this.setStyle(it, 'display', 'none');
          continue;
        }
        if (!hit) {
          cells(s, (key) => void (grid.get(key) || grid.set(key, []).get(key)).push(s));
          shown++;
        }
        if (!it.el) this.makeHead(it);
        const fade = clamp(1.15 - (s.dist - 30) / range, 0.3, 1);
        let op = hit ? fade * 0.22 : fade;
        // con una rama resaltada, su etiqueta pasa al frente y las demás se apagan
        const lit = hl && it.data.chain === hl;
        if (hl) op = lit ? op + (1 - op) * this.hlAmt : op * (1 - 0.75 * this.hlAmt);
        this.setStyle(it, 'display', '');
        this.setStyle(it, 'transform', `translate(${Math.round(s.x)}px,${Math.round(s.y)}px)`);
        this.setStyle(it, 'opacity', op.toFixed(2));
        this.setStyle(it, 'zIndex', String(lit ? 1999 : hit ? 100 : Math.max(101, 1000 - Math.round(s.dist))));
      }
      // fechas del eje: del presente al pasado, sin pisarse entre ellas ni a las etiquetas de rama
      const top = this.tmpB;
      const days = space ? [] : [...this.days.values()].sort((a, b) => b.mesh.position.z - a.mesh.position.z);
      for (const d of days) {
        top.set(0, (this.dayR || this.radius) + 0.7, d.mesh.position.z);
        const p = this.project(top);
        const dist = camPos.distanceTo(top);
        let vis = p && p.x > 0 && p.x < this.W - 40 && p.y > 4 && p.y < this.H - 10 && dist < reach * 0.75;
        if (vis) {
          const r = { w: Math.ceil(d.w * z), h: Math.ceil(17 * z) };
          r.x = p.x - r.w / 2;
          r.y = p.y - r.h;
          vis = !hits(r);
          if (vis) cells(r, (key) => void (grid.get(key) || grid.set(key, []).get(key)).push(r));
        }
        this.setStyle(d, 'display', vis ? '' : 'none');
        if (vis) {
          this.setStyle(d, 'transform', `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`);
          this.setStyle(d, 'opacity', clamp(1.1 - (dist - 30) / range, 0.25, 1).toFixed(2));
        }
      }
      if (space) for (const d of this.days.values()) this.setStyle(d, 'display', 'none');
      this.placeNotes(hits, cells, grid, hl);
      if (space) this.gx.placeLabels();
      if ((this.tipSha || this.tipFile) && !this.tip.hidden) this.placeTip();
    }

    /**
     * De cerca, cada commit muestra su mensaje (la primera línea) a su derecha: los más cercanos
     * primero, sin pisar las etiquetas ni a los demás y con un tope. Solo en el valle: en el
     * espacio los rótulos son de las galaxias y los planetas.
     */
    placeNotes(hits, cells, grid, hl) {
      let n = 0;
      if (!this.galaxy && this.nodes.size) {
        const cam = this.camera.position;
        const near = [];
        for (const it of this.nodes.values()) {
          const d2 = it.curV.distanceToSquared(cam);
          if (d2 < NOTE_D * NOTE_D && it.sha !== this.tipSha) near.push({ it, d2 }); // el de la ficha ya lo dice
        }
        near.sort((a, b) => a.d2 - b.d2);
        const z = this.labelScale();
        const px = this.H / (2 * Math.tan((this.camera.fov * Math.PI) / 360)); // píxeles por unidad, a distancia 1
        for (const { it, d2 } of near) {
          if (n >= MAX_NOTES) break;
          const p = this.project(it.curV);
          if (!p || p.x < 0 || p.y < 8 || p.y > this.H - 8) continue;
          const c = it.data.commit;
          if (it.noteOf !== c) {
            it.noteOf = c;
            it.note = U.truncate(U.firstLine(c?.message), 48);
            it.noteW = Math.ceil(GB.graphShared.measure(it.note, GB.graphShared.SMALL_FONT) + 12);
          }
          if (!it.note) continue;
          const dist = Math.sqrt(d2);
          const r = (NODE_R * (it.data.heads.length ? HEAD_SCALE : 1) * px) / dist; // radio del commit en pantalla
          const s = { x: p.x + r + 6, w: Math.ceil(it.noteW * z), h: Math.ceil(17 * z) };
          s.y = p.y - s.h / 2;
          if (s.x + s.w > this.W - 4 || hits(s)) continue;
          cells(s, (key) => void (grid.get(key) || grid.set(key, []).get(key)).push(s));
          const note = this.notes[n] || (this.notes[n] = this.makeNote());
          n++;
          if (note.text !== it.note) note.el.textContent = note.text = it.note;
          // aparece al acercarse; con otra rama resaltada, se apaga como ella
          let op = clamp((NOTE_D - dist) / (NOTE_D * 0.25), 0, 1);
          if (hl && it.data.chain !== hl) op *= 1 - 0.8 * this.hlAmt;
          this.setStyle(note, 'display', '');
          this.setStyle(note, 'transform', `translate(${Math.round(s.x)}px,${Math.round(s.y)}px)`);
          this.setStyle(note, 'opacity', op.toFixed(2));
        }
      }
      for (let i = n; i < this.notes.length; i++) this.setStyle(this.notes[i], 'display', 'none');
    }

    makeNote() {
      const el = document.createElement('span');
      el.className = 'g3-note';
      el.setAttribute('aria-hidden', 'true'); // la ficha del commit dice lo mismo, y más
      this.labelLayer.appendChild(el);
      return { el, text: null, st: {} };
    }

    /** Escribe un estilo solo si cambió: decenas de etiquetas por cuadro sin trabajo de más. */
    setStyle(it, prop, value) {
      const cache = it.st || (it.st = {});
      if (cache[prop] === value) return;
      cache[prop] = value;
      it.el.style[prop] = value;
    }

    clear() {
      for (const it of this.heads.values()) it.el?.remove();
      for (const d of this.days.values()) (this.gDays.remove(d.mesh), d.el.remove());
      for (const r of this.ripples) (this.gFx.remove(r.mesh), r.mesh.material.dispose());
      for (const m of [this.nodes, this.edges, this.heads, this.pointers, this.days]) m.clear();
      for (const f of this.fx) {
        this.gFx.remove(f.mesh);
        if (f.mesh.geometry !== this.geo.beam) f.mesh.geometry.dispose();
        f.mesh.material.dispose();
      }
      this.fx = [];
      this.fxGlows = [];
      this.goneHeads.clear();
      this.ripples = [];
      this.sparkList = [];
      this.pending = [];
      this.dying = [];
      this.layout = null;
      this.maxX = 0;
      this.placed = false;
      this.fly = null;
      this.hoverSha = null;
      this.hlHover = this.hlFocus = this.hlPin = this.hlChain = null;
      this.hlAmt = 0;
      this.portalTarget = null;
      this.portalZ = null;
      this.nodeAnim = this.edgeAnim = false;
      this.flight?.exit();
      this.director?.reset();
      this.setFade(false);
      this.ride = null;
      this.world?.clear();
      this.gx?.clear();
      this.controls.enabled = true;
      this.unpin();
      this.following = true;
      this.opts.onFollowChange?.(true);
      this.dirtyNodes = this.dirtyEdges = true;
      this.needsRender = true;
    }
  }

  Graph3D.Instances = Instances; // los usa galaxy.js para sus planetas
  Graph3D.GlowLayer = GlowLayer;
  GB.Graph3D = Graph3D;
})(window.GB);
