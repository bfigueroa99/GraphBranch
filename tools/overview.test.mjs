#!/usr/bin/env node
/* Pruebas de js/overview.js (la vista conjunta: todos los repos a la vez), con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/overview.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), ctx, { filename: 'overview.js' });
const O = ctx.window.GB.overview;
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Un repo cargado: sus commits (con fecha), sus ramas y sus PRs abiertos. */
function data({ commits = [], branches = ['main'], pulls = 0, totalPulls = 0 } = {}) {
  return {
    commits: new Map(commits.map(([sha, date]) => [sha, { sha, date, message: `mensaje de ${sha}`, parents: [] }])),
    branches: new Map(branches.map((b) => [b, { name: b }])),
    pulls: new Map(Array.from({ length: pulls }, (_, i) => [i, { number: i }])),
    totalPulls,
  };
}

test('allParam: ?all=1 la abre, ?all=0 la apaga y sin decirlo no manda', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(O.allParam(q('all=1')), true);
  assert.equal(O.allParam(q('all')), true, '?all a secas también');
  assert.equal(O.allParam(q('all=0')), false);
  assert.equal(O.allParam(q('all=off')), false);
  assert.equal(O.allParam(q('repo=a/b')), null);
});

test('lastCommit: el más nuevo de lo cargado; sin commits, ninguno', () => {
  assert.equal(O.lastCommit(data({ commits: [['a', 1], ['c', 3], ['b', 2]] })).sha, 'c');
  assert.equal(O.lastCommit(data({ commits: [['a', 5], ['b', 5]] })).sha, 'a', 'a igual fecha, el primero que llegó');
  assert.equal(O.lastCommit(data()), null);
});

test('summary: ramas, commits del grafo (o los cargados), PRs abiertos y el último commit', () => {
  const d = data({ commits: [['a', 1], ['b', 7]], branches: ['main', 'dev', 'x'], pulls: 2, totalPulls: 5 });
  const s = plain(O.summary(d, { nodes: [{}, {}, {}] }));
  assert.equal(s.branches, 3);
  assert.equal(s.commits, 3, 'los del grafo, si hay layout');
  assert.equal(s.prs, 5, 'el total que dio el servicio, si es mayor que los cargados');
  assert.equal(s.last.sha, 'b');
  assert.equal(s.lastAt, 7);
  assert.equal(O.summary(d, null).commits, 2, 'sin layout, los cargados');
  assert.equal(O.summary(data(), null).lastAt, 0);
});

test('heavy: avisa cuando las ramas de todos los repos pasan lo que la vista aguanta', () => {
  const twenty = Array.from({ length: 20 }, () => ({ branches: 70, prs: 1 }));
  assert.equal(O.totals(twenty).repos, 20);
  assert.equal(O.heavy(O.totals(twenty)), false);
  const many = Array.from({ length: 20 }, () => ({ branches: 80, prs: 1 }));
  assert.equal(O.heavy(O.totals(many)), true);
  assert.equal(O.heavy({ branches: O.HEAVY_BRANCHES }), false);
  assert.equal(O.heavy({}), false);
});

test('totals: repos, ramas y PRs abiertos de todas las tarjetas', () => {
  assert.deepEqual(plain(O.totals([{ branches: 3, prs: 1 }, { branches: 2, prs: 0 }, { branches: 1, prs: 4 }])), { repos: 3, branches: 6, prs: 5 });
  assert.deepEqual(plain(O.totals([])), { repos: 0, branches: 0, prs: 0 });
});

test('prGroup: borrador, checks en rojo, aprobado o esperando revisión, en ese orden de prioridad', () => {
  assert.equal(O.prGroup({ draft: true, ci: 'failure', review: 'approved' }), 'draft', 'un borrador lo es aunque falle');
  assert.equal(O.prGroup({ ci: 'failure', review: 'approved' }), 'failing', 'en rojo antes que aprobado');
  assert.equal(O.prGroup({ ci: 'success', review: 'approved' }), 'approved');
  assert.equal(O.prGroup({ ci: 'pending' }), 'waiting');
  assert.equal(O.prGroup({}), 'waiting');
});

