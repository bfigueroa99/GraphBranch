/* electron/git.js contra repos reales creados en la prueba: ramas, historia, ancestros, archivos y el vigilante.
   Sin red y sin tocar el repo del proyecto. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const local = createRequire(import.meta.url)('../electron/git.js');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'gb-local-')));
after(() => rmSync(base, { recursive: true, force: true }));

const env = { ...process.env, GIT_AUTHOR_NAME: 'Ana', GIT_AUTHOR_EMAIL: 'ana@example.com', GIT_COMMITTER_NAME: 'Ana', GIT_COMMITTER_EMAIL: 'ana@example.com' };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const commit = (dir, file, text, msg) => {
  writeFileSync(join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
};

function makeRepo(name) {
  const dir = join(base, name);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

test('allow acepta la raíz de un repo (también desde una subcarpeta) y rechaza lo que no es un repo', async () => {
  const dir = makeRepo('uno');
  commit(dir, 'a.txt', 'a\n', 'primero');
  mkdirSync(join(dir, 'sub'));
  const a = await local.allow(dir);
  const b = await local.allow(join(dir, 'sub'));
  assert.equal(a.id, b.id);
  assert.equal(a.name, 'uno');
  await assert.rejects(local.allow(base), (err) => err.kind === 'git' || err.kind === 'notrepo');
  await assert.rejects(local.branches('0000'), (err) => err.kind === 'unknown');
});

test('branches lista las ramas locales con su cabeza y la rama por defecto', async () => {
  const dir = makeRepo('ramas');
  const first = commit(dir, 'a.txt', 'a\n', 'primero');
  git(dir, 'checkout', '-q', '-b', 'feature/x');
  const second = commit(dir, 'b.txt', 'b\n', 'segundo');
  git(dir, 'checkout', '-q', 'main');
  const { id } = await local.allow(dir);
  const info = await local.branches(id);
  assert.equal(info.defaultBranch, 'main');
  assert.deepEqual(
    info.branches.map((b) => [b.name, b.sha]).sort(),
    [['feature/x', second], ['main', first]],
  );
  assert.ok(info.branches.every((b) => b.date > 0));
});

test('log trae los commits de una cabeza sin los de la otra, los más nuevos primero, con autor y padres', async () => {
  const dir = makeRepo('historia');
  const c1 = commit(dir, 'a.txt', '1\n', 'uno');
  const c2 = commit(dir, 'a.txt', '2\n', 'dos\n\ncuerpo largo');
  git(dir, 'checkout', '-q', '-b', 'rama');
  const c3 = commit(dir, 'b.txt', '3\n', 'tres');
  const { id } = await local.allow(dir);
  const all = await local.log(id, c3, null, 10);
  assert.deepEqual(all.map((c) => c.sha), [c3, c2, c1]);
  assert.deepEqual(all[0].parents, [c2]);
  assert.deepEqual(all[2].parents, []);
  assert.equal(all[0].name, 'Ana');
  assert.equal(all[1].message, 'dos\n\ncuerpo largo');
  assert.deepEqual((await local.log(id, c3, c2, 10)).map((c) => c.sha), [c3]);
  assert.equal((await local.log(id, c3, null, 2)).length, 2);
  await assert.rejects(local.log(id, '--output=/tmp/x', null, 5), /inválido/);
  await assert.rejects(local.log(id, c3, '-p', 5), /inválido/);
});

test('isAncestor distingue un avance de una reescritura', async () => {
  const dir = makeRepo('ancestro');
  const c1 = commit(dir, 'a.txt', '1\n', 'uno');
  const c2 = commit(dir, 'a.txt', '2\n', 'dos');
  const { id } = await local.allow(dir);
  assert.equal(await local.isAncestor(id, c1, c2), true);
  assert.equal(await local.isAncestor(id, c2, c1), false);
  assert.equal(await local.isAncestor(id, 'f'.repeat(40), c2), false); // un commit que ya no existe
});

test('files da el árbol con tamaños y, con base, lo que cambió en la rama', async () => {
  const dir = makeRepo('archivos');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'ñandú.js'), 'x'.repeat(12));
  const c1 = commit(dir, 'README.md', 'hola\n', 'uno');
  git(dir, 'checkout', '-q', '-b', 'rama');
  writeFileSync(join(dir, 'nuevo.txt'), 'a\nb\nc\n');
  const c2 = commit(dir, 'README.md', 'hola\nmundo\n', 'dos');
  const { id } = await local.allow(dir);
  const tree = await local.files(id, c2, null);
  assert.equal(tree.kind, 'tree');
  assert.deepEqual(tree.files.map((f) => f.path).sort(), ['README.md', 'nuevo.txt', 'src/ñandú.js']);
  assert.equal(tree.files.find((f) => f.path === 'src/ñandú.js').size, 12);
  const diff = await local.files(id, c2, c1);
  assert.equal(diff.kind, 'diff');
  const by = Object.fromEntries(diff.files.map((f) => [f.path, f]));
  assert.deepEqual([by['nuevo.txt'].status, by['nuevo.txt'].add, by['nuevo.txt'].del], ['added', 3, 0]);
  assert.deepEqual([by['README.md'].status, by['README.md'].add], ['modified', 1]);
});

test('watch avisa cuando llega un commit y cuando nace una rama, y deja de avisar al detenerlo', async () => {
  const dir = makeRepo('vigia');
  commit(dir, 'a.txt', '1\n', 'uno');
  const { id } = await local.allow(dir);
  let hits = 0;
  const stop = local.watch(id, () => hits++);
  await new Promise((r) => setTimeout(r, 400)); // los vigilantes se arman tras una consulta a git
  const waitFor = async (n) => {
    for (let i = 0; i < 50 && hits < n; i++) await new Promise((r) => setTimeout(r, 100));
    return hits >= n;
  };
  commit(dir, 'a.txt', '2\n', 'dos');
  assert.ok(await waitFor(1), 'un commit nuevo no avisó');
  const seen = hits;
  git(dir, 'branch', 'otra');
  assert.ok(await waitFor(seen + 1), 'una rama nueva no avisó');
  stop();
  const after = hits;
  commit(dir, 'a.txt', '3\n', 'tres');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(hits, after);
});
