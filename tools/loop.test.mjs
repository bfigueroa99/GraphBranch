#!/usr/bin/env node
/* Pruebas de tools/loop.mjs: la elección de la iteración (--siguiente), las reglas de --check (R1 a
   R9), el reclamo de la rama (--reclamar, contra un repositorio bare local) y --publicado (con un
   fetch simulado). Ninguna corre node --test, npm run check, el smoke ni Playwright.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/loop.test.mjs     solo estas */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EJES, FLAGS, LoopError, check, parse, publicado, siguiente } from './loop.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const loop = join(root, 'tools', 'loop.mjs');

/* ----------------------------------------------------------------- fixture */

// los ejes de la hoja de ruta real y sus ítems hechos, para que las pruebas digan lo mismo que el archivo
const EJES_HOJA = ['Plataformas', 'Salidas', 'Salidas', 'Fuentes', 'Fuentes', 'Fuentes', 'Escala', 'Escala', 'Datos', 'Fuentes', 'Plataformas', 'Análisis', 'Fuentes', 'Análisis', 'Salidas', 'Público', 'Datos', 'Público', 'Análisis', 'Análisis', 'Fuentes', 'Fuentes', 'Salidas', 'Plataformas'];
const HECHOS = { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50, 7: 51 };
const EXPANSIONES = ['Plataformas', 'Salidas', 'Fuentes', 'Salidas', 'Fuentes', 'Escala', 'Datos', 'Público'];
const LOG = [45, 46, 47, 48, 49, 50, 51, 52].map((k) => `un cambio (#${k})`);
const SIGUIENTE_28 = 'iteración 28, expansión: ítem 6 (GitLab, tercera entrega, Fuentes)';

