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
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

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

  if (has3d) {
    await step(page, 'vuelve a 3D', async () => {
      await page.click('#view-3d');
      await page.waitForSelector('#graph3d', { state: 'visible', timeout: 5000 });
      await page.waitForTimeout(1500); // unos cuantos cuadros de animación
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
  };
  const repo = (full) => {
    if (!repos.has(full)) {
      const r = { full, branches: new Map(), commits: new Map() };
      for (let i = 0; i < 4; i++) commit(r, 'main', `inicio ${i} de ${full}`);
      repos.set(full, r);
    }
    return repos.get(full);
  };
  const route = (path, q) => {
    const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if (!m || !repos.has(m[1])) return { status: 404, body: { message: 'Not Found' } };
    const r = repos.get(m[1]);
    const [owner, name] = m[1].split('/');
    const rest = m[2] || '';
    if (!rest) return { body: { name, owner: { login: owner }, default_branch: 'main', html_url: `https://github.com/${m[1]}`, private: false, description: '' } };
    if (rest === '/branches') return { body: [...r.branches].map(([b, s]) => ({ name: b, commit: { sha: s }, protected: false })) };
    if (rest === '/events' || rest === '/pulls') return { body: [] };
    if (rest === '/commits') {
      let s = r.branches.get(q.get('sha')) || q.get('sha');
      const out = [];
      while (s && r.commits.has(s) && out.length < Number(q.get('per_page') || 30)) {
        out.push(r.commits.get(s));
        s = r.commits.get(s).parents[0]?.sha;
      }
      return out.length ? { body: out } : { status: 404, body: { message: 'No commit found' } };
    }
    return { status: 404, body: { message: 'Not Found' } };
  };
  return {
    calls,
    repo,
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
      await page.waitForTimeout(500); // los colores cambian con transición: se mide cuando terminan
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

  const full = await openPage({ viewport: { width: 1280, height: 800 } });
  await full.unroute('https://api.github.com/**');
  await full.route('https://api.github.com/**', gh.handle);
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

/* ---------- celular ---------- */

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const langs = allLangs
  ? [...readFileSync(join(root, 'js', 'i18n.js'), 'utf8').matchAll(/\{ code: '([^']+)', name:/g)].map((m) => m[1])
  : ['es', 'de', 'ar'];

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
    const hiddenOff = await humming(false);
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
