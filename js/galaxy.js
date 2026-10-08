/* GraphBranch — modo galaxias de la vista 3D: el repositorio como un universo.

   Cada rama es una galaxia. Sus commits son las estrellas de un brazo en espiral, con la cabeza
   en el núcleo: cada commit nuevo empuja a los demás brazo afuera, así que la galaxia gira un
   paso con cada push. La rama por defecto está en el centro del universo y las demás alrededor,
   en una espiral girasol algo desordenada en altura, las primeras en aparecer (las más activas)
   más cerca; cada una conserva su lugar mientras exista. Los commits de ramas ya fusionadas y
   borradas forman corrientes de estrellas que orbitan la galaxia donde se fusionaron, y las
   bifurcaciones y los merges son puentes entre galaxias.

   De lejos, cada galaxia es un disco con dos brazos (un solo cuadro por galaxia, dibujado en el
   sombreador, todas en una llamada). Al acercarse se resuelve en estrellas sueltas y aparecen sus
   planetas: los archivos. En la rama por defecto son los del repo; en las demás, los que la rama
   cambió respecto de la rama por defecto. Se piden recién al acercarse (una consulta por rama,
   que se recuerda mientras la rama no se mueva) y giran en órbitas: una por archivo si son pocos
   y, si no, un cinturón por carpeta, más lento cuanto más lejos, como en un sistema solar. Lo
   usa graph3d.js.

   El espacio se inspira en No Man's Sky: cada planeta tiene su superficie (continentes y océanos,
   bandas de gigante gaseoso o roca con cráteres, según el archivo), atmósfera que brilla en el
   borde, gira sobre sí mismo y algunos llevan anillos; el cielo es de nebulosas de colores que se
   tiñen con la galaxia en la que se está; al acelerar en vuelo las estrellas pasan como estelas y
   la tecla X lanza una onda de escáner que revela los nombres de los planetas que alcanza.

   Entrar en una galaxia es una llegada, como al salir del salto a otro sistema: líneas de velocidad
   y un destello de su color, el cielo que cambia de golpe a ese color, un rótulo grande con su nombre
   que se decodifica letra a letra y sus datos (commits, planetas, asteroides, líneas cambiadas,
   última actividad), una onda de escáner que va revelando los planetas y, con sonido, un acorde.

   Y una vez dentro se ve el sistema entero: los mundos principales (los planetas más grandes) llevan
   un marcador en pantalla con su nombre, qué clase de mundo son y a qué distancia están, visible desde
   cualquier punto del sistema; el rótulo de la galaxia se despliega en un panel con la lista de esos
   mundos (pasar el puntero por uno lo resalta; un clic lleva hasta él); y al entrar con doble clic o
   desde la lista de ramas la cámara se acomoda en un mirador desde donde caben todas las órbitas.

   Y lo de la nave: el hiperimpulsor (J en vuelo, o "Saltar" en el detalle de una rama) carga unos
   instantes y lanza la nave por un túnel de luz hasta la galaxia apuntada o la marcada como destino,
   de donde sale con la llegada de siempre; en vuelo, la mira fija lo que apunta (un planeta o una
   galaxia) con un recuadro que dice qué es y a qué distancia está; cerca de un planeta y a toda
   velocidad el borde de la pantalla se enciende como al entrar en una atmósfera; y, con el sonido
   activado, el espacio tiene su zumbido de fondo, en la nota de la galaxia en la que se está. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const tr = i18n.t;
  const ARM_A = 0.55; // el brazo es una espiral de Arquímedes r = A·θ: vueltas separadas 2πA
  const STEP = 1.35; // distancia entre commits a lo largo del brazo
  const GOLDEN = 2.399963229728653;
  const SLOT_MIN = 11; // escala de la espiral de galaxias: vecinas a ~1,8 veces esto…
  const SLOT_MAX = 30; // …según el tamaño de las galaxias grandes (no de la más grande: una sola no estira el universo)
  const SAT_GAP = 1.7; // entre anillos de corrientes fusionadas
  const NEAR_GALAXIES = 5; // galaxias que se resuelven en estrellas a la vez
  const NEAR_STARS = 650;
  const NEAR_RANGE = 75; // desde esta distancia empiezan a verse sus estrellas
  const MAX_PLANETS = 360; // archivos a la vista, entre planetas y asteroides
  const MAX_BIG = 120; // planetas, como mucho: el resto, asteroides
  const ROCK_SHARE = 0.4; // con muchos archivos, los más chicos (este tanto) son asteroides
  const SOLO_ALL = 8; // con hasta tantos archivos, todos son planetas
  const SOLO_ORBITS = 8; // con hasta tantos planetas, cada uno tiene su órbita
  const PLANET_GAP = 2.4; // aire entre planetas de una misma órbita, para pasar volando
  const MAX_FILE_LABELS = 16;
  const MAX_DIR_LABELS = 10;
  const PLANET_TILT = 0.38; // el plano de las órbitas cruza el disco de la galaxia, apenas inclinado
  const SURVEY_MS = 220; // cada cuánto se mira qué galaxias hay cerca
  const SCAN_MS = 7000; // lo que dura el escáner (X)
  const SCAN_SPEED = 55; // la onda del escáner, en unidades por segundo
  const SCAN_RANGE = 90;
  const ARRIVE_MS = 5200; // lo que dura el rótulo de llegada
  const ARRIVE_AGAIN = 40000; // la misma galaxia no vuelve a anunciarse antes de esto
  const MAX_WORLDS = 8; // mundos principales: los planetas más grandes, con marcador y en el panel del sistema
  const SYS_OPEN_MS = 11000; // el panel del sistema se abre solo al llegar y se pliega pasado esto
  const VIEW_ELEV = 0.5; // el mirador del sistema: tanto por encima del plano de las órbitas (radianes)
  const GLYPHS = '▓▒░/\\|_-+<>=*#%01'; // lo que muestra el nombre antes de decodificarse
  const CHARGE_MS = 1100; // el hiperimpulsor carga esto antes de saltar
  const JUMP_MIN_MS = 1500; // el túnel dura entre esto…
  const JUMP_MAX_MS = 3200; // …y esto, según la distancia
  const AIM_RANGE = 2600; // hasta dónde fija la mira una galaxia
  const LOCK_MS = 280; // lo que tarda la mira en cerrarse sobre un objetivo nuevo
  const HEAT_SPEED = 1.1; // por encima de tantas veces el paso tranquilo junto a un planeta, su atmósfera arde
  const WORLD_FONT = '600 12px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'; // para medir los marcadores
  const WORLD_SUB_FONT = '500 10px "Instrument Sans", system-ui, sans-serif';
  const RETRY_MS = 60000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  const wrapAngle = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const h01 = (s) => hashStr(s) / 4294967296;
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Radio del brazo en el commit k (0 = la cabeza, en el núcleo). */
  const armPhi = (k) => Math.sqrt((2 * STEP * k) / ARM_A);
  const radiusFor = (n) => Math.max(3.5, ARM_A * armPhi(Math.max(0, n - 1)) + 2.6);

  /* colores de los planetas según el tipo de archivo (los de GitHub, más o menos) */
  const EXT = {
    js: '#f1e05a', mjs: '#f1e05a', cjs: '#f1e05a', jsx: '#f1e05a',
    ts: '#3178c6', tsx: '#3178c6', mts: '#3178c6',
    css: '#663399', scss: '#c6538c', sass: '#c6538c', less: '#1d365d',
    html: '#e34c26', htm: '#e34c26', vue: '#41b883', svelte: '#ff3e00',
    json: '#cbcb41', yml: '#cb171e', yaml: '#cb171e', toml: '#9c4221', xml: '#0060ac',
    md: '#3a7bd5', mdx: '#fcb32c', txt: '#9aa4a0', rst: '#141414',
    py: '#3572a5', rb: '#cc342d', go: '#00add8', rs: '#dea584', java: '#b07219', kt: '#a97bff',
    swift: '#f05138', c: '#8f9ca8', h: '#8f9ca8', cpp: '#f34b7d', hpp: '#f34b7d', cc: '#f34b7d',
    cs: '#178600', php: '#4f5d95', sh: '#89e051', bash: '#89e051', zsh: '#89e051', ps1: '#012456',
    sql: '#e38c00', lua: '#000080', dart: '#00b4ab', ex: '#6e4a7e', exs: '#6e4a7e', scala: '#c22d40',
    svg: '#ff9a00', png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4', gif: '#a074c4', webp: '#a074c4', ico: '#a074c4',
    lock: '#6b7570', dockerfile: '#384d54', makefile: '#427819', gitignore: '#f05032', env: '#ecd53f',
  };
  function extOf(path) {
    const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    if (base === 'dockerfile' || base === 'makefile') return base;
    if (base === '.gitignore') return 'gitignore';
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1) : dot === 0 ? base.slice(1) : '';
  }
  function extColor(ext) {
    if (EXT[ext]) return EXT[ext];
    const h = h01(ext || '?') * 360; // tipos raros: un tono estable por extensión
    return `hsl(${h.toFixed(0)}, 45%, 62%)`;
  }
  /** Qué clase de mundo es un planeta, por su semilla (la misma cuenta que hace el sombreador de su superficie). */
  function kindOf(p) {
    if (p.rock) return 'asteroid';
    const k = (p.seed * 7.31) % 1;
    return k < 0.36 ? 'gas' : k < 0.78 ? 'ocean' : 'rock';
  }
  const KIND_KEY = { gas: 'galaxy.kind.gas', ocean: 'galaxy.kind.ocean', rock: 'galaxy.kind.rock', asteroid: 'galaxy.kind.asteroid' };

  /* ---------- sombreadores ---------- */

  /* disco de cada galaxia: un cuadro en el plano de la galaxia; los brazos, el núcleo y el polvo
     salen del sombreador. Uno de los dos brazos pasa justo por los commits. */
  const DISC_VS = `
    attribute vec3 iCenter;
    attribute vec3 iU;
    attribute vec3 iV;
    attribute vec4 iParam; // radio, giro del brazo, semilla, A
    attribute vec3 iColor;
    uniform float uFar;
    varying vec2 vP;
    varying vec4 vParam;
    varying vec3 vCol;
    varying float vFade;
    void main() {
      float S = iParam.x * 1.25 + 4.0;
      vec3 w = iCenter + ( iU * position.x + iV * position.y ) * S;
      vP = position.xy * S;
      vParam = iParam;
      vCol = iColor;
      vec4 mv = viewMatrix * vec4( w, 1.0 );
      gl_Position = projectionMatrix * mv;
      vec3 n = normalize( cross( iU, iV ) );
      float face = abs( dot( n, normalize( cameraPosition - iCenter ) ) );
      float d = distance( cameraPosition, iCenter );
      // de canto es una línea: se atenúa; muy de cerca deja paso a las estrellas sueltas
      vFade = ( 1.0 - smoothstep( uFar * 0.55, uFar, d ) ) * ( 0.2 + 0.8 * face ) * ( 0.45 + 0.55 * smoothstep( iParam.x * 0.6, iParam.x * 3.0 + 10.0, d ) );
    }`;
  const DISC_FS = `
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vP;
    varying vec4 vParam;
    varying vec3 vCol;
    varying float vFade;
    float gbH( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.x + p3.y ) * p3.z );
    }
    float gbN( vec2 p ) {
      vec2 i = floor( p );
      vec2 f = fract( p );
      vec2 u = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( gbH( i ), gbH( i + vec2( 1.0, 0.0 ) ), u.x ), mix( gbH( i + vec2( 0.0, 1.0 ) ), gbH( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
    }
    void main() {
      float R = vParam.x;
      float r = length( vP );
      if ( r > R * 1.25 + 4.0 || vFade < 0.003 ) discard;
      float ang = atan( vP.y, vP.x );
      float ph = ang - r / vParam.w - vParam.y;
      float arms = pow( 0.5 + 0.5 * cos( 2.0 * ph ), 3.0 );
      vec2 q = vP * 0.85 + vParam.z * 61.0 + vec2( uTime * 0.03, 0.0 );
      float n = gbN( q ) * 0.65 + gbN( q * 2.7 ) * 0.35;
      float disk = exp( -r / max( 1.6, R * 0.45 ) );
      float core = exp( -r * r / 3.0 );
      float edge = 1.0 - smoothstep( R * 0.75, R * 1.25 + 4.0, r );
      float haze = exp( -r / max( 2.0, R * 0.8 ) ) * 0.12; // un velo alrededor: de lejos la galaxia se ve
      float k = core * 0.9 + disk * edge * ( 0.14 + 1.05 * arms ) * ( 0.5 + 0.8 * n ) + haze * edge;
      vec3 col = mix( vCol, vec3( 1.0, 0.96, 0.88 ), clamp( core * 0.75 + 0.12, 0.0, 1.0 ) );
      gl_FragColor = vec4( col, clamp( k, 0.0, 1.0 ) * uOpacity * vFade );
    }`;

  /* estrellas sueltas de las galaxias cercanas: titilan y aparecen al acercarse */
  const STARS_VS = `
    attribute vec3 aColor;
    attribute vec2 aSeed; // tamaño, fase
    uniform float uTime;
    uniform float uScale;
    uniform float uRange;
    uniform vec2 uFog;
    varying vec3 vC;
    varying float vA;
    void main() {
      vec4 mv = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mv;
      float z = max( 0.1, -mv.z );
      gl_PointSize = clamp( aSeed.x * uScale / z, 1.0, 22.0 );
      float tw = 0.72 + 0.28 * sin( uTime * ( 0.8 + aSeed.y * 2.2 ) + aSeed.y * 40.0 );
      vA = ( 1.0 - smoothstep( uRange * 0.55, uRange, z ) ) * ( 1.0 - smoothstep( uFog.x, uFog.y, z ) ) * tw;
      vC = aColor;
      if ( vA < 0.004 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    }`;
  const STARS_FS = `
    uniform float uOpacity;
    varying vec3 vC;
    varying float vA;
    void main() {
      float d = length( gl_PointCoord - 0.5 ) * 2.0;
      float a = 1.0 - smoothstep( 0.0, 1.0, d );
      gl_FragColor = vec4( vC, a * a * vA * uOpacity );
    }`;

  /* ruido de valor en 3D, para planetas y nebulosas (mismo resultado en cualquier GPU: sin seno) */
  const NOISE3_GLSL = `
    float gbH3( vec3 p ) {
      p = fract( p * 0.3183099 + 0.1 );
      p *= 17.0;
      return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
    }
    float gbN3( vec3 x ) {
      vec3 i = floor( x );
      vec3 f = fract( x );
      f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( mix( gbH3( i ), gbH3( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( gbH3( i + vec3( 0.0, 1.0, 0.0 ) ), gbH3( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
                  mix( mix( gbH3( i + vec3( 0.0, 0.0, 1.0 ) ), gbH3( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( gbH3( i + vec3( 0.0, 1.0, 1.0 ) ), gbH3( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
    }
    float gbFbm( vec3 p ) {
      float s = 0.0;
      float a = 0.5;
      for ( int i = 0; i < 4; i++ ) {
        s += a * gbN3( p );
        p = p * 2.03 + 1.7;
        a *= 0.5;
      }
      return s;
    }`;

  /* planetas: cada uno con su superficie según su semilla (la de su ruta), iluminado por el núcleo
     de la galaxia, con atmósfera en el borde y girando sobre sí mismo */
  const PLANET_VS = `
    attribute float aSeed;
    uniform float uTime;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vL;
    varying vec3 vC;
    varying float vS;
    void main() {
      mat4 m = modelMatrix * instanceMatrix;
      vec4 w = m * vec4( position, 1.0 );
      vW = w.xyz;
      vN = normalize( mat3( m ) * normal );
      #ifdef ROCK
        vL = position; // los asteroides giran con su propia matriz
      #else
        float a = uTime * ( 0.12 + aSeed * 0.3 );
        vL = vec3( cos( a ) * position.x + sin( a ) * position.z, position.y, cos( a ) * position.z - sin( a ) * position.x );
      #endif
      vC = vec3( 1.0 );
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      vS = aSeed;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const PLANET_FS = `
    uniform vec3 uSun;
    uniform vec3 uFogCol;
    uniform vec2 uFog;
    uniform float uTime;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vL;
    varying vec3 vC;
    varying float vS;
    ${NOISE3_GLSL}
    void main() {
      vec3 N = normalize( vN );
      vec3 V = normalize( cameraPosition - vW );
      vec3 L = normalize( uSun - vW );
      vec3 d = normalize( vL );
      vec3 p = d * 2.3 + vS * 31.0;
      float kind = fract( vS * 7.31 );
      vec3 base = vC;
      vec3 col;
      if ( kind < 0.36 ) {
        // gigante gaseoso: bandas que se retuercen
        float b = gbFbm( vec3( p.x * 0.6, p.y * 2.6, p.z * 0.6 ) );
        float bands = sin( d.y * ( 8.0 + vS * 9.0 ) + b * 6.0 );
        col = mix( base * 0.55, mix( base, vec3( 1.0, 0.95, 0.85 ), 0.4 ), 0.5 + 0.5 * bands );
      } else if ( kind < 0.78 ) {
        // océanos, continentes, casquetes y nubes
        float h = gbFbm( p );
        float land = smoothstep( 0.46, 0.52, h );
        vec3 sea = mix( base * 0.3, vec3( 0.04, 0.1, 0.22 ), 0.4 );
        vec3 ground = mix( base, base.gbr, 0.3 ) * ( 0.7 + 0.6 * gbN3( p * 3.1 ) );
        col = mix( sea, ground, land );
        col = mix( col, vec3( 0.93, 0.96, 1.0 ), smoothstep( 0.8, 0.93, abs( d.y ) ) * 0.85 );
        float cloud = smoothstep( 0.56, 0.74, gbFbm( p * 1.7 + vec3( uTime * 0.03, 0.0, 0.0 ) ) );
        col = mix( col, vec3( 1.0 ), cloud * 0.5 );
      } else {
        // roca con cráteres
        float h = gbFbm( p * 1.8 );
        float crater = smoothstep( 0.63, 0.66, gbN3( p * 3.6 ) ) * 0.3;
        col = base * ( 0.5 + 0.65 * h ) - crater;
      }
      float ndl = dot( N, L );
      float diff = max( ndl, 0.0 );
      vec3 lit = col * ( 0.13 + 1.0 * diff ); // el lado de noche se adivina
      // atmósfera: brilla en el borde, más del lado del día
      float rim = pow( 1.0 - max( dot( N, V ), 0.0 ), 2.6 );
      vec3 atmo = mix( base, vec3( 0.7, 0.88, 1.0 ), 0.4 );
      lit += atmo * rim * ( 0.2 + 0.95 * smoothstep( -0.35, 0.6, ndl ) );
      float fog = smoothstep( uFog.x, uFog.y, distance( vW, cameraPosition ) );
      gl_FragColor = vec4( mix( lit, uFogCol, fog ), 1.0 );
    }`;

  /* asteroides: roca gris teñida apenas con el color del archivo, con cráteres y sin atmósfera */
  const ROCK_FS = `
    uniform vec3 uSun;
    uniform vec3 uFogCol;
    uniform vec2 uFog;
    varying vec3 vN;
    varying vec3 vW;
    varying vec3 vL;
    varying vec3 vC;
    varying float vS;
    ${NOISE3_GLSL}
    void main() {
      vec3 N = normalize( vN );
      vec3 L = normalize( uSun - vW );
      vec3 p = vL * 3.0 + vS * 17.0;
      vec3 rock = mix( vec3( 0.38, 0.35, 0.32 ), vC, 0.3 ) * ( 0.6 + 0.7 * gbFbm( p ) );
      rock -= smoothstep( 0.64, 0.67, gbN3( p * 2.2 ) ) * 0.12;
      vec3 lit = rock * ( 0.15 + 1.0 * max( dot( N, L ), 0.0 ) );
      float fog = smoothstep( uFog.x, uFog.y, distance( vW, cameraPosition ) );
      gl_FragColor = vec4( mix( lit, uFogCol, fog ), 1.0 );
    }`;

  /** Roca irregular: un icosaedro abollado, de caras planas. */
  function rockGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + 0.2 * Math.sin(v.x * 3.1 + 1.7) * Math.cos(v.y * 2.3 + 0.4) + 0.14 * Math.sin(v.z * 4.7 + 2.1) + 0.08 * Math.cos(v.x * 6.3 - v.y * 5.1);
      pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* anillos de algunos planetas: bandas finas, transparentes */
  const RING_VS = `
    attribute float aSeed;
    varying float vR;
    varying vec3 vC;
    varying float vS;
    varying float vD;
    void main() {
      vR = length( position.xy );
      vC = vec3( 1.0 );
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      vS = aSeed;
      vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
      vD = distance( w.xyz, cameraPosition );
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const RING_FS = `
    uniform vec2 uFog;
    varying float vR;
    varying vec3 vC;
    varying float vS;
    varying float vD;
    void main() {
      float t = ( vR - 1.45 ) / 0.95;
      float bands = 0.55 + 0.45 * sin( t * ( 17.0 + vS * 12.0 ) ) * sin( t * 6.0 + vS * 6.0 );
      float a = smoothstep( 0.0, 0.08, t ) * smoothstep( 1.0, 0.82, t ) * bands * 0.6;
      a *= 1.0 - smoothstep( uFog.x, uFog.y, vD );
      if ( a < 0.004 ) discard;
      gl_FragColor = vec4( mix( vC, vec3( 1.0, 0.96, 0.9 ), 0.45 ), a );
    }`;

  /* el cielo del espacio: nebulosas de colores, calculadas por vértice (son suaves: así cuestan poco) */
  const NEBULA_VS = `
    uniform vec3 uBase;
    uniform vec3 uA;
    uniform vec3 uB;
    uniform vec3 uTint;
    uniform float uTintK;
    uniform float uGlow;
    varying vec3 vCol;
    ${NOISE3_GLSL}
    void main() {
      vec3 d = normalize( position );
      float n1 = gbN3( d * 1.6 + 3.1 ) * 0.6 + gbN3( d * 3.3 + 9.2 ) * 0.3 + gbN3( d * 6.7 - 1.3 ) * 0.1;
      float n2 = gbN3( d * 2.4 + vec3( 7.0, 1.0, 4.0 ) ) * 0.65 + gbN3( d * 5.1 + 2.0 ) * 0.35;
      float dust = gbN3( d * 8.0 + 5.0 );
      float a1 = smoothstep( 0.45, 0.82, n1 );
      float a2 = smoothstep( 0.5, 0.86, n2 );
      vec3 c1 = mix( uA, uTint, uTintK );
      vec3 col = uBase + c1 * a1 * 0.5 * uGlow + uB * a2 * ( 1.0 - a1 * 0.4 ) * 0.32 * uGlow;
      col += c1 * pow( a1 * a2, 2.0 ) * 0.35 * uGlow;
      col *= 1.0 - smoothstep( 0.6, 0.86, dust ) * 0.45 * a1;
      vCol = col;
      vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_Position = p.xyww;
    }`;
  const NEBULA_FS = `
    varying vec3 vCol;
    void main() {
      gl_FragColor = vec4( vCol, 1.0 );
    }`;

  /* "pulse drive": a toda velocidad las estrellas cercanas pasan como estelas */
  const STREAK_VS = `
    attribute float aEnd;
    uniform vec3 uCam;
    uniform vec3 uDir;
    uniform float uLen;
    uniform float uBox;
    uniform float uAmt;
    varying float vA;
    void main() {
      vec3 rel = mod( position * uBox - uCam, uBox ) - uBox * 0.5; // quietas en el mundo, siempre alrededor de la nave
      vec3 w = uCam + rel - uDir * uLen * aEnd;
      gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
      float d = length( rel );
      vA = uAmt * ( 1.0 - aEnd ) * ( 1.0 - smoothstep( uBox * 0.2, uBox * 0.5, d ) ) * smoothstep( 1.5, 5.0, d );
    }`;
  const STREAK_FS = `
    uniform vec3 uColor;
    varying float vA;
    void main() {
      gl_FragColor = vec4( uColor, vA );
    }`;

  /* la onda del escáner: una esfera que crece desde la nave, solo su borde brilla */
  const PULSE_VS = `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4( position, 1.0 );
      vN = normalize( normalMatrix * normal );
      vV = normalize( -mv.xyz );
      gl_Position = projectionMatrix * mv;
    }`;
  const PULSE_FS = `
    uniform vec3 uColor;
    uniform float uA;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float rim = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 2.2 );
      gl_FragColor = vec4( uColor, rim * uA );
    }`;

  /** Lote instanciado con una semilla por instancia (la superficie de cada planeta). */
  class SeededLayer {
    constructor(parent, geo, mat) {
      this.parent = parent;
      this.base = geo;
      this.mat = mat;
      this.cap = 0;
      this.n = 0;
      this.mesh = null;
      this.m = new THREE.Matrix4();
      this.s = new THREE.Vector3();
    }

    begin(max) {
      if (!this.mesh || max > this.cap) this.alloc(Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, max)))));
      this.n = 0;
    }

    alloc(cap) {
      const geo = this.base.clone();
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.InstancedMesh(geo, this.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (this.mesh) {
        this.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
      }
      this.parent.add(mesh);
      this.mesh = mesh;
      this.cap = cap;
    }

    /** pos y escala; `q` (opcional) gira la instancia y `sv` (opcional) la estira en cada eje. */
    put(pos, scale, col, seed, q, sv) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      if (q) this.m.compose(pos, q, sv ? this.s.copy(sv).multiplyScalar(scale) : this.s.setScalar(scale));
      else this.m.makeScale(scale, scale, scale).setPosition(pos);
      this.m.toArray(this.mesh.instanceMatrix.array, i * 16);
      col.toArray(this.mesh.instanceColor.array, i * 3);
      this.mesh.geometry.attributes.aSeed.array[i] = seed;
    }

    end() {
      const mesh = this.mesh;
      mesh.count = this.n;
      mesh.visible = this.n > 0;
      for (const [a, k] of [[mesh.instanceMatrix, 16], [mesh.instanceColor, 3], [mesh.geometry.attributes.aSeed, 1]]) {
        a.updateRange.offset = 0;
        a.updateRange.count = Math.max(1, this.n * k);
        a.needsUpdate = true;
      }
    }
  }

  class Galaxy {
    constructor(g) {
      this.g = g;
      this.on = false;
      this.slots = new Map(); // rama → lugar en el universo (estable mientras exista)
      this.gals = new Map(); // rama → galaxia
      this.posOf = new Map(); // commit → posición
      this.galOf = new Map(); // commit → galaxia (o corriente) donde está
      this.cache = new Map(); // `${rama}@${sha}` → { state, data, err, at }
      this.lastData = new Map(); // rama → últimos archivos que llegaron (se muestran mientras llegan los nuevos)
      this.near = [];
      this.nearKey = '';
      this.focus = null;
      this.arrived = new Map(); // galaxia → cuándo se anunció su llegada
      this.arrival = null;
      this.sys = null; // sistema planetario a la vista
      this.old = null; // el que se va
      this.outerOf = new Map(); // galaxia → radio de su última órbita (de la última vez que se vio su sistema)
      this.parked = null; // la cámara fue al mirador de esta galaxia y nadie la movió: { name, at }
      this.sysOpen = false; // el panel del sistema, desplegado
      this.sysPin = null; // el usuario lo abrió o cerró a mano (manda sobre el pliegue automático)
      this.sysOpenAt = 0;
      this.sysCloseAt = 0;
      this.scanAt = 0;
      this.hyper = null; // salto en curso: { G, t0, from, to, … }
      this.aimed = null; // lo que apunta la mira en vuelo: { kind: 'planet' | 'galaxy', … }
      this.aimAt = 0;
      this.heat = 0; // entrada atmosférica: cuánto se enciende el borde de la pantalla
      this.amb = { name: null, level: -1, at: 0 }; // el zumbido del espacio: la galaxia y cuánto suena
      this.version = 0;
      this.group = new THREE.Group();
      this.group.visible = false;
      g.scene.add(this.group);
      this.v = new THREE.Vector3();
      this.w = new THREE.Vector3();
      this.makeSky();
      this.makeDiscs();
      this.makeStars();
      this.makePlanets();
      this.makeStreaks();
      this.makePulse();
      this.buildUI();
    }

    /* ---------- escena ---------- */

    makeDiscs() {
      const base = new THREE.PlaneGeometry(2, 2);
      this.discBase = base;
      this.discCap = 0;
      this.discMat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.g.u.time, uOpacity: { value: 0.9 }, uFar: { value: 1500 } },
        vertexShader: DISC_VS,
        fragmentShader: DISC_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      this.discs = new THREE.Mesh(new THREE.InstancedBufferGeometry(), this.discMat);
      this.discs.frustumCulled = false;
      this.discs.visible = false;
      this.discs.renderOrder = -2;
      this.group.add(this.discs);
    }

    allocDiscs(cap) {
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = this.discBase.index;
      geo.setAttribute('position', this.discBase.attributes.position);
      const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(THREE.DynamicDrawUsage);
      for (const [name, n] of [['iCenter', 3], ['iU', 3], ['iV', 3], ['iParam', 4], ['iColor', 3]]) geo.setAttribute(name, attr(n));
      geo.instanceCount = 0;
      this.discs.geometry.dispose();
      this.discs.geometry = geo;
      this.discCap = cap;
    }

    makeStars() {
      const cap = NEAR_GALAXIES * NEAR_STARS;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      this.stars = new THREE.Points(
        geo,
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.g.u.time,
            uFog: this.g.u.fog,
            uScale: { value: 800 },
            uRange: { value: NEAR_RANGE },
            uOpacity: { value: 1 },
          },
          vertexShader: STARS_VS,
          fragmentShader: STARS_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.stars.frustumCulled = false;
      this.group.add(this.stars);
    }

    makeSky() {
      this.sky = new THREE.Mesh(
        new THREE.SphereGeometry(470, 128, 64),
        new THREE.ShaderMaterial({
          uniforms: {
            uBase: { value: new THREE.Color() },
            uA: { value: new THREE.Color() },
            uB: { value: new THREE.Color() },
            uTint: { value: new THREE.Color() },
            uTintK: { value: 0 },
            uGlow: { value: 1 },
          },
          vertexShader: NEBULA_VS,
          fragmentShader: NEBULA_FS,
          side: THREE.BackSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.sky.renderOrder = -9;
      this.sky.frustumCulled = false;
      this.group.add(this.sky);
      this.tint = new THREE.Color();
      this.tintK = 0;
    }

    makePlanets() {
      const g = this.g;
      this.planetU = { uSun: { value: new THREE.Vector3() }, uFogCol: { value: new THREE.Color() }, uFog: g.u.fog, uTime: g.u.time };
      this.planetMat = new THREE.ShaderMaterial({ uniforms: this.planetU, vertexShader: PLANET_VS, fragmentShader: PLANET_FS });
      this.iPlanets = new SeededLayer(this.group, new THREE.SphereGeometry(1, 32, 20), this.planetMat);
      this.iPlanets.begin(1);
      this.iPlanets.end();
      this.rockMat = new THREE.ShaderMaterial({ uniforms: this.planetU, vertexShader: PLANET_VS, fragmentShader: ROCK_FS, defines: { ROCK: '' } });
      this.iRocks = new SeededLayer(this.group, rockGeometry(), this.rockMat);
      this.iRocks.begin(1);
      this.iRocks.end();
      this.rq = new THREE.Quaternion();
      this.ringMat = new THREE.ShaderMaterial({
        uniforms: { uFog: g.u.fog },
        vertexShader: RING_VS,
        fragmentShader: RING_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.iRings = new SeededLayer(this.group, new THREE.RingGeometry(1.45, 2.4, 72, 1), this.ringMat);
      this.iRings.begin(1);
      this.iRings.end();
      this.glows = new GB.Graph3D.GlowLayer(this.group, g.glowMat());
      this.glows.begin(1);
      this.glows.end();
      // las órbitas: un solo objeto de líneas
      this.orbits = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.orbits.frustumCulled = false;
      this.orbits.visible = false;
      this.group.add(this.orbits);
    }

    makeStreaks() {
      const N = 280;
      const pos = new Float32Array(N * 6);
      const end = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const x = Math.random();
        const y = Math.random();
        const z = Math.random();
        pos.set([x, y, z, x, y, z], i * 6);
        end[i * 2 + 1] = 1;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      this.streaks = new THREE.LineSegments(
        geo,
        new THREE.ShaderMaterial({
          uniforms: {
            uCam: { value: new THREE.Vector3() },
            uDir: { value: new THREE.Vector3(0, 0, -1) },
            uLen: { value: 0 },
            uBox: { value: 70 },
            uAmt: { value: 0 },
            uColor: { value: new THREE.Color(0.85, 0.92, 1) },
          },
          vertexShader: STREAK_VS,
          fragmentShader: STREAK_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.streaks.frustumCulled = false;
      this.streaks.visible = false;
      this.group.add(this.streaks);
    }

    makePulse() {
      this.pulse = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 24),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(0.35, 0.95, 0.85) }, uA: { value: 0 } },
          vertexShader: PULSE_VS,
          fragmentShader: PULSE_FS,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.pulse.frustumCulled = false;
      this.pulse.visible = false;
      this.g.scene.add(this.pulse); // el escáner también funciona en el valle
      this.scanning = null;
    }

    /** Escáner (X en vuelo): una onda sale de la nave; los planetas que alcanza destellan y muestran su nombre. */
    pulseScan(quiet = false) {
      const g = this.g;
      const now = performance.now();
      if (this.scanning && now - this.scanning.t0 < 900) return; // una onda a la vez
      this.scanning = { t0: now, from: g.camera.position.clone() };
      this.pulse.position.copy(g.camera.position);
      this.pulse.visible = g.motion;
      if (!quiet) g.opts.onScan?.(); // la de la llegada suena con su propio acorde
      g.needsRender = true;
    }

    /* ---------- llegada a una galaxia ---------- */

    /** Se entró en una galaxia: salto, cielo de su color, rótulo, escáner y acorde. Con el director
        filmando solo el rótulo (sin destellos ni sonido); con "reducir movimiento", sin animaciones. */
    arrive(G, now) {
      const g = this.g;
      if (now - (this.arrived.get(G.name) || -1e9) < ARRIVE_AGAIN) return;
      this.arrived.set(G.name, now);
      const auto = !!g.director?.rolling;
      const col = g.col(G.color);
      // el cielo cambia de golpe al color de la galaxia
      this.tint.copy(col);
      this.tintK = Math.max(this.tintK, 0.6);
      if (g.motion && !auto) {
        this.warpAt = now;
        this.warpDir = (this.warpDirV || (this.warpDirV = new THREE.Vector3())).subVectors(G.c, g.camera.position).normalize();
        this.streaks.material.uniforms.uColor.value.copy(col).lerp(g.white, 0.55);
        const w = this.el.warp;
        w.style.setProperty('--c', g.colorHex(G.color));
        w.classList.remove('on');
        void w.offsetWidth;
        w.classList.add('on');
        clearTimeout(this.warpTimer);
        this.warpTimer = setTimeout(() => w.classList.remove('on'), 1600);
      }
      if (!auto) {
        this.scanSoon = now + (g.motion ? 650 : 0); // la onda sale cuando el destello ya pasó
        g.opts.onExplore?.({ kind: 'enter', name: G.name });
        // el panel del sistema se despliega cuando pasó el destello y se pliega solo a los segundos
        this.sysOpenAt = now + (g.motion ? 1200 : 0);
        this.sysCloseAt = this.sysOpenAt + SYS_OPEN_MS;
      }
      this.showArrival(G, now);
    }

    /** Rótulo de llegada: qué galaxia es y qué tiene. El nombre se decodifica letra a letra. */
    showArrival(G, now, found = null) {
      const g = this.g;
      const box = this.el.arrive;
      this.arrival = { name: G.name, t0: now, until: now + ARRIVE_MS, found };
      box.className = `gx-arrive ${G.color}${found ? ' found' : ''}`;
      this.el.aKick.textContent = tr(found ? 'galaxy.discovered' : 'galaxy.entering');
      g.flight?.el.hint.classList.remove('show'); // la ayuda de los controles deja lugar al rótulo
      this.el.aName.textContent = g.motion ? this.scramble(G.name, 0) : G.name;
      this.renderArrival();
      box.classList.remove('show');
      void box.offsetWidth;
      box.classList.add('show');
      g.needsRender = true;
    }

    /** Lo que se ve del nombre a los `p` (0..1) de la decodificación: letras ya resueltas y glifos. */
    scramble(name, p) {
      const n = Math.floor(name.length * p);
      let out = name.slice(0, n);
      for (let i = n; i < name.length; i++) out += name[i] === '/' || name[i] === ' ' ? name[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      return out;
    }

    /** Primera vez que se entra en esta galaxia (world.js): el rótulo de llegada lo dice y suma cuánto
        del mapa está explorado. Si el rótulo ya se fue, vuelve a aparecer. */
    announceDiscovery(name, ex) {
      const now = performance.now();
      const a = this.arrival;
      if (a && a.name === name) {
        a.found = ex;
        a.until = Math.max(a.until, now + 3500);
        this.el.arrive.classList.add('found');
        this.el.aKick.textContent = tr('galaxy.discovered');
        this.renderArrival();
      } else {
        const G = this.gals.get(name);
        if (G) this.showArrival(G, now, ex);
      }
    }

    /** Datos del rótulo: commits propios, planetas y asteroides (cuando llegan sus archivos), líneas
        cambiadas y la última actividad de la rama. */
    renderArrival() {
      const a = this.arrival;
      if (!a) return;
      const G = this.gals.get(a.name);
      if (!G) return;
      const g = this.g;
      const parts = [];
      if (G.n) parts.push(tr('galaxy.commits', { n: G.n }));
      const s = this.sys && this.sys.name === a.name ? this.sys : null;
      if (s) {
        const rocks = s.planets.filter((p) => p.rock).length;
        parts.push(tr('galaxy.planets', { n: s.planets.length - rocks }));
        if (rocks) parts.push(tr('galaxy.asteroids', { n: rocks }));
        if (s.data.kind === 'diff') {
          let add = 0;
          let del = 0;
          for (const f of s.data.files) (add += f.add || 0), (del += f.del || 0);
          if (add || del) parts.push(`+${i18n.fmtNum(add)} −${i18n.fmtNum(del)}`);
        }
      }
      const date = g.nodes.get(G.sha)?.data?.commit?.date;
      if (date) parts.push(U.timeAgo(date));
      const text = parts.join(' · ');
      if (this.el.aMeta.textContent !== text) this.el.aMeta.textContent = text;
      this.el.aEx.textContent = a.found ? tr('world.explored', { n: a.found.n, total: i18n.fmtNum(a.found.total) }) : '';
      const said = [`${this.el.aKick.textContent} ${a.name}`.trim(), text, this.el.aEx.textContent].filter(Boolean).join('. ');
      if (this.el.say.textContent !== said) this.el.say.textContent = said;
    }

    /** Cuadro a cuadro: la decodificación del nombre, el fin del rótulo y la onda de escáner de la llegada. */
    stepArrival(now) {
      const a = this.arrival;
      if (this.scanSoon && now >= this.scanSoon) {
        this.scanSoon = 0;
        if (this.on && this.focus) this.pulseScan(true);
      }
      if (!a) return;
      // con cuadros lentos la decodificación puede saltarse el final: al terminar, siempre el nombre entero
      if (!a.decoded) {
        const p = this.g.motion ? (now - a.t0) / 800 : 1;
        a.decoded = p >= 1;
        this.el.aName.textContent = a.decoded ? a.name : this.scramble(a.name, p);
      }
      if (now > a.until) {
        this.arrival = null;
        this.el.arrive.classList.remove('show');
      }
    }

    /** Radio que alcanzó la onda (o null si no hay escaneo en curso). */
    scanRadius(now) {
      const s = this.scanning;
      if (!s) return null;
      return Math.min(SCAN_RANGE, ((now - s.t0) / 1000) * SCAN_SPEED);
    }

    buildUI() {
      // el rótulo de la galaxia en la que se está, que se despliega en el panel del sistema: sus mundos principales
      const card = (this.card = document.createElement('div'));
      card.className = 'gx-card';
      card.hidden = true;
      card.innerHTML =
        '<button type="button" class="gx-head" aria-expanded="false"><span class="gx-dot" aria-hidden="true"></span><span class="gx-text" aria-live="polite"><span class="gx-name"></span><span class="gx-sub"></span></span><span class="gx-chev" aria-hidden="true"></span></button><ul class="gx-worlds"></ul>';
      this.g.wrap.appendChild(card);
      const head = card.querySelector('.gx-head');
      head.addEventListener('click', () => {
        this.g.touch();
        this.setSysOpen(!this.sysOpen);
        this.sysPin = this.sysOpen; // lo que elige el usuario queda, mientras esté en esta galaxia
      });
      const worlds = card.querySelector('.gx-worlds');
      const rowOf = (ev) => {
        const el = ev.target.closest?.('.gx-world');
        return el && this.sys ? this.sys.planets[el.__i] : null;
      };
      worlds.addEventListener('click', (ev) => {
        const p = rowOf(ev);
        if (p) this.visit(p);
      });
      worlds.addEventListener('pointerover', (ev) => {
        const p = rowOf(ev);
        if (!p) return;
        this.setHover(p);
        if (!this.g.pinned && !this.g.pinFile) this.g.showFileTip(p, false);
      });
      worlds.addEventListener('pointerout', (ev) => {
        const el = ev.target.closest?.('.gx-world');
        if (!el || el.contains(ev.relatedTarget)) return;
        if (this.hover && this.hover === this.sys?.planets[el.__i]) this.setHover(null);
        if (!this.g.pinned && !this.g.pinFile && this.g.tipFile) this.g.hideTip();
      });
      // "Visitar" en la ficha de un planeta: la cámara vuela hasta él
      this.g.tip.addEventListener('click', (ev) => {
        if (ev.target.closest?.('.gx-visit') && this.g.tipFile) this.visit(this.g.tipFile);
      });
      // llegada: líneas de velocidad y destello, y el rótulo con el nombre de la galaxia
      const warp = document.createElement('div');
      warp.className = 'gx-warp';
      warp.setAttribute('aria-hidden', 'true');
      const arrive = document.createElement('div');
      arrive.className = 'gx-arrive';
      // el rótulo se ve, pero no se lee: su nombre se "descifra" cuadro a cuadro con glifos al azar.
      // Lo que oye un lector de pantalla va aparte, entero y una sola vez (renderArrival)
      arrive.setAttribute('aria-hidden', 'true');
      arrive.innerHTML = '<p class="gx-a-k"></p><p class="gx-a-name"></p><p class="gx-a-meta"></p><p class="gx-a-ex"></p>';
      const say = document.createElement('p');
      say.className = 'gx-arrive-say sr-only';
      say.setAttribute('role', 'status');
      // la mira del vuelo fija lo que apunta: un recuadro de esquinas con su nombre y su distancia
      const lock = document.createElement('div');
      lock.className = 'gx-lock';
      lock.setAttribute('aria-hidden', 'true');
      lock.innerHTML = '<div class="gx-lock-box"></div><div class="gx-lock-label"><span class="gx-lock-name"></span><span class="gx-lock-sub"></span><span class="gx-lock-hint"><kbd>J</kbd> <span></span></span></div>';
      lock.style.display = 'none';
      // el hiperimpulsor: la carga (un rótulo con su barra) y el túnel de luz del salto
      const charge = document.createElement('div');
      charge.className = 'gx-charge';
      charge.setAttribute('role', 'status');
      charge.innerHTML = '<p class="gx-charge-k"></p><p class="gx-charge-name"></p><div class="gx-charge-bar" aria-hidden="true"><i></i></div>';
      const tunnel = document.createElement('div');
      tunnel.className = 'gx-tunnel';
      tunnel.setAttribute('aria-hidden', 'true');
      // entrada atmosférica: el borde de la pantalla se enciende al rozar un planeta a toda velocidad
      const heat = document.createElement('div');
      heat.className = 'gx-heat';
      heat.setAttribute('aria-hidden', 'true');
      this.g.wrap.append(warp, arrive, say, heat, tunnel, charge, lock);
      this.el = {
        lock,
        lockBox: lock.querySelector('.gx-lock-box'),
        lockName: lock.querySelector('.gx-lock-name'),
        lockSub: lock.querySelector('.gx-lock-sub'),
        lockHint: lock.querySelector('.gx-lock-hint'),
        lockHintText: lock.querySelector('.gx-lock-hint span'),
        charge,
        chargeK: charge.querySelector('.gx-charge-k'),
        chargeName: charge.querySelector('.gx-charge-name'),
        chargeBar: charge.querySelector('.gx-charge-bar i'),
        tunnel,
        heat,
        name: card.querySelector('.gx-name'),
        sub: card.querySelector('.gx-sub'),
        head,
        worlds,
        warp,
        arrive,
        aKick: arrive.querySelector('.gx-a-k'),
        aName: arrive.querySelector('.gx-a-name'),
        aMeta: arrive.querySelector('.gx-a-meta'),
        aEx: arrive.querySelector('.gx-a-ex'),
        say,
      };
      this.el.lockHintText.textContent = tr('galaxy.jump');
      this.fileLabels = []; // botones de archivo, se reusan
      this.dirLabels = [];
      this.worldLabels = []; // marcadores de los mundos principales
      // un oyente para todas las etiquetas de archivo y los marcadores
      const layer = this.g.labelLayer;
      const planetOf = (ev) => {
        const el = ev.target.closest?.('.g3-file, .g3-world');
        return el && this.sys ? this.sys.planets[el.__i] : null;
      };
      layer.addEventListener('click', (ev) => {
        const p = planetOf(ev);
        if (!p) return;
        ev.stopPropagation();
        this.g.touch();
        this.g.showFileTip(p, true);
      });
      layer.addEventListener('pointerover', (ev) => {
        const p = planetOf(ev);
        if (p && !this.g.pinned && !this.g.pinFile) this.g.showFileTip(p, false);
      });
    }

    readTheme() {
      const g = this.g;
      this.orbits.material.color.copy(g.lineColor).lerp(g.white, 0.25);
      const su = this.sky.material.uniforms;
      su.uBase.value.copy(g.spaceCol);
      su.uA.value.copy(g.col('c7'));
      su.uB.value.copy(g.col('c3'));
      this.planetU.uFogCol.value.copy(g.spaceCol);
      this.paintDiscs();
      this.nearKey = ''; // los colores de las estrellas cambian
      if (this.sys) this.paintSystem(this.sys);
    }

    resize() {
      const g = this.g;
      this.stars.material.uniforms.uScale.value = (g.H * g.dpr) / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
    }

    setOn(on) {
      this.on = on;
      this.group.visible = on;
      this.card.hidden = true;
      this.streaks.visible = false;
      this.arrival = null;
      this.parked = null;
      this.setSysOpen(false);
      this.sysPin = null;
      this.sysOpenAt = this.sysCloseAt = 0;
      this.el.arrive.classList.remove('show');
      this.endHyper();
      this.setAim(null, 0);
      this.setHeat(0);
      if (!on) {
        this.dropSystem(true);
        this.sleep();
        this.hideLabels();
        this.near = [];
        this.nearKey = '';
        this.stars.geometry.setDrawRange(0, 0);
      }
    }

    /* ---------- el universo ---------- */

    /** Ubica cada commit y cada cabeza. Devuelve el radio del universo (graph3d lo usa como escala). */
    layout(L) {
      this.version++;
      const chains = new Map();
      for (const n of L.nodes) {
        let list = chains.get(n.chain);
        if (!list) chains.set(n.chain, (list = []));
        list.push(n);
      }
      for (const list of chains.values()) list.sort((a, b) => b.x - a.x); // la más nueva primero: el núcleo

      // lugares estables: la rama por defecto al centro; las demás, el primer lugar libre al aparecer
      const live = new Set(L.heads.map((h) => h.name));
      for (const name of [...this.slots.keys()]) if (!live.has(name)) this.slots.delete(name);
      const heads = [...L.heads].sort((a, b) => a.row - b.row);
      const taken = new Set();
      for (const h of heads) {
        const s = this.slots.get(h.name);
        if (h.isDefault) this.slots.set(h.name, 0);
        else if (s > 0) taken.add(s);
        else this.slots.delete(h.name);
      }
      let free = 1;
      for (const h of heads) {
        if (this.slots.has(h.name)) continue;
        while (taken.has(free)) free++;
        this.slots.set(h.name, free);
        taken.add(free);
      }

      const def = heads.find((h) => h.isDefault);
      const sizes = heads.filter((h) => !h.isDefault).map((h) => radiusFor((chains.get(h.chain) || []).length)).sort((a, b) => a - b);
      const big = sizes.length ? sizes[Math.floor((sizes.length - 1) * 0.9)] : 4;
      const C = clamp(big * 2.4, SLOT_MIN, SLOT_MAX);
      const R0 = (def ? radiusFor((chains.get(def.chain) || []).length) : 0) + big + 6;
      const gals = new Map();
      let reach = 10;
      for (const h of heads) {
        const slot = this.slots.get(h.name);
        const seed = hashStr(h.name);
        const rand = rng(seed);
        const [ry, rt, ra, rth] = [rand(), rand(), rand(), rand()];
        const c = new THREE.Vector3();
        if (slot > 0) {
          const r = R0 + C * Math.sqrt(slot - 1);
          const a = slot * GOLDEN;
          c.set(Math.cos(a) * r, (ry - 0.5) * (C * 0.6 + r * 0.2), Math.sin(a) * r);
        }
        // cada disco inclinado a su manera, pero siempre igual para la misma rama
        const tilt = slot === 0 ? 0.42 : 0.25 + rt * 0.85;
        const az = ra * Math.PI * 2;
        const w = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
        const u = new THREE.Vector3(1, 0, 0).cross(w);
        if (u.lengthSq() < 1e-4) u.set(0, 0, 1).cross(w);
        u.normalize();
        const v = new THREE.Vector3().crossVectors(w, u);
        const n = (chains.get(h.chain) || []).length;
        const G = { name: h.name, sha: h.sha, isDefault: h.isDefault, color: h.color, c, u, v, w, R: radiusFor(n), theta0: rth * Math.PI * 2, seed, n, rings: [], outer: 0 };
        G.outer = G.R;
        gals.set(h.name, G);
      }
      const byChain = new Map([...gals.values()].map((G) => ['b:' + G.name, G]));

      const posOf = new Map();
      const galOf = new Map();
      for (const G of gals.values()) {
        const list = chains.get('b:' + G.name) || [];
        for (let k = 0; k < list.length; k++) {
          const sha = list[k].sha;
          posOf.set(sha, this.armPos(G, k, sha));
          galOf.set(sha, G);
        }
      }

      // corrientes: los commits de ramas fusionadas y borradas orbitan la galaxia donde se fusionaron
      const chainOf = (sha) => L.nodeOf.get(sha)?.chain;
      const hostOf = new Map();
      for (const e of L.edges) {
        if (e.kind !== 'merge') continue;
        const from = chainOf(e.from);
        const to = chainOf(e.to);
        if (from?.startsWith('g:') && to && to !== from && !hostOf.has(from)) hostOf.set(from, to);
      }
      for (const e of L.edges) {
        if (e.kind !== 'fork') continue;
        const to = chainOf(e.to);
        const from = chainOf(e.from);
        if (to?.startsWith('g:') && from && !hostOf.has(to)) hostOf.set(to, from);
      }
      const hostGalaxy = (key) => {
        for (let i = 0; i < 64 && key; i++) {
          if (byChain.has(key)) return byChain.get(key);
          key = hostOf.get(key);
        }
        return def ? gals.get(def.name) : gals.values().next().value;
      };
      const streams = [...chains.entries()].filter(([key]) => key.startsWith('g:')).sort((a, b) => b[1][0].x - a[1][0].x);
      for (const [key, list] of streams) {
        const G = hostGalaxy(hostOf.get(key));
        if (!G) continue;
        this.placeStream(G, key, list, posOf, galOf);
      }

      const headPos = new Map();
      for (const G of gals.values()) {
        headPos.set(G.name, G.c);
        reach = Math.max(reach, G.c.length() + G.outer);
      }
      this.gals = gals;
      this.posOf = posOf;
      this.galOf = galOf;
      this.headPos = headPos;
      this.radius = reach + 4;
      this.discMat.uniforms.uFar.value = Math.max(900, this.radius * 3.2);
      this.paintDiscs();
      this.nearKey = '';
      if (this.focus) {
        const G = gals.get(this.focus.name);
        if (!G) this.setFocus(null);
        else this.focus = G;
        if (this.sys && G) {
          this.sys.G = G;
          this.writeOrbits(this.sys); // la galaxia pudo cambiar de tamaño o de lugar
          this.dirty = true;
        }
      }
      return this.radius;
    }

    /** Commit k del brazo (0 = la cabeza, en el núcleo), con un leve grosor según su sha. */
    armPos(G, k, sha) {
      const phi = armPhi(k);
      const r = ARM_A * phi;
      const ang = G.theta0 + phi;
      const lift = (h01(sha) - 0.5) * 0.5 * Math.min(1, r / 3);
      return new THREE.Vector3()
        .copy(G.c)
        .addScaledVector(G.u, Math.cos(ang) * r)
        .addScaledVector(G.v, Math.sin(ang) * r)
        .addScaledVector(G.w, lift);
    }

    /** Una corriente fusionada: un arco en un anillo alrededor de la galaxia, sin pisar a las otras. */
    placeStream(G, key, list, posOf, galOf) {
      const m = list.length;
      const len = (m - 1) * STEP;
      let j = 0;
      while (len + 2 > Math.PI * 2 * (G.R + 2.4 + j * SAT_GAP) * 0.9 && j < 200) j++; // cabe en una vuelta
      const mid0 = h01(key) * Math.PI * 2;
      let mid = mid0;
      let d = G.R + 2.4 + j * SAT_GAP;
      for (; j < 400; j++) {
        d = G.R + 2.4 + j * SAT_GAP;
        const half = (len / d) / 2 + 0.16;
        const ring = G.rings[j] || (G.rings[j] = []);
        if (!ring.some((a) => Math.abs(wrapAngle(a.mid - mid)) < a.half + half)) {
          ring.push({ mid, half });
          break;
        }
      }
      G.outer = Math.max(G.outer, d + 1);
      const start = mid + len / d / 2;
      for (let k = 0; k < m; k++) {
        const ang = start - (k * STEP) / d; // la más nueva en un extremo, como en la rama
        const sha = list[k].sha;
        posOf.set(
          sha,
          new THREE.Vector3()
            .copy(G.c)
            .addScaledVector(G.u, Math.cos(ang) * d)
            .addScaledVector(G.v, Math.sin(ang) * d)
            .addScaledVector(G.w, 0.35 + (h01(sha) - 0.5) * 0.4),
        );
        galOf.set(sha, G);
      }
    }

    /** Hacia dónde sigue la historia (las líneas punteadas del final): brazo afuera. */
    stubDir(sha, out) {
      const G = this.galOf.get(sha);
      const p = this.posOf.get(sha);
      if (!G || !p) return out.set(0, 0, -1);
      out.subVectors(p, G.c);
      if (out.lengthSq() < 1e-4) out.copy(G.u);
      return out.normalize();
    }

    /** Puente entre dos galaxias (bifurcación o merge): un arco que se levanta, más cuanto más largo. */
    curve(it, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz);
      const lift = 0.4 + d * 0.16;
      const N = clamp(Math.ceil(d / 2.2) + 6, 8, 18);
      const pts = new Float32Array((N + 1) * 3);
      for (let i = 0; i <= N; i++) {
        const t = 0.5 - 0.5 * Math.cos((Math.PI * i) / N);
        const u = 1 - t;
        const w1 = 3 * u * u * t;
        const w2 = 3 * u * t * t;
        const w3 = t * t * t;
        // P1 y P2 a un tercio del camino, levantados
        const bx = w1 * (a.x + dx * 0.3) + w2 * (a.x + dx * 0.7) + w3 * b.x + u * u * u * a.x;
        const by = w1 * (a.y + dy * 0.3 + lift) + w2 * (a.y + dy * 0.7 + lift) + w3 * b.y + u * u * u * a.y;
        const bz = w1 * (a.z + dz * 0.3) + w2 * (a.z + dz * 0.7) + w3 * b.z + u * u * u * a.z;
        pts[i * 3] = bx;
        pts[i * 3 + 1] = by;
        pts[i * 3 + 2] = bz;
      }
      return pts;
    }

    /** Un cuadro por galaxia: su centro, su plano, su tamaño, el giro del brazo y su color. */
    paintDiscs() {
      const list = [...this.gals.values()];
      this.discs.visible = list.length > 0;
      if (list.length > this.discCap) this.allocDiscs(Math.max(64, 2 ** Math.ceil(Math.log2(list.length))));
      if (!this.discCap) return;
      const geo = this.discs.geometry;
      const A = (name) => geo.attributes[name].array;
      const [c, u, v, p, col] = ['iCenter', 'iU', 'iV', 'iParam', 'iColor'].map(A);
      const g = this.g;
      const tmp = new THREE.Color();
      list.forEach((G, i) => {
        c.set([G.c.x, G.c.y, G.c.z], i * 3);
        u.set([G.u.x, G.u.y, G.u.z], i * 3);
        v.set([G.v.x, G.v.y, G.v.z], i * 3);
        p.set([G.R, G.theta0, (G.seed % 1000) / 1000, ARM_A], i * 4);
        tmp.copy(g.col(G.color));
        if (G.color === 'ghost') tmp.lerp(g.white, 0.15); // las ramas muertas, galaxias grises y apagadas
        col.set([tmp.r, tmp.g, tmp.b], i * 3);
      });
      for (const name of ['iCenter', 'iU', 'iV', 'iParam', 'iColor']) {
        const a = geo.attributes[name];
        a.updateRange.offset = 0;
        a.updateRange.count = Math.max(1, list.length * a.itemSize);
        a.needsUpdate = true;
      }
      geo.instanceCount = list.length;
    }

    /** Dónde mira la vista por omisión: el centro del universo. */
    home(out) {
      return out.set(0, 0, 0);
    }

    galaxyOf(name) {
      return this.gals.get(name) || null;
    }

    /* ---------- cuadro a cuadro ---------- */

    /** Galaxias cercanas: se resuelven en estrellas; la más cercana, si se está dentro, muestra sus planetas. */
    step(now, dt) {
      const g = this.g;
      let changed = this.stepPulse(now);
      if (!this.on) return changed;
      if (now - this.scanAt > SURVEY_MS) {
        this.scanAt = now;
        this.survey(now);
      }
      // el cielo acompaña a la nave y se tiñe con la galaxia en la que se está
      const cam = g.camera.position;
      this.sky.position.copy(cam);
      const su = this.sky.material.uniforms;
      const near = this.near[0];
      const want = near ? clamp(1 - near.d / NEAR_RANGE, 0, 1) * 0.8 : 0;
      if (near && !(this.warpAt && now - this.warpAt < 2500)) this.tint.lerp(g.col(near.G.color), 1 - Math.exp(-dt * 2));
      this.tintK += (want - this.tintK) * (1 - Math.exp(-dt * 1.5));
      if (Math.abs(su.uTintK.value - this.tintK) > 0.002 || !su.uTint.value.equals(this.tint)) {
        su.uTintK.value = this.tintK;
        su.uTint.value.copy(this.tint);
        changed = true;
      }
      if (this.stepStreaks(dt, now)) changed = true;
      this.stepArrival(now);
      if (this.hyper && this.stepHyper(now, dt)) changed = true;
      // en vuelo, la mira fija lo que apunta; al rozar un planeta a toda velocidad, la atmósfera
      const fly = !!g.flight?.on && !this.hyper;
      if (fly) this.aim(now);
      else if (this.aimed) this.setAim(null, now);
      this.stepHeat(now, dt, fly);
      this.stepAmbience(now);
      // el panel del sistema: se abre al llegar y se pliega solo, salvo que el usuario lo haya tocado o lo esté mirando
      if (this.sysOpenAt && now >= this.sysOpenAt) {
        this.sysOpenAt = 0;
        if (this.sysPin == null && this.sys && this.roomy()) this.setSysOpen(true);
      }
      if (this.sysCloseAt && now >= this.sysCloseAt) {
        if (this.card.matches(':hover')) this.sysCloseAt = now + 2000;
        else {
          this.sysCloseAt = 0;
          if (this.sysPin == null) this.setSysOpen(false);
        }
      }
      // al llegar, la nebulosa se enciende un momento
      const flare = this.warpAt ? clamp(1 - (now - this.warpAt) / 2600, 0, 1) : 0;
      const glow = 1 + 0.8 * flare * flare;
      if (Math.abs(su.uGlow.value - glow) > 0.002) {
        su.uGlow.value = glow;
        changed = true;
      }
      if (this.old) {
        changed = true;
        if (now - this.old.dying > 320) this.old = null;
      }
      const sys = this.sys;
      // con movimiento giran; quietos, se reescriben solo si algo cambió
      if ((sys || this.old) && (g.motion || this.dirty)) {
        this.dirty = false;
        this.writePlanets(now);
        changed = true;
      } else if (!sys && !this.old && this.iPlanets.n) {
        this.writePlanets(now); // se fueron todos: el lote queda vacío
        changed = true;
      }
      // el núcleo ilumina a sus planetas
      if (sys) this.planetU.uSun.value.copy(sys.G.c);
      return changed;
    }

    /** Estelas del "pulse drive": aparecen al volar rápido por el espacio. */
    stepStreaks(dt, now) {
      const g = this.g;
      const f = g.flight;
      const level = f?.on && g.motion ? f.level || 0 : 0;
      // al llegar a una galaxia, un golpe de estelas hacia ella: la salida del salto
      const burst = this.warpAt ? clamp(1 - (now - this.warpAt) / 1300, 0, 1) : 0;
      const h = this.hyper;
      const tunnel = h?.inTunnel ? 1 : 0; // en el túnel del salto, estelas a tope
      const amt = Math.max(clamp((level - 0.35) / 0.45, 0, 1), burst, tunnel);
      const u = this.streaks.material.uniforms;
      const was = u.uAmt.value;
      u.uAmt.value = burst > 0 || tunnel ? amt : u.uAmt.value + (amt - was) * (1 - Math.exp(-dt * 5));
      if (u.uAmt.value < 0.003) u.uAmt.value = 0;
      this.streaks.visible = u.uAmt.value > 0;
      if (!this.streaks.visible) {
        if (was > 0) u.uColor.value.setRGB(0.85, 0.92, 1);
        return was > 0;
      }
      u.uCam.value.copy(g.camera.position);
      const v = f?.on ? f.vel.length() : 0;
      if (tunnel) {
        u.uDir.value.copy(h.dir);
        u.uLen.value = 34;
      } else if (burst > 0.02) {
        u.uDir.value.copy(this.warpDir);
        u.uLen.value = Math.max(Math.min(14, v * 0.1), 16 * burst * burst);
      } else {
        if (v > 1e-3) u.uDir.value.copy(f.vel).multiplyScalar(1 / v);
        u.uLen.value = Math.min(14, v * 0.1);
      }
      return true;
    }

    /** La onda del escáner crece y se apaga; los planetas que alcanza destellan. */
    stepPulse(now) {
      const s = this.scanning;
      if (!s) return false;
      const t = now - s.t0;
      if (t > SCAN_MS) {
        this.scanning = null;
        this.pulse.visible = false;
        this.dirty = true;
        return true;
      }
      const r = this.scanRadius(now);
      this.pulse.scale.setScalar(Math.max(0.5, r));
      this.pulse.material.uniforms.uA.value = 0.9 * (1 - clamp(r / SCAN_RANGE, 0, 1)) ** 1.5;
      if (r >= SCAN_RANGE) this.pulse.visible = false;
      this.dirty = true;
      return t < (SCAN_RANGE / SCAN_SPEED) * 1000 + 200;
    }

    survey(now) {
      const g = this.g;
      const cam = g.camera.position;
      // las más cercanas, para sus estrellas sueltas
      const near = [];
      for (const G of this.gals.values()) {
        const d = cam.distanceTo(G.c) - G.R;
        if (d < NEAR_RANGE) near.push({ G, d });
      }
      near.sort((a, b) => a.d - b.d);
      if (near.length > NEAR_GALAXIES) near.length = NEAR_GALAXIES;
      this.near = near;
      const key = this.version + ':' + near.map((n) => n.G.name).join('|');
      if (key !== this.nearKey) {
        this.nearKey = key;
        this.fillStars(near.map((n) => n.G));
        g.needsRender = true;
      }

      // ¿en qué galaxia estamos? Hay que estar cerca de su núcleo (con un margen para no entrar y salir
      // en el borde). Entre varias, en órbita gana la que se está mirando (la más cercana al punto que
      // mira la cámara: una galaxia chica junto a una grande no queda tapada por ella) y en vuelo, la más
      // cercana a la nave según su tamaño.
      const ref = g.flight?.on || g.ride ? cam : g.controls.target;
      let best = null;
      let bestK = Infinity;
      for (const { G } of near) {
        const dc = cam.distanceTo(G.c);
        if (dc >= this.enterDist(G)) continue;
        let k = ref.distanceTo(G.c) / (G.R + 6) - (this.focus === G ? 0.15 : 0);
        // dentro del sistema en el que ya se está (entre sus planetas) no se cambia de galaxia aunque
        // una vecina quede más cerca: se sale de un sistema por su borde, como en No Man's Sky
        if (this.focus === G && this.sys?.name === G.name && dc < this.sys.outer + 4) k = -1;
        if (k < bestK) (best = G), (bestK = k);
      }
      if (g.ctx?.replay) best = null; // en el Replay se ve el pasado: los archivos son de ahora
      if (best !== this.focus || (best && this.sys && this.sys.sha !== best.sha)) this.setFocus(best, now);
      else if (best) this.ensureFiles(best, now);
    }

    /** Desde qué distancia de su núcleo se "entra" en una galaxia (y aparecen sus planetas). Si ya se
        conoce su sistema, desde donde se lo ve entero: el mirador queda dentro. */
    enterDist(G) {
      const outer = this.outerOf.get(G.name) || 0;
      return Math.max(G.R * 1.6 + 16, outer * 1.5 + 8) + (this.focus === G ? 6 : 0);
    }

    /* ---------- el hiperimpulsor ---------- */

    /** A qué galaxia saltaría la nave: la que apunta la mira o, si no, la marcada como destino. */
    jumpTarget() {
      const a = this.aimed;
      if (a?.kind === 'galaxy' && this.gals.has(a.name)) return this.gals.get(a.name);
      const w = this.g.world?.waypoint;
      const G = w ? this.gals.get(w) : null;
      return G && G !== this.focus ? G : null;
    }

    /** J en vuelo (o el botón del celular, o Y en el mando): salta a lo que apunta la mira o al destino. */
    jumpAim() {
      if (!this.on || this.hyper) return;
      const G = this.jumpTarget();
      if (!G) return void this.g.flight?.say(tr('galaxy.noJump'));
      this.jumpTo(G);
    }

    /** Salto hiperespacial hasta una galaxia: la nave carga unos instantes mirando hacia ella, cruza un
        túnel de luz y sale al mirador de su sistema, con la llegada de siempre (destello, rótulo, escáner).
        Con "reducir movimiento" es un corte. Funciona en vuelo y en órbita. */
    jumpTo(G) {
      const g = this.g;
      if (!G || !this.on || this.hyper || G === this.focus) return;
      const now = performance.now();
      g.touch();
      if (g.ride) g.endRide();
      g.fly = null;
      g.unpin();
      g.setFollowing(false);
      const cam = g.camera;
      const from = cam.position.clone();
      const dir = new THREE.Vector3();
      const dist = this.vantage(G, dir);
      const to = G.c.clone().addScaledVector(dir, dist);
      const travel = to.clone().sub(from);
      const len = travel.length();
      if (len < 1e-3) travel.set(0, 0, -1);
      else travel.multiplyScalar(1 / len);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion); // la nave no da una vuelta de más
      const m = new THREE.Matrix4();
      const qT = new THREE.Quaternion().setFromRotationMatrix(m.lookAt(from, to, up)); // mirando por el túnel
      const qL = new THREE.Quaternion().setFromRotationMatrix(m.lookAt(to, G.c, up)); // al llegar, al núcleo
      const h = (this.hyper = { G, t0: now, from, to, dir: travel, len, q0: cam.quaternion.clone(), qT, qL, fov0: cam.fov, dur: clamp(900 + len * 4, JUMP_MIN_MS, JUMP_MAX_MS), inTunnel: false });
      this.arrived.delete(G.name); // la llegada se anuncia aunque se haya estado hace poco
      this.setAim(null, now);
      g.controls.enabled = false;
      if (!g.motion) return this.land(h);
      const col = g.col(G.color);
      this.streaks.material.uniforms.uColor.value.copy(col).lerp(g.white, 0.6);
      const hex = g.colorHex(G.color);
      const c = this.el.charge;
      c.style.setProperty('--c', hex);
      this.el.chargeK.textContent = tr('galaxy.charging');
      this.el.chargeName.textContent = G.name;
      this.el.chargeBar.style.transform = 'scaleX(0)';
      c.classList.add('on');
      this.el.tunnel.style.setProperty('--c', hex);
      this.el.tunnel.style.setProperty('--dur', `${h.dur}ms`);
      g.opts.onJump?.('charge', G.name);
      g.needsRender = true;
    }

    /** Cuadro a cuadro del salto: carga, túnel y aterrizaje. Devuelve true (la cámara cambió). */
    stepHyper(now, dt) {
      const g = this.g;
      const h = this.hyper;
      const cam = g.camera;
      const t = now - h.t0;
      g.lastInteract = now; // el director no retoma la cámara en pleno salto
      let fov = h.fov0;
      if (t < CHARGE_MS) {
        const p = t / CHARGE_MS;
        cam.quaternion.slerpQuaternions(h.q0, h.qT, 1 - Math.pow(1 - p, 3));
        fov = h.fov0 - 5 * p; // se tensa un poco antes del salto
        this.el.chargeBar.style.transform = `scaleX(${p.toFixed(3)})`;
      } else if (t < CHARGE_MS + h.dur) {
        if (!h.inTunnel) {
          h.inTunnel = true;
          this.el.charge.classList.remove('on');
          const tu = this.el.tunnel;
          tu.classList.remove('on');
          void tu.offsetWidth;
          tu.classList.add('on');
          g.opts.onJump?.('jump', h.G.name);
        }
        const p = (t - CHARGE_MS) / h.dur;
        const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
        cam.position.lerpVectors(h.from, h.to, e);
        if (p < 0.7) cam.quaternion.copy(h.qT);
        else {
          const q = (p - 0.7) / 0.3;
          cam.quaternion.slerpQuaternions(h.qT, h.qL, q * q * (3 - 2 * q));
        }
        fov = h.fov0 + 24 * Math.sin(Math.PI * p);
        // el cielo va tomando el color de la galaxia a la que se llega
        this.tint.lerp(g.col(h.G.color), 1 - Math.exp(-dt * 3));
        this.tintK = Math.max(this.tintK, 0.55 * p);
      } else return this.land(h), true;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      return true;
    }

    /** Fin del salto: la nave queda en el mirador mirando al núcleo, y la galaxia la recibe. */
    land(h) {
      const g = this.g;
      const cam = g.camera;
      cam.position.copy(h.to);
      cam.quaternion.copy(h.qL);
      this.endHyper();
      const f = g.flight;
      if (f?.on) {
        f.q.copy(cam.quaternion);
        f.vel.set(0, 0, 0);
        f.bank = 0;
        f.rollVel = 0;
      } else {
        g.controls.target.copy(h.G.c);
        g.controls.enabled = true;
        g.controls.update();
        this.park(h.G);
      }
      g.lastInteract = performance.now();
      if (g.world?.waypoint === h.G.name) g.world.setWaypoint(null); // se llegó al destino: la columna de luz se apaga
      this.survey(performance.now()); // la llegada, ya mismo: destello, rótulo y escáner
      g.needsRender = true;
    }

    endHyper() {
      const h = this.hyper;
      if (!h) return;
      this.hyper = null;
      // al aterrizar o si lo cortan a mitad (2D, salir de las galaxias, otro repo): el túnel abre el
      // campo de visión hasta 70° y la cámara tiene que recuperar el suyo
      const cam = this.g.camera;
      if (cam.fov !== h.fov0) {
        cam.fov = h.fov0;
        cam.updateProjectionMatrix();
      }
      this.el.charge.classList.remove('on');
      this.el.tunnel.classList.remove('on');
      if (!this.g.flight?.on) this.g.controls.enabled = true;
    }

    /* ---------- la mira ---------- */

    /** Qué apunta la nave: un planeta del sistema en el que se está o, si no, una galaxia a la vista. */
    aim(now) {
      const g = this.g;
      const cam = g.camera;
      const origin = cam.position;
      const fwd = this.v.set(0, 0, -1).applyQuaternion(cam.quaternion);
      let best = null;
      let score = Infinity;
      const s = this.sys;
      if (s) {
        for (const p of s.planets) {
          const r = p.size * (p.k ?? 1) + (p.rock ? 0.25 : 0.4);
          const to = this.w.subVectors(p.pos, origin);
          const t = to.dot(fwd);
          if (t <= 0.2) continue;
          const off = Math.sqrt(Math.max(0, to.lengthSq() - t * t));
          if (off > r || t >= score) continue;
          score = t;
          best = { kind: 'planet', p, name: p.name, pos: p.pos, r: p.size * (p.k ?? 1), hex: p.hex };
        }
      }
      if (!best) {
        for (const G of this.gals.values()) {
          if (G === this.focus) continue;
          const to = this.w.subVectors(G.c, origin);
          const d = to.length();
          if (d > AIM_RANGE || d < 1e-3) continue;
          const ang = Math.acos(clamp(to.dot(fwd) / d, -1, 1));
          const cone = Math.atan2(Math.max(G.R * 1.2, 3), d) + 0.035;
          if (ang > cone) continue;
          const k = ang / cone + d / AIM_RANGE; // entre varias, la más centrada y cercana
          if (k < score) {
            score = k;
            best = { kind: 'galaxy', G, name: G.name, pos: G.c, r: G.R, hex: g.colorHex(G.color) };
          }
        }
      }
      const same = best && this.aimed && best.kind === this.aimed.kind && (best.kind === 'planet' ? best.p === this.aimed.p : best.G === this.aimed.G);
      if (!same) this.setAim(best, now);
    }

    setAim(a, now) {
      if (!a && !this.aimed) return;
      this.aimed = a;
      this.aimAt = now;
      const el = this.el.lock;
      if (!a) {
        el.style.display = 'none';
        this.g.needsRender = true;
        return;
      }
      el.style.setProperty('--c', a.hex);
      el.classList.toggle('galaxy', a.kind === 'galaxy');
      const box = this.el.lockBox;
      box.classList.remove('lock');
      void box.offsetWidth;
      box.classList.add('lock');
      this.el.lockName.textContent = U.truncate(a.name, 32);
      this.el.lockHintText.textContent = tr('galaxy.jump');
      this.g.needsRender = true;
    }

    /** Dibuja la mira sobre lo apuntado: el recuadro crece con lo que ocupa en pantalla, y debajo su nombre y
        su distancia (en una galaxia, también sus commits y el aviso de que J salta hasta ella). */
    placeLock() {
      const a = this.aimed;
      const el = this.el.lock;
      if (!a || !this.on) return void (el.style.display !== 'none' && (el.style.display = 'none'));
      const g = this.g;
      const q = g.project(a.pos);
      if (!q) return void (el.style.display = 'none');
      const d = g.camera.position.distanceTo(a.pos);
      const focal = g.H / (2 * Math.tan((g.camera.fov * Math.PI) / 360));
      const px = clamp((a.r * focal) / Math.max(1, d), 13, Math.min(g.W, g.H) * 0.3);
      const size = Math.round(px * 2 + 18);
      const dist = g.world ? g.world.fmtDist(Math.max(0, d - a.r)) : Math.round(d);
      const sub = a.kind === 'planet' ? `${this.kindText(a.p)} · ${dist}` : `${tr('galaxy.commits', { n: a.G.n })} · ${dist}`;
      if (el.__s !== sub) {
        el.__s = sub;
        this.el.lockSub.textContent = sub;
      }
      el.style.display = '';
      el.style.setProperty('--s', `${size}px`);
      el.style.transform = `translate(${Math.round(q.x)}px,${Math.round(q.y)}px)`;
    }

    /* ---------- entrada atmosférica ---------- */

    /** Cerca de la superficie de un planeta y a velocidad, el borde de la pantalla se enciende. */
    stepHeat(now, dt, fly) {
      const g = this.g;
      let want = 0;
      const s = this.sys;
      if (fly && s && g.motion) {
        const f = g.flight;
        const v = f.vel.length();
        const pos = g.camera.position;
        let near = 0;
        for (const p of s.planets) {
          if (p.rock) continue;
          const gap = pos.distanceTo(p.pos) - p.size * (p.k ?? 1);
          const k = clamp(1 - gap / (p.size * 2.2 + 1), 0, 1);
          if (k > near) near = k;
        }
        // más rápido que el paso tranquilo de ahí (la nave frena sola junto a los planetas): hace falta
        // acelerar, o venir lanzado desde fuera
        const calm = 9 * clamp(0.6 + g.radius / 14, 0.8, 3.4) * Math.max(0.1, this.nearFactor(pos));
        want = near * clamp((v / calm - HEAT_SPEED) / 1.2, 0, 1);
      }
      // se enciende rápido y se apaga despacio, como el metal que se enfría
      const heat = want > this.heat ? this.heat + (want - this.heat) * (1 - Math.exp(-dt * 14)) : this.heat + (want - this.heat) * (1 - Math.exp(-dt * 2.2));
      this.setHeat(heat < 0.004 ? 0 : heat);
    }

    setHeat(v) {
      if (Math.abs(v - this.heat) < 0.003 && !(v === 0 && this.heat)) return;
      this.heat = v;
      this.el.heat.style.opacity = v.toFixed(3);
      this.el.heat.classList.toggle('on', v > 0);
    }

    /* ---------- el zumbido del espacio ---------- */

    /** Con el sonido activado, el espacio tiene un fondo grave en la nota de la galaxia en la que se está
        (más tenue entre galaxias). Se avisa solo cuando cambia. */
    stepAmbience(now) {
      if (now - this.amb.at < 250) return;
      this.amb.at = now;
      const name = this.focus?.name || null;
      const level = !this.on ? 0 : this.focus ? 1 : 0.55 + 0.45 * this.tintK;
      if (name === this.amb.name && Math.abs(level - this.amb.level) < 0.03) return;
      this.amb.name = name;
      this.amb.level = level;
      this.g.opts.onAmbience?.(level, name);
    }

    /** Cambió el sonido (se activó o se apagó): el zumbido se vuelve a pedir con el próximo cuadro. */
    pokeAmbience() {
      this.amb.level = -1;
      this.amb.at = 0;
    }

    /** La vista 3D se oculta o se sale del espacio: el zumbido se apaga. */
    sleep() {
      if (this.amb.level > 0) this.g.opts.onAmbience?.(0, null);
      this.amb.level = -1;
      this.amb.name = null;
    }

    /* ---------- el mirador del sistema ---------- */

    /** Desde dónde se ve el sistema entero: fuera de la última órbita, algo por encima de su plano y del
        lado desde el que venía la cámara, mirando al núcleo. Deja la dirección en `out` y devuelve la
        distancia al núcleo (con la que caben todas las órbitas en el cuadro, sin salirse de la galaxia). */
    vantage(G, out) {
      const g = this.g;
      const outer = this.outerOf.get(G.name) || G.R * 2.2 + 6;
      const { pu, pv, pn } = this.basis(G);
      const d = this.v.subVectors(g.camera.position, G.c);
      let x = d.dot(pu);
      let y = d.dot(pv);
      const len = Math.hypot(x, y);
      if (len < 1e-3) (x = 1), (y = 0);
      else (x /= len), (y /= len);
      const side = d.dot(pn) >= 0 ? 1 : -1; // por encima o por debajo del plano, según venía
      out.copy(pu).multiplyScalar(x).addScaledVector(pv, y).multiplyScalar(Math.cos(VIEW_ELEV)).addScaledVector(pn, Math.sin(VIEW_ELEV) * side).normalize();
      const tan = Math.tan((g.camera.fov * Math.PI) / 360);
      const aspect = g.W && g.H ? g.W / g.H : 1.6;
      // a lo ancho se ve la órbita entera; a lo alto, aplastada por la inclinación
      const fit = Math.max((outer + 1.5) / (tan * aspect), ((outer + 1.5) * Math.sin(VIEW_ELEV) + 2) / tan) * 1.15;
      return clamp(fit, G.R * 2 + 9, this.enterDist(G) - 3);
    }

    /** La cámara acaba de ir al mirador de esta galaxia: si llegan sus archivos antes de que nadie la
        mueva, se vuelve a encuadrar con el tamaño real del sistema. */
    park(G) {
      this.parked = { name: G.name, at: performance.now() };
    }

    reframe(G) {
      const g = this.g;
      const p = this.parked;
      if (!p || p.name !== G.name || g.lastInteract > p.at || g.flight?.on || g.ride || g.director?.rolling || g.following) return;
      const dir = this.v2 || (this.v2 = new THREE.Vector3());
      const dist = this.vantage(G, dir);
      const t = G.c.clone();
      g.flyTo(t, t.clone().addScaledVector(dir, dist), 1300);
      p.at = performance.now();
    }

    /** Volar hasta un planeta (desde la lista del sistema o su ficha): de cerca, desde el lado en que se estaba. */
    visit(p) {
      const g = this.g;
      g.touch();
      g.flight?.exit();
      if (g.ride) g.endRide();
      g.focusPoint(p.pos, p.rock ? 2.2 : p.size * 5 + 2.5);
      g.showFileTip(p, true);
    }

    /** Despliega o pliega el panel del sistema (la lista de los mundos principales). */
    setSysOpen(open) {
      open = !!open && !!this.sys;
      if (open === this.sysOpen) return;
      this.sysOpen = open;
      this.card.classList.toggle('open', open);
      this.el.head.setAttribute('aria-expanded', String(open));
      this.g.needsRender = true;
    }

    kindText(p) {
      return tr(KIND_KEY[kindOf(p)]);
    }

    /** La lista del panel: los mundos principales (punto de su color, nombre, clase y tamaño o líneas) y cuántos más hay. */
    renderWorlds() {
      const s = this.sys;
      const ul = this.el.worlds;
      if (!s) {
        ul.replaceChildren();
        this.setSysOpen(false);
        return;
      }
      const frag = document.createDocumentFragment();
      for (const p of s.worlds) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gx-world';
        b.__i = p.i;
        b.style.setProperty('--c', p.hex);
        b.title = p.path;
        let stat = '';
        if (p.status) stat = (p.add ? `+${i18n.fmtNum(p.add)}` : '') + (p.add && p.del ? ' ' : '') + (p.del ? `−${i18n.fmtNum(p.del)}` : '');
        else if (p.bytes != null) stat = p.bytes < 1000 ? i18n.fmtUnit(p.bytes, 'byte') : p.bytes < 1e6 ? i18n.fmtUnit(Math.round(p.bytes / 100) / 10, 'kilobyte') : i18n.fmtUnit(Math.round(p.bytes / 1e5) / 10, 'megabyte');
        b.innerHTML = `<span class="gx-w-dot" aria-hidden="true"></span><span class="gx-w-name">${U.esc(p.name)}</span><span class="gx-w-kind">${U.esc(this.kindText(p))}</span><span class="gx-w-stat">${U.esc(stat)}</span>`;
        li.appendChild(b);
        frag.appendChild(li);
      }
      const rocks = s.planets.filter((p) => p.rock).length;
      const rest = s.planets.length - rocks - s.worlds.length;
      if (rest > 0 || rocks > 0) {
        const li = document.createElement('li');
        li.className = 'gx-rest';
        li.textContent = [rest > 0 ? '+' + tr('galaxy.planets', { n: rest }) : '', rocks > 0 ? tr('galaxy.asteroids', { n: rocks }) : ''].filter(Boolean).join(' · ');
        frag.appendChild(li);
      }
      ul.replaceChildren(frag);
    }

    fillStars(list) {
      const geo = this.stars.geometry;
      const pos = geo.attributes.position.array;
      const col = geo.attributes.aColor.array;
      const seed = geo.attributes.aSeed.array;
      const g = this.g;
      const c = new THREE.Color();
      const warm = new THREE.Color(1, 0.95, 0.86);
      let o = 0;
      for (const G of list) {
        const rand = rng(G.seed ^ 0x9e3779b9);
        const base = g.col(G.color);
        const count = Math.round(NEAR_STARS * clamp(0.45 + G.R / 14, 0.45, 1));
        for (let i = 0; i < count; i++, o++) {
          let r = -Math.log(1 - rand() * 0.985) * G.R * 0.34;
          if (r > G.R + 1.5) r = rand() * G.R;
          const arm = rand() < 0.5 ? 0 : Math.PI;
          const spread = (rand() + rand() + rand() - 1.5) * (0.3 + 0.55 * rand());
          const ang = G.theta0 + r / ARM_A + arm + spread;
          const bulge = Math.exp((-r * r) / 3);
          const h = (rand() + rand() - 1) * (0.22 + bulge * 1.3);
          const x = G.c.x + G.u.x * Math.cos(ang) * r + G.v.x * Math.sin(ang) * r + G.w.x * h;
          const y = G.c.y + G.u.y * Math.cos(ang) * r + G.v.y * Math.sin(ang) * r + G.w.y * h;
          const z = G.c.z + G.u.z * Math.cos(ang) * r + G.v.z * Math.sin(ang) * r + G.w.z * h;
          pos[o * 3] = x;
          pos[o * 3 + 1] = y;
          pos[o * 3 + 2] = z;
          c.copy(base).lerp(warm, clamp(0.3 + 0.6 * rand() + bulge * 0.4, 0, 1));
          col[o * 3] = c.r;
          col[o * 3 + 1] = c.g;
          col[o * 3 + 2] = c.b;
          seed[o * 2] = 0.05 + rand() ** 3 * 0.24;
          seed[o * 2 + 1] = rand();
        }
      }
      geo.setDrawRange(0, o);
      for (const [a, n] of [[geo.attributes.position, 3], [geo.attributes.aColor, 3], [geo.attributes.aSeed, 2]]) {
        a.updateRange.offset = 0;
        a.updateRange.count = Math.max(1, o * n);
        a.needsUpdate = true;
      }
    }

    /* ---------- archivos: los planetas ---------- */

    setFocus(G, now = performance.now()) {
      const prev = this.focus;
      this.focus = G;
      if (G?.name !== prev?.name) {
        this.sysPin = null; // en otra galaxia, el panel vuelve a decidir solo
        if (!G) this.sysOpenAt = this.sysCloseAt = 0;
      }
      if (G && G.name !== prev?.name) this.arrive(G, now);
      if (!G) {
        this.dropSystem();
        this.renderCard();
        return;
      }
      this.ensureFiles(G, now);
      const data = this.cache.get(`${G.name}@${G.sha}`);
      const shown = data?.state === 'ok' ? data.data : this.lastData.get(G.name);
      if (!this.sys || this.sys.name !== G.name || (shown && this.sys.data !== shown)) {
        if (shown) this.showSystem(G, shown);
        else this.dropSystem();
      }
      this.renderCard();
    }

    /** Pone a la vista los planetas de una galaxia. Si es la misma (llegaron sus archivos nuevos), sin volver a nacer. */
    showSystem(G, data) {
      const same = this.sys && this.sys.name === G.name;
      if (same) this.sys = null;
      else this.dropSystem();
      this.sys = this.buildSystem(G, data);
      if (same) this.sys.born -= 5000;
      this.dirty = true;
      this.renderWorlds();
      if (!same) this.reframe(G); // la cámara, aparcada en el mirador: ahora que se sabe el tamaño del sistema, que quepa entero
      if (this.arrival?.name === G.name) {
        this.renderArrival(); // llegaron sus archivos: el rótulo suma planetas y asteroides
        if (!same && !this.scanSoon && performance.now() - this.arrival.t0 < 4000 && !this.g.director?.rolling) this.pulseScan(true);
      }
      if (!same && this.sysOpenAt === 0 && this.sysCloseAt > performance.now() && this.sysPin == null && this.roomy()) this.setSysOpen(true); // llegaron tarde: el panel igual se abre
    }

    /** Si hay lugar para que el panel del sistema se abra solo (en un celular taparía la vista: ahí se abre a mano). */
    roomy() {
      return this.g.W >= 560 && this.g.H >= 420;
    }

    ensureFiles(G, now) {
      const load = this.g.opts.loadFiles;
      if (!load) return;
      const key = `${G.name}@${G.sha}`;
      const have = this.cache.get(key);
      if (have && (have.state !== 'error' || now - have.at < RETRY_MS)) return;
      const entry = { state: 'loading', at: now };
      this.cache.set(key, entry);
      if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
      this.renderCard();
      Promise.resolve()
        .then(() => load({ name: G.name, sha: G.sha, isDefault: G.isDefault }))
        .then((data) => {
          entry.state = data ? 'ok' : 'error';
          entry.data = data;
          if (data) this.lastData.set(G.name, data);
        })
        .catch((err) => {
          entry.state = 'error';
          entry.err = err;
          entry.at = performance.now();
        })
        .then(() => {
          if (!this.on || this.focus?.name !== G.name || this.focus.sha !== G.sha) return;
          if (entry.state === 'ok') this.showSystem(G, entry.data);
          this.renderCard();
          this.g.needsRender = true;
        });
    }

    /** Qué archivos entran (con miles, los más cerca de la raíz) y cómo se reparten. Los más grandes
        son planetas, con aire entre ellos para pasar volando; los más chicos, asteroides que giran en
        cinturones, uno por carpeta. */
    buildSystem(G, data) {
      let files = data.files || [];
      const total = files.length;
      if (files.length > MAX_PLANETS) {
        const depth = (p) => (p.match(/\//g) || []).length;
        files = [...files].sort((a, b) => depth(a.path) - depth(b.path) || (a.path < b.path ? -1 : 1)).slice(0, MAX_PLANETS);
      }
      const diff = data.kind === 'diff';
      const planets = files.map((f) => {
        const slash = f.path.lastIndexOf('/');
        const ext = extOf(f.path);
        const changes = (f.add || 0) + (f.del || 0);
        return {
          path: f.path,
          name: f.path.slice(slash + 1),
          dir: slash > 0 ? f.path.slice(0, slash) : '',
          top: f.path.includes('/') ? f.path.slice(0, f.path.indexOf('/')) : '',
          ext,
          hex: extColor(ext),
          status: diff ? f.status || 'modified' : null,
          add: f.add || 0,
          del: f.del || 0,
          bytes: diff ? null : f.size ?? null,
          from: f.from || null,
          url: f.url || null,
          weight: diff ? changes : f.size || 0,
          dr: 0,
          dh: 0,
          pos: new THREE.Vector3(),
          col: new THREE.Color(),
          glow: new THREE.Color(),
        };
      });
      // los más chicos son asteroides (con pocos archivos, todos planetas)
      const n = planets.length;
      const rocks = n > SOLO_ALL ? Math.max(Math.round(n * ROCK_SHARE), n - MAX_BIG) : 0;
      [...planets].sort((a, b) => a.weight - b.weight || (a.path < b.path ? -1 : 1)).slice(0, rocks).forEach((p) => (p.rock = true));
      for (const p of planets) {
        const w = Math.log2(1 + (diff ? p.weight : p.weight / 200));
        p.size = p.rock ? clamp(0.06 + 0.022 * w, 0.06, 0.17) : diff ? clamp(0.3 + 0.1 * w, 0.3, 0.85) : clamp(0.28 + 0.07 * w, 0.28, 0.8);
      }
      planets.sort((a, b) => (a.top === b.top ? (a.path < b.path ? -1 : 1) : a.top === '' ? -1 : b.top === '' ? 1 : a.top < b.top ? -1 : 1));

      const rand = rng(G.seed ^ 0x51ed270b);
      const rings = [];
      const labels = []; // nombre de cada carpeta, junto a su primer planeta (gira con él)
      let rad = 3.2; // fuera del núcleo, con aire
      const big = planets.filter((p) => !p.rock);
      const small = planets.filter((p) => p.rock);
      const belt = (list) => {
        // un cinturón de asteroides: ancho según cuántos son, cada uno con su desvío, su eje y su giro
        if (!list.length) return;
        const w = Math.min(4.5, 1 + Math.sqrt(list.length) * 0.38);
        rad += 0.6;
        const ring = { r: rad + w / 2, list, belt: true };
        for (const p of list) {
          p.a0 = rand() * Math.PI * 2;
          p.dr = (rand() + rand() - 1) * w * 0.5;
          p.dh = (rand() + rand() - 1) * w * 0.16;
          p.axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
          p.spin = 0.4 + rand() * 1.4;
          p.stretch = new THREE.Vector3(0.7 + rand() * 0.6, 0.6 + rand() * 0.5, 0.8 + rand() * 0.4);
          p.ring = ring;
        }
        rings.push(ring);
        rad += w + 1.4;
      };
      // con muchos asteroides, dos cinturones: uno entre las primeras órbitas y otro en el borde
      const inner = small.length > 60 ? small.filter((_, i) => i % 2 === 0) : small;
      const outer = small.length > 60 ? small.filter((_, i) => i % 2 === 1) : [];
      if (big.length <= SOLO_ORBITS) {
        // pocos planetas: cada uno en su órbita, como un sistema solar, con los asteroides a mitad de camino
        big.forEach((p, i) => {
          if (i === Math.ceil(big.length / 2)) belt(inner);
          rad += p.size + 0.9;
          rings.push({ r: rad, list: [p], phase: rand() * Math.PI * 2 });
          rad += p.size + 0.9;
        });
        if (big.length < 2) belt(inner);
      } else {
        // muchos: las carpetas, una tras otra, llenan órbitas con aire entre planetas
        let j = 0;
        let n = 0;
        while (j < big.length) {
          const ring = { r: rad, list: [], phase: rand() * Math.PI * 2, used: 0, max: 0 };
          const cap = Math.PI * 2 * rad;
          while (j < big.length) {
            const need = big[j].size * 2 + PLANET_GAP;
            if (ring.list.length && ring.used + need > cap) break;
            ring.list.push(big[j++]);
            ring.used += need;
            ring.max = Math.max(ring.max, ring.list[ring.list.length - 1].size);
          }
          rings.push(ring);
          rad += ring.max * 2 + 2.2;
          if (++n === 1) belt(inner); // el cinturón principal, tras la primera órbita
        }
      }
      belt(outer);
      for (const ring of rings) {
        ring.omega = 0.55 / Math.pow(ring.r, 1.5); // más lento cuanto más lejos
        if (ring.belt) continue;
        let acc = 0;
        const used = ring.list.reduce((s, p) => s + p.size * 2 + PLANET_GAP, 0);
        for (const p of ring.list) {
          const need = p.size * 2 + PLANET_GAP;
          p.a0 = ring.phase + (Math.PI * 2 * (acc + need / 2)) / Math.max(used, 1e-3);
          acc += need;
          p.ring = ring;
        }
      }
      // la carpeta de cada tramo, junto a su primer planeta (las de solo asteroides no llevan rótulo)
      let last = null;
      for (const p of big) {
        if (p.top !== last && p.top) labels.push({ p, text: p.top + '/' });
        last = p.top;
      }
      planets.forEach((p, i) => {
        p.i = i;
        p.seed = h01(p.path);
        if (p.rock) return;
        // algunos llevan anillos: un tercio de los gigantes gaseosos y uno que otro más
        const gas = (p.seed * 7.31) % 1 < 0.36;
        if ((gas && (p.seed * 3.7) % 1 < 0.33) || (p.seed * 5.1) % 1 < 0.04) {
          p.ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + ((p.seed * 13.7) % 1 - 0.5) * 1.1, ((p.seed * 29.3) % 1) * Math.PI * 2, 0));
        }
      });
      // los mundos principales: los planetas más grandes, con marcador en pantalla y en el panel del sistema
      const worlds = [...big].sort((a, b) => b.weight - a.weight || (a.path < b.path ? -1 : 1)).slice(0, MAX_WORLDS);
      for (const p of worlds) p.world = true;
      const sys = { name: G.name, sha: G.sha, G, data, planets, rings, labels, worlds, total, born: performance.now(), dying: 0, outer: rad };
      for (const p of planets) p.sys = sys;
      this.outerOf.set(G.name, rad);
      this.paintSystem(sys);
      this.writeOrbits(sys);
      return sys;
    }

    /** Cerca de los planetas la nave va más despacio, para pasar entre ellos con calma (Mayús sigue acelerando). */
    nearFactor(pos) {
      const s = this.sys;
      if (!s || !this.on) return 1;
      const dc = pos.distanceTo(s.G.c);
      if (dc > s.outer + 10) return 1;
      let near = Infinity;
      for (const p of s.planets) {
        if (p.rock) continue;
        const d = pos.distanceTo(p.pos) - p.size;
        if (d < near) near = d;
      }
      const inside = clamp((dc - s.outer) / 10, 0, 1); // 0 dentro del sistema, 1 fuera
      return Math.max(0.15, Math.min(0.45 + 0.55 * inside, near / 5));
    }

    /** Los planetas y los asteroides son sólidos: la nave los roza, no los atraviesa. */
    collide(pos, vel) {
      const s = this.sys;
      if (!s || !this.on) return;
      const n = this.v;
      for (const p of s.planets) {
        const min = p.size * (p.k ?? 1) + (p.rock ? 0.3 : 0.5);
        n.subVectors(pos, p.pos);
        const d = n.length();
        if (d >= min || d < 1e-6) continue;
        n.multiplyScalar(1 / d);
        pos.copy(p.pos).addScaledVector(n, min);
        const vn = vel.dot(n);
        if (vn < 0) vel.addScaledVector(n, -vn);
      }
    }

    paintSystem(sys) {
      const g = this.g;
      this.dirty = true;
      for (const p of sys.planets) {
        p.col.set(p.hex);
        if (p.status === 'removed') p.col.lerp(g.col('ghost'), 0.7); // un archivo borrado: un planeta apagado
        p.glow.copy(p.status === 'added' ? g.sevCol.good : p.status === 'removed' ? g.sevCol.bad : p.col).lerp(g.white, 0.2);
      }
    }

    /** Base del plano de las órbitas: el de la galaxia, girado sobre su eje u. */
    basis(G) {
      const t = PLANET_TILT;
      const pu = G.u;
      const pv = this.w.copy(G.v).multiplyScalar(Math.cos(t)).addScaledVector(G.w, Math.sin(t));
      const pn = (this.pn || (this.pn = new THREE.Vector3())).copy(G.w).multiplyScalar(Math.cos(t)).addScaledVector(G.v, -Math.sin(t));
      return { pu, pv, pn };
    }

    writeOrbits(sys) {
      const { pu, pv } = this.basis(sys.G);
      const SEG = 96;
      const rings = sys.rings.filter((r) => !r.belt); // los cinturones se ven solos
      const pos = new Float32Array(rings.length * SEG * 6);
      let o = 0;
      const c = sys.G.c;
      for (const ring of rings) {
        for (let i = 0; i < SEG; i++) {
          for (const j of [i, i + 1]) {
            const a = (j / SEG) * Math.PI * 2;
            pos[o++] = c.x + (pu.x * Math.cos(a) + pv.x * Math.sin(a)) * ring.r;
            pos[o++] = c.y + (pu.y * Math.cos(a) + pv.y * Math.sin(a)) * ring.r;
            pos[o++] = c.z + (pu.z * Math.cos(a) + pv.z * Math.sin(a)) * ring.r;
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.orbits.geometry.dispose();
      this.orbits.geometry = geo;
      this.orbits.visible = true;
    }

    dropSystem(now) {
      if (this.sys) {
        if (now === true || !this.g.motion) this.old = null;
        else {
          this.old = this.sys;
          this.old.dying = performance.now();
        }
        if (this.g.tipFile && this.g.tipFile.sys === this.sys) this.g.unpin();
      }
      this.sys = null;
      this.dirty = true;
      if (!this.old) this.orbits.visible = false;
      this.hideLabels();
      this.renderWorlds();
    }

    /** Mueve los planetas por sus órbitas (con movimiento) y los escribe en su lote. */
    writePlanets(now) {
      const g = this.g;
      const list = [this.old, this.sys].filter(Boolean);
      let n = 0;
      for (const s of list) n += s.planets.length;
      this.iPlanets.begin(n);
      this.iRocks.begin(n);
      this.iRings.begin(n);
      this.glows.begin(n);
      const t = g.u.time.value;
      const scanR = this.scanRadius(now);
      const from = this.scanning?.from;
      for (const s of list) {
        const { pu, pv, pn } = this.basis(s.G);
        const c = s.G.c;
        const out = s.dying ? 1 - clamp((now - s.dying) / 300, 0, 1) : 1;
        for (const p of s.planets) {
          const a = p.a0 + (g.motion ? p.ring.omega * t : 0);
          const r = p.ring.r + p.dr;
          const ca = Math.cos(a) * r;
          const sa = Math.sin(a) * r;
          p.pos.set(c.x + pu.x * ca + pv.x * sa + pn.x * p.dh, c.y + pu.y * ca + pv.y * sa + pn.y * p.dh, c.z + pu.z * ca + pv.z * sa + pn.z * p.dh);
          // aparecen de adentro hacia afuera
          const grow = g.motion ? clamp((now - s.born - p.ring.r * 40) / 650, 0, 1) : 1;
          const k = (grow < 1 ? Math.max(0.001, easeOutBack(grow)) : 1) * Math.max(0.001, out);
          p.k = k;
          const hov = this.hover === p ? (p.rock ? 1.6 : 1.25) : 1;
          if (p.rock) {
            // los asteroides dan tumbos, cada uno sobre su eje
            this.rq.setFromAxisAngle(p.axis, g.motion ? t * p.spin : p.spin);
            this.iRocks.put(p.pos, p.size * k * hov, p.col, p.seed, this.rq, p.stretch);
          } else this.iPlanets.put(p.pos, p.size * k * hov, p.col, p.seed);
          if (p.ringQ) this.iRings.put(p.pos, p.size * k * hov, p.col, p.seed, p.ringQ);
          let ga = p.status === 'added' || p.status === 'removed' ? 0.5 : p.rock ? 0 : 0.14;
          // el escáner: destella cuando la onda pasa por el planeta
          if (scanR != null) {
            const off = scanR - from.distanceTo(p.pos);
            if (off > 0 && off < 8) ga += 0.9 * (1 - off / 8);
          }
          this.glows.push(p.pos.x, p.pos.y, p.pos.z, p.glow, Math.min(1, ga) * k, p.size * 3.1 * k * hov, 0);
        }
      }
      this.iPlanets.end();
      this.iRocks.end();
      this.iRings.end();
      this.glows.end();
      if (!this.sys && !this.old) this.orbits.visible = false;
      this.orbits.material.opacity = this.sys ? 0.16 * clamp((now - this.sys.born) / 600, 0, 1) : 0.16 * (this.old ? 1 - clamp((now - this.old.dying) / 300, 0, 1) : 0);
    }

    /** Planeta bajo el rayo: el más cercano. Devuelve { p, t } o null. */
    pick(ray, far) {
      const s = this.sys;
      if (!s) return null;
      let best = null;
      let bestT = Infinity;
      for (const p of s.planets) {
        const r = p.size * (p.k ?? 1) + (p.rock ? 0.2 : 0.12);
        if (ray.distanceSqToPoint(p.pos) > r * r) continue;
        const t = this.v.copy(p.pos).sub(ray.origin).dot(ray.direction);
        if (t > 0 && t < bestT && t < far) (bestT = t), (best = p);
      }
      return best ? { p: best, t: bestT } : null;
    }

    setHover(p) {
      if (this.hover === p) return;
      this.hover = p;
      this.dirty = true;
      this.g.needsRender = true;
    }

    /* ---------- etiquetas y rótulo ---------- */

    hideLabels() {
      for (const el of this.fileLabels) if (el.style.display !== 'none') el.style.display = 'none';
      for (const el of this.dirLabels) if (el.style.display !== 'none') el.style.display = 'none';
      for (const el of this.worldLabels) if (el.style.display !== 'none') el.style.display = 'none';
    }

    /** Nombres de los planetas más cercanos que no se pisan, y de las carpetas de cada cinturón. */
    placeLabels() {
      const g = this.g;
      const s = this.sys;
      this.placeLock();
      if (!s || !this.on) return this.hideLabels();
      const cam = g.camera.position;
      const boxes = [];
      const hit = (b) => boxes.some((o) => b.x < o.x + o.w + 4 && o.x < b.x + b.w + 4 && b.y < o.y + o.h + 2 && o.y < b.y + b.h + 2);
      const { measure, SMALL_FONT } = GB.graphShared;
      const focal = g.H / (2 * Math.tan((g.camera.fov * Math.PI) / 360)); // píxeles por unidad a distancia 1

      // los mundos principales llevan su marcador (nombre, clase y distancia) desde cualquier punto del sistema
      const marked = new Set();
      const wreach = s.outer * 2.6 + 40;
      const wc = [];
      for (const p of s.worlds) {
        if ((p.k ?? 0) < 0.6) continue;
        const d = cam.distanceTo(p.pos);
        if (d > wreach) continue;
        const q = g.project(p.pos);
        if (q && q.x > -20 && q.x < g.W + 20 && q.y > 0 && q.y < g.H + 40) wc.push({ p, d, x: q.x, y: q.y });
      }
      wc.sort((a, b) => a.d - b.d);
      let m = 0;
      for (const c of wc) {
        const p = c.p;
        const name = U.truncate(p.name, 26);
        const sub = `${this.kindText(p)} · ${g.world ? g.world.fmtDist(Math.max(0, c.d - p.size)) : Math.round(c.d)}`;
        const w = Math.ceil(Math.max(measure(name, WORLD_FONT), measure(sub, WORLD_SUB_FONT) * 1.06) + 18);
        const lift = Math.min(70, (p.size * (p.k ?? 1) * focal) / Math.max(1, c.d)) + 6 + 14; // sobre el planeta, con la guía
        const b = { x: c.x - w / 2, y: c.y - lift - 44, w, h: 44 + 14 };
        if (hit(b)) continue;
        boxes.push(b);
        marked.add(p);
        const el = this.worldLabels[m] || this.makeLabel(this.worldLabels, 'g3-world');
        el.__i = p.i;
        if (el.__t !== name) {
          el.__t = name;
          el.firstChild.textContent = name;
          el.title = p.path;
        }
        if (el.__s !== sub) {
          el.__s = sub;
          el.lastChild.textContent = sub;
        }
        el.style.setProperty('--c', p.hex);
        el.style.display = '';
        el.style.opacity = clamp(1.3 - c.d / wreach, 0.5, 1).toFixed(2);
        el.style.transform = `translate(${Math.round(c.x)}px,${Math.round(c.y - lift)}px) translate(-50%,-100%)`;
        m++;
      }
      for (let i = m; i < this.worldLabels.length; i++) if (this.worldLabels[i].style.display !== 'none') this.worldLabels[i].style.display = 'none';

      const cand = [];
      // con el escáner, se ven los nombres de todos los planetas que alcanzó la onda
      const scanR = this.scanRadius(performance.now());
      const from = this.scanning?.from;
      const reach = scanR != null ? SCAN_RANGE : 22;
      for (const p of s.planets) {
        if ((p.k ?? 0) < 0.6 || marked.has(p)) continue;
        const d = cam.distanceTo(p.pos);
        if (d > (scanR != null && from.distanceTo(p.pos) < scanR ? reach : p.rock ? 9 : 22)) continue;
        const q = g.project(p.pos);
        if (q && q.x > 0 && q.x < g.W && q.y > 0 && q.y < g.H) cand.push({ p, d, x: q.x, y: q.y });
      }
      cand.sort((a, b) => a.d - b.d);
      let n = 0;
      const most = scanR != null ? MAX_FILE_LABELS * 3 : MAX_FILE_LABELS;
      for (const c of cand) {
        if (n >= most) break;
        const name = U.truncate(c.p.name, 28);
        const off = 6 + (c.p.size * focal) / Math.max(1, c.d); // al costado del planeta
        const b = { x: c.x + Math.min(off, 60), y: c.y - 9, w: Math.ceil(measure(name, SMALL_FONT) + 18), h: 18 };
        if (hit(b)) continue;
        boxes.push(b);
        const el = this.fileLabels[n] || this.makeLabel(this.fileLabels, 'g3-file');
        el.__i = c.p.i;
        if (el.__t !== name) {
          el.__t = name;
          el.textContent = name;
          el.title = c.p.path;
        }
        el.style.setProperty('--c', c.p.hex);
        el.style.display = '';
        el.style.opacity = (scanR != null ? clamp(1.3 - c.d / reach, 0.55, 1) : clamp(1.3 - c.d / 22, 0.35, 1)).toFixed(2);
        el.style.transform = `translate(${Math.round(b.x)}px,${Math.round(b.y)}px)`;
        n++;
      }
      for (let i = n; i < this.fileLabels.length; i++) if (this.fileLabels[i].style.display !== 'none') this.fileLabels[i].style.display = 'none';

      // carpetas: su nombre por fuera de su primer planeta, que lo lleva consigo en la órbita
      m = 0;
      for (const { p, text } of s.labels) {
        if (m >= MAX_DIR_LABELS || (p.k ?? 0) < 0.6) continue;
        const at = this.v.subVectors(p.pos, s.G.c).setLength(p.ring.r + p.size + 1.3).add(s.G.c);
        const d = cam.distanceTo(at);
        if (d > 40) continue;
        const q = g.project(at);
        if (!q || q.x < 0 || q.x > g.W || q.y < 0 || q.y > g.H) continue;
        const b = { x: q.x - 20, y: q.y - 8, w: Math.ceil(measure(text, SMALL_FONT) + 12), h: 16 };
        if (hit(b)) continue;
        boxes.push(b);
        const el = this.dirLabels[m] || this.makeLabel(this.dirLabels, 'g3-dir');
        if (el.__t !== text) {
          el.__t = text;
          el.textContent = text;
        }
        el.style.display = '';
        el.style.opacity = clamp(1.4 - d / 40, 0.3, 0.9).toFixed(2);
        el.style.transform = `translate(${Math.round(b.x)}px,${Math.round(b.y)}px)`;
        m++;
      }
      for (let i = m; i < this.dirLabels.length; i++) if (this.dirLabels[i].style.display !== 'none') this.dirLabels[i].style.display = 'none';
    }

    makeLabel(pool, cls) {
      const button = cls !== 'g3-dir';
      const el = document.createElement(button ? 'button' : 'span');
      if (button) el.type = 'button';
      el.className = cls;
      if (cls === 'g3-world') el.innerHTML = '<span class="g3-w-name"></span><span class="g3-w-sub"></span>';
      el.style.display = 'none';
      this.g.labelLayer.appendChild(el);
      pool.push(el);
      return el;
    }

    /** Rótulo de la galaxia en la que se está: su nombre y qué archivos se ven (o que están llegando). */
    renderCard() {
      const G = this.focus;
      const card = this.card;
      if (!G || !this.on || !this.g.opts.loadFiles) {
        card.hidden = true;
        return;
      }
      const entry = this.cache.get(`${G.name}@${G.sha}`);
      const data = entry?.state === 'ok' ? entry.data : this.lastData.get(G.name);
      let sub = '';
      if (entry?.state === 'loading' && !data) sub = tr('galaxy.loading');
      else if (entry?.state === 'error' && !data) sub = tr('galaxy.error') + (entry.err?.msg ? ` · ${i18n.text(entry.err.msg)}` : '');
      else if (data) {
        const n = (data.files || []).length;
        if (data.kind === 'diff') sub = n ? tr('galaxy.changed', { n, base: data.base || '' }) : tr('galaxy.none', { base: data.base || '' });
        else sub = tr('galaxy.files', { n });
        if (n > MAX_PLANETS) sub += ` · ${tr('galaxy.some', { shown: i18n.fmtNum(MAX_PLANETS), total: i18n.fmtNum(n) })}`;
        if (data.truncated) sub += ' +';
      }
      card.hidden = false;
      card.className = `gx-card ${G.color}${this.sysOpen ? ' open' : ''}`;
      this.el.head.title = tr('galaxy.system');
      if (this.el.name.textContent !== G.name) this.el.name.textContent = G.name;
      if (this.el.sub.textContent !== sub) this.el.sub.textContent = sub;
    }

    relocalize() {
      this.renderCard();
      this.renderWorlds();
      this.el.chargeK.textContent = tr('galaxy.charging');
      this.el.lockHintText.textContent = tr('galaxy.jump');
      if (this.arrival) {
        this.el.aKick.textContent = tr(this.arrival.found ? 'galaxy.discovered' : 'galaxy.entering');
        this.renderArrival();
      }
    }

    /** Detalle de un archivo (el planeta) para la ficha. */
    tipHTML(p, pin) {
      const meta = [U.esc(this.kindText(p))];
      if (p.status) {
        const lines = (p.add ? ` <span class="fs-add">+${i18n.fmtNum(p.add)}</span>` : '') + (p.del ? ` <span class="fs-del">−${i18n.fmtNum(p.del)}</span>` : '');
        meta.push(`<span class="fs fs-${U.esc(p.status)}">${U.esc(tr('file.' + (['added', 'removed', 'renamed', 'copied'].includes(p.status) ? p.status : 'modified')))}</span>${lines}`);
      }
      if (p.bytes != null) meta.push(U.esc(p.bytes < 1000 ? i18n.fmtUnit(p.bytes, 'byte') : p.bytes < 1e6 ? i18n.fmtUnit(Math.round(p.bytes / 100) / 10, 'kilobyte') : i18n.fmtUnit(Math.round(p.bytes / 1e5) / 10, 'megabyte')));
      return `
        <div class="tip-head"><span class="tip-fdot" style="--c:${U.esc(p.hex)}" aria-hidden="true"></span><span class="tip-author tip-file">${U.esc(p.name)}</span></div>
        ${p.dir ? `<p class="tip-meta"><code>${U.esc(p.dir)}/</code></p>` : ''}
        ${meta.length ? `<p class="tip-meta">${meta.join(' · ')}</p>` : ''}
        ${p.from ? `<p class="tip-extra"><span>${i18n.html('file.renamedFrom', { path: p.from })}</span></p>` : ''}
        ${pin ? `<div class="tip-actions"><button type="button" class="tip-ride gx-visit">${U.esc(tr('galaxy.visit'))}</button>${p.url ? `<a class="tip-link" href="${U.esc(p.url)}" target="_blank" rel="noopener">${U.esc(tr('file.open'))} ↗</a>` : ''}</div>` : ''}`;
    }

    clear() {
      this.endHyper();
      this.setAim(null, 0);
      this.slots.clear();
      this.gals = new Map();
      this.posOf = new Map();
      this.galOf = new Map();
      this.focus = null;
      this.parked = null;
      this.dropSystem(true);
      this.renderCard();
      this.near = [];
      this.nearKey = '';
      this.stars.geometry.setDrawRange(0, 0);
      if (this.discCap) this.discs.geometry.instanceCount = 0;
    }

    /** Cambió de repositorio: lo que se sabía de sus archivos ya no sirve. */
    reset() {
      this.cache.clear();
      this.lastData.clear();
      this.outerOf.clear();
      this.clear();
    }
  }

  GB.Galaxy = Galaxy;
})(window.GB);