test('groupPulls: los PRs de todos los repos por estado, del más nuevo al más viejo, sin grupos vacíos', () => {
  const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, head: `rama-${number}`, user: { login: 'ana' }, createdAt: number * 10, ...extra });
  const g = plain(O.groupPulls([
    { key: 'a', name: 'o/a', pulls: new Map([[1, pr(1)], [2, pr(2, { draft: true })], [3, pr(3, { ci: 'failure' })]]).values() },
    { key: 'b', name: 'o/b', pulls: [pr(4, { review: 'approved' }), pr(5), pr(6, { draft: true })] },
    { key: 'c', name: 'o/c', pulls: [] },
  ]));
  assert.deepEqual(g.map((x) => x.id), ['draft', 'failing', 'approved', 'waiting']);
  assert.deepEqual(g[0].items.map((i) => [i.repo, i.number]), [['o/b', 6], ['o/a', 2]], 'el más nuevo primero, con su repo');
  assert.deepEqual(g[3].items.map((i) => i.number), [5, 1]);
  assert.equal(g[0].items[0].key, 'b');
  assert.equal(g[0].items[0].head, 'rama-6');
  assert.equal(g[0].items[0].user, 'ana');
  assert.deepEqual(plain(O.groupPulls([{ key: 'a', name: 'o/a', pulls: [pr(1)] }])).map((x) => x.id), ['waiting'], 'solo los grupos con PRs');
  assert.deepEqual(plain(O.groupPulls([])), []);
});

test('groupPulls y prAuthors: el Launchpad se filtra por la persona que abrió el PR, con lo ya cargado', () => {
  const pr = (number, login, extra = {}) => ({ number, title: `PR ${number}`, head: `r${number}`, user: { login }, createdAt: number, ...extra });
  const entries = [
    { key: 'a', name: 'o/a', pulls: [pr(1, 'Ana'), pr(2, 'beto', { draft: true })] },
    { key: 'b', name: 'o/b', pulls: new Set([pr(3, 'ana', { ci: 'failure' }), pr(4, 'Ana'), { number: 5, title: 'sin autor', createdAt: 5 }]) },
  ];
  assert.deepEqual(plain(O.prAuthors(entries)), ['Ana', 'ana', 'beto'], 'sin repetir, alfabético y sin los PRs sin autor');
  const nums = (g) => g.flatMap((x) => x.items.map((i) => i.number)).sort();
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, 'Ana'))), [1, 4], 'solo los de esa persona, de todos los repos');
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, 'beto'))), [2]);
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, ''))), [1, 2, 3, 4, 5], 'sin filtro, todos');
  assert.deepEqual(plain(O.groupPulls(entries, null, 'nadie')), [], 'una persona sin PRs no deja grupos');
  assert.deepEqual(plain(O.prAuthors([])), []);
});


test('el Launchpad por persona: también los PRs en que se le pidió revisión o está asignada, con su papel', () => {
  const pr = (number, login, extra = {}) => ({ number, title: `PR ${number}`, head: `r${number}`, user: login ? { login } : null, createdAt: number, ...extra });
  const entries = [
    { key: 'a', name: 'o/a', pulls: [pr(1, 'ana'), pr(2, 'beto', { requested: ['ana', 'carla'] }), pr(3, 'beto', { assignees: ['ana'] })] },
    { key: 'b', name: 'o/b', pulls: new Set([pr(4, 'carla', { requested: ['Ana'], assignees: ['dani'] }), pr(5, null, { requested: ['ana'] }), pr(6, 'ana', { requested: ['ana'], assignees: ['ana'] })]) },
  ];
  assert.deepEqual(plain(O.prAuthors(entries)), ['Ana', 'ana', 'beto', 'carla', 'dani'], 'autores, revisores pedidos y asignados, sin repetir');
  assert.deepEqual(plain(O.prCounts(entries)), { ana: 5, beto: 2, carla: 2, Ana: 1, dani: 1 }, 'cada PR cuenta una vez por persona, aunque tenga varios papeles en él');
  const rows = (who) => plain(O.groupPulls(entries, null, who)).flatMap((g) => g.items).map((i) => `${i.number}:${i.role}`).sort();
  assert.deepEqual(rows('ana'), ['1:author', '2:review', '3:assignee', '5:review', '6:author'], 'el papel dice por qué está: abrirlo gana a la revisión, y la revisión a la asignación');
  assert.deepEqual(rows('dani'), ['4:assignee']);
  assert.deepEqual(rows(''), ['1:', '2:', '3:', '4:', '5:', '6:'], 'sin filtro, todos y sin papel');
  assert.deepEqual(plain(O.groupPulls([{ key: 'c', name: 'o/c', pulls: [pr(7, 'eva', { requested: [null, 3, ''], assignees: 'eva' })] }], null, '')).flatMap((g) => g.items).map((i) => i.number), [7], 'listas raras no rompen nada');
  assert.deepEqual(plain(O.prAuthors([{ key: 'c', name: 'o/c', pulls: [pr(7, 'eva', { requested: [null, 3, ''], assignees: 'eva' })] }])), ['eva'], 'solo nombres de verdad');
});

