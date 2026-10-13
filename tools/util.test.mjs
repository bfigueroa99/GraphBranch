import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** util.js en un contexto aislado cuyo localStorage guarda lo que se le diga (válido o corrupto). */
function load(saved) {
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    localStorage: { getItem: (k) => saved[k] ?? null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(root, 'js', 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  return ctx.GB.U;
}

test('U.store.get: un valor guardado de otro tipo que el esperado devuelve el valor por defecto', () => {
  const U = load({
    'graphbranch:pins:a/b': '{}',
    'graphbranch:filter:a/b': '{"a":1}',
    'graphbranch:depth': '"muchas"',
    'graphbranch:marks': '"si"',
    'graphbranch:ok': '["x"]',
  });
  assert.deepEqual([...U.store.get('pins:a/b', [])], []);
  assert.equal(U.store.get('filter:a/b', ''), '');
  assert.equal(U.store.get('depth', 40), 40);
  assert.equal(U.store.get('marks', true), true);
  assert.deepEqual([...U.store.get('ok', [])], ['x']);
  assert.equal(U.store.get('falta', 7), 7);
  assert.equal(U.store.get('owners', null) === null, true);
});
