#!/usr/bin/env node
/* Pruebas de js/constellation.js: la disposición de la constelación de repos, con datos fijos.

     node --test                          todas las pruebas (archivos *.test.mjs)
     node tools/constellation.test.mjs    solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'constellation.js'), 'utf8'), ctx, { filename: 'constellation.js' });
const C = ctx.window.GB.constellation;
const place = (items) => JSON.parse(JSON.stringify(C.place(items)));

const repos = (n) => Array.from({ length: n }, (_, i) => ({ key: `o/r${i}`, commits: (i * 37) % 400 }));

test('sin repos no hay galaxias; con uno, está al centro', () => {
  assert.deepEqual(place([]), []);
  const [g] = place([{ key: 'o/a', commits: 5 }]);
  assert.equal(g.key, 'o/a');
  assert.ok(Math.abs(g.x - 50) < 1e-9 && Math.abs(g.y - 50) < 1e-9);
});

test('10 repos: en el orden dado, dentro del cuadro y sin tocarse', () => {
  const items = repos(10);
  const spots = place(items);
  assert.deepEqual(spots.map((s) => s.key), items.map((i) => i.key));
  for (const s of spots) {
    assert.ok(s.r > 0 && s.x - s.r >= 0 && s.x + s.r <= 100 && s.y - s.r >= 0 && s.y + s.r <= 100, JSON.stringify(s));
  }
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++)
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= spots[i].r + spots[j].r, `${i} toca a ${j}`);
});

test('20 repos (el tope): todos caben en el cuadro y sin tocarse', () => {
  const spots = place(repos(20));
  assert.equal(spots.length, 20);
  for (const s of spots) assert.ok(s.r > 0 && s.x - s.r >= 0 && s.x + s.r <= 100 && s.y - s.r >= 0 && s.y + s.r <= 100, JSON.stringify(s));
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++)
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= spots[i].r + spots[j].r, `${i} toca a ${j}`);
});

test('más commits, galaxia más grande, y la mayor queda al centro', () => {
  const spots = place([{ key: 'chico', commits: 3 }, { key: 'grande', commits: 900 }, { key: 'medio', commits: 80 }]);
  const by = Object.fromEntries(spots.map((s) => [s.key, s]));
  assert.ok(by.grande.r > by.medio.r && by.medio.r > by.chico.r);
  assert.ok(Math.abs(by.grande.x - by.chico.x) + Math.abs(by.grande.y - by.chico.y) > 0);
  const dist = (s) => Math.hypot(s.x - 50, s.y - 50);
  assert.ok(dist(by.grande) <= dist(by.medio) && dist(by.grande) <= dist(by.chico));
});

test('la disposición es estable: lo mismo da lo mismo', () => {
  assert.deepEqual(place(repos(10)), place(repos(10)));
});

test('radio y tono: repos sin commits cargados no rompen, el tono es estable', () => {
  assert.equal(C.radiusOf(0, 0), 1);
  assert.equal(C.radiusOf(undefined, 10), 1);
  assert.ok(C.radiusOf(10, 10) > C.radiusOf(1, 10));
  assert.equal(C.hueOf('o/a'), C.hueOf('o/a'));
  assert.ok(C.hueOf('o/a') >= 0 && C.hueOf('o/a') < 360);
  assert.equal(place([{ key: 'a' }, { key: 'b' }]).length, 2);
});

test('el orden: pestañas tal cual, actividad por commits y nombre sin mayúsculas ni acentos; empata por pestaña', () => {
  const items = [
    { key: 'o/b', name: 'o/beta', commits: 10 },
    { key: 'o/a', name: 'o/Árbol', commits: 90 },
    { key: 'o/c', name: 'o/ceta', commits: 10 },
    { key: 'o/d', name: 'o/alfa', commits: 0 },
  ];
  const keys = (mode) => C.sortItems(items, mode).map((i) => i.key);
  assert.deepEqual(keys('tabs'), ['o/b', 'o/a', 'o/c', 'o/d']);
  assert.deepEqual(keys('desconocido'), keys('tabs'));
  assert.deepEqual(keys('activity'), ['o/a', 'o/b', 'o/c', 'o/d']);
  assert.deepEqual(keys('name'), ['o/d', 'o/a', 'o/b', 'o/c']);
  const withPrs = items.map((it, i) => ({ ...it, prs: [0, 2, 7, 2][i] }));
  assert.deepEqual(C.sortItems(withPrs, 'prs').map((i) => i.key), ['o/c', 'o/a', 'o/d', 'o/b'], 'más PRs abiertos primero; empata por pestaña');
  assert.deepEqual(C.sortItems(items, 'prs').map((i) => i.key), keys('tabs'), 'sin PRs cargados queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=%20PRS%20')), 'prs');
  const withNew = items.map((it, i) => ({ ...it, fresh: [1, 0, 3, 1][i] }));
  assert.deepEqual(C.sortItems(withNew, 'new').map((i) => i.key), ['o/c', 'o/b', 'o/d', 'o/a'], 'más ramas nuevas primero; empata por pestaña');
  assert.deepEqual(C.sortItems(items, 'new').map((i) => i.key), keys('tabs'), 'sin ramas nuevas queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=NEW')), 'new');
  const withIssues = items.map((it, i) => ({ ...it, issues: [3, null, 12, 3][i] }));
  assert.deepEqual(C.sortItems(withIssues, 'issues').map((i) => i.key), ['o/c', 'o/b', 'o/d', 'o/a'], 'más issues abiertos primero; sin dato cuenta como 0; empata por pestaña');
  assert.deepEqual(C.sortItems(items, 'issues').map((i) => i.key), keys('tabs'), 'sin issues cargados queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=%20Issues')), 'issues');
  const withStars = items.map((it, i) => ({ ...it, stars: [40, null, 1200, 40][i] }));
  assert.deepEqual(C.sortItems(withStars, 'stars').map((i) => i.key), ['o/c', 'o/b', 'o/d', 'o/a'], 'más estrellas primero; sin dato cuenta como 0; empata por pestaña');
  assert.deepEqual(C.sortItems(items, 'stars').map((i) => i.key), keys('tabs'), 'sin estrellas cargadas queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=STARS')), 'stars');
  const withForks = items.map((it, i) => ({ ...it, forks: [5, null, 90, 5][i] }));
  assert.deepEqual(C.sortItems(withForks, 'forks').map((i) => i.key), ['o/c', 'o/b', 'o/d', 'o/a'], 'más forks primero; sin dato cuenta como 0; empata por pestaña');
  assert.deepEqual(C.sortItems(items, 'forks').map((i) => i.key), keys('tabs'), 'sin forks cargados queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=%20Forks')), 'forks');
  const withLast = items.map((it, i) => ({ ...it, last: [2e12, null, 3e12, 2e12][i], state: ['live', 'loading', 'live', 'live'][i] }));
  assert.deepEqual(C.sortItems(withLast, 'recent').map((i) => i.key), ['o/c', 'o/b', 'o/d', 'o/a'], 'el commit más reciente primero; empata por pestaña; sin fecha (cargando o vacío) al final');
  const someEmpty = items.map((it, i) => ({ ...it, last: [null, 5e11, undefined, 9e11][i] }));
  assert.deepEqual(C.sortItems(someEmpty, 'recent').map((i) => i.key), ['o/d', 'o/a', 'o/b', 'o/c'], 'los que no tienen commits van al final, en el orden de las pestañas');
  assert.deepEqual(C.sortItems(items, 'recent').map((i) => i.key), keys('tabs'), 'sin fechas cargadas queda el orden de las pestañas');
  assert.equal(C.orderParam(new URLSearchParams('order=RECENT')), 'recent');
  assert.deepEqual(items.map((i) => i.key), ['o/b', 'o/a', 'o/c', 'o/d'], 'no toca la lista original');
});

test('?order=activity o ?order=name abre ordenada; lo desconocido o vacío deja el orden de las pestañas', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(C.orderParam(q('order=activity')), 'activity');
  assert.equal(C.orderParam(q('order=%20Activity%20')), 'activity');
  assert.equal(C.orderParam(q('order=name')), 'name');
  assert.equal(C.orderParam(q('order=%20NAME%20')), 'name');
  assert.equal(C.orderParam(q('order=')), null);
  assert.equal(C.orderParam(q('order=otro')), null);
  assert.equal(C.orderParam(q('repo=o/a')), null);
});

test('?constellation=texto deja los repos cuyo nombre lo contiene, sin mayúsculas ni acentos', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(C.filterParam(q('constellation=%20Api%20')), 'Api');
  assert.equal(C.filterParam(q('constellation=')), '');
  assert.equal(C.filterParam(q('repo=o/a')), '');
  assert.equal(C.filterParam(q('constellation=' + 'x'.repeat(300))).length, 100);
  const items = [{ name: 'o/Café-API' }, { name: 'o/web' }, { name: 'o/api-docs' }];
  assert.deepEqual(C.filterItems(items, 'api').map((i) => i.name), ['o/Café-API', 'o/api-docs']);
  assert.deepEqual(C.filterItems(items, 'CAFE').map((i) => i.name), ['o/Café-API']);
  assert.deepEqual(C.filterItems(items, 'nada'), []);
  assert.deepEqual(C.filterItems(items, '  '), items);
  assert.notEqual(C.filterItems(items, ''), items, 'no devuelve la misma lista');
});

test('?recent=N deja los repos con actividad en los últimos N días; sin fecha solo se conserva el que carga', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(C.recentParam(q('recent=30')), 30);
  assert.equal(C.recentParam(q('recent=%207%20')), 7);
  assert.equal(C.recentParam(q('recent=0.5')), 0.5);
  assert.equal(C.recentParam(q('recent=99999')), 3650);
  for (const bad of ['recent=', 'recent=0', 'recent=-3', 'recent=abc', 'recent=Infinity', 'repo=o/a']) assert.equal(C.recentParam(q(bad)), null, bad);
  const now = Date.UTC(2026, 10, 3);
  const items = [
    { name: 'o/hoy', last: now - 3600e3 },
    { name: 'o/mes', last: now - 29 * 864e5 },
    { name: 'o/viejo', last: now - 31 * 864e5 },
    { name: 'o/cargando', last: null, state: 'loading' },
    { name: 'o/vacio', last: null, state: 'live' },
    { name: 'o/error', last: undefined, state: 'error' },
  ];
  assert.deepEqual(C.recentItems(items, 30, now).map((i) => i.name), ['o/hoy', 'o/mes', 'o/cargando']);
  assert.deepEqual(C.recentItems(items, 1, now).map((i) => i.name), ['o/hoy', 'o/cargando']);
  assert.deepEqual(C.recentItems(items, null, now), items);
  assert.notEqual(C.recentItems(items, null, now), items, 'no devuelve la misma lista');
});

test('las ramas nuevas de la semana: cada nombre una vez, solo los últimos 7 días y solo creaciones', () => {
  const now = Date.UTC(2026, 10, 5, 12);
  const day = 864e5;
  const acts = [
    { id: 1, kind: 'branch-create', branch: 'feat/a', time: now - day },
    { id: 2, kind: 'branch-create', branch: 'feat/a', time: now - 2 * day }, // la misma rama vista dos veces
    { id: 3, kind: 'branch-create', branch: 'feat/b', time: now - 6 * day },
    { id: 4, kind: 'branch-create', branch: 'vieja', time: now - 8 * day }, // fuera de la semana
    { id: 5, kind: 'branch-create', branch: 'futura', time: now + day }, // después de ahora
    { id: 6, kind: 'push', branch: 'feat/c', time: now - day }, // no es una creación
    { id: 7, kind: 'branch-create', time: now - day }, // sin nombre: cuenta por su id
    { id: 8, kind: 'branch-create', branch: 'sin-hora' },
    null,
  ];
  assert.equal(C.newBranches(acts, now), 3);
  assert.equal(C.newBranches(acts, now, 1.5), 2, 'otra ventana de días');
  assert.equal(C.newBranches([], now), 0);
  assert.equal(C.newBranches(undefined, now), 0);
});

test('ordenar por ramas nuevas con la actividad de cada repo, como la arma la app', () => {
  const now = Date.UTC(2026, 10, 5, 12);
  const feed = [
    { id: 'a1', repo: 'o/a', kind: 'branch-create', branch: 'x', time: now - 1000 },
    { id: 'b1', repo: 'o/b', kind: 'branch-create', branch: 'x', time: now - 1000 },
    { id: 'b2', repo: 'o/b', kind: 'branch-create', branch: 'y', time: now - 2000 },
    { id: 'c1', repo: 'o/c', kind: 'push', branch: 'z', time: now - 1000 },
  ];
  const tabs = ['o/c', 'o/a', 'o/b'].map((key) => ({ key, name: key, fresh: C.newBranches(feed.filter((a) => a.repo === key), now) }));
  assert.deepEqual(tabs.map((t) => t.fresh), [0, 1, 2], 'cada repo cuenta solo lo suyo');
  assert.deepEqual(C.sortItems(tabs, 'new').map((t) => t.key), ['o/b', 'o/a', 'o/c']);
});

test('issues abiertos con lo ya cargado: aparte si la API los da aparte; si vienen con los PRs, se restan los PRs', () => {
  assert.equal(C.openIssues({ repo: { openIssues: 7 }, totalPulls: 3 }), 7, 'GitLab y Gitea los dan aparte: los PRs no se restan');
  assert.equal(C.openIssues({ repo: { openItems: 10 }, totalPulls: 4, pulls: new Map([[1, {}]]) }), 6, 'GitHub: issues y PRs juntos, menos los PRs');
  assert.equal(C.openIssues({ repo: { openItems: 10 }, totalPulls: 2, pulls: new Map([[1, {}], [2, {}], [3, {}]]) }), 7, 'cuenta los PRs que haya, del total o de la lista');
  assert.equal(C.openIssues({ repo: { openItems: 2 }, totalPulls: 5 }), 0, 'nunca negativo (el total del repo es de antes)');
  assert.equal(C.openIssues({ repo: {} }), null, 'sin dato (Bitbucket, Azure, un repo local): null');
  assert.equal(C.openIssues({ repo: { openItems: null } }), null);
  assert.equal(C.openIssues(null), null);
});

test('estrellas con lo ya cargado: el total de la consulta del repo, o null si la fuente no lo da', () => {
  assert.equal(C.starsOf({ repo: { stars: 1234 } }), 1234);
  assert.equal(C.starsOf({ repo: { stars: 0 } }), 0, 'cero estrellas es un dato, no un hueco');
  assert.equal(C.starsOf({ repo: { stars: -3 } }), 0, 'nunca negativo');
  assert.equal(C.starsOf({ repo: {} }), null, 'sin dato (Bitbucket, Azure, un repo local): null');
  assert.equal(C.starsOf({ repo: { stars: null } }), null);
  assert.equal(C.starsOf(null), null);
});

test('forks con lo ya cargado: el total de la consulta del repo, o null si la fuente no lo da', () => {
  assert.equal(C.forksOf({ repo: { forks: 87 } }), 87);
  assert.equal(C.forksOf({ repo: { forks: 0 } }), 0, 'cero forks es un dato, no un hueco');
  assert.equal(C.forksOf({ repo: { forks: -2 } }), 0, 'nunca negativo');
  assert.equal(C.forksOf({ repo: { stars: 5 } }), null, 'sin dato (Bitbucket, Azure, un repo local): null; no toma las estrellas');
  assert.equal(C.forksOf({ repo: { forks: null } }), null);
  assert.equal(C.forksOf(null), null);
});
