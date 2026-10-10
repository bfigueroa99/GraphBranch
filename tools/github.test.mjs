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
    AbortController,
    fetch: gh.fetch,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
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
    pulls: [], // PRs como los da la API (los más recién actualizados, primero en la lista)
    override: null, // (ruta) => { status, body } para responder otra cosa, o nada para seguir normal
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
    const one = p.match(/^\/repos\/o\/r\/pulls\/(\d+)$/);
    if (one) {
      const pr = gh.pulls.find((x) => x.number === Number(one[1]));
      return pr ? { body: pr } : { status: 404, body: { message: 'Not Found' } };
    }
    if (p === '/repos/o/r/pulls') {
      // como la API: sin merged_by en las listas, ordenados por la última actualización
      const state = u.searchParams.get('state') || 'open';
      const list = gh.pulls
        .filter((x) => state === 'all' || x.state === state)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, Number(u.searchParams.get('per_page')) || 30)
        .map(({ merged_by, ...x }) => x);
      return { body: list };
    }
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
    const { status = 200, body, headers = {} } = gh.override?.(path) || route(path);
    const json = JSON.stringify(body);
    const etag = `"${json.length}-${[...json].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)}"`;
    const inm = opts.headers?.['If-None-Match'];
    const res = (st, b, h) => {
      const hs = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
      return {
        status: st,
        ok: st >= 200 && st < 300,
        headers: { get: (k) => hs.get(k.toLowerCase()) ?? null },
        text: async () => b,
        json: async () => JSON.parse(b),
      };
    };
    if (status === 200 && inm === etag) return res(304, 'null', headers);
    return res(status, json, status === 200 ? { ...headers, ETag: etag } : headers);
  };
  return gh;
}

/** Fuente conectada a la API falsa (sin token, salvo que se pida); `cycle()` corre un ciclo de sondeo completo. */
function connect(gh, token = '') {
  const GB = load(gh);
  const src = new GB.GitHubSource({ owner: 'o', name: 'r', token });
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

/* Sin token: los PRs que salen de la página de abiertos porque otros se actualizaron no cuestan una
   consulta cada uno; los que de verdad se fusionaron o cerraron se avisan igual. */

test('modo lista: los PRs que solo salen de la página de abiertos no se consultan uno por uno', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const at = (min) => new Date(Date.UTC(2026, 9, 1) + min * 60000).toISOString();
  for (let n = 1; n <= 60; n++)
    gh.pulls.push({
      number: n,
      state: 'open',
      title: `PR ${n}`,
      head: { ref: `feat-${n}`, repo: { full_name: 'o/r' } },
      base: { ref: 'main' },
      user: { login: 'ana' },
      html_url: `https://github.com/o/r/pull/${n}`,
      created_at: at(n),
      updated_at: at(n),
      merged_at: null,
      merged_by: null,
    });
  const { src, updates } = connect(gh);
  await src.cycle();
  assert.equal(src.data.pulls.size, 50); // la página de los 50 actualizados más recientemente

  // tres PRs viejos se actualizan (entran a la página y desplazan a otros tres, que siguen abiertos),
  // uno de la página se fusiona y otro se cierra
  for (const n of [1, 2, 3]) gh.pulls[n - 1].updated_at = at(100 + n);
  Object.assign(gh.pulls[59], { state: 'closed', merged_at: at(200), updated_at: at(200), merged_by: { login: 'beto' } });
  Object.assign(gh.pulls[58], { state: 'closed', updated_at: at(201) }); // y otro se cierra sin fusionar
  gh.calls.length = 0;
  src.lastPoll.pulls = 0; // ya toca revisar los PRs
  await src.cycle();

  const single = gh.calls.filter((c) => /\/pulls\/\d+$/.test(c));
  assert.deepEqual(single, ['/repos/o/r/pulls/60'], 'solo se pide el fusionado, para saber quién lo fusionó');
  const prs = Array.from(updates.at(-1).activities, (a) => `${a.kind} #${a.number}`).filter((k) => /^pr-/.test(k));
  assert.deepEqual(prs.sort(), ['pr-close #59', 'pr-merge #60']);
  assert.equal(updates.at(-1).activities.find((a) => a.kind === 'pr-merge').actor.login, 'beto');
});

/* Un error pasajero del servidor (5xx) no apaga funciones para toda la sesión; uno que dice que la
   función no está disponible (403, 404, un error de GraphQL), sí. */

const serverError = { status: 502, body: { message: 'Bad Gateway' } };

test('la API de actividad sigue en uso tras un 502 suelto, y se deja con un 403', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src } = connect(gh, 'tok');
  gh.override = (path) => (path.startsWith('/repos/o/r/activity') ? serverError : null);
  await src.syncActivity(false, 10);
  assert.equal(src.activityOk, true, 'un 502 no la apaga');
  gh.override = (path) => (path.startsWith('/repos/o/r/activity') ? { status: 403, body: { message: 'Resource not accessible by personal access token' } } : null);
  await src.syncActivity(false, 10);
  assert.equal(src.activityOk, false, 'un 403 sí: el token no puede leerla');
});

test('un 5xx de GraphQL en la carga inicial no pasa a REST para siempre', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src, errors } = connect(gh, 'tok');
  gh.override = (path) => (path === '/graphql' ? serverError : null);
  await src.cycle();
  assert.equal(errors.length, 1, 'el ciclo falla y se reintenta');
  assert.equal(src.mode, 'graphql', 'sigue en GraphQL para el reintento');
  // un error propio de GraphQL (el token no puede usarla) sí pasa a REST
  gh.override = (path) => (path === '/graphql' ? { body: { errors: [{ type: 'FORBIDDEN', message: 'no' }] } } : null);
  await src.cycle();
  assert.notEqual(src.mode, 'graphql');
});

/* Varios repos seguidos a la vez gastan la misma cuota (la de la cuenta, o la de la IP sin token):
   cada fuente se espacia como si las demás gastaran lo mismo que ella. */

test('con varios repos seguidos, cada fuente se queda con su parte de la cuota', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src } = connect(gh);
  const hour = Date.now() / 1000 + 3600;
  const delayWith = (share) => {
    src.share = share;
    src.mode = 'list';
    src.cost = 1;
    src.avgCost = 1;
    src.rate = { limit: 60, remaining: 50, reset: hour };
    return src.nextDelay();
  };
  const alone = delayWith(1);
  const four = delayWith(4);
  assert.ok(four > alone * 3.5, `con cuatro repos espera ${Math.round(four / 1000)} s, solo ${Math.round(alone / 1000)} s`);
  assert.equal(src.throttled, true);

  // la historia de las ramas que esperan también se reparte (sin token: 12 consultas por ciclo)
  src.rate = { limit: 60, remaining: 60, reset: hour };
  src.share = 1;
  assert.equal(src.restBudget(), 12);
  src.share = 4;
  assert.equal(src.restBudget(), 3);
});
