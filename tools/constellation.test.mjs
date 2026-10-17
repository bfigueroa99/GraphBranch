#!/usr/bin/env node
/* Pruebas de js/constellation.js: la disposición de la constelación de repos, con datos fijos.

     node --test                          todas las pruebas (archivos *.test.mjs)
     node tools/constellation.test.mjs    solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'constellation.js'), 'utf8'), ctx, { filename: 'constellation.js' });
const C = ctx.window.GB.constellation;
const place = (items) => JSON.parse(JSON.stringify(C.place(items)));

const repos = (n) => Array.from({ length: n }, (_, i) => ({ key: `o/r${i}`, commits: (i * 37) % 400 }));

test('sin repos no hay galaxias; con uno, está al centro', () => {
  assert.deepEqual(place([]), []);
  const [g] = place([{ key: 'o/a', commits: 5 }]);
  assert.equal(g.key, 'o/a');
  assert.ok(Math.abs(g.x - 50) < 1e-9 && Math.abs(g.y - 50) < 1e-9);
});

test('10 repos: en el orden dado, dentro del cuadro y sin tocarse', () => {
  const items = repos(10);
  const spots = place(items);
  assert.deepEqual(spots.map((s) => s.key), items.map((i) => i.key));
  for (const s of spots) {
    assert.ok(s.r > 0 && s.x - s.r >= 0 && s.x + s.r <= 100 && s.y - s.r >= 0 && s.y + s.r <= 100, JSON.stringify(s));
  }
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++)
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= spots[i].r + spots[j].r, `${i} toca a ${j}`);
});

test('más commits, galaxia más grande, y la mayor queda al centro', () => {
  const spots = place([{ key: 'chico', commits: 3 }, { key: 'grande', commits: 900 }, { key: 'medio', commits: 80 }]);
  const by = Object.fromEntries(spots.map((s) => [s.key, s]));
  assert.ok(by.grande.r > by.medio.r && by.medio.r > by.chico.r);
  assert.ok(Math.abs(by.grande.x - by.chico.x) + Math.abs(by.grande.y - by.chico.y) > 0);
  const dist = (s) => Math.hypot(s.x - 50, s.y - 50);
  assert.ok(dist(by.grande) <= dist(by.medio) && dist(by.grande) <= dist(by.chico));
});

test('la disposición es estable: lo mismo da lo mismo', () => {
  assert.deepEqual(place(repos(10)), place(repos(10)));
});

test('radio y tono: repos sin commits cargados no rompen, el tono es estable', () => {
  assert.equal(C.radiusOf(0, 0), 1);
  assert.equal(C.radiusOf(undefined, 10), 1);
  assert.ok(C.radiusOf(10, 10) > C.radiusOf(1, 10));
  assert.equal(C.hueOf('o/a'), C.hueOf('o/a'));
  assert.ok(C.hueOf('o/a') >= 0 && C.hueOf('o/a') < 360);
  assert.equal(place([{ key: 'a' }, { key: 'b' }]).length, 2);
});
