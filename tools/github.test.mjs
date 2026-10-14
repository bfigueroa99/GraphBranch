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
    tags: null, // [{ name, commit: { sha } }] (si es null, /tags da 404)
    deployments: null, // despliegues como los da la API, el más nuevo primero (si es null, 404)
    checks: null, // sha -> check-runs del commit (si es null, la API de checks no existe)
    calls: [],
    base: 'https://api.github.com', // la API a la que responde; cualquier otro host falla, como si no llegara
    urls: [], // las URL completas pedidas
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
    const u = new URL('https://api.github.com' + path); // solo para leer la ruta y sus parámetros
    const p = u.pathname;
    if (p === '/repos/o/r') return { body: gh.repo };
    if (p === '/repos/o/r/branches') {
      const all = [...gh.branches].map(([name, sha]) => ({ name, commit: { sha }, protected: false }));
      const headers = gh.manyBranches ? { Link: `<${gh.base}/repos/o/r/branches?per_page=100&page=2>; rel="next"` } : {};
      return { body: all.slice(0, Number(u.searchParams.get('per_page'))), headers };
    }
    if (p === '/repos/o/r/events') return { body: gh.events };
    if (p === '/repos/o/r/commits') {
      let sha = gh.branches.get(u.searchParams.get('sha')) || u.searchParams.get('sha');
      if (!gh.commits.has(sha)) return { status: 404, body: { message: 'No commit found' } };
      const out = [];
      const only = u.searchParams.get('path'); // gh.touched: ruta -> shas que la tocaron
      while (sha && out.length < Number(u.searchParams.get('per_page'))) {
        const c = gh.commits.get(sha);
        if (!only || gh.touched?.[only]?.includes(sha)) out.push(c);
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
    if (p === '/repos/o/r/tags') return gh.tags ? { body: gh.tags } : { status: 404, body: { message: 'Not Found' } };
    if (p === '/repos/o/r/deployments') return gh.deployments ? { body: gh.deployments } : { status: 404, body: { message: 'Not Found' } };
    const runs = p.match(/^\/repos\/o\/r\/commits\/([^/]+)\/check-runs$/);
    if (runs) return gh.checks ? { body: { total_count: 0, check_runs: gh.checks.get(runs[1]) || [] } } : { status: 404, body: { message: 'Not Found' } };
    if (p.startsWith('/repos/o/r/compare/')) return { body: { total_commits: 1, ahead_by: 1, commits: [] } };
    return { status: 404, body: { message: 'Not Found' } };
  }

  gh.fetch = async (url, opts = {}) => {
    gh.urls.push(url);
    if (!url.startsWith(gh.base)) throw new TypeError('Failed to fetch'); // otro host: no hay quien responda
    const path = url.slice(gh.base.length).replace(/^\/api(?=\/graphql)/, '');
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
function connect(gh, token = '', apiUrl = '', marks = true) {
  const GB = load(gh);
  const src = new GB.GitHubSource({ owner: 'o', name: 'r', token, apiUrl, marks });
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

/* org:nombre y @usuario: seguir los repos de una organización o de un usuario entero. */

test('parseOwner reconoce org:, user:, @ y la URL de un perfil, y nada más', () => {
  const { U } = load(fakeGitHub());
  const ok = [
    ['org:acme', 'acme'],
    ['user:Ana-B', 'Ana-B'],
    ['@ana', 'ana'],
    ['https://github.com/acme', 'acme'],
    ['github.com/orgs/acme/', 'acme'],
    ['https://www.github.com/acme?tab=repositories', 'acme'],
  ];
  for (const [input, owner] of ok) assert.equal(U.parseOwner(input)?.owner, owner, input);
  for (const input of ['acme', 'acme/api', 'org:', '@-ana', '@ana-', 'org:a--b', 'org:a/b', 'https://github.com/acme/api', 'gitlab:grupo', '@x..y', 'org:' + 'a'.repeat(40)]) {
    assert.equal(U.parseOwner(input), null, input);
  }
});

/** Un repo como lo da /orgs/{org}/repos o /users/{u}/repos. */
const listed = (name, more = {}) => ({ name, owner: { login: 'acme' }, fork: false, archived: false, disabled: false, private: false, pushed_at: '2026-10-01T00:00:00Z', ...more });

test('org:nombre: los repos de push más reciente, sin forks ni archivados, en una sola consulta', async () => {
  const gh = fakeGitHub();
  gh.override = (path) =>
    path.startsWith('/orgs/acme/repos?')
      ? { body: [listed('api'), listed('copia', { fork: true }), listed('viejo', { archived: true }), listed('web', { private: true })] }
      : null;
  const GB = load(gh);
  const list = await GB.GitHubSource.ownerRepos('acme');
  assert.deepEqual(Array.from(list, (r) => `${r.owner}/${r.name}`), ['acme/api', 'acme/web']);
  assert.equal(gh.calls.length, 1, 'una consulta para la lista');
  const q = new URL('https://api.github.com' + gh.calls[0]).searchParams;
  assert.equal(q.get('sort'), 'pushed');
  assert.equal(q.get('direction'), 'desc');
});

test('@usuario: si no es una organización, sus repos; si no existe, lo dice', async () => {
  const gh = fakeGitHub();
  gh.override = (path) => (path.startsWith('/users/ana/repos?') ? { body: [listed('notas', { owner: { login: 'ana' } })] } : null);
  const GB = load(gh);
  const list = await GB.GitHubSource.ownerRepos('ana');
  assert.deepEqual(Array.from(list, (r) => `${r.owner}/${r.name}`), ['ana/notas']);
  assert.deepEqual(gh.calls.map((c) => c.split('?')[0]), ['/orgs/ana/repos', '/users/ana/repos'], 'primero como organización, después como usuario');

  gh.calls.length = 0;
  await assert.rejects(GB.GitHubSource.ownerRepos('nadie'), (err) => err.kind === 'notfound' && err.msg.key === 'err.ownerNotFound' && err.msg.params.owner === 'nadie');
  assert.equal(gh.calls.length, 2);
});

test('la lista de una organización lleva el token, si hay', async () => {
  const gh = fakeGitHub();
  const seen = [];
  const fetch = gh.fetch;
  gh.fetch = (url, opts) => (seen.push(opts.headers?.Authorization), fetch(url, opts));
  gh.override = (path) => (path.startsWith('/orgs/acme/repos?') ? { body: [listed('api')] } : null);
  const GB = load(gh);
  await GB.GitHubSource.ownerRepos('acme', { token: 'ghp_x' });
  assert.deepEqual(seen, ['Bearer ghp_x']);
});

test('eventos de una organización: una consulta, solo lo nuevo, con el repo de cada uno', async () => {
  const gh = fakeGitHub();
  const ev = (id, repo, type, payload) => ({ id: String(id), type, repo: { name: repo }, actor: { login: 'ana' }, created_at: `2026-01-01T00:00:0${id}Z`, payload });
  let events = [ev(2, 'acme/web', 'WatchEvent', {}), ev(1, 'acme/api', 'IssuesEvent', { action: 'opened', issue: { number: 3, title: 'Falla', html_url: 'https://github.com/acme/api/issues/3' } })];
  gh.override = (path) => (path.startsWith('/orgs/acme/events?') ? { body: events } : null);
  const GB = load(gh);
  const feed = GB.GitHubSource.orgFeed('acme');
  const first = await feed.poll();
  assert.deepEqual(Array.from(first, (a) => `${a.repoFull}:${a.kind}`), ['acme/api:issue-open', 'acme/web:star'], 'las más antiguas primero');
  assert.equal(first[0].url, 'https://github.com/acme/api/issues/3');
  assert.equal(gh.calls.length, 1, 'una sola consulta para todos los repos');
  assert.deepEqual(Array.from(await feed.poll()), [], 'sin cambios (304): nada nuevo');
  events = [ev(3, 'acme/api', 'WatchEvent', {}), ...events];
  assert.deepEqual(Array.from(await feed.poll(), (a) => a.id), ['ev:3'], 'solo el evento nuevo');
});

test('eventos de una organización: un usuario (404) no da nada y no falla', async () => {
  const gh = fakeGitHub();
  const GB = load(gh);
  assert.deepEqual(Array.from(await GB.GitHubSource.orgFeed('ana').poll()), []);
});

/* CI en el grafo: el estado de los checks de la cabeza de cada rama y de cada PR; la rama por defecto
   que se pone en rojo avisa una sola vez. */

/** GraphQL falso: responde la consulta del ciclo y las de historia con el estado de checks de `ci`. */
function fakeGraphQL(gh, ci) {
  const fetch = gh.fetch;
  gh.fetch = (url, opts = {}) => {
    if (!url.endsWith('/graphql')) return fetch(url, opts);
    const { query } = JSON.parse(opts.body);
    const target = (sha, state) => ({ oid: sha, committedDate: '2026-01-01T00:00:00Z', statusCheckRollup: state ? { state } : null });
    const repository = {};
    if (query.includes('defaultBranchRef')) {
      Object.assign(repository, {
        defaultBranchRef: { name: 'main', target: target('a1', ci.main) },
        all: { totalCount: 1 },
        pullRequests: {
          totalCount: 1,
          nodes: [{ number: 7, title: 'x', isDraft: false, url: 'u', headRefName: 'feat', baseRefName: 'main', isCrossRepository: false, createdAt: '2020-01-01T00:00:00Z', author: null, commits: { nodes: [{ commit: { statusCheckRollup: { state: ci.pr } } }] } }],
        },
      });
    }
    for (const m of query.matchAll(/(h\d+): object\(oid: "([^"]+)"/g)) {
      repository[m[1]] = { history: { nodes: [{ oid: m[2], url: 'u', committedDate: '2026-01-01T00:00:00Z', messageHeadline: 'c', author: null, parents: { nodes: [] } }] } };
    }
    const body = JSON.stringify({ data: { rateLimit: { cost: 1, remaining: 4000, limit: 5000, resetAt: '2030-01-01T00:00:00Z' }, repository } });
    return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, text: async () => body, json: async () => JSON.parse(body) });
  };
}

test('CI con GraphQL: estado en la rama por defecto y en los PRs, y un aviso al ponerse en rojo', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const ci = { main: 'SUCCESS', pr: 'FAILURE' };
  fakeGraphQL(gh, ci);
  const { src, updates } = connect(gh, 'tok');
  await src.cycle();
  assert.equal(src.mode, 'graphql');
  assert.equal(src.data.ci.get('main'), 'success');
  assert.equal(src.data.pulls.get(7).ci, 'failure');
  assert.equal(updates.flatMap((u) => Array.from(u.activities)).filter((a) => a.kind === 'ci-fail').length, 0, 'al cargar no se avisa');

  ci.main = 'PENDING';
  await src.cycle();
  assert.equal(src.data.ci.get('main'), 'pending');
  ci.main = 'FAILURE';
  await src.cycle();
  assert.equal(src.data.ci.get('main'), 'failure');
  const fails = () => updates.flatMap((u) => Array.from(u.activities)).filter((a) => a.kind === 'ci-fail');
  assert.equal(fails().length, 1);
  assert.equal(fails()[0].branch, 'main');
  await src.cycle();
  assert.equal(fails().length, 1, 'seguir en rojo no repite el aviso');

  ci.main = null; // sin checks: sin estado
  await src.cycle();
  assert.equal(src.data.ci.has('main'), false);
});

