#!/usr/bin/env node
/* Pruebas de tools/opencode.mjs: las opciones, el proveedor de OmniRoute que recibe OpenCode, el entorno
   de la iteración (sesión, modelo y autor) y, contra un repositorio bare local y un opencode de mentira,
   el worktree limpio, el candado y el tope de tiempo. Ninguna corre OpenCode ni sale a la red.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/opencode.test.mjs     solo estas */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AUTOR, CLAVE_LOCAL, MINUTOS, configOmniRoute, dirPorDefecto, entorno, opciones, sesionNueva, tieneOmniRoute, urlV1 } from './opencode.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'tools', 'opencode.mjs');

describe('opciones', () => {
  test('por defecto: omniroute/auto, 240 minutos, el worktree al lado del repo', () => {
    const o = opciones([], {});
    assert.equal(o.modelo, 'omniroute/auto');
    assert.equal(o.minutos, MINUTOS);
    assert.equal(o.dir, null);
    assert.equal(dirPorDefecto('/x/GraphBranch'), join('/x', 'GraphBranch-loop'));
  });

  test('OMNIROUTE_MODEL elige el de OmniRoute; OPENCODE_LOOP_MODEL y --modelo, cualquiera', () => {
    assert.equal(opciones([], { OMNIROUTE_MODEL: 'cc/claude-sonnet-4-5' }).modelo, 'omniroute/cc/claude-sonnet-4-5');
    assert.equal(opciones([], { OMNIROUTE_MODEL: 'x', OPENCODE_LOOP_MODEL: 'anthropic/claude-sonnet-4-5' }).modelo, 'anthropic/claude-sonnet-4-5');
    assert.equal(opciones(['--modelo', 'omniroute/mi-combo'], { OPENCODE_LOOP_MODEL: 'a/b' }).modelo, 'omniroute/mi-combo');
    assert.equal(opciones(['--dir', '/tmp/w', '--minutos', '90', '--plan'], {}).minutos, 90);
  });

  test('un modelo sin proveedor, unos minutos que no son número o una opción desconocida son error', () => {
    assert.throws(() => opciones(['--modelo', 'auto'], {}), /proveedor\/modelo/);
    assert.throws(() => opciones(['--minutos', 'mucho'], {}), /--minutos/);
    assert.throws(() => opciones(['--modelo'], {}), /necesita un valor/);
    assert.throws(() => opciones(['--rapido'], {}), /opción desconocida: --rapido/);
  });
});

describe('el proveedor de OmniRoute', () => {
  test('la URL lleva un solo /v1, se escriba como se escriba', () => {
    for (const u of ['http://localhost:20128', 'http://localhost:20128/', 'http://localhost:20128/v1', 'http://localhost:20128/v1/']) assert.equal(urlV1(u), 'http://localhost:20128/v1');
    assert.equal(urlV1('https://omni.example.com/base'), 'https://omni.example.com/base/v1');
  });

  test('tieneOmniRoute lee la salida de opencode debug config', () => {
    assert.equal(tieneOmniRoute(JSON.stringify({ provider: { omniroute: { options: {} } } })), true);
    assert.equal(tieneOmniRoute(JSON.stringify({ provider: { anthropic: {} } })), false);
    assert.equal(tieneOmniRoute('no es json'), false);
  });

  test('sin proveedor configurado va entero: OmniRoute local, la clave local y el modelo elegido', () => {
    const c = JSON.parse(configOmniRoute({ modelo: 'omniroute/auto', env: {} }));
    assert.deepEqual(c.provider.omniroute, {
      npm: '@ai-sdk/openai-compatible',
      name: 'OmniRoute',
      options: { baseURL: 'http://localhost:20128/v1', apiKey: CLAVE_LOCAL },
      models: { auto: { name: 'auto' } },
    });
  });

  test('la clave nunca va escrita: se referencia OMNIROUTE_API_KEY; OMNIROUTE_URL cambia la URL', () => {
    const txt = configOmniRoute({ modelo: 'omniroute/cc/claude-sonnet-4-5', env: { OMNIROUTE_API_KEY: 'sk-secreta', OMNIROUTE_URL: 'http://10.0.0.5:20128/' } });
    assert.doesNotMatch(txt, /sk-secreta/);
    const c = JSON.parse(txt).provider.omniroute;
    assert.equal(c.options.apiKey, '{env:OMNIROUTE_API_KEY}');
    assert.equal(c.options.baseURL, 'http://10.0.0.5:20128/v1');
    assert.deepEqual(c.models, { 'cc/claude-sonnet-4-5': { name: 'cc/claude-sonnet-4-5' } });
  });

  test('con el proveedor ya configurado solo suma el modelo, salvo que OMNIROUTE_URL pida otro', () => {
    assert.deepEqual(JSON.parse(configOmniRoute({ modelo: 'omniroute/auto', env: {}, yaConfigurado: true })).provider.omniroute, { models: { auto: { name: 'auto' } } });
    assert.ok(JSON.parse(configOmniRoute({ modelo: 'omniroute/auto', env: { OMNIROUTE_URL: 'http://x:1' }, yaConfigurado: true })).provider.omniroute.options);
  });

  test('otro proveedor no necesita nada; lo que ya traía OPENCODE_CONFIG_CONTENT se conserva', () => {
    assert.equal(configOmniRoute({ modelo: 'anthropic/claude-sonnet-4-5', env: {} }), null);
    const previo = JSON.stringify({ autoupdate: false, provider: { otro: { npm: 'x' } } });
    const c = JSON.parse(configOmniRoute({ modelo: 'omniroute/auto', env: { OPENCODE_CONFIG_CONTENT: previo } }));
    assert.equal(c.autoupdate, false);
    assert.deepEqual(Object.keys(c.provider).sort(), ['omniroute', 'otro']);
    assert.throws(() => configOmniRoute({ modelo: 'omniroute/auto', env: { OPENCODE_CONFIG_CONTENT: '{roto' } }), /no es JSON/);
  });
});

