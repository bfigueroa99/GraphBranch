#!/usr/bin/env node
/* La puerta antes de subir un cambio: corre en orden node --check, node --test, las traducciones,
   loop --check, el smoke en Chromium, la auditoría (si el cambio toca la página) y, si el cambio toca la
   página o la app de escritorio, las e2e. Se detiene en el primer rojo e imprime la línea «Validado:» que
   va a la bitácora.

     npm run check                  las e2e solo si el diff con origin/dev toca la página o el escritorio
     npm run check -- --e2e         las e2e siempre
     npm run check -- --sin-e2e     las e2e nunca
     npm run check -- --langs       el smoke en los 40 idiomas (solo, si el diff toca js/locales/, css/ o index.html)
     npm run check -- --lento       las e2e con la prueba @lento (2 minutos más)
     npm run check -- --auditar     la auditoría (tools/audit.mjs --puerta) siempre; sola, si el diff toca la página
     npm run check -- --sin-auditar la auditoría nunca

   Un smoke con pocos pasos en rojo (hasta REPETIR_PASOS, en hasta REPETIR_SECCIONES secciones) no frena la
   puerta de entrada: se repiten solo esas secciones (node tools/smoke.mjs --seccion …). Si pasan, el paso
   era intermitente: la puerta sigue, lo dice en una línea «Intermitente:» y lo deja en la línea «Validado:».
   Si vuelven a fallar, es rojo. Así una intermitencia cuesta su sección y no otra puerta entera.

   Salida: 0 todo en verde · 1 un paso falló (FALLA <paso> y sus últimas 40 líneas; de node --test, el
   error de cada prueba que falló) · 2 no se pudo
   verificar (sin Chromium, sin Electron o sin pantalla ni xvfb-run). Elige el Chromium solo:
   PLAYWRIGHT_CHROMIUM_PATH, el de playwright-core, el más nuevo de /opt/pw-browsers o de
   PLAYWRIGHT_BROWSERS_PATH, o lo instala. Los logs completos quedan en test-results/check/ (las e2e
   vacían test-results/ al empezar: tras ellas queda solo e2e.log). */
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logs = join(root, 'test-results', 'check');
const FLAGS = ['--e2e', '--sin-e2e', '--langs', '--lento', '--auditar', '--sin-auditar'];
/** true si esto se corrió como comando (npm run check) y no importado por una prueba. Se comparan las rutas
    reales: con el repo detrás de un enlace simbólico, comparar las escritas daría false y la puerta saldría 0
    sin haber corrido nada. */
function corridaDirecta() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
const directo = corridaDirecta();
const opciones = new Set(directo ? process.argv.slice(2) : []);
/** Hasta cuántos pasos en rojo, y en cuántas secciones, se repiten por secciones: más que eso no es una
    intermitencia sino un cambio que rompió el smoke, y repetirlo solo gasta tiempo. Tres de cada cuatro
    puertas en rojo de las iteraciones 192 a 271 fueron un solo paso ajeno que pasó al repetir. */
export const REPETIR_PASOS = 3;
export const REPETIR_SECCIONES = 2;
/** Cuántas veces se repite por secciones: la segunda solo si la primera repetición falló en otro paso, que
    también tiene que pasar una vez (son las tres corridas que ya daba la skill, sin las otras 180 y pico de
    pasos de cada una). Un paso que falla dos veces es rojo sin más vueltas. */
export const REPETICIONES = 2;

const RE_E2E = /^(index\.html|sw\.js|manifest\.webmanifest|package\.json|playwright\.config\.mjs|css\/|js\/|electron\/|vendor\/|e2e\/)/;
const RE_LANGS = /^(js\/locales\/|css\/|index\.html)/;
// la auditoría mira la página: corre si cambia algo de lo que se sirve o la propia auditoría
const RE_AUDIT = /^(index\.html|sw\.js|manifest\.webmanifest|css\/|js\/|vendor\/|tools\/audit)/;
const playwrightCli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');

const dur = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

/** Corre un comando con la salida en test-results/check/<paso>.log. */
function correr(paso, cmd, args, env = process.env) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const salida = (r.stdout || '') + (r.stderr || '') + (r.error ? `\n${r.error.message}\n` : '');
  mkdirSync(logs, { recursive: true }); // Playwright vacía test-results/ al empezar las e2e
  writeFileSync(join(logs, `${paso}.log`), salida);
  return { status: r.error ? 127 : (r.status ?? 1), salida, ms: Date.now() - t0, log: paso };
}

