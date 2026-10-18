#!/usr/bin/env node
/* Pruebas de js/bitacora.js: la bitácora en vivo con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/bitacora.test.mjs     solo estas */
process.env.TZ = 'UTC'; // los días de la ventana son días locales: así no dependen de dónde se corra
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'bitacora.js'), 'utf8'), ctx, { filename: 'bitacora.js' });
const B = ctx.window.GB.bitacora;
/** Los objetos del módulo vienen de otro contexto: se pasan a este para compararlos. */
const plain = (x) => JSON.parse(JSON.stringify(x));

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 18, 15); // sábado 18 de octubre, 15:00
const ago = (d) => NOW - d * DAY;
const c = (sha, d, parents, message = sha) => [sha, { sha, date: ago(d), parents, message, author: { login: 'x', name: 'x' } }];

/** main: a(40 d) ← b(10 d) ← m1(2 d, merge de f2) ← d(0,5 d); feat: b ← f1(3 d) ← f2(2,5 d); wip: b ← w1(1 d) ← w2(0,2 d). */
function repo(extra = {}) {
  return {
    repo: { owner: 'acme', name: 'app', defaultBranch: 'main' },
    commits: new Map([
      c('a', 40, []),
      c('b', 10, ['a']),
      c('f1', 3, ['b']),
      c('f2', 2.5, ['f1']),
      c('m1', 2, ['b', 'f2'], 'Merge pull request #7 from acme/feat'),
      c('d', 0.5, ['m1'], 'docs: README al día\n\ndetalle'),
      c('w1', 1, ['b']),
      c('w2', 0.2, ['w1'], 'wip: en curso'),
    ]),
    branches: new Map([
      ['main', { name: 'main', sha: 'd', isDefault: true }],
      ['wip', { name: 'wip', sha: 'w2' }],
      ['old', { name: 'old', sha: 'a' }],
    ]),
    pulls: new Map(),
    ci: new Map([['main', 'success']]),
    ...extra,
  };
}
const acts = () => [
  { id: '1', kind: 'pr-merge', time: ago(2), number: 7, detail: 'Pantalla de ingreso', title: 'PR #7', sha: 'm1', url: 'https://example.com/7' },
  { id: '1', kind: 'pr-merge', time: ago(2), number: 7, detail: 'repetida', sha: 'm1' }, // el mismo evento dos veces cuenta una
  { id: '2', kind: 'branch-create', time: ago(1), branch: 'wip', title: 'Rama nueva wip' },
  { id: '3', kind: 'pr-merge', time: ago(9), number: 5, detail: 'fuera de la ventana' },
];

const f = {
  t: (k, p = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ''}`,
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`),
  num: (n) => String(n),
  short: (ms) => new Date(ms).toISOString().slice(5, 10),
  text: (x) => (x && typeof x === 'object' && x.$i18n ? `${x.$i18n}${JSON.stringify(x.params || {})}` : String(x ?? '')),
  repo: 'acme/app',
};

test('sin bitácora anterior la ventana son los últimos 7 días y es la n.º 1', () => {
  const b = B.compute(repo(), acts(), { now: NOW });
  assert.equal(b.n, 1);
  assert.equal(b.since, NOW - 7 * DAY);
  assert.equal(b.commits, 6); // b (10 d) y a quedan fuera
  assert.equal(b.shipped, 4); // f1, f2, m1 y d están en main; w1 y w2 no
  assert.equal(b.pending, 2);
  assert.equal(b.merged.length, 1, 'la repetida y la de fuera de la ventana no cuentan');
  assert.equal(b.merged[0].brought, 2, 'el merge trajo f1 y f2 a main');
  assert.equal(b.active, 2, 'main y wip se movieron en la ventana; old no');
  assert.equal(b.partial, false, 'la historia llega a la raíz');
  assert.equal(b.days.length, 8, 'del 11 al 18 de octubre');
  assert.deepEqual(plain(b.days.map((d) => d.total)), [0, 0, 0, 0, 1, 2, 1, 2]);
});

