import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** i18n.js aislado, con los scripts de idioma en espera: `soltar(código)` los termina de cargar. */
function cargar() {
  const pendientes = new Map();
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    location: { search: '' },
    navigator: { language: 'en', languages: ['en'] },
    document: {
      documentElement: { classList: { add() {} }, style: { setProperty() {} }, dataset: {}, setAttribute() {}, removeAttribute() {} },
      querySelectorAll: () => [],
      title: '',
      head: { appendChild: (s) => pendientes.set(s.src.match(/(\w+)\.js$/)[1], s) },
      createElement: () => ({}),
      addEventListener() {},
    },
    addEventListener() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(root, 'js', 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  const soltar = (code) => {
    ctx.GB.i18n.define(code, {});
    pendientes.get(code).onload();
  };
  return { i18n: ctx.GB.i18n, soltar, ctx };
}

test('setLocale: si se eligen dos idiomas seguidos, gana el último elegido aunque cargue antes', async () => {
  const { i18n, soltar, ctx } = cargar();
  soltar('en');
  await i18n.ready;
  const avisos = [];
  i18n.onChange((l) => avisos.push(l));
  const a = i18n.setLocale('de');
  const b = i18n.setLocale('fr');
  soltar('fr');
  soltar('de'); // el primero en elegirse termina de cargar último
  await Promise.all([a, b]);
  assert.equal(ctx.document.documentElement.lang, 'fr');
  assert.equal(i18n.locale, 'fr');
  assert.deepEqual(avisos, ['fr']);
  assert.equal(await a, 'fr', 'la llamada vieja devuelve el idioma vigente');
});

test('cada tipo del panel de actividad (GB.Feed.KINDS) tiene su rótulo kind.* en inglés', () => {
  const feed = readFileSync(join(root, 'js', 'feed.js'), 'utf8');
  const bloque = feed.slice(feed.indexOf('const KINDS = {'), feed.indexOf('};', feed.indexOf('const KINDS = {')));
  const tipos = [...bloque.matchAll(/^\s+'?([\w-]+)'?: \{ cat:/gm)].map((m) => m[1]);
  assert.ok(tipos.includes('branch-rename') && tipos.length > 20, `tipos leídos: ${tipos.join(', ')}`);
  let en = null;
  vm.runInNewContext(readFileSync(join(root, 'js', 'locales', 'en.js'), 'utf8'), { GB: { i18n: { define: (c, dict) => (en = dict) } } });
  for (const k of tipos) assert.equal(typeof en[`kind.${k}`], 'string', `falta kind.${k} en en.js`);
});
