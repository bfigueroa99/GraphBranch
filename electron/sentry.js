/* Reporte de errores opcional con Sentry, en la app de escritorio. Apagado por defecto: solo aparece en Ajustes si
   la app tiene un DSN (SENTRY_DSN del entorno o electron/sentry-dsn.txt, que deja quien arma el paquete; el repo no
   trae ninguno), y solo manda algo si quien la usa lo prende. Sin DSN o apagado no se inicia nada: ningún
   vigilante en el proceso principal y nada sale a la red.

   No usa el SDK de Sentry (sería una dependencia nueva y manda de fábrica la IP, el nombre del equipo, migas y
   contexto): arma a mano un sobre (envelope) con un evento hecho solo de lo que dice Ajustes (el tipo de error, su
   mensaje limpio, en qué archivo y línea del código de GraphBranch pasó, la versión de la app, el entorno y el
   sistema operativo) y lo manda el proceso principal, como los webhooks: el DSN no llega a la página y el CSP de
   index.html no cambia. Sin migas, variables locales, cuerpos, cabeceras, replay, trazas ni captura de IA, y con
   `infer_ip: 'never'` para que Sentry no guarde la IP de la conexión. La limpieza, el evento, el sobre y el envío
   son los de js/sentry.js, que usa también la web; aquí quedan el DSN, el consentimiento y el vigilante del
   proceso principal.

   Este archivo no usa Electron: lo prueban tools/sentry.test.mjs (con un transporte falso) y la e2e de escritorio. */
const fs = require('node:fs');
const path = require('node:path');
// la limpieza, el evento y el sobre son los mismos que en la web (js/sentry.js): un solo lugar que vigilar
const shared = require('../js/sentry.js');

const { parseDsn, scrubText, releaseName, environmentName, envelope, MAX_EVENTS } = shared;

/** El archivo de un cuadro de la pila, relativo a la app (app:///js/app.js), o null si no es de ella: los de la
    página (app://graphbranch/…), los de Node (node:…) y, en el proceso principal, los que están dentro de appRoot. */
function fileOf(loc, appRoot) {
  const own = shared.appFile(loc);
  if (own) return own;
  const clean = loc.replace(/[?#].*$/, '');
  if (appRoot) {
    const rel = path.relative(appRoot, clean);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /^[\w./\\-]+$/.test(rel)) return 'app:///' + rel.split(path.sep).join('/');
  }
  return null;
}

/** La pila de V8 → los cuadros de Sentry (js/sentry.js), con los archivos del proceso principal relativos a la app. */
const frames = (stack, { appRoot = '', names = [] } = {}) => shared.frames(stack, { names, fileOf: (loc) => fileOf(loc, appRoot) });

/** El evento de un error (js/sentry.js), con los archivos del proceso principal relativos a la app. */
const buildEvent = (rec, { appRoot = '', ...opts } = {}) => shared.buildEvent(rec, { ...opts, fileOf: (loc) => fileOf(loc, appRoot) });

/** El consentimiento guardado: solo `{ "enabled": true }` cuenta como prendido. */
function readConsent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))?.enabled === true;
  } catch {
    return false;
  }
}

/** El reporte de errores de una sesión de la app. dsn: el texto del DSN (sin uno válido, nada se inicia);
    consentFile: dónde queda si se prendió; fetch: el transporte (net.fetch en la app, uno falso en las pruebas);
    process: dónde se vigilan los errores del proceso principal, solo mientras esté prendido. */
function createReports({ dsn = '', allowLocal = false, consentFile, fetch, process: proc = null, appRoot = '', release = '', environment = '', os = '', runtime = '', now = Date.now, max = MAX_EVENTS } = {}) {
  const target = parseDsn(dsn, { allowLocal });
  let enabled = !!target && !!consentFile && readConsent(consentFile);
  let watching = false;
  // el envío, el tope, «cada error una vez» y el corte ante un 429 son los de js/sentry.js; aquí, con X-Sentry-Auth
  const client = shared.createClient({ dsn, allowLocal, isEnabled: () => enabled, fetch, auth: 'header', fileOf: (loc) => fileOf(loc, appRoot), release, environment, os, runtime, surface: 'desktop', now, max });

  const state = () => ({ available: !!target, enabled: !!target && enabled });
  const report = (rec, names = []) => client.report(rec, names);

  /* El vigilante del proceso principal: uncaughtExceptionMonitor solo mira (no cambia qué hace Electron con el
     error). Se pone la primera vez que se prende y mira `enabled` en cada error, así apagarlo corta en el momento. */
  const onMainError = (err) => {
    if (!enabled) return;
    report({ kind: 'main', type: err?.name, message: String(err?.message ?? err ?? ''), stack: err?.stack }, []).catch(() => {});
  };
  function watch() {
    if (watching || !proc || !target || !enabled) return;
    proc.on('uncaughtExceptionMonitor', onMainError);
    watching = true;
  }

  function set(on) {
    if (!target || !consentFile) return state();
    enabled = on === true;
    fs.mkdirSync(path.dirname(consentFile), { recursive: true });
    fs.writeFileSync(consentFile, JSON.stringify({ enabled }), { mode: 0o600 });
    fs.chmodSync(consentFile, 0o600);
    watch();
    return state();
  }

  watch();
  return { state, set, report };
}

module.exports = { parseDsn, scrubText, frames, releaseName, environmentName, buildEvent, envelope, createReports, MAX_EVENTS };
