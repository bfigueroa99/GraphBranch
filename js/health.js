/* GraphBranch — salud del repo: lo que ya está cargado, leído como señales de equipo.
   Ramas sin actividad hace más de 30 días y sin PR, pull requests abiertos por edad y por estado (borrador, checks en rojo, aprobado, esperando revisión), cuánto tardaron
   en fusionarse los últimos, el ritmo de merges y releases y, en el idioma de DORA, la frecuencia de
   despliegues (cada release cuenta como uno) y el tiempo de entrega (de abierto a fusionado). No hace ninguna consulta: parte del
   estado del grafo y de la actividad que ya llegó, y cuenta lo que pasa en el repo, no a personas. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const STALE_DAYS = 30;
  const RECENT_MERGES = 20; // cuántos PRs fusionados entran en el tiempo de abierto a fusionado
  const RECENT_RELEASES = 10; // cuántos releases entran en el tiempo entre despliegues
  const ROWS = 8; // filas que muestra cada lista

  const at = (x) => (typeof x === 'number' ? x : Date.parse(x) || 0);
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  /** `data`: el estado del repo (ramas, commits, PRs abiertos); `acts`: su actividad ya cargada.
      Devuelve las listas ordenadas (lo peor primero) con su total, y el ritmo. */
  function compute(data, acts = [], now = Date.now()) {
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

    const forks = (data.forks || []).filter((f) => f.pushedAt && f.url).map((f) => ({ fullName: f.fullName, url: f.url, idle: Math.max(0, now - at(f.pushedAt)) }));

    return {
      forks: { total: forks.length, rows: forks.slice(0, ROWS) },
      stale: { total: stale.length, rows: stale.slice(0, ROWS) },
      prs: { total: prs.length, rows: prs.slice(0, ROWS) },
      prStates,
      merged: spans.length ? { n: spans.length, median: median(spans), max: Math.max(...spans) } : null,
      dora,
      leadSource: { fromCommit, total: lead.length },
      ci,
      pace: { merges7: within(merges, 7), merges30: within(merges, 30), releases30: within(releases, 30) },
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

  GB.health = { compute, clashes, clashCandidates, compare, splitFiles, STALE_DAYS };
})(window.GB);
