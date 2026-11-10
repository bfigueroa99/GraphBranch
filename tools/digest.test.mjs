#!/usr/bin/env node
/* Pruebas de js/digest.js: el resumen de la semana con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/digest.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'digest.js'), 'utf8'), ctx, { filename: 'digest.js' });
const { compute, toMarkdown, computeOrg, toMarkdownOrg, imageLines, imageLinesOrg, toCanvas, toCanvasOrg } = ctx.window.GB.digest;

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 14, 12);
const ago = (d) => NOW - d * DAY;
const c = (sha, d, parents, login) => [sha, { sha, date: ago(d), parents, author: { login, name: login } }];

function repo() {
  return {
    commits: new Map([
      c('a', 40, [], 'ana'), // vieja
      c('b', 6, ['a'], 'ana'),
      c('x', 3, ['b'], 'beto'),
      c('y', 2, ['x'], 'beto'),
      c('f', 1, ['b'], 'ana'),
      c('m', 0.5, ['y', 'f'], 'beto'),
    ]),
    branches: new Map([
      ['main', { name: 'main', sha: 'm' }],
      ['feat', { name: 'feat', sha: 'f' }],
    ]),
  };
}
const acts = [
  { id: '1', kind: 'pr-merge', time: ago(1), number: 7, detail: 'Arregla `x` [y]', title: 'PR #7', url: 'https://example.com/7' },
  { id: '1', kind: 'pr-merge', time: ago(1), number: 7, detail: 'repetido', url: 'https://example.com/7' },
  { id: '2', kind: 'pr-merge', time: ago(9), number: 3, detail: 'vieja' },
  { id: '3', kind: 'release', time: ago(2), title: 'v1.2.0', url: 'javascript:alert(1)' },
  { id: '4', kind: 'push', time: ago(1) },
];

test('cuenta lo de los últimos 7 días y nada más viejo', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.commits, 5);
  assert.equal(d.merged.total, 1);
  assert.equal(d.merged.rows[0].number, 7);
  assert.equal(d.releases.total, 1);
});

test('quién aportó: orden por commits y empate por nombre', () => {
  const d = compute(repo(), acts, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(d.people.rows)), [{ name: 'beto', commits: 3 }, { name: 'ana', commits: 2 }]);
});

test('la rama más activa es la que alcanza más commits de la semana', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.branch.name, 'main');
  assert.equal(d.branch.commits, 5);
});

test('semana sin nada: ceros y sin rama', () => {
  const d = compute({ commits: new Map(), branches: new Map() }, [], NOW);
  assert.equal(d.commits, 0);
  assert.equal(d.branch, null);
  assert.match(toMarkdown(d, 'a/b', { head: 'S · {repo}', commits: 'C: {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B' }, undefined, 'nada'), /nada/);
});

test('Markdown: escapa el texto de afuera y no enlaza esquemas raros', () => {
  const d = compute(repo(), acts, NOW);
  const t = { head: 'Semana · {repo}', commits: 'Commits: {n}', merged: 'Fusionados', releases: 'Releases', people: 'Quién', branch: 'Rama' };
  const out = toMarkdown(d, 'acme/orbita', t, (ms) => new Date(ms).toISOString().slice(0, 10), '—');
  assert.match(out, /^# Semana · acme\/orbita/);
  assert.match(out, /\[#7 Arregla \\`x\\` \\\[y\\\]\]\(https:\/\/example\.com\/7\)/);
  assert.match(out, /- v1\.2\.0\n/); // javascript: no se vuelve enlace
  assert.doesNotMatch(out, /javascript:/);
  assert.match(out, /Commits: 5/);
});

test('los títulos que llegan como mensajes por traducir se pasan a texto, y sin número no sobra «#»', () => {
  const msg = { key: 'x' };
  const d = compute(repo(), [{ id: '9', kind: 'pr-merge', time: ago(1), detail: msg }, { id: '8', kind: 'release', time: ago(1), title: msg }], NOW, 7, () => 'Texto');
  assert.equal(d.merged.rows[0].title, 'Texto');
  assert.equal(d.releases.rows[0].title, 'Texto');
  const out = toMarkdown(d, 'a/b', { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B' });
  assert.match(out, /\n- Texto\n/);
  assert.doesNotMatch(out, /undefined|object Object|#undefined/);
});

test('organización: junta dos repos, ordena por commits y deja fuera los quietos', () => {
  const quiet = { commits: new Map([c('z', 30, [], 'ana')]), branches: new Map([['main', { name: 'main', sha: 'z' }]]) };
  const o = computeOrg([{ repo: 'acme/quieto', data: quiet, acts: [] }, { repo: 'acme/web', data: repo(), acts }, { repo: 'acme/api', data: { commits: new Map([c('q', 1, [], 'ana')]), branches: new Map([['main', { name: 'main', sha: 'q' }]]) }, acts: [] }], NOW);
  assert.equal(o.repos, 3);
  assert.equal(o.commits, 6);
  assert.equal(o.merged, 1);
  assert.equal(o.releases, 1);
  assert.deepEqual(o.rows.map((r) => r.repo), ['acme/web', 'acme/api']);
  const t = { head: 'Semana · {repo}', commits: 'Commits: {n}', merged: 'Fusionados', releases: 'Releases', people: 'Quién', branch: 'Rama' };
  const out = toMarkdownOrg(o, 'acme', t, (ms) => new Date(ms).toISOString().slice(0, 10), '—');
  assert.match(out, /^# Semana · acme\n/);
  assert.match(out, /## acme\/web\n\n- Commits: 5/);
  assert.match(out, /Fusionados: #7/);
  assert.doesNotMatch(out, /acme\/quieto|undefined/);
});

test('organización: más de 20 repos activos se recortan y sin actividad dice «nada»', () => {
  const many = Array.from({ length: 22 }, (_, i) => ({ repo: `o/r${i}`, data: { commits: new Map([c('a' + i, 1, [], 'x')]), branches: new Map() }, acts: [] }));
  const o = computeOrg(many, NOW);
  assert.equal(o.rows.length, 20);
  assert.equal(o.hidden, 2);
  const t = { head: 'S · {repo}', commits: 'C: {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B' };
  assert.match(toMarkdownOrg(o, 'o', t), /… \+2/);
  assert.match(toMarkdownOrg(computeOrg([], NOW), 'o', t, undefined, 'nada'), /nada/);
});

test('organización: el nombre de un repo se escapa en el Markdown', () => {
  const o = computeOrg([{ repo: 'a/x*[y]', data: repo(), acts: [] }], NOW);
  assert.match(toMarkdownOrg(o, 'a', { head: 'S {repo}', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B' }), /## a\/x\\\*\\\[y\\\]/);
});

test('la imagen del resumen: líneas recortadas y texto pintado en el canvas', () => {
  const d = compute(repo(), acts, NOW);
  const t = { head: 'Semana de {repo}', commits: '{n} commits', merged: 'PRs', releases: 'Releases', people: 'Personas', branch: 'Rama' };
  const lines = imageLines({ ...d, branch: { name: 'x'.repeat(200), commits: 3 } }, 'o/r', t);
  assert.equal(lines[0].text, 'Semana de o/r');
  assert.ok(lines.every((l) => l.text.length <= 71), 'ninguna línea pasa del ancho');
  assert.ok(lines.some((l) => l.kind === 'head' && /^PRs \(\d+\)$/.test(l.text)));

  const calls = [];
  const g = { fillRect: (...a) => calls.push(['rect', ...a]), fillText: (...a) => calls.push(['text', ...a]) };
  const canvas = { getContext: () => g };
  toCanvas({ createElement: () => canvas }, d, 'o/r', t, undefined, '—', { bg: '#000', fg: '#fff', dim: '#888', accent: '#0f0' }, true);
  assert.equal(canvas.width, 1200);
  assert.ok(canvas.height > 300);
  assert.equal(g.textAlign, 'right');
  assert.equal(calls.filter((c) => c[0] === 'text').length, lines.length);
});

test('los tags de la semana salen en el resumen, sin repetir los que ya son release', () => {
  const r = repo();
  // 'a' es de hace 40 días (fuera); 'x' de hace 3; 'm' de hace medio día
  r.tags = new Map([['a', ['v0.1']], ['x', ['v1.1.0']], ['m', ['v1.2.0', 'rc|1'], ], ['zz', ['sin-commit']]]);
  const d = compute(r, acts, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(d.tags.rows.map((t) => t.name))), ['rc|1', 'v1.1.0']);
  assert.equal(d.tags.total, 2);
  const t = { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', tags: 'Tags', people: 'P', branch: 'B' };
  const out = toMarkdown(d, 'a/b', t);
  assert.match(out, /## Tags \(2\)\n\n- rc\\\|1\n- v1\.1\.0\n/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Tags (2)'));
});

test('sin tags en la semana, el resumen no trae la sección', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.tags.total, 0);
  assert.doesNotMatch(toMarkdown(d, 'a/b', { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', tags: 'Tags', people: 'P', branch: 'B' }), /Tags/);
});

test('la imagen de la organización: totales, un bloque por repo, recortada a 8 y pintada en el canvas', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ repo: `o/r${i}`, data: { commits: new Map([c('a' + i, 1, [], 'x')]), branches: new Map() }, acts: [] }));
  const o = computeOrg(many, NOW);
  const t = { head: 'Semana · {repo}', commits: '{n} commits', merged: 'PRs', releases: 'Releases', people: 'P', branch: 'B' };
  const lines = imageLinesOrg(o, 'o', t);
  assert.equal(lines[0].text, 'Semana · o');
  assert.equal(lines.filter((l) => l.kind === 'head').length, 1 + 8);
  assert.equal(lines.at(-1).text, '… +2');
  assert.ok(lines.every((l) => l.text.length <= 71));
  assert.equal(imageLinesOrg(computeOrg([], NOW), 'o', t, undefined, 'nada').at(-1).text, 'nada');

  const calls = [];
  const g = { fillRect: () => {}, fillText: (...a) => calls.push(a) };
  const canvas = { getContext: () => g };
  toCanvasOrg({ createElement: () => canvas }, o, 'o', t, undefined, '—', { bg: '#000', fg: '#fff', dim: '#888', accent: '#0f0' }, true);
  assert.equal(canvas.width, 1200);
  assert.equal(g.textAlign, 'right');
  assert.equal(calls.length, lines.length);
});

test('pull requests abiertos: cuenta los de la semana, sin repetir un PR reabierto ni contar los viejos', () => {
  const opens = [
    { id: 'o1', kind: 'pr-open', time: ago(2), number: 11, detail: 'Nuevo `x`', url: 'https://example.com/11' },
    { id: 'o2', kind: 'pr-open', time: ago(1), number: 11, detail: 'Nuevo (reabierto)' },
    { id: 'o3', kind: 'pr-open', time: ago(3), number: 12, detail: 'Otro', url: 'javascript:alert(1)' },
    { id: 'o4', kind: 'pr-open', time: ago(10), number: 5, detail: 'Viejo' },
  ];
  const d = compute(repo(), opens, NOW);
  assert.equal(d.opened.total, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(d.opened.rows.map((r) => r.number))), [11, 12]);
  const t = { head: 'S · {repo}', commits: 'C: {n}', merged: 'M', opened: 'Abiertos', releases: 'R', people: 'P', branch: 'B' };
  const out = toMarkdown(d, 'a/b', t);
  assert.match(out, /## Abiertos \(2\)\n\n- \[#11 Nuevo \\`x\\`\]\(https:\/\/example\.com\/11\)\n- #12 Otro\n/);
  assert.doesNotMatch(out, /javascript:|Viejo/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Abiertos (2)'));
});

test('pull requests abiertos: sin ninguno no hay sección', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.opened.total, 0);
  const t = { head: 'S', commits: 'C {n}', merged: 'M', opened: 'Abiertos', releases: 'R', people: 'P', branch: 'B' };
  assert.doesNotMatch(toMarkdown(d, 'a/b', t), /Abiertos/);
});

test('issues cerrados: cuenta los de la semana, una vez por issue, sin los viejos ni enlaces peligrosos', () => {
  const closes = [
    { id: 'c1', kind: 'issue-close', time: ago(2), number: 21, detail: 'Falla `x`', url: 'https://example.com/21' },
    { id: 'c2', kind: 'issue-close', time: ago(1), number: 21, detail: 'Falla (otra vez)' },
    { id: 'c3', kind: 'issue-close', time: ago(3), number: 22, detail: 'Otro', url: 'javascript:alert(1)' },
    { id: 'c4', kind: 'issue-close', time: ago(10), number: 5, detail: 'Viejo' },
    { id: 'c5', kind: 'issue-open', time: ago(1), number: 23, detail: 'Abierto' },
  ];
  const d = compute(repo(), closes, NOW);
  assert.equal(d.closed.total, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(d.closed.rows.map((r) => r.number))), [21, 22]);
  const t = { head: 'S · {repo}', commits: 'C: {n}', merged: 'M', closed: 'Cerrados', releases: 'R', people: 'P', branch: 'B' };
  const out = toMarkdown(d, 'a/b', t);
  assert.match(out, /## Cerrados \(2\)\n\n- \[#21 Falla \\`x\\`\]\(https:\/\/example\.com\/21\)\n- #22 Otro\n/);
  assert.doesNotMatch(out, /javascript:|Viejo|Abierto/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Cerrados (2)'));
});

test('issues cerrados: sin ninguno no hay sección', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.closed.total, 0);
  assert.doesNotMatch(toMarkdown(d, 'a/b', { head: 'S', commits: 'C {n}', merged: 'M', closed: 'Cerrados', releases: 'R', people: 'P', branch: 'B' }), /Cerrados/);
});

test('autores nuevos: quienes no tienen commit cargado anterior a la semana', () => {
  const d = compute(repo(), acts, NOW);
  assert.equal(d.newcomers, 1); // beto; ana ya tenía commits de hace 40 días
  const t = { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B', newcomers: 'Nuevos: {n}' };
  assert.match(toMarkdown(d, 'a/b', t), /- Nuevos: 1\n/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Nuevos: 1'));
  const sin = compute({ commits: new Map([c('p', 2, [], 'ana'), c('q', 30, [], 'ana')]), branches: new Map() }, [], NOW);
  assert.equal(sin.newcomers, 0);
  assert.doesNotMatch(toMarkdown(sin, 'a/b', t), /Nuevos/);
});

test('ramas nuevas: las creadas en la semana, cada nombre una vez', () => {
  const mk = (id, branch, days) => ({ id, kind: 'branch-create', branch, time: NOW - days * 864e5 });
  const nuevas = [mk('1', 'feat/a', 2), mk('2', 'feat/a', 1), mk('3', 'feat/b', 3), mk('4', 'vieja', 20), { id: '5', kind: 'branch-create', branch: 'x' }];
  const d = compute(repo(), [...acts, ...nuevas], NOW);
  assert.equal(d.newBranches, 2); // feat/a (una vez) y feat/b; «vieja» es de hace 20 días y «x» no tiene hora
  const t = { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B', newbranches: 'Ramas: {n}' };
  assert.match(toMarkdown(d, 'a/b', t), /- Ramas: 2\n/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Ramas: 2'));
  const sin = compute(repo(), acts, NOW);
  assert.equal(sin.newBranches, 0);
  assert.doesNotMatch(toMarkdown(sin, 'a/b', t), /Ramas:/);
});

test('commits por día: siete cifras, del día más viejo al de hoy', () => {
  const d = compute(repo(), acts, NOW);
  assert.deepEqual([...d.perDay], [0, 1, 0, 0, 1, 1, 2]); // el de hace 40 días no cuenta; el de «ahora» cae en el último día
  assert.equal(d.perDay.reduce((n, x) => n + x, 0), d.commits);
  const t = { head: 'S', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B', perday: 'Por día: {n}' };
  assert.match(toMarkdown(d, 'a/b', t), /- Por día: 0 · 1 · 0 · 0 · 1 · 1 · 2\n/);
  assert.ok(imageLines(d, 'a/b', t).some((l) => l.text === 'Por día: 0 · 1 · 0 · 0 · 1 · 1 · 2'));
  const sin = compute({ commits: new Map([c('q', 30, [], 'ana')]), branches: new Map() }, [], NOW);
  assert.deepEqual([...sin.perDay], [0, 0, 0, 0, 0, 0, 0]);
  assert.doesNotMatch(toMarkdown(sin, 'a/b', t), /Por día/);
});

test('organización: suma las ramas nuevas de cada repo (cada nombre una vez por repo) y las muestra en Markdown e imagen', () => {
  const mk = (id, branch, days) => ({ id, kind: 'branch-create', branch, time: NOW - days * 864e5 });
  const o = computeOrg([
    { repo: 'acme/web', data: repo(), acts: [mk('1', 'feat/a', 2), mk('2', 'feat/a', 1), mk('3', 'feat/b', 3), mk('4', 'vieja', 20)] },
    { repo: 'acme/api', data: repo(), acts: [mk('5', 'feat/a', 2)] },
  ], NOW);
  assert.equal(o.newBranches, 3); // feat/a y feat/b en web, feat/a en api: el mismo nombre en otro repo cuenta aparte
  assert.equal(o.rows.find((r) => r.repo === 'acme/web').d.newBranches, 2);
  const t = { head: 'S {repo}', commits: 'C {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B', newbranches: 'Ramas nuevas: {n}' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /\n- Ramas nuevas: 3\n/);
  assert.match(md, /## acme\/web\n\n- C 5\n- Ramas nuevas: 2\n/);
  assert.ok(imageLinesOrg(o, 'acme', t).some((l) => l.text === 'Ramas nuevas: 3'));
  assert.ok(imageLinesOrg(o, 'acme', t).some((l) => /C 5 · Ramas nuevas: 2/.test(l.text)));
  assert.doesNotMatch(toMarkdownOrg(computeOrg([{ repo: 'a/b', data: repo(), acts: [] }], NOW), 'a', t), /Ramas nuevas/);
});

test('organización: cada repo nombra su rama más activa, en el Markdown y en la imagen', () => {
  const quiet = { commits: new Map([c('q', 1, [], 'ana')]), branches: new Map([['dev', { name: 'dev', sha: 'q' }]]) };
  const o = computeOrg([{ repo: 'acme/web', data: repo(), acts: [] }, { repo: 'acme/api', data: quiet, acts: [] }], NOW);
  const t = { head: 'S · {repo}', commits: 'C: {n}', merged: 'M', releases: 'R', people: 'P', branch: 'Rama' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /## acme\/web\n\n- C: 5\n- Rama: `main` \(5\)\n/);
  assert.match(md, /## acme\/api\n\n- C: 1\n- Rama: `dev` \(1\)\n/);
  const rows = imageLinesOrg(o, 'acme', t).filter((l) => l.kind === 'row').map((l) => l.text);
  assert.ok(rows.includes('C: 5 · Rama: main (5)'), rows.join('|'));
  assert.ok(rows.includes('C: 1 · Rama: dev (1)'));
  const sin = computeOrg([{ repo: 'acme/x', data: { commits: new Map([c('z', 1, [], 'a')]), branches: new Map() }, acts: [] }], NOW);
  assert.doesNotMatch(imageLinesOrg(sin, 'acme', t).map((l) => l.text).join('\n'), /Rama:/);
});

test('quién fusionó: cuenta los PRs de la semana por la cuenta que los fusionó, una vez por PR, en Markdown e imagen', () => {
  const ana = { login: 'ana' };
  const merges = [
    { id: 'm1', kind: 'pr-merge', time: ago(1), number: 1, detail: 'uno', actor: ana },
    { id: 'm1', kind: 'pr-merge', time: ago(1), number: 1, detail: 'uno', actor: ana }, // la misma actividad dos veces
    { id: 'm1b', kind: 'pr-merge', time: ago(1), number: 1, detail: 'uno', actor: ana }, // el mismo PR por el feed y por el sondeo
    { id: 'm2', kind: 'pr-merge', time: ago(2), number: 2, detail: 'dos', actor: { login: 'beto' } },
    { id: 'm3', kind: 'pr-merge', time: ago(3), number: 3, detail: 'tres', actor: ana },
    { id: 'm4', kind: 'pr-merge', time: ago(3), number: 4, detail: 'cuatro', actor: { name: 'Ca*rla' } }, // sin usuario: su nombre
    { id: 'm5', kind: 'pr-merge', time: ago(4), number: 5, detail: 'sin actor' },
    { id: 'm6', kind: 'pr-merge', time: ago(9), number: 6, detail: 'vieja', actor: { login: 'dora' } },
  ];
  const d = compute(repo(), merges, NOW);
  assert.equal(d.mergers.total, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(d.mergers.rows)), [{ name: 'ana', prs: 2 }, { name: 'Ca*rla', prs: 1 }, { name: 'beto', prs: 1 }]);
  const t = { head: 'Semana de {repo}', commits: 'Commits: {n}', merged: 'Fusionados', mergers: 'Quién fusionó', releases: 'Releases', people: 'Personas', branch: 'Rama' };
  const text = toMarkdown(d, 'o/r', t);
  assert.match(text, /\nQuién fusionó: ana \(2\) · Ca\\\*rla \(1\) · beto \(1\)\n/);
  assert.ok(imageLines(d, 'o/r', t).some((l) => l.kind === 'row' && l.text === 'Quién fusionó: ana (2) · Ca*rla (1) · beto (1)'));
  // el sondeo dice quién fusionó en `mergedBy` (su actor puede ser quien abrió el PR); una copia sin cuenta no tapa a la que la trae
  const polled = compute(repo(), [
    { id: 'p7', kind: 'pr-merge', time: ago(1), number: 7, actor: { login: 'autora' }, mergedBy: null },
    { id: 'ev:7', kind: 'pr-merge', time: ago(2), number: 7, actor: { login: 'ana' } },
    { id: 'p8', kind: 'pr-merge', time: ago(1), number: 8, actor: { login: 'autora' }, mergedBy: { login: 'beto' } },
  ], NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(polled.mergers.rows)), [{ name: 'ana', prs: 1 }, { name: 'beto', prs: 1 }]);
  // sin PRs fusionados con actor, la línea no sale
  const quiet = compute(repo(), [{ id: 'z', kind: 'pr-merge', time: ago(1), number: 9 }], NOW);
  assert.equal(quiet.mergers.total, 0);
  assert.doesNotMatch(toMarkdown(quiet, 'o/r', t), /Quién fusionó/);
});

test('organización: suma los PRs abiertos en la semana de cada repo y los muestra en Markdown e imagen', () => {
  const op = (id, number, days, detail = `PR ${number}`) => ({ id, kind: 'pr-open', number, detail, title: `PR #${number}`, time: NOW - days * 864e5 });
  const quiet = { commits: new Map([c('v', 30, [], 'ana')]), branches: new Map([['main', { name: 'main', sha: 'v' }]]) };
  const o = computeOrg([
    // web: el #3 llega dos veces (feed y sondeo) y cuenta una; el #1 es de hace 20 días y no suma
    { repo: 'acme/web', data: repo(), acts: [op('1', 3, 2), op('2', 3, 2), op('3', 4, 1), op('4', 1, 20)] },
    // api: sin commits en la semana, solo un PR abierto: igual sale en el resumen
    { repo: 'acme/api', data: quiet, acts: [op('5', 9, 3)] },
    { repo: 'acme/quieto', data: quiet, acts: [] },
  ], NOW);
  assert.equal(o.opened, 3);
  assert.equal(o.rows.find((r) => r.repo === 'acme/web').d.opened.total, 2);
  assert.deepEqual(o.rows.map((r) => r.repo), ['acme/web', 'acme/api']);
  const t = { head: 'S {repo}', commits: 'C {n}', merged: 'M', opened: 'Abiertos', releases: 'R', people: 'P', branch: 'B' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /\n- M: 0\n- Abiertos: 3\n- R: 0\n/);
  assert.match(md, /## acme\/web\n[^#]*- Abiertos: #4, #3\n/);
  assert.match(md, /## acme\/api\n\n- C 0\n- Abiertos: #9\n/);
  const lines = imageLinesOrg(o, 'acme', t).map((l) => l.text);
  assert.ok(lines.includes('Abiertos: 3'));
  assert.ok(lines.some((l) => /^C 0 · Abiertos: #9$/.test(l)));
  // sin PRs abiertos, ni la línea del total ni la del repo
  const sin = computeOrg([{ repo: 'a/b', data: repo(), acts: [] }], NOW);
  assert.equal(sin.opened, 0);
  assert.doesNotMatch(toMarkdownOrg(sin, 'a', t), /Abiertos/);
  assert.doesNotMatch(imageLinesOrg(sin, 'a', t).map((l) => l.text).join('\n'), /Abiertos/);
  // más de 10 en un repo: la lista dice cuántos faltan
  const many = computeOrg([{ repo: 'a/b', data: repo(), acts: Array.from({ length: 12 }, (_, i) => op(`m${i}`, 100 + i, 1)) }], NOW);
  assert.match(toMarkdownOrg(many, 'a', t), /- Abiertos: (#\d+, ){9}#\d+ … \+2\n/);
});

test('organización: suma los issues cerrados en la semana de cada repo y los muestra en Markdown e imagen', () => {
  const cl = (id, number, days) => ({ id, kind: 'issue-close', number, detail: `Issue ${number}`, time: NOW - days * 864e5 });
  const quiet = { commits: new Map([c('v', 30, [], 'ana')]), branches: new Map([['main', { name: 'main', sha: 'v' }]]) };
  const o = computeOrg([
    // web: el #7 llega dos veces y cuenta una; el #1 es de hace 20 días y no suma
    { repo: 'acme/web', data: repo(), acts: [cl('1', 7, 2), cl('2', 7, 2), cl('3', 8, 1), cl('4', 1, 20)] },
    // api: sin commits, solo un issue cerrado: igual sale
    { repo: 'acme/api', data: quiet, acts: [cl('5', 9, 3)] },
    { repo: 'acme/quieto', data: quiet, acts: [] },
  ], NOW);
  assert.equal(o.closed, 3);
  assert.equal(o.rows.find((r) => r.repo === 'acme/web').d.closed.total, 2);
  assert.deepEqual(o.rows.map((r) => r.repo), ['acme/web', 'acme/api']);
  const t = { head: 'S {repo}', commits: 'C {n}', merged: 'M', closed: 'Cerrados', releases: 'R', people: 'P', branch: 'B' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /\n- M: 0\n- Cerrados: 3\n- R: 0\n/);
  assert.match(md, /## acme\/web\n[^#]*- Cerrados: #8, #7\n/);
  assert.match(md, /## acme\/api\n\n- C 0\n- Cerrados: #9\n/);
  const lines = imageLinesOrg(o, 'acme', t).map((l) => l.text);
  assert.ok(lines.includes('Cerrados: 3'));
  assert.ok(lines.some((l) => /^C 0 · Cerrados: #9$/.test(l)));
  const sin = computeOrg([{ repo: 'a/b', data: repo(), acts: [] }], NOW);
  assert.equal(sin.closed, 0);
  assert.doesNotMatch(toMarkdownOrg(sin, 'a', t), /Cerrados/);
  assert.doesNotMatch(imageLinesOrg(sin, 'a', t).map((l) => l.text).join('\n'), /Cerrados/);
});

test('organización: suma los PRs cerrados sin fusionar de los repos seguidos, sin los fusionados ni los repetidos, en Markdown e imagen', () => {
  const dr = (id, number, days, kind = 'pr-close') => ({ id, kind, number, detail: `PR ${number}`, time: NOW - days * 864e5 });
  const quiet = { commits: new Map([c('v', 30, [], 'ana')]), branches: new Map([['main', { name: 'main', sha: 'v' }]]) };
  const o = computeOrg([
    // web: el #7 llega dos veces y cuenta una; el #9 se cerró y luego se fusionó (no es «sin fusionar»); el #1 es viejo
    { repo: 'acme/web', data: repo(), acts: [dr('1', 7, 2), dr('2', 7, 1), dr('3', 8, 1), dr('4', 1, 20), dr('5', 9, 3), dr('6', 9, 1, 'pr-merge')] },
    { repo: 'acme/api', data: quiet, acts: [dr('7', 4, 3)] },
    { repo: 'acme/quieto', data: quiet, acts: [] },
  ], NOW);
  assert.equal(o.dropped, 3);
  assert.equal(o.rows.find((r) => r.repo === 'acme/web').d.dropped.total, 2);
  const t = { head: 'S {repo}', commits: 'C {n}', merged: 'M', dropped: 'Sin fusionar', releases: 'R', people: 'P', branch: 'B' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /\n- Sin fusionar: 3\n- R: 0\n/);
  assert.match(md, /## acme\/web\n[\s\S]*?- Sin fusionar: #8, #7\n/);
  assert.match(md, /## acme\/api\n\n- C 0\n- Sin fusionar: #4\n/);
  const lines = imageLinesOrg(o, 'acme', t).map((l) => l.text);
  assert.ok(lines.includes('Sin fusionar: 3'));
  const sin = computeOrg([{ repo: 'a/b', data: repo(), acts: [] }], NOW);
  assert.equal(sin.dropped, 0);
  assert.doesNotMatch(toMarkdownOrg(sin, 'a', t), /Sin fusionar/);
  const one = compute(repo(), [dr('1', 7, 2)], NOW);
  assert.match(toMarkdown(one, 'a/b', t), /## Sin fusionar \(1\)\n\n- #7 PR 7\n/);
});

test('organización: suma los autores nuevos de los repos seguidos, cada persona una vez, en Markdown e imagen', () => {
  // web: ana firma antes de la semana; beto y caro son nuevos en web
  const web = { commits: new Map([c('a', 40, [], 'ana'), c('b', 2, ['a'], 'beto'), c('k', 1, ['b'], 'caro')]), branches: new Map([['main', { name: 'main', sha: 'k' }]]) };
  // api: beto ya firmaba antes de la semana (no es nuevo en la organización); dani y caro son nuevos en api
  const api = { commits: new Map([c('p', 30, [], 'beto'), c('q', 3, ['p'], 'dani'), c('r', 1, ['q'], 'caro')]), branches: new Map([['main', { name: 'main', sha: 'r' }]]) };
  const o = computeOrg([{ repo: 'acme/web', data: web, acts: [] }, { repo: 'acme/api', data: api, acts: [] }], NOW);
  assert.equal(o.newcomers, 2); // caro (nueva en los dos, cuenta una vez) y dani; beto ya firmaba en api
  assert.equal(o.rows.find((r) => r.repo === 'acme/web').d.newcomers, 2);
  assert.equal(o.rows.find((r) => r.repo === 'acme/api').d.newcomers, 2);
  const t = { head: 'S {repo}', commits: 'C {n}', newcomers: 'Autores nuevos: {n}', merged: 'M', releases: 'R', people: 'P', branch: 'B' };
  const md = toMarkdownOrg(o, 'acme', t);
  assert.match(md, /\n- C 4\n- Autores nuevos: 2\n- M: 0\n/);
  assert.match(md, /## acme\/web\n\n- C 2\n- Autores nuevos: 2\n/);
  const lines = imageLinesOrg(o, 'acme', t).map((l) => l.text);
  assert.ok(lines.includes('Autores nuevos: 2'), lines.join('|'));
  assert.ok(lines.some((l) => /^C 2 · Autores nuevos: 2 · /.test(l)), lines.join('|'));
  // sin autores nuevos (todos firmaban antes), ni la línea del total ni la del repo
  const sin = computeOrg([{ repo: 'a/b', data: { commits: new Map([c('v', 30, [], 'ana'), c('w', 1, ['v'], 'ana')]), branches: new Map() }, acts: [] }], NOW);
  assert.equal(sin.newcomers, 0);
  assert.doesNotMatch(toMarkdownOrg(sin, 'a', t), /Autores nuevos/);
  assert.doesNotMatch(imageLinesOrg(sin, 'a', t).map((l) => l.text).join('\n'), /Autores nuevos/);
});

test('organización: suma quién fusionó entre los repos seguidos (la misma cuenta una vez, hasta 5) en Markdown e imagen', () => {
  const mg = (id, number, days, who) => ({ id, kind: 'pr-merge', number, detail: `PR ${number}`, time: NOW - days * 864e5, actor: { login: who } });
  const o = computeOrg([
    { repo: 'acme/web', data: repo(), acts: [mg('1', 1, 1, 'ana'), mg('2', 2, 1, 'ana'), mg('3', 3, 2, 'beto'), mg('4', 4, 20, 'vieja')] },
    { repo: 'acme/api', data: repo(), acts: [mg('5', 1, 1, 'ana'), mg('6', 2, 2, 'caro'), mg('7', 3, 2, 'd1'), mg('8', 4, 2, 'd2'), mg('9', 5, 2, 'd3'), mg('10', 6, 2, 'd4')] },
  ], NOW);
  assert.equal(o.mergers.total, 7); // ana (en los dos repos, una cuenta), beto, caro, d1..d4
  assert.deepEqual(JSON.parse(JSON.stringify(o.mergers.rows[0])), { name: 'ana', prs: 3 });
  assert.equal(o.mergers.rows.length, 5);
  const t = { head: 'S {repo}', commits: 'C {n}', merged: 'M', mergers: 'Quién fusionó', releases: 'R', people: 'P', branch: 'B' };
  assert.match(toMarkdownOrg(o, 'acme', t), /\n- M: 9\n- Quién fusionó: ana \(3\), beto \(1\), caro \(1\), d1 \(1\), d2 \(1\)\n/);
  assert.ok(imageLinesOrg(o, 'acme', t).some((l) => l.text === 'Quién fusionó: ana (3) · beto (1) · caro (1) · d1 (1) · d2 (1)'));
  // sin cuentas, la línea no sale
  const sin = computeOrg([{ repo: 'a/b', data: repo(), acts: [{ id: 'z', kind: 'pr-merge', number: 9, time: NOW - 864e5 }] }], NOW);
  assert.equal(sin.mergers.total, 0);
  assert.doesNotMatch(toMarkdownOrg(sin, 'a', t), /Quién fusionó/);
  assert.doesNotMatch(imageLinesOrg(sin, 'a', t).map((l) => l.text).join('\n'), /Quién fusionó/);
});
