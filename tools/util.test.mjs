import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** util.js en un contexto aislado cuyo localStorage guarda lo que se le diga (válido o corrupto). */
function load(saved, hostname = 'localhost', session = {}, extra = {}) {
  const ctx = vm.createContext({
    ...extra,
    console,
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    location: { hostname },
    sessionStorage: { getItem: (k) => session[k] ?? null, setItem: (k, v) => (session[k] = v), removeItem: (k) => delete session[k] },
    localStorage: { getItem: (k) => saved[k] ?? null, setItem: (k, v) => (saved[k] = v), removeItem: (k) => delete saved[k] },
  });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(root, 'js', 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  return ctx.GB.U;
}

test('U.store.get: un valor guardado de otro tipo que el esperado devuelve el valor por defecto', () => {
  const U = load({
    'graphbranch:pins:a/b': '{}',
    'graphbranch:filter:a/b': '{"a":1}',
    'graphbranch:depth': '"muchas"',
    'graphbranch:marks': '"si"',
    'graphbranch:ok': '["x"]',
  });
  assert.deepEqual([...U.store.get('pins:a/b', [])], []);
  assert.equal(U.store.get('filter:a/b', ''), '');
  assert.equal(U.store.get('depth', 40), 40);
  assert.equal(U.store.get('marks', true), true);
  assert.deepEqual([...U.store.get('ok', [])], ['x']);
  assert.equal(U.store.get('falta', 7), 7);
  assert.equal(U.store.get('owners', null) === null, true);
});

test('U.secret: en <usuario>.github.io el token va a sessionStorage y el de localStorage se muda y se borra', () => {
  const local = { 'graphbranch:token': '"ghp_viejo"' };
  const session = {};
  const U = load(local, 'ana.github.io', session);
  assert.equal(U.secret.get('token', ''), 'ghp_viejo');
  assert.equal('graphbranch:token' in local, false);
  assert.equal(session['graphbranch:token'], '"ghp_viejo"');
  U.secret.set('token', 'ghp_nuevo');
  assert.equal(U.secret.get('token', ''), 'ghp_nuevo');
  assert.equal('graphbranch:token' in local, false);
  U.secret.set('token', null);
  assert.equal(U.secret.get('token', ''), '');
  assert.equal(Object.keys(session).length, 0);
});

test('U.secret: en el panel de VS Code (GBSessionSecrets) el token no toca localStorage, aunque el origen sea 127.0.0.1', () => {
  // el puerto del servidor local cambia en cada sesión del panel: lo que quedara en localStorage se quedaría en el disco, en un origen que nadie vuelve a abrir
  const local = { 'graphbranch:gitlabToken': '"glpat-viejo"' };
  const session = { 'graphbranch:token': '"gho_sesion"' };
  const U = load(local, '127.0.0.1', session, { GBSessionSecrets: true });
  assert.equal(U.secret.shared(), true);
  assert.equal(U.secret.get('token', ''), 'gho_sesion');
  assert.equal(U.secret.get('gitlabToken', ''), 'glpat-viejo'); // el que hubiera quedado se muda a la sesión
  assert.deepEqual(Object.keys(local), []);
  U.secret.set('codebergToken', 'cb_x');
  assert.equal(session['graphbranch:codebergToken'], '"cb_x"');
  assert.deepEqual(Object.keys(local), []);
  // sin la marca, 127.0.0.1 es un origen como cualquier otro (el de las pruebas e2e): localStorage
  assert.equal(load({}, '127.0.0.1', {}).secret.shared(), false);
  assert.equal(load({}, '127.0.0.1', {}, { GBSessionSecrets: 'sí' }).secret.shared(), false);
});

test('U.secret: en otro origen el token sigue en localStorage', () => {
  const local = {};
  const session = {};
  const U = load(local, 'graphbranch.ejemplo.com', session);
  U.secret.set('token', 'ghp_x');
  assert.equal(local['graphbranch:token'], '"ghp_x"');
  assert.equal(Object.keys(session).length, 0);
  assert.equal(U.secret.get('token', ''), 'ghp_x');
});

test('U.safeUrl: solo deja pasar http(s); javascript:, data: y lo que no es texto salen vacíos', () => {
  const U = load({});
  assert.equal(U.safeUrl('https://github.com/a/b'), 'https://github.com/a/b');
  assert.equal(U.safeUrl('http://forge.local/a'), 'http://forge.local/a');
  for (const malo of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//evil.test/x', '', null, undefined, 7, {}]) {
    assert.equal(U.safeUrl(malo), '', String(malo));
  }
});

test('ningún enlace de la interfaz arma su href con una URL de la API sin pasar por U.safeUrl', () => {
  const dir = join(root, 'js');
  const sueltos = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/href="\$\{U\.esc\((?!U\.safeUrl)([^)]*)\)\}"|\.href = (?!GB\.U\.safeUrl|U\.safeUrl)((?:\w+\.)+url)\b/g)) sueltos.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(sueltos, []);
});

test('cleanAlias: recorta, junta espacios, limita a 40 letras y vacío es sin alias', () => {
  const U = load({});
  assert.equal(U.cleanAlias('  mi   repo \n'), 'mi repo');
  assert.equal(U.cleanAlias('   '), '');
  assert.equal(U.cleanAlias(null), '');
  assert.equal(U.cleanAlias(42), '');
  assert.equal([...U.cleanAlias('a'.repeat(100))].length, 40);
  assert.equal([...U.cleanAlias('😀'.repeat(60))].length, 40); // por letras, sin partir un emoji
});

test('statusKey: un 404 o la cuota agotada no se rotulan «Sin conexión»', () => {
  const U = load({});
  assert.equal(U.statusKey({ state: 'live' }), 'status.live');
  assert.equal(U.statusKey({ state: 'error', error: { kind: 'notfound' } }), 'status.errorNotFound');
  assert.equal(U.statusKey({ state: 'error', error: { kind: 'rate' } }), 'status.errorRate');
  assert.equal(U.statusKey({ state: 'error', error: { kind: 'auth' } }), 'status.errorAuth');
  assert.equal(U.statusKey({ state: 'error', error: { kind: 'empty' } }), 'status.errorEmpty'); // un repo sin commits no es «Sin conexión»
  assert.equal(U.statusKey({ state: 'error', error: { kind: 'network' } }), 'status.error');
  assert.equal(U.statusKey({ state: 'error' }), 'status.error');
  assert.equal(U.statusKey({ state: 'inventado' }), null);
});
