/* GraphBranch — conecta fuente de datos, layout, grafo y feed. */
(function (GB) {
  'use strict';
  const { U } = GB;
  const $ = U.$;

  const el = {
    repoForm: $('#repo-form'),
    repoInput: $('#repo-input'),
    demoBtn: $('#demo-btn'),
    status: $('#status'),
    statusText: $('#status-text'),
    statusSub: $('#status-sub'),
    rate: $('#rate'),
    rateText: $('#rate-text'),
    rateBar: $('#rate-bar'),
    pauseBtn: $('#pause-btn'),
    refreshBtn: $('#refresh-btn'),
    soundBtn: $('#sound-btn'),
    notifyBtn: $('#notify-btn'),
    settingsBtn: $('#settings-btn'),
    repoLink: $('#repo-link'),
    repoBadge: $('#repo-badge'),
    repoDesc: $('#repo-desc'),
    graph: $('#graph'),
    graph3d: $('#graph3d'),
    view3d: $('#view-3d'),
    view2d: $('#view-2d'),
    spinBtn: $('#spin-btn'),
    hint: $('#hint'),
    overlay: $('#overlay'),
    zoomIn: $('#zoom-in'),
    zoomOut: $('#zoom-out'),
    followBtn: $('#follow-btn'),
    tokenBanner: $('#token-banner'),
    tokenBannerText: $('#token-banner-text'),
    branchFilter: $('#branch-filter'),
    st: {
      branches: $('#st-branches'),
      branchesSub: $('#st-branches-sub'),
      commits: $('#st-commits'),
      commitsSub: $('#st-commits-sub'),
      prs: $('#st-prs'),
      prsSub: $('#st-prs-sub'),
      last: $('#st-last'),
      lastSub: $('#st-last-sub'),
    },
    dialog: $('#settings'),
    settingsForm: $('#settings-form'),
    tokenInput: $('#token-input'),
    tokenToggle: $('#token-toggle'),
    tokenClear: $('#token-clear'),
    maxBranches: $('#max-branches'),
    depth: $('#depth'),
    settingsCancel: $('#settings-cancel'),
  };

  const settings = {
    token: U.store.get('token', ''),
    maxBranches: U.store.get('maxBranches', 15),
    depth: U.store.get('depth', 40),
  };

  let source = null;
  let layout = new GB.Layout();
  let status = null;
  let paused = false;

  /* dos vistas del mismo layout: 3D (Three.js) y 2D (SVG) */
  function followUI(v) {
    el.followBtn.setAttribute('aria-pressed', v);
    el.followBtn.querySelector('.follow-label').textContent = v ? 'En vivo' : 'Ir a lo último';
    el.followBtn.title = v ? 'La vista sigue los commits nuevos. Arrastra para recorrer la historia.' : 'Volver a los commits más recientes y seguirlos';
  }
  const graph2d = new GB.Graph(el.graph, {
    onFollowChange: (v) => graph === graph2d && followUI(v),
    onTogglePin: (name) => togglePin(name),
  });
  let graph3d = null;
  try {
    if (GB.Graph3D?.supported()) {
      graph3d = new GB.Graph3D(el.graph3d, {
        onFollowChange: (v) => graph === graph3d && followUI(v),
        onTogglePin: (name) => togglePin(name),
      });
    }
  } catch (err) {
    console.warn('La vista 3D no está disponible:', err);
  }
  let graph = graph2d;

  const HINTS = {
    '3d': 'Arrastra para girar · clic derecho o <kbd>Mayús</kbd> + arrastrar para desplazar · rueda o pellizco para acercar · clic en un commit para ver el detalle',
    '2d': 'Arrastra para moverte · rueda para recorrer la historia · <kbd>Ctrl</kbd> + rueda o pellizco para zoom · clic en un commit para ver el detalle',
  };

  function setView(v) {
    if (v === '3d' && !graph3d) v = '2d';
    graph = v === '3d' ? graph3d : graph2d;
    el.graph3d.hidden = v !== '3d';
    el.graph.hidden = v !== '2d';
    graph3d?.setActive(v === '3d');
    setPressed(el.view3d, v === '3d');
    setPressed(el.view2d, v === '2d');
    el.spinBtn.hidden = v !== '3d';
    el.hint.innerHTML = HINTS[v];
    followUI(graph.following);
    U.store.set('view', v);
  }

  /* ramas fijadas y filtro: se recuerdan por repositorio */
  const repoKey = () => (source ? `${source.owner || 'demo'}/${source.name || ''}`.toLowerCase() : '');
  const getPins = () => new Set(U.store.get('pins:' + repoKey(), []));

  function togglePin(name) {
    const pins = getPins();
    const on = !pins.has(name);
    if (on) pins.add(name);
    else pins.delete(name);
    U.store.set('pins:' + repoKey(), [...pins]);
    source?.setPins([...pins]);
    return on;
  }

  const feed = new GB.Feed({
    list: $('#feed'),
    empty: $('#feed-empty'),
    chips: $('#chips'),
    toasts: $('#toasts'),
    count: $('#feed-count'),
    onSelect: (a) => {
      if (a.sha && graph.focusSha(a.sha)) return;
      if (a.branch) graph.focusBranch(a.branch);
    },
  });

  /* ---------- fuente de datos ---------- */

  function connect(src) {
    if (source) source.stop();
    source = src;
    layout = new GB.Layout();
    graph2d.clear();
    graph3d?.clear();
    followUI(true);
    feed.clear();
    paused = false;
    setPressed(el.pauseBtn, false);
    renderRepo(src.data.repo);
    showOverlay('loading', src.data.repo.demo ? 'Preparando la simulación…' : `Cargando ${src.data.repo.owner}/${src.data.repo.name}…`);
    src.on('update', (u) => src === source && onUpdate(u));
    src.on('status', (s) => src === source && onStatus(s));
    src.start();
  }

  function connectRepo(input, { save = true } = {}) {
    const parsed = U.parseRepo(input);
    if (!parsed) {
      el.repoInput.setCustomValidity('Escribe el repositorio como owner/nombre o pega su URL de GitHub.');
      el.repoInput.reportValidity();
      return;
    }
    el.repoInput.setCustomValidity('');
    el.repoInput.value = `${parsed.owner}/${parsed.name}`;
    if (save) U.store.set('repo', `${parsed.owner}/${parsed.name}`);
    setUrlRepo(`${parsed.owner}/${parsed.name}`);
    const key = `${parsed.owner}/${parsed.name}`.toLowerCase();
    const filter = U.store.get('filter:' + key, '');
    el.branchFilter.value = filter;
    connect(
      new GB.GitHubSource({
        ...parsed,
        token: settings.token,
        maxBranches: settings.maxBranches,
        depth: settings.depth,
        filter,
        pins: U.store.get('pins:' + key, []),
      }),
    );
  }

  function startDemo() {
    U.store.set('repo', null);
    setUrlRepo(null);
    el.repoInput.value = '';
    el.branchFilter.value = '';
    connect(new GB.DemoSource());
  }

  function setUrlRepo(repo) {
    try {
      const url = new URL(location.href);
      if (repo) url.searchParams.set('repo', repo);
      else url.searchParams.delete('repo');
      history.replaceState(null, '', url);
    } catch {
      /* algunos visores no permiten cambiar la URL */
    }
  }

  function onUpdate({ activities, initial }) {
    const data = source.view ? source.view() : source.data;
    const L = layout.compute(data);
    const gctx = {
      initial,
      prs: prsByBranch(data),
      pins: data.repo.demo ? new Set() : getPins(),
      canPin: !data.repo.demo,
    };
    graph2d.update(L, gctx);
    graph3d?.update(L, gctx);
    feed.add(activities, { live: !initial });
    renderRepo(data.repo);
    renderStats(data, L);
    if (!L.nodes.length) showOverlay('empty');
    else hideOverlay();
  }

  function prsByBranch(data) {
    const map = new Map();
    for (const p of data.pulls.values()) if (p.sameRepo && !map.has(p.head)) map.set(p.head, p);
    return map;
  }

  /* ---------- encabezado y resumen ---------- */

  function renderRepo(repo) {
    const full = `${repo.owner}/${repo.name}`;
    el.repoLink.textContent = full;
    if (repo.url) {
      el.repoLink.href = repo.url;
      el.repoLink.removeAttribute('aria-disabled');
    } else {
      el.repoLink.removeAttribute('href');
      el.repoLink.setAttribute('aria-disabled', 'true');
    }
    el.repoBadge.hidden = !repo.demo && !repo.private;
    el.repoBadge.textContent = repo.demo ? 'simulación' : 'privado';
    el.repoBadge.className = `badge${repo.demo ? ' demo' : ''}`;
    el.repoDesc.textContent = repo.demo
      ? 'Datos ficticios que cambian solos cada pocos segundos. Escribe owner/repo arriba para ver uno real.'
      : repo.description || '';
    el.repoDesc.hidden = !el.repoDesc.textContent;
    feed.setBaseTitle(`${full} · GraphBranch`);
    renderTokenBanner();
  }

  function renderTokenBanner() {
    const data = source?.data;
    const show = data && !data.repo.demo && !settings.token && data.mode;
    el.tokenBanner.hidden = !show;
    if (!show) return;
    el.tokenBannerText.textContent =
      data.mode === 'events'
        ? `Este repositorio tiene ${U.fmtNum(data.totalBranches)} ramas. Sin token, GraphBranch solo ve las que aparecen en el feed de eventos de GitHub, que llega con minutos de retraso. Con un token verás las ramas más activas casi en tiempo real.`
        : 'Sin token, GitHub permite 60 consultas por hora: la vista se actualiza cada pocos minutos.';
  }

  function renderStats(data, L) {
    const visible = data.branches.size;
    const total = data.totalBranches || visible;
    el.st.branches.textContent = U.fmtNum(visible);
    let sub;
    if (data.matchingBranches != null) {
      sub = `${U.fmtNum(data.matchingBranches)} coinciden con “${U.truncate(source.filter || '', 18)}” de ${U.fmtNum(total)}`;
    } else if (total <= visible) {
      sub = visible === 1 ? 'la única del repo' : 'todas las del repo';
    } else if (data.mode === 'events') {
      sub = `con actividad reciente, de ${U.fmtNum(total)}`;
    } else if (data.mode === 'graphql') {
      sub = `las más activas de ${U.fmtNum(total)}`;
    } else sub = `de ${U.fmtNum(total)} en el repo`;
    el.st.branchesSub.textContent = sub;
    el.st.branchesSub.title = sub;

    el.st.commits.textContent = U.fmtNum(L.nodes.length);
    const merges = L.nodes.filter((n) => n.merge).length;
    el.st.commitsSub.textContent = merges ? U.plural(merges, 'merge', 'merges') : 'sin merges';

    const prs = [...data.pulls.values()];
    el.st.prs.textContent = U.fmtNum(Math.max(data.totalPulls || 0, prs.length));
    const drafts = prs.filter((p) => p.draft).length;
    el.st.prsSub.textContent = prs.length ? (drafts ? U.plural(drafts, 'borrador', 'borradores') : 'listos para revisión') : 'ninguno abierto';

    renderLast();
    renderTokenBanner();
  }

  function renderLast() {
    const t = feed.lastTime();
    el.st.last.textContent = t ? U.timeAgo(t) : '–';
    el.st.lastSub.textContent = t ? U.fmtDateTime(t) : 'sin eventos';
  }

  /* ---------- estado de conexión ---------- */

  const STATE_TEXT = {
    loading: 'Cargando',
    syncing: 'En vivo',
    live: 'En vivo',
    limited: 'En vivo, más lento',
    paused: 'En pausa',
    error: 'Sin conexión',
  };

  function onStatus(s) {
    status = s;
    if (s.state === 'error' && !source.data.loaded) {
      const fatal = s.nextAt == null;
      showOverlay('error', s.message, fatal);
    }
    renderStatus();
  }

  function renderStatus() {
    if (!status) return;
    const s = status;
    const shown = s.state === 'syncing' ? 'live' : s.state;
    el.status.dataset.state = shown;
    el.statusText.textContent = s.demo && shown === 'live' ? 'Simulación en vivo' : STATE_TEXT[s.state] || s.state;
    const now = Date.now();
    let sub = '';
    if (s.state === 'error') {
      sub = s.nextAt ? `reintento en ${Math.max(0, Math.ceil((s.nextAt - now) / 1000))} s` : 'detenido';
      el.status.title = s.message || '';
    } else if (s.state === 'paused') {
      sub = 'reanuda para seguir';
      el.status.title = '';
    } else if (s.state === 'loading') {
      sub = '';
    } else {
      const parts = [];
      if (s.lastOk) parts.push(`actualizado ${U.timeAgo(s.lastOk, now)}`);
      if (s.nextAt && !s.demo) parts.push(`próxima en ${Math.max(0, Math.ceil((s.nextAt - now) / 1000))} s`);
      sub = parts.join(' · ');
      el.status.title = s.state === 'limited' ? 'GraphBranch espacia las consultas para no agotar la cuota de la API de GitHub.' : '';
    }
    el.statusSub.textContent = sub;

    if (s.rate && !s.demo) {
      el.rate.hidden = false;
      const pct = s.rate.limit ? s.rate.remaining / s.rate.limit : 0;
      el.rate.querySelector('.rate-label').textContent = s.rateLabel || 'API';
      el.rateText.textContent = `${U.fmtNum(s.rate.remaining)} / ${U.fmtNum(s.rate.limit)}`;
      el.rateBar.style.setProperty('--pct', pct);
      el.rate.dataset.level = pct < 0.1 ? 'bad' : pct < 0.3 ? 'warn' : 'ok';
      el.rate.title = `Consultas restantes a la API de GitHub; se renueva a las ${new Date(s.rate.reset * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
    } else el.rate.hidden = true;
  }

  setInterval(() => {
    renderStatus();
    renderLast();
  }, 1000);

  /* ---------- capa sobre el grafo ---------- */

  function showOverlay(kind, message, fatal) {
    const o = el.overlay;
    o.hidden = false;
    o.dataset.kind = kind;
    if (kind === 'loading') {
      o.innerHTML = `<div class="ov-card"><span class="spinner" aria-hidden="true"></span><p>${U.esc(message)}</p></div>`;
    } else if (kind === 'empty') {
      o.innerHTML = `<div class="ov-card"><p class="ov-title">Este repositorio todavía no tiene commits</p><p>Cuando alguien haga el primer push, aparecerá aquí.</p></div>`;
    } else {
      o.innerHTML = `<div class="ov-card" role="alert">
          <p class="ov-title">No se pudo cargar el repositorio</p>
          <p>${U.esc(message)}</p>
          <div class="ov-actions">
            ${fatal && /token/i.test(message) ? '<button type="button" class="btn btn-primary" data-ov="settings">Abrir ajustes</button>' : ''}
            <button type="button" class="btn ${fatal && /token/i.test(message) ? 'btn-ghost' : 'btn-primary'}" data-ov="retry">Reintentar</button>
            <button type="button" class="btn btn-ghost" data-ov="demo">Ver la demo</button>
          </div>
        </div>`;
    }
  }

  function hideOverlay() {
    el.overlay.hidden = true;
    el.overlay.textContent = '';
  }

  el.overlay.addEventListener('click', (ev) => {
    const action = ev.target.closest('[data-ov]')?.dataset.ov;
    if (action === 'retry') {
      showOverlay('loading', 'Reintentando…');
      source.refreshNow();
    } else if (action === 'demo') startDemo();
    else if (action === 'settings') openSettings();
  });

  /* ---------- controles ---------- */

  function setPressed(btn, v) {
    btn.setAttribute('aria-pressed', v ? 'true' : 'false');
  }

  el.repoForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    connectRepo(el.repoInput.value);
  });
  el.repoInput.addEventListener('input', () => el.repoInput.setCustomValidity(''));
  el.demoBtn.addEventListener('click', startDemo);

  el.pauseBtn.addEventListener('click', () => {
    paused = !paused;
    setPressed(el.pauseBtn, paused);
    el.pauseBtn.title = paused ? 'Reanudar' : 'Pausar';
    el.pauseBtn.setAttribute('aria-label', el.pauseBtn.title);
    source?.setPaused(paused);
  });
  el.refreshBtn.addEventListener('click', () => {
    if (paused) el.pauseBtn.click();
    else source?.refreshNow();
  });

  setPressed(el.soundBtn, feed.sound);
  el.soundBtn.addEventListener('click', () => {
    feed.setSound(!feed.sound);
    setPressed(el.soundBtn, feed.sound);
  });

  if (!feed.notifySupported) el.notifyBtn.hidden = true;
  setPressed(el.notifyBtn, feed.notify);
  el.notifyBtn.addEventListener('click', async () => {
    const on = await feed.setNotify(!feed.notify);
    setPressed(el.notifyBtn, on);
    if (!on && Notification.permission === 'denied') {
      feed.toast({ kind: 'other', title: 'Notificaciones bloqueadas', detail: 'Permítelas para este sitio en la configuración del navegador.', time: Date.now() });
    }
  });

  el.zoomIn.addEventListener('click', () => graph.zoomBy(1.4));
  el.zoomOut.addEventListener('click', () => graph.zoomBy(1 / 1.4));
  el.followBtn.addEventListener('click', () => graph.setFollowing(!graph.following));

  el.view3d.addEventListener('click', () => setView('3d'));
  el.view2d.addEventListener('click', () => setView('2d'));
  if (!graph3d) {
    el.view3d.disabled = true;
    el.view3d.title = 'Tu navegador no tiene WebGL activado; la vista 3D no está disponible.';
  }
  setPressed(el.spinBtn, !!graph3d?.spin);
  el.spinBtn.addEventListener('click', () => {
    graph3d?.setSpin(!graph3d.spin);
    setPressed(el.spinBtn, !!graph3d?.spin);
  });
  setView(U.store.get('view', '3d'));

  /* ---------- ajustes ---------- */

  function openSettings() {
    el.tokenInput.value = settings.token;
    el.tokenInput.type = 'password';
    el.tokenToggle.textContent = 'Mostrar';
    el.maxBranches.value = settings.maxBranches;
    el.depth.value = settings.depth;
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
    el.tokenInput.focus();
  }

  function closeSettings() {
    if (typeof el.dialog.close === 'function') el.dialog.close();
    else el.dialog.removeAttribute('open');
  }

  el.settingsBtn.addEventListener('click', openSettings);
  $('#token-banner-btn').addEventListener('click', openSettings);
  el.settingsCancel.addEventListener('click', closeSettings);
  el.tokenToggle.addEventListener('click', () => {
    const show = el.tokenInput.type === 'password';
    el.tokenInput.type = show ? 'text' : 'password';
    el.tokenToggle.textContent = show ? 'Ocultar' : 'Mostrar';
  });
  el.tokenClear.addEventListener('click', () => {
    el.tokenInput.value = '';
    el.tokenInput.focus();
  });
  el.settingsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    settings.token = el.tokenInput.value.trim();
    settings.maxBranches = Math.max(2, Math.min(60, Number(el.maxBranches.value) || 15));
    settings.depth = Math.max(10, Math.min(100, Number(el.depth.value) || 40));
    U.store.set('token', settings.token || null);
    U.store.set('maxBranches', settings.maxBranches);
    U.store.set('depth', settings.depth);
    closeSettings();
    if (source && !source.data.repo.demo) connectRepo(`${source.owner}/${source.name}`);
    else el.tokenBanner.hidden = true;
  });

  /* filtro de ramas: en repos grandes se aplica en GitHub (con token) */
  let filterTimer = null;
  el.branchFilter.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const q = el.branchFilter.value.trim();
      if (source && !source.data.repo.demo) U.store.set('filter:' + repoKey(), q || null);
      source?.setFilter(q);
    }, 450);
  });

  /* ---------- arranque ---------- */

  let initialRepo = null;
  try {
    initialRepo = new URLSearchParams(location.search).get('repo');
  } catch {
    /* sin query string */
  }
  initialRepo ||= U.store.get('repo', null);
  if (initialRepo && U.parseRepo(initialRepo)) connectRepo(initialRepo);
  else startDemo();
})(window.GB);
