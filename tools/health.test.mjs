#!/usr/bin/env node
/* Pruebas de js/health.js: los cálculos de la salud del repo con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/health.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'health.js'), 'utf8'), ctx, { filename: 'health.js' });
const { compute, clashes, clashCandidates, compare, conflictsParam, healthParam, forksParam, splitFiles } = ctx.window.GB.health;

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 13, 12);
const ago = (d) => NOW - d * DAY;

function repo() {
  const commits = new Map([
    ['m', { date: ago(0.1) }],
    ['a', { date: ago(90) }],
    ['b', { date: ago(45) }],
    ['c', { date: ago(31) }],
    ['d', { date: ago(29) }],
    ['e', { date: ago(60) }],
  ]);
  const br = (name, sha, extra = {}) => [name, { name, sha, ...extra }];
  return {
    repo: { defaultBranch: 'main' },
    commits,
    branches: new Map([
      br('main', 'm', { isDefault: true }),
      br('old', 'a'),
      br('mid', 'b'),
      br('edge', 'c'),
      br('fresh', 'd'),
      br('hasPr', 'e'), // vieja, pero con un PR abierto: no está olvidada
      br('nohist', 'zz'), // su historia aún no llegó: no se sabe su edad
    ]),
    pulls: new Map([
      [7, { number: 7, title: 'viejo', head: 'hasPr', sameRepo: true, createdAt: ago(10) }],
      [9, { number: 9, title: 'nuevo', head: 'x', sameRepo: true, createdAt: ago(1), draft: true }],
      [8, { number: 8, title: 'de fork', head: 'f', sameRepo: false, createdAt: ago(3) }],
    ]),
  };
}

test('ramas sin actividad hace más de 30 días y sin PR, la más vieja primero', () => {
  const h = compute(repo(), [], NOW);
  assert.deepEqual(Array.from(h.stale.rows, (r) => r.name), ['old', 'mid', 'edge']);
  assert.equal(h.stale.total, 3);
});

test('PRs abiertos por edad: el más viejo primero; el de un fork no apunta a una rama', () => {
  const h = compute(repo(), [], NOW);
  assert.deepEqual(Array.from(h.prs.rows, (r) => r.number), [7, 8, 9]);
  assert.equal(h.prs.rows[1].head, null);
  assert.equal(h.prs.rows[2].draft, true);
});

test('tiempo de abierto a fusionado: mediana y el más lento, sin contar los que no traen su apertura', () => {
  const acts = [
    { id: '1', kind: 'pr-merge', time: ago(1), openedAt: ago(1) - 2 * 36e5 },
    { id: '2', kind: 'pr-merge', time: ago(2), openedAt: ago(2) - 4 * 36e5 },
    { id: '3', kind: 'pr-merge', time: ago(3), openedAt: ago(3) - 30 * 36e5 },
    { id: '4', kind: 'pr-merge', time: ago(4) },
  ];
  const h = compute(repo(), acts, NOW);
  assert.equal(h.merged.n, 3);
  assert.equal(h.merged.median, 4 * 36e5);
  assert.equal(h.merged.max, 30 * 36e5);
  assert.equal(compute(repo(), [], NOW).merged, null);
});

test('ritmo: merges en 7 y 30 días y releases en 30, sin repetir una actividad', () => {
  const acts = [
    { id: '1', kind: 'pr-merge', time: ago(1) },
    { id: '1', kind: 'pr-merge', time: ago(1) },
    { id: '2', kind: 'pr-merge', time: ago(20) },
    { id: '3', kind: 'pr-merge', time: ago(40) },
    { id: '4', kind: 'release', time: ago(5) },
    { id: '5', kind: 'release', time: ago(50) },
    { id: '6', kind: 'push', time: ago(1) },
  ];
  const pace = compute(repo(), acts, NOW).pace;
  assert.deepEqual({ ...pace, mergeWeeks: [...pace.mergeWeeks], openedWeeks: [...pace.openedWeeks], closedWeeks: [...pace.closedWeeks], branchWeeks: [...pace.branchWeeks] }, { merges7: 1, merges30: 2, releases30: 1, mergeWeeks: [0, 0, 1, 0, 0, 1, 0, 1], openedWeeks: [0, 0, 0, 0, 0, 0, 0, 0], closedWeeks: [0, 0, 0, 0, 0, 0, 0, 0], branchWeeks: [0, 0, 0, 0, 0, 0, 0, 0] });
});

test('DORA: despliegues en 30 días, mediana entre releases y tiempo de entrega', () => {
  const acts = [
    { id: 'r1', kind: 'release', time: ago(2) },
    { id: 'r1', kind: 'release', time: ago(2) },
    { id: 'r2', kind: 'release', time: ago(6) },
    { id: 'r3', kind: 'release', time: ago(16) },
    { id: 'r4', kind: 'release', time: ago(50) },
    { id: 'm1', kind: 'pr-merge', time: ago(1), openedAt: ago(1) - 6 * 36e5 },
    { id: 'm2', kind: 'pr-merge', time: ago(2), openedAt: ago(2) - 2 * 36e5 },
  ];
  const d = compute(repo(), acts, NOW).dora;
  assert.equal(d.deploys30, 3);
  assert.equal(d.gap, 10 * DAY); // huecos 4, 10 y 34 días: mediana 10
  assert.equal(d.lead, 4 * 36e5);
  assert.deepEqual({ ...compute(repo(), [], NOW).dora, weeks: [...compute(repo(), [], NOW).dora.weeks] }, { deploys30: 0, gap: null, lead: null, weeks: [0, 0, 0, 0, 0, 0, 0, 0] });
});

test('las listas se cortan a 8 filas y dicen cuántas hay en total', () => {
  const d = repo();
  for (let i = 0; i < 12; i++) {
    d.commits.set('s' + i, { date: ago(100 + i) });
    d.branches.set('s' + i, { name: 's' + i, sha: 's' + i });
  }
  const h = compute(d, [], NOW);
  assert.equal(h.stale.rows.length, 8);
  assert.equal(h.stale.total, 15);
});

test('choques: archivos que tocan varias ramas, los más disputados primero; uno solo no choca', () => {
  const c = clashes([
    { name: 'feature/b', files: ['src/pagos.js', 'a.md', 'src/pagos.js'] },
    { name: 'feature/a', files: ['src/pagos.js', 'b.md', 'a.md'] },
    { name: 'fix/c', files: ['src/pagos.js'] },
  ]);
  assert.equal(c.total, 2);
  assert.deepEqual(Array.from(c.rows, (r) => r.path), ['src/pagos.js', 'a.md']);
  assert.deepEqual(Array.from(c.rows[0].branches), ['feature/a', 'feature/b', 'fix/c']); // sin repetir una rama
  assert.equal(clashes([{ name: 'x', files: ['f'] }]).total, 0);
});

test('choques: se comparan las ramas con PR abierto del mismo repo, sin la de por defecto ni las de forks', () => {
  const r = repo();
  r.pulls.set(10, { number: 10, title: 'a main', head: 'main', sameRepo: true });
  assert.deepEqual(Array.from(clashCandidates(r)), ['hasPr']); // 'x' no está cargada; 'f' es de un fork; 'main' es la de por defecto
  assert.equal(clashCandidates(r, 0).length, 0);
});

function fork() {
  // base <- m1 <- m2 (main); base <- f1 <- f2 (feat); f2 también fusiona m1
  const c = (sha, parents, d) => [sha, { sha, parents, date: ago(d), message: `msg ${sha}\ncuerpo` }];
  return {
    commits: new Map([c('base', [], 9), c('m1', ['base'], 8), c('m2', ['m1'], 7), c('f1', ['base'], 6), c('f2', ['f1'], 5)]),
    branches: new Map([
      ['main', { name: 'main', sha: 'm2' }],
      ['feat', { name: 'feat', sha: 'f2' }],
    ]),
  };
}

test('comparar dos ramas: commits por delante de cada una y punto de separación', () => {
  const r = compare(fork(), 'main', 'feat');
  assert.equal(r.a.ahead, 2);
  assert.equal(r.b.ahead, 2);
  assert.equal(r.base.sha, 'base');
  assert.equal(r.base.message, 'msg base');
  assert.equal(r.partial, false);
  // los commits de cada tramo, para marcarlos en el grafo
  assert.deepEqual(Array.from(r.a.shas).sort(), ['m1', 'm2']);
  assert.deepEqual(Array.from(r.b.shas).sort(), ['f1', 'f2']);
});

test('comparar con un merge: el punto de separación es el ancestro común más nuevo', () => {
  const d = fork();
  d.commits.set('f2', { sha: 'f2', parents: ['f1', 'm1'], date: ago(5), message: 'merge' });
  const r = compare(d, 'main', 'feat');
  assert.equal(r.a.ahead, 1); // m2
  assert.equal(r.b.ahead, 2); // f1 y f2
  assert.equal(r.base.sha, 'm1');
});

test('comparar: una rama contenida en la otra, sin ancestro cargado y con historia incompleta', () => {
  const d = fork();
  d.branches.set('old', { name: 'old', sha: 'm1' });
  const r = compare(d, 'old', 'main');
  assert.deepEqual([r.a.ahead, r.b.ahead, r.base.sha], [0, 1, 'm1']);
  d.commits.delete('base');
  const p = compare(d, 'main', 'feat');
  assert.equal(p.partial, true);
  assert.equal(p.base, null);
  assert.equal(compare(d, 'main', 'nada'), null);
});

test('archivos: solo en A, solo en B y en las dos', () => {
  const r = splitFiles(['a', 'b', 'c', 'c'], ['c', 'd', 'b']);
  assert.deepEqual(Array.from(r.onlyA), ['a']);
  assert.deepEqual(Array.from(r.onlyB), ['d']);
  assert.deepEqual(Array.from(r.both), ['b', 'c']);
});

test('compute: los forks activos con su tiempo desde el último push', () => {
  const d = repo();
  d.forks = [
    { fullName: 'x/y', url: 'https://github.com/x/y', pushedAt: ago(2) },
    { fullName: 'sin/fecha', url: 'https://github.com/s/f' },
  ];
  const h = compute(d, [], NOW);
  assert.equal(h.forks.total, 1);
  assert.equal(h.forks.rows[0].fullName, 'x/y');
  assert.equal(h.forks.rows[0].idle, 2 * DAY);
  assert.equal(compute({ ...d, forks: undefined }, [], NOW).forks.total, 0);
});

test('compute: los forks salen por actividad reciente aunque la lista venga desordenada', () => {
  const d = repo();
  d.forks = [
    { fullName: 'a/viejo', url: 'https://github.com/a/viejo', pushedAt: ago(40) },
    { fullName: 'b/nuevo', url: 'https://github.com/b/nuevo', pushedAt: ago(1) },
    { fullName: 'c/medio', url: 'https://github.com/c/medio', pushedAt: ago(9) },
  ];
  assert.deepEqual(compute(d, [], NOW).forks.rows.map((f) => f.fullName), ['b/nuevo', 'c/medio', 'a/viejo']);
});

test('compute: los forks se pueden ordenar por estrellas, con el push más nuevo como desempate', () => {
  const d = repo();
  d.forks = [
    { fullName: 'a/uno', url: 'https://github.com/a/uno', pushedAt: ago(1), stars: 2 },
    { fullName: 'b/dos', url: 'https://github.com/b/dos', pushedAt: ago(9), stars: 30 },
    { fullName: 'c/tres', url: 'https://github.com/c/tres', pushedAt: ago(3), stars: 2 },
    { fullName: 'd/sin', url: 'https://github.com/d/sin', pushedAt: ago(2) },
  ];
  const rows = compute(d, [], NOW, 'stars').forks.rows;
  assert.deepEqual(rows.map((f) => f.fullName), ['b/dos', 'a/uno', 'c/tres', 'd/sin']);
  assert.deepEqual(rows.map((f) => f.stars), [30, 2, 2, 0]);
  assert.deepEqual(compute(d, [], NOW).forks.rows.map((f) => f.fullName), ['a/uno', 'd/sin', 'c/tres', 'b/dos']);
});

test('PRs por estado: borrador, checks en rojo, aprobado y esperando revisión, cada uno con su salto', () => {
  const r = repo();
  r.pulls.clear();
  r.ci = new Map([['red', 'failure']]);
  const add = (n, head, extra = {}) => r.pulls.set(n, { number: n, title: 't' + n, head, sameRepo: true, createdAt: ago(n), ...extra });
  add(1, 'a', { draft: true, ci: 'failure' }); // el borrador manda sobre el rojo
  add(2, 'red'); // el rojo viene del estado de su rama
  add(3, 'b', { review: 'approved', ci: 'failure' }); // rojo gana a aprobado
  add(4, 'c', { review: 'approved' });
  add(5, 'd');
  add(6, 'e', { ci: 'success' });
  const s = compute(r, [], NOW).prStates;
  const nums = (k) => Array.from(s[k].rows, (x) => x.number);
  assert.deepEqual(nums('draft'), [1]);
  assert.deepEqual(nums('failing'), [3, 2]);
  assert.deepEqual(nums('approved'), [4]);
  assert.deepEqual(nums('waiting'), [6, 5]);
  assert.equal(s.waiting.total, 2);
});

test('tasa de fallos de CI: PRs abiertos en rojo entre los que tienen checks, y las veces que la rama por defecto se puso roja en 30 días', () => {
  const data = repo();
  data.ci = new Map([['hasPr', 'failure']]);
  data.pulls.get(9).ci = 'success';
  data.pulls.get(8).ci = 'pending'; // sin resultado todavía: no cuenta
  const acts = [
    { kind: 'ci-fail', time: ago(2) },
    { kind: 'ci-fail', time: ago(20) },
    { kind: 'ci-fail', time: ago(40) }, // fuera de los 30 días
    { kind: 'commit', time: ago(1) },
  ];
  const h = compute(data, acts, NOW);
  assert.deepEqual({ ...h.ci.prs }, { failing: 1, total: 2, rate: 0.5 });
  assert.equal(h.ci.fails30, 2);
  const none = compute(repo(), [], NOW);
  assert.equal(none.ci.prs, null);
  assert.equal(none.ci.fails30, 0);
});

test('tiempo de entrega: desde el primer commit del PR cuando se conoce, y desde su apertura cuando no', () => {
  const data = repo();
  const merge = (id, number, hours) => ({ kind: 'pr-merge', id, number, time: ago(1), openedAt: ago(1) - hours * 36e5 });
  const acts = [merge('a', 1, 10), merge('b', 2, 20)];
  const base = compute(data, acts, NOW);
  assert.equal(base.leadSource.fromCommit, 0);
  assert.equal(base.dora.lead, 15 * 36e5, 'sin primeros commits: de abierto a fusionado');

  data.firstCommits = new Map([[1, ago(1) - 30 * 36e5], [2, null]]);
  const h = compute(data, acts, NOW);
  assert.equal(h.leadSource.fromCommit, 1);
  assert.equal(h.leadSource.total, 2);
  assert.equal(h.dora.lead, 25 * 36e5, 'el 1 cuenta 30 h desde su primer commit y el 2 sigue con 20 h desde su apertura');
  assert.equal(h.merged.median, 15 * 36e5, 'el tiempo de abierto a fusionado no cambia');

  data.firstCommits = new Map([[1, ago(0.5)]]); // un primer commit posterior al merge no vale
  assert.equal(compute(data, acts, NOW).leadSource.fromCommit, 0);
});

test('frecuencia de despliegue: releases por semana, de la semana más vieja a la actual', () => {
  const rel = (id, days) => ({ kind: 'release', id, time: ago(days) });
  const acts = [rel('a', 0.5), rel('b', 3), rel('c', 8), rel('d', 20), rel('e', 20.5), rel('f', 70), rel('g', -1)];
  const h = compute(repo(), acts, NOW);
  assert.deepEqual([...h.dora.weeks], [0, 0, 0, 0, 0, 2, 1, 2], 'a y b esta semana, c la pasada, d y e hace tres, f fuera de las 8 y g (futuro) no cuenta');
  assert.deepEqual([...compute(repo(), [], NOW).dora.weeks], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('tendencia de merges: PRs fusionados por semana, de la semana más vieja a la actual', () => {
  const mg = (id, days) => ({ kind: 'pr-merge', id, number: id, time: ago(days) });
  const acts = [mg(1, 0.5), mg(2, 3), mg(2, 3), mg(3, 8), mg(4, 20), mg(5, 70), mg(6, -1)];
  const h = compute(repo(), acts, NOW);
  assert.deepEqual([...h.pace.mergeWeeks], [0, 0, 0, 0, 0, 1, 1, 2], 'el 1 y el 2 (repetido, cuenta una vez) esta semana, el 3 la pasada, el 4 hace tres; el 5 fuera de las 8 y el 6 (futuro) no cuentan');
  assert.deepEqual([...compute(repo(), [], NOW).pace.mergeWeeks], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('tendencia de PRs abiertos: cada PR cuenta una vez por semana, con pr-open o con el openedAt de su merge', () => {
  const op = (id, number, days) => ({ kind: 'pr-open', id, number, time: ago(days) });
  const mg = (id, number, days, openedDays) => ({ kind: 'pr-merge', id, number, time: ago(days), openedAt: ago(openedDays) });
  const acts = [op('a', 1, 0.5), op('b', 1, 0.2), mg('c', 2, 1, 9), mg('d', 3, 2, 3), op('e', 3, 3), op('f', 4, 70), op('g', 5, -1), { kind: 'push', id: 'h', time: ago(1) }];
  const h = compute(repo(), acts, NOW);
  assert.deepEqual([...h.pace.openedWeeks], [0, 0, 0, 0, 0, 0, 1, 2], 'el 1 (reabierto) cuenta una vez, el 3 con su primera apertura; el 2 por su openedAt de hace 9 días; el 4 fuera de las 8 y el 5 (futuro) no cuentan');
  assert.deepEqual([...compute(repo(), [], NOW).pace.openedWeeks], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('conflictsParam lee ?conflicts= de la URL: 1 o vacío lo pide; 0, false, no y off no', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(conflictsParam(q('')), false);
  assert.equal(conflictsParam(q('repo=a/b')), false);
  assert.equal(conflictsParam(q('conflicts=1')), true);
  assert.equal(conflictsParam(q('conflicts')), true);
  assert.equal(conflictsParam(q('conflicts=yes')), true);
  for (const off of ['0', 'false', 'NO', 'off', ' 0 ']) assert.equal(conflictsParam(q('conflicts=' + encodeURIComponent(off))), false, off);
  assert.equal(conflictsParam(null), false);
  assert.equal(conflictsParam({}), false);
});

test('?health=1 abre el panel al cargar; sin el parámetro o con 0, false, no u off, no', () => {
  const q = (s) => new URLSearchParams(s);
  for (const s of ['health=1', 'health', 'health=', 'repo=a/b&health=true', 'health=sí']) assert.equal(healthParam(q(s)), true, s);
  for (const s of ['', 'repo=a/b', 'health=0', 'health=false', 'health=NO', 'health=off', 'health= off ', 'healthy=1']) assert.equal(healthParam(q(s)), false, s);
  assert.equal(healthParam(null), false);
});

test('?forks=0 (o false, no, off) oculta los forks del panel; sin el parámetro o con otro valor se muestran', () => {
  const q = (s) => new URLSearchParams(s);
  for (const s of ['forks=0', 'forks=false', 'forks=NO', 'forks=off', 'repo=a/b&forks= off ']) assert.equal(forksParam(q(s)), false, s);
  for (const s of ['', 'repo=a/b', 'forks=1', 'forks', 'forks=true', 'forks=sí', 'forky=0']) assert.equal(forksParam(q(s)), true, s);
  assert.equal(forksParam(null), true);
});

test('tendencia de issues cerrados: cada issue cuenta una vez, por semana, de la más vieja a la actual', () => {
  const cl = (id, days, number) => ({ kind: 'issue-close', id, number, time: ago(days) });
  const acts = [cl('a', 0.5, 1), cl('b', 3, 2), cl('c', 3.5, 2), cl('d', 8, 3), cl('e', 20, 4), cl('f', 70, 5), cl('g', -1, 6), { kind: 'issue-open', id: 'h', number: 7, time: ago(1) }];
  const h = compute(repo(), acts, NOW);
  assert.deepEqual([...h.pace.closedWeeks], [0, 0, 0, 0, 0, 1, 1, 2], 'el 1 y el 2 (cerrado dos veces, cuenta una) esta semana, el 3 la pasada, el 4 hace tres; el 5 fuera de las 8, el 6 (futuro) y el issue abierto no cuentan');
  assert.deepEqual([...compute(repo(), [], NOW).pace.closedWeeks], [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('tendencia de ramas nuevas: cada rama cuenta una vez, por semana, de la más vieja a la actual', () => {
  const cr = (id, days, branch) => ({ kind: 'branch-create', id, branch, time: ago(days) });
  const acts = [
    cr('a', 0.5, 'feature/a'),
    cr('b', 2, 'fix/b'),
    cr('c', 2.1, 'fix/b'), // la misma rama vista dos veces (feed de eventos y comparación en vivo)
    cr('d', 9, 'feature/d'),
    cr('e', 1, 'feature/d'), // borrada y creada otra vez: cuenta con su primera creación
    cr('f', 27, 'old/f'),
    cr('g', 60, 'way/g'), // fuera de las 8 semanas
    cr('h', -1, 'future/h'), // en el futuro: no cuenta
    { kind: 'branch-create', id: 'i', branch: 'no-time' }, // sin hora: no cuenta
    { kind: 'branch-delete', id: 'j', branch: 'feature/a', time: ago(0.2) },
    { kind: 'push', id: 'k', branch: 'feature/a', time: ago(0.3) },
    { kind: 'branch-create', id: 'l', time: ago(3) }, // sin nombre: cuenta por su id
  ];
  const h = compute(repo(), acts, NOW);
  assert.deepEqual([...h.pace.branchWeeks], [0, 0, 0, 0, 1, 0, 1, 3], 'esta semana feature/a, fix/b (una vez) y la sin nombre; la pasada feature/d (con su primera creación, hace 9 días); hace tres, old/f; way/g, future/h, la sin hora, el borrado y el push no cuentan');
  assert.deepEqual([...compute(repo(), [], NOW).pace.branchWeeks], [0, 0, 0, 0, 0, 0, 0, 0]);
});
