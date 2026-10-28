#!/usr/bin/env node
/* Pruebas de js/overview.js (la vista conjunta: todos los repos a la vez), con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/overview.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), ctx, { filename: 'overview.js' });
const O = ctx.window.GB.overview;
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Un repo cargado: sus commits (con fecha), sus ramas y sus PRs abiertos. */
function data({ commits = [], branches = ['main'], pulls = 0, totalPulls = 0 } = {}) {
  return {
    commits: new Map(commits.map(([sha, date]) => [sha, { sha, date, message: `mensaje de ${sha}`, parents: [] }])),
    branches: new Map(branches.map((b) => [b, { name: b }])),
    pulls: new Map(Array.from({ length: pulls }, (_, i) => [i, { number: i }])),
    totalPulls,
  };
}

test('allParam: ?all=1 la abre, ?all=0 la apaga y sin decirlo no manda', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(O.allParam(q('all=1')), true);
  assert.equal(O.allParam(q('all')), true, '?all a secas también');
  assert.equal(O.allParam(q('all=0')), false);
  assert.equal(O.allParam(q('all=off')), false);
  assert.equal(O.allParam(q('repo=a/b')), null);
});

test('lastCommit: el más nuevo de lo cargado; sin commits, ninguno', () => {
  assert.equal(O.lastCommit(data({ commits: [['a', 1], ['c', 3], ['b', 2]] })).sha, 'c');
  assert.equal(O.lastCommit(data({ commits: [['a', 5], ['b', 5]] })).sha, 'a', 'a igual fecha, el primero que llegó');
  assert.equal(O.lastCommit(data()), null);
});

test('summary: ramas, commits del grafo (o los cargados), PRs abiertos y el último commit', () => {
  const d = data({ commits: [['a', 1], ['b', 7]], branches: ['main', 'dev', 'x'], pulls: 2, totalPulls: 5 });
  const s = plain(O.summary(d, { nodes: [{}, {}, {}] }));
  assert.equal(s.branches, 3);
  assert.equal(s.commits, 3, 'los del grafo, si hay layout');
  assert.equal(s.prs, 5, 'el total que dio el servicio, si es mayor que los cargados');
  assert.equal(s.last.sha, 'b');
  assert.equal(s.lastAt, 7);
  assert.equal(O.summary(d, null).commits, 2, 'sin layout, los cargados');
  assert.equal(O.summary(data(), null).lastAt, 0);
});

test('totals: repos, ramas y PRs abiertos de todas las tarjetas', () => {
  assert.deepEqual(plain(O.totals([{ branches: 3, prs: 1 }, { branches: 2, prs: 0 }, { branches: 1, prs: 4 }])), { repos: 3, branches: 6, prs: 5 });
  assert.deepEqual(plain(O.totals([])), { repos: 0, branches: 0, prs: 0 });
});

test('prGroup: borrador, checks en rojo, aprobado o esperando revisión, en ese orden de prioridad', () => {
  assert.equal(O.prGroup({ draft: true, ci: 'failure', review: 'approved' }), 'draft', 'un borrador lo es aunque falle');
  assert.equal(O.prGroup({ ci: 'failure', review: 'approved' }), 'failing', 'en rojo antes que aprobado');
  assert.equal(O.prGroup({ ci: 'success', review: 'approved' }), 'approved');
  assert.equal(O.prGroup({ ci: 'pending' }), 'waiting');
  assert.equal(O.prGroup({}), 'waiting');
});

test('groupPulls: los PRs de todos los repos por estado, del más nuevo al más viejo, sin grupos vacíos', () => {
  const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, head: `rama-${number}`, user: { login: 'ana' }, createdAt: number * 10, ...extra });
  const g = plain(O.groupPulls([
    { key: 'a', name: 'o/a', pulls: new Map([[1, pr(1)], [2, pr(2, { draft: true })], [3, pr(3, { ci: 'failure' })]]).values() },
    { key: 'b', name: 'o/b', pulls: [pr(4, { review: 'approved' }), pr(5), pr(6, { draft: true })] },
    { key: 'c', name: 'o/c', pulls: [] },
  ]));
  assert.deepEqual(g.map((x) => x.id), ['draft', 'failing', 'approved', 'waiting']);
  assert.deepEqual(g[0].items.map((i) => [i.repo, i.number]), [['o/b', 6], ['o/a', 2]], 'el más nuevo primero, con su repo');
  assert.deepEqual(g[3].items.map((i) => i.number), [5, 1]);
  assert.equal(g[0].items[0].key, 'b');
  assert.equal(g[0].items[0].head, 'rama-6');
  assert.equal(g[0].items[0].user, 'ana');
  assert.deepEqual(plain(O.groupPulls([{ key: 'a', name: 'o/a', pulls: [pr(1)] }])).map((x) => x.id), ['waiting'], 'solo los grupos con PRs');
  assert.deepEqual(plain(O.groupPulls([])), []);
});
