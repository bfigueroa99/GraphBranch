#!/usr/bin/env node
/* Prueba de humo: abre la app en un Chromium sin ventana, en modo demo, recorre lo principal
   y falla si algo lanza un error.

     node tools/smoke.mjs            escenarios básicos (unos 30 s)
     node tools/smoke.mjs --langs    además abre la app en los 40 idiomas, en pantalla de celular
     node tools/smoke.mjs --solo GitLab --solo Celular   solo las secciones cuyo título contiene ese texto
     node tools/smoke.mjs --seccion Bitbucket            solo la sección con ese título exacto (la puerta)
     node tools/smoke.mjs --secciones                    los títulos de las secciones (o, con --solo o --seccion, los
                                                         de las que correrían), sin abrir el navegador

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
const listar = process.argv.includes('--secciones');

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

// Topes de espera: las esperas a un estado vuelven en cuanto se cumple, así que un tope holgado no
// cuesta nada con el equipo libre y evita las fallas intermitentes con el equipo cargado.
const T = (ms) => ms * 3;

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = listar ? {} : await loadPlaywright();
const browser = listar ? null : await chromium.launch({
  // como en las pruebas e2e: otro Chromium que el de esta versión de Playwright
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  // WebGL por software, para que la vista 3D también se pruebe sin GPU
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let failures = 0;
const fail = (msg, paso = msg) => {
  failures++;
  if (!conFallos.has(actual)) conFallos.set(actual, []);
  conFallos.get(actual).push(paso);
  console.log(`  ✗ ${msg}`);
};

/* Secciones: cada bloque de primer nivel («if (seccion('Título'))») abre su propio contexto y no depende de
   los demás, así que se puede correr suelto. `--solo <texto>` (se puede repetir) corre solo las secciones cuyo
   título contiene ese texto, y `--seccion <título>`, la de ese título exacto («Bitbucket» y no también
   «Bitbucket propio con token»): la puerta (tools/check.mjs) repite así la sección de un paso que falló una vez,
   en lugar del smoke entero (10 minutos), y quien arregla un paso intermitente lo prueba en segundos. Al
   terminar con fallos, cada sección que tuvo alguno sale en una línea «§ Título», y debajo, cada paso que
   falló en ella, en una línea «· nombre del paso» (sin su error, que ya salió en su «✗»). */
const valores = (flag) => process.argv.flatMap((a, i, v) => (a === flag && v[i + 1] ? [v[i + 1]] : []));
const solo = valores('--solo');
const exactas = valores('--seccion');
const pedidas = solo.length + exactas.length;
const corridas = [];
const conFallos = new Map();
let actual = '';
function seccion(titulo) {
  if (pedidas && !solo.some((t) => titulo.includes(t)) && !exactas.includes(titulo)) return false;
  sinContextos();
  corridas.push(titulo);
  console.log(titulo);
  if (listar) return false; // --secciones solo dice cuáles correrían
  actual = titulo;
  return true;
}

/* Cada sección cierra los contextos que abrió. Uno que queda vivo, aunque sea sin páginas, mantiene el service
   worker de la app en un proceso más de Chromium hasta el final del smoke (en la iteración 275, el del paso de
   group:g de GitLab: 7 de los 11 minutos, ~200 MB), y con el equipo cargado una sección posterior se quedaba sin
   recursos para pedir sus archivos (`net::ERR_INSUFFICIENT_RESOURCES`, iteración 236). Al entrar
   en la sección siguiente, y al terminar, lo que siga abierto es un fallo de la sección que lo dejó, y se cierra. */
function sinContextos() {
  if (!browser || !actual) return;
  const vivos = browser.contexts();
  if (!vivos.length) return;
  fail(`la sección «${actual}» dejó ${vivos.length} contexto(s) del navegador sin cerrar (${vivos.reduce((n, c) => n + c.pages().length, 0)} página(s))`, 'cierra sus contextos del navegador');
  for (const c of vivos) c.close().catch(() => {});
}

/** Abre una pestaña que anota todo error y aísla la app de lo que no es suyo. */
async function openPage(contextOptions = {}) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...contextOptions });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`excepción: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(`consola: ${m.text()}${m.location().url ? ` (${m.location().url})` : ''}`));
  // la demo no debe consultar GitHub; las fuentes y avatares se sirven vacíos para no depender de la red
  await page.route('https://api.github.com/**', (r) => {
    page.errors.push(`la demo consultó ${r.request().url()}`);
    return r.abort();
  });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://avatars.githubusercontent.com/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG_1PX }));
  return page;
}

/** Abre con teclado la ficha de una rama vigente y a la vista, y devuelve el selector que se pidió dentro de ella.
    Elegir `heads[3]` a ciegas fallaba con la demo viva: una etiqueta puede estar fuera de la vista (`display: none`)
    o saliendo (`.exit`), y entonces el foco no llega y Enter no abre su ficha. Se lleva el grafo al último commit
    (End) para que haya etiquetas, y se prueban las primeras 6 a la vista, salvo la rama por defecto. */
async function openBranchTip(page, inner) {
  await page.focus('#graph');
  await page.keyboard.press('End');
  await page.waitForFunction(() => [...document.querySelectorAll('#graph svg .head[role=button]:not(.exit)')].some((h) => getComputedStyle(h).display !== 'none'), null, { timeout: T(3000) });
  const shown = [];
  for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) if (await h.isVisible()) shown.push(h);
  for (const h of shown.slice(0, 6)) {
    if (await h.evaluate((n) => n.classList.contains('default'))) continue; // la rama por defecto no se oculta
    await h.focus();
    await page.keyboard.press('Enter');
    const found = await page.waitForSelector(`#graph .tip:not([hidden]) ${inner}`, { timeout: T(1000) }).catch(() => null);
    if (found) return found;
    await page.keyboard.press('Escape');
  }
  throw new Error(`ninguna de las primeras 6 ramas a la vista abrió su ficha con ${inner}`);
}

/** Corre `fn` con la demo en pausa y la deja como estaba, también si falla: un paso que compara lo que
    ve antes y después (ramas, etiquetas, la región viva) no puede depender de que la demo no publique a
    mitad, y bajo carga en la nube la demo publica a mitad (pendiente 1 de Mantenimiento). */
async function quieta(page, fn) {
  const pressed = () => page.evaluate(() => document.querySelector('#pause-btn').getAttribute('aria-pressed') === 'true');
  const toggle = () => page.evaluate(() => document.querySelector('#pause-btn').click());
  const was = await pressed();
  if (!was) await toggle();
  try {
    await fn();
  } finally {
    // si la página ya no responde, el error que cuenta es el del paso
    try { if (!page.isClosed() && (await pressed()) !== was) await toggle(); } catch {}
  }
}

/** `allow`: errores de consola que el paso provoca a propósito (por ejemplo, un 404 de la API simulada). */
async function step(page, name, fn, { allow = null } = {}) {
  const before = page.errors.length;
  const errs = [];
  try {
    await fn();
  } catch (e) {
    errs.push(e.message.split('\n')[0] + blocker(e.message));
  }
  // la excepción de la app explica mejor que el timeout
  errs.unshift(...page.errors.slice(before).filter((e) => !allow?.test(e)));
  if (errs.length) {
    fail(`${name}: ${errs.join(' | ')}`, name);
    await reset(page);
  } else console.log(`  ✓ ${name}`);
}

/** De un `click` vencido, Playwright cuenta en las líneas de su registro qué tapaba el objetivo: la
    última va al fallo, que si no dice solo «Timeout 30000ms exceeded». */
function blocker(msg) {
  const tapa = msg.split('\n').filter((l) => /intercepts pointer events/.test(l)).pop();
  return tapa ? ` (${tapa.trim().replace(/^- /, '')})` : '';
}

/** Un paso que falla a medias deja abierto lo que abrió (un diálogo modal, la búsqueda, una ficha) y
    tapa los botones del siguiente: cada `click` de ahí en más vence a los 30 s y el fallo se encadena.
    Se cierra todo para que el siguiente paso falle, si falla, por lo suyo. */
async function reset(page) {
  if (page.isClosed()) return;
  try {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  } catch {}
}

const loaded = (page) => page.waitForSelector('#overlay', { state: 'hidden', timeout: T(20000) });

/** Guarda la vista con el botón de la cámara y revisa el archivo: un PNG con las proporciones de la
    vista (más la franja de abajo) y con dibujo, no un lienzo vacío. Con `dots`, además, en el centro
    de cada uno de esos elementos (los commits de la 2D) la imagen tiene su color. Devuelve cuántos
    colores distintos tiene. */
async function snapshot(page, sel, { minColors = 100, dots = null } = {}) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: T(15000) }), page.click('#snap-btn')]);
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

