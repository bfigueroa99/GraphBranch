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
const { Repo, fromData, EXERCISES, start, startCustom, customExercise, encodeExercise, decodeExercise, cleanExercise } = ctx.window.GB.gitsim;
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
  // sin -m conserva el mensaje y recoge los archivos cambiados
  r.run('touch a.txt');
  assert.ok(r.run('commit --amend').ok);
  assert.equal(r.commits.get(r.headSha).message, 'Add search');
  assert.deepEqual(plain(r.work), []);
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
  assert.equal(r.run('restore --staged b.txt').ok, false);
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
  for (const bad of ['0', '10', '', 'no es base64!', 'eyJ2IjoyfQ', 'x'.repeat(2000), null, undefined, 7]) assert.equal(decodeExercise(bad), null, String(bad));
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
  // el commit se lleva los cambios
  r.run('commit -m "Use the stash"');
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