test('prCounts: cada persona dice cuántos PRs abiertos tiene, de todos los repos y sin contar los PRs sin autor', () => {
  const pr = (number, login) => ({ number, title: `PR ${number}`, user: login ? { login } : undefined });
  const entries = [
    { key: 'a', name: 'o/a', pulls: [pr(1, 'ana'), pr(2, 'beto'), pr(3, 'ana')] },
    { key: 'b', name: 'o/b', pulls: new Set([pr(4, 'ana'), pr(5, 'Ana'), pr(6)]) },
  ];
  assert.deepEqual(plain(O.prCounts(entries)), { ana: 3, beto: 1, Ana: 1 });
  assert.deepEqual(plain(O.prCounts([])), {});
});

test('groupPulls: los PRs fijados van arriba de su grupo, por repo y número, y no cambian de grupo', () => {
  const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, head: `rama-${number}`, createdAt: number * 10, ...extra });
  const entries = [
    { key: 'a', name: 'o/a', pulls: [pr(1), pr(2), pr(3, { draft: true })] },
    { key: 'b', name: 'o/b', pulls: [pr(1), pr(4)] },
  ];
  const order = (g) => plain(g).map((x) => [x.id, x.items.map((i) => `${i.key}#${i.number}${i.pinned ? '*' : ''}`)]);
  assert.deepEqual(order(O.groupPulls(entries)), [['draft', ['a#3']], ['waiting', ['b#4', 'a#2', 'a#1', 'b#1']]], 'sin fijados, el orden de siempre');
  assert.deepEqual(order(O.groupPulls(entries, new Set([O.pinId('b', 1), O.pinId('a', 1), O.pinId('a', 3)]))),
    [['draft', ['a#3*']], ['waiting', ['a#1*', 'b#1*', 'b#4', 'a#2']]], 'los fijados primero, y #1 de b no es #1 de a');
  assert.deepEqual(order(O.groupPulls(entries, new Set(['a#99']))), order(O.groupPulls(entries)), 'un fijado que ya no existe no hace nada');
  assert.equal(O.pinId('o/a', 7), 'o/a#7');
});

test('groupPulls: un PR pospuesto baja al final de su grupo hasta que vence, y fijar gana a posponer', () => {
  const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, head: `rama-${number}`, createdAt: number * 10, ...extra });
  const entries = [
    { key: 'a', name: 'o/a', pulls: [pr(1), pr(2), pr(3, { draft: true }), pr(5, { draft: true })] },
    { key: 'b', name: 'o/b', pulls: [pr(1), pr(4)] },
  ];
  const now = 1_000_000;
  const order = (g) => plain(g).map((x) => [x.id, x.items.map((i) => `${i.key}#${i.number}${i.pinned ? '*' : ''}${i.snoozed ? 'z' : ''}`)]);
  const later = now + O.SNOOZE_MS;
  assert.deepEqual(order(O.groupPulls(entries, null, '', '', { 'b#4': later, 'a#5': later }, now)),
    [['draft', ['a#3', 'a#5z']], ['waiting', ['a#2', 'a#1', 'b#1', 'b#4z']]], 'el más nuevo baja al final de su grupo y no cambia de grupo');
  assert.deepEqual(order(O.groupPulls(entries, null, '', '', { 'b#4': now - 1, 'a#5': now }, now)), order(O.groupPulls(entries)), 'vencido, vuelve a su lugar');
  assert.deepEqual(order(O.groupPulls(entries, new Set(['b#4']), '', '', { 'b#4': later, 'a#2': later }, now)),
    [['draft', ['a#5', 'a#3']], ['waiting', ['b#4*', 'a#1', 'b#1', 'a#2z']]], 'fijado y pospuesto: va arriba, fijado');
  assert.deepEqual(order(O.groupPulls(entries, null, '', '', { 'b#4': later, 'a#2': later }, now + O.SNOOZE_MS)), order(O.groupPulls(entries)), 'pasado un día, nada queda pospuesto');
  assert.equal(O.SNOOZE_MS, 86_400_000, 'un día');
});

