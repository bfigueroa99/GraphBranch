#!/usr/bin/env node
/* La versión de Electron de la app de escritorio: fijada exacta, la misma en package.json y en package-lock.json, y
   nunca por debajo del piso de seguridad. El piso es la última estable contrastada en una auditoría de Seguridad
   (`npm view electron version` y sus notas en releases.electronjs.org): subir Electron es subir también el piso, y
   bajarlo (un conflicto de package-lock.json resuelto hacia el lado viejo, un `npm install` con otra versión) deja la
   app con fallos de Chromium que ya están arreglados.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/electron.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));

/* 45.3.2 (2026-11-12) trae Chromium 156.0.8078.100, el Extended Stable del 2026-11-11 con 72 arreglos de seguridad
   (4 críticos); la 45.2.3 iba con Chromium 156.0.8078.80. Iteración 299. */
const PISO = '45.3.2';

const partes = (v) => v.split('.').map(Number);
const menor = (a, b) => {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

test('Electron va fijado exacto y es el mismo en package.json y en package-lock.json', () => {
  const fijada = json('package.json').devDependencies.electron;
  assert.match(fijada, /^\d+\.\d+\.\d+$/, 'sin ^ ni ~: cada instalación tiene que traer el mismo Electron');
  const lock = json('package-lock.json');
  assert.equal(lock.packages[''].devDependencies.electron, fijada, 'la raíz de package-lock.json');
  assert.equal(lock.packages['node_modules/electron'].version, fijada, 'lo que instala npm ci');
  assert.equal(lock.packages['node_modules/electron'].resolved, `https://registry.npmjs.org/electron/-/electron-${fijada}.tgz`);
});

test(`Electron no baja del piso de seguridad (${PISO})`, () => {
  const fijada = json('package.json').devDependencies.electron;
  assert.ok(!menor(fijada, PISO), `package.json fija Electron ${fijada}, por debajo del piso ${PISO}`);
});

test('la comparación de versiones mira mayor, menor y parche como números', () => {
  assert.equal(menor('45.2.3', '45.3.2'), true);
  assert.equal(menor('45.10.0', '45.9.9'), false);
  assert.equal(menor('46.0.0', '45.99.99'), false);
  assert.equal(menor('45.3.2', '45.3.2'), false);
  assert.equal(menor('44.11.3', '45.0.0'), true);
});
