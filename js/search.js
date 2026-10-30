/* GraphBranch — búsqueda de commits: por mensaje, SHA o autor, y filtro por autor, sobre lo ya cargado.
   No hace ninguna consulta (no gasta cuota). Todo texto entra con textContent. */
(function (GB) {
  'use strict';

  const LIMIT = 50; // resultados que se listan; el total se dice aparte

  const authorKey = (c) => c.author?.login || c.author?.name || '';

  /** Autores de los commits cargados, del que más commits tiene al que menos: [{ key, name, count }]. */
  function authors(data) {
    const map = new Map();
    for (const c of data.commits.values()) {
      const key = authorKey(c);
      if (!key) continue;
      const a = map.get(key) || map.set(key, { key, name: c.author.name || key, count: 0 }).get(key);
      a.count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  }

  /** La vista de `data` con solo las ramas que tienen commits de `author` (clave de `authors`): la rama por defecto
      siempre queda, y de las demás cuentan los commits que no están ya en ella. Los PR de las ramas quitadas se van
      con ellas. Devuelve { data, shown, total } (ramas con historia cargada); sin autor, `data` tal cual. No muta. */
  function byAuthor(data, author) {
    const total = [...data.branches.values()].filter((b) => data.commits.has(b.sha)).length;
    if (!author) return { data, shown: total, total };
    const def = data.repo?.defaultBranch;
    const reach = (sha, skip) => {
      const out = new Set();
      const stack = [sha];
      while (stack.length) {
        const s = stack.pop();
        if (!s || out.has(s) || skip.has(s) || !data.commits.has(s)) continue;
        out.add(s);
        stack.push(...(data.commits.get(s).parents || []));
      }
      return out;
    };
    const base = reach(data.branches.get(def)?.sha, new Set());
    const branches = new Map();
    for (const [name, b] of data.branches) {
      const keep = name === def || b.isDefault || !data.commits.has(b.sha) || [...reach(b.sha, base)].some((s) => authorKey(data.commits.get(s)) === author);
      if (keep) branches.set(name, b);
    }
    const pulls = new Map([...data.pulls].filter(([, p]) => !p.sameRepo || branches.has(p.head)));
    const shown = [...branches.values()].filter((b) => data.commits.has(b.sha)).length;
    return { data: { ...data, branches, pulls }, shown, total };
  }

  /** La vista de `data` sin las ramas ocultas (`view.hidden`, nombres) o con solo una (`view.solo`): la rama por defecto
      y las que aún no tienen historia cargada siempre quedan, y los PR de las ramas quitadas se van con ellas. Devuelve
      { data, shown, total } (ramas con historia cargada); sin nada oculto ni solo, `data` tal cual. No muta. */
  function byBranches(data, view) {
    const total = [...data.branches.values()].filter((b) => data.commits.has(b.sha)).length;
    const hidden = new Set(view?.hidden || []);
    const solo = view?.solo || '';
    if (!hidden.size && !solo) return { data, shown: total, total };
    const def = data.repo?.defaultBranch;
    const branches = new Map();
    for (const [name, b] of data.branches) {
      const keep = name === def || b.isDefault || !data.commits.has(b.sha) || (solo ? name === solo : !hidden.has(name));
      if (keep) branches.set(name, b);
    }
    const pulls = new Map([...data.pulls].filter(([, p]) => !p.sameRepo || branches.has(p.head)));
    const shown = [...branches.values()].filter((b) => data.commits.has(b.sha)).length;
    return { data: { ...data, branches, pulls }, shown, total };
  }

  /** La vista de `data` con solo `max` ramas con historia: la rama por defecto (cuenta como una) y las de commit más
      reciente. Las que aún no tienen historia cargada no se tocan, y los PR de las quitadas se van con ellas.
      `max` 0 o inválido: `data` tal cual. No muta. */
  function limitBranches(data, max) {
    if (!(max >= 1)) return data;
    const def = data.repo?.defaultBranch;
    const isDef = (b) => b.name === def || b.isDefault;
    const loaded = [...data.branches.values()].filter((b) => data.commits.has(b.sha));
    if (loaded.length <= max) return data;
    const slots = max - (loaded.some(isDef) ? 1 : 0);
    const when = (b) => data.commits.get(b.sha).date || 0;
    const keep = new Set(
      loaded
        .filter((b) => !isDef(b))
        .sort((a, b) => when(b) - when(a) || (a.name < b.name ? -1 : 1))
        .slice(0, Math.max(0, slots))
        .map((b) => b.name)
    );
    const branches = new Map();
    for (const [name, b] of data.branches) if (isDef(b) || !data.commits.has(b.sha) || keep.has(name)) branches.set(name, b);
    const pulls = new Map([...data.pulls].filter(([, p]) => !p.sameRepo || branches.has(p.head)));
    return { ...data, branches, pulls };
  }

  const DAY = 86400000;

  /** `2026-09-14` -> el milisegundo UTC en que empieza ese día; null si no es una fecha real. */
  function dayStart(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return new Date(t).getUTCDate() === +m[3] ? t : null;
  }

  /** Busca `query` (palabras separadas por espacios; todas tienen que aparecer en el mensaje, el SHA o el autor;
      `@ana` pide el autor; `desde:2026-09-01` y `hasta:2026-09-14` acotan por fecha, días UTC y ambos incluidos; una
      fecha que no existe cuenta como una palabra más) y, si hay `author`, solo los commits de esa clave. Del más nuevo al más viejo. */
  function find(data, query, { author = '', limit = LIMIT } = {}) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const who = words.filter((w) => w.startsWith('@') && w.length > 1).map((w) => w.slice(1));
    let from = -Infinity;
    let to = Infinity;
    const rest = words.filter((w) => {
      if (w.startsWith('@') && w.length > 1) return false;
      const m = /^(desde|hasta):(.*)$/.exec(w);
      const t = m && dayStart(m[2]);
      if (t == null) return true;
      if (m[1] === 'desde') from = Math.max(from, t);
      else to = Math.min(to, t + DAY);
      return false;
    });
    const out = [];
    for (const c of data.commits.values()) {
      const key = authorKey(c);
      if (author && key !== author) continue;
      if ((from > -Infinity || to < Infinity) && !((c.date || 0) >= from && (c.date || 0) < to && c.date)) continue;
      const names = `${c.author?.login || ''} ${c.author?.name || ''}`.toLowerCase();
      if (who.some((w) => !names.includes(w))) continue;
      const hay = `${c.sha} ${c.message || ''} ${names}`.toLowerCase();
      if (rest.some((w) => !hay.includes(w))) continue;
      out.push(c);
    }
    out.sort((a, b) => (b.date || 0) - (a.date || 0) || (a.sha < b.sha ? -1 : 1));
    return {
      total: out.length,
      results: out.slice(0, limit).map((c) => ({
        sha: c.sha,
        message: String(c.message || '').split('\n')[0],
        author: c.author?.name || c.author?.login || '',
        date: c.date,
        merge: (c.parents || []).length > 1,
      })),
    };
  }

  /** Monta el cuadro en `root` (con `input`, `select` de autor y `list`). `text(key, params)`: traductor;
      `data()`: los datos al abrir; `onGo(sha)`: Intro o clic en un resultado. Devuelve { open }. */
  function mount({ input, select, list, status }, { text, ago, data, onGo }) {
    const mk = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };

    function run() {
      const d = data();
      const { total, results } = find(d, input.value, { author: select.value });
      list.textContent = '';
      for (const r of results) {
        const li = mk('li');
        const b = mk('button', 'sr-hit');
        b.type = 'button';
        b.dataset.sha = r.sha;
        const when = r.date ? ago(r.date) : '';
        b.setAttribute('aria-label', [r.message || r.sha.slice(0, 7), r.author && text('textview.by', { author: r.author }), when, r.merge && text('textview.merge')].filter(Boolean).join(', '));
        b.appendChild(mk('span', 'tv-sha', r.sha.slice(0, 7)));
        b.appendChild(mk('span', 'tv-msg', r.message));
        b.appendChild(mk('span', 'tv-aside', [r.author, when].filter(Boolean).join(' · ')));
        li.appendChild(b);
        list.appendChild(li);
      }
      status.textContent = !total ? text('search.none') : total > results.length ? text('search.some', { n: results.length, total }) : text('search.count', { n: total });
    }

    function open() {
      const d = data();
      const keep = select.value;
      select.textContent = '';
      const all = mk('option', null, text('search.anyAuthor'));
      all.value = '';
      select.appendChild(all);
      for (const a of authors(d)) {
        const o = mk('option', null, `${a.name} (${a.count})`);
        o.value = a.key;
        select.appendChild(o);
      }
      select.value = [...select.options].some((o) => o.value === keep) ? keep : '';
      run();
    }

    input.addEventListener('input', run);
    select.addEventListener('change', run);
    const hits = () => [...list.querySelectorAll('.sr-hit')];
    list.addEventListener('click', (ev) => {
      const b = ev.target.closest?.('.sr-hit');
      if (b) onGo(b.dataset.sha);
    });
    list.addEventListener('keydown', (ev) => {
      const all = hits();
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      if (ev.key === 'ArrowDown') all[Math.min(all.length - 1, i + 1)].focus();
      else if (ev.key === 'ArrowUp') (i ? all[i - 1] : input).focus();
      else return;
      ev.preventDefault();
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') hits()[0]?.focus();
      else if (ev.key === 'Enter') hits()[0] && onGo(hits()[0].dataset.sha);
      else return;
      ev.preventDefault();
    });
    return { open, run };
  }

  /** La vista de `data` con solo la cadena del primer padre de cada rama, como `git log --first-parent`: por cada
      cabeza se sigue `parents[0]`, y lo que solo alcanza un segundo padre (lo que una fusión trajo) se va; cada commit
      que queda conserva únicamente su primer padre. Sin consultas: usa lo ya cargado. No muta. */
  function firstParent(data) {
    const commits = new Map();
    for (const b of data.branches.values()) {
      let sha = b.sha;
      while (sha && !commits.has(sha) && data.commits.has(sha)) {
        const c = data.commits.get(sha);
        const first = c.parents?.length ? [c.parents[0]] : [];
        commits.set(sha, { ...c, parents: first });
        sha = first[0];
      }
    }
    return { ...data, commits };
  }

  /** ?firstparent=1 (o solo ?firstparent): abrir el grafo con el primer padre ya activo. 0, false, no u off lo apagan. */
  function firstParentParam(q) {
    return !!q && typeof q.has === 'function' && q.has('firstparent') && !/^(0|false|no|off)$/i.test(String(q.get('firstparent')).trim());
  }

  const NAME_MAX = 200;
  const cleanName = (v) => String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX); // eslint-disable-line no-control-regex

  /** ?solo=rama o ?ocultar=a&ocultar=b: abrir el repo con esas ramas ocultas o con una sola. Los nombres se leen como
      texto (sin caracteres de control, hasta 200); cada `ocultar` es una rama (sin partir por comas: git las admite en
      un nombre) y `solo` manda sobre `ocultar`. null si la URL no pide nada. */
  function branchViewParam(q) {
    if (!q || typeof q.get !== 'function') return null;
    const solo = cleanName(q.get('solo') ?? '');
    if (solo) return { hidden: [], solo };
    const hidden = [...new Set((q.getAll('ocultar') || []).map(cleanName).filter(Boolean))].slice(0, 50);
    return hidden.length ? { hidden, solo: '' } : null;
  }

  const PATH_MAX = 200;

  /** La ruta que pide la URL (?path=src/): recortada, sin barra inicial ni caracteres de control, de hasta 200; '' si no hay. */
  function pathParam(q) {
    const v = q && typeof q.get === 'function' ? q.get('path') : null;
    if (typeof v !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^\/+/, '').slice(0, PATH_MAX);
  }

  /** La persona que pide la URL (?author=ana): recortada, sin caracteres de control, de hasta 100; '' si no hay. */
  function authorParam(q) {
    const v = q && typeof q.get === 'function' ? q.get('author') : null;
    if (typeof v !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  }

  /** La búsqueda que pide la URL (?q=texto): recortada, sin caracteres de control, de hasta 100; '' si no hay. */
  function queryParam(q) {
    const v = q && typeof q.get === 'function' ? q.get('q') : null;
    if (typeof v !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  }

  GB.search = { authors, authorParam, branchViewParam, byAuthor, byBranches, firstParent, firstParentParam, limitBranches, find, mount, pathParam, queryParam, LIMIT };
})((window.GB = window.GB || {}));
