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
