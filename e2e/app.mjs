/* Lo común de las pruebas e2e de la app de escritorio: abrirla como un usuario, sin red y con
   un perfil propio en cada prueba (--user-data-dir), así ninguna depende de GitHub ni de otra. */
import { _electron as electron, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
const electronPath = createRequire(import.meta.url)('electron');

/** Chromium no deja correr Electron como root con su sandbox (contenedores, CI). */
const sandboxArgs = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
/** Un proxy que no existe: toda petición a internet falla, como sin red. app:// no pasa por él. */
const NO_NETWORK = '--proxy-server=127.0.0.1:9';
/** Chromium en Linux convierte las rutas con el locale del sistema: sin UTF-8 (pasa en contenedores) no
    guarda nada en carpetas con tildes, y las de las pruebas salen de sus títulos. */
const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
export const env = process.platform === 'linux' && !/utf-?8/i.test(locale) ? { ...process.env, LC_ALL: 'C.UTF-8' } : process.env;

/** Abre la app. dir: carpeta de datos (para reabrir con el mismo perfil); args: --lang=es, --repo=… */
export async function launch(testInfo, { dir = testInfo.outputPath('perfil'), args = [] } = {}) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [root, `--user-data-dir=${dir}`, NO_NETWORK, ...sandboxArgs, ...args],
    env,
  });
  const page = await app.firstWindow();
  return { app, page, dir };
}

/** Espera a que la página termine de cargar (la demo o el repositorio). */
export const loaded = (page) => expect(page.locator('#status')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 });

/** Abre otra vez la app con el mismo perfil, como hace el usuario; devuelve su código de salida. */
export function launchAgain(dir) {
  const child = spawn(electronPath, [root, `--user-data-dir=${dir}`, ...sandboxArgs], { stdio: 'ignore', env });
  return new Promise((resolve) => child.on('exit', resolve));
}

/** Los archivos del token en la carpeta de datos: { nombre: contenido }. */
export function tokenFiles(dir) {
  return Object.fromEntries(readdirSync(dir).filter((f) => f.startsWith('github-token')).map((f) => [f, readFileSync(join(dir, f))]));
}

/** La ventana, vista desde el proceso principal. */
export const windowState = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { visible: win.isVisible(), destroyed: win.isDestroyed() };
  });

export const closeWindow = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());

/** Corre un recorrido de e2e/hidden.cjs (la app sin Playwright conectado) y devuelve su resultado. */
export function runHidden(testInfo, scenario, args = []) {
  const harness = join(root, 'e2e', 'hidden.cjs');
  const dir = testInfo.outputPath('perfil');
  const child = spawn(electronPath, [harness, `--user-data-dir=${dir}`, NO_NETWORK, ...sandboxArgs, ...args], {
    env: { ...env, E2E_SCENARIO: scenario },
  });
  let out = '';
  let log = ''; // lo que Chromium escribe en stderr: solo se muestra si algo falla
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  return new Promise((resolve, reject) =>
    child.on('exit', () => {
      const line = out.split('\n').find((l) => l.startsWith('E2E '));
      if (!line) return reject(new Error(`el arnés no devolvió resultado:\n${out}\n${log.slice(-3000)}`));
      resolve({ ...JSON.parse(line.slice(4)), dir });
    }),
  );
}
