#!/usr/bin/env node
/* Pruebas del reporte de errores opcional con Sentry de la app de escritorio (electron/sentry.js): qué DSN se acepta,
   que sin DSN o apagado no se inicia nada ni sale nada a la red, y que lo que sale va sin tokens, cabeceras, URLs,
   nombres de repos, ramas o personas, rutas de este equipo ni la IP. El envío usa un transporte falso: ningún
   evento sale de la prueba.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/sentry.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sentry = createRequire(import.meta.url)('../electron/sentry.js');

const KEY = '0123456789abcdef0123456789abcdef';
const DSN = `https://${KEY}@o12345.ingest.us.sentry.io/4507654321`;
/** Lo que no puede salir, en un mismo error: un token, una cabecera, una URL de la API de GitHub, un repo, una rama,
    un usuario, un correo, una ruta de este equipo y un commit. */
const SECRETOS = {
  token: 'ghp_FAKE0123456789abcdefABCDEF0123456789',
  pat: 'github_pat_11FAKE0123456789_abcdefABCDEF',
  glpat: 'glpat-FAKEabcdef0123456789xyz',
  bearer: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ5byJ9.c2lnbmF0dXJlZmFrZQ',
  url: 'https://api.github.com/repos/acme-secreta/proyecto-x/branches?per_page=100',
  page: 'app://graphbranch/index.html?repo=acme-secreta/proyecto-x&lang=es',
  repo: 'acme-secreta/proyecto-x',
  branch: 'feature/clientes-nuevos',
  user: 'juanita-perez',
  person: 'Juanita Pérez',
  mail: 'juanita@example.com',
  home: '/home/juanita/proyectos/privado',
  win: 'C:\\Users\\juanita\\repos\\privado',
  sha: '9fceb02d0ae598e95dc970b74767f19372d61af8',
};
/** El usuario y la persona solo los conoce la página (las ramas, los autores y los repos que cargó). */
const NOMBRES = ['acme-secreta', 'proyecto-x', 'feature/clientes-nuevos', 'juanita-perez', 'Juanita Pérez'];

const mensajeConTodo = () =>
  `fallo al leer ${SECRETOS.repo} (rama ${SECRETOS.branch}) de @${SECRETOS.user} — ${SECRETOS.person} <${SECRETOS.mail}> ` +
  `con Authorization: token ${SECRETOS.token} y Bearer ${SECRETOS.bearer}, ${SECRETOS.pat}, ${SECRETOS.glpat}, ` +
  `desde ${SECRETOS.url} en ${SECRETOS.page}; carpeta ${SECRETOS.home} y ${SECRETOS.win}, commit ${SECRETOS.sha}, ` +
  `rama '${SECRETOS.branch}' y "${SECRETOS.user}"`;

const pilaConTodo = () =>
  [
    `TypeError: ${mensajeConTodo()}`,
    '    at drawBranch (app://graphbranch/js/graph.js:120:15)',
    `    at Object.<anonymous> (app://graphbranch/js/app.js?repo=${SECRETOS.repo}:44:3)`,
    `    at ${SECRETOS.home}/otra/cosa.js:1:1`,
    '    at async Promise.all (index 0)',
    '    at app://graphbranch/js/sources/github.js:77:9',
  ].join('\n');

function transporteFalso({ status = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body });
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null } };
  };
  return { calls, fetch };
}

const carpeta = () => mkdtempSync(join(tmpdir(), 'gb-sentry-'));

