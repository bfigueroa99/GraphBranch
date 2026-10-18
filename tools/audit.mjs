#!/usr/bin/env node
/* Auditoría exploratoria de la web: la abre en Chromium sin ventana, como el smoke, pero en vez de
   recorrer funciones busca problemas en cualquier parte de la página: errores de ejecución,
   violaciones del CSP, peticiones a otros sitios, desbordes, controles sin nombre o chicos, foco
   escondido o sin marca, ids repetidos, texto sin traducir o cortado, animaciones que no respetan el
   movimiento reducido, consultas de más a la API de GitHub y cuánto tarda y pesa la página. Cada
   hallazgo sale con su prioridad, el subtipo de mantenimiento que lo arregla y cómo reproducirlo.
   Nunca sale a internet: lo que no es del servidor local se corta (y se anota) o lo responde una API
   de GitHub simulada. Sin dependencias nuevas: el Playwright del proyecto y e2e/serve.mjs.

     node tools/audit.mjs                     auditoría completa (unos 2 min): hallazgos y medidas
     node tools/audit.mjs --langs             además los 40 idiomas en pantalla de celular
     node tools/audit.mjs --puerta            lo estable, contra tools/audit-base.json (lo corre npm run check)
     node tools/audit.mjs --base              reescribe tools/audit-base.json con lo que ve --puerta (dos corridas)
     node tools/audit.mjs --json <ruta>       además guarda el informe entero en JSON
     node tools/audit.mjs --comparar <ruta>   compara las medidas con las de un informe JSON anterior
     node tools/audit.mjs --repetir <n>       las medidas de rendimiento, la mejor de n corridas

   Salida: 0 bien (la completa termina siempre en 0) · 1 hallazgos nuevos en dos corridas seguidas de
   --puerta · 2 no se pudo auditar (sin Playwright o sin Chromium). */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = join(root, 'tools', 'audit-base.json');

const USO = `node tools/audit.mjs                     auditoría completa: hallazgos y medidas
node tools/audit.mjs --langs             además los 40 idiomas en pantalla de celular
node tools/audit.mjs --puerta            lo estable, contra tools/audit-base.json: sale 1 si un hallazgo
                                         nuevo aparece en dos corridas seguidas (lo corre npm run check)
node tools/audit.mjs --base              reescribe tools/audit-base.json con lo que ve --puerta
node tools/audit.mjs --json <ruta>       además guarda el informe entero en JSON
node tools/audit.mjs --comparar <ruta>   compara las medidas con las de un informe JSON anterior
node tools/audit.mjs --repetir <n>       las medidas de rendimiento, la mejor de n corridas`;

/** Los tipos de hallazgo: prioridad, el subtipo de mantenimiento que lo arregla, si entra en la puerta
    (los estables: no dependen del momento en que se mira) y qué es. `loop.mjs --check` (R11) exige que
    cada tipo de la base tenga un pendiente en Mantenimiento que lo cite como `audit:<tipo>`. */
export const TIPOS = {
  error: { prioridad: 'Alta', subtipo: 'Errores', puerta: true, que: 'excepción o error en la consola' },
  csp: { prioridad: 'Alta', subtipo: 'Seguridad', puerta: true, que: 'el CSP bloqueó algo: una función rota o algo que no debería cargar' },
  externa: { prioridad: 'Alta', subtipo: 'Seguridad', puerta: true, que: 'petición a otro sitio sin una función que la necesite' },
  trampa: { prioridad: 'Alta', subtipo: 'Accesibilidad', puerta: true, que: 'trampa de teclado: Tab no sale de un par de elementos' },
  desborde: { prioridad: 'Media', subtipo: 'Errores', puerta: true, que: 'la página es más ancha que la pantalla' },
  'sin-nombre': { prioridad: 'Media', subtipo: 'Accesibilidad', puerta: true, que: 'control sin nombre accesible' },
  'id-duplicado': { prioridad: 'Media', subtipo: 'Accesibilidad', puerta: true, que: 'id repetido (rompe aria-labelledby, label for y los anclajes)' },
  'foco-oculto': { prioridad: 'Media', subtipo: 'Accesibilidad', puerta: true, que: 'elemento enfocable dentro de aria-hidden' },
  'foco-invisible': { prioridad: 'Media', subtipo: 'Accesibilidad', puerta: true, que: 'Tab lleva el foco a algo que no se ve' },
  'dialogo-foco': { prioridad: 'Media', subtipo: 'Accesibilidad', puerta: true, que: 'el diálogo no recibe el foco o no lo devuelve al cerrarse' },
  'sin-traducir': { prioridad: 'Media', subtipo: 'Errores', puerta: true, que: 'texto sin traducir o a medio armar ({x}, undefined, NaN, una clave)' },
  'dir-rtl': { prioridad: 'Media', subtipo: 'Errores', puerta: true, que: 'idioma de derecha a izquierda sin dir=rtl' },
  cuota: { prioridad: 'Media', subtipo: 'Rendimiento', puerta: true, que: 'más consultas a la API de GitHub que las de la base al abrir un repo sin token' },
  'objetivo-chico': { prioridad: 'Baja', subtipo: 'Accesibilidad', puerta: true, que: 'control de menos de 24×24 px (WCAG 2.5.8)' },
  borde: { prioridad: 'Baja', subtipo: 'Errores', puerta: false, que: 'texto o control cortado por el borde de la pantalla' },
  'etiquetas-pisadas': { prioridad: 'Baja', subtipo: 'Errores', puerta: false, que: 'dos etiquetas de rama del 3D, las dos nítidas, se pisan entre sí' },
  'texto-cortado': { prioridad: 'Baja', subtipo: 'Errores', puerta: false, que: 'texto cortado sin puntos suspensivos' },
  'sin-indicador': { prioridad: 'Baja', subtipo: 'Accesibilidad', puerta: false, que: 'el foco del teclado no cambia nada en pantalla' },
  'animacion-infinita': { prioridad: 'Baja', subtipo: 'Accesibilidad', puerta: false, que: 'animación sin fin con movimiento reducido' },
  rendimiento: { prioridad: 'Baja', subtipo: 'Rendimiento', puerta: false, que: 'medida fuera de su presupuesto' },
};