/** De la salida TAP de node --test: cada prueba que falló con su error (el bloque que sigue a su «not ok»,
    sin la traza), hasta `max`. Las suites que solo fallan porque falló una prueba suya no cuentan. Sin esto la
    puerta mostraba las últimas 40 líneas, que son las pruebas que corrieron al final y pasaron, y había que ir
    al log a buscar qué regla se rompió. */
export function fallosTap(salida, max = 6) {
  const lineas = salida.split('\n');
  const fallos = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)not ok \d+ - (.*)$/.exec(lineas[i]);
    if (!m) continue;
    const sangria = m[1].length;
    const bloque = [];
    for (let j = i + 1; j < lineas.length; j++) {
      const l = lineas[j];
      if (l.trim() === '...' || (l.trim() && l.length - l.trimStart().length <= sangria)) break;
      bloque.push(l.slice(sangria + 2));
    }
    if (bloque.some((l) => /^type: 'suite'/.test(l)) || bloque.some((l) => /subtestsFailed/.test(l))) continue;
    const desde = bloque.findIndex((l) => /^error:/.test(l));
    const hasta = bloque.findIndex((l, k) => k > desde && /^(code|name|stack|expected|actual|operator):/.test(l));
    const error = desde < 0 ? [] : bloque.slice(desde, hasta < 0 ? desde + 12 : Math.min(hasta, desde + 12));
    fallos.push({ nombre: m[2], error: error.map((l) => l.trimEnd()).filter(Boolean) });
  }
  return fallos.slice(0, max);
}

/** Del registro del smoke en rojo: las secciones que tuvieron fallos («§ Título»), los pasos que fallaron
    en ellas («· nombre», debajo de su sección) y sus líneas de error («  ✗ nombre: error»). */
export function fallosSmoke(salida) {
  const lineas = salida.split('\n');
  return {
    secciones: lineas.filter((l) => l.startsWith('§ ')).map((l) => l.slice(2).trim()),
    pasos: lineas.filter((l) => l.startsWith('· ')).map((l) => l.slice(2).trim()),
    errores: lineas.filter((l) => /^\s*✗ /.test(l)).map((l) => l.replace(/^\s*✗ /, '').trim()),
  };
}

/** Un smoke en rojo se repite por secciones solo si parece una intermitencia: pocos pasos, en pocas secciones
    (y un registro que las nombra: sin «§», el smoke murió antes de terminar y no hay qué repetir). */
export const repetible = ({ pasos, secciones }) => pasos.length >= 1 && pasos.length <= REPETIR_PASOS && secciones.length >= 1 && secciones.length <= REPETIR_SECCIONES;

/** El smoke con su repetición por secciones. `correr(extra)` corre `node tools/smoke.mjs` con esos argumentos
    de más y devuelve { status, salida, ms }. Devuelve { primera, rojo, motivo, intermitentes, ms }: `rojo` es la
    corrida que frena la puerta (null si el smoke vale), `intermitentes` los pasos que fallaron una vez y pasaron
    al repetir su sección, y `ms` lo que tardaron las repeticiones. Vale solo si cada paso que falló alguna vez
    pasó después en una corrida de su sección; el que falla dos veces, o un rojo que no parece intermitencia
    (muchos pasos, o un smoke que murió sin decir en qué sección), frena. */
export function validarSmoke(correr, { repeticiones = REPETICIONES, avisar = () => {} } = {}) {
  const primera = correr([]);
  if (primera.status === 0) return { primera, rojo: null, motivo: '', intermitentes: [], ms: 0 };
  let f = fallosSmoke(primera.salida);
  if (!repetible(f)) return { primera, rojo: primera, motivo: '', intermitentes: [], ms: 0 };
  const intermitentes = [];
  let ms = 0;
  for (let ronda = 1; ; ronda++) {
    intermitentes.push(...f.pasos);
    avisar(f, ronda);
    const otra = correr(f.secciones.flatMap((x) => ['--seccion', x]));
    ms += otra.ms;
    if (otra.status === 0 && /✓/.test(otra.salida)) return { primera, rojo: null, motivo: '', intermitentes, ms };
    const g = fallosSmoke(otra.salida);
    const repetidos = g.pasos.filter((p) => intermitentes.includes(p));
    if (repetidos.length) return { primera, rojo: otra, motivo: `falló dos veces, la segunda con su sección sola: no es una intermitencia (${repetidos.map((p) => `«${nombrePaso(p)}»`).join(', ')})`, intermitentes, ms };
    if (!repetible(g)) return { primera, rojo: otra, motivo: 'la repetición por secciones no terminó o falló en demasiados pasos', intermitentes, ms };
    if (ronda >= repeticiones) return { primera, rojo: otra, motivo: `en ${ronda + 1} corridas falló cada vez en un paso distinto: el smoke no es confiable así, se arregla antes de seguir`, intermitentes, ms };
    f = g;
  }
}

