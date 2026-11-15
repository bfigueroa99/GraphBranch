#!/usr/bin/env node
/* Pruebas de js/agents.js: quién es un agente (y qué sesión) y quién trabaja con quién, con datos fijos.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/agents.test.mjs       solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });
const { detect, detectActor, of, coAuthors, sessionOf, compute, network, overlay, svg, timeline, timelineSvg, slots, mono, mainKind, openParam, graphParam, prNumber, sessionUrl, shortSession, COLORS, OTHERS } = ctx.window.GB.agents;
const plain = (x) => JSON.parse(JSON.stringify(x));

const S1 = '01CqYLDWb4ozXDK5nmAkKCeJ';
const S2 = '01CqYLDWHxR543ejhUCWSnQX';
const claude = (s, model = 'Opus 5.5') => `Co-Authored-By: Claude ${model} <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_${s}`;

test('un commit de Claude Code: el agente, su modelo y su sesión salen de los trailers', () => {
  const a = detect({ name: 'Claude' }, `Vista de texto: ramas quietas\n\n${claude(S1)}`);
  assert.deepEqual(plain(a), { id: 'claude', name: 'Claude Code', bot: false, model: 'Opus 5.5', session: S1 });
  // la persona firma y Claude es co-autor: lo escribió el agente
  const b = detect({ name: 'Ana Pérez', login: 'ana' }, `Arreglo\n\nCo-authored-by: Claude <noreply@anthropic.com>`);
  assert.equal(b.id, 'claude');
  assert.equal(b.model, null);
  assert.equal(b.session, null);
  // un reclamo del loop: solo «sesión cse_…» en el titular
  assert.equal(detect({ name: 'Claude' }, `Iteración 148: reclamo 2026-10-28 · ítem 97 · sesión cse_${S2}`).session, S2);
  // «Generated with [Claude Code]» sin co-autor
  assert.equal(detect({ name: 'Ana' }, 'Algo\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)').id, 'claude');
});

test('las personas no son agentes, aunque se llamen como uno', () => {
  assert.equal(detect({ name: 'Benjamin Figueroa', login: 'bfigueroa99' }, 'Release: promover dev a master (#198)'), null);
  assert.equal(detect({ name: 'Claude Dupont', login: 'cdupont' }, 'Fix'), null);
  // «Claude» con un correo propio que no es de Anthropic
  assert.equal(detect({ name: 'Claude', email: 'claude@ejemplo.cl' }, 'Fix'), null);
  assert.equal(detect({ name: 'Claude', email: 'noreply@anthropic.com' }, 'Fix').id, 'claude');
  // un co-autor humano no cambia nada
  assert.equal(detect({ name: 'Ana' }, 'Fix\n\nCo-authored-by: Pedro Soto <pedro@ejemplo.cl>'), null);
});

test('otros agentes y bots, por cuenta, por nombre o por co-autor', () => {
  assert.equal(detect({ name: 'Copilot', login: 'Copilot' }, 'Initial plan').id, 'copilot');
  assert.equal(detect({ name: 'x', login: 'copilot-swe-agent[bot]' }, 'Plan').id, 'copilot');
  assert.equal(detect({ name: 'Ana' }, 'Fix\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>').id, 'copilot');
  assert.equal(detect({ name: 'Cursor Agent', email: 'cursoragent@cursor.com' }, 'Fix').id, 'cursor');
  assert.equal(detect({ name: 'x', login: 'chatgpt-codex-connector[bot]' }, 'Fix').id, 'codex');
  assert.equal(detect({ name: 'x', login: 'devin-ai-integration[bot]' }, 'Fix').id, 'devin');
  assert.equal(detect({ name: 'x', login: 'google-labs-jules[bot]' }, 'Fix').id, 'jules');
  assert.equal(detect({ name: 'Ana López (aider)' }, 'Fix').id, 'aider');
  const aider = detect({ name: 'Ana' }, 'Fix\n\nCo-authored-by: aider (anthropic/claude-sonnet) <noreply@aider.chat>');
  assert.equal(aider.id, 'aider');
  assert.equal(aider.model, 'anthropic/claude-sonnet');
  assert.equal(detect({ name: 'Ana' }, 'Fix\n\nCo-Authored-By: opencode <noreply@opencode.ai>').id, 'opencode');
  const dep = detect({ name: 'dependabot[bot]', login: 'dependabot[bot]' }, 'Bump vite from 5.0 to 5.1');
  assert.equal(dep.id, 'dependabot');
  assert.equal(dep.bot, true);
  // un bot que no está en la lista: su login, sin el sufijo
  const other = detect({ name: 'x', login: 'mi-robot[bot]' }, 'chore');
  assert.deepEqual(plain(other), { id: 'bot:mi-robot', name: 'mi-robot', bot: true, model: null, session: null });
  // en la actividad solo hay login
  assert.equal(detectActor({ login: 'Copilot' }).id, 'copilot');
  assert.equal(detectActor({ login: 'claude[bot]' }).id, 'claude');
  assert.equal(detectActor({ login: 'bfigueroa99' }), null);
});

test('sesiones, co-autores y números de PR', () => {
  assert.equal(sessionOf(`x\n\nClaude-Session: https://claude.ai/code/session_${S1}`), S1);
  assert.equal(sessionOf('x\n\nAgent-Session: abc12345'), 'abc12345');
  assert.equal(sessionOf('x\n\nOpencode-Session: https://opencode.ai/s/ses_Zx81aa/'), 'ses_Zx81aa');
  assert.equal(sessionOf('session cse_ABCDEF123'), 'ABCDEF123');
  assert.equal(sessionOf('sin sesión'), null);
  // lo que no es un id no pasa (ni comillas ni etiquetas)
  assert.equal(sessionOf('Agent-Session: <img src=x>'), null);
  assert.deepEqual(plain(coAuthors('a\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nco-authored-by: Ana <a@b.c>')), [
    { name: 'Claude Opus 5.5', email: 'noreply@anthropic.com' },
    { name: 'Ana', email: 'a@b.c' },
  ]);
  assert.equal(prNumber('Merge pull request #31 from acme/fix'), 31);
  assert.equal(prNumber('Iteración 148 · Público: ramas quietas (#195)'), 195);
  assert.equal(prNumber("Merge branch 'feat' into 'main'\n\nSee merge request grupo/proyecto!12"), 12);
  assert.equal(prNumber('Merge branch dev into feat'), null);
  assert.equal(sessionUrl({ id: 'claude', session: S1 }), `https://claude.ai/code/session_${S1}`);
  assert.equal(sessionUrl({ id: 'copilot', session: 'abc12345' }), null);
  assert.equal(sessionUrl({ id: 'claude', session: 'a"b' }), null);
  assert.equal(shortSession(S1), 'nAkKCeJ'.slice(-6));
  assert.equal(openParam(new URLSearchParams('agents=1')), true);
  assert.equal(openParam(new URLSearchParams('agents')), true);
  assert.equal(openParam(new URLSearchParams('agents=0')), false);
  assert.equal(openParam(new URLSearchParams('repo=a/b')), false);
  assert.equal(graphParam(new URLSearchParams('interactions=1')), true);
  assert.equal(graphParam(new URLSearchParams('interactions')), true);
  assert.equal(graphParam(new URLSearchParams('interactions=off')), false);
  assert.equal(graphParam(new URLSearchParams('agents=1')), null); // sin el parámetro manda lo guardado
});

test('of: lo que dejó la fuente manda, y si no, se calcula una vez sin ensuciar el commit', () => {
  const c = { sha: 'a', parents: [], author: { name: 'Claude' }, message: `x\n\n${claude(S1)}` };
  assert.equal(of(c).session, S1);
  assert.deepEqual(Object.keys(c), ['sha', 'parents', 'author', 'message']); // no enumerable: JSON y copias no cambian
  assert.equal(of({ author: { name: 'Claude' }, message: 'solo el titular', agent: null }), null);
});

/* El historial de este mismo repo, en chico: dos sesiones de Claude en una rama del loop, un merge de Benjamin, y un PR
   revisado y fusionado. */
