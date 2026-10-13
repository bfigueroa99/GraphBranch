#!/usr/bin/env node
/* Pruebas de tools/loop.mjs: la elección de la iteración (--siguiente, con la rotación de los subtipos
   de mantenimiento), las reglas de --check (R1 a R12), el reclamo de la rama (--reclamar, contra un
   repositorio bare local), la salud del loop (--salud) y --publicado (con un fetch simulado). Ninguna
   corre node --test, npm run check, el smoke ni Playwright.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/loop.test.mjs     solo estas */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AUDITABLES, EJES, FLAGS, HOJA_SIN_FUENTE, LoopError, MARCA_PROTOCOLO, PARA_BENJAMIN_MAX, SUBTIPOS, check, diagnostico, necesidades, parse, parseInvestigacion, publicado, reclamar as reclamarEnProceso, siguiente } from './loop.mjs';
import { TIPOS } from './audit.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const loop = join(root, 'tools', 'loop.mjs');

/* ----------------------------------------------------------------- fixture */

// los ejes de la hoja de ruta real y sus ítems hechos, para que las pruebas digan lo mismo que el archivo
const EJES_HOJA = ['Plataformas', 'Salidas', 'Salidas', 'Fuentes', 'Fuentes', 'Fuentes', 'Escala', 'Escala', 'Datos', 'Fuentes', 'Plataformas', 'Análisis', 'Fuentes', 'Análisis', 'Salidas', 'Público', 'Datos', 'Público', 'Análisis', 'Análisis', 'Fuentes', 'Fuentes', 'Salidas', 'Plataformas'];
const HECHOS = { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50, 7: 51 };
const EXPANSIONES = ['Plataformas', 'Salidas', 'Fuentes', 'Salidas', 'Fuentes', 'Escala', 'Datos', 'Público'];
const LOG = [45, 46, 47, 48, 49, 50, 51, 52].map((k) => `un cambio (#${k})`);
const SIGUIENTE_28 = 'iteración 28, expansión: ítem 6 (GitLab, tercera entrega, Fuentes)';

/** Una entrada de la bitácora. `titulo` reemplaza la cabecera de iteración (entradas que no lo son);
    `subtipo` va tras «Mantenimiento»; `qa` agrega la viñeta «- QA:». */
function entrada({ n, tipo, eje, subtipo, titulo, validado = true, qa = true, siguiente, cuerpo = '' }) {
  const cab = titulo ?? (n < 20 ? `Iteración ${n}` : tipo === 'Mantenimiento' ? `Iteración ${n} · Mantenimiento${subtipo ? ` · ${subtipo}` : ''}` : `Iteración ${n} · Expansión · ${eje}`);
  const lineas = [`### 2026-10-12 · ${cab}`, '', `- **Trabajo:** lo que se hizo.${cuerpo}`];
  if (qa) lineas.push('- QA: 2D y 3D en la demo; auditoría: 0 hallazgos nuevos.');
  if (validado) lineas.push('- Validado: 37 pruebas (`node --test`), smoke, i18n y 17 e2e en verde.');
  if (siguiente) lineas.push(`- **Siguiente:** ${siguiente}`, '  con una segunda línea.');
  return lineas.join('\n');
}

/** Las iteraciones 1..n como en el archivo real: sin tipo hasta la 19, después expansión salvo N mod 4 = 3. */
function iteraciones(n, { validado = true, siguiente = SIGUIENTE_28 } = {}) {
  const out = [];
  let exp = 0;
  for (let k = 1; k <= n; k++) {
    const tipo = k % 4 === 3 ? 'Mantenimiento' : 'Expansión';
    const eje = tipo === 'Expansión' && k >= 20 ? EXPANSIONES[exp++ % EXPANSIONES.length] : null;
    const ultima = k === n;
    out.push(entrada({ n: k, tipo, eje, validado: ultima ? validado : true, siguiente: ultima ? siguiente : `iteración ${k + 1}, expansión: ítem 1 (algo, Fuentes)` }));
  }
  return out;
}

/** Los pendientes de Mantenimiento por defecto: todos Baja de Errores; el primero cita cada tipo de la
    auditoría (R11 con la base real, en las pruebas del CLI). */
const mantPorDefecto = (k) => Array.from({ length: k }, (_, i) => ({ prioridad: 'Baja', subtipo: 'Errores', texto: `Pendiente ${i + 1} de mantenimiento (\`app.js:1\`)${i ? '' : `, ${Object.keys(TIPOS).map((t) => `audit:${t}`).join(' ')}`}` }));

/** Un IMPROVEMENTS.md mínimo y válido. `items` es un número o la lista de ejes de la hoja de ruta;
    `mant` reemplaza los pendientes ({prioridad, subtipo, texto}); `benjamin`, los pedidos de Para Benjamin. */
function fixture({ iteraciones: n = 27, items = 24, hechos = HECHOS, pendientes = 13, mant, alta = null, siguiente = SIGUIENTE_28, validado = true, mapa = EJES, entradas, puntaje = true, benjamin = ['**Activar Pages** (desde 2026-10-12). Settings → Pages.'] } = {}) {
  const ejes = Array.isArray(items) ? items : Array.from({ length: items }, (_, i) => EJES_HOJA[i % EJES_HOJA.length]);
  const hoja = ejes.map((eje, i) => {
    const k = i + 1;
    return hechos[k] ? `${k}. ~~**Ítem ${k}**~~ hecho en #${hechos[k]} · ${eje}. Detalle.` : `${k}. **Ítem ${k}** · ${eje}${puntaje ? ' · 2×2/2' : ''}. Detalle del ítem\n   en dos líneas.`;
  });
  const lista = [...(alta ? [{ prioridad: 'Alta', subtipo: 'Errores', texto: alta }] : []), ...(mant ?? mantPorDefecto(pendientes))];
  const mantenimiento = [];
  let k = 0;
  for (const pr of ['Alta', 'Media', 'Baja']) {
    const de = lista.filter((p) => p.prioridad === pr);
    if (!de.length) continue;
    mantenimiento.push(`### ${pr}`, '');
    for (const p of de) mantenimiento.push(`${++k}. ${p.subtipo ? `[${p.subtipo}] ` : ''}${p.texto},\n    que sigue en otra línea.`);
    mantenimiento.push('');
  }
  const bit = entradas ?? iteraciones(n, { validado, siguiente });
  return [
    '# Mejora continua',
    '',
    '## Directiva vigente: ampliar el alcance',
    '',
    'Texto de la directiva.',
    '',
    ...(benjamin ? ['## Para Benjamin', '', ...benjamin.map((b, i) => `${i + 1}. ${b}`), ''] : []),
    '## Mapa de alcance',
    '',
    '| Eje | Hoy | Siguiente |',
    '| --- | --- | --- |',
    ...mapa.map((e) => `| ${e} | lo de hoy | lo que viene |`),
    '',
    '## Hoja de ruta',
    '',
    ...hoja,
    '',
    '## Cómo validar un cambio',
    '',
    '```sh',
    'node --test',
    '```',
    '',
    '## Mantenimiento: pendientes',
    '',
    'Los toman las iteraciones de mantenimiento.',
    '',
    ...mantenimiento,
    '- Ideas menores de la auditoría: nada.',
    '',
    '## Bitácora',
    '',
    ...bit.map((e) => e + '\n'),
  ].join('\n');
}

const nivel = (r, regla) => r.lineas.find((l) => l.regla === regla).nivel;
const texto = (r, regla) => r.lineas.find((l) => l.regla === regla).msg;
const falla = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof LoopError, 'tiene que ser un LoopError');
    return err;
  }
  assert.fail('tenía que fallar');
};

/* -------------------------------------------------------------- siguiente */