/** Presupuestos de las medidas en un Chromium sin GPU (SwiftShader), como el de las sesiones del loop.
    Medido el 2026-10-13 sobre f7749bd: carga 2,9 s, 3 tareas largas (2,3 s), 1.113 nodos, 4,3 cuadros
    por segundo en 3D y 38 en 2D. Con margen para no saltar por ruido: se pasan si algo se rompió. */
export const PRESUPUESTO = { cargaMs: 6000, tareasLargasMs: 4000, nodosDOM: 4000, heapMB: 150, fps3d: 2, fps2d: 10 };

/** Consultas de más que la puerta tolera sobre la base: según si la historia de las otras ramas llega
    antes o después de que termine la ventana, abrir el repo simulado costó 5 o 7 (medido el 2026-10-13). */
export const MARGEN_CUOTA = 2;

/** Idiomas de la puerta: el de la bitácora, uno de derecha a izquierda y dos de textos largos. */
const IDIOMAS_PUERTA = ['es', 'ar', 'de', 'ta'];
const RTL = ['ar', 'fa', 'he', 'ur'];
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/* ------------------------------------------------------------- lo puro */

/** La clave estable de un hallazgo: tipo, escenario y dónde (sin índices, cifras ni estados). */
export const clave = (h) => `${h.tipo}|${h.escenario}|${h.donde}`;

/** ¿Está en la base? Un escenario por idioma (`celular-xx`, el de `--langs`) cuenta como conocido si la base
    guarda el mismo control en cualquier idioma de celular: los controles son los mismos en los 40. */
export function conocido(h, base) {
  const claves = new Set(base?.hallazgos ?? []);
  if (claves.has(clave(h))) return true;
  if (!/^celular-(?!320$)/.test(h.escenario)) return false;
  return [...claves].some((k) => {
    const [tipo, escenario, ...donde] = k.split('|');
    return tipo === h.tipo && /^celular-(?!320$)/.test(escenario) && donde.join('|') === h.donde;
  });
}

/** Agrupa hallazgos por clave, suma cuántas veces aparecieron y les pone prioridad y subtipo. */
export function agrupar(lista) {
  const m = new Map();
  for (const h of lista) {
    const k = clave(h);
    if (m.has(k)) m.get(k).n += h.n ?? 1;
    else m.set(k, { ...h, n: h.n ?? 1, prioridad: TIPOS[h.tipo]?.prioridad ?? h.prioridad, subtipo: TIPOS[h.tipo]?.subtipo ?? h.subtipo });
  }
  return [...m.values()];
}

/** Lo que mira la puerta: los hallazgos estables que no están en la base (nuevos) y los de la base que
    ya no aparecen (resueltos). La cuota se compara como número: más consultas que la base (con su margen)
    es un hallazgo. */
export function comparar(hallazgos, base, medidas = {}) {
  const conocidas = new Set(base?.hallazgos ?? []);
  const vistas = new Set(hallazgos.map(clave));
  const nuevos = hallazgos.filter((h) => TIPOS[h.tipo]?.puerta && !conocidas.has(clave(h)));
  const tope = base?.cuota?.consultas;
  if (typeof tope === 'number' && typeof medidas.consultas === 'number' && medidas.consultas > tope + MARGEN_CUOTA) {
    nuevos.push({ tipo: 'cuota', escenario: 'cuota-sin-token', donde: 'api.github.com', detalle: `${medidas.consultas} consultas y la base dice ${tope} (+${MARGEN_CUOTA})${medidas.consultasPor ? `: ${medidas.consultasPor}` : ''}`, prioridad: 'Media', subtipo: 'Rendimiento', n: 1 });
  }
  return { nuevos, resueltos: [...conocidas].filter((k) => !vistas.has(k)) };
}

/** Las medidas de dos informes, con su diferencia en porcentaje (positivo = peor). */
export function compararMedidas(antes, ahora) {
  const sube = { cargaMs: true, tareasLargasMs: true, nodosDOM: true, heapMB: true, consultas: true, consultasCarga: true, fps3d: false, fps2d: false };
  return Object.keys(sube)
    .filter((k) => typeof antes?.[k] === 'number' && typeof ahora?.[k] === 'number')
    .map((k) => {
      const d = antes[k] ? ((ahora[k] - antes[k]) / antes[k]) * 100 : 0;
      return { medida: k, antes: antes[k], ahora: ahora[k], peor: Math.round(sube[k] ? d : -d) };
    });
}

/** Carga del equipo (procesos esperando por núcleo) por encima de la cual las medidas no se juzgan: en
    una sesión compartida se midió 2,7 cuadros por segundo en 2D con 2,9 de carga, y 38 sin ella. */
export const CARGA_MAX = 1.5;