test('CI sin token: los check-runs de la rama por defecto, una consulta por commit', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.checks = new Map([['a1', [{ status: 'completed', conclusion: 'success' }]]]);
  const { src, updates } = connect(gh);
  await src.cycle();
  assert.equal(src.data.ci.get('main'), 'success');
  const asked = () => gh.calls.filter((c) => c.includes('/check-runs')).length;
  assert.equal(asked(), 1);
  await src.cycle();
  assert.equal(asked(), 1, 'el mismo commit no se vuelve a preguntar');

  gh.push('main', 'a2', 'a1');
  gh.checks.set('a2', [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }]);
  await src.cycle();
  assert.equal(src.data.ci.get('main'), 'failure');
  assert.equal(updates.flatMap((u) => Array.from(u.activities)).filter((a) => a.kind === 'ci-fail').length, 1);

  gh.push('main', 'a3', 'a2');
  gh.checks.set('a3', [{ status: 'in_progress', conclusion: null }]);
  await src.cycle();
  assert.equal(src.data.ci.get('main'), 'pending');
  const before = asked();
  await src.cycle();
  assert.equal(asked(), before + 1, 'lo que sigue en curso se vuelve a preguntar');
});

test('CI sin la API de checks: la rama queda sin estado y nada falla', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src, errors } = connect(gh);
  await src.cycle();
  assert.equal(errors.length, 0);
  assert.equal(src.data.ci.has('main'), false);
});

