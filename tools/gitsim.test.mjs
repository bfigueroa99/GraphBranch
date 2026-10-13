#!/usr/bin/env node
/* Pruebas de js/gitsim.js: el intérprete de git de práctica y sus ejercicios.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/gitsim.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'gitsim.js'), 'utf8'), ctx, { filename: 'gitsim.js' });
const { Repo, EXERCISES, start } = ctx.window.GB.gitsim;
const NOW = Date.UTC(2026, 9, 13, 12);

/* los arreglos de otro contexto de vm no son «iguales» para deepEqual: se comparan como datos planos */
const plain = (x) => JSON.parse(JSON.stringify(x));
const run = (r, ...lines) => lines.map((l) => r.run(l));
const fresh = () => start(0, NOW);

test('commit mueve la rama y exige mensaje', () => {
  const r = fresh();
  const before = r.headSha;
  assert.equal(r.run('git commit').ok, false);
  assert.equal(r.headSha, before);
  const res = r.run('git commit -m "Add search"');
  assert.ok(res.ok && res.changed);
  assert.match(res.lines[0], /^\[main [0-9a-f]{7}\] Add search$/);
  assert.equal(r.commits.get(r.headSha).parents[0], before);
});

test('branch y checkout: crear, cambiar, desprender y borrar', () => {
  const r = fresh();
  assert.ok(r.run('checkout -b feature').ok);
  assert.equal(r.head.branch, 'feature');
  assert.equal(r.run('branch feature').ok, false, 'no se pisa una rama');
  assert.equal(r.run('branch bad..name').ok, false);
  assert.deepEqual(plain(r.run('branch').lines), ['* feature', '  main']);
  r.run('commit -m "x"');
  assert.ok(r.run('switch main').ok);
  assert.equal(r.run('branch -d feature').ok, false, 'sin fusionar no se borra con -d');
  assert.ok(r.run('branch -D feature').ok);
  assert.equal(r.branches.has('feature'), false);
  assert.ok(r.run('checkout HEAD~1').ok);
  assert.equal(r.head.branch, undefined);
  assert.match(r.run('status').lines[0], /detached/);
  assert.equal(r.run('checkout nope').ok, false);
});

test('merge: avance rápido, commit de fusión y ya al día', () => {
  const r = fresh();
  run(r, 'checkout -b feature', 'commit -m a', 'checkout main');
  assert.deepEqual(plain(r.run('merge feature').lines.at(-1)), 'Fast-forward');
  assert.equal(r.branches.get('main'), r.branches.get('feature'));
  assert.deepEqual(plain(r.run('merge feature').lines), ['Already up to date.']);
  const d = start(1, NOW);
  assert.equal(d.run('merge --ff-only feature').ok, false);
  assert.ok(d.run('merge feature').ok);
  const tip = d.commits.get(d.headSha);
  assert.equal(tip.parents.length, 2);
  assert.equal(tip.message, "Merge branch 'feature'");
});

test('rebase: repite los commits propios encima, sin fusiones y sin tocar la otra rama', () => {
  const r = start(2, NOW);
  const main = r.branches.get('main');
  const oldTip = r.branches.get('feature');
  run(r, 'checkout feature');
  assert.ok(r.run('rebase main').ok);
  const tip = r.branches.get('feature');
  assert.notEqual(tip, oldTip, 'los commits son nuevos');
  assert.equal(r.branches.get('main'), main);
  const log = r.log(tip).map((s) => r.commits.get(s).message);
  assert.deepEqual(plain(log.slice(0, 3)), ['Add profile avatar', 'Add profile page', 'Fix login redirect']);
  assert.ok(r.log(tip).every((s) => r.commits.get(s).parents.length < 2));
  assert.deepEqual(plain(r.run('rebase main').lines), ['Current branch feature is up to date.']);
});

test('reset: soft/hard mueven la rama; HEAD~n y shas cortos se resuelven', () => {
  const r = start(3, NOW);
  const oops = r.headSha;
  const prev = r.resolve('HEAD~1');
  assert.equal(r.resolve('HEAD^'), prev);
  assert.equal(r.resolve(prev.slice(0, 6)), prev);
  assert.equal(r.resolve('HEAD~9'), null);
  assert.equal(r.run('reset --hard HEAD~9').ok, false);
  assert.match(r.run('reset --hard HEAD~1').lines[0], /^HEAD is now at [0-9a-f]{7} Add login form$/);
  assert.equal(r.headSha, prev);
  assert.ok(r.commits.has(oops), 'el commit descartado sigue en memoria, pero ya no lo alcanza main');
});

test('log --oneline dice dónde está HEAD y las ramas', () => {
  const r = fresh();
  run(r, 'branch feature');
  const lines = r.run('log --oneline').lines;
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^[0-9a-f]{7} \(HEAD -> main, feature\) Add login form$/);
});

test('comandos desconocidos, ayuda y líneas vacías no rompen nada', () => {
  const r = fresh();
  assert.equal(r.run('push origin main').ok, false);
  assert.ok(r.run('help').lines.length > 5);
  assert.deepEqual(plain(r.run('   ').lines), []);
  assert.equal(r.run('git').changed, false);
});

test('los shas son deterministas y distintos', () => {
  const a = start(0, NOW);
  const b = start(0, NOW);
  assert.equal(a.headSha, b.headSha);
  assert.equal(new Set(a.commits.keys()).size, 3);
});

test('cada ejercicio parte sin resolver y se resuelve con sus comandos', () => {
  const solutions = [
    ['checkout -b feature', 'commit -m "one"', 'commit -m "two"'],
    ['merge feature'],
    ['checkout feature', 'rebase main'],
    ['reset --hard HEAD~1'],
  ];
  assert.equal(solutions.length, EXERCISES.length);
  EXERCISES.forEach((ex, i) => {
    const r = start(i, NOW);
    assert.equal(ex.done(r), false, `${ex.id} no parte resuelto`);
    for (const c of solutions[i]) assert.ok(r.run(c).ok, c);
    assert.equal(ex.done(r), true, `${ex.id} queda resuelto`);
  });
});

test('un ejercicio no se da por resuelto con el atajo equivocado', () => {
  // rebase: fusionar no lo resuelve (deja un commit de fusión)
  const r = start(2, NOW);
  r.run('merge feature');
  assert.equal(EXERCISES[2].done(r), false);
  // merge: rebasar y avanzar rápido no es un commit de fusión
  const m = start(1, NOW);
  run(m, 'checkout feature', 'rebase main', 'checkout main', 'merge feature');
  assert.equal(EXERCISES[1].done(m), false);
  // reset: un commit nuevo encima no quita el «Oops»
  const z = start(3, NOW);
  z.run('commit -m "Undo"');
  assert.equal(EXERCISES[3].done(z), false);
});

test('Repo vacío: commit crea el primero', () => {
  const r = new Repo({ now: NOW });
  assert.equal(r.run('log').ok, false);
  assert.ok(r.run('commit -m first').ok);
  assert.equal(r.log(r.headSha).length, 1);
});
