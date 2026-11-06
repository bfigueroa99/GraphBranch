#!/usr/bin/env node
/* Pruebas de js/spend.js: las consultas de gasto de cada servicio de IA, cómo se leen sus respuestas (con la forma que
   documenta cada uno) y qué pasa cuando fallan. Sin red: el fetch es un doble.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/spend.test.mjs        solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const spend = require('../js/spend.js');
const { request, parse, merge, collect, demo, combine, agentOf, baseUrl, SERVICES, PERIODS } = spend;

const NOW = Date.UTC(2026, 10, 6, 15, 30);
const DAY = 864e5;

test('cada servicio, su consulta: la clave solo va en su cabecera y a su propia API', () => {
  const a = request('anthropic', { key: 'sk-ant-admin01-x', days: 7, now: NOW });
  const u = new URL(a.url);
  assert.equal(u.origin + u.pathname, 'https://api.anthropic.com/v1/organizations/cost_report');
  assert.equal(u.searchParams.get('starting_at'), '2026-10-31T00:00:00.000Z', 'siete días contando hoy, desde el inicio del primero (UTC)');
  assert.equal(u.searchParams.get('ending_at'), '2026-11-07T00:00:00.000Z');
  assert.equal(u.searchParams.get('bucket_width'), '1d');
  assert.equal(u.searchParams.get('group_by[]'), 'description');
  assert.equal(a.headers['x-api-key'], 'sk-ant-admin01-x');
  assert.ok(a.headers['anthropic-version']);
  assert.equal(a.headers['anthropic-dangerous-direct-browser-access'], undefined, 'solo la página lo pide');
  assert.equal(request('anthropic', { key: 'k', browser: true, now: NOW }).headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(!a.url.includes('sk-ant'), 'la clave nunca va en la dirección');

  const o = new URL(request('openai', { key: 'sk-admin-y', days: 30, now: NOW, page: 'p2' }).url);
  assert.equal(o.origin + o.pathname, 'https://api.openai.com/v1/organization/costs');
  assert.equal(Number(o.searchParams.get('start_time')), Date.UTC(2026, 9, 8) / 1000);
  assert.equal(o.searchParams.get('group_by'), 'line_item');
  assert.equal(o.searchParams.get('page'), 'p2');
  assert.equal(request('openai', { key: 'sk-admin-y' }).headers.Authorization, 'Bearer sk-admin-y');

  assert.deepEqual(request('openrouter', { key: 'sk-or-v1-z' }), { url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: 'Bearer sk-or-v1-z' } });

  const m = request('omniroute', { url: 'http://localhost:20128/', key: 'sk-m', days: 7 });
  assert.equal(m.url, 'http://localhost:20128/api/usage/analytics?range=7d');
  assert.equal(m.headers.Authorization, 'Bearer sk-m');
  assert.deepEqual(request('omniroute', { url: '' }).headers, {}, 'sin clave: OmniRoute local sin login');
  assert.equal(request('omniroute', { url: '' }).url, 'http://localhost:20128/api/usage/analytics?range=30d');
  assert.throws(() => request('omniroute', { url: 'file:///etc/passwd' }), /dirección/);
  assert.throws(() => request('otro', {}), /desconocido/);
});

test('baseUrl: solo http y https, sin credenciales en la dirección, y sin lo que venga tras la ruta', () => {
  assert.equal(baseUrl('http://localhost:20128'), 'http://localhost:20128');
  assert.equal(baseUrl('https://omni.ejemplo.cl/router/?x=1#y'), 'https://omni.ejemplo.cl/router');
  assert.equal(baseUrl(''), 'http://localhost:20128');
  for (const bad of ['javascript:alert(1)', 'ftp://h', 'file:///x', 'http://user:pw@h', 'no es url', 'data:text/html,x']) assert.equal(baseUrl(bad), null, bad);
});

test('Anthropic: el costo viene en centavos, por día y por modelo, y sigue la página siguiente', () => {
  const page1 = {
    data: [
      { starting_at: '2026-11-05T00:00:00Z', ending_at: '2026-11-06T00:00:00Z', results: [{ currency: 'USD', amount: '1234.5', model: 'claude-opus-5-5', description: 'Claude Opus 5.5 Usage - Input Tokens' }, { currency: 'USD', amount: '100', model: null, description: 'Code Execution Usage' }] },
      { starting_at: '2026-11-06T00:00:00Z', results: [{ currency: 'USD', amount: '50', model: 'claude-haiku-5-5' }] },
    ],
    has_more: true,
    next_page: 'page_2',
  };
  const p = parse('anthropic', page1);
  assert.deepEqual(p.days, [['2026-11-05', 13.345], ['2026-11-06', 0.5]]);
  assert.deepEqual(p.models.map(([m]) => m), ['claude-opus-5-5', 'Code Execution Usage', 'claude-haiku-5-5']);
  assert.equal(p.total, 13.845);
  assert.equal(p.next, 'page_2');
  assert.equal(parse('anthropic', { ...page1, has_more: false }).next, null);
});

test('OpenAI: dólares en amount.value, el modelo antes de la coma de line_item y el día en tiempo Unix', () => {
  const p = parse('openai', {
    object: 'page',
    data: [{ object: 'bucket', start_time: Date.UTC(2026, 10, 4) / 1000, end_time: 0, results: [{ object: 'organization.costs.result', amount: { value: 0.06, currency: 'usd' }, line_item: 'gpt-5, input', project_id: null }, { amount: { value: 1.5 }, line_item: 'gpt-5, output' }] }],
    has_more: false,
    next_page: null,
  });
  assert.deepEqual(p.days, [['2026-11-04', 1.56]]);
  assert.deepEqual(merge([p]).models, [['gpt-5', 1.56]]);
  assert.equal(p.next, null);
});

test('OpenRouter: sin serie por día, el mes en curso para 30 días y la semana para 7', () => {
  const j = { data: { label: 'sk-or-v1-abc…', usage: 40, usage_daily: 1.25, usage_weekly: 6, usage_monthly: 19.5, limit: null } };
  const month = parse('openrouter', j, { days: 30 });
  assert.equal(month.total, 19.5);
  assert.equal(month.window, 'month');
  const week = parse('openrouter', j, { days: 7 });
  assert.equal(week.total, 6);
  assert.equal(week.window, 'week');
  assert.equal(parse('openrouter', { data: { usage_daily: 2 } }, { days: 7 }).total, 2, 'sin la semana, al menos el día');
});

test('OmniRoute: el total, la serie, los modelos y cada clave como un agente reconocido por su nombre', () => {
  const p = parse('omniroute', {
    summary: { totalCost: 12.5 },
    dailyTrend: [{ date: '2026-11-05', cost: 4 }, { date: 'no es fecha', cost: 9 }],
    byModel: [{ model: 'cc/claude-opus-5-5', cost: 9 }, { model: 'gratis', cost: 0 }],
    byApiKey: [
      { apiKeyName: 'Claude Code loop', cost: 9, requests: 120 },
      { apiKeyName: 'opencode-graphbranch', cost: 3, requests: 80 },
      { apiKeyName: 'Open Hands', cost: 0.5, requests: 3 },
      { apiKeyName: 'scripts\nde\u0000noche', cost: 0, requests: 1 },
      { cost: 5 }, // sin nombre: no se puede atribuir
    ],
  });
  assert.equal(p.total, 12.5);
  assert.deepEqual(p.days, [['2026-11-05', 4]]);
  assert.deepEqual(p.models, [['cc/claude-opus-5-5', 9]]);
  assert.deepEqual(p.agents.map((a) => [a.name, a.agent, a.usd, a.requests]), [
    ['Claude Code loop', 'claude', 9, 120],
    ['opencode-graphbranch', 'opencode', 3, 80],
    ['Open Hands', 'openhands', 0.5, 3],
    ['scripts de noche', null, 0, 1],
  ]);
  assert.equal(parse('omniroute', { dailyTrend: [{ date: '2026-11-05', cost: 2 }, { date: '2026-11-06', cost: 1 }] }).total, 3, 'sin el resumen, la suma de la serie');
});

test('una respuesta con otra forma no lanza: no suma nada', () => {
  for (const s of SERVICES) for (const bad of [null, [], 'texto', { data: 'x' }, { data: [{ results: 'x' }] }, { byApiKey: {} }]) {
    const p = parse(s, bad);
    assert.equal(typeof p.total, 'number', `${s}: ${JSON.stringify(bad)}`);
    assert.ok(Number.isFinite(p.total));
  }
});

test('agentOf: los agentes de js/agents.js por su nombre corriente, sin confundir palabras', () => {
  assert.equal(agentOf('Claude Code · loop'), 'claude');
  assert.equal(agentOf('copilot_reviews'), 'copilot');
  assert.equal(agentOf('OpenCode'), 'opencode');
  assert.equal(agentOf('open-code loop'), 'opencode');
  assert.equal(agentOf('Gemini CLI'), 'gemini');
  assert.equal(agentOf('claudette'), null);
  assert.equal(agentOf('scripts'), null);
  assert.equal(agentOf(''), null);
});

test('collect: junta páginas, para cuando no hay más y no da vueltas si la página se repite', async () => {
  const calls = [];
  const pages = {
    '': { data: [{ starting_at: '2026-11-05T00:00:00Z', results: [{ amount: '100', model: 'a' }] }], has_more: true, next_page: 'p2' },
    p2: { data: [{ starting_at: '2026-11-06T00:00:00Z', results: [{ amount: '300', model: 'a' }] }], has_more: true, next_page: 'p2' },
  };
  const r = await collect('anthropic', { key: 'k', days: 7, now: NOW }, async (req) => {
    calls.push(req);
    const page = new URL(req.url).searchParams.get('page') || '';
    return { status: 200, json: pages[page] };
  });
  assert.equal(calls.length, 2);
  assert.equal(r.service, 'anthropic');
  assert.equal(r.total, 4);
  assert.deepEqual(r.days, [['2026-11-05', 1], ['2026-11-06', 3]]);
  assert.deepEqual(r.models, [['a', 4]]);
  // nunca más de PAGES páginas, aunque el servicio diga que hay más
  let n = 0;
  await collect('openai', { key: 'k' }, async () => ({ status: 200, json: { data: [], has_more: true, next_page: `p${++n}` } }));
  assert.ok(n <= 6);
});

test('collect: por qué falló, para decirlo (clave, red, código o forma)', async () => {
  const kind = (fetchJson) => collect('openrouter', { key: 'k' }, fetchJson).then(() => 'ok', (e) => `${e.kind}${e.status ? ' ' + e.status : ''}`);
  assert.equal(await kind(async () => ({ status: 401, json: {} })), 'auth 401');
  assert.equal(await kind(async () => ({ status: 403, json: {} })), 'auth 403');
  assert.equal(await kind(async () => ({ status: 500, json: {} })), 'http 500');
  assert.equal(await kind(async () => ({ status: 200, json: null })), 'shape');
  assert.equal(await kind(async () => { throw new TypeError('Failed to fetch'); }), 'net');
  assert.equal(await collect('nada', {}, async () => ({ status: 200, json: {} })).catch((e) => e.kind), 'shape');
});

test('demo y combine: cuatro servicios de ejemplo en el período, las barras por día y el total', () => {
  for (const days of PERIODS) {
    const d = demo({ days, now: NOW });
    assert.deepEqual(d.map((x) => x.service), SERVICES);
    assert.ok(d.every((x) => x.demo && x.days.length === days && x.total > 0));
    assert.ok(d.find((x) => x.service === 'omniroute').agents.some((a) => a.agent === 'claude'));
    const c = combine(d, { days, now: NOW });
    assert.equal(c.days.length, days);
    assert.equal(c.days.at(-1), '2026-11-06');
    assert.equal(c.days[0], new Date(NOW - (days - 1) * DAY).toISOString().slice(0, 10));
    assert.equal(c.series.length, 4);
    assert.ok(Math.abs(c.total - d.reduce((n, x) => n + x.total, 0)) < 1e-6);
  }
  // lo que falló no suma ni dibuja barras
  const c = combine([{ service: 'openai', error: 'auth' }, { service: 'anthropic', total: 2, days: [['2026-11-06', 2]] }], { days: 7, now: NOW });
  assert.equal(c.total, 2);
  assert.deepEqual(c.series.map((x) => x.service), ['anthropic']);
});