function repo() {
  const HOUR = 36e5;
  const T = Date.UTC(2026, 9, 28, 12);
  const c = (sha, parents, author, message, h) => [sha, { sha, parents, author, message, date: T + h * HOUR }];
  const ben = { name: 'Benjamin Figueroa Guzman', login: 'bfigueroa99' };
  const cl = { name: 'Claude', login: null };
  const commits = new Map([
    c('d0', [], ben, 'Inicio', 0),
    // loop/146: la sesión YvC reclama y la sesión WHx hace el trabajo
    c('r1', ['d0'], cl, 'Iteración 146: reclamo · ítem 96 · sesión cse_01CqYLDYvC4PU5V29bhYPPCG', 1),
    c('w1', ['r1'], cl, `Resumen de la semana: commits por día\n\n${claude(S2, 'Sonnet 5.5')}`, 2),
    c('w2', ['w1'], cl, `Bitácora\n\n${claude(S2, 'Sonnet 5.5')}`, 3),
    // dev avanza mientras tanto y Benjamin fusiona la rama
    c('d1', ['d0'], ben, 'Otro cambio en dev', 1.5),
    c('m1', ['d1', 'w2'], ben, 'Iteración 146 · Salidas: commits por día (#193)', 4),
    // una rama de Claude S1 que Copilot continúa
    c('a1', ['m1'], cl, `Vista de texto\n\n${claude(S1)}`, 5),
    c('a2', ['a1'], { name: 'Copilot', login: 'Copilot' }, 'Ajuste de Copilot', 6),
    c('b1', ['m1'], ben, 'Algo en dev', 5.5),
  ]);
  const branches = new Map([
    ['dev', { name: 'dev', sha: 'b1', isDefault: true }],
    ['claude/vista', { name: 'claude/vista', sha: 'a2' }],
  ]);
  const pulls = new Map([[200, { number: 200, title: 'Vista', head: 'claude/vista', base: 'dev', sameRepo: true, user: { login: 'claude[bot]' } }]]);
  return { repo: { defaultBranch: 'dev' }, commits, branches, pulls };
}

