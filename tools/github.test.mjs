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
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
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
  vm.runInContext(code('agents.js'), ctx, { filename: 'agents.js' });
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('health.js'), ctx, { filename: 'health.js' }); // para ver lo que el panel de salud hace con lo cargado
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
    forks: null, // forks como los da /forks (si es null, 404)
    prCommits: null, // número de PR -> fecha ISO de su primer commit, como /pulls/:n/commits (si es null, 404)
    prReviews: null, // número de PR -> sus revisiones como las da /pulls/:n/reviews (un número que no está, 404)
    deployments: null, // despliegues como los da la API, el más nuevo primero (si es null, 404)
    deployStatuses: null, // id del despliegue -> estados como los da /statuses, el más nuevo primero (si es null, 404)
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
    const prCommits = p.match(/^\/repos\/o\/r\/pulls\/(\d+)\/commits$/);
    if (prCommits) return gh.prCommits ? (gh.prCommits.has(Number(prCommits[1])) ? { body: [{ commit: { author: { date: gh.prCommits.get(Number(prCommits[1])) } } }] } : { status: 404, body: { message: 'Not Found' } }) : { status: 404, body: { message: 'Not Found' } };
    const prReviews = p.match(/^\/repos\/o\/r\/pulls\/(\d+)\/reviews$/);
    if (prReviews) return gh.prReviews?.has(Number(prReviews[1])) ? { body: gh.prReviews.get(Number(prReviews[1])).slice(0, Number(u.searchParams.get('per_page')) || 30) } : { status: 404, body: { message: 'Not Found' } };
    if (p === '/repos/o/r/forks') return gh.forks ?{ body: gh.forks } : { status: 404, body: { message: 'Not Found' } };
    if (p === '/repos/o/r/deployments') return gh.deployments ? { body: gh.deployments } : { status: 404, body: { message: 'Not Found' } };
    const dst = p.match(/^\/repos\/o\/r\/deployments\/(\d+)\/statuses$/);
    if (dst) return gh.deployStatuses?.has(Number(dst[1])) ? { body: gh.deployStatuses.get(Number(dst[1])).slice(0, Number(u.searchParams.get('per_page')) || 30) } : { status: 404, body: { message: 'Not Found' } };
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
    const { status = 200, body, headers = {} } = gh.override?.(path, opts) || route(path);
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

const plain = (x) => JSON.parse(JSON.stringify(x));

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
  return { src, updates, errors, GB };
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
  gh.repo.open_issues_count = 64; // GitHub cuenta issues y PRs juntos: 4 issues y 60 PRs
  gh.repo.stargazers_count = 321;
  gh.repo.forks_count = 42;
  const { src, updates } = connect(gh);
  await src.cycle();
  assert.equal(src.data.pulls.size, 50); // la página de los 50 actualizados más recientemente
  assert.equal(src.data.repo.openItems, 64, 'el total de issues y PRs abiertos sale de la consulta del repo, sin otra');
  assert.equal(src.data.repo.stars, 321, 'las estrellas salen de la misma consulta del repo');
  assert.equal(src.data.repo.forks, 42, 'los forks también, sin otra consulta');

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
  assert.equal(updates.at(-1).activities.find((a) => a.kind === 'pr-merge').author.login, 'ana', 'quien abrió el PR, para las notas de la versión');
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

test('un repo vacío (409 «Git Repository is empty») se dice vacío y no se reintenta cada pocos segundos', async () => {
  const gh = fakeGitHub();
  const empty = { status: 409, body: { message: 'Git Repository is empty.' } };
  gh.override = (path) => (path.startsWith('/repos/o/r/commits') || path.startsWith('/repos/o/r/branches') ? empty : null);
  const { src, errors, GB } = connect(gh);
  await src.cycle();
  await src.cycle();
  assert.equal(errors.length, 2);
  assert.equal(errors[1].kind, 'empty');
  assert.equal(errors[1].msg.key, 'err.empty');
  assert.equal(GB.U.statusKey(src.status), 'status.errorEmpty');
  assert.equal(src.running, true, 'sigue mirando: el primer push lo llena');
  // sin token cada intento gasta unas 3 consultas de las 60 por hora: cada 5 minutos, no cada pocos segundos
  assert.ok(src.status.nextAt - Date.now() >= 295000, `reintenta en ${src.status.nextAt - Date.now()} ms`);
  assert.equal(src.failures, 0, 'no cuenta como fallo de red');
  // un 409 cualquiera sigue siendo un error del servicio
  gh.override = (path) => (path.startsWith('/repos/o/r/commits') || path.startsWith('/repos/o/r/branches') ? { status: 409, body: { message: 'Conflict' } } : null);
  const other = connect(gh);
  await other.src.cycle();
  assert.equal(other.errors[0].kind, 'http');
  assert.equal(other.GB.U.statusKey(other.src.status), 'status.errorService', 'un 409 llegó: no es «Sin conexión»');
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

/* Una tarea de GitHub Classroom: un repo por estudiante en la organización del curso, con el prefijo de la tarea
   (`tarea-1-ana`). org:curso/tarea-1-* sigue solo los de ese prefijo. */

test('parseOwner reconoce una tarea: org:curso/prefijo*, también con @ y user:, y su clave guardada', () => {
  const { U } = load(fakeGitHub());
  const ok = [
    ['org:curso/tarea-1-*', 'curso', 'tarea-1-'],
    ['@curso/Tarea_1.b*', 'curso', 'Tarea_1.b'],
    ['user:ana/practica-*', 'ana', 'practica-'],
    [' org:curso/tarea-1-* ', 'curso', 'tarea-1-'],
    ['org:curso/*', 'curso', ''], // sin prefijo: la organización entera
  ];
  for (const [input, owner, prefix] of ok) {
    const who = U.parseOwner(input);
    assert.equal(who?.owner, owner, input);
    assert.equal(who?.prefix || '', prefix, input);
  }
  // la estrella es la que dice «empieza con»: sin ella, org:a/b no es nada (podría ser el repo a/b mal escrito)
  for (const input of ['org:curso/tarea-1-', 'org:curso/tarea*1', 'org:curso/tarea 1*', 'org:curso/a/b*', 'org:curso/**', 'org:-curso/tarea*', 'org:curso/' + 'a'.repeat(101) + '*', 'github.com/curso/tarea-*']) {
    assert.equal(U.parseOwner(input), null, input);
  }
  // la clave con que se guarda la organización seguida: la de siempre sin prefijo, dueño/prefijo* con él
  assert.equal(U.ownerKey({ owner: 'acme' }), 'acme');
  assert.equal(U.ownerKey({ owner: 'curso', prefix: 'tarea-1-' }), 'curso/tarea-1-*');
  for (const key of ['acme', 'curso/tarea-1-*']) assert.equal(U.ownerKey(U.parseOwner('@' + key)), key, key);
  // un repo es de la tarea si su nombre empieza con el prefijo, sin distinguir mayúsculas
  const tarea = U.parseOwner('org:curso/Tarea-1-*');
  assert.equal(U.ownerMatch(tarea, 'tarea-1-Ana'), true);
  assert.equal(U.ownerMatch(tarea, 'tarea-10-ana'), false);
  assert.equal(U.ownerMatch(tarea, 'tarea-2-ana'), false);
  assert.equal(U.ownerMatch(U.parseOwner('org:curso'), 'lo-que-sea'), true, 'sin prefijo, todos');
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

test('org:nombre con dos páginas de repos: la constelación se arma con la primera (hasta 100), sin pedir la segunda ni las ramas de nadie', async () => {
  const gh = fakeGitHub();
  const page = (from, n) => Array.from({ length: n }, (_, i) => listed(`r${from + i}`, { pushed_at: new Date(Date.UTC(2026, 9, 1) - (from + i) * 3600e3).toISOString() }));
  gh.override = (path) => {
    if (!path.startsWith('/orgs/acme/repos?')) return null;
    const second = new URL('https://api.github.com' + path).searchParams.get('page') === '2';
    return second ? { body: page(100, 30) } : { body: page(0, 100), headers: { Link: '<https://api.github.com/orgs/acme/repos?sort=pushed&direction=desc&per_page=100&type=all&page=2>; rel="next"' } };
  };
  const GB = load(gh);
  const list = await GB.GitHubSource.ownerRepos('acme');
  assert.equal(list.length, 100);
  assert.equal(list[0].pushedAt, '2026-10-01T00:00:00.000Z', 'cada repo trae su último push, para su galaxia');
  assert.deepEqual(gh.calls.map((c) => c.split('?')[0]), ['/orgs/acme/repos'], 'una consulta: ni la segunda página ni las ramas de los repos sin pestaña');
  assert.equal(new URL('https://api.github.com' + gh.calls[0]).searchParams.get('per_page'), '100');
});

test('org:curso/tarea-1-*: de una organización con dos tareas, solo los repos del prefijo pedido, con la misma consulta', async () => {
  const gh = fakeGitHub();
  const curso = (name, more = {}) => listed(name, { owner: { login: 'curso' }, ...more });
  gh.override = (path) =>
    path.startsWith('/orgs/curso/repos?')
      ? { body: [curso('tarea-2-ana'), curso('tarea-1-ana'), curso('Tarea-1-Beto'), curso('tarea-10-caro'), curso('tarea-2-beto'), curso('proyecto'), curso('tarea-1-copia', { fork: true }), curso('tarea-1-vieja', { archived: true })] }
      : null;
  const GB = load(gh);
  const list = await GB.GitHubSource.ownerRepos('curso', { prefix: 'tarea-1-' });
  assert.deepEqual(Array.from(list, (r) => `${r.owner}/${r.name}`), ['curso/tarea-1-ana', 'curso/Tarea-1-Beto'], 'los de la tarea 1, en el orden de la lista, sin la 10 ni la 2');
  assert.deepEqual(gh.calls.map((c) => c.split('?')[0]), ['/orgs/curso/repos'], 'una consulta, la de seguir la organización');
  const all = await GB.GitHubSource.ownerRepos('curso');
  assert.equal(all.length, 6, 'sin prefijo, la organización entera (sin el fork ni el archivado)');
  const otra = await GB.GitHubSource.ownerRepos('curso', { prefix: 'tarea-2-' });
  assert.deepEqual(Array.from(otra, (r) => r.name), ['tarea-2-ana', 'tarea-2-beto']);
  assert.equal((await GB.GitHubSource.ownerRepos('curso', { prefix: 'examen-' })).length, 0, 'un prefijo sin repos: la lista vacía, sin error');
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
function fakeGraphQL(gh, ci, commit = {}) {
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
        pullRequests: ci.noPulls ? null : { // null: el token no puede leer PRs
          totalCount: 1,
          nodes: [{ number: 7, title: 'x', isDraft: false, url: 'u', headRefName: 'feat', baseRefName: 'main', isCrossRepository: false, createdAt: '2020-01-01T00:00:00Z', author: null, commits: { nodes: [{ commit: { statusCheckRollup: { state: ci.pr } } }] }, ...ci.prNode }],
        },
      });
    }
    for (const m of query.matchAll(/(h\d+): object\(oid: "([^"]+)"/g)) {
      repository[m[1]] = { history: { nodes: [{ oid: m[2], url: 'u', committedDate: '2026-01-01T00:00:00Z', messageHeadline: 'c', author: null, parents: { nodes: [] }, ...commit }] } };
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

test('los PRs dicen a quiénes se les pidió revisión y quiénes están asignados (REST y GraphQL), para el Launchpad', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.pulls.push({
    number: 3, state: 'open', title: 'PR 3', head: { ref: 'feat', repo: { full_name: 'o/r' } }, base: { ref: 'main' }, user: { login: 'ana' },
    html_url: 'https://github.com/o/r/pull/3', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    requested_reviewers: [{ login: 'beto', type: 'User' }, null, { login: '' }, { login: 'Copilot', type: 'Bot' }], requested_teams: [{ slug: 'core' }], assignees: [{ login: 'carla' }],
  });
  const rest = connect(gh).src;
  await rest.cycle();
  assert.deepEqual(plain(rest.data.pulls.get(3).requested), ['beto'], 'sin los vacíos ni los bots; los equipos van aparte y no cuentan');
  assert.deepEqual(plain(rest.data.pulls.get(3).assignees), ['carla']);

  const g2 = fakeGitHub();
  g2.push('main', 'a1');
  fakeGraphQL(g2, { main: 'SUCCESS', pr: 'SUCCESS', prNode: { reviewRequests: { nodes: [{ requestedReviewer: { login: 'dani' } }, { requestedReviewer: {} }, { requestedReviewer: null }] }, assignees: { nodes: [{ login: 'eva' }] } } });
  const gql = connect(g2, 'tok').src;
  await gql.cycle();
  assert.equal(gql.mode, 'graphql');
  assert.deepEqual(plain(gql.data.pulls.get(7).requested), ['dani'], 'un equipo (sin login) no cuenta');
  assert.deepEqual(plain(gql.data.pulls.get(7).assignees), ['eva']);
});

test('GraphQL: un token sin permiso de PRs deja la lista de PRs como desconocida, no como vacía', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const ci = { main: 'SUCCESS', pr: null, noPulls: true };
  fakeGraphQL(gh, ci);
  const { src } = connect(gh, 'tok');
  await src.cycle();
  assert.equal(src.mode, 'graphql');
  assert.equal(src.data.pulls.size, 0);
  assert.equal(src.data.pullsUnknown, true);
  ci.noPulls = false; // con permiso, la lista vuelve a saberse
  await src.cycle();
  assert.equal(src.data.pullsUnknown, false);
});

test('GraphQL: el cuerpo del commit dice si lo escribió un agente y en qué sesión, sin guardar el cuerpo', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  fakeGraphQL(gh, { main: 'SUCCESS', pr: null }, {
    messageHeadline: 'Vista de texto: ramas quietas',
    messageBody: 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01CqYLDWb4ozXDK5nmAkKCeJ',
    author: { name: 'Claude', email: 'noreply@anthropic.com', user: null },
  });
  const sent = [];
  const fetch = gh.fetch;
  gh.fetch = (url, opts = {}) => (url.endsWith('/graphql') && sent.push(JSON.parse(opts.body).query), fetch(url, opts));
  const { src } = connect(gh, 'tok');
  await src.cycle();
  assert.equal(src.mode, 'graphql');
  assert.ok(sent.some((q) => q.includes('messageBody') && q.includes('email')), 'la historia pide el cuerpo y el correo');
  const c = src.data.commits.get('a1');
  assert.equal(c.message, 'Vista de texto: ramas quietas'); // solo el titular, como antes
  assert.equal(c.agent.id, 'claude');
  assert.equal(c.agent.model, 'Opus 5.5');
  assert.equal(c.agent.session, '01CqYLDWb4ozXDK5nmAkKCeJ');
});

test('los comentarios de un PR llevan su número para las interacciones; pedir revisión no es revisar', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src } = connect(gh);
  const ev = (type, payload, id) => ({ id, type, actor: { login: 'Copilot', avatar_url: '' }, created_at: '2026-10-28T12:00:00Z', payload });
  const a = src.mapEvent(ev('IssueCommentEvent', { action: 'created', issue: { number: 9, pull_request: {} }, comment: { body: 'ok' } }, '1'));
  assert.equal(a.number, 9);
  assert.equal(a.pr, true);
  const b = src.mapEvent(ev('IssueCommentEvent', { action: 'created', issue: { number: 10 }, comment: { body: 'ok' } }, '2'));
  assert.equal(b.number, undefined); // de un issue: no es de un PR
  const c = src.mapEvent(ev('PullRequestReviewCommentEvent', { action: 'created', number: 9, pull_request: { number: 9 }, comment: { body: 'x' } }, '3'));
  assert.equal(c.number, 9);
  assert.equal(c.pr, true);
  const d = src.mapEvent(ev('PullRequestEvent', { action: 'review_requested', number: 9, pull_request: { number: 9 } }, '4'));
  assert.equal(d.kind, 'review');
  assert.equal(d.request, true);
});