/** Hallazgos de rendimiento: medidas fuera de presupuesto. Con el equipo cargado, ninguno: no concluye. */
export function presupuestos(medidas, presupuesto = PRESUPUESTO) {
  const out = [];
  if (medidas.cargaEquipo > CARGA_MAX) return out;
  for (const [k, lim] of Object.entries(presupuesto)) {
    const v = medidas[k];
    if (typeof v !== 'number') continue;
    const fps = k.startsWith('fps');
    if (fps ? v < lim : v > lim) out.push({ tipo: 'rendimiento', escenario: k === 'fps2d' ? 'escritorio-2d' : 'escritorio-3d', donde: k, detalle: `${v} (presupuesto: ${fps ? '≥' : '≤'} ${lim})`, prioridad: 'Baja', subtipo: 'Rendimiento', n: 1 });
  }
  return out;
}

/** Una línea por hallazgo, para la consola y para copiar a Mantenimiento. */
export const linea = (h) => `${h.prioridad.padEnd(5)} [${h.subtipo}] ${h.tipo} · ${h.escenario} · ${h.donde}${h.n > 1 ? ` (×${h.n})` : ''}${h.detalle ? ` — ${h.detalle}` : ''}`;

/* ------------------------------------------------------------ el navegador */

async function cargarPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* no está en el proyecto: el global */
  }
  try {
    const global = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(global, 'noop.js'))('playwright');
  } catch {
    return null;
  }
}

/** El Chromium: PLAYWRIGHT_CHROMIUM_PATH, el de Playwright o el más nuevo de /opt/pw-browsers (como check.mjs). */
function chromiumPath(pw) {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try {
    const p = pw.chromium.executablePath();
    if (existsSync(p)) return p;
  } catch {
    /* sigue */
  }
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)) {
    if (!existsSync(base)) continue;
    const revs = readdirSync(base)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter(Boolean)
      .sort((a, b) => b[1] - a[1]);
    for (const m of revs) {
      for (const sub of readdirSync(join(base, m[0]))) {
        const ruta = join(base, m[0], sub, 'chrome');
        if (/^chrome-linux/.test(sub) && existsSync(ruta)) return ruta;
      }
    }
  }
  return undefined;
}

/** Las clases que la app pone y saca según el estado (show, on, pinned…): no cuentan para la firma de un
    elemento, así un botón encendido o apagado es el mismo hallazgo. Salen del propio código. */
export function clasesDeEstado(dir = join(root, 'js')) {
  const out = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/classList\.(?:toggle|add|remove)\('([\w-]+)'/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** Se instala en cada página antes de que cargue: violaciones del CSP, tareas largas y la firma estable
    de un elemento (la usan revisar() y el recorrido con Tab). */
function instrumentar(estado) {
  const ESTADO = new Set(estado);
  window.__audit = {
    csp: [],
    tareas: { n: 0, ms: 0 },
    firma(el) {
      const partes = [];
      for (let e = el; e && e !== document.body && e !== document.documentElement && partes.length < 4; e = e.parentElement) {
        if (e.id && !/\d{2,}/.test(e.id)) {
          partes.unshift('#' + e.id);
          break;
        }
        const cls = [...e.classList].filter((c) => !ESTADO.has(c) && !/\d/.test(c)).slice(0, 2);
        const rol = e.getAttribute?.('role');
        partes.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '') + (rol ? `[role=${rol}]` : ''));
      }
      return partes.join(' > ') || el.tagName.toLowerCase();
    },
  };
  document.addEventListener('securitypolicyviolation', (e) => window.__audit.csp.push(`${e.violatedDirective} ${e.blockedURI || ''}`.trim()));
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__audit.tareas.n++;
        window.__audit.tareas.ms += e.duration;
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* sin longtask, sin esa medida */
  }
}

/** La revisión de la página tal como está: corre en el navegador y devuelve hallazgos sin agrupar.
    `ambito`: selector donde mirar (un diálogo o una barra); `rtl`: el idioma es de derecha a izquierda. */
