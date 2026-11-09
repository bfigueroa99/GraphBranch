/* GraphBranch — vista de texto: las ramas y sus últimos commits como un árbol (role="tree") que se recorre
   con el teclado y lo lee un lector de pantalla. Dice lo mismo que el grafo, sin dibujarlo. No hace ninguna
   consulta: parte del estado ya cargado. Todo texto entra con textContent. */
(function (GB) {
  'use strict';

  const PER_BRANCH = 10; // commits que muestra cada rama (siguiendo el primer padre)
  const MAX_BRANCHES = 200; // con más ramas, las más recientes: el árbol tiene que seguir siendo legible
  const MAX_FORKS = 10; // forks que lista la vista, el push más reciente primero
  const DAY = 864e5;
  // una rama quieta: los mismos 30 días de las ramas olvidadas de la salud (js/health.js); los textos de 'textview.quiet' dicen 30
  const QUIET_DAYS = 30;
  const FRESH_DAYS = 7; // una rama creada en los últimos 7 días se dice nueva (los textos de 'textview.fresh' dicen 7)

  const at = (x) => (typeof x === 'number' ? x : Date.parse(x) || 0);
  const PULLS_PAGE = 50; // las fuentes traen los PRs abiertos de a 50 (los más recientes): con 50 o más puede faltar alguno

  /** Si la lista de PRs abiertos ya cargada está completa, para decir de una rama que no tiene ninguno: la fuente los
      trae (no un repo local ni la práctica de git) y el token puede leerlos (`pullsUnknown`), no se recortó (menos de una página y no menos que el total que da
      la fuente) y el repo ya cargó. Va sobre el estado sin filtrar: una vista filtrada pierde los PRs de sus ramas quitadas. */
  function pullsComplete(data) {
    const r = data?.repo || {};
    if (!data?.loaded || data.pullsUnknown || r.local || r.practice || typeof data.pulls?.size !== 'number') return false;
    const n = data.pulls.size;
    return n < PULLS_PAGE && (Number(data.totalPulls) || 0) <= n;
  }

  /** Los forks activos ya cargados (`data.forks`), el push más reciente primero; sin url https o sin push no cuentan. */
  function forks(data, max = MAX_FORKS) {
    const all = (data.forks || [])
      .filter((f) => f && f.fullName && f.pushedAt && /^https:\/\//.test(String(f.url || '')))
      .map((f) => ({ name: String(f.fullName), url: String(f.url), pushedAt: at(f.pushedAt) }))
      .sort((a, b) => b.pushedAt - a.pushedAt || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { total: all.length, rows: all.slice(0, max) };
  }

  /** Ramas (la por defecto primero, luego las más movidas) con sus últimos commits, del más nuevo al más viejo.
      `quiet`: la rama no tuvo actividad en más de QUIET_DAYS días hasta `now`; `fresh`: la rama (no la por defecto) está en el Set `fresh` de `freshBranches`.
      `noPr`: con `pullsKnown` (lo da `pullsComplete` sobre el estado sin filtrar), la rama no es la por defecto, no está
      fusionada y no sale de ella ningún PR abierto de este repo. */
  function build(data, { perBranch = PER_BRANCH, maxBranches = MAX_BRANCHES, paths = null, releases = null, fresh = null, withForks = false, pullsKnown = false, now = Date.now() } = {}) {
    const marks = new Map(); // sha -> [tag]
    if (data.tags) for (const [sha, names] of data.tags) marks.set(sha, [...names]);
    const relTags = releases?.tags || new Set();
    const relShas = releases?.shas || new Map();
    const def = data.repo?.defaultBranch;
    const list = [...data.branches.values()]
      .filter((b) => b.sha && data.commits.has(b.sha))
      .sort((a, b) => (b.isDefault || b.name === def) - (a.isDefault || a.name === def) || (b.movedAt || 0) - (a.movedAt || 0) || (a.name < b.name ? -1 : 1));
    const total = list.length;
    // lo ya fusionado en la por defecto: lo alcanzable desde su punta por cualquier padre, con lo cargado (un squash no deja rastro)
    const defTip = list.find((b) => b.isDefault || b.name === def)?.sha;
    const inDef = new Set();
    for (const stack = defTip ? [defTip] : []; stack.length;) {
      const sha = stack.pop();
      if (inDef.has(sha) || !data.commits.has(sha)) continue;
      inDef.add(sha);
      for (const p of data.commits.get(sha).parents || []) stack.push(p);
    }
    // PRs abiertos ya cargados por rama (los de forks no cuentan: su rama no es de este repo)
    const open = new Map();
    for (const p of data.pulls?.values?.() || []) if (p && p.sameRepo && p.head) open.set(p.head, (open.get(p.head) || 0) + 1);
    // `paths` (Set de shas, el filtro por ruta): solo cuentan los commits que tocaron esa ruta; sin ninguno, la rama no entra
    const keep = (sha) => !paths || paths.has(sha);
    const rows = list.slice(0, maxBranches).map((b) => {
      const commits = [];
      const seen = new Set();
      let sha = b.sha;
      while (sha && data.commits.has(sha) && !seen.has(sha) && commits.length < perBranch) {
        seen.add(sha);
        const c = data.commits.get(sha);
        if (!keep(sha)) {
          sha = c.parents?.[0];
          continue;
        }
        const tags = marks.get(sha) || [];
        const rel = tags.filter((t) => relTags.has(t));
        if (!rel.length && relShas.has(sha)) rel.push(relShas.get(sha));
        commits.push({
          sha,
          message: String(c.message || '').split('\n')[0],
          author: c.author?.name || c.author?.login || '',
          date: c.date,
          merge: (c.parents || []).length > 1,
          tags: tags.filter((t) => !rel.includes(t)),
          releases: rel,
        });
        sha = c.parents?.[0];
      }
      // la actividad es la del grafo (js/layout.js): el commit de la punta o, si fue después, cuando se movió la rama (creada
      // hoy desde un commit viejo no está quieta); con el filtro por ruta cuenta igual la punta, no el último commit que la tocó
      const last = Math.max(at(data.commits.get(b.sha)?.date), at(b.movedAt));
      const quiet = last > 0 && now - last > QUIET_DAYS * DAY;
      const isDefault = !!(b.isDefault || b.name === def);
      // fusionada: su punta ya está en la por defecto y no es la misma punta (una rama recién creada no es una fusionada)
      const merged = !isDefault && inDef.has(b.sha) && b.sha !== defTip;
      // el autor del commit de la punta (no quien empujó la rama); con el filtro por ruta, igual la punta
      const tip = data.commits.get(b.sha)?.author;
      const tipAuthor = String(tip?.name || tip?.login || '');
      const prs = open.get(b.name) || 0;
      const noPr = !!pullsKnown && !isDefault && !merged && !prs;
      return { name: b.name, isDefault, tipAuthor, prs, noPr, quiet, merged, ciFailing: data.ci?.get?.(b.name) === 'failure', fresh: !isDefault && !!fresh?.has(b.name), commits };
    }).filter((b) => !paths || b.commits.length);
    return { total, branches: rows, forks: withForks ? forks(data) : { total: 0, rows: [] } };
  }

  /** Los releases que dicen las actividades del feed (`kind: 'release'`): sus tags y, si traen `sha`, ese commit. */
  function releaseMarks(acts) {
    const tags = new Set();
    const shas = new Map();
    for (const a of acts || []) {
      if (!a || a.kind !== 'release') continue;
      const tag = String((a.title && typeof a.title === 'object' && a.title.params && a.title.params.tag) || a.tag || '');
      if (tag) tags.add(tag);
      if (tag && a.sha) shas.set(a.sha, tag);
    }
    return { tags, shas };
  }

  /** Los nombres de las ramas creadas en los últimos FRESH_DAYS días según los eventos ya cargados (`branch-create`); sin hora o en el futuro no cuentan. */
  function freshBranches(acts, now = Date.now()) {
    const names = new Set();
    for (const a of acts || []) {
      if (!a || a.kind !== 'branch-create' || !a.branch || !(a.time > 0)) continue;
      if (a.time <= now && now - a.time <= FRESH_DAYS * DAY) names.add(String(a.branch));
    }
    return names;
  }

  /** Qué hay de nuevo en `tree` frente a lo ya leído (`seen`: { branches:Set, shas:Set }): ramas y commits sin repetir. */
  function news(tree, seen) {
    const branches = tree.branches.map((b) => b.name).filter((n) => !seen.branches.has(n));
    const shas = new Set();
    for (const b of tree.branches) for (const c of b.commits) if (!seen.shas.has(c.sha)) shas.add(c.sha);
    return { branches, commits: [...shas] };
  }

  /** Las ramas cuyo nombre contiene `q` (sin distinguir mayúsculas); `q` vacío las deja todas. */
  function filter(tree, q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return tree.branches;
    return tree.branches.filter((b) => b.name.toLowerCase().includes(needle));
  }

  /** Cuántos commits del árbol llevan tag (cada uno una vez, aunque salga en dos ramas). */
  function taggedCount(tree) {
    const shas = new Set();
    for (const b of tree.branches) for (const c of b.commits) if (c.tags.length) shas.add(c.sha);
    return shas.size;
  }

  /** Cuántos commits del árbol llevan release (cada uno una vez). */
  function releasedCount(tree) {
    const shas = new Set();
    for (const b of tree.branches) for (const c of b.commits) if (c.releases.length) shas.add(c.sha);
    return shas.size;
  }

  /** Lo que dice la vista de los filtros activos: `scope` = { author, shown, total, branches: { shown, total }, path, count }. Vacío sin filtros. */
  function scopeText(scope, text) {
    if (!scope) return '';
    const out = [];
    if (scope.author) out.push(text('textview.scopeAuthor', { author: scope.author, shown: scope.shown, total: scope.total }));
    if (scope.branches) out.push(text('branchview.status', { n: scope.branches.shown, total: scope.branches.total }));
    if (scope.path) out.push(text('textview.scopePath', { path: scope.path, n: scope.count }));
    return out.join('. ');
  }

  /** Qué pide una tecla sobre una rama: H la oculta, S la deja sola, A vuelve a ver todas; con Ctrl, Alt o Meta (atajos del navegador), nada. */
  function viewAction(ev) {
    if (!ev || ev.ctrlKey || ev.altKey || ev.metaKey) return null;
    const k = String(ev.key || '').toLowerCase();
    return k === 'h' ? 'hide' : k === 's' ? 'solo' : k === 'a' ? 'all' : null;
  }

  /** Lo que dice la vista tras ocultar o dejar sola una rama: `solo` es la rama que quedó sola ('' si ya no hay ninguna). */
  function viewNote(how, name, solo, text) {
    if (how === 'hide') return text('textview.hidden', { name });
    if (how === 'all') return text('branchview.reset');
    return solo === name ? text('textview.soloed', { name }) : text('branchview.reset');
  }

  /** Monta el árbol en `root`. `text(key, params)`: traductor; `onGo({ branch, sha })`: Enter sobre un nodo.
      `onView(name, how)` (how: 'hide' | 'solo') y `canHide()`: ocultar una rama o dejarla sola desde aquí (H y S, o sus botones);
      la rama por defecto no se oculta. `onReset()` (tecla A o el botón `showAllEl`, visibles solo con ramas ocultas): vuelve a ver todas. Teclado: ↑ ↓ recorren lo visible, → abre o baja al primer hijo, ← cierra o sube al padre, Inicio y Fin. */
  function mount(root, { text, ago, onGo, onView, canHide, filterInput, live, scopeEl, showAllEl, onReset }) {
    const hideOk = (b) => !!onView && !b.isDefault && (!canHide || canHide());
    const seen = { branches: new Set(), shas: new Set() };
    const open = new Set(); // ramas abiertas
    let tree = { total: 0, branches: [] };
    let query = '';
    let timer = 0;
    let viewOn = false; // hay ramas ocultas o «solo una» en el grafo: lo dice el `scope` que llega con el árbol
    const syncAll = (scope) => {
      viewOn = !!scope?.branches;
      if (showAllEl) showAllEl.hidden = !viewOn || !onReset;
    };
    const say = (msg) => {
      if (live) live.textContent = msg;
    };
    const mk = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };

    function draw() {
      root.textContent = '';
      const shown = filter(tree, query);
      if (!shown.length) root.appendChild(mk('p', 'hl-none', text('health.none')));
      else root.appendChild(drawTree(shown));
      if (tree.forks?.total) root.appendChild(drawForks(tree.forks));
    }

    /** Los forks activos: una lista de enlaces fuera del árbol (no son ramas), con su nombre y cuándo fue su último push. */
    function drawForks(f) {
      const sec = mk('section', 'tv-forks');
      const h = mk('h3', 'tv-forks-h', text('textview.forks', { n: f.total }));
      h.id = 'tv-forks-h';
      sec.setAttribute('aria-labelledby', h.id);
      sec.appendChild(h);
      const ul = mk('ul', 'tv-forks-list');
      for (const r of f.rows) {
        const li = mk('li');
        const a = mk('a', 'tv-fork');
        a.href = GB.U.safeUrl(r.url);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const when = ago(r.pushedAt);
        a.setAttribute('aria-label', text('textview.fork', { name: r.name, when }));
        a.appendChild(mk('span', 'tv-name', r.name));
        a.appendChild(mk('span', 'tv-aside', when));
        li.appendChild(a);
        ul.appendChild(li);
      }
      sec.appendChild(ul);
      return sec;
    }

    function drawTree(shown) {
      const ul = mk('ul', 'tv-tree');
      ul.setAttribute('role', 'tree');
      ul.setAttribute('aria-label', text('textview.title'));
      ul.setAttribute('aria-describedby', 'textview-help'); // las teclas del árbol se leen al entrar en él (en un div sin rol se ignoraba)
      shown.forEach((b, i) => {
        const li = mk('li', 'tv-branch');
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-expanded', open.has(b.name) ? 'true' : 'false');
        li.setAttribute('aria-label', `${b.name}${b.isDefault ? ', ' + text('textview.default') : ''}${b.prs ? ', ' + text('textview.prs', { n: b.prs }) : ''}${b.noPr ? ', ' + text('textview.noPr') : ''}${b.fresh ? ', ' + text('textview.fresh') : ''}${b.quiet ? ', ' + text('textview.quiet') : ''}${b.merged ? ', ' + text('textview.merged') : ''}${b.ciFailing ? ', ' + text('textview.ciFailing') : ''}${b.tipAuthor ? ', ' + text('textview.tipBy', { author: b.tipAuthor }) : ''}, ${text('textview.shown', { n: b.commits.length })}`);
        li.tabIndex = i === 0 ? 0 : -1;
        li.dataset.branch = b.name;
        // el nombre y sus marcas se acomodan en una o más líneas; los botones de ocultar y de dejarla sola, siempre juntos
        // al final de la primera (antes uno podía quedar solo en la línea de abajo)
        const head = mk('span', 'tv-head');
        const info = mk('span', 'tv-info');
        head.appendChild(info);
        info.appendChild(mk('span', 'tv-name', b.name));
        if (b.isDefault) info.appendChild(mk('span', 'tv-tag', text('textview.default')));
        if (b.prs) info.appendChild(mk('span', 'tv-tag', text('textview.prs', { n: b.prs })));
        if (b.fresh) info.appendChild(mk('span', 'tv-tag', text('textview.fresh')));
        if (b.quiet) info.appendChild(mk('span', 'tv-tag', text('textview.quiet')));
        if (b.merged) info.appendChild(mk('span', 'tv-tag', text('textview.merged')));
        if (b.ciFailing) info.appendChild(mk('span', 'tv-tag tv-ci-fail', '✗ ' + text('textview.ciFailing')));
        if (hideOk(b)) {
          const acts = mk('span', 'tv-acts');
          head.appendChild(acts);
          for (const [how, glyph] of [['hide', '⊘'], ['solo', '◎']]) {
            const btn = mk('button', 'tv-act', glyph);
            btn.type = 'button';
            btn.tabIndex = -1;
            btn.dataset.act = how;
            btn.setAttribute('aria-label', text(how === 'hide' ? 'textview.hideBranch' : 'textview.soloBranch', { name: b.name }));
            btn.title = btn.getAttribute('aria-label');
            acts.appendChild(btn);
          }
        }
        li.appendChild(head);
        const group = mk('ul', 'tv-commits');
        group.setAttribute('role', 'group');
        group.hidden = !open.has(b.name);
        for (const c of b.commits) {
          const ci = mk('li', 'tv-commit');
          ci.setAttribute('role', 'treeitem');
          ci.tabIndex = -1;
          ci.dataset.sha = c.sha;
          const when = c.date ? ago(c.date) : '';
          const parts = [c.message || c.sha.slice(0, 7), c.author && text('textview.by', { author: c.author }), when, c.merge && text('textview.merge'), ...c.releases.map((t) => text('textview.release', { name: t })), ...c.tags.map((t) => text('textview.tag', { name: t }))];
          ci.setAttribute('aria-label', parts.filter(Boolean).join(', '));
          ci.appendChild(mk('span', 'tv-sha', c.sha.slice(0, 7)));
          ci.appendChild(mk('span', 'tv-msg', c.message || ''));
          ci.appendChild(mk('span', 'tv-aside', [c.merge && text('textview.merge'), ...c.releases.map((t) => text('textview.release', { name: t })), ...c.tags, when].filter(Boolean).join(' · ')));
          group.appendChild(ci);
        }
        li.appendChild(group);
        ul.appendChild(li);
      });
      return ul;
    }

    const items = () => [...root.querySelectorAll('[role="treeitem"]')].filter((n) => !n.parentElement.closest('[hidden]'));
    const focus = (n) => {
      if (!n) return;
      root.querySelectorAll('[role="treeitem"][tabindex="0"]').forEach((x) => (x.tabIndex = -1));
      n.tabIndex = 0;
      n.focus();
    };
    const setOpen = (li, on) => {
      li.setAttribute('aria-expanded', String(on));
      li.querySelector('.tv-commits').hidden = !on;
      if (on) open.add(li.dataset.branch);
      else open.delete(li.dataset.branch);
    };
    const keyOf = (n) => (n.dataset.sha ? `c:${n.closest('.tv-branch').dataset.branch}:${n.dataset.sha}` : `b:${n.dataset.branch}`);

    /** Primera vez (al abrir): todo lo que hay cuenta como leído y solo la rama por defecto viene abierta. */
    function render(next, scope) {
      tree = next;
      syncAll(scope);
      const note = scopeText(scope, text);
      if (scopeEl) {
        scopeEl.textContent = note;
        scopeEl.hidden = !note;
      }
      query = '';
      if (filterInput) filterInput.value = '';
      seen.branches = new Set(next.branches.map((b) => b.name));
      seen.shas = new Set(next.branches.flatMap((b) => b.commits.map((c) => c.sha)));
      open.clear();
      for (const b of next.branches) if (b.isDefault) open.add(b.name);
      const tagged = taggedCount(next);
      const released = releasedCount(next);
      say([note, tagged && text('textview.tagged', { n: tagged }), released && text('textview.released', { n: released }), next.forks?.total && text('textview.forks', { n: next.forks.total })].filter(Boolean).join('. '));
      draw();
    }

    /** Con el árbol abierto y datos nuevos: redibuja sin perder el foco ni lo abierto, y avisa solo de lo que no se había leído. */
    function update(next, scope) {
      const fresh = news(next, seen);
      const inside = root.contains(document.activeElement) ? document.activeElement.closest?.('[role="treeitem"]') : null;
      const key = inside && keyOf(inside);
      const pos = inside ? items().indexOf(inside) : -1;
      tree = next;
      if (scope !== undefined) syncAll(scope);
      if (scope !== undefined && scopeEl) {
        const note = scopeText(scope, text);
        scopeEl.textContent = note;
        scopeEl.hidden = !note;
      }
      for (const b of next.branches) seen.branches.add(b.name);
      for (const c of fresh.commits) seen.shas.add(c);
      draw();
      if (key) {
        const back = [...root.querySelectorAll('[role="treeitem"]')].find((n) => keyOf(n) === key && !n.parentElement.closest('[hidden]'));
        if (back) focus(back);
        else if (pos >= 0) {
          const vis = items(); // la rama con el foco ya no está (se ocultó): el foco queda en el lugar que ocupaba
          focus(vis[Math.min(pos, vis.length - 1)] || filterInput);
        }
      }
      if (fresh.branches.length || fresh.commits.length) say(text('textview.live', { branches: fresh.branches.length, commits: fresh.commits.length }));
    }

    if (filterInput) {
      filterInput.addEventListener('input', () => {
        query = filterInput.value;
        draw();
        clearTimeout(timer);
        timer = setTimeout(() => say(text('textview.filtered', { shown: filter(tree, query).length, total: tree.branches.length })), 500);
      });
      filterInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') {
          const first = root.querySelector('[role="treeitem"]');
          if (first) {
            focus(first);
            ev.preventDefault();
          }
        }
      });
    }
    if (showAllEl) {
      showAllEl.hidden = true;
      showAllEl.addEventListener('click', () => {
        if (!onReset || !viewOn) return;
        const focusBack = document.activeElement === showAllEl;
        onReset();
        const first = root.querySelector('[role="treeitem"]'); // el botón se esconde: el foco pasa al árbol (o al filtro si quedó vacío)
        if (focusBack) first ? focus(first) : filterInput?.focus();
      });
    }
    const branchOf = (n) => (n.classList.contains('tv-branch') ? n : n.closest('.tv-branch'));

    root.addEventListener('keydown', (ev) => {
      const n = ev.target.closest?.('[role="treeitem"]');
      if (!n || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const vis = items();
      const i = vis.indexOf(n);
      const isBranch = n.classList.contains('tv-branch');
      const how = viewAction(ev);
      if (how === 'all') {
        if (onReset && viewOn) {
          onReset();
          ev.preventDefault();
        }
        return;
      }
      if (how && onView) {
        const b = branchOf(n);
        const row = tree.branches.find((x) => x.name === b.dataset.branch);
        if (row && hideOk(row)) {
          onView(row.name, how);
          ev.preventDefault();
        }
        return;
      }
      let handled = true;
      if (ev.key === 'ArrowDown') focus(vis[Math.min(vis.length - 1, i + 1)]);
      else if (ev.key === 'ArrowUp') focus(vis[Math.max(0, i - 1)]);
      else if (ev.key === 'Home') focus(vis[0]);
      else if (ev.key === 'End') focus(vis[vis.length - 1]);
      else if (ev.key === 'ArrowRight' && isBranch) {
        if (n.getAttribute('aria-expanded') !== 'true') setOpen(n, true);
        else focus(n.querySelector('.tv-commit'));
      } else if (ev.key === 'ArrowLeft') {
        if (isBranch && n.getAttribute('aria-expanded') === 'true') setOpen(n, false);
        else if (!isBranch) focus(branchOf(n));
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        onGo({ branch: branchOf(n).dataset.branch, sha: n.dataset.sha || null });
      } else handled = false;
      if (handled) ev.preventDefault();
    });
    root.addEventListener('click', (ev) => {
      const n = ev.target.closest?.('[role="treeitem"]');
      if (!n) return;
      ev.stopPropagation();
      const act = ev.target.closest?.('.tv-act');
      if (act && onView) return onView(branchOf(n).dataset.branch, act.dataset.act);
      focus(n);
      if (n.classList.contains('tv-branch') && ev.target.closest('.tv-head')) setOpen(n, n.getAttribute('aria-expanded') !== 'true');
      else onGo({ branch: branchOf(n).dataset.branch, sha: n.dataset.sha || null });
    });

    /** Escribe `q` en el filtro de ramas (el ?q= de la URL) y lo dice junto con los filtros activos del grafo. */
    function setFilter(q) {
      query = q;
      if (filterInput) filterInput.value = q;
      draw();
      if (!q) return;
      const note = scopeEl && !scopeEl.hidden ? scopeEl.textContent : '';
      say([note, text('textview.filtered', { shown: filter(tree, q).length, total: tree.branches.length })].filter(Boolean).join('. '));
    }

    return { render, update, setFilter, say };
  }

  /** ¿Pide la URL abrir la vista de texto (?vista=texto o ?view=text)? Con ?path= y ?q= ya aplicados. */
  function openParam(q) {
    if (!q || typeof q.get !== 'function') return false;
    const is = (k, word) => {
      const v = q.get(k);
      return typeof v === 'string' && v.trim().toLowerCase() === word;
    };
    return is('vista', 'texto') || is('view', 'text');
  }

  GB.textview = { build, pullsComplete, forks, news, taggedCount, releasedCount, releaseMarks, freshBranches, filter, scopeText, viewAction, viewNote, mount, openParam, PER_BRANCH, MAX_BRANCHES, MAX_FORKS, QUIET_DAYS, PULLS_PAGE };
})((window.GB = window.GB || {}));
