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

test('openParam: ?vista=texto pide abrir la vista de texto; cualquier otra cosa, no', () => {
  const op = ctx.window.GB.textview.openParam;
  const q = (s) => new URLSearchParams(s);
  assert.equal(op(q('vista=texto')), true);
  assert.equal(op(q('vista=%20Texto%20')), true);
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
