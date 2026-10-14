/* GraphBranch — resumen de la semana: lo que pasó en los últimos 7 días, con lo ya cargado.
   Commits, pull requests fusionados, releases, quién aportó y la rama más activa. No hace ninguna
   consulta; sale como Markdown para copiar o guardar. Lo que no llegó a cargarse no cuenta: es un
   resumen de lo visible, no del repo entero. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const TOP = 5; // personas que se listan
  const LIST = 10; // filas de PRs y de releases

  const at = (x) => (typeof x === 'number' ? x : Date.parse(x) || 0);

  /** `data`: el estado del repo; `acts`: su actividad ya cargada; `text`: pasa a texto los títulos que
      llegan como mensajes por traducir (i18n.text). */
  function compute(data, acts = [], now = Date.now(), days = 7, text = (x) => x) {
    const since = now - days * DAY;
    const recent = (c) => {
      const d = at(c.date);
      return d > since && d <= now;
    };

    const week = new Set();
    const people = new Map();
    for (const c of data.commits.values()) {
      if (!recent(c)) continue;
      week.add(c.sha);
      const who = c.author?.login || c.author?.name;
      if (who) people.set(who, (people.get(who) || 0) + 1);
    }

    // la rama más activa: la que más commits de la semana alcanza desde su punta
    let branch = null;
    for (const b of data.branches.values()) {
      let n = 0;
      const seen = new Set();
      const stack = [b.sha];
      while (stack.length) {
        const s = stack.pop();
        if (seen.has(s) || !week.has(s)) continue; // fuera de la semana (o sin cargar) no se sigue
        seen.add(s);
        n++;
        for (const p of data.commits.get(s).parents || []) stack.push(p);
      }
      if (n && (!branch || n > branch.commits || (n === branch.commits && b.name < branch.name))) branch = { name: b.name, commits: n };
    }

    const seenIds = new Set();
    const inWeek = (a, kind) => a.kind === kind && a.time && a.time > since && a.time <= now && !seenIds.has(a.id) && seenIds.add(a.id);
    const merged = acts
      .filter((a) => inWeek(a, 'pr-merge'))
      .sort((a, b) => b.time - a.time)
      .map((a) => ({ number: a.number, title: text(a.detail) || text(a.title), url: a.url || null, time: a.time }));
    const releases = acts
      .filter((a) => inWeek(a, 'release'))
      .sort((a, b) => b.time - a.time)
      .map((a) => ({ title: text(a.title), url: a.url || null, time: a.time }));

    return {
      since,
      now,
      days,
      commits: week.size,
      merged: { total: merged.length, rows: merged.slice(0, LIST) },
      releases: { total: releases.length, rows: releases.slice(0, LIST) },
      people: { total: people.size, rows: [...people].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP).map(([name, commits]) => ({ name, commits })) },
      branch,
    };
  }

  /** Texto que va en una línea de Markdown: sin saltos ni caracteres que lo rompan. */
  const md = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/([\\`*_{}[\]<>|])/g, '\\$1');

  /** Markdown del resumen. `t`: las etiquetas ya traducidas { head, commits, merged, releases, people,
      branch }; `none`: el texto de «nada»; `fmtDate`: cómo escribir un día. */
  function toMarkdown(d, repo, t, fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10), none = '—') {
    const out = [`# ${md(t.head.replace('{repo}', repo))}`, '', `${fmtDate(d.since)} – ${fmtDate(d.now)}`, '', `- ${t.commits.replace('{n}', d.commits)}`];
    if (d.branch) out.push(`- ${t.branch}: \`${String(d.branch.name).replace(/`/g, "'")}\` (${d.branch.commits})`);
    const link = (r, text) => (r.url && /^https?:\/\//.test(r.url) ? `[${text}](${r.url.replace(/[()\s]/g, encodeURIComponent)})` : text);
    out.push('', `## ${t.merged} (${d.merged.total})`, '');
    if (d.merged.rows.length) for (const r of d.merged.rows) out.push(`- ${link(r, `${r.number ? `#${r.number} ` : ''}${md(r.title)}`)}`);
    else out.push(none);
    out.push('', `## ${t.releases} (${d.releases.total})`, '');
    if (d.releases.rows.length) for (const r of d.releases.rows) out.push(`- ${link(r, md(r.title))}`);
    else out.push(none);
    out.push('', `## ${t.people} (${d.people.total})`, '');
    if (d.people.rows.length) for (const r of d.people.rows) out.push(`- ${md(r.name)}: ${r.commits}`);
    else out.push(none);
    return out.join('\n') + '\n';
  }

  GB.digest = { compute, toMarkdown };
})(window.GB);