test('solo se acepta un DSN https de Sentry con su clave y su proyecto; http solo local y solo si se permite', () => {
  const d = sentry.parseDsn(DSN);
  assert.equal(d.key, KEY);
  assert.equal(d.projectId, '4507654321');
  assert.equal(d.url, 'https://o12345.ingest.us.sentry.io/api/4507654321/envelope/');
  assert.equal(d.origin, 'https://o12345.ingest.us.sentry.io');
  // uno propio, con puerto y ruta
  assert.equal(sentry.parseDsn(`https://${KEY}@sentry.example.com:9000/sub/42`).url, 'https://sentry.example.com:9000/sub/api/42/envelope/');
  // la clave secreta de los DSN viejos nunca se usa
  assert.equal(sentry.parseDsn(`https://${KEY}:secretoviejo@sentry.example.com/42`).dsn.includes('secretoviejo'), false);
  for (const bad of ['', '   ', 'no es un dsn', `http://${KEY}@o1.ingest.sentry.io/1`, `https://o1.ingest.sentry.io/1`, `https://${KEY}@o1.ingest.sentry.io/`, `https://${KEY}@o1.ingest.sentry.io/abc`, `ftp://${KEY}@o1.ingest.sentry.io/1`, `https://${KEY}@o1.ingest.sentry.io/1?x=1`, `https://bad key@o1.ingest.sentry.io/1`, null, undefined, 42]) {
    assert.equal(sentry.parseDsn(bad), null, String(bad));
  }
  // http, solo a esta máquina y solo si quien llama lo permite (la app sin empaquetar, para las pruebas)
  assert.equal(sentry.parseDsn(`http://${KEY}@127.0.0.1:9123/1`), null);
  assert.equal(sentry.parseDsn(`http://${KEY}@127.0.0.1:9123/1`, { allowLocal: true }).url, 'http://127.0.0.1:9123/api/1/envelope/');
  assert.equal(sentry.parseDsn(`http://${KEY}@example.com/1`, { allowLocal: true }), null);
});

test('el texto de un error sale sin tokens, cabeceras, URLs, correos, rutas, commits ni los nombres que conoce la página', () => {
  const out = sentry.scrubText(mensajeConTodo(), NOMBRES);
  for (const [k, v] of Object.entries(SECRETOS)) assert.equal(out.includes(v), false, `${k} quedó en «${out}»`);
  for (const parte of ['acme-secreta', 'proyecto-x', 'clientes-nuevos', 'juanita', 'Pérez', 'ghp_', 'github_pat_', 'glpat-', 'eyJ', 'api.github.com', '/home/', 'Users']) {
    assert.equal(out.includes(parte), false, `${parte} quedó en «${out}»`);
  }
  // lo que sirve para entender el fallo sigue ahí
  assert.match(out, /^fallo al leer /);
  // los errores de V8 conservan la propiedad que se leyó (un nombre del código, no un dato)
  assert.equal(sentry.scrubText("Cannot read properties of undefined (reading 'sha')"), "Cannot read properties of undefined (reading 'sha')");
  assert.equal(sentry.scrubText('x.map is not a function'), 'x.map is not a function');
  // pero no un nombre que la página conoce, aunque parezca del código
  assert.equal(sentry.scrubText("Cannot read properties of undefined (reading 'proyectox')", ['proyectox']).includes('proyectox'), false);
  // un texto entre comillas que no es eso, fuera
  assert.equal(sentry.scrubText("rama 'main' no está").includes('main'), false);
  // largo acotado
  assert.ok(sentry.scrubText('a'.repeat(5000)).length <= 500);
  assert.equal(sentry.scrubText(undefined), '');
});

test('la pila solo lleva los archivos de la app, sin la consulta ni rutas de este equipo, y en el orden de Sentry', () => {
  const root = '/opt/GraphBranch/resources/app.asar';
  const frames = sentry.frames(pilaConTodo() + `\n    at createWindow (${root}/electron/main.js:210:7)\n    at node:internal/process/task_queues:95:5`, { appRoot: root });
  // del más viejo al más nuevo (Sentry los quiere al revés que V8)
  assert.deepEqual(
    frames.map((f) => [f.filename, f.function, f.lineno, f.colno, f.in_app]),
    [
      ['node:internal/process/task_queues', '?', 95, 5, false],
      ['app:///electron/main.js', 'createWindow', 210, 7, true],
      ['app:///js/sources/github.js', '?', 77, 9, true],
      ['app:///js/app.js', 'Object.<anonymous>', 44, 3, true],
      ['app:///js/graph.js', 'drawBranch', 120, 15, true],
    ],
  );
  const text = JSON.stringify(frames);
  for (const [k, v] of Object.entries(SECRETOS)) assert.equal(text.includes(v), false, `${k} quedó en la pila`);
  assert.equal(text.includes('juanita'), false);
  // como mucho 30, los más nuevos
  const larga = ['Error: x', ...Array.from({ length: 80 }, (_, i) => `    at f${i} (app://graphbranch/js/app.js:${i + 1}:1)`)].join('\n');
  const cortas = sentry.frames(larga);
  assert.equal(cortas.length, 30);
  assert.equal(cortas.at(-1).function, 'f0');
  assert.deepEqual(sentry.frames(undefined), []);
});

