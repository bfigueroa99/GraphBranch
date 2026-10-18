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
    ['cherry-pick feature', 'tag v1.0.1'],
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

test('los números de la URL piden un ejercicio de la lista; lo demás se descarta', () => {
  assert.deepEqual(plain(decodeExercise('3')), { index: 2 });
  for (const bad of ['0', '9', '', 'no es base64!', 'eyJ2IjoyfQ', 'x'.repeat(2000), null, undefined, 7]) assert.equal(decodeExercise(bad), null, String(bad));
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
