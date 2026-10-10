/* Service worker de la web (lo registra js/pwa.js): guarda la página para abrirla sin red.

   - Al instalarse guarda en la caché todo lo que la página puede pedir: index.html, el manifiesto,
     los íconos y todo css/, js/ y vendor/ (FILES; tools/pwa.test.mjs comprueba que no falte ni
     sobre nada).
   - Con red, esos archivos se piden a la red como siempre y la copia guardada se pone al día: quien
     está conectado siempre ve la última versión. Sin red, se sirve la copia.
   - Nunca guarda nada de otro sitio: las respuestas de api.github.com llevan datos privados si hay
     token, y los avatares van y vienen de GitHub. Esas peticiones no pasan por aquí. */
'use strict';

const CACHE = 'graphbranch';
const FILES = [
  'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'js/app.js', 'js/director.js', 'js/feed.js', 'js/flight.js', 'js/galaxy.js', 'js/game.js', 'js/graph.js',
  'js/graph3d.js', 'js/i18n-apply.js', 'js/i18n.js', 'js/layout.js', 'js/palette.js', 'js/pwa.js',
  'js/replay.js', 'js/sound.js', 'js/util.js', 'js/world.js',
  'js/locales/ar.js', 'js/locales/bg.js', 'js/locales/bn.js', 'js/locales/ca.js', 'js/locales/cs.js',
  'js/locales/da.js', 'js/locales/de.js', 'js/locales/el.js', 'js/locales/en.js', 'js/locales/es.js',
  'js/locales/fa.js', 'js/locales/fi.js', 'js/locales/fil.js', 'js/locales/fr.js', 'js/locales/he.js',
  'js/locales/hi.js', 'js/locales/hr.js', 'js/locales/hu.js', 'js/locales/id.js', 'js/locales/it.js',
  'js/locales/ja.js', 'js/locales/ko.js', 'js/locales/ms.js', 'js/locales/nb.js', 'js/locales/nl.js',
  'js/locales/pl.js', 'js/locales/pt.js', 'js/locales/ro.js', 'js/locales/ru.js', 'js/locales/sk.js',
  'js/locales/sv.js', 'js/locales/sw.js', 'js/locales/ta.js', 'js/locales/th.js', 'js/locales/tr.js',
  'js/locales/uk.js', 'js/locales/ur.js', 'js/locales/vi.js', 'js/locales/zh-Hans.js',
  'js/locales/zh-Hant.js',
  'js/sources/demo-content.js', 'js/sources/demo.js', 'js/sources/github.js',
  'vendor/OrbitControls.js', 'vendor/d3.LICENSE.txt', 'vendor/d3.min.js', 'vendor/fonts.css',
  'vendor/three.LICENSE.txt', 'vendor/three.min.js',
  'vendor/fonts/BricolageGrotesque-OFL.txt', 'vendor/fonts/BricolageGrotesque-latin-ext.woff2',
  'vendor/fonts/BricolageGrotesque-latin.woff2', 'vendor/fonts/BricolageGrotesque-vietnamese.woff2',
  'vendor/fonts/InstrumentSans-OFL.txt', 'vendor/fonts/InstrumentSans-latin-ext.woff2',
  'vendor/fonts/InstrumentSans-latin.woff2', 'vendor/fonts/JetBrainsMono-OFL.txt',
  'vendor/fonts/JetBrainsMono-cyrillic-ext-italic.woff2', 'vendor/fonts/JetBrainsMono-cyrillic-ext.woff2',
  'vendor/fonts/JetBrainsMono-cyrillic-italic.woff2', 'vendor/fonts/JetBrainsMono-cyrillic.woff2',
  'vendor/fonts/JetBrainsMono-greek-italic.woff2', 'vendor/fonts/JetBrainsMono-greek.woff2',
  'vendor/fonts/JetBrainsMono-latin-ext-italic.woff2', 'vendor/fonts/JetBrainsMono-latin-ext.woff2',
  'vendor/fonts/JetBrainsMono-latin-italic.woff2', 'vendor/fonts/JetBrainsMono-latin.woff2',
  'vendor/fonts/JetBrainsMono-vietnamese-italic.woff2', 'vendor/fonts/JetBrainsMono-vietnamese.woff2',
];

/** La carpeta del sitio (en GitHub Pages, /GraphBranch/), con barra al final. */
const BASE = new URL('./', self.location).href;
const KEYS = new Set(FILES.map((f) => new URL(f, BASE).href));

/** La clave de la caché que corresponde a una petición, o null si no se toca. La query string
    no cuenta (index.html?repo=… es la misma página) y la carpeta del sitio es index.html. */
function keyFor(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  url.search = url.hash = '';
  if (request.mode === 'navigate' && url.href === BASE) return BASE + 'index.html';
  return KEYS.has(url.href) ? url.href : null;
}

self.addEventListener('install', (event) => {
  // no-cache: se revalida con el servidor en vez de tomar lo que el navegador tenga guardado
  const requests = FILES.map((f) => new Request(new URL(f, BASE), { cache: 'no-cache' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // lo que ya no está en FILES (archivos que se borraron o renombraron) sale de la caché
      const cache = await caches.open(CACHE);
      const stale = (await cache.keys()).filter((r) => !KEYS.has(r.url));
      await Promise.all(stale.map((r) => cache.delete(r)));
      // la página se pide a la red en paralelo con el arranque del worker: no espera por él
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const key = keyFor(event.request);
  if (!key) return; // la API de GitHub, los avatares y lo demás van directo a la red, sin guardarse
  event.respondWith(
    (async () => {
      try {
        const res = (event.request.mode === 'navigate' && (await event.preloadResponse)) || (await fetch(event.request));
        if (res.ok && res.type === 'basic' && !res.redirected) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy)));
        }
        return res;
      } catch (err) {
        // sin red: la copia guardada; si no la hay, el mismo error que daría el navegador
        const saved = await caches.match(key, { cacheName: CACHE });
        if (saved) return saved;
        throw err;
      }
    })(),
  );
});