if (seccion('Escritorio (1280×800)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  let has3d = false;

  await step(page, 'carga la demo', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    has3d = (await page.locator('#graph3d canvas').count()) > 0 && (await page.locator('#graph3d').isVisible());
    if (!has3d) console.log('    (sin WebGL: la app abrió la vista 2D)');
  });

  if (has3d) {
    await step(page, 'el 3D arranca con un solo contexto WebGL y sin rehacer su búfer por el mismo tamaño', async () => {
      // crear un contexto y reasignar el búfer (canvas.width) cuestan en el arranque: la prueba de
      // Graph3D.supported le pasa el suyo al renderer, y resize() solo toca el búfer si cambió el tamaño
      const p = await openPage({ viewport: { width: 1280, height: 800 } });
      try {
        await p.addInitScript(() => {
          const w = (window.__gl = { contexts: 0, same: 0 });
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...a) {
            const c = get.call(this, type, ...a);
            if (c && /webgl/.test(type) && !this.__gl) w.contexts += this.__gl = 1;
            return c;
          };
          // three asigna width y después height; asignar el mismo tamaño también rehace y borra el búfer
          const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
          const hd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
          Object.defineProperty(HTMLCanvasElement.prototype, 'width', { ...wd, set(v) { if (this.__gl) this.__was = [wd.get.call(this), hd.get.call(this)]; wd.set.call(this, v); } });
          Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
            ...hd,
            set(v) {
              if (this.__was && this.__was[0] === wd.get.call(this) && this.__was[1] === v) w.same++;
              this.__was = null;
              hd.set.call(this, v);
            },
          });
        });
        await p.goto(`${base}/index.html?lang=es`);
        await loaded(p);
        await p.waitForTimeout(500); // el primer aviso del ResizeObserver llega después de la carga
        const gl = await p.evaluate(() => window.__gl);
        if (gl.contexts !== 1) throw new Error(`${gl.contexts} contextos WebGL al arrancar (se espera 1)`);
        if (gl.same) throw new Error(`el búfer del 3D se rehízo ${gl.same} vez/veces con el mismo tamaño al arrancar`);
      } finally {
        await p.context().close();
      }
    });
  }

  await step(page, 'llega actividad al panel', async () => {
    await page.waitForSelector('#feed > li', { timeout: T(30000) });
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
    const t = await page.waitForSelector('#toasts .toast:not(.leaving)', { timeout: T(30000) });
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
    // los nodos existen antes de ser «visibles» (entran con animación y, bajo carga, tardan): se espera el estado
    await page.waitForSelector('#graph svg .node', { timeout: T(10000), state: 'attached' });
    await page.waitForFunction(() => !document.querySelector('#graph').hidden && document.querySelector('#view-2d').getAttribute('aria-pressed') === 'true', null, { timeout: T(10000) });
    if (await page.locator('#graph3d').isVisible()) throw new Error('la vista 3D sigue visible');
  });

  await step(page, 'tags y despliegues: banderín en el commit con tag y placa en el de cada entorno', async () => {
    await page.waitForSelector('#graph svg .node .tag-flag', { timeout: T(10000), state: 'attached' });
    await page.waitForSelector('#graph svg .node .env-plate', { timeout: T(10000), state: 'attached' });
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
      await page.waitForSelector('#graph3d', { state: 'visible', timeout: T(5000) });
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
      await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-pressed') === 'true', sel, { timeout: T(5000) });
      await page.waitForTimeout(ms);
      await page.click(sel);
      if ((await pressed()) !== 'false') throw new Error(`${sel} no se apagó`);
    };

    await step(page, 'modo galaxias', () => toggles('#galaxy-btn', 3000));
    await step(page, 'director de cámara', () => toggles('#director-btn', 3000));

    await step(page, 'modo TV (entra y sale)', async () => {
      await page.click('#tv-btn');
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      await page.waitForTimeout(3000); // el director elige planos
      await page.click('#tv-exit');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      if (new URL(page.url()).searchParams.has('tv')) throw new Error('la URL sigue con ?tv');
    });

    await step(page, 'modo TV con teclado: el foco no se pierde y Esc sale', async () => {
      const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
      const tvOn = (v) => page.waitForFunction((on) => document.documentElement.classList.contains('tv') === on, v, { timeout: T(5000) });
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
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
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
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      if (reads > 4) throw new Error(`30 movimientos del ratón leyeron el tema ${reads} veces`);
      if (themed < 2) throw new Error('cambiar data-theme ya no relee el tema');
    });

    const flying = (on) =>
      page.waitForFunction((v) => document.querySelector('#fly-btn')?.getAttribute('aria-pressed') === v, String(on), { timeout: T(5000) });

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
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      const left = await flying(false).then(() => true, () => false);
      await page.click('#tv-exit');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      if (!left) {
        await page.click('#fly-btn');
        throw new Error('el modo TV quedó congelado en el vuelo');
      }
    });
  }

  await step(page, 'replay', async () => {
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: T(5000) });
    await page.waitForTimeout(2500);
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: T(5000) });
  });

  await step(page, 'replay: tramo de fechas y rótulos propios', async () => {
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: T(5000) });
    await page.click('#replay .rp-opts');
    await page.fill('#rp-form [name=title]', 'Sprint 12');
    await page.fill('#rp-form [name=footer]', 'Lanzamiento 2.0');
    await page.click('#rp-form button[type=submit]');
    await page.waitForSelector('#replay .rp-head:not([hidden])', { timeout: T(3000) });
    if ((await page.textContent('#replay .rp-head')) !== 'Sprint 12') throw new Error('el título no se ve en el Replay');
    if ((await page.textContent('#replay .rp-foot')) !== 'Lanzamiento 2.0') throw new Error('el pie de foto no se ve en el Replay');
    // un tramo sin commits avisa y deja el Replay como estaba
    await page.click('#replay .rp-opts');
    await page.fill('#rp-form [name=from]', '1990-01-01');
    await page.fill('#rp-form [name=to]', '1990-01-02');
    await page.click('#rp-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#rp-form .rp-form-msg')?.textContent, null, { timeout: T(3000) });
    if (!(await page.locator('#replay').isVisible())) throw new Error('un tramo vacío cerró el Replay');
    if (!(await page.locator('#replay .rp-head').isVisible())) throw new Error('un tramo vacío borró los rótulos');
    // un tramo que sí abarca la historia (desde 2000) la reproduce
    await page.fill('#rp-form [name=from]', '2000-01-01');
    await page.fill('#rp-form [name=to]', '');
    await page.click('#rp-form button[type=submit]');
    await page.waitForSelector('#rp-form', { state: 'hidden', timeout: T(3000) });
    await page.click('#replay .rp-opts');
    await page.click('#rp-form button[type=reset]');
    await page.waitForSelector('#replay .rp-head', { state: 'hidden', timeout: T(3000) });
    await page.keyboard.press('Escape');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: T(5000) });
  });

  await step(page, 'replay: el enlace con tramo y rótulos arranca solo', async () => {
    await page.goto(`${base}/index.html?lang=es&replay=2000-01-01..&title=Sprint%2012&footer=Lanzamiento%202.0`);
    await loaded(page);
    await page.waitForSelector('#replay', { state: 'visible', timeout: T(8000) });
    if ((await page.textContent('#replay .rp-head')) !== 'Sprint 12') throw new Error('el título del enlace no se ve en el Replay');
    if ((await page.textContent('#replay .rp-foot')) !== 'Lanzamiento 2.0') throw new Error('el pie de foto del enlace no se ve');
    await page.click('#replay .rp-opts');
    if ((await page.inputValue('#rp-form [name=from]')) !== '2000-01-01') throw new Error('el formulario no muestra el tramo del enlace');
    await page.keyboard.press('Escape');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: T(5000) });
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
    await page.waitForSelector('#replay', { state: 'visible', timeout: T(5000) });
    await page.waitForTimeout(2000);
    const hidden = await page.evaluate(() => window.__g3u);
    // la vista que estaba oculta se pone al día al mostrarse
    await page.click('#view-3d');
    const after = await page.evaluate(() => window.__g3u);
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: T(5000) });
    await page.evaluate(() => { window.GB.Graph3D.prototype.update = window.__g3orig; });
    if (hidden > 2) throw new Error(`el Replay actualizó la vista 3D oculta ${hidden} veces`);
    if (after <= hidden) throw new Error('la vista 3D no se puso al día al mostrarse durante el Replay');
  });

  // grabar empieza la historia desde el principio, y al llegar al final el video se guarda solo
  await step(page, 'graba el Replay en video, de principio a fin', async () => {
    const sel = has3d && (await page.locator('#graph3d').isVisible()) ? '#graph3d' : '#graph';
    await page.click('#replay-btn');
    await page.waitForSelector('#replay', { state: 'visible', timeout: T(5000) });
    const rec = page.locator('#replay .rp-rec');
    if (!(await rec.isVisible())) throw new Error('no se ofrece grabar');
    while ((await page.textContent('#replay .rp-speed')) !== '4×') await page.click('#replay .rp-speed');
    await page.waitForTimeout(1500);
    const saved = page.waitForEvent('download', { timeout: T(30000) });
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
    const saved = page.waitForEvent('download', { timeout: T(15000) });
    await rec.click();
    await page.waitForTimeout(2500);
    await rec.click();
    await videoFile(page, await saved, sel, { minSeconds: 1.5, maxSeconds: 5 });
    while ((await page.textContent('#replay .rp-speed')) !== '1×') await page.click('#replay .rp-speed');
    await page.click('#replay .rp-exit');
    await page.waitForSelector('#replay', { state: 'hidden', timeout: T(5000) });
  });

  await step(page, 'ajustes', async () => {
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#settings:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'vitrina de logros', async () => {
    await page.click('#trophy-btn');
    await page.waitForSelector('#trophies[open]', { timeout: T(3000) });
    await page.click('#trophies-close');
    await page.waitForSelector('#trophies:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'salud del repo: listas y ritmo de lo ya cargado, y cada fila lleva a su rama', async () => {
    const open = async () => {
      await page.click('#health-btn');
      await page.waitForSelector('#health[open]', { timeout: T(3000) });
    };
    await open();
    // la sección de CI cuenta los PRs con checks terminados, y en la demo cada commit nuevo deja los de su
    // rama «en curso» de 3,5 a 6 s: si justo lo están todos, sale vacía. El panel no se rehace abierto, así
    // que se reabre hasta que alguno termine (con el equipo cargado los temporizadores de la demo se atrasan)
    for (let i = 0; i < 15 && !(await page.$('#hl-ci .hl-line')); i++) {
      await page.click('#health-close');
      await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: T(3000) });
      await page.waitForTimeout(1000);
      await open();
    }
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
    if (dora.length !== 3) throw new Error(`${dora.length} líneas de entrega (DORA), se esperaban 3: ${dora.join(' | ')}`);
    const weeks = await page.$eval('#hl-weeks', (p) => p.textContent);
    if (!/(\d+ · ){7}\d+$/.test(weeks) || /^(0 · ){7}0$/.test(weeks.split(': ').pop())) throw new Error(`la frecuencia de despliegue por semana no trae 8 cifras con algún release: ${weeks}`);
    const mweeks = await page.$eval('#hl-mergeweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(mweeks) || /^(0 · ){7}0$/.test(mweeks.split(': ').pop())) throw new Error(`la tendencia de merges por semana no trae 8 cifras con algún PR fusionado: ${mweeks}`);
    const oweeks = await page.$eval('#hl-openedweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(oweeks) || /^(0 · ){7}0$/.test(oweeks.split(': ').pop())) throw new Error(`la tendencia de PRs abiertos por semana no trae 8 cifras con algún PR abierto: ${oweeks}`);
    const cweeks = await page.$eval('#hl-closedweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(cweeks) || /^(0 · ){7}0$/.test(cweeks.split(': ').pop())) throw new Error(`la tendencia de issues cerrados por semana no trae 8 cifras con algún issue cerrado: ${cweeks}`);
    const bweeks = await page.$eval('#hl-branchweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(bweeks) || /^(0 · ){7}0$/.test(bweeks.split(': ').pop())) throw new Error(`la tendencia de ramas nuevas por semana no trae 8 cifras con alguna rama creada: ${bweeks}`);
    const kweeks = await page.$eval('#hl-commitweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(kweeks) || /^(0 · ){7}0$/.test(kweeks.split(': ').pop())) throw new Error(`la tendencia de commits por semana no trae 8 cifras con algún commit: ${kweeks}`);
    const aweeks = await page.$eval('#hl-authorweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(aweeks) || /^(0 · ){7}0$/.test(aweeks.split(': ').pop())) throw new Error(`los autores por semana no traen 8 cifras con algún autor: ${aweeks}`);
    if (aweeks.split(': ').pop().split(' · ').some((n, i) => Number(n) > Number(kweeks.split(': ').pop().split(' · ')[i]))) throw new Error(`alguna semana tiene más autores que commits: ${aweeks} frente a ${kweeks}`);
    const nweeks = await page.$eval('#hl-newauthorweeks', (p) => p.textContent).catch(() => '');
    if (!/(\d+ · ){7}\d+$/.test(nweeks) || /^(0 · ){7}0$/.test(nweeks.split(': ').pop())) throw new Error(`los autores nuevos por semana no traen 8 cifras con algún autor nuevo: ${nweeks}`);
    if (nweeks.split(': ').pop().split(' · ').some((n, i) => Number(n) > Number(aweeks.split(': ').pop().split(' · ')[i]))) throw new Error(`alguna semana tiene más autores nuevos que autores distintos: ${nweeks} frente a ${aweeks}`);
    // el factor de ausencia (ítem 202): una sola cifra, al menos 1 y no más que los autores, sin nombres de la demo
    const absence = await page.$eval('#hl-absence', (p) => p.textContent).catch(() => '');
    const absN = absence.match(/:\s*(\d+)\D+(\d+)\D+(\d+)/);
    if (!absN || Number(absN[1]) < 1 || Number(absN[1]) > Number(absN[2]) || Number(absN[2]) > Number(absN[3])) throw new Error(`el factor de ausencia no sale o no cuadra (personas ≤ autores ≤ commits): ${absence}`);
    // las líneas añadidas y borradas por semana (ítem 206): 8 cifras con el separador del idioma, alguna distinta de cero, y sin «calculando» en la demo
    const lines = {};
    for (const k of ['added', 'deleted']) {
      const txt = await page.$eval(`#hl-${k}weeks`, (p) => p.textContent).catch(() => '');
      const nums = txt.split(': ').pop().split(' · ').map((x) => Number(x.replace(/\D/g, '')));
      if (nums.length !== 8 || nums.some((n) => !Number.isFinite(n)) || !nums.some(Boolean) || /undefined|NaN|health\./.test(txt)) throw new Error(`las líneas ${k === 'added' ? 'añadidas' : 'borradas'} por semana no traen 8 cifras con alguna distinta de cero: ${txt}`);
      lines[k] = nums;
    }
    if (lines.added.reduce((a, b) => a + b) <= lines.deleted.reduce((a, b) => a + b)) throw new Error(`la demo borra más líneas de las que añade: ${JSON.stringify(lines)}`);
    if (await page.$('#hl-codepending')) throw new Error('la demo dice que GitHub todavía calcula las líneas por semana');
    const tweeks = await page.$eval('#hl-tagweeks', (p) => p.textContent).catch(() => '');
    if (tweeks && (!/(\d+ · ){7}\d+$/.test(tweeks) || /^(0 · ){7}0$/.test(tweeks.split(': ').pop()))) throw new Error(`la tendencia de tags por semana no trae 8 cifras con algún tag: ${tweeks}`);
    const iweeks = await page.$eval('#hl-issueweeks', (p) => p.textContent).catch(() => '');
    if (iweeks && (!/(\d+ · ){7}\d+$/.test(iweeks) || /^(0 · ){7}0$/.test(iweeks.split(': ').pop()))) throw new Error(`la tendencia de issues abiertos por semana no trae 8 cifras con algún issue: ${iweeks}`);
    const pcweeks = await page.$eval('#hl-prcloseweeks', (p) => p.textContent).catch(() => '');
    if (pcweeks && (!/(\d+ · ){7}\d+$/.test(pcweeks) || /^(0 · ){7}0$/.test(pcweeks.split(': ').pop()))) throw new Error(`la tendencia de PRs cerrados sin fusionar por semana no trae 8 cifras con algún PR: ${pcweeks}`);
    // los forks nuevos por semana (ítem 195): la demo trae un fork de hace unos días, así que la serie sale con 8 cifras y alguna distinta de cero
    const fkweeks = await page.$eval('#hl-forkweeks', (p) => p.textContent).catch(() => '');
    if (!/^Forks nuevos por semana: (\d+ · ){7}\d+$/.test(fkweeks) || /^(0 · ){7}0$/.test(fkweeks.split(': ').pop())) throw new Error(`los forks nuevos por semana no traen 8 cifras con algún fork: «${fkweeks}»`);
    // El periodo de las series por semana se dice una vez, como encabezado del grupo, y no en cada línea (pendiente 12).
    const weekly = await page.evaluate(() => {
      const g = document.querySelector('#hl-weekly[role="group"]');
      const head = g && document.getElementById(g.getAttribute('aria-labelledby'));
      return g && head && { head: head.textContent, lines: [...g.querySelectorAll('.hl-line:not(.hl-weekly-head)')].map((p) => p.textContent) };
    });
    if (!weekly) throw new Error('las series por semana no van en un grupo con su encabezado');
    if (!/\b8\b/.test(weekly.head)) throw new Error(`el encabezado de las series por semana no dice el periodo: ${weekly.head}`);
    const largas = weekly.lines.filter((l) => /\d/.test(l.split(': ')[0]));
    if (weekly.lines.length < 6 || largas.length) throw new Error(`las series por semana repiten el periodo en cada línea: ${largas.join(' | ') || weekly.lines.length + ' líneas'}`);
    const ciLines = await page.$$eval('#hl-ci .hl-line', (ps) => ps.map((p) => p.textContent));
    if (!ciLines.length || ciLines.some((l) => !/\d/.test(l))) throw new Error(`la tasa de fallos de CI no sale en la salud: ${ciLines.join(' | ')}`);
    // el último despliegue de cada entorno de la demo (producción en main y staging, que sigue a develop), con su estado
    const deploys = await page.$$eval('#hl-deploys .hl-list .hl-row', (rs) => rs.map((r) => [r.querySelector('.hl-main').textContent, r.querySelector('.hl-aside').textContent, r.matches('[data-go]')]));
    const envs = deploys.map(([e]) => e).sort().join(',');
    if (envs !== 'production,staging') throw new Error(`los despliegues por entorno no son los de la demo: ${JSON.stringify(deploys)}`);
    const stg = deploys.find(([e]) => e === 'staging');
    if (!/^\S{7} · al día con develop( · |$)/.test(stg[1]) || !stg[2]) throw new Error(`staging no sale al día con develop ni lleva a su rama: ${stg[1]}`);
    const prod = deploys.find(([e]) => e === 'production');
    if (!/ · salió bien( · |$)/.test(prod[1]) || !/ · (falló|en curso)( · |$)/.test(stg[1])) throw new Error(`los despliegues de la demo no dicen si salieron bien, fallaron o siguen en curso: ${JSON.stringify(deploys)}`);
    if (deploys.some(([, a]) => /health\.|\{/.test(a))) throw new Error(`un despliegue sale con una clave cruda: ${JSON.stringify(deploys)}`);
    if (info.stats !== 3) throw new Error(`${info.stats} cifras de ritmo, se esperaban 3`);
    if (!info.rows) throw new Error('la demo tiene PRs abiertos y no salen en la lista');
    const forks = await page.$$eval('#hl-forks a.hl-row[href^="https://"][rel~="noopener"]', (as) => as.map((a) => a.textContent));
    if (forks.length !== 2) throw new Error(`${forks.length} forks activos en el panel, la demo tiene 2: ${forks.join(' | ')}`);
    await page.click('#hl-forks-stars');
    const byStars = await page.$$eval('#hl-forks a.hl-row .hl-aside', (as) => as.map((a) => a.textContent));
    if (!/^★ 4 · /.test(byStars[0] || '') || /★ 0/.test(byStars.join('|'))) throw new Error(`los forks por estrellas no salen del que más tiene: ${byStars.join(' | ')}`);
    if (!(await page.evaluate(() => document.activeElement?.id === 'hl-forks-stars'))) throw new Error('el foco se pierde al ordenar los forks por estrellas');
    await page.click('#hl-forks-stars');
    // la demo trae un fork de hace unos días (y suma otros en vivo): los forks nuevos de la semana frente a la anterior
    const forkTrend = await page.$eval('#hl-forks-trend', (p) => p.textContent).catch(() => '');
    // la semana anterior se compara solo si la actividad cargada llega entera a ella; si no, el panel lo dice
    const fm = /^Forks nuevos: (\d+) esta semana(?: · (\d+) la anterior \(([+−]\d+|±0)\)| \(la anterior no está cargada entera\))$/.exec(forkTrend);
    if (!fm || Number(fm[1]) < 1) throw new Error(`los forks nuevos de la demo no salen en la salud: «${forkTrend}»`);
    await page.click('#hl-forks-toggle');
    const hidden = await page.$$eval('#hl-forks a.hl-row', (as) => as.length);
    if (await page.$('#hl-forks-trend')) throw new Error('el interruptor «Mostrar forks» apagado deja la tendencia de forks');
    if (await page.$('#hl-forkweeks')) throw new Error('el interruptor «Mostrar forks» apagado deja los forks nuevos por semana');
    if (hidden || !(await page.evaluate(() => new URL(location.href).searchParams.get('forks') === '0'))) throw new Error('el interruptor «Mostrar forks» apagado no oculta los forks ni deja forks=0 en la URL');
    if (!(await page.evaluate(() => document.activeElement?.id === 'hl-forks-toggle'))) throw new Error('el foco se pierde al apagar el interruptor de forks');
    await page.click('#hl-forks-toggle');
    if ((await page.$$eval('#hl-forks a.hl-row', (as) => as.length)) !== 2 || (await page.evaluate(() => new URL(location.href).searchParams.has('forks')))) throw new Error('el interruptor «Mostrar forks» encendido no devuelve los 2 forks ni quita forks de la URL');
    if (!(await page.$('#hl-forkweeks'))) throw new Error('el interruptor «Mostrar forks» encendido otra vez no devuelve los forks nuevos por semana');
    if (/undefined|NaN|health\./.test(info.text)) throw new Error('texto sin resolver en el panel: ' + info.text.slice(0, 120));
    // la demo trae una estrella de hace unos días (y suma otras en vivo): la semana actual frente a la anterior
    const stars = await page.$eval('#hl-stars', (s) => s.querySelector('.hl-line')?.textContent || '');
    const sm = /^(\d+) esta semana(?: · (\d+) la anterior \(([+−]\d+|±0)\)| \(la anterior no está cargada entera\))$/.exec(stars);
    if (!sm || Number(sm[1]) < 1) throw new Error(`las estrellas nuevas de la demo no salen en la salud: «${stars}»`);
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    await page.click('#hl-clash-go');
    await page.waitForFunction(() => document.querySelector('#hl-clash-out')?.textContent.trim() && !document.querySelector('#hl-clash-go').disabled, null, { timeout: T(8000) });
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
    if (!/\d( · \d+){6}\n/.test(md)) throw new Error('resumen de la semana sin los commits de cada día: ' + md.slice(0, 160));
    if (/undefined|NaN|digest\./.test(md)) throw new Error('texto sin resolver en el resumen de la semana: ' + md.slice(0, 120));
    // la demo abre un PR con autor en la semana (el del agente): el resumen dice quién abrió más
    const openers = await page.evaluate(() => GB.i18n.t('digest.openers'));
    if (!new RegExp(`\\n${openers.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\S.* \\(\\d+\\)\\n`).test(md)) throw new Error('resumen de la semana sin «quién abrió más»: ' + md.slice(0, 400));
    // y cierra el issue #84 con autor en la semana: dice quién cerró más, debajo de los issues cerrados
    const closers = await page.evaluate(() => GB.i18n.t('digest.closers'));
    const closersAt = md.search(new RegExp(`\\n${closers.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\S.* \\(\\d+\\)\\n`));
    if (closersAt < 0 || md.indexOf('#84') < 0 || closersAt < md.indexOf('#84')) throw new Error('resumen de la semana sin «quién cerró más» debajo de los issues cerrados: ' + md.slice(0, 600));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#digest-save')]);
    if (!/^graphbranch-.*-semana-.*\.md$/.test(dl.suggestedFilename())) throw new Error('nombre del resumen: ' + dl.suggestedFilename());
    const [png] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#digest-png')]);
    if (!/^graphbranch-.*-semana-.*\.png$/.test(png.suggestedFilename())) throw new Error('nombre de la imagen del resumen: ' + png.suggestedFilename());
    const pngPath = await png.path();
    const head = pngPath ? readFileSync(pngPath).subarray(0, 8).toString('hex') : '';
    if (head !== '89504e470d0a1a0a') throw new Error('la imagen del resumen no es un PNG: ' + head);
    const states = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('#hl-prstates .hl-sub')].map((d) => d.querySelector('h4').textContent.trim()),
      inGroups: document.querySelectorAll('#hl-prstates .hl-sub li').length,
      open: document.querySelectorAll('#health .hl-list[data-list="prs"] li').length,
    }));
    if (!states.groups.length || states.inGroups !== states.open || states.groups.some((x) => /undefined|NaN|health\./.test(x))) throw new Error('PRs por estado en la demo: ' + JSON.stringify(states));
    // PRs sin revisión hace más de 7 días: los de la demo son de hace 3, así que la lista sale vacía y con su total en 0
    const unrev = await page.evaluate(() => {
      const box = document.querySelector('#hl-unreviewed');
      return box && { head: box.querySelector('h3')?.textContent.trim() || '', n: box.querySelector('.hl-n')?.textContent.trim(), rows: box.querySelectorAll('li').length, none: !!box.querySelector('.hl-none') };
    });
    if (!unrev || !unrev.head || /undefined|NaN|health\./.test(unrev.head) || unrev.n !== '0' || unrev.rows || !unrev.none) throw new Error('PRs sin revisión en la demo: ' + JSON.stringify(unrev));
    await page.click('#health .hl-list[data-list="prs"] [data-go]');
    await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'bitácora en vivo: la tarjeta del resumen abre el panel, se cierra, se deshace y se descarga', async () => {
    const card = await page.evaluate(() => ({ score: document.querySelector('#st-bitacora-score').textContent, label: document.querySelector('#st-bitacora-label').textContent, aria: document.querySelector('#st-bitacora').getAttribute('aria-label') || '' }));
    if (!/^\d+$/.test(card.score) || !/\d/.test(card.label) || /undefined|NaN|bitacora\./.test(card.aria + card.label)) throw new Error('tarjeta de la bitácora: ' + JSON.stringify(card));
    await page.click('#st-bitacora');
    await page.waitForSelector('#bitacora[open]', { timeout: T(3000) });
    const info = await page.evaluate(() => {
      const d = document.querySelector('#bitacora');
      const w = d.querySelector('.bt-wrap');
      return {
        secs: [...d.querySelectorAll('.bt-sec')].map((x) => x.dataset.sec),
        bars: d.querySelectorAll('.bt-col').length,
        hist: d.querySelectorAll('[data-sec="history"] tbody tr').length,
        eyebrow: d.querySelector('#bt-eyebrow').textContent,
        title: d.querySelector('#bt-title').textContent,
        text: d.textContent,
        overflow: w.scrollWidth - w.clientWidth,
      };
    });
    for (const k of ['big', 'period', 'verdict', 'findings', 'follow', 'timeline', 'next', 'history']) if (!info.secs.includes(k)) throw new Error(`falta la sección ${k}: ${info.secs.join(', ')}`);
    if (!info.bars || info.hist !== 4 || !info.title.trim() || !/5/.test(info.eyebrow)) throw new Error('panel de la bitácora: ' + JSON.stringify({ ...info, text: undefined }));
    if (/undefined|NaN|bitacora\.|status\./.test(info.text)) throw new Error('texto sin resolver en la bitácora: ' + info.text.slice(0, 160));
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    // cerrarla guarda la n.º 5 y empieza la 6; deshacer la devuelve
    await page.click('#bt-close-btn');
    await page.waitForFunction(() => document.querySelectorAll('#bitacora [data-sec="history"] tbody tr').length === 5 && /6/.test(document.querySelector('#bt-eyebrow').textContent), null, { timeout: T(3000) });
    if (await page.isHidden('#bt-undo')) throw new Error('cerrar la bitácora no ofrece deshacer');
    await page.click('#bt-undo');
    await page.waitForFunction(() => document.querySelectorAll('#bitacora [data-sec="history"] tbody tr').length === 4 && /5/.test(document.querySelector('#bt-eyebrow').textContent), null, { timeout: T(3000) });
    const [md] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#bt-save')]);
    if (!/^graphbranch-demo-bitacora-.*\.md$/.test(md.suggestedFilename())) throw new Error('nombre de la bitácora en Markdown: ' + md.suggestedFilename());
    const mdText = readFileSync(await md.path(), 'utf8');
    if (!/^# .+\n/.test(mdText) || !/\n## 08 · /.test(mdText) || /undefined|NaN|bitacora\./.test(mdText)) throw new Error('Markdown de la bitácora: ' + mdText.slice(0, 160));
    const [js] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#bt-json')]);
    if (!/^graphbranch-demo-bitacora-.*\.json$/.test(js.suggestedFilename())) throw new Error('nombre del estado.json: ' + js.suggestedFilename());
    const st = JSON.parse(readFileSync(await js.path(), 'utf8'));
    if (st.esquema !== 1 || st.bitacora !== 5 || st.historial?.length !== 5 || st.anteriores?.length !== 4 || !st.nota?.total) throw new Error('estado.json de la bitácora: ' + JSON.stringify(st).slice(0, 200));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#bitacora:not([open])', { state: 'attached', timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'st-bitacora'))) throw new Error('al cerrar el panel, el foco no vuelve a la tarjeta');
  });

  await step(page, 'prompt del loop autónomo: se arma con el repo, el objetivo y la rama de release, y se guarda', async () => {
    await page.click('#loop-btn');
    await page.waitForSelector('#loop-prompt[open]', { timeout: T(3000) });
    await page.fill('#lp-repo', 'acme/orbita');
    await page.fill('#lp-integration', 'dev');
    await page.fill('#lp-release', 'main');
    await page.fill('#lp-goal', 'Un panel de envíos para bodegas.');
    const info = await page.evaluate(() => ({
      text: document.querySelector('#lp-text').value,
      size: document.querySelector('#lp-size').textContent,
      overflow: (() => { const f = document.querySelector('#lp-form'); return f.scrollWidth - f.clientWidth; })(),
      saved: Object.keys(localStorage).filter((k) => k.includes('loopPrompt')).length,
    }));
    for (const want of ['`acme/orbita`', 'origin/dev', '`main`', 'Un panel de envíos para bodegas.', '@acme', 'LOOP.md']) if (!info.text.includes(want)) throw new Error(`el prompt no lleva ${want}`);
    if (/\$\{|undefined|NaN/.test(info.text) || /undefined|NaN|loopPrompt\./.test(info.size)) throw new Error('prompt a medio armar: ' + info.size + ' ' + info.text.slice(0, 80));
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    if (info.saved) throw new Error('lo escrito en la demo no debería guardarse');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#lp-save')]);
    if (!/^graphbranch-acme-orbita-loop-.*\.md$/.test(dl.suggestedFilename())) throw new Error('nombre del prompt guardado: ' + dl.suggestedFilename());
    if (readFileSync(await dl.path(), 'utf8') !== info.text) throw new Error('el .md guardado no es el prompt que se ve');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#loop-prompt:not([open])', { state: 'attached', timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'loop-btn'))) throw new Error('al cerrar, el foco no vuelve al botón');
    // también se llega desde la bitácora
    await page.click('#st-bitacora');
    await page.waitForSelector('#bitacora[open]', { timeout: T(3000) });
    await page.click('#bt-loop');
    await page.waitForSelector('#loop-prompt[open]', { timeout: T(3000) });
    if (await page.evaluate(() => document.querySelector('#bitacora').open)) throw new Error('la bitácora sigue abierta debajo del prompt');
    await page.click('#lp-close');
    await page.waitForSelector('#loop-prompt:not([open])', { state: 'attached', timeout: T(3000) });
  });

  // la región viva dice al abrir los tags, releases y forks; si la demo publica antes de leerla ya dice «Novedades»
  await step(page, 'vista de texto: árbol con teclado, nombres accesibles y Enter lleva al grafo', () => quieta(page, async () => {
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: T(3000) });
    const info = await page.evaluate(() => {
      const d = document.querySelector('#textview');
      const tree = d.querySelector('[role="tree"]');
      const items = [...d.querySelectorAll('[role="treeitem"]')];
      return {
        tree: !!tree,
        treeHelp: tree && document.getElementById(tree.getAttribute('aria-describedby') || '-')?.textContent.trim(),
        bodyDescribed: document.querySelector('#textview-body').hasAttribute('aria-describedby'),
        branches: d.querySelectorAll('.tv-branch').length,
        unnamed: items.filter((n) => !n.getAttribute('aria-label')).length,
        focusInTree: tree && tree.contains(document.activeElement),
        text: d.textContent,
        overflow: d.querySelector('.tr-wrap').scrollWidth - d.querySelector('.tr-wrap').clientWidth,
      };
    });
    if (!info.tree || info.branches < 2) throw new Error(`árbol incompleto: ${info.branches} ramas`);
    if (info.unnamed) throw new Error(`${info.unnamed} nodos sin nombre accesible`);
    if (!info.treeHelp || info.bodyDescribed) throw new Error(`las teclas del árbol no se describen en el árbol: ${JSON.stringify({ help: info.treeHelp, body: info.bodyDescribed })}`);
    if (!info.focusInTree) throw new Error('al abrir, el foco no está en el árbol');
    if (/undefined|NaN|textview\./.test(info.text)) throw new Error('texto sin resolver: ' + info.text.slice(0, 120));
    if (info.overflow > 1) throw new Error(`el panel se desborda ${info.overflow}px`);
    // la marca «CI fallando» de una rama (si la demo tiene alguna con el CI en rojo) también está en su nombre accesible
    const ciMarks = await page.evaluate(() => [...document.querySelectorAll('#textview .tv-ci-fail')].map((n) => ({ tag: n.textContent.replace(/^✗\s*/, ''), label: n.closest('[role="treeitem"]').getAttribute('aria-label') })));
    for (const m of ciMarks) if (!m.tag || !m.label.includes(m.tag)) throw new Error('«CI fallando» no está en el nombre accesible: ' + JSON.stringify(m));
    // las marcas de una rama y la nota de un commit ya van en el nombre accesible de su nodo: no se leen dos veces
    const loud = await page.evaluate(() => [...document.querySelectorAll('#textview [role="treeitem"][aria-label] :is(.tv-tag, .tv-aside)')].filter((n) => !n.closest('[aria-hidden="true"]')).map((n) => n.className + ': ' + n.textContent));
    if (loud.length) throw new Error('marcas que el lector leería dos veces (sin aria-hidden): ' + loud.slice(0, 3).join(' | '));
    // los commits con tag lo dicen en su nombre accesible («tag v1.0.0») y la región viva cuenta cuántos hay al abrir
    const marks = await page.evaluate(() => {
      const commits = [...document.querySelectorAll('#textview .tv-commit')];
      return {
        marked: commits.filter((n) => /\bv\d/.test(n.querySelector('.tv-aside').textContent)).length,
        named: commits.filter((n) => /\b(tag|release) v\d/.test(n.getAttribute('aria-label'))).length,
        released: commits.filter((n) => /\brelease v\d/.test(n.getAttribute('aria-label'))).length,
        live: document.querySelector('#textview-live').textContent,
      };
    });
    if (marks.marked !== marks.named) throw new Error(`commits con tag sin decirlo en su nombre accesible: ${marks.marked} vs ${marks.named}`);
    // la demo publica v1.4.0 como release sobre un commit con ese tag: se dice «release» en su nombre y la región viva lo cuenta
    if (!marks.released || !/Commits con release: \d+(\. PRs abiertos con CI fallando: \d+)?(\. Forks activos: \d+)?$/.test(marks.live)) throw new Error(`el release de la demo no se dice (${marks.released}): ${marks.live}`);
    if (marks.marked && !/^Commits con tag: \d+/.test(marks.live)) throw new Error('la región viva no cuenta los commits con tag: ' + marks.live);
    // los 2 forks activos de la demo salen como lista de enlaces aparte del árbol, el más reciente primero, y la región viva los cuenta
    const forks = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#textview .tv-forks a.tv-fork[href^="https://"][rel~="noopener"]')].map((a) => a.getAttribute('aria-label')),
      inTree: !!document.querySelector('#textview [role="tree"] .tv-forks'),
      live: document.querySelector('#textview-live').textContent,
    }));
    if (forks.rows.length !== 2 || !/^maya-dev\/orbita, /.test(forks.rows[0]) || !/^lucas-r\/orbita, /.test(forks.rows[1]) || forks.inTree) throw new Error('la vista de texto no lista los 2 forks de la demo: ' + JSON.stringify(forks));
    if (!/Forks activos: 2$/.test(forks.live)) throw new Error('la región viva no cuenta los forks: ' + forks.live);
    // los PRs abiertos ya cargados se dicen en el nombre accesible de su rama («PRs abiertos: n») y coinciden con el chip visible
    const prs = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('#textview .tv-branch')];
      const named = bs.filter((n) => /PRs abiertos: \d+/.test(n.getAttribute('aria-label')));
      return { named: named.length, chips: bs.filter((n) => /PRs abiertos: \d+/.test(n.querySelector('.tv-head').textContent)).length, total: bs.reduce((a, n) => a + (Number((n.getAttribute('aria-label').match(/PRs abiertos: (\d+)/) || [])[1]) || 0), 0) };
    });
    if (!prs.named || prs.named !== prs.chips || !prs.total) throw new Error('la vista de texto no dice los PRs abiertos de cada rama: ' + JSON.stringify(prs));
    // la demo trae todos sus PRs abiertos: cada rama que no es la por defecto, sin PR abierto y sin fusionar lo dice
    // («sin PR abierto») en su nombre accesible, y ninguna con PRs abiertos, fusionada o la por defecto lo dice. Que haya
    // alguna así depende de la demo: a esta altura a veces ya abrió PR para todas (con la demo quieta y ninguna mal
    // marcada, falló 3 veces así); la regla, con datos fijos, está en tools/textview.test.mjs
    const noPr = await page.$$eval('#textview .tv-branch', (bs) => bs.map((n) => n.getAttribute('aria-label')).map((l) => ({ l, says: /, sin PR abierto,/.test(l), should: !/, rama por defecto|, PRs abiertos: \d+|, fusionada/.test(l) })));
    const badNoPr = noPr.filter((r) => r.says !== r.should);
    if (badNoPr.length) throw new Error('la vista de texto no dice qué ramas no tienen PR abierto: ' + JSON.stringify(badNoPr.slice(0, 3).map((r) => r.l)));
    // cada rama dice en su nombre accesible quién hizo el commit de su punta, el mismo autor que dice su primer commit
    const tips = await page.$$eval('#textview .tv-branch', (bs) => bs.map((n) => ({ branch: n.dataset.branch, label: n.getAttribute('aria-label'), first: n.querySelector('.tv-commit')?.getAttribute('aria-label') || '' })));
    // el autor del primer commit (la punta) sale de su nombre «mensaje, de Autor, hace…» y la rama lo dice entero, seguido de una coma
    const badTips = tips.filter((r) => !r.first || !r.first.split(', ').some((p) => p.startsWith('de ') && r.label.includes(`, último commit ${p}, `)));
    if (!tips.length || badTips.length) throw new Error('la vista de texto no dice el autor de la punta de cada rama: ' + JSON.stringify(badTips.slice(0, 3)));
    // la historia de la demo es de los últimos días: ninguna rama está quieta (la que sí, en «Vista de texto: ramas quietas»)
    const quiet = await page.$$eval('#textview .tv-branch', (bs) => bs.filter((n) => /sin actividad/.test(n.getAttribute('aria-label') + n.querySelector('.tv-head').textContent)).map((n) => n.dataset.branch));
    if (quiet.length) throw new Error('la vista de texto dice sin actividad ramas de la demo con commits de esta semana: ' + quiet.join(', '));
    // una rama ya fusionada en la por defecto lo dice en su nombre y con una marca (la demo no deja ninguna sin borrar:
    // el árbol se monta aparte con una historia fija, sin tocar la de la página)
    const mergedBr = await page.evaluate(() => {
      const c = (sha, parents, date) => [sha, { sha, parents, message: sha, date, author: { name: 'Ana' } }];
      const data = { repo: { defaultBranch: 'main' }, commits: new Map([c('a', [], 1), c('b', ['a'], 2), c('m', ['b', 'f'], 4), c('f', ['b'], 3), c('g', ['m'], 5)]), branches: new Map([['main', { name: 'main', sha: 'm', isDefault: true }], ['hecha', { name: 'hecha', sha: 'f' }], ['viva', { name: 'viva', sha: 'g' }]]) };
      const box = document.createElement('div');
      const view = GB.textview.mount(box, { text: (k, p) => GB.i18n.t(k, p), ago: () => "", onGo() {} });
      view.render(GB.textview.build(data, { now: 6 }));
      return [...box.querySelectorAll('.tv-branch')].map((n) => ({ b: n.dataset.branch, label: /fusionada en la rama por defecto/.test(n.getAttribute('aria-label')), chip: /fusionada en la rama por defecto/.test(n.querySelector('.tv-head').textContent) }));
    });
    const gotMerged = mergedBr.filter((m) => m.label || m.chip);
    if (gotMerged.length !== 1 || gotMerged[0].b !== 'hecha' || !gotMerged[0].label || !gotMerged[0].chip) throw new Error('la vista de texto no dice la rama fusionada: ' + JSON.stringify(mergedBr));
    // los PRs abiertos con el CI en rojo salen en una lista aparte del árbol (árbol montado aparte, con PRs fijos): el de
    // url https es un enlace, el otro solo texto, el título entra como texto y la región viva los cuenta
    const ciPulls = await page.evaluate(() => {
      const c = (sha, parents, date) => [sha, { sha, parents, message: sha, date, author: { name: 'Ana' } }];
      const data = { repo: { defaultBranch: 'main' }, commits: new Map([c('a', [], 1), c('f', ['a'], 2)]), branches: new Map([['main', { name: 'main', sha: 'a', isDefault: true }], ['roja', { name: 'roja', sha: 'f' }]]), ci: new Map([['roja', 'failure']]),
        pulls: new Map([[12, { number: 12, title: '<img src=x onerror=alert(1)> arregla', head: 'roja', sameRepo: true, url: 'https://github.com/o/r/pull/12' }], [13, { number: 13, title: 'sin enlace', head: 'roja', sameRepo: true, url: null }], [14, { number: 14, title: 'verde', head: 'main', sameRepo: true, ci: 'success' }]]) };
      const box = document.createElement('div');
      const live = document.createElement('div');
      const view = GB.textview.mount(box, { text: (k, p) => GB.i18n.t(k, p), ago: () => "", onGo() {}, live });
      view.render(GB.textview.build(data, { now: 6 }));
      const sec = box.querySelector('.tv-cipulls');
      return { h: sec?.querySelector('h3')?.textContent, labelled: sec?.getAttribute('aria-labelledby') === sec?.querySelector('h3')?.id, rows: [...(sec?.querySelectorAll('li > .tv-cipull') || [])].map((n) => ({ tag: n.tagName, href: n.getAttribute('href'), rel: n.getAttribute('rel'), txt: n.querySelector('.tv-name').textContent })), img: box.querySelectorAll('img').length, inTree: !!box.querySelector('[role="tree"] .tv-cipulls'), live: live.textContent };
    });
    if (ciPulls.h !== 'PRs abiertos con CI fallando: 2' || !ciPulls.labelled || ciPulls.inTree || ciPulls.img || ciPulls.rows.length !== 2) throw new Error('la vista de texto no lista los PRs con CI fallido: ' + JSON.stringify(ciPulls));
    if (ciPulls.rows[0].tag !== 'SPAN' || ciPulls.rows[0].txt !== '#13 sin enlace, rama roja' || ciPulls.rows[1].tag !== 'A' || ciPulls.rows[1].href !== 'https://github.com/o/r/pull/12' || !/noopener/.test(ciPulls.rows[1].rel) || ciPulls.rows[1].txt !== '#12 <img src=x onerror=alert(1)> arregla, rama roja') throw new Error('los PRs con CI fallido no salen como deben: ' + JSON.stringify(ciPulls.rows));
    if (!/PRs abiertos con CI fallando: 2$/.test(ciPulls.live)) throw new Error('la región viva no cuenta los PRs con CI fallido: ' + ciPulls.live);
    // y en la demo: si hay algún PR abierto con el CI en rojo, su lista dice cuántos son y trae esas filas, fuera del árbol
    const demoCi = await page.evaluate(() => ({ rows: document.querySelectorAll('#textview .tv-cipulls .tv-cipull').length, h: document.querySelector('#textview .tv-cipulls h3')?.textContent || '', inTree: !!document.querySelector('#textview [role="tree"] .tv-cipulls') }));
    if (demoCi.h && (demoCi.inTree || !/^PRs abiertos con CI fallando: \d+$/.test(demoCi.h) || Math.min(Number(demoCi.h.match(/\d+$/)[0]), 20) !== demoCi.rows)) throw new Error('la lista de PRs con CI fallido de la demo no coincide con su título: ' + JSON.stringify(demoCi));
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
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: T(3000) });
  }));

  // cuenta las ramas antes y después de cada tecla: una rama nueva de la demo a mitad lo descuadra
  await step(page, 'vista de texto: H oculta una rama, S la deja sola y el foco y el aviso siguen en el árbol', () => quieta(page, async () => {
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: T(3000) });
    const names = () => page.$$eval('#textview .tv-branch', (bs) => bs.map((n) => n.dataset.branch));
    const before = await names();
    if (before.length < 3) throw new Error('la demo trae menos de 3 ramas: ' + before.join(', '));
    const target = before[1];
    const btns = await page.$$eval(`#textview .tv-branch[data-branch="${target}"] .tv-act`, (bs) => bs.map((b) => b.getAttribute('aria-label')));
    const defBtns = await page.$$eval('#textview .tv-branch:first-child .tv-act', (bs) => bs.length);
    if (btns.length !== 2 || btns.some((l) => !l || !l.includes(target)) || defBtns) throw new Error('botones de ocultar mal: ' + JSON.stringify({ btns, defBtns }));
    await page.evaluate((n) => document.querySelector(`#textview .tv-branch[data-branch="${n}"]`).focus(), target);
    await page.keyboard.press('h');
    const after = await names();
    const st = await page.evaluate(() => ({ live: document.querySelector('#textview-live').textContent, scope: document.querySelector('#textview-scope').textContent, hiddenScope: document.querySelector('#textview-scope').hidden, inTree: !!document.activeElement.closest('#textview [role="tree"]'), url: location.search }));
    if (after.includes(target) || after.length !== before.length - 1) throw new Error('H no oculta la rama: ' + JSON.stringify({ before, after }));
    if (!st.live.includes(target) || st.hiddenScope || !st.scope || !st.inTree || !st.url.includes('ocultar=')) throw new Error('H no avisa, no deja el foco en el árbol o no actualiza la nota: ' + JSON.stringify(st));
    // «solo esta» sobre la siguiente, y repetirlo las vuelve a mostrar todas (menos la oculta antes, que sigue oculta)
    const other = after[1];
    await page.evaluate((n) => document.querySelector(`#textview .tv-branch[data-branch="${n}"]`).focus(), other);
    await page.keyboard.press('s');
    const solo = await names();
    if (solo.length !== 2 || !solo.includes(other)) throw new Error('S no deja la rama sola: ' + solo.join(', '));
    await page.keyboard.press('s');
    if ((await names()).length !== before.length) throw new Error('repetir S no vuelve a mostrar las ramas');
    // «Ver todas las ramas»: oculta sin botón visible; con una rama oculta aparece, y la tecla A y el botón las devuelven
    const showAll = () => page.evaluate(() => ({ hidden: document.querySelector('#textview-showall').hidden, inTree: !!document.activeElement.closest('#textview [role="tree"]'), live: document.querySelector('#textview-live').textContent }));
    if (!(await showAll()).hidden) throw new Error('«Ver todas las ramas» se ve sin ramas ocultas');
    await page.evaluate((n) => document.querySelector(`#textview .tv-branch[data-branch="${n}"]`).focus(), target);
    await page.keyboard.press('h');
    const hid = await showAll();
    if (hid.hidden || (await names()).length !== before.length - 1) throw new Error('con una rama oculta no aparece «Ver todas las ramas»: ' + JSON.stringify(hid));
    await page.keyboard.press('a');
    const viaKey = await showAll();
    if ((await names()).length !== before.length || !viaKey.hidden || !viaKey.inTree || !viaKey.live) throw new Error('A no vuelve a mostrar todas las ramas o pierde el foco: ' + JSON.stringify(viaKey));
    await page.keyboard.press('h');
    await page.click('#textview-showall');
    const viaBtn = await showAll();
    if ((await names()).length !== before.length || !viaBtn.hidden || !viaBtn.inTree || new URL(page.url()).search.includes('ocultar=')) throw new Error('el botón no vuelve a mostrar todas las ramas: ' + JSON.stringify(viaBtn));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: T(3000) });
    await page.evaluate(() => document.querySelector('#branch-view-reset').click()); // la demo vuelve a verse entera para lo que sigue
  }));

  await step(page, 'vista de texto: filtra por rama y avisa en la región viva de lo nuevo sin repetir', async () => {
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: T(3000) });
    const live = await page.evaluate(() => {
      const l = document.querySelector('#textview-live');
      return { role: l.getAttribute('role'), polite: l.getAttribute('aria-live'), text: l.textContent };
    });
    if (live.role !== 'status' || live.polite !== 'polite') throw new Error('la región viva no es role=status polite');
    if (live.text && !/^Commits con tag: \d+(\. Commits con release: \d+)?(\. PRs abiertos con CI fallando: \d+)?(\. Forks activos: \d+)?$/.test(live.text)) throw new Error('al abrir, la región viva ya anuncia algo más que los tags y releases: ' + live.text);
    // filtro: un nombre que no existe vacía el árbol; el de la primera rama lo deja con esa rama
    const first = await page.evaluate(() => document.querySelector('#textview .tv-branch').dataset.branch);
    await page.fill('#textview-filter', 'zzz-no-existe');
    if (await page.locator('#textview .tv-branch').count()) throw new Error('el filtro no oculta las ramas que no coinciden');
    await page.fill('#textview-filter', first.slice(0, 3).toUpperCase());
    const kept = await page.evaluate(() => [...document.querySelectorAll('#textview .tv-branch')].map((n) => n.dataset.branch));
    if (!kept.includes(first)) throw new Error(`el filtro quitó la rama ${first}: ${kept.join(', ')}`);
    await page.fill('#textview-filter', '');
    // la demo trae commits cada 3 a 7 s: la región viva avisa de los nuevos, una sola vez cada uno
    await page.waitForFunction(() => /^Novedades: \d+ ramas, \d+ commits$/.test(document.querySelector('#textview-live').textContent), null, { timeout: T(20000) });
    const said = await page.evaluate(() => document.querySelector('#textview-live').textContent);
    if (/undefined|NaN|textview\./.test(said)) throw new Error('texto sin resolver en la región viva: ' + said);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#textview [role="treeitem"]')].filter((n) => !n.getAttribute('aria-label')).length);
    if (unnamed) throw new Error(`${unnamed} nodos sin nombre accesible tras la actualización en vivo`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'paleta de comandos: Ctrl+K abre la lista, filtra con teclado, Enter acciona y Esc cierra', async () => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cmdk[open]', { timeout: T(3000) });
    const first = await page.evaluate(() => ({
      focus: document.activeElement?.id === 'cmdk-input',
      opts: document.querySelectorAll('#cmdk .ck-opt').length,
      name: !!document.querySelector('#cmdk-input').getAttribute('aria-label') && !/cmdk\./.test(document.querySelector('#cmdk-input').getAttribute('aria-label')),
      text: document.querySelector('#cmdk').textContent,
    }));
    if (!first.focus) throw new Error('al abrir, el foco no está en el campo de la paleta');
    if (first.opts < 5) throw new Error(`la paleta lista ${first.opts} acciones`);
    if (!first.name || /cmdk\./.test(first.text)) throw new Error('texto sin resolver en la paleta');
    await page.fill('#cmdk-input', 'zzzz-no-existe');
    if (await page.evaluate(() => document.querySelectorAll('#cmdk .ck-opt').length)) throw new Error('sin coincidencias no debería listar nada');
    await page.fill('#cmdk-input', '');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cmdk:not([open])', { state: 'attached', timeout: T(3000) });
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cmdk[open]', { timeout: T(3000) });
    await page.fill('#cmdk-input', await page.evaluate(() => document.querySelector('#search-btn').getAttribute('aria-label')));
    await page.keyboard.press('Enter');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    if (await page.evaluate(() => document.querySelector('#cmdk').open)) throw new Error('la paleta sigue abierta tras accionar');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'barra superior: tres grupos y un botón que abre la paleta de comandos, con su atajo a la vista', async () => {
    const bar = await page.evaluate(() => ({
      seps: document.querySelectorAll('.controls > .ctl-sep').length,
      kbd: document.querySelector('#cmdk-kbd')?.textContent || '',
      kbdShown: !!document.querySelector('#cmdk-kbd')?.checkVisibility?.(),
      name: document.querySelector('#cmdk-btn')?.getAttribute('aria-label') || '',
    }));
    if (bar.seps !== 2) throw new Error(`la barra tiene ${bar.seps} separadores (se esperan 2: en vivo · explorar · preferencias)`);
    if (!bar.kbdShown || !/K$/.test(bar.kbd)) throw new Error(`el atajo no se ve junto al botón: «${bar.kbd}»`);
    if (!bar.name || /cmdk\./.test(bar.name)) throw new Error(`el botón de la paleta sin nombre traducido: «${bar.name}»`);
    await page.click('#cmdk-btn');
    await page.waitForSelector('#cmdk[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'cmdk-input'))) throw new Error('al abrir con el botón, el foco no está en el campo');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cmdk:not([open])', { state: 'attached', timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'cmdk-btn'))) throw new Error('al cerrar, el foco no vuelve al botón de la paleta');
  });

  await step(page, 'panel de actividad: su borde se mueve con el teclado y el ratón, se pliega a una franja que cuenta lo nuevo y se recuerda', async () => {
    const width = () => page.evaluate(() => Math.round(document.querySelector('#feed-panel').getBoundingClientRect().width));
    const stored = (k) => page.evaluate((key) => localStorage.getItem('graphbranch:' + key), k);
    const w0 = await width();
    await page.focus('#feed-resize');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const w1 = await width();
    if (Math.abs(w1 - (w0 + 48)) > 2) throw new Error(`dos flechas a la izquierda: ${w0} → ${w1} px (se esperaban ${w0 + 48})`);
    const now = await page.evaluate(() => Number(document.querySelector('#feed-resize').getAttribute('aria-valuenow')));
    if (Math.abs(now - w1) > 2) throw new Error(`aria-valuenow dice ${now} y el panel mide ${w1}`);
    await page.keyboard.press('Home');
    if (Math.abs((await width()) - 280) > 2 || (await stored('feedWidth')) !== '280') throw new Error(`Inicio no lo deja en 280 px ni lo recuerda: ${await width()} px, guardado ${await stored('feedWidth')}`);
    await page.dblclick('#feed-resize');
    if (Math.abs((await width()) - 370) > 2 || (await stored('feedWidth')) !== null) throw new Error(`doble clic no vuelve al ancho de siempre: ${await width()} px`);
    // con el ratón: el borde se arrastra 100 px hacia el grafo
    const r = await page.$eval('#feed-resize', (e) => e.getBoundingClientRect().toJSON());
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 - 100, r.y + r.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(document.querySelector('#feed-panel').getBoundingClientRect().width - 470) <= 4, null, { timeout: T(3000) });
    await page.dblclick('#feed-resize');
    // plegado: una franja angosta, el grafo más ancho y lo que llega en vivo contado en la franja
    const g0 = await page.evaluate(() => document.querySelector('#graph-panel').getBoundingClientRect().width);
    await page.click('#feed-fold');
    const folded = await page.evaluate(() => ({
      on: document.querySelector('.main').classList.contains('feed-folded'),
      w: document.querySelector('#feed-panel').getBoundingClientRect().width,
      list: document.querySelector('#feed').checkVisibility(),
      expanded: document.querySelector('#feed-fold').getAttribute('aria-expanded'),
      graph: document.querySelector('#graph-panel').getBoundingClientRect().width,
    }));
    if (!folded.on || folded.w > 60 || folded.list || folded.expanded !== 'false') throw new Error(`el panel no se pliega: ${JSON.stringify(folded)}`);
    if (folded.graph < g0 + 250) throw new Error(`el grafo no gana el ancho del panel: ${Math.round(g0)} → ${Math.round(folded.graph)} px`);
    if ((await stored('feedFolded')) !== 'true') throw new Error('el panel plegado no se recuerda');
    await page.waitForFunction(() => /^\+\d+$/.test(document.querySelector('#feed-unseen').textContent) && !document.querySelector('#feed-unseen').hidden, null, { timeout: T(20000) });
    await page.click('#feed-fold');
    const back = await page.evaluate(() => ({ list: document.querySelector('#feed').checkVisibility(), unseen: document.querySelector('#feed-unseen').hidden, expanded: document.querySelector('#feed-fold').getAttribute('aria-expanded') }));
    if (!back.list || !back.unseen || back.expanded !== 'true') throw new Error(`el panel no vuelve entero: ${JSON.stringify(back)}`);
    if ((await stored('feedFolded')) !== null) throw new Error('desplegado, el panel sigue guardado como plegado');
  });

  await step(page, 'salud del repo: en pantalla ancha, sus secciones en dos columnas', async () => {
    await page.click('#health-btn');
    await page.waitForSelector('#health[open] #health-body .hl-sec', { timeout: T(5000) });
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#health-body > .hl-sec')].map((s) => Math.round(s.getBoundingClientRect().left))).size);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: T(3000) });
    if (cols < 2) throw new Error(`las secciones de la salud están en ${cols} columna`);
  });

  await step(page, 'avisos en mazo: el más nuevo entero y los anteriores asomando detrás, desplegados con el puntero', async () => {
    await page.mouse.move(5, 5);
    await page.evaluate(() => document.activeElement?.blur());
    // la demo trae actividad cada 3 a 7 s y un aviso común dura 6: se espera a tener dos a la vez
    await page.waitForFunction(() => document.querySelectorAll('#toasts .toast:not(.leaving)').length >= 2, null, { timeout: T(45000) });
    // el aviso de atrás se pliega con una transición de max-height (0,25 s): bajo carga se medía a medio plegar
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast:not(.leaving)')].every((t) => t.dataset.depth === '0' || t.getBoundingClientRect().height <= 20), null, { timeout: T(2000) }).catch(() => {});
    const deck = await page.evaluate(() => {
      const ts = [...document.querySelectorAll('#toasts .toast:not(.leaving)')];
      return { depths: ts.map((t) => t.dataset.depth), back: ts.filter((t) => t.dataset.depth !== '0').map((t) => Math.round(t.getBoundingClientRect().height)), front: Math.round(ts.find((t) => t.dataset.depth === '0')?.getBoundingClientRect().height || 0) };
    });
    if (deck.depths.filter((d) => d === '0').length !== 1) throw new Error(`profundidades: ${deck.depths.join(',')} (se espera un solo aviso al frente)`);
    if (deck.front < 40 || deck.back.some((h) => h > 20)) throw new Error(`el mazo no se pliega: al frente ${deck.front} px, detrás ${deck.back.join(', ')} px`);
    await page.hover('#toasts .toast[data-depth="0"]');
    // desplegado: los de atrás vuelven a su alto (o ya se fueron, que también vale)
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast:not(.leaving):not([data-depth="0"])')].every((t) => t.getBoundingClientRect().height > 30), null, { timeout: T(3000) });
    await page.mouse.move(5, 5);
  });

  await step(page, 'paleta de comandos: escribir el nombre de una rama o el SHA de un commit ofrece saltar a él, sin consultas', async () => {
    const reqs = [];
    const onReq = (r) => reqs.push(r.url());
    page.on('request', onReq);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cmdk[open]', { timeout: T(3000) });
    await page.fill('#cmdk-input', 'develop');
    const branch = await page.evaluate(() => [...document.querySelectorAll('#cmdk .ck-opt')].map((n) => n.textContent));
    if (!branch.some((x) => x.includes('develop') && !/cmdk\./.test(x))) throw new Error(`sin salto a la rama develop: ${JSON.stringify(branch)}`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#cmdk:not([open])', { state: 'attached', timeout: T(3000) });
    page.off('request', onReq);
    if (reqs.some((u) => /api\.github\.com|\/repos\//.test(u))) throw new Error(`el salto hizo consultas: ${reqs.join(' ')}`);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cmdk[open]', { timeout: T(3000) });
    await page.fill('#cmdk-input', 'zzzz-no-existe');
    if (await page.evaluate(() => document.querySelectorAll('#cmdk .ck-opt').length)) throw new Error('una consulta sin rama ni SHA no debería ofrecer saltos');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cmdk:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'búsqueda de commits: por mensaje y por autor, con teclado, y Enter vuela al commit', async () => {
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
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
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
  });

  // compara las etiquetas con el filtro y sin él: con la demo quieta, ninguna rama nueva se mezcla en la cuenta
  await step(page, 'filtro por autor: el grafo y el árbol de texto muestran solo sus ramas, lo dice y se quita', () => quieta(page, async () => {
    await page.click('#view-2d');
    const count = () => page.evaluate(() => document.querySelectorAll('#graph svg .head').length);
    // bajo carga el grafo aún reparte ramas: se espera a que el conteo quede quieto antes de tomarlo como base
    let all = await count();
    for (let quiet = 0, i = 0; quiet < 3 && i < 40; i++) {
      await page.waitForTimeout(250);
      const n = await count();
      quiet = n === all && n > 0 ? quiet + 1 : 0;
      all = n;
    }
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const options = await page.evaluate(() => [...document.querySelectorAll('#graph-author option')].map((o) => o.value));
    // el autor que deja menos ramas a la vista (tiene que dejar alguna menos que todas)
    let best = null;
    for (const who of options.filter(Boolean)) {
      await page.selectOption('#graph-author', who);
      await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length < n, all, { timeout: T(4000) }).catch(() => {}); // las ramas salen con su transición, más lenta bajo carga
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
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
    const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('graphbranch:author:')).length);
    if (!saved) throw new Error('el filtro por autor no se guardó por repo');
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: T(3000) });
    const tree = await page.evaluate(() => document.querySelectorAll('#textview-body [role="treeitem"][data-branch], #textview-body > [role="tree"] > [role="treeitem"]').length);
    const scope = await page.evaluate(() => ({ note: document.querySelector('#textview-scope').textContent, hidden: document.querySelector('#textview-scope').hidden, live: document.querySelector('#textview-live').textContent }));
    if (scope.hidden || !scope.note || !scope.live.startsWith(scope.note) || /undefined|NaN|textview\./.test(scope.note)) throw new Error('la vista de texto no dice el filtro por autor: ' + JSON.stringify(scope));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: T(3000) });
    if (!tree) throw new Error('el árbol de texto quedó vacío con el filtro por autor');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.selectOption('#graph-author', '');
    // las ramas vuelven con su transición, más lenta bajo carga; se compara con el filtrado, que tiene que quedar por debajo
    await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length > n, best.n, { timeout: T(10000) }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('#search-btn').classList.contains('filtered') && !document.querySelector('#graph-author-status').textContent, null, { timeout: T(3000) }).catch(() => {});
    const off = await page.evaluate(() => ({ mark: document.querySelector('#search-btn').classList.contains('filtered'), status: document.querySelector('#graph-author-status').textContent }));
    const back = await count();
    if (off.mark || off.status || back <= best.n) throw new Error(`quitar el filtro no deja el grafo como estaba (${back} etiquetas, con el filtro ${best.n}, antes ${all})`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
    await page.click('#textview-btn');
    await page.waitForSelector('#textview[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => document.querySelector('#textview-scope').hidden && !/^Filtrado/.test(document.querySelector('#textview-live').textContent)))) throw new Error('sin filtro, la vista de texto sigue diciendo uno');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#textview:not([open])', { state: 'attached', timeout: T(3000) });
  }));

  await step(page, 'filtro por ruta: atenúa los commits que no la tocaron, lo dice y se quita', async () => {
    await page.click('#view-2d');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una ruta');
    await page.fill('#search-path', word);
    await page.press('#search-path', 'Enter');
    await page.waitForSelector('#search-path-clear:not([hidden])', { timeout: T(3000) });
    const on = await page.evaluate(() => ({
      dim: document.querySelectorAll('#graph svg .node.pfx').length,
      all: document.querySelectorAll('#graph svg .node').length,
      status: document.querySelector('#search-path-status').textContent,
      mark: document.querySelector('#search-btn').classList.contains('filtered'),
    }));
    if (!on.dim || on.dim >= on.all) throw new Error(`el filtro no acota: ${on.dim} atenuados de ${on.all}`);
    if (!on.status || /undefined|NaN|search\./.test(on.status) || !on.mark) throw new Error('sin aviso del filtro: ' + on.status);
    await page.click('#search-path-clear');
    await page.waitForFunction(() => !document.querySelectorAll('#graph svg .node.pfx').length, null, { timeout: T(3000) }).catch(() => {});
    const off = await page.evaluate(() => ({ dim: document.querySelectorAll('#graph svg .node.pfx').length, mark: document.querySelector('#search-btn').classList.contains('filtered') }));
    if (off.dim || off.mark) throw new Error('quitar el filtro no deja el grafo como estaba');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
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
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    await page.fill('#search-path', word);
    await page.press('#search-path', 'Enter');
    await page.waitForSelector('#search-path-clear:not([hidden])', { timeout: T(3000) });
    await page.click('#search-path-clear');
    const calls = await page.evaluate(() => window.__g3path);
    if (calls.length !== 2 || !(calls[0] > 0) || calls[1] !== null) throw new Error('el grafo 3D no recibió el filtro por ruta: ' + JSON.stringify(calls));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'ocultar una rama o dejarla sola: desde su ficha, lo dice, se guarda por repo y un botón las vuelve a mostrar', async () => {
    await page.keyboard.press('Escape'); // ninguna ficha abierta de antes
    await page.click('#view-2d');
    // por nombre y sin las etiquetas que se están yendo (`.exit`): la demo sigue publicando y borrando ramas
    const names = () => page.evaluate(() => [...document.querySelectorAll('#graph svg .head:not(.exit)')].map((h) => h.__name));
    // se espera la desaparición de las ramas concretas, no un conteo: la demo puede sumar una rama mientras otra se oculta
    const gone = async (what, going) => {
      try {
        await page.waitForFunction((g) => ![...document.querySelectorAll('#graph svg .head:not(.exit)')].some((h) => g.includes(h.__name)), going, { timeout: T(5000) });
      } catch {
        throw new Error(`${what}: las etiquetas ${going.join(', ')} no se fueron (ahora ${(await names()).join(', ')})`);
      }
    };
    const all = await names();
    const hideBtn = await openBranchTip(page, '.tip-hide');
    const hidden = await hideBtn.getAttribute('data-branch');
    await hideBtn.click();
    await gone('ocultar «' + hidden + '»', [hidden]);
    const hid = await names();
    const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('graphbranch:bview:')).length);
    if (!saved) throw new Error('las ramas ocultas no se guardaron por repo');
    const soloBtn = await openBranchTip(page, '.tip-solo');
    const solo = await soloBtn.getAttribute('data-branch');
    await soloBtn.click();
    // la rama por defecto se queda siempre (no se oculta)
    const def = await page.evaluate(() => [...document.querySelectorAll('#graph svg .head.default')].map((h) => h.__name));
    await gone('dejar sola «' + solo + '»', hid.filter((n) => n !== solo && !def.includes(n)));
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const on = await page.evaluate(() => ({ status: document.querySelector('#branch-view-status').textContent, mark: document.querySelector('#search-btn').classList.contains('filtered'), reset: !document.querySelector('#branch-view-reset').hidden }));
    if (!on.status || /undefined|NaN|branchview\./.test(on.status) || !on.mark || !on.reset) throw new Error('sin aviso de las ramas ocultas: ' + JSON.stringify(on));
    await page.click('#branch-view-reset');
    await page.waitForFunction((b) => [...document.querySelectorAll('#graph svg .head:not(.exit)')].some((h) => h.__name === b), hidden, { timeout: T(5000) });
    const off = await page.evaluate(() => ({ status: document.querySelector('#branch-view-status').textContent, mark: document.querySelector('#search-btn').classList.contains('filtered'), keys: Object.keys(localStorage).filter((k) => k.startsWith('graphbranch:bview:')).length, focus: document.activeElement?.id }));
    if (off.status || off.mark || off.keys || off.focus !== 'graph-author') throw new Error('«Ver todas» no deja el grafo como estaba: ' + JSON.stringify(off));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'vista de un PR: la ficha de una rama con PR muestra su descripción y comentarios al pulsar, sin consultar api.github.com', async () => {
    await page.keyboard.press('Escape');
    await page.click('#view-2d');
    const heads = await page.$$('#graph svg .head[role=button]');
    let btn = null;
    for (const h of heads) {
      await h.focus();
      await page.keyboard.press('Enter');
      btn = await page.$('#graph .tip .tip-prview');
      if (btn) break;
      await page.keyboard.press('Escape');
    }
    if (!btn) throw new Error('ninguna ficha de rama con PR trae «Ver descripción y comentarios»');
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#graph .tip .tip-prbody .pv-list li', { timeout: T(5000) });
    const r = await page.evaluate(() => ({
      expanded: document.querySelector('.tip-prview').getAttribute('aria-expanded'),
      body: document.querySelector('.tip-prbody .pv-body').textContent,
      n: document.querySelectorAll('.tip-prbody .pv-list li').length,
      focus: document.activeElement?.className,
    }));
    if (r.expanded !== 'true' || !r.body.trim() || !r.n || r.focus !== 'tip-prview') throw new Error('vista del PR rota: ' + JSON.stringify(r));
    if (/undefined|NaN|prview\./.test(r.body)) throw new Error('texto sin resolver: ' + r.body);
    await page.keyboard.press('Enter');
    const hidden = await page.$eval('.tip-prbody', (b) => b.hidden);
    if (!hidden) throw new Error('pulsarlo otra vez no esconde la vista del PR');
    await page.keyboard.press('Escape');
  });

  await step(page, 'cambios de un commit: desde su ficha, con teclado se pasa al anterior y se vuelve, y Esc cierra', async () => {
    await page.keyboard.press('Escape'); // ninguna ficha abierta de antes
    await page.click('#view-2d');
    const btn = await openBranchTip(page, '.tip-diff');
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#diff-panel:not([hidden]) .df-file', { timeout: T(5000) });
    const read = () =>
      page.evaluate(() => {
        const p = document.querySelector('#diff-panel');
        return {
          focus: document.activeElement?.id,
          msg: p.querySelector('.df-msg').textContent,
          sha: p.querySelector('.df-meta code')?.textContent,
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
    if (!/^[0-9a-f]{7}$/.test(first.sha || '')) throw new Error(`la ficha no muestra el sha corto: ${first.sha}`);
    if (!first.files || !first.lines) throw new Error(`sin archivos o sin líneas: ${first.files} archivos, ${first.lines} líneas`);
    if (/undefined|NaN|diff\./.test(first.sum)) throw new Error('texto sin resolver: ' + first.sum);
    if (first.feed !== 'none') throw new Error('el panel de actividad sigue a la vista junto a los cambios');
    if (first.sel !== 1) throw new Error(`el grafo marca ${first.sel} commits como el que se ve`);
    if (first.unnamed) throw new Error(`${first.unnamed} botones sin nombre`);
    if (first.overflow > 0) throw new Error(`la página se desborda ${first.overflow}px`);
    // por el sha y no por el mensaje: la demo saca los mensajes de una lista corta y un commit puede llevar
    // el mismo que su padre, y entonces esperar a que el mensaje cambie vence aunque el panel ya avanzó
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((sha) => document.querySelector('#diff-panel .df-meta code')?.textContent !== sha && !document.querySelector('#diff-panel').classList.contains('loading'), first.sha, { timeout: T(5000) });
    const older = await read();
    if (!older.files) throw new Error('el commit anterior llegó sin archivos');
    // el anterior ya está guardado: volver es inmediato, sin esperar a la red
    await page.keyboard.press('k');
    const back = await read();
    if (back.sha !== first.sha) throw new Error(`K no volvió al commit de donde se vino: ${back.sha} ${back.msg}`);
    if (back.loading) throw new Error('volver a un commit ya visto no debería esperar');
    // con el botón «anterior» hasta el primer commit cargado: al deshabilitarse, el foco no sale del panel
    await page.focus('#diff-panel .df-older');
    for (let i = 0; i < 40 && !(await page.$eval('#diff-panel .df-older', (b) => b.disabled)); i++) {
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#diff-panel').classList.contains('loading'), null, { timeout: T(5000) });
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

  await step(page, 'historial de un archivo: un botón del diff aplica el filtro por ruta a ese archivo y lo deja en la URL', async () => {
    const wait = (what, p) => p.catch((err) => {
      throw new Error(`${what}: ${err.message.split('\n')[0]}`);
    });
    await page.click('#view-2d');
    // el paso anterior dejó el grafo en el primer commit cargado: con unos minutos de demo, las etiquetas de rama
    // quedan fuera de la vista (display: none), el foco no llega a ninguna y Enter no abre su ficha
    await page.focus('#graph');
    await page.keyboard.press('End');
    await wait('las etiquetas de rama a la vista', page.waitForFunction(() => [...document.querySelectorAll('#graph svg .head[role=button]:not(.exit)')].some((h) => getComputedStyle(h).display !== 'none'), null, { timeout: T(3000) }));
    // la ficha de una rama vigente y a la vista (la demo borra ramas fusionadas: una etiqueta puede estar saliendo)
    let btn = null;
    const shownHeads = [];
    for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) if (await h.isVisible()) shownHeads.push(h);
    for (const h of shownHeads.slice(0, 6)) {
      await h.focus();
      await page.keyboard.press('Enter');
      btn = await page.waitForSelector('#graph .tip:not([hidden]) .tip-diff', { timeout: T(1000) }).catch(() => null);
      if (btn) break;
      await page.keyboard.press('Escape');
    }
    if (!btn) throw new Error('la ficha de la rama: ninguna de las primeras 6 ramas a la vista abrió su ficha con Ver cambios');
    await btn.focus();
    await page.keyboard.press('Enter');
    await wait('el panel de cambios', page.waitForSelector('#diff-panel:not([hidden]) .df-file', { timeout: T(5000) }));
    // con localizadores y no con el elemento: si la demo vuelve a dibujar el panel, se busca otra vez
    const file = page.locator('#diff-panel .df-file').first();
    await file.evaluate((d) => (d.open = true)); // el primero ya suele venir abierto: un clic lo cerraría
    const hist = file.locator('.df-history');
    await wait('el botón Historial', hist.waitFor({ timeout: T(5000) }));
    if (!/\S/.test((await hist.getAttribute('aria-label')) || '') || /diff\.|undefined/.test(await hist.textContent())) throw new Error('el botón Historial no tiene nombre');
    // la ruta y el clic en un solo paso: si la demo vuelve a dibujar el panel entre los dos, «el primer archivo» sería otro
    await wait('el clic en Historial', hist.waitFor({ state: 'visible', timeout: T(5000) }));
    const path = await hist.evaluate((b) => {
      const p = b.closest('.df-file').querySelector('.df-path').textContent.split(' → ').pop();
      b.click();
      return p;
    });
    await wait('el filtro por ruta', page.waitForSelector('#search-path-clear:not([hidden])', { state: 'attached', timeout: T(5000) }));
    const on = await page.evaluate(() => ({ value: document.querySelector('#search-path').value, url: location.search }));
    if (on.value !== path) throw new Error(`el filtro quedó en «${on.value}», no en «${path}»`);
    if (!on.url.includes('path=')) throw new Error('el historial no dejó la ruta en la URL: ' + on.url);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.click('#search-path-clear');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#search:not([open])', { state: 'attached', timeout: T(3000) });
    await page.keyboard.press('Escape');
  });


  await step(page, 'quién tocó un archivo: el botón del diff lista los últimos commits con su autor, y otro clic lo cierra', async () => {
    // el panel puede seguir cargando el commit que abrió el paso anterior: al llegar, rehace sus archivos (pendiente 1 de
    // la iteración 259: con un localizador, el segundo clic caía en el botón nuevo, abría su lista y el paso fallaba)
    await page.waitForFunction(() => !document.querySelector('#diff-panel').classList.contains('loading'), null, { timeout: T(5000) });
    const file = page.locator('#diff-panel .df-file').first();
    await file.evaluate((d) => (d.open = true));
    await file.locator('.df-blame').waitFor({ timeout: T(5000) });
    // los dos clics, al mismo botón y a su misma lista: si la demo vuelve a dibujar el panel en el medio, el
    // segundo sigue siendo sobre la lista que abrió el primero
    const btn = await file.locator('.df-blame').elementHandle();
    const log = await btn.evaluateHandle((b) => b.closest('.df-file').querySelector('.df-blamelog'));
    if (!/\S/.test((await btn.getAttribute('aria-label')) || '') || /diff\.|undefined/.test(await btn.textContent())) throw new Error('el botón no tiene nombre');
    await btn.click({ timeout: T(5000) });
    await page.waitForFunction((l) => l.querySelector('.df-blamelist li'), log, { timeout: T(5000) }).catch(() => {
      throw new Error('no apareció ningún commit: sin lista');
    });
    if ((await btn.getAttribute('aria-expanded')) !== 'true') throw new Error('aria-expanded no pasó a true');
    const row = await log.evaluate((l) => l.querySelector('.df-blamelist li').textContent);
    if (/undefined|diff\./.test(row) || row.trim().length < 5) throw new Error('fila vacía o con claves: ' + row);
    if (!/\d+\D+\d+/.test(await log.evaluate((l) => l.querySelector('.df-blamelist li .df-blame-lines')?.textContent || ''))) throw new Error('la demo no mostró tramos de líneas');
    const after = await btn.evaluate((b, l) => {
      b.click();
      return { hidden: l.hidden, expanded: b.getAttribute('aria-expanded') };
    }, log);
    if (!after.hidden) throw new Error('el segundo clic no cerró la lista');
    if (after.expanded !== 'false') throw new Error('aria-expanded no volvió a false');
  });
  await step(page, 'cambios de un commit: un clic en el grafo cambia de commit, lado a lado con palabras marcadas, filtro y panel ancho', async () => {
    // cada espera dice cuál fue si vence (la corrida larga trae mucha historia de la demo y lo recorta)
    const wait = (what, p) => p.catch((err) => {
      throw new Error(`${what}: ${err.message.split('\n')[0]}`);
    });
    await page.keyboard.press('Escape');
    // el paso anterior dejó el grafo en el primer commit: vuelve a lo último, donde están las etiquetas de rama
    await page.focus('#graph');
    await page.keyboard.press('End');
    // (se desplaza con una transición: las etiquetas aparecen al llegar)
    await wait('las etiquetas de rama a la vista', page.waitForFunction(() => [...document.querySelectorAll('#graph svg .head[role=button]:not(.exit)')].some((h) => getComputedStyle(h).display !== 'none'), null, { timeout: T(3000) }));
    // la ficha de una rama vigente y a la vista (la demo borra ramas fusionadas: una etiqueta puede estar saliendo)
    let tipDiff = null;
    const shownHeads = [];
    for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) if (await h.isVisible()) shownHeads.push(h);
    for (const h of shownHeads.slice(0, 6)) {
      await h.focus();
      await page.keyboard.press('Enter');
      tipDiff = await page.waitForSelector('#graph .tip:not([hidden]) .tip-diff', { timeout: T(1000) }).catch(() => null);
      if (tipDiff) break;
      await page.keyboard.press('Escape');
    }
    if (!tipDiff) throw new Error('la ficha de la rama: ninguna de las primeras 6 ramas abrió su ficha con Ver cambios');
    await tipDiff.focus();
    await page.keyboard.press('Enter');
    await wait('el panel al abrir', page.waitForSelector('#diff-panel:not([hidden]) .df-file', { timeout: T(5000) }));
    const idle = () => wait('el panel cargando', page.waitForFunction(() => !document.querySelector('#diff-panel').classList.contains('loading'), null, { timeout: T(5000) }));
    await idle();
    // con el panel abierto, un clic en un merge (4 archivos en la demo) muestra sus cambios, no su ficha: uno que
    // esté en la historia cargada ahora (la demo recorta la vieja) y que no esté saliendo
    const clickMerge = () =>
      page.evaluate(() => {
        const data = [...document.querySelectorAll('#graph svg .node.merge:not(.exit)')].filter((m) => m.__sha);
        const m = data[data.length - 1];
        m?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return m ? m.__sha.slice(0, 7) : null;
      });
    const atSha = (sha, what) => wait(what, page.waitForFunction((s) => document.querySelector('#diff-panel .df-meta code')?.textContent === s, sha, { timeout: T(5000) }));
    const merge = await clickMerge();
    if (!merge) throw new Error('el grafo no dibuja ningún merge de la demo');
    await atSha(merge, `el clic en el merge ${merge}`);
    await idle();
    if (await page.locator('#graph .tip.pinned:not([hidden])').count()) throw new Error('el clic abrió la ficha en vez de cambiar los cambios');
    const files = await page.locator('#diff-panel .df-jump').count();
    if (files < 4) throw new Error(`el merge trae ${files} archivos`);
    // lado a lado: dos columnas por fila, se recuerda
    await page.click('#diff-panel .df-splitb');
    const split = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#diff-panel .df-code.df-split .dl-row')];
      return { rows: rows.length, two: rows.every((r) => r.querySelectorAll('.dl-side').length === 2), saved: localStorage.getItem('graphbranch:diffMode'), unified: document.querySelectorAll('#diff-panel .df-code:not(.df-split)').length };
    });
    if (!split.rows || !split.two || split.unified) throw new Error('lado a lado no dibujó dos columnas por fila: ' + JSON.stringify(split));
    if (split.saved !== '"split"') throw new Error(`el modo no se recuerda: ${split.saved}`);
    // las palabras cambiadas se marcan (la demo retoca las líneas que quita): se busca en los commits vecinos
    let marks = await page.locator('#diff-panel .dw').count();
    for (let i = 0; i < 12 && !marks && !(await page.$eval('#diff-panel .df-older', (b) => b.disabled)); i++) {
      await page.click('#diff-panel .df-older');
      await idle();
      await page.locator('#diff-panel .df-file').first().evaluate((d) => d.parentElement.querySelectorAll('.df-file').forEach((x) => (x.open = true)));
      marks = await page.locator('#diff-panel .dw').count();
    }
    if (!marks) throw new Error('ninguna palabra cambiada marcada en 12 commits de la demo');
    // filtro por ruta (desde 4 archivos): se vuelve a un merge con el clic
    const back = await clickMerge();
    if (!back) throw new Error('el merge ya no está en el grafo');
    await atSha(back, `el clic de vuelta en el merge ${back}`);
    await idle();
    await wait('el filtro (4 archivos)', page.waitForSelector('#diff-panel .df-ffield:not([hidden])', { timeout: T(5000) }));
    const first = await page.$eval('#diff-panel .df-jump .df-jpath', (n) => n.textContent);
    const q = first.split('/').pop();
    await page.fill('#diff-panel .df-filter', q);
    const filtered = await page.evaluate(() => ({
      list: [...document.querySelectorAll('#diff-panel .df-files li')].filter((li) => !li.hidden).length,
      secs: [...document.querySelectorAll('#diff-panel .df-file')].filter((s) => !s.hidden).length,
      count: document.querySelector('#diff-panel .df-fcount').textContent,
    }));
    if (filtered.list < 1 || filtered.list >= files || filtered.secs !== filtered.list) throw new Error('el filtro no deja solo lo que coincide: ' + JSON.stringify(filtered));
    if (!/\d/.test(filtered.count) || /\{|undefined/.test(filtered.count)) throw new Error(`la cuenta del filtro dice «${filtered.count}»`);
    await page.press('#diff-panel .df-filter', 'Escape'); // Esc con texto lo borra, sin cerrar el panel
    if (await page.$eval('#diff-panel', (p) => p.hidden)) throw new Error('Esc en el filtro cerró el panel');
    if (await page.$eval('#diff-panel .df-filter', (i) => i.value)) throw new Error('Esc no borró el filtro');
    // plegar y desplegar todo
    await page.click('#diff-panel .df-all');
    const allOpen = await page.$$eval('#diff-panel .df-file', (s) => s.map((x) => x.open));
    await page.click('#diff-panel .df-all');
    const allShut = await page.$$eval('#diff-panel .df-file', (s) => s.map((x) => x.open));
    if (allOpen.some((o) => o !== allOpen[0]) || allShut.some((o) => o === allOpen[0])) throw new Error(`plegar todo: ${allOpen} → ${allShut}`);
    // panel ancho: el código gana lugar y el grafo queda como guía
    const w = () => page.evaluate(() => [document.querySelector('.graph-panel').offsetWidth, document.querySelector('#diff-panel').offsetWidth]);
    const [g0, d0] = await w();
    await page.click('#diff-panel .df-wide');
    await page.waitForFunction(() => document.querySelector('.main').classList.contains('diff-wide'), null, { timeout: T(3000) });
    const [g1, d1] = await w();
    if (!(d1 > d0 && g1 < g0)) throw new Error(`el panel ancho no ensanchó: ${d0}→${d1}, grafo ${g0}→${g1}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) throw new Error(`la página se desborda ${over}px`);
    // lo elegido se deja como estaba para los pasos que siguen
    await page.click('#diff-panel .df-wide');
    await page.click('#diff-panel .df-unified');
    await page.keyboard.press('Escape');
    if (!(await page.$eval('#diff-panel', (p) => p.hidden))) await page.click('#diff-panel .df-close');
    if (await page.evaluate(() => document.querySelector('.main').classList.contains('diff-wide'))) throw new Error('al cerrar, la vista queda con el ancho del panel');
  });

  await step(page, 'editar el código: desde los cambios de un commit se abre su archivo en la rama, se cambia y el commit llega al grafo con sus cambios', async () => {
    await page.keyboard.press('Escape');
    await page.click('#view-2d');
    // a lo último, donde están las etiquetas de rama, y la ficha de una vigente y a la vista
    await page.focus('#graph');
    await page.keyboard.press('End');
    await page.waitForFunction(() => [...document.querySelectorAll('#graph svg .head[role=button]:not(.exit)')].some((h) => getComputedStyle(h).display !== 'none'), null, { timeout: T(3000) });
    let tipDiff = null;
    const shownHeads = [];
    for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) if (await h.isVisible()) shownHeads.push(h);
    for (const h of shownHeads.slice(0, 6)) {
      await h.focus();
      await page.keyboard.press('Enter');
      tipDiff = await page.waitForSelector('#graph .tip:not([hidden]) .tip-diff', { timeout: T(1000) }).catch(() => null);
      if (tipDiff) break;
      await page.keyboard.press('Escape');
    }
    if (!tipDiff) throw new Error('ninguna rama a la vista abrió su ficha con Ver cambios');
    // sin guardar handles: la demo vuelve a dibujar la ficha y el panel, y un handle viejo ya no está en el DOM
    await page.focus('#graph .tip:not([hidden]) .tip-diff');
    await page.keyboard.press('Enter');
    const editSel = '#diff-panel .df-file[open] .df-edit';
    await page.waitForSelector(editSel, { timeout: T(5000) });
    const label = await page.getAttribute(editSel, 'aria-label');
    const branchOf = await page.$eval('#diff-panel .df-branch', (n) => n.textContent).catch(() => '');
    await page.click(editSel, { timeout: T(5000) });
    await page.waitForSelector('#editor[open]', { timeout: T(3000) });
    await page.waitForFunction(() => {
      const a = document.querySelector('#editor-text');
      return a && !a.readOnly && a.value.length > 0;
    }, null, { timeout: T(5000) });
    const opened = await page.evaluate(() => ({
      path: document.querySelector('#editor-path').value,
      branch: document.querySelector('#editor-branch').value,
      msg: document.querySelector('#editor-message').value,
      save: document.querySelector('#editor .ed-save').disabled,
      sum: document.querySelector('#editor .ed-sum').textContent,
      settings: !document.querySelector('#editor .ed-settings').hidden,
    }));
    if (!label || !label.includes(opened.path)) throw new Error(`el botón Editar no nombra su archivo: ${label}`);
    if (branchOf && !branchOf.includes(opened.branch)) throw new Error(`abrió la rama ${opened.branch} y el commit es ${branchOf}`);
    if (!opened.save || opened.settings) throw new Error('sin cambios no se puede hacer commit, y la demo no pide token: ' + JSON.stringify(opened));
    if (!opened.msg.includes(opened.path) || /\{|undefined/.test(opened.msg + opened.sum)) throw new Error('el mensaje propuesto: ' + JSON.stringify(opened));
    const before = await page.$eval('#editor-text', (a) => a.value);
    await page.fill('#editor-text', before + '// editado desde GraphBranch\n');
    const sum = await page.textContent('#editor .ed-sum');
    if (!/\+1\b/.test(sum)) throw new Error(`el resumen no cuenta la línea agregada: ${sum}`);
    // cerrar con cambios sin guardar pregunta; se puede seguir editando
    page.once('dialog', (d) => d.dismiss());
    await page.click('#editor .ed-cancel');
    if (!(await page.$eval('#editor', (d) => d.open))) throw new Error('cerró sin preguntar por los cambios sin guardar');
    await page.click('#editor .ed-save');
    await page.waitForSelector('#editor .ed-note[data-kind="ok"]', { timeout: T(5000) });
    const note = await page.textContent('#editor .ed-note');
    if (/\{|undefined/.test(note)) throw new Error(`aviso sin resolver: ${note}`);
    await page.click('#editor .ed-close'); // ya guardado: cierra sin preguntar
    await page.waitForSelector('#editor:not([open])', { state: 'attached', timeout: T(3000) });
    // el commit nuevo está entre los siguientes del que se veía (la demo pudo sumar otro a la rama mientras tanto):
    // se avanza hasta él, y sus cambios son los de verdad
    for (let i = 0; i < 6 && (await page.textContent('#diff-panel .df-msg')) !== opened.msg; i++) {
      await page.waitForFunction(() => !document.querySelector('#diff-panel .df-newer').disabled, null, { timeout: T(5000) });
      const was = await page.textContent('#diff-panel .df-msg');
      await page.focus('#diff-panel .df-newer');
      await page.keyboard.press('Enter');
      // una señal y no 200 ms: bajo carga el commit siguiente tarda en cargar, y un segundo Enter sobre el panel a
      // medio cambiar se pasaba del commit buscado (el panel queda en uno más nuevo y el mensaje nunca coincide)
      await page.waitForFunction((w) => {
        const m = document.querySelector('#diff-panel .df-msg')?.textContent;
        return m && m !== w && !document.querySelector('#diff-panel.loading');
      }, was, { timeout: T(5000) });
    }
    await page.waitForFunction((m) => document.querySelector('#diff-panel .df-msg')?.textContent === m, opened.msg, { timeout: T(5000) });
    await page.waitForSelector('#diff-panel:not(.loading) .df-file .dl-add', { timeout: T(5000) });
    const diff = await page.evaluate(() => ({ files: [...document.querySelectorAll('#diff-panel .df-jump .df-jpath')].map((n) => n.textContent), added: [...document.querySelectorAll('#diff-panel .dl-add .lc')].map((n) => n.textContent) }));
    if (diff.files.length !== 1 || diff.files[0] !== opened.path) throw new Error('el commit del editor cambió otros archivos: ' + diff.files.join(', '));
    if (!diff.added.includes('// editado desde GraphBranch')) throw new Error('sus cambios no son los escritos: ' + diff.added.join(' | '));
    const feed = await page.textContent('#feed');
    if (!feed.includes(opened.msg)) throw new Error('el commit no llegó al panel de actividad');
    await page.keyboard.press('Escape');
  });

  await step(page, 'cambia a árabe en vivo (derecha a izquierda)', async () => {
    await page.selectOption('#lang-select', 'ar');
    await page.waitForFunction(() => document.documentElement.dir === 'rtl', null, { timeout: T(5000) });
    await loaded(page);
    await page.selectOption('#lang-select', 'es');
    await page.waitForFunction(() => document.documentElement.dir !== 'rtl', null, { timeout: T(5000) });
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
      await page.waitForSelector('#overlay:not([hidden])', { timeout: T(5000) });
      await page.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'error', null, { timeout: T(10000) });
      const stats = await page.$$eval('.stat-value', (els) => els.map((e) => e.textContent.trim()));
      if (stats.slice(0, 3).some((v) => v !== '–')) throw new Error(`quedan cifras del repo anterior: ${stats.join(', ')}`);
      // sin datos propios, el Replay no tiene nada que reproducir (antes reproducía la demo)
      await page.click('#replay-btn');
      await page.waitForTimeout(500);
      if (await page.locator('#replay').isVisible()) throw new Error('el Replay reproduce el repo anterior');
    },
    { allow: /status of 404/ },
  );

  await step(
    page,
    'un repo vacío (409 «Git Repository is empty») se rotula «Repo vacío» y no reintenta cada pocos segundos',
    async () => {
      await page.unroute('https://api.github.com/**');
      await page.route('https://api.github.com/**', (r) => {
        const path = new URL(r.request().url()).pathname;
        if (/^\/repos\/acme\/vacio\/(commits|branches)/.test(path)) return r.fulfill({ status: 409, json: { message: 'Git Repository is empty.' } });
        if (path === '/repos/acme/vacio') return r.fulfill({ json: { name: 'vacio', owner: { login: 'acme' }, default_branch: 'main', html_url: 'https://github.com/acme/vacio' } });
        if (path.endsWith('/events')) return r.fulfill({ json: [] });
        return r.fulfill({ status: 404, json: { message: 'Not Found' } });
      });
      await page.fill('#repo-input', 'acme/vacio');
      await page.press('#repo-input', 'Enter');
      await page.waitForFunction(() => document.querySelector('#status-text')?.textContent === 'Repo vacío', null, { timeout: T(10000) });
      const { sub, title } = await page.$eval('#status', (el) => ({ sub: el.querySelector('#status-sub').textContent, title: el.title }));
      if (!/vacío/.test(title)) throw new Error(`el detalle no dice que está vacío: «${title}»`);
      // sin token, el reintento es de 5 minutos (unos 300 s), no los 5 s del primer fallo de red
      const secs = Number((sub.match(/(\d+)\s*s/) || [])[1]);
      if (!/min/.test(sub) && !(secs > 120)) throw new Error(`reintenta demasiado pronto: «${sub}»`);
      // el aviso de repo vacío, no la tarjeta de error con «Reintentar»
      const ov = await page.$eval('#overlay', (o) => ({ kind: o.dataset.kind, text: o.textContent }));
      if (ov.kind !== 'empty' || !/todavía no tiene commits/.test(ov.text)) throw new Error(`el overlay no dice que el repo está vacío: ${ov.kind} «${ov.text.trim()}»`);
    },
    { allow: /status of (404|409)/ },
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
      if (el.closest('[hidden], .sr-only, [aria-hidden=true], #graph3d, .graph-wrap')) continue; // .graph-wrap: el grafo 2D y los de la vista conjunta
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
  // las escrituras aparte: `calls` anota también los GET del sondeo en vivo, y una lectura en la ventana de un
  // paso parecía una escritura (falló así «editar sin token» en la 172 y el 2026-11-01, a carga 7 a 12 en 4 CPU)
  const writes = [];
  let n = 0;
  const sha = (s) => createHash('sha1').update(s).digest('hex');
  /** `at` (ms) fecha el commit a mano, para una rama sin actividad hace semanas; sin él, ahora. */
  const commit = (r, branch, message, at = null) => {
    const parent = r.branches.get(branch) || null;
    const id = sha(`${r.full}:${++n}`);
    const date = new Date(at ?? Date.now() - (parent ? 0 : 3600e3) + n).toISOString();
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
  const repoEvents = new Map(); // /repos/{full}/events: el más reciente primero
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
    if (!rest) return { body: { name, owner: { login: owner }, default_branch: 'main', html_url: `https://github.com/${m[1]}`, private: false, description: '', open_issues_count: r.openItems ?? 0, stargazers_count: r.stars ?? 0, forks_count: r.forks ?? 0 } }; // GitHub cuenta issues y PRs juntos
    if (rest === '/branches') return { body: [...r.branches].map(([b, s]) => ({ name: b, commit: { sha: s }, protected: false })) };
    if (rest === '/pulls' && m[1] === 'o/b') {
      const pr = (number, title, draft, extra = {}) => ({ number, title, html_url: `https://github.com/o/b/pull/${number}`, state: 'open', draft, head: { ref: 'main', repo: { full_name: 'o/b' } }, base: { ref: 'main' }, user: { login: 'bea', avatar_url: null }, created_at: new Date(Date.now() - number * 60000).toISOString(), ...extra });
      return { body: [pr(7, 'Cambio en revisión', false, { requested_reviewers: [{ login: 'ana' }] }), pr(8, 'Borrador a medias', true)] };
    }
    if (rest === '/events' && repoEvents.has(m[1])) return { body: repoEvents.get(m[1]) };
    if (rest === '/events' || rest === '/pulls' || rest === '/tags' || rest === '/deployments' || rest === '/forks' || rest === '/activity' || rest === '/stats/code_frequency') return { body: [] }; // /activity: solo con token
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
    const file = rest.match(/^\/contents\/(.+)$/); // un archivo de una rama (el editor, js/editor.js)
    if (file) return { body: { type: 'file', encoding: 'base64', size: 20, content: Buffer.from(`// ${decodeURIComponent(file[1])} en ${q.get('ref')}\n`).toString('base64'), sha: 'blob-' + file[1].length } };
    const one = rest.match(/^\/commits\/([0-9a-f]{40})$/); // los cambios de un commit (el panel de js/diff.js)
    if (one && r.commits.has(one[1])) return { body: { ...r.commits.get(one[1]), files: [{ filename: 'src/app.js', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1,2 +1,2 @@\n const a = 1;\n-const limit = 50;\n+const limit = 100;' }] } };
    return { status: 404, body: { message: 'Not Found' } };
  };
  return {
    calls,
    writes,
    repo,
    org: (name) => orgs.add(name),
    repoEvent: (full, ev) => {
      if (!repoEvents.has(full)) repoEvents.set(full, []);
      const list = repoEvents.get(full);
      list.unshift({ id: `${full}:${list.length + 1}`, actor: { login: 'ana' }, created_at: new Date().toISOString(), payload: {}, ...ev });
    },
    orgEvent: (ev) => orgEvents.unshift({ id: String(orgEvents.length + 1), actor: { login: 'ana' }, created_at: new Date().toISOString(), payload: {}, ...ev }),
    push: (full, branch, message, at) => commit(repo(full), branch, message, at),
    handle: (r) => {
      const u = new URL(r.request().url());
      calls.push(u.pathname);
      const method = r.request().method();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) writes.push(`${method} ${u.pathname}`);
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

if (seccion('Varios repos a la vez'))
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
    await page.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt')].filter((t) => t.dataset.state === 'live').length === 2, null, { timeout: T(15000) });
    const tabs = await repoTabs(page);
    const names = tabs.map((t) => `${t.name}${t.on ? '*' : ''}`).join(' ');
    if (names !== 'o/a* o/b') throw new Error(`pestañas: ${names}`);
    if ((await shown()) !== 'o/a') throw new Error(`el grafo muestra ${await shown()}`);
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["o/a","o/b"]') throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'con un repo real a la vista, el campo del repo deja espacio para escribir otro', async () => {
    // un repo real suma «Probar un comando» (y la app de escritorio, «Abrir carpeta…»): antes aplastaban el campo
    await page.waitForSelector('#rehearse-btn:not([hidden])', { timeout: T(10000) });
    const bad = [];
    try {
      for (const [width, folder] of [[1875, true], [1536, false], [1280, true], [1024, false]]) {
        await page.setViewportSize({ width, height: 800 });
        await page.evaluate((f) => (document.getElementById('folder-btn').hidden = !f), folder);
        const r = await page.evaluate(() => {
          const box = (sel) => document.querySelector(sel).getBoundingClientRect();
          return { field: box('.repo-field'), input: box('#repo-input').width, connect: box('#repo-form .btn-primary'), sw: document.documentElement.scrollWidth };
        });
        const tapa = r.connect.top < r.field.bottom && r.connect.left < r.field.right - 1;
        if (r.input < 120 || tapa || r.sw > width) bad.push(`${width} px${folder ? ' con «Abrir carpeta…»' : ''}: campo de ${Math.round(r.input)} px${tapa ? ', Conectar encima' : ''}${r.sw > width ? `, desborda a ${r.sw} px` : ''}`);
      }
    } finally {
      await page.evaluate(() => (document.getElementById('folder-btn').hidden = true));
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    if (bad.length) throw new Error(bad.join(' · '));
  });

  await step(page, 'CI en el grafo: la rama por defecto lleva la marca de sus checks', async () => {
    const mark = await page.waitForSelector('.h-ci.ci-success, .h3-ci.ci-success', { timeout: T(10000) });
    const title = await mark.getAttribute('title');
    if (!title && !(await mark.$('title'))) throw new Error('la marca de CI no dice qué significa');
  });

  await step(page, 'lo nuevo del repo que no se ve llega con su nombre y a su pestaña', async () => {
    gh.push('o/b', 'main', 'arreglo que llega por detrás');
    const toast = await page.waitForSelector('#toasts .toast .toast-repo', { timeout: T(15000) });
    const from = await toast.textContent();
    await page.waitForFunction(() => document.querySelector('#repo-tabs .rt:nth-child(2) .rt-n')?.textContent === '1', null, { timeout: T(5000) });
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
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(5000) });
    await loaded(page);
    const tabs = await repoTabs(page);
    const commits = await page.textContent('#st-commits');
    const url = await page.evaluate(() => new URL(location.href).searchParams.getAll('repo').join(' '));
    if (!tabs[1].on || tabs[1].unread) throw new Error(`la pestaña de o/b: ${JSON.stringify(tabs[1])}`);
    if (commits !== '5') throw new Error(`el resumen dice ${commits} commits (o/b tiene 5)`);
    if (loads() !== before) throw new Error('volvió a pedir el repo a GitHub');
    if (url !== 'o/b o/a') throw new Error(`la URL lleva ${url}`);
  });

  await step(page, 'alias de una pestaña: F2 la renombra, se recuerda y el nombre real sigue accesible', async () => {
    await page.focus('#repo-tabs .rt:nth-child(2) .rt-main');
    await page.keyboard.press('F2');
    const input = page.locator('#repo-tabs .rt-alias');
    await input.waitFor({ timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('rt-alias')))) throw new Error('F2 no dejó el foco en el campo del alias');
    await page.keyboard.type('  Mi   producto ');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#repo-tabs .rt-alias', { state: 'detached', timeout: T(3000) });
    const tab = (await repoTabs(page))[1];
    if (tab.name !== 'Mi producto') throw new Error(`la pestaña dice «${tab.name}»`);
    const real = await page.evaluate(() => ({
      sr: document.querySelector('#repo-tabs .rt:nth-child(2) .rt-sr').textContent,
      title: document.querySelector('#repo-tabs .rt:nth-child(2) .rt-main').title,
      close: document.querySelector('#repo-tabs .rt:nth-child(2) .rt-close').getAttribute('aria-label'),
      saved: localStorage.getItem('graphbranch:alias:github:o/b') ?? localStorage.getItem('graphbranch:alias:o/b'),
      link: document.querySelector('#repo-link')?.textContent,
      url: new URLSearchParams(location.search).getAll('repo').join(' '),
      focus: document.activeElement?.className,
    }));
    if (!real.sr.includes('o/b') || !real.title.includes('o/b') || !real.close.includes('o/b')) throw new Error(`el nombre real se perdió: ${JSON.stringify(real)}`);
    if (real.saved !== '"Mi producto"') throw new Error(`no se guardó el alias: ${real.saved}`);
    if (real.link !== 'o/b' || real.url !== 'o/b o/a') throw new Error(`el alias tocó el repo o la URL: ${JSON.stringify(real)}`);
    if (real.focus !== 'rt-main') throw new Error(`el foco quedó en ${real.focus}`);
    // Esc deja el alias como estaba y vacío lo quita
    await page.keyboard.press('F2');
    await page.keyboard.type('otro');
    await page.keyboard.press('Escape');
    if ((await repoTabs(page))[1].name !== 'Mi producto') throw new Error('Esc cambió el alias');
    await page.keyboard.press('F2');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    if ((await repoTabs(page))[1].name !== 'o/b') throw new Error('vaciar el alias no devolvió el nombre real');
  });

  await step(page, 'clic en una actividad de otro repo lleva a su pestaña', async () => {
    gh.push('o/a', 'main', 'cambio en a');
    const item = page.locator('#feed .act', { has: page.locator('.act-repo', { hasText: 'o/a' }) }).first();
    await item.waitFor({ timeout: T(15000) });
    await item.locator('.act-main').click();
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(5000) });
  });

  await step(page, 'Conectar un repo que ya se sigue no lo repite', async () => {
    await page.fill('#repo-input', 'https://github.com/o/b');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(5000) });
    const n = (await repoTabs(page)).length;
    if (n !== 2) throw new Error(`hay ${n} pestañas`);
  });

  await step(page, 'vista conjunta: «Todos» muestra cada repo en su tarjeta, en vivo, y sus cambios sin cambiar de pestaña', async () => {
    await page.focus('#all-tab'); // con el teclado
    await page.keyboard.press('Enter');
    await page.waitForSelector('#all-panel:not([hidden]) .rc-card .graph-svg .node', { timeout: T(5000) });
    const on = await page.evaluate(() => ({
      pressed: document.querySelector('#all-tab').getAttribute('aria-pressed'),
      graph: getComputedStyle(document.querySelector('.graph-panel')).display,
      stats: getComputedStyle(document.querySelector('.stats')).display,
      cards: [...document.querySelectorAll('.rc-card')].map((c) => ({ name: c.querySelector('.rc-name').textContent, nodes: c.querySelectorAll('.graph-svg .node').length, stats: c.querySelector('.rc-stats').textContent })),
      current: document.querySelectorAll('#repo-tabs [aria-current="true"]').length,
      url: new URL(location.href).searchParams.get('all'),
      saved: localStorage.getItem('graphbranch:all'),
      sum: document.querySelector('#all-sum').textContent,
      label: document.querySelector('#all-tab').getAttribute('aria-label'),
    }));
    if (on.pressed !== 'true' || on.graph !== 'none' || on.stats !== 'none') throw new Error('«Todos» no tomó el lugar del grafo: ' + JSON.stringify(on));
    if (on.cards.map((c) => c.name).join(' ') !== 'o/a o/b' || on.cards.some((c) => !c.nodes)) throw new Error('tarjetas: ' + JSON.stringify(on.cards));
    if (on.cards.some((c) => !/\d/.test(c.stats) || /\{|undefined|NaN/.test(c.stats)) || /\{|undefined|NaN/.test(on.sum + on.label)) throw new Error('texto sin resolver: ' + JSON.stringify(on));
    if (on.current) throw new Error('con la vista conjunta una pestaña sigue marcada como la que se ve');
    if (on.url !== '1' || on.saved !== 'true') throw new Error(`no viaja en la URL ni se recuerda: all=${on.url}, guardado ${on.saved}`);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await transitionsDone(page); // «Todos» cambia de color con transición: se mide cuando termina
      const bad = await lowContrast(page);
      if (bad.length) throw new Error(`${colorScheme}: ${bad.length} textos con poco contraste, como ${bad.slice(0, 3).join(', ')}`);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    // el Launchpad: los PRs abiertos de todos los repos por estado; una fila lleva a su repo, en su pestaña
    const lp = await page.evaluate(() => ({
      title: document.querySelector('#all-prs .ap-title')?.textContent,
      groups: [...document.querySelectorAll('#all-prs .ap-group')].map((g) => ({ id: g.dataset.group, rows: [...g.querySelectorAll('.ap-row')].map((r) => r.querySelector('.ap-t').textContent + ' | ' + r.querySelector('.ap-m').textContent + ' | ' + r.getAttribute('aria-label')) })),
    }));
    const want = [['draft', '#8 Borrador a medias | o/b · main · bea'], ['waiting', '#7 Cambio en revisión | o/b · main · bea']];
    if (!/2/.test(lp.title || '') || lp.groups.length !== 2 || want.some(([id, row], i) => lp.groups[i].id !== id || lp.groups[i].rows.length !== 1 || !lp.groups[i].rows[0].startsWith(row)) || /\{|undefined|NaN/.test(lp.title + lp.groups.map((g) => g.rows.join()).join())) throw new Error('el Launchpad: ' + JSON.stringify(lp));
    // la persona incluye los PRs en que se le pidió revisión: «ana» no abrió ninguno, pero el #7 le pide revisión; viaja en ?by=
    await page.selectOption('#all-prs .ap-person', 'ana');
    const who = await page.evaluate(() => ({
      opts: [...document.querySelectorAll('#all-prs .ap-person option')].map((o) => o.textContent),
      rows: [...document.querySelectorAll('#all-prs .ap-row')].map((r) => ({ n: r.dataset.number, role: r.querySelector('.ap-role')?.textContent || '', label: r.getAttribute('aria-label') })),
      by: new URL(location.href).searchParams.get('by'),
      focus: document.activeElement?.matches('.ap-person'),
    }));
    if (who.opts.join('|') !== 'Todas las personas|ana (1)|bea (2)' || who.rows.length !== 1 || who.rows[0].n !== '7' || who.rows[0].role !== 'Revisión pedida a ana' || !who.rows[0].label.endsWith('Revisión pedida a ana') || who.by !== 'ana' || !who.focus) throw new Error('el Launchpad por persona, con la revisión pedida: ' + JSON.stringify(who));
    await page.selectOption('#all-prs .ap-person', 'bea');
    const bea = await page.evaluate(() => [...document.querySelectorAll('#all-prs .ap-row')].map((r) => r.dataset.number + (r.querySelector('.ap-role') ? '+' : '')).sort().join());
    if (bea !== '7,8') throw new Error('lo que abrió la persona no lleva marca: ' + bea);
    await page.selectOption('#all-prs .ap-person', '');
    if (await page.evaluate(() => new URL(location.href).searchParams.has('by') || document.querySelectorAll('#all-prs .ap-row').length !== 2)) throw new Error('«Todas las personas» no volvió a mostrar todo ni quitó ?by=');
    // fijar un PR arriba: se recuerda por repo y número (sin el título) y el mismo botón lo suelta
    const pinSel = '#all-prs .ap-row[data-number="7"] + .ap-pin';
    await page.click(pinSel);
    const pinned = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), label: document.querySelector(sel)?.getAttribute('aria-label'), saved: localStorage.getItem('graphbranch:prpins'), focus: document.activeElement?.matches(sel) }), pinSel);
    if (pinned.pressed !== 'true' || pinned.saved !== '["o/b#7"]' || !pinned.focus || /\{|undefined/.test(pinned.label || '')) throw new Error('fijar un PR del Launchpad: ' + JSON.stringify(pinned));
    await page.click(pinSel);
    const unpinned = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), saved: localStorage.getItem('graphbranch:prpins') }), pinSel);
    if (unpinned.pressed !== 'false' || unpinned.saved !== null) throw new Error('soltar un PR del Launchpad: ' + JSON.stringify(unpinned));
    // posponer un PR un día: baja (atenuado) al final de su grupo, se recuerda por repo y número con su vencimiento, y fijarlo lo deja de posponer
    const zzSel = '#all-prs .ap-row[data-number="7"] ~ .ap-snooze';
    await page.click(zzSel);
    const snoozed = await page.evaluate((sel) => {
      const b = document.querySelector(sel);
      const saved = JSON.parse(localStorage.getItem('graphbranch:prsnooze') || 'null');
      return { pressed: b?.getAttribute('aria-pressed'), label: b?.getAttribute('aria-label'), cls: b?.closest('li')?.classList.contains('snoozed'), ids: Object.keys(saved || {}), hours: saved && (saved['o/b#7'] - Date.now()) / 3.6e6, focus: document.activeElement?.matches(sel) };
    }, zzSel);
    if (snoozed.pressed !== 'true' || !snoozed.cls || snoozed.ids.join() !== 'o/b#7' || !(snoozed.hours > 23.9 && snoozed.hours <= 24) || !snoozed.focus || !/7/.test(snoozed.label || '') || /\{|undefined/.test(snoozed.label || '')) throw new Error('posponer un PR del Launchpad: ' + JSON.stringify(snoozed));
    await page.click(pinSel);
    const pinWins = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), snooze: localStorage.getItem('graphbranch:prsnooze'), pins: localStorage.getItem('graphbranch:prpins') }), zzSel);
    if (pinWins.pressed !== 'false' || pinWins.snooze !== null || pinWins.pins !== '["o/b#7"]') throw new Error('fijar un PR pospuesto: ' + JSON.stringify(pinWins));
    await page.click(zzSel);
    const snoozeWins = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), pins: localStorage.getItem('graphbranch:prpins') }), zzSel);
    if (snoozeWins.pressed !== 'true' || snoozeWins.pins !== null) throw new Error('posponer un PR fijado: ' + JSON.stringify(snoozeWins));
    await page.click(zzSel);
    const unsnoozed = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), saved: localStorage.getItem('graphbranch:prsnooze') }), zzSel);
    if (unsnoozed.pressed !== 'false' || unsnoozed.saved !== null) throw new Error('dejar de posponer un PR del Launchpad: ' + JSON.stringify(unsnoozed));
    // los issues abiertos que vio la actividad de cada repo, en su grupo: un enlace a su página, se fijan como un PR y un
    // cierre los saca. Sin token los eventos se leen cada 2 minutos: mientras tanto se leen en cada ciclo
    await page.evaluate(() => {
      const P = window.GB.GitHubSource.prototype;
      P.dueBefore = P.due;
      P.due = function (name) {
        return name === 'events' || this.dueBefore(name);
      };
    });
    const issueSel = '#all-prs .ap-group[data-group="issues"] .ap-row';
    try {
      gh.repoEvent('o/b', { type: 'IssuesEvent', actor: { login: 'carla' }, payload: { action: 'opened', issue: { number: 9, title: 'Falla el login', html_url: 'https://github.com/o/b/issues/9' } } });
      await page.waitForSelector(issueSel, { timeout: T(15000) });
      const iss = await page.evaluate((sel) => {
        const r = document.querySelector(sel);
        return {
          rows: document.querySelectorAll(sel).length,
          tag: r.tagName,
          href: r.getAttribute('href'),
          target: r.getAttribute('target'),
          rel: r.getAttribute('rel'),
          t: r.querySelector('.ap-t').textContent,
          m: r.querySelector('.ap-m').textContent,
          label: r.getAttribute('aria-label'),
          group: r.closest('.ap-group').querySelector('.ap-gname').textContent,
          last: document.querySelector('#all-prs .ap-group:last-child')?.dataset.group,
          title: document.querySelector('#all-prs .ap-title').textContent,
          who: [...document.querySelectorAll('#all-prs .ap-person option')].map((o) => o.textContent).join('|'),
        };
      }, issueSel);
      if (iss.rows !== 1 || iss.tag !== 'A' || iss.href !== 'https://github.com/o/b/issues/9' || iss.target !== '_blank' || iss.rel !== 'noopener' || iss.t !== '#9 Falla el login' || iss.m !== 'o/b · carla' || iss.group !== 'Issues abiertos · 1' || iss.last !== 'issues' || !/: 2$/.test(iss.title) || !iss.who.includes('carla (1)') || !/^Issue #9 de o\/b: Falla el login/.test(iss.label || '') || /\{|undefined|NaN/.test(JSON.stringify(iss))) throw new Error('los issues en el Launchpad: ' + JSON.stringify(iss));
      const ipin = '#all-prs .ap-group[data-group="issues"] .ap-pin';
      await page.click(ipin);
      const ipinned = await page.evaluate((sel) => ({ pressed: document.querySelector(sel)?.getAttribute('aria-pressed'), label: document.querySelector(sel)?.getAttribute('aria-label'), saved: localStorage.getItem('graphbranch:prpins'), focus: document.activeElement?.matches(sel) }), ipin);
      if (ipinned.pressed !== 'true' || ipinned.saved !== '["o/b#issue-9"]' || !ipinned.focus || !/issue #9/i.test(ipinned.label || '')) throw new Error('fijar un issue del Launchpad: ' + JSON.stringify(ipinned));
      await page.click(ipin);
      if ((await page.evaluate(() => localStorage.getItem('graphbranch:prpins'))) !== null) throw new Error('soltar un issue del Launchpad no lo olvidó');
      gh.repoEvent('o/b', { type: 'IssuesEvent', actor: { login: 'ana' }, payload: { action: 'closed', issue: { number: 9, title: 'Falla el login', html_url: 'https://github.com/o/b/issues/9' } } });
      await page.waitForFunction(() => !document.querySelector('#all-prs .ap-group[data-group="issues"]'), null, { timeout: T(15000) });
    } finally {
      await page.evaluate(() => {
        const P = window.GB.GitHubSource.prototype;
        P.due = P.dueBefore;
        delete P.dueBefore;
      });
    }
    await page.click('#all-prs .ap-row[data-number="7"]');
    await page.waitForFunction(() => document.querySelector('#all-panel').hidden && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(5000) });
    await page.click('#all-tab');
    await page.waitForSelector('#all-panel:not([hidden]) .rc-card .graph-svg .node', { timeout: T(5000) });
    // lo nuevo de o/b llega a su tarjeta, sin quedar «sin ver» en su pestaña
    const commitsOf = (name) => page.$eval(`.rc-card[data-key="${name}"] .rc-stats`, (n) => Number(/(\d+)\D+(\d+)/.exec(n.textContent)?.[2]));
    const before = await commitsOf('o/b');
    gh.push('o/b', 'main', 'cambio que se ve en la tarjeta');
    await page.waitForFunction(() => document.querySelector('.rc-card[data-key="o/b"] .rc-lmsg')?.textContent === 'cambio que se ve en la tarjeta', null, { timeout: T(15000) });
    if ((await commitsOf('o/b')) !== before + 1) throw new Error(`la tarjeta no sumó el commit: ${before} → ${await commitsOf('o/b')}`);
    const unread = (await repoTabs(page)).map((t) => t.unread).join('');
    if (unread) throw new Error(`con todo a la vista quedaron novedades sin ver: ${unread}`);
    // sus cambios, sin cambiar de pestaña: el panel se abre al lado y la tarjeta marca el commit
    const shownBefore = await shown();
    await page.click('.rc-card[data-key="o/b"] .rc-last');
    await page.waitForSelector('#diff-panel:not([hidden]) .df-file .dl-add', { timeout: T(10000) });
    const diff = await page.evaluate(() => ({
      msg: document.querySelector('#diff-panel .df-msg').textContent,
      sel: document.querySelectorAll('.rc-card[data-key="o/b"] .node.sel').length,
      other: document.querySelectorAll('.rc-card[data-key="o/a"] .node.sel').length,
      all: !document.querySelector('#all-panel').hidden,
    }));
    if (diff.msg !== 'cambio que se ve en la tarjeta' || diff.sel !== 1 || diff.other || !diff.all) throw new Error('los cambios desde la tarjeta: ' + JSON.stringify(diff));
    if ((await shown()) !== shownBefore) throw new Error('ver los cambios cambió de pestaña');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#diff-panel', { state: 'hidden', timeout: T(3000) });
    // al volver a abrir la página, sigue en la vista conjunta
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.waitForSelector('#all-panel:not([hidden]) .rc-card', { timeout: T(10000) });
    // el nombre de la tarjeta abre el repo en su pestaña y deja la vista conjunta
    await page.click('.rc-card[data-key="o/b"] .rc-open');
    await page.waitForFunction(() => document.querySelector('#all-panel').hidden && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(5000) });
    const off = await page.evaluate(() => ({ pressed: document.querySelector('#all-tab').getAttribute('aria-pressed'), url: new URL(location.href).searchParams.has('all'), saved: localStorage.getItem('graphbranch:all'), focus: document.activeElement?.closest('.rt')?.querySelector('.rt-name')?.textContent }));
    if (off.pressed !== 'false' || off.url || off.saved) throw new Error('al salir, la vista conjunta sigue puesta: ' + JSON.stringify(off));
    if (off.focus !== 'o/b') throw new Error(`el foco quedó en ${off.focus || 'otro lado'} y no en la pestaña de o/b`);
  });

  await step(page, 'editar sin token: el editor lo dice, no deja hacer commit y lleva a Ajustes', async () => {
    await page.click('#all-tab');
    await page.click('.rc-card[data-key="o/b"] .rc-last');
    await (await page.waitForSelector('#diff-panel .df-file[open] .df-edit', { timeout: T(10000) })).click();
    await page.waitForSelector('#editor[open]', { timeout: T(3000) });
    await page.waitForFunction(() => document.querySelector('#editor .ed-note')?.dataset.kind && document.querySelector('#editor .ed-note').dataset.kind !== 'busy', null, { timeout: T(5000) });
    const st = await page.evaluate(() => ({
      settings: !document.querySelector('#editor .ed-settings').hidden,
      save: document.querySelector('#editor .ed-save').disabled,
      branch: document.querySelector('#editor-branch').value,
      repo: document.querySelector('#editor .ed-repo').textContent,
    }));
    if (!st.settings || !st.save) throw new Error('sin token deja hacer commit o no ofrece Ajustes: ' + JSON.stringify(st));
    if (st.repo !== 'o/b' || st.branch !== 'main') throw new Error('el editor abrió otro repo o rama: ' + JSON.stringify(st));
    const puts = gh.writes.length;
    await page.click('#editor .ed-settings');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'token-input') throw new Error(`Ajustes abrió con el foco en ${focus}`);
    if (gh.writes.length !== puts) throw new Error(`intentó escribir sin token (${gh.writes.slice(puts).join(', ')})`);
    await page.click('#settings-cancel');
    await page.click('#all-tab'); // deja la vista conjunta como estaba para los pasos que siguen
    await page.waitForSelector('#all-panel', { state: 'hidden', timeout: T(3000) });
  });

  await step(page, 'modo TV en la vista conjunta: entra con todos los repos a la vista y sin desplazarse, R pasa al grafo y vuelve, y al salir queda como estaba sin guardar nada', async () => {
    await page.click('#all-tab');
    await page.waitForSelector('#all-panel:not([hidden]) .rc-card', { timeout: T(5000) });
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:all'));
    await page.click('#all-tv-btn'); // el botón de la cabecera: el de la barra del grafo no se ve con la vista conjunta
    await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(3000) });
    const tvState = () =>
      page.evaluate(() => {
        const grid = document.querySelector('#all-grid');
        const bar = document.querySelector('#tv-bar');
        return {
          all: document.querySelector('.app').classList.contains('all-on') && !document.querySelector('#all-panel').hidden,
          graph: document.querySelector('#graph-panel').checkVisibility(),
          bar: bar.closest('#all-panel') ? 'todos' : bar.closest('#graph-panel') ? 'grafo' : 'otro',
          barShown: bar.checkVisibility(),
          pressed: document.querySelector('#tv-all').getAttribute('aria-pressed'),
          grid: `${grid.style.getPropertyValue('--tv-cols')}x${grid.style.getPropertyValue('--tv-rows')}`,
          scroll: grid.scrollHeight - grid.clientHeight,
          inside: [...grid.querySelectorAll('.rc-card')].every((c) => {
            const r = c.getBoundingClientRect();
            return r.height > 120 && r.top >= 0 && r.bottom <= innerHeight + 1;
          }),
          controls: ['#all-panel .hint', '.ap-pin', '.ap-snooze', '.ap-person'].filter((s) => document.querySelector(s)?.checkVisibility()),
          focus: document.activeElement?.id || '',
        };
      });
    const on = await tvState();
    if (!on.all || on.bar !== 'todos' || !on.barShown || on.pressed !== 'true') throw new Error(`al entrar desde la vista conjunta no se queda en ella con su barra: ${JSON.stringify(on)}`);
    if (on.grid !== '2x1' || on.scroll > 1 || !on.inside) throw new Error(`las tarjetas no entran en la pantalla: ${JSON.stringify(on)}`);
    if (on.controls.length) throw new Error(`en TV se ven controles: ${on.controls.join(', ')}`);
    if (on.focus !== 'all-panel') throw new Error(`el foco quedó en ${on.focus || 'el documento'} y no en la vista`);
    // lo que llega a un repo enciende su tarjeta (en la vista conjunta no se salta de un repo a otro)
    gh.push('o/b', 'main', 'llega en la TV');
    await page.waitForSelector('.rc-card[data-key="o/b"].rc-news', { timeout: T(15000) });
    if (!(await tvState()).all) throw new Error('una novedad sacó la pantalla de la vista conjunta');
    await page.keyboard.press('r');
    await page.waitForFunction(() => !document.querySelector('.app').classList.contains('all-on'), null, { timeout: T(3000) });
    const graph = await tvState();
    if (!graph.graph || graph.bar !== 'grafo' || graph.pressed !== 'false') throw new Error(`R no pasa al grafo con su barra: ${JSON.stringify(graph)}`);
    await page.click('#tv-all');
    await page.waitForFunction(() => document.querySelector('.app').classList.contains('all-on'), null, { timeout: T(3000) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: T(3000) });
    const off = await page.evaluate(() => ({ all: document.querySelector('.app').classList.contains('all-on'), saved: localStorage.getItem('graphbranch:all'), url: new URL(location.href).searchParams.get('tv') }));
    if (!off.all || off.saved !== saved || off.url) throw new Error(`al salir del modo TV no queda como estaba: ${JSON.stringify(off)} (guardado antes: ${saved})`);
    // el foco no se pierde: sigue en la vista (como en el grafo al salir con Esc)
    if (!(await page.evaluate(() => document.activeElement && document.activeElement !== document.body && document.activeElement.getClientRects().length > 0))) throw new Error('al salir del modo TV, el foco se perdió');
    await page.click('#all-tab'); // deja la vista conjunta como estaba para los pasos que siguen
    await page.waitForSelector('#all-panel', { state: 'hidden', timeout: T(3000) });
  });

  await step(page, '?all=1&tv=1 abre el modo TV con todos los repos a la vista; ?tv=1 solo, con el grafo', async () => {
    for (const [query, want] of [['all=1&tv=1', true], ['tv=1', false]]) {
      const p = await openPage({ viewport: { width: 1280, height: 800 } });
      try {
        await p.unroute('https://api.github.com/**');
        await p.route('https://api.github.com/**', gh.handle);
        await p.addInitScript(quickCycles);
        await p.goto(`${base}/index.html?lang=es&repo=o/a&repo=o/b&${query}`);
        await p.waitForFunction(() => document.documentElement.classList.contains('tv') && document.querySelectorAll('#repo-tabs .rt').length === 2, null, { timeout: T(15000) });
        if (want) await p.waitForSelector('#all-panel:not([hidden]) .rc-card', { timeout: T(10000) });
        else await p.waitForTimeout(1500);
        const got = await p.evaluate(() => ({ all: document.querySelector('.app').classList.contains('all-on'), btn: !document.querySelector('#tv-all').hidden }));
        if (got.all !== want || !got.btn) throw new Error(`?${query}: ${JSON.stringify(got)}`);
        if (p.errors.length) throw new Error(`?${query}: ${p.errors.join(' | ')}`);
      } finally {
        await p.context().close();
      }
    }
  });

  await step(page, 'cerrar la pestaña deja de seguir el repo', async () => {
    await page.focus('#repo-tabs .rt:nth-child(1) .rt-close'); // o/a, con el teclado
    await page.keyboard.press('Enter');
    await page.waitForSelector('#repo-tabs', { state: 'hidden', timeout: T(5000) });
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
    await page.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'live' && document.querySelector('#repo-link')?.textContent === 'acme/orbita', null, { timeout: T(15000) });
    const names = (await repoTabs(page)).map((t) => t.name).join(' ');
    await page.click('#repo-tabs .rt:nth-child(1) .rt-main'); // o/b: la demo se cierra
    await page.waitForSelector('#repo-tabs', { state: 'hidden', timeout: T(5000) });
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
    await lab.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'practice/git' && !document.querySelector('#practice').hidden, null, { timeout: T(15000) });
    await lab.waitForSelector('#graph svg .node', { timeout: T(10000) });
    if ((await lab.evaluate(() => document.activeElement?.className)) !== 'pr-input') throw new Error('el foco no quedó en la línea de comandos');
    const nodes = () => lab.locator('#graph svg .node').count();
    const before = await nodes();
    for (const c of ['checkout -b feature', 'commit -m uno', 'git commit -m "dos <img src=x onerror=alert(1)>"', 'bisect start']) {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    }
    await lab.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length >= n, before + 2, { timeout: T(10000) });
    const log = await lab.textContent('.pr-log');
    if (!log.includes('<img src=x onerror=alert(1)>')) throw new Error('el mensaje no se ve tal cual');
    if (await lab.locator('.pr-log img').count()) throw new Error('la terminal interpretó HTML');
    if (!/is not a git command/.test(log)) throw new Error('un comando que no existe no dio error');
    if ((await lab.textContent('.pr-status')).trim() === '') throw new Error('el primer ejercicio no se dio por resuelto');
    await lab.selectOption('.pr-ex', '3');
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('reset'), null, { timeout: T(5000) });
  });
  await step(lab, 'las cartas de comandos escriben su comando en la línea sin ejecutarlo, y se recorren con el teclado', async () => {
    const cards = lab.locator('.pr-cards[role="toolbar"] .pr-card');
    if ((await cards.count()) < 8) throw new Error(`solo ${await cards.count()} cartas`);
    if (!(await lab.getAttribute('.pr-cards', 'aria-label'))) throw new Error('la barra de cartas no tiene nombre');
    const desc = (await lab.textContent('.pr-card[data-cmd="commit"] .pr-card-desc')).trim();
    if (!desc || desc === 'practice.card.commit') throw new Error(`la carta de commit no tiene descripción: «${desc}»`);
    const rows = await lab.locator('.pr-log .pr-row').count();
    await lab.click('.pr-card[data-cmd="commit"]');
    const state = await lab.evaluate(() => {
      const i = document.querySelector('.pr-input');
      return { value: i.value, focus: document.activeElement === i, caret: i.selectionStart };
    });
    if (state.value !== 'commit -m ""' || !state.focus || state.caret !== 11) throw new Error(`la carta escribió ${JSON.stringify(state)}`);
    if ((await lab.locator('.pr-log .pr-row').count()) !== rows) throw new Error('la carta ejecutó el comando');
    await lab.keyboard.type('desde la carta');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('$ git commit -m "desde la carta"'), null, { timeout: T(5000) });
    // un solo punto de tabulación: las flechas, Inicio y Fin se mueven entre las cartas, y Enter escribe la enfocada
    if ((await lab.locator('.pr-card[tabindex="0"]').count()) !== 1) throw new Error('la barra no tiene un único punto de tabulación');
    await lab.focus('.pr-card[tabindex="0"]');
    await lab.keyboard.press('Home');
    await lab.keyboard.press('ArrowRight');
    const second = await lab.evaluate(() => document.activeElement?.dataset.cmd);
    const first = await lab.getAttribute('.pr-card:nth-child(1)', 'data-cmd');
    const secondId = await lab.getAttribute('.pr-card:nth-child(2)', 'data-cmd');
    if (second !== secondId) throw new Error(`ArrowRight desde ${first} fue a ${second}`);
    await lab.keyboard.press('End');
    await lab.keyboard.press('ArrowRight'); // da la vuelta
    if ((await lab.evaluate(() => document.activeElement?.dataset.cmd)) !== first) throw new Error('ArrowRight desde la última no volvió a la primera');
    await lab.keyboard.press('Enter');
    const line = await lab.evaluate(() => [document.querySelector('.pr-input').value, document.activeElement?.className]);
    if (line[1] !== 'pr-input' || !line[0].startsWith(first)) throw new Error(`Enter en la carta dejó ${JSON.stringify(line)}`);
    await lab.fill('.pr-input', '');
    // de derecha a izquierda, ArrowLeft avanza a la carta siguiente
    await lab.goto(`${base}/index.html?lang=ar&practice=1`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-card', { timeout: T(15000) });
    await lab.focus('.pr-card[tabindex="0"]');
    await lab.keyboard.press('Home');
    await lab.keyboard.press('ArrowLeft');
    if ((await lab.evaluate(() => document.activeElement?.dataset.cmd)) !== secondId) throw new Error('en árabe ArrowLeft no fue a la carta siguiente');
    await lab.goto(`${base}/index.html?lang=es`);
    await loaded(lab);
    await lab.click('#practice-btn');
    await lab.waitForFunction(() => !document.querySelector('#practice').hidden, null, { timeout: T(15000) });
  });
  await step(lab, 'el árbol de trabajo, el índice y HEAD se ven al momento con touch, add y commit', async () => {
    const col = (k) => lab.evaluate((key) => {
      const box = document.querySelector(`.pr-areas[role="group"] .pr-area[data-area="${key}"]`);
      return { head: box?.querySelector('.pr-area-h')?.textContent || '', label: box?.querySelector('ul')?.getAttribute('aria-labelledby') || '', items: [...(box?.querySelectorAll('li:not(.pr-area-empty)') || [])].map((li) => li.textContent.trim()) };
    }, k);
    if (!(await lab.getAttribute('.pr-areas', 'aria-label'))) throw new Error('las áreas no tienen nombre');
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await send('touch --new areas.md');
    let work = await col('work');
    if (!work.items.some((t) => t.startsWith('areas.md') && t.includes('sin seguir'))) throw new Error(`touch no llevó el archivo al árbol de trabajo: ${JSON.stringify(work)}`);
    if (!/^Árbol de trabajo \(\d+\)$/.test(work.head) || !work.label) throw new Error(`la columna del árbol no tiene título: ${JSON.stringify(work)}`);
    await send('add areas.md');
    const index = await col('index');
    if (!index.items.some((t) => t.startsWith('areas.md') && t.includes('nuevo'))) throw new Error(`add no llevó el archivo al índice: ${JSON.stringify(index)}`);
    if ((await col('work')).items.some((t) => t.startsWith('areas.md'))) throw new Error('el archivo preparado sigue en el árbol de trabajo');
    if ((await col('head')).items.includes('areas.md')) throw new Error('el archivo preparado ya está en HEAD');
    await send('commit -m "areas"');
    if ((await col('index')).items.length) throw new Error('el índice no quedó vacío tras el commit');
    if (!(await col('head')).items.includes('areas.md')) throw new Error(`el commit no llevó el archivo a HEAD: ${JSON.stringify(await col('head'))}`);
    if ((await lab.locator('.pr-area ul[tabindex="0"]').count()) !== 3) throw new Error('las listas de las áreas, que se desplazan, no se alcanzan con el teclado');
  });
  await step(lab, 'un conflicto de merge se ve en el índice y se resuelve con add y commit', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    const index = () => lab.evaluate(() => [...document.querySelectorAll('.pr-area[data-area="index"] li:not(.pr-area-empty)')].map((li) => li.textContent.trim()));
    await lab.selectOption('.pr-ex', '15');
    await send('merge feature');
    await lab.waitForFunction(() => /CONFLICT \(content\): Merge conflict in login\.js/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    if (!(await index()).some((t) => t.startsWith('login.js') && t.includes('en conflicto'))) throw new Error(`el índice no muestra el conflicto: ${JSON.stringify(await index())}`);
    await send('commit -m "antes de tiempo"');
    await lab.waitForFunction(() => /unmerged files/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    if (await lab.textContent('.pr-status')) throw new Error('el ejercicio se dio por resuelto sin resolver el conflicto');
    await send('add login.js');
    if ((await index()).some((t) => t.includes('en conflicto'))) throw new Error('add no marcó resuelto el conflicto');
    await send('commit');
    await lab.waitForFunction(() => /Resuelto/.test(document.querySelector('.pr-status')?.textContent || ''), null, { timeout: T(5000) });
  });
  await step(lab, 'la práctica entiende switch y restore', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '1');
    for (const c of ['switch -c arreglo', 'touch a.txt', 'status', 'restore a.txt', 'status', 'switch main', 'switch HEAD~1']) await send(c);
    await lab.waitForFunction(() => /a branch is expected/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    const log = await lab.textContent('.pr-log');
    if (!/modified:\s+a\.txt/.test(log)) throw new Error('touch no dejó el archivo cambiado');
    if (!/Switched to a new branch 'arreglo'/.test(log)) throw new Error('switch -c no creó la rama');
    if (/is not a git command/.test(log.split('restore a.txt').pop())) throw new Error('restore no se reconoce');
    if (!/working tree clean/.test(log.split('restore a.txt').pop())) throw new Error('restore no dejó el árbol limpio');
  });
  await step(lab, 'la práctica borra un tag y cancela un cherry-pick a medias', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '8');
    for (const c of ['tag -d v2', 'cherry-pick feature --no-commit', 'status', 'cherry-pick --abort']) await send(c);
    await lab.waitForFunction(() => /Deleted tag 'v2'/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    const log = await lab.textContent('.pr-log');
    if (!/currently cherry-picking/.test(log)) throw new Error('status no dijo que había un cherry-pick a medias');
  });
  await step(lab, 'la práctica cancela un revert y un rebase -i a medias', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '5');
    for (const c of ['revert -n HEAD~1', 'status', 'revert --abort', 'status']) await send(c);
    await lab.waitForFunction(() => (document.querySelector('.pr-log')?.textContent.match(/working tree clean/g) || []).length >= 1, null, { timeout: T(5000) });
    let log = await lab.textContent('.pr-log');
    if (!/currently reverting/.test(log)) throw new Error('status no dijo que había un revert a medias');
    await lab.selectOption('.pr-ex', '2');
    for (const c of ['checkout feature', 'rebase -i main', 'status', 'rebase --abort', 'status']) await send(c);
    await lab.waitForFunction(() => /interactive rebase in progress/.test(document.querySelector('.pr-log')?.textContent || '') && /On branch feature\s*nothing to commit/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
  });
  await step(lab, 'la práctica muestra el reflog y recupera un commit tras reset --hard', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '3');
    for (const c of ['reset --hard HEAD~1', 'reflog', 'reset --hard HEAD@{1}', 'log --oneline']) await send(c);
    await lab.waitForFunction(() => /HEAD@\{0\}: reset: moving to HEAD~1/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    await lab.waitForFunction(() => /HEAD is now at [0-9a-f]{7} Oops: debug logging left in/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
  });
  await step(lab, 'la práctica corrige el último commit con commit --amend', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '1');
    for (const c of ['commit -m "Fix tpyo"', 'commit --amend -m "Fix typo"', 'log --oneline']) await send(c);
    await lab.waitForFunction(() => {
      const t = document.querySelector('.pr-log')?.textContent || '';
      const out = t.slice(t.lastIndexOf('log --oneline'));
      return /\) Fix typo/.test(out) && !out.includes('Fix tpyo');
    }, null, { timeout: T(5000) });
  });
  await step(lab, 'la práctica hace un commit de fusión con merge --no-ff aunque se pudiera avanzar', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '1');
    for (const c of ['checkout -b feature', 'commit -m uno', 'checkout main', 'merge --no-ff -m "Une feature" feature', 'log --oneline']) await send(c);
    await lab.waitForFunction(() => {
      const t = document.querySelector('.pr-log')?.textContent || '';
      const out = t.slice(t.lastIndexOf('log --oneline'));
      return /Une feature/.test(out) && /Merge made by the 'ort' strategy/.test(t) && !/Fast-forward/.test(t.slice(t.lastIndexOf('merge --no-ff')));
    }, null, { timeout: T(5000) });
  });
  await step(lab, 'la práctica renombra ramas con branch -m: el grafo, el reflog y el panel de actividad lo dicen', async () => {
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await lab.selectOption('.pr-ex', '1');
    for (const c of ['branch -m feature feature/login', 'branch -m trunk', 'reflog']) await send(c);
    await lab.waitForFunction(() => {
      const heads = [...document.querySelectorAll('#graph svg .head .h-name')].map((n) => n.textContent.trim());
      const log = document.querySelector('.pr-log')?.textContent || '';
      const feed = document.querySelector('#feed')?.textContent || '';
      return (
        heads.includes('trunk') && heads.includes('feature/login') && !heads.includes('main') && !heads.includes('feature') &&
        log.includes('Branch: renamed refs/heads/main to refs/heads/trunk') &&
        feed.includes('Rama feature renombrada a feature/login') && feed.includes('Rama main renombrada a trunk')
      );
    }, null, { timeout: T(5000) });
    await send('branch -m nope x');
    await lab.waitForFunction(() => (document.querySelector('.pr-log')?.textContent || '').includes("fatal: no branch named 'nope'"), null, { timeout: T(5000) });
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
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent === 'Trae feature a main.', null, { timeout: T(5000) });
    if (await lab.locator('.pr-ex b').count()) throw new Error('el título se interpretó como HTML');
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio propio parte resuelto');
    await lab.click('.pr-share');
    const url = await lab.inputValue('.pr-link');
    if (!/[?&]practice=[\w-]+$/.test(url)) throw new Error(`enlace raro: ${url}`);
    if (!new URL(lab.url()).searchParams.get('practice')) throw new Error('la URL de la barra no lleva el ejercicio');
    await lab.goto(url.replace(/^https?:\/\/[^/]+/, base) + '&lang=es');
    await lab.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'practice/git' && document.querySelector('.pr-goal')?.textContent === 'Trae feature a main.', null, { timeout: T(15000) });
    await lab.fill('.pr-input', 'merge feature');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
    // una URL con basura no rompe nada: abre la demo
    await lab.goto(`${base}/index.html?lang=es&practice=%3Cscript%3E`);
    await loaded(lab);
    if (await lab.isVisible('#practice')) throw new Error('un código inválido abrió la práctica');
  });
  await step(lab, 'el ejercicio de cherry-pick y tag se abre por su número, copia un commit y se marca resuelto', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=5`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('cherry-pick'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    await lab.fill('.pr-input', 'checkout main');
    await lab.press('.pr-input', 'Enter');
    await lab.fill('.pr-input', 'cherry-pick feature');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('Hotfix: escape the login URL'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('se resolvió sin la etiqueta');
    await lab.fill('.pr-input', 'tag v1.0.1');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
  });
  await step(lab, 'el ejercicio de push y fetch: el remoto rechaza el push, fetch trae origin/main al grafo y se resuelve', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=14`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('fetch'), null, { timeout: T(5000) });
    await lab.waitForSelector('#graph svg .node', { state: 'attached', timeout: T(10000) });
    const heads = () => lab.evaluate(() => [...document.querySelectorAll('#graph svg .head .h-name')].map((n) => n.textContent.trim()));
    if (!(await heads()).includes('origin/main')) throw new Error('el grafo no muestra origin/main');
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    await send('push');
    await lab.waitForFunction(() => /\[rejected\][\s\S]*fetch first/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    const nodes = await lab.locator('#graph svg .node').count();
    await send('fetch');
    // el commit de Ana llega al grafo por origin/main, sin mover main
    await lab.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length === n + 1, nodes, { timeout: T(5000) });
    await send('status');
    await lab.waitForFunction(() => /have diverged/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('se resolvió sin subir');
    await send('merge origin/main');
    await send('push');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
    await send('log --oneline');
    await lab.waitForFunction(() => /\(HEAD -> main, origin\/main\) Merge remote-tracking branch 'origin\/main'/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
  });
  await step(lab, 'el ejercicio de pull y poda: pull trae la fusión de Ana, fetch --prune quita origin/feature del grafo y push --delete borra experiment', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=15`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('--prune'), null, { timeout: T(5000) });
    await lab.waitForSelector('#graph svg .node', { state: 'attached', timeout: T(10000) });
    const heads = () => lab.evaluate(() => [...document.querySelectorAll('#graph svg .head .h-name')].map((n) => n.textContent.trim()));
    const start = await heads();
    if (!start.includes('origin/feature') || !start.includes('origin/experiment')) throw new Error('el grafo no muestra las ramas subidas: ' + JSON.stringify(start));
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    const send = async (c) => {
      await lab.fill('.pr-input', c);
      await lab.press('.pr-input', 'Enter');
    };
    const nodes = await lab.locator('#graph svg .node').count();
    await send('pull');
    // la fusión de Ana llega al grafo y main avanza rápido hasta ella
    await lab.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length === n + 1, nodes, { timeout: T(5000) });
    await lab.waitForFunction(() => /Fast-forward/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    if (!(await heads()).includes('origin/feature')) throw new Error('pull sin --prune quitó origin/feature');
    await send('fetch --prune');
    await lab.waitForFunction(() => /\[deleted\]\s+\(none\)\s+-> origin\/feature/.test(document.querySelector('.pr-log')?.textContent || ''), null, { timeout: T(5000) });
    await lab.waitForFunction(() => ![...document.querySelectorAll('#graph svg .head .h-name')].some((n) => n.textContent.trim() === 'origin/feature'), null, { timeout: T(5000) });
    await send('branch -d feature');
    await send('push origin --delete experiment');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
    // la etiqueta borrada se deshace en polvo: se espera a que se vaya, no un tiempo
    await lab.waitForFunction(() => ![...document.querySelectorAll('#graph svg .head .h-name')].some((n) => n.textContent.trim() === 'origin/experiment'), null, { timeout: T(5000) });
  });
  await step(lab, 'el ejercicio de revert se abre por su número, deshace un commit con otro nuevo y se marca resuelto', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=6`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('revert'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    await lab.fill('.pr-input', 'revert HEAD~1');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('Revert "Break checkout totals"'), null, { timeout: T(5000) });
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
  });
  await step(lab, 'el ejercicio de stash: con cambios a medias checkout falla, stash los guarda y stash pop los devuelve', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=7`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('stash pop'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    const send = async (line) => {
      await lab.fill('.pr-input', line);
      await lab.press('.pr-input', 'Enter');
    };
    await send('checkout main');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('Please commit your changes or stash them'), null, { timeout: T(5000) });
    for (const line of ['stash', 'checkout main', 'commit -m "Fix login redirect"', 'checkout feature']) await send(line);
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes("Switched to branch 'feature'"), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('se resolvió sin stash pop');
    await send('stash pop');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('modified:   profile.js'), null, { timeout: T(5000) });
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
  });
  await step(lab, 'el ejercicio de abort: merge --no-commit deja la fusión a medias y merge --abort la cancela y lo resuelve', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=8`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.waitForFunction(() => document.querySelector('.pr-goal')?.textContent.includes('merge --abort'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('el ejercicio parte resuelto');
    const send = async (line) => {
      await lab.fill('.pr-input', line);
      await lab.press('.pr-input', 'Enter');
    };
    await send('merge feature --no-commit');
    await lab.waitForFunction(() => document.querySelector('.pr-log')?.textContent.includes('stopped before committing'), null, { timeout: T(5000) });
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('se resolvió sin cancelar la fusión');
    await send('merge --abort');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
  });
  await step(lab, 'un ejercicio propio con pistas: el botón las muestra una a una y la condición de mensaje lo resuelve', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=1`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    if (await lab.isVisible('.pr-hint')) throw new Error('un ejercicio de la lista muestra el botón de pista');
    await lab.click('.pr-make summary');
    await lab.fill('.pr-m-title', 'Con pistas');
    await lab.fill('.pr-m-goal', 'Haz un commit en feature.');
    await lab.fill('.pr-m-setup', 'checkout -b feature');
    await lab.fill('.pr-m-hints', 'Primera <b>pista</b>\nSegunda pista');
    await lab.fill('.pr-m-checks', 'tip:feature~listo');
    await lab.click('.pr-m-go');
    await lab.waitForSelector('.pr-hint:not([hidden])', { timeout: T(5000) });
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
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
  });
  await step(lab, 'una solución compartida: solo el enlace con solution=1 la muestra, paso a paso y sin ejecutarla', async () => {
    await lab.goto(`${base}/index.html?lang=es&practice=1`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    await lab.click('.pr-make summary');
    await lab.fill('.pr-m-title', 'Con solución');
    await lab.fill('.pr-m-goal', 'Crea feature.');
    await lab.fill('.pr-m-setup', 'commit -m base');
    await lab.fill('.pr-m-solution', 'branch feature\ncheckout <b>feature</b>');
    await lab.fill('.pr-m-checks', 'exists:feature');
    await lab.click('.pr-m-go');
    await lab.waitForFunction(() => document.querySelector('.pr-m-err')?.textContent.trim() !== '', null, { timeout: T(5000) });
    await lab.fill('.pr-m-solution', 'branch feature\ncheckout feature');
    await lab.click('.pr-m-go');
    await lab.waitForSelector('.pr-share-solution:not([hidden])', { timeout: T(5000) });
    if (await lab.isVisible('.pr-solution')) throw new Error('la solución se ofrece sin que el enlace la pida');
    await lab.click('.pr-share-solution');
    const link = await lab.inputValue('.pr-link');
    if (!/[?&]solution=1/.test(link)) throw new Error(`el enlace no pide la solución: ${link}`);
    await lab.goto(`${link}&lang=es`);
    await lab.waitForSelector('.pr-solution:not([hidden])', { timeout: T(15000) });
    await lab.click('.pr-solution');
    let log = await lab.textContent('.pr-log');
    if (!log.includes('Paso 1 de 2: git branch feature') || log.includes('Paso 2')) throw new Error(`primer paso: ${log}`);
    if ((await lab.textContent('.pr-status')).trim() !== '') throw new Error('mostrar la solución resolvió el ejercicio');
    await lab.click('.pr-solution');
    log = await lab.textContent('.pr-log');
    if (!log.includes('Paso 2 de 2: git checkout feature')) throw new Error(`segundo paso: ${log}`);
    if (!(await lab.isDisabled('.pr-solution'))) throw new Error('el botón sigue activo sin más pasos');
    await lab.fill('.pr-input', 'branch feature');
    await lab.press('.pr-input', 'Enter');
    await lab.waitForFunction(() => document.querySelector('.pr-status')?.textContent.trim() !== '', null, { timeout: T(5000) });
    // el mismo código sin solution=1 no la ofrece
    await lab.goto(`${link.replace(/&?solution=1/, '')}&lang=es`);
    await lab.waitForSelector('#practice:not([hidden]) .pr-make', { timeout: T(15000) });
    if (await lab.isVisible('.pr-solution')) throw new Error('sin solution=1 se ofrece la solución');
  });
  await lab.context().close();

  const full = await openPage({ viewport: { width: 1280, height: 800 } });
  await full.unroute('https://api.github.com/**');
  await full.route('https://api.github.com/**', gh.handle);
  await step(full, 'ensayar un comando: la copia del repo real cambia sin tocar al original ni gastar cuota', async () => {
    await full.goto(`${base}/index.html?lang=es&repo=o/b`);
    await full.waitForFunction(() => document.querySelector('#status')?.dataset.state === 'live' && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(15000) });
    await full.waitForSelector('#rehearse-btn:not([hidden])', { timeout: T(5000) });
    await full.click('#view-2d');
    await full.waitForSelector('#graph svg .node', { timeout: T(10000) });
    const real = await full.locator('#graph svg .node').count();
    let calls = 0;
    const count = (req) => req.url().startsWith('https://api.github.com/') && calls++;
    full.on('request', count);
    await full.click('#rehearse-btn');
    await full.waitForFunction(() => !document.querySelector('#practice').hidden && document.querySelector('.pr-goal')?.textContent.includes('o/b'), null, { timeout: T(10000) });
    await full.waitForSelector('#graph svg .node', { timeout: T(10000) });
    await full.fill('.pr-input', 'commit -m "ensayo <b>x</b>"');
    await full.press('.pr-input', 'Enter');
    await full.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length > n, real, { timeout: T(10000) });
    if (await full.locator('.pr-log b').count()) throw new Error('la terminal interpretó HTML');
    if (await full.locator('.pr-make').isVisible()) throw new Error('el ensayo ofrece crear ejercicios');
    await full.click('#repo-tabs .rt:nth-child(1) .rt-main'); // vuelve al repo real: el ensayo se cierra
    await full.waitForFunction(() => document.querySelector('#practice').hidden && document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(5000) });
    full.off('request', count);
    await full.waitForFunction((n) => document.querySelectorAll('#graph svg .node').length === n, real, { timeout: T(5000) }).catch(() => {
      throw new Error('el repo real cambió con el ensayo');
    });
    if (calls) throw new Error(`el ensayo hizo ${calls} consultas a la API`);
  });
  await step(
    full,
    'se siguen hasta 20 repos a la vez',
    async () => {
      const ten = Array.from({ length: 20 }, (_, i) => `repo=o/r${i}`).join('&'); // no existen: dan 404, da igual
      await full.goto(`${base}/index.html?lang=es&${ten}`);
      await full.waitForSelector('#repo-tabs:not([hidden])', { timeout: T(10000) });
      await full.fill('#repo-input', 'o/a');
      await full.press('#repo-input', 'Enter');
      const why = await full.$eval('#repo-input', (i) => i.validationMessage);
      const n = await full.locator('#repo-tabs .rt').count();
      if (n !== 20) throw new Error(`hay ${n} pestañas`);
      if (!why) throw new Error('no dice por qué no se suma el repo 21');
      // la constelación: una galaxia por repo seguido, con nombre, sin tocarse, y Intro lleva a su pestaña
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      const gx = await full.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => ({ label: b.getAttribute('aria-label'), r: b.getBoundingClientRect().toJSON() })));
      if (gx.length !== 20) throw new Error(`la constelación tiene ${gx.length} galaxias`);
      if (gx.some((g) => !g.label || /undefined|NaN|constellation\./.test(g.label))) throw new Error('galaxia sin nombre o con texto sin resolver: ' + JSON.stringify(gx.map((g) => g.label)));
      // repos que no cargaron ningún commit (dan 404): su galaxia no dice cuánto hace de un commit que no hay
      if (gx.some((g) => /\bhace\b|\bahora\b/.test(g.label))) throw new Error('una galaxia sin commits dice cuánto hace: ' + JSON.stringify(gx.map((g) => g.label)));
      for (let i = 0; i < gx.length; i++)
        for (let j = i + 1; j < gx.length; j++) {
          const a = gx[i].r, b = gx[j].r;
          if (Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2) < (a.width + b.width) / 2 - 1) throw new Error(`las galaxias ${i} y ${j} se superponen`);
        }
      if (!(await full.evaluate(() => document.activeElement?.classList.contains('cs-gx')))) throw new Error('el foco no entra a la constelación');
      // el orden: por nombre (alfabético) y por actividad, y lo anuncia en la región viva
      await full.selectOption('#constellation-order', 'name');
      const byName = await full.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key));
      if (byName.join() !== [...byName].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })).join()) throw new Error('la constelación no se ordena por nombre: ' + byName);
      const said = await full.$eval('#constellation-status', (e) => e.textContent.trim());
      if (!said || /undefined|constellation\./.test(said)) throw new Error('el orden no se anuncia: ' + said);
      await full.selectOption('#constellation-order', 'activity');
      if ((await full.$$('#constellation .cs-gx')).length !== 20) throw new Error('al ordenar por actividad cambia el número de galaxias');
      await full.selectOption('#constellation-order', 'tabs');
      await full.focus('#constellation .cs-gx');
      await full.press('#constellation .cs-gx:focus', 'Tab');
      await full.keyboard.press('Enter');
      await full.waitForSelector('#constellation:not([open])', { state: 'attached', timeout: T(3000) });
      if (!(await full.locator('#repo-tabs .rt-main[aria-current="true"]').count())) throw new Error('Intro en una galaxia no abre su pestaña');
      // ?order=activity: la constelación abre ya ordenada por actividad, con el selector de acuerdo
      await full.goto(`${base}/index.html?lang=es&order=activity&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      if ((await full.$eval('#constellation-order', (s) => s.value)) !== 'activity') throw new Error('?order=activity no deja el selector en actividad');
      await full.click('#constellation-close');
      // ?order=prs: abre ordenada por PRs abiertos, con el selector de acuerdo
      await full.goto(`${base}/index.html?lang=es&order=prs&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      if ((await full.$eval('#constellation-order', (s) => s.value)) !== 'prs') throw new Error('?order=prs no deja el selector en PRs abiertos');
      await full.selectOption('#constellation-order', 'prs');
      const prsSaid = await full.$eval('#constellation-status', (e) => e.textContent.trim());
      if (!/PR/.test(prsSaid) || /undefined|constellation\./.test(prsSaid)) throw new Error('el orden por PRs no se anuncia: ' + prsSaid);
      await full.click('#constellation-close');
      // ?order=issues: abre ordenada por issues abiertos (los de la consulta del repo, menos sus PRs), con el anuncio traducido
      gh.repo('o/a').openItems = 1; // 1 issue
      gh.repo('o/b').openItems = 5; // 3 issues y sus 2 PRs abiertos
      gh.repo('o/c').openItems = 4; // 4 issues
      gh.repo('o/a').stars = 50; // y estrellas, en otro orden: o/a, o/c, o/b
      gh.repo('o/c').stars = 7;
      gh.repo('o/b').forks = 30; // y forks, en otro: o/b, o/a, o/c
      gh.repo('o/a').forks = 3;
      // en una página aparte: sus tres repos no se suman a las 20 pestañas guardadas que siguen usando los pasos de abajo
      const iss = await openPage({ viewport: { width: 1280, height: 800 } });
      await iss.unroute('https://api.github.com/**');
      await iss.route('https://api.github.com/**', gh.handle);
      try {
        await iss.goto(`${base}/index.html?lang=es&order=issues&repo=o/a&repo=o/b&repo=o/c`);
        await iss.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt')].filter((t) => t.dataset.state === 'live').length === 3, null, { timeout: T(15000) });
        await iss.click('#constellation-btn');
        await iss.waitForSelector('#constellation[open]', { timeout: T(3000) });
        if ((await iss.$eval('#constellation-order', (s) => s.value)) !== 'issues') throw new Error('?order=issues no deja el selector en issues abiertos');
        const byIssues = await iss.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key).join(' '));
        if (byIssues !== 'o/c o/b o/a') throw new Error('la constelación no se ordena por issues abiertos (sin contar los PRs): ' + byIssues);
        await iss.selectOption('#constellation-order', 'issues');
        const issuesSaid = await iss.$eval('#constellation-status', (e) => e.textContent.trim());
        if (!/Issues abiertos/.test(issuesSaid) || /undefined|constellation\./.test(issuesSaid)) throw new Error('el orden por issues no se anuncia: ' + issuesSaid);
        // por estrellas: el total de la misma consulta del repo, sin otra
        await iss.selectOption('#constellation-order', 'stars');
        const byStars = await iss.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key).join(' '));
        if (byStars !== 'o/a o/c o/b') throw new Error('la constelación no se ordena por estrellas: ' + byStars);
        const starsSaid = await iss.$eval('#constellation-status', (e) => e.textContent.trim());
        if (!/Estrellas/.test(starsSaid) || /undefined|constellation\./.test(starsSaid)) throw new Error('el orden por estrellas no se anuncia: ' + starsSaid);
        // por forks: también el total de la misma consulta del repo
        await iss.selectOption('#constellation-order', 'forks');
        const byForks = await iss.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key).join(' '));
        if (byForks !== 'o/b o/a o/c') throw new Error('la constelación no se ordena por forks: ' + byForks);
        const forksSaid = await iss.$eval('#constellation-status', (e) => e.textContent.trim());
        if (!/Forks/.test(forksSaid) || /undefined|constellation\./.test(forksSaid)) throw new Error('el orden por forks no se anuncia: ' + forksSaid);
        await iss.click('#constellation-close');
        // ?order=forks: abre ya ordenada por forks, con el selector de acuerdo
        await iss.goto(`${base}/index.html?lang=es&order=forks&repo=o/a&repo=o/b&repo=o/c`);
        await iss.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt')].filter((t) => t.dataset.state === 'live').length === 3, null, { timeout: T(15000) });
        await iss.click('#constellation-btn');
        await iss.waitForSelector('#constellation[open]', { timeout: T(3000) });
        if ((await iss.$eval('#constellation-order', (s) => s.value)) !== 'forks') throw new Error('?order=forks no deja el selector en forks');
        const openForks = await iss.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key).join(' '));
        if (openForks !== 'o/b o/a o/c') throw new Error('?order=forks no abre la constelación ordenada por forks: ' + openForks);
        await iss.click('#constellation-close');
        // ?order=recent: el commit más reciente ya cargado primero, sin consultas nuevas (repos y página aparte, sin las pestañas de arriba)
        for (const r of ['rec/dos', 'rec/uno', 'rec/tres']) gh.repo(r); // en ese orden: sus commits, del más viejo al más nuevo
        gh.push('rec/uno', 'main', 'lo más nuevo');
        const rec = await openPage({ viewport: { width: 1280, height: 800 } });
        try {
          await rec.unroute('https://api.github.com/**');
          await rec.route('https://api.github.com/**', gh.handle);
          await rec.goto(`${base}/index.html?lang=es&order=recent&repo=rec/tres&repo=rec/dos&repo=rec/uno`);
          await rec.waitForFunction(() => { const t = [...document.querySelectorAll('#repo-tabs .rt')]; return t.length === 3 && t.every((x) => x.dataset.state === 'live'); }, null, { timeout: T(15000) });
          await rec.click('#constellation-btn');
          await rec.waitForSelector('#constellation[open]', { timeout: T(3000) });
          if ((await rec.$eval('#constellation-order', (s) => s.value)) !== 'recent') throw new Error('?order=recent no deja el selector en último commit');
          const byRecent = await rec.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => b.dataset.key).join(' '));
          if (byRecent !== 'rec/uno rec/tres rec/dos') throw new Error('?order=recent no abre la constelación con el commit más reciente primero: ' + byRecent);
          // cada galaxia dice cuánto hace de su commit más reciente ya cargado, en su nombre accesible y en su globo
          const when = await rec.$$eval('#constellation .cs-gx', (bs) => bs.map((b) => [b.getAttribute('aria-label'), b.title]));
          for (const [label, title] of when)
            if (!/, (ahora|hace \d+ (s|min))(,|$)/.test(label) || !/ · (ahora|hace \d+ (s|min))$/.test(title)) throw new Error('la galaxia no dice cuánto hace de su último commit: ' + JSON.stringify(when));
          await rec.selectOption('#constellation-order', 'tabs');
          await rec.selectOption('#constellation-order', 'recent');
          const recentSaid = await rec.$eval('#constellation-status', (e) => e.textContent.trim());
          if (!/Último commit/.test(recentSaid) || /undefined|constellation\./.test(recentSaid)) throw new Error('el orden por último commit no se anuncia: ' + recentSaid);
        } finally {
          await rec.context().close();
        }
        // una galaxia quieta (su commit más reciente cargado tiene más de 30 días) lo dice en su nombre y su globo; la reciente no
        const old = Date.now() - 45 * 864e5;
        for (const c of gh.repo('rec/viejo').commits.values()) c.commit.author.date = c.commit.committer.date = new Date(old).toISOString();
        const qui = await openPage({ viewport: { width: 1280, height: 800 } });
        try {
          await qui.unroute('https://api.github.com/**');
          await qui.route('https://api.github.com/**', gh.handle);
          await qui.goto(`${base}/index.html?lang=es&repo=rec/viejo&repo=rec/uno`);
          await qui.waitForFunction(() => { const t = [...document.querySelectorAll('#repo-tabs .rt')]; return t.length === 2 && t.every((x) => x.dataset.state === 'live'); }, null, { timeout: T(15000) });
          await qui.click('#constellation-btn');
          await qui.waitForSelector('#constellation[open]', { timeout: T(3000) });
          const quiet = await qui.$$eval('#constellation .cs-gx', (bs) => Object.fromEntries(bs.map((b) => [b.dataset.key, { label: b.getAttribute('aria-label'), title: b.title, quiet: b.dataset.quiet === 'true' }])));
          if (!/sin actividad hace más de 30 días/.test(quiet['rec/viejo'].label) || !/sin actividad hace más de 30 días/.test(quiet['rec/viejo'].title) || !quiet['rec/viejo'].quiet) throw new Error('la galaxia quieta no lo dice: ' + JSON.stringify(quiet['rec/viejo']));
          if (/sin actividad/.test(quiet['rec/uno'].label) || quiet['rec/uno'].quiet) throw new Error('la galaxia reciente dice que está quieta: ' + JSON.stringify(quiet['rec/uno']));
        } finally {
          await qui.context().close();
        }
      } finally {
        for (const r of ['o/a', 'o/b', 'o/c']) Object.assign(gh.repo(r), { openItems: 0, stars: 0, forks: 0 });
        await iss.context().close();
      }
      // ?order=new: abre ordenada por ramas nuevas de la semana, con el selector de acuerdo y el anuncio traducido
      await full.goto(`${base}/index.html?lang=es&order=new&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      if ((await full.$eval('#constellation-order', (s) => s.value)) !== 'new') throw new Error('?order=new no deja el selector en ramas nuevas');
      await full.selectOption('#constellation-order', 'new');
      const newSaid = await full.$eval('#constellation-status', (e) => e.textContent.trim());
      if (!/Ramas nuevas/.test(newSaid) || /undefined|constellation\./.test(newSaid)) throw new Error('el orden por ramas nuevas no se anuncia: ' + newSaid);
      await full.click('#constellation-close');
      // ?order=name: abre ordenada por nombre
      await full.goto(`${base}/index.html?lang=es&order=name&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      if ((await full.$eval('#constellation-order', (s) => s.value)) !== 'name') throw new Error('?order=name no deja el selector en nombre');
      await full.click('#constellation-close');
      // ?constellation=r1: solo las galaxias cuyo nombre contiene el texto, y lo anuncia
      await full.goto(`${base}/index.html?lang=es&constellation=R1&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      await full.click('#constellation-btn');
      await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
      const filtered = await full.$$eval('#constellation .cs-gx', (b) => b.map((x) => x.dataset.key));
      if (!filtered.length || filtered.some((k) => !/r1/i.test(k)) || filtered.length >= 20) throw new Error('?constellation=R1 no filtra por nombre: ' + filtered);
      const filteredSaid = await full.$eval('#constellation-status', (e) => e.textContent.trim());
      if (!filteredSaid.includes('R1') || /undefined|constellation\./.test(filteredSaid)) throw new Error('el filtro no se anuncia: ' + filteredSaid);
      await full.click('#constellation-close');
      // ?recent=30: los commits del mock son de hace una hora o de ahora, así que siguen (mientras cargan, hasta los 20; con tantas pestañas escalonadas las que ya dieron 404 salen antes de que arranque la última, así que basta con que quede alguna); con ?recent=0.000001 (unos 86 ms) ya no queda ninguno
      for (const [days, want] of [['30', 20], ['0.000001', 0]]) {
        await full.goto(`${base}/index.html?lang=es&recent=${days}&repo=o/a`);
        await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
        await full.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt-main').length === 20, null, { timeout: T(10000) });
        // las pestañas que aún cargan no tienen commits y no se descartan: se reabre la constelación hasta que todas hayan cargado
        let n = -1;
        let said = '';
        const ok = () => (want ? n > 0 : n === 0);
        for (let tries = 0; tries < 60 && !ok(); tries++) {
          if (tries) await full.waitForTimeout(500);
          await full.click('#constellation-btn');
          await full.waitForSelector('#constellation[open]', { timeout: T(3000) });
          n = (await full.$$('#constellation .cs-gx')).length;
          said = await full.$eval('#constellation-status', (e) => e.textContent.trim());
          if (!ok()) await full.click('#constellation-close');
        }
        if (!ok()) throw new Error(`?recent=${days}: ${n} galaxias, se esperaban ${want ? 'alguna' : 'ninguna'}`);
        if (want < 20 && (!said || /undefined|constellation\./.test(said))) throw new Error('?recent no se anuncia: ' + said);
        await full.click('#constellation-close');
      }
      // un enlace a otro repo, con los 20 ya seguidos: entra el del enlace y sale el último guardado
      await full.goto(`${base}/index.html?lang=es&repo=o/a`);
      await full.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(10000) });
      const names = await full.locator('#repo-tabs .rt-name').allTextContents();
      if (names.length !== 20 || names.at(-1) !== 'o/a' || names.includes('o/r19')) throw new Error(`pestañas tras el enlace: ${names.join(' ')}`);
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
    await phonePage.waitForSelector('#repo-tabs:not([hidden])', { timeout: T(5000) });
    const over = await noOverflow(phonePage);
    if (over > 1) throw new Error(`la página es ${over}px más ancha que la pantalla`);
  });
  await phonePage.context().close();
}