test('sin DSN no se inicia nada: no aparece en Ajustes, no se puede prender, no vigila el proceso y no sale nada', async () => {
  const dir = carpeta();
  const t = transporteFalso();
  const proc = new EventEmitter();
  for (const dsn of ['', 'no es un dsn', `http://${KEY}@o1.ingest.sentry.io/1`]) {
    const r = sentry.createReports({ dsn, consentFile: join(dir, 'error-reports.json'), fetch: t.fetch, process: proc, appRoot: '/app' });
    assert.deepEqual(r.state(), { available: false, enabled: false });
    assert.deepEqual(r.set(true), { available: false, enabled: false });
    assert.equal(existsSync(join(dir, 'error-reports.json')), false, 'sin DSN no se guarda nada');
    assert.deepEqual(await r.report({ kind: 'error', type: 'Error', message: 'x', stack: '' }, []), { sent: false });
    proc.emit('uncaughtExceptionMonitor', new Error('del proceso principal'));
  }
  assert.equal(proc.listenerCount('uncaughtExceptionMonitor'), 0);
  assert.equal(t.calls.length, 0);
});

test('con DSN pero apagado (lo de fábrica), nada sale y nada vigila el proceso principal', async () => {
  const dir = carpeta();
  const t = transporteFalso();
  const proc = new EventEmitter();
  const r = sentry.createReports({ dsn: DSN, consentFile: join(dir, 'error-reports.json'), fetch: t.fetch, process: proc, appRoot: '/app' });
  assert.deepEqual(r.state(), { available: true, enabled: false });
  assert.deepEqual(await r.report({ kind: 'error', type: 'Error', message: 'x', stack: '' }, []), { sent: false });
  assert.equal(proc.listenerCount('uncaughtExceptionMonitor'), 0);
  // un archivo de consentimiento dañado o de otra forma cuenta como apagado
  writeFileSync(join(dir, 'error-reports.json'), '{"enabled":"sí"}');
  assert.equal(sentry.createReports({ dsn: DSN, consentFile: join(dir, 'error-reports.json'), fetch: t.fetch, process: proc }).state().enabled, false);
  writeFileSync(join(dir, 'error-reports.json'), 'no es json');
  assert.equal(sentry.createReports({ dsn: DSN, consentFile: join(dir, 'error-reports.json'), fetch: t.fetch, process: proc }).state().enabled, false);
  assert.equal(t.calls.length, 0);
});

