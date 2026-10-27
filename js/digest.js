/* GraphBranch — resumen de la semana: lo que pasó en los últimos 7 días, con lo ya cargado.
   Commits, pull requests fusionados y abiertos, issues cerrados, releases, quién aportó y la rama más activa. No hace ninguna
   consulta; sale como Markdown para copiar o guardar. Lo que no llegó a cargarse no cuenta: es un
   resumen de lo visible, no del repo entero. */
(function (GB) {
  'use strict';

  const DAY = 864e5;
  const TOP = 5; // personas que se listan
  const LIST = 10; // filas de PRs y de releases
  const ORG_IMAGE_REPOS = 8; // repos que caben en la imagen del resumen de una organización
  const ORG_REPOS = 20; // repos que salen en el resumen de una organización

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
    const before = new Set(); // quienes ya firmaron un commit cargado anterior a la semana
    for (const c of data.commits.values()) {
      if (!recent(c)) {
        const old = c.author?.login || c.author?.name;
        if (old && at(c.date) <= since) before.add(old);
        continue;
      }
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
    // PRs abiertos en la semana: un PR reabierto o marcado como listo no cuenta dos veces
    const openedNums = new Set();
    const opened = acts
      .filter((a) => inWeek(a, 'pr-open') && (a.number == null || (!openedNums.has(a.number) && openedNums.add(a.number))))
      .sort((a, b) => b.time - a.time)
      .map((a) => ({ number: a.number, title: text(a.detail) || text(a.title), url: a.url || null, time: a.time }));
    // issues cerrados en la semana: uno cerrado, reabierto y cerrado otra vez cuenta una sola vez
    const closedNums = new Set();
    const closed = acts
      .filter((a) => inWeek(a, 'issue-close') && (a.number == null || (!closedNums.has(a.number) && closedNums.add(a.number))))
      .sort((a, b) => b.time - a.time)
      .map((a) => ({ number: a.number, title: text(a.detail) || text(a.title), url: a.url || null, time: a.time }));
    const releases = acts
      .filter((a) => inWeek(a, 'release'))
      .sort((a, b) => b.time - a.time)
      .map((a) => ({ title: text(a.title), url: a.url || null, time: a.time }));

    // tags cuyo commit es de la semana (con lo ya cargado), sin repetir los que ya salen como release
    const named = new Set(releases.map((r) => r.title));
    const tags = [];
    if (data.tags) {
      for (const [sha, names] of data.tags) {
        const c = data.commits.get(sha);
        if (!c || !recent(c)) continue;
        for (const name of names) if (name && !named.has(name)) tags.push({ name: String(name), time: at(c.date) });
      }
    }
    tags.sort((a, b) => b.time - a.time || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    return {
      since,
      now,
      days,
      commits: week.size,
      newcomers: [...people.keys()].filter((who) => !before.has(who)).length, // con lo cargado: sin commit anterior a la semana
      merged: { total: merged.length, rows: merged.slice(0, LIST) },
      opened: { total: opened.length, rows: opened.slice(0, LIST) },
      closed: { total: closed.length, rows: closed.slice(0, LIST) },
      releases: { total: releases.length, rows: releases.slice(0, LIST) },
      tags: { total: tags.length, rows: tags.slice(0, LIST) },
      people: { total: people.size, rows: [...people].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, TOP).map(([name, commits]) => ({ name, commits })) },
      branch,
    };
  }

  /** Texto que va en una línea de Markdown: sin saltos ni caracteres que lo rompan. */
  const md = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/([\\`*_{}[\]<>|])/g, '\\$1');

  /** Markdown del resumen. `t`: las etiquetas ya traducidas { head, commits, merged, closed, releases, tags, people,
      branch }; `none`: el texto de «nada»; `fmtDate`: cómo escribir un día. */
  function toMarkdown(d, repo, t, fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10), none = '—') {
    const out = [`# ${md(t.head.replace('{repo}', repo))}`, '', `${fmtDate(d.since)} – ${fmtDate(d.now)}`, '', `- ${t.commits.replace('{n}', d.commits)}`];
    if (d.newcomers && t.newcomers) out.push(`- ${t.newcomers.replace('{n}', d.newcomers)}`);
    if (d.branch) out.push(`- ${t.branch}: \`${String(d.branch.name).replace(/`/g, "'")}\` (${d.branch.commits})`);
    const link = (r, text) => (r.url && /^https?:\/\//.test(r.url) ? `[${text}](${r.url.replace(/[()\s]/g, encodeURIComponent)})` : text);
    out.push('', `## ${t.merged} (${d.merged.total})`, '');
    if (d.merged.rows.length) for (const r of d.merged.rows) out.push(`- ${link(r, `${r.number ? `#${r.number} ` : ''}${md(r.title)}`)}`);
    else out.push(none);
    if (d.opened?.total) out.push('', `## ${t.opened} (${d.opened.total})`, '', ...d.opened.rows.map((r) => `- ${link(r, `${r.number ? `#${r.number} ` : ''}${md(r.title)}`)}`));
    if (d.closed?.total) out.push('', `## ${t.closed} (${d.closed.total})`, '', ...d.closed.rows.map((r) => `- ${link(r, `${r.number ? `#${r.number} ` : ''}${md(r.title)}`)}`));
    out.push('', `## ${t.releases} (${d.releases.total})`, '');
    if (d.releases.rows.length) for (const r of d.releases.rows) out.push(`- ${link(r, md(r.title))}`);
    else out.push(none);
    if (d.tags?.total) out.push('', `## ${t.tags} (${d.tags.total})`, '', ...d.tags.rows.map((r) => `- ${md(r.name)}`));
    out.push('', `## ${t.people} (${d.people.total})`, '');
    if (d.people.rows.length) for (const r of d.people.rows) out.push(`- ${md(r.name)}: ${r.commits}`);
    else out.push(none);
    return out.join('\n') + '\n';
  }

  /** El resumen de la semana de varios repos (los seguidos de una organización): `entries` es
      [{ repo, data, acts }]. Los repos sin nada en la semana no salen; los demás, por commits. */
  function computeOrg(entries, now = Date.now(), days = 7, text = (x) => x) {
    const rows = entries.map((e) => ({ repo: e.repo, d: compute(e.data, e.acts || [], now, days, text) }));
    const busy = rows.filter((r) => r.d.commits || r.d.merged.total || r.d.releases.total);
    busy.sort((a, b) => b.d.commits - a.d.commits || (a.repo < b.repo ? -1 : 1));
    const sum = (f) => rows.reduce((n, r) => n + f(r.d), 0);
    return { since: now - days * DAY, now, days, repos: rows.length, commits: sum((d) => d.commits), merged: sum((d) => d.merged.total), releases: sum((d) => d.releases.total), rows: busy.slice(0, ORG_REPOS), hidden: Math.max(0, busy.length - ORG_REPOS) };
  }

  /** Markdown del resumen de la organización: los totales y una sección por repo con actividad. */
  function toMarkdownOrg(o, owner, t, fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10), none = '—') {
    const out = [`# ${md(t.head.replace('{repo}', owner))}`, '', `${fmtDate(o.since)} – ${fmtDate(o.now)}`, '', `- ${t.commits.replace('{n}', o.commits)}`, `- ${t.merged}: ${o.merged}`, `- ${t.releases}: ${o.releases}`];
    if (!o.rows.length) out.push('', none);
    for (const { repo, d } of o.rows) {
      out.push('', `## ${md(repo)}`, '', `- ${t.commits.replace('{n}', d.commits)}`);
      if (d.branch) out.push(`- ${t.branch}: \`${String(d.branch.name).replace(/`/g, "'")}\` (${d.branch.commits})`);
      if (d.merged.total) out.push(`- ${t.merged}: ${d.merged.rows.map((r) => (r.number ? `#${r.number}` : md(r.title))).join(', ')}`);
      if (d.releases.total) out.push(`- ${t.releases}: ${d.releases.rows.map((r) => md(r.title)).join(', ')}`);
    }
    if (o.hidden) out.push('', `… +${o.hidden}`);
    return out.join('\n') + '\n';
  }

  /** Las líneas de la imagen del resumen: { text, kind } con kind 'title' | 'sub' | 'head' | 'row'.
      Cada texto va recortado para caber en el ancho de la imagen. */
  function imageLines(d, repo, t, fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10), none = '—') {
    const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const cut = (s) => (s.length > 70 ? s.slice(0, 69) + '…' : s);
    const L = [{ text: cut(flat(t.head.replace('{repo}', repo))), kind: 'title' }, { text: `${fmtDate(d.since)} – ${fmtDate(d.now)}`, kind: 'sub' }];
    L.push({ text: t.commits.replace('{n}', d.commits), kind: 'head' });
    if (d.newcomers && t.newcomers) L.push({ text: cut(t.newcomers.replace('{n}', d.newcomers)), kind: 'row' });
    if (d.branch) L.push({ text: cut(`${t.branch}: ${flat(d.branch.name)} (${d.branch.commits})`), kind: 'row' });
    const section = (label, total, rows) => {
      L.push({ text: `${label} (${total})`, kind: 'head' });
      if (rows.length) for (const r of rows.slice(0, 5)) L.push({ text: cut(r), kind: 'row' });
      else L.push({ text: none, kind: 'row' });
    };
    section(t.merged, d.merged.total, d.merged.rows.map((r) => `${r.number ? `#${r.number} ` : ''}${flat(r.title)}`));
    if (d.opened?.total) section(t.opened, d.opened.total, d.opened.rows.map((r) => `${r.number ? `#${r.number} ` : ''}${flat(r.title)}`));
    if (d.closed?.total) section(t.closed, d.closed.total, d.closed.rows.map((r) => `${r.number ? `#${r.number} ` : ''}${flat(r.title)}`));
    section(t.releases, d.releases.total, d.releases.rows.map((r) => flat(r.title)));
    if (d.tags?.total) section(t.tags, d.tags.total, d.tags.rows.map((r) => flat(r.name)));
    section(t.people, d.people.total, d.people.rows.map((r) => `${flat(r.name)}: ${r.commits}`));
    return L;
  }

  /** Las líneas de la imagen del resumen de la organización: los totales y, por repo con actividad, su
      nombre y sus cifras (hasta ORG_IMAGE_REPOS repos; el resto se cuenta en una última fila). */
  function imageLinesOrg(o, owner, t, fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10), none = '—') {
    const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const cut = (s) => (s.length > 70 ? s.slice(0, 69) + '…' : s);
    const L = [{ text: cut(flat(t.head.replace('{repo}', owner))), kind: 'title' }, { text: `${fmtDate(o.since)} – ${fmtDate(o.now)}`, kind: 'sub' }];
    L.push({ text: t.commits.replace('{n}', o.commits), kind: 'head' });
    L.push({ text: `${t.merged}: ${o.merged}`, kind: 'row' }, { text: `${t.releases}: ${o.releases}`, kind: 'row' });
    if (!o.rows.length) L.push({ text: none, kind: 'row' });
    for (const { repo, d } of o.rows.slice(0, ORG_IMAGE_REPOS)) {
      L.push({ text: cut(flat(repo)), kind: 'head' });
      const parts = [t.commits.replace('{n}', d.commits)];
      if (d.merged.total) parts.push(`${t.merged}: ${d.merged.rows.map((r) => (r.number ? `#${r.number}` : flat(r.title))).join(', ')}`);
      if (d.releases.total) parts.push(`${t.releases}: ${d.releases.rows.map((r) => flat(r.title)).join(', ')}`);
      L.push({ text: cut(parts.join(' · ')), kind: 'row' });
    }
    const more = o.hidden + Math.max(0, o.rows.length - ORG_IMAGE_REPOS);
    if (more) L.push({ text: `… +${more}`, kind: 'row' });
    return L;
  }

  const SIZE = { title: 34, sub: 20, head: 24, row: 20 };
  const GAP = { title: 14, sub: 22, head: 10, row: 6 };
  const W = 1200;
  const PAD = 56;

  /** Dibuja el resumen en un canvas nuevo y lo devuelve. `colors`: { bg, fg, dim, accent } ya resueltos
      para el canvas. Con el texto escrito de derecha a izquierda, la imagen se alinea a la derecha. */
  function toCanvas(doc, d, repo, t, fmtDate, none, colors, rtl = false) {
    return drawLines(doc, imageLines(d, repo, t, fmtDate, none), colors, rtl);
  }

  /** Lo mismo para el resumen de la organización. */
  function toCanvasOrg(doc, o, owner, t, fmtDate, none, colors, rtl = false) {
    return drawLines(doc, imageLinesOrg(o, owner, t, fmtDate, none), colors, rtl);
  }

  function drawLines(doc, lines, colors, rtl) {
    const height = PAD * 2 + lines.reduce((n, l) => n + SIZE[l.kind] + GAP[l.kind] + (l.kind === 'head' ? 8 : 0), 0);
    const canvas = doc.createElement('canvas');
    canvas.width = W;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(rtl ? W - 10 : 0, 0, 10, height);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.textBaseline = 'top';
    const x = rtl ? W - PAD : PAD;
    let y = PAD;
    for (const l of lines) {
      if (l.kind === 'head') y += 8;
      ctx.font = `${l.kind === 'row' || l.kind === 'sub' ? '400' : '700'} ${SIZE[l.kind]}px system-ui, sans-serif`;
      ctx.fillStyle = l.kind === 'head' ? colors.accent : l.kind === 'sub' ? colors.dim : colors.fg;
      ctx.fillText(l.text, x, y);
      y += SIZE[l.kind] + GAP[l.kind];
    }
    return canvas;
  }

  GB.digest = { compute, toMarkdown, computeOrg, toMarkdownOrg, imageLines, imageLinesOrg, toCanvas, toCanvasOrg };
})(window.GB);
