#!/usr/bin/env node
/* Pruebas de js/swarm.js: los indicadores, los roles, la corteza, el ingreso de tareas y el log del enjambre, con datos
   fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/swarm.test.mjs        solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
for (const f of ['agents.js', 'swarm.js']) vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), ctx, { filename: f });
const { compute, network } = ctx.window.GB.agents;
const { windowFor, series, roles, hub, place, kpis, ingest, lines, perAgent, spark, rate, cloud, WINDOWS, SHAPE } = ctx.window.GB.swarm;
const plain = (x) => JSON.parse(JSON.stringify(x));

const H = 36e5;
const NOW = Date.UTC(2026, 10, 7, 12);
const S1 = '01CqYLDWb4ozXDK5nmAkKCeJ';
const S2 = '01CqYLDWHxR543ejhUCWSnQX';
const YVC = '01CqYLDYvC4PU5V29bhYPPCG';
const claude = (s, model = 'Opus 5.5') => `Co-Authored-By: Claude ${model} <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_${s}`;

/* Un repo en chico: el loop (dos sesiones de Claude) y Copilot trabajan, Benjamin integra, Dependabot sube una versión
   con el CI en rojo, Copilot abre un borrador y Ana tiene una rama sin PR. Las horas son antes de NOW. */
function repo() {
  const c = (sha, parents, author, message, h) => [sha, { sha, parents, author, message, date: NOW - h * H }];
  const ben = { name: 'Benjamin Figueroa Guzman', login: 'bfigueroa99' };
  const cl = { name: 'Claude', login: null };
  const cop = { name: 'Copilot', login: 'Copilot' };
  const commits = new Map([
    c('d0', [], ben, 'Inicio', 30),
    c('r1', ['d0'], cl, `Iteración 146: reclamo · ítem 96 · sesión cse_${YVC}`, 20),
    c('w1', ['r1'], cl, `Resumen de la semana\n\n${claude(S2, 'Sonnet 5.5')}`, 19),
    c('w2', ['w1'], cl, `Bitácora\n\n${claude(S2, 'Sonnet 5.5')}`, 18),
    c('m1', ['d0', 'w2'], ben, 'Resumen de la semana (#193)', 17),
    c('n1', ['m1'], { name: 'Ana Pérez', login: 'ana' }, 'Una idea\n\ncon cuerpo', 6),
    c('a1', ['m1'], cl, `Vista de texto\n\n${claude(S1)}`, 5),
    c('a2', ['a1'], cop, 'Ajuste de Copilot', 4),
    c('m2', ['m1', 'a2'], ben, 'Vista de texto (#200)', 3),
    c('dep1', ['m2'], { name: 'dependabot[bot]', login: 'dependabot[bot]' }, 'Bump vite from 5.0 to 5.1', 2),
    c('c1', ['m2'], cl, `Otra cosa\n\n${claude(S1)}`, 1),
    c('p1', ['m2'], cop, 'Initial plan', 0.5),
  ]);
  const branches = new Map([
    ['dev', { name: 'dev', sha: 'm2', isDefault: true }],
    ['claude/otra', { name: 'claude/otra', sha: 'c1' }],
    ['dependabot/x', { name: 'dependabot/x', sha: 'dep1' }],
    ['copilot/plan', { name: 'copilot/plan', sha: 'p1' }],
    ['ana/idea', { name: 'ana/idea', sha: 'n1' }],
  ]);
  const pulls = new Map([
    [201, { number: 201, title: 'Otra cosa', head: 'claude/otra', base: 'dev', sameRepo: true, draft: false, user: { login: 'claude[bot]' }, createdAt: NOW - 50 * H }],
    [202, { number: 202, title: 'Bump vite', head: 'dependabot/x', base: 'dev', sameRepo: true, draft: false, user: { login: 'dependabot[bot]' }, createdAt: NOW - 50 * H }],
    [203, { number: 203, title: '[WIP] Plan <b>', head: 'copilot/plan', base: 'dev', sameRepo: true, draft: true, user: { login: 'Copilot' }, createdAt: NOW - 50 * H }],
  ]);
  const ci = new Map([
    ['claude/otra', 'success'],
    ['dependabot/x', 'failure'],
    ['copilot/plan', 'pending'],
  ]);
  return { repo: { defaultBranch: 'dev' }, commits, branches, pulls, ci };
}
const acts = [
  { id: 'e1', kind: 'review-ok', actor: { login: 'bfigueroa99' }, number: 201, time: NOW - 0.8 * H },
  { id: 'e2', kind: 'comment', pr: true, actor: { login: 'Copilot' }, number: 201, time: NOW - 0.7 * H },
];
const setup = () => {
  const data = repo();
  return { data, res: compute(data, acts, { max: Infinity }) };
};