/* Tags y despliegues: los banderines y las placas del grafo salen de /tags y /deployments. */

test('tags y despliegues: cada tag a su commit y el último despliegue de cada entorno', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.push('main', 'a2', 'a1');
  gh.tags = [
    { name: 'v2.0', commit: { sha: 'a2' } },
    { name: 'latest', commit: { sha: 'a2' } },
    { name: 'v1.0', commit: { sha: 'a1' } },
  ];
  gh.deployments = [
    { id: 3, sha: 'a2', ref: 'main', environment: 'production' },
    { id: 2, sha: 'a1', ref: 'main', environment: 'staging' },
    { id: 1, sha: 'a1', ref: 'main', environment: 'production' }, // más viejo: no cuenta
  ];
  const { src, errors } = connect(gh);
  await src.cycle();
  assert.equal(errors.length, 0);
  assert.deepEqual(Array.from(src.data.tags.get('a2')), ['v2.0', 'latest']);
  assert.deepEqual(Array.from(src.data.tags.get('a1')), ['v1.0']);
  assert.equal(src.data.deploys.get('production').sha, 'a2');
  assert.equal(src.data.deploys.get('staging').sha, 'a1');
  const asked = () => gh.calls.filter((c) => c.startsWith('/repos/o/r/tags') || c.startsWith('/repos/o/r/deployments')).length;
  assert.equal(asked(), 2);
  await src.cycle();
  assert.equal(asked(), 2, 'no se vuelve a preguntar hasta los 15 minutos');
});