describe('el entorno de la iteración', () => {
  test('sesión, modelo, autor de los commits y proveedor', () => {
    const e = entorno({ env: { PATH: '/bin' }, config: '{}', sesion: 's1', modelo: 'omniroute/auto' });
    const [, nombre, correo] = /^(.+) <(.+)>$/.exec(AUTOR);
    assert.deepEqual(e, { PATH: '/bin', LOOP_SESION: 's1', LOOP_MODELO: 'omniroute/auto', GIT_AUTHOR_NAME: nombre, GIT_AUTHOR_EMAIL: correo, GIT_COMMITTER_NAME: nombre, GIT_COMMITTER_EMAIL: correo, OPENCODE_CONFIG_CONTENT: '{}' });
  });

  test('LOOP_AUTOR cambia el autor; vacío deja el de git; mal escrito es error', () => {
    assert.equal(entorno({ env: { LOOP_AUTOR: 'Loop de Benjamin <loop@ejemplo.cl>' }, sesion: 's', modelo: 'm/x' }).GIT_AUTHOR_EMAIL, 'loop@ejemplo.cl');
    assert.equal(entorno({ env: { LOOP_AUTOR: '' }, sesion: 's', modelo: 'm/x' }).GIT_AUTHOR_NAME, undefined);
    assert.throws(() => entorno({ env: { LOOP_AUTOR: 'sin correo' }, sesion: 's', modelo: 'm/x' }), /Nombre <correo>/);
  });

  test('la sesión dice opencode, el equipo y la fecha en UTC', () => {
    assert.equal(sesionNueva(new Date('2026-10-21T04:05:06.789Z'), 'mi-pc.local'), 'opencode-mi-pc-20261021T040506Z');
  });
});