test('windowFor y series: la ventana más corta con suficiente actividad, y cada momento en su tramo', () => {
  const recent = Array.from({ length: 9 }, (_, i) => NOW - i * H);
  const w = windowFor(recent, NOW);
  assert.equal(w.span, WINDOWS[0].span);
  assert.equal(w.n, 24);
  assert.equal(w.t1, NOW);
  // poca actividad reciente: se abre a 7 días
  assert.equal(windowFor([NOW - 2 * H, NOW - 3 * 24 * H, NOW - 4 * 24 * H], NOW).span, WINDOWS[1].span);
  // nada en el año: la ventana más larga, sin fallar
  assert.equal(windowFor([], NOW).span, WINDOWS[3].span);
  assert.equal(windowFor([NOW + H], NOW).span, WINDOWS[3].span); // lo del futuro no cuenta
  // cada momento en su tramo; el borde de la ventana, en el último
  const s = series(w, [NOW, NOW - 0.5 * H, NOW - 23.5 * H, NOW - 25 * H, NOW + 1]);
  assert.equal(s.length, 24);
  assert.equal(s[23], 2);
  assert.equal(s[0], 1);
  assert.equal(s.reduce((a, b) => a + b), 3);
});

test('roles y orquestador: lo que más hizo cada uno; quien más integra va al centro', () => {
  const { data, res } = setup();
  const r = roles(res, data);
  const ben = r.get('u:bfigueroa99');
  assert.equal(ben.role, 'integrates');
  assert.equal(ben.counts.writes, 1); // sus merges no cuentan como escribir
  assert.equal(ben.counts.integrates, 4); // las dos sesiones en #193; S1 y Copilot en #200
  assert.equal(ben.counts.reviews, 1);
  assert.equal(r.get('a:copilot').role, 'writes');
  assert.equal(r.get('a:copilot').counts.comments, 1);
  assert.equal(r.get(`a:claude:${S1}`).role, 'writes');
  assert.equal(hub(r), 'u:bfigueroa99');
  assert.equal(hub(r, ['a:copilot', `a:claude:${S1}`]), null); // entre ellos nadie integra
});

test('place: el orquestador al centro, cada uno en el lóbulo de su rol, todos dentro y sin pisarse', () => {
  const { data, res } = setup();
  const r = roles(res, data);
  const net = network(res);
  const keys = net.nodes.map((n) => n.key);
  const pos = place(keys, r, hub(r, keys));
  assert.equal(pos.size, keys.length);
  assert.deepEqual(plain(pos.get('u:bfigueroa99')), [0, 0.04, 0.06]);
  const inside = ([x, y, z]) => Math.hypot(x / SHAPE[0], y / SHAPE[1], z / SHAPE[2]) <= 0.861;
  for (const p of pos.values()) assert.ok(inside(p), `fuera de la corteza: ${p}`);
  const uniq = new Set([...pos.values()].map((p) => p.join(',')));
  assert.equal(uniq.size, pos.size);
  // los que escriben, a los lados: uno en cada hemisferio
  const writers = keys.filter((k) => r.get(k).role === 'writes' && k !== 'u:bfigueroa99').map((k) => pos.get(k)[0]);
  assert.ok(writers[0] > 0 && writers[1] < 0);
  // muchos en el mismo lóbulo tampoco se pisan ni salen
  const many = new Map(Array.from({ length: 20 }, (_, i) => [`k${i}`, { role: 'reviews', counts: {} }]));
  const p2 = place([...many.keys()], many);
  assert.equal(new Set([...p2.values()].map((p) => p.join(','))).size, 20);
  for (const p of p2.values()) assert.ok(inside(p));
});

test('kpis: commits de agentes en la ventana, activos, CI de sus ramas, la cola y los que esperan tu sí', () => {
  const { data, res } = setup();
  const k = kpis(res, data, { now: NOW });
  assert.equal(k.win.span, 24 * H);
  assert.equal(k.commits.n, 8); // r1 w1 w2 a1 a2 dep1 c1 p1
  assert.equal(k.people.n, 3); // m1 n1 m2 (d0 queda fuera de las 24 h)
  assert.equal(k.commits.share, 8 / 11);
  assert.equal(k.commits.series.reduce((a, b) => a + b), 8);
  assert.ok(k.links.n >= 5);
  assert.deepEqual(plain(k.active), { n: 5, total: 6 }); // la app de Claude solo recibe: no está activa
  assert.deepEqual(plain(k.ci), { ok: 1, known: 2 }); // la de copilot/plan sigue corriendo
  assert.equal(k.queue, 3);
  assert.equal(k.waiting, 1); // #201: verde y listo; #202 en rojo y #203 borrador
  assert.equal(k.last.key, 'a:copilot');
  assert.equal(k.last.time, NOW - 0.5 * H);
  // sin datos no falla
  const e = kpis({ actors: [], links: [], events: [], owners: new Map() }, { commits: new Map() }, { now: NOW });
  assert.equal(e.commits.n, 0);
  assert.equal(e.commits.share, null);
  assert.equal(e.ci, null);
  assert.equal(e.last, null);
  assert.equal(kpis(null, null, { now: NOW }).queue, 0);
});

