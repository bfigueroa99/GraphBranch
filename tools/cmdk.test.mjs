#!/usr/bin/env node
/* Pruebas de js/cmdk.js (la paleta de comandos, Ctrl+K): el filtro, el atajo y que cada acción apunte a un botón y a un
   texto que existen.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/cmdk.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'cmdk.js'), 'utf8'), ctx, { filename: 'cmdk.js' });
const C = ctx.window.GB.cmdk;
const html = readFileSync(join(root, 'index.html'), 'utf8');
const locale = (code) => {
  let dict = null;
  vm.runInNewContext(readFileSync(join(root, 'js', 'locales', `${code}.js`), 'utf8'), { GB: { i18n: { define: (c, d) => (dict = d) } } });
  return dict;
};
const en = locale('en');
const ids = (list) => Array.from(list, (x) => x.id);

test('cada acción apunta a un botón de index.html y a un texto en inglés', () => {
  const seen = new Set();
  for (const a of C.ACTIONS) {
    assert.ok(!seen.has(a.id), `id repetido: ${a.id}`);
    seen.add(a.id);
    assert.match(a.btn, /^#[\w-]+$/);
    assert.ok(html.includes(`id="${a.btn.slice(1)}"`), `${a.id}: no hay ${a.btn} en index.html`);
    assert.ok(en[a.key], `${a.id}: falta la clave ${a.key}`);
  }
});

test('filter: sin consulta devuelve todo; con ella, solo lo que contiene todas las palabras', () => {
  const items = [{ id: 'a', label: 'Search commits' }, { id: 'b', label: 'Text view' }, { id: 'c', label: 'Camera director' }];
  assert.deepEqual(ids(C.filter(items, '')), ['a', 'b', 'c']);
  assert.deepEqual(ids(C.filter(items, '  ')), ['a', 'b', 'c']);
  assert.deepEqual(ids(C.filter(items, 'com')), ['a']);
  assert.deepEqual(ids(C.filter(items, 'view text')), ['b']);
  assert.deepEqual(ids(C.filter(items, 'zzz')), []);
});

test('filter: ignora acentos y mayúsculas, y pone primero lo que empieza por la consulta', () => {
  const items = [{ id: 'x', label: 'Modo cámara' }, { id: 'y', label: 'Cámara del director' }, { id: 'z', label: 'Escamara' }];
  assert.deepEqual(ids(C.filter(items, 'CAMARA')), ['y', 'x', 'z']);
});

test('isShortcut: Ctrl+K o ⌘K, sin Alt ni Mayús', () => {
  assert.ok(C.isShortcut({ ctrlKey: true, key: 'k' }));
  assert.ok(C.isShortcut({ metaKey: true, key: 'K' }));
  assert.ok(!C.isShortcut({ key: 'k' }));
  assert.ok(!C.isShortcut({ ctrlKey: true, key: 'j' }));
  assert.ok(!C.isShortcut({ ctrlKey: true, altKey: true, key: 'k' }));
  assert.ok(!C.isShortcut({ ctrlKey: true, shiftKey: true, key: 'k' }));
});

test('el atajo y el diálogo existen en la página y el service worker guarda el módulo', () => {
  assert.match(html, /<dialog[^>]*id="cmdk"/);
  assert.match(html, /<script src="js\/cmdk\.js">/);
  assert.match(readFileSync(join(root, 'sw.js'), 'utf8'), /'js\/cmdk\.js'/);
});
