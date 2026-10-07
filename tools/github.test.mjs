#!/usr/bin/env node
/* Pruebas de la fuente de GitHub (js/sources/github.js) contra una API simulada: sin red ni navegador.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/github.test.mjs     solo estas

   La API falsa sirve el repo o/r con ETag (responde 304 si nada cambió) y puede hacer
   fallar por red una consulta concreta, para probar qué pasa con un ciclo que se corta. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');

/** Carga util.js y github.js en un contexto aislado cuyo `fetch` es el de la API falsa. */
function load(gh) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} }, // los avisos de "se usa otro modo" ensucian la salida
    setTimeout,
    clearTimeout,
    URL,
    fetch: gh.fetch,
    document: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  // i18n mínimo: los mensajes quedan como su clave
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  return ctx.GB;
}

function fakeGitHub() {
  const gh = {
    repo: { name: 'r', owner: { login: 'o' }, default_branch: 'main', html_url: 'https://github.com/o/r' },
    commits: new Map(),
    branches: new Map(), // nombre -> sha
    events: [], // lo más reciente primero, como la API
    manyBranches: false, // la lista de ramas dice que hay más páginas (modo events)
    failOnce: null, // (ruta) => true: esa consulta falla por red una vez
    onFetch: null, // (ruta) => …: corre justo antes de responder, para simular algo a mitad de un ciclo
    calls: [],
  };
  let n = 0;
  gh.commit = (sha, parent = null) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    gh.commits.set(sha, {
      sha,
      parents: parent ? [{ sha: parent }] : [],
      commit: { message: `commit ${sha}`, author: { name: 'ana', date }, committer: { date } },
      html_url: `https://github.com/o/r/commit/${sha}`,
    });
  };
  gh.event = (type, payload) => {
    const ev = { id: String(1000 + gh.events.length), type, actor: { login: 'ana' }, created_at: new Date().toISOString(), payload };
    gh.events.unshift(ev);
    return ev;
  };
  gh.push = (branch, sha, parent) => {
    gh.commit(sha, parent);
    gh.branches.set(branch, sha);
    return gh.event('PushEvent', { ref: `refs/heads/${branch}`, head: sha });
  };

  function route(path) {
    const u = new URL('https://api.github.com' + path);
    const p = u.pathname;
    if (p === '/repos/o/r') return { body: gh.repo };
    if (p === '/repos/o/r/branches') {
      const all = [...gh.branches].map(([name, sha]) => ({ name, commit: { sha }, protected: false }));
      const headers = gh.manyBranches ? { Link: '<https://api.github.com/repos/o/r/branches?per_page=100&page=2>; rel="next"' } : {};
      return { body: all.slice(0, Number(u.searchParams.get('per_page'))), headers };
    }
    if (p === '/repos/o/r/events') return { body: gh.events };
    if (p === '/repos/o/r/commits') {
      let sha = gh.branches.get(u.searchParams.get('sha')) || u.searchParams.get('sha');
      if (!gh.commits.has(sha)) return { status: 404, body: { message: 'No commit found' } };
      const out = [];
      while (sha && out.length < Number(u.searchParams.get('per_page'))) {
        const c = gh.commits.get(sha);
        out.push(c);
        sha = c.parents[0]?.sha;
      }
      return { body: out };
    }
    if (p.startsWith('/repos/o/r/pulls')) return { body: [] };
    if (p.startsWith('/repos/o/r/compare/')) return { body: { total_commits: 1, ahead_by: 1, commits: [] } };
    return { status: 404, body: { message: 'Not Found' } };
  }

  gh.fetch = async (url, opts = {}) => {
    const path = url.replace('https://api.github.com', '');
    gh.calls.push(path);
    gh.onFetch?.(path);
    if (gh.failOnce?.(path)) {
      gh.failOnce = null;
      throw new TypeError('Failed to fetch');
    }
    const { status = 200, body, headers = {} } = route(path);
    const json = JSON.stringify(body);
    const etag = `"${json.length}-${[...json].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)}"`;
    const inm = opts.headers?.['If-None-Match'];
    const res = (st, b, h) => {
      const hs = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
      return { status: st, ok: st >= 200 && st < 300, headers: { get: (k) => hs.get(k.toLowerCase()) ?? null }, json: async () => JSON.parse(b) };
    };
    if (status === 200 && inm === etag) return res(304, 'null', headers);
    return res(status, json, status === 200 ? { ...headers, ETag: etag } : headers);
  };
  return gh;
}

