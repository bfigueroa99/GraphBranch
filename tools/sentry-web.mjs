#!/usr/bin/env node
/* Pone (o saca) el DSN de Sentry de la web en index.html, junto con su host en connect-src del CSP: los informes
   de errores de la página (js/sentry.js) solo se ofrecen si están los dos, y sin DSN no se ofrece nada ni sale
   nada. El repo no trae ninguno: lo pone quien publica la página, sobre la copia que se sirve.

     node tools/sentry-web.mjs                         pone el de SENTRY_DSN (o el de electron/sentry-dsn.txt)
     node tools/sentry-web.mjs --dsn=https://<clave>@<host>/<proyecto>
     node tools/sentry-web.mjs --quitar                saca el DSN y su host
       --html=<ruta>             otro index.html (por defecto, el del repo)
       --release=<nombre>        o SENTRY_RELEASE; por defecto, graphbranch@<versión de package.json>
       --environment=<nombre>    o SENTRY_ENVIRONMENT; por defecto, production

   Solo se acepta un DSN https con su clave pública y su proyecto (la clave secreta de un DSN viejo se descarta), y
   en connect-src se suma solo su host (si ya estaba, no se repite ni se quita al sacarlo). No imprime el DSN ni el
   host. Correrlo dos veces deja lo mismo, y --quitar deja index.html como estaba. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseDsn, releaseName, environmentName } = createRequire(import.meta.url)('../js/sentry.js');

const CSP = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/;
const META = /\n<meta name="sentry-dsn"[^>]*>/;
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unattr = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Las fuentes de connect-src del CSP de `html`, en orden. */
export function connectSrc(html) {
  const csp = CSP.exec(html)?.[2] || '';
  return (/(?:^|;)\s*connect-src\s+([^;]*)/.exec(csp)?.[1] || '').trim().split(/\s+/).filter(Boolean);
}

/** `html` sin el DSN de Sentry ni el host que se sumó con él (el que ya estaba antes, queda). */
export function remove(html) {
  const meta = META.exec(html);
  if (!meta) return html;
  const added = /\sdata-added-host="([^"]*)"/.exec(meta[0]);
  let out = html.replace(META, '');
  if (added) {
    const host = unattr(added[1]);
    out = out.replace(CSP, (m, a, csp, z) => a + csp.replace(/(connect-src\s[^;]*)/, (d) => d.replace(new RegExp(`\\s${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`), '')) + z);
  }
  return out;
}

/** `html` con el DSN de Sentry (en <meta name="sentry-dsn">, después del CSP) y su host en connect-src. Lanza si el
    DSN no es uno o si el archivo no tiene el CSP de la página. */
export function apply(html, { dsn, release = '', environment = '' } = {}) {
  const target = parseDsn(dsn);
  if (!target) throw new Error('el DSN no es uno de Sentry: https://<clave>@<host>/<proyecto>');
  const base = remove(html);
  if (!CSP.test(base) || !/(?:^|;)\s*connect-src\s/.test(CSP.exec(base)[2])) throw new Error('index.html no tiene el CSP con connect-src');
  const had = connectSrc(base).includes(target.origin);
  const meta =
    `\n<meta name="sentry-dsn" content="${attr(target.dsn)}"` +
    ` data-release="${attr(releaseName(release, 'graphbranch@0.1.0'))}" data-environment="${attr(environmentName(environment, 'production'))}"` +
    (had ? '' : ` data-added-host="${attr(target.origin)}"`) +
    '>';
  return base.replace(CSP, (m, a, csp, z) => a + (had ? csp : csp.replace(/(connect-src\s[^;]*?)(\s*)(;|$)/, `$1 ${target.origin}$2$3`)) + z + meta);
}

function main(argv, env) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const file = resolve(arg('html') || join(root, 'index.html'));
  const html = readFileSync(file, 'utf8');
  if (argv.includes('--quitar')) {
    const out = remove(html);
    if (out !== html) writeFileSync(file, out);
    console.log(out === html ? `${file}: no tenía un DSN de Sentry` : `${file}: sin el DSN de Sentry ni su host en connect-src`);
    return 0;
  }
  const fromFile = join(root, 'electron', 'sentry-dsn.txt');
  const dsn = arg('dsn') || env.SENTRY_DSN || (existsSync(fromFile) ? readFileSync(fromFile, 'utf8').trim() : '');
  if (!dsn) {
    console.error('Falta el DSN: --dsn=…, SENTRY_DSN o electron/sentry-dsn.txt');
    return 1;
  }
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const release = arg('release') || env.SENTRY_RELEASE || `graphbranch@${version}`;
  const environment = arg('environment') || env.SENTRY_ENVIRONMENT || 'production';
  if (releaseName(release) !== release) return console.error('El release no es un nombre válido para Sentry (sin barras ni saltos, hasta 200)'), 1;
  if (environmentName(environment) !== environment) return console.error('El entorno no es un nombre válido para Sentry (letras, números, «.», «-» y «_», hasta 64)'), 1;
  let out;
  try {
    out = apply(html, { dsn, release, environment });
  } catch (err) {
    console.error(`No se cambió nada: ${err.message}`);
    return 1;
  }
  if (out !== html) writeFileSync(file, out);
  console.log(`${file}: con el DSN de Sentry (release ${release}, entorno ${environment}) y su host en connect-src. Sácalo con --quitar.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2), process.env);
