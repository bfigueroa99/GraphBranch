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

  GB.health = { compute, STALE_DAYS };
})(window.GB);