test('tags y despliegues: sin la API, o apagados, el grafo sigue y no se gasta cuota', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const on = connect(gh);
  await on.src.cycle();
  assert.equal(on.errors.length, 0);
  assert.equal(on.src.data.tags.size, 0);
  assert.equal(on.src.data.deploys.size, 0);

  const gh2 = fakeGitHub();
  gh2.push('main', 'a1');
  gh2.tags = [{ name: 'v1', commit: { sha: 'a1' } }];
  const off = connect(gh2, '', '', false);
  await off.src.cycle();
  assert.equal(gh2.calls.filter((c) => c.startsWith('/repos/o/r/tags') || c.startsWith('/repos/o/r/deployments')).length, 0);
  assert.equal(off.src.data.tags.size, 0);
});

/* GitHub Enterprise Server: la misma fuente contra otra URL base (https://host/api/v3 y /api/graphql). */

const GHE = 'https://ghe.example.com/api/v3';

test('GHE sin token: modo events con la URL base configurada, su paginación y sus enlaces', async () => {
  const gh = fakeGitHub();
  gh.base = GHE;
  gh.manyBranches = true;
  gh.push('main', 'a1');
  const { src, updates, errors } = connect(gh, '', GHE);
  assert.equal(src.data.repo.url, 'https://ghe.example.com/o/r', 'antes de cargar, el enlace del repo es el del host');
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(src.mode, 'events');
  assert.equal(updates.length, 1);
  assert.ok(gh.urls.length > 0 && gh.urls.every((u) => u.startsWith(GHE + '/')), 'todo va al host configurado, nada a api.github.com');
  assert.ok(src.data.branches.has('main'));
});

test('GHE con token: GraphQL en /api/graphql y el token solo al host configurado', async () => {
  const gh = fakeGitHub();
  gh.base = 'https://ghe.example.com/api/v3';
  gh.push('main', 'a1');
  fakeGraphQL(gh, { main: 'SUCCESS', pr: 'SUCCESS' });
  const sent = [];
  const fetch = gh.fetch;
  gh.fetch = (url, opts = {}) => (sent.push([url, opts.headers?.Authorization]), fetch(url, opts));
  const { src } = connect(gh, 'tok', GHE + '/');
  await src.cycle();
  assert.equal(src.mode, 'graphql');
  assert.ok(sent.some(([u]) => u === 'https://ghe.example.com/api/graphql'));
  assert.ok(sent.every(([u, a]) => u.startsWith('https://ghe.example.com/') && a === 'Bearer tok'), 'el token no sale a otro host');
});

