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

  /** Busca `query` (palabras separadas por espacios; todas tienen que aparecer en el mensaje, el SHA o el autor;
      `@ana` pide el autor) y, si hay `author`, solo los commits de esa clave. Del más nuevo al más viejo. */
  function find(data, query, { author = '', limit = LIMIT } = {}) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const who = words.filter((w) => w.startsWith('@') && w.length > 1).map((w) => w.slice(1));
    const rest = words.filter((w) => !(w.startsWith('@') && w.length > 1));
    const out = [];
    for (const c of data.commits.values()) {
      const key = authorKey(c);
      if (author && key !== author) continue;
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

  GB.search = { authors, find, mount, LIMIT };
})((window.GB = window.GB || {}));