test('prendido, un error con un token, una URL de api.github.com, un repo, una rama y un usuario sale sin ninguno, tampoco en las migas', async () => {
  const dir = carpeta();
  const file = join(dir, 'error-reports.json');
  const t = transporteFalso();
  const proc = new EventEmitter();
  const r = sentry.createReports({ dsn: DSN, consentFile: file, fetch: t.fetch, process: proc, appRoot: '/app', release: 'graphbranch@0.1.0', environment: 'production', os: 'linux', runtime: '45.3.2', now: () => 1_763_380_000_000 });
  assert.deepEqual(r.set(true), { available: true, enabled: true });
  // el consentimiento queda en su archivo, solo para este usuario
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { enabled: true });
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(proc.listenerCount('uncaughtExceptionMonitor'), 1);

  const res = await r.report({ kind: 'error', type: 'TypeError', message: mensajeConTodo(), stack: pilaConTodo() }, NOMBRES);
  assert.deepEqual(res, { sent: true, status: 200 });
  assert.equal(t.calls.length, 1);
  const { url, init, body } = t.calls[0];
  assert.equal(url, 'https://o12345.ingest.us.sentry.io/api/4507654321/envelope/');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers['Content-Type'], 'application/x-sentry-envelope');
  assert.equal(init.headers['X-Sentry-Auth'], `Sentry sentry_version=7, sentry_client=graphbranch/0.1.0, sentry_key=${KEY}`);
  assert.equal(Object.keys(init.headers).sort().join(), 'Content-Type,X-Sentry-Auth', 'ninguna otra cabecera');
  // el sobre: su cabecera, la del ítem con su largo en bytes y el evento
  const [head, itemHead, payload, rest] = body.split('\n');
  assert.equal(rest, '');
  const event = JSON.parse(payload);
  assert.deepEqual(JSON.parse(itemHead), { type: 'event', length: Buffer.byteLength(payload) });
  assert.deepEqual(Object.keys(JSON.parse(head)).sort(), ['dsn', 'event_id', 'sent_at']);
  assert.equal(JSON.parse(head).event_id, event.event_id);
  assert.match(event.event_id, /^[0-9a-f]{32}$/);
  // solo lo que dice Ajustes: el error, dónde en el código, la versión, el entorno y el sistema
  assert.deepEqual(Object.keys(event).sort(), ['contexts', 'environment', 'event_id', 'exception', 'level', 'platform', 'release', 'sdk', 'tags', 'timestamp']);
  assert.equal(event.release, 'graphbranch@0.1.0');
  assert.equal(event.environment, 'production');
  assert.equal(event.platform, 'javascript');
  assert.equal(event.timestamp, 1_763_380_000);
  assert.deepEqual(event.sdk, { name: 'graphbranch.errors', version: '0.1.0', settings: { infer_ip: 'never' } }); // que Sentry no guarde la IP
  assert.deepEqual(event.contexts, { os: { name: 'Linux' }, runtime: { name: 'Electron', version: '45.3.2' } });
  assert.deepEqual(event.tags, { process: 'renderer' });
  const ex = event.exception.values[0];
  assert.equal(ex.type, 'TypeError');
  assert.deepEqual(ex.mechanism, { type: 'onerror', handled: false });
  assert.equal(ex.stacktrace.frames.at(-1).filename, 'app:///js/graph.js');
  for (const k of ['user', 'request', 'breadcrumbs', 'server_name', 'extra', 'modules']) assert.equal(k in event, false, `el evento lleva ${k}`);
  for (const [k, v] of Object.entries(SECRETOS)) assert.equal(body.includes(v), false, `${k} salió en el sobre`);
  for (const parte of ['acme-secreta', 'proyecto-x', 'clientes-nuevos', 'juanita', 'Pérez', 'api.github.com', 'index.html?']) assert.equal(body.includes(parte), false, `${parte} salió en el sobre`);

  // el mismo error otra vez no sale de nuevo, y una promesa rechazada sale como tal
  assert.deepEqual(await r.report({ kind: 'error', type: 'TypeError', message: mensajeConTodo(), stack: pilaConTodo() }, NOMBRES), { sent: false });
  await r.report({ kind: 'rejection', type: '', message: `sin catch ${SECRETOS.token}`, stack: '' }, []);
  assert.equal(t.calls.length, 2);
  const rej = JSON.parse(t.calls[1].body.split('\n')[2]).exception.values[0];
  assert.deepEqual([rej.type, rej.mechanism.type], ['UnhandledRejection', 'onunhandledrejection']);
  assert.equal(t.calls[1].body.includes(SECRETOS.token), false);

  // un error del proceso principal, también limpio y con sus archivos relativos a la app
  const err = new Error(`no se pudo abrir ${SECRETOS.home}/x.json con ${SECRETOS.token}`);
  err.stack = `Error: ${err.message}\n    at leer (/app/electron/git.js:12:3)\n    at ${SECRETOS.home}/fuera.js:1:1`;
  proc.emit('uncaughtExceptionMonitor', err);
  await new Promise((ok) => setImmediate(ok));
  assert.equal(t.calls.length, 3);
  const main = JSON.parse(t.calls[2].body.split('\n')[2]);
  assert.deepEqual(main.tags, { process: 'main' });
  assert.deepEqual(main.exception.values[0].stacktrace.frames.map((f) => f.filename), ['app:///electron/git.js']);
  assert.equal(t.calls[2].body.includes('juanita'), false);
  assert.equal(t.calls[2].body.includes(SECRETOS.token), false);

  // apagarlo deja de mandar en el momento, también los del proceso principal
  assert.deepEqual(r.set(false), { available: true, enabled: false });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { enabled: false });
  assert.deepEqual(await r.report({ kind: 'error', type: 'Error', message: 'otro', stack: '' }, []), { sent: false });
  proc.emit('uncaughtExceptionMonitor', new Error('otro del principal'));
  await new Promise((ok) => setImmediate(ok));
  assert.equal(t.calls.length, 3);
  // y al reabrir la app, sigue apagado; prenderlo de nuevo no suma otro vigilante
  const again = sentry.createReports({ dsn: DSN, consentFile: file, fetch: t.fetch, process: proc });
  assert.equal(again.state().enabled, false);
  r.set(true);
  assert.equal(proc.listenerCount('uncaughtExceptionMonitor'), 1);
});