test('liveSnoozes: solo los pospuestos vigentes, y nada de lo que no es { id: número }', () => {
  assert.deepEqual(plain(O.liveSnoozes({ 'a#1': 20, 'a#2': 10, 'a#3': 'x', 'a#4': 11 }, 10)), { 'a#1': 20, 'a#4': 11 });
  for (const bad of [null, undefined, 'a#1', 5, ['a#1']]) assert.deepEqual(plain(O.liveSnoozes(bad, 0)), {}, String(bad));
});

test('mount: fijar repinta con los mismos PRs aunque `pulls` sea un iterador de un solo uso', () => {
  const els = [];
  const mkEl = (tag) => {
    const el = { tag, children: [], dataset: {}, attrs: {}, classList: { toggle() {} }, hidden: false, listeners: {}, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, querySelectorAll: () => [], querySelector: () => null, focus() {}, closest: () => null };
    els.push(el);
    return el;
  };
  const c2 = vm.createContext({ window: { GB: { U: { truncate: (x) => x } }, matchMedia: null }, document: { createElement: mkEl } });
  vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), c2, { filename: 'overview.js' });
  const pins = new Set();
  const box = mkEl('div');
  const ov = c2.window.GB.overview.mount(mkEl('div'), { prsRoot: box, text: (k) => k, num: String, getPins: () => [...pins], onPin: (id, on) => (on ? pins.add(id) : pins.delete(id)) });
  ov.setPulls([{ key: 'a', name: 'o/a', pulls: new Map([[1, { number: 1, title: 'x', createdAt: 1 }]]).values() }]);
  const pinBtn = els.find((e) => e.tag === 'button' && e.className === 'ap-pin');
  pinBtn.listeners.click();
  assert.deepEqual([...pins], ['a#1']);
  assert.equal(box.hidden, false, 'tras fijar, el Launchpad sigue con su PR');
});

test('personParam: ?by=login lleva el filtro por persona del Launchpad', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(O.personParam(q('by=ana')), 'ana');
  assert.equal(O.personParam(q('by=%20ana%20')), 'ana', 'sin espacios alrededor');
  assert.equal(O.personParam(q('by=')), '');
  assert.equal(O.personParam(q('all=1')), '', 'sin decirlo, no filtra');
  assert.equal(O.personParam(q(`by=${'x'.repeat(300)}`)).length, 100, 'un login absurdo se acorta');
});

test('mount: el Launchpad abre con la persona de ?by=, ignora una desconocida y avisa al elegir otra', () => {
  const run = (person) => {
    const els = [];
    const mkEl = (tag) => {
      const el = { tag, children: [], dataset: {}, attrs: {}, classList: { toggle() {} }, hidden: false, listeners: {}, value: '', options: [], append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, querySelectorAll: () => [], querySelector: () => null, focus() {}, closest: () => null };
      els.push(el);
      return el;
    };
    const c2 = vm.createContext({ window: { GB: { U: { truncate: (x) => x } }, matchMedia: null }, document: { createElement: mkEl }, Option: function (t, v) { this.text = t; this.value = v; } });
    vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), c2, { filename: 'overview.js' });
    const chosen = [];
    const box = mkEl('div');
    const ov = c2.window.GB.overview.mount(mkEl('div'), { prsRoot: box, text: (k) => k, num: String, person, onPerson: (u) => chosen.push(u) });
    const pr = (n, login) => ({ number: n, title: `PR ${n}`, createdAt: n, user: { login } });
    ov.setPulls([{ key: 'a', name: 'o/a', pulls: [pr(1, 'Ana'), pr(2, 'beto')] }]);
    return { els, chosen };
  };
  const shown = (r) => r.els.filter((e) => e.className === 'ap-row').map((e) => e.dataset.number);
  const a = run('ana'); // otra capitalización: igual se reconoce
  assert.deepEqual(shown(a), ['1'], 'abre solo con los PRs de la persona de la URL');
  assert.equal(a.els.find((e) => e.className === 'ap-person').value, 'Ana');
  const x = run('nadie');
  assert.deepEqual(shown(x).sort(), ['1', '2'], 'un login desconocido se ignora: se ven todos');
  const sel = x.els.find((e) => e.className === 'ap-person');
  sel.value = 'beto';
  sel.listeners.change();
  assert.deepEqual(x.chosen, ['beto'], 'elegir avisa para escribirlo en la URL');
});

