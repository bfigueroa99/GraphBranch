#!/usr/bin/env node
/* Pruebas de tools/esperar.mjs: las opciones, y contra comandos de Node de mentira (cada uno en su carpeta de
   estado temporal, por ESPERAR_DIR), que el comando corre desprendido y su salida queda en el log, que la espera
   devuelve su código, sale 124 mientras sigue y 125 si el vigilante muere sin dejarlo, y que no se lanzan dos con
   el mismo nombre. Ninguna sale a la red.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/esperar.test.mjs      solo estas */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MAX_S, MURIO, SIGUE, USO_MAL, carpeta, esperar, lanzar, opciones, vivo } from './esperar.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'tools', 'esperar.mjs');
const dirs = [];
const dirNuevo = () => {
  const d = mkdtempSync(join(tmpdir(), 'esperar-'));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Un comando de Node que imprime, tarda `ms` y sale con `codigo`. */
const nodo = (codigo, ms = 0, texto = 'hola') => [process.execPath, '-e', `console.log(${JSON.stringify(texto)}); console.error('por stderr'); setTimeout(() => process.exit(${codigo}), ${ms})`];
const juntar = () => {
  const lineas = [];
  return { print: (l) => lineas.push(l), lineas };
};

describe('opciones', () => {
  test('--lanzar con nombre y comando tras --; la espera, con el nombre solo', () => {
    assert.deepEqual(opciones(['--lanzar', 'puerta', '--', 'npm', 'run', 'check']).comando, ['npm', 'run', 'check']);
    const o = opciones(['puerta']);
    assert.equal(o.nombre, 'puerta');
    assert.equal(o.max, MAX_S);
    assert.equal(opciones(['puerta', '--max', '30', '--cada', '5']).cada, 5);
  });

  test('cada llamada de espera entra en una llamada de 600 s de la herramienta de shell', () => {
    assert.ok(MAX_S + 30 <= 600, `MAX_S ${MAX_S} deja menos de 30 s de margen bajo los 600 s`);
  });

  test('sin nombre, un nombre con barras, --lanzar sin comando, un comando sin --lanzar o --max no numérico son error de uso', () => {
    assert.throws(() => opciones([]), /falta el nombre/);
    assert.throws(() => opciones(['../x']), /no es válido/);
    assert.throws(() => opciones(['--lanzar', 'puerta']), /falta el comando/);
    assert.throws(() => opciones(['puerta', '--', 'ls']), /solo con --lanzar/);
    assert.throws(() => opciones(['puerta', '--max', 'mucho']), /--max/);
    assert.throws(() => opciones(['--rapido']), /opción desconocida/);
  });

  test('el estado vive fuera del repo: las e2e vacían test-results/ a mitad de la puerta', () => {
    const d = carpeta({}, root);
    assert.ok(!d.startsWith(root), `${d} está dentro del repo`);
    assert.equal(carpeta({ ESPERAR_DIR: '/x/y' }, root), '/x/y');
    assert.notEqual(carpeta({}, '/otro/worktree'), d, 'dos worktrees comparten carpeta y se pisan los nombres');
  });
});

describe('lanzar y esperar', () => {
  test('el comando corre desprendido, su salida va al log y la espera devuelve su código', async () => {
    const dir = dirNuevo();
    const l = juntar();
    assert.equal(lanzar({ nombre: 'tres', comando: nodo(3, 200, 'Validado: todo'), dir, print: l.print }), 0);
    assert.match(l.lineas.join('\n'), /Lanzado «tres»/);
    const e = juntar();
    assert.equal(await esperar({ nombre: 'tres', dir, max: 20, print: e.print, sondeo: 50 }), 3);
    const salida = e.lineas.join('\n');
    assert.match(salida, /Validado: todo/);
    assert.match(salida, /por stderr/);
    assert.match(salida, /terminó con código 3/);
    assert.match(readFileSync(join(dir, 'tres.log'), 'utf8'), /Validado: todo/);
  });

  test('mientras sigue, la espera sale 124 al llegar a --max sin matarlo; la siguiente llamada lo ve terminar', async () => {
    const dir = dirNuevo();
    lanzar({ nombre: 'lento', comando: nodo(0, 2500), dir, print: () => {} });
    const t0 = Date.now();
    const e = juntar();
    assert.equal(await esperar({ nombre: 'lento', dir, max: 0.5, print: e.print, sondeo: 50 }), SIGUE);
    assert.ok(Date.now() - t0 < 2000, 'la espera no respetó --max');
    assert.match(e.lineas.join('\n'), /sigue corriendo.*sin cerrar el turno/);
    const estado = JSON.parse(readFileSync(join(dir, 'lento.json'), 'utf8'));
    assert.ok(vivo(estado.pid), 'la espera mató al comando');
    assert.equal(await esperar({ nombre: 'lento', dir, max: 20, print: () => {}, sondeo: 50 }), 0);
  });

  test('con el vigilante muerto y sin código, la espera sale 125 (no espera para siempre)', async () => {
    const dir = dirNuevo();
    lanzar({ nombre: 'huerfano', comando: [process.execPath, '-e', 'console.log(`pid ${process.pid}`); setTimeout(() => {}, 30000)'], dir, print: () => {} });
    const { pid } = JSON.parse(readFileSync(join(dir, 'huerfano.json'), 'utf8'));
    // el pid del comando, cuando ya escribió: matar al vigilante antes dejaría al comando sin nacer
    let hijo = null;
    for (let i = 0; i < 100 && !hijo; i++) {
      hijo = +(/pid (\d+)/.exec(readFileSync(join(dir, 'huerfano.log'), 'utf8')) || [])[1] || null;
      if (!hijo) await new Promise((ok) => setTimeout(ok, 50));
    }
    assert.ok(hijo, 'el comando no escribió en el log');
    process.kill(pid, 'SIGKILL');
    const e = juntar();
    try {
      assert.equal(await esperar({ nombre: 'huerfano', dir, max: 20, print: e.print, sondeo: 50 }), MURIO);
      assert.match(e.lineas.join('\n'), /murió sin dejar su código/);
    } finally {
      process.kill(hijo, 'SIGKILL'); // el comando quedó huérfano: no se dejan procesos vivos
    }
  });

  test('no se lanzan dos con el mismo nombre a la vez; terminado el primero, sí', async () => {
    const dir = dirNuevo();
    lanzar({ nombre: 'puerta', comando: nodo(0, 800), dir, print: () => {} });
    const l = juntar();
    assert.equal(lanzar({ nombre: 'puerta', comando: nodo(1), dir, print: l.print }), 3);
    assert.match(l.lineas.join('\n'), /Ya corre «puerta»/);
    assert.equal(await esperar({ nombre: 'puerta', dir, max: 20, print: () => {}, sondeo: 50 }), 0);
    assert.equal(lanzar({ nombre: 'puerta', comando: nodo(1), dir, print: () => {} }), 0);
    assert.equal(await esperar({ nombre: 'puerta', dir, max: 20, print: () => {}, sondeo: 50 }), 1);
  });

  test('esperar algo que nunca se lanzó es error de uso, no una espera eterna', async () => {
    const e = juntar();
    assert.equal(await esperar({ nombre: 'nada', dir: dirNuevo(), max: 1, print: e.print }), USO_MAL);
    assert.match(e.lineas.join('\n'), /No hay nada lanzado/);
  });

  test('por la línea de comandos: --lanzar vuelve enseguida y la espera sale con el código del comando', () => {
    const dir = dirNuevo();
    const env = { ...process.env, ESPERAR_DIR: dir };
    const t0 = Date.now();
    const l = spawnSync(process.execPath, [script, '--lanzar', 'cli', '--', ...nodo(2, 1500)], { encoding: 'utf8', env });
    assert.equal(l.status, 0, l.stderr);
    assert.ok(Date.now() - t0 < 1400, '--lanzar esperó al comando');
    const e = spawnSync(process.execPath, [script, 'cli', '--max', '20'], { encoding: 'utf8', env });
    assert.equal(e.status, 2, e.stdout + e.stderr);
    assert.match(e.stdout, /terminó con código 2/);
    assert.ok(existsSync(join(dir, 'cli.fin.json')));
    const u = spawnSync(process.execPath, [script, '--lanzar', 'sin-comando'], { encoding: 'utf8', env });
    assert.equal(u.status, USO_MAL);
  });
});
