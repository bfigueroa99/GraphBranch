#!/usr/bin/env node
/* Pruebas de js/editor.js (lo que cambió entre dos textos y su diff unificado) y del base64 de js/util.js, y de
   la edición en la demo: un commit con los cambios de verdad.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/editor.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const ctx = vm.createContext({
  setTimeout,
  clearTimeout,
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  console,
  document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
ctx.window = ctx;
for (const f of ['util.js', 'diff.js', 'editor.js']) vm.runInContext(code(f), ctx, { filename: f });
const { U, editor: E, diff: D } = ctx.GB;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('b64encode y b64decode: UTF-8 de ida y vuelta, y lo binario se reconoce', () => {
  const s = 'café ñandú → 東京\n';
  assert.equal(U.b64encode(s), Buffer.from(s, 'utf8').toString('base64'));
  assert.deepEqual(plain(U.b64decode(U.b64encode(s))), { text: s, binary: false });
  assert.deepEqual(plain(U.b64decode('YWJj\nZGVm')), { text: 'abcdef', binary: false }, 'con saltos de línea, como los da la API');
  assert.equal(U.b64decode(Buffer.from([0x89, 0x50, 0, 0x47]).toString('base64')).binary, true, 'un byte nulo');
  assert.equal(U.b64decode(Buffer.from([0xff, 0xfe, 0xfd]).toString('base64')).binary, true, 'no es UTF-8');
  assert.equal(U.b64decode('%%%').binary, true);
  const big = 'x'.repeat(200000);
  assert.equal(U.b64decode(U.b64encode(big)).text.length, 200000, 'un archivo grande no revienta la pila');
  assert.equal(U.encPath('src/mi archivo#1.js'), 'src/mi%20archivo%231.js');
  // una ruta con «..» o «.» se normaliza en la URL (también como %2E): el pedido iría a otro lugar de la API
  for (const bad of ['../user/repos', 'src/../../x', './a', 'a//b', 'a/', '', '..', 'a\0b']) assert.equal(U.safePath(bad), false, bad);
  for (const ok of ['a', 'src/app.js', '.github/workflows/ci.yml', 'a..b/c', 'docs/v1.2/x.md']) assert.equal(U.safePath(ok), true, ok);
});

test('lineDiff y changes: el contexto, lo quitado y lo agregado, línea por línea', () => {
  const a = 'uno\ndos\ntres\ncuatro\n';
  const b = 'uno\nDOS\ntres\ncuatro\ncinco\n';
  assert.deepEqual(
    plain(E.lineDiff(a, b)).map((o) => o.t + o.s),
    [' uno', '-dos', '+DOS', ' tres', ' cuatro', '+cinco', ' '],
  );
  assert.deepEqual(plain(E.changes(a, b)), { add: 2, del: 1 });
  assert.deepEqual(plain(E.changes(a, a)), { add: 0, del: 0 });
  assert.deepEqual(plain(E.changes('', 'hola\n')), { add: 1, del: 0 }, 'un archivo nuevo: «hola» y la línea vacía del final son la misma que la del vacío');
});

test('patch: un diff unificado que el panel de cambios sabe leer, con 3 líneas de contexto y tramos separados', () => {
  const old = Array.from({ length: 30 }, (_, i) => `línea ${i + 1}`).join('\n');
  const now = old.replace('línea 2', 'línea dos').replace('línea 28', 'línea veintiocho');
  const p = E.patch(old, now);
  const hs = plain(D.hunks(p));
  assert.equal(hs.length, 2, 'dos cambios lejos uno del otro: dos tramos');
  assert.equal(hs[0].head, '@@ -1,5 +1,5 @@');
  assert.equal(hs[1].head, '@@ -25,6 +25,6 @@');
  assert.deepEqual(hs[0].lines.filter((l) => l.t !== ' ').map((l) => [l.t, l.a, l.b, l.s]), [
    ['-', 2, null, 'línea 2'],
    ['+', null, 2, 'línea dos'],
  ]);
  assert.deepEqual(plain(D.count(p)), { add: 2, del: 2 });
  assert.equal(E.patch('igual', 'igual'), '', 'sin cambios, sin tramos');
  assert.equal(E.patch('', 'a\nb'), '@@ -1,1 +1,2 @@\n-\n+a\n+b', 'de vacío (una línea vacía) a dos líneas');
});

test('la demo edita en memoria: lee un archivo inventado, el commit aparece en su rama y sus cambios son los de verdad', async () => {
  const dctx = vm.createContext({
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    console,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  dctx.window = dctx;
  for (const f of ['util.js', 'diff.js', 'editor.js']) vm.runInContext(code(f), dctx, { filename: f });
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), t: (k) => k, text: String, fmtNum: String };`, dctx);
  for (const f of ['sources/demo-content.js', 'sources/demo.js']) vm.runInContext(code(f), dctx, { filename: f });
  const src = new dctx.GB.DemoSource();
  src.seed();
  src.running = true;
  const updates = [];
  src.on('update', (u) => updates.push(u));
  assert.equal(src.canEdit(), true);
  assert.equal(src.canWrite(), null);
  const f = await src.readFile({ path: 'src/router.ts', ref: 'main' });
  assert.ok(f.text.length > 10 && !f.missing, 'un archivo del árbol de la demo');
  assert.equal((await src.readFile({ path: 'src/router.ts', ref: 'main' })).text, f.text, 'siempre el mismo');
  assert.equal((await src.readFile({ path: 'no/existe.txt', ref: 'main' })).missing, true);
  const head = src.data.branches.get('main').sha;
  const out = await src.writeFile({ path: 'src/router.ts', branch: 'main', text: f.text + 'export default router;\n', message: 'Actualiza src/router.ts' });
  const c = src.data.commits.get(out.sha);
  assert.equal(src.data.branches.get('main').sha, out.sha, 'el commit es la nueva cabeza de la rama');
  assert.deepEqual(Array.from(c.parents), [head]);
  assert.equal(c.message, 'Actualiza src/router.ts');
  assert.equal(updates.at(-1).activities[0].kind, 'push', 'llega al panel de actividad como un push');
  const diff = await src.commitDiff(out.sha);
  assert.equal(diff.files.length, 1);
  assert.equal(diff.files[0].path, 'src/router.ts');
  assert.deepEqual([diff.files[0].add, diff.files[0].del], [1, 0]);
  assert.ok(diff.files[0].patch.includes('+export default router;'));
  // lo guardado se vuelve a leer igual (y desde otra rama, el original)
  assert.equal((await src.readFile({ path: 'src/router.ts', ref: 'main' })).text, f.text + 'export default router;\n');
  const nuevo = await src.writeFile({ path: 'notas/nuevo.md', branch: 'main', text: '# Nuevo\n', message: 'Crea notas/nuevo.md' });
  assert.equal((await src.commitDiff(nuevo.sha)).files[0].status, 'added');
});
