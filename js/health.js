/* GraphBranch — salud del repo: lo que ya está cargado, leído como señales de equipo.
   Ramas sin actividad hace más de 30 días y sin PR, pull requests abiertos por edad, cuánto tardaron
   en fusionarse los últimos y el ritmo de merges y releases. No hace ninguna consulta: parte del
   estado del grafo y de la actividad que ya llegó, y cuenta lo que pasa en el repo, no a personas. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const STALE_DAYS = 30;
  const RECENT_MERGES = 20; // cuántos PRs fusionados entran en el tiempo de abierto a fusionado
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

    const seen = new Set();
    const merges = acts.filter((a) => a.kind === 'pr-merge' && a.time && !seen.has(a.id) && seen.add(a.id));
    const spans = merges
      .filter((a) => a.openedAt && a.time > a.openedAt)
      .sort((a, b) => b.time - a.time)
      .slice(0, RECENT_MERGES)
      .map((a) => a.time - a.openedAt);
    const within = (list, days) => list.filter((a) => now - a.time <= days * DAY && a.time <= now).length;
    const releases = acts.filter((a) => a.kind === 'release' && a.time && !seen.has(a.id) && seen.add(a.id));

    return {
      stale: { total: stale.length, rows: stale.slice(0, ROWS) },
      prs: { total: prs.length, rows: prs.slice(0, ROWS) },
      merged: spans.length ? { n: spans.length, median: median(spans), max: Math.max(...spans) } : null,
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

  GB.health = { compute, clashes, clashCandidates, STALE_DAYS };
})(window.GB);
