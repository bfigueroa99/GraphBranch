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
const { detect, detectActor, of, coAuthors, sessionOf, compute, network, svg, openParam, prNumber, sessionUrl, shortSession } = ctx.window.GB.agents;
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

test('compute: sin commits ni actividad no falla', () => {
  const r = compute({ commits: new Map(), branches: new Map(), pulls: new Map() }, []);
  assert.deepEqual(plain(r), { actors: [], links: [], events: [], total: 0 });
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
  assert.match(out, /^<svg class="ag-net"[^>]* role="img" aria-label="Red &quot;de&quot; prueba">/);
  assert.equal((out.match(/<rect class="ag-node ag-agent"/g) || []).length, net.nodes.filter((n) => n.agent).length);
  assert.equal((out.match(/<circle class="ag-node ag-person"/g) || []).length, net.nodes.filter((n) => !n.agent).length);
  assert.equal((out.match(/<path class="ag-edge/g) || []).length, net.links.length);
  assert.ok(out.includes('ag-edge ag-edge-agents'), 'el vínculo entre dos agentes se distingue');
  assert.ok(!out.includes('<b>'), 'los nombres se escapan');
  assert.ok(out.includes('&lt;b&gt;Benjamin&lt;/b&gt;'));
  assert.doesNotMatch(out, /NaN|undefined/);
  // un solo participante, al centro y sin vínculos
  const one = svg({ nodes: [net.nodes[0]], links: [], weight: net.weight }, { label: () => 'x', sub: () => '', title: () => '', aria: 'a' });
  assert.doesNotMatch(one, /NaN|undefined/);
});
