/* GraphBranch — editar el código: abrir un archivo de una rama, cambiarlo y guardarlo como un commit en esa
   rama, por la API del servicio del repo (con su token, que para esto tiene que poder escribir). Nunca escribe
   sola: el commit sale solo del botón «Hacer commit». La fuente da

     readFile({ path, ref })  → { text, sha, missing, binary, tooLarge }
     writeFile({ path, branch, text, message, sha }) → { sha, url }   (el commit nuevo, si el servicio lo dice)

   y este módulo arma el diálogo, cuenta lo que cambió y dice por qué no se pudo. El contenido del archivo vive
   en un <textarea> (nunca como HTML) y no se guarda en ningún lado. */
(function (GB) {
  'use strict';

  /* ---------- lo que cambió ---------- */

  const DIFF_CELLS = 4e6; // tabla más grande que esto: el medio cuenta como reemplazado entero

  /** Las líneas de `a` y `b` (el archivo de antes y el de ahora) como operaciones: [{ t: ' ' | '-' | '+', s }].
      Lo igual del principio y del final no entra en la tabla; el medio, por la subsecuencia común más larga. */
  function lineDiff(a, b) {
    const A = String(a ?? '').split('\n');
    const B = String(b ?? '').split('\n');
    let p = 0;
    while (p < A.length && p < B.length && A[p] === B[p]) p++;
    let s = 0;
    while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
    const n = A.length - p - s;
    const m = B.length - p - s;
    const out = A.slice(0, p).map((x) => ({ t: ' ', s: x }));
    if (n * m && n * m <= DIFF_CELLS) {
      const w = m + 1;
      const L = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = A[p + i] === B[p + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (A[p + i] === B[p + j]) {
          out.push({ t: ' ', s: A[p + i] });
          i++;
          j++;
        } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) out.push({ t: '-', s: A[p + i++] });
        else out.push({ t: '+', s: B[p + j++] });
      }
      while (i < n) out.push({ t: '-', s: A[p + i++] });
      while (j < m) out.push({ t: '+', s: B[p + j++] });
    } else {
      for (let i = 0; i < n; i++) out.push({ t: '-', s: A[p + i] });
      for (let j = 0; j < m; j++) out.push({ t: '+', s: B[p + j] });
    }
    for (let k = A.length - s; k < A.length; k++) out.push({ t: ' ', s: A[k] });
    return out;
  }

  /** Líneas agregadas y quitadas entre dos textos. */
  function changes(a, b) {
    let add = 0;
    let del = 0;
    for (const o of lineDiff(a, b)) {
      if (o.t === '+') add++;
      else if (o.t === '-') del++;
    }
    return { add, del };
  }

  /** El diff unificado de `a` a `b` (los tramos desde «@@», con `ctx` líneas de contexto), como lo da commitDiff. */
  function patch(a, b, ctx = 3) {
    const ops = lineDiff(a, b);
    const lines = [];
    let la = 1;
    let lb = 1;
    const at = ops.map((o) => {
      const pos = { a: la, b: lb };
      if (o.t !== '+') la++;
      if (o.t !== '-') lb++;
      return pos;
    });
    const changed = ops.map((o, i) => (o.t !== ' ' ? i : -1)).filter((i) => i >= 0);
    let k = 0;
    while (k < changed.length) {
      let start = Math.max(0, changed[k] - ctx);
      let end = Math.min(ops.length - 1, changed[k] + ctx);
      while (k + 1 < changed.length && changed[k + 1] - ctx <= end + 1) end = Math.min(ops.length - 1, changed[++k] + ctx);
      k++;
      const slice = ops.slice(start, end + 1);
      const na = slice.filter((o) => o.t !== '+').length;
      const nb = slice.filter((o) => o.t !== '-').length;
      const sa = na ? at[start].a : at[start].a - 1;
      const sb = nb ? at[start].b : at[start].b - 1;
      lines.push(`@@ -${sa},${na} +${sb},${nb} @@`);
      for (const o of slice) lines.push(o.t + o.s);
    }
    return lines.join('\n');
  }

  /** El mensaje de commit que se propone: «Actualiza ruta» (o «Crea ruta» si el archivo no existía). */
  const defaultMessage = (text, path, missing) => text(missing ? 'editor.msgCreate' : 'editor.msgUpdate', { path });

  /* ---------- el diálogo ---------- */

  /**
   * Monta el editor en `dialog` (ver index.html). Opciones:
   *   text(key, params), num(n): textos de la página; errText(err): el motivo de un fallo, en el idioma activo
   *   repo() → { name, branches: [nombres], defaultBranch } del repo a editar (null si ninguno)
   *   read({ path, ref }), write({ path, branch, text, message, sha }): las de la fuente de ese repo
   *   canWrite() → null si se puede escribir, o el texto de por qué no (sin token, servicio sin escritura)
   *   onSaved({ branch, path, sha }): el commit ya está en el servicio
   *   onSettings(): abrir Ajustes (para poner un token que escriba)
   * Devuelve { open({ path, branch }), close(), get isOpen() }.
   */
  function mount(dialog, opts) {
    const $ = (sel) => dialog.querySelector(sel);
    const ui = {
      form: $('form'),
      repo: $('.ed-repo'),
      branch: $('.ed-branch'),
      path: $('.ed-path-input'),
      load: $('.ed-load'),
      note: $('.ed-note'),
      settings: $('.ed-settings'),
      area: $('.ed-text'),
      message: $('.ed-message'),
      sum: $('.ed-sum'),
      save: $('.ed-save'),
      cancel: $('.ed-cancel'),
      close: $('.ed-close'),
    };
    let base = null; // lo que se abrió: { path, branch, text, sha, missing } (null si no hay nada abierto)
    let seq = 0;
    let busy = false;
    let opener = null;
    let msgTouched = false;

    const t = (k, p) => opts.text(k, p);
    /** Por qué falló: el motivo que se sabe decir (sin permiso, el archivo cambió…) o el genérico con el del servicio. */
    const failText = (err, generic) => {
      const k = err?.editKind;
      if (k) return t(k === 'noToken' || k === 'noWrite' ? 'editor.' + k : 'editor.err.' + k);
      return `${t(generic)} ${opts.errText(err) || ''}`.trim();
    };
    const setNote = (s, kind = '') => {
      ui.note.textContent = s || '';
      ui.note.dataset.kind = kind;
    };

    /** Lo que cambió respecto de lo abierto, y si se puede hacer commit. */
    function renderSum() {
      const dirty = !!base && ui.area.value !== base.text;
      const why = opts.canWrite?.();
      if (!base) ui.sum.textContent = '';
      else if (!dirty) ui.sum.textContent = base.missing ? t('editor.new') : t('editor.clean');
      else {
        const c = changes(base.text, ui.area.value);
        ui.sum.textContent = t('editor.changes', { add: opts.num(c.add), del: opts.num(c.del) });
      }
      ui.save.disabled = busy || !base || (!dirty && !base.missing) || !!why || !ui.message.value.trim();
      ui.area.readOnly = busy || !base;
      ui.settings.hidden = !why;
      if (why && base && !busy && !ui.note.dataset.kind) setNote(why, 'warn');
    }

    function fillBranches(want) {
      const r = opts.repo();
      const names = r?.branches || [];
      ui.branch.replaceChildren(
        ...names.map((n) => {
          const o = document.createElement('option');
          o.value = n;
          o.textContent = n;
          return o;
        }),
      );
      ui.branch.value = names.includes(want) ? want : names.includes(r?.defaultBranch) ? r.defaultBranch : names[0] || '';
    }

    /** Abre el archivo de la rama elegida (sus bytes de ahora en el servicio, no los de un commit viejo).
        `keepNote`: vuelve a leerlo tras un commit sin pisar el aviso de «guardado». */
    async function load({ keepNote = false } = {}) {
      const path = ui.path.value.trim().replace(/^\/+/, '');
      const branch = ui.branch.value;
      if (!path || !branch) return;
      if (!GB.U.safePath(path)) {
        base = null;
        setNote(t('editor.err.path'), 'error');
        return renderSum();
      }
      const my = ++seq;
      busy = true;
      base = null;
      if (!keepNote) {
        ui.area.value = '';
        setNote(t('editor.loading'), 'busy');
      }
      renderSum();
      try {
        const f = await opts.read({ path, ref: branch });
        if (my !== seq) return;
        busy = false;
        if (f.binary || f.tooLarge) {
          setNote(t(f.binary ? 'editor.binary' : 'editor.tooLarge'), 'warn');
          return renderSum();
        }
        base = { path, branch, text: f.missing ? '' : f.text, sha: f.missing ? null : f.sha, missing: !!f.missing };
        ui.area.value = base.text;
        if (!msgTouched) ui.message.value = defaultMessage(t, path, base.missing);
        if (!keepNote) setNote(base.missing ? t('editor.missing', { branch }) : '', base.missing ? 'info' : '');
      } catch (err) {
        if (my !== seq) return;
        busy = false;
        setNote(failText(err, 'editor.loadFail'), 'error');
      }
      renderSum();
      if (base && !keepNote) ui.area.focus({ preventScroll: true });
    }

    async function save() {
      if (!base || busy || opts.canWrite?.()) return;
      const text = ui.area.value;
      const message = ui.message.value.trim();
      if (!message || (text === base.text && !base.missing)) return;
      const my = ++seq;
      busy = true;
      setNote(t('editor.saving'), 'busy');
      renderSum();
      try {
        const r = await opts.write({ path: base.path, branch: base.branch, text, message, sha: base.sha });
        if (my !== seq) return;
        busy = false;
        const sha = r?.sha || null;
        // lo guardado pasa a ser la base: se puede seguir editando y hacer otro commit encima
        const stale = !r?.blob;
        base = { ...base, text, sha: r?.blob || null, missing: false };
        msgTouched = false;
        ui.message.value = defaultMessage(t, base.path, false);
        setNote(sha ? t('editor.saved', { branch: base.branch, sha: sha.slice(0, 7) }) : t('editor.savedNoSha', { branch: base.branch }), 'ok');
        opts.onSaved?.({ branch: base.branch, path: base.path, sha });
        // sin la huella nueva del archivo (GitLab no la da), se vuelve a leer para poder seguir
        if (stale) return load({ keepNote: true });
      } catch (err) {
        if (my !== seq) return;
        busy = false;
        setNote(failText(err, 'editor.saveFail'), 'error');
      }
      renderSum();
    }

    function open({ path = '', branch = '' } = {}) {
      const r = opts.repo();
      if (!r) return false;
      opener = document.activeElement;
      seq++;
      busy = false;
      base = null;
      msgTouched = false;
      ui.repo.textContent = r.name;
      fillBranches(branch);
      ui.path.value = path;
      ui.area.value = '';
      ui.message.value = path ? defaultMessage(t, path, false) : '';
      setNote('');
      renderSum();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      if (path) load();
      else ui.path.focus();
      return true;
    }

    /** Cerrar con cambios sin guardar pregunta antes de tirarlos. */
    const dirty = () => !!base && ui.area.value !== base.text;
    function tryClose() {
      if (!dirty() || window.confirm(t('editor.discard'))) close();
    }

    function close() {
      seq++;
      busy = false;
      base = null;
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    ui.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      save();
    });
    ui.load.addEventListener('click', load);
    ui.path.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault(); // Intro en la ruta abre el archivo, no hace un commit
      load();
    });
    ui.branch.addEventListener('change', () => ui.path.value.trim() && load());
    ui.area.addEventListener('input', renderSum);
    ui.message.addEventListener('input', () => {
      msgTouched = true;
      renderSum();
    });
    ui.cancel.addEventListener('click', tryClose);
    ui.close.addEventListener('click', tryClose);
    ui.settings.addEventListener('click', () => {
      close();
      opts.onSettings?.();
    });
    // Esc o «Cancelar» con cambios sin guardar: se pregunta antes de tirarlos
    dialog.addEventListener('cancel', (ev) => {
      if (dirty() && !window.confirm(t('editor.discard'))) ev.preventDefault();
    });
    dialog.addEventListener('close', () => {
      base = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    });

    return {
      open,
      close,
      /** Cambió el idioma: el resumen y el aviso se vuelven a escribir. */
      relocalize() {
        if (dialog.open) renderSum();
      },
      get isOpen() {
        return !!dialog.open;
      },
    };
  }

  GB.editor = { lineDiff, changes, patch, mount };
})((window.GB = window.GB || {}));
