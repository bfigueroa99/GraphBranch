/* Pruebas e2e de la app de escritorio (Electron): se abre como la abre un usuario, sin red. */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
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
  expect(info.bridge).toEqual(['getToken', 'git', 'setLabels', 'setToken', 'show', 'webhook']);
  expect(info.fonts).toEqual(['Bricolage Grotesque', 'Instrument Sans', 'JetBrains Mono']);
  await app.close();
});

test('Guardar imagen deja un PNG en la carpeta de descargas, sin pisar el anterior', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es'] });
  const dir = testInfo.outputPath('descargas');
  mkdirSync(dir, { recursive: true });
  await app.evaluate(({ app }, d) => app.setPath('downloads', d), dir);
  await loaded(page);
  await expect(page.locator('#status-text')).toHaveText('Simulación en vivo');
  const pngs = () => readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  for (const n of [1, 2]) {
    await page.click('#snap-btn');
    await expect(page.locator('#snap-note')).toContainText('Imagen guardada: graphbranch-demo-');
    await expect.poll(pngs, { timeout: 10_000 }).toHaveLength(n);
  }
  const files = pngs();
  expect(files[0]).toMatch(/^graphbranch-demo-\d{4}-\d\d-\d\d-\d{4}( \(1\))?\.png$/);
  for (const f of files) {
    const png = readFileSync(join(dir, f));
    expect(png.toString('latin1', 1, 4)).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThan(300); // ancho
  }
  expect(page.url()).toMatch(/^app:\/\/graphbranch\//); // la ventana no navegó al blob
  await app.close();
});