if (seccion('Una organización o un usuario entero'))
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
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 3, null, { timeout: T(15000) });
    if ((await names()) !== 'acme/api* acme/web acme/viejo') throw new Error(`pestañas: ${await names()}`);
    const toast = await page.waitForSelector('#toasts .toast:has-text("Ahora sigues los repositorios más activos de acme")', { timeout: T(5000) });
    const detail = await toast.$eval('.toast-detail', (d) => d.textContent);
    if (detail !== 'api, web, viejo') throw new Error(`el aviso dice ${detail}`);
    const lists = gh.calls.filter((c) => /^\/(orgs|users)\/[^/]+\/repos$/.test(c));
    if (!lists.length || lists.some((c) => c !== '/orgs/acme/repos')) throw new Error(`consultas de la lista: ${lists.join(', ')}`); // las renovaciones piden la misma, una por organización
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["acme/api","acme/web","acme/viejo"]') throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'la salud se rehace al llegar las líneas por semana y el foco sigue donde estaba', async () => {
    // GitHub tarda en responder /stats/code_frequency: se retiene hasta que el foco ya está dentro del panel
    let release;
    const held = new Promise((r) => (release = r));
    const pattern = 'https://api.github.com/repos/acme/api/stats/code_frequency';
    await page.route(pattern, async (r) => {
      await held;
      await gh.handle(r);
    });
    try {
      await page.click('#health-btn');
      await page.waitForSelector('#health[open] #digest-org-md', { timeout: T(5000) });
      await page.focus('#digest-org-md');
      await page.evaluate(() => document.querySelector('#health-body .hl-sec').setAttribute('data-viejo', '')); // desaparece al rehacerse
      release();
      await page.waitForFunction(() => !document.querySelector('#health-body [data-viejo]'), null, { timeout: T(8000) });
      const at = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
      if (at !== 'digest-org-md') throw new Error(`al rehacerse el panel el foco cayó en ${at}`);
    } finally {
      release();
      await page.unroute(pattern);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: T(3000) });
  });

  await step(page, 'el resumen de la semana de la organización junta sus repos abiertos', async () => {
    await page.click('#health-btn');
    await page.waitForSelector('#digest-org-md', { timeout: T(5000) });
    const md = await page.$eval('#digest-org-md', (e) => e.textContent);
    if (!/^# .*acme/.test(md) || !/## acme\/(api|web|viejo)/.test(md)) throw new Error('resumen de la organización sin sus repos: ' + JSON.stringify(md.slice(0, 400)));
    if (/undefined|NaN|digest\./.test(md)) throw new Error('texto sin resolver en el resumen de la organización: ' + md.slice(0, 120));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#digest-org-save')]);
    if (!/^graphbranch-acme-semana-.*\.md$/.test(dl.suggestedFilename())) throw new Error('nombre del resumen de la organización: ' + dl.suggestedFilename());
    const [orgPng] = await Promise.all([page.waitForEvent('download', { timeout: T(5000) }), page.click('#digest-org-png')]);
    if (!/^graphbranch-acme-semana-.*\.png$/.test(orgPng.suggestedFilename())) throw new Error('nombre de la imagen de la organización: ' + orgPng.suggestedFilename());
    const orgPngPath = await orgPng.path();
    const orgHead = orgPngPath ? readFileSync(orgPngPath).subarray(0, 8).toString('hex') : '';
    if (orgHead !== '89504e470d0a1a0a') throw new Error('la imagen de la organización no es un PNG: ' + orgHead);
    await page.keyboard.press('Escape');
  });

  await step(page, 'los eventos de la organización llegan al panel, solo los de repos sin pestaña, con una consulta', async () => {
    gh.orgEvent({ type: 'WatchEvent', repo: { name: 'acme/lejano' } }); // sin pestaña: se muestra
    gh.orgEvent({ type: 'WatchEvent', repo: { name: 'acme/api' } }); // con pestaña: ya lo trae la suya
    await page.waitForFunction(() => [...document.querySelectorAll('#feed .act')].some((a) => a.textContent.includes('acme/lejano')), null, { timeout: T(15000) });
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
    await page.waitForFunction(() => [...document.querySelectorAll('#repo-tabs .rt-name')].some((n) => n.textContent === 'acme/nuevo'), null, { timeout: T(15000) });
    const toast = await page.waitForSelector('#toasts .toast:has-text("acme"):has(.toast-detail:text-is("nuevo"))', { timeout: T(5000) });
    if (!toast) throw new Error('sin aviso del repo nuevo');
    await page.waitForTimeout(4000); // dos renovaciones más: el cerrado no regresa
    if ((await names()).includes('acme/viejo')) throw new Error(`volvió el cerrado: ${await names()}`);
  });

  await step(page, 'al cerrar el último repo de la organización deja de seguirse', async () => {
    // con otro repo de por medio: con una sola pestaña la barra se esconde
    await page.fill('#repo-input', 'ana/notas');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 4, null, { timeout: T(15000) });
    // la lista de acme tarda más que el intervalo de renovación: al cerrar siempre hay una renovación en vuelo,
    // y al volver no puede guardar de nuevo la organización ni reabrir sus repos (fallaba a veces, por esa carrera)
    const slow = async (route) => { await new Promise((r) => setTimeout(r, 2000)); return gh.handle(route); };
    await page.route('https://api.github.com/orgs/acme/repos**', slow);
    try {
      await page.waitForTimeout(2000);
      for (const n of ['acme/api', 'acme/web', 'acme/nuevo']) await page.locator('.rt', { hasText: n }).locator('.rt-close').click();
      await page.waitForTimeout(3000); // la renovación en vuelo termina
    } finally {
      await page.unroute('https://api.github.com/orgs/acme/repos**', slow);
    }
    const owners = await page.evaluate(() => localStorage.getItem('graphbranch:owners'));
    if (owners !== null) throw new Error(`sigue guardada: ${owners}`);
    const left = await names();
    if (left !== 'ana/notas*') throw new Error(`volvieron repos de la organización dejada: ${left}`);
    await page.fill('#repo-input', 'org:acme');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('#repo-tabs .rt').length === 5, null, { timeout: T(15000) });
  });

  await step(page, 'una organización o un usuario que no existe lo dice en el campo', async () => {
    await page.fill('#repo-input', '@nadie');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-input').validationMessage.includes('nadie'), null, { timeout: T(10000) });
    const msg = await page.$eval('#repo-input', (i) => i.validationMessage);
    if (msg !== 'No se encontró en GitHub una organización o un usuario llamado nadie.') throw new Error(`el campo dice ${msg}`);
    if ((await repoTabs(page)).length !== 5) throw new Error('cambiaron las pestañas');
  }, { allow: /404/ });

  await step(page, 'con ?repo=@ana en la URL se siguen los repos de ese usuario', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/index.html?lang=es&repo=@ana`);
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/notas', null, { timeout: T(15000) });
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["ana/notas"]') throw new Error(`se guardó ${saved}`);
  }, { allow: /404/ });

  await step(page, 'compartir hacia la PWA: el enlace dentro del texto abre ese repo y sale de la dirección', async () => {
    await page.evaluate(() => localStorage.clear());
    const text = encodeURIComponent('Mira este PR: https://github.com/ana/notas/pull/1.');
    await page.goto(`${base}/index.html?lang=es&shared_title=Notas&shared_text=${text}`);
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/notas', null, { timeout: T(15000) });
    await page.waitForFunction(() => new URLSearchParams(location.search).get('repo') === 'ana/notas', null, { timeout: T(5000) });
    const left = await page.evaluate(() => [...new URLSearchParams(location.search).keys()].filter((k) => k.startsWith('shared_')));
    if (left.length) throw new Error(`la dirección sigue con ${left}`);
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
    if (rest === '/pipelines') {
      const ref = q.get('ref');
      const sha = branches.get(ref);
      return { body: sha ? [{ id: 1, ref, sha, status: ref === 'main' ? 'success' : 'running' }] : [] };
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

if (seccion('GitLab'))
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
    // su propio contexto, que se cierra entero (también si el paso falla): cerrar solo la página dejaba el
    // contexto vivo, con el service worker de la app en un proceso más, hasta el final del smoke
    const other = await openPage({ viewport: { width: 1280, height: 800 } });
    try {
      await other.route('https://gitlab.com/**', gl.handle);
      await other.addInitScript(quickGitLab);
      await other.goto(`${base}/index.html?lang=es`);
      await loaded(other);
      await other.fill('#repo-input', 'group:g');
      await other.press('#repo-input', 'Enter');
      await other.waitForSelector('#toasts .toast:has-text("Ahora sigues los repositorios más activos de g")', { timeout: T(15000) });
      const saved = await other.evaluate(() => localStorage.getItem('graphbranch:repos'));
      if (saved !== '["gitlab:g/sub/p"]') throw new Error(`se guardó ${saved}`);
      const lists = gl.calls.filter((c) => c.startsWith('/api/v4/groups/g/projects'));
      if (lists.length !== 1) throw new Error(`consultas de la lista: ${lists.length}`);
    } finally {
      await other.context().close();
    }
  });

  await step(page, 'en 2D, la rama de la MR lleva !5 y su ficha dice MR', async () => {
    await page.click('#view-2d');
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: T(15000) });
    if ((await label.textContent()) !== '!5') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const aria = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!aria.includes('MR !5')) throw new Error(`etiquetas: ${aria}`);
  });

  await step(page, 'CI de GitLab: la rama por defecto lleva la marca de su último pipeline', async () => {
    await page.waitForSelector('.h-ci.ci-success, .h3-ci.ci-success', { state: 'attached', timeout: T(15000) }); // la vista 2D de este paso puede estar fuera del cuadro
    if (!gl.calls.some((c) => c.startsWith('/api/v4/projects/g%2Fsub%2Fp/pipelines?ref=main'))) throw new Error('no preguntó por los pipelines de main');
  });

  await step(page, 'lo nuevo llega al panel: un push y la MR fusionada', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('Issue #9 abierto')), null, { timeout: T(15000) }); // del feed de eventos
    gl.push('main', 'fix: arreglo urgente');
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('fix: arreglo urgente')), null, { timeout: T(15000) });
    gl.merge();
    await page.waitForFunction(() => [...document.querySelectorAll('#feed li')].some((li) => li.textContent.includes('MR !5 fusionado en main')), null, { timeout: T(15000) });
    if (gl.calls.some((c) => /\/repository\/commits\?/.test(c))) throw new Error('pidió el listado de commits, que gitlab.com bloquea sin token');
  });

  await step(page, 'un proyecto que no existe lo dice, y ofrece Ajustes por si es privado', async () => {
    await page.fill('#repo-input', 'https://gitlab.com/g/nada/-/tree/main');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
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
    await page.waitForFunction(() => document.querySelector('#overlay[data-kind=error]:not([hidden])')?.textContent.includes('g/privado'), null, { timeout: T(15000) });
    await page.click('#overlay [data-ov=settings]');
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'gitlab-token-input') throw new Error(`Ajustes abrió con el foco en ${focus}`);
    await page.fill('#gitlab-token-input', GITLAB_TOKEN);
    await page.fill('#token-input', 'ghp_smoke0123456789');
    const from = gl.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'g/privado' && document.querySelector('#overlay').hidden, null, { timeout: T(15000) });
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
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/r' && document.querySelector('#overlay').hidden, null, { timeout: T(15000) });
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

if (seccion('Codeberg'))
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
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: T(15000) });
    if ((await label.textContent()) !== '#3') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const names = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!names.includes('feature/x') || !names.includes('main')) throw new Error(`ramas: ${names}`);
  });

  await step(page, 'un repo que no existe lo dice con el texto de Codeberg', async () => {
    await page.fill('#repo-input', 'https://codeberg.org/ana/nada');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró ana/nada en Codeberg. Solo se leen repositorios públicos.')) throw new Error(`el aviso dice ${text}`);
    // se deja de seguir: si no, al guardar un token se reconectaría y el 404 caería en el paso siguiente
    await page.locator('.rt', { hasText: 'ana/nada' }).locator('.rt-close').click();
  }, { allow: /404/ });

  await step(page, 'el token de Codeberg de Ajustes va en cada consulta, solo a Codeberg', async () => {
    await page.fill('#repo-input', 'https://codeberg.org/ana/api');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/api' && document.querySelector('#overlay').hidden, null, { timeout: T(15000) });
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.fill('#codeberg-token-input', 'cb-smoke0123');
    const from = cb.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'ana/api', null, { timeout: T(15000) });
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

if (seccion('Bitbucket'))
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
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: T(15000) });
    if ((await label.textContent()) !== '#3') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const names = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!names.includes('feature/x') || !names.includes('main')) throw new Error(`ramas: ${names}`);
  });

  await step(page, 'un repo que no existe lo dice con el texto de Bitbucket', async () => {
    await page.fill('#repo-input', 'https://bitbucket.org/ana/nada');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró ana/nada en Bitbucket. Solo se leen repositorios públicos.')) throw new Error(`el aviso dice ${text}`);
    // se deja de seguir: si no, al guardar un token se reconectaría y el 404 caería en el paso siguiente
    await page.locator('.rt', { hasText: 'ana/nada' }).locator('.rt-close').click();
  }, { allow: /404/ });

  await step(page, 'el token de Bitbucket de Ajustes va en cada consulta, solo a Bitbucket', async () => {
    await page.fill('#repo-input', 'https://bitbucket.org/ana/api');
    await page.press('#repo-input', 'Enter');
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'ana/api' && document.querySelector('#overlay').hidden, null, { timeout: T(15000) });
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.fill('#bitbucket-token-input', 'bb-smoke0123');
    const from = bb.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'ana/api', null, { timeout: T(15000) });
    await page.waitForTimeout(500);
    const sent = bb.auths.slice(from);
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some((a) => a !== 'Bearer bb-smoke0123')) throw new Error(`a Bitbucket fue ${[...new Set(sent)]}`);
    const saved = await page.evaluate(() => [localStorage.getItem('graphbranch:bitbucketToken'), localStorage.getItem('graphbranch:token')]);
    if (saved[0] !== JSON.stringify('bb-smoke0123') || saved[1] !== null) throw new Error(`se guardó ${saved}`);
  });
  await page.context().close();
}

/* ---------- Azure DevOps ---------- */

/** dev.azure.com simulado para la web: acme/web/api con main, una rama con dos commits y un PR activo. La lista de commits no trae los padres, como la real. */
function fakeAzure() {
  const WEB = 'https://dev.azure.com/acme/web/_git/api';
  const REPO = '/acme/web/_apis/git/repositories/api';
  const commits = new Map();
  const branches = new Map();
  const calls = [];
  const auths = [];
  let n = 0;
  const commit = (branch, title) => {
    const commitId = createHash('sha1').update(`az:${++n}`).digest('hex');
    const date = new Date(Date.now() - 3600e3 + n * 1000).toISOString();
    commits.set(commitId, { commitId, author: { name: 'Bea', date }, committer: { name: 'Bea', date }, comment: title, parents: branches.has(branch) ? [branches.get(branch)] : [] });
    branches.set(branch, commitId);
  };
  for (let i = 0; i < 4; i++) commit('main', `inicio ${i}`);
  branches.set('feature/x', branches.get('main'));
  commit('feature/x', 'feat: primera parte');
  commit('feature/x', 'feat: segunda parte');
  const chain = (id) => {
    const out = [];
    for (let s = id; s && commits.has(s); s = commits.get(s).parents[0]) out.push(commits.get(s));
    return out;
  };
  const json = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const az = {
    calls,
    auths,
    reject: false, // el servicio rechaza el token: 401 en cada consulta con Authorization
    handle: (route) => {
      const u = new URL(route.request().url());
      auths.push(route.request().headers().authorization || null);
      calls.push(u.pathname + u.search);
      const p = u.pathname;
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' } });
      if (az.reject && route.request().headers().authorization) return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"TF400813: The user is not authorized to access this resource."}' });
      if (p === REPO) return route.fulfill(json({ id: 'r1', name: 'api', webUrl: WEB, defaultBranch: 'refs/heads/main', project: { name: 'web', visibility: 'public', description: 'Un repo de Azure DevOps' } }));
      if (p === `${REPO}/refs` && u.searchParams.get('filter') === 'tags/') return route.fulfill(json({ count: 1, value: [{ name: 'refs/tags/v1.0-azure', objectId: 'a'.repeat(40), peeledObjectId: branches.get('main') }] })); // anotado: el commit es el pelado
      if (p === `${REPO}/refs`) return route.fulfill(json({ count: branches.size, value: [...branches].map(([name, objectId]) => ({ name: `refs/heads/${name}`, objectId })) }));
      if (p === `${REPO}/commits`) {
        const list = chain(u.searchParams.get('searchCriteria.itemVersion.version')).slice(0, Number(u.searchParams.get('searchCriteria.$top') || 100)).map(({ parents, ...c }) => c);
        return route.fulfill(json({ count: list.length, value: list }));
      }
      const chg = p.match(/\/repositories\/api\/commits\/(\w+)\/changes$/);
      if (chg && commits.has(chg[1])) return route.fulfill(json({ changes: [{ changeType: 'edit', item: { path: '/src/azure-cambio.js' } }, { changeType: 'add', item: { path: '/docs/nuevo.md' } }], allChangesIncluded: true }));
      const one = p.match(/\/repositories\/api\/commits\/(\w+)$/);
      if (one && commits.has(one[1])) return route.fulfill(json(commits.get(one[1])));
      if (p === `${REPO}/pullrequests`) {
        const pr = { pullRequestId: 3, title: 'Agrega la función x', status: 'active', isDraft: false, sourceRefName: 'refs/heads/feature/x', targetRefName: 'refs/heads/main', createdBy: { displayName: 'Bea', uniqueName: 'bea@example.com' }, creationDate: new Date().toISOString(), reviewers: [{ displayName: 'Cy', vote: 10 }, { displayName: 'Di', vote: -5 }, { displayName: 'Ed', vote: 0 }] };
        return route.fulfill(json({ count: 1, value: [pr] }));
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"TF401019: The Git repository does not exist or you do not have permissions."}' });
    },
  };
  return az;
}

if (seccion('Azure DevOps'))
{
  const az = fakeAzure();
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://dev.azure.com/**', az.handle);

  await step(page, 'conecta un repo de Azure DevOps (azure:acme/web/api), con su etiqueta y sin token', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=azure:acme/web/api`);
    await loaded(page);
    const link = await page.evaluate(() => {
      const a = document.querySelector('#repo-link');
      const b = document.querySelector('#repo-badge');
      return { text: a.textContent, href: a.href, badge: b.hidden ? null : b.textContent, banner: !document.querySelector('#token-banner').hidden };
    });
    if (link.text !== 'acme/web/api' || link.href !== 'https://dev.azure.com/acme/web/_git/api') throw new Error(`el título dice ${link.text} (${link.href})`);
    if (link.badge !== 'Azure DevOps') throw new Error(`la etiqueta dice ${link.badge}`);
    if (link.banner) throw new Error('muestra el aviso del token de GitHub');
    const saved = await page.evaluate(() => localStorage.getItem('graphbranch:repos'));
    if (saved !== '["azure:acme/web/api"]') throw new Error(`se guardó ${saved}`);
    if (az.auths.some(Boolean)) throw new Error('una consulta a Azure DevOps llevó un encabezado Authorization');
  });

  await step(page, 'en 2D se ven sus dos ramas y el PR #3', async () => {
    await page.click('#view-2d');
    const label = await page.waitForSelector('#graph .head .h-pr', { timeout: T(15000) });
    if ((await label.textContent()) !== '#3') throw new Error(`la etiqueta dice ${await label.textContent()}`);
    const names = await page.$$eval('#graph .head', (hs) => hs.map((h) => h.getAttribute('aria-label')).join(' | '));
    if (!names.includes('feature/x') || !names.includes('main')) throw new Error(`ramas: ${names}`);
  });

  await step(page, 'los tags de Azure DevOps (refs?filter=tags/, el anotado por su commit pelado) salen como bandera en el grafo', async () => {
    await page.waitForSelector('#graph .tag-flag .tag-text', { timeout: T(15000) });
    const text = await page.$eval('#graph .tag-flag .tag-text', (n) => n.textContent);
    if (text !== 'v1.0-azure') throw new Error(`la bandera dice ${text}`);
    if (!az.calls.some((c) => c.includes('filter=tags/'))) throw new Error('no pidió refs?filter=tags/');
  });

  await step(page, 'la ficha de la rama con PR de Azure DevOps lista sus revisores con el voto', async () => {
    const head = await page.$('#graph svg .head[role=button][aria-label*="feature/x"]');
    if (!head) throw new Error('no está la cabeza de feature/x');
    await head.focus();
    await page.keyboard.press('Enter');
    const row = await page.waitForSelector('#graph .tip .tip-reviewers', { timeout: T(5000) });
    const text = await row.textContent();
    if (text !== 'Revisores: Cy (aprobó), Di (espera al autor), Ed') throw new Error(`la ficha dice ${text}`);
    await page.keyboard.press('Escape');
  });

  await step(page, 'cambios de un commit de Azure DevOps: la ficha abre el panel con sus archivos (commits/{id}/changes)', async () => {
    const heads = await page.$$('#graph svg .head[role=button]');
    await heads[0].focus();
    await page.keyboard.press('Enter');
    const btn = await page.waitForSelector('#graph .tip .tip-diff', { timeout: T(5000) });
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#diff-panel:not([hidden]) .df-file', { timeout: T(5000) });
    const names = await page.$$eval('#diff-panel .df-jump', (b) => b.map((x) => x.textContent).join(' | '));
    if (!names.includes('azure-cambio.js') || !names.includes('nuevo.md')) throw new Error(`archivos del panel: ${names}`);
    if (!az.calls.some((c) => /\/commits\/\w+\/changes\?/.test(c))) throw new Error('no pidió commits/{id}/changes');
    await page.keyboard.press('Escape');
  });

  await step(page, 'el token de Azure DevOps de Ajustes va en cada consulta como Basic, solo a dev.azure.com', async () => {
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.fill('#azure-token-input', 'az-smoke0123');
    const from = az.auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'acme/web/api', null, { timeout: T(15000) });
    await page.waitForTimeout(500);
    const sent = az.auths.slice(from);
    const want = `Basic ${Buffer.from(':az-smoke0123').toString('base64')}`;
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some((a) => a !== want)) throw new Error(`a Azure DevOps fue ${[...new Set(sent)]}`);
    const saved = await page.evaluate(() => [localStorage.getItem('graphbranch:azureToken'), localStorage.getItem('graphbranch:token')]);
    if (saved[0] !== JSON.stringify('az-smoke0123') || saved[1] !== null) throw new Error(`se guardó ${saved}`);
  });

  await step(page, 'si Azure DevOps rechaza el token, el aviso lo dice y lleva a Ajustes', async () => {
    az.reject = true;
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.fill('#azure-token-input', 'az-vencido');
    await page.click('#settings-form button[type=submit]');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const text = await page.textContent('#overlay');
    if (!text.includes('El token de Azure DevOps no es válido')) throw new Error(`el aviso dice ${text}`);
    az.reject = false;
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.click('#token-clear');
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay').hidden && document.querySelector('#repo-link')?.textContent === 'acme/web/api', null, { timeout: T(15000) });
  }, { allow: /401/ });

  await step(page, 'se acepta pegar la URL de dev.azure.com y un repo que no existe lo dice con el texto de Azure DevOps', async () => {
    await page.fill('#repo-input', 'https://dev.azure.com/acme/web/_git/nada');
    await page.press('#repo-input', 'Enter');
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const text = await page.textContent('#overlay');
    if (!text.includes('No se encontró acme/web/nada en Azure DevOps. Solo se leen proyectos públicos.')) throw new Error(`el aviso dice ${text}`);
  }, { allow: /404/ });
  await page.context().close();
}