test('un PR fusionado por el feed lleva quién lo abrió (notas de la versión), no solo quién lo fusionó', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src } = connect(gh);
  const ev = (payload, id) => ({ id, type: 'PullRequestEvent', actor: { login: 'beto', avatar_url: '' }, created_at: '2026-10-28T12:00:00Z', payload });
  const m = src.mapEvent(ev({ action: 'closed', number: 7, pull_request: { number: 7, merged: true, title: 'X', base: { ref: 'main' }, user: { login: 'ana', avatar_url: 'https://avatars.githubusercontent.com/u/1' } } }, '1'));
  assert.equal(m.kind, 'pr-merge');
  assert.equal(m.actor.login, 'beto');
  assert.equal(m.author.login, 'ana');
  const sinUsuario = src.mapEvent(ev({ action: 'closed', number: 8, pull_request: { number: 8, merged: true, title: 'Y', base: { ref: 'main' } } }, '2'));
  assert.equal(sinUsuario.author, null, 'sin el usuario del PR no se inventa: quien lo fusionó no es el autor');
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

/* Estado de los despliegues: /deployments/:id/statuses, una consulta por entorno, solo con el panel de salud abierto. */

test('estado de los despliegues: una consulta por entorno, solo al pedirla, y no más de una cada 15 minutos', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.push('main', 'a2', 'a1');
  gh.deployments = [
    { id: 30, sha: 'a2', ref: 'main', environment: 'production' },
    { id: 20, sha: 'a1', ref: 'main', environment: 'staging' },
    { id: 10, sha: 'a1', ref: 'main', environment: 'production' }, // más viejo: no se pregunta
    { id: 5, sha: 'a1', ref: 'main', environment: 'preview' },
  ];
  gh.deployStatuses = new Map([
    [30, [{ state: 'success' }, { state: 'in_progress' }]],
    [20, [{ state: 'failure' }]],
    [10, [{ state: 'success' }]],
  ]); // el 5 da 404
  const { src, errors, GB } = connect(gh);
  await src.cycle();
  const asked = () => gh.calls.filter((c) => /\/deployments\/\d+\/statuses/.test(c));
  assert.equal(asked().length, 0, 'sin abrir el panel no se consulta');
  const T0 = Date.now();
  assert.equal(await src.syncDeployStatuses(T0), true);
  assert.equal(errors.length, 0);
  assert.deepEqual(asked().map((c) => c.match(/deployments\/(\d+)/)[1]).sort(), ['20', '30', '5'], 'uno por entorno, el último de cada uno');
  assert.ok(asked().every((c) => c.includes('per_page=1')), 'solo el estado más nuevo');
  assert.equal(src.data.deployStatus.get(30).state, 'success');
  assert.equal(src.data.deployStatus.get(20).state, 'failure');
  assert.equal(src.data.deployStatus.get(5).state, null, 'el que falla queda sin estado');
  // el panel de salud lo muestra: salió bien, falló o nada
  const h = GB.health.compute(src.data, [], T0);
  assert.deepEqual(Object.fromEntries(h.deploys.rows.map((r) => [r.env, r.status])), { production: 'ok', staging: 'failed', preview: null });
  assert.equal(await src.syncDeployStatuses(T0 + 14 * 60000), false);
  assert.equal(asked().length, 3, 'no se vuelve a preguntar hasta los 15 minutos');
  gh.deployStatuses.set(30, [{ state: 'in_progress' }]);
  assert.equal(await src.syncDeployStatuses(T0 + 15 * 60000), true);
  assert.equal(asked().length, 6, 'a los 15 minutos, otra vez una por entorno');
  assert.equal(GB.health.compute(src.data, [], T0).deploys.rows.find((r) => r.env === 'production').status, 'running');
});

