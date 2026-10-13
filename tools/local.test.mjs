#!/usr/bin/env node
/* Pruebas de la fuente de repos locales (js/sources/local.js) contra repositorios git reales creados en la
   prueba, leídos con electron/git.js como lo hace el proceso principal de la app de escritorio.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/local.test.mjs    solo estas

   La página no tiene red: el `fetch` del contexto falla si la fuente lo toca (nunca debe). */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const gitMain = createRequire(import.meta.url)('../electron/git.js');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'gb-localsrc-')));
after(() => rmSync(base, { recursive: true, force: true }));

const env = { ...process.env, GIT_AUTHOR_NAME: 'Ana', GIT_AUTHOR_EMAIL: 'ana@example.com', GIT_COMMITTER_NAME: 'Ana', GIT_COMMITTER_EMAIL: 'ana@example.com' };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const commit = (dir, file, text, msg) => {
  writeFileSync(join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
};
let n = 0;
function makeRepo() {
  const dir = join(base, `r${++n}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

/** Carga util.js, github.js y local.js con un GBDesktop.git que lee de electron/git.js. */
function load() {
  const listeners = new Set();
  const calls = { watch: 0, unwatch: 0 };
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    fetch: () => Promise.reject(new Error('un repo local no usa la red')),
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  });
  ctx.window = ctx;
  ctx.GBDesktop = {
    git: {
      branches: (id) => gitMain.branches(id),
      log: (id, sha, exclude, count) => gitMain.log(id, sha, exclude, count),
      isAncestor: (id, a, b) => gitMain.isAncestor(id, a, b),
      files: (id, sha, from) => gitMain.files(id, sha, from),
      watch: async () => void calls.watch++,
      unwatch: async () => void calls.unwatch++,
      onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    },
  };
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('sources/local.js'), ctx, { filename: 'sources/local.js' });
  return { GB: ctx.GB, ctx, emit: (id) => listeners.forEach((fn) => fn(id)), calls };
}

/** Ciclos hasta que no quede ninguna rama esperando su historia; devuelve las actividades de todos. */
async function settle(src, initial = false) {
  const acts = [];
  for (let i = 0; i < 20; i++) {
    acts.push(...(await src.poll(initial && i === 0)));
    src.data.loaded = true;
    if (!src.data.pending) break;
  }
  return acts;
}

async function open(dir, opts = {}) {
  const { GB, ...rest } = load();
  const { id, name } = await gitMain.allow(dir);
  return { src: new GB.LocalGitSource({ id, name, ...opts }), id, name, GB, ...rest };
}

test('carga las ramas locales con su historia, sin red y sin enlaces a la web', async () => {
  const dir = makeRepo();
  const c1 = commit(dir, 'a.txt', '1\n', 'uno');
  const c2 = commit(dir, 'a.txt', '2\n', 'dos');
  git(dir, 'checkout', '-q', '-b', 'feature/x');
  const c3 = commit(dir, 'b.txt', '3\n', 'tres en la rama sin publicar');
  git(dir, 'checkout', '-q', 'main');
  const { src, name } = await open(dir);
  await settle(src, true);
  const d = src.data;
  assert.equal(d.repo.defaultBranch, 'main');
  assert.equal(d.repo.name, name);
  assert.equal(d.repo.url, null);
  assert.equal(d.repo.local, true);
  assert.deepEqual([...d.branches.keys()].sort(), ['feature/x', 'main']);
  assert.equal(d.branches.get('main').isDefault, true);
  assert.equal(d.branches.get('feature/x').sha, c3);
  assert.deepEqual([...d.commits.keys()].sort(), [c1, c2, c3].sort());
  assert.deepEqual([...d.commits.get(c3).parents], [c2]);
  assert.equal(d.commits.get(c3).author.name, 'Ana');
  assert.equal(d.commits.get(c3).url, null);
  assert.equal(d.totalBranches, 2);
  assert.equal(d.pending, 0);
});

test('un commit, una rama nueva, un force-push y un borrado salen como actividades', async () => {
  const dir = makeRepo();
  commit(dir, 'a.txt', '1\n', 'uno');
  const { src } = await open(dir);
  await settle(src, true);

  const c2 = commit(dir, 'a.txt', '2\n', 'dos');
  let acts = await settle(src);
  assert.deepEqual(acts.map((a) => [a.kind, a.branch, a.url]), [['push', 'main', undefined]]);
  assert.equal(src.data.branches.get('main').sha, c2);

  git(dir, 'checkout', '-q', '-b', 'nueva');
  const c3 = commit(dir, 'b.txt', '3\n', 'tres');
  acts = await settle(src);
  assert.deepEqual(acts.map((a) => [a.kind, a.branch, a.url]), [['branch-create', 'nueva', null]]);
  assert.equal(src.data.branches.get('nueva').sha, c3);

  git(dir, 'commit', '-q', '--amend', '-m', 'tres, reescrito');
  const c3b = git(dir, 'rev-parse', 'HEAD');
  acts = await settle(src);
  assert.deepEqual(acts.map((a) => [a.kind, a.branch]), [['force', 'nueva']]);
  assert.equal(src.data.branches.get('nueva').sha, c3b);

  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'une nueva', 'nueva');
  acts = await settle(src);
  assert.deepEqual(acts.map((a) => [a.kind, a.branch]), [['merge', 'main']]);

  git(dir, 'branch', '-q', '-D', 'nueva');
  acts = await settle(src);
  assert.deepEqual(acts.map((a) => [a.kind, a.branch]), [['branch-delete', 'nueva']]);
  assert.ok(!src.data.branches.has('nueva'));
});

test('un aviso del proceso principal adelanta el ciclo y solo si es de su carpeta; al detenerla deja de vigilar', async () => {
  const dir = makeRepo();
  commit(dir, 'a.txt', '1\n', 'uno');
  const { src, id, emit, calls } = await open(dir);
  const updates = [];
  src.on('update', (u) => updates.push(u));
  src.start();
  for (let i = 0; i < 100 && !src.data.loaded; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(src.data.loaded, 'no cargó');
  assert.equal(calls.watch, 1);
  const before = updates.length;
  const c2 = commit(dir, 'a.txt', '2\n', 'dos');
  emit('otra-carpeta');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(updates.length, before, 'un aviso de otra carpeta no tiene que correr un ciclo');
  emit(id);
  for (let i = 0; i < 100 && updates.length === before; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(updates.length > before, 'el aviso no adelantó el ciclo');
  assert.equal(src.data.branches.get('main').sha, c2);
  src.stop();
  assert.equal(calls.unwatch, 1);
});

test('una carpeta desconocida o que ya no es un repo es un error que corta la carga, con su mensaje', async () => {
  const { GB } = load();
  const src = new GB.LocalGitSource({ id: '0123456789ab', name: 'perdida' });
  await assert.rejects(src.poll(true), (err) => err.kind === 'notfound' && err.msg.key === 'err.notFoundLocal' && err.msg.params.repo === 'perdida');
});

test('fuera de la app de escritorio (sin GBDesktop) también es un error claro, sin colgarse', async () => {
  const { GB, ctx } = load();
  delete ctx.GBDesktop;
  const src = new GB.LocalGitSource({ id: '0123456789ab', name: 'web' });
  await assert.rejects(src.poll(true), (err) => err.kind === 'notfound');
});

test('files: el árbol de la rama por defecto y lo que cambió en las demás, sin enlaces', async () => {
  const dir = makeRepo();
  commit(dir, 'README.md', 'hola\n', 'uno');
  git(dir, 'checkout', '-q', '-b', 'rama');
  const c2 = commit(dir, 'nuevo.txt', 'a\nb\n', 'dos');
  git(dir, 'checkout', '-q', 'main');
  const { src } = await open(dir);
  await settle(src, true);
  const main = await src.files({ name: 'main', sha: src.data.branches.get('main').sha, isDefault: true });
  assert.equal(main.kind, 'tree');
  assert.deepEqual(main.files.map((f) => [f.path, f.size, f.url]), [['README.md', 5, null]]);
  const rama = await src.files({ name: 'rama', sha: c2, isDefault: false });
  assert.equal(rama.kind, 'diff');
  assert.equal(rama.base, 'main');
  assert.deepEqual(rama.files.map((f) => [f.path, f.status, f.add, f.del, f.url]), [['nuevo.txt', 'added', 2, 0, null]]);
});

test('parseRepo entiende local:<id>/<nombre> y lo distingue de GitHub y GitLab', async () => {
  const { GB } = load();
  assert.deepEqual({ ...GB.U.parseRepo('local:0123456789ab/mi proyecto') }, { host: 'local', owner: '0123456789ab', name: 'mi proyecto' });
  assert.equal(GB.U.parseRepo('local:zzz/x'), null);
  assert.equal(GB.U.parseRepo('local:0123456789ab/'), null);
  assert.equal(GB.U.parseRepo('a/b').host, undefined);
});
