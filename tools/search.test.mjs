#!/usr/bin/env node
/* Pruebas de js/search.js: búsqueda de commits por mensaje, SHA o autor y filtro por autor, con datos fijos.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/search.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'search.js'), 'utf8'), ctx, { filename: 'search.js' });
const S = ctx.window.GB.search;
const plain = (x) => JSON.parse(JSON.stringify(x)); // fuera del contexto de vm, para comparar con deepEqual

const DAYMS = 86400000;

function repo() {
  const c = (sha, message, who, date, parents = []) => [sha, { sha, parents, message, date, author: who }];
  const ana = { name: 'Ana Pérez', login: 'ana' };
  const luis = { name: 'Luis', login: null };
  return {
    commits: new Map([
      c('a1b2c3d', 'Agrega login\ncuerpo largo', ana, 1),
      c('e4f5a6b', 'Arregla el Login con OAuth', luis, 3),
      c('99aa88b', 'Merge feature', ana, 4, ['a1b2c3d', 'e4f5a6b']),
      c('7c7c7c7', 'sin autor', null, 2),
    ]),
  };
}

test('busca por mensaje sin distinguir mayúsculas, del más nuevo al más viejo, con la primera línea', () => {
  const r = plain(S.find(repo(), 'login'));
  assert.equal(r.total, 2);
  assert.deepEqual(r.results.map((x) => x.sha), ['e4f5a6b', 'a1b2c3d']);
  assert.equal(r.results[1].message, 'Agrega login');
});

test('busca por SHA (prefijo o parte) y todas las palabras tienen que aparecer', () => {
  assert.deepEqual(plain(S.find(repo(), 'e4f5')).results.map((x) => x.sha), ['e4f5a6b']);
  assert.equal(S.find(repo(), 'login oauth').total, 1);
  assert.equal(S.find(repo(), 'login zzz').total, 0);
});

test('busca por autor, con @ o sin él, por nombre o por login', () => {
  assert.deepEqual(plain(S.find(repo(), '@ana')).results.map((x) => x.sha), ['99aa88b', 'a1b2c3d']);
  assert.equal(S.find(repo(), '@pérez').total, 2);
  assert.equal(S.find(repo(), '@ana login').total, 1);
  assert.equal(S.find(repo(), 'luis').total, 1);
});

test('desde: y hasta: acotan por día UTC, incluidos ambos, junto al texto; una fecha falsa es una palabra más', () => {
  const day = (d) => Date.UTC(2026, 8, d);
  const r = repo();
  r.commits.get('a1b2c3d').date = day(1) + 5000;
  r.commits.get('e4f5a6b').date = day(14) + DAYMS - 1; // último milisegundo del 14
  r.commits.get('99aa88b').date = day(20);
  r.commits.get('7c7c7c7').date = 0; // sin fecha
  const shas = (q) => plain(S.find(r, q)).results.map((x) => x.sha).sort();
  assert.deepEqual(shas('desde:2026-09-01 hasta:2026-09-14'), ['a1b2c3d', 'e4f5a6b']);
  assert.deepEqual(shas('desde:2026-09-02'), ['99aa88b', 'e4f5a6b']);
  assert.deepEqual(shas('hasta:2026-09-01'), ['a1b2c3d']);
  assert.deepEqual(shas('desde:2026-09-01 hasta:2026-09-14 login'), ['a1b2c3d', 'e4f5a6b']);
  assert.deepEqual(shas('desde:2026-09-02 login'), ['e4f5a6b']);
  assert.deepEqual(shas('HASTA:2026-09-14 @ana'), ['a1b2c3d']);
  assert.deepEqual(shas('desde:2026-02-31'), [], 'una fecha que no existe se busca como texto');
  assert.deepEqual(shas('desde:hoy'), []);
});

test('el filtro por autor usa la clave (login o nombre) y se combina con el texto', () => {
  assert.equal(S.find(repo(), '', { author: 'ana' }).total, 2);
  assert.equal(S.find(repo(), '', { author: 'Luis' }).total, 1);
  assert.equal(S.find(repo(), 'merge', { author: 'Luis' }).total, 0);
});

test('el límite recorta la lista pero el total sigue entero; el merge se marca', () => {
  const r = plain(S.find(repo(), '', { limit: 2 }));
  assert.equal(r.results.length, 2);
  assert.equal(r.total, 4);
  assert.equal(r.results[0].merge, true);
});

test('los autores salen con su cuenta, del que más commits tiene, y un commit sin autor no entra', () => {
  assert.deepEqual(plain(S.authors(repo())), [
    { key: 'ana', name: 'Ana Pérez', count: 2 },
    { key: 'Luis', name: 'Luis', count: 1 },
  ]);
});

function repoWithBranches() {
  const ana = { name: 'Ana Pérez', login: 'ana' };
  const luis = { name: 'Luis', login: null };
  const c = (sha, who, parents = [], date = 1) => [sha, { sha, parents, message: sha, date, author: who }];
  return {
    repo: { defaultBranch: 'main' },
    commits: new Map([c('m1', luis), c('m2', luis, ['m1']), c('a1', ana, ['m1']), c('a2', luis, ['a1']), c('l1', luis, ['m2']), c('x1', ana, ['m2'])]),
    branches: new Map([
      ['main', { name: 'main', sha: 'm2', isDefault: true }],
      ['feat-ana', { name: 'feat-ana', sha: 'a2' }], // un commit de Ana y uno de Luis
      ['fix-luis', { name: 'fix-luis', sha: 'l1' }],
      ['viejo', { name: 'viejo', sha: 'm1' }], // apunta a un commit que ya está en main
      ['sin-historia', { name: 'sin-historia', sha: 'zzz' }],
    ]),
    pulls: new Map([[1, { number: 1, head: 'fix-luis', sameRepo: true }], [2, { number: 2, head: 'feat-ana', sameRepo: true }], [3, { number: 3, head: 'fork:x', sameRepo: false }]]),
  };
}

test('byAuthor deja la rama por defecto y las ramas con commits de esa persona, y quita los PR de las demás', () => {
  const d = repoWithBranches();
  const r = S.byAuthor(d, 'ana');
  assert.deepEqual([...r.data.branches.keys()], ['main', 'feat-ana', 'sin-historia']);
  assert.deepEqual([...r.data.pulls.keys()], [2, 3]);
  assert.equal(r.shown, 2);
  assert.equal(r.total, 4);
  assert.equal(d.branches.size, 5, 'no muta los datos');
});

test('byAuthor cuenta solo lo que la rama suma sobre la por defecto y no hace nada sin autor', () => {
  const d = repoWithBranches();
  // x1 (de Ana) cuelga de m2 pero ninguna rama lo alcanza: fix-luis no es de Ana aunque comparta historia con main
  assert.ok(!S.byAuthor(d, 'ana').data.branches.has('fix-luis'));
  assert.deepEqual([...S.byAuthor(d, 'Luis').data.branches.keys()], ['main', 'feat-ana', 'fix-luis', 'sin-historia']);
  assert.equal(S.byAuthor(d, '').data, d);
});

test('pathParam lee ?path= de la URL: recorta, quita la barra inicial y los caracteres de control, y limita el largo', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.pathParam(q('')), '');
  assert.equal(S.pathParam(q('repo=a/b')), '');
  assert.equal(S.pathParam(q('path=src/')), 'src/');
  assert.equal(S.pathParam(q('path=%20%20/src/app.js%20')), 'src/app.js');
  assert.equal(S.pathParam(q('path=a%00b%0Ac')), 'abc');
  assert.equal(S.pathParam(q('path=' + 'x'.repeat(500))).length, 200);
  assert.equal(S.pathParam(null), '');
});

test('authorParam lee ?author= de la URL: recorta, quita caracteres de control y limita el largo', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.authorParam(q('')), '');
  assert.equal(S.authorParam(q('path=src/')), '');
  assert.equal(S.authorParam(q('author=ana')), 'ana');
  assert.equal(S.authorParam(q('author=%20Ana%20Ruiz%20')), 'Ana Ruiz');
  assert.equal(S.authorParam(q('author=a%00b%0Ac')), 'abc');
  assert.equal(S.authorParam(q('author=' + 'x'.repeat(300))).length, 100);
  assert.equal(S.authorParam(null), '');
});

test('queryParam lee ?q= de la URL: recorta, quita caracteres de control y limita el largo', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.queryParam(q('')), '');
  assert.equal(S.queryParam(q('path=src/')), '');
  assert.equal(S.queryParam(q('q=fix')), 'fix');
  assert.equal(S.queryParam(q('q=%20arregla%20bug%20')), 'arregla bug');
  assert.equal(S.queryParam(q('q=a%00b%0Ac')), 'abc');
  assert.equal(S.queryParam(q('q=' + 'x'.repeat(300))).length, 100);
  assert.equal(S.queryParam(null), '');
});

test('limitBranches: deja la rama por defecto y las de commit más reciente, sin mutar', () => {
  const commits = new Map();
  const branches = new Map();
  [['main', 1], ['a', 5], ['b', 9], ['c', 7], ['d', 3]].forEach(([name, date], i) => {
    commits.set('s' + i, { sha: 's' + i, parents: [], message: name, date });
    branches.set(name, { name, sha: 's' + i });
  });
  branches.set('esperando', { name: 'esperando', sha: 'sinhistoria' });
  const data = { repo: { defaultBranch: 'main' }, commits, branches, pulls: new Map([[1, { sameRepo: true, head: 'd' }], [2, { sameRepo: true, head: 'b' }]]) };
  const v = S.limitBranches(data, 3);
  assert.deepEqual([...v.branches.keys()], ['main', 'b', 'c', 'esperando']);
  assert.deepEqual([...v.pulls.keys()], [2]);
  assert.equal(data.branches.size, 6);
  assert.equal(S.limitBranches(data, 0), data);
  assert.equal(S.limitBranches(data, 5), data);
  assert.deepEqual([...S.limitBranches(data, 1).branches.keys()], ['main', 'esperando']);
});

test('withOpenPr deja las ramas con un PR abierto de la misma repo, la por defecto y las sin historia, sin mutar', () => {
  const br = (name, sha) => [name, { name, sha }];
  const pr = (n, head, sameRepo = true) => [n, { number: n, head, sameRepo }];
  const data = {
    repo: { defaultBranch: 'main' },
    commits: new Map([['a', {}], ['b', {}], ['c', {}], ['d', {}]]),
    branches: new Map([br('main', 'a'), br('con-pr', 'b'), br('sin-pr', 'c'), br('fork-homonima', 'd'), br('esperando', 'zz')]),
    // un PR desde un fork con el mismo nombre de rama no cuenta: su rama no es la de este repo
    pulls: new Map([pr(1, 'con-pr'), pr(2, 'fork-homonima', false)]),
  };
  const v = S.withOpenPr(data);
  assert.deepEqual([...v.branches.keys()], ['main', 'con-pr', 'esperando']);
  assert.deepEqual([...v.pulls.keys()], [1, 2]);
  assert.equal(data.branches.size, 5);
  // sin ningún PR abierto queda solo la rama por defecto (y la que espera su historia)
  assert.deepEqual([...S.withOpenPr({ ...data, pulls: new Map() }).branches.keys()], ['main', 'esperando']);
  // si todas tienen PR, no hay nada que quitar
  const all = { ...data, branches: new Map([br('main', 'a'), br('con-pr', 'b')]) };
  assert.equal(S.withOpenPr(all), all);
});

test('byBranches oculta ramas o deja una sola, siempre con la rama por defecto y sin mutar', () => {
  const br = (name, sha) => [name, { name, sha }];
  const data = {
    repo: { defaultBranch: 'main' },
    commits: new Map([['a', {}], ['b', {}], ['c', {}]]),
    branches: new Map([br('main', 'a'), br('f1', 'b'), br('f2', 'c'), br('lejana', 'zz')]),
    pulls: new Map([[1, { head: 'f1', sameRepo: true }], [2, { head: 'f2', sameRepo: true }]]),
  };
  const none = S.byBranches(data, { hidden: [], solo: '' });
  assert.equal(none.data, data);
  assert.equal(none.total, 3);
  const hid = S.byBranches(data, { hidden: ['f1', 'main'], solo: '' });
  assert.deepEqual([...hid.data.branches.keys()], ['main', 'f2', 'lejana']);
  assert.deepEqual([...hid.data.pulls.keys()], [2]);
  assert.equal(hid.shown, 2);
  const solo = S.byBranches(data, { hidden: [], solo: 'f2' });
  assert.deepEqual([...solo.data.branches.keys()], ['main', 'f2', 'lejana']);
  assert.equal(data.branches.size, 4);
});

test('firstParent deja la cadena del primer padre de cada rama, sin mutar', () => {
  const c = (sha, parents = []) => [sha, { sha, parents, message: sha, date: 1 }];
  const data = {
    commits: new Map([c('r'), c('m1', ['r']), c('f1', ['r']), c('f2', ['f1']), c('mm', ['m1', 'f2']), c('x1', ['mm']), c('lonely', ['ausente'])]),
    branches: new Map([
      ['main', { name: 'main', sha: 'x1' }],
      ['viva', { name: 'viva', sha: 'f2' }],
      ['sin-historia', { name: 'sin-historia', sha: 'nada' }],
      ['huerfana', { name: 'huerfana', sha: 'lonely' }],
    ]),
    pulls: new Map(),
  };
  const r = S.firstParent(data);
  assert.deepEqual(plain([...r.commits.keys()].sort()), ['f1', 'f2', 'lonely', 'm1', 'mm', 'r', 'x1']);
  assert.deepEqual(plain(r.commits.get('mm').parents), ['m1']);
  assert.deepEqual(plain(r.commits.get('lonely').parents), ['ausente']);
  assert.equal(r.branches, data.branches);
  assert.deepEqual(plain(data.commits.get('mm').parents), ['m1', 'f2']); // no muta
  // sin la rama viva, lo que solo trajo el merge desaparece
  const solo = S.firstParent({ ...data, branches: new Map([['main', data.branches.get('main')]]) });
  assert.deepEqual(plain([...solo.commits.keys()].sort()), ['m1', 'mm', 'r', 'x1']);
});

test('firstParentParam lee ?firstparent= de la URL: presente enciende, 0/false/no/off apagan', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.firstParentParam(q('firstparent=1')), true);
  assert.equal(S.firstParentParam(q('firstparent')), true);
  assert.equal(S.firstParentParam(q('firstparent=0')), false);
  assert.equal(S.firstParentParam(q('firstparent=OFF')), false);
  assert.equal(S.firstParentParam(q('x=1')), false);
  assert.equal(S.firstParentParam(null), false);
});

test('branchViewParam lee ?solo= y ?ocultar= de la URL: solo manda, ocultar se repite, sin caracteres de control', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.branchViewParam(q('')), null);
  assert.equal(S.branchViewParam(null), null);
  assert.equal(JSON.stringify(S.branchViewParam(q('solo=feature%2Fa'))), JSON.stringify({ hidden: [], solo: 'feature/a' }));
  assert.equal(JSON.stringify(S.branchViewParam(q('ocultar=a&ocultar=b,c&ocultar=a'))), JSON.stringify({ hidden: ['a', 'b,c'], solo: '' }));
  assert.equal(JSON.stringify(S.branchViewParam(q('solo=x&ocultar=y'))), JSON.stringify({ hidden: [], solo: 'x' }));
  assert.equal(S.branchViewParam(q('solo=%20&ocultar=')), null);
  assert.equal(S.branchViewParam(q('solo=a%00b')).solo, 'ab');
  assert.equal(S.branchViewParam(q('solo=' + 'x'.repeat(500))).solo.length, 200);
});

test('prParam lee ?pr= de la URL: un entero positivo, con o sin #; todo lo demás es 0', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(S.prParam(q('')), 0);
  assert.equal(S.prParam(q('pr=12')), 12);
  assert.equal(S.prParam(q('pr=%2312')), 12);
  assert.equal(S.prParam(q('pr=%20 7 ')), 7);
  for (const bad of ['pr=', 'pr=0x1', 'pr=-3', 'pr=1.5', 'pr=abc', 'pr=1234567890', 'pr=<b>1</b>']) assert.equal(S.prParam(q(bad)), 0, bad);
  assert.equal(S.prParam(null), 0);
});