test('estado de los despliegues: sin token pregunta menos, un despliegue nuevo se pregunta enseguida y el viejo se olvida', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.deployments = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, sha: 'a1', ref: 'main', environment: `env-${i}` }));
  gh.deployStatuses = new Map(Array.from({ length: 9 }, (_, i) => [i + 1, [{ state: 'queued' }]]));
  const { src } = connect(gh);
  await src.cycle();
  const asked = () => gh.calls.filter((c) => /\/deployments\/\d+\/statuses/.test(c)).length;
  const T0 = Date.now();
  await src.syncDeployStatuses(T0);
  assert.equal(asked(), 5, 'sin token, a lo sumo 5 por vez');
  await src.syncDeployStatuses(T0 + 1000);
  assert.equal(asked(), 8, 'los que faltaban, en la vez siguiente');
  // un despliegue nuevo en env-0: se pregunta ya, y el que reemplazó se olvida
  src.data.deploys.set('env-0', { id: 9, sha: 'a1', ref: 'main', at: '' });
  await src.syncDeployStatuses(T0 + 2000);
  assert.equal(asked(), 9);
  assert.equal(src.data.deployStatus.has(1), false);
  assert.equal(src.data.deployStatus.get(9).state, 'queued');
  // dos aperturas del panel a la vez no repiten las consultas
  src.data.deploys.set('env-1', { id: 10, sha: 'a1', ref: 'main', at: '' });
  gh.deployStatuses.set(10, [{ state: 'success' }]);
  await Promise.all([src.syncDeployStatuses(T0 + 2500), src.syncDeployStatuses(T0 + 2500)]);
  assert.equal(asked(), 10);
  assert.equal(src.data.deployStatus.get(10).state, 'success');
  // sin despliegues (o con la carga apagada) no se gasta nada
  src.data.deploys = new Map();
  assert.equal(await src.syncDeployStatuses(T0 + 3000), false);
  assert.equal(asked(), 10);
  assert.equal(src.data.deployStatus.size, 0, 'y se olvida lo que ya no está');
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

test('fileLog: pide /commits?sha=&path= desde ese commit y devuelve autor, fecha y titular de los que tocaron el archivo', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.push('main', 'a2', 'a1');
  gh.push('main', 'a3', 'a2');
  gh.touched = { 'src/app.js': ['a1', 'a3'] };
  const { src } = connect(gh);
  await src.cycle();
  gh.calls.length = 0;

  const log = await src.fileLog('/src/app.js', 'a3');
  assert.deepEqual([...log.map((e) => e.sha)], ['a3', 'a1']);
  assert.ok(log.every((e) => 'author' in e && typeof e.date === 'number' && typeof e.message === 'string'));
  const asked = gh.calls.filter((c) => c.includes('path='));
  assert.equal(asked.length, 1, 'una sola consulta');
  assert.ok(asked[0].includes('sha=a3') && asked[0].includes('path=src%2Fapp.js') && asked[0].includes('per_page=8'));
  assert.equal((await src.fileLog('docs', 'a3')).length, 0);
  gh.calls.length = 0;
  assert.equal((await src.fileLog('', 'a3')).length, 0);
  assert.equal(gh.calls.length, 0, 'sin ruta no gasta cuota');
});

test('fileBlame: con token pide el blame por GraphQL (una consulta) y devuelve tramos de líneas con autor, fecha y titular; sin token no consulta', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const ranges = [
    { startingLine: 21, endingLine: 40, commit: { oid: 'a2', messageHeadline: 'segundo\n\ncuerpo', author: { name: 'Ana', date: '2026-01-02T00:00:00Z', user: { login: 'ana' } } } },
    { startingLine: 1, endingLine: 20, commit: { oid: 'a1', messageHeadline: 'primero', author: { name: null, date: '2026-01-01T00:00:00Z', user: { login: 'bob' } } } },
  ];
  const { src } = connect(gh, 'tok');
  await src.cycle();
  const sent = [];
  gh.override = (path, opts) => {
    if (path !== '/graphql') return null;
    const b = JSON.parse(opts.body);
    if (!/blame\(path/.test(b.query)) return null;
    sent.push(b.variables);
    return { body: { data: { repository: { object: { blame: { ranges } } } } } };
  };
  const out = await src.fileBlame('/src/app.js', 'a2');
  assert.equal(sent.length, 1, 'una sola consulta');
  assert.deepEqual({ oid: sent[0].oid, path: sent[0].path }, { oid: 'a2', path: 'src/app.js' });
  assert.equal(JSON.stringify(out.map((r) => [r.from, r.to, r.sha, r.author, r.message])), JSON.stringify([
    [1, 20, 'a1', 'bob', 'primero'],
    [21, 40, 'a2', 'Ana', 'segundo'],
  ]));
  assert.ok(out.every((r) => typeof r.date === 'number' && r.date > 0));
  // un error de GraphQL (archivo binario, permiso) no rompe: el diff cae al historial del archivo
  gh.override = (path) => (path === '/graphql' ? { body: { data: { repository: { object: null } } } } : null);
  assert.equal(await src.fileBlame('src/app.js', 'a2'), null);
  const anon = connect(gh).src;
  gh.calls.length = 0;
  assert.equal(await anon.fileBlame('src/app.js', 'a2'), null);
  assert.equal(gh.calls.length, 0, 'sin token no gasta cuota');
});

/* Dueños del código: el CODEOWNERS de la rama por defecto, pedido una vez por repo y solo al abrir el panel de cambios. */

test('codeOwners: sin token busca en .github/, la raíz y docs/ (el primero que existe), una vez por repo y nunca sin pedirlo', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const text = '*  @org/todos\n/docs/ @ana\n';
  gh.override = (path) => (path === '/repos/o/r/contents/CODEOWNERS' ? { body: { type: 'file', encoding: 'base64', size: text.length, content: btoa(text), sha: 'x' } } : null);
  const { src } = connect(gh);
  await src.cycle();
  await src.cycle();
  assert.equal(gh.calls.filter((c) => /CODEOWNERS/.test(c)).length, 0, 'sin abrir el panel no se pide');
  gh.calls.length = 0;
  const got = await src.codeOwners();
  assert.deepEqual(plain(got), { path: 'CODEOWNERS', text });
  assert.deepEqual(gh.calls, ['/repos/o/r/contents/.github/CODEOWNERS', '/repos/o/r/contents/CODEOWNERS'], 'para en el primero que existe');
  gh.calls.length = 0;
  assert.deepEqual(plain(await src.codeOwners()), { path: 'CODEOWNERS', text });
  assert.equal(gh.calls.length, 0, 'una vez por repo');
  // sin CODEOWNERS: null, también una sola vez
  gh.override = null;
  const other = connect(gh).src;
  gh.calls.length = 0;
  assert.equal(await other.codeOwners(), null);
  assert.equal(await other.codeOwners(), null);
  assert.equal(gh.calls.length, 3, 'las tres ubicaciones, una vez');
});

test('codeOwners: con token, una consulta de GraphQL por las tres ubicaciones; un fallo se recuerda 5 minutos y después se vuelve a pedir', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const { src } = connect(gh, 'tok');
  await src.cycle();
  const sent = [];
  gh.override = (path, opts) => {
    if (path !== '/graphql') return null;
    const b = JSON.parse(opts.body);
    if (!/CODEOWNERS|on Blob/.test(b.query + JSON.stringify(b.variables))) return null;
    sent.push(b.variables);
    return { body: { data: { repository: { a: null, b: { text: 'raiz @b', isBinary: false }, c: { text: 'docs @c', isBinary: false } } } } };
  };
  gh.calls.length = 0;
  assert.deepEqual(plain(await src.codeOwners()), { path: 'CODEOWNERS', text: 'raiz @b' }, 'la raíz gana a docs/');
  assert.equal(sent.length, 1, 'una sola consulta');
  assert.deepEqual([sent[0].a, sent[0].b, sent[0].c], ['main:.github/CODEOWNERS', 'main:CODEOWNERS', 'main:docs/CODEOWNERS']);
  assert.equal(gh.calls.length, 1);
  await src.codeOwners();
  assert.equal(sent.length, 1, 'una vez por repo');
  // un fallo (500) no se recuerda: el próximo panel lo vuelve a pedir
  const again = connect(gh, 'tok').src;
  await again.cycle();
  const ok = gh.override;
  gh.override = (path, opts) => (path === '/graphql' && /on Blob/.test(JSON.parse(opts.body).query) ? { status: 500, body: { message: 'boom' } } : ok(path, opts));
  await assert.rejects(again.codeOwners());
  gh.override = ok;
  const before = sent.length;
  await assert.rejects(again.codeOwners(), undefined, 'recién fallado: no se pide en cada commit');
  assert.equal(sent.length, before);
  again.ownersFail -= 6 * 60e3; // pasaron más de 5 minutos
  assert.deepEqual(plain(await again.codeOwners()), { path: 'CODEOWNERS', text: 'raiz @b' });
  assert.equal(sent.length, before + 1);
});

test('codeOwners: el primero que existe manda aunque no se pueda leer (más de 1 MB por /contents), y las fuentes que heredan de GitHub no lo piden', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.override = (path) => (path === '/repos/o/r/contents/.github/CODEOWNERS' ? { body: { type: 'file', encoding: 'none', size: 2e6, content: '', sha: 'x' } } : path === '/repos/o/r/contents/CODEOWNERS' ? { body: { type: 'file', encoding: 'base64', size: 4, content: btoa('* @b'), sha: 'y' } } : null);
  const { src, GB } = connect(gh);
  gh.calls.length = 0;
  assert.deepEqual(plain(await src.codeOwners()), { path: '.github/CODEOWNERS', text: '' });
  assert.equal(gh.calls.length, 1, 'no sigue buscando en la raíz');
  const Hija = class extends GB.GitHubSource {};
  const other = new Hija({ owner: 'o', name: 'r' });
  gh.calls.length = 0;
  assert.equal(await other.codeOwners(), null);
  assert.equal(gh.calls.length, 0, 'GitLab, Codeberg, Bitbucket, Azure y las carpetas locales no consultan /contents/CODEOWNERS');
});

/* Forks activos: /forks, solo los que hicieron push propio en los últimos 90 días. */

