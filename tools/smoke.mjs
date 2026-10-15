#!/usr/bin/env node
/* Prueba de humo: abre la app en un Chromium sin ventana, en modo demo, recorre lo principal
   y falla si algo lanza un error.

     node tools/smoke.mjs            escenarios básicos (unos 30 s)
     node tools/smoke.mjs --langs    además abre la app en los 40 idiomas, en pantalla de celular

   Errores (salida distinta de 0): un error de JavaScript o de consola, una consulta a
   api.github.com durante la demo (no debería hacer ninguna), un paso que no llega a su
   estado esperado o una página más ancha que la pantalla del celular.

   Necesita Playwright con Chromium: `npm i -g playwright && npx playwright install chromium`
   (o el del proyecto, tras `npm ci`). PLAYWRIGHT_CHROMIUM_PATH elige otro Chromium, como en las e2e.
   Los scripts de CDN vienen de internet; detrás de un proxy, Chromium toma el del entorno
   (HTTPS_PROXY y NO_PROXY), así el servidor local no pasa por él. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allLangs = process.argv.includes('--langs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Servidor estático mínimo: la app no necesita nada más. */
function serve() {
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, path || 'index.html');
    if (!file.startsWith(root + sep) && file !== root) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* no está en el proyecto: se busca la instalación global */
  }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  } catch {
    console.error('Falta Playwright: npm i -g playwright && npx playwright install chromium');
    process.exit(2);
  }
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  // como en las pruebas e2e: otro Chromium que el de esta versión de Playwright
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  // WebGL por software, para que la vista 3D también se pruebe sin GPU
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