/** Una entrada de la bitácora. `titulo` reemplaza la cabecera de iteración (entradas que no lo son). */
function entrada({ n, tipo, eje, titulo, validado = true, siguiente, cuerpo = '' }) {
  const cab = titulo ?? (n < 20 ? `Iteración ${n}` : tipo === 'Mantenimiento' ? `Iteración ${n} · Mantenimiento` : `Iteración ${n} · Expansión · ${eje}`);
  const lineas = [`### 2026-10-12 · ${cab}`, '', `- **Trabajo:** lo que se hizo.${cuerpo}`];
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

/** Un IMPROVEMENTS.md mínimo y válido. `items` es un número o la lista de ejes de la hoja de ruta. */
function fixture({ iteraciones: n = 27, items = 24, hechos = HECHOS, pendientes = 13, alta = null, siguiente = SIGUIENTE_28, validado = true, mapa = EJES, entradas } = {}) {
  const ejes = Array.isArray(items) ? items : Array.from({ length: items }, (_, i) => EJES_HOJA[i % EJES_HOJA.length]);
  const hoja = ejes.map((eje, i) => {
    const k = i + 1;
    return hechos[k] ? `${k}. ~~**Ítem ${k}**~~ hecho en #${hechos[k]} · ${eje}. Detalle.` : `${k}. **Ítem ${k}** · ${eje}. Detalle del ítem\n   en dos líneas.`;
  });
  const base = alta ? 1 : 0;
  const mant = Array.from({ length: pendientes }, (_, i) => `${i + 1 + base}. Pendiente ${i + 1} de mantenimiento (\`app.js:1\`),\n    que sigue en otra línea.`);
  const bit = entradas ?? iteraciones(n, { validado, siguiente });
  return [
    '# Mejora continua',
    '',
    '## Directiva vigente: ampliar el alcance',
    '',
    'Texto de la directiva.',
    '',
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
    ...(alta ? ['### Alta', '', `1. ${alta}`, ''] : []),
    '### Baja',
    '',
    ...mant,
    '',
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

  test('N mod 4 = 3 es de mantenimiento y toma el primer pendiente', () => {
    const s = siguiente(fixture({ iteraciones: 30 }));
    assert.equal(s.n, 31);
    assert.equal(s.tipo, 'Mantenimiento');
    assert.equal(s.eje, null);
    assert.equal(s.item, 1);
    assert.equal(s.motivo, '31 mod 4 = 3');
    assert.match(s.titulo, /^Pendiente 1 de mantenimiento \(`app.js:1`\), que sigue/);
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
    assert.equal(s.item, 1);
    assert.equal(s.motivo, 'pendiente Alta: va antes que todo');
    assert.match(s.titulo, /^\*\*Alta\*\*/);
  });

  test('sin ítems pendientes en la hoja de ruta, código 2', () => {
    const err = falla(() => siguiente(fixture({ items: 6, hechos: { 1: 45, 2: 46, 3: 49, 4: 47, 5: 50, 6: 51 } })));
    assert.equal(err.codigo, 2);
    assert.match(err.message, /reponer la hoja de ruta/);
  });

  test('mantenimiento sin pendientes, código 2', () => {
    const err = falla(() => siguiente(fixture({ iteraciones: 30, pendientes: 0 })));
    assert.equal(err.codigo, 2);
    assert.match(err.message, /Mantenimiento sin pendientes/);
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
    const r = check(fixture(), { dir: mkdtempSync(join(tmpdir(), 'loop-')) });
    assert.equal(nivel(r, 'R3'), 'aviso');
    assert.match(texto(r, 'R3'), /sin origin\/master/);
  });

  test('R1: el Mapa de alcance con 6 filas es un error, y también fuera de orden', () => {
    assert.equal(nivel(ok({ mapa: EJES.slice(0, 6) }), 'R1'), 'ERROR');
    assert.equal(nivel(ok({ mapa: [...EJES].reverse() }), 'R1'), 'ERROR');
  });

  test('R2: un ítem de la hoja que no cumple el patrón o salta la numeración es un error', () => {
    const r = check(fixture().replace('6. **Ítem 6** · Fuentes.', '6. **Ítem 6** · Marte.'), { log: LOG });
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

  test('R7: mantenimiento vacío es un error, con 2 un aviso, y la numeración no salta', () => {
    const vacio = ok({ pendientes: 0 });
    assert.equal(nivel(vacio, 'R7'), 'ERROR');
    assert.match(texto(vacio, 'R7'), /auditar y cargar pendientes/);
    assert.equal(nivel(ok({ pendientes: 2 }), 'R7'), 'aviso');
    const salto = check(fixture().replace('4. Pendiente 4', '5. Pendiente 4'), { log: LOG });
    assert.equal(nivel(salto, 'R7'), 'ERROR');
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
    const r = check(fixture(), { log: LOG, dir: mkdtempSync(join(tmpdir(), 'loop-')) });
    assert.equal(nivel(r, 'R8'), 'aviso');
    assert.match(texto(r, 'R8'), /sin skill/);
  });

  test('los archivos reales del repo pasan R8', () => {
    const r = check(fixture(), { log: LOG });
    assert.equal(nivel(r, 'R8'), 'ok', r.salida);
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

  test('--siguiente imprime las seis líneas y --json el objeto', () => {
    const archivo = join(dir, 'siguiente.md');
    writeFileSync(archivo, fixture());
    const r = cli('--siguiente', '--archivo', archivo);
    assert.equal(r.status, 0, r.stderr);
    const lineas = r.stdout.trim().split('\n');
    assert.equal(lineas.length, 6);
    assert.equal(lineas[0], 'Iteración 28 · Expansión · Fuentes');
    assert.equal(lineas[1], 'Ítem 6 de la hoja de ruta: Ítem 6');
    assert.equal(lineas[3], 'Rama: loop/28');
    assert.match(lineas[4], /^Declarado en la iteración 27: iteración 28/);
    assert.equal(lineas[5], 'Hoja de ruta: 18 pendientes, 6 hechos · mantenimiento: 13 pendientes');
    const j = JSON.parse(cli('--siguiente', '--json', '--archivo', archivo).stdout);
    assert.equal(j.item, 6);
    assert.equal(j.rama, 'loop/28');
    writeFileSync(archivo, fixture({ iteraciones: 30 }));
    const m = cli('--siguiente', '--archivo', archivo).stdout.split('\n');
    assert.equal(m[0], 'Iteración 31 · Mantenimiento');
    assert.match(m[1], /^Pendiente 1 de mantenimiento: Pendiente 1/);
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

  before(() => {
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
  after(() => rmSync(dir, { recursive: true, force: true }));

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