function revisar({ ambito, rtl }) {
  const out = [];
  const raiz = ambito ? document.querySelector(ambito) : document.body;
  if (!raiz) return [{ tipo: 'error', donde: ambito, detalle: 'no está en la página' }];
  const firma = window.__audit.firma;
  // `minimo`: los textos solo para lectores (sr-only) miden 1 px y están cortados a propósito
  const visible = (el, minimo = 1) => {
    if (!el.isConnected || el.closest('[hidden], [inert]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < minimo || r.height < minimo) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden';
  };
  const texto = (n) => {
    if (n.nodeType === 3) return n.data;
    if (n.nodeType !== 1 || n.getAttribute('aria-hidden') === 'true') return '';
    const st = getComputedStyle(n);
    if (st.display === 'none' || st.visibility === 'hidden') return '';
    if (n.getAttribute('aria-label')) return n.getAttribute('aria-label');
    if (n.tagName === 'IMG') return n.alt || '';
    if (n.tagName.toLowerCase() === 'svg') return n.querySelector('title')?.textContent || '';
    return [...n.childNodes].map(texto).join(' ');
  };
  const nombre = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (t) return t;
    }
    if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();
    if (el.labels?.length) {
      const t = [...el.labels].map((l) => l.textContent).join(' ').trim();
      if (t) return t;
    }
    if (el.tagName === 'IMG') return (el.alt || '').trim();
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) return el.value.trim();
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      const t = texto(el).replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    return (el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
  };
  const INTERACTIVOS = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"])';
  const enfocable = (el) => el.matches('button, a[href], input, select, textarea, summary, [tabindex]') && !el.disabled && el.tabIndex >= 0;

  // controles: nombre accesible y tamaño del objetivo
  for (const el of raiz.querySelectorAll(INTERACTIVOS)) {
    if (!visible(el) && !(el.matches('select, input') && visible(el.parentElement))) continue;
    if (!nombre(el)) out.push({ tipo: 'sin-nombre', donde: firma(el) });
    if (!visible(el)) continue;
    let r = el.getBoundingClientRect();
    // una casilla con su etiqueta se pulsa en las dos: cuenta la caja que las abarca
    if (el.matches('input[type=checkbox], input[type=radio]') && el.labels?.length) {
      const l = el.labels[0].getBoundingClientRect();
      r = { width: Math.max(r.right, l.right) - Math.min(r.left, l.left), height: Math.max(r.bottom, l.bottom) - Math.min(r.top, l.top) };
    }
    // un enlace en medio de un texto no cuenta (excepción de WCAG 2.5.8)
    const enLinea = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement?.closest('p, li');
    if ((r.width < 23.5 || r.height < 23.5) && !enLinea) out.push({ tipo: 'objetivo-chico', donde: firma(el), detalle: `${Math.round(r.width)}×${Math.round(r.height)} px` });
  }
  // enfocables escondidos del lector de pantalla
  for (const el of raiz.querySelectorAll('[aria-hidden="true"]')) {
    for (const f of [el, ...el.querySelectorAll('*')]) if (enfocable(f) && visible(f)) out.push({ tipo: 'foco-oculto', donde: firma(f) });
  }
  if (!ambito) {
    const ids = new Map();
    for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1);
    for (const [id, n] of ids) if (n > 1) out.push({ tipo: 'id-duplicado', donde: `#${id}`, detalle: `${n} veces` });
    // contra clientWidth y no innerWidth: en un celular (isMobile) la vista crece hasta el contenido, así
    // que innerWidth se estira con el desborde y la resta da 0 (medido: 532 y 532 con 390 de pantalla)
    const sobra = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (sobra > 1) out.push({ tipo: 'desborde', donde: 'html', detalle: `${sobra} px de más` });
    if (rtl && document.documentElement.dir !== 'rtl') out.push({ tipo: 'dir-rtl', donde: 'html', detalle: `dir=${document.documentElement.dir || '(nada)'}` });
  }
  // texto o controles que el borde corta, texto cortado y texto a medio armar
  for (const el of raiz.querySelectorAll('*')) {
    if (!visible(el, 3)) continue;
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
    if (!propio && !el.matches(INTERACTIVOS)) continue;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    // las etiquetas de los grafos entran y salen de la vista al moverse la cámara: eso no es un corte
    const ancho = document.documentElement.clientWidth;
    const corta = (r.left < ancho - 1 && r.right > ancho + 1) || (r.right > 1 && r.left < -1);
    if (corta && st.position !== 'fixed' && !el.closest('#graph3d, #graph')) out.push({ tipo: 'borde', donde: firma(el) });
    if (!propio) continue;
    if (/hidden|clip/.test(st.overflowX) && st.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) out.push({ tipo: 'texto-cortado', donde: firma(el), detalle: `${el.scrollWidth - el.clientWidth} px` });
    const t = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.data)
      .join(' ')
      .trim();
    if (/\{[a-zA-Z_]+\}|\bundefined\b|\bNaN\b|\[object Object\]|^[a-z]+(\.[a-zA-Z0-9]+){1,3}$/.test(t)) out.push({ tipo: 'sin-traducir', donde: firma(el), detalle: t.slice(0, 60) });
  }
  return out;
}

/** Recorre la página con Tab: foco en algo que no se ve, trampas y foco que no cambia nada. El indicador
    puede estar en el propio elemento, en su contenedor (:focus-within) o en un hijo (.head:focus-visible
    .h-bg), así que se comparan los estilos que lo dibujan en los tres, enfocado y sin enfocar. */
async function recorrerConTab(page, { veces = 50 } = {}) {
  const out = [];
  // sin transiciones, el estilo enfocado se lee entero en el acto (si no, el borde que cambia en 0,15 s
  // todavía tiene el color de antes)
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'audit-sin-transiciones';
    st.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.append(st);
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  const vistos = [];
  for (let i = 0; i < veces; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      // la opacidad no cuenta: un <select> transparente sobre su botón (el de idioma) es un patrón válido
      const seVe = r.width >= 1 && r.height >= 1 && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      const PROPS = ['outlineStyle', 'outlineColor', 'outlineWidth', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'backgroundColor', 'color', 'textDecorationLine', 'fill', 'stroke', 'strokeWidth', 'opacity', 'transform'];
      const nodos = [el, el.parentElement, el.parentElement?.parentElement, ...el.querySelectorAll('*')].filter(Boolean).slice(0, 40);
      const estilos = () => nodos.map((n) => PROPS.map((p) => getComputedStyle(n)[p]).join('|')).join('\n');
      const con = estilos();
      el.blur(); // el siguiente Tab sigue desde aquí: Chromium recuerda el punto de partida
      const marca = estilos() !== con;
      el.dataset.auditUid ||= Math.random().toString(36).slice(2);
      return { firma: window.__audit.firma(el), seVe, marca, uid: el.dataset.auditUid, sr: r.width <= 2 || r.height <= 2 };
    });
    if (!f) continue;
    vistos.push(f.uid);
    if (!f.seVe) out.push({ tipo: 'foco-invisible', donde: f.firma });
    else if (!f.marca && !f.sr) out.push({ tipo: 'sin-indicador', donde: f.firma });
  }
  await page.evaluate(() => document.getElementById('audit-sin-transiciones')?.remove());
  const distintos = new Set(vistos).size;
  if (vistos.length >= 20 && distintos <= 2) out.push({ tipo: 'trampa', donde: 'Tab', detalle: `${distintos} elementos en ${vistos.length} pulsaciones` });
  return out;
}

