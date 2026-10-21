#!/usr/bin/env node
/* Una iteración del loop en OpenCode, con el modelo detrás de OmniRoute: lo mismo que hace la Routine en
   una sesión cloud de Claude Code, pero en un PC o en un cron. Deja un worktree limpio en origin/master
   (la sesión nueva de cada disparo), le da a OpenCode el proveedor de OmniRoute y corre
   `opencode run --command iteracion` (.opencode/commands/iteracion.md: el prompt de la Routine y lo que
   cambia fuera de Claude Code).

     node tools/opencode.mjs                         una iteración con omniroute/auto en ../GraphBranch-loop
     node tools/opencode.mjs --modelo <prov/modelo>  otro modelo (o OPENCODE_LOOP_MODEL; OMNIROUTE_MODEL elige uno de OmniRoute)
     node tools/opencode.mjs --dir <carpeta>         otro worktree para el loop (o OPENCODE_LOOP_DIR)
     node tools/opencode.mjs --minutos 240           corta la iteración pasado ese tiempo (240 por defecto)
     node tools/opencode.mjs --plan                  dice qué haría, sin tocar nada

   OmniRoute: OMNIROUTE_URL (http://localhost:20128 por defecto) y OMNIROUTE_API_KEY (sin ella, la clave
   local de OmniRoute, sk_omniroute). Si OpenCode ya tiene el proveedor «omniroute» (omniroute
   setup-opencode) y no hay OMNIROUTE_URL, se usa el suyo. Los commits salen con el autor de LOOP_AUTOR
   («Nombre <correo>»; vacío deja el de git) y el reclamo firma con LOOP_SESION (opencode-<equipo>-<fecha>).

   Salida: la de opencode run (124 si se cortó por tiempo) · 1 la preparación falló · 2 falta opencode o
   ya hay una iteración corriendo en ese worktree. */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';

/** La rama de la que sale cada iteración y el comando de OpenCode que la corre. */
export const BASE = 'master';
export const COMANDO = 'iteracion';
export const OMNIROUTE_URL = 'http://localhost:20128';
/** La clave que acepta OmniRoute cuando no exige una (REQUIRE_API_KEY=false, lo normal en local). */
export const CLAVE_LOCAL = 'sk_omniroute';
export const AUTOR = 'OpenCode <opencode@localhost>';
export const MINUTOS = 240;

const USO = `node tools/opencode.mjs [--modelo <proveedor/modelo>] [--dir <carpeta>] [--minutos ${MINUTOS}] [--plan]
  una iteración del loop en OpenCode (omniroute/auto por defecto), en un worktree limpio desde origin/${BASE}
  OmniRoute: OMNIROUTE_URL (${OMNIROUTE_URL}), OMNIROUTE_API_KEY, OMNIROUTE_MODEL · autor: LOOP_AUTOR («Nombre <correo>»)`;

