/* GraphBranch — vista de texto: las ramas y sus últimos commits como un árbol (role="tree") que se recorre
   con el teclado y lo lee un lector de pantalla. Dice lo mismo que el grafo, sin dibujarlo. No hace ninguna
   consulta: parte del estado ya cargado. Todo texto entra con textContent. */
(function (GB) {
  'use strict';

  const PER_BRANCH = 10; // commits que muestra cada rama (siguiendo el primer padre)
  const MAX_BRANCHES = 200; // con más ramas, las más recientes: el árbol tiene que seguir siendo legible

  /** Ramas (la por defecto primero, luego las más movidas) con sus últimos commits, del más nuevo al más viejo. */
  function build(data, { perBranch = PER_BRANCH, maxBranches = MAX_BRANCHES } = {}) {
    const marks = new Map(); // sha -> [tag]
    if (data.tags) for (const [sha, names] of data.tags) marks.set(sha, [...names]);
    const def = data.repo?.defaultBranch;
    const list = [...data.branches.values()]
      .filter((b) => b.sha && data.commits.has(b.sha))
      .sort((a, b) => (b.isDefault || b.name === def) - (a.isDefault || a.name === def) || (b.movedAt || 0) - (a.movedAt || 0) || (a.name < b.name ? -1 : 1));
    const total = list.length;
    const rows = list.slice(0, maxBranches).map((b) => {
      const commits = [];
      const seen = new Set();
      let sha = b.sha;
      while (sha && data.commits.has(sha) && !seen.has(sha) && commits.length < perBranch) {
        seen.add(sha);
        const c = data.commits.get(sha);
        commits.push({
          sha,
          message: String(c.message || '').split('\n')[0],
          author: c.author?.name || c.author?.login || '',
          date: c.date,
          merge: (c.parents || []).length > 1,
          tags: marks.get(sha) || [],
        });
        sha = c.parents?.[0];
      }
      return { name: b.name, isDefault: !!(b.isDefault || b.name === def), commits };
    });
    return { total, branches: rows };
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

  /** Monta el árbol en `root`. `text(key, params)`: traductor; `onGo({ branch, sha })`: Enter sobre un nodo.
      Teclado: ↑ ↓ recorren lo visible, → abre o baja al primer hijo, ← cierra o sube al padre, Inicio y Fin. */
  function mount(root, { text, ago, onGo, filterInput, live }) {
    const seen = { branches: new Set(), shas: new Set() };
    const open = new Set(); // ramas abiertas
    let tree = { total: 0, branches: [] };
    let query = '';
    let timer = 0;
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
      if (!shown.length) return void root.appendChild(mk('p', 'hl-none', text('health.none')));
      const ul = mk('ul', 'tv-tree');
      ul.setAttribute('role', 'tree');
      ul.setAttribute('aria-label', text('textview.title'));
      shown.forEach((b, i) => {
        const li = mk('li', 'tv-branch');
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-expanded', open.has(b.name) ? 'true' : 'false');
        li.setAttribute('aria-label', `${b.name}${b.isDefault ? ', ' + text('textview.default') : ''}, ${text('textview.shown', { n: b.commits.length })}`);
        li.tabIndex = i === 0 ? 0 : -1;
        li.dataset.branch = b.name;
        const head = mk('span', 'tv-head');
        head.appendChild(mk('span', 'tv-name', b.name));
        if (b.isDefault) head.appendChild(mk('span', 'tv-tag', text('textview.default')));
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
          const parts = [c.message || c.sha.slice(0, 7), c.author && text('textview.by', { author: c.author }), when, c.merge && text('textview.merge'), ...c.tags];
          ci.setAttribute('aria-label', parts.filter(Boolean).join(', '));
          ci.appendChild(mk('span', 'tv-sha', c.sha.slice(0, 7)));
          ci.appendChild(mk('span', 'tv-msg', c.message || ''));
          ci.appendChild(mk('span', 'tv-aside', [c.merge && text('textview.merge'), ...c.tags, when].filter(Boolean).join(' · ')));
          group.appendChild(ci);
        }
        li.appendChild(group);
        ul.appendChild(li);
      });
      root.appendChild(ul);
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
    function render(next) {
      tree = next;
      query = '';
      if (filterInput) filterInput.value = '';
      seen.branches = new Set(next.branches.map((b) => b.name));
      seen.shas = new Set(next.branches.flatMap((b) => b.commits.map((c) => c.sha)));
      open.clear();
      for (const b of next.branches) if (b.isDefault) open.add(b.name);
      say('');
      draw();
    }

    /** Con el árbol abierto y datos nuevos: redibuja sin perder el foco ni lo abierto, y avisa solo de lo que no se había leído. */
    function update(next) {
      const fresh = news(next, seen);
      const inside = root.contains(document.activeElement) ? document.activeElement.closest?.('[role="treeitem"]') : null;
      const key = inside && keyOf(inside);
      tree = next;
      for (const b of next.branches) seen.branches.add(b.name);
      for (const c of fresh.commits) seen.shas.add(c);
      draw();
      if (key) {
        const back = [...root.querySelectorAll('[role="treeitem"]')].find((n) => keyOf(n) === key && !n.parentElement.closest('[hidden]'));
        if (back) focus(back);
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
    const branchOf = (n) => (n.classList.contains('tv-branch') ? n : n.closest('.tv-branch'));

    root.addEventListener('keydown', (ev) => {
      const n = ev.target.closest?.('[role="treeitem"]');
      if (!n || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const vis = items();
      const i = vis.indexOf(n);
      const isBranch = n.classList.contains('tv-branch');
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
      focus(n);
      if (n.classList.contains('tv-branch') && ev.target.closest('.tv-head')) setOpen(n, n.getAttribute('aria-expanded') !== 'true');
      else onGo({ branch: branchOf(n).dataset.branch, sha: n.dataset.sha || null });
    });

    return { render, update };
  }

  GB.textview = { build, news, filter, mount, PER_BRANCH, MAX_BRANCHES };
})((window.GB = window.GB || {}));
