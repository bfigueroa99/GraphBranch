#!/usr/bin/env node
/* Pruebas del tramo de fechas del Replay (js/replay.js): qué commits entran entre «desde» y «hasta» y
   en qué instante de la línea de tiempo empieza y termina.

     node tools/replay.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: { U: {}, i18n: { t: () => '', msg: () => '' } } } });
vm.runInContext(readFileSync(join(root, 'js', 'replay.js'), 'utf8'), ctx, { filename: 'replay.js' });
const { rangeOf } = ctx.window.GB.Replay;

const DAY = 86400e3;
const dates = [0, 1, 2, 5, 6, 10].map((d) => d * DAY);
const pos = [1, 2, 3, 4, 5, 6];

test('sin límites abarca toda la historia', () => {
  assert.deepEqual({ ...rangeOf(dates, pos, null, null) }, { u0: 0, U: 6, first: 0, last: 5 });
});

test('desde y hasta recortan por fecha, inclusivas', () => {
  // del día 2 al 6: commits 2, 3 y 4; empieza donde acaba el commit anterior
  assert.deepEqual({ ...rangeOf(dates, pos, 2 * DAY, 6 * DAY) }, { u0: 2, U: 5, first: 2, last: 4 });
  // un día en que no hubo commits cae sobre el siguiente
  assert.equal(rangeOf(dates, pos, 3 * DAY, null).first, 3);
  assert.equal(rangeOf(dates, pos, null, 9 * DAY).last, 4);
});

test('sin commits en el tramo, o con las fechas al revés, no hay Replay', () => {
  assert.equal(rangeOf(dates, pos, 11 * DAY, null), null);
  assert.equal(rangeOf(dates, pos, 7 * DAY, 9 * DAY), null);
  assert.equal(rangeOf(dates, pos, 6 * DAY, 2 * DAY), null);
  assert.equal(rangeOf(dates, pos, null, -DAY), null);
});
