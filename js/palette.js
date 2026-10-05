/* GraphBranch — paleta de colores de las ramas, la más grande que cabe en pantalla.
   Los colores 1..8 son los validados a mano que define el CSS (--s1..--s8). Del 9 en adelante
   salen de un fondo de miles de candidatos repartidos por OKLCH (matiz, luminosidad y croma, con
   la secuencia R3 de baja discrepancia), ordenados "del más lejano": cada color nuevo es el que
   más se aleja de todos los ya entregados, incluidos los 8 de base. Así cualquier tramo inicial
   (3 ramas o 300) queda lo más repartido posible y dos ramas seguidas nunca se parecen.
   Cada tema tiene su rango de luminosidad, para que se lean sobre fondo claro y oscuro. */
(function (GB) {
  'use strict';

  const BASE = 8;
  const POOL = 8192; // candidatos: el total de colores es BASE + POOL
  const PLASTIC = 1.2207440846057596; // raíz real de x³ = x + 1: constante de la secuencia R3 en 3D
  const STEP = [1 / PLASTIC, 1 / PLASTIC ** 2, 1 / PLASTIC ** 3];
  const LIGHTNESS = { light: [0.5, 0.74], dark: [0.6, 0.8] };
  const CHROMA = [0.1, 0.19];
  // los 8 de base (mismos valores que --s1..--s8 del CSS): puntos de partida del reparto
  const BASE_COLORS = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };

  const frac = (x) => x - Math.floor(x);
  const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

  /** OKLCH -> sRGB (canales 0..1) o null si queda fuera del gamut. */
  function toRgb(L, C, hue) {
    const a = C * Math.cos(hue);
    const b = C * Math.sin(hue);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? rgb.map((v) => gamma(Math.min(1, Math.max(0, v)))) : null;
  }

  /** Mayor croma <= C que cabe en sRGB con esa luminosidad y ese matiz (sin tocar matiz ni luminosidad). */
  function fitChroma(L, C, hue) {
    if (toRgb(L, C, hue)) return C;
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (toRgb(L, mid, hue)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  const hexOf = (L, C, hue) =>
    '#' + toRgb(L, fitChroma(L, C, hue), hue).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

  /** Hex -> OKLab, para medir distancias entre colores. */
  function hexToLab(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }

  /* candidatos (tH, tL, tC en 0..1), su posición en OKLab en cada tema y su distancia al color
     más cercano de los ya entregados (al cuadrado), la peor de los dos temas; -1 = ya entregado */
  let pool = null;
  const order = []; // orden de entrega: order[k] = candidato del color BASE + 1 + k

  /** OKLab del candidato con parámetros (tH, tL, tC) en un tema. */
  function labAt(theme, tH, tL, tC) {
    const [l0, l1] = LIGHTNESS[theme];
    const L = l0 + (l1 - l0) * tL;
    const hue = tH * 2 * Math.PI;
    const C = fitChroma(L, CHROMA[0] + (CHROMA[1] - CHROMA[0]) * tC, hue);
    return [L, C * Math.cos(hue), C * Math.sin(hue)];
  }

  function buildPool() {
    pool = { t: new Float64Array(POOL * 3), light: new Float64Array(POOL * 3), dark: new Float64Array(POOL * 3), near: new Float64Array(POOL).fill(Infinity) };
    for (let k = 0; k < POOL; k++) {
      const t = [frac(0.5 + k * STEP[0]), frac(0.5 + k * STEP[1]), frac(0.5 + k * STEP[2])];
      pool.t.set(t, k * 3);
      pool.light.set(labAt('light', ...t), k * 3);
      pool.dark.set(labAt('dark', ...t), k * 3);
    }
    for (let i = 0; i < BASE; i++) approach(hexToLab(BASE_COLORS.light[i]), hexToLab(BASE_COLORS.dark[i]));
  }

  // distancia al cuadrado entre el candidato k de `arr` y `lab` (basta para comparar y evita la raíz)
  const gap = (arr, k, lab) => {
    const dl = arr[k * 3] - lab[0];
    const da = arr[k * 3 + 1] - lab[1];
    const db = arr[k * 3 + 2] - lab[2];
    return dl * dl + da * da + db * db;
  };

  /** Acerca a un color (su OKLab en cada tema) la distancia al más cercano de cada candidato libre. */
  function approach(light, dark) {
    const { near } = pool;
    for (let k = 0; k < POOL; k++) {
      if (near[k] < 0) continue;
      const d = Math.min(gap(pool.light, k, light), gap(pool.dark, k, dark));
      if (d < near[k]) near[k] = d;
    }
  }

  /** Entrega candidatos "del más lejano" hasta tener `count`. */
  function deliver(count) {
    if (!pool) buildPool();
    while (order.length < count) {
      let best = 0;
      for (let k = 1; k < POOL; k++) if (pool.near[k] > pool.near[best]) best = k;
      pool.near[best] = -1;
      order.push(best);
      approach(pool.light.subarray(best * 3, best * 3 + 3), pool.dark.subarray(best * 3, best * 3 + 3));
    }
  }

  const cache = { light: new Map(), dark: new Map() };
  let made = BASE; // clases CSS ya generadas (1..8 están en styles.css)
  let styleEl = null;

  const P = {
    base: BASE,

    /** Cuántos colores distintos hay (pasado ese número se repiten desde el primero generado). */
    size: BASE + POOL,

    /** Color n (>= 9) en hex para el tema claro u oscuro. Es siempre el mismo para el mismo n. */
    hex(n, dark = false) {
      const theme = dark ? 'dark' : 'light';
      let hex = cache[theme].get(n);
      if (!hex) {
        const k = (n - BASE - 1) % POOL;
        deliver(k + 1);
        const [tH, tL, tC] = pool.t.subarray(order[k] * 3, order[k] * 3 + 3);
        const [l0, l1] = LIGHTNESS[theme];
        hex = hexOf(l0 + (l1 - l0) * tL, CHROMA[0] + (CHROMA[1] - CHROMA[0]) * tC, tH * 2 * Math.PI);
        cache[theme].set(n, hex);
      }
      return hex;
    },

    /** Genera las clases CSS .c9..cN que falten (la hoja crece solo con los colores que se usan). */
    ensure(n) {
      if (n <= made || typeof document === 'undefined') return;
      let css = '';
      for (let k = made + 1; k <= n; k++) {
        css += `.c${k}{--c:${P.hex(k)}}`;
        css += `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .c${k}{--c:${P.hex(k, true)}}}`;
        css += `:root[data-theme="dark"] .c${k}{--c:${P.hex(k, true)}}`;
      }
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'gb-palette';
        document.head.appendChild(styleEl);
      }
      styleEl.appendChild(document.createTextNode(css));
      made = n;
    },
  };

  GB.palette = P;
})(window.GB);