test('un torrente de errores no inunda Sentry: hasta 10 por sesión, y un 429 o una clave rechazada lo para', async () => {
  const dir = carpeta();
  let t = transporteFalso();
  let r = sentry.createReports({ dsn: DSN, consentFile: join(dir, 'a.json'), fetch: t.fetch, process: new EventEmitter() });
  r.set(true);
  for (let i = 0; i < 25; i++) await r.report({ kind: 'error', type: 'Error', message: `fallo número ${i}`, stack: '' }, []);
  assert.equal(t.calls.length, 10);
  for (const status of [429, 401, 403]) {
    t = transporteFalso({ status });
    r = sentry.createReports({ dsn: DSN, consentFile: join(dir, `b${status}.json`), fetch: t.fetch, process: new EventEmitter() });
    r.set(true);
    assert.deepEqual(await r.report({ kind: 'error', type: 'Error', message: 'uno', stack: '' }, []), { sent: false, status });
    await r.report({ kind: 'error', type: 'Error', message: 'dos', stack: '' }, []);
    assert.equal(t.calls.length, 1, `después de un ${status} no se manda más`);
  }
  // sin red, el error no rompe nada: dice que no salió
  r = sentry.createReports({ dsn: DSN, consentFile: join(dir, 'c.json'), fetch: async () => { throw new Error('sin red'); }, process: new EventEmitter() });
  r.set(true);
  assert.deepEqual(await r.report({ kind: 'error', type: 'Error', message: 'x', stack: '' }, []), { sent: false, status: 0 });
});

test('lo que manda la página se acota: tipos raros, textos larguísimos y listas de nombres enormes', async () => {
  const dir = carpeta();
  const t = transporteFalso();
  const r = sentry.createReports({ dsn: DSN, consentFile: join(dir, 'e.json'), fetch: t.fetch, process: new EventEmitter() });
  r.set(true);
  for (const bad of [null, 'texto', 42, { kind: 'otro', message: 'x' }, { kind: 'error', message: 7 }]) assert.deepEqual(await r.report(bad, []), { sent: false });
  await r.report({ kind: 'error', type: 'Tipo<script>', message: 'm'.repeat(100_000), stack: 'Error\n'.repeat(50_000) }, Array.from({ length: 100_000 }, (_, i) => `rama-${i}`));
  assert.equal(t.calls.length, 1);
  const ev = JSON.parse(t.calls[0].body.split('\n')[2]);
  assert.equal(ev.exception.values[0].type, 'Error');
  assert.ok(ev.exception.values[0].value.length <= 500);
  assert.ok(t.calls[0].body.length < 20_000);
  // el release y el entorno vienen de variables, solo si son un nombre válido para Sentry
  assert.equal(sentry.releaseName('graphbranch@1.2.3+4'), 'graphbranch@1.2.3+4');
  for (const bad of ['con/barra', 'con\\barra', 'con\nsalto', '.', '..', ' ', 'x'.repeat(201), '']) assert.equal(sentry.releaseName(bad, 'graphbranch@0.1.0'), 'graphbranch@0.1.0', JSON.stringify(bad));
  assert.equal(sentry.environmentName('staging'), 'staging');
  assert.equal(sentry.environmentName('con espacio', 'production'), 'production');
});