test('mount: con una persona elegida, cada fila dice si se le pidió revisión o está asignada', () => {
  const els = [];
  const mkEl = (tag) => {
    const el = { tag, children: [], dataset: {}, attrs: {}, classList: { toggle() {} }, hidden: false, listeners: {}, value: '', append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, querySelectorAll: () => [], querySelector: () => null, focus() {}, closest: () => null };
    els.push(el);
    return el;
  };
  const c2 = vm.createContext({ window: { GB: { U: { truncate: (x) => x } }, matchMedia: null }, document: { createElement: mkEl }, Option: function (t, v) { this.text = t; this.value = v; } });
  vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), c2, { filename: 'overview.js' });
  const ov = c2.window.GB.overview.mount(mkEl('div'), { prsRoot: mkEl('div'), text: (k) => k, num: String, person: 'beto' });
  const pr = (n, login, extra) => ({ number: n, title: `PR ${n}`, createdAt: n, user: { login }, ...extra });
  ov.setPulls([{ key: 'a', name: 'o/a', pulls: [pr(1, 'ana', { requested: ['beto'] }), pr(2, 'ana', { assignees: ['beto'] }), pr(3, 'beto'), pr(4, 'ana')] }]);
  const rows = els.filter((e) => e.className === 'ap-row');
  const role = (b) => b.children.find((c) => c.className === 'ap-role')?.textContent || '';
  assert.deepEqual(rows.map((b) => `${b.dataset.number}:${role(b)}`).sort(), ['1:all.prs.role.review', '2:all.prs.role.assignee', '3:'], 'lo que abrió no lleva marca; el PR de otra persona no sale');
  assert.match(rows.find((b) => b.dataset.number === '1').attrs['aria-label'], /all\.prs\.role\.review/, 'el lector de pantalla también lo dice');
  const sel = els.find((e) => e.className === 'ap-person');
  assert.equal(sel.value, 'beto');
  const before = els.length;
  sel.value = '';
  sel.listeners.change();
  const after = els.slice(before);
  assert.equal(after.filter((e) => e.className === 'ap-row').length, 4, 'con «Todas las personas», los cuatro');
  assert.equal(after.filter((e) => e.className === 'ap-role').length, 0, 'y sin marcas');
});

test('groupPulls y prRepos: el Launchpad se filtra por repo, con lo ya cargado y combinado con la persona', () => {
  const pr = (number, login) => ({ number, title: `PR ${number}`, user: { login }, createdAt: number });
  const entries = [
    { key: 'b', name: 'o/Beta', pulls: new Set([pr(3, 'ana'), pr(4, 'beto')]) },
    { key: 'a', name: 'o/alfa', pulls: [pr(1, 'ana'), pr(2, 'ana')] },
    { key: 'c', name: 'o/vacio', pulls: [] },
  ];
  const nums = (g) => g.flatMap((x) => x.items.map((i) => i.number)).sort();
  assert.deepEqual(plain(O.prRepos(entries)), [{ key: 'a', name: 'o/alfa', n: 2 }, { key: 'b', name: 'o/Beta', n: 2 }], 'solo los repos con PRs, alfabético');
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, '', 'a'))), [1, 2], 'solo los PRs de ese repo');
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, '', 'b'))), [3, 4]);
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, '', ''))), [1, 2, 3, 4], 'sin filtro, todos');
  assert.deepEqual(nums(plain(O.groupPulls(entries, null, 'ana', 'b'))), [3], 'persona y repo se combinan');
  assert.deepEqual(plain(O.groupPulls(entries, null, '', 'c')), [], 'un repo sin PRs no deja grupos');
  assert.deepEqual(plain(O.prRepos([])), []);
});

