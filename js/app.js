/* GraphBranch — conecta fuente de datos, layout, grafo y feed. */
(async function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const { t } = i18n;
  const $ = U.$;

  await i18n.ready; // el idioma (y su diccionario) antes de dibujar nada

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
    langBtn: $('#lang-btn'),
    langSelect: $('#lang-select'),
    settingsBtn: $('#settings-btn'),
    repoLink: $('#repo-link'),
    repoBadge: $('#repo-badge'),
    repoDesc: $('#repo-desc'),
    graph: $('#graph'),
    graph3d: $('#graph3d'),
    view3d: $('#view-3d'),
    view2d: $('#view-2d'),
    spinBtn: $('#spin-btn'),
    fullscreenBtn: $('#fullscreen-btn'),
    replayBtn: $('#replay-btn'),
    flyBtn: $('#fly-btn'),
    directorBtn: $('#director-btn'),
    tvBtn: $('#tv-btn'),
    tvClock: $('#tv-clock'),
    tvPause: $('#tv-pause'),
    tvSound: $('#tv-sound'),
    tvFs: $('#tv-fs'),
    tvExit: $('#tv-exit'),
    lower: $('#lower'),
    trophyBtn: $('#trophy-btn'),
    trophyCount: $('#trophy-count'),
    gameStrip: $('#game-strip'),
    gsLevel: $('#gs-level'),
    gsLv: $('#gs-lv'),
    gsFill: $('#gs-fill'),
    gsXp: $('#gs-xp'),
    gsMission: $('#gs-mission'),
    gsMtext: $('#gs-mtext'),
    gsMprog: $('#gs-mprog'),
    combo: $('#combo'),
    trophies: $('#trophies'),
    trLv: $('#tr-lv'),
    trFill: $('#tr-fill'),
    trXp: $('#tr-xp'),
    trMission: $('#tr-mission'),
    trProgress: $('#tr-progress'),
    trGrid: $('#tr-grid'),
    gameEnable: $('#game-enable'),
    graphPanel: $('.graph-panel'),
    toasts: $('#toasts'),
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
    depth: $('#depth'),
    settingsCancel: $('#settings-cancel'),
  };

  const settings = {
    token: U.store.get('token', ''),
    depth: U.store.get('depth', 40),
  };
  U.store.set('maxBranches', null); // ya no hay tope: se muestran todas las ramas

  let source = null;
  let layout = new GB.Layout();
  let status = null;
  let paused = false;

  /* dos vistas del mismo layout: 3D (Three.js) y 2D (SVG) */
  function followUI(v) {
    el.followBtn.setAttribute('aria-pressed', v);
    el.followBtn.querySelector('.follow-label').textContent = v ? t('follow.live') : t('follow.jump');
    el.followBtn.title = v ? t('follow.live.title') : t('follow.jump.title');
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
        onFlightChange: (on) => setPressed(el.flyBtn, on),
        // zumbido del motor mientras se vuela (solo con el sonido activado)
        onFlightSpeed: (level) => feed.synth.engine(feed.sound ? level : 0),
        // mundo abierto: cada rama descubierta suena; descubrirlas todas es un logro (ver world.js)
        onExplore: (e) => {
          if (feed.sound) feed.synth.discover(e.kind, e.name, e.name ? graph3d.panOf(e.name) : 0);
          if (e.kind === 'complete') game.mapped();
        },
        onShot: (a) => lowerThird(a),
        onDirector: (st) => renderDirector(st),
      });
    }
  } catch (err) {
    console.warn('La vista 3D no está disponible:', err);
  }
  let graph = graph2d;
  const director = graph3d?.director || null;

  let view = '2d';

  function setView(v, save = true) {
    if (v === '3d' && !graph3d) v = '2d';
    view = v;
    graph = v === '3d' ? graph3d : graph2d;
    el.graph3d.hidden = v !== '3d';
    el.graph.hidden = v !== '2d';
    el.graph.parentElement.dataset.view = v; // el Replay acomoda su fecha según la vista
    graph3d?.setActive(v === '3d');
    setPressed(el.view3d, v === '3d');
    setPressed(el.view2d, v === '2d');
    el.spinBtn.hidden = v !== '3d';
    el.flyBtn.hidden = v !== '3d' || !graph3d?.flight;
    el.directorBtn.hidden = v !== '3d' || !director;
    // los atajos de teclado solo se anuncian donde hay teclado y ratón
    const keys = v === '3d' && window.matchMedia?.('(pointer: fine)').matches;
    el.hint.innerHTML = i18n.html('hint.' + v) + (keys ? ' · ' + i18n.html('hint.keys') : '');
    followUI(graph.following);
    if (save) U.store.set('view', v);
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
    // con la vista 3D, cada sonido sale del lado de la pantalla donde está su rama
    panOf: (a) => (graph === graph3d ? graph3d.panOf(a.branch) : 0),
  });

  /* ---------- fuente de datos ---------- */

  function connect(src) {
    replay.stop(true);
    if (source) source.stop();
    source = src;
    game.load(repoKey()); // cada repo tiene sus logros, su nivel y su misión
    layout = new GB.Layout();
    graph2d.clear();
    graph3d?.clear();
    graph3d?.world?.load(repoKey()); // y sus ramas descubiertas en el modo vuelo
    followUI(true);
    feed.clear();
    paused = false;
    setPressed(el.pauseBtn, false);
    setPressed(el.tvPause, false);
    graph3d?.setHold(false);
    renderPause();
    renderRepo(src.data.repo);
    showOverlay('loading', src.data.repo.demo ? i18n.msg('overlay.demoLoading') : i18n.msg('overlay.loading', { repo: `${src.data.repo.owner}/${src.data.repo.name}` }));
    src.on('update', (u) => src === source && onUpdate(u));
    src.on('status', (s) => src === source && onStatus(s));
    src.start();
  }

  function connectRepo(input, { save = true } = {}) {
    const parsed = U.parseRepo(input);
    if (!parsed) {
      el.repoInput.setCustomValidity(t('repo.invalid'));
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

  function setUrlParam(key, value) {
    try {
      const url = new URL(location.href);
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
      history.replaceState(null, '', url);
    } catch {
      /* algunos visores no permiten cambiar la URL */
    }
  }
  const setUrlRepo = (repo) => setUrlParam('repo', repo);

  let lastRender = null;

  /* `calm`: llegan ramas que esperaban su historia (la carga de a poco de un repo grande): se
     suman sin efectos de llegada, que son para lo nuevo */
  const liveCtx = (data, initial, calm = false) => ({
    initial,
    calm,
    prs: prsByBranch(data),
    pins: data.repo.demo ? new Set() : getPins(),
    canPin: !data.repo.demo,
  });

  function onUpdate({ activities, initial, calm }) {
    const news = !initial && activities.length > 0;
    // en modo TV lo que pasa ahora manda: el Replay de ambiente deja paso al presente
    if (news && tv.attract && replay.active) replay.stop();
    if (news) tv.lastNews = Date.now();
    const data = source.view ? source.view() : source.data;
    const L = layout.compute(data);
    lastRender = { data, L };
    // durante el Replay el grafo muestra el pasado; lo nuevo sigue llegando al panel y se dibuja al volver
    if (!replay.active) {
      const gctx = liveCtx(data, initial, calm);
      graph2d.update(L, gctx);
      graph3d?.update(L, gctx);
    }
    feed.setDefaultBranch(data.repo.defaultBranch);
    feed.add(activities, { live: !initial });
    if (!initial && activities.length) {
      game.observe(activities, {
        openPrs: Math.max(data.totalPulls || 0, data.pulls.size),
        liveBranches: L.heads.filter((h) => h.color !== 'ghost').length,
        recordDay: activities.some((a) => a.kind === 'push') && isRecordDay(data),
      });
    }
    if (!initial && !replay.active) graph3d?.celebrate(activities); // cada tipo de evento con su efecto
    renderRepo(data.repo);
    renderStats(data, L);
    if (!L.nodes.length) showOverlay('empty');
    else hideOverlay();
  }

  /* ---------- Replay: la historia como time-lapse ---------- */

  const replay = new GB.Replay({
    root: $('#replay'),
    onFrame: (data, L, { jump, acts, quiet }) => {
      const gctx = { initial: jump || quiet, replay: true, prs: new Map(), pins: new Set(), canPin: false };
      graph2d.update(L, gctx);
      graph3d?.update(L, gctx);
      if (!acts.length) return;
      graph3d?.celebrate(acts);
      if (feed.sound) feed.synth.play(acts, feed.panOf);
    },
    onExit: () => {
      tv.attract = false;
      showLive();
    },
    onState: (on) => {
      setPressed(el.replayBtn, on);
      if (on) lowerThird(null); // el Replay trae sus propios rótulos
    },
    onEnd: () => {
      if (!tv.attract) return game.replayDone();
      // el Replay de ambiente (modo TV) se queda un momento en el final y vuelve al presente
      setTimeout(() => tv.attract && replay.active && !paused && replay.stop(), 6000);
    },
  });

  function toggleReplay() {
    if (replay.active) return replay.stop();
    if (!lastRender) return;
    graph2d.clear();
    graph3d?.clear();
    if (!replay.start(lastRender.data, feed.items)) showLive();
  }

  /** Vuelve a dibujar el repo tal como está ahora (al salir del Replay). */
  function showLive() {
    graph2d.clear();
    graph3d?.clear();
    if (!lastRender) return;
    const gctx = liveCtx(lastRender.data, true);
    graph2d.update(lastRender.L, gctx);
    graph3d?.update(lastRender.L, gctx);
  }

  /* ---------- capa de juego: logros del repo, nivel y misión del día (ver game.js) ---------- */

  const game = new GB.Game({
    onUnlock: (a) => celebrate(`${a.icon} ${t('ach.' + a.id)}`, i18n.msg(`ach.${a.id}.d`)),
    onLevel: (n) => {
      celebrate(i18n.msg('game.levelUp', { n }), i18n.msg('game.levelUpDetail'));
      flashClass(el.gsLevel, 'up');
    },
    onMission: (m) => celebrate(i18n.msg('game.missionDone'), i18n.msg('mission.' + m.id, { n: m.n })),
    onCombo: (n) => {
      if (!game.enabled) return;
      el.combo.textContent = t('game.combo', { n });
      flashClass(el.combo, 'pop');
    },
    onChange: (v) => renderGame(v),
  });

  /** Logro, nivel o misión: aviso dorado, fuegos artificiales y fanfarria (como mucho una fiesta cada 6 s). */
  let lastParty = 0;
  function celebrate(title, detail) {
    if (!game.enabled || tv.on) return; // en modo TV, pantalla profesional: sin fiestas
    feed.toast({ kind: 'achievement', title, detail, time: Date.now() });
    const now = Date.now();
    if (now - lastParty < 6000) return;
    lastParty = now;
    if (graph === graph3d && graph3d.motion && !replay.active) graph3d.fireworks();
    if (feed.sound) feed.synth.play([{ kind: 'release', time: now }]);
  }

  function flashClass(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /** ¿Hoy hay más commits que cualquier otro día del grafo? (al menos 5) */
  function isRecordDay(data) {
    const today = U.dayKey(Date.now());
    const perDay = new Map();
    for (const c of data.commits.values()) {
      const k = U.dayKey(c.date);
      perDay.set(k, (perDay.get(k) || 0) + 1);
    }
    const n = perDay.get(today) || 0;
    perDay.delete(today);
    return n >= 5 && n > Math.max(0, ...perDay.values());
  }

  function renderGame(v = game.view()) {
    el.trophyCount.hidden = !v?.count;
    if (v) el.trophyCount.textContent = U.fmtNum(v.count);
    el.gameStrip.hidden = !v?.enabled;
    if (!v) return;
    const pct = `${Math.round(Math.min(1, (v.xp - v.floor) / Math.max(1, v.next - v.floor)) * 100)}%`;
    const lv = t('game.level', { n: v.level });
    const xp = t('game.xp', { xp: U.fmtNum(v.xp), next: U.fmtNum(v.next) });
    el.gsLv.textContent = lv;
    el.gsXp.textContent = xp;
    el.gsFill.style.width = pct;
    const m = v.mission;
    el.gsMission.hidden = !m;
    if (m) {
      el.gsMtext.textContent = t('mission.' + m.id, { n: m.n });
      el.gsMprog.textContent = m.done ? '✓' : `${m.progress}/${m.n}`;
      el.gsMission.classList.toggle('done', m.done);
    }
    if (el.trophies.open) renderTrophies(v, { lv, xp, pct });
  }

  function renderTrophies(v = game.view(), pre) {
    if (!v) return;
    el.trLv.textContent = pre?.lv || t('game.level', { n: v.level });
    el.trXp.textContent = pre?.xp || t('game.xp', { xp: U.fmtNum(v.xp), next: U.fmtNum(v.next) });
    el.trFill.style.width = pre?.pct || `${Math.round(Math.min(1, (v.xp - v.floor) / Math.max(1, v.next - v.floor)) * 100)}%`;
    const m = v.mission;
    el.trMission.hidden = !m;
    if (m) {
      el.trMission.textContent = `🎯 ${t('game.mission')}: ${t('mission.' + m.id, { n: m.n })} · ${m.done ? '✓' : `${m.progress}/${m.n}`}`;
      el.trMission.classList.toggle('done', m.done);
    }
    el.trProgress.textContent = t('game.progress', { n: v.count, total: v.total });
    el.trGrid.innerHTML = GB.Game.achievements
      .map((a) => {
        const at = v.unlocked[a.id];
        const when = at ? t('game.unlockedOn', { date: U.fmtDate(at) }) : t('game.locked');
        return `<li class="tr-card${at ? ' on' : ''}">
            <span class="tr-icon" aria-hidden="true">${a.icon}</span>
            <span class="tr-text">
              <span class="tr-name">${U.esc(t('ach.' + a.id))}</span>
              <span class="tr-desc">${U.esc(t(`ach.${a.id}.d`))}</span>
              <span class="tr-when">${U.esc(when)}</span>
            </span>
          </li>`;
      })
      .join('');
    el.gameEnable.checked = v.enabled;
  }

  function openTrophies() {
    renderTrophies();
    if (typeof el.trophies.showModal === 'function') el.trophies.showModal();
    else el.trophies.setAttribute('open', '');
  }

  for (const b of [el.trophyBtn, el.gsLevel, el.gsMission]) b.addEventListener('click', openTrophies);
  $('#trophies-close').addEventListener('click', () => (typeof el.trophies.close === 'function' ? el.trophies.close() : el.trophies.removeAttribute('open')));
  el.gameEnable.addEventListener('change', () => game.setEnabled(el.gameEnable.checked));

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
    el.repoBadge.textContent = repo.demo ? t('badge.demo') : t('badge.private');
    el.repoBadge.className = `badge${repo.demo ? ' demo' : ''}`;
    el.repoDesc.textContent = repo.demo ? t('repo.demoDesc') : repo.description || '';
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
      data.mode === 'events' ? t('banner.events', { total: U.fmtNum(data.totalBranches) }) : t('banner.anon');
  }

  function renderStats(data, L) {
    const visible = data.branches.size;
    const total = data.totalBranches || visible;
    el.st.branches.textContent = U.fmtNum(visible);
    let sub;
    const totalText = U.fmtNum(total);
    if (data.pending > 0) {
      // un repo grande se dibuja de a poco: las ramas que faltan llegan en los próximos ciclos
      sub = t('stats.branches.loading', { total: U.fmtNum(visible + data.pending) });
    } else if (data.matchingBranches != null) {
      sub = t('stats.branches.matching', { n: data.matchingBranches, filter: U.truncate(source.filter || '', 18), total: totalText });
    } else if (total <= visible) {
      sub = visible === 1 ? t('stats.branches.only') : t('stats.branches.all');
    } else if (data.mode === 'events') {
      sub = t('stats.branches.recent', { total: totalText });
    } else sub = t('stats.branches.of', { total: totalText });
    el.st.branchesSub.textContent = sub;
    el.st.branchesSub.title = sub;

    el.st.commits.textContent = U.fmtNum(L.nodes.length);
    const merges = L.nodes.filter((n) => n.merge).length;
    el.st.commitsSub.textContent = merges ? t('stats.merges', { n: merges }) : t('stats.noMerges');

    const prs = [...data.pulls.values()];
    el.st.prs.textContent = U.fmtNum(Math.max(data.totalPulls || 0, prs.length));
    const drafts = prs.filter((p) => p.draft).length;
    el.st.prsSub.textContent = prs.length ? (drafts ? t('stats.drafts', { n: drafts }) : t('stats.readyForReview')) : t('stats.noneOpen');

    renderLast();
    renderTokenBanner();
  }

  function renderLast() {
    const last = feed.lastTime();
    el.st.last.textContent = last ? U.timeAgo(last) : '–';
    el.st.lastSub.textContent = last ? U.fmtDateTime(last) : t('stats.noEvents');
  }

  /* ---------- estado de conexión ---------- */

  const STATE_TEXT = {
    loading: 'status.loading',
    syncing: 'status.live',
    live: 'status.live',
    limited: 'status.limited',
    paused: 'status.paused',
    error: 'status.error',
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
    el.statusText.textContent = s.demo && shown === 'live' ? t('status.demoLive') : STATE_TEXT[s.state] ? t(STATE_TEXT[s.state]) : s.state;
    const now = Date.now();
    let sub = '';
    const secsTo = (at) => i18n.fmtSeconds(Math.max(0, Math.ceil((at - now) / 1000)));
    if (s.state === 'error') {
      sub = s.nextAt ? t('status.retryIn', { time: secsTo(s.nextAt) }) : t('status.stopped');
      el.status.title = i18n.text(s.message);
    } else if (s.state === 'paused') {
      sub = t('status.resumeHint');
      el.status.title = '';
    } else if (s.state === 'loading') {
      sub = '';
    } else {
      const parts = [];
      if (s.lastOk) parts.push(t('status.updated', { ago: U.timeAgo(s.lastOk, now) }));
      if (s.nextAt && !s.demo) parts.push(t('status.nextIn', { time: secsTo(s.nextAt) }));
      sub = parts.join(' · ');
      el.status.title = s.state === 'limited' ? t('status.throttled') : '';
    }
    el.statusSub.textContent = sub;

    if (s.rate && !s.demo) {
      el.rate.hidden = false;
      const pct = s.rate.limit ? s.rate.remaining / s.rate.limit : 0;
      el.rate.querySelector('.rate-label').textContent = s.rateLabel || 'API';
      el.rateText.textContent = `${U.fmtNum(s.rate.remaining)} / ${U.fmtNum(s.rate.limit)}`;
      el.rateBar.style.setProperty('--pct', pct);
      el.rate.dataset.level = pct < 0.1 ? 'bad' : pct < 0.3 ? 'warn' : 'ok';
      el.rate.title = t('status.rateTitle', { time: i18n.fmtTime(s.rate.reset * 1000) });
    } else el.rate.hidden = true;
  }

  setInterval(() => {
    renderStatus();
    renderLast();
    tvTick();
  }, 1000);

  /* ---------- capa sobre el grafo ---------- */

  /* `message` puede ser un mensaje diferido (i18n.msg): se traduce al dibujar, así sigue el idioma activo */
  let overlayState = null;

  function showOverlay(kind, message, fatal) {
    overlayState = { kind, message, fatal };
    const o = el.overlay;
    o.hidden = false;
    o.dataset.kind = kind;
    if (kind === 'loading') {
      o.innerHTML = `<div class="ov-card"><span class="spinner" aria-hidden="true"></span><p>${U.esc(i18n.text(message))}</p></div>`;
    } else if (kind === 'empty') {
      o.innerHTML = `<div class="ov-card"><p class="ov-title">${U.esc(t('overlay.empty.title'))}</p><p>${U.esc(t('overlay.empty.body'))}</p></div>`;
    } else {
      o.innerHTML = `<div class="ov-card" role="alert">
          <p class="ov-title">${U.esc(t('overlay.error.title'))}</p>
          <p>${U.esc(i18n.text(message))}</p>
          <div class="ov-actions">
            ${fatal ? `<button type="button" class="btn btn-primary" data-ov="settings">${U.esc(t('overlay.openSettings'))}</button>` : ''}
            <button type="button" class="btn ${fatal ? 'btn-ghost' : 'btn-primary'}" data-ov="retry">${U.esc(t('overlay.retry'))}</button>
            <button type="button" class="btn btn-ghost" data-ov="demo">${U.esc(t('overlay.viewDemo'))}</button>
          </div>
        </div>`;
    }
  }

  function hideOverlay() {
    overlayState = null;
    el.overlay.hidden = true;
    el.overlay.textContent = '';
  }

  el.overlay.addEventListener('click', (ev) => {
    const action = ev.target.closest('[data-ov]')?.dataset.ov;
    if (action === 'retry') {
      showOverlay('loading', i18n.msg('status.retrying'));
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

  function renderPause() {
    for (const b of [el.pauseBtn, el.tvPause]) {
      b.title = paused ? t('ctl.resume') : t('ctl.pause');
      b.setAttribute('aria-label', b.title);
    }
  }

  /** Pausa: no llegan novedades y tampoco se mueve nada solo (giro, director, fondo, Replay de ambiente). */
  function setPaused(v) {
    paused = v;
    setPressed(el.pauseBtn, v);
    setPressed(el.tvPause, v);
    renderPause();
    source?.setPaused(v);
    graph3d?.setHold(v);
    if (tv.attract && replay.active) {
      if (v) replay.pause();
      else if (replay.u >= replay.U) replay.stop();
      else replay.play();
    }
  }

  el.pauseBtn.addEventListener('click', () => setPaused(!paused));
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
      feed.toast({ kind: 'other', title: i18n.msg('notify.blockedTitle'), detail: i18n.msg('notify.blockedBody'), time: Date.now() });
    }
  });

  el.zoomIn.addEventListener('click', () => graph.zoomBy(1.4));
  el.zoomOut.addEventListener('click', () => graph.zoomBy(1 / 1.4));
  el.followBtn.addEventListener('click', () => {
    if (graph === graph3d) graph3d.touch(); // el director de cámara cede el mando
    graph.setFollowing(!graph.following);
  });

  /* pantalla completa: el panel del grafo ocupa toda la pantalla y los avisos lo acompañan
     (dentro de pantalla completa solo se ve ese elemento) */
  const fullscreenEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fullscreenOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  el.fullscreenBtn.hidden = !fullscreenOK;

  /* Safari antiguo no devuelve promesa; el navegador puede negarse */
  const requestFs = (node) => Promise.resolve((node.requestFullscreen || node.webkitRequestFullscreen).call(node)).catch(() => {});
  const exitFs = () => Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document)).catch(() => {});

  /** En modo TV la pantalla completa es la página entera; si no, solo el panel del grafo. */
  function toggleFullscreen() {
    if (fullscreenEl()) exitFs();
    else requestFs(tv.on ? document.documentElement : el.graphPanel);
  }

  function onFullscreen() {
    const on = fullscreenEl() === el.graphPanel;
    setPressed(el.fullscreenBtn, on);
    setPressed(el.tvFs, !!fullscreenEl());
    (on ? el.graphPanel : document.body).appendChild(el.toasts);
    if (on && view === '3d') el.graph3d.focus({ preventScroll: true }); // las flechas funcionan de inmediato
  }

  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('webkitfullscreenchange', onFullscreen);
  el.fullscreenBtn.addEventListener('click', toggleFullscreen);
  el.replayBtn.addEventListener('click', toggleReplay);
  el.flyBtn.addEventListener('click', () => graph3d?.flight?.toggle());
  el.graphPanel.addEventListener('keydown', (ev) => {
    // espacio: pausar o seguir el Replay (los botones y controles ya manejan su propio espacio;
    // en modo TV el espacio pausa todo, ver más abajo)
    if (ev.key === ' ' && replay.active && !tv.on && !ev.target.closest('button, input, select, textarea, a, [contenteditable]')) {
      ev.preventDefault();
      replay.toggle();
    }
  });
  el.graphPanel.addEventListener('keydown', (ev) => {
    if ((ev.key || '').toLowerCase() !== 'f' || ev.ctrlKey || ev.metaKey || ev.altKey || !fullscreenOK) return;
    if (ev.target.closest('input, textarea, select, [contenteditable]')) return;
    ev.preventDefault();
    toggleFullscreen();
  });

  /* ---------- director de cámara (ver director.js) ---------- */

  function renderDirector(st = director) {
    setPressed(el.directorBtn, !!st?.on);
    // cedió la cámara: el botón lo muestra hasta que la retome
    el.directorBtn.classList.toggle('waiting', !!(st?.on && st.manual));
  }

  el.directorBtn.addEventListener('click', () => {
    if (!director) return;
    U.store.set('director', !director.on);
    director.setOn(!director.on);
  });

  /** Rótulo inferior, como en una transmisión: qué está filmando el director. */
  let lowerTimer = 0;
  function lowerThird(a) {
    const box = el.lower;
    clearTimeout(lowerTimer);
    box.classList.remove('show');
    if (!a || replay.active) return;
    const K = GB.Feed.KINDS;
    const m = K[a.kind] || K.other;
    const title = i18n.text(a.title);
    const detail = i18n.text(a.detail);
    const where = a.ref || a.branch;
    const who = a.actor ? `${U.avatarHTML(a.actor, 18)}<span>${U.esc(a.actor.login || a.actor.name || '')}</span>` : '';
    box.className = `lower sev-${m.sev}`;
    box.innerHTML = `<span class="act-icon">${GB.Feed.icon(m.icon)}</span>
      <span class="lt-body">
        <span class="act-kind">${U.esc(t('kind.' + (K[a.kind] ? a.kind : 'other')))}</span>
        <span class="lt-title">${U.esc(U.truncate(title, 90))}</span>
        ${detail ? `<span class="lt-detail">${U.esc(U.truncate(detail, 110))}</span>` : ''}
        ${who || where ? `<span class="lt-meta">${who}${where ? `<code>${U.esc(where)}</code>` : ''}</span>` : ''}
      </span>`;
    lowerTimer = setTimeout(() => box.classList.add('show'), 450); // entra cuando la cámara ya va en camino
  }

  /* ---------- modo TV: una pantalla compartida que informa sola ---------- */

  const ATTRACT_IDLE = 3 * 60e3; // sin novedades durante este tiempo…
  const ATTRACT_EVERY = 10 * 60e3; // …se reproduce la historia, como mucho una vez cada tanto
  const tv = { on: false, prevView: null, lock: null, locking: false, attract: false, lastNews: 0, lastAttract: 0, idleTimer: 0 };

  /** Entra o sale del modo TV. `user`: viene de un clic (solo así se puede pedir pantalla completa). */
  function setTV(on, user = false) {
    if (tv.on === on) return;
    tv.on = on;
    const root = document.documentElement;
    root.classList.toggle('tv', on);
    setPressed(el.tvBtn, on);
    if (on) {
      tv.prevView = view;
      tv.lastNews = tv.lastAttract = Date.now();
      if (graph3d) setView('3d', false);
      feed.sound = false; // en un espacio compartido el sonido llega a todos: se enciende a mano
      director?.setTV(true);
      director?.setOn(true);
      if (user && fullscreenOK && !fullscreenEl()) requestFs(root);
      tvScale();
      lockScreen();
    } else {
      if (tv.attract && replay.active) replay.stop();
      tv.attract = false;
      feed.sound = !!U.store.get('sound', false);
      director?.setTV(false);
      director?.setOn(!!U.store.get('director', false));
      if (fullscreenEl() === root) exitFs();
      setView(tv.prevView || view, false);
      tv.lock?.release().catch(() => {});
      tv.lock = null;
      root.style.removeProperty('--tvz');
    }
    setPressed(el.soundBtn, feed.sound);
    setPressed(el.tvSound, feed.sound);
    setUrlParam('tv', on ? '1' : null);
    graph3d?.restyle();
    wake();
    tvTick();
  }

  /** Letra más grande cuanto más grande es la pantalla (una TV se mira desde lejos). */
  function tvScale() {
    if (!tv.on) return;
    const z = Math.min(2.2, Math.max(1, Math.min(innerWidth / 1500, innerHeight / 860)));
    document.documentElement.style.setProperty('--tvz', z.toFixed(3));
    graph3d?.restyle();
  }

  /** Pantalla siempre encendida (Screen Wake Lock); el navegador la suelta al ocultar la pestaña. */
  async function lockScreen() {
    if (!tv.on || tv.lock || tv.locking || document.hidden || !navigator.wakeLock) return;
    tv.locking = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!tv.on) lock.release().catch(() => {});
      else {
        tv.lock = lock;
        lock.addEventListener('release', () => tv.lock === lock && (tv.lock = null));
      }
    } catch {
      /* sin permiso, sin batería o sin soporte: la pantalla puede apagarse */
    }
    tv.locking = false;
  }

  /** Sin mover el ratón un rato, se esconden el puntero y los controles (con el teclado siguen a mano). */
  function wake() {
    const root = document.documentElement;
    root.classList.remove('tv-idle');
    clearTimeout(tv.idleTimer);
    if (tv.on) tv.idleTimer = setTimeout(() => root.classList.add('tv-idle'), 3500);
  }

  /** Cada segundo: el reloj y, si hace rato que no pasa nada, el Replay de ambiente. */
  function tvTick() {
    if (!tv.on) return;
    const now = Date.now();
    el.tvClock.textContent = i18n.fmtTime(now);
    if (paused || replay.active || !lastRender || lastRender.L.nodes.length < 8) return;
    if (now - tv.lastNews < ATTRACT_IDLE || now - tv.lastAttract < ATTRACT_EVERY) return;
    tv.lastAttract = now;
    tv.attract = true;
    toggleReplay();
    if (!replay.active) tv.attract = false;
  }

  el.tvBtn.addEventListener('click', () => setTV(!tv.on, true));
  el.tvExit.addEventListener('click', () => setTV(false));
  el.tvFs.addEventListener('click', toggleFullscreen);
  el.tvFs.hidden = !fullscreenOK;
  el.tvPause.addEventListener('click', () => setPaused(!paused));
  el.tvSound.addEventListener('click', () => {
    feed.sound = !feed.sound; // solo mientras dura el modo TV: no cambia la preferencia guardada
    if (feed.sound) feed.synth.preview();
    setPressed(el.tvSound, feed.sound);
    setPressed(el.soundBtn, feed.sound);
  });
  window.addEventListener('resize', tvScale);
  document.addEventListener('visibilitychange', () => !document.hidden && lockScreen());
  for (const type of ['pointermove', 'pointerdown', 'keydown']) document.addEventListener(type, () => tv.on && wake(), { passive: true });
  // en modo TV: espacio pausa todo y F pone la página entera en pantalla completa
  document.addEventListener('keydown', (ev) => {
    if (!tv.on || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.target.closest?.('button, input, select, textarea, a, [contenteditable], dialog')) return;
    const k = (ev.key || '').toLowerCase();
    if (k === ' ') {
      ev.preventDefault();
      setPaused(!paused);
    } else if (k === 'f' && fullscreenOK) {
      ev.preventDefault();
      toggleFullscreen();
    }
  });

  el.view3d.addEventListener('click', () => setView('3d'));
  el.view2d.addEventListener('click', () => setView('2d'));
  if (!graph3d) el.view3d.disabled = true;
  function renderWebglNote() {
    el.view3d.title = graph3d ? '' : t('webgl.missing');
  }
  setPressed(el.spinBtn, !!graph3d?.spin);
  el.spinBtn.addEventListener('click', () => {
    graph3d?.setSpin(!graph3d.spin);
    setPressed(el.spinBtn, !!graph3d?.spin);
  });
  setView(U.store.get('view', '3d'));
  director?.setOn(!!U.store.get('director', false));
  renderDirector();
  renderPause();
  renderWebglNote();

  /* ---------- ajustes ---------- */

  function openSettings() {
    el.tokenInput.value = settings.token;
    el.tokenInput.type = 'password';
    el.tokenToggle.textContent = t('settings.show');
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
    el.tokenToggle.textContent = show ? t('settings.hide') : t('settings.show');
  });
  el.tokenClear.addEventListener('click', () => {
    el.tokenInput.value = '';
    el.tokenInput.focus();
  });
  el.settingsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    settings.token = el.tokenInput.value.trim();
    settings.depth = Math.max(10, Math.min(100, Number(el.depth.value) || 40));
    U.store.set('token', settings.token || null);
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

  /* ---------- idioma ---------- */

  function fillLanguages() {
    el.langSelect.innerHTML = i18n.locales
      .map((l) => `<option value="${U.esc(l.code)}" lang="${U.esc(l.code)}">${U.esc(l.name)}</option>`)
      .join('');
    el.langSelect.value = i18n.locale;
    const current = i18n.locales.find((l) => l.code === i18n.locale);
    el.langBtn.title = `${t('ctl.language')}: ${current ? current.name : i18n.locale}`;
  }

  fillLanguages();
  el.langSelect.addEventListener('change', () => i18n.setLocale(el.langSelect.value));

  /* al cambiar de idioma se vuelve a dibujar todo lo que tiene texto (lo estático ya lo tradujo i18n.apply) */
  i18n.onChange(() => {
    fillLanguages();
    setView(view, !tv.on);
    renderPause();
    renderWebglNote();
    el.tokenToggle.textContent = el.tokenInput.type === 'password' ? t('settings.show') : t('settings.hide');
    el.repoInput.setCustomValidity('');
    graph2d.relocalize();
    graph3d?.relocalize();
    replay.relocalize();
    lowerThird(null);
    tvTick();
    renderGame();
    feed.relocalize();
    if (!source) return;
    // la demo inventa mensajes, incidencias y comentarios en el idioma activo: se reinicia para no mezclarlos
    if (source.data.repo.demo) return startDemo();
    renderRepo(source.data.repo);
    if (lastRender) renderStats(lastRender.data, lastRender.L);
    renderStatus();
    if (overlayState) showOverlay(overlayState.kind, overlayState.message, overlayState.fatal);
  });

  /* ---------- arranque ---------- */

  let initialRepo = null;
  let initialTV = false;
  try {
    const q = new URLSearchParams(location.search);
    initialRepo = q.get('repo');
    initialTV = q.has('tv') && !/^(0|false|no|off)$/i.test(q.get('tv'));
  } catch {
    /* sin query string */
  }
  initialRepo ||= U.store.get('repo', null);
  if (initialRepo && U.parseRepo(initialRepo)) connectRepo(initialRepo);
  else startDemo();
  if (initialTV) setTV(true); // ?tv=1: pensado para dejar la URL abierta en una pantalla
})(window.GB);