/** Una API de GitHub simulada, mínima: un repo público con tres ramas y la cuota de 60 por hora de una
    consulta sin token, que baja con cada consulta. Anota cada una. */
function githubSimulado() {
  const calls = [];
  const ahora = Date.now();
  const sha = (i) => i.toString(16).padStart(40, '0');
  const ramas = { main: 4, 'feature/a': 2, 'feature/b': 1 };
  const commits = {};
  let k = 100;
  for (const [rama, n] of Object.entries(ramas)) {
    let padre = rama === 'main' ? null : sha(101);
    commits[rama] = [];
    for (let i = 0; i < n; i++) {
      const id = sha(++k);
      const date = new Date(ahora - (n - i) * 3600e3).toISOString();
      commits[rama].unshift({ sha: id, parents: padre ? [{ sha: padre }] : [], commit: { message: `${rama} ${i}`, author: { name: 'Ana', date }, committer: { date } }, html_url: `https://github.com/acme/web/commit/${id}`, author: null });
      padre = id;
    }
  }
  const cabeza = (r) => commits[r][0].sha;
  const ruta = (path, q) => {
    if (path === '/repos/acme/web') return { body: { name: 'web', full_name: 'acme/web', owner: { login: 'acme' }, default_branch: 'main', html_url: 'https://github.com/acme/web', private: false, description: 'Simulado' } };
    if (path === '/repos/acme/web/branches') return { body: Object.keys(ramas).map((name) => ({ name, commit: { sha: cabeza(name) }, protected: false })) };
    if (path === '/repos/acme/web/commits') {
      const s = q.get('sha');
      return { body: commits[Object.keys(ramas).find((r) => r === s || cabeza(r) === s) || 'main'] };
    }
    if (/^\/repos\/acme\/web\/(events|pulls|activity|issues|releases|tags|deployments)$/.test(path)) return { body: [] };
    if (/^\/repos\/acme\/web\/compare\//.test(path)) return { body: { status: 'ahead', ahead_by: 1, behind_by: 0, total_commits: 1, commits: [], files: [] } };
    // el CI de un commit sin token (#56): un repo público responde 200, sin checks si no tiene
    if (/^\/repos\/acme\/web\/commits\/[0-9a-f]{40}\/check-runs$/.test(path)) return { body: { total_count: 0, check_runs: [] } };
    return { status: 404, body: { message: 'Not Found' } };
  };
  return {
    calls,
    handle: (r) => {
      const u = new URL(r.request().url());
      calls.push(u.pathname + u.search);
      const { status = 200, body } = ruta(u.pathname, u.searchParams);
      return r.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Resource',
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': String(Math.max(0, 60 - calls.length)),
          'x-ratelimit-reset': String(Math.floor(ahora / 1000) + 3600),
          'x-ratelimit-resource': 'core',
        },
        body: JSON.stringify(body),
      });
    },
  };
}

/* ---------------------------------------------------------- los escenarios */

const ESCRITORIO = { viewport: { width: 1280, height: 800 } };
const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/** Cada escenario: nombre estable (va en la clave del hallazgo), si entra en la puerta, el contexto del
    navegador, la URL y qué mira una vez cargada la página. */