if (seccion('Bitbucket propio con token'))
{
  // el CSP de la web no nombra hosts propios (eso lo hace la app de escritorio con --bitbucket-url=): aquí se salta para ver qué sale
  const page = await openPage({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  const auths = [];
  await page.route(/^https:\/\/(bb|otro)\.example\.com\//, (route) => {
    auths.push([new URL(route.request().url()).host, route.request().headers().authorization || '']);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"errors":[{"message":"no existe"}]}' });
  });

  await step(page, 'sin ?bitbucket= no hay campo de token propio; con él, nombra su host y el token va solo ahí, atado a esa dirección', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if (await page.isVisible('#bbdc-token-field')) throw new Error('el campo se ve sin un servidor elegido');
    await page.goto(`${base}/index.html?lang=es&bitbucket=https://bb.example.com&repo=bitbucketdc:ANA/api`);
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    if (auths.some(([, a]) => a)) throw new Error('sin token, una consulta llevó credenciales');
    if (!(await page.textContent('#overlay')).includes('Solo se leen repositorios públicos')) throw new Error('sin token, el aviso no es el de siempre');
    await page.click('#overlay [data-ov=settings]');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'bbdc-token-input'))) throw new Error('«Abrir Ajustes» no lleva al campo del token propio');
    const where = await page.textContent('#bbdc-token-where');
    if (!where.includes('bb.example.com')) throw new Error(`el aviso dice ${where}`);
    await page.fill('#bbdc-token-input', 'dc-smoke0123');
    const from = auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay:not([hidden])')?.textContent.includes('el token no puede leerlo'), null, { timeout: T(15000) });
    await page.waitForTimeout(500);
    const sent = auths.slice(from);
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some(([h, a]) => h !== 'bb.example.com' || a !== 'Bearer dc-smoke0123')) throw new Error(`salió ${JSON.stringify(sent)}`);
    const text = await page.textContent('#overlay');
    if (!text.includes('el token no puede leerlo')) throw new Error(`con token, el aviso dice ${text}`);
    const saved = await page.evaluate(() => [JSON.parse(JSON.parse(localStorage.getItem('graphbranch:bbdcToken'))), localStorage.getItem('graphbranch:bitbucketToken')]);
    if (saved[0].base !== 'https://bb.example.com' || saved[0].token !== 'dc-smoke0123' || saved[1] !== null) throw new Error(`se guardó ${JSON.stringify(saved)}`);
  }, { allow: /404/ });

  await step(page, 'con otro ?bitbucket= el token guardado no se usa ni se muestra', async () => {
    const from = auths.length;
    await page.evaluate(() => localStorage.removeItem('graphbranch:repos'));
    await page.goto(`${base}/index.html?lang=es&bitbucket=https://otro.example.com&repo=bitbucketdc:ANA/api`);
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const sent = auths.slice(from);
    if (!sent.length || sent.some(([h, a]) => h !== 'otro.example.com' || a)) throw new Error(`salió ${JSON.stringify(sent)}`);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if ((await page.inputValue('#bbdc-token-input')) !== '') throw new Error('el campo muestra el token de otro servidor');
    if (!(await page.textContent('#bbdc-token-where')).includes('otro.example.com')) throw new Error('el aviso no nombra el servidor elegido');
  }, { allow: /404/ });
  await page.context().close();
}