test('compute: quién continuó, fusionó y revisó el trabajo de quién, también entre agentes', () => {
  const T = Date.UTC(2026, 9, 28, 20);
  const acts = [
    { id: 'e1', kind: 'review-changes', actor: { login: 'Copilot' }, number: 200, time: T },
    { id: 'e2', kind: 'review-ok', actor: { login: 'bfigueroa99' }, number: 200, time: T + 1 },
    { id: 'e2', kind: 'review-ok', actor: { login: 'bfigueroa99' }, number: 200, time: T + 1 }, // repetida: cuenta una vez
    { id: 'e3', kind: 'comment', pr: true, actor: { login: 'Copilot' }, number: 200, time: T + 2 },
    { id: 'e4', kind: 'comment', actor: { login: 'Copilot' }, number: 200, time: T + 3 }, // de un issue: no cuenta
    { id: 'e5', kind: 'review', request: true, actor: { login: 'bfigueroa99' }, number: 200, time: T + 4 }, // pedir revisión no es revisar
    { id: 'e6', kind: 'pr-merge', actor: { login: 'bfigueroa99' }, number: 193, time: T + 5 }, // ya contado por su commit de merge
    { id: 'e7', kind: 'pr-merge', actor: { login: 'bfigueroa99' }, number: 150, time: T + 6 }, // sin autor conocido: no cuenta
  ];
  const r = compute(repo(), acts);
  const k = (key) => r.actors.find((a) => a.key === key);
  const s1 = `a:claude:${S1}`;
  const s2 = `a:claude:${S2}`;
  const yvc = 'a:claude:01CqYLDYvC4PU5V29bhYPPCG';
  assert.equal(k(s2).commits, 2);
  assert.equal(k(s2).agent.model, 'Sonnet 5.5');
  assert.equal(k(yvc).agent.session, '01CqYLDYvC4PU5V29bhYPPCG');
  assert.equal(k('u:bfigueroa99').agent, null);
  assert.equal(k('a:copilot').agent.id, 'copilot');
  const link = (from, to) => r.links.find((l) => l.from === from && l.to === to)?.kinds;
  // entre agentes: la sesión WHx continuó el reclamo de la sesión YvC, y Copilot la rama de la sesión S1
  assert.equal(link(s2, yvc).continued, 1);
  assert.equal(link('a:copilot', s1).continued, 1);
  // Benjamin fusionó el trabajo de las dos sesiones en el PR #193 (una vez cada una, aunque fueran dos commits)
  assert.equal(link('u:bfigueroa99', s2).merged, 1);
  assert.equal(link('u:bfigueroa99', yvc).merged, 1);
  // no fusionó lo suyo ni lo que ya estaba en dev
  assert.equal(link('u:bfigueroa99', 'u:bfigueroa99'), undefined);
  // revisiones y comentarios sobre el PR #200, abierto por la app de Claude
  assert.equal(link('a:copilot', 'a:claude').reviewed, 1);
  assert.equal(link('a:copilot', 'a:claude').commented, 1);
  assert.equal(link('u:bfigueroa99', 'a:claude').reviewed, 1);
  assert.equal(r.total, 7); // 2 continuó, 2 fusionó, 2 revisó, 1 comentó
  assert.equal(r.events[0].kind, 'commented'); // lo más reciente primero
  assert.equal(r.events.find((e) => e.kind === 'merged').number, 193);
  // la red solo entre agentes deja fuera a Benjamin
  const net = network(r, { onlyAgents: true });
  assert.ok(net.nodes.every((n) => n.agent));
  assert.ok(net.links.every((l) => l.from.startsWith('a:') && l.to.startsWith('a:')));
  assert.equal(net.links.length, 3); // WHx→YvC, Copilot→S1 y Copilot→la app de Claude
  const all = network(r, { limit: 2 });
  assert.equal(all.nodes.length, 2);
  assert.ok(all.links.every((l) => all.nodes.some((n) => n.key === l.from) && all.nodes.some((n) => n.key === l.to)));
});

