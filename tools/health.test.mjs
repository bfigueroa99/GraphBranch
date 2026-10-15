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
const { compute, clashes, clashCandidates, compare, splitFiles } = ctx.window.GB.health;

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
  assert.deepEqual({ ...compute(repo(), acts, NOW).pace }, { merges7: 1, merges30: 2, releases30: 1 });
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
  assert.deepEqual({ ...compute(repo(), [], NOW).dora }, { deploys30: 0, gap: null, lead: null });
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
