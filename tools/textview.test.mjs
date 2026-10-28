#!/usr/bin/env node
/* Pruebas de js/textview.js: el árbol de ramas y commits de la vista de texto, con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/textview.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'textview.js'), 'utf8'), ctx, { filename: 'textview.js' });
const raw = ctx.window.GB.textview.build;
const build = (...a) => JSON.parse(JSON.stringify(raw(...a))); // fuera del contexto de vm, para comparar con deepEqual

function repo() {
  const c = (sha, parents, message, date) => [sha, { sha, parents, message, date, author: { name: 'Ana' } }];
  return {
    repo: { defaultBranch: 'main' },
    commits: new Map([
      c('a1', [], 'raíz\ncuerpo', 1),
      c('a2', ['a1'], 'segundo', 2),
      c('m3', ['a2', 'f2'], 'Merge feature', 4),
      c('f2', ['a2'], 'trabajo en feature', 3),
    ]),
    branches: new Map([
      ['feature', { name: 'feature', sha: 'f2', movedAt: 3 }],
      ['main', { name: 'main', sha: 'm3', isDefault: true, movedAt: 4 }],
      ['vacia', { name: 'vacia', sha: null }],
    ]),
    tags: new Map([['a2', ['v1.0']]]),
  };
}

test('la rama por defecto va primero y las sin historia no entran', () => {
  const t = build(repo());
  assert.deepEqual(t.branches.map((b) => b.name), ['main', 'feature']);
  assert.equal(t.total, 2);
  assert.equal(t.branches[0].isDefault, true);
});

test('cada rama sigue el primer padre, del más nuevo al más viejo, con su primera línea, merge y tags', () => {
  const [main] = build(repo()).branches;
  assert.deepEqual(main.commits.map((c) => c.sha), ['m3', 'a2', 'a1']);
  assert.equal(main.commits[0].merge, true);
  assert.equal(main.commits[2].message, 'raíz');
  assert.deepEqual(main.commits[1].tags, ['v1.0']);
});

test('los límites por rama y de ramas se respetan, y un ciclo no cuelga', () => {
  const d = repo();
  assert.equal(build(d, { perBranch: 2 }).branches[0].commits.length, 2);
  assert.equal(build(d, { maxBranches: 1 }).branches.length, 1);
  assert.equal(build(d, { maxBranches: 1 }).total, 2);
  d.commits.get('a1').parents = ['m3'];
  assert.equal(build(d).branches[0].commits.length, 3);
});

test('news solo cuenta ramas y commits que no se habían leído', () => {
  const d = repo();
  const tree = build(d);
  const seen = { branches: new Set(), shas: new Set() };
  const first = JSON.parse(JSON.stringify(ctx.window.GB.textview.news(tree, seen)));
  assert.deepEqual(first.branches.sort(), ['feature', 'main']);
  assert.equal(first.commits.length, 4); // m3, a2, a1 y f2, cada uno una vez aunque salga en dos ramas
  for (const b of first.branches) seen.branches.add(b);
  for (const c of first.commits) seen.shas.add(c);
  const again = JSON.parse(JSON.stringify(ctx.window.GB.textview.news(tree, seen)));
  assert.deepEqual(again, { branches: [], commits: [] });
  d.commits.set('n5', { sha: 'n5', parents: ['m3'], message: 'nuevo', date: 5, author: { name: 'Ana' } });
  d.branches.get('main').sha = 'n5';
  d.branches.set('hotfix', { name: 'hotfix', sha: 'n5', movedAt: 5 });
  const next = JSON.parse(JSON.stringify(ctx.window.GB.textview.news(build(d), seen)));
  assert.deepEqual(next.branches, ['hotfix']);
  assert.deepEqual(next.commits, ['n5']);
});

test('filter deja las ramas cuyo nombre contiene el texto, sin importar mayúsculas', () => {
  const tree = build(repo());
  const names = (q) => ctx.window.GB.textview.filter(tree, q).map((b) => b.name);
  assert.deepEqual(names('FEAT'), ['feature']);
  assert.deepEqual(names('  '), ['main', 'feature']);
  assert.deepEqual(names('zzz'), []);
});

test('con el filtro por ruta solo quedan los commits que la tocaron, y las ramas sin ninguno se van', () => {
  const t = build(repo(), { paths: new Set(['a1', 'f2']) });
  assert.deepEqual(t.branches.map((b) => b.name), ['main', 'feature']);
  assert.deepEqual(t.branches[0].commits.map((c) => c.sha), ['a1']);
  assert.deepEqual(t.branches[1].commits.map((c) => c.sha), ['f2', 'a1']);
  assert.equal(t.total, 2);
  assert.deepEqual(build(repo(), { paths: new Set(['f2']) }).branches.map((b) => b.name), ['feature']);
  assert.deepEqual(build(repo(), { paths: new Set(['zzz']) }).branches, []);
});

test('scopeText dice el filtro por autor y el de ruta, y nada sin filtros', () => {
  const text = (k, p) => `${k}:${JSON.stringify(p)}`;
  const st = ctx.window.GB.textview.scopeText;
  assert.equal(st(null, text), '');
  assert.equal(st({ author: 'Ana', shown: 2, total: 5 }, text), 'textview.scopeAuthor:{"author":"Ana","shown":2,"total":5}');
  assert.equal(st({ path: 'src/', count: 3 }, text), 'textview.scopePath:{"path":"src/","n":3}');
  assert.match(st({ author: 'Ana', shown: 1, total: 1, path: 'src/', count: 3 }, text), /scopeAuthor.*\. textview\.scopePath/);
});

test('openParam: ?vista=texto y ?view=text piden abrir la vista de texto; cualquier otra cosa, no', () => {
  const op = ctx.window.GB.textview.openParam;
  const q = (s) => new URLSearchParams(s);
  assert.equal(op(q('vista=texto')), true);
  assert.equal(op(q('vista=%20Texto%20')), true);
  assert.equal(op(q('view=text')), true);
  assert.equal(op(q('view=%20Text%20')), true);
  assert.equal(op(q('view=graph')), false);
  assert.equal(op(q('view=texto')), false);
  assert.equal(op(q('vista=grafo')), false);
  assert.equal(op(q('')), false);
  assert.equal(op(null), false);
});

test('taggedCount cuenta los commits con tag una vez, aunque salgan en dos ramas', () => {
  const d = repo();
  d.tags.set('f2', ['rc1', 'rc1-b']);
  d.branches.set('otra', { name: 'otra', sha: 'f2', movedAt: 1 });
  const tree = raw(d);
  assert.equal(ctx.window.GB.textview.taggedCount(tree), 2); // a2 y f2
  assert.equal(ctx.window.GB.textview.taggedCount({ branches: [] }), 0);
});

test('los releases del feed marcan el commit de su tag (o su sha) y se cuentan una vez', () => {
  const { releaseMarks, releasedCount } = ctx.window.GB.textview;
  const marks = releaseMarks([
    { kind: 'release', title: { key: 'act.release', params: { tag: 'v1.0' } } },
    { kind: 'release', title: { key: 'act.release', params: { tag: 'v2' } }, sha: 'f2' },
    { kind: 'push', title: { params: { tag: 'v9' } } },
  ]);
  assert.deepEqual([...marks.tags], ['v1.0', 'v2']);
  const tree = build(repo(), { releases: marks });
  const main = tree.branches.find((b) => b.name === 'main');
  const a2 = main.commits.find((c) => c.sha === 'a2');
  assert.deepEqual(a2.releases, ['v1.0']);
  assert.deepEqual(a2.tags, []); // ya no sale también como tag suelto
  assert.deepEqual(tree.branches.find((b) => b.name === 'feature').commits[0].releases, ['v2']);
  assert.equal(releasedCount(tree), 2);
  assert.equal(releasedCount(build(repo())), 0); // sin releases, nada cambia
  assert.deepEqual(build(repo()).branches[0].commits[1].tags, ['v1.0']);
});

test('los forks activos ya cargados salen del más reciente al más viejo, solo con https y push, y solo si se piden', () => {
  const { forks } = ctx.window.GB.textview;
  const d = repo();
  d.forks = [
    { fullName: 'a/viejo', url: 'https://github.com/a/viejo', pushedAt: '2026-01-01T00:00:00Z' },
    { fullName: 'b/nuevo', url: 'https://github.com/b/nuevo', pushedAt: '2026-03-01T00:00:00Z' },
    { fullName: 'c/js', url: 'javascript:alert(1)', pushedAt: '2026-04-01T00:00:00Z' },
    { fullName: 'd/sin-push', url: 'https://github.com/d/sin-push' },
  ];
  const f = forks(d);
  assert.deepEqual(f.rows.map((r) => r.name), ['b/nuevo', 'a/viejo']);
  assert.equal(f.total, 2);
  assert.equal(forks(d, 1).rows.length, 1);
  assert.equal(forks({}).total, 0);
  assert.equal(build(d).forks.total, 0); // sin pedirlos, la vista no los trae (?forks=0)
  assert.deepEqual(build(d, { withForks: true }).forks.rows.map((r) => r.name), ['b/nuevo', 'a/viejo']);
});

test('cada rama cuenta los PRs abiertos ya cargados que salen de ella, sin los de forks', () => {
  const d = repo();
  d.pulls = new Map([
    [1, { number: 1, head: 'feature', sameRepo: true }],
    [2, { number: 2, head: 'feature', sameRepo: true }],
    [3, { number: 3, head: 'main', sameRepo: false }], // de un fork: su rama no es de este repo
  ]);
  const by = Object.fromEntries(build(d).branches.map((b) => [b.name, b.prs]));
  assert.deepEqual(by, { main: 0, feature: 2 });
  assert.equal(build(repo()).branches[0].prs, 0); // sin PRs cargados, ninguno
});

test('una rama sin actividad en más de 30 días se dice quieta, también la por defecto; sin fecha no se sabe', () => {
  const DAY = 864e5;
  const now = Date.UTC(2026, 9, 28);
  const d = repo();
  d.commits.get('m3').date = new Date(now - 31 * DAY).toISOString(); // la fecha puede venir como texto
  d.commits.get('f2').date = now - 29 * DAY;
  const quiet = (data, opts) => Object.fromEntries(build(data, { now, ...opts }).branches.map((b) => [b.name, b.quiet]));
  assert.deepEqual(quiet(d), { main: true, feature: false });
  assert.equal(raw(repo()).branches.length, 2); // sin `now`, la de hoy: las fechas de 1970 de repo() ya están quietas
  assert.ok(raw(repo()).branches.every((b) => b.quiet));
  // una rama que se movió hace poco (creada hoy desde un commit viejo) no está quieta, aunque su punta sea vieja
  d.branches.get('main').movedAt = now - 2 * DAY;
  assert.deepEqual(quiet(d), { main: false, feature: false });
  // sin fecha de la punta ni del movimiento no se sabe su edad: no se dice quieta
  d.commits.get('m3').date = undefined;
  d.branches.get('main').movedAt = 0;
  assert.equal(quiet(d).main, false);
  // con el filtro por ruta cuenta la punta, no el último commit que tocó la ruta
  d.commits.get('f2').date = now - DAY;
  d.commits.get('a1').date = now - 90 * DAY;
  assert.deepEqual(quiet(d, { paths: new Set(['a1']) }), { main: false, feature: false });
  assert.equal(ctx.window.GB.textview.QUIET_DAYS, 30); // los textos de 'textview.quiet' dicen 30 en los 40 idiomas
});
