// Un botón que cambia su nombre accesible no lleva además `aria-pressed`: el lector anunciaría
// «Pausa, pulsado» y «Reanudar, pulsado» a la vez. El estado va en el nombre y en un data-*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('el play del Replay cambia de nombre y no usa aria-pressed', () => {
  assert.doesNotMatch(leer('js/replay.js'), /el\.play\.setAttribute\('aria-pressed'/);
  assert.doesNotMatch(leer('index.html'), /class="icon-btn rp-play" aria-pressed/);
});

test('la ficha de rama: Fijar/Soltar no usa aria-pressed', () => {
  const g = leer('js/graph.js');
  assert.doesNotMatch(g, /class="tip-pin"[^`]*aria-pressed/);
  assert.doesNotMatch(g, /b\.setAttribute\('aria-pressed'/);
  assert.doesNotMatch(leer('css/styles.css'), /\.tip-pin\[aria-pressed/);
});

test('el botón de seguir en vivo cambia de texto y no usa aria-pressed', () => {
  assert.doesNotMatch(leer('js/app.js'), /followBtn\.setAttribute\('aria-pressed'/);
  assert.doesNotMatch(leer('index.html'), /id="follow-btn" aria-pressed/);
  assert.doesNotMatch(leer('css/styles.css'), /\.btn-follow\[aria-pressed/);
});