test('forks: solo los activos, el push más nuevo primero, y una consulta cada 15 minutos, solo al pedirlos', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  const fk = (name, created, pushed, extra = {}) => ({ full_name: name, html_url: `https://github.com/${name}`, created_at: ago(created), pushed_at: ago(pushed), stargazers_count: 1, ...extra });
  gh.forks = [
    fk('a/viejo', 200, 150), // sin actividad en 90 días
    fk('b/reciente', 40, 2),
    fk('c/sin-push', 5, 5), // nunca hizo push propio
    fk('d/nuevo', 30, 0.1),
    fk('e/archivado', 30, 1, { archived: true }),
    fk('f/malo', 30, 1, { html_url: 'javascript:alert(1)' }),
  ];
  const { src, errors } = connect(gh);
  await src.cycle();
  assert.equal(gh.calls.filter((c) => c.startsWith('/repos/o/r/forks')).length, 0, 'sin abrir el panel no se consulta');
  await src.syncForks();
  assert.equal(errors.length, 0);
  assert.deepEqual(Array.from(src.data.forks, (f) => f.fullName), ['d/nuevo', 'b/reciente']);
  const asked = () => gh.calls.filter((c) => c.startsWith('/repos/o/r/forks')).length;
  assert.equal(asked(), 1);
  await src.syncForks();
  assert.equal(asked(), 1, 'no se vuelve a preguntar hasta los 15 minutos');
});

test('forks: sin la API el grafo sigue y la lista queda vacía', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const on = connect(gh);
  await on.src.cycle();
  await on.src.syncForks();
  assert.equal(on.errors.length, 0);
  assert.equal(on.src.data.forks.length, 0);
});

/* Líneas añadidas y borradas por semana: /stats/code_frequency, solo al abrir la salud, con ETag. */

test('líneas por semana: una consulta al pedirlas (con ETag), el 202 queda «calculando» y se reintenta, el 204 queda vacío', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const wk = (d) => Math.floor((Date.now() - d * 864e5) / 1000);
  let reply = { status: 202, body: {} };
  const inm = [];
  gh.override = (path, opts) => {
    if (path !== '/repos/o/r/stats/code_frequency') return null;
    inm.push(opts.headers?.['If-None-Match'] || null);
    return reply;
  };
  const { src, errors } = connect(gh, 'tok');
  await src.cycle();
  const asked = () => gh.calls.filter((c) => c === '/repos/o/r/stats/code_frequency').length;
  assert.equal(asked(), 0, 'sin abrir el panel no se consulta');
  assert.equal(await src.syncCodeFrequency(), true);
  assert.equal(errors.length, 0);
  assert.equal(src.data.codeFreq.state, 'pending', 'GitHub lo está calculando');
  assert.equal(await src.syncCodeFrequency(), false, 'calculando: no se vuelve a preguntar antes del minuto');
  assert.equal(asked(), 1);
  src.lastPoll.codeFreq = Date.now() - 61000;
  reply = { status: 202, body: null }; // un 202 sin cuerpo tampoco es un fallo de red
  assert.equal(await src.syncCodeFrequency(), true, 'con el 202, pasado el minuto se vuelve a preguntar al abrir otra vez');
  assert.equal(src.data.codeFreq.state, 'pending');
  src.lastPoll.codeFreq = Date.now() - 61000;
  reply = { body: [[wk(10), 40, -12], [wk(2), 3, 0], ['x', 1, 1], [wk(1), 'mucho', -1]] };
  const [a, b] = await Promise.all([src.syncCodeFrequency(), src.syncCodeFrequency()]);
  assert.deepEqual([a, b], [true, false], 'dos aperturas seguidas: una sola consulta en vuelo');
  assert.equal(asked(), 3);
  assert.equal(src.data.codeFreq.state, 'ok');
  assert.deepEqual(JSON.parse(JSON.stringify(src.data.codeFreq.weeks.map((w) => [w.added, w.deleted]))), [[40, 12], [3, 0], [0, 1]], 'las borradas en positivo; una semana sin fecha no entra y una cifra rara cuenta 0');
  assert.equal(src.data.codeFreq.weeks[0].time, wk(10) * 1000);
  assert.equal(await src.syncCodeFrequency(), false, 'con la respuesta ya llegada, no se vuelve a preguntar hasta los 15 minutos');
  assert.equal(asked(), 3);
  src.lastPoll.codeFreq = Date.now() - 16 * 60000;
  assert.equal(await src.syncCodeFrequency(), true);
  assert.equal(asked(), 4);
  assert.equal(src.data.codeFreq.weeks.length, 3, 'el 304 deja las mismas semanas');
  assert.ok(inm.at(-1), 'la última consulta llevó el ETag (y la respuesta fue un 304)');
  assert.ok(!inm[0], 'la primera no tenía ETag');
  const urls = gh.urls.filter((u) => u.endsWith('/stats/code_frequency'));
  assert.equal(urls.length, 4);
  // 204: el repo está vacío; 422 (más de 10 000 commits) o 404: sin la línea y sin error
  for (const r of [{ status: 204, body: null }, { status: 422, body: { message: 'too many' } }, { status: 404, body: { message: 'Not Found' } }]) {
    const other = fakeGitHub();
    other.push('main', 'a1');
    other.override = (path) => (path === '/repos/o/r/stats/code_frequency' ? r : null);
    const c = connect(other, 'tok');
    await c.src.cycle();
    await c.src.syncCodeFrequency();
    assert.equal(c.errors.length, 0);
    assert.equal((c.src.data.codeFreq?.weeks || []).length, 0, `con ${r.status} no hay semanas`);
    assert.notEqual(c.src.data.codeFreq?.state, 'pending');
  }
});

/* Tiempo de entrega desde el primer commit: una consulta de /pulls/:n/commits por PR, solo al pedirla. */

test('primer commit de cada PR fusionado: una consulta por PR, una sola vez, y un PR que falla no corta a los demás', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.prCommits = new Map([
    [3, '2026-01-01T00:00:00Z'],
    [4, '2026-01-02T00:00:00Z'],
  ]);
  const { src, errors } = connect(gh, 'tok');
  await src.cycle();
  const asked = () => gh.calls.filter((c) => /\/pulls\/\d+\/commits/.test(c));
  assert.equal(asked().length, 0, 'sin abrir el panel no se consulta');
  assert.equal(await src.syncFirstCommits([3, 4, 5, 3]), true);
  assert.equal(errors.length, 0);
  assert.equal(asked().length, 3, 'una por PR, sin repetir el 3');
  assert.ok(asked().every((c) => c.includes('per_page=1')));
  assert.equal(src.data.firstCommits.get(3), Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(src.data.firstCommits.get(5), null, 'el que dio 404 queda sin dato');
  assert.equal(await src.syncFirstCommits([3, 4, 5]), false);
  assert.equal(asked().length, 3, 'lo ya sabido no se vuelve a pedir');
});

test('primer commit de cada PR: sin token pide menos, para no gastar los 60 por hora', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.prCommits = new Map();
  const { src } = connect(gh);
  await src.cycle();
  await src.syncFirstCommits(Array.from({ length: 15 }, (_, i) => i + 1));
  assert.equal(gh.calls.filter((c) => /\/pulls\/\d+\/commits/.test(c)).length, 8);
});

/* Tiempo de ciclo por etapas (ítem 223): las revisiones de los PRs que el feed no trajo, con /pulls/:n/reviews, solo al pedirlas. */

test('revisiones de los PRs que el feed no trajo: una consulta por PR y una sola vez, con su hora y su tipo, y un PR que falla no corta a los demás', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const at = (d) => `2026-01-0${d}T12:00:00Z`;
  gh.prReviews = new Map([
    [3, [
      { state: 'COMMENTED', submitted_at: at(1) },
      { state: 'CHANGES_REQUESTED', submitted_at: at(2) },
      { state: 'DISMISSED', submitted_at: at(3) }, // una aprobación descartada sigue siendo una revisión, no una aprobación
      { state: 'APPROVED', submitted_at: at(4) },
      { state: 'PENDING' }, // sin enviar: no tiene hora y no cuenta
      { state: 'APPROVED', submitted_at: 'no es una fecha' },
    ]],
    [4, []],
  ]);
  const { src, errors } = connect(gh, 'tok');
  await src.cycle();
  await src.cycle();
  const asked = () => gh.calls.filter((c) => /\/pulls\/\d+\/reviews/.test(c));
  assert.equal(asked().length, 0, 'sin abrir el panel no se consulta');
  assert.equal(await src.syncPrReviews([3, 4, 5, 3, 0, -1, 2.5, '6']), true);
  assert.equal(errors.length, 0);
  assert.deepEqual(asked(), ['/repos/o/r/pulls/3/reviews?per_page=100', '/repos/o/r/pulls/4/reviews?per_page=100', '/repos/o/r/pulls/5/reviews?per_page=100'], 'una por PR, sin repetir el 3 ni pedir lo que no es un número de PR');
  assert.deepEqual(plain(src.data.prReviews.get(3)), [
    { kind: 'review', time: Date.parse(at(1)) },
    { kind: 'review-changes', time: Date.parse(at(2)) },
    { kind: 'review', time: Date.parse(at(3)) },
    { kind: 'review-ok', time: Date.parse(at(4)) },
  ]);
  assert.deepEqual(plain(src.data.prReviews.get(4)), [], 'sin revisiones: se sabe que no las tuvo');
  assert.equal(src.data.prReviews.get(5), null, 'el que dio 404 queda sin dato');
  assert.equal(await src.syncPrReviews([3, 4, 5]), false);
  assert.equal(asked().length, 3, 'lo ya consultado no se vuelve a pedir');
});

test('revisiones de los PRs que el feed no trajo: hasta 20 por apertura con token y 8 sin él, y dos aperturas seguidas no piden dos veces', async () => {
  for (const [token, max] of [['tok', 20], ['', 8]]) {
    const gh = fakeGitHub();
    gh.push('main', 'a1');
    gh.prReviews = new Map();
    const { src } = connect(gh, token);
    await src.cycle();
    const asked = () => gh.calls.filter((c) => /\/pulls\/\d+\/reviews/.test(c)).length;
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    const [a, b] = await Promise.all([src.syncPrReviews(nums), src.syncPrReviews(nums)]);
    assert.deepEqual([a, b], [true, false], 'la segunda espera a la primera');
    assert.equal(asked(), max, `con token «${token}»`);
    await src.syncPrReviews(nums);
    assert.equal(asked(), Math.min(25, 2 * max), 'otra apertura sigue con los que faltaban');
  }
});

