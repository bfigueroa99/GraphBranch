#!/usr/bin/env node
/* Pruebas de PRs apilados en js/layout.js: la rama de un PR cuya base es la rama de otro PR queda
   justo debajo de esa rama, en el orden de la pila.

     node tools/layout.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({
  window: { GB: {} },
  navigator: { onLine: true },
  document: { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
for (const f of ['util.js', 'palette.js', 'search.js', 'layout.js']) vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), ctx, { filename: f });
const { Layout } = ctx.window.GB;

const T0 = Date.UTC(2026, 0, 1);
function repo(prs) {
  const commits = new Map();
  const add = (sha, parents, h) => commits.set(sha, { sha, parents, message: sha, date: T0 + h * 36e5, author: { name: 'a', login: 'a' } });
  add('m1', [], 0);
  const names = ['a', 'b', 'c', 'z'];
  names.forEach((n, i) => add('s' + n, ['m1'], 10 + i)); // z es el más nuevo, a el más viejo
  const branches = new Map([['main', { name: 'main', sha: 'm1', protected: true }]]);
  for (const n of names) branches.set('feat/' + n, { name: 'feat/' + n, sha: 's' + n });
  const pulls = new Map(prs.map(([n, head, base]) => [n, { number: n, head: 'feat/' + head, base: base === 'main' ? 'main' : 'feat/' + base, sameRepo: true }]));
  return { commits, branches, pulls, repo: { defaultBranch: 'main' } };
}
const order = (L) => [...L.rows.filter((r) => !r.ghost).sort((x, y) => x.row - y.row).map((r) => r.name)];

test('sin PRs apilados el orden es por actividad', () => {
  const L = new Layout().compute(repo([[1, 'a', 'main'], [2, 'b', 'main']]));
  assert.equal(L.stacks.size, 0);
  assert.deepEqual(order(L).slice(1), ['feat/z', 'feat/c', 'feat/b', 'feat/a']);
});

test('una pila de tres PRs queda contigua y en orden', () => {
  // c sobre b sobre a; a va a main; z suelta y más nueva
  const L = new Layout().compute(repo([[1, 'a', 'main'], [2, 'b', 'a'], [3, 'c', 'b']]));
  assert.deepEqual(JSON.parse(JSON.stringify([...L.stacks])), [
    ['feat/b', { parent: 'feat/a', depth: 1, num: 2, parentNum: 1 }],
    ['feat/c', { parent: 'feat/b', depth: 2, num: 3, parentNum: 2 }],
  ]);
  assert.deepEqual(order(L).slice(1), ['feat/z', 'feat/a', 'feat/b', 'feat/c']);
});

test('un ciclo de bases o un PR cruzado no apila ni se cuelga', () => {
  const L = new Layout().compute(repo([[1, 'a', 'b'], [2, 'b', 'a']]));
  assert.equal(L.stacks.size, 0);
  assert.equal(order(L).length, 5);
});

test('un PR hacia una rama sin PR propio no es una pila', () => {
  const L = new Layout().compute(repo([[2, 'b', 'a']]));
  assert.equal(L.stacks.size, 0);
});

test('la etiqueta de las ramas fusionadas de la leyenda sale del idioma, no del código', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const graph = readFileSync(join(root, 'js/graph.js'), 'utf8');
  assert.match(graph, /r\.ghost \? tr\('legend\.merged'\)/);
  assert.doesNotMatch(readFileSync(join(root, 'js/layout.js'), 'utf8'), /['"`]fusionadas['"`]/);
  for (const f of readdirSync(join(root, 'js/locales')).filter((n) => n.endsWith('.js')))
    assert.match(readFileSync(join(root, 'js/locales', f), 'utf8'), /'legend\.merged':/, f);
});

test('el layout del primer padre (el que dibujan el 2D y el 3D) deja menos nodos y sin aristas de merge', () => {
  const T = Date.UTC(2026, 0, 1);
  const c = (sha, parents, h) => [sha, { sha, parents, message: sha, date: T + h * 36e5, author: { name: 'a', login: 'a' } }];
  const data = {
    commits: new Map([c('r', [], 0), c('m1', ['r'], 1), c('f1', ['r'], 2), c('f2', ['f1'], 3), c('mm', ['m1', 'f2'], 4)]),
    branches: new Map([['main', { name: 'main', sha: 'mm', protected: true }]]),
    pulls: new Map(),
    repo: { defaultBranch: 'main' },
  };
  const all = new Layout().compute(data);
  const fp = new Layout().compute(ctx.window.GB.search.firstParent(data));
  assert.equal(all.nodes.length, 5);
  assert.deepEqual([...fp.nodes.map((n) => n.sha)].sort(), ['m1', 'mm', 'r']);
  assert.ok(fp.nodes.length < all.nodes.length);
  assert.ok(fp.edges.every((e) => e.kind !== 'merge' && (e.from === null || fp.nodeOf.has(e.from))));
  assert.ok(all.edges.some((e) => e.kind === 'merge'));
  assert.equal(data.commits.size, 5); // no muta lo cargado
});
