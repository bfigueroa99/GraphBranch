#!/usr/bin/env node
/* Pruebas de tools/audit.mjs sin navegador: la clave estable de un hallazgo, cómo se agrupan, qué
   compara la puerta contra la base (nuevos, resueltos y la cuota con su margen), las medidas y sus
   presupuestos, las clases de estado que no cuentan para la firma y la base del repo. Que la auditoría
   encuentra lo que dice se prueba en el navegador, inyectando cada violación (bitácora del cambio de
   maquinaria del 2026-10-13).

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/audit.test.mjs    solo estas */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, CARGA_MAX, MARGEN_CUOTA, PRESUPUESTO, TIPOS, agrupar, clasesDeEstado, clave, comparar, conocido, compararMedidas, escenarios, guardarInforme, instrumentar, leerBase, presupuestos } from './audit.mjs';
import { PRIORIDADES, SUBTIPOS } from './loop.mjs';

const h = (tipo, escenario = 'escritorio-3d', donde = '#x', extra = {}) => ({ tipo, escenario, donde, ...extra });

describe('tools/audit.mjs', () => {
  test('cada tipo tiene una prioridad y un subtipo de mantenimiento válidos', () => {
    for (const [tipo, t] of Object.entries(TIPOS)) {
      assert.ok(PRIORIDADES.includes(t.prioridad), `${tipo}: ${t.prioridad}`);
      assert.ok(SUBTIPOS.includes(t.subtipo), `${tipo}: ${t.subtipo}`);
      assert.equal(typeof t.puerta, 'boolean', tipo);
      assert.ok(t.que, tipo);
    }
  });

  test('la clave no lleva cifras ni detalle: el mismo problema con otra medida es el mismo hallazgo', () => {
    assert.equal(clave(h('objetivo-chico', 'celular-es', '#branch-filter', { detalle: '296×19 px' })), 'objetivo-chico|celular-es|#branch-filter');
    assert.equal(clave(h('objetivo-chico', 'celular-es', '#branch-filter', { detalle: '140×19 px' })), 'objetivo-chico|celular-es|#branch-filter');
  });

  test('agrupar suma las repeticiones y pone la prioridad y el subtipo de su tipo', () => {
    const g = agrupar([h('sin-nombre'), h('sin-nombre'), h('error', 'replay', 'consola', { n: 3 })]);
    assert.equal(g.length, 2);
    assert.deepEqual(
      g.map((x) => [x.tipo, x.n, x.prioridad, x.subtipo]),
      [
        ['sin-nombre', 2, 'Media', 'Accesibilidad'],
        ['error', 3, 'Alta', 'Errores'],
      ],
    );
  });

  test('la puerta: solo los tipos estables que no están en la base son nuevos; los de la base que faltan, resueltos', () => {
    const base = { hallazgos: ['objetivo-chico|celular-es|#a', 'objetivo-chico|celular-es|#b'], cuota: { consultas: 5 } };
    const vistos = agrupar([h('objetivo-chico', 'celular-es', '#a'), h('sin-nombre', 'replay', '#c'), h('borde', 'modo-tv', '#d')]);
    const { nuevos, resueltos } = comparar(vistos, base, { consultas: 5 });
    assert.deepEqual(nuevos.map(clave), ['sin-nombre|replay|#c']); // «borde» no entra en la puerta
    assert.deepEqual(resueltos, ['objetivo-chico|celular-es|#b']);
  });

  test('--langs: un control conocido en un idioma de celular es conocido en los demás, pero no en otro escenario', () => {
    const base = { hallazgos: ['objetivo-chico|celular-es|#a', 'objetivo-chico|celular-320|#b'] };
    assert.equal(conocido(h('objetivo-chico', 'celular-ta', '#a'), base), true);
    assert.equal(conocido(h('objetivo-chico', 'celular-ta', '#b'), base), false); // celular-320 es otro escenario
    assert.equal(conocido(h('objetivo-chico', 'celular-ta', '#z'), base), false);
    assert.equal(conocido(h('objetivo-chico', 'replay', '#a'), base), false);
    assert.equal(conocido(h('sin-nombre', 'celular-ta', '#a'), base), false);
  });

  test(`la cuota: más consultas que la base y su margen (${MARGEN_CUOTA}) es un hallazgo nuevo`, () => {
    const base = { hallazgos: [], cuota: { consultas: 5 } };
    assert.equal(comparar([], base, { consultas: 5 + MARGEN_CUOTA }).nuevos.length, 0);
    const { nuevos } = comparar([], base, { consultas: 6 + MARGEN_CUOTA, consultasPor: '/commits 4' });
    assert.equal(nuevos.length, 1);
    assert.equal(nuevos[0].tipo, 'cuota');
    assert.match(nuevos[0].detalle, /^8 consultas y la base dice 5 \(\+2\): \/commits 4$/);
    // sin base de cuota no se compara
    assert.equal(comparar([], { hallazgos: [] }, { consultas: 99 }).nuevos.length, 0);
  });

  test('las medidas: la diferencia sale en porcentaje y positiva cuando empeora (los cuadros por segundo, al bajar)', () => {
    const d = compararMedidas({ cargaMs: 2000, fps3d: 4, nodosDOM: 1000 }, { cargaMs: 3000, fps3d: 2, nodosDOM: 900 });
    assert.deepEqual(
      d.map((x) => [x.medida, x.peor]),
      [
        ['cargaMs', 50],
        ['nodosDOM', -10],
        ['fps3d', 50],
      ],
    );
  });

  test('los presupuestos: una medida fuera es un hallazgo de rendimiento; dentro, nada; con el equipo cargado, no se juzga', () => {
    assert.deepEqual(presupuestos({ cargaMs: PRESUPUESTO.cargaMs, fps3d: PRESUPUESTO.fps3d }), []);
    assert.deepEqual(presupuestos({ cargaMs: PRESUPUESTO.cargaMs * 2, cargaEquipo: CARGA_MAX + 0.1 }), []);
    assert.equal(presupuestos({ cargaMs: PRESUPUESTO.cargaMs * 2, cargaEquipo: CARGA_MAX }).length, 1);
    const fuera = presupuestos({ cargaMs: PRESUPUESTO.cargaMs + 1, fps2d: PRESUPUESTO.fps2d - 1 });
    assert.deepEqual(
      fuera.map((x) => [x.tipo, x.escenario, x.donde]),
      [
        ['rendimiento', 'escritorio-3d', 'cargaMs'],
        ['rendimiento', 'escritorio-2d', 'fps2d'],
      ],
    );
  });

  test('las clases de estado salen del código: las que js/ pone y saca con classList', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'js', 'a.js'), "el.classList.toggle('on', x); b.classList.add('pinned'); c.classList.remove('show'); d.classList.toggle(nombre);");
    assert.deepEqual(clasesDeEstado(join(dir, 'js')), ['on', 'pinned', 'show']);
    rmSync(dir, { recursive: true, force: true });
    assert.ok(clasesDeEstado().includes('on'));
  });

  test('los escenarios tienen nombres únicos; la puerta no depende de --langs ni de la completa', () => {
    const puerta = escenarios().map((e) => e.nombre);
    assert.equal(new Set(puerta).size, puerta.length);
    const todos = escenarios({ completa: true, langs: true });
    assert.equal(new Set(todos.map((e) => e.nombre)).size, todos.length);
    assert.deepEqual(todos.filter((e) => e.puerta).map((e) => e.nombre), puerta);
    assert.ok(todos.length >= puerta.length + 2 + 36, `${todos.length}`);
  });

  test('la completa mira el 3D de celular a 320 px: etiquetas de rama nítidas que se pisan (pendiente 16)', () => {
    const e = escenarios({ completa: true }).find((x) => x.nombre === 'celular-320-3d');
    assert.ok(e && !e.puerta && e.contexto.viewport.width === 320);
    assert.equal(TIPOS['etiquetas-pisadas'].subtipo, 'Errores');
    assert.ok(!escenarios().some((x) => x.nombre === 'celular-320-3d'));
  });

  test('la puerta abre la práctica de git a 320 px en es, ar, de y ta (pendiente 5, iteración 267)', () => {
    const es = escenarios().filter((x) => x.nombre.startsWith('practica-320-'));
    assert.deepEqual(es.map((x) => x.nombre), ['practica-320-es', 'practica-320-ar', 'practica-320-de', 'practica-320-ta']);
    for (const e of es) {
      assert.ok(e.puerta && e.contexto.viewport.width === 320 && /[?&]practice=\d+/.test(e.url), e.nombre);
      assert.equal(!!e.rtl, e.nombre === 'practica-320-ar');
    }
  });

  test('la completa mira 1.000 ramas en 3D a 320 px con la API simulada (pendiente 15)', () => {
    const e = escenarios({ completa: true }).find((x) => x.nombre === 'celular-320-3d-mil');
    assert.ok(e && !e.puerta && e.contexto.viewport.width === 320 && e.github === 1000);
    assert.ok(!escenarios().some((x) => x.nombre === 'celular-320-3d-mil'));
  });

  test('el JavaScript por cuadro del 3D con 1.000 ramas se mide en tandas y --comparar lo vigila (pendiente 12, iteración 263)', () => {
    // el escenario de 1.000 ramas guarda las dos medidas; una llamada sola daba 1,1 ms por la resolución del reloj
    const e = escenarios({ completa: true }).find((x) => x.nombre === 'celular-320-3d-mil');
    assert.match(e.mirar.toString(), /medirEscena/);
    assert.match(e.mirar.toString(), /escena3dUs/);
    assert.match(e.mirar.toString(), /etiquetas3dUs/);
    const src = readFileSync(new URL('./audit.mjs', import.meta.url), 'utf8');
    const ini = src.indexOf('function medirEscena()');
    const cuerpo = src.slice(ini, src.indexOf('\n}\n', ini));
    assert.match(cuerpo, /for \(let i = 0; i < 300; i\+\+\) f\(\)/, 'una tanda de 300 llamadas, no una sola');
    assert.match(cuerpo, /g\.dirtyNodes = g\.dirtyEdges = true/, 'la escena sucia: el camino caro de stepScene');
    assert.match(cuerpo, /P\.stepScene = orig/, 'la envoltura se quita al primer cuadro');
    assert.match(cuerpo, /catch \{\s*ok\(null\)/, 'una excepción en la medida no cuelga la auditoría');
    assert.match(e.mirar.toString(), /donde: 'medirEscena'/, 'sin medida, un hallazgo: la vigilancia no se apaga en silencio');
    // subir es peor, como la carga
    const d = compararMedidas({ escena3dUs: 80, etiquetas3dUs: 30 }, { escena3dUs: 100, etiquetas3dUs: 27 });
    assert.deepEqual(
      d.map((x) => [x.medida, x.peor]),
      [
        ['escena3dUs', 25],
        ['etiquetas3dUs', -10],
      ],
    );
  });

  test('la carga cuenta los programas de WebGL que enlaza y --comparar lo vigila (pendiente 11, iteración 295)', () => {
    // las tareas largas de la carga son casi todas la compilación de shaders del primer cuadro 3D, y su tiempo depende
    // del equipo (895 ms en uno, 1.153 en otro con el mismo código); cuántos programas se enlazan, no
    const proto = () => ({ linkProgram(p) { this.vistos.push(p); }, vistos: [] });
    const gl1 = proto();
    const gl2 = proto();
    const win = { WebGLRenderingContext: { prototype: gl1 }, WebGL2RenderingContext: { prototype: gl2 } };
    const doc = { addEventListener() {} };
    // sombrea los tres globales del navegador que usa instrumentar; sin PerformanceObserver, su try lo salta
    const corre = new Function('window', 'document', 'PerformanceObserver', `(${instrumentar.toString()})([])`);
    corre(win, doc, undefined);
    gl1.linkProgram('a');
    gl2.linkProgram('b');
    gl2.linkProgram('c');
    assert.equal(win.__audit.programas, 3, 'cada linkProgram, de WebGL 1 o 2, cuenta uno');
    assert.deepEqual([...gl1.vistos, ...gl2.vistos], ['a', 'b', 'c'], 'el enlace de verdad sigue ocurriendo');
    corre({ ...win, WebGLRenderingContext: undefined, WebGL2RenderingContext: undefined, __audit: undefined }, doc, undefined); // sin WebGL, no lanza
    // el escenario de la puerta mide el 3D, y medir('3d') guarda la cuenta
    assert.match(escenarios().find((x) => x.nombre === 'escritorio-3d').mirar.toString(), /medir\('3d'\)/);
    const src = readFileSync(new URL('./audit.mjs', import.meta.url), 'utf8');
    assert.match(src, /medidas\.programas3d = m\.programas/, 'medir("3d") guarda la cuenta');
    // subir es peor
    assert.deepEqual(compararMedidas({ programas3d: 13 }, { programas3d: 15 }).map((x) => [x.medida, x.peor]), [['programas3d', 15]]);
  });

  test('la base del repo es válida: tipos conocidos de la puerta, escenarios de la puerta y la cuota', () => {
    const base = leerBase(BASE);
    const nombres = new Set(escenarios().map((e) => e.nombre));
    assert.ok(Array.isArray(base.hallazgos));
    for (const k of base.hallazgos) {
      const [tipo, escenario] = k.split('|');
      assert.ok(TIPOS[tipo]?.puerta, `${k}: tipo fuera de la puerta`);
      assert.ok(nombres.has(escenario), `${k}: escenario desconocido`);
    }
    assert.equal(typeof base.cuota?.consultas, 'number');
  });

  test('--json crea la carpeta del informe si no existe (en una sesión nueva no hay test-results/)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-json-'));
    try {
      const ruta = join(dir, 'no', 'existe', 'auditoria.json');
      guardarInforme(ruta, { hallazgos: [], medidas: { cargaMs: 1 } });
      assert.ok(existsSync(ruta));
      assert.equal(JSON.parse(readFileSync(ruta, 'utf8')).medidas.cargaMs, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