test('revisiones de los PRs que el feed no trajo: solo se piden las de los abiertos antes de la actividad cargada, y con ellas el PR entra en las etapas', async () => {
  const gh = fakeGitHub();
  gh.commit('a1');
  gh.branches.set('main', 'a1');
  const now = Date.now();
  const iso = (d) => new Date(now - d * 864e5).toISOString();
  const ev = (id, type, days, payload) => ({ id: String(id), type, actor: { login: 'ana' }, created_at: iso(days), payload });
  const merged = (n, opened) => ({ action: 'closed', number: n, pull_request: { number: n, title: `PR ${n}`, merged: true, created_at: iso(opened), base: { ref: 'main' }, head: { ref: `b${n}` }, user: { login: 'ana' } } });
  gh.events = [
    ev(5, 'PullRequestEvent', 1, merged(8, 2)), // el 8 se abrió hace 2 días, dentro de la actividad cargada…
    ev(4, 'PullRequestReviewEvent', 1.5, { action: 'created', number: 8, review: { state: 'approved', body: 'ok' }, pull_request: { number: 8, title: 'PR 8' } }), // …que trae su aprobación
    ev(3, 'PullRequestEvent', 2.5, merged(7, 10)), // el 7 se abrió hace 10 días: antes de lo más viejo cargado
    ev(2, 'PushEvent', 3, { ref: 'refs/heads/main', head: 'a1' }), // lo más viejo cargado: hace 3 días
  ];
  gh.prReviews = new Map([[7, [{ state: 'APPROVED', submitted_at: iso(4) }]], [8, [{ state: 'APPROVED', submitted_at: iso(1.5) }]]]);
  const { src, updates, GB } = connect(gh, 'tok');
  await src.cycle();
  const acts = updates.flatMap((u) => Array.from(u.activities || []));
  const before = plain(GB.health.compute(src.data, acts, Date.now()).cycle);
  assert.equal(before.early, 1, 'sin consultar, el 7 queda fuera de las etapas');
  assert.equal(before.open.n, 1);
  assert.equal(await src.syncPrReviews(GB.health.earlyMerges(acts, Date.now())), true);
  assert.deepEqual(gh.calls.filter((c) => /\/pulls\/\d+\/reviews/.test(c)), ['/repos/o/r/pulls/7/reviews?per_page=100'], 'solo el que el feed no trajo entero');
  const after = plain(GB.health.compute(src.data, acts, Date.now()).cycle);
  assert.equal(after.early, 0);
  assert.equal(after.fetched, 1);
  assert.equal(after.open.n, 2, 'el 7 entra en las etapas con su aprobación consultada');
  assert.ok(Math.abs(after.review.median - 0) < 1 && after.merge.n === 2);
});

test('revisiones de los PRs que el feed no trajo: GitLab y las demás fuentes hijas no piden /pulls/:n/reviews', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  gh.prReviews = new Map([[3, []]]);
  const { src } = connect(gh, 'tok');
  await src.cycle();
  for (const host of ['gitlab', 'codeberg', 'forgejo', 'bitbucket', 'bitbucketdc', 'azure', 'local']) {
    src.host = host;
    assert.equal(await src.syncPrReviews([3]), false, host);
  }
  assert.equal(gh.calls.filter((c) => /\/reviews/.test(c)).length, 0);
  src.host = 'github';
  assert.equal(await src.syncPrReviews([3]), true, 'GitHub sí');
});

/* ---------- editar un archivo (js/editor.js): leer de una rama y escribir un commit ---------- */

test('readFile: el archivo de la rama (texto UTF-8 y su sha), y uno que no existe, una carpeta, uno enorme o binario', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const files = {
    '/repos/o/r/contents/src/caf%C3%A9.js?ref=main': { body: { type: 'file', encoding: 'base64', size: 9, content: b64('const é = 1;\n').replace(/(.{4})/g, '$1\n'), sha: 'blob1' } },
    '/repos/o/r/contents/src?ref=main': { body: [{ type: 'file', name: 'a.js' }] },
    '/repos/o/r/contents/big.bin?ref=main': { body: { type: 'file', encoding: 'none', size: 5e6, content: '', sha: 'blob2' } },
    '/repos/o/r/contents/logo.png?ref=dev': { body: { type: 'file', encoding: 'base64', size: 4, content: Buffer.from([0x89, 0x50, 0x00, 0x47]).toString('base64'), sha: 'blob3' } },
  };
  gh.override = (path) => files[path] || null;
  const { src } = connect(gh);
  const f = await src.readFile({ path: 'src/café.js', ref: 'main' });
  assert.equal(f.text, 'const é = 1;\n', 'base64 con saltos de línea y bytes UTF-8');
  assert.equal(f.sha, 'blob1');
  assert.equal(f.binary, false);
  assert.equal((await src.readFile({ path: 'nada.txt', ref: 'main' })).missing, true, 'un 404 es un archivo que no existe todavía');
  await assert.rejects(src.readFile({ path: 'src', ref: 'main' }), (err) => err.editKind === 'dir');
  assert.equal((await src.readFile({ path: 'big.bin', ref: 'main' })).tooLarge, true);
  assert.equal((await src.readFile({ path: 'logo.png', ref: 'dev' })).binary, true);
  assert.equal(src.canEdit(), true);
  assert.equal(src.givesReviews(), true, 'el feed de eventos trae las revisiones: la salud parte el tiempo de ciclo');
});

test('writeFile: un PUT a contents con el texto en base64, la rama y el sha; sin token ni lo intenta', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  let sent = null;
  gh.override = (path, opts) => {
    if (opts.method !== 'PUT') return null;
    sent = { path, auth: opts.headers?.Authorization, body: JSON.parse(opts.body) };
    return { body: { content: { sha: 'blob-new' }, commit: { sha: 'c0ffee1234', html_url: 'https://github.com/o/r/commit/c0ffee1234' } } };
  };
  const anon = connect(gh).src;
  assert.equal(anon.canWrite(), 'editor.noToken');
  await assert.rejects(anon.writeFile({ path: 'a.txt', branch: 'main', text: 'x', message: 'm' }), (err) => err.editKind === 'noToken');
  assert.equal(sent, null, 'sin token no sale nada');

  const { src } = connect(gh, 'ghp_x');
  assert.equal(src.canWrite(), null);
  const out = await src.writeFile({ path: 'docs/ñandú.md', branch: 'feat/x', text: 'hola ñandú\n', message: 'Actualiza docs', sha: 'blob-old' });
  assert.equal(sent.path, '/repos/o/r/contents/docs/%C3%B1and%C3%BA.md');
  assert.equal(sent.auth, 'Bearer ghp_x');
  assert.deepEqual(sent.body, { message: 'Actualiza docs', content: Buffer.from('hola ñandú\n', 'utf8').toString('base64'), branch: 'feat/x', sha: 'blob-old' });
  assert.deepEqual({ ...out }, { sha: 'c0ffee1234', url: 'https://github.com/o/r/commit/c0ffee1234', blob: 'blob-new' });
  // un archivo nuevo va sin sha
  await src.writeFile({ path: 'nuevo.txt', branch: 'main', text: '', message: 'Crea nuevo.txt' });
  assert.equal('sha' in sent.body, false);
  // una ruta con «..» no sale: en la URL apuntaría a otro lugar de la API, con el token
  sent = null;
  const calls = gh.calls.length;
  await assert.rejects(src.writeFile({ path: '../../user/repos', branch: 'main', text: 'x', message: 'm' }), (err) => err.editKind === 'path');
  await assert.rejects(src.readFile({ path: 'src/../../../user', ref: 'main' }), (err) => err.editKind === 'path');
  assert.equal(sent, null);
  assert.equal(gh.calls.length, calls, 'ni una consulta');
});

test('writeFile: el motivo de cada fallo (token rechazado, sin permiso de escritura, el archivo ya cambió)', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  let reply = null;
  gh.override = (path, opts) => (opts.method === 'PUT' ? reply : null);
  const { src } = connect(gh, 'ghp_x');
  const kind = async (status, message) => {
    reply = { status, body: { message } };
    try {
      await src.writeFile({ path: 'a.txt', branch: 'main', text: 'x', message: 'm', sha: 's' });
    } catch (err) {
      return err.editKind || err.kind;
    }
    return 'ok';
  };
  assert.equal(await kind(401, 'Bad credentials'), 'auth');
  assert.equal(await kind(403, 'Resource not accessible by personal access token'), 'perm');
  assert.equal(await kind(404, 'Not Found'), 'perm', 'un token sin permiso de escritura ve un 404');
  assert.equal(await kind(409, 'a.txt does not match s'), 'conflict');
  assert.equal(await kind(422, 'Invalid request. "sha" wasn\'t supplied.'), 'conflict');
});

