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

test('las aristas del 3D usan materiales Lambert: el programa PBR compilaba ~170 ms cada uno sin GPU', () => {
  const s = src('graph3d.js');
  assert.match(s, /this\.lineMat = new THREE\.MeshLambertMaterial\(/);
  assert.match(s, /this\.ghostMat = new THREE\.MeshLambertMaterial\(/);
  assert.match(s, /this\.nodeMat = new THREE\.MeshStandardMaterial\(/, 'los commits conservan el brillo de vidrio');
});

test('placeLabels no ordena las fechas del eje en cada cuadro: el orden se guarda y se invalida al sincronizarlas', () => {
  const s = src('graph3d.js');
  const cuerpo = s.slice(s.indexOf('placeLabels() {'), s.indexOf('placeNotes(hl) {'));
  assert.doesNotMatch(cuerpo, /\? \[\] : \[\.\.\.this\.days/, 'el sort de las fechas no corre por cuadro');
  assert.match(cuerpo, /\? \[\] : this\.daysByZ \|\| \(this\.daysByZ = /);
  assert.match(s, /this\.daysByZ = null; \/\/ el orden de las fechas/, 'se invalida cuando cambian las fechas');
});

test('placeLabels no deja basura por cuadro: project() reusa su punto y la grilla, las candidatas y los rectángulos van en pools', () => {
  const s = src('graph3d.js');
  const ini = s.indexOf('    project(v) {');
  const project = s.slice(ini, s.indexOf('\n    }\n', ini));
  assert.doesNotMatch(project, /return \{ x:/, 'project() no crea un objeto por llamada');
  assert.match(project, /this\.projOut \|\| \(this\.projOut = /);
  const cuerpo = s.slice(s.indexOf('placeLabels() {'), s.indexOf('makeNote() {'));
  assert.doesNotMatch(cuerpo, /new Map\(\)/, 'la grilla no se crea en cada cuadro');
  assert.doesNotMatch(cuerpo, /const (cells|hits) = /, 'sin cierres nuevos por cuadro');
  assert.doesNotMatch(cuerpo, /cand\.push\(\{/, 'las candidatas salen del pool');
  assert.doesNotMatch(cuerpo, /const [rs] = \{ /, 'los rectángulos de fechas y notas salen del pool');
  assert.match(cuerpo, /this\.gridReset\(\)/);
  // indicio, no garantía: el contrato de no retener el punto lo dice el JSDoc de project() y se revisó a mano
  for (const f of ['graph3d.js', 'galaxy.js']) assert.doesNotMatch(src(f), /\.push\(\s*(p|q)\s*\)/, `${f}: nadie apila el punto compartido de project()`);
});
