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
import { BASE, CARGA_MAX, MARGEN_CUOTA, PRESUPUESTO, TIPOS, agrupar, clasesDeEstado, clave, comparar, conocido, compararMedidas, escenarios, guardarInforme, leerBase, presupuestos } from './audit.mjs';
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