export function escenarios({ langs = false, completa = false } = {}) {
  const tab = (ctx) => ctx.tab();
  const lista = [
    {
      nombre: 'escritorio-3d',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        await ctx.revisar();
        await ctx.medir('3d');
        await tab(ctx);
      },
    },
    {
      nombre: 'escritorio-2d',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.page.click('#view-2d');
        await ctx.actividad();
        await ctx.revisar();
        await ctx.medir('2d');
        await tab(ctx);
      },
    },
    {
      nombre: 'dialogos',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es',
      async mirar(ctx) {
        for (const [boton, dialogo] of [
          ['#settings-btn', '#settings'],
          ['#trophy-btn', '#trophies'],
        ]) {
          if (!(await ctx.page.locator(boton).isVisible())) continue;
          await ctx.page.focus(boton);
          await ctx.page.keyboard.press('Enter');
          await ctx.page.waitForSelector(`${dialogo}[open]`, { timeout: 5000 });
          if (!(await ctx.page.evaluate((d) => !!document.activeElement?.closest(d), dialogo))) ctx.add([{ tipo: 'dialogo-foco', donde: dialogo, detalle: 'al abrirse, el foco no entra' }]);
          await ctx.revisar(dialogo);
          await ctx.page.keyboard.press('Escape');
          await ctx.page.waitForSelector(`${dialogo}:not([open])`, { state: 'attached', timeout: 5000 });
          if (!(await ctx.page.evaluate((b) => document.activeElement === document.querySelector(b), boton))) ctx.add([{ tipo: 'dialogo-foco', donde: dialogo, detalle: 'al cerrarse, el foco no vuelve al botón' }]);
        }
      },
    },
    {
      nombre: 'replay',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        await ctx.page.click('#replay-btn');
        await ctx.page.waitForSelector('#replay:not([hidden])', { timeout: 5000 });
        await ctx.page.waitForTimeout(1500);
        await ctx.revisar('#replay');
        await ctx.page.click('#replay .rp-exit');
      },
    },
    {
      nombre: 'galaxias-vuelo',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        if (!(await ctx.page.locator('#galaxy-btn').isVisible())) return; // sin WebGL no hay 3D
        await ctx.page.click('#galaxy-btn');
        await ctx.page.waitForTimeout(2500);
        await ctx.revisar();
        await ctx.page.click('#galaxy-btn');
        await ctx.page.click('#fly-btn');
        await ctx.page.waitForTimeout(1500);
        await ctx.revisar();
        await ctx.page.keyboard.press('Escape');
      },
    },
    {
      nombre: 'modo-tv',
      puerta: true,
      contexto: { viewport: { width: 1920, height: 1080 } },
      url: '?lang=es&tv=1',
      async mirar(ctx) {
        await ctx.page.waitForTimeout(3000);
        await ctx.revisar();
        await tab(ctx);
      },
    },
    ...IDIOMAS_PUERTA.map((lang) => ({
      nombre: `celular-${lang}`,
      puerta: true,
      contexto: CELULAR,
      url: `?lang=${lang}`,
      rtl: RTL.includes(lang),
      async mirar(ctx) {
        await ctx.actividad();
        await ctx.revisar();
      },
    })),
    {
      nombre: 'cuota-sin-token',
      puerta: true,
      contexto: ESCRITORIO,
      url: '?lang=es&repo=acme/web',
      github: true,
      async mirar(ctx) {
        // lo que cuesta abrir un repo sin token (la cuota es de 60 por hora para todo): hasta que termina
        // de cargar y en los 10 s siguientes, donde llega la historia de las demás ramas (a veces antes)
        await ctx.page.waitForSelector('#status:not([data-state=loading])', { timeout: 30000 });
        ctx.medidas.consultasCarga = ctx.gh.calls.length;
        await ctx.page.waitForTimeout(10000);
        ctx.medidas.consultas = ctx.gh.calls.length;
        const por = {};
        for (const c of ctx.gh.calls) {
          const k = c.replace(/\?.*/, '').replace(/[0-9a-f]{40}/g, ':sha').replace('/repos/acme/web', '') || '/';
          por[k] = (por[k] || 0) + 1;
        }
        ctx.medidas.consultasPor = Object.entries(por)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ');
      },
    },
  ];
  if (!completa) return lista;
  lista.push(
    {
      nombre: 'celular-320',
      puerta: false,
      contexto: { ...CELULAR, viewport: { width: 320, height: 640 } },
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        await ctx.revisar();
      },
    },
    {
      nombre: 'celular-320-3d',
      puerta: false,
      contexto: { ...CELULAR, viewport: { width: 320, height: 640 } },
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        await ctx.page.waitForSelector('.g3-head', { timeout: 15000 });
        await ctx.page.waitForTimeout(2500);
        // las que se pisan se atenúan a propósito (placeLabels); dos nítidas encima una de otra son el fallo
        const pares = await ctx.page.evaluate(() => {
          const hs = [...document.querySelectorAll('.g3-head')].filter((e) => getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity >= 0.5);
          const out = [];
          for (let i = 0; i < hs.length; i++)
            for (let j = i + 1; j < hs.length; j++) {
              const a = hs[i].getBoundingClientRect();
              const c = hs[j].getBoundingClientRect();
              if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) out.push(`${window.__audit.firma(hs[i])} / ${window.__audit.firma(hs[j])}`);
            }
          return out;
        });
        ctx.add(pares.map((donde) => ({ tipo: 'etiquetas-pisadas', donde })));
      },
    },
    {
      nombre: 'movimiento-reducido',
      puerta: false,
      contexto: { ...ESCRITORIO, reducedMotion: 'reduce' },
      url: '?lang=es',
      async mirar(ctx) {
        await ctx.actividad();
        const anims = await ctx.page.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity && a.effect.target?.isConnected)
            .map((a) => `${window.__audit.firma(a.effect.target)} (${a.animationName || 'WAAPI'})`),
        );
        ctx.add(anims.map((donde) => ({ tipo: 'animacion-infinita', donde })));
      },
    },
  );
  if (!langs) return lista;
  const todos = [...readFileSync(join(root, 'js', 'i18n.js'), 'utf8').matchAll(/\{ code: '([\w-]+)', name: '[^']+'(, rtl: true)? \}/g)].map((m) => ({ code: m[1], rtl: !!m[2] }));
  for (const l of todos) {
    if (IDIOMAS_PUERTA.includes(l.code)) continue;
    lista.push({
      nombre: `celular-${l.code}`,
      puerta: false,
      contexto: CELULAR,
      url: `?lang=${l.code}`,
      rtl: l.rtl,
      async mirar(ctx) {
        await ctx.revisar();
      },
    });
  }
  return lista;
}

const repro = (esc) => `node tools/audit.mjs${esc.puerta ? ' --puerta' : esc.nombre.startsWith('celular-') && esc.nombre !== 'celular-320' ? ' --langs' : ''} · escenario ${esc.nombre}: index.html${esc.url} a ${esc.contexto.viewport.width}×${esc.contexto.viewport.height}${esc.contexto.reducedMotion ? ', movimiento reducido' : ''}`;

/** Corre los escenarios y devuelve {hallazgos, medidas}. */
async function auditar({ browser, base, estado, soloPuerta, langs, completa, decir = (l) => process.stdout.write(l + '\n') }) {
  const hallazgos = [];
  const medidas = {};
  for (const esc of escenarios({ langs, completa })) {
    if (soloPuerta && !esc.puerta) continue;
    const t0 = Date.now();
    const context = await browser.newContext({ reducedMotion: 'no-preference', ...esc.contexto });
    const page = await context.newPage();
    const propios = [];
    const add = (lista) => propios.push(...lista.map((h) => ({ escenario: esc.nombre, ...h })));
    const gh = esc.github ? githubSimulado() : null;
    await page.addInitScript(instrumentar, estado);
    page.on('pageerror', (e) => add([{ tipo: 'error', donde: 'excepción', detalle: e.message.split('\n')[0].slice(0, 140) }]));
    page.on('console', (m) => {
      // el CSP se cuenta aparte, con su directiva (securitypolicyviolation)
      if (m.type() === 'error' && !/Content Security Policy/i.test(m.text())) add([{ tipo: 'error', donde: 'consola', detalle: m.text().split('\n')[0].slice(0, 140) }]);
    });
    // nada sale a internet: lo que no es del servidor local se corta y se anota, salvo la API simulada
    await context.route(
      (url) => !url.href.startsWith(base) && !/^(data|blob):$/.test(url.protocol),
      (r) => {
        const u = new URL(r.request().url());
        if (gh && u.host === 'api.github.com') return gh.handle(r);
        if (gh && u.host === 'avatars.githubusercontent.com') return r.fulfill({ contentType: 'image/png', body: PNG_1PX });
        add([{ tipo: 'externa', donde: u.host, detalle: u.href.slice(0, 120) }]);
        return r.abort();
      },
    );
    const ctx = {
      page,
      gh,
      medidas,
      add,
      async actividad() {
        await page.waitForSelector('#feed > li', { timeout: 30000 }).catch(() => add([{ tipo: 'error', donde: '#feed', detalle: 'no llegó actividad al panel en 30 s' }]));
      },
      async revisar(ambito) {
        add(await page.evaluate(revisar, { ambito, rtl: !!esc.rtl }));
      },
      async tab(op) {
        add(await recorrerConTab(page, op));
      },
      async medir(vista) {
        const m = await page.evaluate(
          () =>
            new Promise((ok) => {
              let n = 0;
              const t0 = performance.now();
              const f = () => {
                n++;
                if (performance.now() - t0 < 3000) return requestAnimationFrame(f);
                ok({ fps: (n * 1000) / (performance.now() - t0), nodos: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, tareas: window.__audit.tareas });
              };
              requestAnimationFrame(f);
            }),
        );
        medidas[`fps${vista}`] = Math.round(m.fps * 10) / 10;
        if (vista !== '3d') return;
        medidas.nodosDOM = m.nodos;
        if (m.heap) medidas.heapMB = Math.round(m.heap);
        medidas.tareasLargasMs = Math.round(m.tareas.ms);
        medidas.tareasLargas = m.tareas.n;
      },
    };
    try {
      const t = Date.now();
      await page.goto(`${base}/index.html${esc.url}`);
      await page.waitForSelector('#overlay', { state: 'hidden', timeout: 30000 });
      if (esc.nombre === 'escritorio-3d') medidas.cargaMs = Date.now() - t;
      await esc.mirar(ctx);
      const csp = await page.evaluate(() => window.__audit?.csp ?? []);
      add(csp.map((d) => ({ tipo: 'csp', donde: d.split(' ')[0], detalle: d })));
    } catch (e) {
      add([{ tipo: 'error', donde: 'escenario', detalle: `no terminó: ${e.message.split('\n')[0].slice(0, 140)}` }]);
    }
    await context.close();
    const grupo = agrupar(propios).map((h) => ({ ...h, repro: repro(esc) }));
    hallazgos.push(...grupo);
    decir(`  · ${esc.nombre}: ${grupo.length} hallazgo(s) (${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} s)`);
  }
  return { hallazgos: agrupar(hallazgos), medidas };
}

/* --------------------------------------------------------------------- CLI */

function opciones(argv) {
  const o = { puerta: false, base: false, langs: false, json: null, comparar: null, repetir: 1, help: false };
  const valor = (i, f) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`${f} necesita un valor`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--puerta') o.puerta = true;
    else if (a === '--base') o.base = true;
    else if (a === '--langs') o.langs = true;
    else if (a === '--json') o.json = valor(i++, a);
    else if (a === '--comparar') o.comparar = valor(i++, a);
    else if (a === '--repetir') o.repetir = Math.max(1, Number(valor(i++, a)) || 1);
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`opción desconocida: ${a} (node tools/audit.mjs --help)`);
  }
  return o;
}

