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
const ctx = vm.createContext({ window: { GB: {} }, TextEncoder, TextDecoder, btoa, atob, Uint8Array }); // lo que el navegador ya trae
vm.runInContext(readFileSync(join(root, 'js', 'gitsim.js'), 'utf8'), ctx, { filename: 'gitsim.js' });
const { Repo, fromData, tokenize, EXERCISES, start, startCustom, customExercise, encodeExercise, decodeExercise, cleanExercise } = ctx.window.GB.gitsim;
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

test('commit --amend reemplaza el último commit con los mismos padres', () => {
  const r = fresh();
  r.run('commit -m "Add serch"');
  const typo = r.headSha;
  const parent = r.commits.get(typo).parents[0];
  const count = r.commits.size;
  const res = r.run('git commit --amend -m "Add search"');
  assert.ok(res.ok && res.changed);
  assert.match(res.lines[0], /^\[main [0-9a-f]{7}\] Add search$/);
  assert.notEqual(r.headSha, typo);
  assert.deepEqual(plain(r.commits.get(r.headSha).parents), [parent]);
  assert.equal(r.commits.size, count + 1);
  assert.ok(!r.log(r.headSha).includes(typo), 'el commit viejo ya no está en la rama');
  // sin -m conserva el mensaje; sin -a deja lo cambiado sin preparar, con -a lo recoge
  r.run('touch a.txt');
  assert.ok(r.run('commit --amend').ok);
  assert.equal(r.commits.get(r.headSha).message, 'Add search');
  assert.deepEqual(plain(r.work), ['a.txt']);
  assert.ok(r.run('commit --amend -a').ok);
  assert.deepEqual(plain(r.work), []);
  assert.deepEqual(plain(r.commits.get(r.headSha).files), ['a.txt']);
  assert.match(r.run('reflog').lines.join('\n'), /commit \(amend\): Add search/);
});