test('overlay: de qué commit a qué commit va cada interacción en el grafo, con un color por agente', () => {
  const T = Date.UTC(2026, 9, 28, 20);
  const acts = [
    { id: 'e1', kind: 'review-changes', actor: { login: 'Copilot' }, number: 200, time: T },
    { id: 'e2', kind: 'review-ok', actor: { login: 'bfigueroa99' }, number: 200, time: T + 1 },
    { id: 'e3', kind: 'comment', pr: true, actor: { login: 'Copilot' }, number: 200, time: T + 2 },
    { id: 'e3b', kind: 'comment', pr: true, actor: { login: 'Copilot' }, number: 200, time: T + 3 }, // otro comentario: la misma insignia, dos veces
    // el PR #193 ya se fusionó y su rama no está: su revisión va sobre el commit de merge
    { id: 'e4', kind: 'pr-open', actor: { login: 'claude[bot]' }, number: 193, branch: 'loop/146', time: T - 9e6 },
    { id: 'e5', kind: 'review-ok', actor: { login: 'Copilot' }, number: 193, time: T - 8e6 },
  ];
  const r = compute(repo(), acts, { max: Infinity });
  const s1 = `a:claude:${S1}`;
  const s2 = `a:claude:${S2}`;
  const yvc = 'a:claude:01CqYLDYvC4PU5V29bhYPPCG';
  // el commit de quien recibe: el anterior, el más nuevo suyo en la rama fusionada o la punta del PR
  const ev = (kind, from, to) => plain(r.events.filter((e) => e.kind === kind && e.from === from && e.to === to).map((e) => [e.sha, e.target]));
  assert.deepEqual(ev('continued', s2, yvc), [['w1', 'r1']]);
  assert.deepEqual(ev('continued', 'a:copilot', s1), [['a2', 'a1']]);
  assert.deepEqual(ev('merged', 'u:bfigueroa99', s2), [['m1', 'w2']]);
  assert.deepEqual(ev('merged', 'u:bfigueroa99', yvc), [['m1', 'r1']]);
  assert.deepEqual(ev('reviewed', 'a:copilot', 'a:claude').map(([, t]) => t).sort(), ['a2', 'm1']);
  assert.equal(r.owners.get('w1'), s2);
  assert.equal(r.owners.get('m1'), 'u:bfigueroa99');

  const ov = overlay(r);
  const arc = (a, b) => ov.arcs.find((x) => x.a === a && x.b === b);
  assert.equal(ov.arcs.length, 4);
  assert.equal(arc('w1', 'r1').kind, 'continued');
  assert.equal(arc('m1', 'w2').kind, 'merged');
  assert.equal(arc('m1', 'r1').kind, 'merged');
  assert.equal(arc('a2', 'a1').from, 'a:copilot');
  const pin = (at, kind, from) => ov.pins.find((x) => x.at === at && x.kind === kind && x.from === from);
  assert.equal(pin('a2', 'commented', 'a:copilot').n, 2);
  assert.equal(pin('a2', 'reviewed', 'u:bfigueroa99').agent, false);
  assert.equal(pin('m1', 'reviewed', 'a:copilot').number, 193);
  assert.equal(ov.pins.length, 4);
  assert.equal(ov.total, 4 + 5);
  // las marcas: cada commit de agente, con el color de su participante; las personas, sin color y sin marca
  assert.deepEqual(plain([...ov.marks.keys()].sort()), ['a1', 'a2', 'r1', 'w1', 'w2']);
  const slot = (key) => ov.actors.find((a) => a.key === key)?.slot;
  assert.equal(slot('u:bfigueroa99'), 0);
  assert.equal(ov.marks.get('w1'), slot(s2));
  assert.equal(ov.arcs.find((x) => x.from === 'u:bfigueroa99').slot, 0);
  const agentSlots = ov.actors.filter((a) => a.agent).map((a) => a.slot);
  assert.equal(new Set(agentSlots).size, agentSlots.length, 'con menos de ocho agentes, cada uno con su color');
  assert.ok(agentSlots.every((x) => x >= 1 && x <= COLORS));
  assert.equal(ov.actors[0].n >= ov.actors[ov.actors.length - 1].n, true); // el de más interacciones primero
  // la app de Claude no tiene commits pero recibe las revisiones: está, con su color
  assert.ok(slot('a:claude') >= 1);

  // solo entre agentes: sin los merges ni la revisión de Benjamin, y los commits de agente siguen marcados
  const only = overlay(r, { onlyAgents: true });
  assert.deepEqual(plain(only.arcs.map((x) => x.a + '>' + x.b).sort()), ['a2>a1', 'w1>r1']);
  assert.ok(only.pins.every((x) => x.from === 'a:copilot'));
  assert.equal(only.marks.size, 5);
  assert.equal(only.actors.some((a) => !a.agent), false);
  // el color sigue al participante: dejar fuera a las personas no repinta a ningún agente
  for (const a of only.actors) assert.equal(a.slot, slot(a.key), a.key);
  // el tope deja los más recientes
  const few = overlay(r, { arcs: 1, pins: 1 });
  assert.deepEqual(plain(few.arcs.map((x) => x.a)), ['a2']);
  assert.deepEqual(plain(few.pins.map((x) => x.kind + ':' + x.n)), ['commented:2']);
});

