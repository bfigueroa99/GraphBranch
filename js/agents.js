/* GraphBranch — agentes e interacciones. Reconoce qué commits y qué cuentas son de un agente (Claude Code, GitHub
   Copilot, Codex, Cursor, Devin, Jules, Gemini, OpenCode, Aider, OpenHands) o de un bot (Dependabot, Renovate, GitHub
   Actions, cualquier `[bot]`), y cada sesión de un agente por separado cuando el commit la nombra (`Claude-Session:`,
   `sesión cse_…`). Con eso cuenta quién trabaja con quién, entre personas, entre agentes y entre unos y otros:
   quién continuó la rama de quién, quién fusionó el trabajo de quién (y en qué PR) y quién revisó o comentó el PR de
   quién. No hace ninguna consulta: parte de los commits ya cargados y de la actividad que ya llegó. Todo texto que
   sale de aquí es dato del repo: quien lo muestre lo escapa. */
(function (GB) {
  'use strict';

  const WALK = 60; // commits que se recorren hacia atrás desde la cabeza de una rama fusionada
  const EVENTS = 12; // interacciones recientes que se listan; el total se dice aparte
  const NODES = 14; // participantes que entran en la red

  /* Agentes conocidos. `login`: su cuenta en el servicio; `author`: el nombre con que firma sus commits; `email`: su
     correo (si se conoce, tiene que calzar con `author`); `co`: cómo se nombra en un `Co-Authored-By:`. */
  const BOT = /\[bot\]$/i;
  const KNOWN = [
    { id: 'claude', name: 'Claude Code', login: /^claude(\[bot\])?$/i, author: /^claude$/i, email: /(^|[.@])anthropic\.com$/i, co: /^claude\b/i, coEmail: /@anthropic\.com$/i },
    { id: 'copilot', name: 'GitHub Copilot', login: /^(copilot|copilot-swe-agent(\[bot\])?|copilot-pull-request-reviewer(\[bot\])?)$/i, author: /^copilot$/i, co: /^copilot\b/i },
    { id: 'codex', name: 'Codex', login: /^(chatgpt-codex-connector|codex)(\[bot\])?$/i, author: /^codex$/i, co: /^codex\b/i },
    { id: 'cursor', name: 'Cursor', login: /^(cursor|cursoragent)(\[bot\])?$/i, author: /^cursor( agent)?$/i, co: /^cursor( agent)?\b/i, coEmail: /@cursor\.(com|sh)$/i },
    { id: 'devin', name: 'Devin', login: /^devin-ai-integration(\[bot\])?$/i, author: /^devin( ai)?$/i, co: /^devin\b/i },
    { id: 'jules', name: 'Jules', login: /^google-labs-jules(\[bot\])?$/i, author: /^(google-labs-)?jules$/i, co: /^jules\b/i },
    { id: 'gemini', name: 'Gemini', login: /^gemini-code-assist(\[bot\])?$/i, author: /^gemini( code assist)?$/i, co: /^gemini\b/i },
    { id: 'opencode', name: 'OpenCode', login: /^opencode(-agent)?(\[bot\])?$/i, author: /^opencode$/i, co: /^opencode\b/i, coEmail: /@opencode\.ai$/i },
    { id: 'aider', name: 'Aider', author: /\(aider\)$/i, co: /^aider\b/i, coEmail: /@aider\.chat$/i },
    { id: 'openhands', name: 'OpenHands', login: /^openhands(-agent)?(\[bot\])?$/i, author: /^openhands$/i, co: /^openhands\b/i },
    { id: 'dependabot', name: 'Dependabot', login: /^dependabot(\[bot\])?$/i, author: /^dependabot(\[bot\])?$/i, bot: true },
    { id: 'renovate', name: 'Renovate', login: /^renovate(\[bot\])?$/i, author: /^renovate(\[bot\])?$/i, bot: true },
    { id: 'actions', name: 'GitHub Actions', login: /^github-actions(\[bot\])?$/i, author: /^github-actions(\[bot\])?$/i, bot: true },
  ];
  const BY_ID = new Map(KNOWN.map((k) => [k.id, k]));
  /* «Generated with [Claude Code]», «Generated with [opencode]»: la firma que dejan algunos agentes al pie */
  const SIGNATURES = [
    [/generated with \[?claude code\]?/i, 'claude'],
    [/generated with \[?opencode\]?/i, 'opencode'],
  ];

  const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  /** El identificador de una sesión, sin su prefijo (`session_`, `cse_`): solo letras, números, `-` y `_`. */
  const sessionId = (s) => {
    const id = String(s || '').replace(/^(session_|cse_)/i, '');
    return /^[A-Za-z0-9_-]{4,80}$/.test(id) ? id : null;
  };

  /** Los `Co-Authored-By: Nombre <correo>` de un mensaje: [{ name, email }]. */
  function coAuthors(message) {
    const out = [];
    for (const m of String(message || '').matchAll(/^[ \t]*co-authored-by:[ \t]*([^<\n]*?)[ \t]*<([^>\n]*)>/gim)) out.push({ name: clean(m[1]), email: clean(m[2]) });
    return out;
  }

  /** La sesión que nombra un mensaje: el trailer `<Algo>-Session:` (con una URL o el id solo), una URL de sesión de
      Claude Code o «sesión cse_…» / «session cse_…» (los reclamos del loop). null si no nombra ninguna. */
  function sessionOf(message) {
    const s = String(message || '');
    const url = /claude\.ai\/code\/session_([A-Za-z0-9_-]{4,80})/i.exec(s);
    if (url) return sessionId(url[1]);
    const trailer = /^[ \t]*[A-Za-z][\w-]*-session:[ \t]*(\S+)/im.exec(s);
    if (trailer) return sessionId(trailer[1].replace(/[/?#]+$/, '').split(/[/?#=]/).pop());
    const word = /\bsess?i(?:ó|o)n[ \t]+((?:cse_|session_)[A-Za-z0-9_-]{4,80})/i.exec(s);
    return word ? sessionId(word[1]) : null;
  }

  /** El modelo que nombra un co-autor: «Claude Opus 5.5» → «Opus 5.5»; «aider (gpt-5)» → «gpt-5». */
  function modelOf(coName) {
    const rest = clean(coName, 60).replace(/^\S+\s*/, '').replace(/^\((.*)\)$/, '$1').trim();
    return rest || null;
  }

  /** El agente conocido de una cuenta o un autor: el que calza con su login o con su nombre (y su correo, si se sabe). */
  function knownOf({ login, name, email } = {}) {
    const l = clean(login, 60);
    const n = clean(name, 60);
    const e = clean(email, 120);
    for (const k of KNOWN) {
      if (l && k.login?.test(l)) return k;
      if (n && k.author?.test(n) && (!e || !k.email || k.email.test(e) || /noreply/i.test(e))) return k;
    }
    return null;
  }

  /** Un bot cualquiera (`algo[bot]`) que no está en la lista: su login, sin el sufijo, es su nombre. */
  function botOf({ login, name } = {}) {
    const who = clean(login, 60) || clean(name, 60);
    return BOT.test(who) ? { id: 'bot:' + who.replace(BOT, '').toLowerCase(), name: who.replace(BOT, ''), bot: true } : null;
  }

  const agentOf = (k, extra = {}) => ({ id: k.id, name: k.name, bot: !!k.bot, model: null, session: null, ...extra });

  /** ¿Es de un agente este commit? `author`: { name, login, email? }; `message`: el mensaje entero (con su cuerpo,
      si se tiene). Devuelve { id, name, bot, model, session } o null si es de una persona. Un commit firmado por una
      persona con un agente de co-autor cuenta como del agente: es quien lo escribió. */
  function detect(author = {}, message = '') {
    const msg = String(message || '');
    const session = sessionOf(msg);
    let k = knownOf(author);
    let model = null;
    for (const co of coAuthors(msg)) {
      const hit = KNOWN.find((x) => (x.co && x.co.test(co.name)) || (x.coEmail && x.coEmail.test(co.email)));
      if (!hit || (k && hit.id !== k.id)) continue;
      k = hit;
      model = model || modelOf(co.name);
      break;
    }
    if (!k) for (const [re, id] of SIGNATURES) if (re.test(msg)) k = BY_ID.get(id);
    // una sesión de Claude Code sin más señas: un reclamo del loop firmado por «Claude»
    if (!k && session && /\bcse_/.test(msg) && /^claude$/i.test(clean(author.name))) k = BY_ID.get('claude');
    if (k) return agentOf(k, { model, session: k.bot ? null : session });
    const bot = botOf(author);
    return bot ? { ...bot, model: null, session: null } : null;
  }

  /** El agente de una cuenta que aparece en la actividad (revisiones, comentarios, merges): sin mensaje, solo su login. */
  function detectActor(actor) {
    if (!actor) return null;
    const k = knownOf({ login: actor.login, name: actor.login ? null : actor.name });
    if (k) return agentOf(k);
    const bot = botOf(actor);
    return bot ? { ...bot, model: null, session: null } : null;
  }

  /** El agente de un commit cargado: lo que dejó la fuente al traerlo (`c.agent`, la consulta GraphQL de GitHub, que
      no guarda el cuerpo del mensaje) o, si no, lo que dicen su autor y su mensaje. Se recuerda en el commit. */
  function of(c) {
    if (!c) return null;
    if (c.agent !== undefined) return c.agent;
    const a = detect(c.author || {}, c.message);
    try {
      Object.defineProperty(c, 'agent', { value: a, writable: true, configurable: true, enumerable: false });
    } catch {
      /* un commit congelado: se calcula cada vez */
    }
    return a;
  }

  /* ---------- quién es quién ---------- */

  const personKey = (p) => (p?.login ? 'u:' + String(p.login).toLowerCase() : p?.name ? 'n:' + clean(p.name) : null);
  const agentKey = (a) => 'a:' + a.id + (a.session ? ':' + a.session : '');

  /** El número de PR de un commit de merge: «Merge pull request #12 from …», «… (#12)», «… (!12)» o, en GitLab,
      «See merge request grupo/proyecto!12» en el cuerpo. */
  function prNumber(message) {
    const msg = String(message || '');
    const first = msg.split('\n')[0];
    const m = /^Merge pull request #(\d+)\b/.exec(first) || /\((?:#|!)(\d+)\)\s*$/.exec(first) || /^See merge request \S*!(\d+)\s*$/m.exec(msg);
    return m ? Number(m[1]) : null;
  }

  /** Quién trabaja con quién, sobre lo ya cargado. `data`: el estado del repo (commits, PRs abiertos); `acts`: su
      actividad. Devuelve:
        actors: [{ key, name, login, agent, commits, last, sha, links }] (agentes y personas, el más activo primero)
        links:  [{ from, to, kinds: { continued, merged, reviewed, commented }, total, last, sha }] (de quien actúa a quien
                recibe; `sha`, el commit de la más reciente, si lo hay)
        events: [{ kind, from, to, time, sha, number }] (las más recientes, hasta `max`), y `total` (todas). */
  function compute(data, acts = [], { max = EVENTS } = {}) {
    const actors = new Map();
    const actor = (key, fill) => {
      let a = actors.get(key);
      if (!a) actors.set(key, (a = { key, name: '', login: null, agent: null, commits: 0, last: 0, sha: null, links: 0, ...fill() }));
      return a;
    };
    const commitActor = (c, session) => {
      let ag = of(c);
      if (ag && session && !ag.session) ag = { ...ag, session };
      if (ag) {
        const a = actor(agentKey(ag), () => ({ name: ag.name, agent: { ...ag } }));
        if (ag.model && !a.agent.model) a.agent.model = ag.model;
        return a;
      }
      const key = personKey(c.author);
      return key ? actor(key, () => ({ name: clean(c.author.name) || clean(c.author.login), login: c.author.login || null })) : null;
    };
    const eventActor = (who) => {
      if (!who) return null;
      const ag = detectActor(who);
      if (ag) return actor(agentKey(ag), () => ({ name: ag.name, agent: { ...ag } }));
      const key = personKey(who);
      return key ? actor(key, () => ({ name: clean(who.name) || clean(who.login), login: who.login || null })) : null;
    };

    const commits = data?.commits || new Map();
    const kids = new Map();
    const only = new Map(); // sha -> su único hijo
    for (const c of commits.values())
      for (const p of c.parents || []) {
        kids.set(p, (kids.get(p) || 0) + 1);
        only.set(p, c.sha);
      }
    // un commit de agente sin sesión (un merge de la rama de integración, por ejemplo) entre commits de una sesión del
    // mismo agente, en la misma línea, es de esa sesión: la toma de su primer padre o, si no, de su único hijo
    const inherited = new Map();
    const sessionAt = (sha) => inherited.get(sha) || of(commits.get(sha))?.session || null;
    const sameAgent = (c, sha) => commits.has(sha) && of(commits.get(sha))?.id === of(c)?.id;
    const bare = [...commits.values()].filter((c) => of(c) && !of(c).bot && !of(c).session).sort((x, y) => (x.date || 0) - (y.date || 0));
    for (const c of bare) {
      const p = (c.parents || [])[0];
      if (p && sameAgent(c, p) && sessionAt(p)) inherited.set(c.sha, sessionAt(p));
    }
    for (const c of bare.reverse()) {
      const k = kids.get(c.sha) === 1 ? only.get(c.sha) : null;
      if (!inherited.has(c.sha) && k && sameAgent(c, k) && sessionAt(k)) inherited.set(c.sha, sessionAt(k));
    }
    const who = new Map(); // sha -> actor
    for (const c of commits.values()) {
      const a = commitActor(c, inherited.get(c.sha));
      if (!a) continue;
      who.set(c.sha, a);
      a.commits++;
      if ((c.date || 0) >= a.last) {
        a.last = c.date || 0;
        a.sha = c.sha;
      }
    }

    const links = new Map();
    const events = [];
    const add = (from, to, kind, ev) => {
      if (!from || !to || from === to) return;
      const id = from.key + '>' + to.key;
      const l = links.get(id) || links.set(id, { from: from.key, to: to.key, kinds: { continued: 0, merged: 0, reviewed: 0, commented: 0 }, total: 0, last: 0, sha: null }).get(id);
      l.kinds[kind]++;
      l.total++;
      if ((ev.time || 0) >= l.last) {
        l.last = ev.time || 0;
        if (ev.sha) l.sha = ev.sha;
      }
      from.links++;
      to.links++;
      events.push({ kind, from: from.key, to: to.key, time: ev.time || 0, sha: ev.sha || null, number: ev.number ?? null });
    };

    const mergedPrs = new Set();
    for (const c of commits.values()) {
      const me = who.get(c.sha);
      if (!me) continue;
      const parents = c.parents || [];
      if (parents.length > 1) {
        // un merge: el trabajo que entra por los otros padres, desde su cabeza hasta donde salió la rama
        const number = prNumber(c.message);
        if (number != null) mergedPrs.add(number);
        const got = new Set();
        for (const head of parents.slice(1)) {
          let sha = head;
          for (let i = 0; sha && i < WALK; i++) {
            const x = commits.get(sha);
            if (!x || (sha !== head && (kids.get(sha) || 0) > 1)) break;
            const a = who.get(sha);
            if (a) got.add(a);
            sha = (x.parents || [])[0];
          }
        }
        for (const a of got) add(me, a, 'merged', { time: c.date, sha: c.sha, number });
      } else if (parents.length === 1 && (kids.get(parents[0]) || 0) === 1) {
        // sigue la misma línea, sin que nadie más salga de ahí: continuó lo que dejó el anterior
        const prev = who.get(parents[0]);
        if (prev) add(me, prev, 'continued', { time: c.date, sha: c.sha });
      }
    }

    // PRs: el autor de cada uno (los abiertos traen su usuario; los demás, el de su apertura en la actividad)
    const prAuthor = new Map();
    for (const p of data?.pulls?.values?.() || []) if (p?.user && p.number != null) prAuthor.set(p.number, p.user);
    for (const a of acts) if (a?.kind === 'pr-open' && a.number != null && a.actor && !prAuthor.has(a.number)) prAuthor.set(a.number, a.actor);
    const seen = new Set();
    for (const a of acts) {
      if (!a?.actor || a.number == null || (a.id && seen.has(a.id))) continue;
      if (a.id) seen.add(a.id);
      const kind =
        a.kind === 'review-ok' || a.kind === 'review-changes' || (a.kind === 'review' && !a.request) ? 'reviewed'
        : a.kind === 'comment' && a.pr ? 'commented'
        : a.kind === 'pr-merge' && !mergedPrs.has(a.number) ? 'merged'
        : null;
      if (!kind) continue;
      const author = prAuthor.get(a.number);
      if (!author) continue;
      add(eventActor(a.actor), eventActor(author), kind, { time: a.time, sha: a.sha, number: a.number });
    }

    events.sort((x, y) => y.time - x.time);
    const list = [...actors.values()].sort((x, y) => y.links - x.links || y.commits - x.commits || y.last - x.last || (x.name < y.name ? -1 : 1));
    return {
      actors: list,
      links: [...links.values()].sort((x, y) => y.total - x.total || y.last - x.last),
      events: events.slice(0, max),
      total: events.length,
    };
  }

  /** Lo que se dibuja: los `limit` participantes con más interacciones (solo agentes, con `onlyAgents`) y los
      vínculos entre ellos. Con `onlyAgents`, solo los vínculos entre dos agentes. */
  function network(res, { onlyAgents = false, limit = NODES } = {}) {
    const byKey = new Map(res.actors.map((a) => [a.key, a]));
    const links = res.links.filter((l) => !onlyAgents || (byKey.get(l.from)?.agent && byKey.get(l.to)?.agent));
    const weight = new Map();
    for (const l of links) for (const k of [l.from, l.to]) weight.set(k, (weight.get(k) || 0) + l.total);
    const nodes = [...weight.keys()]
      .map((k) => byKey.get(k))
      .filter(Boolean)
      .sort((x, y) => weight.get(y.key) - weight.get(x.key) || (x.name < y.name ? -1 : 1))
      .slice(0, limit);
    const keep = new Set(nodes.map((n) => n.key));
    return { nodes, links: links.filter((l) => keep.has(l.from) && keep.has(l.to)), weight };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const r1 = (x) => Math.round(x * 10) / 10;

  /** La red como SVG: cada participante en una elipse (los agentes, cuadrados; las personas, círculos; más grandes
      cuantas más interacciones) y cada vínculo como una curva con flecha de quien actúa a quien recibe, más gruesa
      cuantas más veces. `text`: { label(node), sub(node), title(link), aria } con los textos ya traducidos; todo se
      escapa aquí. */
  function svg(net, text, { width = 560, height = 300 } = {}) {
    const n = net.nodes.length;
    const cx = width / 2;
    const cy = height / 2;
    const rx = n > 1 ? width / 2 - 92 : 0;
    const ry = n > 1 ? height / 2 - 46 : 0;
    const maxW = Math.max(1, ...net.nodes.map((x) => net.weight.get(x.key) || 0));
    const maxT = Math.max(1, ...net.links.map((l) => l.total));
    const pos = new Map();
    net.nodes.forEach((node, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
      const r = 7 + 9 * Math.sqrt((net.weight.get(node.key) || 0) / maxW);
      pos.set(node.key, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), r, a });
    });
    const edges = net.links
      .map((l) => {
        const p = pos.get(l.from);
        const q = pos.get(l.to);
        if (!p || !q) return '';
        // curva hacia un lado según el sentido: A→B y B→A no se pisan
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(28, len * 0.18);
        const c = { x: mx - (dy / len) * k, y: my + (dx / len) * k };
        const end = (from, to, r) => {
          const ex = from.x - to.x;
          const ey = from.y - to.y;
          const el = Math.hypot(ex, ey) || 1;
          return { x: to.x + (ex / el) * r, y: to.y + (ey / el) * r };
        };
        const s0 = end(c, p, p.r + 2);
        const s1 = end(c, q, q.r + 5);
        const w = 1.2 + 3.8 * (l.total / maxT);
        const both = net.nodes.find((x) => x.key === l.from)?.agent && net.nodes.find((x) => x.key === l.to)?.agent;
        return `<path class="ag-edge${both ? ' ag-edge-agents' : ''}" d="M${r1(s0.x)} ${r1(s0.y)}Q${r1(c.x)} ${r1(c.y)} ${r1(s1.x)} ${r1(s1.y)}" stroke-width="${r1(w)}" marker-end="url(#ag-arrow${both ? '-agents' : ''})"><title>${esc(text.title(l))}</title></path>`;
      })
      .join('');
    const nodes = net.nodes
      .map((node) => {
        const { x, y, r, a } = pos.get(node.key);
        const shape = node.agent
          ? `<rect class="ag-node ag-agent" x="${r1(x - r)}" y="${r1(y - r)}" width="${r1(2 * r)}" height="${r1(2 * r)}" rx="${r1(r * 0.35)}"/>`
          : `<circle class="ag-node ag-person" cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}"/>`;
        // el rótulo, por fuera de la elipse: a la derecha de los de la derecha, a la izquierda de los de la izquierda
        const cos = n > 1 ? Math.cos(a) : 0;
        const sin = n > 1 ? Math.sin(a) : 1;
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const lx = x + cos * (r + 6);
        const ly = y + sin * (r + 6) + (anchor === 'middle' ? (sin < 0 ? -4 : 12) : 4);
        const sub = text.sub(node);
        return `<g class="ag-n">${shape}<text class="ag-label" x="${r1(lx)}" y="${r1(ly)}" text-anchor="${anchor}">${esc(cut(text.label(node), 22))}${sub ? `<tspan class="ag-sub" x="${r1(lx)}" dy="13">${esc(cut(sub, 24))}</tspan>` : ''}</text><title>${esc(text.label(node) + (sub ? ' · ' + sub : ''))}</title></g>`;
      })
      .join('');
    const arrow = (id, cls) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="${cls}" d="M0 0 8 4 0 8z"/></marker>`;
    return `<svg class="ag-net" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(text.aria)}"><defs>${arrow('ag-arrow', 'ag-arrow')}${arrow('ag-arrow-agents', 'ag-arrow ag-arrow-agents')}</defs>${edges}${nodes}</svg>`;
  }

  /** ?agents=1 (o solo ?agents): abrir el panel de interacciones al cargar el repo. 0, false, no u off lo apagan. */
  function openParam(q) {
    return !!q && typeof q.has === 'function' && q.has('agents') && !/^(0|false|no|off)$/i.test(String(q.get('agents')).trim());
  }

  /** La dirección de una sesión de Claude Code, armada solo con su id (nunca con lo que traiga el commit). */
  const sessionUrl = (agent) => (agent?.id === 'claude' && agent.session && /^[A-Za-z0-9_-]{4,80}$/.test(agent.session) ? `https://claude.ai/code/session_${agent.session}` : null);

  /** Un id de sesión, corto para mostrar: los últimos 6 caracteres (los primeros suelen repetirse entre sesiones). */
  const shortSession = (s) => (s ? String(s).slice(-6) : '');

  GB.agents = { detect, detectActor, of, coAuthors, sessionOf, compute, network, svg, openParam, prNumber, sessionUrl, shortSession, KNOWN: KNOWN.map((k) => k.id) };
})(window.GB);
