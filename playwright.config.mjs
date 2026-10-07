/* Pruebas e2e (npm run test:e2e): la app de escritorio y la web, como las usa una persona.
   En Linux sin pantalla: xvfb-run npm run test:e2e */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  workers: 1, // las pruebas abren la app de escritorio: de a una
  reporter: 'list',
  webServer: {
    command: 'node e2e/serve.mjs 4173',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
  },
  use: {
    // la web se prueba en el Chromium de Playwright (npx playwright install chromium); para usar otro: PLAYWRIGHT_CHROMIUM_PATH
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
});