describe('siguiente()', () => {
  test('la 28 es de expansión y toma el primer ítem sin hacer si no repite el eje', () => {
    const s = siguiente(fixture());
    assert.equal(s.n, 28);
    assert.equal(s.tipo, 'Expansión');
    assert.equal(s.item, 6);
    assert.equal(s.eje, 'Fuentes');
    assert.equal(s.rama, 'loop/28');
    assert.equal(s.motivo, 'primer ítem sin hacer; la expansión anterior (26) fue de Escala');
    assert.equal(s.declarado, SIGUIENTE_28 + ' con una segunda línea.');
    assert.deepEqual([s.pendientes, s.hechos, s.mantenimiento], [18, 6, 13]);
  });

  test('N mod 4 = 3 es de mantenimiento: gana el subtipo más necesitado y toma su primer pendiente Media', () => {
    const mant = [
      { prioridad: 'Media', subtipo: 'Deuda', texto: 'Smoke intermitente' },
      { prioridad: 'Media', subtipo: 'Deuda', texto: 'Otro intermitente' },
      { prioridad: 'Baja', subtipo: 'Errores', texto: 'Un fallo menor' },
      { prioridad: 'Baja', subtipo: 'Deuda', texto: 'Una herramienta' },
    ];
    const s = siguiente(fixture({ iteraciones: 30, mant }));
    assert.equal(s.n, 31);
    assert.equal(s.tipo, 'Mantenimiento');
    assert.equal(s.eje, null);
    assert.equal(s.subtipo, 'Deuda');
    assert.equal(s.item, 1);
    assert.equal(s.prioridad, 'Media');
    // Deuda: 2 × 1 de espera + 3 × 2 Media + 1 Baja = 9; QA: 2 + 6 expansiones sin auditar = 8
    assert.match(s.motivo, /^31 mod 4 = 3; necesidad: Deuda 9 \(espera 1, 2 Media, 1 Baja\) > QA 8 \(espera 1, 0 Media, 0 Baja, 6 expansiones sin auditar\) > /);
    assert.match(s.titulo, /^Smoke intermitente, que sigue/);
    assert.equal(s.siguiente, 'iteración 31, mantenimiento · Deuda: pendiente 1 (Smoke intermitente, que sigue en otra línea.)');
  });

  test('un subtipo auditable sin pendientes audita su área: el ítem es «auditoría»', () => {
    // solo pendientes Baja de Errores: QA (2 + 6 expansiones) le gana a Errores (2 + 3)
    const s = siguiente(fixture({ iteraciones: 30 }));
    assert.equal(s.subtipo, 'QA');
    assert.equal(s.item, 'auditoría');
    assert.equal(s.titulo, 'auditoría de QA (sin pendientes de QA)');
    assert.equal(s.siguiente, 'iteración 31, mantenimiento · QA: auditoría (sin pendientes de QA)');
  });

  test('el subtipo que acaba de tener turno espera: la rotación pasa a otro', () => {
    const mant = [{ prioridad: 'Baja', subtipo: 'Deuda', texto: 'Una herramienta' }, { prioridad: 'Baja', subtipo: 'Errores', texto: 'Un fallo' }];
    const lista = iteraciones(30);
    // la 31 fue de QA y la 35 de Deuda: QA ya no tiene espera ni expansiones sin auditar de más
    const extra = [
      entrada({ n: 31, tipo: 'Mantenimiento', subtipo: 'QA', cuerpo: '\n- **Hallazgos:** 3 nuevos.' }),
      ...[32, 33, 34].map((k) => entrada({ n: k, tipo: 'Expansión', eje: 'Datos' })),
      entrada({ n: 35, tipo: 'Mantenimiento', subtipo: 'Deuda', cuerpo: '\n- **Reproducción:** algo.' }),
      ...[36, 37, 38].map((k) => entrada({ n: k, tipo: 'Expansión', eje: k % 2 ? 'Fuentes' : 'Datos', siguiente: k === 38 ? 'iteración 39, mantenimiento · Errores: pendiente 2 (Un fallo)' : undefined })),
    ];
    const doc = parse(fixture({ mant, entradas: [...lista, ...extra] }));
    const n = necesidades(doc);
    const de = (st) => n.find((x) => x.subtipo === st);
    // QA: una de espera y las 6 expansiones desde la 31 (32 a 34 y 36 a 38)
    assert.deepEqual([de('QA').espera, de('QA').codigo, de('QA').valor], [1, 6, 8]);
    // Deuda acaba de tener turno: sin espera, solo su pendiente Baja
    assert.deepEqual([de('Deuda').espera, de('Deuda').valor], [0, 1]);
    // Errores nunca tuvo turno: espera = los mantenimientos con subtipo más uno
    assert.deepEqual([de('Errores').espera, de('Errores').valor], [3, 7]);
    const s = siguiente(fixture({ mant, entradas: [...lista, ...extra] }));
    assert.equal(s.n, 39);
    assert.equal(s.subtipo, 'QA');
    assert.equal(s.item, 'auditoría');
    // con un pendiente Media, Errores pasa adelante (3 + 2 × 3 + 1 = 10)
    const conMedia = siguiente(fixture({ mant: [{ prioridad: 'Media', subtipo: 'Errores', texto: 'Se rompe' }, ...mant], entradas: [...lista, ...extra] }));
    assert.deepEqual([conMedia.subtipo, conMedia.item], ['Errores', 1]);
  });

  test('en 24 mantenimientos sin pendientes nuevos, cada subtipo auditable tiene turno', () => {
    // simulación: tres expansiones por cada mantenimiento, sin pendientes; se cuenta quién gana
    let entradas = iteraciones(30);
    const turnos = {};
    for (let k = 0; k < 24; k++) {
      const s = siguiente(fixture({ entradas, mant: [] }));
      turnos[s.subtipo] = (turnos[s.subtipo] ?? 0) + 1;
      const n = s.n;
      entradas = [...entradas, entrada({ n, tipo: 'Mantenimiento', subtipo: s.subtipo }), ...[1, 2, 3].map((d) => entrada({ n: n + d, tipo: 'Expansión', eje: 'Datos' }))];
    }
    for (const st of AUDITABLES) assert.ok(turnos[st] >= 3, `${st}: ${JSON.stringify(turnos)}`);
    assert.ok(turnos.QA >= turnos.Seguridad, JSON.stringify(turnos));
  });

  test('Errores y Deuda sin pendientes no compiten; los auditables sí', () => {
    const n = necesidades(parse(fixture({ iteraciones: 30, mant: [{ prioridad: 'Baja', subtipo: 'Seguridad', texto: 'x' }] })));
    assert.deepEqual(n.map((x) => x.subtipo).sort(), [...AUDITABLES].sort());
    assert.ok(SUBTIPOS.every((st) => n.some((x) => x.subtipo === st) || !AUDITABLES.includes(st)));
  });

  test('si el primero repite el eje de la expansión anterior y hay otro entre los tres primeros, toma ese', () => {
    // la 25 fue de Fuentes; quedan 6 (Fuentes), 7 (Escala), 8 (Escala)
    const s = siguiente(fixture({ iteraciones: 25, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50 } }));
    assert.equal(s.n, 26);
    assert.equal(s.item, 7);
    assert.equal(s.eje, 'Escala');
    assert.equal(s.motivo, 'el primero (6) es del mismo eje que la 25 (Fuentes) y entre los tres primeros hay otro eje');
  });

  test('si no hay otro eje entre los tres primeros, toma el primero igual', () => {
    const items = ['Plataformas', 'Salidas', 'Salidas', 'Fuentes', 'Fuentes', 'Fuentes', 'Fuentes', 'Fuentes', ...Array(16).fill('Datos')];
    const s = siguiente(fixture({ iteraciones: 25, items, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50 } }));
    assert.equal(s.item, 6);
    assert.equal(s.motivo, 'el primero (6) es del mismo eje que la 25 (Fuentes) y no hay otro eje entre los tres primeros');
  });

  test('un pendiente Alta va antes que todo, también en una iteración de expansión', () => {
    const s = siguiente(fixture({ alta: '**Alta**: la app arranca en blanco con un localStorage corrupto.' }));
    assert.equal(s.n, 28);
    assert.equal(s.tipo, 'Mantenimiento');
    assert.equal(s.subtipo, 'Errores');
    assert.equal(s.item, 1);
    assert.equal(s.motivo, 'pendiente Alta: va antes que todo');
    assert.match(s.titulo, /^\*\*Alta\*\*/);
    assert.match(s.siguiente, /^iteración 28, mantenimiento · Errores: pendiente 1 \(\*\*Alta\*\*/);
  });

  test('sin ítems pendientes en la hoja de ruta, código 2', () => {
    const err = falla(() => siguiente(fixture({ items: 6, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50, 6: 51 } })));
    assert.equal(err.codigo, 2);
    assert.match(err.message, /reponer la hoja de ruta/);
  });

  test('mantenimiento sin ningún pendiente: igual hay iteración (una auditoría), y R7 lo marca', () => {
    const s = siguiente(fixture({ iteraciones: 30, pendientes: 0 }));
    assert.equal(s.item, 'auditoría');
    assert.equal(nivel(check(fixture({ iteraciones: 30, pendientes: 0 }), { log: LOG }), 'R7'), 'ERROR');
  });

  test('sin ninguna iteración en la bitácora, código 1', () => {
    const err = falla(() => siguiente(fixture({ entradas: [entrada({ titulo: 'Cambio de objetivo', siguiente: 'nada' })] })));
    assert.equal(err.codigo, 1);
  });
});

