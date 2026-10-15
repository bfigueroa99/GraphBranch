// Trabajo por cuadro: nada que fuerce maquetación o cree formateadores en el camino caliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');

test('placeTip no lee offsetWidth/offsetHeight en cada cuadro (2D y 3D)', () => {
  for (const f of ['graph.js', 'graph3d.js']) {
    const s = src(f);
    const cuerpo = s.slice(s.indexOf('placeTip() {'), s.indexOf('hideTip() {'));
    assert.match(cuerpo, /tipBox/, `${f}: placeTip usa el tamaño en caché`);
    const lecturas = cuerpo.match(/offset(Width|Height)/g) || [];
    assert.equal(lecturas.length, 2, `${f}: solo se mide al llenar la caché`);
    assert.match(cuerpo, /if \(!this\.tipBox \|\| this\.tipBox\.W !== this\.W\)/, `${f}: la caché se invalida con el ancho`);
  }
});

test('Replay reutiliza el formateador de fecha de i18n en vez de crear uno por cuadro', () => {
  const s = src('replay.js');
  const cuerpo = s.slice(s.indexOf('renderClock() {'), s.indexOf('renderClock() {') + 700);
  assert.doesNotMatch(cuerpo, /new Intl\./);
  assert.match(cuerpo, /i18n\.fmtDayLong/);
  assert.match(src('i18n.js'), /fmtDayLong,/);
});