/* El informe de --json: crea la carpeta si falta (test-results/ no existe en una sesión nueva). */
export function guardarInforme(ruta, informe) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(informe, null, 2) + '\n');
}
export const leerBase = (ruta = BASE) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : { hallazgos: [], cuota: {} });

async function main(argv) {
  const o = opciones(argv);
  if (o.help) {
    console.log(USO);
    return 0;
  }
  const pw = await cargarPlaywright();
  if (!pw) {
    console.log('FALLA: sin Playwright (npm ci)');
    return 2;
  }
  const { serve } = await import('../e2e/serve.mjs');
  const server = await serve(0);
  const env = { base: `http://127.0.0.1:${server.address().port}`, estado: clasesDeEstado() };
  try {
    env.browser = await pw.chromium.launch({ executablePath: chromiumPath(pw), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  } catch (e) {
    server.close();
    console.log(`FALLA: sin Chromium (${e.message.split('\n')[0]})`);
    return 2;
  }
  try {
    return o.puerta || o.base ? await puerta(o, env) : await completa(o, env);
  } finally {
    await env.browser.close();
    server.close();
  }
}

/** --puerta y --base: lo estable, contra la base. Un hallazgo nuevo tiene que repetirse en una segunda
    corrida para fallar: lo que aparece una vez sola (un aviso de la demo que llegó justo) no frena. */
async function puerta(o, env) {
  const t0 = Date.now();
  const base = leerBase();
  const primera = await auditar({ ...env, soloPuerta: true });
  if (o.base) {
    const segunda = await auditar({ ...env, soloPuerta: true });
    const claves = [...new Set([...primera.hallazgos, ...segunda.hallazgos].filter((h) => TIPOS[h.tipo]?.puerta).map(clave))].sort();
    const consultas = Math.max(primera.medidas.consultas ?? 0, segunda.medidas.consultas ?? 0);
    const nota = 'Hallazgos conocidos de node tools/audit.mjs --puerta: la puerta falla solo con los que no están aquí. Cada tipo tiene su pendiente en IMPROVEMENTS.md (audit:<tipo>). Se reescribe con --base, nunca a mano.';
    writeFileSync(BASE, JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), nota, cuota: { consultas, por: primera.medidas.consultasPor }, hallazgos: claves }, null, 2) + '\n');
    console.log(`Base reescrita: ${claves.length} hallazgos conocidos, ${consultas} consultas al abrir un repo sin token (tools/audit-base.json)`);
    return 0;
  }
  let { nuevos, resueltos } = comparar(primera.hallazgos, base, primera.medidas);
  if (nuevos.length) {
    console.log(`  ${nuevos.length} hallazgo(s) nuevo(s): se repite la auditoría para descartar lo pasajero`);
    const segunda = await auditar({ ...env, soloPuerta: true });
    const otra = new Set(comparar(segunda.hallazgos, base, segunda.medidas).nuevos.map(clave));
    nuevos = nuevos.filter((h) => otra.has(clave(h)));
  }
  const s = Math.round((Date.now() - t0) / 1000);
  for (const k of resueltos) console.log(`  ya no aparece (node tools/audit.mjs --base y cerrar su pendiente): ${k}`);
  if (nuevos.length) {
    console.log(`FALLA auditoría: ${nuevos.length} hallazgo(s) nuevo(s), en dos corridas (${s} s)`);
    for (const h of nuevos) console.log(`  ${linea(h)}\n    reproducir: ${h.repro ?? 'node tools/audit.mjs --puerta'}`);
    console.log('  Se arregla en este mismo cambio. Si no es del cambio, va a Mantenimiento con su reproducción y a la base (--base).');
    return 1;
  }
  console.log(`Auditoría: 0 hallazgos nuevos, ${base.hallazgos.length} conocidos${resueltos.length ? ` (${resueltos.length} ya no aparecen)` : ''}, ${primera.medidas.consultas ?? '?'} consultas sin token (${s} s)`);
  return 0;
}

