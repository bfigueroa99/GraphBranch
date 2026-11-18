#!/usr/bin/env node
/* Pruebas de js/allspace.js (la vista conjunta en 3D: cada repo, una torre de la misma escena), con datos fijos: dónde
   va cada torre, cómo se arma una torre con el layout de un repo y el parámetro ?all=3d. La escena (Three.js) la prueba
   el smoke.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/allspace.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'allspace.js'), 'utf8'), ctx, { filename: 'allspace.js' });
const { viewParam, place, lane, tower, MAX_NODES, HEIGHT, RADIUS } = ctx.window.GB.allspace;
const q = (s) => new URLSearchParams(s);
const plain = (x) => JSON.parse(JSON.stringify(x)); // los arreglos del contexto de la prueba son de otro reino

test('viewParam: ?all=3d abre la vista conjunta en 3D; 2d, cards o tarjetas, con las tarjetas', () => {
  assert.equal(viewParam(q('all=3d')), '3d');
  assert.equal(viewParam(q('all=3D')), '3d');
  assert.equal(viewParam(q('all=2d')), '2d');
  assert.equal(viewParam(q('all=cards')), '2d');
  assert.equal(viewParam(q('all=tarjetas')), '2d');
  assert.equal(viewParam(q('all=1')), null, '?all=1 no dice cuál: manda lo recordado');
  assert.equal(viewParam(q('repo=a/b')), null);
  assert.equal(viewParam(null), null);
});

test('place: una torre al centro, pocas en un anillo y muchas en espiral, nunca pisándose', () => {
  assert.deepEqual(plain(place(0)), []);
  assert.deepEqual(plain(place(1)), [[0, 0]]);
  const near = (p) => {
    let m = Infinity;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) m = Math.min(m, Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]));
    return m;
  };
  for (const n of [2, 3, 5, 8, 9, 16, 20, 40]) {
    const p = place(n);
    assert.equal(p.length, n);
    assert.ok(p.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)));
    // entre dos torres vecinas cabe el ancho de las dos espirales con aire
    assert.ok(near(p) > 2 * RADIUS + 8, `${n} torres: las más cercanas a ${near(p)}`);
  }
  // hasta 8, todas a la misma distancia del centro (un anillo)
  const ring = place(6).map(([x, z]) => Math.round(Math.hypot(x, z)));
  assert.equal(new Set(ring).size, 1);
});

test('lane: la rama por defecto en el tronco y las demás alrededor, cada vez más afuera', () => {
  assert.deepEqual([...lane(0)], [0, 0]);
  const r = [1, 4, 16, 64].map((row) => Math.hypot(...lane(row)));
  assert.ok(r.every((x, i) => !i || x > r[i - 1]));
});

/** Un layout como el de GB.Layout: `rows` carriles; en cada uno, `per` commits seguidos (x de 0 en adelante). */
function layout(rows, per) {
  const nodes = [];
  const edges = [];
  const heads = [];
  let x = 0;
  for (let row = 0; row < rows; row++) {
    let prev = null;
    for (let i = 0; i < per; i++) {
      const sha = `r${row}c${i}`;
      nodes.push({ sha, x: x++, row, color: 'c' + ((row % 8) + 1) });
      if (prev) edges.push({ id: `${prev}>${sha}`, kind: 'line', from: prev, to: sha, color: 'c1' });
      prev = sha;
    }
    heads.push({ name: `b${row}`, sha: prev });
  }
  edges.push({ id: 'r0c0<', kind: 'stub', from: null, to: 'r0c0', color: 'c1' });
  return { nodes, edges, heads, rows: Array.from({ length: rows }, (_, row) => ({ row })) };
}

test('tower: el tronco en el centro, lo más nuevo arriba, la punta de cada rama marcada y las aristas entre lo que se ve', () => {
  const t = tower(layout(3, 4));
  assert.equal(t.nodes.length, 12);
  const trunk = t.nodes.filter((n) => n.sha.startsWith('r0'));
  assert.ok(trunk.every((n) => n.x === 0 && n.z === 0), 'la rama por defecto sube por el centro');
  const top = Math.max(...t.nodes.map((n) => n.y));
  assert.equal(t.top, top);
  assert.equal(t.nodes.find((n) => n.y === top).sha, 'r2c3', 'el commit más nuevo, arriba');
  assert.deepEqual(t.nodes.filter((n) => n.head).map((n) => n.sha).sort(), ['r0c3', 'r1c3', 'r2c3']);
  assert.equal(t.edges.length, 9, 'las aristas entre commits (no la de un padre que no está)');
  assert.ok(t.edges.every((e) => e.a.length === 3 && e.b.length === 3 && e.b[1] > e.a[1]));
  assert.ok(t.radius > 0 && t.radius <= RADIUS);
  // sin commits, una torre vacía
  const none = tower({ nodes: [], edges: [], heads: [], rows: [] });
  assert.equal(none.nodes.length + none.edges.length, 0);
  assert.equal(tower(null).nodes.length, 0);
});

test('tower: un repo enorme se aprieta (alto y ancho con tope) y muestra solo sus commits más nuevos', () => {
  const big = layout(2000, 3); // 6000 commits en 2000 ramas
  const t = tower(big);
  assert.equal(t.nodes.length, MAX_NODES);
  const minX = Math.min(...t.nodes.map((n) => Number(/c(\d+)$/.exec(n.sha)[1]) + 3 * Number(/^r(\d+)/.exec(n.sha)[1])));
  assert.equal(minX, 6000 - MAX_NODES, 'los más nuevos');
  assert.ok(t.top <= HEIGHT + 1, `alto ${t.top}`);
  assert.ok(t.radius <= RADIUS + 1e-6, `ancho ${t.radius}`);
  assert.ok(t.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)));
  const kept = new Set(t.nodes.map((n) => n.sha));
  assert.equal(t.edges.length, big.edges.filter((e) => kept.has(e.from) && kept.has(e.to)).length);
  // con un tope propio
  assert.equal(tower(big, { max: 10 }).nodes.length, 10);
});
