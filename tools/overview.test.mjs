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
