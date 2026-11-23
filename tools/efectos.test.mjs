// Los efectos del 2D (js/graph.js): un efecto que nace en medio de un cuadro no dibuja antes de su comienzo
// (pendiente 3 de Mantenimiento, iteración 319). `requestDraw` toma `now` al empezar el cuadro y `drawFx(now)` corre
// los efectos aplazados (`later`) después de `draw(now)`: la onda que nace ahí toma su `t0` de `performance.now()`,
// posterior al `now` del cuadro, y con un cuadro lento su radio salía negativo y `arc` lanzaba una excepción.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Un contexto 2D que se queja como Chromium: radio negativo en `arc` o en un gradiente radial. */
function fakeCtx() {
  const log = { arcs: [], depth: 0, maxDepth: 0 };
  const neg = (r) => {
    if (r < 0) throw new RangeError(`Failed to execute 'arc' on 'CanvasRenderingContext2D': The radius provided (${r}) is negative.`);
  };
  const noop = () => {};
  return {
    log,
    arc: (x, y, r) => (neg(r), log.arcs.push(r)),
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => (neg(r0), neg(r1), { addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    save: () => (log.depth++, (log.maxDepth = Math.max(log.maxDepth, log.depth))),
    restore: () => log.depth--,
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, rect: noop, clip: noop,
    stroke: noop, fill: noop, setTransform: noop, clearRect: noop, measureText: () => ({ width: 0 }),
  };
}

/** js/graph.js en un contexto aislado, con lo mínimo que pide al cargarse. */
function loadGraph() {
  const GB = { U: {}, i18n: { t: (k) => k, html: (k) => k } };
  const ctx = vm.createContext({ window: { GB }, document: { createElement: () => ({ getContext: () => fakeCtx() }) }, performance, Math });
  vm.runInContext(readFileSync(new URL('../js/graph.js', import.meta.url), 'utf8'), ctx, { filename: 'graph.js' });
  return GB.Graph;
}
const Graph = loadGraph();

/** Una vista 2D a medias: solo lo que leen `drawFx`, `ripple` y `alarm`. */
function fakeGraph(c) {
  const g = Object.create(Graph.prototype);
  Object.assign(g, {
    fx: [], sparks: [], pending: [], fxCtx: c, fxCv: { width: 200, height: 120 }, fxLast: 0, fxPainted: false,
    dpr: 1, W: 200, H: 120, padLeft: 0, viewH: 120, dark: false,
    branchAt: () => ({ x: 50, y: 50 }),
  });
  return g;
}

test('la onda del 2D dibujada con el reloj de un cuadro anterior a su comienzo no tiene radio negativo', () => {
  for (const lag of [200, 120, 80, 20, 1000]) {
    const c = fakeCtx();
    const g = fakeGraph(c);
    g.ripple('main', '#ff0000', 1);
    assert.equal(g.fx.length, 1);
    assert.doesNotThrow(() => g.fx[0](performance.now() - lag, c), `con ${lag} ms de atraso`);
    assert.ok(c.log.arcs.length && c.log.arcs.every((r) => r >= 0), `con ${lag} ms: radios ${c.log.arcs}`);
    // todavía no empezó: se dibuja como en su primer instante, del tamaño de partida, y sigue viva
    assert.equal(c.log.arcs[0], 5);
    assert.equal(g.fx[0](performance.now() + 2000, c), false, 'termina a su hora');
  }
});

test('drawFx: la segunda onda de una alarma, aplazada y nacida en un cuadro lento, no corta el cuadro', () => {
  const c = fakeCtx();
  const g = fakeGraph(c);
  g.alarm('main', '#ff0000', false); // una onda ahora y otra con later(180)
  g.fx.length = 0; // solo la aplazada
  g.pending[0].at = -Infinity; // ya le tocó (performance.now() cuenta desde que arrancó el proceso)
  const now = performance.now() - 200; // el cuadro empezó hace 200 ms (un draw() largo con la máquina cargada)
  assert.doesNotThrow(() => g.drawFx(now));
  assert.equal(g.fx.length, 1, 'la onda sigue para el cuadro siguiente');
  assert.ok(c.log.arcs.every((r) => r >= 0), `radios ${c.log.arcs}`);
  assert.equal(c.log.depth, 0, 'save() y restore() a la par');
});

test('drawFx: un efecto que falla no deja puesto el recorte del cuadro', () => {
  const c = fakeCtx();
  const g = fakeGraph(c);
  g.fx.push(() => {
    throw new Error('efecto roto');
  });
  assert.throws(() => g.drawFx(performance.now()), /efecto roto/);
  assert.equal(c.log.depth, 0, 'restore() corrió aunque el efecto lanzó');
});
