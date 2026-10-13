#!/usr/bin/env node
/* La puerta antes de subir un cambio: corre en orden node --check, node --test, las traducciones,
   loop --check, el smoke en Chromium, la auditoría (si el cambio toca la página) y, si el cambio toca la
   página o la app de escritorio, las e2e. Se detiene en el primer rojo e imprime la línea «Validado:» que
   va a la bitácora.

     npm run check                  las e2e solo si el diff con origin/master toca la página o el escritorio
     npm run check -- --e2e         las e2e siempre
     npm run check -- --sin-e2e     las e2e nunca
     npm run check -- --langs       el smoke en los 40 idiomas (solo, si el diff toca js/locales/, css/ o index.html)
     npm run check -- --lento       las e2e con la prueba @lento (2 minutos más)
     npm run check -- --auditar     la auditoría (tools/audit.mjs --puerta) siempre; sola, si el diff toca la página
     npm run check -- --sin-auditar la auditoría nunca

   Salida: 0 todo en verde · 1 un paso falló (FALLA <paso> y sus últimas 40 líneas) · 2 no se pudo
   verificar (sin Chromium, sin Electron o sin pantalla ni xvfb-run). Elige el Chromium solo:
   PLAYWRIGHT_CHROMIUM_PATH, el de playwright-core, el más nuevo de /opt/pw-browsers o de
   PLAYWRIGHT_BROWSERS_PATH, o lo instala. Los logs completos quedan en test-results/check/ (las e2e
   vacían test-results/ al empezar: tras ellas queda solo e2e.log). */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logs = join(root, 'test-results', 'check');
const FLAGS = ['--e2e', '--sin-e2e', '--langs', '--lento', '--auditar', '--sin-auditar'];
const opciones = new Set(process.argv.slice(2));
for (const a of opciones) {
  if (!FLAGS.includes(a)) {
    console.error(`opción desconocida: ${a} (node tools/check.mjs ${FLAGS.map((f) => `[${f}]`).join(' ')})`);
    process.exit(1);
  }
}
mkdirSync(logs, { recursive: true });

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

function falla(nombre, r) {
  console.log(`FALLA ${nombre} (código ${r.status})`);
  const lineas = r.salida.trim().split('\n');
  const noOk = lineas.filter((l) => /^\s*not ok /.test(l));
  if (noOk.length) {
    console.log('  Fallaron:');
    for (const l of noOk) console.log(`  ${l.trim()}`);
  }
  for (const l of lineas.slice(-40)) console.log(`  ${l}`);
  console.log(`(la salida entera está en test-results/check/${r.log}.log)`);
  process.exit(1);
}

function sinVerificar(msg) {
  console.log(`FALLA: ${msg}`);
  process.exit(2);
}

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

/** Qué cambió frente a origin/master (más lo no versionado); null si no hay origin/master. */
function diff() {
  const d = git(['diff', '--name-only', 'origin/master']);
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
  const smoke = correr('smoke', process.execPath, [join(root, 'tools', 'smoke.mjs'), ...(langs ? ['--langs'] : [])], entorno);
  if (smoke.status !== 0) falla('smoke', smoke);
  const pasos = (smoke.salida.match(/✓/g) || []).length;
  const idiomas = (/(\d+) idiomas/.exec(smoke.salida) || [])[1];
  console.log(`ok  smoke ${pasos} pasos${langs ? `, ${idiomas} idiomas` : ''} (${dur(smoke.ms)})`);

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

  const smokeTxt = langs ? `smoke (${idiomas} idiomas)` : 'smoke';
  const auditTxt = audit ? `, auditoría (${audit.nuevos} hallazgos nuevos, ${audit.conocidos} conocidos)` : '';
  const base = `Validado: ${nTests} pruebas (\`node --test\`), ${smokeTxt}, i18n (${mI18n[2]} errores)${auditTxt}`;
  console.log(e2e === null ? `${base} en verde; e2e no corridas (${opciones.has('--sin-e2e') ? 'saltadas por --sin-e2e' : 'no toca la página ni el escritorio'}).` : `${base} y ${e2e} e2e en verde.`);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
