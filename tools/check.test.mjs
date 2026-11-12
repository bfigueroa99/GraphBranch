#!/usr/bin/env node
/* Pruebas de tools/check.mjs, la puerta: lo que decide sin abrir un navegador. Que un smoke en rojo por un
   paso suelto se repite solo con su sección (y cuándo eso vale y cuándo sigue siendo rojo), con corridas del
   smoke de mentira; que del registro del smoke se leen las secciones y los pasos que fallaron; que de la salida
   de node --test sale el error de cada prueba que falló; y que el smoke de verdad está partido en secciones que
   se pueden pedir sueltas. Ninguna abre Chromium ni sale a la red.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/check.test.mjs      solo estas */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { REPETICIONES, REPETIR_PASOS, REPETIR_SECCIONES, fallosSmoke, fallosTap, nombrePaso, repetible, validarSmoke } from './check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** El registro de una corrida del smoke: por sección, los pasos que pasan y los que fallan (nombre → error). */
function registro(secciones) {
  const lineas = [];
  let fallos = 0;
  const con = [];
  for (const [titulo, pasos] of Object.entries(secciones)) {
    lineas.push(titulo);
    const malos = [];
    for (const [paso, error] of Object.entries(pasos)) {
      if (error) {
        fallos++;
        malos.push(paso);
        lineas.push(`  ✗ ${paso}: ${error}`);
      } else lineas.push(`  ✓ ${paso}`);
    }
    if (malos.length) con.push([titulo, malos]);
  }
  if (!fallos) return { status: 0, salida: `${lineas.join('\n')}\n\nTodo bien.\n`, ms: 1000 };
  lineas.push('', `${fallos} fallo(s).`);
  for (const [titulo, malos] of con) lineas.push(`§ ${titulo}`, ...malos.map((p) => `· ${p}`));
  return { status: 1, salida: `${lineas.join('\n')}\n`, ms: 1000 };
}

/** Un smoke de mentira: devuelve una corrida por llamada y anota con qué argumentos se lo llamó. */
function smokeDeMentira(...corridas) {
  const llamadas = [];
  const correr = (extra) => {
    llamadas.push(extra);
    const r = corridas.shift();
    assert.ok(r, 'el smoke se corrió más veces de las previstas');
    return r;
  };
  return { correr, llamadas };
}

const ESCRITORIO = 'Escritorio (1280×800)';
const FICHA = 'la ficha de un commit de agente dice cuál es, con su modelo y su sesión (2D)';
const EDITAR = 'editar el código: desde los cambios de un commit se abre su archivo';

describe('fallosSmoke y repetible', () => {
  test('lee las secciones con fallos, los pasos que fallaron en ellas y sus errores', () => {
    const r = registro({ [ESCRITORIO]: { 'carga la demo': '', [FICHA]: 'ninguna ficha de rama dice su agente: ""' }, GitLab: { 'conecta un proyecto': '' } });
    const f = fallosSmoke(r.salida);
    assert.deepEqual(f.secciones, [ESCRITORIO]);
    assert.deepEqual(f.pasos, [FICHA]);
    assert.equal(f.errores.length, 1);
    assert.match(f.errores[0], /ninguna ficha de rama dice su agente/);
    assert.ok(repetible(f));
  });

  test('un paso cuyo nombre lleva «: » se nombra entero, sin su error', () => {
    const r = registro({ [ESCRITORIO]: { [EDITAR]: 'page.waitForFunction: Timeout 15000ms exceeded.' } });
    assert.deepEqual(fallosSmoke(r.salida).pasos, [EDITAR]);
  });

  test(`más de ${REPETIR_PASOS} pasos o de ${REPETIR_SECCIONES} secciones no es una intermitencia: no se repite`, () => {
    const muchos = Object.fromEntries(Array.from({ length: REPETIR_PASOS + 1 }, (_, i) => [`paso ${i}`, 'roto']));
    assert.ok(!repetible(fallosSmoke(registro({ [ESCRITORIO]: muchos }).salida)));
    const regadas = Object.fromEntries(Array.from({ length: REPETIR_SECCIONES + 1 }, (_, i) => [`Sección ${i}`, { [`paso ${i}`]: 'roto' }]));
    assert.ok(!repetible(fallosSmoke(registro(regadas).salida)));
  });

  test('un smoke que murió sin decir en qué sección (sin «§») no se repite', () => {
    const f = fallosSmoke(`${ESCRITORIO}\n  ✓ carga la demo\nbrowserType.launch: Executable doesn't exist\n`);
    assert.deepEqual(f.secciones, []);
    assert.ok(!repetible(f));
  });

  test('nombrePaso acorta lo que no cabe en la línea Validado', () => {
    assert.equal(nombrePaso('corto'), 'corto');
    const largo = nombrePaso('x'.repeat(200));
    assert.equal(largo.length, 70);
    assert.ok(largo.endsWith('…'));
  });
});

