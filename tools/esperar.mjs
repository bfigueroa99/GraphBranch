#!/usr/bin/env node
/* Corre un comando largo desprendido de la sesión y lo espera en primer plano, de a tramos que entran en una
   llamada a la herramienta de shell. Solo módulos de Node, sin dependencias.

     node tools/esperar.mjs --lanzar <nombre> -- <comando> [args…]   lo lanza y vuelve enseguida
     node tools/esperar.mjs <nombre> [--max 540] [--cada 60]          lo espera; 124 = sigue corriendo: se repite

   Por qué existe: `npm run check` tarda de 8 a más de 10 minutos en la sesión cloud (el smoke solo, unos 8:
   pendientes 8 y 12 de Mantenimiento hasta el 2026-11-01; el 2026-11-01, con la máquina a carga 12 en 4 CPU,
   la puerta sin e2e pasó de los 10). La herramienta de shell de Claude Code corta una llamada en primer plano
   a los 600 s y manda al fondo la que pasa de 120 s sin `timeout`; un `sleep` suelto está bloqueado y sugiere
   `Monitor`. En una Routine el turno terminado es la corrida terminada: una sesión que deja la puerta en el
   fondo y cierra el turno «esperando la notificación» deja el reclamo vivo y nada fusionado (loop/135 se
   relevó así el 2026-10-26; la Routine de CIT, el 2026-11-01). Con esto la espera es siempre en primer plano:
   cada llamada espera hasta --max segundos y sale 124 si el comando sigue; la sesión la repite.

   El estado vive fuera del repo, en ESPERAR_DIR o en <tmp>/graphbranch-esperar/<hash del repo>: las e2e vacían
   test-results/ al empezar y se llevarían el log a mitad de la puerta, y el checkout queda limpio.
     <nombre>.log       la salida del comando (stdout y stderr, a medida que sale)
     <nombre>.json      comando, pid del que lo vigila e inicio (lo escribe --lanzar)
     <nombre>.fin.json  código de salida y fin (lo escribe el vigilante cuando el comando termina)

   Salida de --lanzar: 0 lanzado · 3 ya corre uno con ese nombre · 64 uso.
   Salida de la espera: la del comando si terminó · 124 sigue corriendo (llamar otra vez) · 125 el vigilante
   murió sin dejar el código (la máquina se reinició o alguien lo mató) · 64 uso o nada lanzado con ese nombre. */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Segundos que espera cada llamada: entra en una llamada de 600 s (`timeout: 600000`) con margen para arrancar
    Node e imprimir la cola del log. */
export const MAX_S = 540;
/** Cada cuántos segundos imprime una línea de progreso (la última del log). */
export const CADA_S = 60;
/** Cada cuántos milisegundos mira si terminó. */
export const SONDEO_MS = 1000;
/** Líneas del log que imprime al terminar: `npm run check` deja ahí su «Validado:» o su FALLA con 40 líneas. */
export const COLA = 60;
export const SIGUE = 124;
export const MURIO = 125;
export const USO_MAL = 64;

const USO = `node tools/esperar.mjs --lanzar <nombre> -- <comando> [args…]   lo lanza desprendido y vuelve enseguida
node tools/esperar.mjs <nombre> [--max ${MAX_S}] [--cada ${CADA_S}]          lo espera en primer plano (llamar con timeout: 600000)
  salida de la espera: la del comando · ${SIGUE} sigue corriendo: llamar otra vez · ${MURIO} murió sin código · ${USO_MAL} uso`;

export class EsperaError extends Error {
  constructor(msg, codigo = USO_MAL) {
    super(msg);
    this.codigo = codigo;
  }
}

/** La carpeta del estado: fuera del repo y una por checkout (dos worktrees no se pisan los nombres). */
export function carpeta(env = process.env, repo = root) {
  return env.ESPERAR_DIR || join(tmpdir(), 'graphbranch-esperar', createHash('sha1').update(repo).digest('hex').slice(0, 10));
}

const RE_NOMBRE = /^[\w.-]{1,60}$/;

export function opciones(argv) {
  const o = { lanzar: null, nombre: null, comando: [], max: MAX_S, cada: CADA_S, correr: null, help: false };
  const num = (flag, v) => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n <= 0) throw new EsperaError(`${flag} necesita un número de segundos mayor que 0`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      o.comando = argv.slice(i + 1);
      break;
    }
    if (a === '--lanzar' || a === '--correr') o[a.slice(2)] = argv[++i] ?? '';
    else if (a === '--max') o.max = num(a, argv[++i]);
    else if (a === '--cada') o.cada = num(a, argv[++i]);
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new EsperaError(`opción desconocida: ${a} (node tools/esperar.mjs --help)`);
    else if (o.nombre === null) o.nombre = a;
    else throw new EsperaError(`sobra «${a}»: el comando va después de -- y solo con --lanzar`);
  }
  if (o.help) return o;
  const nombre = o.lanzar ?? o.correr ?? o.nombre;
  if (!nombre || !RE_NOMBRE.test(nombre)) throw new EsperaError(`falta el nombre o no es válido («${nombre ?? ''}»: letras, números, punto, guion y guion bajo)`);
  if ((o.lanzar !== null || o.correr !== null) && !o.comando.length) throw new EsperaError('falta el comando: --lanzar <nombre> -- <comando> [args…]');
  if (o.lanzar === null && o.correr === null && o.comando.length) throw new EsperaError('el comando va solo con --lanzar');
  return o;
}

