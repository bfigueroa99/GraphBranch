/* GraphBranch — el mundo de la vista 3D: el grafo deja de flotar en el vacío y recorre un valle.
   El tiempo corre por el fondo del valle; a los lados suben colinas y montañas con curvas de nivel,
   como en un mapa, hasta el horizonte. Arriba, un cielo con su horizonte, el sol (la luna en el
   tema oscuro) y nubes que derivan con el viento. El terreno es una sola malla que acompaña a la
   cámara de a una celda (así las facetas no "nadan") y su altura sale de la misma función en el
   sombreador y aquí: el vuelo no atraviesa el suelo y la órbita no baja de él.

   En el modo vuelo suma lo de un juego de mundo abierto: brújula con el presente, el pasado y las
   ramas; minimapa que gira con la mirada; altura y velocidad; cada rama se descubre al pasar cerca
   (con su rótulo y su sonido, y el mapa se va completando; se recuerda por repositorio) y una rama
   se puede marcar como destino: una columna de luz la señala desde lejos y la brújula da la
   distancia. En el modo galaxias (galaxy.js) no hay valle ni cielo de día: el mundo es el espacio,
   sin suelo, y la brújula y el minimapa llevan a las galaxias. Lo usa graph3d.js. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const tr = i18n.t;
  const SEGS = 150; // terreno de 150 × 150 facetas…
  const CELL = 6; // …de 6 unidades: 900 de lado
  const METERS = 5; // metros por unidad de la escena (los commits quedan a 10 m)
  const SPACE_KM = 100; // kilómetros por unidad en el espacio: un planeta mide decenas de km, un sistema miles
  const DISCOVER = 8; // a esta distancia de su cabeza, una rama queda descubierta
  const ARRIVE = 6; // a esta distancia del destino, se llega
  const FOV = Math.PI * 0.9; // ancho de la brújula, en radianes
  const CLOUDS = 70;
  const PUFFS = 4; // copos por nube
  const CLOUD_TILE = 720; // las nubes se repiten en un mosaico alrededor de la cámara
  const BANNER_MS = 2800;
  const MAX_MARKS = 40; // ramas en la brújula a la vez: las más cercanas de las que quedan a la vista
  const PICK_MS = 250; // cada cuánto se vuelven a elegir (moverlas es cada cuadro)
  const SOUND_MS = 600; // al cruzar una zona densa, un motivo cada tanto, no una ráfaga
  /** Escala del mundo: con miles de ramas la espiral es enorme y el valle, las montañas y la bruma crecen con ella. */
  const scaleFor = (radius) => Math.max(1, radius / 30);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fract = (x) => x - Math.floor(x);
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const wrapAngle = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

  /* ---------- relieve: la misma función aquí y en el sombreador ---------- */

  /* ruido de valor con un hash sin seno (da lo mismo en la GPU y en JavaScript) */
  function hash(x, y) {
    let a = fract(x * 0.1031);
    let b = fract(y * 0.1031);
    let c = a;
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d;
    b += d;
    c += d;
    return fract((a + b) * c);
  }

  function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }

  /* El fondo del valle es plano bajo el grafo; más afuera, una llanura con lomas, y desde las
     paredes, colinas que crecen hasta montañas con crestas. `valley`: (fondo plano, pie de las
     montañas, cumbres); `uK`: escala del mundo (relieve más ancho y más alto con espirales enormes). */
  const HEIGHT_GLSL = `
    uniform float uGround;
    uniform vec3 uValley;
    uniform float uK;
    float gbHash( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.x + p3.y ) * p3.z );
    }
    float gbNoise( vec2 p ) {
      vec2 i = floor( p );
      vec2 f = fract( p );
      vec2 u = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( gbHash( i ), gbHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( gbHash( i + vec2( 0.0, 1.0 ) ), gbHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
    }
    float gbHeight( vec2 p ) {
      float w = abs( p.x );
      vec2 q = p / uK;
      float hills = gbNoise( q * 0.011 ) * 0.55 + gbNoise( q * 0.027 + 17.0 ) * 0.3 + gbNoise( q * 0.063 + 41.0 ) * 0.15;
      float ridge = 1.0 - abs( 2.0 * gbNoise( q * 0.018 + 5.0 ) - 1.0 );
      float side = smoothstep( uValley.y, uValley.z, w );
      float plain = smoothstep( uValley.x, uValley.y, w );
      float dunes = plain * ( gbNoise( q * 0.08 + 3.0 ) * 1.8 + gbNoise( q * 0.026 + 9.0 ) * plain * 7.0 );
      return uGround + uK * ( dunes + side * side * ( hills * hills * 95.0 + ridge * ridge * ridge * 40.0 ) );
    }`;

  /* terreno: facetas planas iluminadas por el sol, curvas de nivel y bruma hacia el horizonte */
  const TERRAIN_VS = `${HEIGHT_GLSL}
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4( position, 1.0 );
      w.y = gbHeight( w.xz );
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const TERRAIN_FS = `
    uniform float uGround;
    uniform vec3 uLow;
    uniform vec3 uHigh;
    uniform vec3 uLine;
    uniform vec3 uHaze;
    uniform vec3 uSun;
    uniform vec2 uFogW;
    uniform float uLineA;
    uniform float uShade;
    uniform float uK;
    varying vec3 vW;
    void main() {
      vec3 n = normalize( cross( dFdx( vW ), dFdy( vW ) ) );
      if ( n.y < 0.0 ) n = -n;
      float h = ( vW.y - uGround ) / uK;
      vec3 col = mix( uLow, uHigh, smoothstep( 2.0, 70.0, h ) );
      col *= 1.0 + uShade * ( dot( n, uSun ) - uSun.y ); // el suelo plano es la referencia
      // curvas de nivel cada 3 unidades, más marcadas cada 15; ninguna en el fondo del valle
      float c = h / 3.0;
      float fw = fwidth( c );
      float line = 1.0 - smoothstep( 0.5 * fw, 1.5 * fw, abs( fract( c + 0.5 ) - 0.5 ) );
      float major = 1.0 - step( 0.5, abs( mod( floor( c + 0.5 ), 5.0 ) ) );
      line *= smoothstep( 0.6, 2.5, h ) * ( 1.0 - smoothstep( 0.25, 0.6, fw ) ) * ( 0.65 + 0.7 * major );
      float d = distance( vW, cameraPosition );
      col = mix( col, uLine, clamp( line * uLineA * ( 1.0 - smoothstep( 80.0 * uK, 320.0 * uK, d ) ), 0.0, 1.0 ) );
      gl_FragColor = vec4( mix( col, uHaze, smoothstep( uFogW.x, uFogW.y, d ) ), 1.0 );
    }`;

  /* cielo: del horizonte (el color del fondo, para que la bruma se funda) al cenit, con dos
     manchas de color de rama, como el fondo de antes, y el sol o la luna */
  const SKY_VS = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_Position = p.xyww;
    }`;
  const SKY_FS = `
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uGlow;
    uniform vec3 uNeb1;
    uniform vec3 uNeb2;
    uniform float uNebA;
    uniform vec3 uSun;
    uniform vec3 uSunCol;
    uniform float uSunGlow;
    uniform float uDisk;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize( vDir );
      float e = d.y;
      vec3 col = mix( uHorizon, uZenith, pow( clamp( e, 0.0, 1.0 ), 0.55 ) );
      col += uGlow * exp( -max( e, 0.0 ) * 14.0 );
      col = mix( col, uNeb1, uNebA * pow( max( dot( d, vec3( 0.48, 0.42, -0.77 ) ), 0.0 ), 5.0 ) );
      col = mix( col, uNeb2, uNebA * pow( max( dot( d, vec3( -0.83, 0.3, 0.47 ) ), 0.0 ), 5.0 ) );
      float s = max( dot( d, uSun ), 0.0 );
      col += uSunCol * uSunGlow * ( pow( s, 24.0 ) + 0.3 * pow( s, 5.0 ) );
      col = mix( col, uSunCol, smoothstep( uDisk - 0.00008, uDisk, s ) );
      col = mix( col, uHorizon, smoothstep( 0.0, -0.03, e ) ); // bajo el horizonte, bruma lisa
      gl_FragColor = vec4( col, 1.0 );
    }`;

  /* nubes: racimos de copos que miran a la cámara; la panza más oscura, sin tapar la vista de cerca */
  const CLOUD_VS = `
    attribute vec4 aCloud;
    attribute vec3 aPuff;
    uniform float uTime;
    uniform float uTile;
    uniform float uBase;
    uniform float uK;
    uniform vec2 uFade;
    varying vec2 vUv;
    varying float vA;
    varying float vShade;
    void main() {
      vec3 c = vec3( aCloud.x * uK + uTime * 0.9, uBase + aCloud.y * uK, aCloud.z * uK + uTime * 0.3 );
      c.x = cameraPosition.x + mod( c.x - cameraPosition.x + uTile * 0.5, uTile ) - uTile * 0.5;
      c.z = cameraPosition.z + mod( c.z - cameraPosition.z + uTile * 0.5, uTile ) - uTile * 0.5;
      vec4 mv = viewMatrix * vec4( c, 1.0 );
      float s = aCloud.w * uK * ( 0.55 + 0.5 * aPuff.z );
      mv.xy += aPuff.xy * aCloud.w * uK * vec2( 1.5, 1.0 ) + position.xy * s * vec2( 1.7, 1.0 ); // más anchas que altas
      gl_Position = projectionMatrix * mv;
      vUv = uv;
      float d = length( mv.xyz );
      vA = ( 1.0 - smoothstep( uFade.x, uFade.y, d ) ) * smoothstep( 8.0 * uK, 30.0 * uK, d );
      vShade = aPuff.y + position.y * 0.6;
      if ( vA < 0.004 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    }`;
  const CLOUD_FS = `
    uniform vec3 uColor;
    uniform vec3 uBelly;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vA;
    varying float vShade;
    void main() {
      float d = length( vUv - 0.5 ) * 2.0;
      if ( d >= 1.0 ) discard;
      float a = 1.0 - d * d;
      gl_FragColor = vec4( mix( uBelly, uColor, smoothstep( -0.45, 0.35, vShade ) ), a * a * vA * uOpacity );
    }`;

  /* destino: una columna de luz que mira a la cámara y se ensancha con la distancia, así se ve de lejos */
  const PILLAR_VS = `
    uniform vec3 uBase;
    uniform float uH;
    varying vec2 vUv;
    void main() {
      vec3 to = cameraPosition - uBase;
      to.y = 0.0;
      float d = max( length( to ), 0.001 );
      vec3 side = vec3( -to.z, 0.0, to.x ) / d;
      float w = max( 1.6, d * 0.016 );
      vec3 p = uBase + side * position.x * w + vec3( 0.0, position.y * uH, 0.0 );
      vUv = vec2( position.x + 0.5, position.y );
      gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
    }`;
  const PILLAR_FS = `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      float x = ( vUv.x - 0.5 ) * 2.0;
      float core = exp( -x * x * 40.0 );
      float glow = exp( -x * x * 6.0 ) * 0.5;
      float fall = pow( 1.0 - vUv.y, 1.4 );
      float bands = 0.8 + 0.2 * sin( vUv.y * 160.0 - uTime * 5.0 );
      vec3 col = mix( uColor, vec3( 1.0 ), core * 0.6 );
      gl_FragColor = vec4( col, ( core + glow ) * fall * bands * uOpacity );
    }`;

  class World {
    constructor(g) {
      this.g = g;
      this.valley = new THREE.Vector3(12, 25, 145);
      this.groundY = this.groundTo = -12;
      this.k = 1;
      this.u = { ground: { value: this.groundY }, valley: { value: this.valley }, k: { value: 1 } };
      this.sunDir = new THREE.Vector3(-0.42, 0.3, -0.86).normalize();
      this.found = new Set(); // ramas descubiertas, por nombre
      this.key = null;
      this.waypoint = null;
      this.queue = [];
      this.marks = new Map(); // ramas en la brújula ahora: nombre → { el }
      this.pool = []; // botones de la brújula libres, para reusar
      this.makeSky();
      this.makeTerrain();
      this.makeClouds();
      this.makePillar();
      this.buildUI();
    }

    /** Altura del suelo en (x, z): la misma del sombreador del terreno. En el espacio no hay suelo. */
    heightAt(x, z) {
      if (this.space) return -Infinity;
      const V = this.valley;
      const k = this.k;
      const w = Math.abs(x);
      const qx = x / k;
      const qz = z / k;
      const hills = noise(qx * 0.011, qz * 0.011) * 0.55 + noise(qx * 0.027 + 17, qz * 0.027 + 17) * 0.3 + noise(qx * 0.063 + 41, qz * 0.063 + 41) * 0.15;
      const ridge = 1 - Math.abs(2 * noise(qx * 0.018 + 5, qz * 0.018 + 5) - 1);
      const side = smooth(V.y, V.z, w);
      const plain = smooth(V.x, V.y, w);
      const dunes = plain * (noise(qx * 0.08 + 3, qz * 0.08 + 3) * 1.8 + noise(qx * 0.026 + 9, qz * 0.026 + 9) * plain * 7);
      return this.groundY + k * (dunes + side * side * (hills * hills * 95 + ridge * ridge * ridge * 40));
    }

    /** Hasta dónde llega el mundo desde la cámara: graph3d alarga el plano lejano para verlo entero. */
    reach(radius) {
      return 470 * scaleFor(radius);
    }

    /* ---------- escena ---------- */

    makeSky() {
      this.sky = new THREE.Mesh(
        new THREE.SphereGeometry(500, 32, 16),
        new THREE.ShaderMaterial({
          uniforms: {
            uZenith: { value: new THREE.Color() },
            uHorizon: { value: new THREE.Color() },
            uGlow: { value: new THREE.Color() },
            uNeb1: { value: new THREE.Color() },
            uNeb2: { value: new THREE.Color() },
            uNebA: { value: 0 },
            uSun: { value: this.sunDir },
            uSunCol: { value: new THREE.Color() },
            uSunGlow: { value: 0 },
            uDisk: { value: 0.9997 },
          },
          vertexShader: SKY_VS,
          fragmentShader: SKY_FS,
          side: THREE.BackSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.sky.renderOrder = -10;
      this.sky.frustumCulled = false;
      this.g.scene.add(this.sky);
    }

    makeTerrain() {
      const geo = new THREE.PlaneGeometry(SEGS * CELL, SEGS * CELL, SEGS, SEGS).rotateX(-Math.PI / 2);
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      this.terrainU = {
        uGround: this.u.ground,
        uValley: this.u.valley,
        uK: this.u.k,
        uLow: { value: new THREE.Color() },
        uHigh: { value: new THREE.Color() },
        uLine: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uSun: { value: this.sunDir },
        uFogW: { value: new THREE.Vector2(30, 450) },
        uLineA: { value: 0.3 },
        uShade: { value: 0.6 },
      };
      this.terrain = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({ uniforms: this.terrainU, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, extensions: { derivatives: true } }),
      );
      this.terrain.frustumCulled = false; // la altura sale del sombreador
      this.terrain.renderOrder = -5;
      this.g.scene.add(this.terrain);
    }

    makeClouds() {
      const base = new THREE.PlaneGeometry(1, 1);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      geo.setAttribute('position', base.attributes.position);
      geo.setAttribute('uv', base.attributes.uv);
      const n = CLOUDS * PUFFS;
      const cloud = new Float32Array(n * 4);
      const puff = new Float32Array(n * 3);
      for (let i = 0; i < CLOUDS; i++) {
        const x = Math.random() * CLOUD_TILE;
        const z = Math.random() * CLOUD_TILE;
        const y = Math.random() * 22;
        const size = 13 + Math.random() * 16;
        for (let j = 0; j < PUFFS; j++) {
          const k = i * PUFFS + j;
          cloud.set([x, y, z, size], k * 4);
          // copos en fila, el del medio más alto: la silueta de un cúmulo
          puff.set([(j - (PUFFS - 1) / 2) * 0.62 + (Math.random() - 0.5) * 0.25, (j === 1 || j === 2 ? 0.16 : -0.05) + Math.random() * 0.12, Math.random()], k * 3);
        }
      }
      geo.setAttribute('aCloud', new THREE.InstancedBufferAttribute(cloud, 4));
      geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puff, 3));
      geo.instanceCount = n;
      this.clouds = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.g.u.time,
            uTile: { value: CLOUD_TILE },
            uBase: { value: 30 },
            uK: this.u.k,
            uFade: { value: new THREE.Vector2(170, 340) },
            uColor: { value: new THREE.Color() },
            uBelly: { value: new THREE.Color() },
            uOpacity: { value: 1 },
          },
          vertexShader: CLOUD_VS,
          fragmentShader: CLOUD_FS,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.clouds.frustumCulled = false;
      this.g.scene.add(this.clouds);
    }

    makePillar() {
      const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      this.pillar = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms: {
            uBase: { value: new THREE.Vector3() },
            uH: { value: 160 },
            uColor: { value: new THREE.Color() },
            uTime: this.g.u.time,
            uOpacity: { value: 1 },
          },
          vertexShader: PILLAR_VS,
          fragmentShader: PILLAR_FS,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.pillar.frustumCulled = false;
      this.pillar.visible = false;
      this.g.scene.add(this.pillar);
    }

    readTheme() {
      const g = this.g;
      const dark = g.dark;
      const bg = g.bg;
      const cs = getComputedStyle(g.wrap);
      const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
      const ink3 = new THREE.Color(v('--ink-3', '#78837f'));
      const C = (hex) => new THREE.Color(hex);

      const s = this.sky.material.uniforms;
      s.uHorizon.value.copy(bg);
      s.uZenith.value.copy(bg).lerp(C(dark ? 0x03080b : 0xc9dbe4), dark ? 0.6 : 0.55);
      s.uGlow.value.copy(dark ? C(0x1a2a2a) : C(0xffffff)).multiplyScalar(dark ? 0.35 : 0);
      s.uNeb1.value.copy(g.col('c1'));
      s.uNeb2.value.copy(g.col('c7'));
      s.uNebA.value = dark ? 0.1 : 0.06;
      s.uSunCol.value.copy(C(dark ? 0xdde6f2 : 0xffe9bf));
      s.uSunGlow.value = dark ? 0.16 : 0.5;
      s.uDisk.value = Math.cos(dark ? 0.016 : 0.024);
      if (this.space) {
        // el espacio: casi negro, sin sol, con dos nebulosas de color de rama
        s.uHorizon.value.copy(g.spaceCol);
        s.uZenith.value.copy(g.spaceCol).lerp(C(0x000000), 0.35);
        s.uGlow.value.setRGB(0, 0, 0);
        s.uNebA.value = 0.24;
        s.uSunGlow.value = 0;
        s.uDisk.value = 2;
      }

      const t = this.terrainU;
      t.uHaze.value.copy(bg);
      t.uLow.value.copy(bg).lerp(dark ? C(0x000000) : ink3, dark ? 0.3 : 0.07);
      t.uHigh.value.copy(bg).lerp(ink3, dark ? 0.24 : 0.2);
      t.uLine.value.copy(ink3).lerp(bg, dark ? 0.1 : 0.15);
      t.uLineA.value = dark ? 0.42 : 0.38;
      t.uShade.value = dark ? 1.1 : 0.55;

      const c = this.clouds.material.uniforms;
      c.uColor.value.copy(dark ? bg.clone().lerp(ink3, 0.3) : C(0xffffff));
      c.uBelly.value.copy(dark ? bg.clone().lerp(ink3, 0.08) : bg.clone().lerp(ink3, 0.14));
      c.uOpacity.value = dark ? 0.55 : 0.85;

      this.pillar.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.pillar.material.needsUpdate = true;
      this.mapCol = { ink: v('--ink', '#101614'), ink3: v('--ink-3', '#78837f'), line: v('--line-strong', '#c9d1cd'), surface: v('--surface', '#fbfcfb'), dark };
      this.paintPillar();
      this.mapDirty = true;
    }

    /** El grafo cambió: el valle se ensancha con él y el destino sigue a su rama (o se borra con ella). */
    onLayout() {
      const r = this.g.radius;
      const k = (this.k = this.u.k.value = scaleFor(r));
      this.groundTo = -(r + 5);
      this.valley.set(r + 5, r + 110 * k, r + 330 * k);
      if (!this.placed) {
        this.groundY = this.groundTo; // la primera vez, de golpe
        this.placed = true;
      }
      this.terrain.scale.set(k, 1, k);
      this.terrainU.uFogW.value.set(30 * k, 450 * k);
      const cu = this.clouds.material.uniforms;
      cu.uBase.value = r + 16 * k;
      cu.uTile.value = CLOUD_TILE * k;
      cu.uFade.value.set(170 * k, 340 * k);
      this.pillar.material.uniforms.uH.value = 160 * k;
      if (this.complete && this.explored().n < this.g.heads.size) this.complete = false; // apareció una rama nueva
      if (this.waypoint && !this.g.heads.has(this.waypoint)) this.setWaypoint(null);
      this.paintPillar();
      this.syncMarks();
      this.mapDirty = true;
    }

    /** Modo galaxias: sin valle, sin nubes y sin el presente ni el pasado en la brújula. */
    setSpace(on) {
      this.space = on;
      this.terrain.visible = this.clouds.visible = this.sky.visible = !on; // el cielo del espacio lo pone galaxy.js
      this.el.now.hidden = this.el.past.hidden = on;
      this.readTheme();
      this.syncMarks();
      this.mapDirty = true;
    }

    /** Dónde está una rama: su cabeza o, en el espacio, el núcleo de su galaxia. */
    headAt(h) {
      return this.space ? h.curV : this.g.nodes.get(h.data.sha)?.curV || h.curV;
    }

    /** Cuadro a cuadro: el suelo baja o sube con suavidad si el grafo cambió de tamaño. */
    step(now, dt) {
      let changed = false;
      const d = this.groundTo - this.groundY;
      if (Math.abs(d) > 1e-3) {
        this.groundY += this.g.motion ? d * (1 - Math.exp(-dt * 2)) : d;
        changed = true;
      } else this.groundY = this.groundTo;
      this.u.ground.value = this.groundY;
      if (this.waypoint) {
        const at = this.g.branchPos(this.waypoint);
        if (at) {
          const base = this.pillar.material.uniforms.uBase.value;
          const y = this.space ? at.pos.y - 40 : this.heightAt(at.pos.x, at.pos.z);
          if (base.x !== at.pos.x || base.z !== at.pos.z || base.y !== y) (base.set(at.pos.x, y, at.pos.z), (changed = true));
        }
      }
      return changed;
    }

    /** Antes de dibujar: el cielo y el terreno acompañan a la cámara. */
    beforeRender() {
      const cam = this.g.camera.position;
      this.sky.position.copy(cam);
      const cell = CELL * this.k; // de a una celda: las facetas no "nadan"
      this.terrain.position.set(Math.round(cam.x / cell) * cell, 0, Math.round(cam.z / cell) * cell);
    }

    /** La órbita no baja del suelo: el ángulo máximo depende de la distancia al objetivo. */
    limitOrbit(c, cam) {
      if (this.space) {
        c.maxPolarAngle = Math.PI; // en el espacio se puede mirar desde abajo
        return;
      }
      const dist = Math.max(1e-3, cam.position.distanceTo(c.target));
      const lift = c.target.y - (this.groundY + 2.5);
      c.maxPolarAngle = Math.PI / 2 + Math.asin(clamp(lift / dist, -1, 1));
    }

    /* ---------- destino ---------- */

    setWaypoint(name) {
      if (name && name === this.waypoint) name = null;
      this.waypoint = name;
      this.pillar.visible = !!name;
      this.paintPillar();
      this.syncMarks();
      this.mapDirty = true;
      this.g.needsRender = true;
    }

    paintPillar() {
      if (!this.waypoint) return;
      const at = this.g.branchPos(this.waypoint);
      if (!at) return;
      const u = this.pillar.material.uniforms;
      u.uColor.value.copy(this.g.col(at.color)).lerp(this.g.white, this.g.dark ? 0.15 : 0);
      u.uOpacity.value = this.g.dark ? 0.85 : 0.7;
      u.uBase.value.set(at.pos.x, this.space ? at.pos.y - 40 : this.heightAt(at.pos.x, at.pos.z), at.pos.z);
    }

    /* ---------- descubrir ramas ---------- */

    /** Cambia de repositorio: cada uno recuerda sus ramas descubiertas. */
    load(key) {
      this.key = key;
      this.found = new Set(U.store.get('explored:' + key, []));
      this.complete = false;
      this.queue = [];
      this.setWaypoint(null);
      this.mapDirty = true;
    }

    /** Se guarda como mucho una vez por segundo (al cruzar una zona densa se descubren varias seguidas). */
    save() {
      if (this.saveTimer) return;
      const key = this.key;
      this.saveTimer = setTimeout(() => {
        this.saveTimer = 0;
        if (key && key === this.key) U.store.set('explored:' + key, [...this.found].slice(-5000));
      }, 1000);
    }

    explored() {
      let n = 0;
      for (const name of this.g.heads.keys()) if (this.found.has(name)) n++;
      return { n, total: this.g.heads.size };
    }

    /** En vuelo o recorriendo una rama: lo que pasa cerca queda descubierto y el destino, alcanzado.
        Se mira en cada cuadro (unas distancias por rama, poco aun con miles): a toda velocidad no se
        pasa de largo. */
    explore(now) {
      const g = this.g;
      const cam = g.camera.position;
      for (const [name, h] of g.heads) {
        const node = this.headAt(h);
        const d = cam.distanceTo(node);
        const near = this.space ? (g.gx.galaxyOf(name)?.R || 4) + 8 : DISCOVER; // una galaxia, al entrar en ella
        if (name === this.waypoint && d < ARRIVE) {
          this.banner('world.arrived', name, h.liveColor || h.data.color);
          if (g.motion) g.ripple(node, g.col(h.liveColor || h.data.color), 1.6);
          g.opts.onExplore?.({ kind: 'arrive', name });
          this.setWaypoint(null);
        }
        if (d >= near || this.found.has(name)) continue;
        this.found.add(name);
        this.save();
        this.syncMarks();
        this.mapDirty = true;
        const ex = this.explored();
        // en el espacio lo anuncia el rótulo de llegada de la galaxia (galaxy.js), no un cartel aparte
        if (this.space && g.gx) g.gx.announceDiscovery(name, ex);
        else this.banner('world.discovered', name, h.liveColor || h.data.color, ex);
        if (now - (this.lastSound || -1e9) > SOUND_MS) {
          this.lastSound = now;
          g.opts.onExplore?.({ kind: 'discover', name });
        }
        if (ex.total >= 3 && ex.n === ex.total && !this.complete) {
          this.complete = true;
          this.banner('world.complete', null, null, ex);
          g.opts.onExplore?.({ kind: 'complete' });
        }
      }
    }

    /* ---------- interfaz: brújula, minimapa, indicadores y rótulos ---------- */

    buildUI() {
      const ui = (this.ui = document.createElement('div'));
      ui.className = 'wd-ui';
      ui.hidden = true;
      ui.innerHTML = `
        <div class="wd-compass" role="group">
          <div class="wd-ticks" aria-hidden="true"></div>
          <span class="wd-dir wd-now" aria-hidden="true"></span>
          <span class="wd-dir wd-past" aria-hidden="true"></span>
          <div class="wd-marks"></div>
          <span class="wd-caret" aria-hidden="true"></span>
        </div>
        <p class="wd-target" aria-hidden="true"></p>
        <div class="wd-map">
          <canvas class="wd-radar" role="img"></canvas>
          <p class="wd-gauges" aria-hidden="true"></p>
        </div>`;
      const found = document.createElement('div');
      found.className = 'wd-found';
      found.setAttribute('role', 'status');
      found.innerHTML = '<p class="wd-found-k"></p><p class="wd-found-name"></p><p class="wd-found-n"></p>';
      this.g.wrap.append(ui, found);
      const q = (s) => ui.querySelector(s);
      this.el = {
        compass: q('.wd-compass'),
        ticks: q('.wd-ticks'),
        now: q('.wd-now'),
        past: q('.wd-past'),
        marks: q('.wd-marks'),
        target: q('.wd-target'),
        radar: q('.wd-radar'),
        gauges: q('.wd-gauges'),
        found,
        foundK: found.querySelector('.wd-found-k'),
        foundName: found.querySelector('.wd-found-name'),
        foundN: found.querySelector('.wd-found-n'),
      };
      this.ctx2d = this.el.radar.getContext('2d');
      // un clic en una rama de la brújula la marca como destino (o la desmarca)
      this.el.marks.addEventListener('click', (ev) => {
        const b = ev.target.closest('.wd-mark');
        if (b) this.setWaypoint(b.dataset.name);
      });
      this.relocalize();
    }

    relocalize() {
      this.el.now.textContent = tr('world.present');
      this.el.past.textContent = tr('world.past');
      this.el.compass.setAttribute('aria-label', tr('world.compass'));
      this.el.radar.setAttribute('aria-label', tr('world.map'));
      for (const [name, m] of this.marks) m.el.title = `${name} · ${tr(name === this.waypoint ? 'world.unmark' : 'world.mark')}`;
    }

    resize() {
      // en paneles bajos (el celular), minimapa más chico: el grafo sigue a la vista
      this.ui.classList.toggle('small', this.g.H < 460);
      this.ui.classList.toggle('tiny', this.g.H < 340);
      this.cw = this.el.compass.offsetWidth;
      const px = this.el.radar.offsetWidth;
      if (!px) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.el.radar.width = this.el.radar.height = Math.round(px * dpr);
      this.mapPx = px;
      this.mapDpr = dpr;
      this.mapDirty = true;
    }

    /** Algo cambió en las ramas (llegaron, se fueron, se descubrió una, cambió el destino): la brújula
        vuelve a elegir y a pintar sus marcas en el próximo cuadro. */
    syncMarks() {
      this.marksDirty = true;
      this.pickAt = 0;
    }

    /** Aspecto de la marca de una rama: su color, hueca si falta descubrirla, el destino resaltado. */
    paintMark(m, name, h) {
      const cls = `wd-mark ${h.liveColor || h.data.color}${this.found.has(name) ? '' : ' unk'}${name === this.waypoint ? ' dest' : ''}${h.data.isDefault ? ' home' : ''}`;
      if (m.base !== cls) {
        m.base = cls;
        m.el.className = cls + (m.tilt || '');
      }
      const title = `${name} · ${tr(name === this.waypoint ? 'world.unmark' : 'world.mark')}`;
      if (m.el.title !== title) m.el.title = title;
    }

    /** Elige qué ramas van en la brújula: las más cercanas de las que quedan dentro de ella (con miles de
        ramas serían miles de botones) y siempre el destino. Los botones se reusan. */
    pickMarks(cam, yaw, half) {
      const g = this.g;
      const near = [];
      for (const [name, h] of g.heads) {
        if (name === this.waypoint) continue;
        const p = this.headAt(h);
        const dx = p.x - cam.x;
        const dz = p.z - cam.z;
        if (Math.abs(wrapAngle(Math.atan2(-dx, -dz) - yaw)) > half) continue;
        near.push({ name, d: dx * dx + (p.y - cam.y) ** 2 + dz * dz });
      }
      if (near.length > MAX_MARKS) near.sort((a, b) => a.d - b.d).length = MAX_MARKS;
      const want = new Set(near.map((n) => n.name));
      if (this.waypoint && g.heads.has(this.waypoint)) want.add(this.waypoint);
      for (const [name, m] of this.marks) {
        if (want.has(name)) continue;
        m.el.style.display = 'none';
        this.pool.push(m);
        this.marks.delete(name);
      }
      for (const name of want) {
        let m = this.marks.get(name);
        if (!m) {
          m = this.pool.pop();
          if (!m) {
            const el = document.createElement('button');
            el.type = 'button';
            el.innerHTML = '<i></i>';
            this.el.marks.appendChild(el);
            m = { el };
          }
          m.el.dataset.name = name;
          m.base = m.tilt = '';
          this.marks.set(name, m);
        }
        this.paintMark(m, name, g.heads.get(name));
      }
    }

    /** Muestra u oculta la interfaz del vuelo. */
    showHud(on) {
      this.hudOn = on;
      this.ui.hidden = !on;
      if (on) {
        this.resize();
        this.syncMarks();
      }
    }

    /** Distancia en metros o kilómetros, según el idioma (en el espacio, a escala de planetas: kilómetros). */
    fmtDist(units) {
      if (this.space) {
        const km = units * SPACE_KM;
        return i18n.fmtUnit(km < 100 ? Math.round(km) : Math.round(km / 10) * 10, 'kilometer');
      }
      const m = units * METERS;
      return m < 1000 ? i18n.fmtUnit(Math.round(m / 5) * 5, 'meter') : i18n.fmtUnit(Math.round(m / 100) / 10, 'kilometer');
    }

    /** Cuadro a cuadro durante el vuelo: brújula, minimapa e indicadores. */
    hud(now) {
      const g = this.g;
      const f = g.flight;
      if (!f) return;
      const cam = g.camera.position;
      const yaw = f.yaw;
      const moved = !this.lastCam || this.lastCam.distanceToSquared(cam) > 1e-6 || this.lastYaw !== yaw;
      if (moved || this.marksDirty) {
        this.lastCam = (this.lastCam || new THREE.Vector3()).copy(cam);
        this.lastYaw = yaw;
        this.marksDirty = false;
        this.drawCompass(cam, yaw, now);
        this.mapDirty = true;
      }
      // con miles de aristas el minimapa se redibuja menos seguido
      if (this.mapDirty && now - (this.lastMap || 0) > 50 + g.edges.size / 40) {
        this.lastMap = now;
        this.mapDirty = false;
        this.drawMap(cam, yaw);
      }
      if (now - (this.lastGauge || 0) > 120) {
        this.lastGauge = now;
        const alt = Math.max(0, (cam.y - this.heightAt(cam.x, cam.z)) * METERS);
        const v = f.vel.length();
        // en el espacio, kilómetros por segundo a escala de planetas; en el valle, km/h
        const speed = this.space ? i18n.fmtUnit(Math.round(v * SPACE_KM * 10) / 10, 'kilometer-per-second') : i18n.fmtUnit(Math.round(v * METERS * 3.6), 'kilometer-per-hour');
        const text = this.space ? speed : `↑ ${i18n.fmtUnit(Math.round(alt), 'meter')} · ${speed}`; // en el espacio no hay altura
        if (this.el.gauges.textContent !== text) this.el.gauges.textContent = text;
      }
    }

    drawCompass(cam, yaw, now) {
      const W = this.cw || (this.cw = this.el.compass.offsetWidth);
      if (!W) return;
      const ppr = W / FOV; // píxeles por radián
      if (now - (this.pickAt || 0) > PICK_MS) {
        this.pickAt = now;
        this.pickMarks(cam, yaw, (W / 2 - 10) / ppr);
      }
      const tick = ppr * (Math.PI / 12); // una marca cada 15°, una mayor cada 45°
      const x0 = W / 2 + yaw * ppr; // dónde cae el rumbo 0 (hacia el pasado)
      const t = this.el.ticks.style;
      t.setProperty('--tick', tick.toFixed(2) + 'px');
      t.backgroundPositionX = `${(x0 % tick).toFixed(1)}px, ${(x0 % (tick * 3)).toFixed(1)}px`;
      const at = (bearing) => W / 2 - wrapAngle(bearing - yaw) * ppr;
      const place = (el, bearing) => {
        const x = at(bearing);
        const vis = x > 44 && x < W - 44; // el rótulo entero, no cortado en el borde
        el.style.opacity = vis ? '' : '0';
        el.style.transform = `translateX(${x.toFixed(1)}px)`;
      };
      if (!this.space) {
        place(this.el.past, 0);
        place(this.el.now, Math.PI);
      }

      // ramas: su rumbo, y la más centrada (o el destino) muestra nombre y distancia
      let focus = null;
      let focusDx = 26;
      let dest = null;
      for (const [name, m] of this.marks) {
        const h = this.g.heads.get(name);
        if (!h) continue;
        const p = this.headAt(h);
        const dx = p.x - cam.x;
        const dz = p.z - cam.z;
        let x = at(Math.atan2(-dx, -dz));
        const d = Math.hypot(dx, p.y - cam.y, dz);
        const isDest = name === this.waypoint;
        let vis = x > 10 && x < W - 10;
        if (isDest) {
          dest = { name, d, h };
          if (!vis) (x = clamp(x, 10, W - 10)), (vis = true); // el destino queda en el borde, del lado hacia donde girar
        }
        const dy = p.y - cam.y;
        const tilt = Math.abs(dy) > 6 && Math.abs(dy) > d * 0.35 ? (dy > 0 ? ' up' : ' down') : '';
        if (m.tilt !== tilt) {
          m.tilt = tilt;
          m.el.className = m.base + tilt;
        }
        m.el.style.display = vis ? '' : 'none';
        if (!vis) continue;
        m.el.style.transform = `translateX(${x.toFixed(1)}px)`;
        m.el.style.zIndex = isDest ? 50 : String(40 - Math.min(39, Math.round(d / 10)));
        const off = Math.abs(x - W / 2);
        if (off < focusDx) (focusDx = off), (focus = { name, d, h });
      }
      const show = focus || dest;
      const text = show ? `${show === dest ? '◆ ' : ''}${show.name} · ${this.fmtDist(show.d)}` : '';
      const el = this.el.target;
      if (el.textContent !== text) el.textContent = text;
      const color = show ? show.h.liveColor || show.h.data.color : '';
      const cls = `wd-target ${color}${show ? ' on' : ''}`;
      if (el.className !== cls) el.className = cls;
    }

    /** Minimapa: vista desde arriba que gira con la mirada (adelante es arriba). */
    drawMap(cam, yaw) {
      const ctx = this.ctx2d;
      const S = this.mapPx;
      if (!S) return;
      const g = this.g;
      const C = this.mapCol;
      const R = S / 2;
      ctx.setTransform(this.mapDpr, 0, 0, this.mapDpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.translate(R, R);
      ctx.beginPath();
      ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
      ctx.clip();
      const range = this.space ? clamp(g.radius * 0.9, 50, 2500) : clamp(g.radius * 5, 60, 2500);
      const k = (R - 4) / range;
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const mx = (x, z) => ((x - cam.x) * cs - (z - cam.z) * sn) * k;
      const my = (x, z) => ((x - cam.x) * sn + (z - cam.z) * cs) * k;
      const line = (x1, z1, x2, z2) => {
        ctx.moveTo(mx(x1, z1), my(x1, z1));
        ctx.lineTo(mx(x2, z2), my(x2, z2));
      };
      const far = range * 6;

      // el fondo del valle, por donde corre el tiempo
      ctx.strokeStyle = C.ink3;
      if (!this.space) {
        ctx.globalAlpha = C.dark ? 0.1 : 0.07;
        ctx.lineWidth = 2 * this.valley.y * k;
        ctx.beginPath();
        line(0, cam.z - far, 0, cam.z + far);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, (R - 4) / 2, 0, Math.PI * 2);
      ctx.stroke();

      // las ramas, como caminos: un trazo por color, así miles de aristas no pesan
      ctx.lineCap = 'round';
      const near = range * 1.5;
      const byColor = new Map();
      for (const it of g.edges.values()) {
        const e = it.data;
        if (e.kind === 'stub') continue;
        const a = g.nodes.get(e.from)?.curV;
        const b = g.nodes.get(e.to)?.curV;
        if (!a || !b) continue;
        if (Math.min(Math.abs(a.z - cam.z), Math.abs(b.z - cam.z)) > near && Math.sign(a.z - cam.z) === Math.sign(b.z - cam.z)) continue;
        let list = byColor.get(e.color);
        if (!list) byColor.set(e.color, (list = []));
        list.push(a, b);
      }
      for (const [color, list] of byColor) {
        const ghost = color === 'ghost';
        ctx.globalAlpha = ghost ? 0.55 : 0.9;
        ctx.strokeStyle = g.colorHex(color);
        ctx.lineWidth = ghost ? 1 : 1.8;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 2) line(list[i].x, list[i].z, list[i + 1].x, list[i + 1].z);
        ctx.stroke();
      }

      // el anillo del presente
      if (g.portalZ != null && g.portal.visible) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = C.ink3;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        line(-g.portalR, g.portalZ, g.portalR, g.portalZ);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // cabezas de rama: llenas si ya se descubrieron, huecas si no
      for (const [name, h] of g.heads) {
        const p = this.headAt(h);
        let x = mx(p.x, p.z);
        let y = my(p.x, p.z);
        const dest = name === this.waypoint;
        const out = Math.hypot(x, y) > R - 7;
        if (out && !dest) continue;
        if (out) {
          const l = Math.hypot(x, y);
          x = (x / l) * (R - 7);
          y = (y / l) * (R - 7);
        }
        const col = g.colorHex(h.liveColor || h.data.color);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, h.data.isDefault ? 4 : 3.2, 0, Math.PI * 2);
        if (this.found.has(name)) {
          ctx.fillStyle = col;
          ctx.fill();
        } else {
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = col;
          ctx.stroke();
        }
        if (dest) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = C.ink;
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // tú: una flecha en el centro, siempre hacia arriba
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink;
      ctx.strokeStyle = C.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(R, R - 7);
      ctx.lineTo(R + 5, R + 5);
      ctx.lineTo(R, R + 2.5);
      ctx.lineTo(R - 5, R + 5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }

    /** Rótulo grande, como al llegar a una región nueva: uno a la vez, en cola. */
    banner(kicker, name, color, ex) {
      if (this.queue.length > 3) this.queue.shift(); // en una ráfaga, los primeros ceden su turno
      this.queue.push({ kicker, name, color, ex });
      if (!this.showing) this.nextBanner();
    }

    nextBanner() {
      const b = this.queue.shift();
      const el = this.el;
      clearTimeout(this.bannerTimer);
      const was = this.showing;
      el.found.classList.remove('show');
      this.showing = !!b;
      if (!b) return;
      const fill = () => {
        el.foundK.textContent = tr(b.kicker);
        el.foundName.textContent = b.name || '';
        el.foundName.hidden = !b.name;
        el.foundName.className = `wd-found-name ${b.color || ''}`;
        el.foundN.textContent = b.ex ? tr('world.explored', { n: b.ex.n, total: i18n.fmtNum(b.ex.total) }) : '';
        el.found.classList.add('show');
        this.bannerTimer = setTimeout(() => this.nextBanner(), BANNER_MS);
      };
      // entre un rótulo y el siguiente, el primero alcanza a irse
      if (was) this.bannerTimer = setTimeout(fill, 350);
      else fill();
    }

    clear() {
      this.setWaypoint(null);
      this.queue = [];
      this.nextBanner();
      for (const m of [...this.marks.values(), ...this.pool]) m.el.remove();
      this.marks.clear();
      this.pool = [];
      this.complete = false;
      this.placed = false;
      this.groundY = this.groundTo = -12;
      this.mapDirty = true;
    }
  }

  GB.World = World;
})(window.GB);
