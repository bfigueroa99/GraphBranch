/* Reporte de errores opcional con Sentry, en la app de escritorio. Apagado por defecto: solo aparece en Ajustes si
   la app tiene un DSN (SENTRY_DSN del entorno o electron/sentry-dsn.txt, que deja quien arma el paquete; el repo no
   trae ninguno), y solo manda algo si quien la usa lo prende. Sin DSN o apagado no se inicia nada: ningún
   vigilante en el proceso principal y nada sale a la red.

   No usa el SDK de Sentry (sería una dependencia nueva y manda de fábrica la IP, el nombre del equipo, migas y
   contexto): arma a mano un sobre (envelope) con un evento hecho solo de lo que dice Ajustes (el tipo de error, su
   mensaje limpio, en qué archivo y línea del código de GraphBranch pasó, la versión de la app, el entorno y el
   sistema operativo) y lo manda el proceso principal, como los webhooks: el DSN no llega a la página y el CSP de
   index.html no cambia. Sin migas, variables locales, cuerpos, cabeceras, replay, trazas ni captura de IA, y con
   `infer_ip: 'never'` para que Sentry no guarde la IP de la conexión.

   Este archivo no usa Electron: lo prueban tools/sentry.test.mjs (con un transporte falso) y la e2e de escritorio. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SDK = { name: 'graphbranch.errors', version: '0.1.0' };
/** Por sesión de la app, como mucho: un error dentro de un bucle de dibujo no inunda Sentry. */
const MAX_EVENTS = 10;
const MAX_FRAMES = 30;
const MAX_MESSAGE = 500;
const MAX_NAMES = 5000;
const TIMEOUT = 10_000;
const OS_NAMES = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** El DSN de un proyecto de Sentry → { dsn, url, origin, key, projectId }, o null si no es uno. Solo https (http solo
    a esta máquina y solo con allowLocal: la app sin empaquetar, para las pruebas). La clave secreta de los DSN
    viejos se descarta: no hace falta para mandar eventos. */