const rutas = (dir, nombre) => ({ log: join(dir, `${nombre}.log`), estado: join(dir, `${nombre}.json`), fin: join(dir, `${nombre}.fin.json`) });
const leerJson = (ruta) => {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return null;
  }
};
/** Escribe entero o nada: quien espera nunca lee un JSON a medias. */
const escribirJson = (ruta, datos) => {
  writeFileSync(`${ruta}.tmp`, JSON.stringify(datos, null, 2));
  renameSync(`${ruta}.tmp`, ruta);
};
/** true si el proceso existe (EPERM: existe y es de otro usuario). */
export function vivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
function cola(ruta, n) {
  if (!existsSync(ruta)) return [];
  const lineas = readFileSync(ruta, 'utf8').replace(/\r/g, '').split('\n');
  while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
  return lineas.slice(-n);
}

/** Lanza el vigilante desprendido (otra sesión de procesos: sobrevive al fin de la llamada) y vuelve. */
export function lanzar({ nombre, comando, dir = carpeta(), cwd = process.cwd(), print = console.log }) {
  mkdirSync(dir, { recursive: true });
  const r = rutas(dir, nombre);
  const previo = leerJson(r.estado);
  if (previo && !existsSync(r.fin) && vivo(previo.pid)) {
    print(`Ya corre «${nombre}» (pid ${previo.pid}, desde ${previo.inicio}): esperalo con node tools/esperar.mjs ${nombre}`);
    return 3;
  }
  for (const f of [r.log, r.estado, r.fin]) rmSync(f, { force: true });
  writeFileSync(r.log, '');
  const hijo = spawn(process.execPath, [fileURLToPath(import.meta.url), '--correr', nombre, '--', ...comando], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ESPERAR_DIR: dir },
  });
  hijo.unref();
  escribirJson(r.estado, { nombre, comando, cwd, pid: hijo.pid, inicio: new Date().toISOString(), log: r.log });
  print(`Lanzado «${nombre}» (pid ${hijo.pid}): ${comando.join(' ')}`);
  print(`Log: ${r.log}`);
  print(`Esperalo en primer plano: node tools/esperar.mjs ${nombre}   (con timeout: 600000; si sale ${SIGUE}, otra vez)`);
  return 0;
}

/** El vigilante: corre el comando con la salida al log y deja su código en <nombre>.fin.json. */
export function correr({ nombre, comando, dir = carpeta() }) {
  const r = rutas(dir, nombre);
  const fd = openSync(r.log, 'a');
  const t0 = Date.now();
  return new Promise((ok) => {
    const fin = (codigo, error = null) => {
      closeSync(fd);
      escribirJson(r.fin, { codigo, fin: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), ...(error ? { error } : {}) });
      ok(codigo);
    };
    const p = spawn(comando[0], comando.slice(1), { stdio: ['ignore', fd, fd], shell: process.platform === 'win32' });
    p.on('error', (err) => fin(127, err.message));
    p.on('close', (code, signal) => fin(code ?? 128 + ({ SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 }[signal] ?? 0)));
  });
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Espera en primer plano hasta `max` segundos; devuelve el código del comando, SIGUE o MURIO. */
export async function esperar({ nombre, max = MAX_S, cada = CADA_S, dir = carpeta(), print = console.log, sondeo = SONDEO_MS }) {
  const r = rutas(dir, nombre);
  const estado = leerJson(r.estado);
  if (!estado) {
    print(`No hay nada lanzado con el nombre «${nombre}» en ${dir}: node tools/esperar.mjs --lanzar ${nombre} -- <comando>`);
    return USO_MAL;
  }
  const t0 = Date.now();
  const desde = Date.parse(estado.inicio) || t0;
  let aviso = t0;
  for (;;) {
    const fin = leerJson(r.fin);
    if (fin) {
      for (const l of cola(r.log, COLA)) print(l);
      print(`«${nombre}» terminó con código ${fin.codigo} en ${dur(fin.segundos ?? (Date.now() - desde) / 1000)}${fin.error ? ` (${fin.error})` : ''} · log: ${r.log}`);
      return fin.codigo;
    }
    if (!vivo(estado.pid)) {
      // el vigilante pudo terminar entre la lectura de fin y esta: se mira una vez más
      await pausa(Math.min(sondeo, 200));
      if (existsSync(r.fin)) continue;
      for (const l of cola(r.log, COLA)) print(l);
      print(`«${nombre}» murió sin dejar su código (pid ${estado.pid}, lanzado ${estado.inicio}): relanzarlo con --lanzar · log: ${r.log}`);
      return MURIO;
    }
    const ahora = Date.now();
    if (ahora - t0 >= max * 1000) {
      print(`«${nombre}» sigue corriendo (${dur((ahora - desde) / 1000)}): volvé a llamar a node tools/esperar.mjs ${nombre} sin cerrar el turno`);
      return SIGUE;
    }
    if (ahora - aviso >= cada * 1000) {
      aviso = ahora;
      const ultima = cola(r.log, 1)[0] ?? '';
      print(`esperando «${nombre}» (${dur((ahora - desde) / 1000)}; última línea: ${ultima.length > 120 ? `${ultima.slice(0, 119)}…` : ultima || '(nada todavía)'})`);
    }
    await pausa(Math.min(sondeo, max * 1000 - (ahora - t0)));
  }
}

async function main(argv) {
  const o = opciones(argv);
  if (o.help) {
    console.log(USO);
    return 0;
  }
  if (o.correr !== null) return correr({ nombre: o.correr, comando: o.comando });
  if (o.lanzar !== null) return lanzar({ nombre: o.lanzar, comando: o.comando });
  return esperar({ nombre: o.nombre, max: o.max, cada: o.cada });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (err) => {
      console.error(err instanceof EsperaError ? err.message : err.stack || String(err));
      process.exit(err instanceof EsperaError ? err.codigo : 1);
    },
  );
}
