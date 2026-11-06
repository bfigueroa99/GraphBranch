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
  const LANES = 8; // filas de la línea de tiempo
  const TRACES = 160; // interacciones que entran en la línea de tiempo (las más recientes)
  /* sobre el grafo (2D y 3D): los arcos y las insignias más recientes, con tope para que miles de sesiones no tapen las
     ramas ni frenen el cuadro. Cada uno de los 7 agentes más activos tiene su color (--ag1…--ag7, validados para
     daltonismo en los dos temas) y los demás van juntos como «otros agentes» (--ag8): un color generado o repetido
     haría pasar dos sesiones por una. Las personas, en gris (0). */
  const ARCS = 240;
  const PINS = 120;
  const COLORS = 7;
  const OTHERS = COLORS + 1;

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
        events: [{ kind, from, to, time, sha, target, number }] (las más recientes, hasta `max`), y `total` (todas).
                `target` es el commit de quien recibe: el anterior, si continuó; el más nuevo suyo en la rama
                fusionada, si fusionó; la punta del PR, si lo revisó o lo comentó (o si se fusionó sin su merge cargado).
        owners: Map sha -> key, de quién es cada commit (lo que el grafo marca). */
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
      events.push({ kind, from: from.key, to: to.key, time: ev.time || 0, sha: ev.sha || null, target: ev.target || null, number: ev.number ?? null });
    };

    const mergedPrs = new Set();
    const mergeOf = new Map(); // número de PR -> su commit de merge (la punta del PR, si su rama ya no está)
    for (const c of commits.values()) {
      const me = who.get(c.sha);
      if (!me) continue;
      const parents = c.parents || [];
      if (parents.length > 1) {
        // un merge: el trabajo que entra por los otros padres, desde su cabeza hasta donde salió la rama
        const number = prNumber(c.message);
        if (number != null) mergedPrs.add(number);
        if (number != null && !mergeOf.has(number)) mergeOf.set(number, c.sha);
        const got = new Map(); // participante -> su commit más nuevo de lo que entra (a donde apunta el arco en el grafo)
        for (const head of parents.slice(1)) {
          let sha = head;
          for (let i = 0; sha && i < WALK; i++) {
            const x = commits.get(sha);
            if (!x || (sha !== head && (kids.get(sha) || 0) > 1)) break;
            const a = who.get(sha);
            if (a && !got.has(a)) got.set(a, sha);
            sha = (x.parents || [])[0];
          }
        }
        for (const [a, target] of got) add(me, a, 'merged', { time: c.date, sha: c.sha, target, number });
      } else if (parents.length === 1 && (kids.get(parents[0]) || 0) === 1) {
        // sigue la misma línea, sin que nadie más salga de ahí: continuó lo que dejó el anterior
        const prev = who.get(parents[0]);
        if (prev) add(me, prev, 'continued', { time: c.date, sha: c.sha, target: parents[0] });
      }
    }

    // PRs: el autor de cada uno (los abiertos traen su usuario; los demás, el de su apertura en la actividad)
    const prAuthor = new Map();
    for (const p of data?.pulls?.values?.() || []) if (p?.user && p.number != null) prAuthor.set(p.number, p.user);
    for (const a of acts) if (a?.kind === 'pr-open' && a.number != null && a.actor && !prAuthor.has(a.number)) prAuthor.set(a.number, a.actor);
    // la punta de cada PR en el grafo: la cabeza de su rama (la de los PRs abiertos o la que dijo su apertura o una
    // revisión; la de un fork no está en el grafo) o, si ya no está, su commit de merge
    const prBranch = new Map();
    for (const p of data?.pulls?.values?.() || []) if (p?.number != null && p.head && p.sameRepo !== false) prBranch.set(p.number, p.head);
    for (const a of acts) if (a?.number != null && a.branch && /^(pr-open|review)/.test(a.kind || '') && !prBranch.has(a.number)) prBranch.set(a.number, a.branch);
    const prTip = (n) => {
      const head = data?.branches?.get?.(prBranch.get(n))?.sha;
      return head && commits.has(head) ? head : mergeOf.get(n) || null;
    };
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
      add(eventActor(a.actor), eventActor(author), kind, { time: a.time, sha: a.sha, target: prTip(a.number), number: a.number });
    }

    events.sort((x, y) => y.time - x.time);
    const list = [...actors.values()].sort((x, y) => y.links - x.links || y.commits - x.commits || y.last - x.last || (x.name < y.name ? -1 : 1));
    return {
      actors: list,
      links: [...links.values()].sort((x, y) => y.total - x.total || y.last - x.last),
      events: events.slice(0, max),
      total: events.length,
      owners: new Map([...who].map(([sha, a]) => [sha, a.key])),
    };
  }

  /** El color de cada participante (Map key -> 1..8, 0 las personas): de 1 a 7 los 7 agentes más activos, 8 los demás
      agentes y 0 las personas. Sigue al participante, no a lo que se ve: sale del orden de compute (por interacciones y
      commits), así el grafo, su leyenda, la red y la línea de tiempo pintan a cada uno igual. */
  function slots(res) {
    const slot = new Map();
    let i = 0;
    for (const a of res?.actors || []) slot.set(a.key, a.agent ? Math.min(++i, OTHERS) : 0);
    return slot;
  }

  /** Lo que se dibuja sobre el grafo, en 2D y en 3D. `res`: lo de compute con todas las interacciones (`max: Infinity`).
      Solo las de un agente: las que van entre dos personas se quedan en el panel (en un repo de equipo serían la mayoría
      de los trazos y taparían lo que se vino a ver); con `onlyAgents`, solo las que van entre dos agentes. Las marcas de
      los commits de agente son siempre todas. Devuelve:
        actors: [{ key, name, login, agent, slot, n, sha }] quienes aparecen: primero los que más interacciones tienen en el
                grafo, después los agentes sin ninguna (sus commits también se marcan); `slot`, su color: de 1 a 7 los 7
                agentes más activos de todo `res` (así «Solo entre agentes» no le cambia el color a nadie), 8 los demás
                agentes y 0 las personas, en gris; `n`, sus interacciones en el grafo; `sha`, su último commit
        marks:  Map sha -> slot, cada commit de un agente
        arcs:   [{ kind, from, to, a, b, n, time, slot }] continuó y fusionó: de un commit de quien actúa (`a`) a uno de
                quien recibe (`b`), con su color; `n`, las veces (una por par de commits). Los más recientes, hasta `arcs`.
        pins:   [{ kind, from, to, at, n, time, number, slot, agent }] lo que pasó en un PR sin un commit de quien actúa
                (revisó, comentó, o lo fusionó sin su merge cargado): una insignia sobre la punta del PR (`at`). Hasta `pins`.
        total:  cuántas interacciones quedan en el grafo, contando las repetidas */
  function overlay(res, { onlyAgents = false, arcs: maxArcs = ARCS, pins: maxPins = PINS } = {}) {
    const byKey = new Map(res.actors.map((a) => [a.key, a]));
    const arcs = new Map();
    const pins = new Map();
    for (const e of res.events) {
      const n = !!byKey.get(e.from)?.agent + !!byKey.get(e.to)?.agent; // cuántos de los dos son agentes
      if (!e.target || !n || (onlyAgents && n < 2)) continue;
      const onCommit = !!e.sha && e.sha !== e.target && (e.kind === 'continued' || e.kind === 'merged');
      const id = onCommit ? `${e.kind}|${e.sha}|${e.target}|${e.from}|${e.to}` : `${e.kind}|${e.target}|${e.from}|${e.to}`;
      const into = onCommit ? arcs : pins;
      let x = into.get(id);
      if (!x) into.set(id, (x = onCommit ? { kind: e.kind, from: e.from, to: e.to, a: e.sha, b: e.target, n: 0, time: 0 } : { kind: e.kind, from: e.from, to: e.to, at: e.target, n: 0, time: 0, number: null }));
      x.n++;
      if (e.time >= x.time) {
        x.time = e.time;
        if (!onCommit) x.number = e.number ?? x.number;
      }
    }
    const recent = (m, max) => [...m.values()].sort((x, y) => y.time - x.time).slice(0, max);
    const A = recent(arcs, maxArcs);
    const P = recent(pins, maxPins);
    const weight = new Map();
    for (const x of [...A, ...P]) for (const k of [x.from, x.to]) weight.set(k, (weight.get(k) || 0) + x.n);
    const w = (a) => weight.get(a.key) || 0;
    const slot = slots(res);
    const actors = res.actors
      .filter((a) => weight.has(a.key) || a.agent)
      .sort((x, y) => w(y) - w(x) || y.commits - x.commits || (x.name < y.name ? -1 : 1));
    const marks = new Map();
    for (const [sha, key] of res.owners || []) if (slot.get(key)) marks.set(sha, slot.get(key));
    return {
      actors: actors.map((a) => ({ key: a.key, name: a.name, login: a.login, agent: a.agent, slot: slot.get(a.key), n: w(a), sha: a.sha })),
      marks,
      arcs: A.map((x) => ({ ...x, slot: slot.get(x.from) ?? 0 })),
      pins: P.map((x) => ({ ...x, slot: slot.get(x.from) ?? 0, agent: !!byKey.get(x.from)?.agent })),
      total: [...A, ...P].reduce((n, x) => n + x.n, 0),
    };
  }

  /** Lo que se dibuja: los `limit` participantes con más interacciones (solo agentes, con `onlyAgents`) y los
      vínculos entre ellos. Con `onlyAgents`, solo los vínculos entre dos agentes. `slot`: el color de cada uno (ver
      slots), el mismo que en el grafo. */
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
    return { nodes, links: links.filter((l) => keep.has(l.from) && keep.has(l.to)), weight, slot: slots(res) };
  }

  /** Las interacciones en el tiempo: una fila por participante (los `lanes` con más interacciones; solo agentes, con
      `onlyAgents`) y cada interacción entre dos de ellos como un trazo de quien actúa a quien recibe, en su momento.
      Devuelve { lanes: [{ key, name, login, agent, slot, n }], events: [{ kind, from, to, time, sha, target, number,
      slot }] (las `max` más recientes, de la más vieja a la más nueva), t0, t1 } o null si no hay ninguna con fecha. */
  function timeline(res, { onlyAgents = false, lanes = LANES, max = TRACES } = {}) {
    const byKey = new Map(res.actors.map((a) => [a.key, a]));
    const ok = (e) => e.time > 0 && byKey.has(e.from) && byKey.has(e.to) && (!onlyAgents || (byKey.get(e.from).agent && byKey.get(e.to).agent));
    const all = res.events.filter(ok);
    const weight = new Map();
    for (const e of all) for (const k of [e.from, e.to]) weight.set(k, (weight.get(k) || 0) + 1);
    const slot = slots(res);
    const rows = [...weight.keys()]
      .map((k) => byKey.get(k))
      .sort((x, y) => !!y.agent - !!x.agent || weight.get(y.key) - weight.get(x.key) || (x.name < y.name ? -1 : 1))
      .slice(0, lanes);
    const keep = new Set(rows.map((a) => a.key));
    const events = all
      .filter((e) => keep.has(e.from) && keep.has(e.to))
      .slice(0, max)
      .map((e) => ({ ...e, slot: slot.get(e.from) ?? 0 }))
      .sort((x, y) => x.time - y.time);
    if (!events.length) return null;
    return {
      lanes: rows.map((a) => ({ key: a.key, name: a.name, login: a.login, agent: a.agent, slot: slot.get(a.key) ?? 0, n: weight.get(a.key) })),
      events,
      t0: events[0].time,
      t1: events[events.length - 1].time,
    };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const r1 = (x) => Math.round(x * 10) / 10;
  /** Lo que más hizo un vínculo (a igualdad, en este orden): de eso es su trazo. */
  const KINDS = ['continued', 'merged', 'reviewed', 'commented'];
  const mainKind = (kinds = {}) => KINDS.reduce((best, k) => ((kinds[k] || 0) > (kinds[best] || 0) ? k : best), KINDS[0]);
  /** La inicial de un participante, para su marca: la del producto si es un agente («C» de Claude Code), las iniciales
      si es una persona. Por carácter, no por unidad UTF-16. */
  function mono(node) {
    const words = String(node?.agent?.name || node?.name || node?.login || '?')
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const first = (w) => Array.from(w || '?')[0].toUpperCase();
    if (node?.agent || words.length < 2) return first(words[0]);
    return first(words[0]) + first(words[words.length - 1]);
  }
  /** La punta de una flecha que llega a (x, y) en la dirección (ux, uy): un triángulo de `l` de largo. */
  const head = (x, y, ux, uy, l = 7, w = 3.6) => `M${r1(x)} ${r1(y)}L${r1(x - ux * l - uy * w)} ${r1(y - uy * l + ux * w)}L${r1(x - ux * l + uy * w)} ${r1(y - uy * l - ux * w)}Z`;

  /** La red como SVG: cada participante en una elipse con su color (el mismo que en el grafo) y su inicial (los
      agentes, cuadrados; las personas, círculos; más grandes cuantas más interacciones), y cada vínculo como una curva
      con flecha de quien actúa a quien recibe, del color de quien actúa, con el trazo de lo que más hizo (continuó:
      lleno; fusionó: a rayas; revisó o comentó: punteado), más gruesa cuantas más veces y con las veces junto a ella.
      Cada participante es un botón (`data-key`): quien lo muestre lo ilumina con sus vínculos al pasar o al enfocarlo,
      y lo elige al pulsarlo. `text`: { label(node), sub(node), title(link), node(node), aria } con los textos ya
      traducidos; todo se escapa aquí. `sel`: el participante elegido, si lo hay. */
  function svg(net, text, { width = 760, height = 360, sel = null } = {}) {
    const n = net.nodes.length;
    const cx = width / 2;
    const cy = height / 2;
    const rx = n > 1 ? width / 2 - 128 : 0;
    const ry = n > 1 ? height / 2 - 52 : 0;
    const maxW = Math.max(1, ...net.nodes.map((x) => net.weight.get(x.key) || 0));
    const maxT = Math.max(1, ...net.links.map((l) => l.total));
    const slot = (key) => net.slot?.get(key) ?? 0;
    const pos = new Map();
    net.nodes.forEach((node, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
      const r = 10 + 8 * Math.sqrt((net.weight.get(node.key) || 0) / maxW);
      pos.set(node.key, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), r, a });
    });
    const agentOfKey = new Map(net.nodes.map((x) => [x.key, !!x.agent]));
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
        const k = Math.min(34, len * 0.2);
        const c = { x: mx - (dy / len) * k, y: my + (dx / len) * k };
        const end = (from, to, r) => {
          const ex = from.x - to.x;
          const ey = from.y - to.y;
          const el = Math.hypot(ex, ey) || 1;
          return { x: to.x + (ex / el) * r, y: to.y + (ey / el) * r };
        };
        const s0 = end(c, p, p.r + 3);
        const tip = end(c, q, q.r + 3);
        const ul = Math.hypot(tip.x - c.x, tip.y - c.y) || 1;
        const ux = (tip.x - c.x) / ul;
        const uy = (tip.y - c.y) / ul;
        const s1 = { x: tip.x - ux * 6, y: tip.y - uy * 6 }; // la curva termina donde empieza la punta
        const w = 1.4 + 3.6 * (l.total / maxT);
        const both = agentOfKey.get(l.from) && agentOfKey.get(l.to);
        const on = sel && (l.from === sel || l.to === sel) ? ' on' : '';
        const cls = `ag-edge${both ? ' ag-edge-agents' : ''} ag-s${slot(l.from)} ag-k-${mainKind(l.kinds)}${on}`;
        // las veces, en la mitad de la curva (B(½) = ¼·p + ½·c + ¼·q)
        const bx = 0.25 * s0.x + 0.5 * c.x + 0.25 * s1.x;
        const by = 0.25 * s0.y + 0.5 * c.y + 0.25 * s1.y;
        const count = l.total > 1 ? `<text class="ag-cnt" x="${r1(bx)}" y="${r1(by + 3.5)}" text-anchor="middle">×${l.total}</text>` : '';
        return `<g class="ag-e${on}" data-from="${esc(l.from)}" data-to="${esc(l.to)}" data-n="${l.total}"><path class="${cls}" d="M${r1(s0.x)} ${r1(s0.y)}Q${r1(c.x)} ${r1(c.y)} ${r1(s1.x)} ${r1(s1.y)}" stroke-width="${r1(w)}"/><path class="ag-ehead ag-s${slot(l.from)}" d="${head(tip.x, tip.y, ux, uy, 7 + w * 0.6, 3.2 + w * 0.5)}"/>${count}<title>${esc(text.title(l))}</title></g>`;
      })
      .join('');
    const nodes = net.nodes
      .map((node) => {
        const { x, y, r, a } = pos.get(node.key);
        const s = slot(node.key);
        const shape = node.agent
          ? `<rect class="ag-node ag-agent ag-s${s}" x="${r1(x - r)}" y="${r1(y - r)}" width="${r1(2 * r)}" height="${r1(2 * r)}" rx="${r1(r * 0.32)}"/>`
          : `<circle class="ag-node ag-person ag-s${s}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}"/>`;
        const m = mono(node);
        const initial = `<text class="ag-mono" x="${r1(x)}" y="${r1(y + (m.length > 1 ? 3.5 : 4.5))}" text-anchor="middle" style="font-size:${m.length > 1 ? 10 : 12}px">${esc(m)}</text>`;
        // el rótulo, por fuera de la elipse: a la derecha de los de la derecha, a la izquierda de los de la izquierda
        const cos = n > 1 ? Math.cos(a) : 0;
        const sin = n > 1 ? Math.sin(a) : 1;
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const lx = x + cos * (r + 7);
        const ly = y + sin * (r + 7) + (anchor === 'middle' ? (sin < 0 ? -5 : 13) : 4);
        const sub = text.sub(node);
        const label = text.label(node);
        const on = sel === node.key ? ' on sel' : sel && net.links.some((l) => (l.from === sel && l.to === node.key) || (l.to === sel && l.from === node.key)) ? ' on' : '';
        return `<g class="ag-n${on}" data-key="${esc(node.key)}" tabindex="0" role="button" aria-pressed="${sel === node.key}" aria-label="${esc((text.node ? text.node(node) : label) || label)}">${shape}${initial}<text class="ag-label" x="${r1(lx)}" y="${r1(ly)}" text-anchor="${anchor}">${esc(cut(label, 24))}${sub ? `<tspan class="ag-sub" x="${r1(lx)}" dy="13">${esc(cut(sub, 26))}</tspan>` : ''}</text><title>${esc(label + (sub ? ' · ' + sub : ''))}</title></g>`;
      })
      .join('');
    return `<svg class="ag-net${sel ? ' has-sel' : ''}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(text.aria)}">${edges}${nodes}</svg>`;
  }

  /** La línea de tiempo como SVG: una fila por participante (su marca y su nombre a la izquierda, con su color) y cada
      interacción como un trazo vertical de la fila de quien actúa (un punto de su color) a la de quien recibe (una
      punta), en su momento, con el trazo de lo que hizo como en la red. Un trazo con commit lleva `data-sha` (quien lo
      muestre lo usa para ir al grafo). `text`: { label(lane), event(e), tick(t), aria } ya traducidos; se escapa aquí.
      `sel`: el participante elegido, si lo hay (sus trazos quedan encendidos y los demás tenues). */
  function timelineSvg(tl, text, { width = 760, sel = null } = {}) {
    const ROW = 30;
    const LEFT = 168;
    const RIGHT = 14;
    const TOP = 10;
    const AXIS = 22;
    const height = TOP + tl.lanes.length * ROW + AXIS;
    const span = Math.max(1, tl.t1 - tl.t0);
    const pad = tl.t1 === tl.t0 ? 0.5 : 0;
    const X = (t) => LEFT + (pad || (t - tl.t0) / span) * (width - LEFT - RIGHT);
    const row = new Map(tl.lanes.map((l, i) => [l.key, i]));
    const Y = (key) => TOP + row.get(key) * ROW + ROW / 2;
    const lanes = tl.lanes
      .map((l, i) => {
        const y = TOP + i * ROW;
        const m = mono(l);
        const shape = l.agent ? `<rect class="ag-node ag-agent ag-s${l.slot}" x="6" y="${y + 6}" width="18" height="18" rx="5"/>` : `<circle class="ag-node ag-person ag-s${l.slot}" cx="15" cy="${y + 15}" r="9"/>`;
        const on = sel && sel === l.key ? ' on' : '';
        return `<g class="ag-lane${on}" data-key="${esc(l.key)}"><rect class="ag-lane-bg${i % 2 ? ' odd' : ''}" x="0" y="${y}" width="${width}" height="${ROW}"/><line class="ag-lane-line" x1="${LEFT}" x2="${width - RIGHT}" y1="${y + ROW / 2}" y2="${y + ROW / 2}"/>${shape}<text class="ag-mono" x="15" y="${y + (m.length > 1 ? 18.5 : 19)}" text-anchor="middle" style="font-size:${m.length > 1 ? 7.5 : 10}px">${esc(m)}</text><text class="ag-label ag-lane-name" x="32" y="${y + 19}">${esc(cut(text.label(l), 22))}</text><title>${esc(text.label(l))}</title></g>`;
      })
      .join('');
    // las marcas del eje: el inicio, el final y dos en medio, cada una con su texto ya traducido
    const ticks = (tl.t1 === tl.t0 ? [tl.t0] : [0, 1 / 3, 2 / 3, 1].map((f) => tl.t0 + f * span))
      .map((t, i, all) => {
        const x = X(t);
        const anchor = all.length > 1 && i === 0 ? 'start' : all.length > 1 && i === all.length - 1 ? 'end' : 'middle';
        return `<line class="ag-tick" x1="${r1(x)}" x2="${r1(x)}" y1="${TOP}" y2="${height - AXIS + 4}"/><text class="ag-axis" x="${r1(x)}" y="${height - 6}" text-anchor="${anchor}">${esc(text.tick(t))}</text>`;
      })
      .join('');
    const events = tl.events
      .map((e) => {
        const x = X(e.time);
        const y0 = Y(e.from);
        const y1 = Y(e.to);
        const dir = y1 > y0 ? 1 : -1;
        const tipY = y1 - dir * 5;
        const on = sel ? (e.from === sel || e.to === sel ? ' on' : ' off') : '';
        const sha = e.sha || e.target;
        const id = text.id ? text.id(e) : '';
        return `<g class="ag-ev ag-s${e.slot} ag-k-${e.kind}${on}"${sha ? ` data-sha="${esc(sha)}"` : ''}${id ? ` data-ev="${esc(id)}"` : ''}><line class="ag-ev-hit" x1="${r1(x)}" x2="${r1(x)}" y1="${y0}" y2="${y1}"/><line class="ag-ev-line" x1="${r1(x)}" x2="${r1(x)}" y1="${r1(y0 + dir * 4)}" y2="${r1(tipY - dir * 5)}"/><circle class="ag-ev-dot" cx="${r1(x)}" cy="${y0}" r="3.6"/><path class="ag-ev-tip" d="${head(x, tipY, 0, dir, 6, 3.4)}"/><title>${esc(text.event(e))}</title></g>`;
      })
      .join('');
    return `<svg class="ag-time${sel ? ' has-sel' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(text.aria)}">${lanes}${ticks}${events}</svg>`;
  }

  /** ?agents=1 (o solo ?agents): abrir el panel de interacciones al cargar el repo. 0, false, no u off lo apagan. */
  function openParam(q) {
    return !!q && typeof q.has === 'function' && q.has('agents') && !/^(0|false|no|off)$/i.test(String(q.get('agents')).trim());
  }

  /** ?interactions=1 (o solo ?interactions): las interacciones sobre el grafo; 0, false, no u off las apagan; sin el
      parámetro, null (manda lo que se guardó). */
  function graphParam(q) {
    if (!q || typeof q.has !== 'function' || !q.has('interactions')) return null;
    return !/^(0|false|no|off)$/i.test(String(q.get('interactions')).trim());
  }

  /** La dirección de una sesión de Claude Code, armada solo con su id (nunca con lo que traiga el commit). */
  const sessionUrl = (agent) => (agent?.id === 'claude' && agent.session && /^[A-Za-z0-9_-]{4,80}$/.test(agent.session) ? `https://claude.ai/code/session_${agent.session}` : null);

  /** Un id de sesión, corto para mostrar: los últimos 6 caracteres (los primeros suelen repetirse entre sesiones). */
  const shortSession = (s) => (s ? String(s).slice(-6) : '');

  GB.agents = { detect, detectActor, of, coAuthors, sessionOf, compute, network, overlay, svg, timeline, timelineSvg, slots, mono, mainKind, openParam, graphParam, prNumber, sessionUrl, shortSession, COLORS, OTHERS, KNOWN: KNOWN.map((k) => k.id) };
})(window.GB);
