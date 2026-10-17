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
const { compute, toMarkdown, computeOrg, toMarkdownOrg, imageLines, toCanvas } = ctx.window.GB.digest;

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