test('grabar el Replay deja el video en la carpeta de descargas, con su duración', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es'] });
  const dir = testInfo.outputPath('descargas');
  mkdirSync(dir, { recursive: true });
  await app.evaluate(({ app }, d) => app.setPath('downloads', d), dir);
  await loaded(page);
  await expect(page.locator('#status-text')).toHaveText('Simulación en vivo');
  await page.click('#replay-btn');
  const rec = page.locator('#replay .rp-rec');
  await expect(rec).toHaveAttribute('aria-label', 'Grabar video');
  await rec.click();
  await expect(rec).toHaveAttribute('aria-pressed', 'true');
  await expect(rec).toHaveAttribute('aria-label', 'Detener y guardar el video');
  await page.waitForTimeout(2000);
  await rec.click();
  await expect(page.locator('#snap-note')).toContainText('Video guardado: graphbranch-demo-replay-');
  const videos = () => readdirSync(dir).filter((f) => /\.(webm|mp4)$/.test(f));
  await expect.poll(videos, { timeout: 10_000 }).toHaveLength(1);
  const [file] = videos();
  expect(file).toMatch(/^graphbranch-demo-replay-\d{4}-\d\d-\d\d-\d{4}\.webm$/);
  const webm = readFileSync(join(dir, file));
  expect(webm.readUInt32BE(0)).toBe(0x1a45dfa3); // la firma de EBML, el contenedor de WebM
  expect(webm.includes(Buffer.from([0x44, 0x89, 0x88]))).toBe(true); // y la duración, que agrega snapshot.js
  expect(webm.length).toBeGreaterThan(5000);
  expect(page.url()).toMatch(/^app:\/\/graphbranch\//);
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

test('sin red, un proyecto de GitLab avisa que no llega a gitlab.com', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es', '--repo=gitlab:grupo/sub/proyecto'] });
  await expect(page.locator('#overlay')).toContainText('No se pudo conectar con gitlab.com', { timeout: 20_000 });
  await expect(page.locator('#repo-badge')).toHaveText('GitLab');
  await app.close();
});

test('--gitlab-url suma solo ese host al CSP y la página lo recibe; sin https se ignora', async ({}, testInfo) => {
  const csp = (page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  let { app, page } = await launch(testInfo, { args: ['--lang=es', '--gitlab-url=https://git.example.com'] });
  try {
    expect(await csp(page)).toContain('https://gitlab.com https://git.example.com https://codeberg.org https://api.bitbucket.org;');
    expect(await csp(page)).toContain('https://gitlab.com https://git.example.com https://codeberg.org;');
    expect(page.url()).toContain('gitlab=' + encodeURIComponent('https://git.example.com'));
  } finally {
    await app.close();
  }
  ({ app, page } = await launch(testInfo, { args: ['--lang=es', '--gitlab-url=http://git.example.com'] }));
  try {
    expect(await csp(page)).not.toContain('git.example.com');
    expect(page.url()).not.toContain('gitlab=');
  } finally {
    await app.close();
  }
});

test('--forge-url suma solo ese host al CSP (conexiones y avatares) y la página lo recibe; sin https se ignora', async ({}, testInfo) => {
  const csp = (page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  let { app, page } = await launch(testInfo, { args: ['--lang=es', '--forge-url=https://forge.example.com'] });
  try {
    expect(await csp(page)).toContain('https://gitlab.com https://codeberg.org https://forge.example.com https://api.bitbucket.org;');
    expect(await csp(page)).toContain('https://gitlab.com https://codeberg.org https://forge.example.com;');
    expect(page.url()).toContain('forge=' + encodeURIComponent('https://forge.example.com'));
  } finally {
    await app.close();
  }
  ({ app, page } = await launch(testInfo, { args: ['--lang=es', '--forge-url=http://forge.example.com'] }));
  try {
    expect(await csp(page)).not.toContain('forge.example.com');
    expect(page.url()).not.toContain('forge=');
  } finally {
    await app.close();
  }
});

test('--api-url suma solo ese host al CSP y los repos de GitHub salen de él; sin https se ignora', async ({}, testInfo) => {
  const csp = (page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  let { app, page } = await launch(testInfo, { args: ['--lang=es', '--repo=o/r', '--api-url=https://ghe.example.com/api/v3'] });
  try {
    expect(await csp(page)).toContain('connect-src https://api.github.com https://ghe.example.com https://gitlab.com https://codeberg.org https://api.bitbucket.org;');
    expect(page.url()).toContain('api=' + encodeURIComponent('https://ghe.example.com/api/v3'));
  } finally {
    await app.close();
  }
  ({ app, page } = await launch(testInfo, { args: ['--lang=es', '--api-url=http://ghe.example.com/api/v3'] }));
  try {
    expect(await csp(page)).not.toContain('ghe.example.com');
    expect(page.url()).not.toContain('api=');
  } finally {
    await app.close();
  }
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

test('el token de GitLab se guarda cifrado, aparte del de GitHub, y vuelve al reabrir', async ({}, testInfo) => {
  const GH = 'ghp_e2eFAKE0123456789';
  const GL = 'glpat-e2eFAKE0123456789';
  let { app, page, dir } = await launch(testInfo, { args: ['--lang=es'] });
  const services = () => Object.keys(tokenFiles(dir)).map((f) => f.replace(/\.(enc|txt)$/, '')).sort();
  await loaded(page);
  await page.click('#settings-btn');
  await page.fill('#token-input', GH);
  await page.fill('#gitlab-token-input', GL);
  await page.click('#settings-form button[type=submit]');
  await expect.poll(services).toEqual(['github-token', 'gitlab-token']);
  for (const [name, content] of Object.entries(tokenFiles(dir))) {
    if (!name.endsWith('.enc')) continue;
    expect(content.includes(GH) || content.includes(GL)).toBe(false);
  }
  const where = await page.locator('#gitlab-token-where').getAttribute('data-i18n');
  expect(['settings.gitlabTokenWhereKeychain', 'settings.gitlabTokenWherePlain']).toContain(where);
  expect(await page.evaluate(() => localStorage.getItem('graphbranch:gitlabToken'))).toBeNull();
  await app.close();

  ({ app, page } = await launch(testInfo, { dir, args: ['--lang=es'] }));
  await loaded(page);
  await page.click('#settings-btn');
  await expect(page.locator('#token-input')).toHaveValue(GH);
  await expect(page.locator('#gitlab-token-input')).toHaveValue(GL);
  // borrar el de GitLab deja el de GitHub
  await page.fill('#gitlab-token-input', '');
  await page.click('#settings-form button[type=submit]');
  await expect.poll(services).toEqual(['github-token']);
  await app.close();
});

test('los avisos a Slack, Discord y Teams: la URL se guarda cifrada y la prueba llega al webhook', async ({}, testInfo) => {
  const got = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(204).end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const extraEnv = { GB_WEBHOOK_TEST_PREFIX: base };
  const SECRET = 'hook-e2eFAKE0123456789';
  try {
    let { app, page, dir } = await launch(testInfo, { args: ['--lang=es'], extraEnv });
    await loaded(page);
    await page.click('#settings-btn');
    await expect(page.locator('#hooks-box')).toBeVisible();
    await expect(page.locator('#hooks-box .hook')).toHaveCount(3);
    await page.fill('#hook-slack', `${base}/slack/${SECRET}`);
    await page.locator('#hooks-box .hook').nth(0).locator('.hook-test').click();
    await expect(page.locator('#hooks-box .hook-state').first()).toHaveText('Enviado.');
    expect(got).toHaveLength(1);
    expect(got[0].url).toBe(`/slack/${SECRET}`);
    expect(got[0].body.text).toContain('GraphBranch');
    // una URL que no es del servicio no sale de la app
    await page.fill('#hook-discord', 'https://evil.example/api/webhooks/1');
    await page.locator('#hooks-box .hook').nth(1).locator('.hook-test').click();
    await expect(page.locator('#hooks-box .hook-state').nth(1)).toHaveText('No se pudo enviar. Revisa la URL.');
    expect(got).toHaveLength(1);
    // Teams recibe una tarjeta adaptable
    await page.fill('#hook-teams', `${base}/teams/${SECRET}`);
    await page.locator('#hooks-box .hook').nth(2).locator('.hook-test').click();
    await expect(page.locator('#hooks-box .hook-state').nth(2)).toHaveText('Enviado.');
    expect(got).toHaveLength(2);
    expect(got[1].url).toBe(`/teams/${SECRET}`);
    expect(got[1].body.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
    await page.fill('#hook-teams', '');
    // los eventos que se desmarcan quedan desmarcados al volver
    await page.locator('#hooks-box .hook').first().locator('[data-event=force]').uncheck();
    await page.fill('#hook-discord', '');
    await page.click('#settings-form button[type=submit]');
    await expect.poll(() => Object.keys(tokenFiles(dir))).toHaveLength(1);
    expect(Object.keys(tokenFiles(dir))[0]).toMatch(/^slack-token\./);
    for (const [name, content] of Object.entries(tokenFiles(dir))) if (name.endsWith('.enc')) expect(content.includes(SECRET)).toBe(false);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(SECRET);
    await app.close();

    ({ app, page } = await launch(testInfo, { dir, args: ['--lang=es'], extraEnv }));
    await loaded(page);
    await page.click('#settings-btn');
    await expect(page.locator('#hook-slack')).toHaveValue(`${base}/slack/${SECRET}`);
    await expect(page.locator('#hooks-box .hook').first().locator('[data-event=force]')).not.toBeChecked();
    await expect(page.locator('#hooks-box .hook').first().locator('[data-event=release]')).toBeChecked();
    await app.close();
  } finally {
    server.close();
  }
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

/** Un repositorio git creado en la prueba, con un commit en main. */
function localRepo(testInfo) {
  const dir = testInfo.outputPath('mi repo');
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Ana', GIT_AUTHOR_EMAIL: 'ana@example.com', GIT_COMMITTER_NAME: 'Ana', GIT_COMMITTER_EMAIL: 'ana@example.com' };
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  const commit = (file, msg) => {
    writeFileSync(join(dir, file), msg);
    git('add', '-A');
    git('commit', '-q', '-m', msg);
  };
  git('init', '-q', '-b', 'main');
  commit('a.txt', 'primero');
  return { dir, git, commit };
}

test('un repositorio de esta máquina se sigue sin GitHub: ve un commit y una rama nueva al instante y se recuerda al reabrir', async ({}, testInfo) => {
  const repo = localRepo(testInfo);
  let { app, page, dir } = await launch(testInfo, { args: ['--lang=es', `--local=${repo.dir}`] });
  await loaded(page);
  await expect(page.locator('#repo-link')).toHaveText('local/mi repo');
  await expect(page.locator('#repo-badge')).toHaveText('local');
  await expect(page.locator('#st-branches')).toHaveText('1');
  await expect(page.locator('#st-commits')).toHaveText('1');
  // un commit nuevo llega sin esperar al sondeo (el proceso principal vigila .git)
  repo.commit('b.txt', 'segundo');
  await expect(page.locator('#st-commits')).toHaveText('2', { timeout: 3_000 });
  repo.git('checkout', '-q', '-b', 'experimento');
  repo.commit('c.txt', 'tercero, sin publicar');
  await expect(page.locator('#st-branches')).toHaveText('2', { timeout: 3_000 });
  await expect(page.locator('#feed')).toContainText('experimento');
  // los cambios de un commit salen de git, por el proceso principal, y se pasa al anterior con ←
  await page.click('#view-2d');
  const head = page.locator('#graph svg .head[role=button]', { hasText: 'experimento' });
  await head.focus();
  await page.keyboard.press('Enter');
  await page.locator('#graph .tip .tip-diff').click();
  await expect(page.locator('#diff-panel .df-msg')).toHaveText('tercero, sin publicar');
  await expect(page.locator('#diff-panel .df-jump')).toHaveText(['Ac.txt']);
  await expect(page.locator('#diff-panel .df-code .dl-add')).toContainText(['tercero, sin publicar']);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#diff-panel .df-msg')).toHaveText('segundo');
  await expect(page.locator('#diff-panel .df-jump')).toHaveText(['Ab.txt']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#diff-panel')).toBeHidden();
  // la página nunca llegó a la red: solo habló con el proceso principal
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /^https?:/.test(e.name)).length)).toBe(0);
  await app.close();
  // al reabrir sin --local, la carpeta sigue seguida (el proceso principal recuerda las que se eligieron)
  ({ app, page } = await launch(testInfo, { dir, args: ['--lang=es'] }));
  await loaded(page);
  await expect(page.locator('#repo-link')).toHaveText('local/mi repo');
  await expect(page.locator('#st-branches')).toHaveText('2');
  await app.close();
});

test('la bitácora en vivo de un repo de esta máquina: se cierra en la app de escritorio y sigue cerrada al reabrir', async ({}, testInfo) => {
  const repo = localRepo(testInfo);
  repo.commit('b.txt', 'segundo');
  let { app, page, dir } = await launch(testInfo, { args: ['--lang=es', `--local=${repo.dir}`] });
  await loaded(page);
  await expect(page.locator('#st-bitacora-label')).toHaveText('Bitácora n.º 1');
  await expect(page.locator('#st-bitacora-score')).toHaveText(/^\d+$/);
  await page.click('#st-bitacora');
  await expect(page.locator('#bitacora')).toBeVisible();
  await expect(page.locator('#bt-dek')).toContainText('2 commits');
  await expect(page.locator('#bitacora [data-sec="history"]')).toContainText('Todavía no se cerró ninguna bitácora');
  await page.fill('#bt-title-input', 'Primera semana');
  await page.click('#bt-close-btn');
  await expect(page.locator('#bt-eyebrow')).toContainText('n.º 2');
  await expect(page.locator('#bitacora [data-sec="history"] tbody tr')).toHaveCount(1);
  await app.close();
  // lo cerrado queda en el almacenamiento de la app: al reabrir, la siguiente sigue siendo la n.º 2
  ({ app, page } = await launch(testInfo, { dir, args: ['--lang=es'] }));
  await loaded(page);
  await expect(page.locator('#st-bitacora-label')).toHaveText('Bitácora n.º 2');
  await page.click('#st-bitacora');
  await expect(page.locator('#bitacora [data-sec="history"] tbody tr')).toHaveText([/1\s*.*Primera semana/]);
  await app.close();
});

test('el botón Abrir carpeta está en la app de escritorio y un --local que no es un repo se salta sin romper la demo', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es'] });
  await expect(page.locator('#folder-btn')).toBeVisible();
  await expect(page.locator('#folder-btn')).toHaveText('Abrir carpeta…');
  // los argumentos son del usuario: una carpeta que no es un repo se salta y la demo sigue
  await app.close();
  const none = mkdtempSync(join(tmpdir(), 'gb-sin-repo-')); // fuera del proyecto: dentro de él, git subiría hasta su repo
  const again = await launch(testInfo, { args: ['--lang=es', `--local=${none}`] });
  await loaded(again.page);
  await expect(again.page.locator('#repo-badge')).toHaveText('simulación');
  await again.app.close();
});

test('a 320 px la barra con Abrir carpeta no desborda, ni en los idiomas de textos largos', async ({}, testInfo) => {
  for (const lang of ['ta', 'de']) {
    const { app, page } = await launch(testInfo, { dir: testInfo.outputPath('perfil-' + lang), args: [`--lang=${lang}`] });
    await loaded(page);
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(100, 100);
      win.setSize(320, 640);
    });
    await expect(page.locator('#folder-btn')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: lang })
      .toBeLessThanOrEqual(0);
    const box = await page.locator('#folder-btn').boundingBox();
    expect(box.x + box.width, lang).toBeLessThanOrEqual(320);
    await app.close();
  }
});

test('la página no puede pedir carpetas que el usuario no eligió', async ({}, testInfo) => {
  const { app, page } = await launch(testInfo, { args: ['--lang=es'] });
  const err = await page.evaluate(() => window.GBDesktop.git.branches('0123456789ab').then(() => null, (e) => e.message));
  expect(err).toContain('unknown');
  const bad = await page.evaluate(() => window.GBDesktop.git.log('0123456789ab', '--output=/tmp/x', null, 5).then(() => null, (e) => e.message));
  expect(bad).toContain('unknown'); // el id se comprueba antes que lo demás
  const diff = await page.evaluate(() => window.GBDesktop.git.diff('0123456789ab', '--output=/tmp/x').then(() => null, (e) => e.message));
  expect(diff).toContain('unknown');
  expect(await page.evaluate(() => Object.keys(window.GBDesktop.git).sort())).toEqual(['branches', 'diff', 'files', 'isAncestor', 'log', 'onChange', 'pick', 'unwatch', 'watch']);
  await app.close();
});

test('--bitbucket-url suma solo ese host a las conexiones del CSP (sin avatares) y la página lo recibe; sin https se ignora', async ({}, testInfo) => {
  const csp = (page) => page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  let { app, page } = await launch(testInfo, { args: ['--lang=es', '--bitbucket-url=https://bb.example.com'] });
  try {
    expect(await csp(page)).toContain('https://gitlab.com https://codeberg.org https://api.bitbucket.org https://bb.example.com;');
    expect(await csp(page)).toContain('img-src \'self\' data: https://avatars.githubusercontent.com https://gitlab.com https://codeberg.org;');
    expect(page.url()).toContain('bitbucket=' + encodeURIComponent('https://bb.example.com'));
    // su token, aparte en el llavero ('bitbucketdc') y atado a ese servidor; Ajustes muestra su campo nombrando el host
    const packed = JSON.stringify({ base: 'https://bb.example.com', token: 'dc-e2e' });
    const back = await page.evaluate(async (v) => {
      await window.GBDesktop.setToken(v, 'bitbucketdc');
      return (await window.GBDesktop.getToken('bitbucketdc')).token;
    }, packed);
    expect(back).toBe(packed);
    await page.click('#settings-btn');
    await expect(page.locator('#bbdc-token-field')).toBeVisible();
    await expect(page.locator('#bbdc-token-where')).toContainText('bb.example.com');
  } finally {
    await app.close();
  }
  ({ app, page } = await launch(testInfo, { args: ['--lang=es', '--bitbucket-url=http://bb.example.com'] }));
  try {
    expect(await csp(page)).not.toContain('bb.example.com');
    expect(page.url()).not.toContain('bitbucket=');
  } finally {
    await app.close();
  }
});