if (seccion('Forgejo propio con token'))
{
  // como el de arriba: el CSP de la web no nombra hosts propios, aquí se salta para ver qué sale
  const page = await openPage({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  const auths = [];
  await page.route(/^https:\/\/(fg|otro)\.example\.com\//, (route) => {
    auths.push([new URL(route.request().url()).host, route.request().headers().authorization || '']);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"no existe"}' });
  });

  await step(page, 'sin ?forge= no hay campo de token propio; con él, nombra su host y el token va solo ahí, atado a esa dirección', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if (await page.isVisible('#forge-token-field')) throw new Error('el campo se ve sin un servidor elegido');
    await page.goto(`${base}/index.html?lang=es&forge=https://fg.example.com&repo=forgejo:ana/api`);
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    if (auths.some(([, a]) => a)) throw new Error('sin token, una consulta llevó credenciales');
    await page.click('#overlay [data-ov=settings]');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => document.activeElement?.id === 'forge-token-input'))) throw new Error('«Abrir Ajustes» no lleva al campo del token propio');
    const where = await page.textContent('#forge-token-where');
    if (!where.includes('fg.example.com')) throw new Error(`el aviso dice ${where}`);
    await page.fill('#forge-token-input', 'fg-smoke0123');
    const from = auths.length;
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#overlay:not([hidden])')?.textContent.includes('el token no puede leerlo'), null, { timeout: T(15000) });
    await page.waitForTimeout(500);
    const sent = auths.slice(from);
    if (!sent.length) throw new Error('al guardar el token no se reconectó el repo');
    if (sent.some(([h, a]) => h !== 'fg.example.com' || a !== 'token fg-smoke0123')) throw new Error(`salió ${JSON.stringify(sent)}`);
    const saved = await page.evaluate(() => [JSON.parse(JSON.parse(localStorage.getItem('graphbranch:forgeToken'))), localStorage.getItem('graphbranch:codebergToken')]);
    if (saved[0].base !== 'https://fg.example.com' || saved[0].token !== 'fg-smoke0123' || saved[1] !== null) throw new Error(`se guardó ${JSON.stringify(saved)}`);
  }, { allow: /404/ });

  await step(page, 'con otro ?forge= el token guardado no se usa ni se muestra', async () => {
    const from = auths.length;
    await page.evaluate(() => localStorage.removeItem('graphbranch:repos'));
    await page.goto(`${base}/index.html?lang=es&forge=https://otro.example.com&repo=forgejo:ana/api`);
    await page.waitForSelector('#overlay[data-kind=error]:not([hidden])', { timeout: T(15000) });
    const sent = auths.slice(from);
    if (!sent.length || sent.some(([h, a]) => h !== 'otro.example.com' || a)) throw new Error(`salió ${JSON.stringify(sent)}`);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    if ((await page.inputValue('#forge-token-input')) !== '') throw new Error('el campo muestra el token de otro servidor');
    if (!(await page.textContent('#forge-token-where')).includes('otro.example.com')) throw new Error('el aviso no nombra el servidor elegido');
  }, { allow: /404/ });
  await page.context().close();
}