/** La auditoría completa: todos los escenarios, el recorrido con Tab mirando la pantalla, las medidas
    (la mejor de --repetir) y los presupuestos. Termina en 0: sus hallazgos van a Mantenimiento. */
async function completa(o, env) {
  const t0 = Date.now();
  const r = await auditar({ ...env, langs: o.langs, completa: true });
  for (let i = 1; i < o.repetir; i++) {
    const otra = await auditar({ ...env, soloPuerta: true, decir: () => {} });
    for (const [k, v] of Object.entries(otra.medidas)) {
      if (typeof v !== 'number') continue;
      r.medidas[k] = typeof r.medidas[k] === 'number' ? (k.startsWith('fps') ? Math.max : Math.min)(r.medidas[k], v) : v;
    }
  }
  r.medidas.cargaEquipo = Math.round((loadavg()[0] / availableParallelism()) * 10) / 10;
  const base = leerBase();
  const todos = [...r.hallazgos, ...presupuestos(r.medidas)];
  const orden = { Alta: 0, Media: 1, Baja: 2 };
  todos.sort((a, b) => orden[a.prioridad] - orden[b.prioridad] || a.subtipo.localeCompare(b.subtipo) || clave(a).localeCompare(clave(b)));
  console.log(`\nHallazgos (${todos.length}; * = ya en tools/audit-base.json):`);
  for (const h of todos) console.log(`${conocido(h, base) ? '*' : ' '} ${linea(h)}`);
  console.log(`\nMedidas (Chromium sin GPU${o.repetir > 1 ? `, la mejor de ${o.repetir}` : ''}${r.medidas.cargaEquipo > CARGA_MAX ? `; equipo cargado (${r.medidas.cargaEquipo} por núcleo): no se juzgan los presupuestos, repetir con el equipo libre` : ''}):`);
  for (const [k, v] of Object.entries(r.medidas)) console.log(`  ${k}: ${v}`);
  if (o.comparar) {
    console.log(`\nContra ${o.comparar} (+ = peor):`);
    for (const d of compararMedidas(JSON.parse(readFileSync(o.comparar, 'utf8')).medidas, r.medidas)) console.log(`  ${d.medida}: ${d.antes} → ${d.ahora} (${d.peor > 0 ? '+' : ''}${d.peor} %)`);
  }
  if (o.json) guardarInforme(o.json, { fecha: new Date().toISOString(), hallazgos: todos, medidas: r.medidas });
  const altas = todos.filter((h) => h.prioridad === 'Alta').length;
  console.log(`\nAuditoría completa: ${todos.length} hallazgos (${altas} Alta), ${todos.filter((h) => !conocido(h, base)).length} fuera de la base (${Math.round((Date.now() - t0) / 1000)} s)`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => {
      console.error(`ERROR: ${e.message}`);
      process.exit(2);
    },
  );
}
