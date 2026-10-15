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
