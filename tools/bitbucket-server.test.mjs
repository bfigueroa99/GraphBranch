#!/usr/bin/env node
/* Pruebas de la fuente de un Bitbucket Data Center o Server propio (js/sources/bitbucket-server.js) contra una API REST 1.0 simulada.

     node --test                              todas las pruebas (archivos *.test.mjs)
     node tools/bitbucket-server.test.mjs     solo estas

   La API falsa sirve el repo ANA/api en https://bb.example.com: ramas con `isLastPage`/`nextPageStart`, el listado de
   commits (`until`/`since`), PRs, `files` y el diff en JSON. Ninguna consulta puede salir a otro host ni llevar credenciales. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const OWN = 'https://bb.example.com';
const API = `${OWN}/rest/api/1.0`;
const REPO = '/projects/ANA/repos/api';
const WEB = `${OWN}/projects/ANA/repos/api`;

function load(fetch) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    TextEncoder,
    TextDecoder,
    fetch,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  });
  ctx.window = ctx;
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(code('diff.js'), ctx, { filename: 'diff.js' });
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('sources/bitbucket-server.js'), ctx, { filename: 'sources/bitbucket-server.js' });
  return ctx.GB;
}

function fakeServer() {
  const bb = { commits: new Map(), branches: new Map(), pulls: [], override: null, calls: [], headers: [], status: 200 };
  let n = 0;
  bb.commit = (id, ...parents) => {
    bb.commits.set(id, {
      id,
      displayId: id.slice(0, 7),
      message: `commit ${id}\n`,
      parents: parents.map((p) => ({ id: p })),
      authorTimestamp: Date.UTC(2026, 0, 1) + ++n * 60000,
      author: { name: 'ana', displayName: 'Ana Pérez', slug: 'ana', emailAddress: 'ana@example.com' },
    });
  };
  bb.push = (branch, id, ...parents) => {
    bb.commit(id, ...parents);
    bb.branches.set(branch, id);
  };
  const reach = (id) => {
    const out = new Set();
    const stack = [id];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !bb.commits.has(s)) continue;
      out.add(s);
      stack.push(...bb.commits.get(s).parents.map((p) => p.id));
    }
    return out;
  };
  const paged = (all, q) => {
    const limit = Math.min(Number(q.get('limit') || 25), 100);
    const start = Number(q.get('start') || 0);
    const values = all.slice(start, start + limit);
    const last = start + limit >= all.length;
    return { body: { size: values.length, limit, isLastPage: last, start, values, ...(last ? {} : { nextPageStart: start + limit }) } };
  };
  bb.pull = (id, from, to, more = {}) => {
    bb.pulls.push({
      id,
      title: `PR ${id}`,
      state: 'OPEN',
      draft: false,
      createdDate: Date.now(),
      fromRef: { displayId: from, repository: { slug: 'api', project: { key: 'ANA' } } },
      toRef: { displayId: to, repository: { slug: 'api', project: { key: 'ANA' } } },
      author: { user: { name: 'ana', slug: 'ana', displayName: 'Ana Pérez' } },
      links: { self: [{ href: `${WEB}/pull-requests/${id}` }] },
      ...more,
    });
  };
  const missing = { status: 404, body: { errors: [{ message: 'no existe' }] } };
  function route(path) {
    const u = new URL(API + path);
    const p = u.pathname.replace('/rest/api/1.0', '');
    const q = u.searchParams;
    if (p === REPO) return { body: { slug: 'api', name: 'api', project: { key: 'ANA' }, public: true, description: 'un repo' } };
    if (p === REPO + '/default-branch') return { body: { displayId: 'main', id: 'refs/heads/main' } };
    if (p === REPO + '/branches') {
      const all = [...bb.branches]
        .map(([displayId, latestCommit]) => ({ id: `refs/heads/${displayId}`, displayId, latestCommit }))
        .sort((a, b) => bb.commits.get(b.latestCommit).authorTimestamp - bb.commits.get(a.latestCommit).authorTimestamp);
      return paged(all, q);
    }
    if (p === REPO + '/commits') {
      const head = q.get('until');
      const since = q.get('since');
      if (!bb.commits.has(head) || (since && !bb.commits.has(since))) return missing;
      const skip = since ? reach(since) : new Set();
      const list = [...reach(head)].filter((s) => !skip.has(s)).map((s) => bb.commits.get(s)).sort((a, b) => b.authorTimestamp - a.authorTimestamp);
      return paged(list, q);
    }
    if (p === REPO + '/pull-requests') return paged(bb.pulls.filter((x) => q.get('state') !== 'OPEN' || x.state === 'OPEN'), q);
    const one = p.match(/\/pull-requests\/(\d+)$/);
    if (one) {
      const pr = bb.pulls.find((x) => x.id === Number(one[1]));
      return pr ? { body: pr } : missing;
    }
    if (p === REPO + '/files') return paged(['README.md', 'src/app.js'], q);
    if (/\/commits\/[^/]+\/diff$/.test(p)) {
      return {
        body: {
          diffs: [
            {
              source: { toString: 'src/app.js' },
              destination: { toString: 'src/app.js' },
              hunks: [{ sourceLine: 1, sourceSpan: 2, destinationLine: 1, destinationSpan: 2, segments: [{ type: 'CONTEXT', lines: [{ line: 'a' }] }, { type: 'REMOVED', lines: [{ line: 'b' }] }, { type: 'ADDED', lines: [{ line: 'c' }] }] }],
            },
          ],
        },
      };
    }
    return missing;
  }
  bb.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith(API + '/'), `consulta fuera del servidor propio: ${url}`);
    assert.equal(opts.headers?.Authorization, undefined, 'ninguna consulta lleva credenciales');
    bb.headers.push(opts.headers);
    const path = url.slice(API.length);
    bb.calls.push(path);
    const { status = 200, body, headers = {} } = bb.status !== 200 ? { status: bb.status, body: {} } : bb.override?.(path) || route(path);
    const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { status, ok: status >= 200 && status < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return bb;
}

function connect(bb, opts = {}) {
  const GB = load(bb.fetch);
  const src = new GB.BitbucketServerSource({ owner: 'ANA', name: 'api', webUrl: OWN, ...opts });
  const updates = [];
  const errors = [];
  src.on('update', (u) => updates.push(u));
  src.on('status', (s) => s.state === 'error' && errors.push(s));
  src.running = true;
  src.cycle = async () => {
    await src.loop();
    clearTimeout(src.timer);
  };
  return { src, updates, errors, GB };
}

const acts = (updates) => Array.from(updates.at(-1)?.activities || [], (a) => ({ kind: a.kind, key: a.title?.key, branch: a.branch ?? null }));

function repo() {
  const bb = fakeServer();
  bb.push('main', 'm1');
  bb.push('main', 'm2', 'm1');
  bb.push('main', 'm3', 'm2');
  bb.push('feature', 'f1', 'm3');
  bb.push('feature', 'f2', 'f1');
  return bb;
}

test('endpoints: solo https y sin usuario; la API cuelga de /rest/api/1.0, también bajo una ruta', async () => {
  const { GB } = connect(fakeServer());
  const ep = (u) => JSON.parse(JSON.stringify(GB.BitbucketServerSource.endpoints(u)));
  assert.deepEqual(ep(OWN + '/'), { web: OWN, api: API });
  assert.deepEqual(ep(OWN + '/bitbucket'), { web: `${OWN}/bitbucket`, api: `${OWN}/bitbucket/rest/api/1.0` });
  assert.equal(GB.BitbucketServerSource.endpoints(''), null);
  assert.equal(GB.BitbucketServerSource.endpoints('http://bb.example.com'), null);
  assert.equal(GB.BitbucketServerSource.endpoints('https://ana:clave@bb.example.com'), null);
});

test('parseRepo reconoce las URL del servidor propio y bitbucketdc:CLAVE/repo, solo si hay servidor elegido', async () => {
  const { GB } = connect(fakeServer());
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.equal(GB.U.parseRepo('bitbucketdc:ANA/api'), null, 'sin servidor elegido no hay a dónde ir');
  assert.equal(GB.U.parseRepo(`${OWN}/projects/ANA/repos/api/browse`), null);
  GB.U.bitbucketBase = OWN;
  const want = { host: 'bitbucketdc', owner: 'ANA', name: 'api' };
  assert.deepEqual(plain(GB.U.parseRepo('bitbucketdc:ANA/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/projects/ANA/repos/api/browse`)), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/projects/ANA/repos/api/commits?until=x`)), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/scm/ANA/api.git`)), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/users/ana/repos/api/browse`)), { host: 'bitbucketdc', owner: '~ana', name: 'api' }, 'un repo personal lleva ~');
  assert.equal(GB.U.parseRepo('bitbucketdc:solo'), null);
  assert.equal(GB.U.parseRepo(`${OWN}/projects/ANA`), null);
  assert.equal(GB.U.parseRepo(`${OWN}/projects/../repos/api`), null);
  assert.equal(GB.U.parseRepo('bitbucketdc:../api'), null);
  assert.equal(GB.U.parseRepo(`${OWN}.evil.net/projects/ANA/repos/api`), null, 'se compara por prefijo exacto');
  assert.deepEqual(plain(GB.U.parseRepo('https://bitbucket.org/atlassian/aui')), { host: 'bitbucket', owner: 'atlassian', name: 'aui' }, 'bitbucket.org sigue igual');
});

test('una dirección que no es https no se usa: ninguna consulta sale', async () => {
  const bb = repo();
  const { src, errors } = connect(bb, { webUrl: 'http://bb.example.com' });
  assert.equal(src.ep.web.includes('example.com'), false);
  await src.cycle().catch(() => {});
  assert.equal(bb.calls.length, 0, 'nada llega al servidor');
  assert.ok(errors.length <= 1);
});

test('carga el repo: solo habla con el servidor propio, sin credenciales, y los enlaces son suyos', async () => {
  const bb = repo();
  bb.pull(5, 'feature', 'main');
  const { src, errors } = connect(bb);
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(src.host, 'bitbucketdc');
  assert.equal(r.host, 'bitbucketdc');
  assert.equal(r.url, WEB);
  assert.equal(r.defaultBranch, 'main');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  assert.equal(commits.get('f2').url, `${WEB}/commits/f2`);
  assert.equal(commits.get('f2').author.avatar, null);
  assert.equal(commits.get('f2').parents[0], 'f1');
  assert.equal(pulls.get(5).sameRepo, true);
  assert.equal(pulls.get(5).url, `${WEB}/pull-requests/5`);
  assert.equal(pulls.get(5).user.login, 'ana');
  assert.ok(bb.calls.length > 0);
});

test('un repo personal (~ana) usa /users/ana/repos para sus enlaces', async () => {
  const { src } = connect(repo(), { owner: '~ana' });
  assert.equal(src.data.repo.url, `${OWN}/users/ana/repos/api`);
  assert.equal(src.base, '/projects/~ana/repos/api');
});

test('en vivo: push, rama nueva, PR abierto y fusionado, force-push y rama borrada', async () => {
  const bb = repo();
  const { src, updates, errors } = connect(bb);
  await src.cycle();

  bb.push('main', 'm4', 'm3');
  bb.push('fix/x', 'x1', 'm4');
  bb.pull(6, 'fix/x', 'main', { draft: true });
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main' });
  assert.equal(live.find((a) => a.kind === 'branch-create')?.branch, 'fix/x');
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.prOpenedDraft');
  assert.equal(src.data.pulls.get(6).draft, true);

  bb.pulls.find((x) => x.id === 6).state = 'MERGED';
  bb.push('main', 'm5', 'm4', 'x1');
  bb.push('feature', 'f9', 'm4'); // reescribe feature desde m4: f1 y f2 se pierden
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  assert.equal(later.find((a) => a.kind === 'pr-merge')?.key, 'act.prMergedInto');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature' });

  bb.branches.delete('fix/x');
  await src.cycle();
  assert.ok(acts(updates).some((a) => a.branch === 'fix/x' && a.kind.startsWith('branch-delete')), JSON.stringify(acts(updates)));
  assert.equal(src.data.branches.has('fix/x'), false);
  assert.deepEqual(errors, []);
  const urls = Array.from(updates.at(-1).activities, (a) => a.url).filter(Boolean);
  assert.ok(urls.every((u) => u.startsWith(OWN + '/')), 'todos los enlaces son del servidor propio');
});

test('más de 100 ramas: sigue con nextPageStart hasta isLastPage', async () => {
  const bb = fakeServer();
  bb.push('main', 'c0');
  for (let i = 1; i <= 130; i++) bb.push(`r${i}`, `c${i}`, 'c0');
  const { src } = connect(bb);
  await src.cycle();
  assert.equal(src.data.branches.size + src.data.pending, 131);
  assert.ok(bb.calls.filter((c) => c.includes('/branches')).length >= 2, 'pidió la segunda página');
  assert.ok(bb.calls.filter((c) => c.includes('/branches')).some((c) => c.includes('start=100')));
});

test('errores: no se encuentra / sin permiso (401) y 429 llevan los textos del servidor, sin nombrar a Bitbucket Cloud', async () => {
  for (const status of [404, 401, 403]) {
    const bb = repo();
    bb.status = status;
    const c = connect(bb);
    await c.src.cycle();
    assert.equal(c.errors[0].message.key, 'err.notFoundForge', String(status));
  }
  const bb = repo();
  bb.override = (path) => (path.includes('/branches') ? { status: 429, body: {}, headers: { 'Retry-After': '30' } } : null);
  const c = connect(bb);
  await c.src.cycle();
  assert.equal(c.errors[0].message.key, 'err.rateForge');
  const bb2 = repo();
  bb2.override = (path) => (path.includes('/branches') ? { status: 500, body: { errors: [{ message: 'roto' }] } } : null);
  const c2 = connect(bb2);
  await c2.src.cycle();
  assert.equal(c2.errors[0].message.key, 'err.httpForge');
  assert.equal(c2.errors[0].message.params.message, 'roto');
});

test('el árbol de archivos (galaxias) y el diff de un commit salen del servidor propio', async () => {
  const bb = repo();
  const { src } = connect(bb);
  await src.cycle();
  const tree = await src.files({ sha: 'f2' });
  assert.deepEqual([...tree.files.map((f) => f.path)], ['README.md', 'src/app.js']);
  assert.equal(tree.files[1].url, `${WEB}/browse/src/app.js?at=f2`);
  const d = await src.commitDiff('f2');
  assert.equal(d.files.length, 1);
  assert.equal(d.files[0].path, 'src/app.js');
  assert.equal(d.files[0].add, 1);
  assert.equal(d.files[0].del, 1);
});

test('el token de Bitbucket Cloud no sale hacia el servidor propio', async () => {
  const bb = repo();
  const { src } = connect(bb, { token: 'secreto' });
  await src.cycle();
  assert.ok(bb.calls.length > 0);
  assert.ok(bb.headers.every((h) => !JSON.stringify(h).includes('secreto')));
});