/** Abre una pestaña que anota todo error y aísla la app de lo que no es suyo. */
async function openPage(contextOptions = {}) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...contextOptions });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`excepción: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(`consola: ${m.text()}`));
  // la demo no debe consultar GitHub; las fuentes y avatares se sirven vacíos para no depender de la red
  await page.route('https://api.github.com/**', (r) => {
    page.errors.push(`la demo consultó ${r.request().url()}`);
    return r.abort();
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://avatars.githubusercontent.com/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG_1PX }));
  return page;
}

/** `allow`: errores de consola que el paso provoca a propósito (por ejemplo, un 404 de la API simulada). */
async function step(page, name, fn, { allow = null } = {}) {
  const before = page.errors.length;
  const errs = [];
  try {
    await fn();
  } catch (e) {
    errs.push(e.message.split('\n')[0]);
  }
  // la excepción de la app explica mejor que el timeout
  errs.unshift(...page.errors.slice(before).filter((e) => !allow?.test(e)));
  if (errs.length) fail(`${name}: ${errs.join(' | ')}`);
  else console.log(`  ✓ ${name}`);
}

const loaded = (page) => page.waitForSelector('#overlay', { state: 'hidden', timeout: 20000 });

/** Guarda la vista con el botón de la cámara y revisa el archivo: un PNG con las proporciones de la
    vista (más la franja de abajo) y con dibujo, no un lienzo vacío. Con `dots`, además, en el centro
    de cada uno de esos elementos (los commits de la 2D) la imagen tiene su color. Devuelve cuántos
    colores distintos tiene. */
async function snapshot(page, sel, { minColors = 100, dots = null } = {}) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#snap-btn')]);
  const name = dl.suggestedFilename();
  if (!/^graphbranch-demo-\d{4}-\d\d-\d\d-\d{4}\.png$/.test(name)) throw new Error(`nombre inesperado: ${name}`);
  const note = await page.textContent('#snap-note');
  if (!note.includes(name)) throw new Error(`el aviso dice "${note}"`);
  const png = readFileSync(await dl.path());
  if (png.toString('latin1', 1, 4) !== 'PNG') throw new Error('no es un PNG');
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  const res = await page.evaluate(
    async ({ b64, sel, dots }) => {
      const wrap = document.querySelector(sel);
      const r = wrap.getBoundingClientRect();
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      // colores distintos (con 5 bits por canal) sin contar la franja de abajo
      const d = x.getImageData(0, 0, c.width, Math.round(c.height * 0.9)).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
      const k = img.width / Math.round(r.width);
      const off = [];
      let checked = 0;
      for (const dot of dots ? wrap.querySelectorAll(dots) : []) {
        const b = dot.getBoundingClientRect();
        const [cx, cy] = [b.left + b.width / 2, b.top + b.height / 2];
        // solo los que se ven enteros y lejos de los bordes (la leyenda y el minimapa los tapan)
        if (b.width < 6 || cx < r.left + r.width * 0.3 || cx > r.right - 10 || cy < r.top + 30 || cy > r.bottom - 90) continue;
        if (document.elementFromPoint(cx, cy)?.closest('.node') !== dot.closest('.node')) continue;
        const want = getComputedStyle(dot).fill.match(/\d+/g).slice(0, 3).map(Number);
        const got = x.getImageData(Math.round((cx - r.left) * k), Math.round((cy - r.top) * k), 1, 1).data;
        checked++;
        if (want.some((v, i) => Math.abs(v - got[i]) > 24)) off.push(`${want} en lugar de ${[...got].slice(0, 3)}`);
      }
      return { box: { w: Math.round(r.width), h: Math.round(r.height) + GB.snapshot.CAPTION }, colors: seen.size, checked, off };
    },
    { b64: png.toString('base64'), sel, dots },
  );
  const { box, colors } = res;
  if (w < box.w || Math.abs(w / h - box.w / box.h) > 0.01) throw new Error(`mide ${w}×${h} y la vista ${box.w}×${box.h}`);
  if (colors < minColors) throw new Error(`la imagen casi no tiene dibujo: ${colors} colores`);
  if (dots && res.checked < 3) throw new Error(`solo ${res.checked} commits a la vista para comparar`);
  if (res.off.length) throw new Error(`commits de otro color en la imagen: ${res.off.slice(0, 3).join('; ')}`);
  return colors;
}

/** Revisa un video que guardó la página: un WebM (o MP4) que se reproduce, de la medida de la vista
    más la franja de abajo, con dibujo, que dice cuánto dura y que dura lo que debe. La app no lo
    puede abrir (su CSP no deja reproducir nada): se abre en una pestaña en blanco del mismo navegador. */
async function videoFile(page, dl, sel, { minSeconds, maxSeconds }) {
  const name = dl.suggestedFilename();
  if (!/^graphbranch-demo-replay-\d{4}-\d\d-\d\d-\d{4}\.(webm|mp4)$/.test(name)) throw new Error(`nombre inesperado: ${name}`);
  const note = await page.textContent('#snap-note');
  if (!note.includes(name)) throw new Error(`el aviso dice "${note}"`);
  const file = readFileSync(await dl.path());
  const webm = name.endsWith('.webm');
  // la firma de EBML (el contenedor de WebM) o la caja ftyp de MP4
  if (webm ? file.readUInt32BE(0) !== 0x1a45dfa3 : file.toString('latin1', 4, 8) !== 'ftyp') throw new Error('el archivo no es un video');
  const box = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { w: Math.round(r.width) & ~1, h: Math.round(r.height + GB.snapshot.CAPTION) & ~1 };
  }, sel);
  const probe = await page.context().newPage();
  let v;
  try {
    v = await probe.evaluate(
      async ({ b64, type }) => {
        const video = document.createElement('video');
        video.muted = true;
        video.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type }));
        const once = (ev) =>
          new Promise((ok, ko) => {
            video.addEventListener(ev, ok, { once: true });
            video.addEventListener('error', () => ko(new Error('el navegador no lo pudo abrir')), { once: true });
            setTimeout(() => ko(new Error(`no llegó ${ev}`)), 10000);
          });
        await once('loadedmetadata');
        // MediaRecorder no la anota: la agrega snapshot.js, y sin ella no se sabría hasta el final
        const seconds = video.duration;
        if (!isFinite(seconds)) throw new Error('el video no dice cuánto dura');
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const x = c.getContext('2d', { willReadFrequently: true });
        // colores distintos (con 5 bits por canal, sin la franja de abajo) en varios puntos del video;
        // cada cuadro se lee cuando ya está decodificado, no apenas termina de buscarlo
        const samples = [];
        for (const at of [0.25, 0.5, 0.75]) {
          video.currentTime = seconds * at;
          await once('seeked');
          for (let i = 0; i < 40 && video.readyState < 2; i++) await new Promise((ok) => setTimeout(ok, 50));
          x.drawImage(video, 0, 0);
          const d = x.getImageData(0, 0, c.width, Math.round(c.height * 0.9)).data;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
          samples.push(seen.size);
        }
        return { seconds, w: c.width, h: c.height, samples };
      },
      { b64: file.toString('base64'), type: webm ? 'video/webm' : 'video/mp4' },
    );
  } finally {
    await probe.close();
  }
  if (v.w !== box.w || v.h !== box.h) throw new Error(`mide ${v.w}×${v.h} y la vista ${box.w}×${box.h}`);
  // en la mitad de los puntos, al menos: si falla, los tres dicen si es un tramo vacío o un cuadro suelto
  if (v.samples.filter((n) => n >= 100).length < 2) throw new Error(`el video casi no tiene dibujo: ${v.samples.join(', ')} colores al 25, 50 y 75 %`);
  if (!(v.seconds >= minSeconds && v.seconds <= maxSeconds)) throw new Error(`dura ${v.seconds.toFixed(1)} s y no entre ${minSeconds} y ${maxSeconds}`);
  return v;
}
// contra clientWidth y no innerWidth: en el celular emulado (isMobile) la vista crece hasta el contenido,
// así que innerWidth se estiraba con el desborde y la resta daba siempre 0 (con 520 px de barra en una
// pantalla de 390: scrollWidth 532, innerWidth 532, clientWidth 390)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ---------- escritorio ---------- */

console.log('Escritorio (1280×800)');
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  let has3d = false;

  await step(page, 'carga la demo', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    has3d = (await page.locator('#graph3d canvas').count()) > 0 && (await page.locator('#graph3d').isVisible());
    if (!has3d) console.log('    (sin WebGL: la app abrió la vista 2D)');
  });

  await step(page, 'llega actividad al panel', async () => {
    await page.waitForSelector('#feed > li', { timeout: 30000 });
  });

  await step(page, 'el estado no se anuncia cada segundo', async () => {
    // lo que cambie dentro de una región viva lo lee el lector de pantalla
    const changes = await page.evaluate(
      () =>
        new Promise((ok) => {
          let n = 0;
          const mo = new MutationObserver((list) => (n += list.length));
          for (const r of document.querySelectorAll('#status[aria-live], #status [aria-live]'))
            mo.observe(r, { subtree: true, childList: true, characterData: true });
          setTimeout(() => (mo.disconnect(), ok(n)), 3500);
        }),
    );
    if (changes > 1) throw new Error(`la región viva del estado cambió ${changes} veces en 3,5 s`);
  });

  await step(page, 'los avisos se retienen con el foco y se anuncian una sola vez', async () => {
    const t = await page.waitForSelector('#toasts .toast:not(.leaving)', { timeout: 30000 });
    // regiones vivas anidadas: algunos lectores anuncian dos veces cada aviso
    const nested = await page.evaluate(() =>
      document.querySelector('#toasts')?.hasAttribute('aria-live')
        ? document.querySelectorAll('#toasts [role=status], #toasts [role=alert], #toasts [aria-live]').length
        : 0,
    );
    await t.evaluate((el) => el.querySelector('.toast-main').focus());
    await page.waitForTimeout(7000); // un aviso común dura 6 s
    const kept = await t.evaluate((el) => el.isConnected && !el.classList.contains('leaving'));
    await page.evaluate(() => document.activeElement?.blur());
    if (nested) throw new Error(`${nested} avisos son regiones vivas dentro de otra`);
    if (!kept) throw new Error('el aviso con el foco se cerró solo');
  });

  await step(page, 'vista 2D', async () => {
    await page.click('#view-2d');
    await page.waitForSelector('#graph svg .node', { timeout: 10000 });
    if (await page.locator('#graph3d').isVisible()) throw new Error('la vista 3D sigue visible');
  });

  await step(page, 'tags y despliegues: banderín en el commit con tag y placa en el de cada entorno', async () => {
    await page.waitForSelector('#graph svg .node .tag-flag', { timeout: 10000, state: 'attached' });
    await page.waitForSelector('#graph svg .node .env-plate', { timeout: 10000, state: 'attached' });
    const texts = await page.$$eval('#graph svg .tag-text, #graph svg .env-plate text', (els) => els.map((e) => e.textContent));
    if (!texts.some((x) => /^v1\.\d/.test(x))) throw new Error(`ningún banderín con el nombre del tag: ${texts}`);
    if (!texts.some((x) => /production|staging/.test(x))) throw new Error(`ninguna placa con el nombre del entorno: ${texts}`);
  });

  await step(page, 'guarda la vista 2D como imagen, con cada commit en su lugar y de su color', async () => {
    // en pausa nada se mueve entre la imagen y la comparación
    await page.click('#pause-btn');
    await page.waitForTimeout(1200);
    try {
      await snapshot(page, '#graph', { dots: '.node:not(.merge) .dot' });
    } finally {
      await page.click('#pause-btn');
    }
  });

  if (has3d) {
    await step(page, 'vuelve a 3D', async () => {
      await page.click('#view-3d');
      await page.waitForSelector('#graph3d', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(1500); // unos cuantos cuadros de animación
    });

    // la escena se copia en la misma tarea en que se dibuja: leída después, WebGL la habría borrado
    // y quedarían solo el fondo y las etiquetas (unos 125 colores; con la escena, más de 1.000)
    await step(page, 'guarda la vista 3D como imagen, con la escena', async () => {
      await snapshot(page, '#graph3d', { minColors: 500 });
    });

    await step(page, 'modo vuelo', async () => {
      await page.click('#fly-btn');
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    // un botón con aria-pressed que entra y sale de un modo, con unos segundos de animación entre medio
    const toggles = async (sel, ms) => {
      const pressed = () => page.getAttribute(sel, 'aria-pressed');
      await page.click(sel);
      await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-pressed') === 'true', sel, { timeout: 5000 });
      await page.waitForTimeout(ms);
      await page.click(sel);
      if ((await pressed()) !== 'false') throw new Error(`${sel} no se apagó`);
    };

    await step(page, 'modo galaxias', () => toggles('#galaxy-btn', 3000));
    await step(page, 'director de cámara', () => toggles('#director-btn', 3000));

    await step(page, 'modo TV (entra y sale)', async () => {
      await page.click('#tv-btn');
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      await page.waitForTimeout(3000); // el director elige planos
      await page.click('#tv-exit');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      if (new URL(page.url()).searchParams.has('tv')) throw new Error('la URL sigue con ?tv');
    });

    await step(page, 'modo TV con teclado: el foco no se pierde y Esc sale', async () => {
      const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
      const tvOn = (v) => page.waitForFunction((on) => document.documentElement.classList.contains('tv') === on, v, { timeout: 5000 });
      await page.focus('#tv-btn');
      await page.keyboard.press('Enter');
      await tvOn(true);
      await page.waitForTimeout(200);
      const onEnter = await active();
      await page.keyboard.press('Escape');
      const escOk = await tvOn(false).then(() => true, () => false);
      if (!escOk) {
        await page.click('#tv-exit');
        await tvOn(false);
      }
      // salir con el botón de la barra del modo TV, que se esconde: el foco vuelve al botón TV
      await page.focus('#tv-btn');
      await page.keyboard.press('Enter');
      await tvOn(true);
      await page.focus('#tv-exit');
      await page.keyboard.press('Enter');
      await tvOn(false);
      await page.waitForTimeout(200);
      const onExit = await active();
      if (onEnter !== 'graph3d') throw new Error(`al entrar, el foco quedó en ${onEnter} (no en el grafo)`);
      if (!escOk) throw new Error('Esc no sale del modo TV');
      if (onExit !== 'tv-btn') throw new Error(`al salir, el foco quedó en ${onExit} (no en el botón TV)`);
    });

    await step(page, 'en modo TV, mover el ratón no vuelve a leer el tema', async () => {
      await page.click('#tv-btn');
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      // readTheme (3D, 2D y mundo abierto) es lo único que pide el estilo calculado de los contenedores
      await page.evaluate(() => {
        const orig = window.getComputedStyle;
        window.__themeReads = 0;
        window.getComputedStyle = function (node, ...rest) {
          if (node?.id === 'graph3d' || node?.id === 'graph') window.__themeReads++;
          return orig.call(this, node, ...rest);
        };
      });
      for (let i = 0; i < 30; i++) await page.mouse.move(300 + i * 15, 400 + (i % 5) * 10);
      await page.waitForTimeout(300);
      const reads = await page.evaluate(() => window.__themeReads);
      // un cambio de tema de verdad sí se relee
      const themed = await page.evaluate(async () => {
        const before = window.__themeReads;
        document.documentElement.dataset.theme = 'dark';
        await new Promise((r) => setTimeout(r, 100));
        delete document.documentElement.dataset.theme;
        await new Promise((r) => setTimeout(r, 100));
        return window.__themeReads - before;
      });
      await page.click('#tv-exit');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      if (reads > 4) throw new Error(`30 movimientos del ratón leyeron el tema ${reads} veces`);
      if (themed < 2) throw new Error('cambiar data-theme ya no relee el tema');
    });

    const flying = (on) =>
      page.waitForFunction((v) => document.querySelector('#fly-btn')?.getAttribute('aria-pressed') === v, String(on), { timeout: 5000 });

    await step(page, 'volando, el director espera al piloto', async () => {
      await page.click('#fly-btn');
      await flying(true);
      await page.click('#director-btn');
      await page.waitForTimeout(500);
      const waiting = await page.locator('#director-btn.waiting').count();
      await page.click('#director-btn');
      await page.click('#fly-btn');
      await flying(false);
      if (!waiting) throw new Error('el director tomó la cámara en pleno vuelo');
    });

    await step(page, 'volando, entrar al modo TV deja la cámara al director', async () => {
      await page.click('#fly-btn');
      await flying(true);
      await page.click('#tv-btn');
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      const left = await flying(false).then(() => true, () => false);
      await page.click('#tv-exit');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
      if (!left) {
        await page.click('#fly-btn');
        throw new Error('el modo TV quedó congelado en el vuelo');
      }
    });
  }

  await step(page, 'replay', async () => {
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: 5000 });
  });

  await step(page, 'replay: tramo de fechas y rótulos propios', async () => {
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: 5000 });
    await page.click('#replay .rp-opts');
    await page.fill('#rp-form [name=title]', 'Sprint 12');
    await page.fill('#rp-form [name=footer]', 'Lanzamiento 2.0');
    await page.click('#rp-form button[type=submit]');
    await page.waitForSelector('#replay .rp-head:not([hidden])', { timeout: 3000 });
    if ((await page.textContent('#replay .rp-head')) !== 'Sprint 12') throw new Error('el título no se ve en el Replay');
    if ((await page.textContent('#replay .rp-foot')) !== 'Lanzamiento 2.0') throw new Error('el pie de foto no se ve en el Replay');
    // un tramo sin commits avisa y deja el Replay como estaba
    await page.click('#replay .rp-opts');
    await page.fill('#rp-form [name=from]', '1990-01-01');
    await page.fill('#rp-form [name=to]', '1990-01-02');
    await page.click('#rp-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#rp-form .rp-form-msg')?.textContent, null, { timeout: 3000 });
    if (!(await page.locator('#replay').isVisible())) throw new Error('un tramo vacío cerró el Replay');
    if (!(await page.locator('#replay .rp-head').isVisible())) throw new Error('un tramo vacío borró los rótulos');
    // un tramo que sí abarca la historia (desde 2000) la reproduce
    await page.fill('#rp-form [name=from]', '2000-01-01');
    await page.fill('#rp-form [name=to]', '');
    await page.click('#rp-form button[type=submit]');
    await page.waitForSelector('#rp-form', { state: 'hidden', timeout: 3000 });
    await page.click('#replay .rp-opts');
    await page.click('#rp-form button[type=reset]');
    await page.waitForSelector('#replay .rp-head', { state: 'hidden', timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: 5000 });
  });

  await step(page, 'replay: el enlace con tramo y rótulos arranca solo', async () => {
    await page.goto(`${base}/index.html?lang=es&replay=2000-01-01..&title=Sprint%2012&footer=Lanzamiento%202.0`);
    await loaded(page);
    await page.waitForSelector('#replay', { state: 'visible', timeout: 8000 });
    if ((await page.textContent('#replay .rp-head')) !== 'Sprint 12') throw new Error('el título del enlace no se ve en el Replay');
    if ((await page.textContent('#replay .rp-foot')) !== 'Lanzamiento 2.0') throw new Error('el pie de foto del enlace no se ve');
    await page.click('#replay .rp-opts');
    if ((await page.inputValue('#rp-form [name=from]')) !== '2000-01-01') throw new Error('el formulario no muestra el tramo del enlace');
    await page.keyboard.press('Escape');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: 5000 });
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
  });

  await step(page, 'replay: solo se actualiza la vista a la vista', async () => {
    await page.click('#view-2d');
    await page.evaluate(() => {
      const G3 = window.GB.Graph3D.prototype;
      window.__g3u = 0;
      window.__g3orig = G3.update;
      G3.update = function (...a) {
        window.__g3u++;
        return window.__g3orig.apply(this, a);
      };
    });
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2000);
    const hidden = await page.evaluate(() => window.__g3u);
    // la vista que estaba oculta se pone al día al mostrarse
    await page.click('#view-3d');
    const after = await page.evaluate(() => window.__g3u);
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: 5000 });
    await page.evaluate(() => { window.GB.Graph3D.prototype.update = window.__g3orig; });
    if (hidden > 2) throw new Error(`el Replay actualizó la vista 3D oculta ${hidden} veces`);
    if (after <= hidden) throw new Error('la vista 3D no se puso al día al mostrarse durante el Replay');
  });

  // grabar empieza la historia desde el principio, y al llegar al final el video se guarda solo
  await step(page, 'graba el Replay en video, de principio a fin', async () => {
    const sel = has3d && (await page.locator('#graph3d').isVisible()) ? '#graph3d' : '#graph';
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: 5000 });
    const rec = page.locator('#replay .rp-rec');
    if (!(await rec.isVisible())) throw new Error('no se ofrece grabar');
    while ((await page.textContent('#replay .rp-speed')) !== '4×') await page.click('#replay .rp-speed');
    await page.waitForTimeout(1500);
    const saved = page.waitForEvent('download', { timeout: 30000 });
    const t0 = Date.now();
    // el canvas del que graba MediaRecorder ya tiene que tener dibujo cuando el grabador arranca
    await page.evaluate(() => {
      const canvases = [];
      const cs = HTMLCanvasElement.prototype.captureStream;
      HTMLCanvasElement.prototype.captureStream = function (...a) {
        canvases.push(this);
        return cs.apply(this, a);
      };
      window.__recStart = null;
      const st = MediaRecorder.prototype.start;
      MediaRecorder.prototype.start = function (...a) {
        const c = canvases[canvases.length - 1];
        const d = c.getContext('2d').getImageData(0, 0, c.width, Math.round(c.height * 0.9)).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
        window.__recStart = seen.size;
        return st.apply(this, a);
      };
    });
    await rec.click();
    if ((await rec.getAttribute('aria-pressed')) !== 'true') throw new Error('el botón no queda encendido');
    if (Number(await page.inputValue('#replay .rp-range')) > 100) throw new Error('no volvió al principio de la historia');
    await page.waitForTimeout(2000);
    // sin GPU, la historia entera tardaría demasiado: se salta casi al final
    await page.$eval('#replay .rp-range', (r) => {
      r.value = 960;
      r.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const dl = await saved;
    const took = (Date.now() - t0) / 1000;
    await videoFile(page, dl, sel, { minSeconds: 1.5, maxSeconds: took + 1 });
    const atStart = await page.evaluate(() => window.__recStart);
    if (!(atStart >= 100)) throw new Error(`el grabador arrancó con el canvas vacío: ${atStart} colores al empezar`);
    if ((await rec.getAttribute('aria-pressed')) !== 'false') throw new Error('el botón sigue encendido');
  });

  await step(page, 'parar la grabación a mano también guarda el video', async () => {
    const sel = has3d && (await page.locator('#graph3d').isVisible()) ? '#graph3d' : '#graph';
    const rec = page.locator('#replay .rp-rec');
    const saved = page.waitForEvent('download', { timeout: 15000 });
    await rec.click();
    await page.waitForTimeout(2500);
    await rec.click();
    await videoFile(page, await saved, sel, { minSeconds: 1.5, maxSeconds: 5 });
    while ((await page.textContent('#replay .rp-speed')) !== '1×') await page.click('#replay .rp-speed');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: 5000 });
  });

  await step(page, 'ajustes', async () => {
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#settings:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'vitrina de logros', async () => {
    await page.click('#trophy-btn');
    await page.waitForSelector('#trophies[open]', { timeout: 3000 });
    await page.click('#trophies-close');
    await page.waitForSelector('#trophies:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'salud del repo: listas y ritmo de lo ya cargado, y cada fila lleva a su rama', async () => {
    await page.click('#health-btn');
    await page.waitForSelector('#health[open]', { timeout: 3000 });
    const info = await page.evaluate(() => {
      const d = document.querySelector('#health');
      const w = d.querySelector('.tr-wrap');
      return {
        stats: d.querySelectorAll('.hl-stat').length,
        rows: d.querySelectorAll('.hl-list [data-go]').length,
        text: d.textContent,
        overflow: w.scrollWidth - w.clientWidth,
      };
    });
    const dora = await page.$$eval('#hl-dora .hl-line', (ps) => ps.map((p) => p.textContent));
    if (dora.length !== 2) throw new Error(`${dora.length} líneas de entrega (DORA), se esperaban 2: ${dora.join(' | ')}`);
    if (info.stats !== 3) throw new Error(`${info.stats} cifras de ritmo, se esperaban 3`);
    if (!info.rows) throw new Error('la demo tiene PRs abiertos y no salen en la lista');
    const forks = await page.$$eval('#hl-forks a.hl-row[href^="https://"][rel~="noopener"]', (as) => as.map((a) => a.textContent));
    if (forks.length !== 2) throw new Error(`${forks.length} forks activos en el panel, la demo tiene 2: ${forks.join(' | ')}`);
    if (/undefined|NaN|health\./.test(info.text)) throw new Error('texto sin resolver en el panel: ' + info.text.slice(0, 120));
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    await page.click('#hl-clash-go');
    await page.waitForFunction(() => document.querySelector('#hl-clash-out')?.textContent.trim() && !document.querySelector('#hl-clash-go').disabled, null, { timeout: 8000 });
    const clash = await page.evaluate(() => document.querySelector('#hl-clash-out').textContent);
    if (/undefined|NaN|health\./.test(clash)) throw new Error('texto sin resolver en los choques: ' + clash.slice(0, 120));
    const cmp = await page.evaluate(async () => {
      const a = document.querySelector('#cmp-a');
      const b = document.querySelector('#cmp-b');
      document.querySelector('#cmp-go').click();
      await new Promise((r) => setTimeout(r, 1500));
      return { opts: a.options.length, same: a.value === b.value, text: document.querySelector('#cmp-out').textContent, rows: document.querySelectorAll('#cmp-out .hl-row').length };
    });
    if (cmp.opts < 2 || cmp.same) throw new Error(`comparar ramas: ${cmp.opts} opciones, mismas ramas elegidas: ${cmp.same}`);
    if (cmp.rows < 4) throw new Error(`comparar ramas: ${cmp.rows} filas de resultado, se esperaban al menos 4: ${cmp.text.slice(0, 120)}`);
    if (/undefined|NaN|cmp\./.test(cmp.text)) throw new Error('texto sin resolver al comparar ramas: ' + cmp.text.slice(0, 120));
    await page.evaluate(async () => {
      document.querySelector('#cmp-a').value = 'main';
      document.querySelector('#cmp-b').value = 'develop';
      document.querySelector('#cmp-go').click();
      await new Promise((r) => setTimeout(r, 800));
    });
    const marked = await page.evaluate(() => ({
      a: document.querySelectorAll('#graph .node.cmp-a').length,
      b: document.querySelectorAll('#graph .node.cmp-b').length,
      base: document.querySelectorAll('#graph .node.cmp-base').length,
      dim: document.querySelectorAll('#graph .node.pfx').length,
    }));
    if (marked.a + marked.b < 1 || marked.base !== 1 || marked.dim < 1) throw new Error('comparar ramas: el grafo no marca los tramos ni el punto de separación: ' + JSON.stringify(marked));
    await page.evaluate(() => [...document.querySelectorAll('#cmp-out .hl-row')].find((b) => b.textContent.includes(document.documentElement.lang === 'es' ? 'Quitar el resaltado' : 'Clear the highlight'))?.click());
    const left = await page.evaluate(() => document.querySelectorAll('#graph .node.cmp-a, #graph .node.cmp-b, #graph .node.cmp-base').length);
    if (left) throw new Error(`comparar ramas: «Quitar el resaltado» deja ${left} commits marcados`);
    const md = await page.evaluate(() => document.querySelector('#digest-md')?.textContent || '');
    if (!/^# /.test(md) || !/## .*\(\d+\)/.test(md)) throw new Error('resumen de la semana sin formato Markdown: ' + md.slice(0, 120));
    if (/undefined|NaN|digest\./.test(md)) throw new Error('texto sin resolver en el resumen de la semana: ' + md.slice(0, 120));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#digest-save')]);
    if (!/^graphbranch-.*-semana-.*\.md$/.test(dl.suggestedFilename())) throw new Error('nombre del resumen: ' + dl.suggestedFilename());
    const states = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('#hl-prstates .hl-sub')].map((d) => d.querySelector('h4').textContent.trim()),
      inGroups: document.querySelectorAll('#hl-prstates .hl-sub li').length,
      open: document.querySelectorAll('#health .hl-list[data-list="prs"] li').length,
    }));
    if (!states.groups.length || states.inGroups !== states.open || states.groups.some((x) => /undefined|NaN|health\./.test(x))) throw new Error('PRs por estado en la demo: ' + JSON.stringify(states));
    await page.click('#health .hl-list[data-list="prs"] [data-go]');
    await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'vista de texto: árbol con teclado, nombres accesibles y Enter lleva al grafo', async () => {
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: 3000 });
    const info = await page.evaluate(() => {
      const d = document.querySelector('#textview');
      const tree = d.querySelector('[role="tree"]');
      const items = [...d.querySelectorAll('[role="treeitem"]')];
      return {
        tree: !!tree,
        branches: d.querySelectorAll('.tv-branch').length,
        unnamed: items.filter((n) => !n.getAttribute('aria-label')).length,
        focusInTree: tree && tree.contains(document.activeElement),
        text: d.textContent,
        overflow: d.querySelector('.tr-wrap').scrollWidth - d.querySelector('.tr-wrap').clientWidth,
      };
    });
    if (!info.tree || info.branches < 2) throw new Error(`árbol incompleto: ${info.branches} ramas`);
    if (info.unnamed) throw new Error(`${info.unnamed} nodos sin nombre accesible`);
    if (!info.focusInTree) throw new Error('al abrir, el foco no está en el árbol');
    if (/undefined|NaN|textview\./.test(info.text)) throw new Error('texto sin resolver: ' + info.text.slice(0, 120));
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    // la rama por defecto viene abierta: ↓ baja a su primer commit; ← sube a la rama y otra ← la cierra
    await page.keyboard.press('ArrowDown');
    const onCommit = await page.evaluate(() => document.activeElement.classList.contains('tv-commit'));
    if (!onCommit) throw new Error('↓ no baja al primer commit de la rama abierta');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const closed = await page.evaluate(() => document.activeElement.classList.contains('tv-branch') && document.activeElement.getAttribute('aria-expanded'));
    if (closed !== 'false') throw new Error('← no cierra la rama');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'vista de texto: filtra por rama y avisa en la región viva de lo nuevo sin repetir', async () => {
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: 3000 });
    const live = await page.evaluate(() => {
      const l = document.querySelector('#textview-live');
      return { role: l.getAttribute('role'), polite: l.getAttribute('aria-live'), text: l.textContent };
    });
    if (live.role !== 'status' || live.polite !== 'polite') throw new Error('la región viva no es role=status polite');
    if (live.text) throw new Error('al abrir, la región viva ya anuncia algo: ' + live.text);
    // filtro: un nombre que no existe vacía el árbol; el de la primera rama lo deja con esa rama
    const first = await page.evaluate(() => document.querySelector('#textview .tv-branch').dataset.branch);
    await page.fill('#textview-filter', 'zzz-no-existe');
    if (await page.locator('#textview .tv-branch').count()) throw new Error('el filtro no oculta las ramas que no coinciden');
    await page.fill('#textview-filter', first.slice(0, 3).toUpperCase());
    const kept = await page.evaluate(() => [...document.querySelectorAll('#textview .tv-branch')].map((n) => n.dataset.branch));
    if (!kept.includes(first)) throw new Error(`el filtro quitó la rama ${first}: ${kept.join(', ')}`);
    await page.fill('#textview-filter', '');
    // la demo trae commits cada 3 a 7 s: la región viva avisa de los nuevos, una sola vez cada uno
    await page.waitForFunction(() => /^Novedades: \d+ ramas, \d+ commits$/.test(document.querySelector('#textview-live').textContent), null, { timeout: 20000 });
    const said = await page.evaluate(() => document.querySelector('#textview-live').textContent);
    if (/undefined|NaN|textview\./.test(said)) throw new Error('texto sin resolver en la región viva: ' + said);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#textview [role="treeitem"]')].filter((n) => !n.getAttribute('aria-label')).length);
    if (unnamed) throw new Error(`${unnamed} nodos sin nombre accesible tras la actualización en vivo`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'búsqueda de commits: por mensaje y por autor, con teclado, y Enter vuela al commit', async () => {
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    const first = await page.evaluate(() => {
      const d = document.querySelector('#search');
      return {
        focusInput: document.activeElement?.id === 'search-input',
        authors: d.querySelectorAll('#search-author option').length,
        hits: d.querySelectorAll('.sr-hit').length,
        unnamed: [...d.querySelectorAll('.sr-hit')].filter((b) => !b.getAttribute('aria-label')).length,
        status: d.querySelector('#search-status').textContent,
        overflow: d.querySelector('.tr-wrap').scrollWidth - d.querySelector('.tr-wrap').clientWidth,
      };
    });
    if (!first.focusInput) throw new Error('al abrir, el foco no está en el campo');
    if (first.authors < 2 || !first.hits) throw new Error(`sin autores o sin resultados: ${first.authors} autores, ${first.hits} commits`);
    if (first.unnamed) throw new Error(`${first.unnamed} resultados sin nombre accesible`);
    if (/undefined|NaN|search\./.test(first.status)) throw new Error('texto sin resolver: ' + first.status);
    if (first.overflow > 1) throw new Error(`el panel se desborda ${first.overflow}px`);
    await page.fill('#search-input', 'zzzz-no-existe');
    const none = await page.evaluate(() => ({ hits: document.querySelectorAll('#search .sr-hit').length, status: document.querySelector('#search-status').textContent }));
    if (none.hits || !none.status) throw new Error('sin coincidencias debería decirlo y no listar nada');
    await page.fill('#search-input', '');
    const author = await page.evaluate(() => document.querySelectorAll('#search-author option')[1].value);
    await page.selectOption('#search-author', author);
    const byAuthor = await page.evaluate((a) => ({ hits: document.querySelectorAll('#search .sr-hit').length, text: document.querySelector('#search-list').textContent, a }), author);
    if (!byAuthor.hits || byAuthor.hits >= first.hits) throw new Error(`el filtro por autor no acota: ${byAuthor.hits} de ${first.hits}`);
    await page.focus('#search-input');
    await page.keyboard.press('ArrowDown');
    const onHit = await page.evaluate(() => document.activeElement.classList.contains('sr-hit'));
    if (!onHit) throw new Error('↓ no baja al primer resultado');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'filtro por autor: el grafo y el árbol de texto muestran solo sus ramas, lo dice y se quita', async () => {
    await page.click('#view-2d');
    const count = () => page.evaluate(() => document.querySelectorAll('#graph svg .head').length);
    const all = await count();
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    const options = await page.evaluate(() => [...document.querySelectorAll('#graph-author option')].map((o) => o.value));
    // el autor que deja menos ramas a la vista (tiene que dejar alguna menos que todas)
    let best = null;
    for (const who of options.filter(Boolean)) {
      await page.selectOption('#graph-author', who);
      await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length < n, all, { timeout: 1500 }).catch(() => {}); // las ramas salen con su transición
      const n = await count();
      if (n < all && (!best || n < best.n)) best = { who, n };
    }
    if (!best) throw new Error(`ningún autor acota el grafo (${all} ramas, ${options.length - 1} autores)`);
    await page.selectOption('#graph-author', best.who);
    const on = await page.evaluate(() => ({
      status: document.querySelector('#graph-author-status').textContent,
      mark: document.querySelector('#search-btn').classList.contains('filtered'),
      named: !!document.querySelector('label[for="graph-author"]')?.textContent.trim(),
    }));
    if (!on.status || /undefined|NaN|search\./.test(on.status) || !on.mark || !on.named) throw new Error('sin aviso del filtro por autor: ' + JSON.stringify(on));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: 3000 });
    const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('graphbranch:author:')).length);
    if (!saved) throw new Error('el filtro por autor no se guardó por repo');
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: 3000 });
    const tree = await page.evaluate(() => document.querySelectorAll('#textview-body [role="treeitem"][data-branch], #textview-body > [role="tree"] > [role="treeitem"]').length);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: 3000 });
    if (!tree) throw new Error('el árbol de texto quedó vacío con el filtro por autor');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    await page.selectOption('#graph-author', '');
    const off = await page.evaluate(() => ({ mark: document.querySelector('#search-btn').classList.contains('filtered'), status: document.querySelector('#graph-author-status').textContent }));
    await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length === n, all, { timeout: 3000 }).catch(() => {});
    if (off.mark || off.status || (await count()) !== all) throw new Error('quitar el filtro no deja el grafo como estaba');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'filtro por ruta: atenúa los commits que no la tocaron, lo dice y se quita', async () => {
    await page.click('#view-2d');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una ruta');
    await page.fill('#search-path', word);
    await page.press('#search-path', 'Enter');
    await page.waitForSelector('#search-path-clear:not([hidden])', { timeout: 3000 });
    const on = await page.evaluate(() => ({
      dim: document.querySelectorAll('#graph svg .node.pfx').length,
      all: document.querySelectorAll('#graph svg .node').length,
      status: document.querySelector('#search-path-status').textContent,
      mark: document.querySelector('#search-btn').classList.contains('filtered'),
    }));
    if (!on.dim || on.dim >= on.all) throw new Error(`el filtro no acota: ${on.dim} atenuados de ${on.all}`);
    if (!on.status || /undefined|NaN|search\./.test(on.status) || !on.mark) throw new Error('sin aviso del filtro: ' + on.status);
    await page.click('#search-path-clear');
    const off = await page.evaluate(() => ({ dim: document.querySelectorAll('#graph svg .node.pfx').length, mark: document.querySelector('#search-btn').classList.contains('filtered') }));
    if (off.dim || off.mark) throw new Error('quitar el filtro no deja el grafo como estaba');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'filtro por ruta: el grafo 3D también recibe la ruta y la suelta al quitarla', async () => {
    await page.click('#view-2d');
    const has = await page.evaluate(() => !!window.GB?.Graph3D);
    if (!has) return; // sin WebGL no hay grafo 3D que atenuar
    await page.evaluate(() => {
      const G3 = window.GB.Graph3D.prototype;
      window.__g3path = [];
      const orig = G3.setPathFilter;
      if (typeof orig !== 'function') return;
      G3.setPathFilter = function (shas) {
        window.__g3path.push(shas ? shas.size : null);
        return orig.call(this, shas);
      };
    });
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    await page.fill('#search-path', word);
    await page.press('#search-path', 'Enter');
    await page.waitForSelector('#search-path-clear:not([hidden])', { timeout: 3000 });
    await page.click('#search-path-clear');
    const calls = await page.evaluate(() => window.__g3path);
    if (calls.length !== 2 || !(calls[0] > 0) || calls[1] !== null) throw new Error('el grafo 3D no recibió el filtro por ruta: ' + JSON.stringify(calls));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: 3000 });
  });

  await step(page, 'cambios de un commit: desde su ficha, con teclado se pasa al anterior y se vuelve, y Esc cierra', async () => {
    await page.keyboard.press('Escape'); // ninguna ficha abierta de antes
    await page.click('#view-2d');
    const heads = await page.$$('#graph svg .head[role=button]');
    await heads[heads.length > 3 ? 3 : 0].focus();
    await page.keyboard.press('Enter');
    const btn = await page.waitForSelector('#graph .tip .tip-diff', { timeout: 5000 });
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#diff-panel:not([hidden]) .df-file', { timeout: 5000 });
    const read = () =>
      page.evaluate(() => {
        const p = document.querySelector('#diff-panel');
        return {
          focus: document.activeElement?.id,
          msg: p.querySelector('.df-msg').textContent,
          sum: p.querySelector('.df-sum').textContent,
          files: p.querySelectorAll('.df-jump').length,
          lines: p.querySelectorAll('.df-code .dl-add, .df-code .dl-del').length,
          loading: p.classList.contains('loading'),
          feed: getComputedStyle(document.querySelector('.feed-panel')).display,
          sel: document.querySelectorAll('#graph .node.sel').length,
          unnamed: [...p.querySelectorAll('button')].filter((b) => !b.getAttribute('aria-label') && !b.textContent.trim()).length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    const first = await read();
    if (first.focus !== 'diff-title') throw new Error(`al abrir, el foco quedó en ${first.focus}`);
    if (!first.files || !first.lines) throw new Error(`sin archivos o sin líneas: ${first.files} archivos, ${first.lines} líneas`);
    if (/undefined|NaN|diff\./.test(first.sum)) throw new Error('texto sin resolver: ' + first.sum);
    if (first.feed !== 'none') throw new Error('el panel de actividad sigue a la vista junto a los cambios');
    if (first.sel !== 1) throw new Error(`el grafo marca ${first.sel} commits como el que se ve`);
    if (first.unnamed) throw new Error(`${first.unnamed} botones sin nombre`);
    if (first.overflow > 0) throw new Error(`la página se desborda ${first.overflow}px`);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((m) => document.querySelector('#diff-panel .df-msg').textContent !== m && !document.querySelector('#diff-panel').classList.contains('loading'), first.msg, { timeout: 5000 });
    const older = await read();
    if (!older.files) throw new Error('el commit anterior llegó sin archivos');
    // el anterior ya está guardado: volver es inmediato, sin esperar a la red
    await page.keyboard.press('k');
    const back = await read();
    if (back.msg !== first.msg) throw new Error(`K no volvió al commit de donde se vino: ${back.msg}`);
    if (back.loading) throw new Error('volver a un commit ya visto no debería esperar');
    // con el botón «anterior» hasta el primer commit cargado: al deshabilitarse, el foco no sale del panel
    await page.focus('#diff-panel .df-older');
    for (let i = 0; i < 40 && !(await page.$eval('#diff-panel .df-older', (b) => b.disabled)); i++) {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#diff-panel').classList.contains('loading'), null, { timeout: 5000 });
    }
    const end = await page.evaluate(() => ({ disabled: document.querySelector('#diff-panel .df-older').disabled, inPanel: !!document.activeElement?.closest('#diff-panel') }));
    if (!end.disabled) throw new Error('el botón «anterior» nunca llegó al primer commit cargado');
    if (!end.inPanel) throw new Error('al llegar al primer commit, el foco salió del panel');
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({
      hidden: document.querySelector('#diff-panel').hidden,
      feed: getComputedStyle(document.querySelector('.feed-panel')).display,
      inGraph: !!document.activeElement?.closest('#graph'),
      sel: document.querySelectorAll('#graph .node.sel').length,
    }));
    if (!closed.hidden || closed.feed === 'none') throw new Error('Esc no cerró el panel ni devolvió el de actividad');
    if (!closed.inGraph) throw new Error('al cerrar, el foco no volvió al grafo');
    if (closed.sel) throw new Error('al cerrar, el grafo sigue marcando el commit');
  });

  await step(page, 'cambia a árabe en vivo (derecha a izquierda)', async () => {
    await page.selectOption('#lang-select', 'ar');
    await page.waitForFunction(() => document.documentElement.dir === 'rtl', null, { timeout: 5000 });
    await loaded(page);
    await page.selectOption('#lang-select', 'es');
    await page.waitForFunction(() => document.documentElement.dir !== 'rtl', null, { timeout: 5000 });
    await loaded(page);
  });

  await step(
    page,
    'cambiar a un repo que no existe no deja datos de la demo',
    async () => {
      await page.unroute('https://api.github.com/**');
      await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, json: { message: 'Not Found' } }));
      await page.fill('#repo-input', 'nadie/no-existe');
      await page.press('#repo-input', 'Enter');
      await page.waitForSelector('#overlay:not([hidden])', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'error', null, { timeout: 10000 });
      const stats = await page.$$eval('.stat-value', (els) => els.map((e) => e.textContent.trim()));
      if (stats.slice(0, 3).some((v) => v !== '–')) throw new Error(`quedan cifras del repo anterior: ${stats.join(', ')}`);
      // sin datos propios, el Replay no tiene nada que reproducir (antes reproducía la demo)
      await page.click('#replay-btn');
      await page.waitForTimeout(500);
      if (await page.locator('#replay').isVisible()) throw new Error('el Replay reproduce el repo anterior');
    },
    { allow: /status of 404/ },
  );

  await page.context().close();
}

/** Espera a que terminen las transiciones y animaciones finitas de la página (no un tiempo fijo: con el
    equipo cargado 500 ms no alcanzan para las de 0,6 s). */
const transitionsDone = (page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // deja arrancar las transiciones
    const fin = () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState === 'running');
    for (let i = 0, a = fin(); a.length && i < 20; i++, a = fin()) await Promise.all(a.map((x) => x.finished.catch(() => {})));
  });

/** Textos visibles con poco contraste contra su fondo efectivo: 4,5:1, o 3:1 si es grande (los grafos y
    lo escondido quedan fuera: sus colores son los de cada rama, sobre un lienzo). */
const lowContrast = (page) =>
  page.evaluate(() => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null; // degradados o imágenes: no se puede calcular
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a >= 1) break;
        }
      }
      return layers.reverse().reduce((bg, c) => over(c, bg), { r: 255, g: 255, b: 255, a: 1 });
    };
    const out = [];
    const seen = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const el = walk.currentNode.parentElement;
      if (!el || seen.has(el) || !walk.currentNode.textContent.trim()) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (el.closest('[hidden], .sr-only, [aria-hidden=true], #graph3d, #graph')) continue;
      const fg = parse(cs.color);
      const bg = backdrop(el);
      if (!fg || !bg) continue;
      const [hi, lo] = [lum(over(fg, bg)), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66);
      if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)}:1 «${walk.currentNode.textContent.trim().slice(0, 24)}» (${el.className || el.tagName.toLowerCase()})`);
    }
    return out;
  });

