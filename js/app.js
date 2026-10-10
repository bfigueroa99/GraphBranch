/* GraphBranch — conecta fuente de datos, layout, grafo y feed, con uno o varios repos seguidos a la vez. */
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
    snapBtn: $('#snap-btn'),
    snapNote: $('#snap-note'),
    flyBtn: $('#fly-btn'),
    galaxyBtn: $('#galaxy-btn'),
    directorBtn: $('#director-btn'),
    tvBtn: $('#tv-btn'),
    tvClock: $('#tv-clock'),
    tvPause: $('#tv-pause'),
    tvSound: $('#tv-sound'),
    tvFs: $('#tv-fs'),
    tvExit: $('#tv-exit'),
    tvBar: $('#tv-bar'),
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
    repoTabs: $('#repo-tabs'),
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
    tokenWhere: $('#token-where'),
    depth: $('#depth'),
    settingsCancel: $('#settings-cancel'),
  };

  /* el token: en la web, en localStorage; en la app de escritorio, cifrado con el llavero del sistema
     (electron/preload.js expone GBDesktop) y se lee antes de conectar, ver el arranque */
  const desktop = window.GBDesktop;
  const settings = {
    token: desktop ? '' : U.store.get('token', ''),
    depth: U.store.get('depth', 40),
  };
  U.store.set('maxBranches', null); // ya no hay tope: se muestran todas las ramas

  /* repos seguidos: cada uno en su pestaña, con su fuente, que sigue consultando GitHub aunque no
     esté a la vista; así sus novedades llegan al panel de actividad, a los avisos y a la pestaña.
     El grafo, las cifras, el Replay y los logros que se ven son del repo a la vista (`active`). */
  const MAX_REPOS = 10;
  const tabs = []; // { key, demo, source, layout, game, unread, status, el, startTimer }
  let active = null;
  let source = null; // la fuente del repo a la vista
  let layout = null; // y su layout (colores y carriles estables)
  let game = null; // y sus logros
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
          if (e.kind === 'complete') game?.mapped();
        },
        onShot: (a) => lowerThird(a),
        onDirector: (st) => renderDirector(st),
        // modo galaxias: los archivos de una rama (los planetas) se piden al acercarse a su galaxia
        loadFiles: (q) => (source?.files ? source.files(q) : null),
        onGalaxyChange: (on) => setPressed(el.galaxyBtn, on),
        onScan: () => feed.sound && feed.synth.discover('scan', null, 0),
        // el espacio tiene su zumbido de fondo, en la nota de la galaxia en la que se está
        onAmbience: (level, name) => feed.synth.drone(feed.sound ? level : 0, name),
        // el hiperimpulsor: la carga que sube y el golpe del salto
        onJump: (kind, name) => feed.sound && feed.synth.hyper(kind, name),
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
    el.galaxyBtn.hidden = v !== '3d' || !graph3d?.gx;
    el.directorBtn.hidden = v !== '3d' || !director;
    // los atajos de teclado solo se anuncian donde hay teclado y ratón
    const keys = window.matchMedia?.('(pointer: fine)').matches;
    el.hint.innerHTML = i18n.html('hint.' + v) + (keys ? ' · ' + i18n.html(v === '3d' ? 'hint.keys' : 'hint.keys2d') : '');
    followUI(graph.following);
    if (save) U.store.set('view', v);
  }

  /* ramas fijadas y filtro: se recuerdan por repositorio */
  const repoKey = () => active?.key || '';
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
      // la actividad de otro repo seguido lleva a su pestaña (la de uno que ya no se sigue, a ninguna parte)
      if (a.repo != null) {
        const tab = tabs.find((x) => x.key === a.repo);
        if (!tab) return;
        if (tab !== active) showTab(tab);
      }
      if (a.sha && graph.focusSha(a.sha)) return;
      if (a.branch) graph.focusBranch(a.branch);
    },
    // con la vista 3D, cada sonido sale del lado de la pantalla donde está su rama (si es del repo a la vista)
    panOf: (a) => (graph === graph3d && (a.repo == null || a.repo === active?.key) ? graph3d.panOf(a.branch) : 0),
  });

  /* ---------- repos seguidos y fuente de datos ---------- */

  const STAGGER = 700; // los repos que arrancan juntos, escalonados: GitHub no recibe todo a la vez
  /** Clave de un repo (de su fuente o de { owner, name }): con ella se guarda lo suyo (fijadas, filtro, logros). */
  /** Los proyectos de GitLab llevan "gitlab:" delante (en la clave, en lo que se guarda y en la URL). */
  const hostPrefix = (src) => (src.host === 'gitlab' ? 'gitlab:' : '');
  const keyOf = (src) => `${hostPrefix(src)}${src.owner || 'demo'}/${src.name || ''}`.toLowerCase();
  /** Nombre a la vista (el del servicio, ya cargado) y el escrito, que es el que se guarda (de él sale la clave). */
  const nameOf = (tab) => `${tab.source.data.repo.owner}/${tab.source.data.repo.name}`;
  const savedName = (tab) => `${hostPrefix(tab.source)}${tab.source.owner}/${tab.source.name}`;
  const realTabs = () => tabs.filter((x) => !x.demo);
  const filterOf = (tab) => (tab.demo ? tab.source.filter || '' : U.store.get('filter:' + tab.key, ''));

  /** La fuente de un repo de GitHub o de un proyecto de GitLab, con lo que se recuerda de él: su
      filtro y sus ramas fijadas. El token de GitHub va solo a la fuente de GitHub. */
  function sourceFor({ host, owner, name }) {
    const key = keyOf({ host, owner, name });
    const remembered = { depth: settings.depth, filter: U.store.get('filter:' + key, ''), pins: U.store.get('pins:' + key, []) };
    if (host === 'gitlab') return new GB.GitLabSource({ path: `${owner}/${name}`, ...remembered });
    return new GB.GitHubSource({ owner, name, token: settings.token, ...remembered });
  }

  /** Suma una pestaña al final, con su fuente, sin mostrarla ni arrancarla. */
  function addTab(src) {
    const tab = { key: keyOf(src), demo: !!src.data.repo.demo, source: null, layout: null, game: null, unread: 0, status: null, el: null, startTimer: 0 };
    tab.game = new GB.Game(gameHooks(tab));
    tab.game.load(tab.key); // cada repo tiene sus logros, su nivel y su misión
    setSource(tab, src);
    tabs.push(tab);
    shareQuota();
    return tab;
  }

  /** Le da a una pestaña su fuente (al seguir el repo, o al reconectarlo con otro token). */
  function setSource(tab, src) {
    clearTimeout(tab.startTimer);
    tab.source?.stop();
    tab.source = src;
    tab.layout = new GB.Layout();
    tab.status = null;
    // lo que emita una fuente que ya no es la de su pestaña (se cerró o se reemplazó) no se escucha
    src.on('update', (u) => tab.source === src && onUpdate(tab, u));
    src.on('status', (s) => tab.source === src && onStatus(tab, s));
    if (tab === active) {
      source = src;
      layout = tab.layout;
    }
  }

  /** Arranca la fuente de una pestaña, ahora o dentro de `delay` ms. */
  function startTab(tab, delay = 0) {
    const src = tab.source;
    clearTimeout(tab.startTimer);
    const go = () => {
      if (tab.source !== src) return;
      if (paused) src.setPaused(true); // se pausó mientras esperaba su turno
      src.start();
    };
    if (delay) tab.startTimer = setTimeout(go, delay);
    else go();
  }

  /** La cuota de cada servicio es una para todos sus repos seguidos: cada fuente cuida su parte. */
  function shareQuota() {
    const real = realTabs();
    for (const x of real) x.source.share = real.filter((y) => y.source.host === x.source.host).length;
  }

  /** Deja de seguir un repo. Si era el que estaba a la vista, pasa al de al lado (o a la demo). */
  function removeTab(tab, { replace = true } = {}) {
    const i = tabs.indexOf(tab);
    if (i < 0) return;
    clearTimeout(tab.startTimer);
    tab.source.stop();
    tab.source = null;
    tabs.splice(i, 1);
    tab.el?.remove();
    feed.drop(tab.key);
    shareQuota();
    if (tab === active) {
      active = null;
      if (replace) {
        const next = tabs[Math.min(i, tabs.length - 1)];
        if (next) showTab(next);
        else startDemo();
      }
    }
    saveTabs();
    renderTabs();
  }

  /** El botón de cerrar de una pestaña: si tenía el foco, pasa a la pestaña que queda en su lugar. */
  function closeTab(tab) {
    const hadFocus = tab.el?.contains(document.activeElement);
    const i = tabs.indexOf(tab);
    removeTab(tab);
    if (!hadFocus) return;
    const next = tabs[Math.min(i, tabs.length - 1)];
    if (next?.el?.isConnected && !el.repoTabs.hidden) next.el.querySelector('.rt-main').focus();
    else el.repoInput.focus();
  }

  /**
   * Muestra un repo seguido: su grafo, sus cifras y su estado. Los demás siguen consultando atrás.
   * `force`: vuelve a armar la vista aunque ya fuera el repo a la vista (se reconectó).
   */
  function showTab(tab, { force = false } = {}) {
    if (tab === active && !force) return;
    const prev = active;
    active = tab;
    source = tab.source;
    layout = tab.layout;
    game = tab.game;
    // la demo no se sigue, solo se mira: al pasar a otro repo se cierra
    if (prev && prev !== tab && prev.demo) removeTab(prev);
    replay.stop(true);
    tv.attract = false;
    tv.lastSwitch = Date.now();
    clearTimeout(filterTimer); // un filtro a medio escribir era para el repo anterior
    tab.unread = 0;
    graph2d.clear();
    graph3d?.clear();
    graph3d?.world?.load(tab.key); // y sus ramas descubiertas en el modo vuelo
    graph3d?.gx?.reset(); // los archivos que se habían pedido eran de otro repo
    followUI(true);
    lowerThird(null);
    // nada de otro repo: ni sus cifras ni su grafo (el Replay lo reproduciría si este no carga)
    lastRender = null;
    clearStats();
    renderGame();
    el.repoInput.value = tab.demo ? '' : nameOf(tab);
    el.repoInput.setCustomValidity('');
    el.branchFilter.value = filterOf(tab);
    renderRepo(source.data.repo);
    saveTabs();
    renderTabs();
    status = tab.status;
    if (source.data.loaded) {
      const { data, L } = drawGraph(true);
      feed.setDefaultBranch(data.repo.defaultBranch);
      renderSummary(data, L);
    } else if (status?.state === 'error') showOverlay('error', status.message, status.nextAt == null);
    else showOverlay('loading', tab.demo ? i18n.msg('overlay.demoLoading') : i18n.msg('overlay.loading', { repo: nameOf(tab) }));
    renderStatus();
  }

  /** Reanuda todo: seguir un repo nuevo (o volver a la demo) saca de la pausa, como siempre. */
  function resume() {
    if (paused) setPaused(false);
  }

  /** Conectar: sigue el repo (además de los que ya se siguen) y lo muestra; si ya se seguía, lo muestra. */
  function connectRepo(input) {
    const parsed = U.parseRepo(input);
    if (!parsed) {
      el.repoInput.setCustomValidity(t('repo.invalid'));
      el.repoInput.reportValidity();
      return;
    }
    let tab = tabs.find((x) => x.key === keyOf(parsed));
    if (tab) {
      // conectarse otra vez a uno que quedó sin conexión es reintentar
      if (tab.status?.state === 'error') tab.source.refreshNow();
    } else {
      if (realTabs().length >= MAX_REPOS) {
        el.repoInput.setCustomValidity(t('repo.limit'));
        el.repoInput.reportValidity();
        return;
      }
      resume();
      tab = addTab(sourceFor(parsed));
      startTab(tab);
    }
    el.repoInput.setCustomValidity('');
    showTab(tab);
  }

  /** La demo: una pestaña más mientras se mira (no se guarda). Si ya estaba, empieza de nuevo. */
  function startDemo() {
    const old = tabs.find((x) => x.demo);
    if (old) removeTab(old, { replace: false });
    resume();
    const tab = addTab(new GB.DemoSource());
    startTab(tab);
    showTab(tab);
  }

  /** Recuerda qué repos se siguen y cuál está a la vista; la URL los lleva también, para compartirla. */
  function saveTabs() {
    const names = realTabs().map(savedName);
    const shown = active && !active.demo ? savedName(active) : null;
    U.store.set('repos', names.length ? names : null);
    U.store.set('repo', shown);
    setUrlRepos(shown ? [shown, ...names.filter((n) => n !== shown)] : names);
  }

  /** Token o profundidad nuevos: cada repo seguido se vuelve a conectar, el de la vista primero. */
  function reconnectAll() {
    resume();
    const order = realTabs().sort((a, b) => (b === active) - (a === active));
    order.forEach((tab, i) => {
      feed.drop(tab.key);
      tab.unread = 0;
      setSource(tab, sourceFor({ host: tab.source.host, owner: tab.source.owner, name: tab.source.name }));
      startTab(tab, i * STAGGER);
    });
    shareQuota();
    if (active && !active.demo) showTab(active, { force: true });
    else renderTabs();
  }

  /* ---------- pestañas ---------- */

  const setText = (node, text) => node.textContent !== text && (node.textContent = text);

  /** Las pestañas se ven con más de un repo; con uno solo, el título del grafo ya dice cuál es. */
  function renderTabs() {
    const box = el.repoTabs;
    box.hidden = tabs.length < 2;
    feed.setMulti(tabs.length > 1);
    tabs.forEach((tab, i) => {
      tab.el ||= makeTabEl(tab);
      // solo se mueve lo que no está en su lugar: mover una pestaña le quitaría el foco
      if (box.children[i] !== tab.el) box.insertBefore(tab.el, box.children[i] || null);
      renderTab(tab);
    });
  }

  function makeTabEl(tab) {
    const node = document.createElement('div');
    node.className = 'rt';
    node.innerHTML = `<button type="button" class="rt-main">
        <span class="rt-dot" aria-hidden="true"></span><span class="rt-name" dir="ltr"></span><span class="rt-n" aria-hidden="true"></span><span class="sr-only rt-sr"></span>
      </button><button type="button" class="rt-close">${GB.Feed.icon('close')}</button>`;
    node.querySelector('.rt-main').addEventListener('click', () => showTab(tab));
    node.querySelector('.rt-close').addEventListener('click', () => closeTab(tab));
    return node;
  }

  /** Estado, nombre y novedades sin ver de una pestaña (cambia solo lo que cambió). */
  function renderTab(tab) {
    const node = tab.el;
    if (!node || !tab.source) return;
    const st = tab.status?.state || 'loading';
    const name = nameOf(tab);
    const stateText = tab.demo && st === 'live' ? t('status.demoLive') : t(STATE_TEXT[st] || 'status.loading');
    const n = tab.unread;
    node.dataset.state = st;
    node.classList.toggle('on', tab === active);
    node.classList.toggle('demo', tab.demo);
    const main = node.firstElementChild;
    if (tab === active) main.setAttribute('aria-current', 'true');
    else main.removeAttribute('aria-current');
    main.title = `${name} · ${stateText}`;
    setText(node.querySelector('.rt-name'), name);
    setText(node.querySelector('.rt-n'), n ? (n > 99 ? '99+' : U.fmtNum(n)) : '');
    // el lector de pantalla oye el estado si no es el normal, y cuántas novedades esperan
    const extra = [st === 'live' ? '' : stateText, n ? t('tabs.unread', { n }) : ''].filter(Boolean).join(', ');
    setText(node.querySelector('.rt-sr'), extra ? `, ${extra}` : '');
    const close = node.querySelector('.rt-close');
    const label = t('tabs.close', { repo: name });
    if (close.getAttribute('aria-label') !== label) {
      close.setAttribute('aria-label', label);
      close.title = label;
    }
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

  /** ?repo=a/b&repo=c/d: los repos seguidos, el de la vista primero. */
  function setUrlRepos(list) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('repo');
      for (const r of list) url.searchParams.append('repo', r);
      history.replaceState(null, '', url);
    } catch {
      /* algunos visores no permiten cambiar la URL */
    }
  }

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

  /** Lo que miran los logros: el estado del repo de ahora (`L`, su layout, si está a la vista). */
  const gameCtx = (acts, data, L) => ({
    openPrs: Math.max(data.totalPulls || 0, data.pulls.size),
    // sin layout: las ramas que ya tienen su historia, que son las que se dibujarían
    liveBranches: L ? L.heads.filter((h) => h.color !== 'ghost').length : [...data.branches.values()].filter((b) => data.commits.has(b.sha)).length,
    recordDay: acts.some((a) => a.kind === 'push') && isRecordDay(data),
  });

  /** Calcula el layout del repo a la vista y dibuja el grafo (salvo durante el Replay). */
  function drawGraph(initial, calm = false) {
    const data = source.view ? source.view() : source.data;
    const L = layout.compute(data);
    lastRender = { data, L };
    // durante el Replay el grafo muestra el pasado; lo nuevo sigue llegando al panel y se dibuja al volver
    if (!replay.active) {
      const gctx = liveCtx(data, initial, calm);
      graph2d.update(L, gctx);
      graph3d?.update(L, gctx);
    }
    return { data, L };
  }

  function renderSummary(data, L) {
    renderRepo(data.repo);
    renderStats(data, L);
    if (!L.nodes.length) showOverlay('empty');
    else hideOverlay();
  }

  /** Novedades de un repo seguido. Cada actividad lleva de qué repo es (el panel junta las de todos);
      las del repo a la vista, además, se dibujan. */
  function onUpdate(tab, { activities, initial, calm }) {
    const name = nameOf(tab);
    for (const a of activities) {
      a.repo = tab.key;
      a.repoName = name;
    }
    if (tab !== active) return onBackground(tab, activities, initial);
    const news = !initial && activities.length > 0;
    // en modo TV lo que pasa ahora manda: el Replay de ambiente deja paso al presente
    if (news && tv.attract && replay.active) replay.stop();
    if (news) tv.lastNews = Date.now();
    const { data, L } = drawGraph(initial, calm);
    feed.setDefaultBranch(data.repo.defaultBranch);
    feed.add(activities, { live: !initial });
    if (news) game.observe(activities, gameCtx(activities, data, L));
    // cada tipo de evento con su efecto, en la vista que esté a la vista
    if (!initial && !replay.active) {
      graph3d?.celebrate(activities);
      graph2d.celebrate(activities);
    }
    renderSummary(data, L);
    renderTab(tab);
  }

  /* en modo TV la pantalla va adonde pasan las cosas: a otro repo seguido con novedades, si el de la
     vista lleva este rato sin ellas (y sin cambiar de repo) */
  const TV_FOLLOW = 45e3;

  /** Novedades de un repo seguido que no está a la vista: al panel, a los avisos y a su pestaña. */
  function onBackground(tab, activities, initial) {
    feed.add(activities, { live: !initial });
    if (initial || !activities.length) return renderTab(tab);
    tab.unread += activities.length;
    const data = tab.source.view ? tab.source.view() : tab.source.data;
    tab.game.observe(activities, gameCtx(activities, data, null));
    renderTab(tab);
    const now = Date.now();
    if (!tv.on || paused || now - tv.lastNews < TV_FOLLOW || now - tv.lastSwitch < TV_FOLLOW) return;
    tv.lastNews = now;
    showTab(tab);
    graph3d?.celebrate(activities);
    graph2d.celebrate(activities);
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
      graph2d.celebrate(acts);
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
      if (!tv.attract) return game?.replayDone();
      // el Replay de ambiente (modo TV) se queda un momento en el final y vuelve al presente
      setTimeout(() => tv.attract && replay.active && !paused && replay.stop(), 6000);
    },
  });

  /* guardar la vista como imagen (js/snapshot.js): la que está a la vista, con el repo y la fecha abajo */
  let snapping = false;
  let snapTimer = 0;
  function snapNote(text) {
    el.snapNote.textContent = text;
    el.snapNote.classList.add('on');
    clearTimeout(snapTimer);
    // al irse se vacía: que el lector de pantalla no encuentre después un aviso viejo
    snapTimer = setTimeout(() => {
      el.snapNote.classList.remove('on');
      el.snapNote.textContent = '';
    }, 3500);
  }

  async function saveImage() {
    if (snapping || !active) return;
    snapping = true;
    el.snapBtn.setAttribute('aria-busy', 'true');
    try {
      const now = Date.now();
      const repo = nameOf(active);
      const caption = [repo, active.demo ? el.repoBadge.textContent : '', `${i18n.fmtDate(now)} ${i18n.fmtTime(now)}`, 'GraphBranch']
        .filter(Boolean)
        .join(' · ');
      const wrap = graph === graph3d ? el.graph3d : el.graph;
      const file = await GB.snapshot.save(wrap, graph, { repo: active.demo ? 'demo' : repo, caption });
      // un destello, como el de una cámara (sin él si se pidió menos movimiento)
      el.graphPanel.classList.remove('snap-flash');
      void el.graphPanel.offsetWidth;
      el.graphPanel.classList.add('snap-flash');
      snapNote(t('snap.done', { file }));
    } catch (err) {
      console.error(err);
      snapNote(t('snap.failed'));
    } finally {
      snapping = false;
      el.snapBtn.removeAttribute('aria-busy');
    }
  }

  function toggleReplay() {
    if (replay.active) return replay.stop();
    if (!lastRender) return;
    graph2d.clear();
    graph3d?.clear();
    if (!replay.start(lastRender.data, feed.itemsOf(active.key))) showLive();
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

  /** Cada repo seguido tiene su juego; solo el del repo a la vista festeja (los demás suman en silencio). */
  function gameHooks(tab) {
    const shown = () => tab === active;
    return {
      onUnlock: (a) => shown() && celebrate(`${a.icon} ${t('ach.' + a.id)}`, i18n.msg(`ach.${a.id}.d`)),
      onLevel: (n) => {
        if (!shown()) return;
        celebrate(i18n.msg('game.levelUp', { n }), i18n.msg('game.levelUpDetail'));
        flashClass(el.gsLevel, 'up');
      },
      onMission: (m) => shown() && celebrate(i18n.msg('game.missionDone'), i18n.msg('mission.' + m.id, { n: m.n })),
      onCombo: (n) => {
        if (!shown() || !game.enabled) return;
        el.combo.textContent = t('game.combo', { n });
        flashClass(el.combo, 'pop');
      },
      onChange: (v) => shown() && renderGame(v),
    };
  }

  /** Logro, nivel o misión: aviso dorado, fuegos artificiales y fanfarria (como mucho una fiesta cada 6 s). */
  let lastParty = 0;
  function celebrate(title, detail) {
    if (!game?.enabled || tv.on) return; // en modo TV, pantalla profesional: sin fiestas
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

  function renderGame(v = game?.view()) {
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

  function renderTrophies(v = game?.view(), pre) {
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
  // la capa de juego se apaga o enciende para todos los repos
  el.gameEnable.addEventListener('change', () => {
    for (const x of tabs) x.game.setEnabled(el.gameEnable.checked);
  });

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
    el.repoBadge.hidden = !repo.demo && !repo.private && repo.host !== 'gitlab';
    el.repoBadge.textContent = repo.demo ? t('badge.demo') : repo.private ? t('badge.private') : 'GitLab';
    el.repoBadge.className = `badge${repo.demo ? ' demo' : ''}`;
    el.repoDesc.textContent = repo.demo ? t('repo.demoDesc') : repo.description || '';
    el.repoDesc.hidden = !el.repoDesc.textContent;
    feed.setBaseTitle(`${full} · GraphBranch`);
    renderTokenBanner();
  }

  function renderTokenBanner() {
    const data = source?.data;
    // el aviso es del token de GitHub: a un proyecto de GitLab no le cambia nada
    const show = data && !data.repo.demo && data.repo.host !== 'gitlab' && !settings.token && data.mode;
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

  /** Cifras en blanco hasta que el repo recién conectado traiga las suyas. */
  function clearStats() {
    for (const [key, node] of Object.entries(el.st)) node.textContent = key.endsWith('Sub') ? '' : '–';
    el.st.branchesSub.title = '';
  }

  function renderLast() {
    const last = active ? feed.lastTime(active.key) : null;
    el.st.last.textContent = last ? U.timeAgo(last) : '–';
    el.st.lastSub.textContent = last ? U.fmtDateTime(last) : t('stats.noEvents');
  }

  /* ---------- estado de conexión ---------- */

  const STATE_TEXT = {
    loading: 'status.loading',
    live: 'status.live',
    limited: 'status.limited',
    paused: 'status.paused',
    error: 'status.error',
  };

  function onStatus(tab, s) {
    const changed = tab.status?.state !== s.state;
    tab.status = s;
    if (changed) renderTab(tab);
    if (tab !== active) return;
    status = s;
    if (s.state === 'error' && !source.data.loaded) {
      const fatal = s.nextAt == null;
      showOverlay('error', s.message, fatal);
    }
    renderStatus();
  }

  function renderStatus() {
    // un repo que todavía no empezó a consultar (los que arrancan juntos esperan su turno)
    const s = status || { state: 'loading', demo: !!active?.demo };
    el.status.dataset.state = s.state;
    const text = s.demo && s.state === 'live' ? t('status.demoLive') : STATE_TEXT[s.state] ? t(STATE_TEXT[s.state]) : s.state;
    // es región viva y esto corre cada segundo: reescribir el mismo texto podría volver a anunciarlo
    if (el.statusText.textContent !== text) el.statusText.textContent = text;
    const now = Date.now();
    let sub = '';
    const secsTo = (at) => i18n.fmtSeconds(Math.max(0, Math.ceil((at - now) / 1000)));
    if (s.state === 'error') {
      sub = s.offline ? t('status.offline') : s.nextAt ? t('status.retryIn', { time: secsTo(s.nextAt) }) : t('status.stopped');
      el.status.title = i18n.text(s.message);
    } else if (s.state === 'paused') {
      sub = t('status.resumeHint');
      el.status.title = '';
    } else if (s.state === 'loading') {
      sub = '';
      el.status.title = '';
    } else {
      const parts = [];
      if (s.lastOk) parts.push(t('status.updated', { ago: U.timeAgo(s.lastOk, now) }));
      if (s.syncing) parts.push(t('status.syncing')); // un ciclo en curso o a punto de empezar
      else if (s.nextAt && !s.demo) parts.push(t('status.nextIn', { time: secsTo(s.nextAt) }));
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
            ${fatal && source?.host !== 'gitlab' ? `<button type="button" class="btn btn-primary" data-ov="settings">${U.esc(t('overlay.openSettings'))}</button>` : ''}
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
    for (const x of tabs) x.source.setPaused(v);
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
    graph3d?.gx?.pokeAmbience(); // el zumbido del espacio arranca o se apaga con el sonido
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
    if (on) (view === '3d' ? el.graph3d : el.graph).focus({ preventScroll: true }); // las flechas funcionan de inmediato
  }

  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('webkitfullscreenchange', onFullscreen);
  el.fullscreenBtn.addEventListener('click', toggleFullscreen);
  el.replayBtn.addEventListener('click', toggleReplay);
  el.snapBtn.addEventListener('click', saveImage);
  el.flyBtn.addEventListener('click', () => graph3d?.flight?.toggle());
  setPressed(el.galaxyBtn, !!graph3d?.galaxy);
  el.galaxyBtn.addEventListener('click', () => graph3d?.setGalaxy(!graph3d.galaxy));
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
  const tv = { on: false, prevView: null, lock: null, locking: false, attract: false, lastNews: 0, lastAttract: 0, lastSwitch: 0, idleTimer: 0 };

  /** Entra o sale del modo TV. `user`: viene de un clic (solo así se puede pedir pantalla completa). */
  function setTV(on, user = false) {
    if (tv.on === on) return;
    tv.on = on;
    const root = document.documentElement;
    // el botón TV (en la barra que el modo esconde) o el de salir (en la barra del modo) tenía el foco
    const lostFocus = (on ? el.tvBtn : el.tvBar).contains(document.activeElement);
    root.classList.toggle('tv', on);
    setPressed(el.tvBtn, on);
    if (on) {
      tv.prevView = view;
      tv.lastNews = tv.lastAttract = Date.now();
      if (graph3d) setView('3d', false);
      feed.sound = false; // en un espacio compartido el sonido llega a todos: se enciende a mano
      graph3d?.flight?.exit(); // la pantalla compartida la lleva el director, no un piloto
      director?.setTV(true);
      director?.setOn(true);
      if (user && fullscreenOK && !fullscreenEl()) requestFs(root);
      tvScale();
      lockScreen();
      // el foco pasa al grafo, donde están los atajos del modo (espacio, F, Esc); no a la barra, que
      // no se escondería mientras tenga el foco
      if (lostFocus || document.activeElement === document.body) (graph3d ? el.graph3d : el.graph).focus({ preventScroll: true });
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
      if (lostFocus) el.tvBtn.focus({ preventScroll: true });
    }
    setPressed(el.soundBtn, feed.sound);
    setPressed(el.tvSound, feed.sound);
    graph3d?.gx?.pokeAmbience(); // el zumbido del espacio sigue al sonido, como con sus botones
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
    if (root.classList.contains('tv-idle')) root.classList.remove('tv-idle'); // corre en cada movimiento del ratón
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
    graph3d?.gx?.pokeAmbience();
  });
  window.addEventListener('resize', tvScale);
  document.addEventListener('visibilitychange', () => !document.hidden && lockScreen());
  // en segundo plano no hay cuadros que bajen los zumbidos (el motor del vuelo y el del espacio): se
  // callan al ocultarse y se vuelven a pedir al volver. Los avisos de actividad siguen sonando.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      feed.synth.engine(0);
      feed.synth.drone(0);
    } else graph3d?.gx?.pokeAmbience();
  });
  for (const type of ['pointermove', 'pointerdown', 'keydown']) document.addEventListener(type, () => tv.on && wake(), { passive: true });
  // en modo TV: espacio pausa todo, F pone la página entera en pantalla completa y Esc sale del modo
  document.addEventListener('keydown', (ev) => {
    if (!tv.on || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // Esc sirve también con el foco en un botón; si el grafo la usó para cerrar una ficha, ya lo marcó
    if (ev.key === 'Escape' && !ev.target.closest?.('input, select, textarea, [contenteditable], dialog')) {
      ev.preventDefault();
      return setTV(false);
    }
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
    if (desktop) desktop.setToken(settings.token).then(showTokenWhere, (err) => console.error('No se pudo guardar el token:', err));
    else U.store.set('token', settings.token || null);
    U.store.set('depth', settings.depth);
    closeSettings();
    if (realTabs().length) reconnectAll();
    else el.tokenBanner.hidden = true;
  });

  /** En la app de escritorio, el aviso de Ajustes dice si el token quedó cifrado ('keychain') o no ('plain'). */
  function showTokenWhere(where) {
    el.tokenWhere.dataset.i18n = where === 'keychain' ? 'settings.tokenWhereKeychain' : 'settings.tokenWherePlain';
    el.tokenWhere.textContent = t(el.tokenWhere.dataset.i18n);
  }

  /** En la app de escritorio, el ícono de la bandeja y su aviso van en el idioma de la página. */
  function sendDesktopLabels() {
    desktop?.setLabels({ show: t('tray.show'), quit: t('tray.quit'), hiddenTitle: t('tray.hiddenTitle'), hiddenBody: t('tray.hiddenBody') });
  }

  async function loadDesktopToken() {
    let { token, where } = await desktop.getToken();
    // la primera versión de escritorio lo dejaba en localStorage, sin cifrar: pasa al llavero y se borra de ahí
    const legacy = U.store.get('token', '');
    if (legacy) {
      if (!token) where = await desktop.setToken((token = legacy));
      U.store.set('token', null);
    }
    settings.token = token;
    showTokenWhere(where);
  }

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
    sendDesktopLabels();
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
    renderTabs();
    if (!source) return;
    // la demo inventa mensajes, incidencias y comentarios en el idioma activo: se reinicia para no mezclarlos
    if (source.data.repo.demo) return startDemo();
    renderRepo(source.data.repo);
    if (lastRender) renderStats(lastRender.data, lastRender.L);
    renderStatus();
    if (overlayState) showOverlay(overlayState.kind, overlayState.message, overlayState.fatal);
  });

  /* ---------- arranque ---------- */

  let urlRepos = [];
  let initialTV = false;
  try {
    const q = new URLSearchParams(location.search);
    // ?repo=a/b&repo=c/d (o separados por comas): los repos a seguir, el primero a la vista
    urlRepos = q.getAll('repo').flatMap((r) => r.split(',')).map((r) => r.trim()).filter(Boolean);
    initialTV = q.has('tv') && !/^(0|false|no|off)$/i.test(q.get('tv'));
  } catch {
    /* sin query string */
  }

  /** Sigue los repos guardados y los de la URL; muestra el de la URL, el último que se miraba o el primero. */
  function start() {
    const saved = U.store.get('repos', null);
    const shown = U.store.get('repo', null);
    const list = Array.isArray(saved) ? saved : typeof shown === 'string' ? [shown] : []; // antes se seguía uno solo
    const parse = (input) => (typeof input === 'string' && U.parseRepo(input)) || null;
    const repos = new Map(); // clave -> repo: los guardados y después los de la URL, sin repetir
    for (const p of [...list, ...urlRepos].map(parse)) if (p && !repos.has(keyOf(p))) repos.set(keyOf(p), p);
    // pasado el tope quedan fuera los guardados del final, no los que pide la URL
    const asked = new Set(urlRepos.map(parse).filter(Boolean).map(keyOf));
    for (const k of [...repos.keys()].reverse()) if (repos.size > MAX_REPOS && !asked.has(k)) repos.delete(k);
    for (const p of [...repos.values()].slice(0, MAX_REPOS)) addTab(sourceFor(p));
    const want = parse(urlRepos[0]) || parse(shown);
    const first = (want && tabs.find((x) => x.key === keyOf(want))) || tabs[0];
    if (!first) startDemo();
    else {
      startTab(first);
      tabs.filter((x) => x !== first).forEach((x, i) => startTab(x, (i + 1) * STAGGER));
      showTab(first);
    }
    if (initialTV) setTV(true); // ?tv=1: pensado para dejar la URL abierta en una pantalla
  }
  if (desktop) {
    sendDesktopLabels();
    loadDesktopToken().catch((err) => console.error('No se pudo leer el token:', err)).finally(start);
  } else start();
})(window.GB);
