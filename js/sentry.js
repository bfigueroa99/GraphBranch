/* GraphBranch — informes de errores opcionales a Sentry: lo que comparten la web y la app de escritorio. Apagados por
   defecto: solo se ofrecen con un DSN (en escritorio, SENTRY_DSN o electron/sentry-dsn.txt; en la web, el que deja
   tools/sentry-web.mjs en index.html junto con su host en el CSP; el repo no trae ninguno) y solo mandan algo si
   quien usa la app lo prende.

   No usa el SDK de Sentry (sería una dependencia nueva y manda de fábrica la IP, el nombre del equipo, migas y
   contexto): arma a mano un sobre (envelope) con un evento hecho solo de lo que dice Ajustes (el tipo de error, su
   mensaje limpio, en qué archivo y línea del código de GraphBranch pasó, la versión de la app, el entorno y el
   sistema operativo). Sin migas, variables locales, cuerpos, cabeceras, replay, trazas ni captura de IA, y con
   `infer_ip: 'never'` para que Sentry no guarde la IP de la conexión.

   Quien llama pone el transporte y decide si está prendido: en escritorio, electron/sentry.js (el proceso principal,
   con el consentimiento en un archivo; el DSN no llega a la página); en la web, js/app.js, que carga este archivo
   solo cuando hay un informe que mandar. Sirve en el navegador (window.GB.sentry) y en Node (require: lo usan
   electron/sentry.js y las pruebas, tools/sentry.test.mjs y tools/sentry-web.test.mjs, con un transporte falso). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GB = root.GB || {}).sentry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SDK = { name: 'graphbranch.errors', version: '0.1.0' };
  /** Por sesión (en la web, por carga de la página), como mucho: un error dentro de un bucle de dibujo no inunda Sentry. */
  const MAX_EVENTS = 10;
  const MAX_FRAMES = 30;
  const MAX_MESSAGE = 500;
  const MAX_NAMES = 5000;
  const TIMEOUT = 10_000;
  /** Los sistemas que se nombran: los de Node (process.platform) y los que dice el navegador (osName). */
  const OS_NAMES = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };
  const OS_LIST = new Set(['Linux', 'macOS', 'Windows', 'Android', 'iOS', 'ChromeOS']);
  const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

  /** El DSN de un proyecto de Sentry → { dsn, url, origin, key, projectId }, o null si no es uno. Solo https (http
      solo a esta máquina y solo con allowLocal: la app de escritorio sin empaquetar, para las pruebas). La clave
      secreta de los DSN viejos se descarta: no hace falta para mandar eventos. */
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

  /* Lo que se quita de un texto, en orden: lo de más afuera primero (una URL lleva rutas y nombres; una cabecera, un
     token), después los nombres que conoce la página (RULES_AFTER va detrás, para que «feature/x» se quite entero
     antes de que la regla de las rutas lo parta) y al final lo que tiene forma de commit, de ruta o de mención. Mejor
     de más que de menos: el mensaje sirve aunque pierda un trozo. */
  const RULES = [
    [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>«»“”]+/gi, '<url>'],
    [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<correo>'],
    [/\b((?:proxy-)?authorization|cookie|set-cookie|private-token|x-api-key|api-key|x-[\w-]*token[\w-]*)\s*[:=]\s*[^\n,;]+/gi, '$1: <cabecera>'],
    [/\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|gl[a-z]{2,6}-[\w-]{16,}|xox[a-z]-[\w-]{8,}|sk-[\w-]{16,}|AKIA[0-9A-Z]{16}|AT(?:ATT|BB|CTT)[\w=-]{16,}|eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,})/g, '<token>'],
    [/\b(Bearer|Basic|token)\s+[\w.~+/=-]{8,}/gi, '$1 <token>'],
    [/\b(token|password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/gi, '$1=<token>'],
    // un secreto largo sin prefijo conocido: letras y números juntos, de 32 o más
    [/(?<![\w+/=-])(?=[\w+/=-]*\d)(?=[\w+/=-]*[A-Za-z])[\w+/=-]{32,}/g, '<token>'],
  ];
  const RULES_AFTER = [
    // un commit (o cualquier hexadecimal de 7 a 64, con letras y números)
    [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/gi, '<sha>'],
    // una ruta de este equipo, «dueño/repo» o una rama con barras: todo lo que tenga una
    [/(?:[A-Za-z]:)?[\\/]?(?:[^\s\\/'"`<>()«»“”,;]+[\\/])+[^\s\\/'"`<>()«»“”,;]*/g, '<ruta>'],
    [/@[\w-]+/g, '@<usuario>'],
  ];
  /** Lo que V8 pone entre comillas al leer una propiedad: es un nombre del código, no un dato, y ayuda a entender el error. */
  const PROPERTY = /^\((?:reading|setting) '[A-Za-z_$][\w$]{0,40}'\)$/;

  /** Los nombres que manda la página, sin repetir, de 3 caracteres o más, los largos primero, hasta 5000. */
  const nameList = (names) =>
    [...new Set((Array.isArray(names) ? names : []).slice(0, MAX_NAMES).filter((n) => typeof n === 'string').map((n) => n.trim().slice(0, 300)).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);

  /** El texto de un error sin tokens, cabeceras, URLs, correos, rutas, commits, menciones, lo que va entre comillas
      (salvo la propiedad que leyó V8) ni los `names` que conoce la página (repos, ramas, autores), y acotado. */
  function scrubText(text, names = []) {
    if (typeof text !== 'string' || !text) return '';
    let s = text.slice(0, 4 * MAX_MESSAGE);
    for (const [re, to] of RULES) s = s.replace(re, to);
    const list = nameList(names);
    for (let i = 0; i < list.length; i += 200) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${list.slice(i, i + 200).map(escapeRe).join('|')})(?![\\p{L}\\p{N}_-])`, 'giu');
      s = s.replace(re, '<nombre>');
    }
    for (const [re, to] of RULES_AFTER) s = s.replace(re, to);
    s = s.replace(/\((?:reading|setting) '[^'\n]*'\)|'[^'\n]{1,200}'|"[^"\n]{1,200}"|`[^`\n]{1,200}`|«[^»\n]{1,200}»|“[^”\n]{1,200}”/g, (m) => (PROPERTY.test(m) ? m : m[0] === '(' ? m.replace(/'[^']*'/, "'<texto>'") : `${m[0]}<texto>${m.at(-1)}`));
    return s.length > MAX_MESSAGE ? s.slice(0, MAX_MESSAGE - 1) + '…' : s;
  }

  /** El archivo de un cuadro de la app de escritorio (app://graphbranch/js/app.js → app:///js/app.js, o un módulo
      de Node), o null si no es de ella. La consulta de la URL no sale nunca. */
  function appFile(loc) {
    const clean = String(loc).replace(/[?#].*$/, '');
    const m = /^app:\/\/graphbranch(\/[\w./-]+)$/.exec(clean);
    if (m && !m[1].includes('..')) return 'app://' + m[1];
    if (/^node:[\w/.-]+$/.test(clean)) return clean;
    return null;
  }

  /** En la web: el archivo de un cuadro, relativo a la carpeta de la página (`base`, con su barra al final), con el
      mismo nombre que en escritorio (https://…/GraphBranch/js/app.js?v=1 → app:///js/app.js), o null si es de otro
      sitio (una extensión del navegador, otro script). Así el mismo fallo es el mismo issue en las dos. */
  function baseFileOf(base) {
    const root = typeof base === 'string' && /^https?:\/\/[^/]+\/(?:[^?#]*\/)?$/.test(base) ? base : null;
    return (loc) => {
      if (!root) return null;
      const clean = String(loc).replace(/[?#].*$/, '');
      if (!clean.startsWith(root)) return null;
      const rel = clean.slice(root.length);
      return /^[\w./-]+$/.test(rel) && !rel.includes('..') ? 'app:///' + rel : null;
    };
  }

  // V8 (Chromium, Electron, Node): «    at fn (url:línea:columna)» o «    at url:línea:columna»
  const V8_LINE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
  // Firefox y Safari: «fn@url:línea:columna» (fn puede faltar)
  const GECKO_LINE = /^\s*(?:([^@\s][^@]*?)@|@)?((?:[a-z][\w+.-]*:\/\/|\/)[^\s@]+?):(\d+):(\d+)\s*$/i;

  /** La pila → los cuadros de Sentry, del más viejo al más nuevo, solo con los archivos de la app (`fileOf`), sin la
      consulta de la URL ni rutas de este equipo, como mucho los 30 más nuevos. Entiende la de V8 y la de Firefox y
      Safari (que no llevan el mensaje: en la de V8, la primera línea, sí, y por eso ahí solo se leen las «at …»). */
  function frames(stack, { names = [], fileOf = appFile } = {}) {
    if (typeof stack !== 'string') return [];
    const out = [];
    // una función con el nombre de algo cargado ({ [rama]: () => … }) sale como '?'
    const known = new Set(nameList(names).map((n) => n.toLowerCase()));
    const text = stack.slice(0, 20_000);
    const v8 = /^\s*at /m.test(text);
    for (const line of text.split('\n')) {
      if (line.length > 1000) continue; // ningún cuadro es tan largo, y las expresiones de abajo no tienen por qué recorrerlo
      const m = (v8 ? V8_LINE : GECKO_LINE).exec(line);
      if (!m) continue;
      const filename = fileOf(m[2]);
      if (!filename) continue;
      const fn = (m[1] || '').replace(/^(?:async|new) /, '').replace(/[/<]+$/, '').trim();
      out.push({
        filename,
        function: /^[\w$.<>[\] ]{1,80}$/.test(fn) && !fn.split(/[.\s[\]]/).some((part) => known.has(part.toLowerCase())) ? fn : '?',
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

  /** En la web, el sistema operativo de este navegador por su nombre corriente (o 'Other'): solo eso, sin versión
      ni navegador, que es lo que dice la ayuda de Ajustes. */
  function osName(nav) {
    const platform = String(nav?.userAgentData?.platform || nav?.platform || '');
    const ua = String(nav?.userAgent || '');
    if (/Android/i.test(ua) || /^Android$/i.test(platform)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua) || /^iOS$/i.test(platform) || (/^MacIntel$/.test(platform) && Number(nav?.maxTouchPoints) > 1)) return 'iOS';
    if (/^Win/i.test(platform) || /Windows/.test(ua)) return 'Windows';
    if (/CrOS/.test(ua) || /^Chrome ?OS$/i.test(platform)) return 'ChromeOS';
    if (/^Mac/i.test(platform) || /Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/i.test(platform) || /Linux/.test(ua)) return 'Linux';
    return 'Other';
  }

  /** Un id de evento al azar (32 hexadecimales). getRandomValues anda en Node y en cualquier página. */
  function eventId() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const MECHANISM = { error: 'onerror', rejection: 'onunhandledrejection', main: 'onuncaughtexception' };

  /** La pila sin el mensaje del error: en la de V8 va al principio, y un mensaje con líneas que parecen cuadros
      («\n    at x (…/js/app.js:1:1)», o «x@…» en una pila sin cuadros) no puede colar un nombre como función. */
  const stackWithoutMessage = (rec) => (typeof rec.stack === 'string' && rec.message ? rec.stack.replace(rec.message, '') : rec.stack);

  /** El evento de Sentry de un error ya acotado: solo los campos que dice Ajustes, nada más. `surface`: 'desktop'
      (con la versión de Electron, y el proceso que falló) o 'web' (sin datos del navegador). */
  function buildEvent(rec, { names = [], fileOf = appFile, release = '', environment = '', os = '', runtime = '', surface = 'desktop', now = Date.now } = {}) {
    const type = /^[A-Za-z_$][\w$]{0,60}$/.test(rec.type) ? rec.type : rec.kind === 'rejection' ? 'UnhandledRejection' : 'Error';
    const web = surface === 'web';
    const contexts = { os: { name: OS_NAMES[os] || (OS_LIST.has(os) ? os : 'Other') } };
    if (!web) contexts.runtime = { name: 'Electron', version: /^[\w.-]{1,30}$/.test(runtime) ? runtime : 'unknown' };
    const event = {
      event_id: eventId(),
      timestamp: Math.floor(now() / 1000),
      platform: 'javascript',
      level: 'error',
      release: releaseName(release, `graphbranch@${SDK.version}`),
      environment: environmentName(environment, 'production'),
      exception: {
        values: [{ type, value: scrubText(rec.message, names), mechanism: { type: MECHANISM[rec.kind], handled: false }, stacktrace: { frames: frames(stackWithoutMessage(rec), { names, fileOf }) } }],
      },
      contexts,
      tags: { process: web ? 'web' : rec.kind === 'main' ? 'main' : 'renderer' },
      sdk: { ...SDK, settings: { infer_ip: 'never' } },
    };
    if (!event.exception.values[0].stacktrace.frames.length) delete event.exception.values[0].stacktrace;
    return event;
  }

  /** El sobre (envelope) de Sentry con un evento: su cabecera, la del ítem con el largo en bytes y el evento. */
  function envelope(event, dsn) {
    const payload = JSON.stringify(event);
    const head = JSON.stringify({ event_id: event.event_id, sent_at: new Date(event.timestamp * 1000).toISOString(), dsn: dsn.dsn });
    return `${head}\n${JSON.stringify({ type: 'event', length: new TextEncoder().encode(payload).length })}\n${payload}\n`;
  }

  /** Lo que manda la página (o el proceso principal), acotado: { kind, type, message, stack }, o null si no es eso. */
  function record(rec) {
    if (!rec || typeof rec !== 'object' || !Object.prototype.hasOwnProperty.call(MECHANISM, rec.kind) || typeof rec.message !== 'string') return null;
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    return { kind: rec.kind, type: str(rec.type, 100), message: str(rec.message, 4 * MAX_MESSAGE), stack: str(rec.stack, 20_000) };
  }

  /** Quien manda los informes de una sesión. dsn: el texto del DSN (sin uno válido, nunca manda nada); isEnabled: si
      está prendido, mirado antes de cada envío (apagarlo corta en el momento); fetch: el transporte (net.fetch en
      escritorio, el de la página en la web, uno falso en las pruebas). auth: 'header' (X-Sentry-Auth, desde el
      proceso principal) o 'query' (en la URL, como el SDK del navegador: así la página no hace una consulta previa
      de CORS, y sin cookies ni referer). Hasta `max` por sesión, cada error una vez, y un 429, 401 o 403 corta los
      demás. */
  function createClient({ dsn = '', allowLocal = false, isEnabled = () => true, fetch, auth = 'header', fileOf = appFile, release = '', environment = '', os = '', runtime = '', surface = 'desktop', now = Date.now, max = MAX_EVENTS } = {}) {
    const target = parseDsn(dsn, { allowLocal });
    let sent = 0;
    let stopped = false;
    const seen = new Set();
    const opts = { fileOf, release, environment, os, runtime, surface, now };
    const client = `graphbranch/${SDK.version}`;

    async function report(rec, names = []) {
      const r = record(rec);
      if (!target || !isEnabled() || stopped || !r || sent >= max || typeof fetch !== 'function') return { sent: false };
      const event = buildEvent(r, { ...opts, names: Array.isArray(names) ? names : [] });
      const ex = event.exception.values[0];
      const key = `${r.kind}|${ex.type}|${ex.value}|${ex.stacktrace?.frames.at(-1)?.filename || ''}:${ex.stacktrace?.frames.at(-1)?.lineno || ''}`;
      if (seen.has(key)) return { sent: false };
      seen.add(key);
      sent++;
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined;
      const init =
        auth === 'query'
          ? // sin cabeceras propias: el cuerpo de texto va como text/plain y la consulta es «simple» para CORS
            { method: 'POST', body: envelope(event, target), redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal }
          : { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=${client}, sentry_key=${target.key}` }, body: envelope(event, target), redirect: 'error', signal };
      const url = auth === 'query' ? `${target.url}?sentry_version=7&sentry_key=${encodeURIComponent(target.key)}&sentry_client=${encodeURIComponent(client)}` : target.url;
      let res = null;
      try {
        res = await fetch(url, init);
      } catch {
        return { sent: false, status: 0 };
      }
      const status = res?.status || 0;
      if (status === 429 || status === 401 || status === 403) stopped = true; // Sentry pide esperar o no acepta la clave: no se insiste en esta sesión
      return { sent: status >= 200 && status < 300, status };
    }

    return { available: !!target, report };
  }

  return { SDK, MAX_EVENTS, parseDsn, scrubText, appFile, baseFileOf, frames, releaseName, environmentName, osName, buildEvent, envelope, record, createClient };
});