test('la vista de un PR: descripción y los últimos 5 comentarios, solo al pedirla (dos consultas)', async () => {
  const gh = fakeGitHub();
  gh.commit('a1');
  gh.branches.set('main', 'a1');
  const { src, errors } = connect(gh);
  await src.cycle();
  assert.deepEqual(errors, []);
  const before = gh.calls.length;
  gh.override = (path) => {
    if (path === '/repos/o/r/pulls/7') return { body: { number: 7, body: 'Arregla el login', comments: 7 } };
    if (path === '/repos/o/r/issues/7/comments?per_page=100&page=1') {
      const user = { login: 'ana', avatar_url: 'https://avatars.example/ana' };
      return { body: Array.from({ length: 7 }, (_, i) => ({ user, body: `c${i + 1}`, created_at: '2026-10-01T00:00:00Z' })) };
    }
    return null;
  };
  const d = await src.prDetail(7);
  assert.deepEqual(gh.calls.slice(before), ['/repos/o/r/pulls/7', '/repos/o/r/issues/7/comments?per_page=100&page=1']);
  assert.equal(d.body, 'Arregla el login');
  assert.equal(d.total, 7);
  assert.deepEqual(Array.from(d.comments, (c) => c.body), ['c3', 'c4', 'c5', 'c6', 'c7']);
  assert.equal(d.comments[0].user.login, 'ana');
  gh.override = (path) => (path === '/repos/o/r/pulls/8' ? { body: { number: 8, body: null, comments: 0 } } : null);
  const n = gh.calls.length;
  const empty = await src.prDetail(8);
  assert.deepEqual(gh.calls.slice(n), ['/repos/o/r/pulls/8'], 'sin comentarios no hay segunda consulta');
  assert.deepEqual([empty.body, empty.comments.length], ['', 0]);
});

test('mapPull: un repo renombrado sigue marcando sus PRs de la misma repo (compara con la base que da GitHub)', () => {
  const gh = fakeGitHub();
  const { src } = connect(gh); // escrito como o/r, pero GitHub lo conoce ya como nuevo/nombre
  const pr = (head, base) => ({
    number: 1, title: 't', head: { ref: 'feat', repo: head }, base: { ref: 'main', repo: base },
    user: { login: 'ana' }, html_url: 'https://github.com/nuevo/nombre/pull/1', created_at: '2026-10-01T00:00:00Z',
  });
  const nueva = { full_name: 'Nuevo/Nombre' };
  assert.equal(src.mapPull(pr(nueva, nueva)).sameRepo, true, 'rama del propio repo renombrado');
  assert.equal(src.mapPull(pr({ full_name: 'ana/nombre' }, nueva)).sameRepo, false, 'un fork sigue siendo de afuera');
  assert.equal(src.mapPull(pr({ full_name: 'o/r' }, undefined)).sameRepo, true, 'sin base.repo se cae al nombre escrito');
});

test('otras cuentas: tokenFor da a cada dueño su token, y a cualquier otro el principal', () => {
  const GB = load(fakeGitHub());
  const S = GB.GitHubSource;
  const accounts = S.unpackAccounts(S.packAccounts([
    { owner: '@Acme-Corp', token: ' tok-b ' },
    { owner: 'beta', token: 'tok-c' },
    { owner: 'Gamma', token: 'tok-d' },
  ]));
  assert.deepEqual(JSON.parse(JSON.stringify(accounts)), [
    { owner: 'Acme-Corp', token: 'tok-b' },
    { owner: 'beta', token: 'tok-c' },
    { owner: 'Gamma', token: 'tok-d' },
  ]);
  assert.equal(S.tokenFor('acme-corp', 'tok-a', accounts), 'tok-b', 'el dueño no distingue mayúsculas');
  assert.equal(S.tokenFor('BETA', 'tok-a', accounts), 'tok-c');
  assert.equal(S.tokenFor('gamma', 'tok-a', accounts), 'tok-d');
  assert.equal(S.tokenFor('o', 'tok-a', accounts), 'tok-a', 'un tercero usa el principal');
  assert.equal(S.tokenFor('o', '', accounts), '', 'sin principal, un tercero va sin token (nunca con el de otra cuenta)');
  assert.equal(S.tokenFor('', 'tok-a', accounts), 'tok-a', 'sin dueño, el principal');
  assert.equal(S.tokenFor('acme-corp', 'tok-a', []), 'tok-a');
  // sin dueño, sin token o con un dueño que no vale, esa cuenta no está; las demás sí
  for (const [o, t] of [['', 'x'], ['acme', ''], ['../x', 'x'], ['a b', 'x'], ['acme', '   ']]) {
    assert.equal(S.packAccounts([{ owner: o, token: t }]), '', `${o}|${t}`);
    assert.deepEqual(JSON.parse(JSON.stringify(S.unpackAccounts(S.packAccounts([{ owner: o, token: t }, { owner: 'ok', token: 'y' }])))), [{ owner: 'ok', token: 'y' }], `${o}|${t} entre otras`);
  }
  for (const bad of ['', 'basura', '{"owner":"a"}', '{"owner":"a/b","token":"x"}', '[{"owner":"a","token":7}]', '7', 'null', '[null,"x"]']) assert.deepEqual([...S.unpackAccounts(bad)], [], bad);
});

test('otras cuentas: la segunda cuenta guardada pasa a ser la primera de la lista, y una sola se guarda como antes', () => {
  const GB = load(fakeGitHub());
  const S = GB.GitHubSource;
  // lo que guardaba la segunda cuenta de antes: un objeto con su dueño y su token
  const legacy = JSON.stringify({ owner: 'Acme', token: 'tok-b' });
  assert.deepEqual(JSON.parse(JSON.stringify(S.unpackAccounts(legacy))), [{ owner: 'Acme', token: 'tok-b' }]);
  assert.equal(S.tokenFor('acme', 'tok-a', S.unpackAccounts(legacy)), 'tok-b');
  // una sola cuenta se guarda igual que antes: volver a una versión anterior no la pierde
  assert.equal(S.packAccounts(S.unpackAccounts(legacy)), legacy);
  // con más, la lista; la de antes sigue primera
  const more = S.packAccounts([...S.unpackAccounts(legacy), { owner: 'beta', token: 'tok-c' }]);
  assert.deepEqual(JSON.parse(more), [{ owner: 'Acme', token: 'tok-b' }, { owner: 'beta', token: 'tok-c' }]);
});

test('otras cuentas: hasta cinco, y un dueño repetido se queda con su primer token', () => {
  const GB = load(fakeGitHub());
  const S = GB.GitHubSource;
  assert.equal(S.MAX_ACCOUNTS, 5);
  const seven = Array.from({ length: 7 }, (_, i) => ({ owner: `o${i}`, token: `t${i}` }));
  const kept = S.unpackAccounts(S.packAccounts(seven));
  assert.deepEqual([...kept.map((a) => a.owner)], ['o0', 'o1', 'o2', 'o3', 'o4']);
  assert.equal(S.tokenFor('o5', 'tok-a', kept), 'tok-a', 'la sexta no entra: su dueño va con el principal');
  assert.equal(S.unpackAccounts(JSON.stringify(seven)).length, 5, 'lo guardado de más tampoco entra');
  const dup = S.unpackAccounts(S.packAccounts([{ owner: 'Acme', token: 't1' }, { owner: 'acme', token: 't2' }, { owner: 'b', token: 't3' }]));
  assert.deepEqual(JSON.parse(JSON.stringify(dup)), [{ owner: 'Acme', token: 't1' }, { owner: 'b', token: 't3' }]);
  assert.equal(S.tokenFor('ACME', 'tok-a', dup), 't1');
});

test('otras cuentas: con tres dueños, cada repo manda solo su token a la API, y uno de un tercero el principal', async () => {
  const S = load(fakeGitHub()).GitHubSource;
  const accounts = S.unpackAccounts(S.packAccounts([{ owner: 'o', token: 'tok-b' }, { owner: 'p', token: 'tok-c' }, { owner: 'q', token: 'tok-d' }]));
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  const sent = [];
  const fetch = gh.fetch;
  gh.fetch = (url, opts = {}) => (sent.push([url, opts.headers?.Authorization]), fetch(url, opts));
  const GB2 = load(gh);
  const run = async (owner) => {
    const src = new GB2.GitHubSource({ owner, name: 'r', token: GB2.GitHubSource.tokenFor(owner, 'tok-a', accounts) });
    src.running = true;
    await src.loop();
    clearTimeout(src.timer);
  };
  for (const owner of ['o', 'p', 'q', 'x']) await run(owner);
  const of = (owner) => sent.filter(([u]) => u.includes(`/repos/${owner}/`));
  for (const [owner, tok] of [['o', 'tok-b'], ['p', 'tok-c'], ['q', 'tok-d'], ['x', 'tok-a']]) {
    assert.ok(of(owner).length, `se consultó ${owner}`);
    assert.ok(of(owner).every(([, a]) => a === `Bearer ${tok}`), `${owner} va solo con ${tok}: ${JSON.stringify(of(owner))}`);
  }
  assert.ok(sent.every(([u]) => u.startsWith('https://api.github.com/')), 'ninguno sale a otro host');
});

/* «Cargar más» de la ficha de una rama: otra tanda de su historia (tantos commits como el tope), desde donde se cortó,
   con una sola consulta y ninguna para las demás ramas. */

/** Un repo con main de `n` commits (m1…mn) y una rama feat de 3 que sale de su cabeza; la fuente, con tope `depth`. */
function longRepo(n, depth, token = '') {
  const gh = fakeGitHub();
  for (let i = 1; i <= n; i++) gh.commit('m' + i, i > 1 ? 'm' + (i - 1) : null);
  gh.branches.set('main', 'm' + n);
  gh.commit('f1', 'm' + n);
  gh.commit('f2', 'f1');
  gh.commit('f3', 'f2');
  gh.branches.set('feat', 'f3');
  const GB = load(gh);
  const src = new GB.GitHubSource({ owner: 'o', name: 'r', token, depth });
  const updates = [];
  src.on('update', (u) => updates.push(u));
  src.running = true;
  src.cycle = async () => {
    await src.loop();
    clearTimeout(src.timer);
  };
  return { gh, src, updates, GB };
}

