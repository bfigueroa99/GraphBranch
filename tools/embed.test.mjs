import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** i18n.js en un contexto aislado con la URL que se le diga; devuelve GB y lo que quedó en <html>. */
function load(search) {
  const classes = new Set();
  const vars = {};
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    location: { search },
    navigator: { language: 'es', languages: ['es'] },
    document: {
      documentElement: {
        classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
        style: { setProperty: (k, v) => (vars[k] = v) },
        dataset: {},
        setAttribute() {},
        removeAttribute() {},
        querySelectorAll: () => [],
      },
      querySelectorAll: () => [],
      title: '',
      head: { appendChild() {} },
      createElement: () => ({}),
      addEventListener() {},
    },
    addEventListener() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(root, 'js', 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  return { GB: ctx.GB, classes, vars };
}

test('embedOptions: sin ?embed (o apagado) no hay capa', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions(''), null);
  assert.equal(GB.embedOptions('?embed=0&hide=notices'), null);
  assert.equal(GB.embedOptions('?repo=a/b&bg=transparent'), null);
});

test('embedOptions: por defecto se ve todo y el fondo es el de siempre', () => {
  const { GB } = load('');
  const o = GB.embedOptions('?embed=1');
  assert.equal(o.clear, false);
  assert.equal(o.color, '');
  assert.deepEqual([...o.hide], []);
});

test('embedOptions: bg transparente o hex, hide solo con nombres conocidos', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions('?embed=1&bg=transparent').clear, true);
  assert.equal(GB.embedOptions('?embed=1&bg=00FF00').color, '#00ff00');
  assert.equal(GB.embedOptions('?embed=1&bg=%23abc').color, '#abc');
  // nada que se cuele en el CSS: ni nombres de color ni funciones
  assert.equal(GB.embedOptions('?embed=1&bg=red').color, '');
  assert.equal(GB.embedOptions('?embed=1&bg=url(x)').color, '');
  assert.equal(GB.embedOptions('?embed=1&bg=12345').color, '');
  assert.deepEqual([...GB.embedOptions('?embed=1&hide=Notices, combo,notices,otra').hide], ['notices', 'combo']);
});

test('i18n.js marca <html> con lo que pide la URL', () => {
  const { classes, vars } = load('?embed=1&bg=00ff00&hide=notices');
  assert.ok(classes.has('embed') && classes.has('embed-color') && classes.has('embed-hide-notices'));
  assert.ok(!classes.has('embed-clear') && !classes.has('embed-hide-combo'));
  assert.equal(vars['--embed-bg'], '#00ff00');
});
