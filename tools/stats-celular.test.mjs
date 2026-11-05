// A ≤560 px la línea de detalle de las cifras (`.stat-sub`) se esconde para ahorrar alto, pero no se pierde:
// `display: none` la saca también del lector de pantalla y de cualquier tooltip (pendiente 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('a ≤560 px .stat-sub no usa display:none (queda para el lector de pantalla)', () => {
  const bloque = css.slice(css.indexOf('celular angosto: las cifras'));
  const m = bloque.match(/\.stat-sub \{([^}]*)\}/);
  assert.ok(m, 'no se encontró la regla de .stat-sub en el bloque de celular angosto');
  assert.doesNotMatch(m[1], /display:\s*none/);
  assert.match(m[1], /clip|position:\s*absolute/);
});

test('cada cifra lleva su detalle como title de la tarjeta', () => {
  assert.match(app, /function syncStatTitles/);
  assert.match(app, /syncStatTitles\(\)/);
});
