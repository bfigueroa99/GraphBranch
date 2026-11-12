/* Pruebas e2e (npm run test:e2e): la app de escritorio y la web, como las usa una persona.
   En Linux sin pantalla: xvfb-run npm run test:e2e
   El servidor de la web escucha en 4173 (y la prueba de sin conexión, en 4174); con otra sesión en la misma
   máquina, GB_E2E_PORT=<puerto> los mueve a ese y al siguiente. */
import { defineConfig } from '@playwright/test';
import { e2ePort } from './e2e/serve.mjs';

const PORT = e2ePort();

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  workers: 1, // las pruebas abren la app de escritorio: de a una
  reporter: 'list',
  webServer: {
    command: `node e2e/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
  },
  use: {
    // la web se prueba en el Chromium de Playwright (npx playwright install chromium); para usar otro: PLAYWRIGHT_CHROMIUM_PATH
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
});