/* ---------- varios repos a la vez ---------- */

/**
 * GitHub simulado para la web: los repos que se le pidan, cada uno con su rama main, sin token
 * (modo lista). `push` suma un commit a una rama, como si alguien lo subiera ahora.
 */
function fakeGitHub() {
  const repos = new Map();
  const orgs = new Set(); // los dueños que son organizaciones (los demás, usuarios)
  const calls = [];
  let n = 0;
  const sha = (s) => createHash('sha1').update(s).digest('hex');
  const commit = (r, branch, message) => {
    const parent = r.branches.get(branch) || null;
    const id = sha(`${r.full}:${++n}`);
    const date = new Date(Date.now() - (parent ? 0 : 3600e3) + n).toISOString();
    r.commits.set(id, {
      sha: id,
      parents: parent ? [{ sha: parent }] : [],
      commit: { message, author: { name: 'Ana', date }, committer: { date } },
      html_url: `https://github.com/${r.full}/commit/${id}`,
      author: null,
    });
    r.branches.set(branch, id);
    r.pushed = n;
  };
  /** Un repo; `more` puede marcarlo como fork o archivado (para la lista de su organización). */
  const repo = (full, more = {}) => {
    if (!repos.has(full)) {
      const r = { full, branches: new Map(), commits: new Map(), ...more };
      for (let i = 0; i < 4; i++) commit(r, 'main', `inicio ${i} de ${full}`);
      repos.set(full, r);
    }
    return repos.get(full);
  };
  /** /orgs/{org}/repos y /users/{u}/repos: sus repos, el de push más reciente primero. */
  const listed = (owner) =>
    [...repos.values()]
      .filter((r) => r.full.split('/')[0] === owner)
      .sort((a, b) => b.pushed - a.pushed)
      .map((r) => ({ name: r.full.split('/')[1], owner: { login: owner }, fork: !!r.fork, archived: !!r.archived, private: false, pushed_at: new Date(Date.now() - 1e6 + r.pushed).toISOString() }));
  const orgEvents = []; // /orgs/acme/events: el más reciente primero
  const route = (path, q) => {
    const own = path.match(/^\/(orgs|users)\/([^/]+)\/repos$/);
    if (own) {
      const [, kind, who] = own;
      const found = kind === 'orgs' ? orgs.has(who) : !orgs.has(who) && listed(who).length > 0;
      return found ? { body: listed(who) } : { status: 404, body: { message: 'Not Found' } };
    }
    if (path === '/orgs/acme/events') return { body: orgEvents };
    const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if (!m || !repos.has(m[1])) return { status: 404, body: { message: 'Not Found' } };
    const r = repos.get(m[1]);
    const [owner, name] = m[1].split('/');
    const rest = m[2] || '';
    if (!rest) return { body: { name, owner: { login: owner }, default_branch: 'main', html_url: `https://github.com/${m[1]}`, private: false, description: '' } };
    if (rest === '/branches') return { body: [...r.branches].map(([b, s]) => ({ name: b, commit: { sha: s }, protected: false })) };
    if (rest === '/events' || rest === '/pulls' || rest === '/tags' || rest === '/deployments' || rest === '/forks' || rest === '/activity') return { body: [] }; // /activity: solo con token
    if (rest === '/commits') {
      let s = r.branches.get(q.get('sha')) || q.get('sha');
      const out = [];
      while (s && r.commits.has(s) && out.length < Number(q.get('per_page') || 30)) {
        out.push(r.commits.get(s));
        s = r.commits.get(s).parents[0]?.sha;
      }
      return out.length ? { body: out } : { status: 404, body: { message: 'No commit found' } };
    }
    if (/^\/commits\/[^/]+\/check-runs$/.test(rest)) return { body: { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] } };
    return { status: 404, body: { message: 'Not Found' } };
  };
  return {
    calls,
    repo,
    org: (name) => orgs.add(name),
    orgEvent: (ev) => orgEvents.unshift({ id: String(orgEvents.length + 1), actor: { login: 'ana' }, created_at: new Date().toISOString(), payload: {}, ...ev }),
    push: (full, branch, message) => commit(repo(full), branch, message),
    handle: (r) => {
      const u = new URL(r.request().url());
      calls.push(u.pathname);
      const { status = 200, body } = route(u.pathname, u.searchParams);
      return r.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'ETag, Link, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Resource',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4900',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          'x-ratelimit-resource': 'core',
        },
        body: JSON.stringify(body),
      });
    },
  };
}

