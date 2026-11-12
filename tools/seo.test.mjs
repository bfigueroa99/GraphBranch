/* Lo que un buscador, una red social o un asistente leen de la página sin ejecutarla (index.html): título,
   descripción, dirección canónica, Open Graph, tarjeta de Twitter y JSON-LD. La web es una sola dirección
   (package.json «homepage») con los 40 idiomas en el cliente: por eso hay canónica y no hay hreflang, y no hay
   robots.txt ni sitemap.xml (un sitio de proyecto de GitHub Pages vive bajo /GraphBranch/, y los rastreadores
   solo leen el robots.txt de la raíz del dominio, que es de otro repositorio). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const HOME = pkg.homepage;

const locale = (code) => {
  let dict = null;
  vm.runInNewContext(readFileSync(join(root, 'js', 'locales', `${code}.js`), 'utf8'), { GB: { i18n: { define: (c, d) => (dict = d) } } });
  return dict;
};
const en = locale('en');

/** El `content` de <meta name|property="…">, o null. */
const meta = (name) => {
  const m = head.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
};
const title = () => head.match(/<title[^>]*>([^<]*)<\/title>/)?.[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Ancho y alto de un PNG (su cabecera IHDR). */
const pngSize = (file) => {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} no es un PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
};

test('el título dice qué es la página, con la marca, y es el texto en inglés de meta.title', () => {
  const t = title();
  assert.equal(t, en['meta.title']);
  assert.match(head, /<title data-i18n="meta\.title">/, 'el título se traduce con los demás textos');
  assert.match(t, /GraphBranch$/);
  assert.match(t, /GitHub/);
  assert.match(t, /branch/i);
  assert.ok(t.length >= 30 && t.length <= 60, `${t.length} caracteres: un buscador lo corta pasados los 60`);
});

test('meta.title está en los 40 idiomas y termina con la marca', () => {
  const files = readdirSync(join(root, 'js', 'locales')).filter((f) => f.endsWith('.js'));
  assert.equal(files.length, 40);
  for (const f of files) {
    const t = locale(f.slice(0, -3))['meta.title'];
    assert.equal(typeof t, 'string', `${f}: falta meta.title`);
    assert.match(t, / · GraphBranch$/, f);
    assert.ok(t.length <= 80, `${f}: ${t.length} caracteres`);
  }
});

test('la descripción es la de meta.description en inglés', () => {
  assert.equal(meta('description'), en['meta.description']);
});

test('la dirección canónica es la de la web publicada, la misma en todas partes', () => {
  assert.match(HOME, /^https:\/\/[a-z0-9-]+\.github\.io\/GraphBranch\/$/);
  const canon = [...head.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(canon, [HOME]); // una sola: ?repo=…, ?embed=1 y ?lang= son la misma página
  assert.equal(meta('og:url'), HOME);
  const ext = readFileSync(join(root, 'browser-extension', 'repo.js'), 'utf8');
  assert.ok(ext.includes(`'${HOME}'`), 'la extensión del navegador abre otra dirección');
});

test('sin hreflang ni robots: una sola dirección para los 40 idiomas, y nada que impida indexarla', () => {
  assert.doesNotMatch(head, /hreflang=/);
  assert.doesNotMatch(head, /<meta name="robots"/);
  assert.ok(!existsSync(join(root, 'robots.txt')), 'un robots.txt bajo /GraphBranch/ no lo lee ningún rastreador');
});

test('Open Graph y la tarjeta de Twitter dicen lo mismo que el título y la descripción', () => {
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('og:site_name'), 'GraphBranch');
  assert.equal(meta('og:title'), title());
  assert.equal(meta('og:description'), meta('description'));
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:title'), title());
  assert.equal(meta('twitter:description'), meta('description'));
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.ok(meta('og:image:alt')?.length > 20);
  assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
});

test('la imagen para compartir existe, es de la web publicada y mide lo que dice', () => {
  const url = meta('og:image');
  assert.ok(url?.startsWith(HOME), `og:image tiene que ser absoluta y de ${HOME}: ${url}`);
  const file = join(root, url.slice(HOME.length));
  assert.ok(existsSync(file), `${url.slice(HOME.length)} no existe`);
  const { w, h, bytes } = pngSize(file);
  assert.deepEqual({ w, h }, { w: 1200, h: 630 }); // la proporción 1,91:1 que piden las tarjetas grandes
  assert.equal(meta('og:image:width'), String(w));
  assert.equal(meta('og:image:height'), String(h));
  assert.equal(meta('og:image:type'), 'image/png');
  assert.ok(bytes < 600_000, `${bytes} bytes: varias redes descartan una imagen pesada`);
});

test('el JSON-LD es válido y describe la app con datos del propio repo', () => {
  const blocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(blocks.length, 1);
  const ld = JSON.parse(blocks[0]);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.name, 'GraphBranch');
  assert.equal(ld.url, HOME);
  assert.equal(ld.image, meta('og:image'));
  assert.equal(ld.author.name, pkg.author);
  assert.match(ld.sameAs, /^https:\/\/github\.com\/[\w-]+\/GraphBranch$/); // el repo público: de ahí salen el código y los instaladores
  assert.equal(ld.license, `https://spdx.org/licenses/${pkg.license}.html`);
  assert.deepEqual(ld.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  assert.ok(ld.description.startsWith(en['meta.description'].replace(/\.$/, '')), 'la descripción arranca como la de la página');
  // los idiomas son los de la app, ni uno más
  const codes = [...readFileSync(join(root, 'js', 'i18n.js'), 'utf8').matchAll(/\{ code: '([^']+)', name:/g)].map((m) => m[1]);
  assert.deepEqual([...ld.inLanguage].sort(), [...codes].sort());
  // sin valoraciones ni reseñas inventadas, y sin cadenas vacías
  assert.equal(ld.aggregateRating, undefined);
  assert.equal(ld.review, undefined);
  JSON.stringify(ld, (k, v) => {
    assert.notEqual(v, '', `${k} está vacío`);
    return v;
  });
});

test('el JSON-LD no abre el CSP: sigue sin scripts en línea que se ejecuten', () => {
  assert.match(head, /script-src 'self';/);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1].trim());
  assert.deepEqual(inline, ['type="application/ld+json"']); // un bloque de datos: el navegador no lo ejecuta
});