describe('validarSmoke: la repetición por secciones', () => {
  test('en verde a la primera: una sola corrida, sin intermitentes', () => {
    const s = smokeDeMentira(registro({ [ESCRITORIO]: { 'carga la demo': '' } }));
    const v = validarSmoke(s.correr);
    assert.equal(v.rojo, null);
    assert.deepEqual(v.intermitentes, []);
    assert.deepEqual(s.llamadas, [[]]);
  });

  test('un paso que falla una vez y pasa con su sección sola es intermitente: el smoke vale y lo nombra', () => {
    const s = smokeDeMentira(
      registro({ [ESCRITORIO]: { 'carga la demo': '', [FICHA]: 'ninguna ficha de rama dice su agente: ""' }, GitLab: { 'conecta un proyecto': '' } }),
      registro({ [ESCRITORIO]: { 'carga la demo': '', [FICHA]: '' } }),
    );
    const avisos = [];
    const v = validarSmoke(s.correr, { avisar: (f, ronda) => avisos.push([f.secciones, ronda]) });
    assert.equal(v.rojo, null);
    assert.deepEqual(v.intermitentes, [FICHA]);
    assert.equal(v.ms, 1000);
    // la repetición pide solo la sección del paso que falló, no el smoke entero
    assert.deepEqual(s.llamadas, [[], ['--seccion', ESCRITORIO]]);
    assert.deepEqual(avisos, [[[ESCRITORIO], 1]]);
  });

  test('el mismo paso en rojo dos veces no es una intermitencia: rojo, con la segunda corrida', () => {
    const roto = registro({ [ESCRITORIO]: { 'carga la demo': '', [FICHA]: 'ninguna ficha de rama dice su agente: ""' } });
    const s = smokeDeMentira(roto, roto);
    const v = validarSmoke(s.correr);
    assert.equal(v.rojo, roto);
    assert.match(v.motivo, /falló dos veces/);
    assert.equal(s.llamadas.length, 2);
  });

  test('si la repetición falla en otro paso, ese también tiene que pasar una vez: otra repetición y vale', () => {
    const s = smokeDeMentira(
      registro({ [ESCRITORIO]: { [FICHA]: 'vacía', [EDITAR]: '' } }),
      registro({ [ESCRITORIO]: { [FICHA]: '', [EDITAR]: 'Timeout 15000ms exceeded' } }),
      registro({ [ESCRITORIO]: { [FICHA]: '', [EDITAR]: '' } }),
    );
    const v = validarSmoke(s.correr);
    assert.equal(v.rojo, null);
    assert.deepEqual(v.intermitentes, [FICHA, EDITAR]);
    assert.equal(s.llamadas.length, 3);
  });

  test(`tras ${REPETICIONES} repeticiones con un paso distinto en rojo cada vez, es rojo: el smoke no es confiable`, () => {
    const corridas = Array.from({ length: REPETICIONES + 1 }, (_, i) => registro({ [ESCRITORIO]: { [`paso ${i}`]: 'roto' } }));
    const s = smokeDeMentira(...corridas);
    const v = validarSmoke(s.correr);
    assert.equal(v.rojo, corridas.at(-1));
    assert.match(v.motivo, /un paso distinto/);
    assert.equal(s.llamadas.length, REPETICIONES + 1);
  });

  test('un cambio que rompe muchos pasos no se repite: rojo con la primera corrida', () => {
    const muchos = registro({ [ESCRITORIO]: Object.fromEntries(Array.from({ length: REPETIR_PASOS + 2 }, (_, i) => [`paso ${i}`, 'roto'])) });
    const s = smokeDeMentira(muchos);
    const v = validarSmoke(s.correr);
    assert.equal(v.rojo, muchos);
    assert.equal(s.llamadas.length, 1);
  });

  test('una repetición que no corrió nada (sale 0 sin ningún ✓, o muere sin «§») no cuenta como verde', () => {
    const primera = () => registro({ [ESCRITORIO]: { [FICHA]: 'vacía' } });
    const vacia = { status: 0, salida: '\nTodo bien.\n', ms: 5 };
    assert.equal(validarSmoke(smokeDeMentira(primera(), vacia).correr).rojo, vacia);
    const muerta = { status: 1, salida: 'browserType.launch: Target closed\n', ms: 5 };
    const v = validarSmoke(smokeDeMentira(primera(), muerta).correr);
    assert.equal(v.rojo, muerta);
    assert.match(v.motivo, /no terminó/);
  });
});