test('cargar más (REST): una consulta desde donde se cortó main, tantos commits como el tope, y nada para feat', async () => {
  const { gh, src, updates, GB } = longRepo(40, 10);
  await src.cycle();
  const { commits } = src.data;
  assert.equal(GB.U.historyCut(commits, gh.branches.get('main')), 'm30', 'main cargada hasta m31');
  gh.calls.length = 0;
  updates.length = 0;
  assert.equal(await src.loadMore('main'), 10);
  assert.deepEqual(gh.calls, ['/repos/o/r/commits?sha=m30&per_page=10'], 'una sola consulta, la de main desde su corte');
  for (let i = 21; i <= 30; i++) assert.ok(commits.has('m' + i), 'm' + i + ' cargado');
  assert.equal(commits.has('m20'), false, 'ni uno más que el tope');
  assert.equal(GB.U.historyCut(commits, 'm40'), 'm20');
  assert.equal(updates.length, 1, 'avisa para que el grafo los dibuje');
  assert.equal(updates[0].calm, true, 'sin efectos de llegada: no es actividad nueva');
  assert.equal(updates[0].activities.length, 0);
  // el ciclo siguiente no los vuelve a borrar al recortar
  await src.cycle();
  for (let i = 21; i <= 30; i++) assert.ok(commits.has('m' + i), 'm' + i + ' sigue tras el ciclo');
  // y aunque lleguen muchos commits nuevos y haya que recortar, lo traído (lo más viejo) no es lo que se va
  let head = 'm40';
  for (let i = 1; i <= 900; i++) {
    const sha = 'n' + i;
    commits.set(sha, { sha, parents: [head], message: 'n', author: { name: 'ana' }, date: Date.UTC(2027, 0, 1) + i * 1000, url: '' });
    head = sha;
  }
  src.data.branches.get('main').sha = head;
  src.gc();
  assert.ok(commits.size < 900 + 30 + 3, 'gc recortó');
  for (let i = 21; i <= 30; i++) assert.ok(commits.has('m' + i), 'm' + i + ' sigue tras recortar');
});

test('cargar más (GraphQL): una consulta de la historia de esa rama desde su corte, con el tope del repo', async () => {
  const { gh, src } = longRepo(40, 10);
  await src.cycle();
  src.mode = 'graphql';
  src.token = 'tok';
  const sent = [];
  gh.override = (path, opts) => {
    if (path !== '/graphql') return null;
    const { query } = JSON.parse(opts.body);
    sent.push(query);
    const m = query.match(/h0: object\(oid: "([^"]+)"\) \{ \.\.\. on Commit \{ history\(first: (\d+)\)/);
    const nodes = [];
    for (let i = Number(m[1].slice(1)), k = 0; i >= 1 && k < Number(m[2]); i--, k++) {
      nodes.push({ oid: 'm' + i, url: 'u', committedDate: '2026-01-01T00:00:00Z', messageHeadline: 'c', author: null, parents: { nodes: i > 1 ? [{ oid: 'm' + (i - 1) }] : [] } });
    }
    return { body: { data: { rateLimit: { cost: 1, remaining: 4000, limit: 5000, resetAt: '2030-01-01T00:00:00Z' }, repository: { h0: { history: { nodes } } } } } };
  };
  gh.calls.length = 0;
  assert.equal(await src.loadMore('feat'), 10, 'la ficha de feat trae lo que sigue de su historia (que baja por main)');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /h0: object\(oid: "m30"\)/);
  assert.match(sent[0], /history\(first: 10\)/);
  assert.equal(/h1:/.test(sent[0]), false, 'solo esa rama');
  assert.deepEqual(gh.calls, ['/graphql']);
  assert.ok(src.data.commits.has('m21') && !src.data.commits.has('m20'));
});

test('cargar más: sin corte no consulta nada, y un corte que GitHub no devuelve es un error, no «no hay más»', async () => {
  const { gh, src } = longRepo(5, 10);
  await src.cycle();
  gh.calls.length = 0;
  assert.equal(await src.loadMore('main'), 0, 'main llega a su raíz');
  assert.equal(await src.loadMore('no-existe'), 0);
  assert.deepEqual(gh.calls, []);
  const big = longRepo(30, 10);
  await big.src.cycle();
  big.gh.override = (path) => (path.startsWith('/repos/o/r/commits?') ? { status: 404, body: { message: 'No commit found' } } : null);
  await assert.rejects(() => big.src.loadMore('main'));
});

/* OpenSSF Scorecard (ítem 218): el puntaje ya calculado de un repo público de github.com, de api.scorecard.dev, solo al
   abrir la salud y una vez por pestaña, sin el token de GitHub, sin cookies y sin referer. */

/** Una respuesta como la de api.scorecard.dev (recortada de la de ossf/scorecard del 2026-11-14), con lo raro que la
    fuente no debe dejar pasar: una comprobación sin nombre válido, una de -1 (no concluyente), un motivo con saltos de
    línea y caracteres de control, uno larguísimo y HTML en un motivo. */
const SCORECARD = {
  date: '2026-11-14T01:38:24Z',
  repo: { name: 'github.com/Org/R-Repo', commit: '34496c8af50df71ce3d78b7380c27ddf83e012b9' },
  scorecard: { version: 'v5.6.0', commit: '61e84743356275f6ffca23b1b2f2cb945e19eb96' },
  score: 8.3,
  checks: [
    { name: 'Maintained', score: 10, reason: '30 commit(s) and 18 issue activity found in the last 90 days -- score normalized to 10', details: null, documentation: { url: 'https://github.com/ossf/scorecard/blob/x/docs/checks.md#maintained', short: 'Determines if the project is "actively maintained".' } },
    { name: 'Code-Review', score: 1, reason: 'Found 3/16 approved changesets\n-- score\u0000 normalized to 1', details: null },
    { name: 'Vulnerabilities', score: 3, reason: '<img src=x onerror=alert(1)> 7 existing vulnerabilities detected', details: ['Warn: …'] },
    { name: 'Signed-Releases', score: -1, reason: 'no releases found' },
    { name: 'Branch-Protection', score: 5, reason: 'x'.repeat(500) },
    { name: '<b>malo</b>', score: 0, reason: 'un nombre que no es de Scorecard' },
    { name: 'Fuzzing', score: 'diez', reason: 'puntaje que no es un número' },
    { name: 'SAST', score: 11, reason: 'fuera de escala' },
    null,
  ],
};

/** api.scorecard.dev simulada sobre la API falsa de GitHub: `reply(url)` (o un objeto fijo) da `{ status, body }` o un
    Error (la red caída). Devuelve las consultas que recibió, con sus opciones. Va antes de `connect`. */
function withScorecard(gh, reply) {
  const asked = [];
  const github = gh.fetch;
  gh.fetch = async (url, opts = {}) => {
    if (!String(url).startsWith('https://api.scorecard.dev/')) return github(url, opts);
    asked.push({ url, opts });
    const r = typeof reply === 'function' ? reply(url) : reply;
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    const body = typeof r.body === 'string' ? r.body : r.body == null ? '' : JSON.stringify(r.body);
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => body };
  };
  return asked;
}

test('Scorecard: una consulta al pedirla, con el nombre que da GitHub, sin token, cookies ni referer, y una sola vez por pestaña', async () => {
  const gh = fakeGitHub();
  gh.repo = { ...gh.repo, name: 'R-Repo', owner: { login: 'Org' }, private: false }; // Scorecard distingue mayúsculas: va el nombre de GitHub, no el escrito
  gh.push('main', 'a1');
  const asked = withScorecard(gh, { body: SCORECARD });
  const { src, errors } = connect(gh, 'tok');
  await src.cycle();
  assert.equal(asked.length, 0, 'sin abrir el panel no se consulta');
  const [a, b] = await Promise.all([src.syncScorecard(), src.syncScorecard()]);
  assert.deepEqual([a, b], [true, false], 'dos aperturas seguidas: una sola consulta en vuelo');
  assert.equal(errors.length, 0);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, 'https://api.scorecard.dev/projects/github.com/Org/R-Repo');
  assert.equal(asked[0].opts.headers?.Authorization, undefined, 'el token de GitHub no sale a otro servicio');
  assert.deepEqual(Object.keys(asked[0].opts.headers || {}), ['Accept']);
  assert.equal(asked[0].opts.credentials, 'omit', 'sin cookies');
  assert.equal(asked[0].opts.referrerPolicy, 'no-referrer', 'sin la URL de la página, que lleva ?repo=');
  assert.equal(asked[0].opts.method, undefined, 'un GET');
  const sc = plain(src.data.scorecard);
  assert.equal(sc.state, 'ok');
  assert.equal(sc.score, 8.3);
  assert.equal(sc.date, Date.parse('2026-11-14T01:38:24Z'));
  assert.deepEqual(sc.checks.map((c) => [c.name, c.score]), [['Maintained', 10], ['Code-Review', 1], ['Vulnerabilities', 3], ['Signed-Releases', -1], ['Branch-Protection', 5]], 'sin el nombre que no es de Scorecard ni los puntajes fuera de escala');
  assert.equal(sc.checks[1].reason, 'Found 3/16 approved changesets -- score normalized to 1', 'el motivo en una línea, sin caracteres de control');
  assert.equal(sc.checks[2].reason, '<img src=x onerror=alert(1)> 7 existing vulnerabilities detected', 'el motivo queda como texto: lo escapa quien lo muestra');
  assert.ok(sc.checks[4].reason.length <= 200 && sc.checks[4].reason.endsWith('…'), 'un motivo larguísimo se corta');
  assert.equal(await src.syncScorecard(), false, 'con la respuesta ya llegada, no se vuelve a preguntar');
  assert.equal(asked.length, 1);
  assert.ok(!gh.calls.some((c) => c.includes('scorecard')), 'nada de esto pasa por la API de GitHub ni gasta su cuota');
});