/** Con la API simulada no hace falta esperar el minuto entre ciclos de un repo sin token. */
const quickCycles = () => {
  const hook = () => {
    const P = window.GB?.GitHubSource?.prototype;
    if (!P) return setTimeout(hook, 5);
    const next = P.nextDelay;
    P.nextDelay = function (...args) {
      return Math.min(1200, next.apply(this, args));
    };
  };
  hook();
};

/** Las pestañas: nombre, si es la que está a la vista, su estado y sus novedades sin ver. */
const repoTabs = (page) =>
  page.$$eval('#repo-tabs .rt', (els) =>
    els.map((e) => ({
      name: e.querySelector('.rt-name').textContent,
      on: e.querySelector('.rt-main').getAttribute('aria-current') === 'true',
      state: e.dataset.state,
      unread: e.querySelector('.rt-n').textContent,
    })),
  );

console.log('Varios repos a la vez');
{
  const gh = fakeGitHub();
  for (const r of ['o/a', 'o/b', 'o/c']) gh.repo(r);
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  await page.addInitScript(quickCycles);
  const shown = () => page.textContent('#repo-link');

  await step(page, 'sigue los repos de la URL, cada uno en su pestaña', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/a&repo=o/b`);
    await loaded(page);
    await page.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt')].filter((t) => t.dataset.state === 'live').length === 2, null, { timeout: 15000 });
    const tabs = await repoTabs(page);
    const names = tabs.map((t) => `${t.name}${t.on ? '*' : ''}`).join(' ');
    if (names !== 'o/a* o/b') throw new Error(`pestañas: ${names}`);
    if ((await shown()) !== 'o/a') throw new Error(`el grafo muestra ${await shown()}`);
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["o/a","o/b"]') throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'CI en el grafo: la rama por defecto lleva la marca de sus checks', async () => {
    const mark = await page.waitForSelector('.h-ci.ci-success, .h3-ci.ci-success', { timeout: 10000 });
    const title = await mark.getAttribute('title');
    if (!title && !(await mark.$('title'))) throw new Error('la marca de CI no dice qué significa');
  });

  await step(page, 'lo nuevo del repo que no se ve llega con su nombre y a su pestaña', async () => {
    gh.push('o/b', 'main', 'arreglo que llega por detrás');
    const toast = await page.waitForSelector('#toasts .toast .toast-repo', { timeout: 15000 });
    const from = await toast.textContent();
    await page.waitForFunction(() => document.querySelector('#repo-tabs .rt:nth-child(2) .rt-n')?.textContent === '1', null, { timeout: 5000 });
    const label = await page.textContent('#feed .act-repo');
    if (from !== 'o/b') throw new Error(`el aviso dice ${from}`);
    if (label !== 'o/b') throw new Error(`el panel dice ${label}`);
    if ((await shown()) !== 'o/a') throw new Error('el grafo cambió de repo solo');
  });

  await step(page, 'las pestañas y el repo de cada aviso se leen (contraste, tema claro y oscuro)', async () => {
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await transitionsDone(page); // los colores cambian con transición: se mide cuando terminan
      const bad = await lowContrast(page);
      if (bad.length) throw new Error(`${colorScheme}: ${bad.length} textos con poco contraste, como ${bad.slice(0, 3).join(', ')}`);
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step(page, 'cambiar de pestaña muestra el otro repo sin volver a cargarlo', async () => {
    const loads = () => gh.calls.filter((c) => c === '/repos/o/b').length;
    const before = loads();
    await page.click('#repo-tabs .rt:nth-child(2) .rt-main');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: 5000 });
    await loaded(page);
    const tabs = await repoTabs(page);
    const commits = await page.textContent('#st-commits');
    const url = await page.evaluate(() => new URL(location.href).searchParams.getAll('repo').join(' '));
    if (!tabs[1].on || tabs[1].unread) throw new Error(`la pestaña de o/b: ${JSON.stringify(tabs[1])}`);
    if (commits !== '5') throw new Error(`el resumen dice ${commits} commits (o/b tiene 5)`);
    if (loads() !== before) throw new Error('volvió a pedir el repo a GitHub');
    if (url !== 'o/b o/a') throw new Error(`la URL lleva ${url}`);
  });

  await step(page, 'clic en una actividad de otro repo lleva a su pestaña', async () => {
    gh.push('o/a', 'main', 'cambio en a');
    const item = page.locator('#feed .act', { has: page.locator('.act-repo', { hasText: 'o/a' }) }).first();
    await item.waitFor({ timeout: 15000 });
    await item.locator('.act-main').click();
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: 5000 });
  });

  await step(page, 'Conectar un repo que ya se sigue no lo repite', async () => {
    await page.fill('#repo-input', 'https://github.com/o/b');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: 5000 });
    const n = (await repoTabs(page)).length;
    if (n !== 2) throw new Error(`hay ${n} pestañas`);
  });

  await step(page, 'cerrar la pestaña deja de seguir el repo', async () => {
    await page.focus('#repo-tabs .rt:nth-child(1) .rt-close'); // o/a, con el teclado
    await page.keyboard.press('Enter');
    await page.waitForSelector('#repo-tabs', { state: 'hidden', timeout: 5000 });
    // sin pestañas a la vista, el foco pasa al campo del repositorio en vez de perderse
    const focused = await page.evaluate(() => document.activeElement?.id);
    if (focused !== 'repo-input') throw new Error(`el foco quedó en ${focused || 'el documento'}`);
    const before = gh.calls.filter((c) => c.startsWith('/repos/o/a')).length;
    await page.waitForTimeout(3000); // un par de ciclos
    const after = gh.calls.filter((c) => c.startsWith('/repos/o/a')).length;
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    const feed = await page.textContent('#feed');
    if ((await shown()) !== 'o/b') throw new Error(`quedó a la vista ${await shown()}`);
    if (saved !== '["o/b"]') throw new Error(`se guardó ${saved}`);
    if (after !== before) throw new Error(`siguió consultando o/a (${after - before} consultas)`);
    if (feed.includes('cambio en a')) throw new Error('el panel conserva la actividad de o/a');
    if (await page.locator('#feed .act-repo').count()) throw new Error('con un solo repo, el panel sigue diciendo de cuál es cada cosa');
  });

  await step(page, 'al volver a abrir la página sigue los mismos repos', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    if ((await shown()) !== 'o/b') throw new Error(`abrió ${await shown()}`);
    if (await page.locator('#repo-tabs').isVisible()) throw new Error('con un solo repo se ven las pestañas');
  });

  await step(page, 'la demo se mira sin dejar de seguir los repos', async () => {
    await page.click('#demo-btn');
    await page.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'live' && document.querySelector('#repo-link')?.textContent === 'acme/orbita', null, { timeout: 15000 });
    const names = (await repoTabs(page)).map((t) => t.name).join(' ');
    await page.click('#repo-tabs .rt:nth-child(1) .rt-main'); // o/b: la demo se cierra
    await page.waitForSelector('#repo-tabs', { state: 'hidden', timeout: 5000 });
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (names !== 'o/b acme/orbita') throw new Error(`pestañas con la demo: ${names}`);
    if (saved !== '["o/b"]') throw new Error(`se guardó ${saved}`);
  });
  await page.context().close();

  /* aprender git: la terminal de práctica escribe en el grafo, sin red y sin interpretar HTML */
  const lab = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(lab, 'la práctica de git responde a los comandos en el grafo', async () => {
    await lab.goto(`${base}/index.html?lang=es`);
    await loaded(lab);
    await lab.click('#view-2d');
    await lab.click('#practice-btn');
    await lab.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'practice/git' && !document.querySelector('#practice').hidden, null, { timeout: 15000 });
    await lab.waitForSelector('#graph svg .node', { timeout: 10000 });
    if ((await lab.evaluate(() => document.activeElement?.className)) !== 'pr-input') throw new Error('el foco no quedó en la línea de comandos');
    const nodes = () => lab.locator('#graph svg .node').count();
    const before = await nodes();
    for (const c of ['checkout -b feature', 'commit -m uno', 'git commit -m "dos <img src=x onerror=alert(1)>"', 'push origin main']) {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    }
    await lab.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length >= n, before + 2, { timeout: 10000 });
    const log = await lab.textContent('.pr-log');
    if (!log.includes('<img src=x onerror=alert(1)>')) throw new Error('el mensaje no se ve tal cual');
    if (await lab.locator('.pr-log img').count()) throw new Error('la terminal interpretó HTML');
    if (!/is not a git command/.test(log)) throw new Error('un comando que no existe no dio error');
    if ((await lab.textContent('.pr-status')).trim() === '') throw new Error('el primer ejercicio no se dio por resuelto');
    await lab.selectOption('.pr-ex', '3');
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('reset'), null, { timeout: 5000 });
  });
  await step(lab, 'un ejercicio propio se crea, se comparte por URL y la URL lo abre y se resuelve', async () => {
    await lab.click('.pr-make summary');
    await lab.fill('.pr-m-title', 'Fusiona <b>ya</b>');
    await lab.fill('.pr-m-goal', 'Trae feature a main.');
    await lab.fill('.pr-m-setup', 'checkout -b feature\ncommit -m uno\ncheckout main\ncommit -m dos');
    await lab.fill('.pr-m-checks', 'alert(1)');
    await lab.click('.pr-m-go');
    if (!(await lab.textContent('.pr-m-err')).includes('alert(1)')) throw new Error('una condición inventada no dio error');
    await lab.fill('.pr-m-checks', 'merge-commit:main\nmerged:feature>main');
    await lab.click('.pr-m-go');
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent === 'Trae feature a main.', null, { timeout: 5000 });
    if (await lab.locator('.pr-ex b').count()) throw new Error('el título se interpretó como HTML');
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio propio parte resuelto');
    await lab.click('.pr-share');
    const url = await lab.inputValue('.pr-link');
    if (!/[?&]practice=[\w-]+$/.test(url)) throw new Error(`enlace raro: ${url}`);
    if (!new URL(lab.url()).searchParams.get('practice')) throw new Error('la URL de la barra no lleva el ejercicio');
    await lab.goto(url.replace(/^https?:\/\/[^/]+/, base) + '&lang=es');
    await lab.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'practice/git' && document.querySelector('.pr-goal')?.textContent === 'Trae feature a main.', null, { timeout: 15000 });
    await lab.fill('.pr-input', 'merge feature');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: 5000 });
    // una URL con basura no rompe nada: abre la demo
    await lab.goto(`${base}/index.html?lang=es&practice=%3Cscript%3E`);
    await loaded(lab);
    if (await lab.isVisible('#practice')) throw new Error('un código inválido abrió la práctica');
  });
  await step(lab, 'un ejercicio propio con pistas: el botón las muestra una a una y la condición de mensaje lo resuelve', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=1`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: 15000 });
    if (await lab.isVisible('.pr-hint')) throw new Error('un ejercicio de la lista muestra el botón de pista');
    await lab.click('.pr-make summary');
    await lab.fill('.pr-m-title', 'Con pistas');
    await lab.fill('.pr-m-goal', 'Haz un commit en feature.');
    await lab.fill('.pr-m-setup', 'checkout -b feature');
    await lab.fill('.pr-m-hints', 'Primera <b>pista</b>\nSegunda pista');
    await lab.fill('.pr-m-checks', 'tip:feature~listo');
    await lab.click('.pr-m-go');
    await lab.waitForSelector('.pr-hint:not([hidden])', { timeout: 5000 });
    if (await lab.isVisible('.pr-hint-text')) throw new Error('las pistas salen sin pedirlas');
    await lab.click('.pr-hint');
    let hints = await lab.textContent('.pr-hint-text');
    if (!hints.includes('Pista 1 de 2') || hints.includes('Segunda')) throw new Error(`primera pista: ${hints}`);
    if (await lab.locator('.pr-hint-text b').count()) throw new Error('la pista se interpretó como HTML');
    await lab.click('.pr-hint');
    hints = await lab.textContent('.pr-hint-text');
    if (!hints.includes('Segunda pista')) throw new Error(`segunda pista: ${hints}`);
    if (!(await lab.isDisabled('.pr-hint'))) throw new Error('el botón sigue activo sin más pistas');
    await lab.fill('.pr-input', 'commit -m "casi"');
    await lab.press('.pr-input', 'Enter');
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('se resolvió con otro mensaje');
    await lab.fill('.pr-input', 'commit -m "Todo LISTO"');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: 5000 });
  });
  await lab.context().close();

  const full = await openPage({ viewport: { width: 1280, height: 800 } });
  await full.unroute('https://api.github.com/**');
  await full.route('https://api.github.com/**', gh.handle);
  await step(full, 'ensayar un comando: la copia del repo real cambia sin tocar al original ni gastar cuota', async () => {
    await full.goto(`${base}/index.html?lang=es&repo=o/b`);
    await full.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'live' && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: 15000 });
    await full.waitForSelector('#rehearse-btn:not([hidden])', { timeout: 5000 });
    await full.click('#view-2d');
    await full.waitForSelector('#graph svg .node', { timeout: 10000 });
    const real = await full.locator('#graph svg .node').count();
    let calls = 0;
    const count = (req) => req.url().startsWith('https://api.github.com/') && calls++;
    full.on('request', count);
    await full.click('#rehearse-btn');
    await full.waitForFunction(() => !document.querySelector('#practice').hidden && document.querySelector('.pr-goal')?.textContent.includes('o/b'), null, { timeout: 10000 });
    await full.waitForSelector('#graph svg .node', { timeout: 10000 });
    await full.fill('.pr-input', 'commit -m "ensayo <b>x</b>"');
    await full.press('.pr-input', 'Enter');
    await full.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length > n, real, { timeout: 10000 });
    if (await full.locator('.pr-log b').count()) throw new Error('la terminal interpretó HTML');
    if (await full.locator('.pr-make').isVisible()) throw new Error('el ensayo ofrece crear ejercicios');
    await full.click('#repo-tabs .rt:nth-child(1) .rt-main'); // vuelve al repo real: el ensayo se cierra
    await full.waitForFunction(() => document.querySelector('#practice').hidden && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: 5000 });
    full.off('request', count);
    await full.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length === n, real, { timeout: 5000 }).catch(() => {
      throw new Error('el repo real cambió con el ensayo');
    });
    if (calls) throw new Error(`el ensayo hizo ${calls} consultas a la API`);
  });
  await step(
    full,
    'se siguen hasta 10 repos a la vez',
    async () => {
      const ten = Array.from({ length: 10 }, (_, i) => `repo=o/r${i}`).join('&'); // no existen: dan 404, da igual
      await full.goto(`${base}/index.html?lang=es&${ten}`);
      await full.waitForSelector('#repo-tabs:not([hidden])', { timeout: 10000 });
      await full.fill('#repo-input', 'o/a');
      await full.press('#repo-input', 'Enter');
      const why = await full.$eval('#repo-input', (i) => i.validationMessage);
      const n = await full.locator('#repo-tabs .rt').count();
      if (n !== 10) throw new Error(`hay ${n} pestañas`);
      if (!why) throw new Error('no dice por qué no se suma el repo 11');
      // un enlace a otro repo, con los 10 ya seguidos: entra el del enlace y sale el último guardado
      await full.goto(`${base}/index.html?lang=es&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: 10000 });
      const names = await full.locator('#repo-tabs .rt-name').allTextContents();
      if (names.length !== 10 || names.at(-1) !== 'o/a' || names.includes('o/r9')) throw new Error(`pestañas tras el enlace: ${names.join(' ')}`);
    },
    { allow: /status of 404/ },
  );
  await full.context().close();

  const phonePage = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phonePage.unroute('https://api.github.com/**');
  await phonePage.route('https://api.github.com/**', gh.handle);
  await step(phonePage, 'en el celular, tres pestañas no desbordan la página', async () => {
    await phonePage.goto(`${base}/index.html?lang=de&repo=o/a&repo=o/b&repo=o/c`);
    await loaded(phonePage);
    await phonePage.waitForSelector('#repo-tabs:not([hidden])', { timeout: 5000 });
    const over = await noOverflow(phonePage);
    if (over > 1) throw new Error(`la página es ${over}px más ancha que la pantalla`);
  });
  await phonePage.context().close();
}

console.log('Una organización o un usuario entero');
{
  const gh = fakeGitHub();
  gh.org('acme');
  for (const r of ['acme/viejo', 'acme/api', 'acme/web']) gh.repo(r);
  gh.repo('acme/copia', { fork: true });
  gh.repo('acme/museo', { archived: true });
  gh.push('acme/api', 'main', 'lo último de acme'); // el de push más reciente: api, web, viejo
  gh.repo('ana/notas');
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  await page.addInitScript(quickCycles);
  // la renovación de las organizaciones seguidas, que es de 30 minutos, aquí cada 1,5 s
  await page.addInitScript(() => {
    const real = window.setInterval;
    window.setInterval = (fn, ms, ...a) => real(fn, ms === 30 * 60 * 1000 || ms === 5 * 60 * 1000 ? 1500 : ms, ...a);
    const realTimeout = window.setTimeout; // y los eventos de la organización, que empiezan a los 15 s
    window.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms === 15000 ? 500 : ms, ...a);
  });
  const names = async () => (await repoTabs(page)).map((t) => `${t.name}${t.on ? '*' : ''}`).join(' ');

  await step(page, 'org:acme sigue sus repos de push más reciente, sin forks ni archivados, y muestra el último', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.fill('#repo-input', 'org:acme');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 3, null, { timeout: 15000 });
    if ((await names()) !== 'acme/api* acme/web acme/viejo') throw new Error(`pestañas: ${await names()}`);
    const toast = await page.waitForSelector('#toasts .toast:has-text("Ahora sigues los repositorios más activos de acme")', { timeout: 5000 });
    const detail = await toast.$eval('.toast-detail', (d) => d.textContent);
    if (detail !== 'api, web, viejo') throw new Error(`el aviso dice ${detail}`);
    const lists = gh.calls.filter((c) => /^\/(orgs|users)\/[^/]+\/repos$/.test(c));
    if (!lists.length || lists.some((c) => c !== '/orgs/acme/repos')) throw new Error(`consultas de la lista: ${lists.join(', ')}`); // las renovaciones piden la misma, una por organización
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["acme/api","acme/web","acme/viejo"]') throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'los eventos de la organización llegan al panel, solo los de repos sin pestaña, con una consulta', async () => {
    gh.orgEvent({ type: 'WatchEvent', repo: { name: 'acme/lejano' } }); // sin pestaña: se muestra
    gh.orgEvent({ type: 'WatchEvent', repo: { name: 'acme/api' } }); // con pestaña: ya lo trae la suya
    await page.waitForFunction(() => [...document.querySelectorAll('#feed .act')].some((a) => a.textContent.includes('acme/lejano')), null, { timeout: 15000 });
    const n = await page.$$eval('#feed .act', (els) => els.filter((a) => a.textContent.includes('acme/lejano')).length);
    if (n !== 1) throw new Error(`el evento sin pestaña salió ${n} veces`);
    const polls = gh.calls.filter((c) => c === '/orgs/acme/events').length;
    if (!polls) throw new Error('nunca se pidieron los eventos de la organización');
  });

  await step(page, 'la organización queda seguida: un repo nuevo suyo se suma solo y uno cerrado no vuelve', async () => {
    const owners = await page.evaluate(() => localStorage.getItem('graphbranch:owners'));
    if (owners !== '{"acme":["api","web","viejo"]}') throw new Error(`se guardó ${owners}`);
    // el usuario cierra uno; otro repo nace en la organización
    await page.locator('.rt', { hasText: 'acme/viejo' }).locator('.rt-close').click();
    gh.repo('acme/nuevo');
    gh.push('acme/nuevo', 'main', 'recién nacido');
    await page.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt-name')].some((n) => n.textContent === 'acme/nuevo'), null, { timeout: 15000 });
    const toast = await page.waitForSelector('#toasts .toast:has-text("acme"):has(.toast-detail:text-is("nuevo"))', { timeout: 5000 });
    if (!toast) throw new Error('sin aviso del repo nuevo');
    await page.waitForTimeout(4000); // dos renovaciones más: el cerrado no regresa
    if ((await names()).includes('acme/viejo')) throw new Error(`volvió el cerrado: ${await names()}`);
  });

  await step(page, 'al cerrar el último repo de la organización deja de seguirse', async () => {
    // con otro repo de por medio: con una sola pestaña la barra se esconde
    await page.fill('#repo-input', 'ana/notas');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 4, null, { timeout: 15000 });
    for (const n of ['acme/api', 'acme/web', 'acme/nuevo']) await page.locator('.rt', { hasText: n }).locator('.rt-close').click();
    const owners = await page.evaluate(() => localStorage.getItem('graphbranch:owners'));
    if (owners !== null) throw new Error(`sigue guardada: ${owners}`);
    await page.fill('#repo-input', 'org:acme');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 5, null, { timeout: 15000 });
  });

  await step(page, 'una organización o un usuario que no existe lo dice en el campo', async () => {
    await page.fill('#repo-input', '@nadie');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-input').validationMessage.includes('nadie'), null, { timeout: 10000 });
    const msg = await page.$eval('#repo-input', (i) => i.validationMessage);
    if (msg !== 'No se encontró en GitHub una organización o un usuario llamado nadie.') throw new Error(`el campo dice ${msg}`);
    if ((await repoTabs(page)).length !== 5) throw new Error('cambiaron las pestañas');
  }, { allow: /404/ });

  await step(page, 'con ?repo=@ana en la URL se siguen los repos de ese usuario', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/index.html?lang=es&repo=@ana`);
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/notas', null, { timeout: 15000 });
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["ana/notas"]') throw new Error(`se guardó ${saved}`);
  }, { allow: /404/ });
  await page.context().close();
}