/* ------------------------------------------------------------------ check */

describe('check()', () => {
  const ok = (extra = {}) => check(fixture(extra), { log: LOG });

  test('el fixture pasa entero', () => {
    const r = ok();
    assert.equal(r.errores, 0, r.salida);
    for (const regla of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']) assert.equal(nivel(r, regla), 'ok', r.salida);
    assert.match(r.salida, /\n--check: \d+ ok, \d+ avisos?, 0 errores$/);
  });

  test('R3: dos «hecho en #K» por encima del último PR fusionado es un error; uno solo es el PR en curso', () => {
    const dos = check(fixture({ hechos: { ...HECHOS, 5: 998, 7: 999 } }), { log: LOG });
    assert.equal(nivel(dos, 'R3'), 'ERROR');
    assert.match(texto(dos, 'R3'), /#998, #999/);
    const uno = check(fixture({ hechos: { ...HECHOS, 7: 999 } }), { log: LOG });
    assert.equal(nivel(uno, 'R3'), 'ok');
    assert.match(texto(uno, 'R3'), /#999 es el PR en curso/);
  });

  test('R3: un PR repetido o uno que no está en origin/master es un error', () => {
    const rep = check(fixture({ hechos: { ...HECHOS, 7: 45 } }), { log: LOG });
    assert.equal(nivel(rep, 'R3'), 'ERROR');
    assert.match(texto(rep, 'R3'), /#45 repetido/);
    const falta = check(fixture({ hechos: { ...HECHOS, 7: 44 } }), { log: LOG });
    assert.equal(nivel(falta, 'R3'), 'ERROR');
    assert.match(texto(falta, 'R3'), /#44 .*no está en origin\/master/);
  });

  test('R3: sin lista de PR ni origin/master, aviso y nada más', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    const r = check(fixture(), { dir });
    rmSync(dir, { recursive: true, force: true });
    assert.equal(nivel(r, 'R3'), 'aviso');
    assert.match(texto(r, 'R3'), /sin origin\/master/);
  });

  test('R3: el PR en curso sigue en ok aunque entre medio se fusione un PR ajeno de número mayor', () => {
    const r = check(fixture({ hechos: { ...HECHOS, 7: 54 } }), { log: [...LOG, 'un PR ajeno (#55)'] });
    assert.equal(nivel(r, 'R3'), 'ok', r.salida);
    assert.match(texto(r, 'R3'), /#54 es el PR en curso/);
  });

  test('R1: el Mapa de alcance con 6 filas es un error, y también fuera de orden', () => {
    assert.equal(nivel(ok({ mapa: EJES.slice(0, 6) }), 'R1'), 'ERROR');
    assert.equal(nivel(ok({ mapa: [...EJES].reverse() }), 'R1'), 'ERROR');
  });

  test('R2: un ítem de la hoja que no cumple el patrón o salta la numeración es un error', () => {
    const r = check(fixture().replace('6. **Ítem 6** · Fuentes · 2×2/2.', '6. **Ítem 6** · Marte · 2×2/2.'), { log: LOG });
    assert.equal(nivel(r, 'R2'), 'ERROR');
    assert.match(texto(r, 'R2'), /línea \d+/);
    const salto = check(fixture().replace('8. **Ítem 8**', '9. **Ítem 8**'), { log: LOG });
    assert.equal(nivel(salto, 'R2'), 'ERROR');
  });

  test('R4: 9 pendientes es un error y 12 un aviso', () => {
    const nueve = ok({ items: 15 });
    assert.equal(nivel(nueve, 'R4'), 'ERROR');
    assert.match(texto(nueve, 'R4'), /quedan 9: reponer hasta 15, regla 5/);
    assert.equal(nivel(ok({ items: 18 }), 'R4'), 'aviso');
    assert.equal(nivel(ok(), 'R4'), 'ok');
  });

  test('R5: una iteración repetida es un error y un hueco, un aviso', () => {
    const lista = iteraciones(27);
    const rep = check(fixture({ entradas: [...lista.slice(0, 26), entrada({ n: 26, tipo: 'Expansión', eje: 'Escala' }), lista[26]] }), { log: LOG });
    assert.equal(nivel(rep, 'R5'), 'ERROR');
    assert.match(texto(rep, 'R5'), /iteración 26 repetida/);
    const hueco = check(fixture({ entradas: lista.filter((_, i) => i !== 24) }), { log: LOG });
    assert.equal(nivel(hueco, 'R5'), 'aviso');
    assert.match(texto(hueco, 'R5'), /falta la iteración 25/);
  });

  test('R5: desde la 20 la cabecera lleva tipo, y el tipo sigue a N mod 4 salvo un pendiente Alta', () => {
    const lista = iteraciones(27);
    const sinTipo = check(fixture({ entradas: [...lista.slice(0, 26), entrada({ n: 27, titulo: 'Iteración 27', siguiente: SIGUIENTE_28 })] }), { log: LOG });
    assert.equal(nivel(sinTipo, 'R5'), 'ERROR');
    assert.match(texto(sinTipo, 'R5'), /iteración 27 sin tipo/);
    const m28 = check(fixture({ entradas: [...lista, entrada({ n: 28, tipo: 'Mantenimiento', siguiente: 'iteración 29, expansión: ítem 6 (GitLab, Fuentes)' })] }), { log: LOG });
    assert.equal(nivel(m28, 'R5'), 'ERROR');
    assert.match(texto(m28, 'R5'), /iteración 28 es de mantenimiento sin un pendiente \*\*Alta\*\*/);
    const alta28 = check(fixture({ entradas: [...lista, entrada({ n: 28, tipo: 'Mantenimiento', cuerpo: ' Era el pendiente **Alta**.', siguiente: 'iteración 29, expansión: ítem 6 (GitLab, Fuentes)' })] }), { log: LOG });
    assert.equal(nivel(alta28, 'R5'), 'ok');
    const e27 = check(fixture({ entradas: [...lista.slice(0, 26), entrada({ n: 27, tipo: 'Expansión', eje: 'Datos', siguiente: SIGUIENTE_28 })] }), { log: LOG });
    assert.equal(nivel(e27, 'R5'), 'ERROR');
    assert.match(texto(e27, 'R5'), /27 mod 4 = 3/);
  });

  test('R6: la última entrada necesita Validado y un Siguiente que diga lo mismo que --siguiente', () => {
    const sin = ok({ siguiente: null });
    assert.equal(nivel(sin, 'R6'), 'ERROR');
    assert.match(texto(sin, 'R6'), /Siguiente/);
    const otro = ok({ siguiente: 'iteración 28, expansión: ítem 9 (CI en el grafo, Datos)' });
    assert.equal(nivel(otro, 'R6'), 'ERROR');
    assert.match(texto(otro, 'R6'), /ítem 9 y --siguiente da expansión con ítem 6/);
    const tipo = ok({ siguiente: 'iteración 28, de **mantenimiento**: pendiente 6 (algo)' });
    assert.equal(nivel(tipo, 'R6'), 'ERROR');
    const num = ok({ siguiente: 'iteración 29, expansión: ítem 6 (GitLab, Fuentes)' });
    assert.match(texto(num, 'R6'), /declara la iteración 29 y toca la 28/);
    const sinValidado = ok({ validado: false });
    assert.equal(nivel(sinValidado, 'R6'), 'ERROR');
    assert.match(texto(sinValidado, 'R6'), /Validado/);
  });

  test('R6: entiende las formas viejas del Siguiente («el primer ítem sin hacer es el 6», «toca el 7»)', () => {
    const vieja = ok({ siguiente: 'iteración 28, expansión: el primer ítem sin hacer es el 6 (GitLab, tercera entrega), de otro eje que la última expansión (Escala).' });
    assert.equal(nivel(vieja, 'R6'), 'ok', vieja.salida);
    const toca = check(fixture({ iteraciones: 25, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50 }, siguiente: 'iteración 26, expansión. El primer ítem sin hacer es el 6, del mismo eje que esta (Fuentes): toca el 7, **una organización** (Escala).' }), { log: LOG });
    assert.equal(nivel(toca, 'R6'), 'ok', toca.salida);
  });

  test('R6: el ítem declarado es el primero que sigue al tipo, aunque el título cite otro número', () => {
    const mant = [...['Smoke intermitente', 'Otro', 'Y otro'].map((texto) => ({ prioridad: 'Media', subtipo: 'Deuda', texto })), ...mantPorDefecto(3)];
    const m = check(fixture({ iteraciones: 30, mant, siguiente: 'iteración 31, mantenimiento · Deuda: pendiente 1 (Smoke intermitente, primer caso: el fallo del smoke (pendiente 15))' }), { log: LOG });
    assert.equal(nivel(m, 'R6'), 'ok', m.salida);
    const e = ok({ siguiente: 'iteración 28, expansión: ítem 6 (GitLab, tercera entrega, la que sigue al ítem 5, Fuentes)' });
    assert.equal(nivel(e, 'R6'), 'ok', e.salida);
  });

  test('R7: mantenimiento vacío es un error, con 2 un aviso, y la numeración no salta', () => {
    const vacio = ok({ pendientes: 0 });
    assert.equal(nivel(vacio, 'R7'), 'ERROR');
    assert.match(texto(vacio, 'R7'), /auditar y cargar pendientes/);
    assert.equal(nivel(ok({ pendientes: 2 }), 'R7'), 'aviso');
    const salto = check(fixture().replace('4. [Errores] Pendiente 4', '5. [Errores] Pendiente 4'), { log: LOG });
    assert.equal(nivel(salto, 'R7'), 'ERROR');
  });

  test('R6: en un mantenimiento, el subtipo y la auditoría del Siguiente se comparan con --siguiente', () => {
    const bien = ok({ iteraciones: 30, siguiente: 'iteración 31, mantenimiento · QA: auditoría (sin pendientes de QA)' });
    assert.equal(nivel(bien, 'R6'), 'ok', bien.salida);
    assert.match(texto(bien, 'R6'), /iteración 31, mantenimiento · QA: auditoría/);
    const otro = ok({ iteraciones: 30, siguiente: 'iteración 31, mantenimiento · Errores: auditoría (sin pendientes)' });
    assert.equal(nivel(otro, 'R6'), 'ERROR');
    assert.match(texto(otro, 'R6'), /declara el subtipo Errores y --siguiente da QA/);
    const pend = ok({ iteraciones: 30, siguiente: 'iteración 31, mantenimiento · QA: pendiente 1 (algo)' });
    assert.match(texto(pend, 'R6'), /pendiente 1 y --siguiente da mantenimiento con auditoría/);
  });

  test('R7: subsecciones solo Alta, Media y Baja, en orden, y cada pendiente con un subtipo conocido', () => {
    const base = fixture({ mant: [{ prioridad: 'Media', subtipo: 'Deuda', texto: 'uno' }, ...mantPorDefecto(3)] });
    assert.equal(nivel(check(base, { log: LOG }), 'R7'), 'ok');
    const sin = check(base.replace('2. [Errores] ', '2. '), { log: LOG });
    assert.match(texto(sin, 'R7'), /pendiente 2 \(línea \d+\) sin subtipo/);
    const raro = check(base.replace('2. [Errores] ', '2. [Bichos] '), { log: LOG });
    assert.match(texto(raro, 'R7'), /el subtipo «Bichos» no es/);
    const sub = check(base.replace('### Media', '### Urgente'), { log: LOG });
    assert.match(texto(sub, 'R7'), /«### Urgente» .* no es Alta, Media, Baja/);
    const orden = check(base.replace('### Media', '### Tmp').replace('### Baja', '### Media').replace('### Tmp', '### Baja'), { log: LOG });
    assert.match(texto(orden, 'R7'), /en orden Alta, Media, Baja/);
  });

  test('R5: las iteraciones después de la marca del protocolo llevan «- QA:» y, si son de mantenimiento, subtipo y Reproducción o Hallazgos', () => {
    const lista = iteraciones(30);
    const marca = entrada({ titulo: `${MARCA_PROTOCOLO}, rotación y salud`, siguiente: 'iteración 31, mantenimiento · QA: auditoría' });
    const con = (...e) => check(fixture({ entradas: [...lista, marca, ...e] }), { log: LOG });
    const bien = con(entrada({ n: 31, tipo: 'Mantenimiento', subtipo: 'QA', cuerpo: '\n- **Hallazgos:** 3 nuevos.', siguiente: 'iteración 32, expansión: ítem 6 (algo, Fuentes)' }));
    assert.equal(nivel(bien, 'R5'), 'ok', bien.salida);
    assert.match(texto(bien, 'R5'), /1 con el protocolo de QA/);
    const sinQA = con(entrada({ n: 31, tipo: 'Mantenimiento', subtipo: 'QA', qa: false, cuerpo: '\n- **Hallazgos:** 3.' }));
    assert.match(texto(sinQA, 'R5'), /iteración 31 sin la viñeta «- QA:»/);
    const sinSub = con(entrada({ n: 31, tipo: 'Mantenimiento', cuerpo: '\n- **Reproducción:** x.' }));
    assert.match(texto(sinSub, 'R5'), /iteración 31: la cabecera de un mantenimiento lleva su subtipo/);
    const qaSinHallazgos = con(entrada({ n: 31, tipo: 'Mantenimiento', subtipo: 'QA', cuerpo: '\n- **Reproducción:** x.' }));
    assert.match(texto(qaSinHallazgos, 'R5'), /iteración 31 \(QA\) sin la viñeta «- \*\*Hallazgos:\*\*»/);
    const sinRepro = con(entrada({ n: 31, tipo: 'Mantenimiento', subtipo: 'Errores' }));
    assert.match(texto(sinRepro, 'R5'), /iteración 31 sin «- \*\*Reproducción:\*\*»/);
    // antes de la marca, nada de eso se exige
    assert.equal(nivel(check(fixture({ entradas: iteraciones(30).map((e) => e.replace(/\n- QA: [^\n]*/, '')) }), { log: LOG }), 'R5'), 'ok');
  });

  test('«Fusión de #15 antes de abrir el PR» y «Cambio de objetivo» no cuentan como iteración', () => {
    const lista = iteraciones(27);
    const doc = fixture({
      entradas: [...lista.slice(0, 3), entrada({ titulo: 'Fusión de #15 antes de abrir el PR' }), ...lista.slice(3, 19), entrada({ titulo: 'Cambio de objetivo: ampliar el alcance', siguiente: 'iteración 20, expansión: ítem 1' }), ...lista.slice(19)],
    });
    const p = parse(doc);
    assert.equal(p.bitacora.length, 29);
    assert.deepEqual(p.bitacora.filter((e) => e.n === null).map((e) => e.titulo), ['Fusión de #15 antes de abrir el PR', 'Cambio de objetivo: ampliar el alcance']);
    assert.equal(siguiente(doc).n, 28);
    const r = check(doc, { log: LOG });
    assert.equal(nivel(r, 'R5'), 'ok', r.salida);
    assert.equal(nivel(r, 'R6'), 'ok', r.salida);
  });

  test('la última entrada puede no ser una iteración: su Siguiente es el que se comprueba', () => {
    const doc = fixture({ entradas: [...iteraciones(27), entrada({ titulo: 'Cambio de maquinaria', siguiente: SIGUIENTE_28 })] });
    const r = check(doc, { log: LOG });
    assert.equal(nivel(r, 'R6'), 'ok', r.salida);
    assert.equal(siguiente(doc).n, 28);
    assert.equal(nivel(check(fixture({ entradas: [...iteraciones(27), entrada({ titulo: 'Cambio de maquinaria', siguiente: null })] }), { log: LOG }), 'R6'), 'ERROR');
  });

  test('R9: avisa si hay flujos de GitHub Actions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    assert.equal(nivel(check(fixture(), { log: LOG, dir }), 'R9'), 'ok');
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    const r = check(fixture(), { log: LOG, dir });
    assert.equal(nivel(r, 'R9'), 'aviso');
    assert.match(texto(r, 'R9'), /ci\.yml/);
    rmSync(dir, { recursive: true, force: true });
  });
});

/* --------------------------------------------------------- check: R8 */

describe('check() R8: la skill y el prompt', () => {
  const SKILL = `---
name: iteracion
description: Una iteración del loop.
---

# Iteración

#### Errores
#### QA
#### Accesibilidad
#### Seguridad
#### Rendimiento
#### Deuda

Primero \`node tools/loop.mjs --check\`; después reclamar:

\`\`\`sh
git fetch origin master
node tools/loop.mjs --reclamar --sin-red && npm run check -- --e2e
[ -x node_modules/.bin/playwright ] || npm ci
\`\`\`
`;
  const SETTINGS = JSON.stringify({ permissions: { allow: ['Bash(git fetch:*)', 'Bash(node:*)', 'Bash(npm run:*)', 'Bash(npm ci)'] } });
  const PROMPT = 'Seguí la skill `iteracion` del repo (`.claude/skills/iteracion/SKILL.md`).';
  const r8 = (extra) => check(fixture(), { log: LOG, skill: SKILL, prompt: PROMPT, settings: SETTINGS, ...extra });

  test('una skill coherente con la herramienta y los permisos pasa', () => {
    const r = r8();
    assert.equal(nivel(r, 'R8'), 'ok', r.salida);
  });

  test('un flag que loop.mjs no tiene es un error, y los flags de otros comandos no cuentan', () => {
    const r = r8({ skill: SKILL.replace('--reclamar --sin-red', '--reclamar --inexistente') });
    assert.equal(nivel(r, 'R8'), 'ERROR');
    assert.match(texto(r, 'R8'), /--inexistente/);
    assert.doesNotMatch(texto(r, 'R8'), /--e2e/);
  });

  test('una ruta del repo que no existe es un error', () => {
    const r = r8({ skill: SKILL + '\nY corré `tools/no-existe.mjs` al final.\n' });
    assert.equal(nivel(r, 'R8'), 'ERROR');
    assert.match(texto(r, 'R8'), /tools\/no-existe\.mjs/);
  });

  test('un comando de un bloque de código sin permiso en settings.json es un error', () => {
    const r = r8({ skill: SKILL.replace('git fetch origin master', 'git fetch origin master && git rebase origin/master') });
    assert.equal(nivel(r, 'R8'), 'ERROR');
    assert.match(texto(r, 'R8'), /«git rebase».*Bash\(git rebase:\*\)/);
  });

  test('un subtipo de mantenimiento sin su protocolo en la skill es un error', () => {
    const r = r8({ skill: SKILL.replace('#### Seguridad\n', '') });
    assert.equal(nivel(r, 'R8'), 'ERROR');
    assert.match(texto(r, 'R8'), /sin el protocolo del subtipo Seguridad/);
  });

  test('sin frontmatter con name y description es un error', () => {
    const r = r8({ skill: SKILL.replace('description: Una iteración del loop.\n', '') });
    assert.equal(nivel(r, 'R8'), 'ERROR');
    assert.match(texto(r, 'R8'), /frontmatter/);
  });

  test('un prompt con hechos que se pudren (una ruta de Chromium, una rama, una cifra) es un error', () => {
    for (const [podrido, que] of [
      ['chromium-1194', /ruta de Chromium/],
      ['la rama claude/epic-curie', /rama claude\//],
      ['Iteración 28', /número de iteración/],
      ['loop/28', /rama loop\/N/],
      ['37 pruebas', /cifra de pruebas/],
      ['17 e2e', /cifra de e2e/],
      ['N mod 4', /regla mod N/],
    ]) {
      const r = r8({ prompt: PROMPT + ' ' + podrido });
      assert.equal(nivel(r, 'R8'), 'ERROR', podrido);
      assert.match(texto(r, 'R8'), que);
    }
    const largo = r8({ prompt: 'x'.repeat(601) });
    assert.match(texto(largo, 'R8'), /601 bytes/);
  });

  test('sin skill en el repo es solo un aviso', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    const r = check(fixture(), { log: LOG, dir });
    rmSync(dir, { recursive: true, force: true });
    assert.equal(nivel(r, 'R8'), 'aviso');
    assert.match(texto(r, 'R8'), /sin skill/);
  });

  test('los archivos reales del repo pasan R8', () => {
    const r = check(fixture(), { log: LOG });
    assert.equal(nivel(r, 'R8'), 'ok', r.salida);
  });
});

/* ------------------------------------------- check: R10 a R12 (hoja, investigación, base, Benjamin) */

describe('check() R10 a R12', () => {
  const INV = ['# Investigación', '', '## Reglas', '', 'Texto.', '', '## Fuentes', '', '### 2026-10-13 · Gource', '', '- **Qué es:** animación.', '- **Fuente:** https://gource.io/ (consultada el 2026-10-13)', '- **Implica:** el Replay.', ''].join('\n');
  const BASE = JSON.stringify({ hallazgos: ['objetivo-chico|celular-es|#branch-filter'] });
  const HOY = new Date('2026-10-20T12:00:00Z');
  const c = (doc, extra = {}) => check(doc, { log: LOG, investigacion: INV, auditBase: BASE, hoy: HOY, ...extra });

  test('el fixture pasa R10, R11 y R12', () => {
    const r = c(fixture());
    for (const regla of ['R10', 'R11', 'R12']) assert.equal(nivel(r, regla), 'ok', r.salida);
    assert.match(texto(r, 'R10'), /investigación del 2026-10-13 \(1 fuentes\)/);
  });

  test('parseInvestigacion lee fecha, nombre, URL e Implica de cada fuente', () => {
    assert.deepEqual(parseInvestigacion(INV).map(({ fecha, nombre, url, implica }) => [fecha, nombre, url, implica]), [['2026-10-13', 'Gource', true, true]]);
    // fuera de «## Fuentes» no cuenta
    assert.equal(parseInvestigacion(INV.replace('## Fuentes', '## Otra')).length, 0);
  });

  test('R10: sin docs/investigacion.md, una fuente sin URL o sin Implica, o sin fuentes, es un error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    const sin = check(fixture(), { log: LOG, auditBase: BASE, hoy: HOY, dir });
    rmSync(dir, { recursive: true, force: true });
    assert.match(texto(sin, 'R10'), /falta docs\/investigacion\.md/);
    assert.match(texto(c(fixture(), { investigacion: INV.replace(/https:\/\/\S+/, 'gource.io') }), 'R10'), /«Gource» \(línea \d+\) sin su URL/);
    assert.match(texto(c(fixture(), { investigacion: INV.replace('**Implica:**', 'Implica') }), 'R10'), /«Gource» \(línea \d+\) sin «\*\*Implica:\*\*»/);
    assert.match(texto(c(fixture(), { investigacion: '# Nada\n' }), 'R10'), /sin entradas/);
  });

  test('R10: con más de 30 días, la investigación vencida es un aviso', () => {
    const r = c(fixture(), { hoy: new Date('2026-11-20T00:00:00Z') });
    assert.equal(nivel(r, 'R10'), 'aviso');
    assert.match(texto(r, 'R10'), /tiene 38 días \(más de 30\): la próxima reposición de la hoja de ruta empieza por investigar/);
  });

  test('R10: un ítem pendiente sin puntaje es un error; uno hecho no lo necesita', () => {
    const r = c(fixture({ puntaje: false }));
    assert.equal(nivel(r, 'R10'), 'ERROR');
    assert.match(texto(r, 'R10'), /ítem 6 sin puntaje «· a×i\/e\.»/);
    assert.doesNotMatch(texto(r, 'R10'), /ítem 1 sin puntaje/);
  });

  test(`R10: un ítem después del ${HOJA_SIN_FUENTE} cita la investigación o el ítem del que es parte`, () => {
    const items = [...EJES_HOJA, 'Datos', 'Datos', 'Datos'].slice(0, HOJA_SIN_FUENTE + 1);
    const nuevo = `${HOJA_SIN_FUENTE + 1}. **Ítem ${HOJA_SIN_FUENTE + 1}** · ${items[HOJA_SIN_FUENTE]} · 2×2/2. Detalle del ítem`;
    const doc = fixture({ items });
    const sin = c(doc);
    assert.match(texto(sin, 'R10'), new RegExp(`ítem ${HOJA_SIN_FUENTE + 1} sin «\\[inv\\. AAAA-MM-DD\\]»`));
    assert.equal(nivel(c(doc.replace(nuevo, `${nuevo} [inv. 2026-10-13]`)), 'R10'), 'ok');
    assert.match(texto(c(doc.replace(nuevo, `${nuevo} [inv. 2026-09-01]`)), 'R10'), /cita \[inv\. 2026-09-01\] y docs\/investigacion\.md no tiene fuentes de esa fecha/);
    assert.equal(nivel(c(doc.replace(nuevo, `${nuevo} [parte del ítem 6]`)), 'R10'), 'ok');
    assert.match(texto(c(doc.replace(nuevo, `${nuevo} [parte del ítem 99]`)), 'R10'), /dice \[parte del ítem 99\] y ese ítem no existe/);
  });

  test('R11: cada tipo de la base de la auditoría tiene un pendiente que lo cita', () => {
    const sinCita = c(fixture({ mant: [{ prioridad: 'Baja', subtipo: 'Errores', texto: 'algo sin cita' }] }));
    assert.equal(nivel(sinCita, 'R11'), 'ERROR');
    assert.match(texto(sinCita, 'R11'), /tipo «objetivo-chico» sin un pendiente de Mantenimiento que cite `audit:objetivo-chico`/);
    assert.match(texto(c(fixture(), { auditBase: JSON.stringify({ hallazgos: ['marciano|x|y'] }) }), 'R11'), /el tipo «marciano», que tools\/audit\.mjs no conoce/);
    assert.match(texto(c(fixture(), { auditBase: '{no' }), 'R11'), /no es JSON válido/);
    const dir = mkdtempSync(join(tmpdir(), 'loop-'));
    const sin = check(fixture(), { log: LOG, investigacion: INV, hoy: HOY, dir });
    rmSync(dir, { recursive: true, force: true });
    assert.equal(nivel(sin, 'R11'), 'aviso');
  });

  test('R12: Para Benjamin existe, numerado, fechado y corto', () => {
    assert.match(texto(c(fixture({ benjamin: null })), 'R12'), /falta la sección «## Para Benjamin»/);
    assert.match(texto(c(fixture({ benjamin: ['**Algo** sin fecha.'] })), 'R12'), /Para Benjamin 1 \(línea \d+\) sin «\(desde AAAA-MM-DD\)»/);
    const muchos = c(fixture({ benjamin: Array.from({ length: PARA_BENJAMIN_MAX + 1 }, (_, i) => `**Pedido ${i}** (desde 2026-10-13).`) }));
    assert.equal(nivel(muchos, 'R12'), 'aviso');
    const salto = c(fixture({ benjamin: ['**Uno** (desde 2026-10-13).', '**Dos** (desde 2026-10-13).'] }).replace('2. **Dos**', '3. **Dos**'));
    assert.match(texto(salto, 'R12'), /el pedido 2 está numerado 3/);
    assert.equal(nivel(c(fixture({ benjamin: [] })), 'R12'), 'ok');
  });
});

/* ------------------------------------------------------------------ salud */

describe('diagnostico() de --salud', () => {
  const H = 3600e3;
  const desde = '2026-10-10T00:00:00Z';
  const t0 = Date.parse(desde);
  const doc = parse(fixture());
  const base = { doc, texto: fixture(), desde, ahora: t0 + 48 * H };

  test('cadencia: iteraciones desde la directiva frente a disparos esperados, y los huecos de más de dos disparos', () => {
    const merges = [2, 6, 10, 34, 38].map((h) => ({ fecha: t0 + h * H, titulo: 'x (#1)' }));
    const { lineas } = diagnostico({ ...base, merges });
    // 8 iteraciones (20 a 27) para 12 disparos
    assert.ok(lineas.includes('Cadencia: 8 iteraciones desde la directiva (2026-10-10) para 12 disparos esperados (67 %); la última fusión fue hace 10,0 h'), lineas.join('\n'));
    assert.ok(lineas.includes('Hueco: 2026-10-10 10:00 → 2026-10-11 10:00 UTC (24,0 h, unos 5 disparos sin iteración)'), lineas.join('\n'));
    assert.ok(lineas.includes('Hueco: 2026-10-11 14:00 → ahora UTC (10,0 h, un disparo sin iteración)'), lineas.join('\n'));
  });

  test('más de un día sin fusionar es una Acción (a Para Benjamin)', () => {
    const r = diagnostico({ ...base, merges: [{ fecha: t0 + 2 * H, titulo: 'x' }] });
    assert.ok(r.lineas.some((l) => /^Acción: el loop no fusiona nada desde hace 46,0 h/.test(l)), r.lineas.join('\n'));
  });

  test('reclamos: loop/K fusionada se borra, la que toca está en curso o vencida, una más allá se revisa; la conservada se informa', () => {
    const ramas = [
      { nombre: 'loop/26', fecha: base.ahora - 30 * H },
      { nombre: 'loop/28', fecha: base.ahora - 0.5 * H },
      { nombre: 'loop/30', fecha: base.ahora - H },
      { nombre: 'loop/27-vencida-abc1234', fecha: base.ahora - 40 * H },
    ];
    const r = diagnostico({ ...base, ramas });
    assert.ok(r.lineas.includes('Acción: borrar loop/26, de una iteración ya fusionada: git push origin --delete loop/26'), r.lineas.join('\n'));
    assert.ok(r.lineas.includes('En curso: loop/28 (último commit hace 30 min)'), r.lineas.join('\n'));
    assert.ok(r.lineas.some((l) => /^Acción: loop\/30 va más allá de la iteración que toca \(28\)/.test(l)));
    assert.ok(r.lineas.some((l) => /^Trabajo de relevos conservado: loop\/27-vencida-abc1234/.test(l)));
    assert.equal(r.acciones, 2);
    const vencida = diagnostico({ ...base, ramas: [{ nombre: 'loop/28', fecha: base.ahora - 7 * H }] });
    assert.ok(vencida.lineas.includes('Vencida: loop/28 lleva 7,0 h sin commits: --reclamar la releva'));
    assert.ok(diagnostico(base).lineas.includes('Reclamos: ninguna rama loop/N en origin'));
  });

  test('las demás ramas: fusionadas (por su PR o contenidas) y con trabajo, sin acciones', () => {
    const ramas = [
      { nombre: 'claude/a', fecha: t0, contenida: true },
      { nombre: 'ccr-b', fecha: t0, pr: 53 },
      { nombre: 'claude/c', fecha: t0 },
    ];
    const r = diagnostico({ ...base, ramas });
    assert.ok(r.lineas.includes('Ramas ya fusionadas o contenidas en master (las borra Benjamin, ver Para Benjamin): 2 (claude/a, ccr-b #53)'), r.lineas.join('\n'));
    assert.ok(r.lineas.includes('Ramas con trabajo sin fusionar (nunca se fusionan ni se borran solas): 1 (claude/c 2026-10-10)'));
    assert.equal(r.acciones, 0);
  });

  test('issues: los que IMPROVEMENTS.md no nombra como «issue #k» se trían; sin consulta, el motivo', () => {
    const issues = [
      { number: 7, title: 'La app no carga\ncon mi repo', labels: ['bug'] },
      { number: 9, title: 'Idea', labels: [] },
    ];
    const r = diagnostico({ ...base, texto: base.texto + '\nVer issue #9.', issues });
    assert.ok(r.lineas.includes('Issues abiertos: 2, sin triar: 1'));
    assert.ok(r.lineas.some((l) => /^Acción: triar el issue #7 «La app no carga con mi repo» \[bug\]: un fallo va a Mantenimiento/.test(l)), r.lineas.join('\n'));
    assert.equal(r.acciones, 1);
    // «issue #70» no cuenta como triado el #7
    assert.equal(diagnostico({ ...base, texto: 'issue #70', issues: issues.slice(0, 1) }).acciones, 1);
    assert.ok(diagnostico({ ...base, issues: 'HTTP 403' }).lineas.some((l) => l.startsWith('Issues: no se pudo consultar (HTTP 403)')));
    assert.ok(diagnostico({ ...base, issues: [] }).lineas.includes('Issues abiertos: ninguno'));
  });

  test('un pendiente Alta es una Acción; Para Benjamin y el tamaño del archivo se informan', () => {
    const conAlta = fixture({ alta: '**Alta**: la app en blanco.' });
    const r = diagnostico({ ...base, doc: parse(conAlta), texto: conAlta });
    assert.ok(r.lineas.some((l) => /^Acción: 1 pendiente\(s\) Alta en Mantenimiento: van antes que todo \(1\)$/.test(l)));
    assert.ok(r.lineas.includes('Mantenimiento: 1 Alta, 0 Media, 13 Baja'));
    assert.ok(r.lineas.includes('Para Benjamin (1): 1. Activar Pages (desde 2026-10-12)'), r.lineas.join('\n'));
    assert.ok(r.lineas.some((l) => /^IMPROVEMENTS\.md: \d+ KB \(bitácora \d+ KB\)/.test(l)));
    assert.equal(r.lineas.at(-1), '--salud: 1 acción(es)');
  });
});

/* -------------------------------------------------------------- el CLI */

describe('el CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args) => spawnSync(process.execPath, [loop, ...args], { cwd: root, encoding: 'utf8' });

  test('--check sale 0 con un archivo válido y 1 con una mutación', () => {
    const bueno = join(dir, 'bueno.md');
    writeFileSync(bueno, fixture());
    const ok = cli('--check', '--archivo', bueno);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /--check: \d+ ok, \d+ avisos?, 0 errores/);
    const malo = join(dir, 'malo.md');
    writeFileSync(malo, fixture({ mapa: EJES.slice(0, 6) }));
    const err = cli('--check', '--archivo', malo);
    assert.equal(err.status, 1);
    assert.match(err.stdout, /^ERROR R1 /m);
  });

  test('--siguiente imprime las siete líneas (la última, el Siguiente para copiar) y --json el objeto', () => {
    const archivo = join(dir, 'siguiente.md');
    writeFileSync(archivo, fixture());
    const r = cli('--siguiente', '--archivo', archivo);
    assert.equal(r.status, 0, r.stderr);
    const lineas = r.stdout.trim().split('\n');
    assert.equal(lineas.length, 7);
    assert.equal(lineas[6], 'Siguiente: iteración 28, expansión: ítem 6 (Ítem 6, Fuentes)');
    assert.equal(lineas[0], 'Iteración 28 · Expansión · Fuentes');
    assert.equal(lineas[1], 'Ítem 6 de la hoja de ruta: Ítem 6');
    assert.equal(lineas[3], 'Rama: loop/28');
    assert.match(lineas[4], /^Declarado en la iteración 27: iteración 28/);
    assert.equal(lineas[5], 'Hoja de ruta: 18 pendientes, 6 hechos · mantenimiento: 13 pendientes');
    const j = JSON.parse(cli('--siguiente', '--json', '--archivo', archivo).stdout);
    assert.equal(j.item, 6);
    assert.equal(j.rama, 'loop/28');
    writeFileSync(archivo, fixture({ iteraciones: 30, mant: ['Un fallo', 'Otro', 'Y otro'].map((texto) => ({ prioridad: 'Media', subtipo: 'Errores', texto })) }));
    const m = cli('--siguiente', '--archivo', archivo).stdout.split('\n');
    assert.equal(m[0], 'Iteración 31 · Mantenimiento · Errores');
    assert.match(m[1], /^Pendiente 1 \(Media\) de mantenimiento: Un fallo/);
    assert.equal(m[6], 'Siguiente: iteración 31, mantenimiento · Errores: pendiente 1 (Un fallo, que sigue en otra línea.)');
  });

  test('--siguiente sale 2 sin ítem para expansión y 1 sin iteraciones', () => {
    const archivo = join(dir, 'vacio.md');
    writeFileSync(archivo, fixture({ items: 6, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50, 6: 51 } }));
    const r = cli('--siguiente', '--archivo', archivo);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /ERROR: no hay ítem para expansión/);
    writeFileSync(archivo, '# Nada\n\n## Bitácora\n');
    assert.equal(cli('--siguiente', '--archivo', archivo).status, 1);
  });

  test('--help sale 0 y nombra todos los flags; una opción desconocida sale 1', () => {
    const r = cli('--help');
    assert.equal(r.status, 0);
    for (const f of FLAGS) assert.ok(r.stdout.includes(f), f);
    assert.equal(cli('--nada').status, 1);
  });
});

/* ----------------------------------------------------------- el archivo real */

describe('IMPROVEMENTS.md real', () => {
  const real = readFileSync(join(root, 'IMPROVEMENTS.md'), 'utf8');

  test('cumple todas las reglas sin ningún ERROR', () => {
    const r = check(real);
    assert.equal(r.errores, 0, r.salida);
  });

  test('--siguiente da la iteración que sigue a la última de la bitácora', () => {
    const M = Math.max(...parse(real).bitacora.filter((e) => e.n !== null).map((e) => e.n));
    const s = siguiente(real);
    assert.equal(s.n, M + 1);
    assert.equal(s.rama, `loop/${M + 1}`);
    if (s.tipo === 'Expansión') assert.ok(EJES.includes(s.eje));
  });
});

/* ------------------------------------------------------------- reclamar */

describe('--reclamar contra un repositorio bare', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-'));
  const bare = join(dir, 'bare.git');
  const A = join(dir, 'A');
  const B = join(dir, 'B');
  const ENV = { ...process.env, GIT_AUTHOR_NAME: 'prueba', GIT_AUTHOR_EMAIL: 'p@p', GIT_COMMITTER_NAME: 'prueba', GIT_COMMITTER_EMAIL: 'p@p', CLAUDE_CODE_REMOTE_SESSION_ID: 'sesion-de-prueba' };
  const git = (cwd, args, env = ENV) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const reclamar = (repo, ...extra) => spawnSync(process.execPath, [loop, '--reclamar', '--sin-red', '--repo', repo, ...extra], { encoding: 'utf8', env: ENV });
  const ramas = () => git(dir, ['ls-remote', '--heads', bare]);

  const envAntes = {};
  before(() => {
    // reclamar() corrido en este proceso (prueba del lease) commitea con el entorno del proceso
    for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
      envAntes[k] = process.env[k];
      process.env[k] = ENV[k];
    }
    git(dir, ['init', '-q', '--bare', '--initial-branch=master', bare]);
    const semilla = join(dir, 'semilla');
    git(dir, ['clone', '-q', bare, semilla]);
    git(semilla, ['symbolic-ref', 'HEAD', 'refs/heads/master']);
    writeFileSync(join(semilla, 'IMPROVEMENTS.md'), fixture());
    git(semilla, ['add', 'IMPROVEMENTS.md']);
    git(semilla, ['commit', '-q', '-m', 'semilla']);
    git(semilla, ['push', '-q', 'origin', 'master']);
    git(dir, ['clone', '-q', bare, A]);
    git(dir, ['clone', '-q', bare, B]);
  });
  after(() => {
    for (const [k, v] of Object.entries(envAntes)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    rmSync(dir, { recursive: true, force: true });
  });

  test('la primera sesión reclama: crea loop/28 en origin con un commit vacío y sale 0', () => {
    const r = reclamar(A);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^Iteración 28 · Expansión · Fuentes\n/);
    assert.match(r.stdout, /\nReclamada la iteración 28 \(ítem 6, Fuentes\): rama loop\/28\n/);
    assert.match(r.stdout, /\nRamas loop\/\* de iteraciones ya fusionadas \(inocuas\): ninguna\n?$/);
    assert.match(ramas(), /refs\/heads\/loop\/28$/m);
    assert.match(git(A, ['log', '-1', '--format=%s', 'origin/loop/28']), /^Iteración 28: reclamo \d{4}-\d{2}-\d{2}T.* · ítem 6 \(Ítem 6\) · sesión sesion-de-prueba$/);
    assert.equal(git(A, ['rev-parse', '--abbrev-ref', 'HEAD']), 'loop/28');
  });

  test('la segunda sesión la encuentra ocupada y sale 3', () => {
    const r = reclamar(B);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /\nOcupada: la iteración 28 la trabaja otra sesión desde hace 0 min \(loop\/28: "Iteración 28: reclamo /);
    assert.doesNotMatch(ramas(), /loop\/28-vencida/);
  });

  test('a las 7 horas sin commits está vencida (4); con --relevo se conserva el trabajo y se releva (0); el relevo viejo ya no puede (3)', () => {
    const hace7h = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
    const viejo = { ...ENV, GIT_AUTHOR_DATE: hace7h, GIT_COMMITTER_DATE: hace7h };
    git(A, ['commit', '-q', '--amend', '--allow-empty', '-m', 'Iteración 28: reclamo viejo'], viejo);
    writeFileSync(join(A, 'trabajo.txt'), 'medio hecho\n');
    git(A, ['add', 'trabajo.txt']);
    git(A, ['commit', '-q', '-m', 'trabajo a medias'], viejo);
    git(A, ['push', '-q', '--force', 'origin', 'loop/28']);
    const sha7 = git(A, ['rev-parse', 'HEAD']).slice(0, 7);

    const vencida = reclamar(B);
    assert.equal(vencida.status, 4, vencida.stdout + vencida.stderr);
    assert.match(vencida.stdout, new RegExp(`\\nVencida: loop/28 lleva 7 h sin commits \\(${sha7}\\) · PR abierto: no se pudo consultar \\(--sin-red\\)\\n`));
    assert.doesNotMatch(ramas(), /loop\/28-vencida/);

    const relevo = reclamar(B, '--relevo');
    assert.equal(relevo.status, 0, relevo.stdout + relevo.stderr);
    assert.match(relevo.stdout, /\nRelevada la iteración 28 \(ítem 6, Fuentes\): rama loop\/28\n/);
    assert.match(ramas(), new RegExp(`refs/heads/loop/28-vencida-${sha7}$`, 'm'));
    assert.match(git(B, ['log', '-1', '--format=%s', 'origin/loop/28']), /^Iteración 28: relevo /);
    assert.equal(git(B, ['rev-list', '--count', 'origin/master..origin/loop/28']), '1');

    const tarde = reclamar(A, '--relevo');
    assert.equal(tarde.status, 3, tarde.stdout + tarde.stderr);
    assert.match(tarde.stdout, /\nOcupada: /);
  });

  test('con --horas 24 la misma rama todavía está ocupada', () => {
    const hace7h = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
    git(B, ['commit', '-q', '--amend', '--allow-empty', '-m', 'Iteración 28: relevo viejo'], { ...ENV, GIT_AUTHOR_DATE: hace7h, GIT_COMMITTER_DATE: hace7h });
    git(B, ['push', '-q', '--force', 'origin', 'loop/28']);
    assert.equal(reclamar(A, '--horas', '24').status, 3);
    assert.equal(reclamar(A).status, 4);
  });

  test('las ramas loop/K de iteraciones ya fusionadas se listan y no se borran', () => {
    git(A, ['push', '-q', 'origin', 'origin/master:refs/heads/loop/25', 'origin/master:refs/heads/loop/27']);
    const r = reclamar(B);
    assert.match(r.stdout, /\nRamas loop\/\* de iteraciones ya fusionadas \(inocuas\): loop\/25, loop\/27\n?$/);
    assert.match(ramas(), /refs\/heads\/loop\/25$/m);
  });

  test('el relevo con lease pierde si otra sesión relevó entre el fetch y el push (3), y no pisa su commit', async () => {
    const C2 = join(dir, 'C2');
    git(dir, ['clone', '-q', bare, C2]);
    let ajeno = null;
    const salida = [];
    const antesDelPush = () => {
      git(C2, ['checkout', '-q', '-B', 'loop/28', 'origin/master']);
      git(C2, ['commit', '-q', '--allow-empty', '-m', 'Iteración 28: relevo ajeno']);
      git(C2, ['push', '-q', '--force', 'origin', 'loop/28']);
      ajeno = git(C2, ['rev-parse', 'HEAD']);
    };
    // en este proceso (no por el CLI): el gancho tiene que correr entre el fetch y el push con lease
    const codigo = await reclamarEnProceso({ repo: B, relevo: true, sinRed: true, sesion: 'prueba', antesDelPush, print: (l) => salida.push(l) });
    assert.equal(codigo, 3, salida.join('\n'));
    assert.ok(salida.includes('Ocupada: otra sesión relevó loop/28'), salida.join('\n'));
    assert.equal(git(dir, ['ls-remote', '--heads', bare, 'loop/28']).split('\t')[0], ajeno, 'el commit de la otra sesión sigue en origin');
  });

  test('--salud --sin-red lee origin/master y las ramas de origin: la loop/K fusionada es una Acción (3)', () => {
    git(A, ['fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
    const r = spawnSync(process.execPath, [loop, '--salud', '--sin-red', '--repo', A], { encoding: 'utf8', env: ENV });
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /^Cadencia: \d+ iteraciones desde la directiva/m);
    assert.match(r.stdout, /^Acción: borrar loop\/25, de una iteración ya fusionada/m);
    assert.match(r.stdout, /^Issues: no se pudo consultar \(--sin-red\)/m);
    assert.match(r.stdout, /--salud: \d+ acción\(es\)\n$/);
  });

  test('sin acceso a origin sale 5 y no toca nada', () => {
    const C = join(dir, 'C');
    git(dir, ['clone', '-q', bare, C]);
    git(C, ['remote', 'set-url', 'origin', join(dir, 'no', 'existe')]);
    const r = reclamar(C);
    assert.equal(r.status, 5, r.stdout + r.stderr);
    assert.match(r.stdout, /^Sin acceso a origin: no se puede reclamar ni publicar \(/);
  });
});

/* ------------------------------------------------------------- publicado */

describe('--publicado con un fetch simulado', () => {
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
  const base = { homepage: 'https://alguien.github.io/Algo/', owner: 'alguien', repo: 'Algo', swLocal: 'const FILES = [];\n' };

  test('sw.js igual al de origin/master: al día, 0', async () => {
    const pedidas = [];
    const r = await publicado({ ...base, fetch: async (url) => (pedidas.push(url), resp(200, base.swLocal)) });
    assert.deepEqual(r, { codigo: 0, linea: 'Web publicada al día (sw.js = origin/master)' });
    assert.deepEqual(pedidas, ['https://alguien.github.io/Algo/sw.js']);
  });

  test('sw.js distinto: atrasada, 2', async () => {
    const r = await publicado({ ...base, fetch: async () => resp(200, 'otro') });
    assert.equal(r.codigo, 2);
    assert.match(r.linea, /^Web publicada atrasada: sw\.js no coincide con origin\/master/);
  });

  test('404 y has_pages=false: sin publicar, 2, con lo que tiene que hacer Benjamin', async () => {
    const r = await publicado({ ...base, fetch: async (url) => (url.endsWith('sw.js') ? resp(404, 'no') : resp(200, '{"has_pages":false}')) });
    assert.equal(r.codigo, 2);
    assert.match(r.linea, /^Web sin publicar: https:\/\/alguien\.github\.io\/Algo\/ responde 404 y el repo tiene has_pages=false\. Benjamin: Settings → Pages/);
  });

  test('sin red: no se pudo comprobar, 4', async () => {
    const r = await publicado({
      ...base,
      fetch: async () => {
        throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
      },
    });
    assert.equal(r.codigo, 4);
    assert.equal(r.linea, 'Web publicada: no se pudo comprobar (getaddrinfo ENOTFOUND)');
    const cuota = await publicado({ ...base, fetch: async (url) => (url.endsWith('sw.js') ? resp(404, 'no') : resp(403, '{}')) });
    assert.equal(cuota.codigo, 4);
    assert.match(cuota.linea, /403: cuota agotada/);
  });
});
