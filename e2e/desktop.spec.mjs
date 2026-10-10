/* Pruebas e2e de la app de escritorio (Electron): se abre como la abre un usuario, sin red. */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { closeWindow, launch, launchAgain, loaded, runHidden, tokenFiles, windowState } from './app.mjs';

test('arranca sin red: la demo, las librerías y las fuentes van dentro de la app', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es'] });
  await loaded(page);
  expect(page.url()).toMatch(/^app:\/\/graphbranch\/index\.html/);
  await expect(page.locator('#status-text')).toHaveText('Simulación en vivo');
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      libs: [typeof d3, typeof THREE, typeof THREE.OrbitControls],
      node: [typeof require, typeof process],
      bridge: Object.keys(window.GBDesktop).sort(),
      fonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))].sort(),
    };
  });
  expect(info.libs).toEqual(['object', 'object', 'function']);
  expect(info.node).toEqual(['undefined', 'undefined']); // la página no ve Node
  expect(info.bridge).toEqual(['getToken', 'setLabels', 'setToken', 'show']);
  expect(info.fonts).toEqual(['Bricolage Grotesque', 'Instrument Sans', 'JetBrains Mono']);
  await app.close();
});

test('app:// solo sirve la página: el resto del proyecto da 404', async ({}, testInfo) => {
  const { app } = await launch(testInfo);
  const status = await app.evaluate(async ({ session }) => {
    const out = {};
    for (const path of ['/index.html', '/js/app.js', '/vendor/three.min.js', '/package.json', '/electron/main.js', '/%2e%2e/package.json', '/README.md']) {
      out[path] = (await session.defaultSession.fetch('app://graphbranch' + path)).status;
    }
    out.otroHost = (await session.defaultSession.fetch('app://otro/index.html')).status;
    return out;
  });
  expect(status).toEqual({
    '/index.html': 200,
    '/js/app.js': 200,
    '/vendor/three.min.js': 200,
    '/package.json': 404,
    '/electron/main.js': 404,
    '/%2e%2e/package.json': 404,
    '/README.md': 404,
    otroHost: 404,
  });
  await app.close();
});

test('los enlaces van al navegador del sistema y la ventana no navega a otro sitio', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo);
  await loaded(page);
  await app.evaluate(({ shell }) => {
    globalThis.opened = [];
    shell.openExternal = async (url) => globalThis.opened.push(url);
  });
  await page.evaluate(() => window.open('https://github.com/bfigueroa99/GraphBranch'));
  await page.evaluate(() => (location.href = 'https://example.com/')).catch(() => {});
  await expect.poll(() => app.evaluate(() => globalThis.opened)).toEqual(['https://github.com/bfigueroa99/GraphBranch', 'https://example.com/']);
  expect(page.url()).toMatch(/^app:\/\/graphbranch\//);
  await app.close();
});

test('sin red, un repositorio real avisa que no hay conexión', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es', '--repo=bfigueroa99/GraphBranch'] });
  await expect(page.locator('#overlay')).toContainText('api.github.com', { timeout: 20_000 });
  await app.close();
});

test('--repo repetido sigue varios repos, cada uno en su pestaña, y se recuerdan al reabrir', async ({}, testInfo) => {
  const repos = ['--repo=bfigueroa99/GraphBranch', '--repo=octo/otro'];
  let { app, page, dir } = await launch(testInfo, { args: ['--lang=es', ...repos] });
  const names = () => page.locator('#repo-tabs .rt-name').allTextContents();
  await expect(page.locator('#repo-tabs')).toBeVisible({ timeout: 20_000 });
  expect(await names()).toEqual(['bfigueroa99/GraphBranch', 'octo/otro']);
  await expect(page.locator('#repo-link')).toHaveText('bfigueroa99/GraphBranch');
  await app.close();
  ({ app, page } = await launch(testInfo, { dir, args: ['--lang=es'] }));
  await expect(page.locator('#repo-tabs')).toBeVisible({ timeout: 20_000 });
  expect(await names()).toEqual(['bfigueroa99/GraphBranch', 'octo/otro']);
  await app.close();
});