/* ---------- celular ---------- */

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const langs = allLangs
  ? [...readFileSync(join(root, 'js', 'i18n.js'), 'utf8').matchAll(/\{ code: '([^']+)', name:/g)].map((m) => m[1])
  : ['es', 'de', 'ar'];

/* ---------- GitLab ---------- */

/**
 * gitlab.com simulado para la web: el proyecto g/sub/p (con subgrupo) con main, una rama con dos
 * commits y su MR abierta. Como gitlab.com sin token, el listado de commits responde con el desafío
 * de Cloudflare: la app nunca debe pedirlo. `push` y `merge` cambian el proyecto como si alguien
 * trabajara en él. g/privado es el mismo proyecto, pero privado: sin el token GITLAB_TOKEN responde
 * 404 (como gitlab.com, que no dice que existe) y con otro, 401. `auths` anota el encabezado
 * Authorization de cada consulta.
 */
const GITLAB_TOKEN = 'glpat-smoke0123456789';
function fakeGitLab() {
  const WEB = 'https://gitlab.com/g/sub/p';
  const commits = new Map();
  const branches = new Map();
  const mrs = [];
  const calls = [];
  const auths = [];
  let n = 0;
  const id = () => createHash('sha1').update(`gl:${++n}`).digest('hex');
  const commit = (branch, title, ...extra) => {
    const sha = id();
    const parent = branches.get(branch);
    commits.set(sha, {
      id: sha,
      parent_ids: [parent, ...extra].filter(Boolean),
      title,
      message: title,
      author_name: 'Bea',
      committed_date: new Date(Date.now() - 3600e3 + n * 1000).toISOString(),
      web_url: `${WEB}/-/commit/${sha}`,
    });
    branches.set(branch, sha);
    return sha;
  };
  for (let i = 0; i < 4; i++) commit('main', `inicio ${i}`);
  branches.set('feature/x', branches.get('main'));
  commit('feature/x', 'feat: primera parte');
  commit('feature/x', 'feat: segunda parte');
  const mr = (iid, source, state = 'opened') => ({
    iid,
    title: 'Agrega la función x',
    source_branch: source,
    target_branch: 'main',
    source_project_id: 1,
    target_project_id: 1,
    web_url: `${WEB}/-/merge_requests/${iid}`,
    draft: false,
    state,
    author: { username: 'bea', name: 'Bea', avatar_url: 'https://secure.gravatar.com/avatar/x' },
    created_at: new Date().toISOString(),
    updated_at: new Date(Date.now() + n).toISOString(),
  });
  mrs.push(mr(5, 'feature/x'));
  const reach = (sha) => {
    const out = new Set();
    for (const stack = [sha]; stack.length; ) {
      const s = stack.pop();
      if (!s || out.has(s) || !commits.has(s)) continue;
      out.add(s);
      stack.push(...commits.get(s).parent_ids);
    }
    return out;
  };
  const resolve = (ref) => {
    const m = /^(.+?)(?:~(\d+))?$/.exec(ref);
    let sha = branches.get(m[1]) || m[1];
    for (let i = 0; i < Number(m[2] || 0) && sha; i++) sha = commits.get(sha)?.parent_ids[0];
    return sha && commits.has(sha) ? sha : null;
  };
  const route = (path, q, auth) => {
    if (path === '/api/v4/groups/g/projects') {
      return { body: [
        { path_with_namespace: 'g/sub/p', last_activity_at: new Date().toISOString(), visibility: 'public' },
        { path_with_namespace: 'g/copia', forked_from_project: { id: 9 }, visibility: 'public' },
        { path_with_namespace: 'g/viejo', archived: true, visibility: 'public' },
      ] };
    }
    const m = /^\/api\/v4\/projects\/(g%2Fsub%2Fp|g%2Fprivado)(\/.*)?$/.exec(path);
    if (!m) return { status: 404, body: { message: '404 Project Not Found' } };
    const priv = m[1] === 'g%2Fprivado';
    if (priv && auth !== `Bearer ${GITLAB_TOKEN}`) return auth ? { status: 401, body: { message: '401 Unauthorized' } } : { status: 404, body: { message: '404 Project Not Found' } };
    const rest = m[2] || '';
    if (!rest) {
      const name = priv ? 'g/privado' : 'g/sub/p';
      return { body: { id: priv ? 2 : 1, path_with_namespace: name, default_branch: 'main', web_url: `https://gitlab.com/${name}`, visibility: priv ? 'private' : 'public', description: 'Un proyecto de GitLab' } };
    }
    if (rest === '/repository/branches') return { body: [...branches].map(([name, sha]) => ({ name, commit: commits.get(sha), protected: name === 'main' })), headers: { 'X-Total': branches.size } };
    if (rest === '/repository/commits') return { status: 403, text: '<!DOCTYPE html><title>Just a moment...</title>' };
    const seq = rest.match(/^\/repository\/commits\/(.+)\/sequence$/);
    if (seq) {
      let sha = resolve(decodeURIComponent(seq[1]));
      let count = 0;
      for (; sha; sha = commits.get(sha)?.parent_ids[0]) count++;
      return count ? { body: { count } } : { status: 404, body: { message: '404 Commit Not Found' } };
    }
    const one = rest.match(/^\/repository\/commits\/(.+)$/);
    if (one) {
      const sha = resolve(decodeURIComponent(one[1]));
      return sha ? { body: commits.get(sha) } : { status: 404, body: { message: '404 Commit Not Found' } };
    }
    if (rest === '/repository/compare') {
      const [from, to] = [resolve(q.get('from')), resolve(q.get('to'))];
      if (!from || !to) return { status: 404, body: { message: '404 Not Found' } };
      const old = reach(from);
      return { body: { commit: commits.get(to), commits: [...reach(to)].filter((s) => !old.has(s)).map((s) => commits.get(s)), diffs: [], compare_timeout: false } };
    }
    if (rest === '/repository/merge_base') return { body: { id: resolve(q.getAll('refs[]')[0]) } };
    if (rest === '/events') {
      const author = { username: 'ana', name: 'Ana', avatar_url: 'https://secure.gravatar.com/avatar/x' };
      return { body: [{ id: 1, action_name: 'opened', target_type: 'Issue', target_iid: 9, target_title: 'Falla al abrir', created_at: new Date().toISOString(), author }] };
    }
    if (rest === '/merge_requests') return { body: mrs.filter((m) => q.get('state') === 'all' || m.state === q.get('state')) };
    return { status: 404, body: { message: '404 Not Found' } };
  };
  return {
    calls,
    auths,
    push: (branch, title) => commit(branch, title),
    /** La MR !5 se fusiona: un commit de merge en main y la rama se borra. */
    merge: () => {
      const head = branches.get('feature/x');
      commit('main', "Merge branch 'feature/x' into 'main'", head);
      branches.delete('feature/x');
      Object.assign(mrs[0], { state: 'merged', merged_by: { username: 'ana', name: 'Ana', avatar_url: null }, updated_at: new Date(Date.now() + 5000).toISOString() });
    },
    handle: (r) => {
      const u = new URL(r.request().url());
      calls.push(u.pathname + u.search);
      const auth = r.request().headers().authorization;
      auths.push({ path: u.pathname, auth });
      const { status = 200, body, text, headers = {} } = route(u.pathname, u.searchParams, auth);
      return r.fulfill({
        status,
        contentType: text ? 'text/html' : 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag, Link, X-Total, X-Next-Page', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])) },
        body: text ?? JSON.stringify(body),
      });
    },
  };
}

/** Ciclos rápidos también para GitLab (su ritmo es fijo, de 15 s) y sus MRs en cada ciclo. */
const quickGitLab = () => {
  const hook = () => {
    const P = window.GB?.GitLabSource?.prototype;
    if (!P) return setTimeout(hook, 5);
    P.nextDelay = () => 1200;
    P.due = () => true;
  };
  hook();
};

console.log('GitLab');
{
  const gl = fakeGitLab();
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://gitlab.com/**', gl.handle);
  await page.addInitScript(quickGitLab);

  await step(page, 'conecta un proyecto con subgrupos (gitlab:g/sub/p) y se recuerda', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=gitlab:g/sub/p`);
    await loaded(page);
    const link = await page.evaluate(() => {
      const a = document.querySelector('#repo-link');
      const b = document.querySelector('#repo-badge');
      return { text: a.textContent, href: a.href, badge: b.hidden ? null : b.textContent, banner: !document.querySelector('#token-banner').hidden };
    });
    if (link.text !== 'g/sub/p' || link.href !== 'https://gitlab.com/g/sub/p') throw new Error(`el título dice ${link.text} (${link.href})`);
    if (link.badge !== 'GitLab') throw new Error(`la etiqueta dice ${link.badge}`);
    if (link.banner) throw new Error('muestra el aviso del token de GitHub');
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["gitlab:g/sub/p"]') throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'group:g sigue los proyectos del grupo de GitLab, sin forks ni archivados, con una consulta', async () => {
    const other = await openPage({ viewport: { width: 1280, height: 800 } });
    await other.route('https://gitlab.com/**', gl.handle);
    await other.addInitScript(quickGitLab);
    await other.goto(`${base}/index.html?lang=es`);
    await loaded(other);
    await other.fill('#repo-input', 'group:g');
    await other.press('#repo-input', 'Enter');
    await other.waitForSelector('#toasts .toast:has-text("Ahora sigues los repositorios más activos de g")', { timeout: 15000 });
    const saved = await other.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["gitlab:g/sub/p"]') throw new Error(`se guardó ${saved}`);
    const lists = gl.calls.filter((c) => c.startsWith('/api/v4/groups/g/projects'));
    if (lists.length !== 1) throw new Error(`consultas de la lista: ${lists.length}`);
    await other.close();
  });

  await step(page, 'en 2D, la rama de la MR lleva !5 y su ficha dice MR', async () => {
    await page.click('#view-2d');
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: 15000 });
    if ((await label.textContent()) !== '!5') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const aria = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!aria.includes('MR !5')) throw new Error(`etiquetas: ${aria}`);
  });

  await step(page, 'lo nuevo llega al panel: un push y la MR fusionada', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('Issue #9 abierto')), null, { timeout: 15000 }); // del feed de eventos
    gl.push('main', 'fix: arreglo urgente');
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('fix: arreglo urgente')), null, { timeout: 15000 });
    gl.merge();
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('MR !5 fusionado en main')), null, { timeout: 15000 });
    if (gl.calls.some((c) => /\/repository\/commits\?/.test(c))) throw new Error('pidió el listado de commits, que gitlab.com bloquea sin token');
  });

  await step(page, 'un proyecto que no existe lo dice, y ofrece Ajustes por si es privado', async () => {
    await page.fill('#repo-input', 'https://gitlab.com/g/nada/-/tree/main');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: 15000 });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró g/nada en GitLab. Si el proyecto es privado')) throw new Error(`el aviso dice ${text}`);
    if (!(await page.locator('#overlay [data-ov=settings]').count())) throw new Error('no ofrece abrir Ajustes');
    // se deja de seguir: si no, al guardar un token se reconectaría y volvería a dar 404
    await page.locator('.rt', { hasText: 'g/nada' }).locator('.rt-close').click();
  }, { allow: /404/ });

  // un repo de GitHub junto a los de GitLab: cada token tiene que ir solo a su servicio
  const gh = fakeGitHub();
  gh.repo('o/r');
  const ghAuths = [];
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', (r) => {
    ghAuths.push(r.request().headers().authorization);
    // con token se prueba primero GraphQL, que la API simulada no tiene: un error que lo dice y la
    // fuente pasa al modo lista
    if (new URL(r.request().url()).pathname === '/graphql') {
      const errors = [{ type: 'FORBIDDEN', message: 'GraphQL no está en la API simulada' }];
      return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ errors }) });
    }
    return gh.handle(r);
  });

  await step(page, 'un proyecto privado pide el token de GitLab en Ajustes, y con él se ve', async () => {
    await page.fill('#repo-input', 'gitlab:g/privado');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#overlay[data-kind=error]:not([hidden])')?.textContent.includes('g/privado'), null, { timeout: 15000 });
    await page.click('#overlay [data-ov=settings]');
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'gitlab-token-input') throw new Error(`Ajustes abrió con el foco en ${focus}`);
    await page.fill('#gitlab-token-input', GITLAB_TOKEN);
    await page.fill('#token-input', 'ghp_smoke0123456789');
    const from = gl.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'g/privado' && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
    const badge = await page.textContent('#repo-badge');
    if (badge !== 'GitLab · privado') throw new Error(`la etiqueta dice ${badge}`);
    const saved = await page.evaluate(() => [localStorage.getItem('graphbranch:gitlabToken'), localStorage.getItem('graphbranch:token')]);
    if (saved[0] !== JSON.stringify(GITLAB_TOKEN)) throw new Error(`se guardó ${saved[0]}`);
    const sent = gl.auths.slice(from).filter((a) => a.path.includes('g%2Fprivado'));
    if (!sent.length || sent.some((a) => a.auth !== `Bearer ${GITLAB_TOKEN}`)) throw new Error(`a g/privado fue ${[...new Set(sent.map((a) => a.auth))]}`);
  }, { allow: /40[14]/ });

  await step(page, 'cada token va solo a su servicio', async () => {
    await page.fill('#repo-input', 'o/r');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/r' && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
    if (!ghAuths.length) throw new Error('no consultó GitHub');
    const toGitHub = new Set(ghAuths);
    const toGitLab = new Set(gl.auths.map((a) => a.auth));
    if ([...toGitHub].some((a) => a !== 'Bearer ghp_smoke0123456789')) throw new Error(`a GitHub fue ${[...toGitHub]}`);
    if ([...toGitLab].some((a) => a && a !== `Bearer ${GITLAB_TOKEN}`)) throw new Error(`a GitLab fue ${[...toGitLab]}`);
  });
  await page.context().close();
}

/* ---------- Codeberg ---------- */

/** codeberg.org simulado para la web: ana/api con main, una rama con dos commits y un PR abierto. */
function fakeCodeberg() {
  const WEB = 'https://codeberg.org/ana/api';
  const commits = new Map();
  const branches = new Map();
  const calls = [];
  const auths = [];
  let n = 0;
  const commit = (branch, title) => {
    const sha = createHash('sha1').update(`cb:${++n}`).digest('hex');
    const parent = branches.get(branch);
    const date = new Date(Date.now() - 3600e3 + n * 1000).toISOString();
    commits.set(sha, { sha, html_url: `${WEB}/commit/${sha}`, parents: parent ? [{ sha: parent }] : [], commit: { message: title, author: { name: 'Bea', date }, committer: { date } }, author: { login: 'bea', avatar_url: null } });
    branches.set(branch, sha);
  };
  for (let i = 0; i < 4; i++) commit('main', `inicio ${i}`);
  branches.set('feature/x', branches.get('main'));
  commit('feature/x', 'feat: primera parte');
  commit('feature/x', 'feat: segunda parte');
  const chain = (sha) => {
    const out = [];
    for (let s = sha; s && commits.has(s); s = commits.get(s).parents[0]?.sha) out.push(commits.get(s));
    return out;
  };
  const json = (body, headers = {}) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
  return {
    calls,
    auths,
    handle: (route) => {
      const u = new URL(route.request().url());
      auths.push(route.request().headers().authorization || null);
      const p = u.pathname.replace('/api/v1', '');
      calls.push(p + u.search);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      if (p === '/repos/ana/api') return route.fulfill(json({ name: 'api', owner: { login: 'ana' }, default_branch: 'main', html_url: WEB, private: false, description: 'Un repo de Codeberg' }));
      if (p === '/repos/ana/api/branches') return route.fulfill(json([...branches].map(([name, sha]) => ({ name, commit: { id: sha }, protected: name === 'main' }))));
      if (p === '/repos/ana/api/commits') return route.fulfill(json(chain(u.searchParams.get('sha')).slice(0, Number(u.searchParams.get('limit') || 30))));
      if (p === '/repos/ana/api/pulls') {
        const pr = { number: 3, title: 'Agrega la función x', html_url: `${WEB}/pulls/3`, state: 'open', head: { ref: 'feature/x', repo: { full_name: 'ana/api' } }, base: { ref: 'main' }, user: { login: 'bea', avatar_url: null }, created_at: new Date().toISOString() };
        return route.fulfill(json(u.searchParams.get('state') === 'open' ? [pr] : []));
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"not found"}' });
    },
  };
}

console.log('Codeberg');
{
  const cb = fakeCodeberg();
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://codeberg.org/**', cb.handle);

  await step(page, 'conecta un repo de Codeberg (codeberg:ana/api), con su etiqueta y sin token', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=codeberg:ana/api`);
    await loaded(page);
    const link = await page.evaluate(() => {
      const a = document.querySelector('#repo-link');
      const b = document.querySelector('#repo-badge');
      return { text: a.textContent, href: a.href, badge: b.hidden ? null : b.textContent, banner: !document.querySelector('#token-banner').hidden };
    });
    if (link.text !== 'ana/api' || link.href !== 'https://codeberg.org/ana/api') throw new Error(`el título dice ${link.text} (${link.href})`);
    if (link.badge !== 'Codeberg') throw new Error(`la etiqueta dice ${link.badge}`);
    if (link.banner) throw new Error('muestra el aviso del token de GitHub');
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["codeberg:ana/api"]') throw new Error(`se guardó ${saved}`);
    if (cb.auths.some(Boolean)) throw new Error('una consulta a Codeberg llevó un encabezado Authorization');
  });

  await step(page, 'en 2D se ven sus dos ramas y el PR #3', async () => {
    await page.click('#view-2d');
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: 15000 });
    if ((await label.textContent()) !== '#3') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const names = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!names.includes('feature/x') || !names.includes('main')) throw new Error(`ramas: ${names}`);
  });

  await step(page, 'un repo que no existe lo dice con el texto de Codeberg', async () => {
    await page.fill('#repo-input', 'https://codeberg.org/ana/nada');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: 15000 });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró ana/nada en Codeberg. Solo se leen repositorios públicos.')) throw new Error(`el aviso dice ${text}`);
  }, { allow: /404/ });

  await step(page, 'el token de Codeberg de Ajustes va en cada consulta, solo a Codeberg', async () => {
    await page.fill('#repo-input', 'https://codeberg.org/ana/api');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/api' && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: 3000 });
    await page.fill('#codeberg-token-input', 'cb-smoke0123');
    const from = cb.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'ana/api', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const sent = cb.auths.slice(from);
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some((a) => a !== 'token cb-smoke0123')) throw new Error(`a Codeberg fue ${[...new Set(sent)]}`);
    const saved = await page.evaluate(() => [localStorage.getItem('graphbranch:codebergToken'), localStorage.getItem('graphbranch:token')]);
    if (saved[0] !== JSON.stringify('cb-smoke0123') || saved[1] !== null) throw new Error(`se guardó ${saved}`);
  });
  await page.context().close();
}