test('overlay: desde el octavo agente van juntos como «otros agentes», y sin compute completo no falla', () => {
  const commits = new Map();
  let prev = null;
  for (let i = 0; i < 11; i++) {
    const sha = 'c' + i;
    commits.set(sha, { sha, parents: prev ? [prev] : [], author: { name: 'Claude' }, message: `Paso ${i}\n\n${claude('Sesion' + String(i).padStart(4, '0'))}`, date: i });
    prev = sha;
  }
  const ov = overlay(compute({ commits, pulls: new Map() }, [], { max: Infinity }));
  assert.equal(ov.actors.length, 11);
  assert.equal(ov.arcs.length, 10); // cada sesión continuó la anterior
  const slots = ov.actors.map((a) => a.slot);
  assert.deepEqual(plain([...new Set(slots)].sort((a, b) => a - b)), [1, 2, 3, 4, 5, 6, 7, OTHERS]);
  assert.equal(slots.filter((x) => x === OTHERS).length, 11 - COLORS); // ningún color se repite entre dos agentes
  assert.equal(ov.marks.size, 11);
  // entre dos personas no se dibuja nada: eso queda en el panel
  const people = new Map([
    ['p1', { sha: 'p1', parents: [], author: { name: 'Ana', login: 'ana' }, message: 'Inicio', date: 1 }],
    ['p2', { sha: 'p2', parents: ['p1'], author: { name: 'Beto', login: 'beto' }, message: 'Sigue', date: 2 }],
  ]);
  const pr = compute({ commits: people, pulls: new Map() }, [], { max: Infinity });
  assert.equal(pr.total, 1);
  assert.equal(overlay(pr).arcs.length, 0);
  assert.equal(overlay(pr).actors.length, 0);
  // un resultado sin `owners` (de antes) da las mismas líneas y ninguna marca
  const r = compute({ commits, pulls: new Map() }, [], { max: Infinity });
  delete r.owners;
  assert.equal(overlay(r).marks.size, 0);
});