test('el token se guarda cifrado, fuera de localStorage, y vuelve al reabrir', async ({}, testInfo) => {
  const TOKEN = 'ghp_e2eFAKE0123456789';
  let { app, page, dir } = await launch(testInfo);
  await loaded(page);
  await page.click('#settings-btn');
  await page.fill('#token-input', TOKEN);
  await page.click('#settings-form button[type=submit]');
  await expect.poll(() => Object.keys(tokenFiles(dir))).not.toEqual([]);

  const files = tokenFiles(dir);
  const where = await page.locator('#token-where').getAttribute('data-i18n');
  if (files['github-token.enc']) expect(files['github-token.enc'].includes(TOKEN)).toBe(false);
  // con llavero queda cifrado; sin él (Linux sin llavero) Ajustes lo dice
  expect(['settings.tokenWhereKeychain', 'settings.tokenWherePlain']).toContain(where);
  expect(await page.evaluate(() => localStorage.getItem('graphbranch:token'))).toBeNull();
  await app.close();

  ({ app, page } = await launch(testInfo, { dir }));
  await loaded(page);
  await page.click('#settings-btn');
  await expect(page.locator('#token-input')).toHaveValue(TOKEN);

  await page.click('#token-clear');
  await page.click('#settings-form button[type=submit]');
  await expect.poll(() => Object.keys(tokenFiles(dir))).toEqual([]);
  await app.close();
});

test('pasa al llavero el token que la primera versión dejaba en localStorage', async ({}, testInfo) => {
  let { app, page, dir } = await launch(testInfo);
  await loaded(page);
  await page.evaluate(() => localStorage.setItem('graphbranch:token', JSON.stringify('ghp_legacyFAKE')));
  await app.close();

  ({ app, page } = await launch(testInfo, { dir }));
  await loaded(page);
  expect(await page.evaluate(() => localStorage.getItem('graphbranch:token'))).toBeNull();
  expect(Object.keys(tokenFiles(dir))).not.toEqual([]);
  await page.click('#settings-btn');
  await expect(page.locator('#token-input')).toHaveValue('ghp_legacyFAKE');
  await app.close();
});

// estas dos pruebas no usan Playwright para la ventana: conectado a la página, la mantiene "visible"
// aunque esté escondida (ver e2e/hidden.cjs)
test('cerrar la ventana la deja en la bandeja: la página lo sabe, sigue contando novedades y vuelve', async ({}, testInfo) => {
  const r = await runHidden(testInfo, 'tray', ['--lang=es']);
  expect(r.error).toBeUndefined();
  expect(r.closed).toEqual({ visible: false, destroyed: false, hidden: true });
  expect(r.counted).toBe(true); // la demo sigue y el título (también el del ícono) cuenta las novedades
  expect(r.titleHidden).toMatch(/^\(\d+\) acme\/orbita · GraphBranch$/);
  expect(r.shown).toEqual({ visible: true, hidden: false, title: 'acme/orbita · GraphBranch' }); // como al hacer clic en una notificación
  expect(r.notices).toEqual(['GraphBranch sigue abierto']); // una sola vez, en el idioma de la página
  expect(existsSync(join(r.dir, 'tray-notice-shown'))).toBe(true);
});

test('abrir la app otra vez trae la ventana que estaba en la bandeja', async ({}, testInfo) => {
  const { app, page, dir } = await launch(testInfo);
  await loaded(page);
  await closeWindow(app);
  await expect.poll(() => windowState(app)).toEqual({ visible: false, destroyed: false });
  expect(await launchAgain(dir)).toBe(0); // la segunda instancia avisa a la primera y sale
  await expect.poll(() => windowState(app)).toEqual({ visible: true, destroyed: false });
  await app.close();
});

test('con la ventana oculta, Chromium no espacia los temporizadores a uno por minuto @lento', async ({}, testInfo) => {
  test.setTimeout(180_000);
  // el plazo antes de espaciarlos baja de 5 minutos a 1: sin el arreglo de main.js, la demo traería
  // una novedad por minuto
  const r = await runHidden(testInfo, 'timers', ['--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/1']);
  expect(r.error).toBeUndefined();
  expect(r.hidden).toBe(true);
  expect(r.second - r.first).toBeGreaterThanOrEqual(6); // la demo trae una cada ~4 s; espaciadas, 1 o 2 por minuto
});