test('lo grande: un release gana a un PR, el PR que más trajo gana a una rama, y una rama gana a nada', () => {
  const r = B.compute(repo(), [...acts(), { id: 'r', kind: 'release', time: ago(0.1), title: { $i18n: 'act.release', params: { tag: 'v2.0.0' } }, detail: 'Notas' }], { now: NOW, text: f.text });
  assert.equal(r.big.kind, 'release');
  assert.equal(r.big.tag, 'v2.0.0');
  const p = B.compute(repo(), acts(), { now: NOW });
  assert.equal(p.big.kind, 'pr');
  assert.equal(p.big.number, 7);
  const w = B.compute(repo(), [], { now: NOW });
  assert.deepEqual(plain({ kind: w.big.kind, name: w.big.name, commits: w.big.commits }), { kind: 'branch', name: 'wip', commits: 2 });
  const quiet = B.compute(repo(), [], { now: NOW + 30 * DAY });
  assert.equal(quiet.big.kind, 'none');
  assert.ok(quiet.findings.some((x) => x.id === 'quiet'));
});

test('hallazgos: CI en rojo, PRs rojos y esperando, force-push, ramas borradas sin fusionar y olvidadas', () => {
  const pulls = new Map([
    [3, { number: 3, title: 'Viejo', head: 'old', sameRepo: true, createdAt: ago(20) }],
    [4, { number: 4, title: 'Rojo', head: 'wip', sameRepo: true, createdAt: ago(1) }],
    [6, { number: 6, title: 'Borrador viejo', head: 'x', sameRepo: true, draft: true, createdAt: ago(30) }],
  ]);
  const data = repo({ pulls, ci: new Map([['main', 'failure'], ['wip', 'failure']]) });
  data.branches.set('lost', { name: 'lost', sha: 'a' });
  const more = [
    { id: 'f1', kind: 'force', time: ago(1), branch: 'wip' },
    { id: 'f2', kind: 'force', time: ago(0.5), branch: 'wip' },
    { id: 'd1', kind: 'branch-delete-unmerged', time: ago(3), branch: 'tmp' },
  ];
  const b = B.compute(data, [...acts(), ...more], { now: NOW });
  const by = Object.fromEntries(b.findings.map((x) => [x.id, x]));
  assert.equal(by['ci-main'].sev, 'alto');
  assert.deepEqual(plain(by['prs-red'].rows.map((r) => r.number)), [4]);
  assert.deepEqual(plain(by['prs-wait'].rows.map((r) => r.number)), [3], 'el borrador no espera revisión');
  assert.equal(by.force.n, 2, 'dos force-push, en una sola rama');
  assert.equal(by.force.rows.length, 1);
  assert.equal(by.deleted.n, 1);
  assert.deepEqual(plain(by.stale.rows.map((r) => r.text)), ['lost'], 'old tiene PR abierto: no está olvidada');
  // la salud resta 20 + 10 + 10 + 10 + 4 + 4
  assert.equal(b.score.dims.salud.v, 100 - 58);
  assert.equal(b.next[0].id, 'ci-main', 'lo más grave va primero en qué sigue');
});

test('la nota: ritmo, publicado y salud, cada uno con su origen, y su promedio', () => {
  const b = B.compute(repo(), acts(), { now: NOW });
  const d = b.score.dims;
  assert.deepEqual(plain({ active: d.ritmo.active, days: d.ritmo.days, v: d.ritmo.v }), { active: 4, days: 8, v: 50 });
  assert.deepEqual(plain({ inBase: d.publicado.inBase, total: d.publicado.total, v: d.publicado.v }), { inBase: 4, total: 6, v: 67 });
  assert.equal(d.salud.v, 96, 'la rama old lleva 40 días sin commits ni PR: un hallazgo bajo');
  assert.equal(b.score.total, Math.round((50 + 67 + 96) / 3));
  assert.equal(b.score.low, 'ritmo', 'lo que más la frena es el ritmo');
  assert.equal(b.trend, null);
});