describe('fallosTap: el error de cada prueba que falló en node --test', () => {
  const TAP = `TAP version 13
# Subtest: IMPROVEMENTS.md real
    # Subtest: cumple todas las reglas sin ningún ERROR
    not ok 1 - cumple todas las reglas sin ningún ERROR
      ---
      duration_ms: 12.3
      type: 'test'
      location: '/repo/tools/loop.test.mjs:1320:3'
      failureType: 'testCodeFailure'
      error: |-
        ERROR R6 la última entrada no tiene «- Validado:»

        1 !== 0

      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      stack: |-
        TestContext.<anonymous> (file:///repo/tools/loop.test.mjs:1322:12)
      ...
    # Subtest: --siguiente da la iteración que sigue
    ok 2 - --siguiente da la iteración que sigue
      ---
      duration_ms: 1.1
      type: 'test'
      ...
    1..2
not ok 361 - IMPROVEMENTS.md real
  ---
  duration_ms: 20.1
  type: 'suite'
  location: '/repo/tools/loop.test.mjs:1313:1'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: el cuerpo de Teams es una tarjeta adaptable
ok 465 - el cuerpo de Teams es una tarjeta adaptable
  ---
  duration_ms: 0.3
  type: 'test'
  ...
1..469
# tests 602
# pass 601
# fail 1
`;

  test('da la prueba que falló con su error, sin la traza, y no la suite que solo la contiene', () => {
    const f = fallosTap(TAP);
    assert.equal(f.length, 1);
    assert.equal(f[0].nombre, 'cumple todas las reglas sin ningún ERROR');
    assert.ok(f[0].error.some((l) => l.includes('ERROR R6 la última entrada no tiene «- Validado:»')), f[0].error.join('\n'));
    assert.ok(!f[0].error.some((l) => /stack|TestContext/.test(l)));
  });

  test('sin pruebas en rojo, nada; y nunca más de las que se piden', () => {
    assert.deepEqual(fallosTap('ok 1 - algo\n# pass 1\n'), []);
    const muchas = Array.from({ length: 9 }, (_, i) => `not ok ${i + 1} - prueba ${i}\n  ---\n  type: 'test'\n  error: 'falló ${i}'\n  code: 'X'\n  ...`).join('\n');
    assert.equal(fallosTap(muchas, 4).length, 4);
    assert.deepEqual(fallosTap(muchas, 1)[0], { nombre: 'prueba 0', error: ["error: 'falló 0'"] });
  });
});

