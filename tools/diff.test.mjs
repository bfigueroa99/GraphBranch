#!/usr/bin/env node
/* Pruebas de js/diff.js (leer un diff, el commit anterior y el siguiente) y de los cambios inventados de
   la demo, con datos fijos.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/diff.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const ctx = vm.createContext({ window: { GB: {} }, TextEncoder, TextDecoder });
vm.runInContext(code('diff.js'), ctx, { filename: 'diff.js' });
const D = ctx.window.GB.diff;
const plain = (x) => JSON.parse(JSON.stringify(x)); // fuera del contexto de vm, para comparar con deepEqual

/** Un `git diff-tree -p --root` de verdad: la línea del commit, un archivo nuevo, uno cambiado,
    un renombre con cambios, uno borrado, un binario y una ruta con comillas. */
const GIT = `0123456789abcdef0123456789abcdef01234567
diff --git a/nuevo.txt b/nuevo.txt
new file mode 100644
index 0000000..3b18e51
--- /dev/null
+++ b/nuevo.txt
@@ -0,0 +1,2 @@
+hola
+mundo
diff --git a/src/app.js b/src/app.js
index 1111111..2222222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,4 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;

 export { a, b };
@@ -10,2 +10,3 @@ function f() {
   return a;
+  // nada
 }
\\ No newline at end of file
diff --git a/viejo.md b/docs/nuevo.md
similarity index 90%
rename from viejo.md
rename to docs/nuevo.md
index 3333333..4444444 100644
--- a/viejo.md
+++ b/docs/nuevo.md
@@ -1 +1 @@
-# Viejo
+# Nuevo
diff --git a/borrado.txt b/borrado.txt
deleted file mode 100644
index 5555555..0000000
--- a/borrado.txt
+++ /dev/null
@@ -1 +0,0 @@
-adiós
diff --git a/logo.png b/logo.png
index 6666666..7777777 100644
Binary files a/logo.png and b/logo.png differ
diff --git "a/caf\\303\\251 \\"x\\".txt" "b/caf\\303\\251 \\"x\\".txt"
index 8888888..9999999 100644
--- "a/caf\\303\\251 \\"x\\".txt"
+++ "b/caf\\303\\251 \\"x\\".txt"
@@ -1 +1 @@
-a
+b
`;

test('parseGit: cada archivo con su estado, sus líneas y su tramo', () => {
  const files = plain(D.parseGit(GIT));
  assert.deepEqual(
    files.map((f) => [f.path, f.status, f.from, f.add, f.del, f.binary]),
    [
      ['nuevo.txt', 'added', null, 2, 0, false],
      ['src/app.js', 'modified', null, 2, 1, false],
      ['docs/nuevo.md', 'renamed', 'viejo.md', 1, 1, false],
      ['borrado.txt', 'removed', null, 0, 1, false],
      ['logo.png', 'modified', null, 0, 0, true],
      ['café "x".txt', 'modified', null, 1, 1, false],
    ],
  );
  assert.ok(files[1].patch.startsWith('@@ -1,4 +1,4 @@'));
  assert.equal(files[4].patch, null, 'un binario no tiene tramo');
  assert.ok(!files[5].patch.endsWith('\n'), 'el salto final del texto no queda en el último tramo');
});

test('parseGit: un texto vacío (un commit sin cambios) no da archivos', () => {
  assert.deepEqual(plain(D.parseGit('')), []);
  assert.deepEqual(plain(D.parseGit('0123456789abcdef0123456789abcdef01234567\n')), []);
});

test('hunks: los números de línea de antes y de después, la línea de contexto vacía y el aviso del final', () => {
  const [, app] = D.parseGit(GIT);
  const h = plain(D.hunks(app.patch));
  assert.equal(h.length, 2);
  assert.deepEqual(
    h[0].lines.map((l) => [l.t, l.a, l.b, l.s]),
    [
      [' ', 1, 1, 'const a = 1;'],
      ['-', 2, null, 'const b = 2;'],
      ['+', null, 2, 'const b = 3;'],
      [' ', 3, 3, ''],
      [' ', 4, 4, 'export { a, b };'],
    ],
  );
  assert.equal(h[1].head, '@@ -10,2 +10,3 @@ function f() {');
  assert.deepEqual(h[1].lines.at(-1), { t: '\\', a: null, b: null, s: 'No newline at end of file' });
  assert.deepEqual(h[1].lines.at(-2), { t: ' ', a: 11, b: 12, s: '}' });
});