/** El nombre de un paso, acortado para la línea «Validado:». */
export const nombrePaso = (paso, max = 70) => (paso.length > max ? `${paso.slice(0, max - 1).trimEnd()}…` : paso);

function falla(nombre, r) {
  console.log(`FALLA ${nombre} (código ${r.status})`);
  const lineas = r.salida.trim().split('\n');
  const tap = fallosTap(r.salida);
  if (tap.length) {
    console.log('  Fallaron:');
    for (const f of tap) {
      console.log(`  not ok - ${f.nombre}`);
      for (const l of f.error) console.log(`      ${l}`);
    }
  }
  for (const l of lineas.slice(tap.length ? -10 : -40)) console.log(`  ${l}`);
  console.log(`(la salida entera está en test-results/check/${r.log}.log)`);
  process.exit(1);
}

function sinVerificar(msg) {
  console.log(`FALLA: ${msg}`);
  process.exit(2);
}

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

/** Qué cambió frente a origin/dev, la base del loop (más lo no versionado); null si no hay origin/dev. */
function diff() {
  const d = git(['diff', '--name-only', 'origin/dev']);
  if (d.status !== 0) return null;
  const otros = git(['ls-files', '--others', '--exclude-standard']).stdout;
  return [...d.stdout.split('\n'), ...otros.split('\n')].filter(Boolean);
}

/* 5. el Chromium del smoke y de las e2e */
function chromiumInstalados() {
  const bases = ['/opt/pw-browsers', process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean);
  const rutas = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      const m = /^chromium-(\d+)$/.exec(d);
      if (!m) continue;
      for (const sub of readdirSync(join(base, d))) {
        const ruta = join(base, d, sub, 'chrome');
        if (/^chrome-linux/.test(sub) && existsSync(ruta)) rutas.push({ rev: +m[1], ruta });
      }
    }
  }
  return rutas.sort((a, b) => b.rev - a.rev).map((r) => r.ruta);
}

function chromiumDelProyecto() {
  try {
    return createRequire(join(root, 'noop.js'))('playwright-core').chromium.executablePath();
  } catch {
    return null;
  }
}

/** true si el Chromium es el que pidió PLAYWRIGHT_CHROMIUM_PATH (chromium() no lo anuncia). */
const pedido = (ruta) => ruta === process.env.PLAYWRIGHT_CHROMIUM_PATH;

function chromium() {
  const pedido = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (pedido && existsSync(pedido)) return pedido;
  const nota = pedido ? `PLAYWRIGHT_CHROMIUM_PATH=${pedido} no existe; se usa ` : '';
  const candidatos = [chromiumDelProyecto(), ...chromiumInstalados()].filter((c) => c && existsSync(c));
  if (candidatos.length) {
    console.log(`Chromium: ${nota}${candidatos[0]}`);
    return candidatos[0];
  }
  console.log('Chromium: no hay ninguno; npx playwright install chromium…');
  correr('chromium-install', process.execPath, [playwrightCli, 'install', 'chromium']);
  const instalado = chromiumDelProyecto();
  if (instalado && existsSync(instalado)) {
    console.log(`Chromium: ${nota}${instalado} (recién instalado)`);
    return instalado;
  }
  return sinVerificar('sin Chromium (npx playwright install chromium)');
}