test('cerrar la bitácora: la siguiente empieza ahí, compara la nota y sigue los hallazgos', () => {
  const pulls = new Map([[4, { number: 4, title: 'Rojo', head: 'wip', sameRepo: true, createdAt: ago(1) }]]);
  const first = B.compute(repo({ pulls, ci: new Map([['main', 'failure'], ['wip', 'failure']]) }), acts(), { now: NOW });
  const entry = B.closeEntry(first, 'Primera');
  assert.deepEqual(plain(entry.hallazgos.map((h) => h.id).sort()), ['ci-main', 'prs-red', 'stale']);
  const prev = B.append([], entry);
  assert.equal(prev.length, 1);

  // dos días después main volvió a verde y apareció un force-push
  const later = NOW + 2 * DAY;
  const data = repo({ pulls, ci: new Map([['main', 'success'], ['wip', 'failure']]) });
  const b = B.compute(data, [{ id: 'f', kind: 'force', time: NOW + DAY, branch: 'wip' }], { now: later, prev });
  assert.equal(b.n, 2);
  assert.equal(b.since, NOW, 'la ventana empieza donde terminó la anterior');
  assert.equal(b.trend.prev, first.score.total);
  const st = Object.fromEntries(b.follow.map((x) => [x.id, x.state]));
  assert.deepEqual(plain(st), { 'ci-main': 'arreglado', 'prs-red': 'sigue', stale: 'sigue', force: 'nuevo', quiet: 'nuevo' }, 'en esos dos días no hubo commits');
  assert.equal(b.findings.find((x) => x.id === 'prs-red').desde, NOW, 'el hallazgo que sigue conserva su fecha de origen');
});

test('a medias: un hallazgo que bajó pero no se cerró', () => {
  const prev = [{ n: 3, desde: ago(14), hasta: ago(7), titulo: 'x', nota: { total: 70 }, hallazgos: [{ id: 'prs-red', sev: 'medio', n: 3, desde: ago(14) }] }];
  const pulls = new Map([[4, { number: 4, title: 'Rojo', head: 'wip', sameRepo: true, createdAt: ago(1) }]]);
  const b = B.compute(repo({ pulls, ci: new Map([['wip', 'failure']]) }), [], { now: NOW, prev });
  assert.equal(b.n, 4);
  const x = b.follow.find((h) => h.id === 'prs-red');
  assert.deepEqual(plain({ state: x.state, was: x.was, now: x.now, desde: x.desde }), { state: 'a-medias', was: 3, now: 1, desde: ago(14) });
});

test('lo guardado que no sirve se descarta, y se guardan a lo más KEEP', () => {
  const ok = (n) => ({ n, desde: n * DAY, hasta: (n + 1) * DAY, titulo: 'x', nota: { total: 50 }, hallazgos: [{ id: 'stale', sev: 'bajo', n: 1, desde: 0 }, { id: 'raro', sev: 'grave' }] });
  const list = B.sanitize([null, 'x', { n: 'a' }, { n: 2, desde: 5, hasta: 1, nota: { total: 1 } }, ok(1), ok(2)]);
  assert.equal(list.length, 2);
  assert.deepEqual(plain(list[0].hallazgos.map((h) => h.id)), ['stale'], 'una gravedad desconocida no entra');
  assert.equal(B.sanitize('roto').length, 0);
  const many = Array.from({ length: B.KEEP + 5 }, (_, i) => ok(i + 1));
  const kept = B.sanitize(many);
  assert.equal(kept.length, B.KEEP);
  assert.equal(kept[kept.length - 1].n, B.KEEP + 5, 'quedan las más nuevas');
});