test('count y totals: las líneas de un tramo y lo que suma un commit', () => {
  assert.deepEqual(plain(D.count('@@ -1 +1,2 @@\n-a\n+b\n+c')), { add: 2, del: 1 });
  assert.deepEqual(plain(D.count(null)), { add: 0, del: 0 });
  assert.deepEqual(plain(D.totals([{ add: 2, del: 1 }, { add: 0, del: 4 }])), { files: 2, add: 2, del: 5 });
});

test('unquote: rutas con comillas de git, con escapes y bytes de UTF-8', () => {
  assert.equal(D.unquote('"a/\\303\\261and\\303\\272.js"'), 'a/ñandú.js');
  assert.equal(D.unquote('"tab\\there"'), 'tab\there');
  assert.equal(D.unquote('sin/comillas.js'), 'sin/comillas.js');
});

/** main: m1 ← m2 ← m3 ← m4; feature sale de m2: f1 ← f2; m4 es el merge de f2 en main. */
function repo() {
  const c = (sha, date, ...parents) => [sha, { sha, date, parents }];
  return {
    commits: new Map([c('m1', 1), c('m2', 2, 'm1'), c('f1', 3, 'm2'), c('m3', 4, 'm2'), c('f2', 5, 'f1'), c('m4', 6, 'm3', 'f2')]),
  };
}
const chains = { m1: 'b:main', m2: 'b:main', m3: 'b:main', m4: 'b:main', f1: 'b:feature', f2: 'b:feature' };
const chainOf = (sha) => chains[sha];

test('steps: el anterior es el primer padre; el siguiente sigue la misma rama', () => {
  const d = repo();
  assert.deepEqual(plain(D.steps(d, 'm4', { chainOf })), { older: 'm3', newer: null });
  assert.deepEqual(plain(D.steps(d, 'm2', { chainOf })), { older: 'm1', newer: 'm3' }, 'm2 tiene dos hijos: sigue por main');
  assert.deepEqual(plain(D.steps(d, 'f1', { chainOf })), { older: 'm2', newer: 'f2' });
  assert.deepEqual(plain(D.steps(d, 'm1', { chainOf })), { older: null, newer: 'm2' });
});

test('steps: al volver, el siguiente es el commit de donde se vino; sin cadenas, el hijo más nuevo', () => {
  const d = repo();
  assert.equal(D.steps(d, 'm2', { chainOf, prefer: 'f1' }).newer, 'f1');
  assert.equal(D.steps(d, 'm2', { prefer: 'zzz' }).newer, 'm3', 'm3 (4) es más nuevo que f1 (3)');
  assert.deepEqual(plain(D.steps(d, 'no-está')), { older: null, newer: null });
});

test('steps: un padre que no está cargado no se ofrece', () => {
  const d = repo();
  d.commits.delete('m1');
  assert.equal(D.steps(d, 'm2').older, null);
});

test('la demo inventa los cambios de un commit a partir de su mensaje, y siempre los mismos', async () => {
  const dctx = vm.createContext({
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    console,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  dctx.window = dctx;
  for (const f of ['util.js', 'diff.js']) vm.runInContext(code(f), dctx, { filename: f });
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), text: String, fmtNum: String };`, dctx);
  for (const f of ['sources/demo-content.js', 'sources/demo.js']) vm.runInContext(code(f), dctx, { filename: f });
  const src = new dctx.GB.DemoSource();
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  src.data.commits.set(sha, { sha, parents: ['p'], message: 'feat(search): first version', author: {}, date: 1 });
  const a = plain(await src.commitDiff(sha));
  const b = plain(await src.commitDiff(sha));
  assert.deepEqual(a, b, 'el mismo commit da los mismos cambios');
  assert.ok(a.files.length >= 1 && a.files.every((f) => f.path.includes('search') || f.path === 'src/router.ts'), JSON.stringify(a.files.map((f) => f.path)));
  for (const f of a.files) {
    assert.deepEqual(plain(D.count(f.patch)), { add: f.add, del: f.del }, 'las cifras salen del tramo');
    const lines = D.hunks(f.patch).flatMap((h) => h.lines);
    assert.ok(lines.length > 0);
  }
  assert.equal(src.diffCheap(), true);
});
