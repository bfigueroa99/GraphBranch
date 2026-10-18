/* GraphBranch — bitácora en vivo: lo que hizo el repo desde la bitácora anterior, con la forma de las
   bitácoras de Brunell_Node. La ventana va desde que se cerró la última (o, la primera vez, los últimos
   7 días) hasta ahora, y dice qué fue lo grande, cuántos commits hubo cada día y cuántos ya llegaron a la
   rama por defecto, qué hallazgos frenan al repo (con su gravedad), cómo siguen los de la bitácora
   anterior, una nota del 1 al 100 que dice de dónde sale cada punto, la cronología día por día y qué
   sigue. No hace ninguna consulta: parte de lo ya cargado y se recalcula con cada novedad. Cerrar una
   bitácora la guarda (solo en este navegador) y empieza la siguiente. Describe el repositorio, nunca a
   personas: no cuenta quién hizo qué. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const WINDOW_DAYS = 7; // sin bitácora anterior, la ventana son los últimos 7 días
  const MAX_DAYS = 35; // días que entran en el gráfico, el ritmo y la cronología (de una ventana más larga, los últimos)
  const STALE_DAYS = 30; // una rama sin PR y sin commits hace más que esto está olvidada
  const WAIT_DAYS = 7; // un PR listo para revisar que espera más que esto es un hallazgo
  const ROWS = 6; // filas que muestra cada hallazgo
  const TAGS = 6; // etiquetas por día de la cronología
  const NEXT = 5; // pasos en «qué sigue»
  const KEEP = 26; // bitácoras cerradas que se guardan por repo: medio año, si se cierra una por semana
  const WALK = 50000; // tope de commits por recorrido del grafo
  const SEV = ['alto', 'medio', 'bajo'];
  const PTS = { alto: 20, medio: 10, bajo: 4 }; // lo que cada hallazgo le resta a la salud
  const STATES = ['sigue', 'a-medias', 'nuevo', 'arreglado'];
  // qué cuenta como titular de un día, de más a menos importante
  const HEADLINE = ['release', 'pr-merge', 'ci-fail', 'pr-open', 'branch-create', 'force', 'branch-delete-unmerged'];

  const at = (x) => (typeof x === 'number' ? x : Date.parse(x) || 0);
  const dayStart = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  // el día siguiente a medianoche local: sumar 24 h se corre de día con el cambio de hora
  const nextDay = (ms) => {
    const d = new Date(ms);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const firstLine = (s) => String(s ?? '').split('\n')[0].trim();
  const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
  const num = (x) => typeof x === 'number' && Number.isFinite(x);

  /** Los commits alcanzables desde `starts` entre los ya cargados, sin pasar por los de `stop`. */
  function reach(commits, starts, stop = null, into = new Set()) {
    const stack = starts.filter(Boolean);
    let steps = 0;
    while (stack.length && steps++ < WALK) {
      const s = stack.pop();
      if (into.has(s) || (stop && stop.has(s))) continue;
      const c = commits.get(s);
      if (!c) continue;
      into.add(s);
      for (const p of c.parents || []) stack.push(p);
    }
    return into;
  }

  /** Cuántos commits trajo a la rama por defecto cada commit de su historia de primeros padres dentro de la
      ventana (un merge, los de la rama que unió; un commit directo o un squash, uno). Un solo recorrido. */
  function broughtByMerge(commits, baseSha, since) {
    const chain = [];
    let sha = baseSha;
    let pre = null;
    const guard = new Set();
    while (sha && !guard.has(sha) && guard.size < WALK) {
      guard.add(sha);
      const c = commits.get(sha);
      if (!c) break;
      if (at(c.date) <= since) {
        pre = sha;
        break;
      }
      chain.push(c);
      sha = (c.parents || [])[0];
    }
    const known = pre ? reach(commits, [pre]) : new Set();
    const out = new Map();
    for (const c of chain.reverse()) {
      known.add(c.sha);
      let n = 1;
      for (const p of (c.parents || []).slice(1)) {
        const before = known.size;
        reach(commits, [p], null, known);
        n += known.size - before;
      }
      out.set(c.sha, (c.parents || []).length > 1 ? n - 1 : n); // el commit de merge no es trabajo traído
    }
    return out;
  }

  /** Las bitácoras cerradas que vienen de afuera (localStorage), sin lo que no sirve. */
  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const okTitle = (x) => typeof x === 'string' || (x && typeof x === 'object' && typeof x.$i18n === 'string');
    return list
      .filter((e) => e && num(e.n) && num(e.desde) && num(e.hasta) && e.hasta >= e.desde && e.nota && num(e.nota.total))
      .map((e) => ({
        n: Math.max(1, Math.round(e.n)),
        desde: e.desde,
        hasta: e.hasta,
        titulo: okTitle(e.titulo) ? e.titulo : '',
        nota: {
          total: e.nota.total,
          ritmo: num(e.nota.ritmo) ? e.nota.ritmo : null,
          publicado: num(e.nota.publicado) ? e.nota.publicado : null,
          salud: num(e.nota.salud) ? e.nota.salud : null,
        },
        hallazgos: (Array.isArray(e.hallazgos) ? e.hallazgos : [])
          .filter((h) => h && typeof h.id === 'string' && SEV.includes(h.sev))
          .map((h) => ({ id: h.id, sev: h.sev, n: num(h.n) ? h.n : 1, desde: num(h.desde) ? h.desde : e.hasta })),
        cifras: e.cifras && typeof e.cifras === 'object' ? { commits: +e.cifras.commits || 0, merged: +e.cifras.merged || 0, releases: +e.cifras.releases || 0 } : { commits: 0, merged: 0, releases: 0 },
        corte: e.corte && typeof e.corte === 'object' && typeof e.corte.sha === 'string' ? { base: String(e.corte.base || ''), sha: e.corte.sha } : null,
      }))
      .sort((a, b) => a.hasta - b.hasta)
      .slice(-KEEP);
  }

  /** La bitácora en curso. `data`: el estado del repo; `acts`: su actividad ya cargada; `prev`: las cerradas
      (de la más vieja a la más nueva); `text`: pasa a texto los mensajes por traducir (i18n.text). */
  function compute(data, acts = [], { now = Date.now(), prev = [], text = (x) => (x == null ? '' : String(x)) } = {}) {
    prev = sanitize(prev);
    const last = prev[prev.length - 1] || null;
    const since = last && last.hasta < now ? last.hasta : now - WINDOW_DAYS * DAY;
    const n = (last ? last.n : 0) + 1;
    const commits = data.commits;
    const base = data.repo?.defaultBranch || null;
    const baseSha = base ? data.branches.get(base)?.sha || null : null;
    const inBase = baseSha ? reach(commits, [baseSha]) : new Set();

    // lo cargado puede no llegar al comienzo de la ventana: entonces lo de antes no cuenta, y se dice
    let oldest = null;
    const win = [];
    for (const c of commits.values()) {
      const d = at(c.date);
      if (d && (!oldest || d < at(oldest.date))) oldest = c;
      if (d > since && d <= now) win.push(c);
    }
    const partial = !!oldest && at(oldest.date) > since && (oldest.parents || []).length > 0;
    const cover = partial ? at(oldest.date) : null;
    const winSet = new Set(win.map((c) => c.sha));
    const shipped = win.filter((c) => inBase.has(c.sha)).length;

    // los días de la ventana (a lo más los últimos MAX_DAYS), con sus commits y su actividad
    const lastDay = dayStart(now);
    const cap = new Date(lastDay);
    cap.setDate(cap.getDate() - (MAX_DAYS - 1));
    const firstDay = Math.max(dayStart(since), cap.getTime());
    const days = [];
    for (let d = firstDay; d <= lastDay; d = nextDay(d)) days.push(d);
    const dayOf = (ms) => dayStart(ms);
    const byDay = new Map(days.map((d) => [d, { day: d, total: 0, inBase: 0, commits: [], acts: [] }]));
    for (const c of win) {
      const b = byDay.get(dayOf(at(c.date)));
      if (!b) continue;
      b.total++;
      if (inBase.has(c.sha)) b.inBase++;
      b.commits.push(c);
    }

    const seenIds = new Set();
    const inWin = acts.filter((a) => a && a.time > since && a.time <= now && !seenIds.has(a.id) && seenIds.add(a.id));
    for (const a of inWin) byDay.get(dayOf(a.time))?.acts.push(a);
    const of = (kind) => inWin.filter((a) => a.kind === kind).sort((x, y) => y.time - x.time);

    const brought = baseSha ? broughtByMerge(commits, baseSha, since) : new Map();
    const tagOf = (a) => (a.title && typeof a.title === 'object' && a.title.params && a.title.params.tag) || a.tag || '';
    const merged = of('pr-merge').map((a) => ({
      number: num(a.number) ? a.number : null,
      title: firstLine(text(a.detail) || text(a.title)),
      url: isUrl(a.url) ? a.url : null,
      time: a.time,
      brought: a.sha && brought.has(a.sha) ? brought.get(a.sha) : null,
    }));
    const releases = of('release').map((a) => ({ tag: String(tagOf(a)), title: firstLine(text(a.title)), detail: firstLine(text(a.detail)), url: isUrl(a.url) ? a.url : null, time: a.time }));

    // ramas que se movieron en la ventana, y la que más trabajo tiene que todavía no llegó a la rama por defecto
    let active = 0;
    let busiest = null;
    for (const b of data.branches.values()) {
      const tip = commits.get(b.sha);
      if (tip && at(tip.date) > since && at(tip.date) <= now) active++;
      if (b.name === base || b.isDefault) continue;
      let k = 0;
      const seen = new Set();
      const stack = [b.sha];
      while (stack.length) {
        const s = stack.pop();
        if (seen.has(s) || !winSet.has(s) || inBase.has(s)) continue;
        seen.add(s);
        k++;
        for (const p of commits.get(s).parents || []) stack.push(p);
      }
      if (k && (!busiest || k > busiest.commits || (k === busiest.commits && b.name < busiest.name))) busiest = { name: b.name, commits: k };
    }

    const big = releases.length
      ? { kind: 'release', ...releases[0], more: releases.length - 1 }
      : merged.length
        ? { kind: 'pr', ...[...merged].sort((a, b) => (b.brought || 0) - (a.brought || 0) || b.time - a.time)[0], base, more: merged.length - 1 }
        : busiest
          ? { kind: 'branch', name: busiest.name, commits: busiest.commits, base }
          : { kind: 'none' };

    const findings = findingsOf(data, inWin, { now, base, total: win.length });
    const was = new Map((last?.hallazgos || []).map((h) => [h.id, h]));
    for (const f of findings) f.desde = was.get(f.id)?.desde ?? now;

    // la nota: tres dimensiones medidas y su promedio
    const counted = days.filter((d) => d >= dayStart(cover ?? since));
    const activeDays = counted.filter((d) => byDay.get(d).total > 0).length;
    const minus = findings.map((f) => ({ id: f.id, sev: f.sev, pts: PTS[f.sev] }));
    const lost = minus.reduce((s, m) => s + m.pts, 0);
    const dims = {
      ritmo: { v: counted.length ? Math.round((100 * activeDays) / counted.length) : null, active: activeDays, days: counted.length },
      publicado: { v: win.length ? Math.round((100 * shipped) / win.length) : null, inBase: shipped, total: win.length, base },
      salud: { v: Math.max(0, 100 - lost), lost, minus },
    };
    const vals = Object.values(dims).map((d) => d.v).filter((v) => v != null);
    const total = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const low = Object.entries(dims)
      .filter(([, d]) => d.v != null && d.v < 100)
      .sort((a, b) => a[1].v - b[1].v)[0];

    // seguimiento: cada hallazgo de la bitácora anterior, con lo que dice hoy, y los nuevos al final
    const follow = [];
    for (const w of was.values()) {
      const f = findings.find((x) => x.id === w.id);
      follow.push({ id: w.id, sev: f ? f.sev : w.sev, state: !f ? 'arreglado' : w.n > f.n ? 'a-medias' : 'sigue', desde: w.desde, was: w.n, now: f ? f.n : 0, params: f?.params || null });
    }
    for (const f of findings) if (!was.has(f.id)) follow.push({ id: f.id, sev: f.sev, state: 'nuevo', desde: now, was: null, now: f.n, params: f.params });

    // cronología: un día por fila; los días seguidos sin nada, juntos en una
    const timeline = [];
    let gap = null;
    const loadedFrom = cover ? dayStart(cover) : -Infinity;
    for (const d of days) {
      const b = byDay.get(d);
      if (!b.total && !b.acts.length && d < loadedFrom) continue; // antes de la historia cargada no se sabe si hubo algo
      if (!b.total && !b.acts.length) {
        if (gap) gap.to = d;
        else timeline.push((gap = { gap: true, from: d, to: d }));
        continue;
      }
      gap = null;
      const count = (k) => b.acts.filter((a) => a.kind === k).length;
      let head = null;
      for (const k of HEADLINE) {
        const a = b.acts.filter((x) => x.kind === k).sort((x, y) => y.time - x.time)[0];
        if (a) {
          const title = firstLine(text(a.title));
          const detail = firstLine(text(a.detail));
          head = { kind: k, title: title || detail, detail: title ? detail : '', url: isUrl(a.url) ? a.url : null };
          break;
        }
      }
      if (!head) {
        const c = [...b.commits].sort((x, y) => at(y.date) - at(x.date))[0];
        head = c ? { kind: 'commit', title: firstLine(c.message), detail: '', url: isUrl(c.url) ? c.url : null } : { kind: 'other', title: firstLine(text(b.acts[0].title)), detail: firstLine(text(b.acts[0].detail)), url: null };
      }
      const tags = [];
      const tag = (s) => s && !tags.includes(s) && tags.length < TAGS && tags.push(s);
      for (const a of b.acts.filter((x) => x.kind === 'release')) tag(String(tagOf(a)));
      for (const a of b.acts.filter((x) => x.kind === 'pr-merge' || x.kind === 'pr-open')) if (num(a.number)) tag('#' + a.number);
      for (const a of b.acts.filter((x) => x.kind === 'branch-create')) tag(a.branch);
      timeline.push({ day: d, commits: b.total, inBase: b.inBase, merged: count('pr-merge'), releases: count('release'), head, tags });
    }

    const next = [...findings].sort((a, b) => SEV.indexOf(a.sev) - SEV.indexOf(b.sev) || b.n - a.n).slice(0, NEXT);
    const pulls = data.pulls ? [...data.pulls.values()] : [];
    return {
      n,
      since,
      now,
      base,
      baseSha,
      partial,
      cover,
      commits: win.length,
      shipped,
      pending: win.length - shipped,
      active,
      open: Math.max(data.totalPulls || 0, pulls.length),
      merged,
      releases,
      opened: of('pr-open').length,
      days: days.map((d) => ({ day: d, total: byDay.get(d).total, inBase: byDay.get(d).inBase, loaded: d >= loadedFrom })),
      big,
      findings,
      score: { total, dims, low: low ? low[0] : null },
      trend: last ? { prev: last.nota.total, n: last.n } : null,
      follow,
      timeline,
      next,
      prev,
    };
  }

  /** Los hallazgos de la ventana: lo que frena al repo, cada uno con su gravedad, su cifra y sus filas. */
  function findingsOf(data, inWin, { now, base, total }) {
    const out = [];
    const add = (id, sev, rows, params = {}) => out.push({ id, sev, n: rows.length, rows: rows.slice(0, ROWS), more: Math.max(0, rows.length - ROWS), params });
    const ci = data.ci || new Map();
    if (base && ci.get(base) === 'failure') add('ci-main', 'alto', [{ text: base, branch: base }], { branch: base });

    const pulls = data.pulls ? [...data.pulls.values()] : [];
    const prRow = (p) => ({ text: `#${p.number} ${firstLine(p.title)}`, branch: p.sameRepo ? p.head : null, url: isUrl(p.url) ? p.url : null, number: p.number });
    const failing = pulls.filter((p) => !p.draft && (p.ci || (p.sameRepo && ci.get(p.head))) === 'failure');
    if (failing.length) add('prs-red', 'medio', failing.sort((a, b) => a.number - b.number).map(prRow));
    const waiting = pulls
      .filter((p) => !p.draft && !failing.includes(p) && at(p.createdAt) && now - at(p.createdAt) > WAIT_DAYS * DAY)
      .sort((a, b) => at(a.createdAt) - at(b.createdAt));
    if (waiting.length) add('prs-wait', 'medio', waiting.map(prRow), { days: WAIT_DAYS });

    const branchesOf = (kind) => [...new Set(inWin.filter((a) => a.kind === kind).map((a) => a.branch).filter(Boolean))];
    const forced = inWin.filter((a) => a.kind === 'force');
    if (forced.length) {
      const rows = branchesOf('force').map((name) => ({ text: name, branch: name }));
      out.push({ id: 'force', sev: 'medio', n: forced.length, rows: rows.slice(0, ROWS), more: Math.max(0, rows.length - ROWS), params: {} });
    }
    const deleted = branchesOf('branch-delete-unmerged');
    if (deleted.length) add('deleted', 'bajo', deleted.map((name) => ({ text: name })));

    const withPr = new Set(pulls.filter((p) => p.sameRepo && p.head).map((p) => p.head));
    const stale = [];
    for (const b of data.branches.values()) {
      if (b.isDefault || b.name === base || withPr.has(b.name)) continue;
      const date = at(data.commits.get(b.sha)?.date);
      if (date && now - date > STALE_DAYS * DAY) stale.push({ text: b.name, branch: b.name, date });
    }
    if (stale.length) add('stale', 'bajo', stale.sort((a, b) => a.date - b.date));

    const reds = inWin.filter((a) => a.kind === 'ci-fail').length;
    if (reds && !out.some((f) => f.id === 'ci-main')) out.push({ id: 'ci-flaky', sev: 'bajo', n: reds, rows: [], more: 0, params: { base: base || '' } });
    if (!total) add('quiet', 'medio', [{ text: '' }]);
    return out;
  }

  /** Lo que se guarda al cerrar la bitácora: lo justo para la tabla de notas y el seguimiento de la próxima. */
  function closeEntry(b, title) {
    const d = b.score.dims;
    return {
      n: b.n,
      desde: b.since,
      hasta: b.now,
      titulo: title,
      nota: { total: b.score.total, ritmo: d.ritmo.v, publicado: d.publicado.v, salud: d.salud.v },
      hallazgos: b.findings.map((f) => ({ id: f.id, sev: f.sev, n: f.n, desde: f.desde })),
      cifras: { commits: b.commits, merged: b.merged.length, releases: b.releases.length },
      corte: b.baseSha ? { base: b.base || '', sha: b.baseSha } : null,
    };
  }

  /** Agrega la bitácora cerrada a la lista guardada (sin pasar de KEEP). */
  const append = (prev, entry) => sanitize([...sanitize(prev), entry]);

  /** Historia ficticia para la demo: cuatro bitácoras cerradas, la última hace 4 días, con hallazgos que la
      demo de hoy cierra, deja a medias o mantiene. Los títulos son mensajes por traducir. */
  function demoHistory(now = Date.now()) {
    const ago = (d) => now - d * DAY;
    const M = (key, params) => ({ $i18n: key, params });
    return [
      { n: 1, desde: ago(32), hasta: ago(25), titulo: M('bitacora.title.release', { tag: 'v1.2.0' }), nota: { total: 54, ritmo: 43, publicado: 52, salud: 68 }, hallazgos: [{ id: 'ci-main', sev: 'alto', n: 1, desde: ago(25) }, { id: 'stale', sev: 'bajo', n: 3, desde: ago(25) }], cifras: { commits: 31, merged: 4, releases: 1 } },
      { n: 2, desde: ago(25), hasta: ago(18), titulo: M('bitacora.title.branch', { branch: 'feature/onboarding' }), nota: { total: 58, ritmo: 57, publicado: 45, salud: 72 }, hallazgos: [{ id: 'ci-main', sev: 'alto', n: 1, desde: ago(25) }, { id: 'prs-wait', sev: 'medio', n: 2, desde: ago(18) }], cifras: { commits: 44, merged: 6, releases: 0 } },
      { n: 3, desde: ago(18), hasta: ago(11), titulo: M('bitacora.title.release', { tag: 'v1.3.0' }), nota: { total: 63, ritmo: 71, publicado: 48, salud: 70 }, hallazgos: [{ id: 'prs-wait', sev: 'medio', n: 3, desde: ago(18) }, { id: 'prs-red', sev: 'medio', n: 2, desde: ago(11) }, { id: 'stale', sev: 'bajo', n: 2, desde: ago(25) }], cifras: { commits: 52, merged: 7, releases: 1 } },
      { n: 4, desde: ago(11), hasta: ago(4), titulo: M('bitacora.title.quiet'), nota: { total: 61, ritmo: 57, publicado: 40, salud: 86 }, hallazgos: [{ id: 'prs-red', sev: 'medio', n: 2, desde: ago(11) }, { id: 'stale', sev: 'bajo', n: 1, desde: ago(25) }], cifras: { commits: 27, merged: 3, releases: 0 } },
    ];
  }

  /* ---------- texto: HTML del panel, Markdown y estado.json ---------- */

  /** El título automático: lo grande de la ventana, en pocas palabras. `title`, si viene, lo reemplaza. */
  function autoTitle(b, f) {
    if (b.big.kind === 'release') return f.t('bitacora.title.release', { tag: b.big.tag || b.big.title });
    if (b.big.kind === 'pr') return b.big.title.length > 72 ? b.big.title.slice(0, 71) + '…' : b.big.title;
    if (b.big.kind === 'branch') return f.t('bitacora.title.branch', { branch: b.big.name });
    return f.t('bitacora.title.quiet');
  }

  const SEV_PILL = { alto: 'bad', medio: 'warn', bajo: 'info' };
  const STATE_PILL = { arreglado: 'ok', 'a-medias': 'warn', sigue: 'bad', nuevo: 'info' };

  /** El texto de un hallazgo y de su paso a seguir. */
  const findingTitle = (h, f, base) => f.t(`bitacora.f.${h.id}`, { n: h.now ?? h.n, branch: h.params?.branch || base || '', days: h.params?.days || WAIT_DAYS, base: h.params?.base || base || '' });
  const findingAction = (h, f, base) => f.t(`bitacora.a.${h.id}`, { branch: h.params?.branch || base || '', base: base || '' });

  /** Las frases del encabezado: la bajada (qué pasó y la nota) y la ventana. */
  function lead(b, f) {
    const range = { from: f.short(b.since), to: f.short(b.now) };
    const trend = !b.trend ? f.t('bitacora.trend.first') : b.score.total > b.trend.prev ? f.t('bitacora.trend.up', { prev: b.trend.prev }) : b.score.total < b.trend.prev ? f.t('bitacora.trend.down', { prev: b.trend.prev }) : f.t('bitacora.trend.same', { n: b.trend.n });
    const dek =
      f.t('bitacora.dek', { ...range, commits: f.t('bitacora.commitsN', { n: b.commits }), merged: f.t('bitacora.mergedN', { n: b.merged.length }), releases: f.t('bitacora.releasesN', { n: b.releases.length }), base: b.base || '—' }) +
      ' ' +
      f.t('bitacora.score', { score: b.score.total, trend });
    return { dek, trend, window: f.t('bitacora.window', range) };
  }

  /** Por qué cada dimensión tiene su nota. */
  function why(b, f) {
    const d = b.score.dims;
    return {
      ritmo: f.t('bitacora.why.pace', { active: d.ritmo.active, days: d.ritmo.days }),
      publicado: d.publicado.total ? f.t('bitacora.why.shipped', { inBase: d.publicado.inBase, total: d.publicado.total, base: b.base || '—' }) : f.t('bitacora.why.shippedNone'),
      salud: d.salud.lost ? f.t('bitacora.why.health', { pts: d.salud.lost }) : f.t('bitacora.why.healthNone'),
    };
  }
  const DIMS = [
    ['ritmo', 'bitacora.d.pace'],
    ['publicado', 'bitacora.d.shipped'],
    ['salud', 'bitacora.d.health'],
  ];

  /** Las secciones del panel como HTML, numeradas como en Brunell_Node (las vacías no salen). `f`: { t, esc,
      num, short (día y mes), ago, text, repo, title }. */
  function render(b, f) {
    const e = f.esc;
    const base = b.base || '—';
    const w = why(b, f);
    const secs = [];
    const sec = (key, h, body) => secs.push({ key, h, body });
    const pill = (cls, label) => `<span class="bt-pill ${cls}">${e(label)}</span>`;
    const link = (url, label) => (url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label));
    const go = (r) => (r.branch ? ` data-branch="${e(r.branch)}"` : '');

    // 01 · lo grande
    let big;
    if (b.big.kind === 'release') big = `<p class="bt-big">${link(b.big.url, f.t('bitacora.title.release', { tag: b.big.tag || b.big.title }))}${b.big.more ? ` <span class="bt-more">+${f.num(b.big.more)}</span>` : ''}</p>${b.big.detail ? `<p class="bt-lede">${e(b.big.detail)}</p>` : ''}`;
    else if (b.big.kind === 'pr')
      big = `<p class="bt-big">${link(b.big.url, `${b.big.number ? `#${b.big.number} ` : ''}${b.big.title}`)}${b.big.more ? ` <span class="bt-more">+${f.num(b.big.more)}</span>` : ''}</p>${b.big.brought ? `<p class="bt-lede">${e(f.t('bitacora.big.brought', { n: b.big.brought, base }))}</p>` : ''}`;
    else if (b.big.kind === 'branch') big = `<p class="bt-big"><button type="button" class="bt-go" data-branch="${e(b.big.name)}">${e(b.big.name)}</button></p><p class="bt-lede">${e(f.t('bitacora.big.branch', { n: b.big.commits, branch: b.big.name, base }))}</p>`;
    else big = `<p class="bt-lede">${e(f.t('bitacora.big.none'))}</p>`;
    sec('big', f.t('bitacora.sec.big'), big);

    // 02 · el período: barras de commits por día (lo que ya llegó a la rama por defecto abajo) y la franja de cifras
    const max = Math.max(1, ...b.days.map((d) => d.total));
    const pct = (x) => `${Math.round((840 * x) / max) / 10}%`; // la más alta llega al 84 %: arriba queda su cifra
    const bars = b.days
      .map(
        (d) =>
          `<div class="bt-col${d.loaded ? '' : ' off'}" title="${e(`${f.short(d.day)}: ${d.loaded ? f.num(d.total) : '—'}`)}"><span class="bt-stack">${d.total ? `<span class="bt-bar-n">${e(f.num(d.total))}</span>` : ''}` +
          (d.total - d.inBase ? `<span class="bt-bar-out" style="height:${pct(d.total - d.inBase)}"></span>` : '') +
          (d.inBase ? `<span class="bt-bar-in" style="height:${pct(d.inBase)}"></span>` : '') +
          `</span><span class="bt-bar-d">${e(new Date(d.day).getDate())}</span></div>`,
      )
      .join('');
    const aria = f.t('bitacora.chart', { list: b.days.map((d) => `${f.short(d.day)} ${f.num(d.total)}`).join(', ') });
    const metric = (v, k) => `<div class="bt-metric"><div class="v">${v}</div><div class="k">${e(k)}</div></div>`;
    sec(
      'period',
      f.t('bitacora.sec.period'),
      `<figure class="bt-chart"><div class="bt-chart-scroll"><div class="bt-bars" role="img" aria-label="${e(aria)}">${bars}</div></div>` +
        `<figcaption><span class="bt-key in"></span>${e(f.t('bitacora.inBase', { base }))} <span class="bt-key out"></span>${e(f.t('bitacora.pending', { base }))}</figcaption></figure>` +
        `<div class="bt-strip">${metric(e(f.num(b.commits)), f.t('bitacora.m.commits'))}${metric(e(f.num(b.merged.length)), f.t('bitacora.m.merged'))}${metric(e(f.num(b.releases.length)), f.t('bitacora.m.releases'))}${metric(e(f.num(b.active)), f.t('bitacora.m.branches'))}${metric(e(f.num(b.pending)), f.t('bitacora.m.pending', { base }))}${metric(e(f.num(b.open)), f.t('bitacora.m.open'))}</div>` +
        (b.partial ? `<p class="bt-note">${e(f.t('bitacora.partial', { date: f.short(b.cover) }))}</p>` : ''),
    );

    // 03 · veredicto: la nota, de dónde sale y la tabla con todas las bitácoras
    const L = lead(b, f);
    const holds = b.score.low ? f.t('bitacora.holds', { score: b.score.total, reason: w[b.score.low] }) : f.t('bitacora.holdsNone');
    const cols = [...b.prev.map((p) => ({ label: f.short(p.hasta), nota: p.nota })), { label: f.t('status.live'), nota: { total: b.score.total, ritmo: b.score.dims.ritmo.v, publicado: b.score.dims.publicado.v, salud: b.score.dims.salud.v }, live: true }];
    const cell = (v, live) => `<td class="n${live ? ' live' : ''}">${v == null ? '—' : e(f.num(v))}</td>`;
    const rows = DIMS.map(([k, key]) => `<tr><td>${e(f.t(key, { base }))}<span class="bt-why">${e(w[k])}</span></td>${cols.map((c) => cell(c.nota[k], c.live)).join('')}</tr>`).join('');
    sec(
      'verdict',
      f.t('bitacora.sec.verdict'),
      `<div class="bt-score"><div class="bt-score-n">${e(f.num(b.score.total))}<span>/100</span></div><div class="bt-score-txt"><p>${e(f.t('bitacora.score', { score: b.score.total, trend: L.trend }))}</p><p>${e(holds)}</p></div></div>` +
        `<div class="bt-tbl"><table><thead><tr><th>${e(f.t('bitacora.dim'))}</th>${cols.map((c) => `<th class="n${c.live ? ' live' : ''}">${e(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="tot"><td>${e(f.t('bitacora.total'))}</td>${cols.map((c) => cell(c.nota.total, c.live)).join('')}</tr></tbody></table></div>`,
    );

    // 04 · hallazgos
    const finds = b.findings
      .map((h) => {
        const list = h.rows.filter((r) => r.text).map((r) => `<li>${r.branch ? `<button type="button" class="bt-go"${go(r)}>${e(r.text)}</button>` : link(r.url, r.text)}</li>`).join('');
        return `<div class="bt-find sev-${h.sev}"><div class="bt-find-top"><h4>${e(findingTitle(h, f, b.base))}</h4>${pill(SEV_PILL[h.sev], f.t(`bitacora.sev.${h.sev}`))}</div><p>${e(findingAction(h, f, b.base))}</p>${list ? `<ul class="bt-rows">${list}${h.more ? `<li class="bt-more">+${e(f.num(h.more))}</li>` : ''}</ul>` : ''}</div>`;
      })
      .join('');
    sec('findings', f.t('bitacora.sec.findings'), finds ? `<div class="bt-finds">${finds}</div>` : `<p class="bt-lede">${e(f.t('bitacora.findingsNone'))}</p>`);

    // 05 · seguimiento de la bitácora anterior
    const fol = b.follow
      .map((h) => `<tr><td>${e(findingTitle(h.state === 'arreglado' ? { ...h, now: h.was } : h, f, b.base))}</td><td>${e(f.short(h.desde))}</td><td>${pill(STATE_PILL[h.state], f.t(`bitacora.st.${h.state}`))}</td><td class="n" dir="ltr">${h.was == null ? e(f.num(h.now)) : `${e(f.num(h.was))} → ${e(f.num(h.now))}`}</td></tr>`)
      .join('');
    sec(
      'follow',
      f.t('bitacora.sec.follow'),
      b.prev.length
        ? fol
          ? `<div class="bt-tbl"><table><thead><tr><th>${e(f.t('bitacora.col.finding'))}</th><th>${e(f.t('bitacora.col.since'))}</th><th>${e(f.t('bitacora.col.now'))}</th><th class="n">${e(f.t('bitacora.col.evidence'))}</th></tr></thead><tbody>${fol}</tbody></table></div>`
          : `<p class="bt-lede">${e(f.t('bitacora.findingsNone'))}</p>`
        : `<p class="bt-lede">${e(f.t('bitacora.followNone'))}</p>`,
    );

    // 06 · cronología, de lo más viejo a lo de hoy
    const tl = b.timeline
      .map((d) =>
        d.gap
          ? `<div class="bt-day bt-gap"><div class="bt-day-date">${e(d.from === d.to ? f.short(d.from) : `${f.short(d.from)} – ${f.short(d.to)}`)}</div><p>${e(f.t('bitacora.gap'))}</p></div>`
          : `<div class="bt-day"><div class="bt-day-date">${e(f.short(d.day))}<span>${e(f.t('bitacora.commitsN', { n: d.commits }))}</span></div><div><h4>${link(d.head.url, d.head.title)}</h4>${d.head.detail ? `<p>${e(d.head.detail)}</p>` : ''}${d.tags.length ? `<div class="bt-tags">${d.tags.map((x) => `<span class="bt-tag">${e(x)}</span>`).join('')}</div>` : ''}</div></div>`,
      )
      .join('');
    sec('timeline', f.t('bitacora.sec.timeline'), `<div class="bt-tl">${tl}</div>`);

    // 07 · qué sigue
    sec('next', f.t('bitacora.sec.next'), b.next.length ? `<ol class="bt-next">${b.next.map((h) => `<li><strong>${e(findingTitle(h, f, b.base))}.</strong> ${e(findingAction(h, f, b.base))}</li>`).join('')}</ol>` : `<p class="bt-lede">${e(f.t('bitacora.nextNone'))}</p>`);

    // 08 · las bitácoras anteriores
    const hist = [...b.prev]
      .reverse()
      .map((p) => `<tr><td class="n0">${e(f.num(p.n))}</td><td>${e(f.short(p.hasta))}</td><td>${e(f.text(p.titulo) || '—')}</td><td class="n">${e(f.num(p.nota.total))}</td></tr>`)
      .join('');
    sec('history', f.t('bitacora.sec.history'), hist ? `<div class="bt-tbl"><table><thead><tr><th class="n0">${e(f.t('bitacora.col.n'))}</th><th>${e(f.t('bitacora.col.date'))}</th><th>${e(f.t('bitacora.col.title'))}</th><th class="n">${e(f.t('bitacora.total'))}</th></tr></thead><tbody>${hist}</tbody></table></div>` : `<p class="bt-lede">${e(f.t('bitacora.historyNone'))}</p>`);

    const pad = (i) => String(i + 1).padStart(2, '0');
    return {
      title: f.title || autoTitle(b, f),
      eyebrow: f.t('bitacora.eyebrow', { repo: f.repo, n: b.n }),
      dek: L.dek,
      window: L.window,
      body: secs.map((s, i) => `<section class="bt-sec" data-sec="${s.key}"><div class="bt-sec-head"><span class="bt-mark">${pad(i)} · ${e(s.h)}</span></div>${s.body}</section>`).join(''),
    };
  }

  /** Texto que va en una línea de Markdown: sin saltos ni caracteres que lo rompan. */
  const md = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/([\\`*_{}[\]<>|])/g, '\\$1');

  /** La bitácora en Markdown, con las mismas secciones que el panel. */
  function toMarkdown(b, f) {
    const base = b.base || '—';
    const L = lead(b, f);
    const w = why(b, f);
    const title = f.title || autoTitle(b, f);
    const link = (url, s) => (url && isUrl(url) ? `[${md(s)}](${url.replace(/[()\s]/g, encodeURIComponent)})` : md(s));
    const out = [`# ${md(title)}`, '', `*${md(f.t('bitacora.eyebrow', { repo: f.repo, n: b.n }))}*`, '', md(L.dek), '', `${md(L.window)} · ${md(f.t('bitacora.commitsN', { n: b.commits }))} · ${md(f.t('bitacora.mergedN', { n: b.merged.length }))} · ${md(f.t('bitacora.releasesN', { n: b.releases.length }))}`];
    let i = 0;
    const h = (key) => out.push('', `## ${String(++i).padStart(2, '0')} · ${md(f.t(key))}`, '');

    h('bitacora.sec.big');
    if (b.big.kind === 'release') out.push(`- ${link(b.big.url, f.t('bitacora.title.release', { tag: b.big.tag || b.big.title }))}`);
    else if (b.big.kind === 'pr') out.push(`- ${link(b.big.url, `${b.big.number ? `#${b.big.number} ` : ''}${b.big.title}`)}${b.big.brought ? ` — ${md(f.t('bitacora.big.brought', { n: b.big.brought, base }))}` : ''}`);
    else if (b.big.kind === 'branch') out.push(`- ${md(f.t('bitacora.big.branch', { n: b.big.commits, branch: b.big.name, base }))}`);
    else out.push(md(f.t('bitacora.big.none')));

    h('bitacora.sec.period');
    out.push(`| | ${md(f.t('bitacora.m.commits'))} | ${md(f.t('bitacora.inBase', { base }))} |`, '| --- | ---: | ---: |');
    for (const d of b.days) out.push(`| ${md(f.short(d.day))} | ${d.total} | ${d.inBase} |`);
    out.push('', `- ${md(f.t('bitacora.m.branches'))}: ${b.active}`, `- ${md(f.t('bitacora.m.pending', { base }))}: ${b.pending}`, `- ${md(f.t('bitacora.m.open'))}: ${b.open}`);
    if (b.partial) out.push('', `> ${md(f.t('bitacora.partial', { date: f.short(b.cover) }))}`);

    h('bitacora.sec.verdict');
    out.push(`**${b.score.total}/100** — ${md(f.t('bitacora.score', { score: b.score.total, trend: L.trend }))}`, '');
    const cols = [...b.prev.map((p) => ({ label: f.short(p.hasta), nota: p.nota })), { label: f.t('status.live'), nota: { total: b.score.total, ritmo: b.score.dims.ritmo.v, publicado: b.score.dims.publicado.v, salud: b.score.dims.salud.v } }];
    out.push(`| ${md(f.t('bitacora.dim'))} | ${cols.map((c) => md(c.label)).join(' | ')} |`, `| --- |${cols.map(() => ' ---: |').join('')}`);
    for (const [k, key] of DIMS) out.push(`| ${md(f.t(key, { base }))} (${md(w[k])}) | ${cols.map((c) => (c.nota[k] == null ? '—' : c.nota[k])).join(' | ')} |`);
    out.push(`| **${md(f.t('bitacora.total'))}** | ${cols.map((c) => `**${c.nota.total}**`).join(' | ')} |`);

    h('bitacora.sec.findings');
    if (!b.findings.length) out.push(md(f.t('bitacora.findingsNone')));
    for (const x of b.findings) {
      out.push(`- **[${md(f.t(`bitacora.sev.${x.sev}`))}] ${md(findingTitle(x, f, b.base))}.** ${md(findingAction(x, f, b.base))}`);
      for (const r of x.rows.filter((r) => r.text)) out.push(`  - ${link(r.url, r.text)}`);
      if (x.more) out.push(`  - +${x.more}`);
    }

    h('bitacora.sec.follow');
    if (!b.prev.length) out.push(md(f.t('bitacora.followNone')));
    else if (!b.follow.length) out.push(md(f.t('bitacora.findingsNone')));
    else {
      out.push(`| ${md(f.t('bitacora.col.finding'))} | ${md(f.t('bitacora.col.since'))} | ${md(f.t('bitacora.col.now'))} | ${md(f.t('bitacora.col.evidence'))} |`, '| --- | --- | --- | ---: |');
      for (const x of b.follow) out.push(`| ${md(findingTitle(x.state === 'arreglado' ? { ...x, now: x.was } : x, f, b.base))} | ${md(f.short(x.desde))} | ${md(f.t(`bitacora.st.${x.state}`))} | ${x.was == null ? x.now : `${x.was} → ${x.now}`} |`);
    }

    h('bitacora.sec.timeline');
    for (const d of b.timeline) {
      if (d.gap) out.push(`- **${md(d.from === d.to ? f.short(d.from) : `${f.short(d.from)} – ${f.short(d.to)}`)}** — ${md(f.t('bitacora.gap'))}`);
      else out.push(`- **${md(f.short(d.day))}** (${md(f.t('bitacora.commitsN', { n: d.commits }))}): ${link(d.head.url, d.head.title)}${d.head.detail ? ` — ${md(d.head.detail)}` : ''}${d.tags.length ? ` · ${d.tags.map((x) => `\`${String(x).replace(/`/g, "'")}\``).join(' ')}` : ''}`);
    }

    h('bitacora.sec.next');
    if (!b.next.length) out.push(md(f.t('bitacora.nextNone')));
    b.next.forEach((x, k) => out.push(`${k + 1}. **${md(findingTitle(x, f, b.base))}.** ${md(findingAction(x, f, b.base))}`));

    if (b.prev.length) {
      h('bitacora.sec.history');
      out.push(`| ${md(f.t('bitacora.col.n'))} | ${md(f.t('bitacora.col.date'))} | ${md(f.t('bitacora.col.title'))} | ${md(f.t('bitacora.total'))} |`, '| ---: | --- | --- | ---: |');
      for (const p of [...b.prev].reverse()) out.push(`| ${p.n} | ${md(f.short(p.hasta))} | ${md(f.text(p.titulo)) || '—'} | ${p.nota.total} |`);
    }
    out.push('', '---', '', md(f.t('bitacora.help')));
    return out.join('\n') + '\n';
  }

  const iso = (ms) => {
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** El estado de la bitácora con el esquema del estado.json de Brunell_Node (corte, nota, historial,
      hallazgos con su estado y anteriores): sirve de memoria y se puede comparar con aquellas. */
  function toEstado(b, f) {
    const d = b.score.dims;
    const nota = { total: b.score.total, ritmo: d.ritmo.v, publicado: d.publicado.v, salud: d.salud.v };
    const state = new Map(b.follow.map((x) => [x.id, x.state]));
    return {
      esquema: 1,
      fuente: 'GraphBranch',
      repo: f.repo,
      bitacora: b.n,
      etiqueta: f.t('bitacora.label', { n: b.n }),
      fecha: iso(b.now),
      titulo: f.title || autoTitle(b, f),
      ventana: { desde: iso(b.since), hasta: iso(b.now) },
      corte: b.baseSha ? { [b.base]: b.baseSha } : {},
      nota,
      historial: [...b.prev.map((p) => ({ fecha: iso(p.hasta), ...p.nota })), { fecha: iso(b.now), ...nota }],
      hallazgos: [
        ...b.findings.map((x) => ({ id: x.id, severidad: x.sev, desde: iso(x.desde), estado: state.get(x.id) || 'nuevo', titulo: findingTitle(x, f, b.base), evidencia: x.rows.map((r) => r.text).filter(Boolean) })),
        ...b.follow.filter((x) => x.state === 'arreglado').map((x) => ({ id: x.id, severidad: x.sev, desde: iso(x.desde), estado: 'arreglado', titulo: findingTitle({ ...x, now: x.was }, f, b.base), evidencia: [] })),
      ],
      anteriores: b.prev.map((p) => ({ n: String(p.n), fecha: iso(p.hasta), titulo: f.text(p.titulo) })),
    };
  }

  GB.bitacora = { compute, render, toMarkdown, toEstado, closeEntry, append, sanitize, demoHistory, autoTitle, WINDOW_DAYS, KEEP, PTS, STATES };
})(window.GB);
