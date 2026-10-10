#!/usr/bin/env node
/* Pruebas de la web instalable y sin conexión: el manifiesto, el CSP y el service worker (sw.js),
   este último en un contexto aislado con una caché y una red falsas.

     node --test                 todas las pruebas (archivos *.test.mjs)
     node tools/pwa.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file));
const SITE = 'https://bfigueroa99.github.io/GraphBranch/';

const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(root, join(root, dir, e.name)).split(sep).join('/')],
  );

/** Carga sw.js con una caché y un fetch falsos. `net(request)` responde por la red (o lanza, sin red). */
function load(net) {
  const store = new Map(); // url → respuesta guardada
  const cache = {
    async addAll(requests) {
      for (const r of requests) store.set(r.url, res(200, 'guardado: ' + r.url, { cache: r.cache }));
    },
    async put(key, value) {
      store.set(String(key), value);
    },
    async keys() {
      return [...store.keys()].map((url) => ({ url }));
    },
    async delete(r) {
      return store.delete(r.url);
    },
  };
  const handlers = {};
  const self = {
    location: new URL('sw.js', SITE),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: async () => {},
    registration: { navigationPreload: { enable: async () => {} } },
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => cache, match: async (key) => store.get(String(key)) };
  class Request {
    constructor(url, init = {}) {
      this.url = String(url);
      this.cache = init.cache;
    }
  }
  const ctx = vm.createContext({ self, caches, Request, URL, fetch: async (r) => net(r) });
  vm.runInContext(readFileSync(join(root, 'sw.js'), 'utf8'), ctx, { filename: 'sw.js' });
  const files = vm.runInContext('FILES', ctx);

  /** Dispara un evento; devuelve lo que se pasó a respondWith (o null) y espera los waitUntil. */
  async function fire(type, props = {}) {
    const waits = [];
    let responded = null;
    handlers[type]({ ...props, waitUntil: (p) => waits.push(p), respondWith: (p) => (responded = p) });
    const out = responded && (await responded.catch((err) => ({ error: err })));
    for (let i = 0; i < waits.length; i++) await waits[i];
    return { responded: !!responded, res: out };
  }
  const get = (url, more = {}) => fire('fetch', { request: { url: new URL(url, SITE).href, method: 'GET', mode: 'cors', ...more } });
  return { store, files: Array.from(files), fire, get };
}

function res(status, body, more = {}) {
  return { status, ok: status >= 200 && status < 300, type: 'basic', redirected: false, body, ...more, clone() { return { ...this }; } };
}
const offline = () => {
  throw new TypeError('Failed to fetch');
};

test('el service worker guarda todo lo que la página puede pedir, y nada más', () => {
  const { files } = load(offline);
  const expected = ['index.html', 'manifest.webmanifest', ...['icons', 'css', 'js', 'vendor'].flatMap(walk)];
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(files), sorted(expected), 'FILES de sw.js tiene que listar cada archivo de icons/, css/, js/ y vendor/');
  // y la página no pide nada fuera de esa lista
  const html = read('index.html').toString();
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
  for (const ref of refs) assert.ok(files.includes(ref), `index.html pide ${ref}, que sw.js no guarda`);
});

test('al instalarse guarda la página entera revalidando con el servidor', async () => {
  const { store, files, fire } = load(offline);
  await fire('install');
  assert.deepEqual([...store.keys()].sort(), files.map((f) => new URL(f, SITE).href).sort());
  assert.ok([...store.values()].every((r) => r.cache === 'no-cache'));
});

test('nunca toca la API de GitHub, los avatares ni otro sitio', async () => {
  const seen = [];
  const { store, get, fire } = load((r) => (seen.push(r.url), res(200, 'red')));
  for (const url of [
    'https://api.github.com/repos/o/r/branches',
    'https://api.github.com/graphql',
    'https://avatars.githubusercontent.com/u/1?s=64',
    'https://example.com/js/app.js',
  ]) {
    assert.equal((await get(url)).responded, false, url);
  }
  assert.equal((await fire('fetch', { request: { url: SITE + 'js/app.js', method: 'POST', mode: 'cors' } })).responded, false);
  assert.equal((await get('sw.js')).responded, false, 'el propio worker no se guarda');
  assert.equal((await get('otra/cosa.js')).responded, false);
  assert.equal(store.size, 0);
  assert.deepEqual(seen, []);
});

test('con red pide a la red y pone al día la copia; sin red sirve la copia', async () => {
  let online = true;
  const { store, get, fire } = load((r) => {
    if (!online) offline();
    return res(200, 'nuevo: ' + r.url);
  });
  await fire('install');
  const key = SITE + 'js/app.js';
  const first = await get('js/app.js?v=2');
  assert.equal(first.res.body, 'nuevo: ' + key + '?v=2', 'con red, la respuesta es la de la red');
  assert.equal(store.get(key).body, 'nuevo: ' + key + '?v=2', 'la copia se guarda sin la query string');
  online = false;
  assert.equal((await get('js/app.js')).res.body, 'nuevo: ' + key + '?v=2');
});

test('sin red, la página abre desde la copia con cualquier query string', async () => {
  const { get, fire } = load(offline);
  await fire('install');
  for (const url of [SITE, SITE + '?repo=o/r&tv=1', SITE + 'index.html?repo=o/r']) {
    const { responded, res: out } = await get(url, { mode: 'navigate' });
    assert.ok(responded, url);
    assert.equal(out.body, 'guardado: ' + SITE + 'index.html', url);
  }
});

test('un error del servidor no pisa la copia buena', async () => {
  const { store, get, fire } = load(() => res(404, 'no está'));
  await fire('install');
  const key = SITE + 'css/styles.css';
  assert.equal((await get('css/styles.css')).res.status, 404);
  assert.equal(store.get(key).body, 'guardado: ' + key);
});

test('al activarse borra lo que ya no forma parte de la página', async () => {
  const { store, fire } = load(offline);
  await fire('install');
  store.set(SITE + 'js/viejo.js', res(200, 'viejo'));
  await fire('activate');
  assert.equal(store.has(SITE + 'js/viejo.js'), false);
  assert.equal(store.has(SITE + 'index.html'), true);
});

test('el manifiesto, sus íconos y el CSP dejan instalar la página', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  const sizeOf = (file) => {
    const png = read(file);
    assert.equal(png.toString('latin1', 1, 4), 'PNG', file);
    return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
  };
  for (const icon of manifest.icons) assert.equal(sizeOf(icon.src), icon.sizes, icon.src);
  const any = manifest.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
  assert.ok(any.includes('192x192') && any.includes('512x512'), 'hacen falta íconos de 192 y 512');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'falta el ícono adaptable (maskable)');

  const html = read('index.html').toString();
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<script src="js\/pwa.js"><\/script>/);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1].replace(/\s+/g, ' ');
  const directive = (name) => (new RegExp(`(?:^|;) ?${name} ([^;]+)`).exec(csp) || [])[1]?.trim().split(' ') || [];
  assert.deepEqual(directive('manifest-src'), ["'self'"]);
  assert.deepEqual(directive('worker-src'), ["'self'"]);
  assert.ok(directive('img-src').includes("'self'"), 'los íconos del manifiesto se cargan como imágenes del propio sitio');
  assert.deepEqual(directive('connect-src'), ['https://api.github.com', 'https://gitlab.com'], 'el CSP sigue cerrado: solo las APIs de GitHub y GitLab');
});
