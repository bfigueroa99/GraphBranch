#!/usr/bin/env node
/* Verifica las traducciones de js/locales contra el inglés (la base).

     node tools/check-i18n.mjs                 revisa todos los idiomas
     node tools/check-i18n.mjs fr de           revisa solo esos
     node tools/check-i18n.mjs --plurals ru    muestra las formas plurales que pide un idioma

   Errores (salida distinta de 0): faltan claves o sobran, cambian los {parámetros}
   o las etiquetas HTML, los plurales no traen las formas del idioma, un archivo no
   está en LOCALES, o el código usa una clave que no existe en inglés.
   Avisos: textos idénticos al inglés (puede ser legítimo: "Demo", "CI"…). */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'js', 'locales');

/** Idiomas romances: su categoría "many" solo aparece con millones redondos; no hace falta traducirla. */
const IGNORE_MANY = new Set(['es', 'fr', 'it', 'pt', 'ca']);

function requiredForms(code) {
  const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  return cats.filter((c) => !(c === 'many' && IGNORE_MANY.has(code)));
}

if (process.argv[2] === '--plurals') {
  for (const code of process.argv.slice(3)) console.log(`${code}: ${requiredForms(code).join(', ')}`);
  process.exit(0);
}

function loadLocale(code) {
  let defined = null;
  const sandbox = { GB: { i18n: { define: (c, dict) => (defined = { code: c, dict }) } } };
  vm.runInNewContext(readFileSync(join(localesDir, `${code}.js`), 'utf8'), sandbox, { filename: `${code}.js` });
  return defined;
}

const manifest = [...readFileSync(join(root, 'js', 'i18n.js'), 'utf8').matchAll(/\{ code: '([^']+)', name:/g)].map((m) => m[1]);
const files = readdirSync(localesDir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const only = process.argv.slice(2);
const targets = only.length ? only : files;

const errors = [];
const warnings = [];
const err = (code, msg) => errors.push(`${code}: ${msg}`);
const warn = (code, msg) => warnings.push(`${code}: ${msg}`);

const forms = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [v]);
const placeholders = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const tags = (s) => [...String(s).matchAll(/<\/?[a-zA-Z][^>]*>/g)].map((m) => m[0].toLowerCase()).sort().join('');

const en = loadLocale('en');
if (en?.code !== 'en') {
  console.error('js/locales/en.js debe llamar GB.i18n.define("en", …)');
  process.exit(1);
}

// la lista completa solo se cruza al revisar todo; con idiomas puntuales basta con los suyos
for (const code of targets) if (files.includes(code) && !manifest.includes(code)) err(code, 'tiene archivo pero no está en LOCALES (js/i18n.js)');
if (!only.length) for (const code of manifest) if (!files.includes(code)) err(code, 'está en LOCALES pero no existe js/locales/' + code + '.js');

for (const code of targets) {
  if (!files.includes(code)) {
    err(code, 'no existe js/locales/' + code + '.js');
    continue;
  }
  let loc;
  try {
    loc = loadLocale(code);
  } catch (e) {
    err(code, `no se pudo cargar: ${e.message}`);
    continue;
  }
  if (!loc || loc.code !== code) {
    err(code, `debe llamar GB.i18n.define('${code}', …)`);
    continue;
  }
  const dict = loc.dict;
  const need = requiredForms(code);
  const same = [];

  for (const key of Object.keys(en.dict)) {
    if (!(key in dict)) {
      err(code, `falta la clave "${key}"`);
      continue;
    }
    const base = en.dict[key];
    const got = dict[key];
    const basePlural = base && typeof base === 'object' && !Array.isArray(base);

    if (basePlural) {
      if (typeof got === 'string') {
        if (need.length !== 1 || need[0] !== 'other') err(code, `"${key}": este idioma pide formas plurales (${need.join(', ')}) y trae un texto simple`);
      } else if (got && typeof got === 'object' && !Array.isArray(got)) {
        for (const c of need) if (!(c in got)) err(code, `"${key}": falta la forma plural "${c}"`);
        for (const c of Object.keys(got)) if (!need.includes(c) && !(c === 'many' && IGNORE_MANY.has(code))) err(code, `"${key}": forma plural "${c}" que este idioma no usa`);
      } else err(code, `"${key}": debe ser un texto o un objeto de formas plurales`);
    } else if (typeof got !== typeof base || Array.isArray(got) !== Array.isArray(base)) {
      err(code, `"${key}": el tipo no coincide con el inglés`);
      continue;
    }

    const baseHolders = new Set(forms(base).flatMap((f) => [...placeholders(f)]));
    for (const f of forms(got)) {
      if (typeof f !== 'string' || !f.trim()) {
        err(code, `"${key}": texto vacío o no es un texto`);
        continue;
      }
      const have = placeholders(f);
      for (const p of have) if (!baseHolders.has(p)) err(code, `"${key}": parámetro {${p}} que no existe en inglés`);
      for (const p of baseHolders) if (p !== 'n' && !have.has(p)) err(code, `"${key}": falta el parámetro {${p}}`);
      if (basePlural && !have.has('n') && typeof got === 'string' && baseHolders.has('n')) err(code, `"${key}": falta {n}`);
    }
    const baseTags = forms(base).map(tags);
    for (const f of forms(got)) {
      if (typeof f === 'string' && !baseTags.includes(tags(f))) err(code, `"${key}": las etiquetas HTML no coinciden con el inglés`);
    }
    if (code !== 'en' && JSON.stringify(got) === JSON.stringify(base) && String(forms(base)[0]).length > 12) same.push(key);
  }
  for (const key of Object.keys(dict)) if (!(key in en.dict)) err(code, `clave "${key}" que no existe en inglés`);
  if (same.length) warn(code, `idénticos al inglés (¿sin traducir?): ${same.join(', ')}`);
}

/* claves usadas en el código que no existen en inglés */
const sources = ['index.html', ...readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f), ...readdirSync(join(root, 'js', 'sources')).map((f) => 'js/sources/' + f)];
const used = new Map();
const note = (key, file) => used.set(key, file);
for (const file of sources) {
  const src = readFileSync(join(root, file), 'utf8');
  for (const m of src.matchAll(/\b(?:t|html|msg|list|has|tr)\(\s*'([a-zA-Z][\w.-]*\.[\w.-]+)'/g)) note(m[1], file);
  for (const m of src.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) note(m[1], file);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) note(pair.split(':')[1]?.trim(), file);
}
for (const [key, file] of used) if (key && !(key in en.dict)) err('en', `${file} usa la clave "${key}" que no está en en.js`);

for (const w of warnings) console.warn('aviso  ' + w);
for (const e of errors) console.error('error  ' + e);
console.log(`${targets.length} idioma(s) revisados, ${errors.length} error(es), ${warnings.length} aviso(s).`);
process.exit(errors.length ? 1 : 0);