test('commit --amend se niega sin commits o con una fusión a medias', () => {
  const r = fresh();
  r.run('checkout -b feature');
  r.run('commit -m uno');
  r.run('checkout main');
  r.run('commit -m dos');
  r.run('merge --no-commit feature');
  const sha = r.headSha;
  const res = r.run('commit --amend -m x');
  assert.equal(res.ok, false);
  assert.match(res.lines[0], /middle of a merge/);
  assert.equal(r.headSha, sha);
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

test('branch -m renombra una rama (la actual si no se dice cuál) y HEAD, la por defecto y el reflog la siguen', () => {
  const r = fresh();
  r.run('branch feature');
  const tip = r.branches.get('feature');
  const main = r.headSha;
  // otra rama: cambia el nombre, no el commit, y HEAD no se mueve
  let res = r.run('branch -m feature feature/login');
  assert.ok(res.ok && res.changed);
  assert.deepEqual(plain(res.lines), []);
  assert.equal(r.branches.has('feature'), false);
  assert.equal(r.branches.get('feature/login'), tip);
  assert.equal(r.head.branch, 'main');
  assert.deepEqual(plain(r.renamed), { from: 'feature', to: 'feature/login' });
  assert.equal(r.reflog.length, 1, 'renombrar otra rama no mueve HEAD');
  // la actual, sin decir cuál: HEAD y la rama por defecto la siguen, en su mismo lugar, y el reflog lo anota como git
  res = r.run('git branch -m trunk');
  assert.ok(res.ok && res.changed);
  assert.equal(r.head.branch, 'trunk');
  assert.equal(r.headSha, main);
  assert.equal(r.defaultBranch, 'trunk');
  assert.deepEqual([...r.branches.keys()], ['trunk', 'feature/login']);
  assert.match(r.run('reflog').lines[0], /HEAD@\{0\}: Branch: renamed refs\/heads\/main to refs\/heads\/trunk$/);
  assert.deepEqual(plain(r.run('branch').lines), ['  feature/login', '* trunk']);
  assert.match(r.run('log --oneline').lines[0], /\(HEAD -> trunk, feature\/login\)/);
  assert.equal(r.renamed, null, 'otro comando borra la marca del renombre');
  // --move también; con el mismo nombre no hace nada
  assert.ok(r.run('branch --move feature/login login').ok);
  assert.equal(r.branches.get('login'), tip);
  res = r.run('branch -m trunk trunk');
  assert.ok(res.ok);
  assert.equal(res.changed, false);
  // la rama renombrada sigue siendo la misma: se le puede hacer commit y fusionar
  assert.match(r.run('commit -m "On trunk"').lines[0], /^\[trunk [0-9a-f]{7}\] On trunk$/);
});

test('branch -m se niega como git sin tocar nada; -M pisa una rama que no está en uso', () => {
  const r = fresh();
  run(r, 'branch feature', 'checkout -b otra', 'commit -m x', 'checkout main');
  const state = () => JSON.stringify([[...r.branches], r.head, r.defaultBranch]);
  const before = state();
  for (const [line, re] of [
    ['branch -m', /^fatal: branch name required$/],
    ['branch -m a b c', /^fatal: too many arguments for a rename operation$/],
    ['branch -m nope x', /^fatal: no branch named 'nope'$/],
    ['branch -m feature otra', /^fatal: a branch named 'otra' already exists$/],
    ['branch -m feature "a..b"', /^fatal: 'a\.\.b' is not a valid branch name$/],
    ['branch -M feature main', /^fatal: cannot force update the branch 'main' used by worktree$/],
    ['branch -d -m feature x', /^usage: branch \(-m \| -M\) \[<old-branch>\] <new-branch>$/],
  ]) {
    const res = r.run(line);
    assert.equal(res.ok, false, line);
    assert.equal(res.changed, false, line);
    assert.match(res.lines[0], re, line);
  }
  assert.equal(state(), before);
  // -M pisa la otra rama (sus commits quedan sin rama, como en git)
  const tip = r.branches.get('feature');
  assert.ok(r.run('branch -M feature otra').ok);
  assert.equal(r.branches.get('otra'), tip);
  assert.equal(r.branches.has('feature'), false);
  // desprendido no hay rama actual que renombrar
  r.run('checkout HEAD~1');
  assert.match(r.run('branch -m nueva').lines[0], /^fatal: cannot rename the current branch while not on any$/);
});

test('branch -m no renombra la rama de un rebase a medias, y en un repo vacío renombra la rama sin commits', () => {
  const r = start(2, NOW);
  run(r, 'checkout feature', 'rebase -i main');
  assert.match(r.run('branch -m feature otra').lines[0], /^fatal: branch refs\/heads\/feature is being rebased$/);
  assert.match(r.run('branch -M main feature').lines[0], /^fatal: cannot force update the branch 'feature' used by worktree$/);
  assert.ok(r.run('rebase --abort').ok);
  assert.equal(r.head.branch, 'feature');
  const e = new Repo({ now: NOW });
  assert.ok(e.run('branch -m trunk').ok);
  assert.equal(e.head.branch, 'trunk');
  assert.equal(e.defaultBranch, 'trunk');
  assert.match(e.run('commit -m first').lines[0], /^\[trunk [0-9a-f]{7}\] first$/);
  assert.equal(e.branches.has('main'), false);
});

test('branch -c copia una rama (la actual si no se dice cuál) con sus commits, sin mover HEAD ni el reflog', () => {
  const r = fresh();
  run(r, 'checkout -b feature', 'commit -m "En feature"', 'checkout main');
  const tip = r.branches.get('feature');
  const main = r.headSha;
  const reflog = plain(r.run('reflog').lines);
  // otra rama: la copia apunta a su mismo commit y la original sigue ahí
  let res = r.run('branch -c feature feature/copia');
  assert.ok(res.ok && res.changed);
  assert.deepEqual(plain(res.lines), []);
  assert.equal(r.branches.get('feature/copia'), tip);
  assert.equal(r.branches.get('feature'), tip);
  assert.equal(r.head.branch, 'main');
  assert.equal(r.renamed, null, 'copiar no es renombrar');
  // la actual, sin decir cuál: HEAD se queda en main
  res = r.run('git branch --copy respaldo');
  assert.ok(res.ok && res.changed);
  assert.equal(r.branches.get('respaldo'), main);
  assert.equal(r.head.branch, 'main');
  assert.equal(r.headSha, main);
  assert.equal(r.defaultBranch, 'main');
  assert.deepEqual(plain(r.run('reflog').lines), reflog, 'copiar no mueve HEAD: el reflog no cambia');
  assert.deepEqual(plain(r.run('branch').lines), ['  feature', '  feature/copia', '* main', '  respaldo']);
  assert.match(r.run('log --oneline').lines[0], /\(HEAD -> main, respaldo\)/);
  // la copia es una rama independiente: un commit en ella no mueve la original
  run(r, 'checkout feature/copia', 'commit -m "Solo en la copia"');
  assert.equal(r.branches.get('feature'), tip);
  assert.notEqual(r.branches.get('feature/copia'), tip);
  assert.equal(r.commits.get(r.branches.get('feature/copia')).parents[0], tip);
  // -C pisa una rama que no está en uso (sus commits quedan sin rama, como en git); la misma con -C no cambia nada
  assert.ok(r.run('branch -C main feature').ok);
  assert.equal(r.branches.get('feature'), main);
  // como git, copiar una rama sobre sí misma no hace nada, también la actual y con -C
  r.run('checkout main');
  for (const line of ['branch -C respaldo respaldo', 'branch -c main', 'branch -c main main', 'branch -C main main']) {
    res = r.run(line);
    assert.ok(res.ok, line);
    assert.equal(res.changed, false, line);
  }
});

test('branch -c se niega como git sin tocar nada', () => {
  const r = fresh();
  run(r, 'branch feature', 'checkout -b otra', 'commit -m x', 'checkout main');
  const state = () => JSON.stringify([[...r.branches], r.head, r.defaultBranch, r.reflog]);
  const before = state();
  for (const [line, re] of [
    ['branch -c', /^fatal: branch name required$/],
    ['branch -c a b c', /^fatal: too many branches for a copy operation$/],
    ['branch -c nope x', /^fatal: no branch named 'nope'$/],
    ['branch -c feature otra', /^fatal: a branch named 'otra' already exists$/],
    ['branch -c feature "a..b"', /^fatal: 'a\.\.b' is not a valid branch name$/],
    ['branch -C feature main', /^fatal: cannot force update the branch 'main' used by worktree$/],
    ['branch -d -c feature x', /^usage: branch \(-c \| -C\) \[<old-branch>\] <new-branch>$/],
    ['branch -c -m feature x', /^usage: branch \(-c \| -C\) \[<old-branch>\] <new-branch>$/],
  ]) {
    const res = r.run(line);
    assert.equal(res.ok, false, line);
    assert.equal(res.changed, false, line);
    assert.match(res.lines[0], re, line);
  }
  assert.equal(state(), before);
  // desprendido no hay rama actual que copiar, pero sí otra
  r.run('checkout HEAD~1');
  assert.match(r.run('branch -c nueva').lines[0], /^fatal: cannot copy the current branch while not on any$/);
  assert.ok(r.run('branch -c feature nueva').ok);
  assert.equal(r.branches.get('nueva'), r.branches.get('feature'));
  // un rebase a medias: como git, no se copia la rama que se rebasa ni -C la pisa
  const b = start(2, NOW);
  run(b, 'checkout feature', 'rebase -i main');
  const rebasing = JSON.stringify([[...b.branches], b.head]);
  assert.match(b.run('branch -c feature copia').lines[0], /^fatal: branch refs\/heads\/feature is being rebased$/);
  assert.match(b.run('branch -C main feature').lines[0], /^fatal: cannot force update the branch 'feature' used by worktree$/);
  assert.equal(JSON.stringify([[...b.branches], b.head]), rebasing);
  // en un repo vacío la rama no tiene commit que copiar
  const e = new Repo({ now: NOW });
  assert.match(e.run('branch -c otra').lines[0], /^fatal: no commit on branch 'main' yet$/);
  assert.deepEqual([...e.branches.keys()], ['main']);
});

test('switch y restore: solo ramas, desprender a propósito y tirar cambios sin commit', () => {
  const r = fresh();
  assert.ok(r.run('switch -c arreglo').ok);
  assert.equal(r.head.branch, 'arreglo');
  assert.equal(r.run('switch -c arreglo').ok, false, 'no se pisa una rama');
  const sha = r.run('log --oneline').lines[1].slice(0, 7);
  const bad = r.run(`switch ${sha}`);
  assert.equal(bad.ok, false, 'switch no va a un commit a secas');
  assert.match(bad.lines[0], /a branch is expected/);
  assert.match(r.run('switch nope').lines[0], /invalid reference/);
  assert.ok(r.run(`switch --detach ${sha}`).ok);
  assert.equal(r.head.branch, undefined);
  r.run('switch arreglo');
  r.run('commit -m otro');
  r.run('switch main');
  r.run('touch a.txt');
  r.run('touch b.txt');
  assert.equal(r.run('switch arreglo').ok, false, 'con cambios sin commit no se cambia de rama');
  assert.ok(r.run('restore a.txt').ok);
  assert.equal(r.work.join(), 'b.txt');
  assert.equal(r.run('restore').ok, false);
  assert.equal(r.run('restore --staged b.txt').ok, false, 'b.txt no está preparado');
  assert.equal(r.run('restore ../x').ok, false);
  assert.ok(r.run('restore .').ok);
  assert.equal(r.work.length, 0);
  assert.match(r.run('status').lines.at(-1), /working tree clean/);
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

test('merge --no-ff: hace el commit de fusión aunque se pudiera avanzar, con -m y sin chocar con --ff-only', () => {
  const r = fresh();
  run(r, 'checkout -b feature', 'commit -m a', 'checkout main');
  const before = r.headSha;
  assert.deepEqual(plain(r.run('merge --no-ff feature').lines), ["Merge made by the 'ort' strategy."]);
  const tip = r.commits.get(r.headSha);
  assert.deepEqual([...tip.parents], [before, r.branches.get('feature')]);
  assert.equal(tip.message, "Merge branch 'feature'");
  assert.deepEqual(plain(r.run('merge --no-ff feature').lines), ['Already up to date.']);
  const m = fresh();
  run(m, 'checkout -b feature', 'commit -m a', 'checkout main');
  assert.ok(m.run('merge --no-ff -m "Une feature" feature').ok);
  assert.equal(m.commits.get(m.headSha).message, 'Une feature');
  assert.equal(m.commits.get(m.headSha).parents.length, 2);
  const c = fresh();
  run(c, 'checkout -b feature', 'commit -m a', 'checkout main');
  const res = c.run('merge --no-ff --ff-only feature');
  assert.equal(res.ok, false);
  assert.match(res.lines[0], /cannot be used together/);
  assert.equal(c.branches.get('main'), c.headSha);
  assert.equal(c.commits.get(c.headSha).parents.length, 1);
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
    ['cherry-pick feature', 'tag v1.0.1'],
    ['revert HEAD~1'],
    ['stash', 'checkout main', 'commit -m "Fix login redirect"', 'checkout feature', 'stash pop'],
    ['merge feature --no-commit', 'merge --abort'],
    ['tag -d v2', 'cherry-pick feature --no-commit', 'cherry-pick --abort'],
    ['restore --staged debug.log', 'clean -n', 'clean -f'],
    ['add login.js', 'commit -m "Fix login"'],
    ['clean -nd', 'clean -fd -e nuevo.js'],
    ['stash list', 'stash show', 'stash show stash@{1}', 'stash pop stash@{1}'],
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
  // clean con carpetas: sin -d la carpeta build queda, y -fd a secas se lleva también nuevo.js
  const c = start(11, NOW);
  c.run('clean -f');
  assert.equal(EXERCISES[11].done(c), false, 'sin -d, build/ sigue ahí');
  const all = start(11, NOW);
  all.run('clean -fd');
  assert.equal(EXERCISES[11].done(all), false, 'clean -fd borra también nuevo.js');
});

test('Repo vacío: commit crea el primero', () => {
  const r = new Repo({ now: NOW });
  assert.equal(r.run('log').ok, false);
  assert.ok(r.run('commit -m first').ok);
  assert.equal(r.log(r.headSha).length, 1);
});

/* ---------- ejercicios propios por URL ---------- */

const MINE = { title: 'Fusiona «ñ» 日本', goal: 'Trae feature a main.', setup: ['checkout -b feature', 'commit -m uno', 'checkout main', 'commit -m dos'], checks: ['merge-commit:main', 'merged:feature>main'] };

test('un ejercicio propio ida y vuelta por la URL, con acentos y sin caracteres raros', () => {
  const code = encodeExercise(MINE);
  assert.match(code, /^[\w-]+$/);
  const back = decodeExercise(code);
  assert.deepEqual(plain(back.custom), { ...plain(MINE), hints: [] });
});

test('un ejercicio propio parte sin resolver, se resuelve con sus comandos y no con el atajo equivocado', () => {
  const ex = customExercise(decodeExercise(encodeExercise(MINE)).custom);
  const r = startCustom(ex, NOW);
  assert.equal(ex.done(r), false);
  assert.ok(r.branches.has('feature'));
  const ff = startCustom(ex, NOW);
  run(ff, 'rebase feature'); // main no avanza igual: rebasar no deja commit de fusión
  assert.equal(ex.done(ff), false);
  r.run('merge feature');
  assert.equal(ex.done(r), true);
});

test('la solución propuesta solo viaja si se pide, y tiene que resolver el ejercicio', () => {
  const mine = { ...MINE, solution: ['merge feature'] };
  const plainLink = decodeExercise(encodeExercise(mine));
  assert.equal(plainLink.custom.solution, undefined); // el enlace común no lleva la solución
  const withSolution = decodeExercise(encodeExercise(mine, { solution: true }));
  assert.deepEqual(plain(withSolution.custom.solution), ['merge feature']);
  const ex = customExercise(withSolution.custom);
  assert.deepEqual(plain(ex.solution), ['merge feature']);
  const r = startCustom(ex, NOW);
  for (const c of ex.solution) assert.ok(r.run(c).ok);
  assert.equal(ex.done(r), true);
  // una solución que no resuelve, que falla o que se pasa de largo no entra
  assert.equal(cleanExercise({ ...MINE, solution: ['commit -m "otro"'] }).error, 'solution');
  assert.equal(cleanExercise({ ...MINE, solution: ['merge nada'] }).error, 'solution');
  assert.equal(cleanExercise({ ...MINE, solution: Array(11).fill('merge feature') }).error, 'solution');
  assert.equal(cleanExercise({ ...MINE, solution: ['x'.repeat(121)] }).error, 'solution');
  assert.equal(customExercise(plainLink.custom).solution.length, 0);
});

test('un ejercicio propio lleva pistas por la URL, hasta 3 y de 160 caracteres', () => {
  const hints = ['Mira la rama feature', 'Prueba merge', 'Ñandú 日本'];
  const back = decodeExercise(encodeExercise({ ...MINE, hints }));
  assert.deepEqual(plain(back.custom.hints), hints);
  assert.deepEqual(plain(customExercise(back.custom).hints), hints);
  assert.equal(cleanExercise({ ...MINE, hints: ['a', 'b', 'c', 'd'] }).error, 'hints');
  assert.equal(cleanExercise({ ...MINE, hints: ['x'.repeat(161)] }).error, 'hints');
  assert.equal(cleanExercise({ ...MINE, hints: 'no es lista' }).hints.length, 0);
});

test('condiciones nuevas: el mensaje del último commit y las ramas sin fusionar', () => {
  const spec = { title: 't', goal: 'g', setup: ['checkout -b feature', 'commit -m "Add Login"'], checks: ['tip:feature~add login', 'unmerged:feature>main'] };
  const ex = customExercise(cleanExercise(spec));
  const r = startCustom(ex, NOW);
  assert.equal(ex.done(r), true, 'feature lleva «Add Login» y no está en main');
  r.run('checkout main');
  r.run('merge feature');
  assert.equal(ex.done(r), false, 'ya fusionada: deja de estar sin fusionar');
  const other = customExercise(cleanExercise({ ...spec, checks: ['tip:feature~otra cosa'] }));
  assert.equal(other.done(startCustom(other, NOW)), false);
  const none = customExercise(cleanExercise({ ...spec, checks: ['tip:nadie~x', 'unmerged:nadie>main'] }));
  assert.equal(none.done(startCustom(none, NOW)), false, 'una rama que no existe no cumple');
  assert.equal(cleanExercise({ ...spec, checks: ['tip:feature~'] }).error, 'check');
});

test('un ejercicio propio puede pedir renombrar una rama con branch -m', () => {
  const spec = { title: 'Renombra', goal: 'feature pasa a llamarse feature/login.', setup: ['checkout -b feature', 'commit -m uno'], checks: ['exists:feature/login', 'missing:feature', 'on:feature/login'], solution: ['branch -m feature/login'] };
  const clean = cleanExercise(spec);
  assert.equal(clean.error, undefined, 'la solución con branch -m lo resuelve');
  const ex = customExercise(clean);
  const r = startCustom(ex, NOW);
  assert.equal(ex.done(r), false);
  r.run('branch feature/login');
  assert.equal(ex.done(r), false, 'una rama nueva con el nombre no alcanza: la vieja sigue');
  r.run('branch -D feature/login');
  r.run('branch -m feature feature/login');
  assert.equal(ex.done(r), true);
});

/* la fuente de práctica (js/sources/practice.js) cuenta en el panel de actividad lo que hace cada comando */
function practiceSource() {
  const pctx = vm.createContext({ setTimeout, clearTimeout, TextEncoder, TextDecoder, btoa, atob, Uint8Array, console, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  pctx.window = pctx;
  const load = (f) => vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), pctx, { filename: f });
  load('util.js');
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), t: (k) => k, text: String, fmtNum: String };`, pctx);
  load('gitsim.js');
  load('sources/practice.js');
  const src = new pctx.GB.PracticeSource(0);
  const updates = [];
  src.on('update', (u) => updates.push(u));
  src.running = true;
  return { src, acts: () => plain(updates.at(-1)?.activities ?? []) };
}

test('la práctica dice «rama renombrada» en el panel, no una borrada y otra creada, y el grafo sigue a la rama por defecto', () => {
  const { src, acts } = practiceSource();
  src.run('branch feature');
  assert.equal(src.run('branch -m feature feature/login').ok, true);
  let list = acts();
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'branch-rename');
  assert.equal(list[0].branch, 'feature/login');
  assert.deepEqual(list[0].title, { key: 'act.branchRenamed', params: { old: 'feature', name: 'feature/login' } });
  assert.equal(list[0].detail, 'Add login form');
  // la rama por defecto: el grafo la sigue con su nuevo nombre
  src.run('branch -m trunk');
  assert.deepEqual(acts().map((a) => a.title.params), [{ old: 'main', name: 'trunk' }]);
  assert.equal(src.data.repo.defaultBranch, 'trunk');
  assert.equal(src.data.branches.get('trunk').isDefault, true);
  assert.equal(src.data.branches.has('main'), false);
  // -M sobre una rama que existía: un solo aviso, el del renombre
  src.run('branch otra');
  src.run('branch -M feature/login otra');
  list = acts();
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].title.params, { old: 'feature/login', name: 'otra' });
  // y lo de siempre sigue igual: borrar una rama es borrarla
  src.run('branch -d otra');
  assert.deepEqual(acts().map((a) => [a.kind, a.title.key]), [['branch-delete', 'act.branchDeleted']]);
});

test('los números de la URL piden un ejercicio de la lista; lo demás se descarta', () => {
  assert.deepEqual(plain(decodeExercise('3')), { index: 2 });
  assert.deepEqual(plain(decodeExercise('12')), { index: 11 });
  assert.deepEqual(plain(decodeExercise('13')), { index: 12 });
  for (const bad of ['0', '14', '', 'no es base64!', 'eyJ2IjoyfQ', 'x'.repeat(2000), null, undefined, 7]) assert.equal(decodeExercise(bad), null, String(bad));
});

test('un ejercicio propio mal hecho no entra: sin meta, condición inventada, comando que falla o demasiados', () => {
  assert.equal(cleanExercise({ ...MINE, goal: '  ' }).error, 'text');
  assert.equal(cleanExercise({ ...MINE, checks: [] }).error, 'checks');
  assert.equal(cleanExercise({ ...MINE, checks: ['alert(1)'] }).error, 'check');
  assert.equal(cleanExercise({ ...MINE, setup: ['merge nada'] }).error, 'command');
  assert.equal(cleanExercise({ ...MINE, setup: Array(31).fill('commit -m x') }).error, 'setup');
  assert.equal(cleanExercise({ ...MINE, setup: ['commit -m ' + 'x'.repeat(130)] }).error, 'setup');
  assert.equal(encodeExercise({ ...MINE, goal: 'a'.repeat(5000) }) !== null, true, 'la meta se recorta, no rompe');
  // el JSON de la URL se vuelve a validar al abrirlo: una condición inventada ahí no entra
  const forged = Buffer.from(JSON.stringify({ v: 1, t: 'x', g: 'y', s: [], c: ['constructor:x'] })).toString('base64url');
  assert.equal(decodeExercise(forged), null);
});

test('fromData: copia un repo real, ensaya merge y rebase y no toca el original', () => {
  const author = { name: 'Ana', login: 'ana', avatar: null };
  const sha = (n) => n.repeat(40);
  const c = (s, parents, message, date) => [sha(s), { sha: sha(s), parents: parents.map(sha), message, author, date, url: `https://x/${s}` }];
  const data = {
    repo: { owner: 'o', name: 'r', defaultBranch: 'main' },
    commits: new Map([c('a', [], 'root', 1000), c('b', ['a'], 'main work', 2000), c('c', ['a'], 'feature work', 3000), c('d', ['z'], 'huérfano', 4000)]),
    branches: new Map([
      ['main', { sha: sha('b') }],
      ['feature', { sha: sha('c') }],
      ['viejo', { sha: sha('d') }],
      ['sin-commit', { sha: sha('e') }],
    ]),
  };
  const before = JSON.stringify([[...data.commits], [...data.branches]]);
  const r = fromData(data);
  assert.deepEqual(plain([...r.branches.keys()]), ['main', 'feature', 'viejo'], 'la rama sin commit cargado no entra');
  assert.equal(r.head.branch, 'main');
  assert.deepEqual(plain(r.commits.get(sha('d')).parents), [], 'un padre no cargado se descarta');
  assert.ok(r.clock >= 4000, 'los commits nuevos caen después de los reales');
  const m = r.run('merge feature');
  assert.ok(m.ok && m.changed, m.lines.join('\n'));
  assert.equal(r.commits.get(r.headSha).parents.length, 2);
  assert.ok(r.commits.get(r.headSha).date > 4000);
  assert.ok(r.run('checkout feature').ok);
  assert.ok(r.run('rebase main').ok);
  assert.equal(JSON.stringify([[...data.commits], [...data.branches]]), before, 'el original queda igual');
  assert.equal(fromData({ ...data, branches: new Map() }), null, 'sin ramas no hay ensayo');
});

test('cherry-pick copia un commit encima de la rama actual sin traer los demás', () => {
  const r = start(4, NOW);
  const tip = r.branches.get('feature');
  const res = r.run('cherry-pick feature');
  assert.ok(res.ok && res.changed);
  assert.match(res.lines[0], /^\[main [0-9a-f]{7}\] Hotfix: escape the login URL$/);
  const copy = r.headSha;
  assert.notEqual(copy, tip, 'es un commit nuevo, no el mismo');
  assert.deepEqual(plain(r.commits.get(copy).parents), [r.resolve('main~1')]);
  assert.equal(r.isAncestor(r.resolve('feature~1'), copy), false, 'no trae el otro commit de feature');
  assert.equal(r.run('cherry-pick').ok, false);
  assert.equal(r.run('cherry-pick nope').ok, false);
  r.run('checkout main~1');
  assert.equal(r.run('cherry-pick feature').ok, false, 'desprendido no puede');
  const m = start(1, NOW);
  m.run('merge feature');
  m.run('checkout -b other main~1');
  assert.match(m.run('cherry-pick main').lines[0], /is a merge/);
});

test('tag: crear, listar, borrar, mostrarse en el log y resolverse como referencia', () => {
  const r = fresh();
  const first = r.headSha;
  assert.deepEqual(plain(r.run('tag').lines), []);
  assert.ok(r.run('tag v1').changed);
  r.run('commit -m "Next"');
  assert.ok(r.run('tag v2').ok);
  assert.deepEqual(plain(r.run('tag').lines), ['v1', 'v2']);
  assert.equal(r.run('tag v1').ok, false, 'repetida');
  assert.equal(r.run('tag bad..name').ok, false);
  assert.equal(r.run('tag x nope').ok, false);
  assert.match(r.run('log --oneline').lines[0], /\(HEAD -> main, tag: v2\) Next$/);
  assert.equal(r.resolve('v1'), first);
  assert.ok(r.run('tag -d v1').ok);
  assert.equal(r.run('tag -d v1').ok, false);
  assert.ok(r.run('tag late HEAD~1').ok);
  assert.equal(r.tags.get('late'), r.resolve('HEAD~1'));
});

test('tag -a: etiqueta anotada con su mensaje, que tag -n lista y el log decora como tag:', () => {
  const r = fresh();
  const first = r.headSha;
  const res = r.run('tag -a v1 -m "Primera versión"');
  assert.ok(res.ok && res.changed);
  assert.equal(r.tags.get('v1'), first);
  assert.equal(r.notes.get('v1').message, 'Primera versión');
  assert.notEqual(r.notes.get('v1').sha, first, 'el objeto de la anotada tiene su propio sha');
  r.run('commit -m "Next"');
  assert.ok(r.run('tag light').ok, 'una ligera sigue sin mensaje');
  assert.equal(r.notes.has('light'), false);
  assert.ok(r.run('git tag -m "Solo -m también anota" v2 HEAD~1').ok, '-m solo implica -a, y con commit');
  assert.equal(r.tags.get('v2'), first);
  assert.ok(r.run('tag -am "Pegadas" v3').ok);
  assert.ok(r.run('tag --annotate --message="Dos palabras" v4').ok);
  assert.deepEqual(plain(r.run('tag').lines), ['light', 'v1', 'v2', 'v3', 'v4']);
  assert.deepEqual(plain(r.run('tag -n').lines), [
    'light           Next',
    'v1              Primera versión',
    'v2              Solo -m también anota',
    'v3              Pegadas',
    'v4              Dos palabras',
  ]);
  assert.deepEqual(plain(r.run('tag -l').lines), ['light', 'v1', 'v2', 'v3', 'v4']);
  assert.deepEqual(plain(r.run('tag -l "v?" light').lines), ['light', 'v1', 'v2', 'v3', 'v4']);
  assert.deepEqual(plain(r.run('tag -n -l "v[12]*" "*3"').lines), ['v3              Pegadas'], 'los corchetes son literales; * y ? no');
  assert.match(r.run('log --oneline').lines.find((l) => l.startsWith(first.slice(0, 7))), /\(tag: v1, tag: v2\)/);
  assert.match(r.run('log --oneline').lines[0], /tag: v3/);
  assert.equal(r.resolve('v1'), first, 'se resuelve al commit, no al objeto');
  // los errores de git, sin tocar nada
  const before = plain([...r.tags]);
  assert.match(r.run('tag -a v5').lines[0], /no tag message given/, 'sin editor, sin -m no hay mensaje');
  assert.equal(r.run('tag -a v1 -m "otra"').ok, false, 'repetida');
  assert.equal(r.run('tag -a -m "sin nombre"').ok, false);
  assert.equal(r.run('tag -a v6 -m').ok, false, '-m sin valor');
  assert.equal(r.run('tag -a v6 -m x nope').ok, false, 'commit que no existe');
  assert.equal(r.run('tag -a v6 -m x HEAD extra').ok, false);
  assert.equal(r.run('tag -s v6 -m x').ok, false, 'sin firmas');
  assert.equal(r.run('tag -n -a v6 -m x').ok, false);
  assert.equal(r.run('tag -l -m x v6').ok, false);
  assert.equal(r.run('tag -d -m x v1').ok, false);
  assert.deepEqual(plain([...r.tags]), before);
  // borrar una anotada dice el sha de su objeto y se lleva su mensaje
  const obj = r.notes.get('v1').sha;
  assert.deepEqual(plain(r.run('tag -d v1').lines), [`Deleted tag 'v1' (was ${obj.slice(0, 7)})`]);
  assert.equal(r.notes.has('v1'), false);
  assert.ok(r.run('tag v1').ok, 'con el mismo nombre, ahora ligera');
  assert.equal(r.notes.has('v1'), false);
});

test('tag -f pisa una etiqueta, tag -d borra todas o ninguna y una comilla suelta no corta la palabra', () => {
  const r = fresh();
  r.run('tag -a v1 -m "Vieja"');
  const obj = r.notes.get('v1').sha;
  r.run('commit -m "Next"');
  assert.deepEqual(plain(r.run('tag -f v1').lines), [`Updated tag 'v1' (was ${obj.slice(0, 7)})`]);
  assert.equal(r.tags.get('v1'), r.headSha);
  assert.equal(r.notes.has('v1'), false, 'ahora es ligera: el mensaje viejo no queda');
  assert.ok(r.run('tag -f -a v1 -m "Nueva" HEAD~1').ok);
  assert.equal(r.notes.get('v1').message, 'Nueva');
  assert.equal(r.tags.get('v1'), r.resolve('HEAD~1'));
  assert.equal(r.run('tag -d -f v1').ok, false);
  r.run('tag v2');
  const res = r.run('tag -d v2 nope');
  assert.equal(res.ok, false);
  assert.deepEqual(plain([...r.tags.keys()]).sort(), ['v1', 'v2'], 'nombre que no existe: no borra ninguna');
  assert.equal(r.run('tag -d v1 v2').lines.length, 2);
  assert.deepEqual(plain(tokenize("commit -m it's")), ['commit', '-m', "it's"]);
  assert.deepEqual(plain(tokenize(`tag --message="a b" -m 'c d' x"y z"`)), ['tag', '--message=a b', '-m', 'c d', 'xy z']);
});

test('el ejercicio de cherry-pick pide el arreglo copiado y su etiqueta, no una fusión', () => {
  const ex = EXERCISES[4];
  const a = start(4, NOW);
  a.run('merge feature');
  a.run('tag v1.0.1');
  assert.equal(ex.done(a), false, 'fusionar trae también el otro commit');
  const b = start(4, NOW);
  b.run('cherry-pick feature');
  assert.equal(ex.done(b), false, 'falta la etiqueta');
  b.run('tag v1.0.1');
  b.run('commit -m "Later"');
  assert.equal(ex.done(b), false, 'la etiqueta ya no está en la punta de main');
});

test('revert deshace un commit con uno nuevo y conserva el historial', () => {
  const r = start(5, NOW);
  const bad = r.resolve('HEAD~1');
  const before = r.log(r.headSha).length;
  const res = r.run('revert HEAD~1');
  assert.ok(res.ok && res.changed);
  assert.match(res.lines[0], /^\[main [0-9a-f]{7}\] Revert "Break checkout totals"$/);
  assert.equal(r.log(r.headSha).length, before + 1);
  assert.ok(r.isAncestor(bad, r.headSha), 'el commit malo sigue en el historial');
  assert.deepEqual(plain(r.commits.get(r.headSha).parents), [r.resolve('HEAD~1')]);
  assert.equal(r.run('revert').ok, false);
  assert.equal(r.run('revert nope').ok, false);
  r.run('checkout main~1');
  assert.equal(r.run('revert HEAD').ok, false, 'desprendido no puede');
  const m = start(1, NOW);
  m.run('merge feature');
  assert.match(m.run('revert main').lines[0], /is a merge/);
});

test('el ejercicio de revert pide un commit nuevo y no reescribir la historia', () => {
  const ex = EXERCISES[5];
  const a = start(5, NOW);
  assert.equal(ex.done(a), false);
  a.run('reset --hard HEAD~2');
  assert.equal(ex.done(a), false, 'reset reescribe la historia');
  const b = start(5, NOW);
  b.run('revert HEAD');
  assert.equal(ex.done(b), false, 'deshizo otro commit');
  const c = start(5, NOW);
  c.run('revert HEAD~1');
  assert.equal(ex.done(c), true);
});

test('stash guarda los cambios a medias, deja cambiar de rama y pop los devuelve', () => {
  const r = fresh();
  assert.match(r.run('stash').lines[0], /No local changes/);
  assert.equal(r.run('touch').ok, false);
  assert.equal(r.run('touch ../etc').ok, false);
  run(r, 'checkout -b feature', 'touch app.js');
  assert.ok(r.run('checkout main').ok, 'al mismo commit se puede ir con cambios, como en git');
  run(r, 'stash', 'checkout feature', 'commit -m "Feature work"', 'checkout main', 'stash pop', 'touch app.js notes.md');
  assert.deepEqual(plain(r.work), ['app.js', 'notes.md']);
  assert.deepEqual(plain(r.run('status').lines), ['On branch main', 'Changes not staged for commit:', '\tmodified:   app.js', '\tmodified:   notes.md']);
  // con cambios a medias no se cambia de rama, ni se fusiona, rebasa o copia
  const blocked = r.run('checkout feature');
  assert.equal(blocked.ok, false);
  assert.match(blocked.lines.join('\n'), /would be overwritten by checkout:\n\tapp.js\n\tnotes.md\nPlease commit your changes or stash them/);
  assert.equal(r.head.branch, 'main');
  for (const c of ['rebase feature', 'cherry-pick HEAD~1', 'revert HEAD']) assert.equal(r.run(c).ok, false, c);
  assert.ok(r.run('checkout main').ok, 'quedarse donde está no pide nada');
  const tip = r.headSha;
  const saved = r.run('stash');
  assert.ok(saved.ok);
  assert.match(saved.lines[0], /^Saved working directory and index state WIP on main: [0-9a-f]{7} Add login form$/);
  assert.equal(r.stashes.length, 1, 'el primer stash ya salió con pop');
  assert.equal(r.headSha, tip, 'stash no hace commits en la rama');
  assert.deepEqual(plain(r.work), []);
  assert.match(r.run('stash list').lines[0], /^stash@\{0\}: WIP on main/);
  assert.ok(r.run('checkout feature').ok);
  r.run('touch other.txt');
  run(r, 'stash push -m "second"');
  assert.deepEqual(plain(r.run('stash list').lines.map((l) => l.split(':')[0])), ['stash@{0}', 'stash@{1}']);
  assert.match(r.run('stash list').lines[0], /^stash@\{0\}: On feature: second$/);
  // apply deja la entrada; pop la quita; drop la tira sin aplicar
  const applied = r.run('stash apply stash@{1}');
  assert.ok(applied.ok);
  assert.deepEqual(plain(r.work), ['app.js', 'notes.md']);
  assert.equal(r.stashes.length, 2);
  assert.equal(r.run('stash pop 1').ok, false, 'pisaría los mismos archivos');
  assert.equal(r.run('stash pop stash@{7}').ok, false);
  assert.match(r.run('stash drop 1').lines[0], /^Dropped stash@\{1\} \([0-9a-f]{40}\)$/);
  const popped = r.run('stash pop');
  assert.ok(popped.ok);
  assert.match(popped.lines.at(-1), /^Dropped stash@\{0\}/);
  assert.deepEqual(plain(r.work), ['app.js', 'notes.md', 'other.txt']);
  assert.equal(r.run('stash pop').lines[0], 'error: No stash entries found.');
  assert.equal(r.run('stash frobnicate').ok, false);
  // el commit -a se lleva los cambios
  r.run('commit -am "Use the stash"');
  assert.deepEqual(plain(r.work), []);
});

test('reset --hard a un sha tira los cambios a medias; los otros reset los conservan', () => {
  const r = fresh();
  const first = [...r.log(r.headSha)].at(-1);
  r.run('touch app.js');
  assert.ok(r.run('reset HEAD~1').ok);
  assert.deepEqual(plain(r.work), ['app.js']);
  const res = r.run(`reset --hard ${first.slice(0, 7)}`);
  assert.ok(res.ok);
  assert.equal(res.lines[0], `HEAD is now at ${first.slice(0, 7)} Initial commit`);
  assert.equal(r.headSha, first);
  assert.deepEqual(plain(r.work), []);
  assert.equal(r.run('status').lines[1], 'nothing to commit, working tree clean');
});

test('el ejercicio de stash pide guardar, arreglar main y recuperar los cambios sin commitearlos', () => {
  const ex = EXERCISES.find((e) => e.id === 'stash');
  const i = EXERCISES.indexOf(ex);
  // commitear lo a medias en feature para poder cambiar de rama no vale
  const a = start(i, NOW);
  run(a, 'commit -m "WIP"', 'checkout main', 'commit -m "Fix"', 'checkout feature');
  assert.equal(ex.done(a), false);
  // olvidarse de stash pop tampoco
  const b = start(i, NOW);
  run(b, 'stash', 'checkout main', 'commit -m "Fix"', 'checkout feature');
  assert.equal(ex.done(b), false);
  // tirar los cambios con reset --hard tampoco
  const c = start(i, NOW);
  run(c, 'reset --hard', 'checkout main', 'commit -m "Fix"', 'checkout feature');
  assert.equal(ex.done(c), false);
  // sin arreglo en main, no
  const d = start(i, NOW);
  run(d, 'stash', 'stash pop');
  assert.equal(ex.done(d), false);
});

test('un ejercicio propio puede partir con cambios a medias (touch en sus comandos)', () => {
  const spec = cleanExercise({ title: 'Stash', goal: 'Guarda', setup: ['checkout -b feature', 'touch a.js'], checks: ['on:main'], solution: ['stash', 'checkout main'] });
  assert.equal(spec.error, undefined);
  const r = startCustom(customExercise(spec), NOW);
  assert.deepEqual(plain(r.work), ['a.js']);
  const blocked = { title: 'x', goal: 'y', setup: ['checkout -b feature', 'commit -m "x"', 'checkout main', 'touch a.js'], checks: ['on:feature'] };
  assert.equal(cleanExercise({ ...blocked, solution: ['checkout feature'] }).error, 'solution', 'checkout con cambios falla, así que esa solución no vale');
  assert.equal(cleanExercise({ ...blocked, solution: ['stash', 'checkout feature'] }).error, undefined);
});

test('merge --no-commit deja la fusión a medias: status la nombra, commit la cierra y --abort la cancela', () => {
  const r = start(1, NOW);
  const main = r.branches.get('main');
  assert.equal(r.run('merge --abort').ok, false);
  assert.match(r.run('merge --abort').lines[0], /There is no merge to abort/);
  assert.match(r.run('merge feature --no-commit').lines[0], /stopped before committing/);
  assert.equal(r.branches.get('main'), main, 'main no se movió');
  assert.ok(r.run('status').lines.includes('All conflicts fixed but you are still merging.'));
  const again = r.run('merge feature');
  assert.equal(again.ok, false);
  assert.match(again.lines[0], /not concluded your merge/);
  assert.equal(r.run('merge --abort').ok, true);
  assert.equal(r.merging, null);
  assert.equal(r.branches.get('main'), main);
  assert.equal(r.run('status').lines[1], 'nothing to commit, working tree clean');
  r.run('merge feature --no-commit');
  const c = r.run('commit -m "Join feature"');
  assert.ok(c.ok);
  assert.equal(r.commits.get(r.branches.get('main')).parents.length, 2);
  assert.equal(r.merging, null);
});

test('el ejercicio de abort no se resuelve con una fusión confirmada ni con una fusión a medias', () => {
  const i = EXERCISES.findIndex((e) => e.id === 'abort');
  const a = start(i, NOW);
  run(a, 'merge feature --no-commit');
  assert.equal(EXERCISES[i].done(a), false, 'a medias no cuenta');
  const b = start(i, NOW);
  run(b, 'merge feature');
  assert.equal(EXERCISES[i].done(b), false, 'fusionar de verdad no cuenta');
});

test('cherry-pick --no-commit espera su commit y --abort lo cancela', () => {
  const r = start(EXERCISES.findIndex((e) => e.id === 'tagabort'), NOW);
  const main = r.branches.get('main');
  assert.equal(r.run('cherry-pick --abort').ok, false, 'sin nada a medias no hay qué cancelar');
  assert.ok(r.run('cherry-pick -n feature').ok);
  assert.equal(r.branches.get('main'), main, 'a medias no commitea');
  assert.match(r.run('status').lines.at(-1), /cherry-pick --abort/);
  assert.equal(r.run('checkout feature').ok, false, 'con un cherry-pick a medias no se cambia de rama');
  assert.equal(r.run('merge feature').ok, false);
  assert.equal(r.run('cherry-pick feature').ok, false);
  assert.ok(r.run('cherry-pick --abort').ok);
  assert.equal(r.picking, null);
  assert.equal(r.pickAborts, 1);
  assert.equal(r.branches.get('main'), main);
  // --continue lo confirma con el mensaje del commit copiado
  run(r, 'cherry-pick --no-commit feature');
  assert.match(r.run('cherry-pick --continue').lines[0], /Hotfix: escape the login URL/);
  assert.equal(r.picking, null);
  assert.notEqual(r.branches.get('main'), main);
  // el ejercicio no se resuelve sin borrar la etiqueta ni con el cherry-pick confirmado
  const a = start(EXERCISES.findIndex((e) => e.id === 'tagabort'), NOW);
  run(a, 'cherry-pick -n feature', 'cherry-pick --abort');
  assert.equal(EXERCISES.find((e) => e.id === 'tagabort').done(a), false, 'la etiqueta sigue');
  const b = start(EXERCISES.findIndex((e) => e.id === 'tagabort'), NOW);
  run(b, 'tag -d v2', 'cherry-pick feature');
  assert.equal(EXERCISES.find((e) => e.id === 'tagabort').done(b), false, 'confirmarlo no cuenta');
});

test('revert --no-commit espera su commit y --abort vuelve al estado de antes', () => {
  const r = start(EXERCISES.findIndex((e) => e.id === 'revert'), NOW);
  const main = r.branches.get('main');
  assert.equal(r.run('revert --abort').ok, false, 'sin nada a medias no hay qué cancelar');
  assert.ok(r.run('revert -n HEAD~1').ok);
  assert.equal(r.branches.get('main'), main, 'a medias no commitea');
  assert.match(r.run('status').lines.at(-1), /revert --abort/);
  assert.equal(r.run('checkout HEAD~2').ok, false, 'con un revert a medias no se cambia de rama');
  assert.equal(r.run('revert HEAD').ok, false);
  assert.ok(r.run('revert --abort').ok);
  assert.equal(r.picking, null);
  assert.equal(r.revertAborts, 1);
  assert.equal(r.pickAborts, 0);
  assert.equal(r.branches.get('main'), main);
  assert.match(r.run('status').lines.at(-1), /clean/);
  // --continue lo confirma con el mensaje de un revert
  run(r, 'revert --no-commit HEAD~1');
  assert.match(r.run('revert --continue').lines[0], /Revert "Break checkout totals"/);
  assert.equal(r.picking, null);
  assert.equal(r.log(r.branches.get('main')).length, r.log(main).length + 1);
});

test('rebase -i se detiene tras el primer commit y --abort deja la rama como estaba', () => {
  const r = start(EXERCISES.findIndex((e) => e.id === 'rebase'), NOW);
  run(r, 'checkout feature');
  const feature = r.branches.get('feature');
  const log = r.log(feature);
  assert.equal(r.run('rebase --abort').ok, false, 'sin rebase a medias no hay qué cancelar');
  const res = r.run('rebase -i main');
  assert.ok(res.ok);
  assert.match(res.lines[0], /Stopped at/);
  assert.equal(r.branches.get('feature'), feature, 'la rama no se mueve hasta terminar');
  assert.equal(r.head.branch, undefined, 'HEAD queda desprendido');
  assert.match(r.run('status').lines.join('\n'), /rebase --abort/);
  for (const c of ['checkout main', 'merge main', 'reset --hard HEAD~1', 'rebase main', 'cherry-pick main']) {
    assert.equal(r.run(c).ok, false, `${c} se niega con un rebase a medias`);
  }
  assert.ok(r.run('rebase --abort').ok);
  assert.equal(r.rebasing, null);
  assert.equal(r.rebaseAborts, 1);
  assert.equal(r.head.branch, 'feature');
  assert.deepEqual(r.log(r.branches.get('feature')), log, 'la historia es la de antes');
  // --continue repite el resto y deja la rama rebasada
  run(r, 'rebase --interactive main');
  assert.ok(r.run('rebase --continue').ok);
  assert.equal(r.rebasing, null);
  assert.equal(r.head.branch, 'feature');
  assert.ok(r.isAncestor(r.branches.get('main'), r.branches.get('feature')));
  assert.equal(EXERCISES.find((e) => e.id === 'rebase').done(r), true);
});

test('reflog recuerda dónde estuvo HEAD y deja recuperar un commit tras reset --hard', () => {
  const r = fresh();
  assert.equal(r.run('reflog').ok, true);
  run(r, 'commit -m "Add search"', 'commit -m "Add filters"');
  const lost = r.headSha;
  assert.ok(r.run('reset --hard HEAD~2').ok);
  assert.ok(!r.log(r.headSha).includes(lost), 'el reset soltó los dos commits');
  const lines = r.run('reflog').lines;
  assert.match(lines[0], /^[0-9a-f]{7} HEAD@\{0\}: reset: moving to HEAD~2$/);
  assert.match(lines[1], new RegExp(`^${lost.slice(0, 7)} HEAD@\\{1\\}: commit: Add filters$`));
  assert.equal(r.resolve('HEAD@{1}'), lost);
  assert.equal(r.resolve('HEAD@{99}'), null);
  assert.equal(r.run('reset --hard HEAD@{99}').ok, false);
  assert.ok(r.run('reset --hard HEAD@{1}').ok);
  assert.equal(r.headSha, lost, 'el commit volvió');
  assert.equal(r.run('reflog show HEAD').ok, true);
  assert.equal(r.run('reflog expire').ok, false);
});

test('reflog anota el cambio de rama y reset --mixed deja los cambios sin commit', () => {
  const r = fresh();
  run(r, 'branch feature', 'checkout feature');
  assert.match(r.run('reflog').lines[0], /HEAD@\{0\}: checkout: moving from main to feature$/);
  run(r, 'commit -m "Wip"', 'touch a.js');
  const res = r.run('reset --mixed HEAD~1');
  assert.ok(res.ok);
  assert.deepEqual(plain(res.lines), ['Unstaged changes after reset:', 'M\ta.js']);
  assert.deepEqual(plain(r.work), ['a.js'], 'los cambios sin commit siguen ahí');
  assert.equal(r.run('reset --soft --hard HEAD').ok, false, 'los modos no se mezclan');
  assert.ok(r.run('reset --hard').ok);
  assert.deepEqual(plain(r.work), []);
});

test('add, restore --staged y clean: preparar, sacar y borrar lo que git no sigue', () => {
  const r = fresh();
  run(r, 'touch a.txt', 'touch --new n.txt');
  assert.match(plain(r.run('status').lines).join('\n'), /Untracked files:[\s\S]*n\.txt/);
  assert.equal(r.run('add nope.txt').ok, false);
  assert.ok(r.run('add .').ok);
  const st = plain(r.run('status').lines).join('\n');
  assert.match(st, /Changes to be committed:/);
  assert.match(st, /modified:   a\.txt/);
  assert.match(st, /new file:   n\.txt/);
  assert.equal(r.run('rebase main').ok, false, 'lo preparado también bloquea el rebase');
  assert.equal(r.run('restore --staged nope.txt').ok, false);
  assert.ok(r.run('restore --staged n.txt').ok);
  assert.equal(r.staged.map((s) => s.file).join(), 'a.txt');
  assert.equal(r.untracked.join(), 'n.txt', 'lo nuevo vuelve a «sin seguir»');
  assert.ok(r.run('restore --staged .').ok);
  assert.equal(r.work.join(), 'a.txt', 'lo cambiado vuelve a «sin preparar»');
  // clean pide -f y no toca lo cambiado
  const refuse = r.run('clean');
  assert.equal(refuse.ok, false);
  assert.match(refuse.lines[0], /requireForce/);
  assert.deepEqual(plain(r.run('clean -n').lines), ['Would remove n.txt']);
  assert.equal(r.untracked.length, 1, '-n no borra');
  assert.deepEqual(plain(r.run('clean -f').lines), ['Removing n.txt']);
  assert.equal(r.untracked.length, 0);
  assert.equal(r.work.join(), 'a.txt');
  // commit se lleva lo preparado y deja lo sin seguir; stash guarda lo preparado y reset --hard lo tira
  run(r, 'touch --new k.txt', 'add a.txt', 'stash');
  assert.equal(r.dirty().length, 0);
  run(r, 'stash pop');
  assert.equal(r.work.join(), 'a.txt');
  run(r, 'add a.txt', 'reset');
  assert.equal(r.work.join(), 'a.txt', 'reset mixto saca lo preparado');
  run(r, 'add a.txt', 'reset --hard');
  assert.equal(r.dirty().length, 0);
  assert.equal(r.untracked.join(), 'k.txt');
});

test('el ejercicio de limpiar no se da por resuelto con el atajo equivocado', () => {
  const ex = EXERCISES.find((e) => e.id === 'clean');
  const i = EXERCISES.indexOf(ex);
  const hard = start(i, NOW);
  run(hard, 'reset --hard', 'clean -f');
  assert.equal(ex.done(hard), false, 'reset --hard tira también el cambio de app.js');
  const noClean = start(i, NOW);
  run(noClean, 'restore --staged debug.log');
  assert.equal(ex.done(noClean), false, 'sin clean -f quedan archivos sin seguir');
  const committed = start(i, NOW);
  run(committed, 'restore --staged debug.log', 'clean -f', 'commit -am "x"');
  assert.equal(ex.done(committed), false, 'un commit de más no es la solución');
});

test('commit guarda solo lo preparado; con -a, todo lo cambiado (nunca lo sin seguir)', () => {
  const r = fresh();
  const tip = r.headSha;
  run(r, 'touch a.txt b.txt', 'touch --new n.txt');
  // sin nada preparado no hay commit: git dice que falta add o -a
  const refused = r.run('commit -m "Nada preparado"');
  assert.equal(refused.ok, false);
  assert.match(refused.lines[0], /no changes added to commit \(use "git add" and\/or "git commit -a"\)/);
  assert.equal(r.headSha, tip, 'no se hizo ningún commit');
  // con a.txt preparado, el commit se lleva solo a.txt y b.txt sigue cambiado
  run(r, 'add a.txt');
  const res = r.run('commit -m "Solo a"');
  assert.ok(res.ok && res.changed);
  assert.deepEqual(plain(res.lines.slice(1)), [' 1 file changed']);
  assert.deepEqual(plain(r.commits.get(r.headSha).files), ['a.txt']);
  assert.deepEqual(plain(r.work), ['b.txt']);
  assert.deepEqual(plain(r.untracked), ['n.txt']);
  assert.deepEqual(plain(r.run('status').lines), ['On branch main', 'Changes not staged for commit:', '\tmodified:   b.txt', 'Untracked files:', '\tn.txt']);
  // un archivo preparado y cambiado otra vez: entra lo preparado y el cambio nuevo queda sin preparar
  run(r, 'add b.txt', 'touch b.txt', 'commit -m "b preparado"');
  assert.deepEqual(plain(r.work), ['b.txt']);
  // -a (y -am) se lleva lo cambiado pero no lo sin seguir
  run(r, 'touch c.txt');
  assert.ok(r.run('commit -am "Todo"').ok);
  assert.deepEqual(plain(r.commits.get(r.headSha).files), ['b.txt', 'c.txt']);
  assert.deepEqual(plain(r.work), []);
  assert.deepEqual(plain(r.untracked), ['n.txt']);
  // un archivo nuevo entra solo con add; con el árbol limpio el commit sigue pudiendo ir vacío
  run(r, 'add n.txt');
  assert.ok(r.run('commit -a -m "Nuevo"').ok);
  assert.deepEqual(plain(r.commits.get(r.headSha).files), ['n.txt']);
  assert.ok(r.run('commit -m "Vacío"').ok);
  assert.equal(r.commits.get(r.headSha).files, undefined);  // -m "-am" es un mensaje, no la bandera
  assert.equal(r.run('commit -m -am').ok, true);
  assert.equal(r.commits.get(r.headSha).message, '-am');
  // cherry-pick --continue, como commit, deja fuera lo cambiado después del --no-commit
  run(r, 'checkout -b f', 'commit -m p', 'checkout main', 'cherry-pick f --no-commit', 'touch x.txt');
  assert.ok(r.run('cherry-pick --continue').ok);
  assert.deepEqual(plain(r.work), ['x.txt']);
});

test('el ejercicio de commit parcial no se resuelve con commit -a ni sin add', () => {
  const i = EXERCISES.findIndex((e) => e.id === 'stage');
  const ex = EXERCISES[i];
  const all = start(i, NOW);
  run(all, 'commit -am "Fix login"');
  assert.equal(ex.done(all), false, '-a se lleva también debug.js');
  const noAdd = start(i, NOW);
  assert.equal(noAdd.run('commit -m "Fix login"').ok, false);
  assert.equal(ex.done(noAdd), false, 'sin add no hay commit');
  const both = start(i, NOW);
  run(both, 'add .', 'commit -m "Fix login"');
  assert.equal(ex.done(both), false, 'add . prepara los dos');
  const restored = start(i, NOW);
  run(restored, 'restore debug.js', 'commit -am "Fix login"', 'touch debug.js');
  assert.equal(ex.done(restored), false, 'sin add no vale, aunque el estado final se parezca');
  const fixed = start(i, NOW);
  run(fixed, 'add .', 'restore --staged debug.js', 'commit -m "Fix login"');
  assert.equal(ex.done(fixed), true, 'sacar debug.js de lo preparado también vale');
});

test('add -u prepara solo lo cambiado que git sigue; add . también lo sin seguir', () => {
  const u = fresh();
  run(u, 'touch a.txt', 'touch --new n.txt');
  assert.ok(u.run('add -u').ok);
  assert.deepEqual(plain(u.staged), [{ file: 'a.txt', isNew: false }], '-u prepara el cambiado');
  assert.deepEqual(plain(u.untracked), ['n.txt'], 'lo sin seguir queda fuera');
  assert.deepEqual(plain(u.work), []);
  const st = plain(u.run('status').lines).join('\n');
  assert.match(st, /Changes to be committed:[\s\S]*modified:   a\.txt/);
  assert.match(st, /Untracked files:[\s\S]*n\.txt/);
  assert.doesNotMatch(st, /new file:/);
  // el commit lleva solo a.txt; n.txt sigue sin seguir
  run(u, 'commit -m "solo a"');
  assert.equal(u.untracked.join(), 'n.txt');
  assert.equal(u.staged.length, 0);

  const dot = fresh();
  run(dot, 'touch a.txt', 'touch --new n.txt', 'add .');
  assert.deepEqual(plain(dot.staged.map((s) => s.file).sort()), ['a.txt', 'n.txt'], 'add . prepara los dos');
  assert.equal(dot.untracked.length, 0);

  // --update es lo mismo; con rutas, solo las cambiadas que git sigue
  const long = fresh();
  run(long, 'touch a.txt', 'touch b.txt', 'touch --new n.txt');
  assert.ok(long.run('add --update b.txt n.txt').ok, 'un archivo sin seguir con -u no es un error');
  assert.deepEqual(plain(long.staged.map((s) => s.file)), ['b.txt']);
  assert.deepEqual(plain(long.work), ['a.txt']);
  assert.deepEqual(plain(long.untracked), ['n.txt']);
  assert.equal(long.run('add -u nope.txt').ok, false, 'una ruta que no existe sí');
  assert.ok(long.run('add -u .').ok);
  assert.deepEqual(plain(long.staged.map((s) => s.file)), ['b.txt', 'a.txt']);
  assert.deepEqual(plain(long.untracked), ['n.txt']);
  // sin nada cambiado, -u no prepara nada ni falla
  const clean = fresh();
  assert.ok(clean.run('add -u').ok);
  assert.equal(clean.staged.length, 0);
  assert.match(plain(clean.run('help').lines).join('\n'), /add -u/);
});

test('add -A prepara todo: lo cambiado y lo sin seguir, como add . y a diferencia de add -u', () => {
  const setup = (cmd) => {
    const r = fresh();
    run(r, 'touch a.txt', 'touch --new n.txt');
    assert.ok(r.run(cmd).ok, cmd);
    return r;
  };
  const files = (r) => plain(r.staged.map((s) => s.file).sort());
  const all = setup('add -A');
  assert.deepEqual(files(all), ['a.txt', 'n.txt'], '-A prepara los dos');
  assert.deepEqual(plain(all.staged.find((s) => s.file === 'n.txt')), { file: 'n.txt', isNew: true }, 'n.txt entra como archivo nuevo');
  assert.equal(all.untracked.length, 0);
  assert.equal(all.work.length, 0);
  assert.match(plain(all.run('status').lines).join('\n'), /new file:   n\.txt/);
  assert.deepEqual(files(setup('add --all')), ['a.txt', 'n.txt'], '--all es lo mismo');
  assert.deepEqual(files(setup('add .')), files(all), 'igual que add .');
  const u = setup('add -u');
  assert.deepEqual(files(u), ['a.txt'], 'add -u deja fuera n.txt');
  assert.deepEqual(plain(u.untracked), ['n.txt']);
  // el commit tras -A se lleva los dos
  run(all, 'commit -m "todo"');
  assert.equal(all.staged.length + all.untracked.length + all.work.length, 0);

  // con rutas, solo esas; -A y -u juntos se niegan como git
  const some = fresh();
  run(some, 'touch a.txt', 'touch b.txt', 'touch --new n.txt');
  assert.ok(some.run('add -A n.txt').ok);
  assert.deepEqual(plain(some.staged.map((s) => s.file)), ['n.txt']);
  assert.deepEqual(plain(some.work.sort()), ['a.txt', 'b.txt']);
  assert.equal(some.run('add -A nope.txt').ok, false, 'una ruta que no existe es un error');
  const both = some.run('add -A -u');
  assert.equal(both.ok, false);
  assert.match(plain(both.lines).join('\n'), /'-A' and '-u' cannot be used together/);
  for (const c of ['add -Au', 'add -uA']) assert.match(plain(some.run(c).lines).join('\n'), /cannot be used together/, `${c} son dos banderas`);
  // preparado y cambiado otra vez: add -A (y add .) prepara también el cambio nuevo
  const again = fresh();
  run(again, 'touch a.txt', 'add a.txt', 'touch a.txt', 'add -A');
  assert.deepEqual(plain(again.work), [], 'el cambio nuevo queda preparado');
  assert.deepEqual(plain(again.staged.map((s) => s.file)), ['a.txt'], 'sin duplicarlo');
  const againDot = fresh();
  run(againDot, 'touch a.txt', 'add a.txt', 'touch a.txt', 'add .');
  assert.deepEqual(plain(againDot.work), []);
  // sin nada que preparar, -A no falla
  const clean = fresh();
  assert.ok(clean.run('add -A').ok);
  assert.equal(clean.staged.length, 0);
  assert.match(plain(clean.run('help').lines).join('\n'), /add -A/);
});

test('stash -u aparta también los archivos sin seguir y pop los devuelve; sin -u se quedan', () => {
  const r = fresh();
  run(r, 'touch --new tmp.txt');
  assert.match(r.run('stash').lines[0], /No local changes/, 'sin -u un archivo sin seguir no cuenta');
  assert.match(r.run('stash -u').lines[0], /^Saved working directory/);
  assert.deepEqual(plain(r.untracked), []);
  assert.match(r.run('status').lines.join('\n'), /nothing to commit, working tree clean/);
  run(r, 'stash pop');
  assert.deepEqual(plain(r.untracked), ['tmp.txt']);
  assert.equal(r.stashes.length, 0);

  run(r, 'touch app.js');
  assert.match(r.run('stash').lines[0], /^Saved/);
  assert.deepEqual(plain(r.untracked), ['tmp.txt'], 'sin -u el archivo nuevo se queda');
  run(r, 'stash pop');
  assert.deepEqual(plain(r.work), ['app.js']);

  run(r, 'stash --include-untracked');
  assert.deepEqual(plain(r.untracked), []);
  assert.deepEqual(plain(r.work), []);
  run(r, 'stash pop stash@{0}');
  assert.deepEqual(plain(r.untracked), ['tmp.txt']);
  assert.deepEqual(plain(r.work), ['app.js']);

  run(r, 'stash push -u -m "con nuevos"');
  assert.match(r.run('stash list').lines[0], /^stash@\{0\}: On main: con nuevos$/);
  run(r, 'touch --new tmp.txt');
  const clash = r.run('stash apply');
  assert.equal(clash.ok, false);
  assert.match(clash.lines.join('\n'), /tmp\.txt already exists, no checkout/);
  assert.equal(r.stashes.length, 1);
});

/* rm y mv: git rm prepara el borrado, git mv el renombre, y lo hecho a mano (sin git) lo prepara add -A */
const status = (r) => plain(r.run('status').lines);
const last = (r) => r.commits.get(r.headSha);

test('git rm borra un archivo que git sigue, deja el borrado preparado y el commit lo guarda', () => {
  const r = fresh();
  run(r, 'touch app.js', 'add app.js', 'commit -m "Add app"');
  const res = r.run('git rm app.js');
  assert.ok(res.ok, res.lines.join('\n'));
  assert.deepEqual(plain(res.lines), ["rm 'app.js'"]);
  assert.deepEqual(status(r), ['On branch main', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '\tdeleted:    app.js']);
  const c = r.run('commit -m "Drop app"');
  assert.ok(c.ok);
  assert.deepEqual(plain(c.lines.slice(1)), [' 1 file changed']);
  assert.deepEqual(plain(last(r).removed), ['app.js']);
  assert.equal(last(r).files, undefined, 'un borrado no es un archivo cambiado');
  assert.deepEqual(status(r).slice(1), ['nothing to commit, working tree clean']);
  // ya no existe: otro rm (con o sin git) falla, y touch lo crea como archivo nuevo sin seguir
  assert.match(r.run('git rm app.js').lines[0], /pathspec 'app\.js' did not match any files/);
  assert.match(r.run('rm app.js').lines[0], /cannot remove 'app\.js'/);
  run(r, 'touch app.js');
  assert.deepEqual(plain(r.untracked), ['app.js']);
});

test('git rm se niega con cambios sin commit (salvo -f) y git rm --cached deja el archivo, sin seguir', () => {
  const r = fresh();
  run(r, 'touch a.txt');
  const local = r.run('git rm a.txt');
  assert.equal(local.ok, false);
  assert.match(local.lines.join('\n'), /has local modifications:\n {4}a\.txt\n\(use --cached to keep the file, or -f to force removal\)/);
  run(r, 'add a.txt');
  assert.match(r.run('git rm a.txt').lines.join('\n'), /changes staged in the index/);
  assert.equal(r.staged.length, 1, 'al negarse no toca nada');
  // --cached: sale del índice, el archivo se queda sin seguir
  const cached = r.run('git rm --cached a.txt');
  assert.ok(cached.ok, cached.lines.join('\n'));
  assert.deepEqual(status(r), ['On branch main', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '\tdeleted:    a.txt', 'Untracked files:', '\ta.txt']);
  run(r, 'commit -m "Stop tracking a"');
  assert.deepEqual(plain(last(r).removed), ['a.txt']);
  assert.deepEqual(plain(r.untracked), ['a.txt'], 'tras el commit sigue ahí, sin seguir');
  // -f borra aunque haya cambios
  const f = fresh();
  run(f, 'touch b.txt');
  assert.ok(f.run('git rm -f b.txt').ok);
  assert.deepEqual(plain(f.work), []);
  assert.deepEqual(plain(f.staged), [{ file: 'b.txt', gone: true }]);
  // un archivo nuevo preparado y borrado con -f desaparece sin dejar borrado que preparar
  const n = fresh();
  run(n, 'touch --new n.txt', 'add n.txt', 'git rm -f n.txt');
  assert.deepEqual(status(n).slice(1), ['nothing to commit, working tree clean']);
  // restore --staged deshace un rm --cached: el archivo vuelve a seguirse
  const back = fresh();
  run(back, 'git rm --cached c.txt', 'restore --staged c.txt');
  assert.deepEqual(status(back).slice(1), ['nothing to commit, working tree clean']);
  // un archivo sin seguir no está en el índice
  const u = fresh();
  run(u, 'touch --new tmp.txt');
  assert.match(u.run('git rm tmp.txt').lines[0], /pathspec 'tmp\.txt' did not match any files/);
});

test('git mv renombra preparado, con los cambios del archivo, y el commit lo guarda como un archivo', () => {
  const r = fresh();
  run(r, 'touch old.js', 'add old.js', 'commit -m "Add old"');
  const res = r.run('git mv old.js new.js');
  assert.ok(res.ok, res.lines.join('\n'));
  assert.deepEqual(status(r), ['On branch main', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '\trenamed:    old.js -> new.js']);
  const c = r.run('commit -m "Rename old to new"');
  assert.deepEqual(plain(c.lines.slice(1)), [' 1 file changed']);
  assert.deepEqual(plain(last(r).files), ['new.js']);
  assert.deepEqual(plain(last(r).removed), ['old.js']);
  // el viejo ya no existe y el nuevo sí: mover otra vez el viejo falla, y sobre el nuevo también
  assert.match(r.run('git mv old.js x.js').lines[0], /bad source/);
  run(r, 'touch other.js', 'add other.js', 'commit -m "Add other"');
  assert.match(r.run('git mv other.js new.js').lines[0], /destination exists, source=other\.js, destination=new\.js/);
  // un archivo cambiado se lleva sus cambios: queda renombrado y cambiado sin preparar
  run(r, 'touch other.js', 'git mv other.js renamed.js');
  assert.deepEqual(status(r).slice(1), ['Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '\trenamed:    other.js -> renamed.js', 'Changes not staged for commit:', '\tmodified:   renamed.js']);
  // un archivo sin seguir no se puede mover con git
  run(r, 'touch --new tmp.txt');
  assert.match(r.run('git mv tmp.txt t.txt').lines[0], /not under version control/);
});

test('rm y mv sin git solo tocan el árbol; add -A (y add ., add -u) preparan los borrados y el renombre', () => {
  const r = fresh();
  run(r, 'touch a.js', 'touch b.js', 'add .', 'commit -m "Add a and b"');
  run(r, 'rm a.js');
  assert.deepEqual(status(r), ['On branch main', 'Changes not staged for commit:', '\tdeleted:    a.js']);
  // como en git, un commit sin nada preparado se niega y muestra el borrado
  const no = r.run('commit -m "x"');
  assert.equal(no.ok, false);
  assert.match(no.lines.join('\n'), /deleted: {4}a\.js/);
  // mv a mano: el viejo borrado y el nuevo sin seguir
  run(r, 'mv b.js c.js');
  assert.deepEqual(status(r).slice(1), ['Changes not staged for commit:', '\tdeleted:    a.js', '\tdeleted:    b.js', 'Untracked files:', '\tc.js']);
  // add -A prepara el borrado y ve el mv como un renombre
  run(r, 'add -A');
  assert.deepEqual(status(r).slice(1), ['Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '\tdeleted:    a.js', '\trenamed:    b.js -> c.js']);
  run(r, 'commit -m "Clean up"');
  assert.deepEqual(plain(last(r).removed.sort()), ['a.js', 'b.js']);
  assert.deepEqual(plain(last(r).files), ['c.js']);
  // add -u y add <archivo> también preparan un borrado a mano; commit -a se lo lleva sin add
  for (const cmd of ['add -u', 'add d.js', 'add .']) {
    const x = fresh();
    run(x, 'rm d.js', cmd);
    assert.deepEqual(plain(x.staged), [{ file: 'd.js', gone: true }], cmd);
  }
  const a = fresh();
  run(a, 'rm d.js', 'commit -am "Drop d"');
  assert.deepEqual(plain(last(a).removed), ['d.js']);
  // restore devuelve un archivo borrado a mano; reset --hard tira el borrado preparado
  const back = fresh();
  run(back, 'rm d.js', 'restore d.js');
  assert.deepEqual(status(back).slice(1), ['nothing to commit, working tree clean']);
  const hard = fresh();
  run(hard, 'git rm --cached d.js', 'rm e.js', 'reset --hard');
  assert.deepEqual(status(hard).slice(1), ['nothing to commit, working tree clean']);
  // un borrado a mano es un cambio sin commit: checkout se niega y stash lo aparta y lo devuelve borrado
  const st = fresh();
  run(st, 'checkout -b other', 'commit -m "Other"', 'checkout main', 'rm d.js');
  assert.equal(st.run('checkout other').ok, false);
  run(st, 'stash');
  assert.deepEqual(status(st).slice(1), ['nothing to commit, working tree clean']);
  run(st, 'stash pop');
  assert.deepEqual(plain(st.deleted), ['d.js']);
  // rm a mano de un archivo sin seguir lo borra del todo
  const tmp = fresh();
  run(tmp, 'touch --new tmp.txt', 'rm tmp.txt');
  assert.deepEqual(status(tmp).slice(1), ['nothing to commit, working tree clean']);
});

test('rm y mv: deshacer con add, ida y vuelta, amend, rebase, cherry-pick y stash dejan el estado coherente', () => {
  const clean = ['nothing to commit, working tree clean'];
  // add tras rm --cached lo vuelve a seguir
  for (const cmd of ['add a.txt', 'add .', 'add -A']) {
    const r = fresh();
    run(r, 'git rm --cached a.txt', cmd);
    assert.deepEqual(status(r).slice(1), clean, cmd);
  }
  // git mv y mv de ida y vuelta: nada que preparar
  const g = fresh();
  run(g, 'git mv a.txt b.txt', 'git mv b.txt a.txt');
  assert.deepEqual(status(g).slice(1), clean);
  const m = fresh();
  run(m, 'mv a.txt b.txt', 'mv b.txt a.txt');
  assert.deepEqual(status(m).slice(1), clean);
  // amend que borra lo que creó el mismo commit: el commit no lo deja a la vez creado y borrado
  const a = fresh();
  run(a, 'touch x', 'add x', 'commit -m c', 'git rm x', 'commit --amend -m c2');
  assert.equal(last(a).files, undefined);
  assert.deepEqual(plain(last(a).removed), ['x']);
  assert.equal(a.exists('x'), false);
  // rebase y cherry-pick se llevan el borrado: el archivo no revive
  const rb = fresh();
  run(rb, 'checkout -b f', 'git rm a.txt', 'commit -m del', 'checkout main', 'touch m', 'commit -am m', 'checkout f', 'rebase main');
  assert.match(rb.run('git rm a.txt').lines[0], /did not match any files/);
  const cp = fresh();
  run(cp, 'checkout -b f', 'git rm a.txt', 'commit -m del', 'checkout main', 'cherry-pick f');
  assert.match(cp.run('git rm a.txt').lines[0], /did not match any files/);
  // stash de un rm --cached deja el árbol limpio (el índice vuelve como estaba)
  const st = fresh();
  run(st, 'git rm --cached a.txt', 'stash');
  assert.deepEqual(status(st).slice(1), clean);
  // git rm -r . sin archivos conocidos avisa en vez de no hacer nada
  assert.equal(fresh().run('git rm -r .').ok, false);
});

test('clean con rutas, patrones, -d, -e, -q y banderas juntas', () => {
  const r = fresh();
  run(r, 'touch --new keep.js', 'touch --new a.tmp', 'touch --new docs/b.tmp', 'touch --new build/out.js', 'touch --new build/sub/map.js');
  // status muestra la carpeta que git no sigue entera, como git
  const st = plain(r.run('status').lines);
  assert.deepEqual(st.slice(st.indexOf('Untracked files:') + 1), ['\tkeep.js', '\ta.tmp', '\tdocs/', '\tbuild/']);
  // sin -d, lo que vive en una carpeta sin seguir no se toca
  assert.deepEqual(plain(r.run('clean -n').lines), ['Would remove a.tmp', 'Would remove keep.js']);
  // banderas juntas, y la carpeta se lista una vez
  assert.deepEqual(plain(r.run('clean -nd').lines), ['Would remove a.tmp', 'Would remove build/', 'Would remove docs/', 'Would remove keep.js']);
  assert.deepEqual(plain(r.run('clean -dn -e keep.js -e build').lines), ['Would remove a.tmp', 'Would remove docs/']);
  // -e con un patrón vale en cualquier carpeta; si deja algo de la carpeta, se borran sus archivos uno a uno
  assert.deepEqual(plain(r.run('clean -nd --exclude=map.js').lines), ['Would remove a.tmp', 'Would remove build/out.js', 'Would remove docs/', 'Would remove keep.js']);
  assert.deepEqual(plain(r.run('clean -nde*.tmp').lines), ['Would remove build/', 'Would remove keep.js']);
  // con rutas, -d no hace falta: el patrón cruza carpetas, como una ruta de git
  assert.deepEqual(plain(r.run(`clean -n '*.tmp'`).lines), ['Would remove a.tmp', 'Would remove docs/b.tmp']);
  // una ruta que cubre la carpeta entera la borra como carpeta, con -d o sin él, como git
  assert.deepEqual(plain(r.run('clean -n build/').lines), ['Would remove build/']);
  assert.deepEqual(plain(r.run('clean -n build').lines), ['Would remove build/']);
  assert.deepEqual(plain(r.run('clean -n build/sub').lines), ['Would remove build/sub/map.js']);
  assert.deepEqual(plain(r.run('clean -n -- nada.txt').lines), []);
  assert.equal(r.untracked.length, 5, '-n no borra nada');
  // -f con un patrón borra solo eso
  assert.deepEqual(plain(r.run('clean -f *.tmp').lines), ['Removing a.tmp', 'Removing docs/b.tmp']);
  assert.equal(r.cleans, 1);
  // -q no dice nada pero borra
  assert.deepEqual(plain(r.run('clean -fdq -e keep.js').lines), []);
  assert.deepEqual(plain(r.untracked), ['keep.js']);
  assert.equal(r.cleans, 2);
  // los errores de git, sin tocar nada
  assert.match(r.run('clean -d').lines[0], /requireForce/);
  assert.match(r.run('clean -i').lines[0], /interactive/);
  assert.match(r.run('clean -fz').lines[0], /unknown switch `z'/);
  assert.match(r.run('clean --everything').lines[0], /unknown option/);
  assert.match(r.run('clean -f -e').lines[0], /requires a value/);
  assert.match(r.run('clean -fxX').lines[0], /cannot be used together/);
  // -x no cambia nada (sin .gitignore) y -X no borra nada (no hay nada ignorado)
  assert.deepEqual(plain(r.run('clean -nx').lines), ['Would remove keep.js']);
  assert.deepEqual(plain(r.run('clean -fX').lines), []);
  assert.equal(r.cleans, 2, 'un clean que no borró nada no cuenta');
  assert.deepEqual(plain(r.untracked), ['keep.js']);
});

test('clean -d no toma por carpeta sin seguir una que git sigue', () => {
  const r = fresh();
  // src/app.js va en un commit: src/ es una carpeta seguida, y lo nuevo de adentro se borra sin -d
  run(r, 'touch --new src/app.js', 'add .', 'commit -m "Add app"', 'touch --new src/tmp.js', 'touch --new lib/x.js');
  const st = plain(r.run('status').lines);
  assert.deepEqual(st.slice(st.indexOf('Untracked files:') + 1), ['\tsrc/tmp.js', '\tlib/']);
  assert.deepEqual(plain(r.run('clean -f').lines), ['Removing src/tmp.js']);
  // lo preparado o cambiado dentro de una carpeta tampoco la vuelve «sin seguir»
  run(r, 'touch --new web/a.js', 'touch --new web/b.js', 'add web/a.js');
  assert.deepEqual(plain(r.run('clean -nd').lines), ['Would remove lib/', 'Would remove web/b.js']);
  assert.ok(r.run('clean -fd').ok);
  assert.deepEqual(plain(r.untracked), []);
  assert.equal(r.staged.map((s) => s.file).join(), 'web/a.js', 'lo preparado no se toca');
});

test('add acepta la carpeta sin seguir tal como la muestra status', () => {
  const r = fresh();
  run(r, 'touch --new build/out.js', 'touch --new build/sub/map.js', 'touch --new keep.js');
  assert.ok(plain(r.run('status').lines).includes('\tbuild/'));
  assert.ok(r.run('add build/').ok);
  assert.deepEqual(plain(r.staged.map((s) => s.file).sort()), ['build/out.js', 'build/sub/map.js']);
  assert.deepEqual(plain(r.untracked), ['keep.js']);
  assert.ok(r.run('restore --staged build/out.js').ok);
  assert.ok(r.run('add build').ok, 'sin la barra también');
  assert.equal(r.run('add nada/').ok, false, 'una carpeta que no existe sigue fallando');
});

test('stash show lista lo que guarda un stash sin devolverlo, antes y después de un pop', () => {
  const r = fresh();
  assert.deepEqual(plain(r.run('stash show').lines), ['error: No stash entries found.']);
  r.run('touch app.js');
  r.run('touch --new nuevo.txt');
  r.run('add nuevo.txt');
  r.run('git rm README.md');
  r.run('touch --new tmp.log');
  run(r, 'stash -u');
  r.run('touch notes.txt');
  run(r, 'stash');
  const before = JSON.stringify([r.stashes, r.work, r.staged, r.untracked]);
  // la forma de siempre: los nombres con lo que les pasó y cuántos son (sin líneas: la práctica no tiene contenido)
  assert.deepEqual(plain(r.run('stash show').lines), [' notes.txt | changed', ' 1 file changed']);
  assert.deepEqual(plain(r.run('stash show --stat stash@{1}').lines), [' README.md | deleted', ' app.js    | changed', ' nuevo.txt | new', ' 3 files changed']);
  assert.deepEqual(plain(r.run('stash show --name-only 1').lines), ['README.md', 'app.js', 'nuevo.txt']);
  assert.deepEqual(plain(r.run('git stash show --name-status stash@{1}').lines), ['D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt']);
  // lo sin seguir de stash -u solo sale con -u, o solo eso con --only-untracked
  assert.deepEqual(plain(r.run('stash show -u --name-status stash@{1}').lines), ['D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt', 'A\ttmp.log']);
  assert.deepEqual(plain(r.run('stash show --only-untracked --name-only stash@{1}').lines), ['tmp.log']);
  assert.deepEqual(plain(r.run('stash show --only-untracked stash@{0}').lines), []);
  // mirar no devuelve nada ni suelta el stash, y no cambia el grafo
  assert.equal(JSON.stringify([r.stashes, r.work, r.staged, r.untracked]), before);
  assert.equal(r.run('stash show').changed, false);
  // los errores de git: una referencia que no existe, dos, una bandera desconocida, -p sin contenido
  assert.deepEqual(plain(r.run('stash show stash@{2}').lines), ['error: stash@{2} is not a valid reference']);
  assert.match(r.run('stash show 0 1').lines[0], /^error: Too many revisions specified/);
  assert.deepEqual(plain(r.run('stash show --name-only -- stash@{0}').lines), ['notes.txt']);
  // las opciones antes de show no se pierden en silencio
  assert.equal(r.run('stash -u show').ok, false);
  assert.match(r.run('stash show --bogus').lines[0], /^error: unknown option 'bogus'/);
  assert.equal(r.run('stash show -p').ok, false);
  // después de un pop, stash@{0} es el que quedaba y lo devuelto ya no está guardado
  assert.ok(r.run('stash pop').ok);
  assert.deepEqual(plain(r.run('stash show --name-only').lines), ['README.md', 'app.js', 'nuevo.txt']);
  assert.ok(r.run('stash pop').ok);
  assert.deepEqual(plain(r.run('stash show').lines), ['error: No stash entries found.']);
  assert.ok(r.stashShows >= 8);
});

test('el ejercicio de stash show no se resuelve sin mirar ni con el stash equivocado', () => {
  const i = EXERCISES.findIndex((e) => e.id === 'stashshow');
  // las dos líneas de stash list son iguales: hay que mirar qué guarda cada uno
  const r = start(i, NOW);
  const list = r.run('stash list').lines;
  assert.equal(list.length, 2);
  assert.equal(list[0].replace(/^stash@\{\d\}: /, ''), list[1].replace(/^stash@\{\d\}: /, ''));
  // pop a secas devuelve notes.txt, el equivocado
  const a = start(i, NOW);
  a.run('stash show');
  a.run('stash pop');
  assert.equal(EXERCISES[i].done(a), false);
  // el bueno sin haber mirado tampoco cuenta
  const b = start(i, NOW);
  b.run('stash pop stash@{1}');
  assert.equal(EXERCISES[i].done(b), false);
  // soltar el del login y tocar sus archivos a mano no es recuperarlo
  const d = start(i, NOW);
  run(d, 'stash show 1', 'stash drop 1', 'touch login.js', 'touch login.css');
  assert.equal(EXERCISES[i].done(d), false);
  // mirar solo el de notes.txt no cuenta como haber mirado el del login
  const e = start(i, NOW);
  run(e, 'stash show', 'stash pop 1');
  assert.equal(EXERCISES[i].done(e), false);
  // apply del bueno y drop también lo resuelve, como pop
  const f = start(i, NOW);
  run(f, 'stash show 1', 'stash apply 1', 'stash drop 1');
  assert.equal(EXERCISES[i].done(f), true);
  // apply deja los dos guardados
  const c = start(i, NOW);
  c.run('stash show 1');
  c.run('stash apply 1');
  assert.equal(EXERCISES[i].done(c), false);
});

test('stash show y stash list solo leen: pasan con un rebase a medias; un archivo nuevo borrado a mano no sale como borrado', () => {
  const r = fresh();
  run(r, 'checkout -b feature', 'commit -m "a"', 'commit -m "b"', 'checkout main', 'commit -m "c"', 'checkout feature');
  r.run('touch x.js');
  r.run('stash');
  assert.ok(r.run('rebase -i main').ok);
  assert.ok(r.rebasing);
  assert.deepEqual(plain(r.run('stash show --name-only').lines), ['x.js']);
  assert.equal(r.run('stash list').ok, true);
  assert.equal(r.run('stash pop').ok, false);
  r.run('rebase --abort');
  const n = fresh();
  run(n, 'touch --new n.txt', 'add n.txt', 'rm n.txt', 'touch app.js', 'stash');
  assert.deepEqual(plain(n.run('stash show --name-status').lines), ['M\tapp.js']);
});

test('show imprime el sha, el mensaje y los archivos de un commit (HEAD sin otro) sin mover nada', () => {
  const r = fresh();
  const first = r.headSha;
  r.run('touch app.js');
  r.run('touch --new nuevo.txt');
  run(r, 'add .', 'git rm README.md', 'commit -m "Cambios"');
  const head = r.headSha;
  const before = JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged, r.untracked]);
  // HEAD: la cabecera como log, el mensaje y los archivos como --stat (sin contenido, lo que le pasó a cada uno)
  const res = r.run('git show');
  assert.ok(res.ok);
  assert.equal(res.changed, false);
  assert.deepEqual(plain(res.lines), [`commit ${head} (HEAD -> main)`, 'Author: You', '', '    Cambios', '', ' README.md | deleted', ' app.js    | changed', ' nuevo.txt | new', ' 3 files changed']);
  // HEAD~1, por sha corto y con --oneline; --name-status y --name-only como git; -s calla los archivos
  assert.deepEqual(plain(r.run('show HEAD~1 -s').lines), [`commit ${first}`, 'Author: You', '', `    ${r.commits.get(first).message}`]);
  assert.deepEqual(plain(r.run(`show ${head.slice(0, 7)} --name-status`).lines.slice(5)), ['D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt']);
  assert.deepEqual(plain(r.run('show --oneline --name-only').lines), [`${head.slice(0, 7)} (HEAD -> main) Cambios`, 'README.md', 'app.js', 'nuevo.txt']);
  // varios commits, separados por una línea en blanco
  assert.deepEqual(plain(r.run('show -s --oneline HEAD HEAD~1').lines), [`${head.slice(0, 7)} (HEAD -> main) Cambios`, '', `${first.slice(0, 7)} ${r.commits.get(first).message}`]);
  // una etiqueta anotada sale antes con su mensaje; una ligera, solo el commit
  run(r, 'tag -a v1 -m "Primera versión"', 'tag ligera HEAD~1');
  assert.deepEqual(plain(r.run('show -s v1').lines.slice(0, 5)), ['tag v1', 'Tagger: You', '', 'Primera versión', '']);
  // gana el último formato: --name-status tras -s vuelve a mostrar los archivos
  assert.deepEqual(plain(r.run('show -s --name-status --oneline').lines), [`${r.short(r.headSha)} (HEAD -> main, tag: v1) Cambios`, 'D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt']);
  assert.match(r.run('show -s ligera').lines[0], /^commit /);
  // un renombre (git mv) sale como el borrado del viejo y el nombre nuevo; un archivo nuevo cambiado después ya es M
  run(r, 'git mv app.js main.js', 'commit -m "Renombra"');
  assert.deepEqual(plain(r.run('show --name-status').lines.slice(5)), ['D\tapp.js', 'A\tmain.js']);
  run(r, 'touch nuevo.txt', 'commit -am "Toca nuevo"');
  assert.deepEqual(plain(r.run('show --name-status').lines.slice(5)), ['M\tnuevo.txt']);
  // un merge dice sus padres
  run(r, 'checkout -b f', 'commit -m x', 'checkout main', 'merge --no-ff f -m "Une f"');
  assert.match(r.run('show -s').lines[1], /^Merge: [0-9a-f]{7} [0-9a-f]{7}$/);
  // mirar no mueve nada ni anota en el reflog
  const after = JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged, r.untracked]);
  run(r, 'show', 'show HEAD~3', 'show v1');
  assert.equal(JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged, r.untracked]), after);
  assert.notEqual(before, after);
});

test('show se niega como git: un sha que no existe, opciones desconocidas, -p sin contenido y un repo vacío', () => {
  const r = fresh();
  const shown = r.run('show 0123abcd');
  assert.equal(shown.ok, false);
  assert.deepEqual(plain(shown.lines), ["fatal: ambiguous argument '0123abcd': unknown revision or path not in the working tree.", "Use '--' to separate paths from revisions, like this:", "'git <command> [<revision>...] -- [<file>...]'"]);
  // si una referencia no existe no se imprime ninguna
  assert.equal(r.run('show HEAD nada').ok, false);
  assert.equal(r.run('show HEAD~99').ok, false);
  assert.match(r.run('show --bogus').lines[0], /^fatal: unrecognized argument: --bogus/);
  assert.equal(r.run('show -p').ok, false);
  assert.match(r.run('show -3').lines[0], /^fatal: unrecognized argument: -3/);
  assert.equal(r.run('show -- README.md').ok, false);
  // un archivo que un commit creó y un --amend borró con git rm no sale como borrado: nunca estuvo
  run(r, 'touch --new n.txt', 'add n.txt', 'commit -m n', 'git rm n.txt', 'commit --amend -m "sin n"');
  assert.deepEqual(plain(r.run('show --name-status').lines.slice(5)), []);
  const empty = new Repo({ now: NOW });
  assert.deepEqual(plain(empty.run('show').lines), ["fatal: your current branch 'main' does not have any commits yet"]);
  assert.match(empty.run('show HEAD').lines[0], /^fatal: ambiguous argument 'HEAD'/);
  // help lo lista
  assert.ok(r.run('help').lines.some((l) => l.startsWith('show ')));
});

test('diff lista los archivos cambiados sin preparar y diff --staged los preparados, sin tocar nada', () => {
  const r = fresh();
  // con el árbol limpio no hay nada que listar
  assert.deepEqual(plain(r.run('diff').lines), []);
  assert.deepEqual(plain(r.run('diff --staged').lines), []);
  r.run('touch app.js');
  r.run('touch --new nuevo.txt');
  r.run('rm README.md');
  const state = () => JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged, r.deleted, r.untracked, r.adds]);
  const before = state();
  // antes de add: lo cambiado y lo borrado sin preparar; lo sin seguir no sale, como en git
  const res = r.run('git diff');
  assert.ok(res.ok);
  assert.equal(res.changed, false);
  assert.deepEqual(plain(res.lines), [' README.md | deleted', ' app.js    | changed', ' 2 files changed']);
  assert.deepEqual(plain(r.run('diff --name-status').lines), ['D\tREADME.md', 'M\tapp.js']);
  assert.deepEqual(plain(r.run('diff --name-only').lines), ['README.md', 'app.js']);
  assert.deepEqual(plain(r.run('diff --staged').lines), []);
  assert.equal(state(), before);
  // después de add: pasan a --staged (también --cached), con lo nuevo como A, y diff queda vacío
  r.run('add .');
  assert.deepEqual(plain(r.run('diff').lines), []);
  assert.deepEqual(plain(r.run('diff --staged --name-status').lines), ['D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt']);
  assert.deepEqual(plain(r.run('diff --cached').lines), [' README.md | deleted', ' app.js    | changed', ' nuevo.txt | new', ' 3 files changed']);
  // gana el último formato
  assert.deepEqual(plain(r.run('diff --staged --name-only --stat').lines.at(-1)), ' 3 files changed');
  // un archivo preparado y cambiado otra vez sale en los dos
  r.run('touch app.js');
  assert.deepEqual(plain(r.run('diff --name-status').lines), ['M\tapp.js']);
  assert.deepEqual(plain(r.run('diff --cached --name-status').lines), ['D\tREADME.md', 'M\tapp.js', 'A\tnuevo.txt']);
  // con rutas, solo esas (tras -- o a secas, si la práctica conoce el archivo)
  assert.deepEqual(plain(r.run('diff --staged --name-only -- nuevo.txt').lines), ['nuevo.txt']);
  assert.deepEqual(plain(r.run('diff --staged --name-only app.js').lines), ['app.js']);
  assert.deepEqual(plain(r.run('diff -- nada.txt').lines), []);
  // un git mv preparado sale como el borrado del viejo y el nombre nuevo; el cambio sin preparar de app.js lo sigue
  run(r, 'commit -m "Cambios"', 'git mv app.js main.js', 'touch lib.js');
  assert.deepEqual(plain(r.run('diff --staged --name-status').lines), ['D\tapp.js', 'A\tmain.js']);
  assert.deepEqual(plain(r.run('diff --name-status').lines), ['M\tlib.js', 'M\tmain.js']);
  run(r, 'git rm --cached nuevo.txt');
  assert.deepEqual(plain(r.run('diff --staged --name-status').lines), ['D\tapp.js', 'A\tmain.js', 'D\tnuevo.txt']);
  const head = r.headSha;
  const after = JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged]);
  for (const line of ['diff', 'diff --staged', 'diff --cached --name-only']) assert.equal(r.run(line).changed, false);
  assert.equal(r.headSha, head);
  assert.equal(JSON.stringify([[...r.branches], r.head, r.reflog, r.work, r.staged]), after);
  assert.ok(r.run('help').lines.some((l) => l.startsWith('diff ')));
});

test('diff se niega como git: opciones desconocidas, -p sin contenido, un commit y una ruta que no existe', () => {
  const r = fresh();
  r.run('touch app.js');
  const work = JSON.stringify(r.work);
  assert.match(r.run('diff -p').lines[0], /^fatal: diff -p needs file contents/);
  assert.equal(r.run('diff --patch').ok, false);
  assert.match(r.run('diff --word-diff').lines[0], /^fatal: unrecognized argument: --word-diff/);
  assert.match(r.run('diff HEAD').lines[0], /^fatal: diff <commit> is not in this practice/);
  assert.match(r.run('diff main').lines[0], /^fatal: diff <commit> is not in this practice/);
  assert.match(r.run('diff nada.txt').lines[0], /^fatal: ambiguous argument 'nada.txt'/);
  assert.equal(JSON.stringify(r.work), work);
  // un repo vacío: diff y diff --staged funcionan (lo nuevo preparado es A); HEAD no existe
  const empty = new Repo({ now: NOW });
  empty.run('touch --new a.txt');
  assert.deepEqual(plain(empty.run('diff').lines), []);
  empty.run('add a.txt');
  assert.deepEqual(plain(empty.run('diff --staged --name-status').lines), ['A\ta.txt']);
  assert.match(empty.run('diff HEAD').lines[0], /^fatal: ambiguous argument 'HEAD'/);
});
