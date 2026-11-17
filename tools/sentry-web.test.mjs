#!/usr/bin/env node
/* Pruebas de los informes de errores a Sentry en la web (ítem 226): que js/sentry.js sirve igual a la página y al
   escritorio, que la pila de Chromium, Firefox y Safari queda solo con los archivos de la página, que el sobre sale
   con la clave en la URL y sin cabeceras propias, cookies, referer, tokens, URLs, nombres ni datos del navegador, y
   que tools/sentry-web.mjs pone el DSN y su host en index.html (y los saca) sin tocar nada más. El envío usa un
   transporte falso: ningún evento sale de la prueba.

     node --test                          todas las pruebas (archivos *.test.mjs)
     node tools/sentry-web.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { apply, remove, connectSrc } from './sentry-web.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require('../js/sentry.js');

const KEY = '0123456789abcdef0123456789abcdef';
const DSN = `https://${KEY}@o12345.ingest.us.sentry.io/4507654321`;
const BASE = 'https://bfigueroa99.github.io/GraphBranch/';
const PAGE = `${BASE}index.html?repo=acme-secreta/proyecto-x&lang=es`;
const SECRETOS = ['ghp_FAKE0123456789abcdefABCDEF0123456789', 'acme-secreta', 'proyecto-x', 'feature/clientes-nuevos', 'juanita-perez', 'bfigueroa99.github.io', 'GraphBranch/', 'index.html?', 'api.github.com'];
const NOMBRES = ['acme-secreta', 'proyecto-x', 'acme-secreta/proyecto-x', 'feature/clientes-nuevos', 'juanita-perez'];
const html = readFileSync(join(root, 'index.html'), 'utf8');

function transporteFalso({ status = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body });
    return { status, ok: status >= 200 && status < 300 };
  };
  return { calls, fetch };
}

test('js/sentry.js sirve a la página (GB.sentry) y al escritorio (require): el mismo código', () => {
  const ctx = vm.createContext({ URL, TextEncoder, crypto: globalThis.crypto, AbortSignal });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(root, 'js/sentry.js'), 'utf8'), ctx, { filename: 'sentry.js' });
  assert.ok(ctx.GB?.sentry, 'en la página, js/sentry.js deja GB.sentry');
  assert.deepEqual(Object.keys(ctx.GB.sentry).sort(), Object.keys(S).sort());
  assert.equal(typeof ctx.GB.sentry.createClient, 'function');
  // el de escritorio limpia con este mismo código: un arreglo en uno vale en los dos
  const desktop = require('../electron/sentry.js');
  assert.equal(desktop.scrubText, S.scrubText);
  assert.equal(desktop.parseDsn, S.parseDsn);
  assert.equal(desktop.envelope, S.envelope);
});

test('en la web, la pila de Chromium, Firefox y Safari queda solo con los archivos de la página, como en escritorio', () => {
  const fileOf = S.baseFileOf(BASE);
  const v8 = [
    `TypeError: fallo con foo@${BASE}js/secreto.js:1:1`,
    `    at drawBranch (${BASE}js/graph.js:120:15)`,
    `    at Object.<anonymous> (${BASE}js/app.js?repo=acme-secreta/proyecto-x:44:3)`,
    '    at chrome-extension://abcdefghijklmnop/content.js:1:1',
    '    at https://bfigueroa99.github.io/OtroProyecto/js/app.js:9:9',
    `    at https://otro.example/GraphBranch/js/app.js:5:5`,
    `    at ${BASE}js/sources/github.js:77:9`,
  ].join('\n');
  assert.deepEqual(
    S.frames(v8, { fileOf }).map((f) => [f.filename, f.function, f.lineno, f.colno, f.in_app]),
    [
      ['app:///js/sources/github.js', '?', 77, 9, true],
      ['app:///js/app.js', 'Object.<anonymous>', 44, 3, true],
      ['app:///js/graph.js', 'drawBranch', 120, 15, true],
    ],
    'la primera línea de V8 es el mensaje, no un cuadro',
  );
  // Firefox y Safari: «fn@url:línea:columna», sin el mensaje; una función con el nombre de algo cargado sale como '?'
  const gecko = [`drawBranch@${BASE}js/graph.js:120:15`, `@${BASE}js/app.js?v=2:44:3`, `feature/<@${BASE}js/util.js:3:7`, `global code@${BASE}js/app.js:1:10`, '[native code]', `x@moz-extension://abc/x.js:1:1`, ''].join('\n');
  assert.deepEqual(
    S.frames(gecko, { fileOf, names: ['feature'] }).map((f) => [f.filename, f.function, f.lineno]),
    [
      ['app:///js/app.js', 'global code', 1],
      ['app:///js/util.js', '?', 3],
      ['app:///js/app.js', '?', 44],
      ['app:///js/graph.js', 'drawBranch', 120],
    ],
  );
  const text = JSON.stringify(S.frames(v8 + '\n' + gecko, { fileOf }));
  for (const v of ['bfigueroa99', 'acme-secreta', 'repo=', 'otro.example', 'extension']) assert.equal(text.includes(v), false, `${v} quedó en la pila`);
  // una carpeta que no es una URL de la página no deja pasar nada; un archivo con «..» tampoco
  for (const bad of ['', 'no es una url', 'file:///home/juanita/', 'https://x.example/sin-barra', null]) assert.equal(S.baseFileOf(bad)(`${BASE}js/app.js`), null, String(bad));
  assert.equal(fileOf(`${BASE}js/../../x.js`), null);
});

test('el sistema de este navegador, por su nombre y nada más', () => {
  const casos = [
    [{ userAgentData: { platform: 'Windows' } }, 'Windows'],
    [{ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'Windows'],
    [{ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', maxTouchPoints: 0 }, 'macOS'],
    [{ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, 'iOS'],
    [{ platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }, 'iOS'],
    [{ platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }, 'Android'],
    [{ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'Linux'],
    [{ userAgentData: { platform: 'Chrome OS' }, userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 15633.69.0)' }, 'ChromeOS'],
    [{ platform: 'PlayStation 5', userAgent: 'Mozilla/5.0 (PlayStation 5)' }, 'Other'],
    [undefined, 'Other'],
  ];
  for (const [nav, want] of casos) assert.equal(S.osName(nav), want, JSON.stringify(nav));
});

test('en la web, prendido, el sobre sale con la clave en la URL, sin cabeceras propias, cookies ni referer, y sin tokens, URLs, nombres ni datos del navegador', async () => {
  let on = false;
  const t = transporteFalso();
  const c = S.createClient({ dsn: DSN, isEnabled: () => on, fetch: t.fetch, auth: 'query', surface: 'web', fileOf: S.baseFileOf(BASE), release: 'graphbranch@0.1.0', environment: 'production', os: 'Windows', now: () => 1_763_380_000_000 });
  assert.equal(c.available, true);
  const rec = {
    kind: 'error',
    type: 'TypeError',
    message: `fallo al leer acme-secreta/proyecto-x (rama feature/clientes-nuevos) de @juanita-perez con ${SECRETOS[0]} desde ${PAGE} y https://api.github.com/repos/acme-secreta/proyecto-x`,
    stack: `TypeError: x\n    at drawBranch (${BASE}js/graph.js:120:15)\n    at ${PAGE.replace('index.html', 'js/app.js')}:44:3`,
  };
  // apagado (lo de fábrica): nada sale
  assert.deepEqual(await c.report(rec, NOMBRES), { sent: false });
  assert.equal(t.calls.length, 0);

  on = true;
  assert.deepEqual(await c.report(rec, NOMBRES), { sent: true, status: 200 });
  assert.equal(t.calls.length, 1);
  const { url, init, body } = t.calls[0];
  // como el SDK del navegador: la clave pública va en la URL y no hace falta una consulta previa de CORS
  assert.equal(url, `https://o12345.ingest.us.sentry.io/api/4507654321/envelope/?sentry_version=7&sentry_key=${KEY}&sentry_client=graphbranch%2F0.1.0`);
  assert.deepEqual(Object.keys(init).sort(), ['body', 'credentials', 'method', 'redirect', 'referrerPolicy', 'signal']);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers, undefined, 'ninguna cabecera propia: el cuerpo de texto va como text/plain');
  assert.equal(init.credentials, 'omit', 'sin cookies');
  assert.equal(init.referrerPolicy, 'no-referrer', 'sin la URL de la página (lleva ?repo=)');
  assert.equal(init.redirect, 'error');
  assert.equal(typeof body, 'string');
  const [head, itemHead, payload, rest] = body.split('\n');
  assert.equal(rest, '');
  const event = JSON.parse(payload);
  assert.deepEqual(JSON.parse(itemHead), { type: 'event', length: Buffer.byteLength(payload) });
  assert.equal(JSON.parse(head).dsn, DSN);
  assert.deepEqual(Object.keys(event).sort(), ['contexts', 'environment', 'event_id', 'exception', 'level', 'platform', 'release', 'sdk', 'tags', 'timestamp']);
  // solo el sistema: ni el navegador ni su versión, que la ayuda de Ajustes no nombra
  assert.deepEqual(event.contexts, { os: { name: 'Windows' } });
  assert.deepEqual(event.tags, { process: 'web' });
  assert.deepEqual(event.sdk.settings, { infer_ip: 'never' });
  assert.match(event.event_id, /^[0-9a-f]{32}$/);
  const ex = event.exception.values[0];
  assert.deepEqual(ex.mechanism, { type: 'onerror', handled: false });
  assert.deepEqual(ex.stacktrace.frames.map((f) => f.filename), ['app:///js/app.js', 'app:///js/graph.js']);
  for (const v of SECRETOS) assert.equal(body.includes(v), false, `${v} salió en el sobre`);

  // el mismo error no sale dos veces; apagado en otra pestaña (isEnabled lo mira antes de cada envío), tampoco otro
  assert.deepEqual(await c.report(rec, NOMBRES), { sent: false });
  on = false;
  assert.deepEqual(await c.report({ ...rec, message: 'otro fallo' }, []), { sent: false });
  assert.equal(t.calls.length, 1);

  // hasta 10 por visita, y un 429 corta los demás
  on = true;
  const torrent = transporteFalso();
  const c2 = S.createClient({ dsn: DSN, fetch: torrent.fetch, auth: 'query', surface: 'web', fileOf: S.baseFileOf(BASE) });
  for (let i = 0; i < 25; i++) await c2.report({ kind: 'error', type: 'Error', message: `fallo número ${i}`, stack: '' }, []);
  assert.equal(torrent.calls.length, 10);
  const limited = transporteFalso({ status: 429 });
  const c3 = S.createClient({ dsn: DSN, fetch: limited.fetch, auth: 'query', surface: 'web' });
  assert.deepEqual(await c3.report({ kind: 'rejection', type: '', message: 'uno', stack: '' }, []), { sent: false, status: 429 });
  await c3.report({ kind: 'rejection', type: '', message: 'dos', stack: '' }, []);
  assert.equal(limited.calls.length, 1);
  // sin DSN válido (un http remoto, uno sin clave), nunca se llama al transporte
  for (const bad of ['', `http://${KEY}@o1.ingest.sentry.io/1`, 'https://o1.ingest.sentry.io/1']) {
    const none = transporteFalso();
    const c4 = S.createClient({ dsn: bad, fetch: none.fetch, auth: 'query', surface: 'web' });
    assert.equal(c4.available, false);
    assert.deepEqual(await c4.report({ kind: 'error', type: 'Error', message: 'x', stack: '' }, []), { sent: false });
    assert.equal(none.calls.length, 0, bad);
  }
});

test('tools/sentry-web.mjs pone el DSN y solo su host en connect-src, y --quitar deja index.html como estaba', () => {
  const out = apply(html, { dsn: `https://${KEY}:secretoviejo@o12345.ingest.us.sentry.io/4507654321`, release: 'graphbranch@0.1.0', environment: 'production' });
  const meta = /<meta name="sentry-dsn"[^>]*>/.exec(out)?.[0];
  assert.ok(meta, 'falta el <meta name="sentry-dsn">');
  assert.equal(meta, `<meta name="sentry-dsn" content="${DSN}" data-release="graphbranch@0.1.0" data-environment="production" data-added-host="https://o12345.ingest.us.sentry.io">`);
  assert.equal(out.includes('secretoviejo'), false, 'la clave secreta de un DSN viejo nunca se escribe');
  // va justo después del CSP, antes que cualquier script
  assert.ok(out.indexOf(meta) > out.indexOf('http-equiv="Content-Security-Policy"') && out.indexOf(meta) < out.indexOf('<script'));
  // connect-src: lo de siempre y el host del DSN, nada más; las demás directivas, igual
  assert.deepEqual(connectSrc(out), [...connectSrc(html), 'https://o12345.ingest.us.sentry.io']);
  const sinConnect = (h) => /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(h)[1].replace(/connect-src[^;]*;/, '');
  assert.equal(sinConnect(out), sinConnect(html));
  assert.equal(out.replace('\n' + meta, '').replace(' https://o12345.ingest.us.sentry.io', ''), html, 'nada más cambia');
  // dos veces deja lo mismo, con otro DSN cambia el host, y --quitar vuelve al original byte por byte
  assert.equal(apply(out, { dsn: DSN, release: 'graphbranch@0.1.0', environment: 'production' }), out);
  const otro = apply(out, { dsn: `https://${KEY}@sentry.example.com:9000/sub/42` });
  assert.deepEqual(connectSrc(otro), [...connectSrc(html), 'https://sentry.example.com:9000']);
  assert.equal(remove(out), html);
  assert.equal(remove(otro), html);
  assert.equal(remove(html), html);

  // un host que ya estaba en connect-src (un Sentry propio en un servidor ya permitido) no se repite ni se quita
  const propio = html.replace('https://api.scorecard.dev;', 'https://api.scorecard.dev https://git.example.com;');
  const conPropio = apply(propio, { dsn: `https://${KEY}@git.example.com/7` });
  assert.equal(connectSrc(conPropio).filter((s) => s === 'https://git.example.com').length, 1);
  assert.equal(/data-added-host/.test(conPropio), false);
  assert.equal(remove(conPropio), propio);

  // lo que se escribe en el atributo va escapado: un release con comillas no abre otra etiqueta
  const raro = apply(html, { dsn: DSN, release: 'graphbranch@1"><b>x' });
  assert.equal(raro.includes('"><b>'), false);
  assert.match(raro, /data-release="graphbranch@1&quot;&gt;&lt;b&gt;x"/);

  // lo que no es un DSN de Sentry, o un archivo sin el CSP, no se escribe
  for (const bad of ['', 'no es un dsn', `http://${KEY}@o1.ingest.sentry.io/1`, 'https://o1.ingest.sentry.io/1', `https://${KEY}@o1.ingest.sentry.io/abc`]) {
    assert.throws(() => apply(html, { dsn: bad }), /no es uno de Sentry/, bad);
  }
  assert.throws(() => apply('<html><head></head></html>', { dsn: DSN }), /no tiene el CSP/);
});

test('tools/sentry-web.mjs desde la línea de comandos: escribe, no imprime el DSN ni su host, y no toca nada si algo está mal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gb-sentry-web-'));
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  const env = { ...process.env, SENTRY_DSN: '', SENTRY_RELEASE: '', SENTRY_ENVIRONMENT: '' };
  const run = (...args) => spawnSync(process.execPath, [join(root, 'tools/sentry-web.mjs'), `--html=${file}`, ...args], { encoding: 'utf8', env });

  let r = run(`--dsn=${DSN}`, '--environment=staging');
  assert.equal(r.status, 0, r.stderr);
  for (const v of [KEY, 'o12345', '4507654321']) assert.equal(r.stdout.includes(v) || r.stderr.includes(v), false, `imprimió ${v}`);
  const puesto = readFileSync(file, 'utf8');
  assert.match(puesto, /data-environment="staging"/);
  assert.match(puesto, /data-release="graphbranch@\d+\.\d+\.\d+"/, 'por defecto, el release es graphbranch@<versión de package.json>');
  // el DSN también puede venir de SENTRY_DSN
  writeFileSync(file, html);
  r = spawnSync(process.execPath, [join(root, 'tools/sentry-web.mjs'), `--html=${file}`], { encoding: 'utf8', env: { ...env, SENTRY_DSN: DSN } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, 'utf8'), puesto.replace('data-environment="staging"', 'data-environment="production"'));

  r = run('--quitar');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, 'utf8'), html);
  // un DSN que no es uno, un release o un entorno inválidos: sale 1 y el archivo queda igual
  for (const args of [[`--dsn=http://${KEY}@o1.ingest.sentry.io/1`], [`--dsn=${DSN}`, '--release=con/barra'], [`--dsn=${DSN}`, '--environment=con espacio']]) {
    r = run(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(readFileSync(file, 'utf8'), html, args.join(' '));
  }
});
