#!/usr/bin/env node
/* Pruebas de la demo (js/sources/demo.js): su historia inventada aguanta mucho tiempo de actividad.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/demo.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');

/** Una demo en un contexto aislado, con su azar fijo y sus `later` en una cola que la prueba corre a mano. */
function demo(seed) {
  const ctx = vm.createContext({ setTimeout, clearTimeout, TextEncoder, TextDecoder, console, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  ctx.window = ctx;
  for (const f of ['util.js', 'diff.js']) vm.runInContext(code(f), ctx, { filename: f });
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), t: (k) => k, text: String, fmtNum: String };`, ctx);
  for (const f of ['sources/demo-content.js', 'sources/demo.js']) vm.runInContext(code(f), ctx, { filename: f });
  const src = new ctx.GB.DemoSource();
  let t = seed >>> 0;
  src.rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const queue = [];
  src.later = (ms, fn) => queue.push(fn);
  src.seed();
  src.running = true;
  return { src, flush: () => queue.splice(0).forEach((fn) => fn()) };
}

test('mucha actividad seguida no rompe la demo: un PR apilado sobre una rama fusionada y borrada pasa a la base de esa', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    const { src, flush } = demo(seed);
    for (let i = 0; i < 1500; i++) {
      src.publish(src.actions() || []);
      flush();
      for (const pr of src.data.pulls.values()) assert.ok(src.data.branches.has(pr.base), `semilla ${seed}, paso ${i}: el PR #${pr.number} apunta a ${pr.base}, que ya no existe`);
    }
  }
});

test('commitsByPath: el historial de un archivo del diff de la demo incluye al commit que lo cambió', async () => {
  const { src } = demo(7);
  let probados = 0;
  for (const c of src.data.commits.values()) {
    const scope = /^\w+\((\w+)\)!?:/.exec(c.message || '')?.[1];
    if (!scope || scope === 'deps') continue;
    const { files } = await src.commitDiff(c.sha);
    const file = files.find((f) => f.path.includes(`/${scope}/`) || f.path.includes(`/${scope}.`));
    if (!file) continue;
    assert.ok((await src.commitsByPath(file.path)).has(c.sha), `el historial de ${file.path} no trae a ${c.message}`);
    if (++probados >= 5) break;
  }
  assert.ok(probados, 'la demo no tiene un commit con ámbito del que sacar un archivo');
});