test('mount: el selector de repo del Launchpad filtra al elegir y no aparece con un solo repo', () => {
  const els = [];
  const mkEl = (tag) => {
    const e = { tag, className: '', dataset: {}, children: [], hidden: false, listeners: {}, classList: { toggle() {} }, value: '',
      append(...k) { this.children.push(...k); }, replaceChildren() { this.children = []; },
      setAttribute() {}, addEventListener(n, f) { this.listeners[n] = f; }, querySelector() { return null; }, focus() {} };
    els.push(e);
    return e;
  };
  const c = vm.createContext({ window: { GB: { U: { truncate: (x) => x } }, matchMedia: null }, document: { createElement: mkEl }, Option: function (t, v) { this.text = t; this.value = v; } });
  vm.runInContext(readFileSync(join(root, 'js', 'overview.js'), 'utf8'), c, { filename: 'overview.js' });
  const box = mkEl('div');
  const ov = c.window.GB.overview.mount(mkEl('div'), { prsRoot: box, text: (k) => k, num: String });
  const pr = (n) => ({ number: n, title: `PR ${n}`, createdAt: n, user: { login: 'ana' } });
  ov.setPulls([{ key: 'a', name: 'o/a', pulls: [pr(1)] }]);
  assert.equal(els.some((e) => e.className === 'ap-repo'), false, 'con un solo repo no hay selector');
  els.length = 0;
  const box2 = mkEl('div');
  const ov2 = c.window.GB.overview.mount(mkEl('div'), { prsRoot: box2, text: (k) => k, num: String });
  ov2.setPulls([{ key: 'a', name: 'o/a', pulls: [pr(1)] }, { key: 'b', name: 'o/b', pulls: [pr(2)] }]);
  const sel = els.find((e) => e.className === 'ap-repo');
  assert.ok(sel, 'con dos repos con PRs, el selector aparece');
  assert.equal(sel.children.length, 3, 'todos los repos más las opciones por repo');
  els.length = 0;
  sel.value = 'b';
  sel.listeners.change();
  const rows = els.filter((e) => e.className === 'ap-row').map((e) => e.dataset.key);
  assert.deepEqual(rows, ['b'], 'elegir un repo deja solo sus PRs');
});

test('fitGrid: reparte las tarjetas para que entren todas, lo más grandes posible', () => {
  const g = (n, w, h) => plain(O.fitGrid(n, w, h));
  assert.deepEqual(g(1, 900, 500), { cols: 1, rows: 1 });
  assert.deepEqual(g(2, 900, 500), { cols: 2, rows: 1 }, 'dos, lado a lado en un área ancha');
  assert.deepEqual(g(2, 500, 900), { cols: 1, rows: 2 }, 'y una sobre otra en un área alta');
  assert.deepEqual(g(4, 900, 500), { cols: 2, rows: 2 });
  assert.deepEqual(g(6, 900, 500), { cols: 3, rows: 2 });
  assert.deepEqual(g(20, 1600, 900), { cols: 5, rows: 4 }, 'el tope de 20 repos');
  for (let n = 1; n <= 20; n++) {
    const { cols, rows } = O.fitGrid(n, 1200, 640);
    assert.ok(cols * rows >= n && cols * (rows - 1) < n, `${n} tarjetas en ${cols}×${rows}: sobran filas o faltan celdas`);
  }
});

test('fitGrid: sin medidas (el panel todavía no se ve) da una grilla razonable, nunca vacía', () => {
  assert.deepEqual(plain(O.fitGrid(3, 0, 0)), { cols: 2, rows: 2 });
  assert.deepEqual(plain(O.fitGrid(1, NaN, 400)), { cols: 1, rows: 1 });
  assert.deepEqual(plain(O.fitGrid(0, 800, 400)), { cols: 1, rows: 1 });
});