test('ingest: los PRs abiertos y las ramas sin PR, de lo más nuevo a lo más viejo, con a quién le tocó', () => {
  const { data, res } = setup();
  const g = ingest(res, data);
  assert.equal(g.total, 4); // dev no entra
  assert.equal(g.routed, 3);
  assert.deepEqual(
    plain(g.items.map((x) => [x.kind, x.number, x.branch, x.who, x.agent, x.ci, x.waiting])),
    [
      ['draft', 203, 'copilot/plan', 'a:copilot', true, 'pending', false],
      ['pr', 201, 'claude/otra', `a:claude:${S1}`, true, 'success', true],
      ['pr', 202, 'dependabot/x', 'a:dependabot', true, 'failure', false],
      ['branch', null, 'ana/idea', 'u:ana', false, null, false],
    ],
  );
  assert.equal(g.items[3].title, 'Una idea'); // de una rama sin PR, el titular de su cabeza
  assert.equal(ingest(res, data, { max: 2 }).items.length, 2);
  // un PR de un fork (su rama no está) va a su autor, si participa
  data.pulls.set(9, { number: 9, title: 'De un fork', head: 'x', sameRepo: false, user: { login: 'Copilot' }, createdAt: NOW });
  assert.equal(ingest(res, data).items[0].who, 'a:copilot');
});

test('lines: el hilo de un participante y el log de todos los agentes, sin repetir los merges', () => {
  const { data, res } = setup();
  const s1 = lines(res, data, `a:claude:${S1}`);
  assert.deepEqual(
    plain(s1.map((x) => (x.type === 'commit' ? x.sha : `${x.kind}:${x.from}`))),
    ['a1', 'continued:a:copilot', 'merged:u:bfigueroa99', 'c1'],
  );
  assert.equal(s1[0].text, 'Vista de texto'); // solo la primera línea
  // los merges de Benjamin salen como «fusionó», no también como commit
  const ben = lines(res, data, 'u:bfigueroa99');
  assert.deepEqual(plain(ben.filter((x) => x.type === 'commit').map((x) => x.sha)), ['d0']);
  assert.ok(ben.some((x) => x.kind === 'merged' && x.number === 200));
  // el log: solo agentes, de lo más viejo a lo más nuevo, hasta max
  const log = lines(res, data, null, { max: 5 });
  assert.equal(log.length, 5);
  assert.equal(log[log.length - 1].sha, 'p1');
  for (let i = 1; i < log.length; i++) assert.ok(log[i - 1].time <= log[i].time);
  assert.ok(!lines(res, data, null).some((x) => x.type === 'commit' && x.sha === 'n1')); // Ana no es un agente
});

test('perAgent: los agentes con más commits, hasta max', () => {
  const { res } = setup();
  const p = perAgent(res, { max: 3 });
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.key.startsWith('a:')));
  assert.ok(p[0].commits >= p[1].commits && p[1].commits >= p[2].commits);
});

test('spark y rate: SVG sin NaN, con la serie entera y los textos escapados', () => {
  const s = spark([0, 2, 5, 1]);
  assert.match(s, /^<svg class="sw-spark"/);
  assert.ok(!/NaN|undefined/.test(s));
  assert.ok(!/NaN/.test(spark([])) && !/NaN/.test(spark([3])));
  const { data, res } = setup();
  const k = kpis(res, data, { now: NOW });
  const svg = rate(k, { aria: 'Ritmo <b>', start: 'a&b', end: '"z"' });
  assert.ok(svg.includes('aria-label="Ritmo &lt;b&gt;"'));
  assert.ok(svg.includes('a&amp;b') && svg.includes('&quot;z&quot;'));
  assert.ok(!/NaN|undefined/.test(svg));
  assert.equal((svg.match(/class="sw-rate-[lp]"/g) || []).length, 2);
});

test('cloud: la misma nube cada vez, con la corteza dentro de su forma', () => {
  const a = cloud(3000, 7);
  const b = cloud(3000, 7);
  assert.equal(a.length, 9000);
  assert.deepEqual([...a.slice(0, 30)], [...b.slice(0, 30)]);
  assert.notDeepEqual([...cloud(3000, 8).slice(0, 30)], [...a.slice(0, 30)]);
  let inside = 0;
  for (let i = 0; i < 3000; i++) {
    const [x, y, z] = [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (Math.hypot(x / SHAPE[0], y / SHAPE[1], z / SHAPE[2]) <= 1.001) inside++;
  }
  assert.ok(inside / 3000 > 0.8, `solo ${inside} de 3000 dentro`);
});
