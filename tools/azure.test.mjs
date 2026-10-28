#!/usr/bin/env node
/* Pruebas de la fuente de Azure DevOps (js/sources/azure.js) contra una API de dev.azure.com simulada.

     node --test                   todas las pruebas (archivos *.test.mjs)
     node tools/azure.test.mjs     solo estas

   La API falsa sirve el repo acme/web/api como Azure Repos 7.1: `refs`, la lista de commits (que NO trae los
   padres, como la real), el commit suelto (que sí), la comparación (con `compareVersion` al revés de lo que
   parece) y los PRs. Un proyecto privado redirige al inicio de sesión (respuesta opaca) y nunca se manda un token. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const HOST = 'https://dev.azure.com';
const REPO = '/acme/web/_apis/git/repositories/api';
const WEB = `${HOST}/acme/web/_git/api`;

function load(az) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    TextEncoder,
    TextDecoder,
    fetch: az.fetch,
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
  vm.runInContext(code('sources/azure.js'), ctx, { filename: 'sources/azure.js' });
  return ctx.GB;
}

function fakeAzure() {
  const az = { commits: new Map(), branches: new Map(), pulls: [], override: null, calls: [], init: [], private: false };
  let n = 0;
  az.commit = (id, ...parents) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    az.commits.set(id, { commitId: id, author: { name: 'Ana Pérez', email: null, date }, committer: { name: 'Ana Pérez', date }, comment: `commit ${id}`, parents });
  };
  az.push = (branch, id, ...parents) => {
    az.commit(id, ...parents);
    az.branches.set(branch, id);
  };
  const reach = (id) => {
    const out = new Set();
    const stack = [id];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !az.commits.has(s)) continue;
      out.add(s);
      stack.push(...az.commits.get(s).parents);
    }
    return out;
  };
  const noParents = ({ parents, ...rest }) => rest; // la lista de Azure no trae los padres
  az.pull = (id, head, base, more = {}) => {
    const p = {
      pullRequestId: id,
      title: `PR ${id}`,
      status: 'active',
      isDraft: false,
      sourceRefName: `refs/heads/${head}`,
      targetRefName: `refs/heads/${base}`,
      createdBy: { displayName: 'Ana Pérez', uniqueName: 'ana@example.com' },
      creationDate: new Date().toISOString(),
      closedBy: null,
      ...more,
    };
    az.pulls.push(p);
    return p;
  };
  const notFound = { status: 404, body: { message: 'TF401019: The Git repository does not exist', typeKey: 'GitRepositoryNotFoundException' } };

  function route(path) {
    const u = new URL(HOST + path);
    const p = u.pathname;
    const q = u.searchParams;
    assert.equal(q.get('api-version'), '7.1', 'siempre pide la versión de la API');
    if (p === REPO) return { body: { id: 'r1', name: 'api', webUrl: WEB, defaultBranch: 'refs/heads/main', project: { name: 'web', visibility: az.private ? 'private' : 'public', description: 'un proyecto' } } };
    if (p === REPO + '/refs') {
      assert.equal(q.get('filter'), 'heads/');
      const all = [...az.branches].map(([name, objectId]) => ({ name: `refs/heads/${name}`, objectId })).sort((a, b) => a.name.localeCompare(b.name));
      const top = Number(q.get('$top') || 1000);
      return { body: { count: Math.min(top, all.length), value: all.slice(0, top) }, headers: all.length > top ? { 'x-ms-continuationtoken': 'abc' } : {} };
    }
    if (p === REPO + '/commits') {
      const head = q.get('searchCriteria.itemVersion.version');
      assert.equal(q.get('searchCriteria.itemVersion.versionType'), 'commit');
      if (!az.commits.has(head)) return notFound;
      let list = [...reach(head)];
      const cmp = q.get('searchCriteria.compareVersion.version');
      if (cmp) {
        // al revés: lo que `compareVersion` tiene y `itemVersion` no
        if (!az.commits.has(cmp)) return notFound;
        const skip = reach(head);
        list = [...reach(cmp)].filter((s) => !skip.has(s));
      }
      list = list.map((s) => az.commits.get(s)).sort((a, b) => Date.parse(b.author.date) - Date.parse(a.author.date));
      const top = Number(q.get('searchCriteria.$top') || 100);
      return { body: { count: Math.min(top, list.length), value: list.slice(0, top).map(noParents) } };
    }
    const one = p.match(/\/repositories\/api\/commits\/([^/]+)$/);
    if (one) return az.commits.has(one[1]) ? { body: az.commits.get(one[1]) } : notFound;
    if (p === REPO + '/pullrequests') {
      const active = q.get('searchCriteria.status') === 'active';
      const list = az.pulls.filter((x) => !active || x.status === 'active');
      return { body: { count: list.length, value: list } };
    }
    const pr = p.match(/\/pullrequests\/(\d+)$/);
    if (pr) {
      const found = az.pulls.find((x) => x.pullRequestId === Number(pr[1]));
      return found ? { body: found } : notFound;
    }
    return notFound;
  }

  az.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith(HOST + '/'), `consulta fuera de dev.azure.com: ${url}`);
    assert.equal(opts.headers?.Authorization, undefined, 'sin token: ninguna consulta lleva Authorization');
    assert.equal(opts.redirect, 'manual', 'sin seguir la redirección al inicio de sesión (otro origen)');
    az.init.push(opts);
    const path = url.slice(HOST.length);
    az.calls.push(path);
    if (az.private && path.startsWith(REPO.split('/_apis')[0])) return { type: 'opaqueredirect', status: 0, ok: false, statusText: '', headers: { get: () => null }, text: async () => '' };
    const { status = 200, body, headers = {} } = az.override?.(path) || route(path);
    const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { type: 'cors', status, ok: status >= 200 && status < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return az;
}

function connect(az, opts = {}) {
  const GB = load(az);
  const src = new GB.AzureSource({ owner: 'acme/web', name: 'api', ...opts });
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
  const az = fakeAzure();
  az.push('main', 'm1');
  az.push('main', 'm2', 'm1');
  az.push('main', 'm3', 'm2');
  az.push('feature', 'f1', 'm3');
  az.push('feature', 'f2', 'f1');
  return az;
}

test('parseRepo entiende azure:org/proyecto/repo y las URL de dev.azure.com', () => {
  const { GB } = connect(fakeAzure());
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const want = { host: 'azure', owner: 'acme/web', name: 'api' };
  assert.deepEqual(plain(GB.U.parseRepo('azure:acme/web/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://dev.azure.com/acme/web/_git/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://dev.azure.com/acme/web/_git/api?version=GBmain&_a=history')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://acme@dev.azure.com/acme/web/_git/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@ssh.dev.azure.com:v3/acme/web/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://dev.azure.com/acme/Mi%20Proyecto/_git/api')), { host: 'azure', owner: 'acme/Mi Proyecto', name: 'api' }, 'el proyecto puede llevar espacios');
  assert.deepEqual(plain(GB.U.parseRepo('https://dev.azure.com/acme/_git/api')), { host: 'azure', owner: 'acme/api', name: 'api' }, 'sin proyecto aparte, el repo se llama como él');
  assert.equal(GB.U.parseRepo('azure:acme/web'), null);
  assert.equal(GB.U.parseRepo('https://dev.azure.com/acme'), null);
  assert.equal(GB.U.parseRepo('azure:acme/../api'), null);
  assert.deepEqual(plain(GB.U.parseRepo('acme/api')), { owner: 'acme', name: 'api' }, 'GitHub sigue igual');
});

test('carga un repo: ramas, historia con sus padres y PRs, sin token y solo contra dev.azure.com', async () => {
  const az = repo();
  az.pull(5, 'feature', 'main', { isDraft: true });
  const { src, updates, errors } = connect(az);
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(r.url, WEB);
  assert.equal(r.host, 'azure');
  assert.equal(r.defaultBranch, 'main');
  assert.equal(r.private, false);
  assert.equal(src.host, 'azure');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(commits.has(sha), `falta ${sha}`);
  const c = commits.get('f2');
  assert.equal(c.url, `${WEB}/commit/f2`);
  assert.deepEqual([c.author.name, c.author.avatar], ['Ana Pérez', null], 'sin avatar: los de Azure DevOps piden sesión');
  assert.deepEqual([...c.parents], ['f1'], 'los padres salen del commit suelto, porque la lista no los trae');
  assert.deepEqual([...commits.get('m1').parents], []);
  const pr = pulls.get(5);
  assert.equal(pr.draft, true);
  assert.equal(pr.sameRepo, true);
  assert.equal(pr.head, 'feature');
  assert.equal(pr.base, 'main');
  assert.equal(pr.user.avatar, null);
  assert.equal(pr.url, `${WEB}/pullrequest/5`);
  assert.ok(updates.length >= 1);
});

test('los commits que otra rama ya trajo no se piden otra vez', async () => {
  const az = repo();
  const { src, errors } = connect(az);
  await src.cycle();
  assert.deepEqual(errors, []);
  const details = az.calls.filter((c) => /\/commits\/[0-9a-z]+\?/.test(c));
  assert.equal(details.length, new Set(details).size, 'ningún commit se pidió dos veces');
  assert.equal(details.length, 5, 'uno por commit: m1, m2, m3, f1 y f2');
});

test('en vivo: push, rama nueva, PR abierto y fusionado, force-push y rama borrada', async () => {
  const az = repo();
  const { src, updates, errors } = connect(az);
  await src.cycle();

  az.push('main', 'm4', 'm3');
  az.push('fix/x', 'x1', 'm4');
  az.pull(6, 'fix/x', 'main');
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main', url: `${WEB}/commit/m4` });
  assert.deepEqual(live.find((a) => a.kind === 'branch-create'), { kind: 'branch-create', key: 'act.branchCreated', branch: 'fix/x', url: `${WEB}?version=GBfix%2Fx` });
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.prOpened');

  Object.assign(az.pulls.find((x) => x.pullRequestId === 6), { status: 'completed', closedBy: { displayName: 'Bea', uniqueName: 'bea@example.com' } });
  az.push('main', 'm5', 'm4', 'x1');
  az.push('feature', 'f9', 'm4'); // reescribe feature desde m4: f1 y f2 se pierden
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  assert.equal(later.find((a) => a.kind === 'pr-merge')?.key, 'act.prMergedInto');
  assert.equal(Array.from(updates.at(-1).activities).find((a) => a.kind === 'pr-merge').actor.login, 'bea@example.com');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature', url: `${WEB}?version=GBfeature&_a=history` });

  az.branches.delete('fix/x');
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['fix/x']);
});

test('un PR abandonado cuenta como cerrado, no como fusionado', async () => {
  const az = repo();
  az.pull(7, 'feature', 'main');
  const { src, updates } = connect(az);
  await src.cycle();
  Object.assign(az.pulls[0], { status: 'abandoned', closedBy: { displayName: 'Bea', uniqueName: 'bea@example.com' } });
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('pr-')).map((a) => a.kind), ['pr-close']);
});

test('un proyecto privado (redirige al inicio de sesión) o que no existe lo dice y no insiste', async () => {
  const az = repo();
  az.private = true;
  const { src, errors } = connect(az);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.notFoundAzure');
  assert.deepEqual({ ...errors[0].message.params }, { repo: 'acme/web/api' });
  assert.equal(errors[0].nextAt, null);
  assert.equal(src.running, false);

  const plain302 = fakeAzure();
  plain302.override = () => ({ status: 302, body: '<html>Object moved</html>' }); // fuera del navegador la redirección llega como 302
  const other = connect(plain302);
  await other.src.cycle();
  assert.equal(other.errors[0].message.key, 'err.notFoundAzure');

  const gone = connect(repo(), { name: 'nada' });
  await gone.src.cycle();
  assert.equal(gone.errors[0].message.key, 'err.notFoundAzure', 'un 404 de Azure también es «no se encontró»');
});

test('si Azure pide bajar el ritmo (429), espera un minuto y lo dice', async () => {
  const az = repo();
  const { src, errors } = connect(az);
  az.override = (path) => (path.includes('/refs') ? { status: 429, body: { message: 'TF400733: slow down' } } : null);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.rateForge');
  const wait = errors[0].nextAt - Date.now();
  assert.ok(wait > 55000 && wait < 65000, `espera ${wait} ms`);
});

test('otro error HTTP lleva el mensaje del servicio, sin su código TF', async () => {
  const az = repo();
  const { src, errors } = connect(az);
  az.override = (path) => (path.includes('/refs') ? { status: 500, body: { message: 'TF400898: An Internal Error Occurred.' } } : null);
  await src.cycle();
  assert.equal(errors[0].message.key, 'err.httpForge');
  assert.deepEqual({ ...errors[0].message.params }, { status: 500, message: 'An Internal Error Occurred.' });
});

test('con más ramas de las que se piden dice que el total no es exacto', async () => {
  const az = repo();
  for (let i = 0; i < 520; i++) az.push(`b${String(i).padStart(3, '0')}`, `s${i}`, 'm3');
  const { src, errors } = connect(az);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(src.data.totalExact, false);
  assert.ok(az.calls.some((c) => c.includes('%24top=500') || c.includes('$top=500')), 'pide hasta 500 ramas');
});

test('los enlaces de la API solo valen si cuelgan de dev.azure.com', async () => {
  const az = repo();
  const { src } = connect(az);
  assert.equal(src.webUrl('javascript:alert(1)'), '');
  assert.equal(src.webUrl('https://evil.example/x'), '');
  assert.equal(src.webUrl(`${HOST}/acme/web/_git/api`), `${HOST}/acme/web/_git/api`);
});

test('todavía sin árbol de archivos, sin cambios de commit y sin edición', () => {
  const { src } = connect(fakeAzure());
  assert.equal(src.files, null);
  assert.equal(src.commitDiff, null);
  assert.equal(src.canEdit(), false);
});
