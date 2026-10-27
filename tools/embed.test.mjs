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
  const attrs = {};
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
        setAttribute: (k, v) => (attrs[k] = v),
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
  return { GB: ctx.GB, classes, vars, attrs };
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

test('embedOptions: hide acepta legend, title y clock', () => {
  const { GB, classes } = load('?embed=1&hide=legend,title,clock');
  assert.deepEqual([...GB.embedOptions('?embed=1&hide=Legend, clock,title,reloj').hide], ['legend', 'clock', 'title']);
  assert.ok(classes.has('embed-hide-legend') && classes.has('embed-hide-title') && classes.has('embed-hide-clock'));
});

test('i18n.js marca <html> con lo que pide la URL', () => {
  const { classes, vars } = load('?embed=1&bg=00ff00&hide=notices');
  assert.ok(classes.has('embed') && classes.has('embed-color') && classes.has('embed-hide-notices'));
  assert.ok(!classes.has('embed-clear') && !classes.has('embed-hide-combo'));
  assert.equal(vars['--embed-bg'], '#00ff00');
});

test('embedOptions: rotate acepta de 5 a 3600 segundos y por defecto no rota', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions('?embed=1').rotate, 0);
  assert.equal(GB.embedOptions('?embed=1&rotate=30').rotate, 30);
  assert.equal(GB.embedOptions('?embed=1&rotate=5').rotate, 5);
  assert.equal(GB.embedOptions('?embed=1&rotate=3600').rotate, 3600);
  for (const bad of ['0', '4', '3601', '-3', '1.5', 'abc', '', '99999', '1e2']) assert.equal(GB.embedOptions('?embed=1&rotate=' + bad).rotate, 0, bad);
  assert.equal(GB.embedOptions('?rotate=30'), null);
});

test('embedOptions: theme solo admite light o dark, y marca data-theme en <html>', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions('?embed=1').theme, '');
  assert.equal(GB.embedOptions('?embed=1&theme=dark').theme, 'dark');
  assert.equal(GB.embedOptions('?embed=1&theme=LIGHT').theme, 'light');
  for (const bad of ['red', 'auto', '', 'dark;x', 'url(x)']) assert.equal(GB.embedOptions('?embed=1&theme=' + bad).theme, '', bad);
  assert.equal(GB.embedOptions('?theme=dark'), null);
  assert.equal(load('?embed=1&theme=dark').attrs['data-theme'], 'dark');
  assert.equal(load('?embed=1').attrs['data-theme'], undefined);
  assert.equal(load('?theme=dark').attrs['data-theme'], undefined);
});

test('embedOptions: title se limpia, se acota a 60 letras y no entra sin ?embed', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions('?embed=1').title, '');
  assert.equal(GB.embedOptions('?embed=1&title=Directo%20de%20hoy').title, 'Directo de hoy');
  assert.equal(GB.embedOptions('?embed=1&title=%20%20a%0Ab%09c%20').title, 'a b c');
  assert.equal(GB.embedOptions('?embed=1&title=' + 'x'.repeat(200)).title.length, 60);
  assert.equal(Array.from(GB.embedOptions('?embed=1&title=' + '😀'.repeat(100)).title).length, 60);
  assert.equal(GB.embedOptions('?embed=1&title=%3Cb%3Ehola').title, '<b>hola'); // se escapa al pintar (textContent)
  assert.equal(GB.embedOptions('?title=hola'), null);
});

test('embedOptions: max acepta de 1 a 200 y por defecto muestra todas las ramas', () => {
  const { GB } = load('');
  assert.equal(GB.embedOptions('?embed=1').max, 0);
  assert.equal(GB.embedOptions('?embed=1&max=5').max, 5);
  assert.equal(GB.embedOptions('?embed=1&max=1').max, 1);
  assert.equal(GB.embedOptions('?embed=1&max=200').max, 200);
  for (const bad of ['0', '201', '-3', '1.5', 'abc', '', '9999', '1e2', '5%20']) assert.equal(GB.embedOptions('?embed=1&max=' + bad).max, bad === '5%20' ? 5 : 0, bad);
  assert.equal(GB.embedOptions('?max=5'), null);
});