if (seccion('Segunda cuenta de GitHub'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  const auths = [];
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', (route) => {
    const u = new URL(route.request().url());
    auths.push([u.pathname, route.request().headers().authorization || '']);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' });
  });
  await step(page, 'el token de la segunda cuenta va solo a los repos de su dueño y el principal a los demás', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings[open]', { timeout: T(3000) });
    await page.fill('#token-input', 'tok-principal0123');
    await page.fill('#token2-owner', 'Acme');
    await page.fill('#token2-input', 'tok-segunda0123');
    await page.click('#settings-form button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('#settings').open, null, { timeout: T(3000) });
    const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('graphbranch:account2'))));
    if (saved.owner !== 'Acme' || saved.token !== 'tok-segunda0123') throw new Error(`se guardó ${JSON.stringify(saved)}`);
    await page.goto(`${base}/index.html?lang=es&repo=acme/web&repo=otro/api`);
    await page.waitForTimeout(3000);
    const of = (owner) => auths.filter(([path]) => path.startsWith(`/repos/${owner}/`));
    if (!of('acme').length || !of('otro').length) throw new Error(`no se consultaron los dos repos: ${JSON.stringify(auths)}`);
    if (of('acme').some(([, a]) => a !== 'Bearer tok-segunda0123')) throw new Error(`acme salió con ${JSON.stringify(of('acme'))}`);
    if (of('otro').some(([, a]) => a !== 'Bearer tok-principal0123')) throw new Error(`otro salió con ${JSON.stringify(of('otro'))}`);
  }, { allow: /404/ });
  await page.context().close();
}

if (seccion('Fijar una rama con el teclado'))
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
    const head = await page.waitForSelector('#graph svg .head[role=button]', { timeout: T(10000) });
    await head.focus();
    await page.keyboard.press('Enter');
    const pin = await page.waitForSelector('#graph .tip .tip-pin', { timeout: T(5000) });
    const before = await pin.getAttribute('data-on');
    if ((await pin.getAttribute('aria-pressed')) !== null) throw new Error('Fijar cambia de texto y no debe llevar aria-pressed');
    await pin.focus();
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => {
      const el = document.activeElement;
      return { focus: el?.className || el?.tagName, pressed: el?.dataset.on };
    });
    if (after.focus !== 'tip-pin') throw new Error(`tras fijar, el foco quedó en ${after.focus}`);
    if (after.pressed === before) throw new Error('el botón no cambió de estado');
  });

  await step(page, 'la leyenda 2D se recorre con Tab y Enter lleva al commit de la rama', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/f`);
    await loaded(page);
    await page.click('#view-2d');
    const fila = await page.waitForSelector('#graph svg .legend-item[role=button]', { timeout: T(10000) });
    const r = await fila.evaluate((el) => ({ tab: el.getAttribute('tabindex'), nombre: el.getAttribute('aria-label'), titulo: el.querySelector('title')?.textContent }));
    if (r.tab !== '0' || !r.nombre?.includes(r.titulo)) throw new Error(`la fila de la leyenda no es enfocable con nombre: ${JSON.stringify(r)}`);
    await fila.focus();
    if (!(await page.evaluate(() => !!document.querySelector('#graph svg.dimmed')))) throw new Error('enfocar la fila no resalta su rama');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#graph svg .head.moved, #graph svg .node.moved', { timeout: T(4000) });
    const fantasma = await page.$$eval('#graph svg .legend-item.ghost-row[tabindex]', (xs) => xs.length);
    if (fantasma) throw new Error('las filas de ramas ya fusionadas no deben ser enfocables');
  });

  await step(page, 'pasar el puntero por el nombre de una rama de la leyenda 2D resalta solo sus commits, sin tocar filtro ni URL', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/f`);
    await loaded(page);
    await page.click('#view-2d');
    await page.waitForSelector('#graph svg .legend-item[role=button]', { timeout: T(10000) });
    const urlAntes = page.url();
    const filas = await page.$$('#graph svg .legend-item[role=button]');
    let visto = null;
    for (const fila of filas) {
      await fila.hover();
      visto = await page.evaluate(() => ({
        atenuado: !!document.querySelector('#graph svg.dimmed'),
        luz: document.querySelectorAll('#graph svg .node.hl').length,
        resto: document.querySelectorAll('#graph svg .node:not(.hl)').length,
      }));
      if (visto.luz && visto.resto) break;
    }
    if (!visto?.atenuado || !visto.luz || !visto.resto) throw new Error(`el puntero sobre la leyenda no deja una rama a la luz y el resto atenuado: ${JSON.stringify(visto)}`);
    await page.mouse.move(2, 2);
    const fuera = await page.evaluate(() => ({
      atenuado: !!document.querySelector('#graph svg.dimmed'),
      luz: document.querySelectorAll('#graph svg .hl').length,
      filtro: document.querySelector('#branch-filter').value,
    }));
    if (fuera.atenuado || fuera.luz) throw new Error(`al salir de la leyenda el resaltado se queda: ${JSON.stringify(fuera)}`);
    if (fuera.filtro) throw new Error('resaltar una rama cambió el filtro');
    if (page.url() !== urlAntes) throw new Error(`resaltar una rama cambió la URL: ${urlAntes} → ${page.url()}`);
  });

  // abierta con el teclado, la ficha recibe el foco (si no, para llegar a sus botones habría que
  // recorrer con Tab todas las etiquetas) y Esc la cierra y lo devuelve a la etiqueta
  const focusRoundTrip = async (view, label) => {
    await page.keyboard.press('Escape'); // ninguna ficha abierta de antes
    await page.click(`#view-${view}`);
    const head = await page.waitForSelector(label, { timeout: T(10000) });
    await head.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector(`#${view === '2d' ? 'graph' : 'graph3d'} .tip:not([hidden])`, { timeout: T(5000) });
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

if (seccion('Celular angosto: etiquetas 3D pisadas'))
{
  const page = await openPage({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  await step(page, 'a 320 px, una etiqueta 3D tapada por otra no recibe el toque (sigue accesible con Tab)', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.waitForSelector('#graph3d .g3-head', { timeout: T(15000) });
    await page.locator('#graph3d').scrollIntoViewIfNeeded();
    await page.waitForTimeout(T(2500));
    const r = await page.evaluate(() => {
      const tapadas = [...document.querySelectorAll('#graph3d .g3-head.tapada')].filter((e) => getComputedStyle(e).display !== 'none');
      return { tapadas: tapadas.length, tactiles: tapadas.filter((e) => getComputedStyle(e).pointerEvents !== 'none').map((e) => e.textContent.trim()), tab: tapadas.every((e) => e.tabIndex >= 0) };
    });
    if (!r.tapadas) throw new Error('ninguna etiqueta quedó tapada: el caso no se probó');
    if (r.tactiles.length) throw new Error(`etiquetas atenuadas que reciben el toque: ${r.tactiles.join(', ')}`);
    if (!r.tab) throw new Error('una etiqueta tapada quedó fuera del orden de Tab');
  });
  await step(page, 'a 320 px, las cifras ocupan tres columnas compactas y el grafo empieza antes', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    const r = await page.evaluate(() => {
      const stats = document.querySelector('.stats').getBoundingClientRect();
      const graph = document.querySelector('.graph-panel').getBoundingClientRect();
      return { alto: Math.round(stats.height), grafo: Math.round(graph.top + scrollY), ancho: document.documentElement.scrollWidth };
    });
    if (r.alto > 170) throw new Error(`las cifras ocupan ${r.alto} px de alto (compactas: hasta 170)`);
    if (r.grafo > 450) throw new Error(`el grafo empieza a ${r.grafo} px del inicio de la página`);
    if (r.ancho > 320) throw new Error(`la página se desborda a ${r.ancho} px`);
  });
  await step(page, 'a 320 px, un enlace «ir al grafo» salta al panel sin recorrer las cifras', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    const link = page.locator('#to-graph');
    if (!(await link.isVisible())) throw new Error('el enlace al grafo no se ve a 320 px');
    const nombre = (await link.textContent()).trim();
    if (!nombre || /^graph\./.test(nombre)) throw new Error(`el enlace no tiene texto traducido: «${nombre}»`);
    await link.click();
    const r = await page.evaluate(() => ({
      foco: document.activeElement && document.activeElement.id,
      arriba: Math.round(document.querySelector('.graph-panel').getBoundingClientRect().top),
    }));
    if (r.foco !== 'graph-panel') throw new Error(`el foco quedó en «${r.foco}», no en el panel del grafo`);
    if (r.arriba > 60) throw new Error(`el panel del grafo quedó a ${r.arriba} px del borde superior de la pantalla`);
  });
  await page.context().close();
}

