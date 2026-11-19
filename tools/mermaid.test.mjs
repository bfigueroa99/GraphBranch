#!/usr/bin/env node
/* Pruebas del grafo como diagrama Mermaid (js/mermaid.js, ítem 228): qué rama es dueña de cada commit, dónde nace cada
   rama, cuándo un merge se escribe como tal, los tags, los nombres entre comillas, la rama por defecto que no se
   llama main, la historia cortada y los topes. El texto esperado se validó a mano con el parser de Mermaid 11.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/mermaid.test.mjs  solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = createRequire(import.meta.url)('../js/mermaid.js');
const c = (sha, parents, date) => [sha, { sha, parents, date, message: sha }];

/** main con un tag y un merge de feature; dos ramas que salen del merge (una se llama como una orden de Mermaid y otra
    lleva comillas) y una ya fusionada, sin commits propios. */
function repo() {
  return {
    repo: { defaultBranch: 'main' },
    commits: new Map([c('a1aaaaaa', [], 1), c('a2aaaaaa', ['a1aaaaaa'], 2), c('f1ffffff', ['a2aaaaaa'], 3), c('a3aaaaaa', ['a2aaaaaa'], 4), c('f2ffffff', ['f1ffffff'], 5), c('m1mmmmmm', ['a3aaaaaa', 'f2ffffff'], 6), c('c1cccccc', ['m1mmmmmm'], 7), c('q1qqqqqq', ['m1mmmmmm'], 8)]),
    branches: new Map([
      ['main', { name: 'main', sha: 'm1mmmmmm', isDefault: true }],
      ['feature', { name: 'feature', sha: 'f2ffffff' }],
      ['cherry-pick', { name: 'cherry-pick', sha: 'c1cccccc' }],
      ['x"y', { name: 'x"y', sha: 'q1qqqqqq' }],
      ['vieja', { name: 'vieja', sha: 'a2aaaaaa' }],
    ]),
    tags: new Map([['a1aaaaaa', ['v1.0']]]),
  };
}

test('el gitGraph de un repo: cada rama nace donde se separó, el merge es un merge, con tags y nombres entre comillas', () => {
  const g = M.gitGraph(repo());
  assert.equal(
    g.text,
    [
      'gitGraph',
      '  %% vieja: sin commits propios en lo exportado',
      '  commit id: "a1aaaaa" tag: "v1.0"',
      '  commit id: "a2aaaaa"',
      '  branch "feature"',
      '  commit id: "f1fffff"',
      '  checkout "main"',
      '  commit id: "a3aaaaa"',
      '  checkout "feature"',
      '  commit id: "f2fffff"',
      '  checkout "main"',
      '  merge "feature" id: "m1mmmmm"',
      // las dos nacen en el merge: la segunda, desde la primera, que todavía está en el mismo commit
      `  branch "x'y"`,
      '  branch "cherry-pick"',
      '  commit id: "c1ccccc"',
      `  checkout "x'y"`,
      '  commit id: "q1qqqqq"',
    ].join('\n'),
  );
  assert.deepEqual([g.commits, g.branches, g.cut], [8, 4, []]);
  assert.equal(M.markdown(g), '```mermaid\n' + g.text + '\n```\n');
});

test('un merge cuyo segundo padre no es la punta de otra rama exportada queda como un commit', () => {
  const d = repo();
  d.branches.delete('feature'); // sin la rama, su historia es de main y el merge no tiene a quién nombrar
  const g = M.gitGraph(d);
  assert.equal(g.text.includes('merge'), false);
  assert.match(g.text, /commit id: "m1mmmmm"/);
  // lo que solo se alcanza por el segundo padre de un merge (la historia de una rama ya borrada) no se exporta
  assert.equal(g.text.includes('f2fffff') || g.text.includes('f1fffff'), false);
  // con el segundo padre fuera de lo exportado (main con un solo commit), tampoco
  const corto = M.gitGraph(repo(), { perDefault: 1 });
  assert.equal(corto.text.includes('merge'), false);
});

test('una rama de larga vida reclama su historia antes que una de trabajo más reciente, como en el grafo', () => {
  const d = {
    repo: { defaultBranch: 'main' },
    commits: new Map([c('m0000000', [], 1), c('d1111111', ['m0000000'], 2), c('d2222222', ['d1111111'], 3), c('w1111111', ['d2222222'], 4)]),
    branches: new Map([
      ['main', { name: 'main', sha: 'm0000000' }],
      ['feat', { name: 'feat', sha: 'w1111111' }], // la más reciente
      ['develop', { name: 'develop', sha: 'd2222222' }],
    ]),
  };
  const lines = M.gitGraph(d).text.split('\n');
  assert.ok(lines.indexOf('  branch "develop"') < lines.indexOf('  branch "feat"'), 'feat nace de develop, no al revés');
  assert.ok(lines.indexOf('  commit id: "d222222"') < lines.indexOf('  branch "feat"'));
});