describe('una corrida contra un repositorio bare y un opencode de mentira', { skip: process.platform === 'win32' && 'el opencode de mentira es un script de sh' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-'));
  const bare = join(dir, 'bare.git');
  const repo = join(dir, 'repo');
  const wt = join(dir, 'wt');
  const falso = join(dir, 'opencode');
  const registro = join(dir, 'registro.txt');
  const ENV = { ...process.env, GIT_AUTHOR_NAME: 'prueba', GIT_AUTHOR_EMAIL: 'p@p', GIT_COMMITTER_NAME: 'prueba', GIT_COMMITTER_EMAIL: 'p@p' };
  for (const k of ['OMNIROUTE_URL', 'OMNIROUTE_API_KEY', 'OMNIROUTE_MODEL', 'OPENCODE_LOOP_MODEL', 'OPENCODE_LOOP_DIR', 'OPENCODE_CONFIG_CONTENT', 'LOOP_AUTOR']) delete ENV[k];
  const git = (cwd, args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const correr = (extra = [], env = {}) => spawnSync(process.execPath, [script, '--repo', repo, '--dir', wt, ...extra], { encoding: 'utf8', env: { ...ENV, OPENCODE_BIN: falso, REGISTRO: registro, ...env } });

  before(() => {
    git(dir, ['init', '-q', '--bare', '--initial-branch=master', bare]);
    git(dir, ['clone', '-q', bare, repo]);
    git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/master']);
    writeFileSync(join(repo, 'README.md'), 'hola\n');
    git(repo, ['add', 'README.md']);
    git(repo, ['commit', '-q', '-m', 'semilla']);
    git(repo, ['push', '-q', 'origin', 'master']);
    // anota desde dónde y con qué lo llamaron; DORMIR lo deja colgado para probar el tope
    writeFileSync(
      falso,
      `#!/bin/sh
case "$1" in
  --version) echo 9.9.9 ;;
  debug) echo '{}' ;;
  run)
    [ -n "$DORMIR" ] && exec sleep "$DORMIR"
    { echo "cwd=$(pwd)"; echo "args=$*"; echo "stdin=$(readlink /proc/$$/fd/0 2>/dev/null)"
      env | grep -E '^(LOOP_SESION|LOOP_MODELO|GIT_AUTHOR_NAME|OPENCODE_CONFIG_CONTENT)=' | sort; } > "$REGISTRO"
    exit 7 ;;
esac
`,
    );
    chmodSync(falso, 0o755);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('--plan no toca nada', () => {
    const r = correr(['--plan']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /modelo omniroute\/auto \(omniroute en http:\/\/localhost:20128\/v1\)/);
    assert.match(r.stdout, /Correría: .* run --command iteracion -m omniroute\/auto --auto/);
    assert.equal(existsSync(wt), false);
  });

  test('crea el worktree en origin/master y corre /iteracion ahí, sin entrada y con su entorno', () => {
    const r = correr();
    assert.equal(r.status, 7, r.stdout + r.stderr);
    const reg = readFileSync(registro, 'utf8');
    assert.match(reg, new RegExp(`^cwd=${realpathSync(wt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(reg, /^args=run --command iteracion -m omniroute\/auto --auto$/m);
    if (process.platform === 'linux') assert.match(reg, /^stdin=\/dev\/null$/m);
    assert.match(reg, /^LOOP_SESION=opencode-.+-\d{8}T\d{6}Z$/m);
    assert.match(reg, /^LOOP_MODELO=omniroute\/auto$/m);
    assert.match(reg, /^GIT_AUTHOR_NAME=OpenCode$/m);
    assert.match(reg, /^OPENCODE_CONFIG_CONTENT=.*"baseURL":"http:\/\/localhost:20128\/v1"/m);
    assert.equal(git(wt, ['rev-parse', 'HEAD']), git(repo, ['rev-parse', 'origin/master']));
  });

  test('el disparo siguiente arranca limpio: sin lo que dejó el anterior y con lo nuevo de origin', () => {
    writeFileSync(join(wt, 'basura.txt'), 'x');
    writeFileSync(join(wt, 'README.md'), 'cambio sin commitear\n');
    git(wt, ['checkout', '-q', '-b', 'loop/1']);
    writeFileSync(join(repo, 'NUEVO.md'), 'nuevo\n');
    git(repo, ['add', 'NUEVO.md']);
    git(repo, ['commit', '-q', '-m', 'nuevo en master']);
    git(repo, ['push', '-q', 'origin', 'master']);
    const r = correr();
    assert.equal(r.status, 7, r.stdout + r.stderr);
    assert.equal(git(wt, ['status', '--porcelain']), '');
    assert.equal(git(wt, ['rev-parse', 'HEAD']), git(repo, ['rev-parse', 'origin/master']));
    assert.equal(readFileSync(join(wt, 'README.md'), 'utf8'), 'hola\n');
  });

  test('con otra corrida viva en el mismo worktree no arranca (2)', () => {
    const lock = join(repo, '.git', 'opencode-wt.lock');
    mkdirSync(lock);
    writeFileSync(join(lock, 'pid'), String(process.pid));
    const r = correr();
    rmSync(lock, { recursive: true, force: true });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /Ya hay una iteración corriendo/);
  });

  test('pasado el tope de minutos corta opencode y sale 124', () => {
    const r = correr(['--minutos', '0.002'], { DORMIR: '30' });
    assert.equal(r.status, 124, r.stdout + r.stderr);
    assert.match(r.stdout, /Se cortó la iteración/);
  });

  test('sin opencode sale 2 y dice cómo instalarlo', () => {
    const r = correr([], { OPENCODE_BIN: join(dir, 'no-existe') });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout, /Falta OpenCode: npm i -g opencode-ai/);
  });
});