test('una URL de API que no es https no se usa: la fuente sigue en api.github.com', () => {
  const GB = load(fakeGitHub());
  for (const bad of ['http://ghe.example.com/api/v3', 'https://u:p@ghe.example.com/api/v3', 'basura', 'javascript:alert(1)']) {
    assert.equal(GB.GitHubSource.endpoints(bad), null, bad);
    assert.equal(new GB.GitHubSource({ owner: 'o', name: 'r', apiUrl: bad }).ep.api, 'https://api.github.com');
  }
  assert.equal(GB.GitHubSource.endpoints(GHE).graphql, 'https://ghe.example.com/api/graphql');
});

test('los cambios de un commit: una consulta, con el tramo de cada archivo; sin token no se adelantan los vecinos', async () => {
  const gh = fakeGitHub();
  gh.commit('a1');
  gh.commit('a2', 'a1');
  gh.branches.set('main', 'a2');
  gh.override = (path) => {
    if (path !== '/repos/o/r/commits/a2') return null;
    return {
      body: {
        sha: 'a2',
        files: [
          { filename: 'src/app.js', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ -1 +1 @@\n-a\n+b' },
          { filename: 'docs/nuevo.md', previous_filename: 'viejo.md', status: 'renamed', additions: 0, deletions: 0, changes: 0 },
          { filename: 'logo.png', status: 'removed', additions: 0, deletions: 0, changes: 0 },
          { filename: 'x.js', status: 'copied', additions: 2, deletions: 0, changes: 2, patch: '@@ -0,0 +1,2 @@\n+a\n+b' },
        ],
      },
      headers: { Link: '<https://api.github.com/repos/o/r/commits/a2?page=2>; rel="next"' },
    };
  };
  const { src, errors } = connect(gh);
  await src.cycle();
  assert.deepEqual(errors, []);
  const before = gh.calls.length;
  const out = await src.commitDiff('a2');
  assert.deepEqual(gh.calls.slice(before), ['/repos/o/r/commits/a2']);
  assert.equal(out.truncated, true, 'con más páginas de archivos, la lista no está completa');
  assert.deepEqual(
    Array.from(out.files, (f) => [f.path, f.status, f.from, f.add, f.del, f.patch, f.url]),
    [
      ['src/app.js', 'modified', null, 1, 1, '@@ -1 +1 @@\n-a\n+b', 'https://github.com/o/r/blob/a2/src/app.js'],
      ['docs/nuevo.md', 'renamed', 'viejo.md', 0, 0, null, 'https://github.com/o/r/blob/a2/docs/nuevo.md'],
      ['logo.png', 'removed', null, 0, 0, null, null],
      ['x.js', 'modified', null, 2, 0, '@@ -0,0 +1,2 @@\n+a\n+b', 'https://github.com/o/r/blob/a2/x.js'],
    ],
  );
  assert.equal(src.diffCheap(), false, 'sin token cada consulta es de 60 por hora');
  const withToken = connect(gh, 'ghp_x').src;
  withToken.rate = { limit: 5000, remaining: 4000, reset: 0 };
  assert.equal(withToken.diffCheap(), true);
  withToken.rate.remaining = 200;
  assert.equal(withToken.diffCheap(), false, 'con la cuota casi gastada, tampoco');
});

test('commitsByPath: pide /commits?path= por cabeza y devuelve solo los commits cargados que tocaron la ruta', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.push('main', 'a2', 'a1');
  gh.push('feat', 'b1', 'a2');
  gh.touched = { 'src/app': ['a1', 'b1'], docs: [] };
  const { src } = connect(gh);
  await src.cycle();
  gh.calls.length = 0;

  const hit = await src.commitsByPath('/src/app/');
  assert.deepEqual([...hit].sort(), ['a1', 'b1']);
  const asked = gh.calls.filter((c) => c.includes('path='));
  assert.equal(asked.length, 2, 'una consulta por cabeza');
  assert.ok(asked.every((c) => c.includes('path=src%2Fapp') && c.includes('per_page=100')), 'sin barras de borde y con la ruta codificada');
  assert.ok(asked[0].includes('sha=a2'), 'la rama por defecto va primero');

  assert.equal((await src.commitsByPath('docs')).size, 0);
  gh.calls.length = 0;
  assert.equal((await src.commitsByPath('  ')).size, 0);
  assert.equal(gh.calls.length, 0, 'una ruta vacía no gasta cuota');
});