if (seccion('Galaxias: cortar un salto hiperespacial'))
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

if (seccion('Efectos 3D con la vista 2D'))
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
    await page.waitForFunction(() => window.__g3, null, { timeout: T(5000) });
    await page.click('#view-2d');
    const before = await page.evaluate(() => window.__g3.nodes.size);
    // la demo trae commits cada 3 a 7 s: se espera a que llegue alguno con la 3D escondida
    await page.waitForFunction((n) => window.__g3.nodes.size > n, before, { timeout: T(30000) });
    await page.waitForTimeout(500);
    const q = await page.evaluate(() => ({ pending: window.__g3.pending.length, dying: window.__g3.dying.length }));
    await page.click('#view-3d');
    if (q.pending || q.dying) throw new Error(`la vista 3D escondida acumuló ${q.pending} efectos y ${q.dying} commits por desvanecer`);
  });
  await page.context().close();
}

if (seccion('Zumbido del espacio'))
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
    page.waitForFunction((v) => (window.__drone > 0) === v, on, { timeout: T(4000) }).then(
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

if (seccion('Movimiento reducido'))
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

if (seccion('Contraste del texto (WCAG AA)'))
for (const colorScheme of ['light', 'dark']) {
  const page = await openPage({ viewport: { width: 1280, height: 900 }, colorScheme });
  await step(page, `tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}: todo el texto visible se lee`, async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.waitForSelector('#feed > li', { timeout: T(30000) });
    const bad = await lowContrast(page);
    if (bad.length) throw new Error(`${bad.length} textos con poco contraste, como ${bad.slice(0, 3).join(', ')}`);
  });
  await page.context().close();
}

if (seccion('Foco de los campos de texto y colores forzados (Contraste alto)'))
{
  /** El fondo que de verdad se ve detrás de un elemento: el suyo o el del primer ancestro que tenga uno. */
  const fondos = (page, pares) =>
    page.evaluate((pares) => {
      const eff = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          const a = (c.match(/rgba?\(([^)]+)\)/)?.[1].split(/[ ,/]+/) || [])[3];
          if (a === undefined || Number(a) > 0) return c;
        }
        return 'lienzo';
      };
      return pares.map(([on, off]) => {
        const visible = (sel) => [...document.querySelectorAll(sel)].find((el) => el.offsetParent);
        const [a, b] = [visible(on), visible(off)];
        return { on, off, hay: !!a && !!b, fondoOn: a && eff(a), fondoOff: b && eff(b) };
      });
    }, pares);
  /** El contorno de la caja de un campo cuando su <input> tiene el foco. */
  const anillo = (page, input, caja) =>
    page.evaluate(([input, caja]) => {
      const el = document.querySelector(input);
      el.focus();
      const c = getComputedStyle(el.closest(caja));
      const r = { estilo: c.outlineStyle, ancho: parseFloat(c.outlineWidth) };
      el.blur();
      return r;
    }, [input, caja]);
  for (const forcedColors of ['none', 'active']) {
    const page = await openPage({ viewport: { width: 1280, height: 900 }, forcedColors });
    await step(page, `${forcedColors === 'active' ? 'con colores forzados' : 'sin colores forzados'}: el campo del repo y el filtro de ramas muestran el foco con un contorno`, async () => {
      await page.goto(`${base}/index.html?lang=es`);
      await loaded(page);
      for (const [input, caja] of [['#repo-input', '.repo-field'], ['#branch-filter', '.filter-field']]) {
        const r = await anillo(page, input, caja);
        if (r.estilo !== 'solid' || r.ancho < 2) throw new Error(`${input} con el foco: su caja queda con contorno «${r.estilo} ${r.ancho}px»`);
      }
    });
    if (forcedColors === 'active')
      await step(page, 'con colores forzados: la vista elegida y un botón pulsado se distinguen de los de al lado', async () => {
        await page.evaluate(() => document.querySelector('#pause-btn').getAttribute('aria-pressed') !== 'true' && document.querySelector('#pause-btn').click());
        await page.waitForFunction(() => document.querySelector('#pause-btn').getAttribute('aria-pressed') === 'true', null, { timeout: T(3000) });
        // el fondo del botón cambia con una transición de 0,15 s, y a mitad todavía es transparente: con el equipo cargado,
        // 600 ms de espera no alcanzaron (en la puerta, el 2026-11-12). Las transiciones se terminan antes de medir.
        await page.evaluate(() => {
          for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();
        });
        const pares = await fondos(page, [
          ['.view-switch button[aria-pressed="true"]', '.view-switch button[aria-pressed="false"]'],
          ['#pause-btn[aria-pressed="true"]', '#settings-btn'],
        ]);
        for (const p of pares) {
          if (!p.hay) throw new Error(`no están a la vista ${p.on} y ${p.off}`);
          if (p.fondoOn === p.fondoOff) throw new Error(`${p.on} se ve igual que ${p.off}: los dos sobre ${p.fondoOn}`);
        }
      });
    await page.context().close();
  }
}

if (seccion('Widget embebido (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, 'solo el grafo y los avisos, sin barras ni desborde', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&bg=transparent`);
    await loaded(page);
    await page.waitForSelector('#graph3d canvas, #graph canvas', { timeout: T(30000) });
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

if (seccion('Capa para streaming: color de fondo y &hide= (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&bg=00ff00 pinta el fondo de verde y &hide=notices,combo esconde los avisos', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&bg=00ff00&hide=notices,combo`);
    await loaded(page);
    await page.waitForSelector('#graph3d canvas, #graph canvas', { timeout: T(30000) });
    const r = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      toasts: getComputedStyle(document.querySelector('.toasts')).display,
      combo: getComputedStyle(document.querySelector('.combo')).display,
    }));
    if (r.bg !== 'rgb(0, 255, 0)') throw new Error(`&bg=00ff00 deja el fondo ${r.bg}`);
    if (r.toasts !== 'none' || r.combo !== 'none') throw new Error(`&hide= no esconde: ${JSON.stringify(r)}`);
  });
  await step(page, '&hide=legend,title,clock esconde la leyenda, el rótulo y las fechas', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&title=Hola&hide=legend,title,clock`);
    await loaded(page);
    await page.waitForSelector('.embed-title', { state: 'attached', timeout: T(30000) });
    const r = await page.evaluate(() => {
      const d = (s) => {
        const e = document.querySelector(s);
        return e ? getComputedStyle(e).display : 'ausente';
      };
      return { title: d('.embed-title'), legend: d('.legend'), cls: document.documentElement.className };
    });
    if (r.title !== 'none') throw new Error(`&hide=title deja el rótulo ${r.title}`);
    if (r.legend !== 'none' && r.legend !== 'ausente') throw new Error(`&hide=legend deja la leyenda ${r.legend}`);
    if (!/embed-hide-clock/.test(r.cls)) throw new Error('&hide=clock no marca la capa');
  });
  await step(page, 'sin &hide= los avisos siguen ahí (lo de siempre por defecto)', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1`);
    await loaded(page);
    const d = await page.evaluate(() => getComputedStyle(document.querySelector('.toasts')).display);
    if (d === 'none') throw new Error('los avisos se esconden sin &hide=');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &rotate= pasa de un repo a otro (?embed=1)'))
{
  const gh = fakeGitHub();
  for (const r of ['o/a', 'o/b']) gh.repo(r);
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  await step(page, '&rotate=5 alterna entre o/a y o/b; sin &rotate= se queda en el primero', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&repo=o/a&repo=o/b&rotate=5`);
    await loaded(page);
    const shown = () => page.textContent('#repo-link');
    if ((await shown()) !== 'o/a') throw new Error(`empieza en ${await shown()}`);
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/b', null, { timeout: T(15000) });
    await page.waitForFunction(() => document.querySelector('#repo-link')?.textContent === 'o/a', null, { timeout: T(15000) });
    await page.goto(`${base}/index.html?lang=es&embed=1&repo=o/a&repo=o/b`);
    await loaded(page);
    await page.waitForTimeout(7000);
    if ((await shown()) !== 'o/a') throw new Error(`sin &rotate= pasó a ${await shown()}`);
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &theme= fija el tema (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 }, colorScheme: 'light' });
  await step(page, '&theme=dark pinta la capa oscura aunque el sistema sea claro; sin &theme= sigue al sistema', async () => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.goto(`${base}/index.html?lang=es&embed=1&theme=dark`);
    await loaded(page);
    if ((await page.getAttribute('html', 'data-theme')) !== 'dark') throw new Error('falta data-theme=dark');
    const dark = await bg();
    await page.goto(`${base}/index.html?lang=es&embed=1`);
    await loaded(page);
    if (await page.getAttribute('html', 'data-theme')) throw new Error('data-theme sin &theme=');
    if ((await bg()) === dark) throw new Error('el fondo no cambió con &theme=dark');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &spin=0 apaga la rotación 3D (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&spin=0 deja la vista 3D quieta sin guardarlo; sin &spin= gira como siempre', async () => {
    const spin = () => page.getAttribute('#spin-btn', 'aria-pressed');
    await page.goto(`${base}/index.html?lang=es&embed=1&spin=0`);
    await loaded(page);
    if ((await spin()) !== 'false') throw new Error('&spin=0 no apaga la rotación');
    if (await page.evaluate(() => localStorage.getItem('graphbranch:spin3d'))) throw new Error('&spin=0 guardó la preferencia');
    await page.goto(`${base}/index.html?lang=es&embed=1`);
    await loaded(page);
    if ((await spin()) !== 'true') throw new Error('sin &spin= la rotación no sigue encendida');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &view= fija la vista (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&view=2d y &view=3d fijan la vista sin guardarla; sin &view= manda la guardada', async () => {
    const pressed = (id) => page.getAttribute(id, 'aria-pressed');
    await page.goto(`${base}/index.html?lang=es&embed=1&view=2d`);
    await loaded(page);
    if ((await pressed('#view-2d')) !== 'true') throw new Error('&view=2d no deja la vista 2D');
    if (await page.evaluate(() => localStorage.getItem('graphbranch:view'))) throw new Error('&view=2d guardó la vista');
    await page.goto(`${base}/index.html?lang=es&embed=1&view=3d`);
    await loaded(page);
    if ((await pressed('#view-3d')) !== 'true') throw new Error('&view=3d no deja la vista 3D');
    await page.evaluate(() => localStorage.setItem('graphbranch:view', JSON.stringify('2d')));
    await page.goto(`${base}/index.html?lang=es&embed=1`);
    await loaded(page);
    if ((await pressed('#view-2d')) !== 'true') throw new Error('sin &view= no manda la vista guardada');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &title= pone un rótulo propio (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&title= muestra el texto escapado sobre la capa; sin &title= no hay rótulo', async () => {
    await page.goto(`${base}/index.html?lang=es&embed=1&title=${encodeURIComponent('<b>Directo</b> de hoy')}`);
    await loaded(page);
    const t = await page.evaluate(() => {
      const el = document.querySelector('.embed-title');
      return el && { text: el.textContent, bolds: el.querySelectorAll('b').length, shown: el.offsetHeight > 0 };
    });
    if (!t || t.text !== '<b>Directo</b> de hoy' || t.bolds || !t.shown) throw new Error('rótulo mal: ' + JSON.stringify(t));
    await page.goto(`${base}/index.html?lang=es&embed=1`);
    await loaded(page);
    if (await page.$('.embed-title')) throw new Error('rótulo sin &title=');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &max= limita las ramas (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&max=2 deja 2 ramas en la capa; sin &max= las de la demo; valores inválidos, todas', async () => {
    const shown = async (q) => {
      await page.goto(`${base}/index.html?lang=es&embed=1${q}`);
      await loaded(page);
      await page.waitForSelector('#graph3d canvas, #graph canvas', { timeout: T(30000) });
      return page.evaluate(() => Number(document.querySelector('.graph-stage').dataset.embedBranches ?? -1));
    };
    if ((await shown('&max=2')) !== 2) throw new Error('&max=2 no deja 2 ramas');
    if (await shown('')  !== -1) throw new Error('sin &max= la capa marca ramas');
    if (await shown('&max=0') !== -1 || await shown('&max=abc') !== -1) throw new Error('un &max= inválido limita');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &branch= deja una rama (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&branch=develop deja 2 ramas (develop y la por defecto); una que no existe, solo la por defecto; sin &branch= ninguna marca', async () => {
    const shown = async (q) => {
      await page.goto(`${base}/index.html?lang=es&embed=1${q}`);
      await loaded(page);
      await page.waitForSelector('#graph3d canvas, #graph canvas', { timeout: T(30000) });
      return page.evaluate(() => Number(document.querySelector('.graph-stage').dataset.embedBranches ?? -1));
    };
    if ((await shown('&branch=develop')) !== 2) throw new Error('&branch=develop no deja 2 ramas');
    if ((await shown('&branch=no-existe')) !== 1) throw new Error('una rama inexistente no deja solo la por defecto');
    if ((await shown('&branch=%3Cb%3Ex')) !== 1) throw new Error('un nombre con HTML no se compara como texto');
    if ((await shown('')) !== -1) throw new Error('sin &branch= la capa marca ramas');
  });
  await page.context().close();
}

if (seccion('Capa para streaming: &pr=1 deja las ramas con un PR abierto (?embed=1)'))
{
  const page = await openPage({ viewport: { width: 640, height: 400 } });
  await step(page, '&pr=1 deja la rama por defecto y solo las ramas con PR abierto (2D y 3D); se combina con &max= y &branch=; &pr=0 no filtra', async () => {
    const open = async (q) => {
      await page.goto(`${base}/index.html?lang=es&embed=1${q}`);
      await loaded(page);
      await page.waitForSelector('#graph3d canvas, #graph svg .head', { timeout: T(30000), state: 'attached' });
      return page.evaluate(() => ({
        marked: Number(document.querySelector('.graph-stage').dataset.embedBranches ?? -1),
        heads: [...document.querySelectorAll('#graph svg .head:not(.ghost)')].map((g) => ({ name: g.__name, def: g.classList.contains('default'), pr: !!g.querySelector('.h-pr') })),
      }));
    };
    const all = await open('&view=2d');
    if (all.marked !== -1) throw new Error('sin &pr=1 la capa marca ramas');
    if (!all.heads.some((h) => !h.def && !h.pr)) throw new Error('la demo no trae una rama sin PR con que probar: ' + JSON.stringify(all.heads));
    const only = await open('&view=2d&pr=1');
    const rest = only.heads.filter((h) => !h.def);
    if (!only.heads.some((h) => h.def)) throw new Error('&pr=1 quitó la rama por defecto');
    if (!rest.length || rest.some((h) => !h.pr)) throw new Error('&pr=1 deja ramas sin PR o ninguna con PR: ' + JSON.stringify(only.heads));
    if (only.marked !== only.heads.length) throw new Error(`la marca (${only.marked}) no cuenta las ramas dibujadas (${only.heads.length})`);
    const in3d = await open('&view=3d&pr=1');
    if (in3d.marked !== only.marked) throw new Error(`en 3D &pr=1 deja ${in3d.marked} ramas y en 2D ${only.marked}`);
    if ((await open('&view=2d&pr=1&max=2')).marked !== 2) throw new Error('&pr=1&max=2 no deja 2 ramas');
    const sinPr = all.heads.find((h) => !h.def && !h.pr).name;
    if ((await open('&view=2d&pr=1&branch=' + encodeURIComponent(sinPr))).marked !== 1) throw new Error('&pr=1&branch= con una rama sin PR no deja solo la por defecto');
    if ((await open('&view=2d&pr=0')).marked !== -1) throw new Error('&pr=0 filtra la capa');
  });
  await page.context().close();
}

if (seccion('Filtro por ruta desde la URL (?path=)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre ya filtrado, atenúa el grafo, mantiene la ruta en la URL y al quitarlo la suelta', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una ruta');
    await page.goto(`${base}/index.html?lang=es&path=${encodeURIComponent('/' + word)}`);
    await loaded(page);
    await page.waitForSelector('#search-path-clear:not([hidden])', { state: 'attached', timeout: T(5000) }).catch(async () => {
      const st = await page.evaluate(() => ({ v: document.querySelector('#search-path').value, s: document.querySelector('#search-path-status').textContent, u: location.search }));
      throw new Error(`?path= no aplicó el filtro: ${JSON.stringify(st)} (ruta pedida «${word}»)`);
    });
    const on = await page.evaluate(() => ({
      value: document.querySelector('#search-path').value,
      dim: document.querySelectorAll('#graph svg .node.pfx').length,
      all: document.querySelectorAll('#graph svg .node').length,
      url: location.search,
    }));
    if (on.value !== word) throw new Error(`el campo de ruta quedó en «${on.value}», no en «${word}»`);
    if (!on.dim || on.dim >= on.all) throw new Error(`?path= no acota: ${on.dim} atenuados de ${on.all}`);
    if (!on.url.includes('path=')) throw new Error('la URL perdió la ruta: ' + on.url);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.click('#search-path-clear');
    if ((await page.evaluate(() => location.search)).includes('path=')) throw new Error('quitar el filtro deja la ruta en la URL');
  });
  await page.context().close();
}

if (seccion('Vista de un PR desde la URL (?pr=N)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, '?pr=N abre la vista del PR con su descripción y comentarios, y Esc la cierra', async () => {
    await page.goto(`${base}/index.html?lang=es&pr=36`);
    await loaded(page);
    await page.waitForSelector('#prview[open] #prview-body .pv-list li', { timeout: T(5000) }).catch(() => {
      throw new Error('?pr=36 no abrió la vista del PR');
    });
    const r = await page.evaluate(() => ({
      title: document.querySelector('#prview-title').textContent,
      body: document.querySelector('#prview-body').textContent,
      n: document.querySelectorAll('#prview-body .pv-list li').length,
    }));
    if (!r.title.includes('36') || !r.n || /undefined|NaN|prview\./.test(r.title + r.body)) throw new Error('vista del PR rota: ' + JSON.stringify(r));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#prview:not([open])', { state: 'attached', timeout: T(3000) });
  });
  await step(page, '?pr=abc no abre nada', async () => {
    await page.goto(`${base}/index.html?lang=es&pr=abc`);
    await loaded(page);
    if (await page.$('#prview[open]')) throw new Error('?pr=abc abrió la vista del PR');
  });
  await page.context().close();
}

if (seccion('Vista de texto desde la URL (?vista=texto)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre la vista de texto con el filtro por ruta y el ?q= aplicados, y lo anuncia en la región viva', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una ruta');
    await page.goto(`${base}/index.html?lang=es&vista=texto&path=${encodeURIComponent(word)}&q=main`);
    await loaded(page);
    await page.waitForSelector('#textview[open]', { timeout: T(5000) }).catch(() => {
      throw new Error('?vista=texto no abrió la vista de texto');
    });
    const st = await page.evaluate(() => ({
      search: document.querySelector('#search').open,
      filter: document.querySelector('#textview-filter').value,
      scope: document.querySelector('#textview-scope').textContent,
      live: document.querySelector('#textview-live').textContent,
      branches: document.querySelectorAll('#textview .tv-branch').length,
    }));
    if (st.search) throw new Error('?q= abrió también la búsqueda');
    if (st.filter !== 'main') throw new Error(`el filtro de ramas quedó en «${st.filter}», no en «main»`);
    if (!st.scope.includes(word)) throw new Error('la nota no dice la ruta: ' + st.scope);
    if (!st.live.includes(st.scope) || !/Ramas mostradas: \d+ de \d+/.test(st.live)) throw new Error('la región viva no anuncia ruta y filtro: ' + st.live);
    if (/undefined|NaN|textview\./.test(st.live)) throw new Error('texto sin resolver: ' + st.live);
  });
  await step(page, '?view=text, el alias en inglés, abre también la vista de texto', async () => {
    await page.goto(`${base}/index.html?lang=es&view=text`);
    await loaded(page);
    await page.waitForSelector('#textview[open]', { timeout: T(5000) }).catch(() => {
      throw new Error('?view=text no abrió la vista de texto');
    });
  });
  await page.context().close();
}