/* ---------- Bitbucket ---------- */

/** api.bitbucket.org simulado para la web: ana/api con main, una rama con dos commits y un PR abierto. */
function fakeBitbucket() {
  const WEB = 'https://bitbucket.org/ana/api';
  const commits = new Map();
  const branches = new Map();
  const calls = [];
  const auths = [];
  let n = 0;
  const commit = (branch, title) => {
    const hash = createHash('sha1').update(`bb:${++n}`).digest('hex');
    const parent = branches.get(branch);
    const date = new Date(Date.now() - 3600e3 + n * 1000).toISOString();
    commits.set(hash, { type: 'commit', hash, date, message: title, parents: parent ? [{ hash: parent }] : [], author: { raw: 'Bea <bea@example.com>', user: { display_name: 'Bea', nickname: 'bea' } }, links: { html: { href: `${WEB}/commits/${hash}` } } });
    branches.set(branch, hash);
  };
  for (let i = 0; i < 4; i++) commit('main', `inicio ${i}`);
  branches.set('feature/x', branches.get('main'));
  commit('feature/x', 'feat: primera parte');
  commit('feature/x', 'feat: segunda parte');
  const chain = (hash) => {
    const out = [];
    for (let s = hash; s && commits.has(s); s = commits.get(s).parents[0]?.hash) out.push(commits.get(s));
    return out;
  };
  const json = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  return {
    calls,
    auths,
    handle: (route) => {
      const u = new URL(route.request().url());
      auths.push(route.request().headers().authorization || null);
      const p = u.pathname.replace('/2.0', '');
      calls.push(p + u.search);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      if (p === '/repositories/ana/api') return route.fulfill(json({ slug: 'api', workspace: { slug: 'ana' }, mainbranch: { name: 'main' }, links: { html: { href: WEB } }, is_private: false, description: 'Un repo de Bitbucket' }));
      if (p === '/repositories/ana/api/refs/branches') return route.fulfill(json({ size: branches.size, values: [...branches].map(([name, hash]) => ({ name, target: { hash, date: commits.get(hash).date } })) }));
      const log = p.match(/^\/repositories\/ana\/api\/commits\/(\w+)$/);
      if (log) return route.fulfill(json({ values: chain(log[1]).slice(0, Number(u.searchParams.get('pagelen') || 10)) }));
      if (p === '/repositories/ana/api/pullrequests') {
        const pr = { id: 3, title: 'Agrega la función x', state: 'OPEN', draft: false, links: { html: { href: `${WEB}/pull-requests/3` } }, source: { branch: { name: 'feature/x' }, repository: { full_name: 'ana/api' } }, destination: { branch: { name: 'main' } }, author: { display_name: 'Bea', nickname: 'bea' }, created_on: new Date().toISOString() };
        return route.fulfill(json({ values: [pr] }));
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"type":"error","error":{"message":"not found"}}' });
    },
  };
}

