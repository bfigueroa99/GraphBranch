/* GraphBranch — el grafo como diagrama Mermaid (`gitGraph`): el texto que se pega en la documentación (un README, una
   wiki, un apunte de clase) para mostrar una estrategia de ramas, armado con lo que ya está cargado, sin consultas.

   Mermaid describe un grafo de git como una lista de órdenes: `commit` en la rama actual (con `id` y `tag`), `branch`
   (crea una rama en el commit actual y pasa a ella), `checkout` (cambia de rama) y `merge` (un commit de fusión con la
   punta de otra rama). Aquí cada commit pertenece a la primera rama que lo alcanza por su primer padre (la rama por
   defecto primero, después las más recientes), cada rama nace en el commit donde se separó y un merge solo se escribe
   como tal si su segundo padre es la punta de otra rama en ese momento (si no, queda como un commit). Las de larga
   vida (protegidas, develop, release/…, como en js/layout.js) reclaman sus commits antes que las de trabajo. Una rama
   cuya historia sigue más atrás de lo que se exporta nace sola, sin padre, y lo dice un comentario `%%`.

   Sirve en el navegador (window.GB.mermaid) y en Node (require: lo usa tools/mermaid.test.mjs). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GB = root.GB || {}).mermaid = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Ramas, como mucho (los temas de Mermaid colorean 8 y después repiten), y commits de cada una. */
  const MAX_BRANCHES = 8;
  const PER_BRANCH = 10;
  const PER_DEFAULT = 20;
  /** Las ramas de larga vida: las mismas que js/layout.js pone antes que las demás (protegidas o con esos nombres). */
  const LONG_LIVED = /^(main|master|trunk|develop|development|dev|staging|stage|next|beta|production|prod|release(\/.*)?|releases?\/.*)$/i;
  const longLived = (b) => (b.protected || LONG_LIVED.test(b.name) ? 1 : 0);

  /** Un texto para ir entre comillas en Mermaid: sin comillas dobles, barras invertidas, saltos ni caracteres de control
      (la sintaxis no dice cómo escaparlos), recortado. */
  const quote = (s, max = 100) =>
    '"' +
    String(s ?? '')
      .replace(/["\\]/g, "'")
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
      .trim()
      .slice(0, max) +
    '"';

  /** Un Map (también uno de otro contexto, como el de la demo en las pruebas). */
  const isMap = (m) => !!m && typeof m.get === 'function' && typeof m.has === 'function' && typeof m.values === 'function';

  const dateOf = (c) => {
    const t = typeof c?.date === 'number' ? c.date : Date.parse(c?.date);
    return Number.isFinite(t) ? t : 0;
  };

  /** El `gitGraph` de `data` (el estado del repo: commits, ramas, tags), con lo que se ve: las ramas que trae `data` (ya
      filtrado por quien llama), la por defecto primero y después las de punta más reciente, hasta `maxBranches`; de
      cada una, sus últimos commits propios por el primer padre (`perDefault` la por defecto, `perBranch` las demás).
      → { text, commits, branches, cut } (`cut`: las ramas cuya historia sigue más atrás de lo exportado). */
  function gitGraph(data, { maxBranches = MAX_BRANCHES, perBranch = PER_BRANCH, perDefault = PER_DEFAULT } = {}) {
    const commits = isMap(data?.commits) ? data.commits : new Map();
    const all = isMap(data?.branches) ? [...data.branches.values()] : [];
    const defName = data?.repo?.defaultBranch || all.find((b) => b.isDefault)?.name || '';
    const loaded = all.filter((b) => b && typeof b.name === 'string' && commits.has(b.sha));
    const def = loaded.find((b) => b.name === defName) || null;
    // las de larga vida (develop, release/…) antes que las de trabajo: si no, una rama de trabajo que sale de develop se
    // quedaría con la historia de develop y develop parecería nacer de ella
    const rest = loaded
      .filter((b) => b !== def)
      .sort((a, b) => longLived(b) - longLived(a) || dateOf(commits.get(b.sha)) - dateOf(commits.get(a.sha)) || (a.name < b.name ? -1 : 1));
    const chosen = (def ? [def, ...rest] : rest).slice(0, Math.max(1, maxBranches));

    // de quién es cada commit: de la primera rama que lo alcanza por su primer padre
    const owner = new Map();
    const fork = new Map(); // rama → el commit (de otra) donde nace, o null si su historia sigue más atrás
    const own = new Map(); // rama → cuántos commits propios
    for (const b of chosen) {
      const limit = b === def ? perDefault : perBranch;
      let sha = b.sha;
      let n = 0;
      let at = null;
      while (sha && commits.has(sha)) {
        if (owner.has(sha)) {
          at = sha;
          break;
        }
        if (n >= limit) break;
        owner.set(sha, b.name);
        n++;
        sha = commits.get(sha).parents?.[0];
      }
      own.set(b.name, n);
      fork.set(b.name, at);
    }
    // una rama sin commits propios (fusionada, o en la misma punta que otra) no se dibuja: lo dice un comentario
    const drawn = chosen.filter((b) => own.get(b.name) > 0);
    const skipped = chosen.filter((b) => own.get(b.name) === 0);

    // los commits, padres antes que hijos y, entre los que están listos, el más viejo primero
    const pending = [...owner.keys()];
    const inDeg = new Map(pending.map((s) => [s, (commits.get(s).parents || []).filter((p) => owner.has(p)).length]));
    const children = new Map();
    for (const s of pending) for (const p of commits.get(s).parents || []) if (owner.has(p)) children.set(p, [...(children.get(p) || []), s]);
    const ready = pending.filter((s) => !inDeg.get(s));
    const order = [];
    const byAge = (a, b) => dateOf(commits.get(a)) - dateOf(commits.get(b)) || (a < b ? -1 : 1);
    while (ready.length) {
      ready.sort(byAge);
      const s = ready.shift();
      order.push(s);
      for (const c of children.get(s) || []) {
        inDeg.set(c, inDeg.get(c) - 1);
        if (!inDeg.get(c)) ready.push(c);
      }
    }

    // los nombres en Mermaid: entre comillas y sin repetir (dos ramas que solo difieren en una comilla)
    const label = new Map();
    const used = new Set();
    for (const b of drawn) {
      let q = quote(b.name);
      for (let i = 2; used.has(q); i++) q = quote(`${b.name} (${i})`);
      used.add(q);
      label.set(b.name, q);
    }
    const ids = new Map();
    const usedIds = new Set();
    for (const s of order) {
      let len = 7;
      while (usedIds.has(s.slice(0, len)) && len < s.length) len++;
      usedIds.add(s.slice(0, len));
      ids.set(s, s.slice(0, len));
    }
    const tagOf = new Map();
    if (isMap(data?.tags)) for (const [sha, names] of data.tags) if (owner.has(sha) && Array.isArray(names) && names.length) tagOf.set(sha, names.join(', '));

    const out = [];
    const main = def && own.get(def.name) > 0 ? def.name : drawn[0]?.name || 'main';
    if (main !== 'main') out.push(`%%{init: ${JSON.stringify({ gitGraph: { mainBranchName: quote(main).slice(1, -1) } })} }%%`);
    out.push('gitGraph');
    for (const b of skipped) out.push(`  %% ${quote(b.name).slice(1, -1)}: sin commits propios en lo exportado`);
    let current = main;
    const heads = new Map([[main, null]]);
    const cut = [];
    // las ramas cuya historia sigue más atrás nacen al principio, sin padre
    for (const b of drawn) {
      if (b.name === main || fork.get(b.name)) continue;
      out.push(`  %% ${quote(b.name).slice(1, -1)}: su historia sigue más atrás`);
      out.push(`  branch ${label.get(b.name)}`);
      heads.set(b.name, null);
      current = b.name;
      cut.push(b.name);
    }
    if (main && !fork.get(main) && commits.get(order.find((s) => owner.get(s) === main))?.parents?.length) cut.unshift(main);
    for (const s of order) {
      const b = owner.get(s);
      if (!heads.has(b)) continue; // una rama sin dibujar (no pasa: cada dueño está en drawn)
      if (current !== b) {
        out.push(`  checkout ${label.get(b)}`);
        current = b;
      }
      const c = commits.get(s);
      const q = (c.parents || [])[1];
      const from = q && owner.get(q);
      const tag = tagOf.has(s) ? ` tag: ${quote(tagOf.get(s), 60)}` : '';
      if (from && from !== b && heads.get(from) === q && heads.get(b) != null) out.push(`  merge ${label.get(from)} id: ${quote(ids.get(s))}${tag}`);
      else out.push(`  commit id: ${quote(ids.get(s))}${tag}`);
      heads.set(b, s);
      for (const x of drawn) {
        if (fork.get(x.name) !== s || heads.has(x.name)) continue;
        out.push(`  branch ${label.get(x.name)}`);
        heads.set(x.name, s);
        current = x.name;
      }
    }
    return { text: out.join('\n'), commits: order.length, branches: drawn.length, cut };
  }

  /** El diagrama en un bloque de Markdown, listo para pegar en un README. */
  const markdown = (graph) => '```mermaid\n' + graph.text + '\n```\n';

  return { gitGraph, markdown, quote, MAX_BRANCHES, PER_BRANCH, PER_DEFAULT };
});