test('con otra rama por defecto, Mermaid la llama así; una historia cortada nace sola y lo dice', () => {
  const commits = new Map([c('r0000000', [], 0)]);
  let tip = 'r0000000';
  for (let i = 1; i <= 30; i++) commits.set(`t${i}`.padEnd(8, 'x'), { sha: `t${i}`.padEnd(8, 'x'), parents: [tip], date: i }), (tip = `t${i}`.padEnd(8, 'x'));
  let w = 't5xxxxxx';
  for (let i = 1; i <= 15; i++) commits.set(`w${i}`.padEnd(8, 'y'), { sha: `w${i}`.padEnd(8, 'y'), parents: [w], date: 30 + i }), (w = `w${i}`.padEnd(8, 'y'));
  const g = M.gitGraph({ repo: { defaultBranch: 'trunk' }, commits, branches: new Map([['trunk', { name: 'trunk', sha: tip }], ['larga', { name: 'larga', sha: w }]]) });
  const lines = g.text.split('\n');
  assert.equal(lines[0], '%%{init: {"gitGraph":{"mainBranchName":"trunk"}} }%%');
  assert.equal(lines[1], 'gitGraph');
  assert.deepEqual(lines.slice(2, 5), ['  %% larga: su historia sigue más atrás', '  branch "larga"', '  checkout "trunk"']);
  // 20 de la por defecto y 10 de cada otra: los topes de siempre
  assert.deepEqual([g.commits, g.branches, g.cut], [30, 2, ['trunk', 'larga']]);
  // un nombre de rama por defecto con comillas no rompe la directiva
  const raro = M.gitGraph({ repo: { defaultBranch: 'a"b' }, commits: new Map([c('z0000000', [], 1)]), branches: new Map([['a"b', { name: 'a"b', sha: 'z0000000' }]]) });
  assert.equal(raro.text.split('\n')[0], `%%{init: {"gitGraph":{"mainBranchName":"a'b"}} }%%`);
});

test('los topes: hasta 8 ramas (las que colorea Mermaid) y los commits de cada una; nada cargado, un diagrama vacío', () => {
  const commits = new Map([c('base0000', [], 0)]);
  const branches = new Map([['main', { name: 'main', sha: 'base0000' }]]);
  for (let i = 1; i <= 12; i++) {
    const s = `b${String(i).padStart(2, '0')}`.padEnd(8, '0');
    commits.set(s, { sha: s, parents: ['base0000'], date: i });
    branches.set(`r${i}`, { name: `r${i}`, sha: s });
  }
  const g = M.gitGraph({ repo: { defaultBranch: 'main' }, commits, branches });
  assert.equal(g.branches, 8);
  // las más recientes ganan su lugar
  assert.ok(g.text.includes('branch "r12"') && !g.text.includes('branch "r1"\n'));
  assert.equal(M.gitGraph({ repo: { defaultBranch: 'main' }, commits, branches }, { maxBranches: 3 }).branches, 3);
  assert.deepEqual(M.gitGraph(null), { text: 'gitGraph', commits: 0, branches: 0, cut: [] });
  assert.deepEqual(M.gitGraph({ commits: new Map(), branches: new Map() }).commits, 0);
});

test('la demo, que vive en otro contexto (sus Map no son los de aquí), da un diagrama con ramas y merges', () => {
  const code = (f) => readFileSync(join(root, 'js', f), 'utf8');
  const ctx = vm.createContext({ setTimeout, clearTimeout, TextEncoder, TextDecoder, console, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  ctx.window = ctx;
  for (const f of ['util.js', 'diff.js']) vm.runInContext(code(f), ctx, { filename: f });
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), t: (k) => k, text: String, fmtNum: String };`, ctx);
  for (const f of ['sources/demo-content.js', 'sources/demo.js']) vm.runInContext(code(f), ctx, { filename: f });
  const src = new ctx.GB.DemoSource();
  src.later = () => {};
  src.seed();
  const g = M.gitGraph(src.data);
  assert.ok(g.commits > 20 && g.branches >= 5, JSON.stringify({ commits: g.commits, branches: g.branches }));
  assert.match(g.text, /\n {2}merge "develop" id: "[0-9a-f]{7}" tag: "v1\.4\.0"/);
  assert.match(g.text, /\n {2}branch "feature\/login"/);
  // nada de la demo entra sin comillas: cada orden es una de las cuatro, o un comentario
  for (const line of g.text.split('\n').slice(1)) assert.match(line, /^ {2}(?:%% |commit id: "|branch "|checkout "|merge ")/, line);
});
