#!/usr/bin/env node
/* Pruebas de la fuente de Codeberg (js/sources/codeberg.js) contra una API de codeberg.org simulada.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/codeberg.test.mjs     solo estas

   La API falsa sirve el repo ana/api como Forgejo: páginas con `limit` (tope de 50, encabezado Link),
   el listado de commits desde una cabeza, comparaciones `a...b`, PRs y árboles. Un repo privado
   responde 404, y ninguna consulta debe llevar un token. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const REPO = '/repos/ana/api';
const WEB = 'https://codeberg.org/ana/api';

function load(cb) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    fetch: cb.fetch,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  });
  ctx.window = ctx;
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('sources/codeberg.js'), ctx, { filename: 'sources/codeberg.js' });
  return ctx.GB;
}

function fakeCodeberg() {
  const cb = { commits: new Map(), branches: new Map(), pulls: [], override: null, calls: [], private: false };
  let n = 0;
  cb.commit = (sha, ...parents) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    cb.commits.set(sha, {
      sha,
      html_url: `${WEB}/commit/${sha}`,
      parents: parents.map((p) => ({ sha: p })),
      commit: { message: `commit ${sha}\n`, author: { name: 'Ana', date }, committer: { date } },
      author: { login: 'ana', avatar_url: 'https://codeberg.org/avatars/ana' },
    });
  };
  cb.push = (branch, sha, ...parents) => {
    cb.commit(sha, ...parents);
    cb.branches.set(branch, sha);
  };
  const reach = (sha) => {
    const out = new Set();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !cb.commits.has(s)) continue;
      out.add(s);
      stack.push(...cb.commits.get(s).parents.map((p) => p.sha));
    }
    return out;
  };
  const resolve = (ref) => (cb.branches.get(ref) || (cb.commits.has(ref) ? ref : null));
  const paged = (all, q) => {
    const limit = Math.min(50, Number(q.get('limit') || 30));
    const page = Number(q.get('page') || 1);
    const headers = { 'X-Total-Count': all.length };
    if (page * limit < all.length) headers.Link = `<https://codeberg.org/next>; rel="next"`;
    return { body: all.slice((page - 1) * limit, page * limit), headers };
  };
  cb.pull = (number, head, base, more = {}) => {
    const p = {
      number,
      title: `PR ${number}`,
      html_url: `${WEB}/pulls/${number}`,
      state: 'open',
      merged: false,
      head: { ref: head, repo: { full_name: 'ana/api' } },
      base: { ref: base },
      user: { login: 'ana', full_name: 'Ana', avatar_url: 'https://seccdn.libravatar.org/avatar/x' },
      created_at: new Date().toISOString(),
      ...more,
    };
    cb.pulls.push(p);
    return p;
  };

  function route(path) {
    const u = new URL('https://codeberg.org/api/v1' + path);
    const p = u.pathname.replace('/api/v1', '');
    const q = u.searchParams;
    if (p === REPO) return { body: { name: 'api', owner: { login: 'ana' }, default_branch: 'main', html_url: WEB, private: cb.private, description: 'un repo' } };
    if (p === REPO + '/branches') {
      const all = [...cb.branches].sort((a, b) => a[0].localeCompare(b[0])).map(([name, sha]) => ({ name, commit: { id: sha }, protected: name === 'main' }));
      return paged(all, q);
    }
    if (p === REPO + '/commits') {
      const head = resolve(q.get('sha'));
      if (!head) return { status: 404, body: { message: 'object does not exist' } };
      const list = [...reach(head)].map((s) => cb.commits.get(s)).sort((a, b) => Date.parse(b.commit.committer.date) - Date.parse(a.commit.committer.date));
      return paged(list, q);
    }
    const cmp = p.match(/\/compare\/(.+)\.\.\.(.+)$/);
    if (cmp) {
      const [from, to] = [resolve(decodeURIComponent(cmp[1])), resolve(decodeURIComponent(cmp[2]))];
      if (!from || !to) return { status: 404, body: { message: 'not found' } };
      const old = reach(from);
      const commits = [...reach(to)].filter((s) => !old.has(s));
      return { body: { total_commits: commits.length, commits: commits.map((s) => cb.commits.get(s)) } };
    }
    if (p === REPO + '/pulls') {
      const list = cb.pulls.filter((x) => q.get('state') === 'all' || x.state === q.get('state'));
      return paged(list, q);
    }
    const one = p.match(/\/pulls\/(\d+)$/);
    if (one) {
      const pr = cb.pulls.find((x) => x.number === Number(one[1]));
      return pr ? { body: pr } : { status: 404, body: { message: 'not found' } };
    }
    if (p.startsWith(REPO + '/git/trees/')) {
      return { body: { tree: [{ path: 'src', type: 'tree' }, { path: 'src/app.js', type: 'blob', size: 120 }, { path: 'README.md', type: 'blob', size: 30 }], truncated: false } };
    }
    return { status: 404, body: { message: 'not found' } };
  }

  cb.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith('https://codeberg.org/api/v1/'), `consulta fuera de Codeberg: ${url}`);
    assert.equal(opts.headers?.Authorization, undefined, 'ninguna consulta lleva token');
    const path = url.replace('https://codeberg.org/api/v1', '');
    cb.calls.push(path);
    const { status = 200, body, headers = {} } =
      cb.private && path.startsWith(REPO) ? { status: 404, body: { message: 'not found' } } : cb.override?.(path) || route(path);
    const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { status, ok: status >= 200 && status < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => JSON.stringify(body) };
  };
  return cb;
}

function connect(cb, opts = {}) {
  const GB = load(cb);
  const src = new GB.CodebergSource({ owner: 'ana', name: 'api', ...opts });
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

const acts = (updates) => Array.from(updates.at(-1)?.activities || [], (a) => ({ kind: a.kind, key: a.title?.key, branch: a.branch ?? null, url: a.url ?? null }));

function repo() {
  const cb = fakeCodeberg();
  cb.push('main', 'm1');
  cb.push('main', 'm2', 'm1');
  cb.push('main', 'm3', 'm2');
  cb.push('feature', 'f1', 'm3');
  cb.push('feature', 'f2', 'f1');
  return cb;
}

test('parseRepo entiende codeberg:dueño/repo y las URL de codeberg.org', async () => {
  const { GB } = connect(fakeCodeberg());
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const want = { host: 'codeberg', owner: 'forgejo', name: 'forgejo' };
  assert.deepEqual(plain(GB.U.parseRepo('codeberg:forgejo/forgejo')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://codeberg.org/forgejo/forgejo')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://codeberg.org/forgejo/forgejo/src/branch/main/README.md')), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@codeberg.org:forgejo/forgejo.git')), want);
  assert.equal(GB.U.parseRepo('codeberg:solo'), null);
  assert.equal(GB.U.parseRepo('https://codeberg.org/forgejo'), null);
  assert.deepEqual(plain(GB.U.parseRepo('acme/api')), { owner: 'acme', name: 'api' }, 'GitHub sigue igual');
});

test('carga un repo: ramas, historia y PRs, sin token y solo contra codeberg.org', async () => {
  const cb = repo();
  cb.pull(5, 'feature', 'main', { title: 'WIP: algo' });
  const { src, updates, errors } = connect(cb);
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(r.url, WEB);
  assert.equal(r.host, 'codeberg');
  assert.equal(src.host, 'codeberg');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(commits.has(sha), `falta ${sha}`);
  assert.equal(commits.get('f2').url, `${WEB}/commit/f2`);
  assert.equal(commits.get('f2').author.avatar, 'https://codeberg.org/avatars/ana');
  const pr = pulls.get(5);
  assert.equal(pr.draft, true, 'un título «WIP:» es un borrador');
  assert.equal(pr.sameRepo, true);
  assert.equal(pr.user.avatar, null, 'los avatares de otro sitio no se muestran (el CSP los bloquea)');
  assert.ok(updates.length >= 1);
  assert.ok(cb.calls.every((c) => !/per_page/.test(c)), 'el tamaño de página se pide con limit');
});

test('en vivo: push, rama nueva, PR abierto y fusionado, force-push y rama borrada', async () => {
  const cb = repo();
  const { src, updates, errors } = connect(cb);
  await src.cycle();

  cb.push('main', 'm4', 'm3');
  cb.push('fix/x', 'x1', 'm4');
  cb.pull(6, 'fix/x', 'main');
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main', url: `${WEB}/commit/m4` });
  assert.deepEqual(live.find((a) => a.kind === 'branch-create'), { kind: 'branch-create', key: 'act.branchCreated', branch: 'fix/x', url: `${WEB}/src/branch/fix/x` });
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.prOpened');

  Object.assign(cb.pulls.find((x) => x.number === 6), { state: 'closed', merged: true, merged_by: { login: 'bea', avatar_url: 'https://codeberg.org/avatars/bea' } });
  cb.push('main', 'm5', 'm4', 'x1');
  cb.push('feature', 'f9', 'm4'); // reescribe feature desde m4: f1 y f2 se pierden
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  assert.equal(later.find((a) => a.kind === 'pr-merge')?.key, 'act.prMergedInto');
  assert.equal(Array.from(updates.at(-1).activities).find((a) => a.kind === 'pr-merge').actor.login, 'bea');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature', url: `${WEB}/commits/branch/feature` });

  cb.branches.delete('fix/x');
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['fix/x']);
});

test('un repo que no existe (o es privado) lo dice y no insiste', async () => {
  const cb = repo();
  cb.private = true;
  const { src, errors } = connect(cb);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.notFoundCodeberg');
  assert.equal(errors[0].nextAt, null);
  assert.equal(src.running, false);
});

test('si Codeberg pide bajar el ritmo (429), espera lo que dice Retry-After', async () => {
  const cb = repo();
  const { src, errors } = connect(cb);
  cb.override = (path) => (path.includes('/branches') ? { status: 429, body: { message: 'slow down' }, headers: { 'Retry-After': '120' } } : null);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.rateCodeberg');
  const wait = errors[0].nextAt - Date.now();
  assert.ok(wait > 115000 && wait < 125000, `espera ${wait} ms`);
});

test('con más de 50 ramas lista todas las páginas', async () => {
  const cb = repo();
  for (let i = 0; i < 70; i++) cb.push(`b${i}`, `s${i}`, 'm3');
  const { src, errors } = connect(cb);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(src.data.totalBranches, 72);
  assert.ok(cb.calls.filter((c) => c.startsWith(REPO + '/branches')).length >= 2, 'pidió la segunda página');
});

test('archivos: el árbol con el tamaño de cada archivo, para el modo galaxias', async () => {
  const cb = repo();
  const { src } = connect(cb);
  await src.cycle();
  const out = await src.files({ name: 'feature', sha: 'f2', isDefault: false });
  assert.equal(out.kind, 'tree');
  assert.deepEqual(Array.from(out.files, (f) => [f.path, f.size, f.url]), [
    ['src/app.js', 120, `${WEB}/src/commit/f2/src/app.js`],
    ['README.md', 30, `${WEB}/src/commit/f2/README.md`],
  ]);
});
