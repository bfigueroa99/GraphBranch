/* Pruebas e2e de la web: la misma página en Chromium, servida por http (como GitHub Pages) y
   abierta con doble clic (file://), y la web instalada que vuelve a abrir sin red. */
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { root } from './app.mjs';
import { serve } from './serve.mjs';

test.use({ locale: 'es-ES' });

/** Errores de la página (incluidas las violaciones de CSP) y peticiones a otros sitios. */
function watch(page) {
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push('consola: ' + m.text()));
  page.on('pageerror', (e) => problems.push('error: ' + e.message));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['127.0.0.1:4173', ''].includes(url.host) && url.protocol !== 'data:') problems.push('petición a ' + r.url());
  });
  return problems;
}

async function expectWorks(page) {
  await expect(page.locator('#status')).not.toHaveAttribute('data-state', 'loading', { timeout: 20_000 });
  await expect(page.locator('#status-text')).toHaveText('Simulación en vivo');
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      libs: [typeof d3, typeof THREE, typeof THREE.OrbitControls],
      fonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))].sort(),
      desktop: typeof window.GBDesktop,
    };
  });
  expect(info).toEqual({ libs: ['object', 'object', 'function'], fonts: ['Bricolage Grotesque', 'Instrument Sans', 'JetBrains Mono'], desktop: 'undefined' });
}

test('por http carga sin errores, sin violaciones de CSP y sin pedir nada a otros sitios', async ({ page }) => {
  const problems = watch(page);
  await page.goto('http://127.0.0.1:4173/index.html');
  await expectWorks(page);
  expect(problems).toEqual([]);
});

test('abierta con doble clic y sin red funciona igual', async ({ page, context }) => {
  const problems = watch(page);
  await context.setOffline(true);
  await page.goto(pathToFileURL(join(root, 'index.html')).href);
  await expectWorks(page);
  expect(problems).toEqual([]);
});

test('el token se queda en este navegador y Ajustes lo dice', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/index.html');
  await expectWorks(page);
  await page.click('#settings-btn');
  await expect(page.locator('#token-where')).toHaveText('El token se guarda solo en este navegador y se envía únicamente a api.github.com.');
  await page.fill('#token-input', 'ghp_webFAKE');
  await page.click('#settings-form button[type=submit]');
  expect(await page.evaluate(() => localStorage.getItem('graphbranch:token'))).toBe('"ghp_webFAKE"');
});

test('se puede instalar y, una vez abierta, vuelve a abrir sin red ni servidor', async ({ page, context }) => {
  // un servidor propio, para apagarlo a mitad de la prueba
  const server = await serve(4174);
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push('consola: ' + m.text()));
  page.on('pageerror', (e) => problems.push('error: ' + e.message));
  try {
    await page.goto('http://127.0.0.1:4174/index.html');
    await expectWorks(page);
    // el service worker ya guardó la página y la controla
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
    // el navegador la ofrece para instalar (las pruebas corren en incógnito, donde nunca se instala: eso no cuenta)
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);
  } finally {
    await new Promise((done) => {
      server.close(done);
      server.closeAllConnections();
    });
  }
  await context.setOffline(true);
  await page.reload();
  await expectWorks(page);
  expect(problems).toEqual([]);
  // un repo de GitHub abre igual, con el aviso de que no hay conexión
  await page.goto('http://127.0.0.1:4174/index.html?repo=bfigueroa99/GraphBranch');
  await expect(page.locator('#overlay')).toContainText('api.github.com', { timeout: 20_000 });
  // y de la API nunca se guardó nada
  const saved = await page.evaluate(async () => (await (await caches.open('graphbranch')).keys()).map((r) => r.url));
  expect(saved.filter((url) => !url.startsWith('http://127.0.0.1:4174/'))).toEqual([]);
});