if (seccion('Vista de texto: ramas quietas (GitHub simulado)'))
{
  const gh = fakeGitHub();
  gh.repo('o/q');
  gh.push('o/q', 'gh-pages', 'publica la documentación', Date.now() - 45 * 864e5); // una rama aparte cuyo último commit es de hace 45 días
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  await step(page, 'una rama sin actividad hace más de 30 días lo dice en su nombre accesible y con una marca; la de hoy no', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/q&vista=texto`);
    await loaded(page);
    await page.waitForSelector('#textview[open]', { timeout: T(10000) }).catch(() => {
      throw new Error('?vista=texto no abrió la vista de texto');
    });
    // sin token las ramas llegan de a poco: la vista abierta se pone al día sola
    await page.waitForFunction(() => document.querySelectorAll('#textview .tv-branch').length === 2, null, { timeout: T(15000) }).catch(async () => {
      throw new Error('la vista de texto no llegó a las 2 ramas: ' + (await page.$$eval('#textview .tv-branch', (bs) => bs.map((n) => n.dataset.branch).join(', '))));
    });
    const rows = await page.$$eval('#textview .tv-branch', (bs) => bs.map((n) => ({ name: n.dataset.branch, label: n.getAttribute('aria-label'), head: n.querySelector('.tv-head').textContent })));
    const old = rows.find((r) => r.name === 'gh-pages');
    const main = rows.find((r) => r.name === 'main');
    if (!old || !/^gh-pages, sin PR abierto, sin actividad hace más de 30 días, último commit de [^,]+, commits mostrados: 1$/.test(old.label)) throw new Error('la rama de hace 45 días no lo dice en su nombre accesible: ' + JSON.stringify(old));
    if (!old.head.includes('sin actividad hace más de 30 días')) throw new Error('la rama de hace 45 días no lleva la marca visible: ' + old.head);
    if (!main || /sin actividad/.test(main.label + main.head)) throw new Error('la rama por defecto, con commits de hoy, se dice quieta: ' + JSON.stringify(main));
  });
  await page.context().close();
}

if (seccion('Búsqueda desde la URL (?q=)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre la búsqueda ya escrita, con resultados, y mantiene el texto en la URL', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const word = await page.evaluate(() => {
      const msg = document.querySelector('#search .sr-hit .tv-msg')?.textContent || '';
      return msg.split(/[^\p{L}\p{N}]+/u).sort((a, b) => b.length - a.length)[0] || '';
    });
    if (!word) throw new Error('no hay un mensaje del que sacar una búsqueda');
    await page.goto(`${base}/index.html?lang=es&q=${encodeURIComponent(' ' + word + ' ')}`);
    await loaded(page);
    await page.waitForSelector('#search[open]', { timeout: T(5000) }).catch(() => {
      throw new Error('?q= no abrió la búsqueda');
    });
    const st = await page.evaluate(() => ({
      value: document.querySelector('#search-input').value,
      hits: document.querySelectorAll('#search .sr-hit').length,
      focus: document.activeElement?.id,
    }));
    if (st.value !== word) throw new Error(`el campo quedó en «${st.value}», no en «${word}»`);
    if (!st.hits) throw new Error('?q= no lista resultados');
    if (st.focus !== 'search-input') throw new Error('el foco no está en el campo: ' + st.focus);
    await page.fill('#search-input', 'zzzz-no-existe');
    if (!(await page.evaluate(() => location.search)).includes('q=zzzz')) throw new Error('la URL no sigue al texto');
    await page.fill('#search-input', '');
    if ((await page.evaluate(() => location.search)).includes('q=')) throw new Error('vaciar el campo deja ?q= en la URL');
  });
  await page.context().close();
}

if (seccion('Choques entre ramas desde la URL (?conflicts=1)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre la salud con los choques ya buscados, los mantiene en la URL y al cerrar los suelta', async () => {
    await page.goto(`${base}/index.html?lang=es&conflicts=1`);
    await loaded(page);
    await page.waitForSelector('#health[open]', { timeout: T(5000) }).catch(() => {
      throw new Error('?conflicts=1 no abrió la salud');
    });
    await page
      .waitForFunction(() => document.querySelector('#hl-clash-out')?.textContent.trim() && !document.querySelector('#hl-clash-go').disabled, null, { timeout: T(8000) })
      .catch(() => {
        throw new Error('?conflicts=1 no buscó los choques');
      });
    const st = await page.evaluate(() => ({ text: document.querySelector('#hl-clash-out').textContent, rows: document.querySelectorAll('#hl-clash-out .hl-row').length, url: location.search }));
    if (/undefined|NaN|health\./.test(st.text)) throw new Error('texto sin resolver en los choques: ' + st.text.slice(0, 120));
    if (!st.rows) throw new Error('la demo tiene ramas que tocan los mismos archivos y ?conflicts=1 no las lista: ' + st.text.slice(0, 120));
    if (!st.url.includes('conflicts=1')) throw new Error('la URL perdió conflicts=1: ' + st.url);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#health:not([open])', { state: 'attached', timeout: T(3000) });
    await page.waitForFunction(() => !location.search.includes('conflicts'), null, { timeout: T(3000) }).catch(async () => {
      throw new Error('cerrar la salud deja ?conflicts= en la URL: ' + (await page.evaluate(() => location.search)));
    }); // el evento close del diálogo llega en la tarea siguiente
    await page.click('#health-btn');
    await page.waitForSelector('#health[open]', { timeout: T(3000) });
    if ((await page.evaluate(() => document.querySelector('#hl-clash-out').textContent.trim()))) throw new Error('reabrir la salud a mano volvió a buscar choques');
    await page.click('#hl-clash-go');
    await page.waitForFunction(() => location.search.includes('conflicts=1'), null, { timeout: T(8000) }).catch(() => {
      throw new Error('«Buscar choques» no deja la vista en la URL');
    });
  });
  await page.context().close();
}

if (seccion('Filtro por autor desde la URL (?author=)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre ya filtrado por esa persona, lo mantiene en la URL y al quitarlo la suelta', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    const all = await page.evaluate(() => document.querySelectorAll('#graph svg .head').length);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    const options = await page.evaluate(() => [...document.querySelectorAll('#graph-author option')].map((o) => o.value).filter(Boolean));
    let who = null;
    for (const o of options) {
      await page.goto(`${base}/index.html?lang=es&author=${encodeURIComponent(o)}`);
      await loaded(page);
      const n = await page.evaluate(() => document.querySelectorAll('#graph svg .head').length);
      if (n && n < all) { who = o; break; }
    }
    if (!who) throw new Error(`?author= no acota el grafo con ningún autor (${all} ramas, ${options.length} autores)`);
    const on = await page.evaluate(() => ({ mark: document.querySelector('#search-btn').classList.contains('filtered'), url: location.search }));
    if (!on.mark) throw new Error('?author= no marca el filtro');
    if (!on.url.includes('author=')) throw new Error('la URL perdió el autor: ' + on.url);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.selectOption('#graph-author', '');
    if ((await page.evaluate(() => location.search)).includes('author=')) throw new Error('quitar el filtro deja el autor en la URL');
  });
  await page.context().close();
}

if (seccion('Grafo de primer padre (?firstparent=1)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'deja menos commits que el grafo entero, queda en la URL y el interruptor lo apaga', async () => {
    // los commits del grafo dibujado (la cifra del resumen, que sale del layout), no los nodos del SVG: el 2D crea
    // solo los que están en pantalla, y con menos carriles caben más. Todo en la misma demo: otra carga es otra historia
    const commits = () => page.evaluate(() => Number(document.querySelector('#st-commits').textContent.replace(/\D/g, '')) || 0);
    await page.goto(`${base}/index.html?lang=es&firstparent=1`);
    await loaded(page);
    const on = await page.evaluate(() => ({ mark: document.querySelector('#search-btn').classList.contains('filtered'), url: location.search }));
    on.n = await commits();
    if (!on.mark) throw new Error('?firstparent=1 no marca el filtro');
    if (!on.url.includes('firstparent=1')) throw new Error('la URL perdió firstparent: ' + on.url);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    if (!(await page.locator('#graph-firstparent').isChecked())) throw new Error('el interruptor no refleja ?firstparent=1');
    if (!(await page.evaluate(() => !!document.querySelector('#graph-firstparent').closest('label')?.textContent.trim()))) throw new Error('el interruptor no tiene nombre');
    await page.uncheck('#graph-firstparent');
    await page.waitForFunction((n) => Number(document.querySelector('#st-commits').textContent.replace(/\D/g, '')) > n, on.n, { timeout: T(5000) }).catch(() => {});
    const all = await commits();
    if (!(on.n > 0 && on.n < all)) throw new Error(`?firstparent=1 no acota los commits (${on.n} con el interruptor, ${all} sin él)`);
    if ((await page.evaluate(() => location.search)).includes('firstparent')) throw new Error('apagarlo deja firstparent en la URL');
  });
  await page.context().close();
}

if (seccion('Columnas de SHA, autor y fecha en el 2D'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'el interruptor de columnas pone «SHA · autor · fecha» junto a los commits del 2D, se recuerda y al apagarlo se quitan', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    const metas = () => page.evaluate(() => [...document.querySelectorAll('.graph-svg .node .node-meta')].map((t) => t.textContent));
    if ((await metas()).length) throw new Error('las columnas salen sin encender el interruptor');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => !!document.querySelector('#graph-columns').closest('label')?.textContent.trim()))) throw new Error('el interruptor no tiene nombre');
    await page.check('#graph-columns');
    await page.waitForFunction(() => document.querySelectorAll('.graph-svg .node .node-meta').length > 0, null, { timeout: T(5000) });
    const on = await metas();
    // el SHA corto va primero (7 caracteres hexadecimales) y es el comienzo del SHA de un commit cargado: la lupa lo encuentra
    const bad = on.find((x) => !/^[0-9a-f]{7} · .+ · /.test(x));
    if (bad) throw new Error('una columna no es «SHA · autor · fecha»: ' + JSON.stringify(bad));
    const sha = on[0].slice(0, 7);
    await page.fill('#search-input', sha);
    const hits = await page.evaluate((p) => [...document.querySelectorAll('#search .sr-hit')].filter((b) => b.dataset.sha.startsWith(p)).length, sha);
    if (hits < 1) throw new Error(`ningún commit cargado empieza por el SHA de una columna (${sha})`);
    await page.fill('#search-input', '');
    await page.reload();
    await loaded(page);
    await page.waitForFunction(() => document.querySelectorAll('.graph-svg .node .node-meta').length > 0, null, { timeout: T(5000) });
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.uncheck('#graph-columns');
    await page.waitForFunction(() => !document.querySelector('.graph-svg .node .node-meta'), null, { timeout: T(5000) });
  });
  await page.context().close();
}

if (seccion('Columnas de SHA, autor y fecha en el 3D'))
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
  await step(page, 'el interruptor de columnas también pone «SHA · autor · fecha» bajo el mensaje de los commits cercanos del 3D, se recuerda y al apagarlo se quitan', async () => {
    await page.goto(`${base}/index.html?lang=es&view=3d`);
    await loaded(page);
    if (!(await page.locator('#graph3d canvas').count())) return console.log('    (sin WebGL: se salta)');
    // los rótulos de commit a la vista: su mensaje y, si lo lleva, su columna
    const notes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#graph3d .g3-note')]
          .filter((n) => getComputedStyle(n).display !== 'none')
          .map((n) => ({ meta: n.querySelector('.g3-meta:not([hidden])')?.textContent || '', h: Math.round(n.getBoundingClientRect().height) }))
      );
    // de cerca: los mensajes (y las columnas) solo salen junto a los commits cercanos a la cámara
    const near = async () => {
      await page.waitForFunction(() => window.__g3?.nodes.size > 0, null, { timeout: T(15000) });
      await page.evaluate(() => {
        const g = window.__g3;
        g.setSpin?.(false);
        g.focusSha([...g.nodes.values()].find((it) => it.data.heads.length)?.sha || [...g.nodes.keys()][0], 9);
      });
      await page.waitForTimeout(1500); // la cámara llega a su lugar antes de mirar los rótulos
      await page.waitForFunction(() => [...document.querySelectorAll('#graph3d .g3-note')].some((n) => getComputedStyle(n).display !== 'none'), null, { timeout: T(10000) });
    };
    const withMeta = () => page.waitForFunction(() => [...document.querySelectorAll('#graph3d .g3-note')].some((n) => getComputedStyle(n).display !== 'none' && n.querySelector('.g3-meta:not([hidden])')), null, { timeout: T(5000) });
    await near();
    const off = await notes();
    if (!off.length) throw new Error('de cerca no hay ningún rótulo de commit en el 3D');
    if (off.some((n) => n.meta)) throw new Error('las columnas salen en el 3D sin encender el interruptor');
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.check('#graph-columns');
    await withMeta();
    const on = (await notes()).filter((n) => n.meta);
    if (!on.length) throw new Error('las columnas del 3D se fueron apenas salieron');
    const bad = on.find((n) => !/^[0-9a-f]{7} · .+ · /.test(n.meta));
    if (bad) throw new Error('una columna del 3D no es «SHA · autor · fecha»: ' + JSON.stringify(bad.meta));
    // el SHA corto es el comienzo del SHA de un commit del grafo 3D
    const sha = on[0].meta.slice(0, 7);
    if (!(await page.evaluate((p) => [...window.__g3.nodes.keys()].some((k) => k.startsWith(p)), sha))) throw new Error(`ningún commit del 3D empieza por el SHA de una columna (${sha})`);
    // la columna va en su propio renglón, debajo del mensaje: el rótulo crece
    const tall = Math.max(...on.map((n) => n.h)), flat = Math.max(...off.map((n) => n.h));
    if (!(tall > flat + 6)) throw new Error(`la columna no suma un renglón al rótulo del commit (${flat} px sin ella, ${tall} px con ella)`);
    await page.reload();
    await loaded(page);
    await near();
    await withMeta();
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.uncheck('#graph-columns');
    await page.waitForFunction(() => ![...document.querySelectorAll('#graph3d .g3-note')].some((n) => getComputedStyle(n).display !== 'none' && n.querySelector('.g3-meta:not([hidden])')), null, { timeout: T(5000) });
    if (!(await notes()).length) throw new Error('al apagar las columnas también se fueron los mensajes de los commits');
  });
  await page.context().close();
}

if (seccion('Grafo de primer padre en el 3D'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'el interruptor de primer padre también deja menos commits en el grafo 3D, y al apagarlo vuelven', async () => {
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    if (!(await page.evaluate(() => !!window.GB?.Graph3D))) return; // sin WebGL no hay grafo 3D
    await page.evaluate(() => {
      const G3 = window.GB.Graph3D.prototype;
      window.__g3n = [];
      const orig = G3.update;
      G3.update = function (L, ...a) {
        window.__g3n.push(L?.nodes?.length ?? -1);
        return orig.call(this, L, ...a);
      };
    });
    const last = () => page.evaluate(() => window.__g3n[window.__g3n.length - 1]);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    await page.check('#graph-firstparent');
    await page.waitForFunction(() => window.__g3n.length > 0, null, { timeout: T(5000) });
    const on = await last();
    await page.uncheck('#graph-firstparent');
    const n = await page.evaluate(() => window.__g3n.length);
    await page.waitForFunction((k) => window.__g3n.length > k, n - 1, { timeout: T(5000) });
    const off = await last();
    if (!(on > 0 && on < off)) throw new Error(`el 3D no recibió menos commits con el primer padre (${on} con el interruptor, ${off} sin él)`);
  });
  await page.context().close();
}

if (seccion('Ramas ocultas o solas desde la URL (?solo=, ?ocultar=)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, '?ocultar= y ?solo= abren el grafo con menos ramas, la URL las sigue y «Ver todas» las limpia', async () => {
    const count = () => page.evaluate(() => document.querySelectorAll('#graph svg .head').length);
    await page.goto(`${base}/index.html?lang=es`);
    await loaded(page);
    const all = await count();
    await page.goto(`${base}/index.html?lang=es&ocultar=feature/login&ocultar=fix/rate-limit`);
    await loaded(page);
    await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length < n, all, { timeout: T(5000) });
    const hid = await count();
    if (hid !== all - 2) throw new Error(`?ocultar= quitó ${all - hid} ramas, no 2`);
    const url = await page.evaluate(() => location.search);
    if ((url.match(/ocultar=/g) || []).length !== 2) throw new Error('la URL perdió ocultar: ' + url);
    await page.goto(`${base}/index.html?lang=es&solo=feature/login`);
    await loaded(page);
    await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length < n, hid, { timeout: T(5000) });
    const solo = await count();
    if (solo !== 2) throw new Error(`?solo= dejó ${solo} ramas, no 2 (la elegida y la por defecto)`);
    await page.click('#search-btn');
    await page.waitForSelector('#search[open]', { timeout: T(3000) });
    if (!(await page.evaluate(() => document.querySelector('#search-btn').classList.contains('filtered')))) throw new Error('?solo= no marca el filtro');
    await page.click('#branch-view-reset');
    await page.waitForFunction((n) => document.querySelectorAll('#graph svg .head').length === n, all, { timeout: T(5000) });
    const after = await page.evaluate(() => location.search);
    if (/solo=|ocultar=/.test(after)) throw new Error('«Ver todas» deja la rama en la URL: ' + after);
  });
  await page.context().close();
}

if (seccion('Título de la pestaña'))
{
  // lo que indexa un buscador después de ejecutar la página, y lo que ve quien tiene la pestaña entre otras veinte
  const gh = fakeGitHub();
  gh.repo('o/t');
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await page.unroute('https://api.github.com/**');
  await page.route('https://api.github.com/**', gh.handle);
  const titulo = (code) => page.evaluate((c) => GB.i18n.t('meta.title') && document.documentElement.lang === c && document.title, code);
  await step(page, 'con la demo, el título dice qué es la página, en el idioma activo, y no «acme/orbita»', async () => {
    await page.goto(`${base}/index.html?lang=en`);
    await loaded(page);
    const en = await titulo('en');
    if (en !== "Live graph of a GitHub repository's branches · GraphBranch") throw new Error(`en inglés el título es «${en}»`);
    await page.selectOption('#lang-select', 'es');
    await page.waitForFunction(() => document.documentElement.lang === 'es', null, { timeout: T(5000) });
    await loaded(page);
    const es = await titulo('es');
    if (es !== 'Grafo en vivo de las ramas de un repositorio de GitHub · GraphBranch') throw new Error(`en español el título es «${es}»`);
    const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).url);
    if (ld !== (await page.getAttribute('link[rel=canonical]', 'href'))) throw new Error(`el JSON-LD (${ld}) y la canónica no dicen la misma dirección`);
  });
  await step(page, 'con un repo, el título es el del repo, también después de cambiar de idioma', async () => {
    await page.goto(`${base}/index.html?lang=es&repo=o/t`);
    await loaded(page);
    await page.waitForFunction(() => document.title === 'o/t · GraphBranch', null, { timeout: T(5000) }).catch(async () => {
      throw new Error(`el título es «${await page.title()}»`);
    });
    await page.selectOption('#lang-select', 'en');
    await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: T(5000) });
    await loaded(page);
    await page.waitForTimeout(300);
    if ((await page.title()) !== 'o/t · GraphBranch') throw new Error(`tras cambiar de idioma el título es «${await page.title()}»`);
  });
  await page.context().close();
}

if (seccion('Modo TV directo (?tv=1)'))
{
  const page = await openPage({ viewport: { width: 1920, height: 1080 } });
  await step(page, 'abre en modo TV y el director toma la cámara', async () => {
    await page.goto(`${base}/index.html?lang=es&tv=1`);
    await loaded(page);
    await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
    await page.waitForTimeout(4000);
    if (!(await page.locator('#graph3d').isVisible())) throw new Error('el modo TV no muestra la vista 3D');
  });
  await page.context().close();
}

if (seccion('Salud del repo directa (?health=1)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre la demo con el panel de salud ya desplegado y con sus secciones', async () => {
    await page.goto(`${base}/index.html?lang=es&health=1`);
    await loaded(page);
    await page.waitForSelector('#health[open]', { timeout: T(5000) }).catch(() => {
      throw new Error('?health=1 no abrió el panel de salud');
    });
    const n = await page.evaluate(() => document.querySelectorAll('#health-body .hl-sec').length);
    if (!n) throw new Error('el panel de salud se abrió vacío');
    await page.click('#health-close');
    await page.waitForFunction(() => !document.querySelector('#health').open && !location.search.includes('health='), null, { timeout: T(5000) }).catch(() => {});
    if (await page.evaluate(() => document.querySelector('#health').open)) throw new Error('el panel no se cierra');
    if ((await page.evaluate(() => location.search)).includes('health=')) throw new Error('cerrar el panel deja health= en la URL');
  });
  await step(page, 'a 320 px el panel de salud no se desborda hacia el lado (en español y en tamil)', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const lang of ['es', 'ta']) {
      await page.goto(`${base}/index.html?lang=${lang}&health=1`);
      await loaded(page);
      await page.waitForSelector('#health[open]', { timeout: T(5000) });
      const m = await page.evaluate(() => {
        const w = document.querySelector('#health .tr-wrap');
        return { sw: w.scrollWidth, cw: w.clientWidth };
      });
      if (m.sw > m.cw) throw new Error(`[${lang}] el panel de salud se desborda a 320 px: scrollWidth ${m.sw} > clientWidth ${m.cw}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await step(page, 'sin el parámetro (o con health=0) el panel no se abre solo', async () => {
    await page.goto(`${base}/index.html?lang=es&health=0`);
    await loaded(page);
    await page.waitForTimeout(500);
    if (await page.evaluate(() => document.querySelector('#health').open)) throw new Error('health=0 abrió el panel');
  });
  await page.context().close();
}

if (seccion('Agentes e interacciones, en vivo, en el lugar del grafo (?agents=1)'))
{
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  await step(page, 'abre la demo en la vista de agentes: la red, la línea de tiempo, lo último, quién con quién y el gasto de ejemplo', async () => {
    await page.goto(`${base}/index.html?lang=es&agents=1`);
    await loaded(page);
    await page.waitForSelector('#agents:not([hidden]) .ag-net', { timeout: T(5000) }).catch(() => {
      throw new Error('?agents=1 no abrió la vista de agentes');
    });
    const info = await page.evaluate(() => {
      const d = document.querySelector('#agents');
      const texts = (sel) => [...d.querySelectorAll(sel)].map((x) => x.textContent.replace(/[⁨⁩]/g, '')); // sin los aislantes de cada nombre
      return {
        pressed: document.querySelector('#view-agents').getAttribute('aria-pressed'),
        stage: getComputedStyle(document.querySelector('.graph-stage')).display,
        agents: d.querySelectorAll('svg.ag-net .ag-agent').length,
        people: d.querySelectorAll('svg.ag-net .ag-person').length,
        between: d.querySelectorAll('svg.ag-net .ag-edge-agents').length,
        heads: d.querySelectorAll('svg.ag-net .ag-ehead').length,
        edges: d.querySelectorAll('svg.ag-net .ag-edge').length,
        colored: new Set([...d.querySelectorAll('svg.ag-net .ag-agent')].map((x) => getComputedStyle(x).fill)).size,
        aria: d.querySelector('svg.ag-net')?.getAttribute('aria-label') || '',
        traces: d.querySelectorAll('svg.ag-time .ag-ev').length,
        lanes: d.querySelectorAll('svg.ag-time .ag-lane').length,
        pairs: texts('#ag-pairs .hl-main'),
        list: texts('#ag-list .hl-main'),
        recent: texts('#ag-recent .hl-main'),
        rows: d.querySelectorAll('#agents-body button.hl-row[data-sha]').length,
        links: d.querySelectorAll('#agents-body a[href]').length,
        spendBadge: !!d.querySelector('#ag-spend .sp-badge'),
        spendServices: d.querySelectorAll('#sp-services .sp-row').length,
        spendAgents: texts('#sp-agents .sp-name'),
        text: d.textContent,
        overflow: d.scrollWidth - d.clientWidth,
      };
    });
    if (info.pressed !== 'true' || info.stage !== 'none') throw new Error(`el botón Agentes (${info.pressed}) o el grafo sigue a la vista (${info.stage})`);
    if (info.agents < 3 || !info.people) throw new Error(`la red: ${info.agents} agentes y ${info.people} personas`);
    if (!info.between) throw new Error('la red no distingue ningún vínculo entre dos agentes');
    if (info.heads !== info.edges) throw new Error(`${info.edges} vínculos y ${info.heads} puntas de flecha`);
    if (info.colored < 3) throw new Error(`los agentes de la red no llevan su color: ${info.colored} colores`);
    if (!/\d/.test(info.aria)) throw new Error('la red no dice cuántos participantes y vínculos tiene: ' + info.aria);
    if (info.traces < 3 || info.lanes < 3) throw new Error(`la línea de tiempo: ${info.traces} trazos en ${info.lanes} filas`);
    if (!info.pairs.some((p) => p === 'GitHub Copilot → Claude Code')) throw new Error('falta Copilot → Claude Code (su revisión del PR de la app de Claude): ' + info.pairs.join(' | '));
    if (!info.pairs.some((p) => /^Claude Code · sesión \w{6} → Claude Code · sesión \w{6}$/.test(p))) throw new Error('falta la sesión de Claude que retoma la rama de otra: ' + info.pairs.join(' | '));
    if (!info.list.some((x) => /^Claude Code · sesión \w{6} · Opus 5\.5$/.test(x)) || !info.list.includes('Dependabot')) throw new Error('la lista de agentes: ' + info.list.join(' | '));
    if (!info.recent.length || !info.rows) throw new Error('sin interacciones recientes o sin filas que lleven al grafo');
    if (info.links) throw new Error('la demo enlaza sesiones de Claude Code, que son ficticias');
    if (!info.spendBadge || info.spendServices !== 4 || !info.spendAgents.some((x) => /^Claude Code/.test(x))) throw new Error(`el gasto de ejemplo: marca ${info.spendBadge}, ${info.spendServices} servicios, agentes ${info.spendAgents.join(' | ')}`);
    if (/undefined|NaN|agents\.|spend\.|tip\.|swarm\./.test(info.text)) throw new Error('texto sin resolver en la vista: ' + info.text.slice(0, 160));
    if (info.overflow > 1) throw new Error(`la vista se desborda ${info.overflow}px`);
  });
  await step(page, 'en vivo: lo que llega mientras se mira se anima (lo último y la línea de tiempo)', async () => {
    const fresh = await page
      .waitForFunction(() => document.querySelectorAll('#agents .is-new').length, null, { timeout: T(45000) })
      .then((h) => h.jsonValue(), () => 0);
    if (!fresh) throw new Error('en 45 s de demo no llegó ninguna interacción nueva a la vista');
  });
  await step(page, 'solo entre agentes: la red y las listas dejan fuera a las personas, se recuerda y el foco se queda en el interruptor', async () => {
    await page.click('#agents-only');
    const r = await page.evaluate(() => ({
      people: document.querySelectorAll('#agents svg.ag-net .ag-person').length,
      agents: document.querySelectorAll('#agents svg.ag-net .ag-agent').length,
      pairs: [...document.querySelectorAll('#ag-pairs .hl-main')].map((x) => x.textContent.replace(/[⁨⁩]/g, '')),
      focus: document.activeElement?.id,
      stored: localStorage.getItem('graphbranch:agentsOnly'),
    }));
    if (r.people || !r.agents) throw new Error(`solo entre agentes dejó ${r.people} personas y ${r.agents} agentes en la red`);
    if (!r.pairs.length || r.pairs.some((p) => !/^(Claude Code|GitHub Copilot|Dependabot)\b.* → (Claude Code|GitHub Copilot|Dependabot)\b/.test(p))) throw new Error('quién con quién, solo entre agentes: ' + r.pairs.join(' | '));
    if (r.focus !== 'agents-only') throw new Error(`el foco quedó en ${r.focus}`);
    if (r.stored !== 'true') throw new Error('no se recuerda: ' + r.stored);
    await page.click('#agents-only');
    if (await page.evaluate(() => localStorage.getItem('graphbranch:agentsOnly'))) throw new Error('apagado sigue guardado');
  });
  await step(page, 'elegir a alguien en la red centra las listas en él; Enter lo suelta y el foco se queda en su nodo', async () => {
    await page.click('#pause-btn'); // la demo quieta: lo que se cuenta no cambia a mitad
    try {
      const node = page.locator('#agents .ag-net .ag-n[data-key^="a:claude:"]').first();
      const key = await node.getAttribute('data-key');
      await node.locator('.ag-node').click(); // en su figura: el centro del grupo cae entre ella y su rótulo
      const r = await page.evaluate((key) => ({
        chip: (document.querySelector('#ag-focus .ag-focus-name')?.textContent || '').replace(/[⁨⁩]/g, ''),
        pressed: document.querySelector(`#agents .ag-n[data-key="${CSS.escape(key)}"]`)?.getAttribute('aria-pressed'),
        pairs: [...document.querySelectorAll('#ag-pairs .hl-main')].map((x) => x.textContent.replace(/[⁨⁩]/g, '')),
        focus: document.activeElement?.getAttribute('data-key'),
      }), key);
      if (!/^Solo con Claude Code · sesión \w{6}/.test(r.chip) || r.pressed !== 'true') throw new Error(`elegir: «${r.chip}», aria-pressed ${r.pressed}`);
      if (!r.pairs.length || r.pairs.some((p) => !p.includes('sesión'))) throw new Error('las listas no se centraron en la sesión elegida: ' + r.pairs.join(' | '));
      if (r.focus !== key) throw new Error(`el foco quedó en ${r.focus}`);
      await page.keyboard.press('Enter');
      if (await page.locator('#ag-focus').count()) throw new Error('Enter no soltó al participante elegido');
    } finally {
      await page.click('#pause-btn'); // la demo sigue como estaba, también si algo falló
    }
  });
  await step(page, 'el enjambre: los indicadores, la corteza con sus cortes y su ficha, el ingreso de tareas, el hilo, el ritmo, las barras, el log y el reloj', async () => {
    await page.waitForSelector('#sw-cortex .sw-viz .sw-label', { timeout: T(5000) }).catch(() => {
      throw new Error('la corteza no llegó al tablero');
    });
    const r = await page.evaluate(() => {
      const d = document.querySelector('#agents');
      return {
        kpis: d.querySelectorAll('#sw-kpis .sw-kpi').length,
        sparks: d.querySelectorAll('#sw-kpis .sw-spark').length,
        gl: !!d.querySelector('#sw-cortex .sw-canvas'),
        flat: !!d.querySelector('#sw-cortex .sw-stage.is-flat'),
        labels: [...d.querySelectorAll('#sw-cortex .sw-label')].map((b) => (b.getAttribute('aria-label') || '').replace(/[⁨⁩]/g, '')),
        caps: [...d.querySelectorAll('#sw-cortex .sw-slice figcaption')].map((x) => x.textContent),
        drawn: [...d.querySelectorAll('#sw-cortex .sw-slice canvas')].filter((c) => c.width > 0 && c.height > 0).length,
        insp: d.querySelector('#sw-insp dl')?.textContent || '',
        tasks: d.querySelectorAll('#sw-ingest li').length,
        routed: d.querySelector('#sw-ingest h3 .hl-n')?.textContent || '',
        tabs: d.querySelectorAll('#sw-thread .sw-tab[data-pick]').length,
        msgs: d.querySelectorAll('#sw-thread .sw-msg').length,
        rate: d.querySelectorAll('#sw-rate svg .sw-rate-l, #sw-rate svg .sw-rate-p').length,
        bars: d.querySelectorAll('#sw-per .sw-bar-fill').length,
        log: d.querySelectorAll('#sw-log li').length,
        clock: document.querySelector('#agents-clock').textContent,
      };
    });
    if (r.kpis !== 7 || r.sparks < 2) throw new Error(`los indicadores: ${r.kpis} y ${r.sparks} curvas`);
    if (!r.gl && !r.flat) throw new Error('la corteza no se dibujó ni en 3D ni como lista');
    if (r.labels.length < 3 || r.labels.some((x) => !/ · (escribe|integra|revisa|comenta)$/.test(x))) throw new Error('los rótulos de la corteza no dicen quién es y su rol: ' + r.labels.join(' | '));
    if (r.caps.length !== 3 || !r.caps.every((x) => /^(Axial|Coronal|Sagital) · [xyz] [+−]\d\.\d\d$/.test(x))) throw new Error('los cortes: ' + r.caps.join(' | '));
    if (r.drawn !== 3) throw new Error(`se dibujaron ${r.drawn} de 3 cortes`);
    if (!/Rol/.test(r.insp)) throw new Error('la ficha no dice el rol: ' + r.insp);
    if (!r.tasks || !/^\d+\/\d+ con un agente$/.test(r.routed)) throw new Error(`el ingreso de tareas: ${r.tasks} filas, «${r.routed}»`);
    if (!r.tabs || !r.msgs) throw new Error(`el hilo: ${r.tabs} pestañas y ${r.msgs} mensajes`);
    if (r.rate !== 2 || !r.bars || !r.log) throw new Error(`el ritmo (${r.rate} series), las barras (${r.bars}) o el log (${r.log})`);
    if (!/\d\d:\d\d:\d\d/.test(r.clock)) throw new Error('el reloj del tablero: ' + JSON.stringify(r.clock));
  });
  await step(page, 'elegir a alguien en la corteza (o en una pestaña del hilo) lo elige en todo el tablero, el foco se queda ahí y Enter lo suelta', async () => {
    await page.click('#pause-btn'); // la demo quieta: lo que se cuenta no cambia a mitad
    try {
      const label = page.locator('#sw-cortex .sw-label[data-key^="a:claude:"]').first();
      const key = await label.getAttribute('data-key');
      await label.focus();
      await page.keyboard.press('Enter');
      const r = await page.evaluate((key) => ({
        chip: (document.querySelector('#ag-focus .ag-focus-name')?.textContent || '').replace(/[⁨⁩]/g, ''),
        pressed: document.querySelector(`#sw-cortex .sw-label[data-key="${CSS.escape(key)}"]`)?.getAttribute('aria-pressed'),
        focus: document.activeElement?.dataset?.key,
        tab: document.querySelector('#sw-thread .sw-tab.on')?.dataset.pick,
        insp: (document.querySelector('#sw-insp .sw-insp-name')?.textContent || '').replace(/[⁨⁩]/g, ''),
      }), key);
      if (!/^Solo con Claude Code · sesión \w{6}/.test(r.chip) || r.pressed !== 'true') throw new Error(`elegir en la corteza: «${r.chip}», aria-pressed ${r.pressed}`);
      if (r.focus !== key) throw new Error(`el foco quedó en ${r.focus}`);
      if (r.tab !== key || !/^Claude Code · sesión \w{6}$/.test(r.insp)) throw new Error(`el hilo (${r.tab}) o la ficha («${r.insp}») no siguieron al elegido`);
      await page.keyboard.press('Enter');
      if (await page.locator('#ag-focus').count()) throw new Error('Enter no soltó al elegido desde la corteza');
      const tab = page.locator('#sw-thread .sw-tab[data-pick]').nth(1);
      const pick = await tab.getAttribute('data-pick');
      await tab.click();
      const t = await page.evaluate(() => ({ on: document.querySelector('#sw-thread .sw-tab.on')?.dataset.pick, focus: document.activeElement?.dataset?.pick, chip: !!document.querySelector('#ag-focus') }));
      if (t.on !== pick || t.focus !== pick || !t.chip) throw new Error(`la pestaña del hilo: ${JSON.stringify(t)} (se esperaba ${pick})`);
      await page.click('#ag-focus-clear');
    } finally {
      await page.click('#pause-btn'); // la demo sigue como estaba, también si algo falló
    }
  });
  await step(page, 'a 320 px el tablero de agentes, con el enjambre, no se desborda hacia el lado (en español y en tamil)', async () => {
    const back = page.url();
    await page.setViewportSize({ width: 320, height: 640 });
    try {
      for (const lang of ['es', 'ta']) {
        await page.goto(`${base}/index.html?lang=${lang}&agents=1`);
        await loaded(page);
        await page.waitForSelector('#agents:not([hidden]) #sw-kpis', { timeout: T(5000) });
        const m = await page.evaluate(() => ({ board: document.querySelector('#agents').scrollWidth - document.querySelector('#agents').clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        if (m.board > 1 || m.doc > 1) throw new Error(`[${lang}] a 320 px se desborda: tablero ${m.board}px, página ${m.doc}px`);
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(back);
      await loaded(page);
      await page.waitForSelector('#agents:not([hidden]) .ag-net', { timeout: T(5000) });
    }
  });
  await step(page, 'en modo TV el tablero de agentes entra entero en la pantalla: entrar desde la vista lo conserva, el robot de la barra y la A pasan al grafo y vuelven, y al salir queda la vista de antes sin guardar nada', async () => {
    const st = () =>
      page.evaluate(() => ({
        tv: document.documentElement.classList.contains('tv'),
        agents: !document.querySelector('#agents').hidden,
        bar: document.querySelector('#tv-bar').parentNode.classList.contains('ab-head') ? 'tablero' : document.querySelector('#tv-bar').parentNode.classList.contains('graph-stage') ? 'grafo' : 'otro',
        pressed: document.querySelector('#tv-agents').getAttribute('aria-pressed'),
        focus: document.activeElement?.id || document.activeElement?.tagName,
        stored: localStorage.getItem('graphbranch:agentsView'),
      }));
    // cada cambio de pantalla es inmediato (el clic o la tecla lo hacen en el momento)
    const want = async (what, ok) => {
      const s = await st();
      if (!ok(s)) throw new Error(`${what}: ${JSON.stringify(s)}`);
    };
    const before = await st();
    if (!before.agents) throw new Error('la vista de agentes no estaba abierta');
    try {
      await page.click('#tv-btn'); // el botón TV se ve también en la vista de agentes
      await page.waitForFunction(() => document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      await want('al entrar desde la vista de agentes', (s) => s.agents && s.bar === 'tablero' && s.pressed === 'true' && s.focus === 'graph-panel');
      const fit = await page.evaluate(() => {
        const shown = (sel) => !!document.querySelector(sel)?.getClientRects().length;
        const b = document.querySelector('#agents');
        const stage = document.querySelector('#sw-cortex .sw-stage')?.getBoundingClientRect();
        const card = document.querySelector('#sw-cortex-card')?.getBoundingClientRect();
        return {
          over: b.scrollHeight - b.clientHeight,
          page: document.documentElement.scrollHeight - document.documentElement.clientHeight,
          shown: ['#sw-kpis', '#sw-cortex-card', '#ag-recent', '#sw-log', '#tv-agents'].filter((x) => !shown(x)),
          hidden: ['.ab-switches', '.ab-help', '#ag-net', '#ag-time', '#ag-spend', '#sw-thread'].filter(shown),
          cortex: stage && card ? Math.round(card.bottom - stage.bottom) : null,
        };
      });
      if (fit.over > 1 || fit.page > 1) throw new Error(`el tablero no entra en la pantalla: se desplaza ${fit.over}px (la página, ${fit.page}px)`);
      if (fit.shown.length || fit.hidden.length) throw new Error(`en TV faltan ${fit.shown.join(', ') || 'nada'} y sobran ${fit.hidden.join(', ') || 'nada'}`);
      if (fit.cortex == null || fit.cortex < 0) throw new Error(`la corteza se sale de su tarjeta (${fit.cortex}px)`);
      await page.click('#tv-agents');
      await want('el robot de la barra vuelve al grafo', (s) => s.tv && !s.agents && s.bar === 'grafo' && s.pressed === 'false' && s.focus === 'graph3d');
      await page.keyboard.press('a');
      await want('la A vuelve al tablero', (s) => s.tv && s.agents && s.bar === 'tablero' && s.pressed === 'true');
      await page.keyboard.press('a');
      await want('la A pasa otra vez al grafo', (s) => s.tv && !s.agents && s.bar === 'grafo');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.documentElement.classList.contains('tv'), null, { timeout: T(5000) });
      await want('al salir queda la vista de agentes, como antes de entrar', (s) => s.agents && s.bar === 'tablero' && s.focus === 'tv-btn' && s.stored === before.stored);
      if (new URL(page.url()).searchParams.has('tv')) throw new Error('la URL sigue con ?tv');
    } finally {
      if (await page.evaluate(() => document.documentElement.classList.contains('tv'))) await page.keyboard.press('Escape');
    }
  });
  await step(page, 'el gasto: el diálogo de claves rechaza una dirección de OmniRoute que no es http(s) y se cierra sin guardar', async () => {
    await page.click('#spend-connect');
    await page.waitForSelector('#spend-keys[open]', { timeout: T(3000) });
    await page.fill('#spend-omniroute-url', 'javascript:alert(1)');
    await page.click('#spend-form button[type=submit]');
    const r = await page.evaluate(() => ({ open: document.querySelector('#spend-keys').open, valid: document.querySelector('#spend-omniroute-url').checkValidity() }));
    if (!r.open || r.valid) throw new Error(`una dirección javascript: se aceptó (abierto ${r.open}, válida ${r.valid})`);
    await page.click('#spend-cancel');
    const stored = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter((k) => k.includes('spend:')));
    if (stored.length) throw new Error('cancelar dejó claves guardadas: ' + stored.join(', '));
  });
  await step(page, 'una fila lleva a su commit y vuelve al grafo; el botón de arriba entra y sale de la vista y agents= sale de la URL', async () => {
    await page.click('#ag-list button.hl-row[data-sha]');
    await page.waitForFunction(() => document.querySelector('#agents').hidden && !location.search.includes('agents='), null, { timeout: T(3000) }).catch(() => {});
    const back = await page.evaluate(() => ({ hidden: document.querySelector('#agents').hidden, url: location.search, stage: getComputedStyle(document.querySelector('.graph-stage')).display }));
    if (!back.hidden || back.stage === 'none') throw new Error('la fila no volvió al grafo');
    if (back.url.includes('agents=')) throw new Error('volver al grafo deja agents= en la URL');
    await page.click('#agents-btn');
    if (await page.evaluate(() => document.querySelector('#agents').hidden || document.querySelector('#agents-btn').getAttribute('aria-pressed') !== 'true')) throw new Error('el botón de arriba no abrió la vista');
    await page.click('#agents-btn');
    if (!(await page.evaluate(() => document.querySelector('#agents').hidden))) throw new Error('el botón de arriba no volvió al grafo');
  });
  await step(page, 'la ficha de un commit de agente dice cuál es, con su modelo y su sesión (2D)', async () => {
    await page.click('#pause-btn'); // la demo quieta: las cabezas no cambian mientras se recorren
    await page.click('#view-2d');
    await page.focus('#graph');
    await page.keyboard.press('End');
    await page.waitForTimeout(800);
    let tip = '';
    for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) {
      if (!(await h.isVisible())) continue;
      await h.focus();
      await page.keyboard.press('Enter');
      tip = await page.waitForSelector('#graph .tip:not([hidden]) .tip-agent', { timeout: T(800) }).then((x) => x.textContent(), () => '');
      await page.keyboard.press('Escape');
      if (tip) break;
    }
    if (!/^Agente: (Claude Code · Opus 5\.5 · sesión \w{6}|GitHub Copilot|Dependabot)$/.test(tip)) throw new Error('ninguna ficha de rama dice su agente: ' + JSON.stringify(tip));
    await page.click('#pause-btn');
  });
  await step(page, 'interacciones en el grafo (?interactions=1): en 2D, el marco de cada commit de agente, los arcos y las insignias, con su leyenda', async () => {
    await page.goto(`${base}/index.html?lang=es&interactions=1`);
    await loaded(page);
    await page.click('#pause-btn'); // la demo quieta: lo que se cuenta no cambia a mitad
    await page.click('#view-2d');
    await page.waitForSelector('#graph .ag-arc', { timeout: T(5000) }).catch(() => {
      throw new Error('?interactions=1 no dibujó ningún arco en el grafo 2D');
    });
    const r = await page.evaluate(() => {
      const plain = (x) => x.textContent.replace(/[⁨⁩]/g, '');
      const key = document.querySelector('#ag-key');
      return {
        key: !key.hidden && key.getBoundingClientRect().height > 0,
        rows: [...key.querySelectorAll('.agk-name')].map(plain),
        locate: key.querySelectorAll('button.agk-row[data-sha]').length,
        text: key.textContent,
        rings: document.querySelectorAll('#graph .node .ag-ring').length,
        arcs: [...document.querySelectorAll('#graph .ag-arc title')].map(plain),
        pins: [...document.querySelectorAll('#graph .ag-pin title')].map(plain),
        heads: document.querySelectorAll('#graph .ag-arc .ag-head').length,
        checked: document.querySelector('#agents-graph').checked,
        url: location.search,
      };
    });
    if (!r.key) throw new Error('la leyenda de las interacciones no se ve');
    if (r.rings < 3) throw new Error(`solo ${r.rings} commits de agente llevan su marco`);
    if (!r.arcs.some((x) => /^Claude Code · sesión \w{6} continuó el trabajo de Claude Code · sesión \w{6}$/.test(x))) throw new Error('falta el arco de la sesión de Claude que retoma la rama de otra: ' + r.arcs.join(' | '));
    if (r.heads !== r.arcs.length) throw new Error(`${r.arcs.length} arcos y ${r.heads} puntas de flecha`);
    if (!r.pins.some((x) => /^GitHub Copilot revisó el PR de Claude Code · #\d+$/.test(x))) throw new Error('falta la insignia de la revisión de Copilot: ' + r.pins.join(' | '));
    if (r.arcs.some((x) => !/Claude Code|Copilot|Dependabot/.test(x))) throw new Error('un arco entre dos personas: ' + r.arcs.join(' | '));
    if (!r.rows.some((x) => /^Claude Code · sesión \w{6}$/.test(x)) || !r.rows.includes('GitHub Copilot')) throw new Error('la leyenda: ' + r.rows.join(' | '));
    if (!r.locate) throw new Error('ninguna fila de la leyenda lleva a su commit');
    if (/undefined|NaN|agents\./.test(r.text)) throw new Error('texto sin resolver en la leyenda: ' + r.text.slice(0, 160));
    if (!r.checked || !r.url.includes('interactions=1')) throw new Error(`el interruptor (${r.checked}) o la URL (${r.url})`);
  });
  await step(page, 'interacciones en el grafo: en 3D, los cubos, los arcos y las insignias; la ficha de un commit las dice', async () => {
    await page.click('#view-3d');
    // sin WebGL no hay lienzo: la app se queda en la 2D, que ya se miró
    if ((await page.locator('#graph3d canvas').count()) > 0) {
      const seen = await page
        .waitForFunction(() => document.querySelector('#graph3d')?.dataset.agents?.split(' ').map(Number), null, { timeout: T(5000) })
        .then((h) => h.jsonValue(), () => null);
      if (!seen) throw new Error('la vista 3D no dibujó las interacciones');
      const [arcs, pins, boxes] = seen;
      if (arcs < 1 || pins < 1 || boxes < 3) throw new Error(`en 3D: ${arcs} arcos, ${pins} insignias y ${boxes} cubos`);
    }
    // la ficha (la misma en 2D y 3D: graph.js tipHTML) de la punta del PR de la app de Claude dice quién lo revisó
    await page.click('#view-2d');
    await page.focus('#graph');
    await page.keyboard.press('End');
    await page.waitForTimeout(500);
    let tip = '';
    for (const h of await page.$$('#graph svg .head[role=button]:not(.exit)')) {
      if (!(await h.isVisible())) continue;
      await h.focus();
      await page.keyboard.press('Enter');
      tip = await page.waitForSelector('#graph .tip:not([hidden]) .tip-ag', { timeout: T(800) }).then((x) => x.textContent(), () => '');
      await page.keyboard.press('Escape');
      if (tip) break;
    }
    if (!/ (continuó|fusionó|revisó|comentó) /.test(tip)) throw new Error('ninguna ficha de rama dice sus interacciones: ' + JSON.stringify(tip));
  });
  await step(page, 'pasar por un agente de la leyenda enciende sus interacciones en el grafo y deja tenues las demás', async () => {
    await page.hover('#ag-key-body .agk-row[data-key]');
    const r = await page.evaluate(() => ({ dim: document.querySelectorAll('#graph .ag-arc.ag-dim, #graph .ag-pin.ag-dim').length, hot: document.querySelectorAll('#graph .ag-arc.ag-hot, #graph .ag-pin.ag-hot').length }));
    if (!r.hot || !r.dim) throw new Error(`la leyenda no ilumina: ${r.hot} encendidas y ${r.dim} tenues`);
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => !document.querySelector('#graph .ag-dim'), null, { timeout: T(2000) }).catch(() => {
      throw new Error('al salir de la leyenda las interacciones siguen tenues');
    });
  });
  await step(page, 'solo entre agentes vale también en el grafo; × quita las interacciones, el foco no se pierde y se olvida', async () => {
    await page.click('#view-agents');
    await page.waitForSelector('#agents:not([hidden])', { timeout: T(3000) });
    await page.click('#agents-only');
    await page.click('#view-2d');
    const only = await page.evaluate(() => [...document.querySelectorAll('#graph .ag-arc title, #graph .ag-pin title')].map((x) => x.textContent.replace(/[⁨⁩]/g, '')));
    const both = /^(Claude Code|GitHub Copilot|Dependabot)\b.* (continuó|fusionó|revisó|comentó) .*(Claude Code|GitHub Copilot|Dependabot)/;
    if (!only.length || only.some((x) => !both.test(x))) throw new Error('solo entre agentes, en el grafo: ' + only.join(' | '));
    await page.evaluate(() => localStorage.removeItem('graphbranch:agentsOnly'));
    await page.click('#ag-key-close');
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => ({
      key: document.querySelector('#ag-key').hidden,
      left: document.querySelectorAll('#graph .ag-arc, #graph .ag-pin, #graph .ag-ring').length,
      url: location.search,
      stored: localStorage.getItem('graphbranch:agentGraph'),
      checked: document.querySelector('#agents-graph').checked,
      focus: document.activeElement === document.body ? 'body' : document.activeElement?.id || document.activeElement?.className,
    }));
    if (!off.key || off.left || off.checked) throw new Error(`× dejó la leyenda (${!off.key}), ${off.left} marcas o el interruptor (${off.checked})`);
    if (off.url.includes('interactions=') || off.stored) throw new Error(`× dejó interactions= en la URL (${off.url}) o guardado (${off.stored})`);
    if (off.focus === 'body') throw new Error('al quitar las interacciones el foco cayó a <body>');
    await page.click('#pause-btn');
  });
  await page.context().close();
}

if (seccion(`Celular (390×844), ${langs.length} idiomas`))
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

sinContextos();
await browser?.close();
server.close();

if (!corridas.length) {
  console.log(`\nNinguna sección coincide con ${[...solo, ...exactas].join(', ')} (node tools/smoke.mjs --secciones las lista).`);
  process.exit(2);
}
if (listar) process.exit(0);
if (failures) {
  console.log(`\n${failures} fallo(s).`);
  for (const [titulo, pasos] of conFallos) {
    console.log(`§ ${titulo}`);
    for (const paso of pasos) console.log(`· ${paso}`);
  }
  process.exit(1);
}
console.log(pedidas ? `\nTodo bien (${corridas.length} de las secciones: ${corridas.join(' · ')}).` : '\nTodo bien.');