describe('la puerta como comando', () => {
  const puerta = join(root, 'tools', 'check.mjs');

  test('corrida como comando valida sus opciones (sale 1 con una desconocida), también detrás de un enlace simbólico', () => {
    const r = spawnSync(process.execPath, [puerta, '--no-existe'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /opción desconocida: --no-existe/);
    // por un enlace al repo, la ruta escrita no es la real: la puerta tiene que correr igual, no salir 0 sin medir
    const dir = mkdtempSync(join(tmpdir(), 'check-'));
    try {
      symlinkSync(root, join(dir, 'repo'), 'dir');
      const e = spawnSync(process.execPath, [join(dir, 'repo', 'tools', 'check.mjs'), '--no-existe'], { cwd: root, encoding: 'utf8' });
      assert.equal(e.status, 1, `por el enlace salió ${e.status}: ${e.stdout}${e.stderr}`);
      assert.match(e.stderr, /opción desconocida: --no-existe/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('importada no corre nada: las pruebas usan sus funciones sin lanzar la puerta', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(puerta)}); console.log(typeof m.validarSmoke);`], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'function');
  });
});

describe('el smoke de verdad, por secciones', () => {
  const smoke = join(root, 'tools', 'smoke.mjs');
  const listar = () => spawnSync(process.execPath, [smoke, '--secciones'], { cwd: root, encoding: 'utf8' });

  test('--secciones lista los títulos sin abrir el navegador, sin repetir ninguno', () => {
    const r = listar();
    assert.equal(r.status, 0, r.stderr);
    const titulos = r.stdout.trim().split('\n');
    assert.ok(titulos.length >= 40, `solo ${titulos.length} secciones`);
    assert.ok(titulos.includes(ESCRITORIO));
    assert.equal(new Set(titulos).size, titulos.length);
    assert.ok(!/[✓✗]/.test(r.stdout), 'listar no corre ningún paso');
  });

  test('--seccion elige la del título exacto y --solo las que lo contienen; sin ninguna que coincida, sale 2', () => {
    // con --secciones el smoke dice cuáles correría, sin abrir el navegador
    const cuales = (...args) => spawnSync(process.execPath, [smoke, '--secciones', ...args], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(cuales('--seccion', 'Bitbucket').stdout.trim().split('\n'), ['Bitbucket']);
    assert.deepEqual(cuales('--solo', 'Bitbucket').stdout.trim().split('\n'), ['Bitbucket', 'Bitbucket propio con token']);
    assert.deepEqual(cuales('--seccion', 'Bitbucket', '--seccion', 'GitLab').stdout.trim().split('\n'), ['GitLab', 'Bitbucket']);
    const nada = cuales('--seccion', 'No existe');
    assert.equal(nada.status, 2);
    assert.match(nada.stdout, /Ninguna sección coincide con No existe/);
  });

  test('cada bloque de primer nivel del smoke es una sección: ningún paso corre fuera de «if (seccion(…))»', () => {
    const lineas = readFileSync(smoke, 'utf8').split('\n');
    const sueltos = lineas.filter((l) => /^console\.log\(['`][^\\]/.test(l));
    assert.deepEqual(sueltos, [], 'un título de sección va como «if (seccion(…))», no como console.log suelto');
    // un bloque o un bucle de primer nivel va detrás de su guarda
    lineas.forEach((l, i) => {
      if (l === '{' || /^for \(.*\) \{$/.test(l)) assert.match(lineas[i - 1], /^if \(seccion\(/, `línea ${i + 1}: un bloque de primer nivel sin su sección`);
    });
    assert.ok(lineas.filter((l) => /^if \(seccion\(/.test(l)).length >= 40);
  });
});