test('Scorecard: sin análisis (404) lo dice; un fallo lo dice y se reintenta al pedirlo otra vez; un repo privado o de GitHub Enterprise no se consulta', async () => {
  const run = async (reply, { token = '', apiUrl = '', priv = false } = {}) => {
    const gh = fakeGitHub();
    if (apiUrl) gh.base = apiUrl;
    gh.repo = { ...gh.repo, private: priv };
    gh.push('main', 'a1');
    const asked = withScorecard(gh, reply);
    const c = connect(gh, token, apiUrl);
    await c.src.cycle();
    return { ...c, asked, ran: await c.src.syncScorecard() };
  };
  const none = await run({ status: 404, body: '' });
  assert.equal(none.ran, true);
  assert.deepEqual(plain(none.src.data.scorecard), { state: 'none' });
  assert.equal(await none.src.syncScorecard(), false, 'sin análisis: tampoco se vuelve a preguntar en la misma pestaña');
  assert.equal(none.errors.length, 0, 'un repo sin análisis no es un error del grafo');

  for (const [what, reply] of [['un 500', { status: 500, body: '' }], ['la red caída', new TypeError('Failed to fetch')], ['un JSON roto', { body: '{"score": 8.3' }], ['un JSON sin puntaje', { body: { date: '2026-11-14T01:38:24Z', checks: [] } }], ['un puntaje fuera de escala', { body: { ...SCORECARD, score: 42 } }]]) {
    const bad = await run(reply);
    assert.equal(bad.ran, true, what);
    assert.equal(bad.src.data.scorecard?.state, 'error', what);
    assert.equal(bad.errors.length, 0, `${what}: el grafo sigue como si nada`);
    assert.equal(bad.src.status?.state !== 'error', true, `${what}: el estado de la fuente no pasa a error`);
  }
  let first = true;
  const retry = await run(() => (first ? ((first = false), new TypeError('Failed to fetch')) : { body: SCORECARD }));
  assert.equal(retry.src.data.scorecard.state, 'error');
  assert.equal(await retry.src.syncScorecard(), true, 'tras un fallo, la próxima apertura vuelve a preguntar');
  assert.equal(retry.src.data.scorecard.state, 'ok');
  assert.equal(retry.asked.length, 2);

  const priv = await run({ body: SCORECARD }, { token: 'tok', priv: true });
  assert.equal(priv.ran, false);
  assert.equal(priv.asked.length, 0, 'el nombre de un repo privado no sale a un tercero');
  assert.equal(priv.src.data.scorecard, undefined, 'y la salud no muestra la sección');
  const ghe = await run({ body: SCORECARD }, { apiUrl: GHE });
  assert.equal(ghe.ran, false);
  assert.equal(ghe.asked.length, 0, 'Scorecard solo analiza github.com');
  const early = fakeGitHub();
  early.push('main', 'a1');
  const askedEarly = withScorecard(early, { body: SCORECARD });
  const before = connect(early);
  assert.equal(await before.src.syncScorecard(), false, 'antes de cargar el repo no se sabe si es público: no se pregunta');
  assert.equal(askedEarly.length, 0);
});

test('Scorecard: scorecardOf lee la respuesta y descarta lo que no es de Scorecard', () => {
  const { GitHubSource } = load(fakeGitHub());
  assert.equal(GitHubSource.scorecardOf(null), null);
  assert.equal(GitHubSource.scorecardOf([]), null);
  assert.equal(GitHubSource.scorecardOf({ score: -1, checks: [] }), null, 'un puntaje de -1 no es un análisis');
  assert.deepEqual(plain(GitHubSource.scorecardOf({ score: 0, date: 'ayer', checks: 'muchas' })), { state: 'ok', score: 0, date: null, checks: [] }, 'sin fecha válida ni lista, el puntaje igual');
  const many = { score: 5, date: '2026-11-14T01:38:24Z', checks: Array.from({ length: 60 }, (_, i) => ({ name: `Check-${i}`, score: i % 11, reason: 'r' })) };
  assert.equal(GitHubSource.scorecardOf(many).checks.length, 40, 'a lo sumo 40 comprobaciones (Scorecard da 18)');
});

/* La firma de cada commit (ítem 230): GraphQL la pide en la misma consulta de la historia y el REST la trae en la misma
   lista de commits; la salud cuenta los de la rama por defecto de las últimas 4 semanas sin firma verificada. */

test('la firma de cada commit (GraphQL): verificada, sin firma o firmada sin verificar con su motivo, y la salud cuenta los de la rama por defecto', async () => {
  const gh = fakeGitHub();
  gh.push('main', 'a1');
  fakeGraphQL(gh, { main: 'SUCCESS', pr: null });
  const now = Date.now();
  const iso = (d) => new Date(now - d * 864e5).toISOString();
  const chain = [
    { oid: 'a1', committedDate: iso(1), messageHeadline: 'firmado', parents: { nodes: [{ oid: 'a2' }] }, signature: { isValid: true, state: 'VALID' } },
    { oid: 'a2', committedDate: iso(2), messageHeadline: 'sin firma', parents: { nodes: [{ oid: 'a3' }] }, signature: null },
    { oid: 'a3', committedDate: iso(3), messageHeadline: 'llave vencida', parents: { nodes: [{ oid: 'a4' }] }, signature: { isValid: false, state: 'EXPIRED_KEY' } },
    { oid: 'a4', committedDate: iso(4), messageHeadline: 'estado raro', parents: { nodes: [{ oid: 'a5' }] }, signature: { isValid: false, state: '<b>x</b>' } },
    { oid: 'a5', committedDate: iso(40), messageHeadline: 'viejo sin firma', parents: { nodes: [] }, signature: null },
  ].map((c) => ({ url: 'u', author: null, ...c }));
  const sent = [];
  const fetch = gh.fetch;
  gh.fetch = (url, opts = {}) => {
    if (!url.endsWith('/graphql')) return fetch(url, opts);
    const { query } = JSON.parse(opts.body);
    sent.push(query);
    if (!query.includes('history(')) return fetch(url, opts);
    const repository = {};
    for (const m of query.matchAll(/(h\d+): object\(oid: "([^"]+)"/g)) repository[m[1]] = { history: { nodes: chain.slice(chain.findIndex((c) => c.oid === m[2])) } };
    const body = JSON.stringify({ data: { rateLimit: { cost: 1, remaining: 4000, limit: 5000, resetAt: '2030-01-01T00:00:00Z' }, repository } });
    return Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, text: async () => body, json: async () => JSON.parse(body) });
  };
  const { src, GB } = connect(gh, 'tok');
  await src.cycle();
  assert.equal(src.mode, 'graphql');
  assert.ok(sent.some((q) => q.includes('history(') && q.includes('signature { isValid state }')), 'la historia pide la firma, sin otra consulta');
  const sig = (sha) => plain(src.data.commits.get(sha).sig);
  assert.deepEqual(sig('a1'), { ok: true });
  assert.deepEqual(sig('a2'), { ok: false, state: 'UNSIGNED' });
  assert.deepEqual(sig('a3'), { ok: false, state: 'EXPIRED_KEY' });
  assert.deepEqual(sig('a4'), { ok: false, state: 'BXB' }, 'el motivo llega solo con letras y _: nada que se pueda leer como HTML');
  const h = plain(GB.health.compute(src.data, [], now).signed);
  assert.deepEqual(
    { branch: h.branch, total: h.total, unverified: h.unverified, unsigned: h.unsigned, invalid: h.invalid, rows: h.rows.map((r) => [r.sha, r.message, r.state]) },
    { branch: 'main', total: 4, unverified: 3, unsigned: 1, invalid: 2, rows: [['a2', 'sin firma', 'UNSIGNED'], ['a3', 'llave vencida', 'EXPIRED_KEY'], ['a4', 'estado raro', 'BXB']] },
    'el de hace 40 días no entra; el más reciente primero',
  );
});

test('la firma de cada commit (REST, también sin token): la lista de commits ya trae verification, sin consultas nuevas', async () => {
  const gh = fakeGitHub();
  gh.commit('r1');
  gh.commit('r2', 'r1');
  gh.commit('r3', 'r2');
  gh.push('main', 'r4', 'r3');
  gh.commits.get('r2').commit.verification = { verified: true, reason: 'valid', signature: '-----BEGIN PGP SIGNATURE-----', payload: 'x' };
  gh.commits.get('r3').commit.verification = { verified: false, reason: 'unsigned', signature: null, payload: null };
  gh.commits.get('r4').commit.verification = { verified: false, reason: 'unknown_key', signature: 'x', payload: 'x' };
  const { src, GB } = connect(gh);
  await src.cycle();
  assert.notEqual(src.mode, 'graphql');
  const sig = (sha) => plain(src.data.commits.get(sha).sig ?? null);
  assert.equal(sig('r1'), null, 'sin verification la fuente no dice nada de la firma');
  assert.deepEqual(sig('r2'), { ok: true });
  assert.deepEqual(sig('r3'), { ok: false, state: 'UNSIGNED' });
  assert.deepEqual(sig('r4'), { ok: false, state: 'UNKNOWN_KEY' });
  assert.ok(gh.calls.every((c) => !/verification|signature/.test(c)), 'ninguna consulta nueva');
  const h = plain(GB.health.compute(src.data, [], Date.UTC(2026, 0, 2)).signed);
  assert.deepEqual([h.total, h.unverified, h.unsigned, h.invalid], [3, 2, 1, 1], 'r1, sin firma conocida, no cuenta');
  // sin ninguna firma conocida (otra fuente, un repo local), la salud no dice nada
  for (const c of src.data.commits.values()) delete c.sig;
  assert.equal(GB.health.compute(src.data, [], Date.UTC(2026, 0, 2)).signed, null);
});

test('la firma: sigOf y restSig leen solo la forma de GitHub', () => {
  const GB = load(fakeGitHub());
  const { sigOf, restSig } = GB.GitHubSource;
  assert.equal(sigOf({ oid: 'x' }), undefined, 'una consulta sin el campo no dice nada');
  assert.deepEqual(plain(sigOf({ signature: null })), { ok: false, state: 'UNSIGNED' });
  assert.deepEqual(plain(sigOf({ signature: { isValid: 'true', state: 'VALID' } })), { ok: false, state: 'VALID' }, 'solo un true de verdad es verificada');
  assert.deepEqual(plain(sigOf({ signature: { isValid: false } })), { ok: false, state: 'INVALID' });
  assert.equal(restSig(undefined), undefined);
  assert.equal(restSig({ reason: 'valid' }), undefined, 'sin verified no se sabe');
  assert.deepEqual(plain(restSig({ verified: false, reason: 'gpgverify_unavailable' })), { ok: false, state: 'GPGVERIFY_UNAVAILABLE' });
  assert.equal(restSig({ verified: false, reason: 'x'.repeat(80) }).state.length, 32, 'un motivo largo se corta');
});