/** Lo que las e2e necesitan además de Chromium: Electron y una pantalla (o xvfb-run). Devuelve el prefijo del comando. */
function entornoE2E() {
  const electron = join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app' : 'electron');
  if (!existsSync(electron)) {
    console.log('Electron: no está; node node_modules/electron/install.js…');
    const env = { ...process.env, ELECTRON_GET_USE_PROXY: '1' };
    if (process.env.HTTPS_PROXY) env.GLOBAL_AGENT_HTTPS_PROXY = process.env.HTTPS_PROXY;
    correr('electron-install', process.execPath, [join(root, 'node_modules', 'electron', 'install.js')], env);
    if (!existsSync(electron)) sinVerificar('sin Electron (node node_modules/electron/install.js)');
  }
  if (process.platform !== 'linux' || process.env.DISPLAY) return [];
  const xvfb = (process.env.PATH || '').split(delimiter).some((d) => d && existsSync(join(d, 'xvfb-run')));
  if (!xvfb) sinVerificar('sin pantalla ni xvfb-run');
  return ['xvfb-run', '-a'];
}

async function main() {
  for (const a of opciones) {
    if (!FLAGS.includes(a)) {
      console.error(`opción desconocida: ${a} (node tools/check.mjs ${FLAGS.map((f) => `[${f}]`).join(' ')})`);
      process.exit(1);
    }
  }
  mkdirSync(logs, { recursive: true });
  const cambios = diff();
  const toca = (re) => cambios === null || cambios.some((f) => re.test(f));
  const conE2E = opciones.has('--e2e') || (!opciones.has('--sin-e2e') && toca(RE_E2E));
  const langs = opciones.has('--langs') || toca(RE_LANGS);
  const conAudit = opciones.has('--auditar') || (!opciones.has('--sin-auditar') && toca(RE_AUDIT));

  // 1. sintaxis
  const t0 = Date.now();
  const archivos = git(['ls-files', '--', '*.js', '*.mjs', '*.cjs']).stdout.split('\n').filter((f) => f && !f.startsWith('vendor/'));
  const malos = [];
  let i = 0;
  const obrero = async () => {
    while (i < archivos.length) {
      const f = archivos[i++];
      const err = await new Promise((res) => {
        const p = spawn(process.execPath, ['--check', f], { cwd: root });
        let texto = '';
        p.stderr.on('data', (d) => (texto += d));
        p.on('error', (e) => res(e.message));
        p.on('close', (code) => res(code === 0 ? null : texto || `código ${code}`));
      });
      if (err) malos.push(`${f}\n${err}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, obrero));
  mkdirSync(logs, { recursive: true });
  writeFileSync(join(logs, 'node-check.log'), malos.join('\n'));
  if (malos.length) falla('node --check', { status: 1, salida: malos.join('\n'), log: 'node-check' });
  console.log(`ok  node --check (${archivos.length} archivos, ${dur(Date.now() - t0)})`);

  // 2. node --test
  const tests = correr('node-test', process.execPath, ['--test']);
  const nTests = +(/^# tests (\d+)/m.exec(tests.salida) || [])[1] || 0;
  const nFail = +(/^# fail (\d+)/m.exec(tests.salida) || [])[1] || 0;
  if (tests.status !== 0 || nFail > 0 || !nTests) falla('node --test', tests);
  console.log(`ok  node --test ${nTests - nFail}/${nTests} (${dur(tests.ms)})`);

  // 3. traducciones
  const i18n = correr('i18n', process.execPath, [join(root, 'tools', 'check-i18n.mjs')]);
  const mI18n = /(\d+) idioma\(s\) revisados, (\d+) error\(es\)/.exec(i18n.salida);
  if (i18n.status !== 0 || !mI18n || +mI18n[2] > 0) falla('i18n', i18n);
  console.log(`ok  i18n ${mI18n[1]} idiomas, ${mI18n[2]} errores (${dur(i18n.ms)})`);

  // 4. las reglas del loop
  const lp = correr('loop-check', process.execPath, [join(root, 'tools', 'loop.mjs'), '--check']);
  if (lp.status !== 0) falla('loop --check', lp);
  console.log(`ok  loop --check (${dur(lp.ms)})`);

  // 5. el entorno de las pruebas en el navegador (antes del smoke, que tarda 2 minutos)
  const ruta = chromium();
  if (pedido(ruta)) console.log(`Chromium: ${ruta}`);
  const entorno = { ...process.env, PLAYWRIGHT_CHROMIUM_PATH: ruta };
  const prefijo = conE2E ? entornoE2E() : [];

  // 6. el smoke
  // un paso que falló una vez se repite con su sección sola, no con la puerta entera (ver la cabecera)
  const argsSmoke = [join(root, 'tools', 'smoke.mjs'), ...(langs ? ['--langs'] : [])];
  let corrida = 0;
  const v = validarSmoke((extra) => correr(corrida++ ? `smoke-repeticion-${corrida - 1}` : 'smoke', process.execPath, [...argsSmoke, ...extra], entorno), {
    avisar: (f) => {
      console.log(`smoke: ${f.pasos.length} paso(s) en rojo; se repite solo su sección (${f.secciones.map((x) => `«${x}»`).join(', ')})`);
      for (const p of f.errores) console.log(`  ✗ ${p.slice(0, 300)}`);
    },
  });
  const smoke = v.primera;
  if (v.rojo) {
    if (v.motivo) console.log(`smoke: ${v.motivo}. La primera corrida está en test-results/check/smoke.log.`);
    falla('smoke', v.rojo);
  }
  const intermitentes = v.intermitentes.map((p) => nombrePaso(p));
  const repeticion = intermitentes.length ? `; ${intermitentes.length} en rojo la primera vez, en verde al repetir su sección (${dur(v.ms)})` : '';
  const pasos = (smoke.salida.match(/✓/g) || []).length + fallosSmoke(smoke.salida).pasos.length;
  const idiomas = (/(\d+) idiomas/.exec(smoke.salida) || [])[1];
  console.log(`ok  smoke ${pasos} pasos${langs ? `, ${idiomas} idiomas` : ''} (${dur(smoke.ms)}${repeticion})`);
  for (const p of intermitentes) console.log(`Intermitente: «${p}» falló una vez en el smoke y pasó al repetir su sección. Si es del cambio (un paso nuevo, o de lo que toca el diff), se arregla; si es ajeno, se anota en su pendiente [Deuda] de Mantenimiento.`);

  // 7. la auditoría: hallazgos nuevos frente a tools/audit-base.json (falla solo si se repiten en dos corridas)
  let audit = null;
  if (conAudit) {
    const r = correr('auditoria', process.execPath, [join(root, 'tools', 'audit.mjs'), '--puerta'], entorno);
    if (r.status === 2) sinVerificar(`la auditoría no pudo correr: ${r.salida.trim().split('\n').pop()}`);
    if (r.status !== 0) falla('auditoría', r);
    const m = /Auditoría: (\d+) hallazgos nuevos, (\d+) conocidos/.exec(r.salida);
    if (!m) falla('auditoría', r);
    audit = { nuevos: +m[1], conocidos: +m[2] };
    console.log(`ok  auditoría ${audit.nuevos} hallazgos nuevos, ${audit.conocidos} conocidos (${dur(r.ms)})`);
  } else console.log(opciones.has('--sin-auditar') ? 'auditoría: saltada por --sin-auditar' : 'auditoría: no corrida (el cambio no toca la página)');

  // 8. las e2e
  let e2e = null;
  if (conE2E) {
    const args = [playwrightCli, 'test', ...(opciones.has('--lento') ? [] : ['--grep-invert', '@lento'])];
    const r = prefijo.length ? correr('e2e', prefijo[0], [...prefijo.slice(1), process.execPath, ...args], entorno) : correr('e2e', process.execPath, args, entorno);
    const passed = +(/(\d+) passed/.exec(r.salida) || [])[1] || 0;
    if (r.status !== 0 || !passed) falla('e2e', r);
    e2e = passed;
    console.log(`ok  e2e ${passed} passed (${dur(r.ms)})`);
  } else console.log(opciones.has('--sin-e2e') ? 'e2e: saltadas por --sin-e2e' : 'e2e: no corridas (el cambio no toca la página ni el escritorio)');

  const notas = [...(langs ? [`${idiomas} idiomas`] : []), ...(intermitentes.length ? [`intermitente, en verde al repetir su sección: ${intermitentes.map((p) => `«${p}»`).join(', ')}`] : [])];
  const smokeTxt = notas.length ? `smoke (${notas.join('; ')})` : 'smoke';
  const auditTxt = audit ? `, auditoría (${audit.nuevos} hallazgos nuevos, ${audit.conocidos} conocidos)` : '';
  const base = `Validado: ${nTests} pruebas (\`node --test\`), ${smokeTxt}, i18n (${mI18n[2]} errores)${auditTxt}`;
  console.log(e2e === null ? `${base} en verde; e2e no corridas (${opciones.has('--sin-e2e') ? 'saltadas por --sin-e2e' : 'no toca la página ni el escritorio'}).` : `${base} y ${e2e} e2e en verde.`);
}

if (directo) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });
}
