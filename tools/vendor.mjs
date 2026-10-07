#!/usr/bin/env node
/* Copia a vendor/ las librerías y fuentes de la página, para que funcione sin conexión
   (la app de escritorio, y también index.html abierto con doble clic).

     node tools/vendor.mjs

   Cada script se compara con el hash que publica su CDN: si llega otra cosa, no se escribe nada.
   Para cambiar de versión, actualiza aquí su URL y su hash (ver "Seguridad" en el README).
   Las fuentes salen de Google Fonts con sus subconjuntos (latin, cyrillic, greek…), cada uno con
   su unicode-range: el navegador baja solo los que pide el texto en pantalla.
   vendor/ se reescribe entero. Detrás de un proxy: NODE_USE_ENV_PROXY=1 node tools/vendor.mjs */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor');

const SCRIPTS = [
  {
    file: 'd3.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
    sha384: 'CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i',
  },
  {
    file: 'three.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    sha384: 'CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu',
  },
  {
    file: 'OrbitControls.js',
    url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
    sha384: 'wagZhIFgY4hD+7awjQjR4e2E294y6J2HSnd8eTNc15ZubTeQeVRZwhQJ+W6hnBsf',
  },
];

/** Las licencias piden viajar junto a las copias. */
const LICENSES = [
  { file: 'd3.LICENSE.txt', url: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/LICENSE' },
  { file: 'three.LICENSE.txt', url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/LICENSE' },
  { file: 'fonts/BricolageGrotesque-OFL.txt', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/OFL.txt' },
  { file: 'fonts/InstrumentSans-OFL.txt', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt' },
  { file: 'fonts/JetBrainsMono-OFL.txt', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt' },
];

const FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,500&display=swap';
/** Google entrega woff2 con unicode-range solo a navegadores que los entienden. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function get(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Ruta dentro de vendor/ → contenido. Se escribe al final, solo si todo llegó bien. */
const files = new Map();

for (const s of SCRIPTS) {
  const body = await get(s.url);
  const hash = createHash('sha384').update(body).digest('base64');
  if (hash !== s.sha384) throw new Error(`${s.file}: el hash no coincide (llegó sha384-${hash}, se esperaba sha384-${s.sha384})`);
  files.set(s.file, body);
}
for (const l of LICENSES) files.set(l.file, await get(l.url));

const css = (await get(FONTS_CSS, { 'user-agent': UA })).toString();
const faces = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face \{[^}]+\})/g)];
if (!faces.length || faces.length !== css.split('@font-face').length - 1) throw new Error('la hoja de Google Fonts no tiene el formato esperado');

/** Las fuentes variables comparten archivo entre pesos: URL → nombre local. */
const names = new Map();
let local = '/* Generado por tools/vendor.mjs desde Google Fonts: no editar a mano. */\n';
for (const [, subset, face] of faces) {
  const family = /font-family: '([^']+)'/.exec(face)[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(face)[1];
  if (!names.has(url)) {
    let name = `${family.replace(/ /g, '')}-${subset}${/font-style: italic/.test(face) ? '-italic' : ''}.woff2`;
    if ([...names.values()].includes(name)) name = name.replace('.woff2', `-${/font-weight: (\d+)/.exec(face)[1]}.woff2`);
    names.set(url, name);
    files.set('fonts/' + name, await get(url));
  }
  local += `/* ${subset} */\n${face.replace(url, 'fonts/' + names.get(url))}\n`;
}
files.set('fonts.css', Buffer.from(local));

rmSync(out, { recursive: true, force: true });
let bytes = 0;
for (const [rel, body] of files) {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, rel), body);
  bytes += body.length;
}
console.log(`vendor/: ${files.size} archivos, ${Math.round(bytes / 1024)} KB (${names.size} fuentes en ${faces.length} @font-face)`);
