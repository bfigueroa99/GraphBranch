/* El puerto de las e2e web (e2e/serve.mjs): 4173, o el de GB_E2E_PORT cuando otra sesión de la misma máquina
   ya lo usa. Sin esto dos corridas de la puerta a la vez se pisan: Playwright reutiliza el servidor que
   encuentra en 4173 y la prueba de sin conexión no puede levantar el suyo en 4174. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2ePort } from '../e2e/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sin GB_E2E_PORT el puerto es 4173, y con él, el que diga', () => {
  assert.equal(e2ePort({}), 4173);
  assert.equal(e2ePort({ GB_E2E_PORT: '' }), 4173);
  assert.equal(e2ePort({ GB_E2E_PORT: '46010' }), 46010);
});

test('un GB_E2E_PORT que no es un puerto es un error, no un 4173 callado', () => {
  for (const v of ['abc', '80', '0', '-1', '4173.5', '65535', '70000']) {
    assert.throws(() => e2ePort({ GB_E2E_PORT: v }), /GB_E2E_PORT/, v);
  }
});

test('la configuración de Playwright y las e2e web toman el puerto de e2ePort, sin fijarlo', () => {
  for (const f of ['playwright.config.mjs', 'e2e/web.spec.mjs']) {
    const src = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(src, /e2ePort\(\)/, `${f} no llama a e2ePort()`);
    assert.doesNotMatch(src, /127\.0\.0\.1:\d{4}/, `${f} fija un puerto`);
    assert.doesNotMatch(src, /serve(\.mjs)? ?\(?\d{4}/, `${f} fija el puerto del servidor`);
  }
});