function parseDsn(text, { allowLocal = false } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let u;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.has(u.hostname) || LOCAL_HOSTS.has(u.host.replace(/:\d+$/, ''));
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && allowLocal && local))) return null;
  if (!/^[\w-]{8,64}$/.test(u.username) || u.search || u.hash) return null;
  const parts = u.pathname.split('/');
  const projectId = parts.pop();
  if (!/^\d{1,20}$/.test(projectId)) return null;
  const prefix = parts.join('/').replace(/\/+$/, '') + '/';
  const origin = `${u.protocol}//${u.host}`;
  return {
    dsn: `${u.protocol}//${u.username}@${u.host}${prefix}${projectId}`,
    url: `${origin}${prefix}api/${projectId}/envelope/`,
    origin,
    key: u.username,
    projectId,
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Lo que se quita de un texto, en orden: lo de más adentro primero (una URL lleva rutas y nombres; una cabecera,
   un token). Mejor de más que de menos: el mensaje sirve aunque pierda un trozo. */
const RULES = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>«»“”]+/gi, '<url>'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<correo>'],
  [/\b((?:proxy-)?authorization|cookie|set-cookie|private-token|x-api-key|api-key|x-[\w-]*token[\w-]*)\s*[:=]\s*[^\n,;]+/gi, '$1: <cabecera>'],
  [/\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|gl[a-z]{2,6}-[\w-]{16,}|xox[a-z]-[\w-]{8,}|sk-[\w-]{16,}|AKIA[0-9A-Z]{16}|AT(?:ATT|BB|CTT)[\w=-]{16,}|eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,})/g, '<token>'],
  [/\b(Bearer|Basic|token)\s+[\w.~+/=-]{8,}/gi, '$1 <token>'],
  [/\b(token|password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/gi, '$1=<token>'],
  // un secreto largo sin prefijo conocido: letras y números juntos, de 32 o más
  [/(?<![\w+/=-])(?=[\w+/=-]*\d)(?=[\w+/=-]*[A-Za-z])[\w+/=-]{32,}/g, '<token>'],
  // un commit (o cualquier hexadecimal de 7 a 64, con letras y números)
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/gi, '<sha>'],
  // una ruta de este equipo, «dueño/repo» o una rama con barras: todo lo que tenga una
  [/(?:[A-Za-z]:)?[\\/]?(?:[^\s\\/'"`<>()«»“”,;]+[\\/])+[^\s\\/'"`<>()«»“”,;]*/g, '<ruta>'],
  [/@[\w-]+/g, '@<usuario>'],
];
/** Lo que V8 pone entre comillas al leer una propiedad: es un nombre del código, no un dato, y ayuda a entender el error. */
const PROPERTY = /^\((?:reading|setting) '[A-Za-z_$][\w$]{0,40}'\)$/;

/** El texto de un error sin tokens, cabeceras, URLs, correos, rutas, commits, menciones, lo que va entre comillas
    (salvo la propiedad que leyó V8) ni los `names` que conoce la página (repos, ramas, autores), y acotado. */
function scrubText(text, names = []) {
  if (typeof text !== 'string' || !text) return '';
  let s = text.slice(0, 4 * MAX_MESSAGE);
  // los nombres van primero: «feature/x» entero, antes de que la regla de las rutas lo parta
  const list = [...new Set((Array.isArray(names) ? names : []).slice(0, MAX_NAMES).filter((n) => typeof n === 'string').map((n) => n.trim().slice(0, 300)).filter((n) => n.length >= 3))];
  list.sort((a, b) => b.length - a.length);
  for (let i = 0; i < list.length; i += 200) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${list.slice(i, i + 200).map(escapeRe).join('|')})(?![\\p{L}\\p{N}_-])`, 'giu');
    s = s.replace(re, '<nombre>');
  }
  for (const [re, to] of RULES) s = s.replace(re, to);
  s = s.replace(/\((?:reading|setting) '[^'\n]*'\)|'[^'\n]{1,200}'|"[^"\n]{1,200}"|`[^`\n]{1,200}`|«[^»\n]{1,200}»|“[^”\n]{1,200}”/g, (m) => (PROPERTY.test(m) ? m : m[0] === '(' ? m.replace(/'[^']*'/, "'<texto>'") : `${m[0]}<texto>${m.at(-1)}`));
  return s.length > MAX_MESSAGE ? s.slice(0, MAX_MESSAGE - 1) + '…' : s;
}

/** El archivo de un cuadro de la pila, relativo a la app (app:///js/app.js), o null si no es de ella. */
function fileOf(loc, appRoot) {
  const clean = loc.replace(/[?#].*$/, '');
  const m = /^app:\/\/graphbranch(\/[\w./-]+)$/.exec(clean);
  if (m && !m[1].includes('..')) return 'app://' + m[1];
  if (/^node:[\w/.-]+$/.test(clean)) return clean;
  if (appRoot) {
    const rel = path.relative(appRoot, clean);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && /^[\w./\\-]+$/.test(rel)) return 'app:///' + rel.split(path.sep).join('/');
  }
  return null;
}

/** La pila de V8 → los cuadros de Sentry, del más viejo al más nuevo, solo con los archivos de la app (y los de
    node:), sin la consulta de la URL ni rutas de este equipo, como mucho los 30 más nuevos. */
function frames(stack, { appRoot = '' } = {}) {
  if (typeof stack !== 'string') return [];
  const out = [];
  for (const line of stack.slice(0, 20_000).split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const filename = fileOf(m[2], appRoot);
    if (!filename) continue;
    const fn = (m[1] || '').replace(/^(?:async|new) /, '').trim();
    out.push({
      filename,
      function: /^[\w$.<>[\] ]{1,80}$/.test(fn) ? fn : '?',
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: filename.startsWith('app://'),
    });
    if (out.length >= MAX_FRAMES) break;
  }
  return out.reverse();
}

/** El nombre de un release válido para Sentry (sin barras, saltos ni tabuladores, hasta 200), o `fallback`. */
function releaseName(v, fallback = '') {
  return typeof v === 'string' && /^[^/\\\n\r\t]{1,200}$/.test(v) && !/^(?:\.|\.\.| )$/.test(v) ? v : fallback;
}
/** El nombre de un entorno (production, staging…), o `fallback`. */
function environmentName(v, fallback = '') {
  return typeof v === 'string' && /^[\w.-]{1,64}$/.test(v) ? v : fallback;
}

const MECHANISM = { error: 'onerror', rejection: 'onunhandledrejection', main: 'onuncaughtexception' };

/** El evento de Sentry de un error ya acotado: solo los campos que dice Ajustes, nada más. */
function buildEvent(rec, { names = [], appRoot = '', release = '', environment = '', os = '', runtime = '', now = Date.now } = {}) {
  const type = /^[A-Za-z_$][\w$]{0,60}$/.test(rec.type) ? rec.type : rec.kind === 'rejection' ? 'UnhandledRejection' : 'Error';
  const event = {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: Math.floor(now() / 1000),
    platform: 'javascript',
    level: 'error',
    release: releaseName(release, `graphbranch@${SDK.version}`),
    environment: environmentName(environment, 'production'),
    exception: {
      values: [{ type, value: scrubText(rec.message, names), mechanism: { type: MECHANISM[rec.kind], handled: false }, stacktrace: { frames: frames(rec.stack, { appRoot }) } }],
    },
    contexts: { os: { name: OS_NAMES[os] || 'Other' }, runtime: { name: 'Electron', version: /^[\w.-]{1,30}$/.test(runtime) ? runtime : 'unknown' } },
    tags: { process: rec.kind === 'main' ? 'main' : 'renderer' },
    sdk: { ...SDK, settings: { infer_ip: 'never' } },
  };
  if (!event.exception.values[0].stacktrace.frames.length) delete event.exception.values[0].stacktrace;
  return event;
}

/** El sobre (envelope) de Sentry con un evento: su cabecera, la del ítem con el largo en bytes y el evento. */
function envelope(event, dsn) {
  const payload = JSON.stringify(event);
  const head = JSON.stringify({ event_id: event.event_id, sent_at: new Date(event.timestamp * 1000).toISOString(), dsn: dsn.dsn });
  return `${head}\n${JSON.stringify({ type: 'event', length: Buffer.byteLength(payload) })}\n${payload}\n`;
}

/** Lo que manda la página (o el proceso principal), acotado: { kind, type, message, stack }, o null si no es eso. */
function record(rec) {
  if (!rec || typeof rec !== 'object' || !(rec.kind in MECHANISM) || typeof rec.message !== 'string') return null;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return { kind: rec.kind, type: str(rec.type, 100), message: str(rec.message, 4 * MAX_MESSAGE), stack: str(rec.stack, 20_000) };
}

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
  let sent = 0;
  let stopped = false;
  const seen = new Set();
  let watching = false;
  const opts = { appRoot, release, environment, os, runtime, now };

  const state = () => ({ available: !!target, enabled: !!target && enabled });

  async function report(rec, names = []) {
    const r = record(rec);
    if (!target || !enabled || stopped || !r || sent >= max) return { sent: false };
    const event = buildEvent(r, { ...opts, names: Array.isArray(names) ? names : [] });
    const ex = event.exception.values[0];
    const key = `${r.kind}|${ex.type}|${ex.value}|${ex.stacktrace?.frames.at(-1)?.filename || ''}:${ex.stacktrace?.frames.at(-1)?.lineno || ''}`;
    if (seen.has(key)) return { sent: false };
    seen.add(key);
    sent++;
    let res = null;
    try {
      res = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=graphbranch/${SDK.version}, sentry_key=${target.key}` },
        body: envelope(event, target),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch {
      return { sent: false, status: 0 };
    }
    const status = res?.status || 0;
    if (status === 429 || status === 401 || status === 403) stopped = true; // Sentry pide esperar o no acepta la clave: no se insiste en esta sesión
    return { sent: status >= 200 && status < 300, status };
  }

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