console.log('Bitbucket');
{
  const bb = fakeBitbucket();
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://api.bitbucket.org/**', bb.handle);

  await step(page, 'conecta un repo de Bitbucket (bitbucket:ana/api), con su etiqueta y sin token', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=bitbucket:ana/api`);
    await loaded(page);
    const link = await page.evaluate(() => {
      const a = document.querySelector('#repo-link');
      const b = document.querySelector('#repo-badge');
      return { text: a.textContent, href: a.href, badge: b.hidden ? null : b.textContent, banner: !document.querySelector('#token-banner').hidden };
    });
    if (link.text !== 'ana/api' || link.href !== 'https://bitbucket.org/ana/api') throw new Error(`el título dice ${link.text} (${link.href})`);
    if (link.badge !== 'Bitbucket') throw new Error(`la etiqueta dice ${link.badge}`);
    if (link.banner) throw new Error('muestra el aviso del token de GitHub');
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["bitbucket:ana/api"]') throw new Error(`se guardó ${saved}`);
    if (bb.auths.some(Boolean)) throw new Error('una consulta a Bitbucket llevó un encabezado Authorization');
  });

  await step(page, 'en 2D se ven sus dos ramas y el PR #3', async () => {
    await page.click('#view-2d');
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: 15000 });
    if ((await label.textContent()) !== '#3') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const names = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!names.includes('feature/x') || !names.includes('main')) throw new Error(`ramas: ${names}`);
  });

  await step(page, 'un repo que no existe lo dice con el texto de Bitbucket', async () => {
    await page.fill('#repo-input', 'https://bitbucket.org/ana/nada');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: 15000 });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró ana/nada en Bitbucket. Solo se leen repositorios públicos.')) throw new Error(`el aviso dice ${text}`);
  }, { allow: /404/ });

  await step(page, 'el token de Bitbucket de Ajustes va en cada consulta, solo a Bitbucket', async () => {
    await page.fill('#repo-input', 'https://bitbucket.org/ana/api');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/api' && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: 3000 });
    await page.fill('#bitbucket-token-input', 'bb-smoke0123');
    const from = bb.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'ana/api', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const sent = bb.auths.slice(from);
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some((a) => a !== 'Bearer bb-smoke0123')) throw new Error(`a Bitbucket fue ${[...new Set(sent)]}`);
    const saved = await page.evaluate(() => [localStorage.getItem('graphbranch:bitbucketToken'), localStorage.getItem('graphbranch:token')]);
    if (saved[0] !== JSON.stringify('bb-smoke0123') || saved[1] !== null) throw new Error(`se guardó ${saved}`);
  });
  await page.context().close();
}

console.log('Fijar una rama con el teclado');
{
  const gh = fakeGitHub();
  gh.repo('o/f');
  gh.push('o/f', 'feat', 'una rama para fijar');
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  await step(page, 'el botón Fijar de la ficha conserva el foco', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/f`);
    await loaded(page);
    await page.click('#view-2d');
    // todo con el teclado: la etiqueta de una rama abre su ficha con Enter
    const head = await page.waitForSelector('#graph svg .head[role=button]', { timeout: 10000 });
    await head.focus();
    await page.keyboard.press('Enter');
    const pin = await page.waitForSelector('#graph .tip .tip-pin', { timeout: 5000 });
    const before = await pin.getAttribute('aria-pressed');
    await pin.focus();
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => {
      const el = document.activeElement;
      return { focus: el?.className || el?.tagName, pressed: el?.getAttribute('aria-pressed') };
    });
    if (after.focus !== 'tip-pin') throw new Error(`tras fijar, el foco quedó en ${after.focus}`);
    if (after.pressed === before) throw new Error('el botón no cambió de estado');
  });

  // abierta con el teclado, la ficha recibe el foco (si no, para llegar a sus botones habría que
  // recorrer con Tab todas las etiquetas) y Esc la cierra y lo devuelve a la etiqueta
  const focusRoundTrip = async (view, label) => {
    await page.keyboard.press('Escape'); // ninguna ficha abierta de antes
    await page.click(`#view-${view}`);
    const head = await page.waitForSelector(label, { timeout: 10000 });
    await head.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector(`#${view === '2d' ? 'graph' : 'graph3d'} .tip:not([hidden])`, { timeout: 5000 });
    const where = () => page.evaluate(() => {
      const el = document.activeElement;
      return { inTip: !!el?.closest('.tip'), tag: el?.tagName, head: !!el?.matches('.head, .g3-head') };
    });
    const opened = await where();
    if (!opened.inTip) throw new Error(`${view}: al abrir la ficha, el foco quedó en ${opened.tag}`);
    await page.keyboard.press('Tab');
    const next = await where();
    if (!next.inTip || !['A', 'BUTTON'].includes(next.tag)) throw new Error(`${view}: Tab llevó a ${next.tag}, fuera de la ficha`);
    await page.keyboard.press('Escape');
    const back = await where();
    if (!back.head) throw new Error(`${view}: tras Esc, el foco quedó en ${back.tag}`);
  };
  await step(page, 'Enter en una etiqueta lleva el foco a su ficha (2D), y Esc lo devuelve', () => focusRoundTrip('2d', '#graph svg .head[role=button]'));
  if (await page.locator('#graph3d canvas').count())
    await step(page, 'Enter en una etiqueta lleva el foco a su ficha (3D), y Esc lo devuelve', () => focusRoundTrip('3d', '#graph3d .g3-head'));
  await page.context().close();
}

