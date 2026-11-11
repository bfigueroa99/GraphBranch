/* GraphBranch — salud del repo: lo que ya está cargado, leído como señales de equipo.
   Ramas sin actividad hace más de 30 días y sin PR, pull requests abiertos por edad y por estado (borrador, checks en rojo, aprobado, esperando revisión), cuánto tardaron
   en fusionarse los últimos, el ritmo de merges y releases y, los PRs fusionados y abiertos, los issues cerrados y las ramas nuevas y los commits y sus autores distintos por semana y, en el idioma de DORA, la frecuencia de
   despliegues (cada release cuenta como uno, también por semana) y el tiempo de entrega (de abierto a fusionado), el estado del último despliegue de cada entorno y las estrellas nuevas de la semana frente a las de la anterior. No hace ninguna consulta: parte del
   estado del grafo y de la actividad que ya llegó, y cuenta lo que pasa en el repo, no a personas. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const STALE_DAYS = 30;
  const RECENT_MERGES = 20; // cuántos PRs fusionados entran en el tiempo de abierto a fusionado
  const RECENT_RELEASES = 10; // cuántos releases entran en el tiempo entre despliegues
  const WEEKS = 8; // semanas que entran en la frecuencia de despliegue y en las tendencias de merges, de PRs abiertos, de issues cerrados, de ramas nuevas, de commits y de autores
  const ROWS = 8; // filas que muestra cada lista

  const at = (x) => (typeof x === 'number' ? x : Date.parse(x) || 0);
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** Cuenta los eventos (releases, PRs fusionados, PRs abiertos, issues cerrados o ramas creadas) de cada una de las últimas WEEKS semanas (bloques de 7 días hacia atrás desde `now`). */
  function weekly(list, now) {
    const weeks = new Array(WEEKS).fill(0);
    for (const a of list) {
      if (a.time > now) continue;
      const k = Math.floor((now - a.time) / (7 * DAY));
      if (k < WEEKS) weeks[WEEKS - 1 - k]++;
    }
    return weeks;
  }

  /** Cuántos autores distintos hicieron commits en cada una de las últimas WEEKS semanas, con los commits
      cargados. Un autor es su usuario o, sin usuario, su nombre (como en la búsqueda por autor); un commit
      sin autor no suma. Cuenta personas distintas, nunca cuánto hizo cada una. */
  function authorsWeekly(commits, now) {
    const weeks = Array.from({ length: WEEKS }, () => new Set());
    for (const c of commits) {
      const time = at(c?.date);
      const key = String(c?.author?.login || c?.author?.name || '').trim().toLowerCase();
      if (!time || !key || time > now) continue;
      const k = Math.floor((now - time) / (7 * DAY));
      if (k < WEEKS) weeks[WEEKS - 1 - k].add(key);
    }
    return weeks.map((w) => w.size);
  }

  /** El estado del último despliegue de un entorno con lo ya cargado: `current` si su commit es la punta de su rama
      (la de `ref` si está cargada, si no la rama por defecto), `behind` con cuántos commits lleva la rama que el
      despliegue no tiene (como `git rev-list desplegado..rama`), y `unknown` si la rama no está cargada o su historia
      cargada no contiene el commit desplegado (otra rama, un tag, historia reescrita o aún sin cargar). Sin consultas. */
  function deployState(data, d) {
    const branch = (d.ref && data.branches.get(d.ref)) || data.branches.get(data.repo?.defaultBranch);
    if (!branch) return { state: 'unknown', branch: null };
    if (branch.sha === d.sha) return { state: 'current', branch: branch.name };
    const walk = (from) => {
      const seen = new Set();
      const stack = [from];
      while (stack.length) {
        const s = stack.pop();
        if (seen.has(s)) continue;
        const c = data.commits.get(s);
        if (!c) continue;
        seen.add(s);
        for (const p of c.parents || []) stack.push(p);
      }
      return seen;
    };
    const tip = walk(branch.sha);
    if (!tip.has(d.sha)) return { state: 'unknown', branch: null };
    const deployed = walk(d.sha);
    let behind = 0;
    for (const s of tip) if (!deployed.has(s)) behind++;
    return { state: 'behind', branch: branch.name, behind };
  }

  /** El estado de un despliegue como lo da GitHub (`/deployments/:id/statuses`) en tres: `ok` (salió bien), `failed`
      (falló o dio error) y `running` (en cola, pendiente o en curso); `null` si no se sabe o ya no está activo. */
  function deployOutcome(state) {
    if (state === 'success') return 'ok';
    if (state === 'failure' || state === 'error') return 'failed';
    if (state === 'queued' || state === 'pending' || state === 'in_progress') return 'running';
    return null;
  }

  /** `data`: el estado del repo (ramas, commits, PRs abiertos); `acts`: su actividad ya cargada.
      Devuelve las listas ordenadas (lo peor primero) con su total, y el ritmo. */
  function compute(data, acts = [], now = Date.now(), forkSort = 'recent') {
    const withPr = new Set();
    for (const p of data.pulls.values()) if (p.sameRepo && p.head) withPr.add(p.head);

    const stale = [];
    for (const b of data.branches.values()) {
      if (b.isDefault || b.name === data.repo.defaultBranch || withPr.has(b.name)) continue;
      const date = at(data.commits.get(b.sha)?.date); // sin historia aún: no se sabe su edad
      if (date && now - date > STALE_DAYS * DAY) stale.push({ name: b.name, date, idle: now - date });
    }
    stale.sort((a, b) => b.idle - a.idle);

    const prs = [...data.pulls.values()]
      .filter((p) => p.createdAt)
      .map((p) => ({ number: p.number, title: p.title, head: p.sameRepo ? p.head : null, draft: !!p.draft, url: p.url, age: now - at(p.createdAt) }))
      .sort((a, b) => b.age - a.age);

    // estado de cada PR: borrador, con los checks en rojo, aprobado o esperando revisión (en ese orden de precedencia)
    const states = { draft: [], failing: [], approved: [], waiting: [] };
    for (const r of prs) {
      const p = data.pulls.get(r.number);
      const ci = p.ci || (p.sameRepo && data.ci?.get(p.head)) || null;
      const key = r.draft ? 'draft' : ci === 'failure' ? 'failing' : p.review === 'approved' ? 'approved' : 'waiting';
      states[key].push({ ...r, state: key });
    }
    const prStates = {};
    for (const k in states) prStates[k] = { total: states[k].length, rows: states[k].slice(0, ROWS) };

    const seen = new Set();
    const merges = acts.filter((a) => a.kind === 'pr-merge' && a.time && !seen.has(a.id) && seen.add(a.id));
    // PRs abiertos: cada número cuenta una vez, con la hora de su primera apertura (un `pr-open`, o el `openedAt` de su merge)
    const opened = new Map();
    for (const a of acts) {
      const t = a.kind === 'pr-open' ? a.time : a.kind === 'pr-merge' ? a.openedAt : 0;
      if (!t) continue;
      const k = a.number != null ? `#${a.number}` : a.id;
      if (!opened.has(k) || t < opened.get(k).time) opened.set(k, { time: t });
    }
    // issues cerrados: cada número cuenta una vez, con la hora de su primer cierre (un issue reabierto y cerrado de nuevo no suma dos)
    const closed = new Map();
    for (const a of acts) {
      if (a.kind !== 'issue-close' || !a.time) continue;
      const k = a.number != null ? `#${a.number}` : a.id;
      if (!closed.has(k) || a.time < closed.get(k).time) closed.set(k, { time: a.time });
    }
    // issues abiertos: cada número cuenta una vez, con la hora de su primera apertura (un issue reabierto no suma dos)
    const issueOpened = new Map();
    for (const a of acts) {
      if (a.kind !== 'issue-open' || !a.time) continue;
      const k = a.number != null ? `#${a.number}` : a.id;
      if (!issueOpened.has(k) || a.time < issueOpened.get(k).time) issueOpened.set(k, { time: a.time });
    }
    // PRs cerrados sin fusionar: cada número cuenta una vez, con la hora de su primer cierre; uno que el feed también vio
    // fusionado no entra (un cierre y un merge del mismo número es un PR fusionado)
    const mergedNums = new Set(acts.filter((a) => a.kind === 'pr-merge' && a.number != null).map((a) => `#${a.number}`));
    const prClosed = new Map();
    for (const a of acts) {
      if (a.kind !== 'pr-close' || !a.time) continue;
      const k = a.number != null ? `#${a.number}` : a.id;
      if (mergedNums.has(k)) continue;
      if (!prClosed.has(k) || a.time < prClosed.get(k).time) prClosed.set(k, { time: a.time });
    }
    // ramas nuevas: cada nombre cuenta una vez, con la hora de su primera creación (la misma rama vista por el feed de
    // eventos y por la comparación en vivo, o borrada y creada otra vez, no suma dos)
    const created = new Map();
    for (const a of acts) {
      if (a.kind !== 'branch-create' || !a.time) continue;
      const k = a.branch ? `b:${a.branch}` : a.id;
      if (k == null) continue;
      if (!created.has(k) || a.time < created.get(k).time) created.set(k, { time: a.time });
    }
    // estrellas nuevas: cada usuario cuenta una vez, con la hora de su primera estrella vista (quitarla y volver a ponerla no
    // suma dos); sin usuario, cada actividad cuenta sola
    const starred = new Map();
    for (const a of acts) {
      if (a.kind !== 'star' || !a.time) continue;
      const login = String(a.actor?.login || '').trim().toLowerCase();
      const k = login ? `u:${login}` : a.id;
      if (k == null) continue;
      if (!starred.has(k) || a.time < starred.get(k).time) starred.set(k, { time: a.time });
    }
    const starWeeks = weekly([...starred.values()], now);
    // el tiempo de entrega cuenta desde el primer commit del PR si ya se conoce (data.firstCommits), si no desde su apertura
    let fromCommit = 0;
    const lead = merges
      .filter((a) => a.openedAt && a.time > a.openedAt)
      .sort((a, b) => b.time - a.time)
      .slice(0, RECENT_MERGES)
      .map((a) => {
        const first = data.firstCommits?.get(a.number);
        if (first && first < a.time) {
          fromCommit++;
          return a.time - first;
        }
        return a.time - a.openedAt;
      });
    const spans = merges
      .filter((a) => a.openedAt && a.time > a.openedAt)
      .sort((a, b) => b.time - a.time)
      .slice(0, RECENT_MERGES)
      .map((a) => a.time - a.openedAt);
    const within = (list, days) => list.filter((a) => now - a.time <= days * DAY && a.time <= now).length;
    const releases = acts.filter((a) => a.kind === 'release' && a.time && !seen.has(a.id) && seen.add(a.id));

    // frecuencia de despliegues: los releases ya vistos; el hueco es la mediana entre los últimos RECENT_RELEASES
    const relTimes = releases.map((a) => a.time).filter((x) => x <= now).sort((a, b) => b - a).slice(0, RECENT_RELEASES);
    const gaps = relTimes.slice(1).map((x, i) => relTimes[i] - x).filter((g) => g > 0);
    const dora = {
      deploys30: within(releases, 30),
      gap: gaps.length ? median(gaps) : null,
      lead: lead.length ? median(lead) : null,
      weeks: weekly(releases, now), // despliegues por semana, de la más vieja (a la izquierda) a la actual
    };

    // tasa de fallos de CI: de los PRs abiertos con checks conocidos, cuántos están en rojo; y cuántas veces
    // la rama por defecto pasó a rojo en los últimos 30 días, según la actividad ya cargada
    let withCi = 0;
    let failing = 0;
    for (const p of data.pulls.values()) {
      const ci = p.ci || (p.sameRepo && data.ci?.get(p.head)) || null;
      if (ci === 'success' || ci === 'failure') {
        withCi++;
        if (ci === 'failure') failing++;
      }
    }
    const ci = {
      prs: withCi ? { failing, total: withCi, rate: failing / withCi } : null,
      fails30: within(acts.filter((a) => a.kind === 'ci-fail' && a.time), 30),
    };

    const forks = (data.forks || []).filter((f) => f.pushedAt && f.url).map((f) => ({ fullName: f.fullName, url: f.url, idle: Math.max(0, now - at(f.pushedAt)), stars: Math.max(0, Math.floor(Number(f.stars)) || 0) })).sort((a, b) => (forkSort === 'stars' ? b.stars - a.stars : 0) || a.idle - b.idle); // el push más reciente primero (o las estrellas, con el desempate por push), venga como venga la lista

    // tags por semana: cada nombre cuenta en la fecha de su commit, si ese commit está cargado
    const tagTimes = [];
    if (data.tags) for (const [sha, names] of data.tags) {
      const c = data.commits.get(sha);
      const time = c && at(c.date);
      if (time) for (const name of names) if (name) tagTimes.push({ time });
    }

    // el último despliegue de cada entorno (lo que trae la carga de despliegues), el más reciente primero
    const deploys = [...(data.deploys || [])]
      .filter(([env, d]) => env && typeof d?.sha === 'string' && d.sha)
      .map(([env, d]) => {
        const time = at(d.at) || at(data.commits.get(d.sha)?.date);
        const st = deployState(data, d);
        return { env, sha: d.sha, ref: d.ref || '', head: st.branch, state: st.state, behind: st.behind || 0, status: deployOutcome(data.deployStatus?.get(d.id)?.state ?? d.status), time, age: time && time <= now ? now - time : null };
      })
      .sort((a, b) => b.time - a.time || (a.env < b.env ? -1 : 1));

    return {
      deploys: { total: deploys.length, rows: deploys.slice(0, ROWS) },
      forks: { total: forks.length, rows: forks.slice(0, ROWS) },
      stale: { total: stale.length, rows: stale.slice(0, ROWS) },
      prs: { total: prs.length, rows: prs.slice(0, ROWS) },
      prStates,
      merged: spans.length ? { n: spans.length, median: median(spans), max: Math.max(...spans) } : null,
      dora,
      leadSource: { fromCommit, total: lead.length },
      ci,
      stars: { week: starWeeks[WEEKS - 1], prev: starWeeks[WEEKS - 2] }, // estrellas nuevas en los últimos 7 días y en los 7 anteriores
      pace: { merges7: within(merges, 7), merges30: within(merges, 30), releases30: within(releases, 30), mergeWeeks: weekly(merges, now), openedWeeks: weekly([...opened.values()], now), closedWeeks: weekly([...closed.values()], now), branchWeeks: weekly([...created.values()], now), commitWeeks: weekly([...data.commits.values()].map((c) => ({ time: at(c.date) })).filter((c) => c.time), now), authorWeeks: authorsWeekly(data.commits.values(), now), tagWeeks: weekly(tagTimes, now), issueWeeks: weekly([...issueOpened.values()], now), prCloseWeeks: weekly([...prClosed.values()], now) }, // mergeWeeks, openedWeeks, closedWeeks y branchWeeks: de la semana más vieja a la actual
    };
  }

  /** Archivos que tocan a la vez varias ramas abiertas. `entries`: `[{ name, files: [ruta] }]`, lo que
      cada rama cambió respecto de la rama por defecto. Primero los más disputados. */
  function clashes(entries) {
    const by = new Map();
    for (const e of entries) for (const path of new Set(e.files)) (by.get(path) || by.set(path, []).get(path)).push(e.name);
    const rows = [...by]
      .filter(([, names]) => names.length > 1)
      .map(([path, branches]) => ({ path, branches: branches.sort() }))
      .sort((a, b) => b.branches.length - a.branches.length || (a.path < b.path ? -1 : 1));
    return { total: rows.length, rows: rows.slice(0, ROWS * 2) };
  }

  /** Ramas que se comparan: las de los PRs abiertos del mismo repo (su rama por defecto no cuenta). */
  function clashCandidates(data, max = 20) {
    const names = new Set();
    for (const p of data.pulls.values()) if (p.sameRepo && p.head && p.head !== data.repo.defaultBranch && data.branches.has(p.head)) names.add(p.head);
    return [...names].slice(0, max);
  }

  /** Comparar dos ramas con lo ya cargado: cuántos commits lleva cada una por delante, y desde dónde
      se separaron (el ancestro común más nuevo). `partial` avisa que alguna historia llegó incompleta
      (un padre que no está cargado), así que las cuentas pueden quedar cortas. */
  function compare(data, a, b) {
    const ba = data.branches.get(a);
    const bb = data.branches.get(b);
    if (!ba || !bb) return null;
    let partial = false;
    const anc = (sha) => {
      const seen = new Set();
      const stack = [sha];
      while (stack.length) {
        const s = stack.pop();
        if (seen.has(s)) continue;
        const c = data.commits.get(s);
        if (!c) {
          partial = true;
          continue;
        }
        seen.add(s);
        for (const p of c.parents || []) stack.push(p);
      }
      return seen;
    };
    const sa = anc(ba.sha);
    const sb = anc(bb.sha);
    const only = (x, y) => [...x].filter((s) => !y.has(s));
    const common = [...sa].filter((s) => sb.has(s));
    // el punto de separación: un ancestro común que ningún otro común tiene por descendiente
    const covered = new Set();
    for (const s of common) for (const p of data.commits.get(s).parents || []) if (sb.has(p) && sa.has(p)) covered.add(p);
    const tips = common.filter((s) => !covered.has(s));
    tips.sort((x, y) => (data.commits.get(y).date || 0) - (data.commits.get(x).date || 0) || (x < y ? -1 : 1));
    const base = tips[0] ? data.commits.get(tips[0]) : null;
    return {
      a: { name: a, ahead: only(sa, sb).length, shas: only(sa, sb) },
      b: { name: b, ahead: only(sb, sa).length, shas: only(sb, sa) },
      base: base ? { sha: base.sha, message: String(base.message || '').split('\n')[0], date: base.date } : null,
      partial,
    };
  }

  /** Archivos que cambió cada rama respecto de la rama por defecto: solo en A, solo en B y en las dos. */
  function splitFiles(filesA, filesB) {
    const sa = new Set(filesA);
    const sb = new Set(filesB);
    const list = (xs, not) => [...xs].filter((p) => !not.has(p)).sort();
    return { onlyA: list(sa, sb), onlyB: list(sb, sa), both: [...sa].filter((p) => sb.has(p)).sort() };
  }

  /** ?conflicts=1 (o cualquier valor que no sea 0, false, no u off): abrir la salud con los choques ya buscados. */
  function conflictsParam(q) {
    if (!q || typeof q.has !== 'function' || !q.has('conflicts')) return false;
    return !/^(0|false|no|off)$/i.test(String(q.get('conflicts')).trim());
  }

  /** ?health=1 (o solo ?health): abrir el panel al cargar el repo, para compartir la vista. 0, false, no u off lo apagan. */
  function healthParam(q) {
    return !!q && q.has('health') && !/^(0|false|no|off)$/i.test(String(q.get('health')).trim());
  }

  /** ?forks=0 (o false, no u off): el panel de salud no muestra los forks ni los pide. Sin el parámetro, se muestran. */
  function forksParam(q) {
    return !(q && typeof q.has === 'function' && q.has('forks') && /^(0|false|no|off)$/i.test(String(q.get('forks')).trim()));
  }

  GB.health = { compute, clashes, clashCandidates, compare, conflictsParam, healthParam, forksParam, splitFiles, STALE_DAYS };
})(window.GB);
