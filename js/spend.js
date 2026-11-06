/* GraphBranch — gasto en IA. Lee lo que gastó cada servicio de IA conectado y, con OmniRoute, lo que gastó cada
   agente (cada clave de OmniRoute, que es como un agente se identifica ante él):

     Anthropic   GET https://api.anthropic.com/v1/organizations/cost_report   (clave de administración, sk-ant-admin…)
     OpenAI      GET https://api.openai.com/v1/organization/costs             (clave de administración, sk-admin-…)
     OpenRouter  GET https://openrouter.ai/api/v1/key                         (la clave de la cuenta)
     OmniRoute   GET <su dirección>/api/usage/analytics                       (una clave con permiso «manage», si pide)

   Todo en dólares. Cada clave va solo a la API de su servicio. Este archivo arma las consultas y lee las respuestas;
   quien llama hace el fetch (la página en la web; el proceso principal en la app de escritorio, que no choca con CORS).
   Sirve en el navegador (window.GB.spend) y en Node (require: lo usa electron/main.js y las pruebas). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GB.spend = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SERVICES = ['anthropic', 'openai', 'openrouter', 'omniroute'];
  const NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter', omniroute: 'OmniRoute' };
  const DAY = 864e5;
  const PERIODS = [7, 30];
  const PAGES = 6; // páginas que se siguen como mucho (cada una, hasta 31 días de un servicio)
  const OMNIROUTE_URL = 'http://localhost:20128'; // donde queda su panel al instalarlo
  /* Los agentes que se reconocen en el nombre de una clave de OmniRoute («claude-code-loop», «OpenCode GraphBranch»):
     la misma lista de agentes que js/agents.js, por su nombre corriente. */
  const AGENT_WORDS = [
    ['claude', /\bclaude\b/i],
    ['copilot', /\bcopilot\b/i],
    ['codex', /\bcodex\b/i],
    ['cursor', /\bcursor\b/i],
    ['devin', /\bdevin\b/i],
    ['jules', /\bjules\b/i],
    ['gemini', /\bgemini\b/i],
    ['opencode', /\bopen[ -]?code\b/i],
    ['aider', /\baider\b/i],
    ['openhands', /\bopen[ -]?hands\b/i],
  ];

  const num = (v) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n : 0;
  };
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const round = (x) => Math.round(x * 1e6) / 1e6;

  /** La dirección de OmniRoute, si sirve: http o https, sin usuario ni clave en ella, sin lo que venga después de la
      ruta. null si no es una dirección. */
  function baseUrl(url) {
    try {
      const u = new URL(String(url || '').trim() || OMNIROUTE_URL);
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  /** ¿Qué agente nombra una clave de OmniRoute? Su id (el de js/agents.js) o null. */
  function agentOf(name) {
    const n = String(name || '').replace(/[_.]/g, ' ');
    for (const [id, re] of AGENT_WORDS) if (re.test(n)) return id;
    return null;
  }

  /** La consulta de una página: { url, headers }. `cfg`: { key, url (OmniRoute), days, now, page, browser }. Con
      `browser`, lo que el navegador necesita además (Anthropic pide permiso explícito para llamarlo desde una página). */
  function request(service, { key = '', url = '', days = 30, now = Date.now(), page = null, browser = false } = {}) {
    const start = Date.parse(day(now - (days - 1) * DAY)); // desde el comienzo del primer día del período (UTC)
    const end = Date.parse(day(now)) + DAY;
    const q = (params) => Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (service === 'anthropic') {
      const headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
      if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
      return {
        url: `https://api.anthropic.com/v1/organizations/cost_report?${q({ starting_at: new Date(start).toISOString(), ending_at: new Date(end).toISOString(), bucket_width: '1d', limit: 31, 'group_by[]': 'description', page })}`,
        headers,
      };
    }
    if (service === 'openai') {
      return {
        url: `https://api.openai.com/v1/organization/costs?${q({ start_time: Math.floor(start / 1000), end_time: Math.floor(end / 1000), bucket_width: '1d', limit: 31, group_by: 'line_item', page })}`,
        headers: { Authorization: `Bearer ${key}` },
      };
    }
    if (service === 'openrouter') return { url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${key}` } };
    if (service === 'omniroute') {
      const base = baseUrl(url);
      if (!base) throw new Error('dirección inválida');
      return { url: `${base}/api/usage/analytics?${q({ range: `${days}d` })}`, headers: key ? { Authorization: `Bearer ${key}` } : {} };
    }
    throw new Error('servicio desconocido');
  }

  /** Lee una página de respuesta. Devuelve { days: [[fecha, usd]], models: [[nombre, usd]], agents: [{ name, agent,
      usd, requests }], total, window, next } (`window`: 'month' si el servicio solo dice lo del mes en curso; `next`: la
      página siguiente, o null). Lo que no tenga la forma esperada se ignora: nunca lanza. */
  function parse(service, json, { days = 30 } = {}) {
    const out = { days: [], models: [], agents: [], total: 0, window: null, next: null };
    const j = json && typeof json === 'object' ? json : {};
    if (service === 'anthropic' || service === 'openai') {
      for (const b of Array.isArray(j.data) ? j.data : []) {
        const when = service === 'anthropic' ? String(b?.starting_at || '').slice(0, 10) : num(b?.start_time) ? day(num(b.start_time) * 1000) : '';
        let sum = 0;
        for (const r of Array.isArray(b?.results) ? b.results : []) {
          // Anthropic: centavos en texto («123.45» son US$ 1,2345); OpenAI: dólares en amount.value
          const usd = service === 'anthropic' ? num(r?.amount) / 100 : num(r?.amount?.value);
          if (!usd) continue;
          sum += usd;
          const model = service === 'anthropic' ? clean(r?.model || r?.description || '') : clean(String(r?.line_item || '').split(',')[0]);
          if (model) out.models.push([model, usd]);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(when)) out.days.push([when, sum]);
        out.total += sum;
      }
      out.next = j.has_more && j.next_page ? String(j.next_page) : null;
    } else if (service === 'openrouter') {
      const d = j.data && typeof j.data === 'object' ? j.data : {};
      // sin serie por día: el período corto lo dice la semana; el largo, el mes en curso
      const month = days > 7;
      out.total = num(month ? d.usage_monthly : d.usage_weekly) || (month ? 0 : num(d.usage_daily));
      out.window = month ? 'month' : 'week';
      if (d.usage_daily != null) out.days.push([day(Date.now()), num(d.usage_daily)]);
      if (d.label) out.models.push([clean(d.label, 60), out.total]);
    } else if (service === 'omniroute') {
      for (const r of Array.isArray(j.dailyTrend) ? j.dailyTrend : []) if (/^\d{4}-\d{2}-\d{2}/.test(String(r?.date || ''))) out.days.push([String(r.date).slice(0, 10), num(r.cost)]);
      for (const r of Array.isArray(j.byModel) ? j.byModel : []) if (num(r?.cost)) out.models.push([clean(r.model || r.rawModel), num(r.cost)]);
      for (const r of Array.isArray(j.byApiKey) ? j.byApiKey : []) {
        const name = clean(r?.apiKeyName || r?.apiKey || '');
        if (!name) continue;
        out.agents.push({ name, agent: agentOf(name), usd: num(r.cost), requests: num(r.requests) });
      }
      out.total = num(j.summary?.totalCost) || out.days.reduce((n, [, usd]) => n + usd, 0);
    }
    return out;
  }

  /** Junta páginas: suma por día y por modelo, y deja los modelos y los agentes de mayor a menor. */
  function merge(pages) {
    const days = new Map();
    const models = new Map();
    const agents = new Map();
    let total = 0;
    let window = null;
    for (const p of pages) {
      for (const [d, usd] of p.days) days.set(d, (days.get(d) || 0) + usd);
      for (const [m, usd] of p.models) models.set(m, (models.get(m) || 0) + usd);
      for (const a of p.agents) {
        const x = agents.get(a.name) || agents.set(a.name, { ...a, usd: 0, requests: 0 }).get(a.name);
        x.usd += a.usd;
        x.requests += a.requests;
      }
      total += p.total;
      window = window || p.window;
    }
    const desc = (m) => [...m].map(([k, v]) => [k, round(v)]).sort((a, b) => b[1] - a[1]);
    return {
      total: round(total),
      window,
      days: [...days].map(([k, v]) => [k, round(v)]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      models: desc(models),
      agents: [...agents.values()].map((a) => ({ ...a, usd: round(a.usd) })).sort((a, b) => b.usd - a.usd),
    };
  }

  /** Por qué falló una consulta, para decirlo: 'auth' (401 o 403: la clave no sirve o no tiene permiso), 'net' (no se
      llegó: sin red, CORS o el servicio apagado), 'http' (otro código) o 'shape' (no respondió lo esperado). */
  class SpendError extends Error {
    constructor(kind, status = 0, detail = '') {
      super(`${kind}${status ? ' ' + status : ''}${detail ? ': ' + detail : ''}`);
      this.kind = kind;
      this.status = status;
    }
  }

  /** Trae el gasto de un servicio entero (todas sus páginas, hasta PAGES). `fetchJson(req)` hace la consulta y
      devuelve { status, json } (o lanza si no llegó). Devuelve lo de merge más { service, at }. */
  async function collect(service, cfg, fetchJson) {
    if (!SERVICES.includes(service)) throw new SpendError('shape', 0, 'servicio desconocido');
    const pages = [];
    let page = null;
    for (let i = 0; i < PAGES; i++) {
      const req = request(service, { ...cfg, page });
      let res;
      try {
        res = await fetchJson(req);
      } catch (err) {
        throw new SpendError('net', 0, clean(err?.message, 120));
      }
      if (res.status === 401 || res.status === 403) throw new SpendError('auth', res.status);
      if (res.status < 200 || res.status >= 300) throw new SpendError('http', res.status);
      if (!res.json || typeof res.json !== 'object') throw new SpendError('shape');
      const p = parse(service, res.json, cfg);
      pages.push(p);
      if (!p.next || p.next === page) break;
      page = p.next;
    }
    return { service, at: cfg.now || Date.now(), ...merge(pages) };
  }

  /** Un ejemplo para la demo (sin clave ni conexión): cuatro servicios y los agentes de la demo en OmniRoute. Se marca
      como ejemplo donde se muestra. `now`, para que las fechas caigan en el período. */
  function demo({ days = 30, now = Date.now() } = {}) {
    const series = (base, wobble, seed) =>
      Array.from({ length: days }, (_, i) => [day(now - (days - 1 - i) * DAY), round(Math.max(0, base + wobble * Math.sin((i + seed) * 1.7) + (i % 7 === seed % 7 ? wobble : 0)))]);
    const make = (service, base, wobble, seed, models, agents = []) => {
      const d = series(base, wobble, seed);
      const total = round(d.reduce((n, [, v]) => n + v, 0));
      return { service, at: now, demo: true, total, window: null, days: d, models: models.map(([m, f]) => [m, round(total * f)]), agents: agents.map(([name, f, requests]) => ({ name, agent: agentOf(name), usd: round(total * f), requests })) };
    };
    return [
      make('anthropic', 4.2, 1.6, 1, [['claude-opus-5-5', 0.62], ['claude-sonnet-5-5', 0.31], ['claude-haiku-5-5', 0.07]]),
      make('openai', 1.3, 0.7, 3, [['gpt-5', 0.7], ['gpt-5-mini', 0.3]]),
      { ...make('openrouter', 0.6, 0.3, 5, [['orbita-dev', 1]]), window: days > 7 ? 'month' : 'week' },
      make('omniroute', 2.8, 1.1, 2, [['cc/claude-sonnet-5-5', 0.55], ['gemini/gemini-3-pro', 0.25], ['openai/gpt-5', 0.2]], [
        ['Claude Code · loop', 0.58, 412],
        ['OpenCode · orbita', 0.27, 233],
        ['GitHub Copilot', 0.1, 96],
        ['scripts', 0.05, 40],
      ]),
    ];
  }

  /** Lo de varios servicios junto: el total y la serie por día de cada uno (para las barras apiladas). */
  function combine(results, { days = 30, now = Date.now() } = {}) {
    const keys = Array.from({ length: days }, (_, i) => day(now - (days - 1 - i) * DAY));
    const ok = results.filter((r) => r && !r.error);
    const series = ok.map((r) => {
      const by = new Map(r.days);
      return { service: r.service, values: keys.map((k) => by.get(k) || 0) };
    });
    return { days: keys, series, total: round(ok.reduce((n, r) => n + (r.total || 0), 0)) };
  }

  return { SERVICES, NAMES, PERIODS, OMNIROUTE_URL, request, parse, merge, collect, demo, combine, agentOf, baseUrl, SpendError };
});
