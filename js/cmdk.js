/* GraphBranch — paleta de comandos (Ctrl+K / ⌘K): una lista con buscador de las acciones de la app (paneles, filtros,
   2D/3D, modos). Cada acción acciona el botón que ya existe en la página, así que hace exactamente lo mismo y no
   duplica lógica. No hace consultas. Los nombres salen de las claves de traducción que ya usan esos botones. */
(function (GB) {
  'use strict';

  /** Las acciones, en el orden en que se listan sin escribir nada: { id, btn (selector del botón), key (clave de i18n) }. */
  const ACTIONS = [
    { id: 'search', btn: '#search-btn', key: 'search.title' },
    { id: 'textview', btn: '#textview-btn', key: 'textview.title' },
    { id: 'constellation', btn: '#constellation-btn', key: 'constellation.title' },
    { id: 'health', btn: '#health-btn', key: 'health.title' },
    { id: 'agents', btn: '#agents-btn', key: 'agents.title' },
    { id: 'bitacora', btn: '#st-bitacora', key: 'bitacora.open' },
    { id: 'trophies', btn: '#trophy-btn', key: 'game.trophies' },
    { id: 'view3d', btn: '#view-3d', key: 'cmdk.view3d' },
    { id: 'view2d', btn: '#view-2d', key: 'cmdk.view2d' },
    { id: 'replay', btn: '#replay-btn', key: 'replay.label' },
    { id: 'tv', btn: '#tv-btn', key: 'tv.label' },
    { id: 'fly', btn: '#fly-btn', key: 'fly.label' },
    { id: 'galaxy', btn: '#galaxy-btn', key: 'galaxy.label' },
    { id: 'director', btn: '#director-btn', key: 'director.label' },
    { id: 'spin', btn: '#spin-btn', key: 'spin.label' },
    { id: 'zoomIn', btn: '#zoom-in', key: 'zoom.in.label' },
    { id: 'zoomOut', btn: '#zoom-out', key: 'zoom.out.label' },
    { id: 'fullscreen', btn: '#fullscreen-btn', key: 'fullscreen.label' },
    { id: 'snap', btn: '#snap-btn', key: 'snap.label' },
    { id: 'pause', btn: '#pause-btn', key: 'ctl.pause' },
    { id: 'refresh', btn: '#refresh-btn', key: 'ctl.refresh' },
    { id: 'sound', btn: '#sound-btn', key: 'ctl.sound' },
    { id: 'loop', btn: '#loop-btn', key: 'loopPrompt.title' },
    { id: 'practice', btn: '#practice-btn', key: 'practice.btn' },
    { id: 'demo', btn: '#demo-btn', key: 'repo.demo' },
    { id: 'all', btn: '#all-tab', key: 'all.tab' },
    { id: 'settings', btn: '#settings-btn', key: 'ctl.settings' },
  ];

  /** Minúsculas y sin acentos, para que «camara» encuentre «Cámara». */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Filtra y ordena `items` ({ label, … }) por `query`: cada palabra escrita tiene que estar en la etiqueta; primero las
      que empiezan por la consulta, luego las que tienen una palabra que empieza así, luego el resto, cada grupo en su
      orden. Sin consulta, todas. No muta. */
  function filter(items, query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice();
    const q = words.join(' ');
    const scored = [];
    items.forEach((it, i) => {
      const l = norm(it.label);
      if (!words.every((w) => l.includes(w))) return;
      const rank = l.startsWith(q) ? 0 : l.split(/[\s-]+/).some((p) => p.startsWith(words[0])) ? 1 : 2;
      scored.push({ it, rank, i });
    });
    return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).map((s) => s.it);
  }

  /** ¿Es Ctrl+K (⌘K en Mac) sin más modificadores? */
  const isShortcut = (ev) => (ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && (ev.key || '').toLowerCase() === 'k';

  /** Monta la paleta. els: { dialog, input, list, status }. ctx: { text(key), available(action) → bool, run(action) }.
      Devuelve { open, close, visible } (visible: las acciones que la consulta deja). */
  function mount(els, ctx) {
    let shown = [];
    let active = 0;
    const items = () => ACTIONS.filter((a) => ctx.available(a)).map((a) => ({ ...a, label: ctx.text(a.key) }));
    const optId = (i) => `cmdk-opt-${i}`;

    function setActive(i) {
      active = shown.length ? (i + shown.length) % shown.length : 0;
      [...els.list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === active)));
      const cur = els.list.children[active];
      if (cur) {
        els.input.setAttribute('aria-activedescendant', cur.id);
        cur.scrollIntoView?.({ block: 'nearest' });
      } else els.input.removeAttribute('aria-activedescendant');
    }

    function render() {
      shown = filter(items(), els.input.value);
      els.list.textContent = '';
      shown.forEach((a, i) => {
        const li = document.createElement('li');
        li.id = optId(i);
        li.setAttribute('role', 'option');
        li.className = 'ck-opt';
        li.textContent = a.label;
        li.addEventListener('click', () => choose(i));
        els.list.append(li);
      });
      els.status.textContent = shown.length ? '' : ctx.text('cmdk.empty');
      setActive(0);
    }

    function close() {
      if (typeof els.dialog.close === 'function') els.dialog.close();
      else els.dialog.removeAttribute('open');
    }

    function choose(i) {
      const a = shown[i];
      if (!a) return;
      close();
      ctx.run(a);
    }

    function open() {
      els.input.value = '';
      render();
      if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
      else els.dialog.setAttribute('open', '');
      els.input.focus();
    }

    els.input.addEventListener('input', render);
    els.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') (ev.preventDefault(), setActive(active + 1));
      else if (ev.key === 'ArrowUp') (ev.preventDefault(), setActive(active - 1));
      else if (ev.key === 'Home') (ev.preventDefault(), setActive(0));
      else if (ev.key === 'End') (ev.preventDefault(), setActive(shown.length - 1));
      else if (ev.key === 'Enter') (ev.preventDefault(), choose(active));
    });
    return { open, close, visible: () => shown.map((a) => a.id) };
  }

  GB.cmdk = { ACTIONS, filter, isShortcut, mount };
})(window.GB);