test('historia cargada parcial: lo de antes no cuenta en el ritmo y se avisa', () => {
  const data = repo();
  data.commits.delete('a');
  data.commits.delete('b'); // la historia cargada empieza en f1 (3 d), que tiene padre sin cargar
  const b = B.compute(data, acts(), { now: NOW });
  assert.equal(b.partial, true);
  assert.equal(b.cover, ago(3));
  assert.equal(b.score.dims.ritmo.days, 4, 'del 15 al 18 de octubre');
  assert.deepEqual(plain(b.days.map((d) => d.loaded)), [false, false, false, false, true, true, true, true], 'del 11 al 14, sin cargar');
  assert.ok(!b.timeline.some((d) => d.gap && d.to < ago(3)), 'los días sin cargar no salen como «sin actividad»');
});

test('la cronología: un día por fila con su titular, y los días seguidos sin nada juntos', () => {
  const b = B.compute(repo(), acts(), { now: NOW, text: f.text });
  const tl = b.timeline;
  assert.equal(tl[0].gap, true);
  assert.equal(tl[0].from, Date.UTC(2026, 9, 11));
  assert.equal(tl[0].to, Date.UTC(2026, 9, 14));
  const day16 = tl.find((d) => d.day === Date.UTC(2026, 9, 16));
  assert.equal(day16.head.kind, 'pr-merge', 'el merge es el titular del día');
  assert.deepEqual(plain(day16.tags), ['#7']);
  const day18 = tl.find((d) => d.day === Date.UTC(2026, 9, 18));
  assert.equal(day18.head.kind, 'commit');
  assert.equal(day18.head.title, 'wip: en curso', 'sin eventos, el último commit del día');
});

test('el panel, el Markdown y el estado.json: numerados, escapados y con el esquema de Brunell_Node', () => {
  const data = repo();
  data.branches.set('<x>', { name: '<x>', sha: 'a' }); // olvidada: sale entre los hallazgos
  const prev = B.demoHistory(NOW).slice(0, 2);
  const b = B.compute(data, acts(), { now: NOW, prev, text: f.text });
  const r = B.render(b, { ...f, title: '' });
  assert.match(r.eyebrow, /^bitacora\.eyebrow/);
  assert.match(r.body, /01 · bitacora\.sec\.big/);
  assert.match(r.body, /08 · bitacora\.sec\.history/);
  assert.ok(!r.body.includes('<x>'), 'los nombres de rama van escapados');
  assert.match(r.body, /data-branch="&#60;x&#62;"/);
  assert.equal(r.title, 'Pantalla de ingreso', 'el título automático es lo grande');
  assert.equal(B.render(b, { ...f, title: 'Mío' }).title, 'Mío');

  const mdText = B.toMarkdown(b, f);
  assert.match(mdText, /^# Pantalla de ingreso\n/);
  assert.match(mdText, /## 03 · bitacora\.sec\.verdict/);
  assert.match(mdText, /\[#7 Pantalla de ingreso\]\(https:\/\/example\.com\/7\)/);

  const st = B.toEstado(b, f);
  assert.equal(st.esquema, 1);
  assert.equal(st.bitacora, 3);
  assert.equal(st.fecha, '2026-10-18');
  assert.deepEqual(plain(st.ventana), { desde: '2026-09-30', hasta: '2026-10-18' }, 'desde que se cerró la n.º 2');
  assert.deepEqual(plain(st.corte), { main: 'd' });
  assert.equal(st.historial.length, 3);
  assert.equal(st.historial[2].total, b.score.total);
  assert.deepEqual(plain(st.anteriores.map((a) => a.n)), ['1', '2']);
  assert.ok(st.hallazgos.some((h) => h.id === 'ci-main' && h.estado === 'arreglado'), 'lo que se cerró queda una bitácora más');
});

test('la historia de la demo: cuatro bitácoras cerradas, válidas, la última hace 4 días', () => {
  const h = B.sanitize(B.demoHistory(NOW));
  assert.equal(h.length, 4);
  assert.equal(h[3].hasta, NOW - 4 * DAY);
  assert.deepEqual(plain(h.map((x) => x.nota.total)), [54, 58, 63, 61]);
});
