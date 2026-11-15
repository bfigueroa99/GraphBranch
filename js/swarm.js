/* GraphBranch — el enjambre: la vista de agentes como una consola en vivo. Sobre lo que ya calculó agents.js
   (compute, con todas las interacciones) y lo cargado del repo arma lo que muestra la consola, sin ninguna consulta:
     - los indicadores con su curva (commits de agentes, interacciones, CI verde, agentes activos, PRs en cola, los que
       esperan tu sí y el último latido), en una ventana que se ajusta a la actividad (24 h, 7 d, 30 d o un año);
     - el rol de cada participante (escribe, integra, revisa o comenta: lo que más hizo) y su lugar en la corteza 3D,
       el lóbulo de su rol, con quien más integra (el orquestador) al centro;
     - el ingreso de tareas (los PRs abiertos y las ramas sin PR, a quién le tocó cada una), el hilo de un agente (sus
       commits y sus interacciones, como una conversación), el ritmo y el log en vivo.
   Todo texto que sale de aquí es dato del repo: quien lo muestre lo escapa. */
(function (GB) {
  'use strict';

  const H = 36e5;
  /** Las ventanas posibles, de la más corta a la más larga: `n` tramos de `span / n`. */
  const WINDOWS = [
    { span: 24 * H, n: 24 }, // 24 h, de a una hora
    { span: 7 * 24 * H, n: 28 }, // 7 días, de a 6 h
    { span: 30 * 24 * H, n: 30 }, // 30 días, de a un día
    { span: 364 * 24 * H, n: 52 }, // un año, de a una semana
  ];
  const ENOUGH = 8; // cuánta actividad de agentes pide una ventana para no pasar a la siguiente
  const ACTIVE = 24 * H; // un agente está activo si hizo algo en las últimas 24 h
  /** Los roles, en el orden en que ganan un empate. */
  const ROLES = ['writes', 'integrates', 'reviews', 'comments'];
  /** El centro del lóbulo de cada rol, en la corteza (x: de izquierda a derecha, y: hacia arriba, z: hacia adelante).
      Escribe: temporal (a los lados, un hemisferio y el otro); integra: frontal; revisa: occipital; comenta: parietal. */
  const LOBES = {
    writes: [0.62, -0.2, 0.12],
    integrates: [0, 0.3, 0.6],
    reviews: [0, 0.1, -0.72],
    comments: [0, 0.56, -0.22],
  };
  /** Los radios de la corteza (media anchura, media altura, medio largo): todo lugar cae dentro. */
  const SHAPE = [0.82, 0.66, 1];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  const clean = (s, max = 140) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const firstLine = (msg) => clean(String(msg || '').split('\n')[0]);
  const isMerge = (c) => (c?.parents || []).length > 1;

  /** La ventana que se muestra: la más corta, terminada en `now`, con al menos ENOUGH de los momentos `times` (o con
      todos los que caben en la más larga). { t0, t1, step, n, span }. */
  function windowFor(times, now = Date.now()) {
    const inside = (w) => times.reduce((k, t) => k + (t > now - w.span && t <= now ? 1 : 0), 0);
    const want = Math.min(ENOUGH, inside(WINDOWS[WINDOWS.length - 1]));
    const w = WINDOWS.find((x) => want && inside(x) >= want) || WINDOWS[WINDOWS.length - 1];
    return { t0: now - w.span, t1: now, step: w.span / w.n, n: w.n, span: w.span };
  }

  /** Cuántos de los momentos `times` caen en cada tramo de la ventana. */
  function series(win, times) {
    const out = new Array(win.n).fill(0);
    for (const t of times) {
      if (!(t > win.t0 && t <= win.t1)) continue;
      out[Math.min(win.n - 1, Math.floor((t - win.t0) / win.step))]++;
    }
    return out;
  }

  const agentKeys = (res) => new Set((res?.actors || []).filter((a) => a.agent).map((a) => a.key));

  /** El rol de cada participante: lo que más hizo (escribir commits que no son merges, integrar el trabajo de otros,
      revisar o comentar sus PRs). Map key -> { role, counts }. */
  function roles(res, data) {
    const out = new Map();
    for (const a of res?.actors || []) out.set(a.key, { role: 'writes', counts: { writes: 0, integrates: 0, reviews: 0, comments: 0 } });
    const commits = data?.commits || new Map();
    for (const [sha, key] of res?.owners || []) if (out.has(key) && !isMerge(commits.get(sha))) out.get(key).counts.writes++;
    for (const l of res?.links || []) {
      const x = out.get(l.from);
      if (!x) continue;
      x.counts.integrates += l.kinds.merged || 0;
      x.counts.reviews += l.kinds.reviewed || 0;
      x.counts.comments += l.kinds.commented || 0;
    }
    for (const x of out.values()) x.role = ROLES.reduce((best, r) => (x.counts[r] > x.counts[best] ? r : best), ROLES[0]);
    return out;
  }

  /** El orquestador: entre `keys` (o todos), quien más integra el trabajo de otros. null si nadie integra nada. */
  function hub(roleMap, keys = null) {
    let best = null;
    for (const [key, x] of roleMap) {
      if (keys && !keys.includes(key)) continue;
      if (x.role === 'integrates' && x.counts.integrates > (best ? roleMap.get(best).counts.integrates : 0)) best = key;
    }
    return best;
  }

  /** El lugar de cada uno en la corteza (Map key -> [x, y, z], dentro de SHAPE): el orquestador al centro y cada uno de
      los demás en el lóbulo de su rol, alternando hemisferios y en espiral si son varios. Sigue el orden de `keys`. */
  function place(keys, roleMap, hubKey = null) {
    const pos = new Map();
    const seen = { writes: 0, integrates: 0, reviews: 0, comments: 0 };
    const total = { writes: 0, integrates: 0, reviews: 0, comments: 0 };
    for (const k of keys) if (k !== hubKey) total[roleMap.get(k)?.role || 'writes']++;
    for (const k of keys) {
      if (k === hubKey) {
        pos.set(k, [0, 0.04, 0.06]);
        continue;
      }
      const role = roleMap.get(k)?.role || 'writes';
      const i = seen[role]++;
      const side = i % 2 ? -1 : 1;
      const ring = Math.floor(i / 2);
      const [cx, cy, cz] = LOBES[role];
      // los del medio (frontal, occipital, parietal) se abren a los lados si son más de uno
      let x = role === 'writes' ? side * cx : total[role] > 1 ? side * 0.24 : 0;
      let y = cy;
      let z = cz;
      if (ring) {
        // en espiral alrededor del centro del lóbulo; el temporal es largo: los que escriben se reparten de adelante atrás
        const a = ring * GOLDEN * 2;
        const r = 0.17 * Math.sqrt(ring);
        y += r * Math.cos(a) * (role === 'writes' ? 0.7 : 1);
        z += r * Math.sin(a) * (role === 'writes' ? 1.6 : 1);
        x *= 1 - 0.06 * Math.min(ring, 4);
      }
      // dentro de la corteza, con margen
      const e = Math.hypot(x / SHAPE[0], y / SHAPE[1], z / SHAPE[2]);
      if (e > 0.86) {
        const s = 0.86 / e;
        x *= s;
        y *= s;
        z *= s;
      }
      pos.set(k, [round(x), round(y), round(z)]);
    }
    return pos;
  }
  const round = (v) => Math.round(v * 1000) / 1000;

  /** La cabeza de cada PR abierto en el grafo (null si su rama no está: un fork o una rama que ya no existe). */
  const prHead = (data, p) => (p?.sameRepo !== false ? data?.branches?.get?.(p.head)?.sha || null : null);

  /** Quién lleva un PR: el dueño del commit de su cabeza o, si no, su autor (si está entre los participantes). */
  function prOwner(res, data, p, byKey) {
    const head = prHead(data, p);
    const own = head ? res?.owners?.get(head) : null;
    if (own) return own;
    if (!p?.user) return null;
    const ag = GB.agents?.detectActor?.(p.user);
    const key = ag ? 'a:' + ag.id : p.user.login ? 'u:' + String(p.user.login).toLowerCase() : null;
    return key && byKey.has(key) ? key : null;
  }

  /** El estado de los checks de un PR: lo que trajo el PR o, si no, el de su rama. */
  const prCi = (data, p) => p?.ci ?? data?.ci?.get?.(p.head) ?? null;
  /** ¿Espera tu sí? Un PR de un agente, listo (no borrador) y con los checks en verde o sin checks. */
  const ready = (p, ci) => !p.draft && ci !== 'failure' && ci !== 'pending';

  /** Los indicadores de la consola. `res`: compute con todas las interacciones (`max: Infinity`); `data`: el repo.
      Devuelve { win, commits: { n, share, series }, people: { n, series }, links: { n, series }, active: { n, total },
      ci: { ok, known } | null, queue, waiting, last: { time, key } | null }. */
  function kpis(res, data, { now = Date.now() } = {}) {
    const agents = agentKeys(res);
    const commits = data?.commits || new Map();
    const agentT = [];
    const peopleT = [];
    for (const [sha, key] of res?.owners || []) {
      const t = commits.get(sha)?.date;
      if (t) (agents.has(key) ? agentT : peopleT).push(t);
    }
    const evs = (res?.events || []).filter((e) => e.time && (agents.has(e.from) || agents.has(e.to)));
    const linkT = evs.map((e) => e.time);
    const win = windowFor([...agentT, ...linkT], now);
    const sAgents = series(win, agentT);
    const sPeople = series(win, peopleT);
    const sLinks = series(win, linkT);
    const sum = (s) => s.reduce((a, b) => a + b, 0);
    const nA = sum(sAgents);
    const nP = sum(sPeople);

    // el último latido de cada agente: su último commit o lo último que hizo él
    const lastOf = new Map();
    const beat = (key, t) => {
      if (agents.has(key) && t && t <= now && t > (lastOf.get(key) || 0)) lastOf.set(key, t);
    };
    for (const a of res?.actors || []) beat(a.key, a.last);
    for (const e of evs) beat(e.from, e.time);
    let last = null;
    for (const [key, time] of lastOf) if (!last || time > last.time) last = { time, key };

    // CI: las ramas cuya cabeza es de un agente
    let ok = 0;
    let known = 0;
    for (const [name, b] of data?.branches || []) {
      if (!agents.has(res?.owners?.get(b?.sha))) continue;
      const st = data?.ci?.get?.(name);
      if (st === 'success' || st === 'failure') {
        known++;
        if (st === 'success') ok++;
      }
    }

    // la cola: los PRs abiertos que lleva un agente; esperan tu sí los que están listos
    const byKey = new Map((res?.actors || []).map((a) => [a.key, a]));
    let queue = 0;
    let waiting = 0;
    for (const p of data?.pulls?.values?.() || []) {
      if (!agents.has(prOwner(res, data, p, byKey))) continue;
      queue++;
      if (ready(p, prCi(data, p))) waiting++;
    }

    return {
      win,
      commits: { n: nA, share: nA + nP ? nA / (nA + nP) : null, series: sAgents },
      people: { n: nP, series: sPeople },
      links: { n: sum(sLinks), series: sLinks },
      active: { n: [...lastOf.values()].filter((t) => t > now - ACTIVE).length, total: agents.size },
      ci: known ? { ok, known } : null,
      queue,
      waiting,
      last,
    };
  }

  /** El ingreso de tareas: cada PR abierto y cada rama sin PR (salvo la principal), a quién le tocó y en qué está, de lo
      más nuevo a lo más viejo. Devuelve { items: [{ kind: 'pr'|'draft'|'branch', number, title, branch, sha, who,
      agent, ci, waiting, time }] (hasta `max`), routed (cuántas lleva un agente), total }. */
  function ingest(res, data, { max = 10 } = {}) {
    const byKey = new Map((res?.actors || []).map((a) => [a.key, a]));
    const commits = data?.commits || new Map();
    const items = [];
    const withPr = new Set();
    for (const p of data?.pulls?.values?.() || []) {
      if (p?.number == null) continue;
      const sha = prHead(data, p);
      if (sha) withPr.add(p.head);
      const who = prOwner(res, data, p, byKey);
      const agent = !!byKey.get(who)?.agent;
      const ci = prCi(data, p);
      items.push({ kind: p.draft ? 'draft' : 'pr', number: p.number, title: clean(p.title) || firstLine(commits.get(sha)?.message), branch: clean(p.head, 120), sha, who, agent, ci, waiting: agent && ready(p, ci), time: Math.max(commits.get(sha)?.date || 0, p.createdAt || 0) });
    }
    const main = data?.repo?.defaultBranch;
    for (const [name, b] of data?.branches || []) {
      if (name === main || withPr.has(name) || !b?.sha) continue;
      const c = commits.get(b.sha);
      if (!c) continue;
      const who = res?.owners?.get(b.sha) || null;
      items.push({ kind: 'branch', number: null, title: firstLine(c.message), branch: clean(name, 120), sha: b.sha, who, agent: !!byKey.get(who)?.agent, ci: data?.ci?.get?.(name) ?? null, waiting: false, time: c.date || 0 });
    }
    items.sort((x, y) => y.time - x.time || (x.branch < y.branch ? -1 : 1));
    return { items: items.slice(0, max), routed: items.filter((x) => x.agent).length, total: items.length };
  }

  /** Las líneas de un participante (o de todos los agentes, con `key` null), de la más vieja a la más nueva: sus
      commits ({ type: 'commit', time, key, sha, text, merge }) y sus interacciones ({ type: 'event', time, key, kind,
      from, to, sha, number }). Un merge que ya cuenta como «fusionó» no se repite como commit. Las `max` más nuevas. */
  function lines(res, data, key = null, { max = 14 } = {}) {
    const agents = agentKeys(res);
    const mine = (k) => (key ? k === key : agents.has(k));
    const commits = data?.commits || new Map();
    const out = [];
    const merged = new Set();
    for (const e of res?.events || []) {
      if (!(mine(e.from) || mine(e.to))) continue;
      out.push({ type: 'event', time: e.time || 0, key: e.from, kind: e.kind, from: e.from, to: e.to, sha: e.sha || e.target || null, number: e.number ?? null });
      if (e.kind === 'merged' && e.sha) merged.add(e.sha);
    }
    for (const [sha, k] of res?.owners || []) {
      if (!mine(k) || merged.has(sha)) continue;
      const c = commits.get(sha);
      if (c) out.push({ type: 'commit', time: c.date || 0, key: k, sha, text: firstLine(c.message), merge: isMerge(c) });
    }
    out.sort((x, y) => x.time - y.time || (x.type === y.type ? 0 : x.type === 'commit' ? -1 : 1));
    return out.slice(-max);
  }

  /** Los agentes con más commits (hasta `max`, y solo los que tienen alguno): { key, commits, links }, para las barras
      «por agente». */
  function perAgent(res, { max = 6 } = {}) {
    return (res?.actors || [])
      .filter((a) => a.agent && a.commits)
      .sort((x, y) => y.commits - x.commits || y.links - x.links || (x.name < y.name ? -1 : 1))
      .slice(0, max)
      .map((a) => ({ key: a.key, commits: a.commits, links: a.links }));
  }

  /* ---------- dibujos (SVG en texto, como en agents.js) ---------- */

  const r1 = (x) => Math.round(x * 10) / 10;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  /** El trazo de una serie dentro de un rectángulo: [línea, área]. Una serie de ceros queda al ras del suelo. */
  function path(s, w, h, top = 2, max = null) {
    const m = Math.max(1, max ?? Math.max(...s, 0));
    const n = Math.max(1, s.length - 1);
    const pts = s.map((v, i) => [r1((i / n) * w), r1(h - ((h - top) * v) / m)]);
    if (pts.length === 1) pts.push([w, pts[0][1]]);
    const line = 'M' + pts.map((p) => p.join(' ')).join('L');
    return [line, `${line}L${w} ${h}L0 ${h}Z`];
  }

  /** La curva chica de un indicador (decorativa: el número va al lado, en texto). */
  function spark(s, { width = 96, height = 26 } = {}) {
    const [line, area] = path(s, width, height);
    return `<svg class="sw-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="sw-spark-a" d="${area}"/><path class="sw-spark-l" d="${line}"/></svg>`;
  }

  /** El ritmo: los commits de agentes y los de personas por tramo, en la misma escala, con el eje de la ventana.
      `text`: { aria, start, end, agents, people } ya traducidos; se escapa aquí. */
  function rate(k, text, { width = 420, height = 150 } = {}) {
    const L = 30;
    const B = 22;
    const T = 8;
    const w = width - L - 6;
    const h = height - B - T;
    const max = Math.max(1, ...k.commits.series, ...k.people.series);
    const grid = [0, 0.5, 1]
      .map((f) => {
        const y = r1(T + h - h * f);
        return `<line class="sw-grid" x1="${L}" x2="${width - 6}" y1="${y}" y2="${y}"/><text class="sw-axis" x="${L - 5}" y="${r1(y + 3.5)}" text-anchor="end">${Math.round(max * f)}</text>`;
      })
      .join('');
    const [aLine, aArea] = path(k.commits.series, w, h, 0, max);
    const [pLine] = path(k.people.series, w, h, 0, max);
    return (
      `<svg class="sw-rate" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(text.aria)}">${grid}` +
      `<g transform="translate(${L} ${T})"><path class="sw-rate-a" d="${aArea}"/><path class="sw-rate-l" d="${aLine}"/><path class="sw-rate-p" d="${pLine}"/></g>` +
      `<text class="sw-axis" x="${L}" y="${height - 6}">${esc(text.start)}</text><text class="sw-axis" x="${width - 6}" y="${height - 6}" text-anchor="end">${esc(text.end)}</text>` +
      `</svg>`
    );
  }

  /* ---------- la nube de la corteza (la misma en 3D y en los cortes) ---------- */

  /** Un generador pseudoaleatorio con semilla (mulberry32): la corteza sale igual cada vez. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Los puntos de la corteza: dos hemisferios con circunvoluciones (dentro de SHAPE), y debajo el cerebelo, atrás, y el
      tronco, que baja del centro. Un Float32Array de x, y, z (n puntos). */
  function cloud(n = 6000, seed = 7) {
    const rand = rng(seed);
    const out = new Float32Array(n * 3);
    const [RX, RY, RZ] = SHAPE;
    for (let i = 0; i < n; i++) {
      const part = rand();
      let x;
      let y;
      let z;
      if (part < 0.84) {
        // corteza: cerca de la superficie, con surcos
        const u = rand() * 2 - 1;
        const th = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        let dx = s * Math.cos(th);
        const dy = u;
        const dz = s * Math.sin(th);
        if (Math.abs(dx) < 0.04) dx = dx < 0 ? -0.04 : 0.04;
        const side = Math.sign(dx);
        const gyri = 1 + 0.075 * Math.sin(12 * dy + 10 * dz + side * 2.1) * Math.sin(11 * dz - 8 * dx + 1.3);
        const depth = rand() < 0.86 ? 0.94 + 0.06 * rand() : 0.35 + 0.55 * rand();
        x = dx * RX * gyri * depth + side * 0.05;
        y = dy * RY * gyri * depth;
        z = dz * RZ * gyri * depth;
        if (y < -0.3) y = -0.3 + (y + 0.3) * 0.55; // la base, más plana
        if (y < 0 && z > -0.2 && z < 0.55) x *= 1.06; // el lóbulo temporal
        const e = Math.hypot(x / RX, y / RY, z / RZ);
        if (e > 0.995) {
          x *= 0.995 / e;
          y *= 0.995 / e;
          z *= 0.995 / e;
        }
      } else if (part < 0.96) {
        // cerebelo: atrás y abajo, con láminas finas
        const u = rand() * 2 - 1;
        const th = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const folia = 1 + 0.06 * Math.sin(u * 26);
        const d = rand() < 0.8 ? 0.9 + 0.1 * rand() : 0.5 * rand() + 0.3;
        x = s * Math.cos(th) * 0.48 * folia * d;
        y = -0.42 + u * 0.18 * folia * d;
        z = -0.62 + s * Math.sin(th) * 0.26 * folia * d;
      } else {
        // tronco: baja del centro
        const t = rand();
        const th = rand() * Math.PI * 2;
        const r = 0.07 + 0.03 * rand();
        x = Math.cos(th) * r;
        y = -0.18 - t * 0.62;
        z = -0.18 - t * 0.12 + Math.sin(th) * r;
      }
      out[i * 3] = x;
      out[i * 3 + 1] = y;
      out[i * 3 + 2] = z;
    }
    return out;
  }

  GB.swarm = { windowFor, series, roles, hub, place, kpis, ingest, lines, perAgent, spark, rate, cloud, rng, WINDOWS, ROLES, LOBES, SHAPE };
})(window.GB);