/** Fuente sin token conectada a la API falsa; `cycle()` corre un ciclo de sondeo completo. */
function connect(gh) {
  const GB = load(gh);
  const src = new GB.GitHubSource({ owner: 'o', name: 'r' });
  const updates = [];
  const errors = [];
  src.on('update', (u) => updates.push(u));
  src.on('status', (s) => s.state === 'error' && errors.push(s.error));
  src.running = true;
  src.cycle = async () => {
    await src.loop();
    clearTimeout(src.timer); // el próximo ciclo lo corre la prueba
  };
  return { src, updates, errors };
}

/** Las actividades que vienen de eventos del repo (en un arreglo de este contexto, no del de la app). */
const ids = (u) => Array.from(u?.activities || [], (a) => a.id).filter((id) => id.startsWith('ev:'));

/* Un ciclo que se corta a la mitad no debe dar por vistos sus eventos: el reintento los muestra. */

test('carga inicial cortada: el reintento muestra los eventos del repo', async () => {
  const gh = fakeGitHub();
  gh.commit('a1');
  gh.branches.set('main', 'a1');
  gh.event('WatchEvent', { action: 'started' });
  gh.event('IssuesEvent', { action: 'opened', issue: { number: 1, title: 'falla', html_url: 'https://github.com/o/r/issues/1' } });
  const { src, updates, errors } = connect(gh);

  gh.failOnce = (path) => path.startsWith('/repos/o/r/branches'); // después de leer los eventos
  await src.cycle();
  assert.equal(updates.length, 0);
  assert.equal(errors.length, 1);

  await src.cycle();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].initial, true);
  assert.deepEqual(ids(updates[0]).sort(), ['ev:1000', 'ev:1001']);
});

test('modo events: un push que falla a medias no se pierde', async () => {
  const gh = fakeGitHub();
  gh.manyBranches = true;
  gh.push('main', 'a1');
  const { src, updates } = connect(gh);
  await src.cycle();
  assert.equal(src.mode, 'events');
  assert.equal(updates.length, 1);

  const pa = gh.push('feat-a', 'b1', 'a1');
  const pb = gh.push('feat-b', 'c1', 'a1');
  gh.failOnce = (path) => path.includes('sha=c1') || path.includes('sha=feat-b'); // la historia de feat-b
  await src.cycle();
  assert.equal(updates.length, 1, 'el ciclo cortado no emite nada');

  await src.cycle();
  assert.equal(updates.length, 2);
  assert.deepEqual(ids(updates[1]).sort(), [`ev:${pa.id}`, `ev:${pb.id}`]);
  assert.deepEqual([...src.data.branches.keys()].sort(), ['feat-a', 'feat-b', 'main']);
});

test('un ciclo normal no repite eventos ya mostrados', async () => {
  const gh = fakeGitHub();
  gh.manyBranches = true;
  gh.push('main', 'a1');
  const { src, updates } = connect(gh);
  await src.cycle();
  const ev = gh.push('main', 'a2', 'a1');
  await src.cycle();
  assert.deepEqual(ids(updates[1]), [`ev:${ev.id}`]);
  await src.cycle();
  assert.deepEqual(ids(updates[2]), []);
});

/* Un filtro o una rama fijada que cambian a mitad de un ciclo se aplican en el siguiente. */

const changes = [
  { what: 'el filtro', setup: () => {}, change: (src) => src.setFilter('zet'), before: ['feat-x', 'main', 'zeta'], after: ['main', 'zeta'] },
  // con un filtro puesto, fijar una rama que no lo pasa la hace visible
  { what: 'las fijadas', setup: (src) => src.setFilter('feat'), change: (src) => src.setPins(['zeta']), before: ['feat-x', 'main'], after: ['feat-x', 'main', 'zeta'] },
];
const modes = [
  { mode: 'list', many: false, during: '/repos/o/r/branches' }, // mientras espera la lista de ramas
  { mode: 'events', many: true, during: '/repos/o/r/events' }, // mientras espera el feed
];

for (const { mode, many, during } of modes) {
  for (const { what, setup, change, before, after } of changes) {
    test(`modo ${mode}: cambiar ${what} durante un ciclo se aplica en el siguiente`, async () => {
      const gh = fakeGitHub();
      gh.manyBranches = many;
      gh.push('main', 'a1');
      gh.push('feat-x', 'b1', 'a1');
      gh.push('zeta', 'c1', 'a1');
      const { src } = connect(gh);
      setup(src);
      await src.cycle();
      await src.cycle(); // la historia de las ramas puede llegar en el ciclo siguiente
      assert.equal(src.mode, mode);
      assert.deepEqual([...src.data.branches.keys()].sort(), before);

      gh.onFetch = (path) => {
        if (!path.startsWith(during)) return;
        gh.onFetch = null;
        change(src); // el usuario lo cambia a mitad del ciclo
      };
      await src.cycle();
      await src.cycle();
      await src.cycle();
      assert.deepEqual([...src.data.branches.keys()].sort(), after);
    });
  }
}