test('compute: sin commits ni actividad no falla', () => {
  const r = compute({ commits: new Map(), branches: new Map(), pulls: new Map() }, []);
  assert.deepEqual(plain(r), { actors: [], links: [], events: [], total: 0, owners: {} });
  const ov = overlay(r);
  assert.deepEqual(plain({ ...ov, marks: [...ov.marks] }), { actors: [], marks: [], arcs: [], pins: [], total: 0 });
  assert.deepEqual(plain(network(r).nodes), []);
});

test('compute: un merge de agente sin sesión, entre commits de una sesión, es de esa sesión', () => {
  const c = (sha, parents, name, message, date) => [sha, { sha, parents, author: { name, login: name === 'Ana' ? 'ana' : null }, message, date }];
  const commits = new Map([
    c('d0', [], 'Ana', 'Inicio', 1),
    c('d1', ['d0'], 'Ana', 'En dev', 2),
    c('s1', ['d0'], 'Claude', `Primero\n\n${claude(S1)}`, 3),
    c('mm', ['s1', 'd1'], 'Claude', "Merge remote-tracking branch 'origin/dev' into claude/x", 4),
    c('s2', ['mm'], 'Claude', `Después\n\n${claude(S1)}`, 5),
  ]);
  const r = compute({ commits, pulls: new Map() }, []);
  assert.equal(r.actors.some((a) => a.key === 'a:claude'), false); // no queda un «Claude» sin sesión
  const s = r.actors.find((a) => a.key === `a:claude:${S1}`);
  assert.equal(s.commits, 3);
  // la sesión trajo el trabajo de Ana al fusionar dev en su rama
  assert.equal(r.links.find((l) => l.from === `a:claude:${S1}` && l.to === 'u:ana').kinds.merged, 1);
});

