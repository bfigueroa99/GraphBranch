/* GraphBranch — los cambios de cada commit: leer un diff, elegir el commit anterior y el siguiente, y el
   panel que los muestra al lado del grafo para pasar de un commit a otro sin cerrarlo.

   Cada fuente da los cambios de un commit con `commitDiff(sha)` (frente a su primer padre), en esta forma:
     { files: [{ path, from, status, add, del, binary, patch, url }], truncated }
   donde `patch` son los tramos del diff unificado (desde la primera línea «@@»), o null si el servicio no
   lo dio (binario o demasiado grande). Todo texto que viene del repo entra con textContent. */
(function (GB) {
  'use strict';

  /* ---------- leer un diff ---------- */

  const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

  /** Una ruta entre comillas de git ("a/caf\303\251.txt"): escapes de C y octales que son bytes de UTF-8. */
  function unquote(s) {
    if (!s.startsWith('"')) return s;
    const bytes = [];
    const ESC = { n: 10, t: 9, r: 13, b: 8, f: 12, v: 11, a: 7, '"': 34, '\\': 92 };
    for (let i = 1; i < s.length - 1; i++) {
      const c = s[i];
      if (c !== '\\') {
        for (const b of new TextEncoder().encode(c)) bytes.push(b);
        continue;
      }
      const n = s[++i];
      if (/[0-7]/.test(n)) {
        bytes.push(parseInt(s.slice(i, i + 3), 8));
        i += 2;
      } else bytes.push(ESC[n] ?? n.charCodeAt(0));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  /** La ruta de una línea «--- a/x» o «+++ b/x» (null si es /dev/null). */
  function side(rest) {
    const p = unquote(rest.replace(/\t.*$/, ''));
    if (p === '/dev/null') return null;
    return p.replace(/^[ab]\//, '');
  }

  /** Líneas agregadas y quitadas de un tramo de diff. */
  function count(patch) {
    let add = 0;
    let del = 0;
    let inHunk = false;
    for (const line of String(patch || '').split('\n')) {
      if (line.startsWith('@@')) inHunk = true;
      else if (!inHunk) continue;
      else if (line[0] === '+') add++;
      else if (line[0] === '-') del++;
    }
    return { add, del };
  }

  /** Un `git diff` (o `git show`) entero → los archivos, cada uno con su tramo, como los da commitDiff. */
  function parseGit(text) {
    const files = [];
    let f = null;
    let body = null;
    const close = () => {
      if (!f) return;
      if (body) {
        f.patch = body.join('\n');
        Object.assign(f, count(f.patch));
      }
      if (!f.path) f.path = f.from || '';
      if (f.status !== 'renamed') f.from = null;
      files.push(f);
    };
    for (const line of String(text || '').split('\n')) {
      if (line.startsWith('diff --git ')) {
        close();
        // las rutas de verdad salen de ---/+++ o rename; esto es por si no hay (modo, binario, vacío)
        const m = /^diff --git ("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|.+)$/.exec(line);
        f = { path: m ? side(m[2]) : '', from: null, status: 'modified', add: 0, del: 0, binary: false, patch: null, url: null };
        body = null;
        continue;
      }
      if (!f) continue;
      if (body) {
        body.push(line);
        continue;
      }
      if (line.startsWith('@@')) body = [line];
      else if (line.startsWith('new file mode')) f.status = 'added';
      else if (line.startsWith('deleted file mode')) f.status = 'removed';
      else if (line.startsWith('rename from ')) (f.status = 'renamed'), (f.from = unquote(line.slice(12)));
      else if (line.startsWith('rename to ')) f.path = unquote(line.slice(10));
      else if (line.startsWith('copy to ')) (f.status = 'added'), (f.path = unquote(line.slice(8)));
      else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) f.binary = true;
      else if (line.startsWith('--- ')) {
        const p = side(line.slice(4));
        if (p && f.status === 'renamed') f.from = p;
        else if (!p) f.status = 'added';
      } else if (line.startsWith('+++ ')) {
        const p = side(line.slice(4));
        if (p) f.path = p;
        else f.status = 'removed';
      }
    }
    close();
    // el último tramo trae el salto de línea final del texto
    for (const x of files) if (x.patch?.endsWith('\n')) x.patch = x.patch.replace(/\n+$/, '');
    return files;
  }

  /** Un tramo → sus partes, con el número de línea de antes (a) y de después (b):
      [{ head, lines: [{ t: ' ' | '+' | '-' | '\\', a, b, s }] }]. */
  function hunks(patch) {
    const out = [];
    let h = null;
    let a = 0;
    let b = 0;
    const lines = String(patch || '').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      const m = HUNK.exec(line);
      if (m) {
        a = Number(m[1]);
        b = Number(m[2]);
        h = { head: line, lines: [] };
        out.push(h);
        continue;
      }
      if (!h) continue;
      const t = line[0];
      const s = line.slice(1);
      if (t === '+') h.lines.push({ t, a: null, b: b++, s });
      else if (t === '-') h.lines.push({ t, a: a++, b: null, s });
      else if (t === '\\') h.lines.push({ t, a: null, b: null, s: line.slice(2) });
      else h.lines.push({ t: ' ', a: a++, b: b++, s: t === ' ' ? s : line }); // una línea de contexto vacía puede llegar sin su espacio
    }
    return out;
  }

  /** Lo que suma un commit: archivos y líneas. */
  function totals(files) {
    let add = 0;
    let del = 0;
    for (const f of files) {
      add += f.add || 0;
      del += f.del || 0;
    }
    return { files: files.length, add, del };
  }

  /* ---------- el commit anterior y el siguiente ---------- */

  /** Hijos de cada commit cargado que lo tienen como primer padre: sha -> [sha]. */
  function childrenOf(commits) {
    const kids = new Map();
    for (const c of commits.values()) {
      const p = c.parents?.[0];
      if (!p) continue;
      const list = kids.get(p);
      if (list) list.push(c.sha);
      else kids.set(p, [c.sha]);
    }
    return kids;
  }

  /** El anterior es el primer padre (si está cargado). El siguiente, el hijo que sigue la misma línea: el
      que dice `prefer` (de donde se vino), si no el de la misma cadena del grafo (`chainOf`), si no el más nuevo. */
  function steps(data, sha, { kids = null, chainOf = null, prefer = null } = {}) {
    const c = data.commits.get(sha);
    if (!c) return { older: null, newer: null };
    const p = c.parents?.[0];
    const older = p && data.commits.has(p) ? p : null;
    const list = (kids || childrenOf(data.commits)).get(sha) || [];
    let newer = null;
    if (prefer && list.includes(prefer)) newer = prefer;
    else if (list.length) {
      const chain = chainOf?.(sha);
      const same = chain ? list.filter((k) => chainOf(k) === chain) : [];
      const pool = same.length ? same : list;
      newer = pool.reduce((best, k) => ((data.commits.get(k).date || 0) > (data.commits.get(best).date || 0) ? k : best));
    }
    return { older, newer };
  }

  /* ---------- el panel ---------- */

  const RENDER_LINES = 1500; // líneas que se dibujan al abrir un commit; los archivos que siguen, plegados
  const FILE_LINES = 800; // un archivo con más líneas que esto empieza plegado
  const MAX_LINES = 6000; // ni abierto se dibuja más que esto de un archivo
  const CACHE = 80; // commits cuyos cambios se recuerdan (no cambian nunca)
  const SETTLE_MS = 140; // al pasar rápido de un commit a otro, solo se piden los cambios del último

  const STATUS_MARK = { added: 'A', removed: 'D', renamed: 'R', modified: 'M' };
  const STATUS_TEXT = { added: 'diff.status.added', removed: 'diff.status.removed', renamed: 'diff.status.renamed', modified: 'diff.status.modified' };

  /**
   * Monta el panel en `root` (ver index.html). Opciones:
   *   text(key, params), ago(ms), num(n): textos y formatos de la página
   *   load(sha) → Promise de { files, truncated } (o null si la fuente no da cambios)
   *   cheap() → true si pedir los cambios no gasta una cuota escasa (entonces se adelantan los vecinos)
   *   data() → los datos del repo a la vista; chainOf(sha) → la cadena del grafo de ese commit
   *   onFocus(sha): mostrar el commit en el grafo; onClose(): el panel se cerró
   *   avatar(author) → HTML del avatar (de util.js, ya escapado); dateTime(ms) → fecha y hora completas
   *   errText(err) → el motivo de un fallo, en el idioma activo
   * Devuelve { open(sha, { focusGraph }), close(), step(dir), reset(), relocalize(), refresh(), get sha(), get isOpen() }.
   */
  function mount(root, opts) {
    const $ = (sel) => root.querySelector(sel);
    const mk = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const ui = {
      older: $('.df-older'),
      newer: $('.df-newer'),
      close: $('.df-close'),
      scroll: $('.df-scroll'),
      commit: $('.df-commit'),
      sum: $('.df-sum'),
      files: $('.df-files'),
      body: $('.df-body'),
    };
    const cache = new Map(); // sha -> Promise (las que fallan se olvidan)
    let sha = null;
    let trail = []; // los commits de los que se vino al ir hacia atrás: «siguiente» vuelve por el mismo camino
    let kids = null; // los hijos de cada commit cargado; se rehacen cuando llegan datos (ver refresh)
    let kidsOf = null; // de qué commits son: la fuente agrega y quita en el mismo Map
    let timer = 0;
    let seq = 0;
    let shown = null; // el commit cuyos archivos están dibujados

    const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function get(s) {
      let p = cache.get(s);
      if (p) {
        cache.delete(s); // al final: el más reciente
        cache.set(s, p);
        return p;
      }
      p = Promise.resolve()
        .then(() => opts.load(s))
        .catch((err) => {
          cache.delete(s);
          throw err;
        });
      cache.set(s, p);
      while (cache.size > CACHE) cache.delete(cache.keys().next().value);
      return p;
    }

    function neighbors() {
      const d = opts.data();
      if (!kids || kidsOf !== d.commits) {
        kids = childrenOf(d.commits);
        kidsOf = d.commits;
      }
      return steps(d, sha, { kids, chainOf: opts.chainOf, prefer: trail[trail.length - 1] || null });
    }

    function renderNav() {
      const { older, newer } = sha ? neighbors() : {};
      const lost = (b, off) => off && document.activeElement === b;
      // un botón deshabilitado pierde el foco: queda en el título, dentro del panel, y las teclas siguen sirviendo
      const keep = lost(ui.older, !older) || lost(ui.newer, !newer);
      ui.older.disabled = !older;
      ui.newer.disabled = !newer;
      if (keep && !root.hidden) $('h2')?.focus({ preventScroll: true });
      return { older, newer };
    }

    function renderCommit(c) {
      const t = opts.text;
      ui.commit.replaceChildren();
      const head = mk('div', 'df-who');
      head.innerHTML = opts.avatar(c.author);
      head.append(mk('span', 'df-author', c.author?.name || c.author?.login || t('author.unknown')));
      const when = mk('span', 'df-when', c.date ? opts.ago(c.date) : '');
      if (c.date) when.title = opts.dateTime(c.date);
      head.append(when);
      const lines = String(c.message || '').split('\n');
      const title = mk('p', 'df-msg', lines[0] || '');
      const rest = lines.slice(1).join('\n').trim();
      const meta = mk('p', 'df-meta');
      meta.append(mk('code', null, c.sha.slice(0, 7)));
      const chain = opts.chainOf?.(c.sha);
      if (chain?.startsWith('b:')) meta.append(' · ', mk('span', 'df-branch', t('diff.onBranch', { name: chain.slice(2) })));
      if ((c.parents || []).length > 1) meta.append(' · ', mk('span', null, t('diff.merge')));
      if (c.url) {
        const a = mk('a', 'df-link', `${t('tip.openCommit')} ↗`);
        a.href = c.url;
        a.target = '_blank';
        a.rel = 'noopener';
        meta.append(' · ', a);
      }
      ui.commit.append(head, title);
      if (rest) ui.commit.append(mk('p', 'df-body-msg', rest));
      ui.commit.append(meta);
    }

    /** El código de un archivo: una fila por línea, con los números de antes y de después. */
    function codeOf(f, limit = MAX_LINES) {
      const box = mk('div', 'df-code');
      box.tabIndex = 0; // se recorre a lo ancho con las flechas
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', f.path);
      const inner = mk('div', 'df-lines');
      let n = 0;
      for (const h of hunks(f.patch)) {
        const hd = mk('div', 'dl dl-hunk');
        hd.append(mk('span', 'ln', '…'), mk('span', 'ln', '…'), mk('span', 'sg', ''), mk('span', 'lc', h.head));
        inner.append(hd);
        for (const l of h.lines) {
          if (++n > limit) break;
          const row = mk('div', 'dl' + (l.t === '+' ? ' dl-add' : l.t === '-' ? ' dl-del' : l.t === '\\' ? ' dl-note' : ''));
          row.append(mk('span', 'ln', l.a ?? ''), mk('span', 'ln', l.b ?? ''), mk('span', 'sg', l.t === '\\' ? '' : l.t), mk('span', 'lc', l.s));
          inner.append(row);
        }
        if (n > limit) break;
      }
      box.append(inner);
      if (n > limit) box.append(mk('p', 'df-note', opts.text('diff.tooLong', { n: opts.num(limit) })));
      return box;
    }

    function fileSection(f, i, open) {
      const t = opts.text;
      const sec = mk('details', 'df-file');
      sec.id = `df-f${i}`;
      const sum = mk('summary', 'df-fhead');
      const st = mk('span', `df-st st-${f.status}`, STATUS_MARK[f.status] || 'M');
      st.title = t(STATUS_TEXT[f.status] || STATUS_TEXT.modified);
      st.setAttribute('aria-label', t(STATUS_TEXT[f.status] || STATUS_TEXT.modified));
      const path = mk('span', 'df-path');
      if (f.from && f.from !== f.path) path.append(mk('span', 'df-from', f.from), ' → ');
      path.append(f.path);
      const nums = mk('span', 'df-nums');
      if (f.binary) nums.append(mk('span', null, t('diff.binary')));
      else nums.append(mk('span', 'df-add', `+${opts.num(f.add)}`), ' ', mk('span', 'df-del', `−${opts.num(f.del)}`));
      sum.append(st, path, nums);
      sec.append(sum);
      const fill = () => {
        if (sec.dataset.filled) return;
        sec.dataset.filled = '1';
        if (f.patch) sec.append(codeOf(f));
        else sec.append(mk('p', 'df-note', t('diff.noPatch')));
        if (f.url) {
          const a = mk('a', 'df-link', `${t('diff.openFile')} ↗`);
          a.href = f.url;
          a.target = '_blank';
          a.rel = 'noopener';
          const p = mk('p', 'df-note');
          p.append(a);
          sec.append(p);
        }
      };
      if (open) {
        sec.open = true;
        fill();
      }
      sec.addEventListener('toggle', () => sec.open && fill());
      return sec;
    }

    function renderFiles(c, r) {
      const t = opts.text;
      shown = c.sha;
      root.classList.remove('loading');
      ui.files.replaceChildren();
      ui.body.replaceChildren();
      const sum = totals(r.files);
      ui.sum.textContent = r.files.length
        ? t('diff.summary', { n: sum.files, add: opts.num(sum.add), del: opts.num(sum.del) })
        : t('diff.empty');
      if (r.truncated) ui.sum.textContent += ' · ' + t('diff.truncated');
      let budget = RENDER_LINES;
      const frag = document.createDocumentFragment();
      r.files.forEach((f, i) => {
        const li = mk('li');
        const b = mk('button', 'df-jump');
        b.type = 'button';
        b.dataset.i = i;
        const st = mk('span', `df-st st-${f.status}`, STATUS_MARK[f.status] || 'M');
        st.setAttribute('aria-hidden', 'true');
        const name = f.path.split('/').pop();
        const dir = f.path.slice(0, f.path.length - name.length);
        const p = mk('span', 'df-jpath');
        if (dir) p.append(mk('span', 'df-dir', dir));
        p.append(name);
        const bar = mk('span', 'df-spark');
        bar.setAttribute('aria-hidden', 'true');
        const tot = (f.add || 0) + (f.del || 0);
        if (tot) {
          const g = mk('span', 'df-spark-add');
          g.style.flexGrow = f.add;
          const rd = mk('span', 'df-spark-del');
          rd.style.flexGrow = f.del;
          bar.append(g, rd);
        }
        b.setAttribute('aria-label', [f.path, t(STATUS_TEXT[f.status] || STATUS_TEXT.modified), f.binary ? t('diff.binary') : t('diff.lines', { add: opts.num(f.add), del: opts.num(f.del) })].join(', '));
        b.append(st, p, bar);
        li.append(b);
        ui.files.append(li);
        const lines = f.add + f.del;
        const open = !!f.patch && lines <= FILE_LINES && lines <= budget;
        if (open) budget -= lines;
        else budget = 0; // lo que sigue, plegado: el orden de lectura no salta
        frag.append(fileSection(f, i, open));
      });
      ui.body.append(frag);
    }

    function renderError(err) {
      root.classList.remove('loading');
      shown = null;
      ui.files.replaceChildren();
      ui.body.replaceChildren();
      const why = err ? opts.errText?.(err) : '';
      ui.sum.textContent = opts.text('diff.fail') + (why ? ' ' + why : '');
    }

    /** Muestra un commit: su ficha al instante, sus archivos en cuanto llegan (desde la caché, sin espera). */
    function show(s, { focusGraph = true } = {}) {
      const d = opts.data();
      const c = d.commits.get(s);
      if (!c) return false;
      sha = s;
      root.hidden = false;
      renderCommit(c);
      const { older, newer } = renderNav();
      if (focusGraph) opts.onFocus?.(s);
      const my = ++seq;
      clearTimeout(timer);
      // lo anterior queda a la vista, atenuado, hasta que llega lo nuevo: no hay saltos en blanco
      root.classList.add('loading');
      if (!shown) ui.sum.textContent = opts.text('diff.loading');
      const go = () =>
        get(s).then(
          (r) => {
            if (my !== seq) return;
            if (!r) return renderError();
            renderFiles(c, r);
            ui.scroll.scrollTo({ top: 0, behavior: 'instant' });
            // los vecinos, por si se sigue: los cambios ya estarán cuando se pase a ellos
            if (opts.cheap?.()) for (const n of [older, newer]) if (n && !cache.has(n)) get(n).catch(() => {});
          },
          (err) => my === seq && renderError(err),
        );
      // desde la caché va enseguida; si hay que pedirlo, se espera a que se deje de pasar de commit
      if (cache.has(s)) go();
      else timer = setTimeout(go, SETTLE_MS);
      return true;
    }

    function open(s, { focusGraph = true } = {}) {
      trail = [];
      shown = null;
      return show(s, { focusGraph });
    }

    function step(dir) {
      if (!sha || root.hidden) return false;
      const { older, newer } = neighbors();
      if (dir < 0 && older) {
        trail.push(sha);
        return show(older);
      }
      if (dir > 0 && newer) {
        if (trail[trail.length - 1] === newer) trail.pop();
        else trail = [];
        return show(newer);
      }
      return false;
    }

    function close() {
      if (root.hidden) return;
      clearTimeout(timer);
      seq++;
      root.hidden = true;
      sha = null;
      shown = null;
      trail = [];
      opts.onClose?.();
    }

    /** Otro repo a la vista: lo que había ya no corresponde. */
    function reset() {
      close();
      cache.clear();
      kids = null;
    }

    ui.older.addEventListener('click', () => step(-1));
    ui.newer.addEventListener('click', () => step(1));
    ui.close.addEventListener('click', close);
    ui.files.addEventListener('click', (ev) => {
      const b = ev.target.closest?.('.df-jump');
      if (!b) return;
      const sec = ui.body.querySelector(`#df-f${b.dataset.i}`);
      if (!sec) return;
      sec.open = true;
      sec.scrollIntoView({ block: 'start', behavior: reduce() ? 'instant' : 'smooth' });
      sec.querySelector('summary')?.focus({ preventScroll: true });
    });
    // ← → (fuera del código, que se recorre a lo ancho) y J K pasan de commit; Esc cierra
    root.addEventListener('keydown', (ev) => {
      if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key;
      const inCode = !!ev.target.closest?.('.df-code, input, select, textarea');
      let dir = 0;
      // como el tiempo del grafo, que se lee de izquierda a derecha en todos los idiomas: ← es el anterior
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !inCode) dir = k === 'ArrowLeft' ? -1 : 1;
      else if (k === 'j' || k === 'J') dir = -1;
      else if (k === 'k' || k === 'K') dir = 1;
      else if (k === 'Escape') {
        ev.preventDefault();
        close();
        return;
      }
      if (!dir) return;
      ev.preventDefault();
      step(dir);
    });

    return {
      open,
      close,
      step,
      reset,
      /** Cambió el idioma: se vuelve a escribir lo que se ve. */
      relocalize() {
        if (!sha) return;
        const s = sha;
        shown = null;
        show(s, { focusGraph: false });
      },
      /** Llegaron datos nuevos: puede haber un commit siguiente que antes no estaba. */
      refresh() {
        kids = null;
        if (sha && !root.hidden) renderNav();
      },
      get sha() {
        return sha;
      },
      get isOpen() {
        return !root.hidden;
      },
    };
  }

  GB.diff = { parseGit, hunks, count, totals, childrenOf, steps, mount, unquote };
})((window.GB = window.GB || {}));