export function opciones(argv, env = process.env) {
  const o = { modelo: env.OPENCODE_LOOP_MODEL || `omniroute/${env.OMNIROUTE_MODEL || 'auto'}`, dir: env.OPENCODE_LOOP_DIR || null, minutos: MINUTOS, repo: root, plan: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} necesita un valor`);
      return v;
    };
    if (a === '--modelo') o.modelo = valor();
    else if (a === '--dir') o.dir = valor();
    else if (a === '--minutos') o.minutos = Number(valor());
    else if (a === '--repo') o.repo = resolve(valor());
    else if (a === '--plan') o.plan = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`opción desconocida: ${a} (node tools/opencode.mjs --help)`);
  }
  if (!/^[^/\s]+\/\S+$/.test(o.modelo)) throw new Error(`el modelo va como proveedor/modelo («${o.modelo}»)`);
  if (!(o.minutos > 0)) throw new Error('--minutos necesita un número mayor que 0');
  return o;
}

/** La URL de OmniRoute con un solo /v1 al final, se escriba como se escriba. */
export const urlV1 = (url) => `${url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`;

/** Si la configuración que resolvió OpenCode (`opencode debug config`) ya trae el proveedor «omniroute». */
export function tieneOmniRoute(salida) {
  try {
    return Boolean(JSON.parse(salida).provider?.omniroute);
  } catch {
    return false;
  }
}

/** El OPENCODE_CONFIG_CONTENT para el modelo, o null si no hace falta (el modelo es de otro proveedor).
    Con el proveedor ya configurado y sin OMNIROUTE_URL solo se suma el modelo a su lista (OpenCode mezcla
    las configuraciones); si no, va el proveedor entero. La clave va como {env:OMNIROUTE_API_KEY}: OpenCode
    la lee del entorno y no queda escrita en ninguna parte. Lo que ya traía la variable se conserva. */
export function configOmniRoute({ modelo, env = process.env, yaConfigurado = false }) {
  const [proveedor, ...resto] = modelo.split('/');
  if (proveedor !== 'omniroute') return null;
  const id = resto.join('/');
  let previo = {};
  if (env.OPENCODE_CONFIG_CONTENT) {
    try {
      previo = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
    } catch (err) {
      throw new Error(`OPENCODE_CONFIG_CONTENT no es JSON (${err.message})`);
    }
  }
  const omniroute =
    yaConfigurado && !env.OMNIROUTE_URL
      ? { models: { [id]: { name: id } } }
      : {
          npm: '@ai-sdk/openai-compatible',
          name: 'OmniRoute',
          options: { baseURL: urlV1(env.OMNIROUTE_URL || OMNIROUTE_URL), apiKey: env.OMNIROUTE_API_KEY ? '{env:OMNIROUTE_API_KEY}' : CLAVE_LOCAL },
          models: { [id]: { name: id } },
        };
  return JSON.stringify({ ...previo, provider: { ...(previo.provider ?? {}), omniroute } });
}

/** El id con que firma el reclamo (`sesión …` en el commit de loop/N), como el cse_… de una sesión cloud. */
export const sesionNueva = (fecha = new Date(), equipo = hostname()) => `opencode-${equipo.split('.')[0] || 'pc'}-${fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;

/** El entorno de opencode run: el proveedor, la sesión, el modelo y el autor de los commits. */
export function entorno({ env = process.env, config = null, sesion, modelo }) {
  const e = { ...env, LOOP_SESION: sesion, LOOP_MODELO: modelo };
  const autor = env.LOOP_AUTOR ?? AUTOR;
  if (autor !== '') {
    const m = /^\s*(.+?)\s*<([^<>\s]+)>\s*$/.exec(autor);
    if (!m) throw new Error(`LOOP_AUTOR va como «Nombre <correo>» («${autor}»)`);
    Object.assign(e, { GIT_AUTHOR_NAME: m[1], GIT_AUTHOR_EMAIL: m[2], GIT_COMMITTER_NAME: m[1], GIT_COMMITTER_EMAIL: m[2] });
  }
  if (config) e.OPENCODE_CONFIG_CONTENT = config;
  return e;
}

/** El worktree del loop si no se elige otro: al lado del repo, con -loop al final. */
export const dirPorDefecto = (repo) => join(dirname(repo), `${basename(repo)}-loop`);

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const primera = (s) => (s || '').trim().split('\n')[0];
const real = (p) => (existsSync(p) ? realpathSync(p) : resolve(p));
const leer = (ruta) => (existsSync(ruta) ? readFileSync(ruta, 'utf8') : null);

function paso(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${primera(r.stderr) || `código ${r.status}`}`);
  return r.stdout;
}

/** La carpeta de .git del repo principal (desde él o desde cualquiera de sus worktrees). */
function gitComun(desde) {
  const r = git(desde, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (r.status !== 0) throw new Error(`${desde} no es un repo de git (${primera(r.stderr)})`);
  return real(r.stdout.trim());
}

/** Un candado por worktree en el .git del repo: dos disparos (un cron que se solapa) no se pisan. Devuelve
    con qué soltarlo, o null si lo tiene un proceso vivo. */
function candado(comun, dir) {
  const c = join(comun, `opencode-${basename(dir)}.lock`);
  try {
    mkdirSync(c);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const pid = Number(leer(join(c, 'pid')));
    if (pid && vivo(pid)) return null;
    rmSync(c, { recursive: true, force: true });
    mkdirSync(c);
  }
  writeFileSync(join(c, 'pid'), String(process.pid));
  return () => rmSync(c, { recursive: true, force: true });
}

function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Deja el worktree como una sesión nueva: origin/master sin nada encima, con la historia entera (R3 de
    loop --check la recorre) y sin lo que dejó el disparo anterior, salvo node_modules. */
function preparar(repo, comun, dir, print) {
  paso(repo, ['fetch', '-q', 'origin', BASE]);
  if (git(repo, ['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true') {
    print('=> el clon es superficial: git fetch --unshallow');
    paso(repo, ['fetch', '-q', '--unshallow', 'origin']);
  }
  if (!existsSync(dir)) {
    git(repo, ['worktree', 'prune']);
    print(`=> worktree nuevo en ${dir}`);
    paso(repo, ['worktree', 'add', '-q', '--detach', dir, `origin/${BASE}`]);
    return;
  }
  const suyo = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (suyo.status !== 0 || real(suyo.stdout.trim()) !== comun) throw new Error(`${dir} existe y no es un worktree de este repo: elegí otro con --dir`);
  git(dir, ['merge', '--abort']);
  paso(dir, ['checkout', '-q', '-f', '--detach', `origin/${BASE}`]);
  paso(dir, ['clean', '-q', '-fdx', '-e', 'node_modules']);
}

/** npm ci cuando cambia package-lock.json (o no hay node_modules) y Electron si falta, como el hook de las
    sesiones cloud. Si falla se sigue: npm run check lo va a decir. */
function dependencias(dir, print) {
  const lock = leer(join(dir, 'package-lock.json'));
  if (lock == null) return;
  const sello = join(dir, 'node_modules', '.opencode-loop');
  const hash = createHash('sha256').update(lock).digest('hex');
  if (leer(sello) !== hash) {
    print('=> npm ci');
    const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'inherit', shell: WIN });
    if (r.status === 0) writeFileSync(sello, hash);
    else print('npm ci falló: npm run check lo va a decir');
  }
  const electron = join(dir, 'node_modules', 'electron');
  if (existsSync(electron) && !existsSync(join(electron, 'path.txt'))) {
    print('=> Electron');
    const r = spawnSync(process.execPath, [join(electron, 'install.js')], { cwd: dir, stdio: 'inherit' });
    if (r.status !== 0) print('Electron no disponible: npm run check lo va a decir');
  }
}

/** opencode run con la entrada cerrada (con una tubería abierta se queda esperando leerla) y un tope de tiempo. */
function correr({ bin, dir, modelo, env, minutos, print }) {
  return new Promise((listo) => {
    const hijo = spawn(bin, ['run', '--command', COMANDO, '-m', modelo, '--auto'], { cwd: dir, env, stdio: ['ignore', 'inherit', 'inherit'], shell: WIN });
    let cortado = false;
    const tope = setTimeout(() => {
      cortado = true;
      print(`Se cortó la iteración a los ${minutos} min`);
      hijo.kill('SIGTERM');
      setTimeout(() => hijo.kill('SIGKILL'), 60000).unref();
    }, minutos * 60000);
    const reenviar = (senal) => hijo.kill(senal);
    process.on('SIGINT', reenviar);
    process.on('SIGTERM', reenviar);
    const fin = (codigo) => {
      clearTimeout(tope);
      process.off('SIGINT', reenviar);
      process.off('SIGTERM', reenviar);
      listo(codigo);
    };
    hijo.on('error', (err) => {
      print(`no se pudo correr opencode: ${err.message}`);
      fin(2);
    });
    hijo.on('close', (codigo) => fin(cortado ? 124 : (codigo ?? 1)));
  });
}

export async function main(argv, { env = process.env, print = console.log } = {}) {
  let o;
  try {
    o = opciones(argv, env);
  } catch (err) {
    print(`ERROR: ${err.message}`);
    return 1;
  }
  if (o.help) {
    print(USO);
    return 0;
  }
  const bin = env.OPENCODE_BIN || 'opencode';
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: WIN });
  if (version.error || version.status !== 0) {
    print('Falta OpenCode: npm i -g opencode-ai (o OPENCODE_BIN con la ruta del ejecutable)');
    return 2;
  }
  let comun, dir, run;
  try {
    comun = gitComun(o.repo);
    const repo = dirname(comun);
    dir = real(resolve(o.dir ?? dirPorDefecto(repo)));
    const resuelta = spawnSync(bin, ['debug', 'config'], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: WIN, timeout: 120000 });
    const yaConfigurado = tieneOmniRoute(resuelta.stdout);
    const config = configOmniRoute({ modelo: o.modelo, env, yaConfigurado });
    const sesion = sesionNueva();
    run = { bin, dir, modelo: o.modelo, env: entorno({ env, config, sesion, modelo: o.modelo }), minutos: o.minutos, print };
    const proveedor = !config ? 'el de la configuración de OpenCode' : yaConfigurado && !env.OMNIROUTE_URL ? 'omniroute, el de la configuración de OpenCode' : `omniroute en ${urlV1(env.OMNIROUTE_URL || OMNIROUTE_URL)}`;
    print(`OpenCode ${primera(version.stdout)} · modelo ${o.modelo} (${proveedor})`);
    print(`Worktree ${dir} desde origin/${BASE} · sesión ${sesion} · autor ${run.env.GIT_AUTHOR_NAME ?? 'el de git'} · tope ${o.minutos} min`);
    if (o.plan) {
      print(`Correría: ${bin} run --command ${COMANDO} -m ${o.modelo} --auto`);
      return 0;
    }
  } catch (err) {
    print(`ERROR: ${err.message}`);
    return 1;
  }
  const soltar = candado(comun, dir);
  if (!soltar) {
    print(`Ya hay una iteración corriendo en ${dir}: esta no arranca.`);
    return 2;
  }
  try {
    preparar(dirname(comun), comun, dir, print);
    dependencias(dir, print);
    const gh = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: WIN });
    if (gh.error || gh.status !== 0) print('Aviso: gh no está o no tiene sesión (gh auth login): la iteración no va a poder abrir ni fusionar su PR.');
    return await correr(run);
  } catch (err) {
    print(`ERROR: ${err.message}`);
    return 1;
  } finally {
    soltar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