console.log('Galaxias: cortar un salto hiperespacial');
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  // la vista 3D no se expone: se toma la instancia del primer cuadro que dibuja
  await page.addInitScript(() => {
    const hook = () => {
      const G3 = window.GB?.Graph3D?.prototype;
      if (!G3) return setTimeout(hook, 5);
      const step = G3.stepCamera;
      G3.stepCamera = function (...args) {
        window.__g3 = this;
        return step.apply(this, args);
      };
    };
    hook();
  });
  await step(page, 'pasar a 2D en pleno salto no deja mal el campo de visión', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    if (!(await page.locator('#graph3d canvas').count())) return console.log('    (sin WebGL: se salta)');
    await page.click('#galaxy-btn');
    await page.waitForTimeout(2500);
    const fov0 = await page.evaluate(() => {
      const g = window.__g3;
      const to = [...g.gx.gals.values()].find((G) => G !== g.gx.focus);
      g.gx.jumpTo(to);
      return g.camera.fov;
    });
    await page.waitForTimeout(1900); // carga (1,1 s) y un poco de túnel, donde el campo de visión se abre
    const mid = await page.evaluate(() => window.__g3.camera.fov);
    await page.click('#view-2d');
    await page.click('#view-3d');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__g3.camera.fov);
    await page.click('#galaxy-btn');
    if (Math.abs(mid - fov0) < 1) throw new Error(`el salto no llegó al túnel (campo de visión ${mid.toFixed(1)}°)`);
    if (Math.abs(after - fov0) > 0.01) throw new Error(`el campo de visión quedó en ${after.toFixed(1)}° (era ${fov0.toFixed(1)}°)`);
  });

  await step(page, 'al llegar a una galaxia, el lector de pantalla oye el nombre una vez y sin glifos', async () => {
    if (!(await page.locator('#graph3d canvas').count())) return;
    await page.click('#galaxy-btn');
    await page.waitForTimeout(2500);
    const said = await page.evaluate(async () => {
      const g = window.__g3;
      // lo que leería un lector del rótulo de llegada: sus regiones vivas que no estén escondidas
      const live = () =>
        [...g.wrap.querySelectorAll('[class^=gx-arrive]')]
          .filter((el) => el.matches('[role=status], [role=alert], [aria-live]') && !el.closest('[aria-hidden=true]'))
          .map((el) => el.textContent.trim())
          .join(' | ');
      const out = [];
      const mo = new MutationObserver(() => {
        const t = live();
        if (t && t !== out[out.length - 1]) out.push(t);
      });
      mo.observe(g.wrap, { subtree: true, childList: true, characterData: true });
      const name = [...g.gx.gals.keys()].find((n) => n !== g.gx.focus?.name);
      g.focusBranch(name);
      await new Promise((r) => setTimeout(r, 4000));
      mo.disconnect();
      return { name, out };
    });
    await page.click('#galaxy-btn');
    const glyphs = said.out.filter((t) => /[▓▒░]/.test(t));
    if (glyphs.length) throw new Error(`se leyeron ${glyphs.length} versiones a medio descifrar, como «${glyphs[0]}»`);
    // una vez al llegar; puede sumar los planetas cuando llegan los archivos de la rama
    if (said.out.length > 3) throw new Error(`lo que se lee cambió ${said.out.length} veces: ${said.out.map((t) => `«${t}»`).join(', ')}`);
    if (!said.out.some((t) => t.includes(said.name))) throw new Error(`no se lee el nombre de la galaxia (${said.name})`);
  });

  await step(page, 'cambiar de repo mientras cargan los archivos de una galaxia no los deja en el nuevo', async () => {
    if (!(await page.locator('#graph3d canvas').count())) return;
    await page.click('#galaxy-btn');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async () => {
      const gx = window.__g3.gx;
      const P = window.GB.DemoSource.prototype;
      const files = P.files;
      let release;
      const gate = new Promise((ok) => (release = ok));
      P.files = function (...args) {
        const out = files.apply(this, args);
        return gate.then(() => out); // la respuesta queda retenida hasta después del cambio de repo
      };
      try {
        gx.cache.clear();
        gx.lastData.clear();
        const G = [...gx.gals.values()][0];
        gx.ensureFiles(G, performance.now());
        gx.reset(); // lo que hace connect() al cambiar de repositorio
        release();
        await new Promise((ok) => setTimeout(ok, 1200)); // la demo tarda 350–800 ms, como si viniera de la red
        return { name: G.name, leaked: gx.lastData.has(G.name) };
      } finally {
        P.files = files;
      }
    });
    await page.click('#galaxy-btn');
    if (r.leaked) throw new Error(`los archivos de «${r.name}» del repo anterior quedaron para el nuevo`);
  });
  await page.context().close();
}

console.log('Efectos 3D con la vista 2D');
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const hook = () => {
      const G3 = window.GB?.Graph3D?.prototype;
      if (!G3) return setTimeout(hook, 5);
      const step = G3.stepCamera;
      G3.stepCamera = function (...args) {
        window.__g3 = this;
        return step.apply(this, args);
      };
    };
    hook();
  });
  await step(page, 'lo que llega mientras se ve la 2D no se acumula para la 3D', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    if (!(await page.locator('#graph3d canvas').count())) return console.log('    (sin WebGL: se salta)');
    await page.waitForFunction(() => window.__g3, null, { timeout: 5000 });
    await page.click('#view-2d');
    const before = await page.evaluate(() => window.__g3.nodes.size);
    // la demo trae commits cada 3 a 7 s: se espera a que llegue alguno con la 3D escondida
    await page.waitForFunction((n) => window.__g3.nodes.size > n, before, { timeout: 30000 });
    await page.waitForTimeout(500);
    const q = await page.evaluate(() => ({ pending: window.__g3.pending.length, dying: window.__g3.dying.length }));
    await page.click('#view-3d');
    if (q.pending || q.dying) throw new Error(`la vista 3D escondida acumuló ${q.pending} efectos y ${q.dying} commits por desvanecer`);
  });
  await page.context().close();
}

console.log('Zumbido del espacio');
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  // el último volumen que se le pidió al zumbido del espacio
  await page.addInitScript(() => {
    const hook = () => {
      const S = window.GB?.Synth?.prototype;
      if (!S) return setTimeout(hook, 5);
      const drone = S.drone;
      S.drone = function (level, ...rest) {
        window.__drone = level;
        return drone.call(this, level, ...rest);
      };
    };
    hook();
  });
  // osciladores vivos: iniciados menos detenidos (los sonidos de cada aviso se detienen solos)
  await page.addInitScript(() => {
    window.__osc = 0;
    const P = window.OscillatorNode?.prototype;
    if (!P) return;
    const start = P.start;
    const stop = P.stop;
    P.start = function (...args) {
      window.__osc++;
      return start.apply(this, args);
    };
    P.stop = function (...args) {
      window.__osc--;
      return stop.apply(this, args);
    };
  });
  const drone = () => page.evaluate(() => window.__drone ?? null);
  const humming = (on) =>
    page.waitForFunction((v) => (window.__drone > 0) === v, on, { timeout: 4000 }).then(
      () => true,
      () => false,
    );
  await step(page, 'se calla con la pestaña oculta y al entrar al modo TV, y vuelve', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    if (!(await page.locator('#graph3d canvas').count())) return console.log('    (sin WebGL: se salta)');
    await page.click('#sound-btn');
    await page.click('#galaxy-btn');
    if (!(await humming(true))) throw new Error(`con sonido y galaxias no suena el zumbido (${await drone()})`);
    const setHidden = (h) =>
      page.evaluate((hidden) => {
        Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
        Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, h);
    await setHidden(true);
    let hiddenOff = await humming(false);
    await page.waitForTimeout(800); // varios turnos de stepAmbience (cada 250 ms): oculta no vuelve a pedirlo
    if (hiddenOff && (await drone()) > 0) hiddenOff = false;
    await setHidden(false);
    const back = await humming(true);
    await page.click('#tv-btn');
    const tvOff = await humming(false);
    await page.click('#tv-exit');
    const tvBack = await humming(true);
    await page.click('#galaxy-btn');
    if (!hiddenOff) throw new Error('con la pestaña oculta el zumbido sigue sonando');
    if (!back) throw new Error('al volver a la pestaña el zumbido no vuelve');
    if (!tvOff) throw new Error('al entrar al modo TV (sin sonido) el zumbido sigue sonando');
    if (!tvBack) throw new Error('al salir del modo TV el zumbido no vuelve');
  });
  await step(page, 'apagado, el zumbido deja de generar audio', async () => {
    if (!(await page.locator('#graph3d canvas').count())) return;
    await page.click('#galaxy-btn');
    if (!(await humming(true))) throw new Error('el zumbido no arrancó');
    const live = await page.evaluate(() => window.__osc);
    await page.click('#galaxy-btn'); // fuera del espacio el zumbido se apaga
    await page.waitForTimeout(5000); // lo que tarda en desvanecerse
    const after = await page.evaluate(() => window.__osc);
    if (live <= 0) throw new Error(`con el zumbido sonando no se contaron osciladores (${live})`);
    if (after > 0) throw new Error(`apagado, quedan ${after} osciladores generando audio en silencio`);
  });
  await step(page, 'al aterrizar, el motor del vuelo deja de generar audio', async () => {
    if (!(await page.locator('#graph3d canvas').count())) return;
    const before = await page.evaluate(() => window.__osc);
    await page.click('#fly-btn');
    await page.keyboard.down('w'); // acelerar: el motor suena
    await page.waitForTimeout(1200);
    await page.keyboard.up('w');
    const flying = await page.evaluate(() => window.__osc);
    await page.click('#fly-btn');
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => window.__osc);
    if (flying <= before) throw new Error('el motor no sonó al acelerar');
    if (after > before) throw new Error(`tras aterrizar quedan ${after - before} osciladores del motor`);
  });
  await page.context().close();
}

console.log('Movimiento reducido');
{
  // lo que solo se ve mientras dura su animación (el combo, la ayuda del vuelo y sus avisos) tiene que
  // verse igual, quieto y el mismo tiempo: si la animación se acorta, salta al final, que es invisible
  const page = await openPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await step(page, 'el combo, la ayuda del vuelo y sus avisos se ven, quietos y el mismo tiempo', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    // en vuelo (con WebGL) la ayuda aparece sola, por su camino de siempre; fuera de él está oculta
    const fly = (await page.locator('#graph3d canvas').count()) > 0 && (await page.locator('#fly-btn').isVisible());
    if (fly) await page.click('#fly-btn');
    const shown = await page.evaluate(async (fly) => {
      const wanted = [['.combo', 'pop', 2200], ...(fly ? [['.fl-hint', 'show', 8000], ['.fl-msg', 'show', 2600]] : [])];
      // el combo y el aviso, como los enciende la app: se quita la clase, reflujo y se vuelve a poner
      for (const [sel, cls] of wanted.filter(([sel]) => sel !== '.fl-hint')) {
        const el = document.querySelector(sel);
        el.textContent ||= 'aviso';
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      }
      await new Promise((ok) => setTimeout(ok, 600));
      return wanted.map(([sel, , ms]) => {
        const el = document.querySelector(sel);
        const anim = el.getAnimations().find((a) => a.animationName); // no las transiciones
        return { sel, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform, ms, dur: anim ? anim.effect.getComputedTiming().duration : 0 };
      });
    }, fly);
    if (fly) await page.keyboard.press('Escape');
    for (const x of shown) {
      if (x.opacity !== '1') throw new Error(`${x.sel} tiene opacidad ${x.opacity}`);
      if (x.transform !== 'none') throw new Error(`${x.sel} se mueve (${x.transform})`);
      if (Math.abs(x.dur - x.ms) > 1) throw new Error(`${x.sel} dura ${x.dur} ms y no ${x.ms}`);
    }
    if (!fly) console.log('    (sin WebGL: solo el combo)');
  });
  await page.context().close();
}

console.log('Contraste del texto (WCAG AA)');
for (const colorScheme of ['light', 'dark']) {
  const page = await openPage({ viewport: { width: 1280, height: 900 }, colorScheme });
  await step(page, `tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}: todo el texto visible se lee`, async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.waitForSelector('#feed > li', { timeout: 30000 });
    const bad = await lowContrast(page);
    if (bad.length) throw new Error(`${bad.length} textos con poco contraste, como ${bad.slice(0, 3).join(', ')}`);
  });
  await page.context().close();
}

console.log('Widget embebido (?embed=1)');
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, 'solo el grafo y los avisos, sin barras ni desborde', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&bg=transparent`);
    await loaded(page);
    await page.waitForSelector('#graph3d canvas, #graph canvas', { timeout: 30000 });
    for (const sel of ['.topbar', '.stats', '.feed-panel', '.toolbar', '.hint']) {
      if (await page.locator(sel).first().isVisible()) throw new Error(`${sel} se ve en modo embed`);
    }
    const r = await page.evaluate(() => {
      const b = document.querySelector('.graph-stage').getBoundingClientRect();
      const de = document.documentElement;
      return { w: b.width, h: b.height, sw: de.scrollWidth, sh: de.scrollHeight, bg: getComputedStyle(document.body).backgroundColor };
    });
    if (r.sw > 640 || r.sh > 400) throw new Error(`desborda: ${r.sw}×${r.sh} en 640×400`);
    if (r.w < 600 || r.h < 360) throw new Error(`el grafo no llena el marco: ${r.w}×${r.h}`);
    if (r.bg !== 'rgba(0, 0, 0, 0)') throw new Error(`&bg=transparent deja el fondo ${r.bg}`);
    if (await page.evaluate(() => document.documentElement.classList.contains('tv'))) throw new Error('embed entró en modo TV');
  });
  await page.context().close();
}

console.log('Filtro por ruta desde la URL (?path=)');
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre ya filtrado, atenúa el grafo, mantiene la ruta en la URL y al quitarlo la suelta', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: 3000 });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una ruta');
    await page.goto(`${base}/index.html?lang=es&path=${encodeURIComponent('/' + word)}`);
    await loaded(page);
    await page.waitForSelector('#search-path-clear:not([hidden])', { timeout: 5000 });
    const on = await page.evaluate(() => ({
      value: document.querySelector('#search-path').value,
      dim: document.querySelectorAll('#graph svg .node.pfx').length,
      all: document.querySelectorAll('#graph svg .node').length,
      url: location.search,
    }));
    if (on.value !== word) throw new Error(`el campo de ruta quedó en «${on.value}», no en «${word}»`);
    if (!on.dim || on.dim >= on.all) throw new Error(`?path= no acota: ${on.dim} atenuados de ${on.all}`);
    if (!on.url.includes('path=')) throw new Error('la URL perdió la ruta: ' + on.url);
    await page.click('#search-path-clear');
    if ((await page.evaluate(() => location.search)).includes('path=')) throw new Error('quitar el filtro deja la ruta en la URL');
  });
  await page.context().close();
}

console.log('Modo TV directo (?tv=1)');
{
  const page = await openPage({ viewport: { width: 1920, height: 1080 } });
  await step(page, 'abre en modo TV y el director toma la cámara', async () => {
    await page.goto(`${base}/index.html?lang=es&tv=1`);
    await loaded(page);
    await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: 5000 });
    await page.waitForTimeout(4000);
    if (!(await page.locator('#graph3d').isVisible())) throw new Error('el modo TV no muestra la vista 3D');
  });
  await page.context().close();
}

console.log(`Celular (390×844), ${langs.length} idiomas`);
{
  const page = await openPage(phone);
  for (const lang of langs) {
    await step(page, `${lang}: carga sin desbordar`, async () => {
      await page.goto(`${base}/index.html?lang=${lang}`);
      await loaded(page);
      const over = await noOverflow(page);
      if (over > 1) throw new Error(`la página es ${over}px más ancha que la pantalla`);
    });
  }
  await page.context().close();
}

await browser.close();
server.close();

if (failures) {
  console.log(`\n${failures} fallo(s).`);
  process.exit(1);
}
console.log('\nTodo bien.');