test('svg: un nodo por participante (agentes cuadrados, personas círculos), una curva por vínculo y todo escapado', () => {
  const r = compute(repo(), []);
  const net = network(r);
  const out = svg(net, {
    label: (n) => (n.key === 'u:bfigueroa99' ? '<b>Benjamin</b>' : n.name),
    sub: (n) => n.agent?.session || '',
    title: (l) => `${l.from} → ${l.to}: ${l.total}`,
    aria: 'Red "de" prueba',
  });
  assert.match(out, /^<svg class="ag-net"[^>]* role="group" aria-label="Red &quot;de&quot; prueba">/);
  assert.equal((out.match(/<rect class="ag-node ag-agent ag-s\d"/g) || []).length, net.nodes.filter((n) => n.agent).length);
  assert.equal((out.match(/<circle class="ag-node ag-person ag-s0"/g) || []).length, net.nodes.filter((n) => !n.agent).length);
  assert.equal((out.match(/<path class="ag-edge/g) || []).length, net.links.length);
  assert.ok(out.includes('ag-edge ag-edge-agents'), 'el vínculo entre dos agentes se distingue');
  assert.ok(!out.includes('<b>'), 'los nombres se escapan');
  assert.ok(out.includes('&lt;b&gt;Benjamin&lt;/b&gt;'));
  assert.doesNotMatch(out, /NaN|undefined/);
  // un solo participante, al centro y sin vínculos
  const one = svg({ nodes: [net.nodes[0]], links: [], weight: net.weight }, { label: () => 'x', sub: () => '', title: () => '', aria: 'a' });
  assert.doesNotMatch(one, /NaN|undefined/);
});

test('slots: cada participante tiene el mismo color en el grafo, la red y la línea de tiempo', () => {
  const r = compute(repo(), []);
  const slot = slots(r);
  const ov = overlay(r);
  for (const a of ov.actors) assert.equal(a.slot, slot.get(a.key), a.key);
  const net = network(r);
  for (const n of net.nodes) assert.equal(net.slot.get(n.key), slot.get(n.key), n.key);
  // las personas, en gris; los agentes, de 1 a 8 sin repetirse entre los siete primeros
  for (const a of r.actors) assert.equal(slot.get(a.key) === 0, !a.agent, a.key);
  const firsts = r.actors.filter((a) => a.agent).slice(0, COLORS).map((a) => slot.get(a.key));
  assert.equal(new Set(firsts).size, firsts.length);
  assert.equal(slots(null).size, 0);
});

test('svg: cada vínculo con su color, su punta, sus veces y el trazo de lo que más hizo; cada participante es un botón', () => {
  const r = compute(repo(), []);
  const net = network(r);
  const out = svg(net, { label: (n) => n.name, sub: () => '', title: () => 't', node: (n) => `nodo ${n.name}`, aria: 'red 1' });
  assert.equal((out.match(/<path class="ag-ehead /g) || []).length, net.links.length, 'una punta por vínculo');
  assert.equal((out.match(/<g class="ag-n[^"]*" data-key="/g) || []).length, net.nodes.length);
  assert.match(out, /tabindex="0" role="button" aria-pressed="false" aria-label="nodo /);
  for (const l of net.links) {
    assert.ok(out.includes(`data-from="${l.from}" data-to="${l.to}" data-n="${l.total}"`), 'el vínculo dice entre quiénes y cuántas veces');
    assert.ok(out.includes(`ag-s${net.slot.get(l.from)} ag-k-${mainKind(l.kinds)}`), 'del color de quien actúa y con el trazo de lo que más hizo');
  }
  const twice = net.links.find((l) => l.total > 1);
  if (twice) assert.ok(out.includes(`>×${twice.total}</text>`), 'las veces, junto a la curva');
  // con alguien elegido: él y sus vecinos encendidos
  const key = net.nodes[0].key;
  const sel = svg(net, { label: (n) => n.name, sub: () => '', title: () => 't', aria: 'a' }, { sel: key });
  assert.match(sel, /^<svg class="ag-net has-sel"/);
  assert.ok(sel.includes(`<g class="ag-n on sel" data-key="${key}" tabindex="0" role="button" aria-pressed="true"`));
  assert.doesNotMatch(sel, /NaN|undefined/);
});

test('mono y mainKind: la inicial de cada uno y lo que más hizo un vínculo', () => {
  assert.equal(mono({ agent: { name: 'Claude Code' } }), 'C');
  assert.equal(mono({ name: 'Matías Soto' }), 'MS');
  assert.equal(mono({ login: 'ana' }), 'A');
  assert.equal(mono({ name: 'Ñandú Ávila' }), 'ÑÁ');
  assert.equal(mono({}), '?');
  assert.equal(mainKind({ continued: 1, merged: 3 }), 'merged');
  assert.equal(mainKind({ reviewed: 2, commented: 2 }), 'reviewed'); // a igualdad, en el orden de siempre
  assert.equal(mainKind({}), 'continued');
});

test('timeline: una fila por participante (los agentes primero) y cada interacción de la más vieja a la más nueva', () => {
  const T = Date.UTC(2026, 9, 28, 20);
  const acts = [
    { id: 'e1', kind: 'review-changes', actor: { login: 'Copilot' }, number: 200, time: T },
    { id: 'e3', kind: 'comment', pr: true, actor: { login: 'Copilot' }, number: 200, time: T + 2 },
  ];
  const r = compute(repo(), acts, { max: Infinity });
  const tl = timeline(r);
  assert.ok(tl.lanes.length >= 3);
  const firstPerson = tl.lanes.findIndex((l) => !l.agent);
  if (firstPerson >= 0) assert.ok(tl.lanes.slice(firstPerson).every((l) => !l.agent), 'los agentes, arriba');
  for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i].time >= tl.events[i - 1].time);
  assert.equal(tl.t0, tl.events[0].time);
  assert.equal(tl.t1, tl.events.at(-1).time);
  const keys = new Set(tl.lanes.map((l) => l.key));
  assert.ok(tl.events.every((e) => keys.has(e.from) && keys.has(e.to)));
  // solo entre agentes: ninguna persona; con pocas filas, solo lo que cabe en ellas
  assert.ok(timeline(r, { onlyAgents: true }).lanes.every((l) => l.agent));
  const two = timeline(r, { lanes: 2 });
  assert.equal(two.lanes.length, 2);
  assert.ok(two.events.every((e) => two.lanes.some((l) => l.key === e.from) && two.lanes.some((l) => l.key === e.to)));
  assert.equal(timeline(compute({ commits: new Map() }, [])), null, 'sin interacciones, nada que dibujar');
});

test('timelineSvg: un trazo por interacción, con su punto, su punta, su commit y su id; todo escapado', () => {
  const r = compute(repo(), [], { max: Infinity });
  const tl = timeline(r);
  const out = timelineSvg(tl, { label: (l) => `<i>${l.name}</i>`, event: (e) => `${e.kind}`, id: (e) => `id-${e.time}`, tick: (t) => `t${t}`, aria: 'tiempo "x"' });
  assert.match(out, /^<svg class="ag-time" viewBox="0 0 760 \d+" role="img" aria-label="tiempo &quot;x&quot;">/);
  assert.equal((out.match(/<g class="ag-ev /g) || []).length, tl.events.length);
  assert.equal((out.match(/class="ag-ev-tip"/g) || []).length, tl.events.length);
  assert.equal((out.match(/<g class="ag-lane[^"]*" data-key=/g) || []).length, tl.lanes.length);
  assert.ok(out.includes(' data-ev="id-'));
  assert.ok(!out.includes('<i>'), 'los nombres se escapan');
  assert.match(out, /class="ag-axis"/);
  // con alguien elegido: lo suyo encendido, lo demás tenue
  const sel = timelineSvg(tl, { label: (l) => l.name, event: () => '', tick: () => '', aria: 'a' }, { sel: tl.lanes[0].key });
  assert.match(sel, /^<svg class="ag-time has-sel"/);
  assert.match(sel, / on"| off"/);
  // todas en el mismo instante: al medio, sin dividir por cero
  const one = timelineSvg({ ...tl, events: tl.events.slice(0, 1), t0: tl.events[0].time, t1: tl.events[0].time }, { label: () => 'x', event: () => '', tick: () => 't', aria: 'a' });
  assert.doesNotMatch(one, /NaN|undefined|Infinity/);
});
