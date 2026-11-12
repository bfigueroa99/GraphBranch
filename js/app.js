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
    practiceBtn: $('#practice-btn'),
    rehearseBtn: $('#rehearse-btn'),
    practice: $('#practice'),
    folderBtn: $('#folder-btn'),
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
    viewAgents: $('#view-agents'),
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
    tvAgents: $('#tv-agents'),
    tvAll: $('#tv-all'),
    allTvBtn: $('#all-tv-btn'),
    tvPause: $('#tv-pause'),
    tvSound: $('#tv-sound'),
    tvFs: $('#tv-fs'),
    tvExit: $('#tv-exit'),
    tvBar: $('#tv-bar'),
    lower: $('#lower'),
    healthBtn: $('#health-btn'),
    health: $('#health'),
    healthBody: $('#health-body'),
    agentsBtn: $('#agents-btn'),
    agents: $('#agents'),
    agentsBody: $('#agents-body'),
    agentsOnly: $('#agents-only'),
    agentsGraph: $('#agents-graph'),
    agentsClock: $('#agents-clock'),
    agKey: $('#ag-key'),
    agKeyBody: $('#ag-key-body'),
    agKeyFold: $('#ag-key-fold'),
    agKeyN: $('#ag-key-n'),
    stBit: $('#st-bitacora'),
    stBitLabel: $('#st-bitacora-label'),
    stBitScore: $('#st-bitacora-score'),
    stBitTrend: $('#st-bitacora-trend'),
    stBitSub: $('#st-bitacora-sub'),
    bitacora: $('#bitacora'),
    btEyebrow: $('#bt-eyebrow'),
    btTitle: $('#bt-title'),
    btDek: $('#bt-dek'),
    btWindow: $('#bt-window'),
    btUpdated: $('#bt-updated'),
    btBody: $('#bt-body'),
    btTitleInput: $('#bt-title-input'),
    btCloseBtn: $('#bt-close-btn'),
    btCloseHelp: $('#bt-close-help'),
    btOutText: $('#bt-out-text'),
    btUndo: $('#bt-undo'),
    prview: $('#prview'),
    prviewBody: $('#prview-body'),
    prviewTitle: $('#prview-title'),
    textview: $('#textview'),
    textviewBody: $('#textview-body'),
    textviewFilter: $('#textview-filter'),
    textviewLive: $('#textview-live'),
    search: $('#search'),
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
    main: $('.main'),
    diffPanel: $('#diff-panel'),
    repoTabs: $('#repo-tabs'),
    tabsRow: $('#tabs-row'),
    allTab: $('#all-tab'),
    allN: $('#all-n'),
    allPanel: $('#all-panel'),
    allSum: $('#all-sum'),
    app: $('.app'),
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
    gitlabTokenInput: $('#gitlab-token-input'),
    gitlabTokenToggle: $('#gitlab-token-toggle'),
    gitlabTokenWhere: $('#gitlab-token-where'),
    codebergTokenInput: $('#codeberg-token-input'),
    codebergTokenToggle: $('#codeberg-token-toggle'),
    codebergTokenWhere: $('#codeberg-token-where'),
    bitbucketTokenInput: $('#bitbucket-token-input'),
    bitbucketTokenToggle: $('#bitbucket-token-toggle'),
    bitbucketTokenWhere: $('#bitbucket-token-where'),
    azureTokenInput: $('#azure-token-input'),
    azureTokenToggle: $('#azure-token-toggle'),
    azureTokenWhere: $('#azure-token-where'),
    bbdcTokenField: $('#bbdc-token-field'),
    bbdcTokenInput: $('#bbdc-token-input'),
    bbdcTokenToggle: $('#bbdc-token-toggle'),
    bbdcTokenWhere: $('#bbdc-token-where'),
    forgeTokenField: $('#forge-token-field'),
    forgeTokenInput: $('#forge-token-input'),
    forgeTokenToggle: $('#forge-token-toggle'),
    forgeTokenWhere: $('#forge-token-where'),
    token2Owner: $('#token2-owner'),
    token2Input: $('#token2-input'),
    token2Toggle: $('#token2-toggle'),
    hooksBox: $('#hooks-box'),
    hooksList: $('#hooks-list'),
    depth: $('#depth'),
    marks: $('#marks'),
    settingsCancel: $('#settings-cancel'),
  };

  /* los tokens (el de GitHub y el de GitLab): en la web, en localStorage; en la app de escritorio,
     cifrados con el llavero del sistema (electron/preload.js expone GBDesktop) y se leen antes de
     conectar, ver el arranque. Cada uno va solo a la fuente de su servicio (sourceFor). */
  const desktop = window.GBDesktop;
  /** ?api=https://host/api/v3: los repos de GitHub salen de un GitHub Enterprise Server en vez de github.com.
      Solo https, y la página solo llega a hosts que su CSP nombra (ver README); sin eso, no hay efecto. */
  const API_URL = (() => {
    try {
      const v = new URLSearchParams(location.search).get('api') || '';
      return GB.GitHubSource.endpoints(v) ? v : '';
    } catch {
      return '';
    }
  })();
  /** ?gitlab=https://gitlab.miempresa.com: los proyectos de GitLab salen de un GitLab propio en vez de gitlab.com.
      Mismas reglas que ?api=: solo https y solo si su CSP nombra ese host. Se escriben como "gitlab:grupo/proyecto". */
  const GITLAB_URL = (() => {
    try {
      const v = new URLSearchParams(location.search).get('gitlab') || '';
      return GB.GitLabSource.endpoints(v) ? v : '';
    } catch {
      return '';
    }
  })();
  U.gitlabBase = GITLAB_URL; // para que parseRepo reconozca las URLs de ese GitLab
  /** ?forge=https://git.miempresa.com: un Forgejo o Gitea propio, además de codeberg.org. Mismas reglas que ?gitlab=: solo
      https y solo si su CSP nombra ese host. Se escriben como "forgejo:dueño/repo" o con su URL. */
  const FORGE_URL = (() => {
    try {
      const v = new URLSearchParams(location.search).get('forge') || '';
      return GB.CodebergSource.endpoints(v) ? v : '';
    } catch {
      return '';
    }
  })();
  U.forgeBase = FORGE_URL;
  /** ?bitbucket=https://git.miempresa.com: un Bitbucket Data Center o Server propio. Mismas reglas que ?forge=. Se escriben como "bitbucketdc:CLAVE/repo" o con su URL. */
  const BITBUCKET_URL = (() => {
    try {
      const v = new URLSearchParams(location.search).get('bitbucket') || '';
      return GB.BitbucketServerSource.endpoints(v) ? v : '';
    } catch {
      return '';
    }
  })();
  U.bitbucketBase = BITBUCKET_URL;
  const EMBED = document.documentElement.classList.contains('embed'); // ?embed=1, ver i18n.js
  const embedBranch = EMBED ? GB.embedOptions(location.search)?.branch || '' : ''; // &branch=nombre: solo esa rama y la por defecto
  const embedPr = EMBED ? !!GB.embedOptions(location.search)?.pr : false; // &pr=1: solo las ramas con un PR abierto
  const embedMax = EMBED ? GB.embedOptions(location.search)?.max || 0 : 0; // &max=N: tope de ramas de la capa
  const settings = {
    token: desktop ? '' : U.secret.get('token', ''),
    gitlabToken: desktop ? '' : U.secret.get('gitlabToken', ''),
    codebergToken: desktop ? '' : U.secret.get('codebergToken', ''),
    bitbucketToken: desktop ? '' : U.secret.get('bitbucketToken', ''),
    azureToken: desktop ? '' : U.secret.get('azureToken', ''),
    // el de un Bitbucket propio, aparte y atado a su dirección: si ?bitbucket= es otro, no se usa (ni se pisa hasta guardar Ajustes)
    bbdcToken: desktop ? '' : GB.BitbucketServerSource.unpack(U.secret.get('bbdcToken', ''), BITBUCKET_URL),
    // el de un Forgejo/Gitea propio, igual: aparte y atado a su dirección (?forge=)
    forgeToken: desktop ? '' : GB.CodebergSource.unpack(U.secret.get('forgeToken', ''), FORGE_URL),
    // la segunda cuenta de GitHub: un token atado a un dueño u organización, solo para sus repos
    account2: desktop ? { owner: '', token: '' } : GB.GitHubSource.unpack2(U.secret.get('account2', '')),
    depth: U.store.get('depth', 40),
    marks: U.store.get('marks', true) !== false, // tags y entornos de despliegue (2 consultas más por repo de GitHub)
  };
  U.store.set('maxBranches', null); // ya no hay tope: se muestran todas las ramas

  /* repos seguidos: cada uno en su pestaña, con su fuente, que sigue consultando GitHub aunque no
     esté a la vista; así sus novedades llegan al panel de actividad, a los avisos y a la pestaña.
     El grafo, las cifras, el Replay y los logros que se ven son del repo a la vista (`active`). */
  const MAX_REPOS = 20;
  const tabs = []; // { key, demo, source, layout, game, unread, status, el, startTimer }
  let active = null;
  let source = null; // la fuente del repo a la vista
  let layout = null; // y su layout (colores y carriles estables)
  let game = null; // y sus logros
  let status = null;
  let paused = false;
  let allOn = false; // la vista conjunta: todos los repos a la vez, cada uno en su tarjeta (ver overview.js)
  let diffTab = null; // el repo del commit cuyos cambios se ven (en la vista conjunta, puede no ser `active`)
  let diffKey = null; // y de qué repo son los cambios guardados en el panel

  /* dos vistas del mismo layout: 3D (Three.js) y 2D (SVG) */
  function followUI(v) {
    el.followBtn.dataset.following = String(!!v);
    el.followBtn.querySelector('.follow-label').textContent = v ? t('follow.live') : t('follow.jump');
    el.followBtn.title = v ? t('follow.live.title') : t('follow.jump.title');
  }
  const graph2d = new GB.Graph(el.graph, {
    onFollowChange: (v) => graph === graph2d && followUI(v),
    onTogglePin: (name) => togglePin(name),
    onBranchView: (name, how) => onBranchView(name, how),
    onDiff: (sha) => openDiff(sha),
    onPrView: (n) => active.source.prDetail(n),
    diffing: () => diffView.isOpen,
  });
  let graph3d = null;
  try {
    if (GB.Graph3D?.supported()) {
      graph3d = new GB.Graph3D(el.graph3d, {
        onFollowChange: (v) => graph === graph3d && followUI(v),
        onTogglePin: (name) => togglePin(name),
        onBranchView: (name, how) => onBranchView(name, how),
        onDiff: (sha) => openDiff(sha),
        onPrView: (n) => active.source.prDetail(n),
        diffing: () => diffView.isOpen,
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
        // y cada planeta se puede editar en la rama de su galaxia (ver editor.js)
        canEdit: () => canEditTab(active),
        onEditFile: (path, branch) => openEditor(active, path, { branch }),
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
  let agentsOn = false; // la vista de agentes, en el lugar del grafo (ver setAgentsView)

  function setView(v, save = true) {
    if (v === '3d' && !graph3d) v = '2d';
    if (agentsOn) setAgentsView(false, { save }); // 3D o 2D vuelven al grafo
    view = v;
    graph = v === '3d' ? graph3d : graph2d;
    el.graph3d.hidden = v !== '3d';
    el.graph.hidden = v !== '2d';
    el.graph.parentElement.dataset.view = v; // el Replay acomoda su fecha según la vista
    graph3d?.setActive(v === '3d' && !allOn && !agentsOn); // con la vista conjunta o la de agentes el grafo no se ve: el 3D no dibuja
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
    if (replay.active && replayFrame) graph.update(replayFrame.L, { ...replayFrame.gctx, initial: true }); // la vista oculta no se actualizó
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

  const practice = new GB.PracticePanel(el.practice, {
    onPick: (i, custom, solution) => startPractice(i, custom, solution),
    onMake: (spec) => startPractice(null, GB.gitsim.customExercise(spec)),
    onRehearse: (data) => startRehearsal(data),
    urlFor: (source, solution = false) => {
      const code = source.custom ? GB.gitsim.encodeExercise(source.custom.spec, { solution }) : String(source.index + 1);
      if (!code) return null;
      const url = new URL(location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('practice', code);
      if (solution && source.custom?.solution?.length) url.searchParams.set('solution', '1');
      return url.href;
    },
  });

  const feed = new GB.Feed({
    list: $('#feed'),
    empty: $('#feed-empty'),
    chips: $('#chips'),
    toasts: $('#toasts'),
    count: $('#feed-count'),
    onSelect: (a) => {
      // en la vista conjunta, a la tarjeta de su repo y a su commit o su rama, sin salir de ella
      if (allOn && a.repo != null) return overview.focus(a.repo, { sha: a.sha, branch: a.branch });
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
    onLive: (n) => feedPanel.arrived(n),
  });

  /* ---------- el panel de actividad: su borde se arrastra (o se mueve con las flechas) y se pliega a una franja ----------
     Los dos se recuerdan en este navegador. Solo en pantallas anchas: en una columna el panel va debajo del grafo. */
  const feedPanel = (() => {
    const grip = $('#feed-resize');
    const fold = $('#feed-fold');
    const unseenEl = $('#feed-unseen');
    const MIN = 280;
    const MAX = 720;
    const DEF = 370;
    const GRAPH_MIN = 420; // lo que el grafo conserva siempre a su lado
    let unseen = 0;
    const rtl = () => document.documentElement.dir === 'rtl';
    const maxNow = () => Math.max(MIN, Math.min(MAX, el.main.clientWidth - 12 - GRAPH_MIN));
    const shownWidth = () => Math.round($('#feed-panel').getBoundingClientRect().width);
    const folded = () => el.main.classList.contains('feed-folded');
    /** Ancho pedido, dentro de lo que cabe; `save` lo recuerda (el de siempre no se guarda). */
    function setWidth(w, save) {
      const v = Math.round(Math.min(maxNow(), Math.max(MIN, w)));
      el.main.style.setProperty('--feed-w', v + 'px');
      grip.setAttribute('aria-valuemax', String(maxNow()));
      grip.setAttribute('aria-valuenow', String(v));
      if (save) U.store.set('feedWidth', v === DEF ? null : v);
    }
    function setFolded(on, save) {
      el.main.classList.toggle('feed-folded', on);
      fold.setAttribute('aria-expanded', String(!on));
      if (!on) {
        unseen = 0;
        unseenEl.hidden = true;
      }
      if (save) U.store.set('feedFolded', on || null);
    }
    const saved = Number(U.store.get('feedWidth', 0));
    if (saved >= MIN && saved <= MAX) {
      el.main.style.setProperty('--feed-w', saved + 'px'); // sin recortar todavía: el CSS ya lo deja en la mitad como mucho
      grip.setAttribute('aria-valuenow', String(saved));
    }
    if (U.store.get('feedFolded', false) === true) setFolded(true, false);

    fold.addEventListener('click', () => setFolded(!folded(), true));
    grip.addEventListener('dblclick', () => setWidth(DEF, true));
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const x0 = ev.clientX;
      const w0 = shownWidth();
      let want = w0;
      let frame = 0;
      grip.setPointerCapture?.(ev.pointerId);
      grip.classList.add('dragging');
      document.documentElement.classList.add('resizing-feed');
      // un cambio por cuadro: el grafo se redibuja con cada ancho nuevo
      const move = (e) => {
        want = w0 + (x0 - e.clientX) * (rtl() ? -1 : 1);
        frame ||= requestAnimationFrame(() => ((frame = 0), setWidth(want, false)));
      };
      const up = () => {
        cancelAnimationFrame(frame);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        grip.classList.remove('dragging');
        document.documentElement.classList.remove('resizing-feed');
        setWidth(want, false);
        setWidth(shownWidth(), true); // lo que de verdad quedó (el CSS lo topa en la mitad)
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    // teclado (patrón de separador de WAI-ARIA): flechas de a 24 px (con Mayús, de a 96), Inicio y Fin a los topes,
    // Enter pliega el panel
    grip.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const step = ev.shiftKey ? 96 : 24;
      const wider = rtl() ? 'ArrowRight' : 'ArrowLeft';
      const narrower = rtl() ? 'ArrowLeft' : 'ArrowRight';
      if (ev.key === wider) setWidth(shownWidth() + step, true);
      else if (ev.key === narrower) setWidth(shownWidth() - step, true);
      else if (ev.key === 'Home') setWidth(MIN, true);
      else if (ev.key === 'End') setWidth(maxNow(), true);
      else if (ev.key === 'Enter') {
        setFolded(true, true);
        fold.focus();
      } else return;
      ev.preventDefault();
    });
    return {
      /** Llegó actividad en vivo: con el panel plegado, la franja la cuenta. */
      arrived(n) {
        if (!folded() || !n) return;
        unseen += n;
        unseenEl.textContent = '+' + U.fmtNum(Math.min(unseen, 999));
        unseenEl.hidden = false;
      },
    };
  })();

  /* ---------- los cambios de cada commit (ver diff.js): un panel junto al grafo para pasar de un commit a otro ---------- */
  const diffView = GB.diff.mount(el.diffPanel, {
    text: (k, p) => t(k, p),
    ago: (ms) => U.timeAgo(ms),
    dateTime: (ms) => U.fmtDateTime(ms),
    num: (n) => U.fmtNum(n),
    avatar: (a) => U.avatarHTML(a, 22),
    errText: (err) => i18n.text(err?.msg || err?.message || ''),
    load: (sha) => (diffSrc()?.commitDiff ? diffSrc().commitDiff(sha) : null),
    cheap: () => !!diffSrc()?.diffCheap?.(),
    data: () => diffSrc().data,
    chainOf: (sha) => diffLayout()?.nodeOf.get(sha)?.chain || null,
    onFocus: (sha) => {
      diffGraph()?.focusSha?.(sha);
      selectCommit(sha);
    },
    onWide: (on) => el.main.classList.toggle('diff-wide', on && diffView.isOpen),
    canEdit: () => canEditTab(diffTab || active),
    onEdit: (path, sha) => openEditor(diffTab || active, path, { sha }),
    // el filtro por ruta es del repo a la vista: no existe en la vista conjunta ni en una fuente que no lo sepa
    canHistory: () => !allOn && typeof source?.commitsByPath === 'function' && diffSrc() === source,
    onHistory: (path) => fileHistory(path),
    // «Quién lo tocó»: los últimos commits del archivo desde ese commit, de la fuente del diff
    canBlame: () => typeof diffSrc()?.fileLog === 'function',
    fileLog: (path, sha) => diffSrc().fileLog(path, sha),
    fileBlame: (path, sha) => (typeof diffSrc()?.fileBlame === 'function' ? diffSrc().fileBlame(path, sha) : null),
    onClose: () => {
      el.main.classList.remove('diffing', 'diff-wide');
      selectCommit(null);
      // el foco que estaba en el panel vuelve al grafo (en la vista conjunta, al de la tarjeta de ese repo)
      const back = allOn ? overview.graphOf(diffTab?.key)?.wrap : graph === graph3d ? el.graph3d : el.graph;
      diffTab = null;
      if (el.diffPanel.contains(document.activeElement) || document.activeElement === document.body) back?.focus?.({ preventScroll: true });
    },
  });
  /** ¿Se pueden ver los cambios de los commits de este repo? */
  const canDiffTab = (tab) => !!tab?.source?.commitDiff && !EMBED;
  const canDiff = () => canDiffTab(active);
  /* los cambios que se ven son de `diffTab`: su fuente, su grafo (el de la vista o el de su tarjeta) y su layout */
  const diffSrc = () => (diffTab || active)?.source;
  const diffGraph = () => (allOn ? overview.graphOf(diffTab?.key) : graph);
  const diffLayout = () => (allOn ? overview.layoutOf(diffTab?.key) : lastRender?.L);
  const selectCommit = (sha) => {
    if (allOn) return overview.select(diffTab?.key, sha);
    graph2d.select(sha);
    graph3d?.select(sha);
  };

  /** Abre los cambios de un commit (el botón «Ver cambios» de su ficha), del repo a la vista o, en la vista
      conjunta, del de su tarjeta. El panel toma el lugar del de actividad; el grafo se angosta y, ya con su
      ancho nuevo, va hasta el commit. */
  function openDiff(sha, tab = active) {
    if (!canDiffTab(tab) || tv.on) return;
    if (diffKey !== tab.key) diffView.reset(); // los cambios que se veían (o se guardaron) eran de otro repo
    diffKey = tab.key;
    diffTab = tab;
    diffGraph()?.unpin?.();
    const was = el.main.classList.contains('diffing');
    el.main.classList.add('diffing');
    el.main.classList.toggle('diff-wide', diffView.wide);
    if (!diffView.open(sha, { focusGraph: was })) return;
    if (!was) {
      selectCommit(sha);
      setTimeout(() => diffView.sha === sha && diffGraph()?.focusSha?.(sha), 60);
    }
    el.diffPanel.querySelector('#diff-title').focus({ preventScroll: true });
    // en pantallas angostas el panel va debajo del grafo
    if (window.matchMedia?.('(max-width: 860px)').matches) el.diffPanel.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- editar el código (ver editor.js): un archivo de una rama, guardado como un commit en ella ---------- */

  let editTab = null; // el repo del archivo que se edita
  /** ¿Se pueden editar los archivos de este repo? (GitHub, GitLab, Codeberg y la demo; no la práctica ni la capa embebida) */
  const canEditTab = (tab) => !!tab?.source?.canEdit?.() && !EMBED && !tab.source.data.repo.practice;
  /** El campo de Ajustes del token que escribe en el servicio de ese repo. */
  const tokenFieldOf = (tab) => ({ gitlab: el.gitlabTokenInput, codeberg: el.codebergTokenInput, azure: el.azureTokenInput })[tab?.source?.host] || el.tokenInput;
  const editor = GB.editor.mount($('#editor'), {
    text: (k, p) => t(k, p),
    num: (n) => U.fmtNum(n),
    errText: (err) => i18n.text(err?.msg || err?.message || ''),
    repo() {
      const d = editTab?.source?.data;
      if (!d) return null;
      const def = d.repo.defaultBranch;
      // la rama por defecto primero; las demás por nombre
      const branches = [...d.branches.keys()].sort((a, b) => (b === def) - (a === def) || a.localeCompare(b));
      return { name: nameOf(editTab), branches, defaultBranch: def };
    },
    read: (q) => editTab.source.readFile(q),
    write: (q) => editTab.source.writeFile(q),
    canWrite: () => {
      const why = editTab?.source?.canWrite?.();
      return why ? t(why) : null;
    },
    // el commit nuevo llega al grafo en el próximo ciclo: se adelanta (la demo ya lo dibujó)
    onSaved: () => !editTab?.demo && editTab?.source?.refreshNow?.(),
    onSettings: () => openSettings(tokenFieldOf(editTab)),
  });

  /** Abre el editor con un archivo del repo de `tab`: en la rama que se diga, la del commit que se veía o la por defecto. */
  function openEditor(tab, path, { sha = null, branch = null } = {}) {
    if (!canEditTab(tab) || tv.on) return;
    editTab = tab;
    const chain = sha ? (tab === diffTab ? diffLayout() : lastRender?.L)?.nodeOf.get(sha)?.chain : null;
    const onBranch = chain?.startsWith('b:') ? chain.slice(2) : null;
    const want = [branch, onBranch].find((b) => b && tab.source.data.branches.has(b)) || tab.source.data.repo.defaultBranch;
    editor.open({ path, branch: want });
  }

  /* ---------- repos seguidos y fuente de datos ---------- */

  const OWNER_REFRESH = 30 * 60 * 1000; // cada cuánto se renueva la lista de una organización seguida
  const OWNER_SEEN_MAX = 300;
  const followedOwners = (() => {
    const v = U.store.get('owners', null); // organización -> nombres de repos ya vistos en su lista
    const out = {};
    if (v && typeof v === 'object') for (const [k, names] of Object.entries(v)) if (U.parseOwner('@' + k) && Array.isArray(names)) out[k] = names.filter((n) => typeof n === 'string');
    return out;
  })();
  const STAGGER = 700; // los repos que arrancan juntos, escalonados: GitHub no recibe todo a la vez
  /** Clave de un repo (de su fuente o de { owner, name }): con ella se guarda lo suyo (fijadas, filtro, logros). */
  /** Los proyectos de GitLab llevan "gitlab:" delante (en la clave, en lo que se guarda y en la URL). */
  const hostPrefix = (src) => (src.host === 'gitlab' ? 'gitlab:' : src.host === 'codeberg' ? 'codeberg:' : src.host === 'forgejo' ? 'forgejo:' : src.host === 'bitbucket' ? 'bitbucket:' : src.host === 'bitbucketdc' ? 'bitbucketdc:' : src.host === 'azure' ? 'azure:' : src.host === 'local' ? 'local:' : '');
  /** Los servicios que no son GitHub, con el nombre que lleva su etiqueta. */
  const FORGES = { gitlab: 'GitLab', codeberg: 'Codeberg', forgejo: 'Forgejo', bitbucket: 'Bitbucket', bitbucketdc: 'Bitbucket', azure: 'Azure DevOps' };
  /** Las claves de un GitLab propio llevan su host: lo guardado de `grupo/proyecto` en gitlab.com no se mezcla con el suyo. */
  const keyPrefix = (src) =>
    src.host === 'gitlab' && GITLAB_URL ? `gitlab@${new URL(GITLAB_URL).host}:` : src.host === 'forgejo' && FORGE_URL ? `forgejo@${new URL(FORGE_URL).host}:` : src.host === 'bitbucketdc' && BITBUCKET_URL ? `bitbucketdc@${new URL(BITBUCKET_URL).host}:` : hostPrefix(src);
  const keyOf = (src) => `${keyPrefix(src)}${src.owner || 'demo'}/${src.name || ''}`.toLowerCase();
  /** Nombre a la vista (el del servicio, ya cargado) y el escrito, que es el que se guarda (de él sale la clave). */
  const nameOf = (tab) => `${tab.source.data.repo.owner}/${tab.source.data.repo.name}`;
  const savedName = (tab) => `${hostPrefix(tab.source)}${tab.source.owner}/${tab.source.name}`;
  const realTabs = () => tabs.filter((x) => !x.demo);
  const filterOf = (tab) => (tab.demo ? tab.source.filter || '' : U.store.get('filter:' + tab.key, ''));

  /** La fuente de un repo de GitHub, de un proyecto de GitLab o de un repo de Codeberg, con lo que se recuerda de él: su
      filtro y sus ramas fijadas. El token de GitHub va solo a la fuente de GitHub, y el de GitLab,
      el de Codeberg y el de Bitbucket, cada uno solo a la suya, y el de un Bitbucket propio solo a ese servidor (un Forgejo
      propio no recibe ninguno). */
  function sourceFor({ host, owner, name }) {
    const key = keyOf({ host, owner, name });
    const remembered = { depth: settings.depth, marks: settings.marks, filter: U.store.get('filter:' + key, ''), pins: U.store.get('pins:' + key, []) };
    if (host === 'local') return new GB.LocalGitSource({ id: owner, name, ...remembered });
    if (host === 'azure') return new GB.AzureSource({ owner, name, token: settings.azureToken, ...remembered });
    if (host === 'bitbucketdc') return new GB.BitbucketServerSource({ owner, name, webUrl: BITBUCKET_URL, serverToken: settings.bbdcToken, ...remembered });
    if (host === 'bitbucket') return new GB.BitbucketSource({ owner, name, token: settings.bitbucketToken, ...remembered });
    if (host === 'codeberg') return new GB.CodebergSource({ owner, name, token: settings.codebergToken, ...remembered });
    if (host === 'forgejo') return new GB.CodebergSource({ owner, name, webUrl: FORGE_URL, avatars: desktop, serverToken: settings.forgeToken, ...remembered });
    if (host === 'gitlab') return new GB.GitLabSource({ path: `${owner}/${name}`, token: settings.gitlabToken, webUrl: GITLAB_URL, avatars: desktop, ...remembered });
    return new GB.GitHubSource({ owner, name, token: GB.GitHubSource.tokenFor(owner, settings.token, settings.account2), apiUrl: API_URL, ...remembered });
  }

  /** Suma una pestaña al final, con su fuente, sin mostrarla ni arrancarla. */
  function addTab(src) {
    const tab = { key: keyOf(src), demo: !!src.data.repo.demo, alias: '', source: null, layout: null, game: null, unread: 0, status: null, el: null, startTimer: 0 };
    if (!tab.demo) tab.alias = U.cleanAlias(U.store.get('alias:' + tab.key, '')); // el alias es de este navegador, por repo
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
      clearPathFilter();
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
    if (diffKey === tab.key) diffView.reset(); // los cambios abiertos (o guardados) eran suyos
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
    pruneOwners();
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
    clearPathFilter();
    authorFilter = initialAuthor || U.store.get('author:' + tab.key, ''); // ?author=ana manda sobre lo guardado, solo al abrir
    initialAuthor = '';
    setUrlParam('author', authorFilter);
    firstParentOn = initialFirstParent ?? U.store.get('firstparent:' + tab.key, false) === true; // ?firstparent=1 manda sobre lo guardado, solo al abrir
    initialFirstParent = null;
    setUrlParam('firstparent', firstParentOn ? '1' : '');
    $('#graph-firstparent').checked = firstParentOn;
    branchView = initialBranchView || loadBranchView(tab.key); // la URL manda sobre lo guardado, solo al abrir
    if (initialBranchView) U.store.set('bview:' + tab.key, branchView);
    initialBranchView = null;
    setBranchViewUrl();
    syncFiltered();
    layout = tab.layout;
    game = tab.game;
    // la demo no se sigue, solo se mira: al pasar a otro repo se cierra
    if (prev && prev !== tab && prev.demo) removeTab(prev);
    replay.stop(true);
    diffView.reset(); // los cambios que se veían eran de otro repo
    tv.attract = false;
    tv.lastSwitch = Date.now();
    clearTimeout(filterTimer); // un filtro a medio escribir era para el repo anterior
    tab.unread = 0;
    graph2d.clear();
    graph3d?.clear();
    paintAgentGraph(); // la leyenda de las interacciones ya es la del repo nuevo (con lo que tenga cargado)
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
    practice.attach(source);
    if (!source.custom) {
      setUrlParam('practice', null);
      setUrlParam('solution', null);
    }
    saveTabs();
    renderTabs();
    status = tab.status;
    if (source.data.loaded) {
      const { data, L } = drawGraph(true);
      feed.setDefaultBranch(data.repo.defaultBranch);
      renderSummary(data, L);
      if (initialText && L.nodes.length) startUrlText();
      if (initialPr && L.nodes.length) startUrlPr();
      if (initialQuery && L.nodes.length) startUrlQuery();
      if (initialPath && L.nodes.length) startUrlPath(); // la demo y los repos ya cargados no pasan por onUpdate
      if (initialConflicts && L.nodes.length) startUrlConflicts();
    } else if (status?.state === 'error') showOverlay('error', status.message, status.nextAt == null);
    else showOverlay('loading', tab.demo ? i18n.msg('overlay.demoLoading') : i18n.msg('overlay.loading', { repo: nameOf(tab) }));
    renderStatus();
  }

  /** Reanuda todo: seguir un repo nuevo (o volver a la demo) saca de la pausa, como siempre. */
  function resume() {
    if (paused) setPaused(false);
  }

  /** El aviso del campo del repo (vacío: ninguno). */
  function repoNote(text) {
    el.repoInput.setCustomValidity(text);
    if (text) el.repoInput.reportValidity();
  }

  /** Conectar: sigue el repo (además de los que ya se siguen) y lo muestra; si ya se seguía, lo muestra.
      Con org:nombre o @usuario, los repos de esa organización o ese usuario (connectOwner). */
  function connectRepo(input) {
    const parsed = U.parseRepo(input);
    if (!parsed) {
      const grp = U.parseGroup(input);
      if (grp) return connectGroup(grp.group);
      const who = U.parseOwner(input);
      if (who) return connectOwner(who.owner);
      return repoNote(t('repo.invalid'));
    }
    let tab = tabs.find((x) => x.key === keyOf(parsed));
    if (tab) {
      // conectarse otra vez a uno que quedó sin conexión es reintentar
      if (tab.status?.state === 'error') tab.source.refreshNow();
    } else {
      if (realTabs().length >= MAX_REPOS) return repoNote(t('repo.limit'));
      resume();
      tab = addTab(sourceFor(parsed));
      startTab(tab);
    }
    repoNote('');
    showTab(tab);
  }

  /**
   * org:nombre o @usuario: sigue sus repos de push más reciente (sin forks ni archivados), cada uno en
   * su pestaña, hasta el tope, y muestra el más reciente. La lista se arma al conectar (una o dos
   * consultas a GitHub); lo que se guarda y comparte son los repos, como si se hubieran escrito uno a uno.
   */
  async function connectOwner(owner, { refresh = false } = {}) {
    if (realTabs().length >= MAX_REPOS) return refresh ? undefined : repoNote(t('repo.limit'));
    if (!refresh) el.repoForm.setAttribute('aria-busy', 'true');
    let list;
    try {
      list = await GB.GitHubSource.ownerRepos(owner, { token: GB.GitHubSource.tokenFor(owner, settings.token, settings.account2), apiUrl: API_URL });
    } catch (err) {
      return refresh ? undefined : repoNote(i18n.text(err.msg || err.message));
    } finally {
      if (!refresh) el.repoForm.removeAttribute('aria-busy');
    }
    if (!list.length) return refresh ? undefined : repoNote(t('owner.empty', { owner }));
    // se dejó de seguir mientras llegaba la lista (se cerró su último repo): no se guarda de nuevo ni reabre nada
    if (refresh && !followedOwners[owner]) return;
    // la organización queda seguida: lo que ya se vio de su lista no vuelve a avisar como nuevo
    const seen = new Set(followedOwners[owner]);
    followedOwners[owner] = list.map((p) => p.name).concat([...seen]).filter((n, i, a) => a.indexOf(n) === i).slice(0, OWNER_SEEN_MAX);
    U.store.set('owners', followedOwners);
    const fresh = list.filter((p) => !tabs.some((x) => x.key === keyOf(p)) && (!refresh || !seen.has(p.name)));
    if (refresh) {
      const room = fresh.slice(0, Math.max(0, MAX_REPOS - realTabs().length));
      if (!room.length) return;
      resume();
      room.forEach((p, i) => startTab(addTab(sourceFor(p)), i * STAGGER));
      saveTabs();
      renderTabs();
      feed.toast({ kind: 'other', title: i18n.msg('owner.followed', { owner }), detail: room.map((p) => p.name).join(', '), time: Date.now() });
      return;
    }
    // el tope se mira otra vez: mientras llegaba la lista pudieron sumarse otros repos
    const add = fresh.slice(0, Math.max(0, MAX_REPOS - realTabs().length));
    if (fresh.length && !add.length) return repoNote(t('repo.limit'));
    resume();
    add.forEach((p, i) => startTab(addTab(sourceFor(p)), i * STAGGER));
    repoNote('');
    // a la vista, el de push más reciente (ya seguido o recién sumado)
    showTab(list.map((p) => tabs.find((x) => x.key === keyOf(p))).find(Boolean));
    if (!add.length) return; // ya se seguían todos
    const more = fresh.length > add.length ? t('owner.limited', { owner, max: MAX_REPOS }) : '';
    const detail = [add.map((p) => p.name).join(', '), more].filter(Boolean).join(' · ');
    feed.toast({ kind: 'other', title: i18n.msg('owner.followed', { owner }), detail, time: Date.now() });
  }

  /**
   * group:ruta: sigue los proyectos de un grupo de GitLab (con sus subgrupos) de actividad más reciente,
   * cada uno en su pestaña, hasta el tope. A diferencia de org:nombre no queda seguido: la lista se
   * arma una vez, al conectar, y lo que se guarda y comparte son los proyectos.
   */
  async function connectGroup(group) {
    if (realTabs().length >= MAX_REPOS) return repoNote(t('repo.limit'));
    el.repoForm.setAttribute('aria-busy', 'true');
    let list;
    try {
      list = await GB.GitLabSource.groupProjects(group, { token: settings.gitlabToken, webUrl: GITLAB_URL });
    } catch (err) {
      return repoNote(i18n.text(err.msg || err.message));
    } finally {
      el.repoForm.removeAttribute('aria-busy');
    }
    if (!list.length) return repoNote(t('owner.empty', { owner: group }));
    const fresh = list.filter((p) => !tabs.some((x) => x.key === keyOf(p)));
    const add = fresh.slice(0, Math.max(0, MAX_REPOS - realTabs().length));
    if (fresh.length && !add.length) return repoNote(t('repo.limit'));
    resume();
    add.forEach((p, i) => startTab(addTab(sourceFor(p)), i * STAGGER));
    repoNote('');
    showTab(list.map((p) => tabs.find((x) => x.key === keyOf(p))).find(Boolean));
    if (!add.length) return;
    saveTabs();
    renderTabs();
    const more = fresh.length > add.length ? t('owner.limited', { owner: group, max: MAX_REPOS }) : '';
    feed.toast({ kind: 'other', title: i18n.msg('owner.followed', { owner: group }), detail: [add.map((p) => p.name).join(', '), more].filter(Boolean).join(' · '), time: Date.now() });
  }

  /** Vuelve a mirar la lista de cada organización seguida: los repos nuevos se suman solos. */
  function refreshOwners() {
    if (paused || document.hidden) return;
    Object.keys(followedOwners).forEach((owner, i) => setTimeout(() => connectOwner(owner, { refresh: true }), i * STAGGER));
  }

  /* Los eventos de cada organización seguida: una consulta (con ETag) para todos sus repos. Solo se
     muestran los de repos sin pestaña propia (los demás ya los trae su pestaña); si la organización no
     existe como tal (un usuario) o no hay eventos visibles, no se muestra nada. */
  const ORG_EVENTS_EVERY = 5 * 60 * 1000;
  const orgFeeds = new Map(); // organización -> { token, feed }
  async function pollOrgEvents() {
    if (paused || document.hidden || EMBED) return;
    for (const owner of Object.keys(followedOwners)) {
      let entry = orgFeeds.get(owner);
      const tk = GB.GitHubSource.tokenFor(owner, settings.token, settings.account2);
      if (!entry || entry.token !== tk) {
        entry = { token: tk, feed: GB.GitHubSource.orgFeed(owner, { token: tk, apiUrl: API_URL }), first: true };
        orgFeeds.set(owner, entry);
      }
      let acts;
      try {
        acts = await entry.feed.poll();
      } catch {
        continue; // sin red o sin cuota: se intenta en el próximo ciclo
      }
      const key = 'org:' + owner.toLowerCase();
      const open = new Set(realTabs().map((x) => x.key));
      acts = acts.filter((a) => !open.has(a.repoFull.toLowerCase()));
      for (const a of acts) {
        a.repo = key;
        a.repoName = a.repoFull;
      }
      feed.add(acts, { live: !entry.first });
      entry.first = false;
    }
  }

  /** Una organización deja de seguirse cuando se cierra el último de sus repos. */
  function pruneOwners() {
    let changed = false;
    for (const owner of Object.keys(followedOwners)) {
      const has = realTabs().some((x) => !['gitlab', 'codeberg', 'forgejo', 'bitbucket', 'bitbucketdc', 'azure', 'local'].includes(x.source.host) && String(x.source.owner).toLowerCase() === owner.toLowerCase());
      if (!has) {
        delete followedOwners[owner];
        orgFeeds.delete(owner);
        feed.drop('org:' + owner.toLowerCase());
        changed = true;
      }
    }
    if (changed) U.store.set('owners', Object.keys(followedOwners).length ? followedOwners : null);
  }

  /** La demo: una pestaña más mientras se mira (no se guarda). Si ya estaba, empieza de nuevo. */
  function startDemo() {
    setAll(false, { save: false }); // se mira un repo solo
    const old = tabs.find((x) => x.demo);
    if (old) removeTab(old, { replace: false });
    resume();
    const tab = addTab(new GB.DemoSource());
    startTab(tab);
    showTab(tab);
  }

  /** La práctica de git: una pestaña como la demo, pero que solo cambia con los comandos que se escriben.
      Sin ejercicio dado, empieza por el primero que falta. */
  function startPractice(index, custom = null, solution = false) {
    setAll(false, { save: false }); // se mira un repo solo
    const old = tabs.find((x) => x.demo);
    if (old) removeTab(old, { replace: false });
    resume();
    if (index == null && !custom) {
      const solved = new Set(U.store.get('practice', []));
      index = Math.max(0, GB.gitsim.EXERCISES.findIndex((ex) => !solved.has(ex.id)));
    }
    const tab = addTab(new GB.PracticeSource(index, custom));
    const source = tab.source;
    source.solutionOn = !!(solution && custom?.solution?.length);
    startTab(tab);
    showTab(tab);
    practice.focus();
    // el enlace del ejercicio queda en la barra, para copiarlo; al salir de la práctica se quita
    setUrlParam('practice', custom ? GB.gitsim.encodeExercise(source.custom.spec, { solution: source.solutionOn }) : null);
    setUrlParam('solution', source.solutionOn ? '1' : null);
  }

  /** Ensayar un comando: la copia en memoria del repo real a la vista (sus ramas y commits ya cargados), en una pestaña
      como la de la práctica. Lo que se escribe solo cambia la copia: no hay escritura ni consulta a la API.
      `data`: los datos de la fuente real (por defecto, la de la pestaña a la vista). */
  function startRehearsal(data = source?.data) {
    setAll(false, { save: false }); // se mira un repo solo
    if (!data || data.repo.demo || !data.loaded) return;
    const git = GB.gitsim.fromData(data);
    if (!git) return;
    const old = tabs.find((x) => x.demo);
    if (old) removeTab(old, { replace: false });
    resume();
    const tab = addTab(new GB.PracticeSource(0, null, { git, owner: data.repo.owner, name: data.repo.name, data }));
    startTab(tab);
    showTab(tab);
    practice.focus();
  }

  /** ¿Se puede ensayar sobre lo que se ve? Solo un repo real ya cargado y con ramas. */
  function updateRehearse() {
    const d = source?.data;
    el.rehearseBtn.hidden = !(d && !d.repo.demo && d.loaded && d.branches.size);
  }

  /** Recuerda qué repos se siguen y cuál está a la vista; la URL los lleva también, para compartirla. */
  function saveTabs() {
    if (EMBED) return; // un iframe ajeno no pisa los repos que la persona sigue en la app
    const names = realTabs().map(savedName);
    const shown = active && !active.demo ? savedName(active) : null;
    U.store.set('repos', names.length ? names : null);
    U.store.set('repo', shown);
    setUrlRepos(shown ? [shown, ...names.filter((n) => n !== shown)] : names);
  }

  /** Token o profundidad nuevos: cada repo seguido (o los que diga `which`) se vuelve a conectar,
      el de la vista primero. */
  function reconnectAll(which = () => true) {
    resume();
    const order = realTabs()
      .filter(which)
      .sort((a, b) => (b === active) - (a === active));
    order.forEach((tab, i) => {
      feed.drop(tab.key);
      tab.unread = 0;
      setSource(tab, sourceFor({ host: tab.source.host, owner: tab.source.owner, name: tab.source.name }));
      startTab(tab, i * STAGGER);
    });
    shareQuota();
    if (active && !active.demo && order.includes(active)) showTab(active, { force: true });
    else renderTabs();
  }

  /* ---------- pestañas ---------- */

  const setText = (node, text) => node.textContent !== text && (node.textContent = text);

  /** Las pestañas se ven con más de un repo; con uno solo, el título del grafo ya dice cuál es. Delante, «Todos»:
      la vista conjunta. */
  function renderTabs() {
    const box = el.repoTabs;
    box.hidden = tabs.length < 2;
    el.tabsRow.hidden = box.hidden || EMBED;
    feed.setMulti(tabs.length > 1);
    tabs.forEach((tab, i) => {
      tab.el ||= makeTabEl(tab);
      // solo se mueve lo que no está en su lugar: mover una pestaña le quitaría el foco
      if (box.children[i] !== tab.el) box.insertBefore(tab.el, box.children[i] || null);
      renderTab(tab);
    });
    if (allOn && tabs.length < 2) setAll(false); // con un solo repo no hay nada que juntar
    else if (allOn) syncAll();
    else if (wantAll && tabs.length > 1) {
      // ?all=1 (o lo recordado) con repos que llegan después, como los de org:nombre
      wantAll = false;
      setAll(true, { save: false });
    }
    renderAllTab();
  }

  /** Un clic en la pestaña de un repo: lo muestra (y deja la vista conjunta, si estaba). */
  function openTab(tab) {
    if (allOn) setAll(false, { save: !tv.on });
    showTab(tab);
  }

  function makeTabEl(tab) {
    const node = document.createElement('div');
    node.className = 'rt';
    node.innerHTML = `<button type="button" class="rt-main">
        <span class="rt-dot" aria-hidden="true"></span><span class="rt-name" dir="ltr"></span><span class="rt-n" aria-hidden="true"></span><span class="sr-only rt-sr"></span>
      </button><button type="button" class="rt-close">${GB.Feed.icon('close')}</button>`;
    node.querySelector('.rt-main').addEventListener('click', () => openTab(tab));
    node.querySelector('.rt-close').addEventListener('click', () => closeTab(tab));
    const main = node.querySelector('.rt-main');
    main.addEventListener('dblclick', () => renameTab(tab));
    main.addEventListener('keydown', (ev) => {
      if (ev.key === 'F2' && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        renameTab(tab);
      }
    });
    return node;
  }

  /** Renombra la pestaña con un alias propio (doble clic o F2): Enter lo guarda, Esc lo deja como estaba y vacío lo quita.
      Solo cambia lo que se ve en la pestaña; el repo, su URL y su título siguen siendo los reales. */
  function renameTab(tab) {
    const node = tab.el;
    if (!node || tab.demo || node.querySelector('.rt-alias')) return;
    const main = node.querySelector('.rt-main');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rt-alias';
    input.maxLength = U.ALIAS_MAX;
    input.value = tab.alias || nameOf(tab);
    input.setAttribute('aria-label', t('tabs.rename', { repo: nameOf(tab) }));
    input.title = input.getAttribute('aria-label');
    input.dir = 'auto';
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const alias = U.cleanAlias(input.value);
      if (save) {
        tab.alias = alias === nameOf(tab) ? '' : alias;
        U.store.set('alias:' + tab.key, tab.alias || null);
      }
      const focused = document.activeElement === input;
      input.remove();
      main.hidden = false;
      renderTab(tab);
      if (focused) main.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    main.hidden = true;
    main.after(input);
    input.focus();
    input.select();
  }

  /** Estado, nombre y novedades sin ver de una pestaña (cambia solo lo que cambió). */
  function renderTab(tab) {
    const node = tab.el;
    if (!node || !tab.source) return;
    const st = tab.status?.state || 'loading';
    const name = nameOf(tab);
    const stateText = tab.demo && st === 'live' ? t('status.demoLive') : t(U.statusKey(tab.status) || 'status.loading');
    const n = tab.unread;
    node.dataset.state = st;
    // con la vista conjunta ninguna pestaña es «la que se ve»: se ven todas
    const shown = tab === active && !allOn;
    node.classList.toggle('on', shown);
    node.classList.toggle('demo', tab.demo);
    const main = node.firstElementChild;
    if (shown) main.setAttribute('aria-current', 'true');
    else main.removeAttribute('aria-current');
    const shownName = tab.alias || name;
    main.title = `${name} · ${stateText}`;
    setText(node.querySelector('.rt-name'), shownName);
    setText(node.querySelector('.rt-n'), n ? (n > 99 ? '99+' : U.fmtNum(n)) : '');
    // el lector de pantalla oye el estado si no es el normal, y cuántas novedades esperan
    const extra = [tab.alias ? name : '', st === 'live' ? '' : stateText, n ? t('tabs.unread', { n }) : ''].filter(Boolean).join(', ');
    setText(node.querySelector('.rt-sr'), extra ? `, ${extra}` : '');
    const close = node.querySelector('.rt-close');
    const label = t('tabs.close', { repo: name });
    if (close.getAttribute('aria-label') !== label) {
      close.setAttribute('aria-label', label);
      close.title = label;
    }
    renderAllTab();
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

  /* ---------- vista conjunta: todos los repos seguidos a la vez, cada uno en su tarjeta (ver overview.js) ---------- */

  let wantAll = false; // ?all=1 o lo recordado: se aplica en cuanto hay más de un repo
  let initialBy = ''; // ?by=login: la persona con que abre el Launchpad
  try {
    initialBy = EMBED ? '' : GB.overview.personParam(new URLSearchParams(location.search));
  } catch {
    /* sin query string */
  }
  /** Pospone un PR del Launchpad un día (o deja de posponerlo); se guarda por repo y número, sin el título, y lo vencido se
      limpia al guardar. */
  function setPrSnooze(id, on) {
    const m = GB.overview.liveSnoozes(U.store.get('prsnooze', {}));
    if (on) m[id] = Date.now() + GB.overview.SNOOZE_MS;
    else delete m[id];
    U.store.set('prsnooze', Object.keys(m).length ? m : null);
  }

  const overview = GB.overview.mount($('#all-grid'), {
    text: (k, p) => t(k, p),
    num: (n) => U.fmtNum(n),
    ago: (ms) => U.timeAgo(ms),
    dateTime: (ms) => U.fmtDateTime(ms),
    onOpen: (key) => {
      const tab = tabs.find((x) => x.key === key);
      if (!tab) return;
      openTab(tab);
      // la tarjeta ya no se ve: el foco queda en la pestaña del repo, que es donde se está ahora
      tab.el?.querySelector('.rt-main')?.focus({ preventScroll: true });
    },
    onDiff: (key, sha) => openDiff(sha, tabs.find((x) => x.key === key)),
    canDiff: (key) => canDiffTab(tabs.find((x) => x.key === key)),
    diffing: () => diffView.isOpen,
    onStats: (list) => renderAllSum(list),
    prsRoot: $('#all-prs'),
    person: initialBy,
    onPerson: (login) => setUrlParam('by', login),
    getPins: () => U.store.get('prpins', []),
    onPin: (id, on) => {
      const set = new Set(U.store.get('prpins', []));
      if (on) set.add(id);
      else set.delete(id);
      U.store.set('prpins', set.size ? [...set] : null);
      if (on) setPrSnooze(id, false); // fijar gana a posponer
    },
    getSnoozes: () => GB.overview.liveSnoozes(U.store.get('prsnooze', {})),
    onSnooze: (id, on) => {
      setPrSnooze(id, on);
      if (on) {
        // posponer suelta el PR si estaba fijado: no puede ir arriba y abajo a la vez
        const set = new Set(U.store.get('prpins', []));
        if (set.delete(id)) U.store.set('prpins', set.size ? [...set] : null);
      }
    },
    onOpenPr: (key, head) => {
      const tab = tabs.find((x) => x.key === key);
      if (!tab) return;
      openTab(tab);
      if (head) graph.focusBranch(head);
      tab.el?.querySelector('.rt-main')?.focus({ preventScroll: true });
    },
  });

  /** La etiqueta de un repo (la del encabezado y la de su tarjeta): simulación, local, privado o su servicio. */
  function badgeOf(repo) {
    const forge = repo.demo ? null : FORGES[repo.host];
    return repo.demo ? t('badge.demo') : repo.local ? t('badge.local') : repo.private ? (forge ? forge + ' · ' : '') + t('badge.private') : forge || '';
  }

  function allItems() {
    return tabs
      .filter((x) => x.source)
      .map((x) => {
        const st = x.status?.state || 'loading';
        return { key: x.key, name: nameOf(x), state: st, stateText: x.demo && st === 'live' ? t('status.demoLive') : t(U.statusKey(x.status) || 'status.loading'), badge: badgeOf(x.source.data.repo), demo: x.demo };
      });
  }

  /** Las tarjetas al día con las pestañas; las de repos nuevos se dibujan con lo que ya cargaron. */
  function syncAll() {
    overview.sync(allItems());
    for (const x of tabs) if (!overview.layoutOf(x.key)) drawCard(x, { initial: true });
  }

  /** Dibuja la tarjeta de un repo con lo suyo, y los efectos de lo que acaba de llegar. Solo con la vista conjunta. */
  function drawCard(tab, { initial = false, calm = false, activities = [] } = {}) {
    if (!allOn || !tab.source?.data.loaded) return;
    const data = tab.source.view ? tab.source.view() : tab.source.data;
    if (!overview.draw(tab.key, data, liveCtx(data, initial, calm, tab))) return;
    if (!initial && activities.length) overview.celebrate(tab.key, activities);
  }

  /** «Todos»: la pestaña de la vista conjunta, con las novedades sin ver de todos los repos. */
  function renderAllTab() {
    const n = tabs.reduce((sum, x) => sum + (x.unread || 0), 0);
    setText(el.allN, n ? (n > 99 ? '99+' : U.fmtNum(n)) : '');
    setPressed(el.allTab, allOn);
    el.tvAll.hidden = tabs.length < 2; // en la barra del modo TV: con un solo repo no hay nada que juntar
    const label = [t('all.tabLabel', { n: tabs.length }), n ? t('tabs.unread', { n }) : ''].filter(Boolean).join(', ');
    if (el.allTab.getAttribute('aria-label') !== label) el.allTab.setAttribute('aria-label', label);
  }

  /** La cabecera de la vista conjunta: repos, ramas y PRs abiertos entre todos (de lo ya cargado). */
  function renderAllSum(list = overview.stats()) {
    const sum = GB.overview.totals(list);
    const line = t('all.summary', { repos: U.fmtNum(tabs.length), branches: U.fmtNum(sum.branches), prs: U.fmtNum(sum.prs) });
    setText(el.allSum, GB.overview.heavy(sum) ? `${line} · ${t('all.heavy', { n: U.fmtNum(GB.overview.HEAVY_BRANCHES) })}` : line);
    renderAllPrs();
  }

  /** El Launchpad de la vista conjunta: los PRs abiertos de lo ya cargado en cada pestaña, por estado. */
  function renderAllPrs() {
    overview.setPulls(tabs.filter((x) => x.source?.data.loaded).map((x) => ({ key: x.key, name: nameOf(x), pulls: x.source.data.pulls.values() })));
  }

  /** Entra o sale de la vista conjunta (se recuerda y viaja en la URL, ?all=1). Con un solo repo no hay. En modo TV
      también (la pantalla compartida con todos los repos a la vez), sin guardarse. */
  function setAll(on, { save = true } = {}) {
    on = !!on && tabs.length > 1 && !EMBED;
    if (on === allOn) return renderAllTab();
    if (tv.on) save = false; // lo que se cambia en TV no se guarda: al salir queda la vista de antes
    if (on && tv.on && agentsOn) setAgentsView(false, { save: false }); // en TV, una pantalla por vez
    diffView.close(); // los cambios abiertos eran del grafo que se deja de ver
    allOn = on;
    el.app.classList.toggle('all-on', on);
    el.allPanel.hidden = !on;
    if (on) {
      if (replay.active) replay.stop(true);
      graph.unpin?.();
      lowerThird(null);
      for (const x of tabs) x.unread = 0; // se ven todos: nada queda sin ver
      overview.sync(allItems());
      for (const x of tabs) drawCard(x, { initial: true }); // lo que llegó mientras no se veía
      renderAllSum();
    }
    graph3d?.setActive(view === '3d' && !on && !agentsOn);
    renderTabs();
    if (save) U.store.set('all', on || null);
    setUrlParam('all', on ? '1' : null);
    setPressed(el.tvAll, on);
    if (tv.on) {
      placeTvBar();
      fitTvGrid();
    }
  }
  el.allTab.addEventListener('click', () => setAll(!allOn));
  /** El grafo del repo a la vista, a la vista: ir a una rama o a un commit desde la salud, la búsqueda o la vista de
      texto deja la vista conjunta. */
  const shownGraph = () => {
    if (allOn) setAll(false);
    if (agentsOn) setAgentsView(false, { save: !document.documentElement.classList.contains('tv') }); // en TV no se guarda
    return graph;
  };

  let lastRender = null;

  /* Filtro por autor: el grafo (2D, 3D) y el árbol de texto muestran solo las ramas con commits de esa persona
     (y la rama por defecto). Se guarda por repo; no hace ninguna consulta. */
  let authorFilter = '';
  let firstParentOn = false; // el grafo solo con la cadena del primer padre de cada rama (?firstparent=1)
  let initialFirstParent = null; // ?firstparent=1: el repo a la vista abre con el grafo de primer padre
  let initialBranchView = null; // ?solo=rama u ?ocultar=rama: el repo a la vista abre con esas ramas quitadas del grafo
  let initialAuthor = ''; // ?author=ana: el repo a la vista abre ya filtrado por esa persona
  const authorView = (data) => GB.search.byAuthor(data, authorFilter);

  /* Ramas ocultas o «solo esta» (desde la ficha de una rama): el grafo muestra menos. Se guarda por repo; la rama por
     defecto siempre queda. Sin consultas. */
  let branchView = { hidden: [], solo: '' };
  const loadBranchView = (key) => {
    const v = U.store.get('bview:' + key, null);
    return { hidden: Array.isArray(v?.hidden) ? v.hidden.filter((n) => typeof n === 'string') : [], solo: typeof v?.solo === 'string' ? v.solo : '' };
  };
  const branchViewOn = () => !!(branchView.hidden.length || branchView.solo);
  /** Lo que se dibuja: los filtros por autor y por rama, uno sobre el otro. */
  const viewOf = (data) => {
    const v = GB.search.byBranches(authorView(data).data, branchView);
    return firstParentOn ? { ...v, data: GB.search.firstParent(v.data) } : v;
  };
  /** La dirección sigue a las ramas quitadas: ?solo=rama, o ?ocultar= una vez por rama. */
  function setBranchViewUrl() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('solo');
      url.searchParams.delete('ocultar');
      if (branchView.solo) url.searchParams.set('solo', branchView.solo);
      else for (const n of branchView.hidden) url.searchParams.append('ocultar', n);
      history.replaceState(null, '', url);
    } catch {
      /* algunos visores no permiten cambiar la URL */
    }
  }
  function setBranchView(next) {
    branchView = next;
    U.store.set('bview:' + repoKey(), branchViewOn() ? next : null);
    setBranchViewUrl();
    syncFiltered();
    branchViewStatus();
    if (lastRender) {
      const { data, L } = drawGraph(false, true);
      renderSummary(data, L);
    }
  }
  /** «Ocultar» o «Solo esta» de la ficha de `name`; repetir «Solo esta» sobre la misma vuelve a verlas todas. */
  function onBranchView(name, how) {
    if (how === 'solo') return setBranchView({ hidden: [], solo: branchView.solo === name ? '' : name });
    const hidden = branchView.hidden.includes(name) ? branchView.hidden : [...branchView.hidden, name];
    setBranchView({ hidden, solo: '' });
  }

  /* `calm`: llegan ramas que esperaban su historia (la carga de a poco de un repo grande): se
     suman sin efectos de llegada, que son para lo nuevo */
  const liveCtx = (data, initial, calm = false, tab = active) => ({
    initial,
    calm,
    prs: prsByBranch(data),
    stacks: GB.Layout.stackedPulls(data.pulls, new Set(data.branches.keys()), data.repo.defaultBranch),
    ci: data.ci,
    refs: refsBySha(data),
    pins: data.repo.demo ? new Set() : tab === active ? getPins() : new Set(U.store.get('pins:' + tab.key, [])),
    canPin: !data.repo.demo && tab === active && !allOn, // fijar una rama es del grafo de la vista
    canHide: tab === active && !allOn, // y ocultarla o dejarla sola, también en la demo
    canDiff: canDiffTab(tab),
    canPrView: !!tab.source.prDetail && !EMBED && tab === active && !allOn, // la vista del PR pide su descripción al pulsarla
  });

  /** Lo que miran los logros: el estado del repo de ahora (`L`, su layout, si está a la vista). */
  const gameCtx = (acts, data, L) => ({
    openPrs: Math.max(data.totalPulls || 0, data.pulls.size),
    // sin layout: las ramas que ya tienen su historia, que son las que se dibujarían
    liveBranches: L ? L.heads.filter((h) => h.color !== 'ghost').length : [...data.branches.values()].filter((b) => data.commits.has(b.sha)).length,
    recordDay: acts.some((a) => a.kind === 'push') && isRecordDay(data),
  });

  /** Calcula el layout del repo a la vista y dibuja el grafo (salvo durante el Replay). `agents`: también las
      interacciones sobre el grafo (onUpdate las dibuja después, cuando la actividad nueva ya está en el panel). */
  function drawGraph(initial, calm = false, agents = true) {
    const data = source.view ? source.view() : source.data;
    const only = embedBranch ? GB.search.byBranches(viewOf(data).data, { solo: embedBranch }).data : viewOf(data).data; // &branch=: solo la capa embebida
    const withPr = embedPr ? GB.search.withOpenPr(only) : only; // &pr=1: solo la capa embebida
    const shownData = GB.search.limitBranches(withPr, embedMax); // &max=N: solo la capa embebida
    const L = layout.compute(shownData);
    lastRender = { data, L };
    if (embedMax || embedBranch || embedPr) document.querySelector('.graph-stage')?.setAttribute('data-embed-branches', String(L.heads.filter((h) => h.color !== 'ghost').length)); // lo que comprueba el smoke
    // durante el Replay el grafo muestra el pasado; lo nuevo sigue llegando al panel y se dibuja al volver
    if (!replay.active) {
      const gctx = liveCtx(shownData, initial, calm);
      graph2d.update(L, gctx);
      graph3d?.update(L, gctx);
    }
    if (agents) paintAgentGraph(data);
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
    sendHooks(tab, activities, initial);
    if (tab !== active) return onBackground(tab, activities, initial);
    const news = !initial && activities.length > 0;
    // en modo TV lo que pasa ahora manda: el Replay de ambiente deja paso al presente
    if (news && tv.attract && replay.active) replay.stop();
    if (news) tv.lastNews = Date.now();
    const { data, L } = drawGraph(initial, calm, false);
    if (el.textview.open) textview.update(textTree(viewOf(data).data)); // con la vista de texto abierta, avisa de lo nuevo
    feed.setDefaultBranch(data.repo.defaultBranch);
    feed.add(activities, { live: !initial });
    paintAgentGraph(data); // con las revisiones y los comentarios que acaban de llegar
    if (news) game.observe(activities, gameCtx(activities, data, L));
    // cada tipo de evento con su efecto, en la vista que esté a la vista
    if (!initial && !replay.active) {
      graph3d?.celebrate(activities);
      graph2d.celebrate(activities);
    }
    drawCard(tab, { initial, calm, activities });
    renderSummary(data, L);
    renderTab(tab);
    tab.updatedAt = Date.now();
    if (el.bitacora.open) scheduleBitacora();
    if (initialBitacora && L.nodes.length) openBitacora();
    if (initialHealth && tab === active && L.nodes.length) openHealth();
    if (agentsOn) scheduleAgents();
    if (initialAgents && tab === active && L.nodes.length) setAgentsView(true, { save: false });
    if (initialReplay && L.nodes.length) startUrlReplay();
    if (initialText && tab === active && L.nodes.length) startUrlText();
    if (initialPr && tab === active && L.nodes.length) startUrlPr();
    if (initialQuery && tab === active && L.nodes.length) startUrlQuery();
    if (initialPath && tab === active && L.nodes.length) startUrlPath();
    if (initialConflicts && tab === active && L.nodes.length) startUrlConflicts();
    if (diffTab === tab) diffView.refresh(); // puede haber llegado el commit siguiente
  }

  /* avisos a Slack, Discord y Teams (solo escritorio, js/hooks.js decide y electron/webhooks.js envía): lo
     que pasa en vivo en un repo real, nunca la primera carga ni la demo */
  const hookUrls = { slack: '', discord: '', teams: '' };
  const hookPrefs = U.store.get('hooks', {});
  function sendHooks(tab, activities, initial) {
    if (!desktop || initial || tab.demo || !activities.length) return;
    const routed = GB.hooks.route(activities, tab.source.data.repo.defaultBranch, hookPrefs, hookUrls);
    for (const service of GB.hooks.SERVICES) {
      for (const a of routed[service]) {
        const kind = t('kind.' + a.kind);
        desktop.webhook(service, { repo: a.repoName, kind, title: i18n.text(a.title), detail: i18n.text(a.detail), url: a.url }).catch(() => {});
      }
    }
  }

  /* en modo TV la pantalla va adonde pasan las cosas: a otro repo seguido con novedades, si el de la
     vista lleva este rato sin ellas (y sin cambiar de repo) */
  const TV_FOLLOW = 45e3;

  /** Novedades de un repo seguido que no está a la vista: al panel, a los avisos y a su pestaña. */
  function onBackground(tab, activities, initial) {
    feed.add(activities, { live: !initial });
    drawCard(tab, { initial, activities });
    if (diffTab === tab) diffView.refresh();
    if (initial || !activities.length) return renderTab(tab);
    if (!allOn) tab.unread += activities.length;
    const data = tab.source.view ? tab.source.view() : tab.source.data;
    tab.game.observe(activities, gameCtx(activities, data, null));
    renderTab(tab);
    const now = Date.now();
    if (!tv.on || allOn || paused || now - tv.lastNews < TV_FOLLOW || now - tv.lastSwitch < TV_FOLLOW) return;
    tv.lastNews = now;
    showTab(tab);
    graph3d?.celebrate(activities);
    graph2d.celebrate(activities);
  }

  /* ---------- Replay: la historia como time-lapse ---------- */

  let replayFrame = null; // el último cuadro del Replay: la vista que estaba oculta lo recibe al mostrarse
  const replay = new GB.Replay({
    root: $('#replay'),
    onFrame: (data, L, { jump, acts, quiet }) => {
      const gctx = { initial: jump || quiet, replay: true, prs: new Map(), pins: new Set(), canPin: false, canDiff: canDiff() };
      replayFrame = { L, gctx };
      graph.update(L, gctx); // solo la vista a la vista: la otra se pone al día al cambiar
      if (!acts.length) return;
      graph.celebrate(acts);
      if (feed.sound) feed.synth.play(acts, feed.panOf);
    },
    onExit: () => {
      tv.attract = false;
      showLive();
    },
    onState: (on) => {
      setPressed(el.replayBtn, on);
      if (on) lowerThird(null); // el Replay trae sus propios rótulos
      else if (recorder) stopRecording(); // salir del Replay termina la grabación, y se guarda
    },
    onEnd: () => {
      if (recorder) stopRecording(); // la historia llegó al final: el video también
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

  /* grabar el Replay en video (js/snapshot.js): desde el principio hasta el final, o hasta que se pare */
  const recBtn = $('#replay .rp-rec');
  let recorder = null;
  recBtn.hidden = !GB.snapshot.videoFormat(); // sin MediaRecorder (navegadores viejos) no se ofrece
  recBtn.addEventListener('click', () => (recorder ? stopRecording() : startRecording()));
  setRecUI(false);

  function setRecUI(on) {
    setPressed(recBtn, on);
    recBtn.setAttribute('aria-label', t(on ? 'rec.stop' : 'rec.label'));
    recBtn.title = t(on ? 'rec.stop' : 'rec.title');
  }

  function startRecording() {
    if (!replay.active || recorder || !active) return;
    try {
      recorder = GB.snapshot.record(() => ({ wrap: graph === graph3d ? el.graph3d : el.graph, view: graph }), {
        caption: `${nameOf(active)} · GraphBranch`,
        extra: () => [$('#replay .rp-clock'), $('#replay .rp-caption'), $('#replay .rp-head'), $('#replay .rp-foot')], // la fecha grande y los rótulos
      });
    } catch (err) {
      console.error(err);
      return snapNote(t('rec.failed'));
    }
    recorder.repo = active.demo ? 'demo' : nameOf(active);
    setRecUI(true);
    replay.restart();
  }

  async function stopRecording() {
    const r = recorder;
    if (!r) return;
    recorder = null;
    setRecUI(false);
    try {
      const blob = await r.stop();
      if (!blob.size) throw new Error('el video quedó vacío');
      const name = GB.snapshot.fileName(r.repo, { ext: r.format.ext, kind: 'replay' });
      GB.snapshot.download(blob, name);
      snapNote(t('rec.done', { file: name }));
    } catch (err) {
      console.error(err);
      snapNote(t('rec.failed'));
    }
  }

  function toggleReplay() {
    if (replay.active) return replay.stop();
    if (!lastRender) return;
    graph2d.clear();
    graph3d?.clear();
    paintAgentGraph(); // en el Replay cada arco aparece cuando llegan sus dos commits
    replayFrame = null;
    if (!replay.start(lastRender.data, feed.itemsOf(active.key), replayOpts)) {
      showLive();
      if (replayOpts.from != null || replayOpts.to != null) snapNote(t('replay.empty'));
    }
  }

  /* tramo y rótulos propios del Replay (js/replay.js): el formulario de la barra */
  let replayOpts = {};
  /** El Replay que pide la URL, una sola vez y con la primera historia que llega; un tramo sin commits avisa. */
  function startUrlReplay() {
    const opts = initialReplay;
    initialReplay = null;
    if (replay.active || tv.attract) return;
    replayOpts = opts;
    toggleReplay();
    if (!replay.active) return void (replayOpts = {});
    const f = rpForm.elements;
    f.from.value = opts.from != null ? new Date(opts.from).toLocaleDateString('en-CA') : '';
    f.to.value = opts.to != null ? new Date(opts.to).toLocaleDateString('en-CA') : '';
    f.title.value = opts.title || '';
    f.footer.value = opts.footer || '';
  }
  const rpForm = $('#rp-form');
  const rpOptsBtn = $('#replay .rp-opts');
  const dayMs = (v, end) => (v ? new Date(`${v}T${end ? '23:59:59.999' : '00:00:00'}`).getTime() : null);
  function openRpForm(on) {
    rpForm.hidden = !on;
    rpOptsBtn.setAttribute('aria-expanded', String(on));
    if (on) rpForm.elements.from.focus();
    else rpOptsBtn.focus();
  }
  rpOptsBtn.addEventListener('click', () => openRpForm(rpForm.hidden));
  rpForm.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    openRpForm(false);
  });
  rpForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = rpForm.elements;
    const next = { from: dayMs(f.from.value), to: dayMs(f.to.value, true), title: f.title.value.trim(), footer: f.footer.value.trim() };
    const msg = rpForm.querySelector('.rp-form-msg');
    if (!replay.active || !lastRender) return;
    if (!replay.start(lastRender.data, feed.itemsOf(active.key), next)) {
      msg.textContent = t('replay.empty'); // se queda el tramo anterior, no se pierde la vista
      replay.start(lastRender.data, feed.itemsOf(active.key), replayOpts);
      return;
    }
    msg.textContent = '';
    replayOpts = next;
    openRpForm(false);
  });
  rpForm.addEventListener('reset', () => {
    // «Toda la historia»: sin tramo ni rótulos
    replayOpts = {};
    setTimeout(() => {
      if (replay.active && lastRender) replay.start(lastRender.data, feed.itemsOf(active.key), replayOpts);
      rpForm.querySelector('.rp-form-msg').textContent = '';
    });
  });

  /** Vuelve a dibujar el repo tal como está ahora (al salir del Replay). */
  function showLive() {
    graph2d.clear();
    graph3d?.clear();
    if (!lastRender) return;
    const gctx = liveCtx(lastRender.data, true);
    graph2d.update(lastRender.L, gctx);
    graph3d?.update(lastRender.L, gctx);
    paintAgentGraph(lastRender.data);
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

  /* ---------- salud del repo: lo ya cargado como señales de equipo (ver health.js) ---------- */

  // Las series por semana del panel de salud: el periodo («últimas 8 semanas, de la más vieja a la actual») va una sola
  // vez, como encabezado del grupo, y cada línea dice solo qué cuenta y sus cifras (pendiente 12: un lector de pantalla
  // leía la frase larga en cada una). Las que dan cero todas las semanas no salen; sin ninguna, tampoco el encabezado.
  const WEEKLY_SERIES = [['merge', 'mergeWeeks'], ['opened', 'openedWeeks'], ['closed', 'closedWeeks'], ['branch', 'branchWeeks'], ['commit', 'commitWeeks'], ['author', 'authorWeeks'], ['newauthor', 'newAuthorWeeks'], ['tag', 'tagWeeks'], ['issue', 'issueWeeks'], ['prclose', 'prCloseWeeks']];
  function weeklyLines(pace) {
    const shown = WEEKLY_SERIES.filter(([, k]) => pace[k].some(Boolean));
    if (!shown.length) return '';
    const n = pace[shown[0][1]].length;
    return `<div class="hl-weekly" id="hl-weekly" role="group" aria-labelledby="hl-weekly-head"><p class="hl-line hl-weekly-head" id="hl-weekly-head">${U.esc(t('health.weeksHead', { n }))}</p>${shown
      .map(([id, k]) => `<p class="hl-line" id="hl-${id}weeks">${U.esc(t('health.' + k, { list: pace[k].join(' · ') }))}</p>`)
      .join('')}</div>`;
  }

  /** Una lista de filas; cada una lleva a su rama en el grafo. */
  function healthList(id, title, block, rowOf, sub = false) {
    const rows = block.rows
      .map((r, i) => {
        const [main, aside] = rowOf(r);
        const go = r.name || r.head;
        const body = `<span class="hl-main">${U.esc(main)}</span><span class="hl-aside">${U.esc(aside)}</span>`;
        return `<li>${go ? `<button type="button" class="hl-row" data-go="${i}" title="${U.esc(t('feed.locate'))}">${body}</button>` : `<span class="hl-row">${body}</span>`}</li>`;
      })
      .join('');
    const [box, head] = sub ? ['div class="hl-sub"', 'h4'] : ['section class="hl-sec"', 'h3'];
    return `<${box}><${head}>${U.esc(title)} <span class="hl-n">${U.fmtNum(block.total)}</span></${head}>${rows ? `<ul class="hl-list" data-list="${id}">${rows}</ul>` : `<p class="hl-none">${U.esc(t('health.none'))}</p>`}</${sub ? 'div' : 'section'}>`;
  }

  function renderHealth() {
    const data = source.view ? source.view() : source.data;
    const acts = feed.items.filter((a) => a.repo === active?.key);
    const h = GB.health.compute(data, acts, Date.now(), forksByStars ? 'stars' : 'recent');
    const span = (ms) => GB.i18n.fmtSpan(ms);
    const stat = (label, n) => `<div class="hl-stat"><b>${U.fmtNum(n)}</b><span>${U.esc(label)}</span></div>`;
    const forkRows = h.forks.rows
      .map((r) => `<li><a class="hl-row" href="${U.esc(U.safeUrl(r.url))}" target="_blank" rel="noopener noreferrer"><span class="hl-main">${U.esc(r.fullName)}</span><span class="hl-aside">${r.stars ? `★ ${U.fmtNum(r.stars)} · ` : ''}${U.esc(span(r.idle))}</span></a></li>`)
      .join('');
    const delta = (w, p) => (w > p ? `+${U.fmtNum(w - p)}` : w < p ? `−${U.fmtNum(p - w)}` : '±0'); // la diferencia de esta semana frente a la anterior
    // forks nuevos de la semana frente a la anterior, de la actividad ya cargada (sin consultas): solo si alguna de las dos tiene alguno
    const forkTrend = showForks && (h.forkTrend.week || h.forkTrend.prev) ? `<p class="hl-line" id="hl-forks-trend">${U.esc(t('health.forksNew', { week: U.fmtNum(h.forkTrend.week), prev: U.fmtNum(h.forkTrend.prev), delta: delta(h.forkTrend.week, h.forkTrend.prev) }))}</p>` : '';
    const forksBody = !showForks ? '' : forkTrend + (forkRows ? `<ul class="hl-list">${forkRows}</ul>` : `<p class="hl-none">${U.esc(t('health.none'))}</p>`);
    el.healthBody.innerHTML =
      `<section class="hl-sec" id="hl-forks"><h3>${U.esc(t('health.forks'))}${showForks ? ` <span class="hl-n">${U.fmtNum(h.forks.total)}</span>` : ''}</h3><label class="hl-switch"><input type="checkbox" id="hl-forks-toggle"${showForks ? ' checked' : ''}> ${U.esc(t('health.forksShow'))}</label>${showForks ? `<label class="hl-switch"><input type="checkbox" id="hl-forks-stars"${forksByStars ? ' checked' : ''}> ${U.esc(t('health.forksByStars'))}</label>` : ''}${forksBody}</section>` +
      `<section class="hl-sec" id="hl-stars"><h3>${U.esc(t('health.stars'))}</h3>${
        h.stars.week || h.stars.prev
          ? `<p class="hl-line">${U.esc(t('health.starsWeek', { week: U.fmtNum(h.stars.week), prev: U.fmtNum(h.stars.prev), delta: delta(h.stars.week, h.stars.prev) }))}</p>`
          : `<p class="hl-none">${U.esc(t('health.none'))}</p>`
      }</section>` +
      healthList('stale', t('health.stale'), h.stale, (r) => [r.name, span(r.idle)]) +
      healthList('prs', t('health.prs'), h.prs, (r) => [`#${r.number} ${r.title}`, span(r.age)]) +
      `<section class="hl-sec" id="hl-prstates"><h3>${U.esc(t('health.prStates'))}</h3>${['draft', 'failing', 'approved', 'waiting']
        .filter((k) => h.prStates[k].total)
        .map((k) => healthList('prs-' + k, t({ draft: 'health.prState.draft', failing: 'health.prState.failing', approved: 'health.prState.approved', waiting: 'health.prState.waiting' }[k]), h.prStates[k], (r) => [`#${r.number} ${r.title}`, span(r.age)], true))
        .join('') || `<p class="hl-none">${U.esc(t('health.none'))}</p>`}</section>` +
      `<div id="hl-unreviewed">${healthList('unreviewed', t('health.unreviewed'), h.unreviewed, (r) => [`#${r.number} ${r.title}`, span(r.age)])}</div>` +
      `<section class="hl-sec"><h3>${U.esc(t('health.merged'))}</h3>${
        h.merged ? `<p class="hl-line">${U.esc(t('health.mergedStat', { median: span(h.merged.median), max: span(h.merged.max) }))}</p>` : `<p class="hl-none">${U.esc(t('health.none'))}</p>`
      }${weeklyLines(h.pace)}</section>` +
      `<section class="hl-sec" id="hl-dora"><h3>${U.esc(t('health.dora'))}</h3>${
        h.dora.deploys30 || h.dora.gap != null || h.dora.lead != null || h.dora.weeks.some(Boolean)
          ? `<p class="hl-line">${U.esc(t('health.doraFreq', { n: h.dora.deploys30, gap: h.dora.gap != null ? span(h.dora.gap) : '—' }))}</p><p class="hl-line" id="hl-weeks">${U.esc(t('health.doraWeeks', { n: h.dora.weeks.length, list: h.dora.weeks.join(' · ') }))}</p><p class="hl-line">${U.esc(h.leadSource.fromCommit ? t('health.doraLeadCommit', { median: span(h.dora.lead), n: h.leadSource.fromCommit, total: h.leadSource.total }) : t('health.doraLead', { median: h.dora.lead != null ? span(h.dora.lead) : '—' }))}</p>`
          : `<p class="hl-none">${U.esc(t('health.none'))}</p>`
      }</section>` +
      (data.deploys?.size ? `<div id="hl-deploys">${healthList('deploys', t('health.deploys'), h.deploys, (r) => [r.env, [r.sha.slice(0, 7), r.state === 'current' ? t('health.deployCurrent', { branch: r.head }) : r.state === 'behind' ? t('health.deployBehind', { branch: r.head, n: r.behind }) : t('health.deployUnknown'), r.status === 'ok' ? t('health.deployOk') : r.status === 'failed' ? t('health.deployFailed') : r.status === 'running' ? t('health.deployRunning') : '', r.age != null ? span(r.age) : ''].filter(Boolean).join(' · ')])}</div>` : '') +
      `<section class="hl-sec" id="hl-ci"><h3>${U.esc(t('health.ci'))}</h3>${
        h.ci.prs || h.ci.fails30
          ? (h.ci.prs ? `<p class="hl-line">${U.esc(t('health.ciPrs', { failing: h.ci.prs.failing, total: h.ci.prs.total, pct: Math.round(h.ci.prs.rate * 100) }))}</p>` : '') +
            `<p class="hl-line">${U.esc(t('health.ciFeed', { n: h.ci.fails30 }))}</p>`
          : `<p class="hl-none">${U.esc(t('health.none'))}</p>`
      }</section>` +
      `<section class="hl-sec" id="hl-clash"><h3>${U.esc(t('health.clash'))}</h3><p class="hl-none">${U.esc(t('health.clashHelp'))}</p><button type="button" class="btn btn-ghost" id="hl-clash-go">${U.esc(t('health.clashGo'))}</button><div id="hl-clash-out" role="status" aria-live="polite"></div></section>` +
      `<section class="hl-sec" id="hl-cmp"><h3>${U.esc(t('cmp.title'))}</h3><p class="hl-none">${U.esc(t('cmp.help'))}</p><div class="sr-row"><select id="cmp-a" aria-label="${U.esc(t('cmp.a'))}"></select><select id="cmp-b" aria-label="${U.esc(t('cmp.b'))}"></select></div><button type="button" class="btn btn-ghost" id="cmp-go">${U.esc(t('cmp.go'))}</button><div id="cmp-out" role="status" aria-live="polite"></div></section>` +
      `<section class="hl-sec" id="hl-digest"><h3>${U.esc(t('digest.title'))}</h3><p class="hl-none">${U.esc(t('digest.help'))}</p><pre class="hl-digest" id="digest-md" tabindex="0" aria-label="${U.esc(t('digest.title'))}"></pre><div class="sr-row"><button type="button" class="btn btn-ghost" id="digest-copy">${U.esc(t('digest.copy'))}</button><button type="button" class="btn btn-ghost" id="digest-save">${U.esc(t('digest.save'))}</button><button type="button" class="btn btn-ghost" id="digest-png">${U.esc(t('digest.png'))}</button></div><div id="digest-out" role="status" aria-live="polite"></div></section>` +
      orgDigestHtml() +
      `<div class="hl-stats">${stat(t('health.merges7'), h.pace.merges7)}${stat(t('health.merges30'), h.pace.merges30)}${stat(t('health.releases30'), h.pace.releases30)}</div>`;
    $('#hl-forks-toggle').addEventListener('change', (e) => {
      showForks = e.target.checked;
      setUrlParam('forks', showForks ? null : '0');
      renderHealth();
      if (showForks) syncHealthForks();
      $('#hl-forks-toggle').focus();
    });
    $('#hl-forks-stars')?.addEventListener('change', (e) => {
      forksByStars = e.target.checked;
      renderHealth();
      $('#hl-forks-stars').focus();
    });
    const clashBtn = $('#hl-clash-go');
    if (!source.files) clashBtn.hidden = true;
    clashBtn.addEventListener('click', () => findClashes(data, clashBtn));
    setupCompare(data);
    setupDigest(data, acts);
    setupOrgDigest();
    el.healthBody.querySelectorAll('.hl-list').forEach((ul) =>
      ul.querySelectorAll('[data-go]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = ul.dataset.list;
          const r = (id.startsWith('prs-') ? h.prStates[id.slice(4)] : h[id]).rows[Number(b.dataset.go)];
          closeHealth();
          shownGraph().focusBranch(r.name || r.head);
        }),
      ),
    );
  }

  /** Comparar dos ramas: commits por delante y punto de separación con lo ya cargado; los archivos
      cambiados (dos consultas) solo al pedirlo. Cada línea lleva a su rama o commit en el grafo. */
  function setupCompare(data) {
    const names = [...data.branches.keys()];
    const selA = $('#cmp-a');
    const selB = $('#cmp-b');
    const go = $('#cmp-go');
    const out = $('#cmp-out');
    for (const sel of [selA, selB]) for (const n of names) sel.append(new Option(n, n));
    const def = data.repo.defaultBranch;
    selA.value = names.includes(def) ? def : names[0] || '';
    selB.value = names.find((n) => n !== selA.value) || '';
    const row = (main, aside, onGo, keepOpen) => {
      const li = document.createElement('li');
      const b = document.createElement(onGo ? 'button' : 'span');
      b.className = 'hl-row';
      if (onGo) {
        b.type = 'button';
        b.title = t('feed.locate');
        b.addEventListener('click', () => {
          if (!keepOpen) closeHealth();
          onGo();
        });
      }
      const m = document.createElement('span');
      m.className = 'hl-main';
      m.textContent = main;
      const x = document.createElement('span');
      x.className = 'hl-aside';
      x.textContent = aside;
      b.append(m, x);
      li.append(b);
      return li;
    };
    const note = (text) => {
      const p = document.createElement('p');
      p.className = 'hl-none';
      p.textContent = text;
      return p;
    };
    const clearMarks = () => {
      for (const g of [graph2d, graph3d]) g?.setCompareMarks?.(null);
    };
    go.addEventListener('click', async () => {
      const a = selA.value;
      const b = selB.value;
      out.replaceChildren();
      if (!a || !b || a === b) return void out.append(note(t('cmp.same')));
      const r = GB.health.compare(data, a, b);
      if (!r) return void out.append(note(t('cmp.same')));
      const marks = new Map();
      for (const sha of r.a.shas) marks.set(sha, 'a');
      for (const sha of r.b.shas) marks.set(sha, 'b');
      if (r.base) marks.set(r.base.sha, 'base');
      for (const g of [graph2d, graph3d]) g?.setCompareMarks?.(marks);
      const ul = document.createElement('ul');
      ul.className = 'hl-list';
      ul.append(
        row(t('cmp.ahead', { name: a, n: U.fmtNum(r.a.ahead) }), '', () => shownGraph().focusBranch(a)),
        row(t('cmp.ahead', { name: b, n: U.fmtNum(r.b.ahead) }), '', () => shownGraph().focusBranch(b)),
      );
      ul.append(row(t('cmp.clear'), '', () => clearMarks(), true));
      if (r.base) ul.append(row(t('cmp.base', { sha: r.base.sha.slice(0, 7), age: r.base.date ? GB.i18n.fmtSpan(Date.now() - r.base.date) : '' }), r.base.message, () => shownGraph().focusSha?.(r.base.sha)));
      out.append(ul);
      if (!r.base) out.append(note(t('cmp.nobase')));
      if (r.partial) out.append(note(t('cmp.partial')));
      if (!source.files) return;
      go.disabled = true;
      out.append(note(t('cmp.busy')));
      const busy = out.lastChild;
      try {
        const changed = async (name) => {
          const br = data.branches.get(name);
          if (name === def) return [];
          const res = await source.files({ name, sha: br.sha, isDefault: false });
          return res?.kind === 'diff' ? res.files.map((f) => f.path) : [];
        };
        const f = GB.health.splitFiles(await changed(a), await changed(b));
        busy.remove();
        const files = document.createElement('ul');
        files.className = 'hl-list';
        const MAX = 8;
        const block = (label, paths) => {
          files.append(row(label, ''));
          for (const p of paths.slice(0, MAX)) files.append(row(p, ''));
          if (paths.length > MAX) files.append(row(t('cmp.more', { n: U.fmtNum(paths.length - MAX) }), ''));
        };
        block(t('cmp.only', { name: a, n: U.fmtNum(f.onlyA.length) }), f.onlyA);
        block(t('cmp.only', { name: b, n: U.fmtNum(f.onlyB.length) }), f.onlyB);
        block(t('cmp.both', { n: U.fmtNum(f.both.length) }), f.both);
        out.append(files);
      } catch (e) {
        busy.textContent = t('cmp.fail');
      }
      go.disabled = false;
    });
  }

  /** Choques: una comparación por rama con PR abierto, solo cuando se pide (cuesta consultas). */
  async function findClashes(data, btn) {
    const out = $('#hl-clash-out');
    const names = GB.health.clashCandidates(data);
    if (names.length < 2) return void (out.innerHTML = `<p class="hl-none">${U.esc(t('health.none'))}</p>`);
    btn.disabled = true;
    out.textContent = t('health.clashBusy', { n: names.length });
    const entries = [];
    try {
      for (const name of names) {
        const b = data.branches.get(name);
        const r = await source.files({ name, sha: b.sha, isDefault: false });
        if (r?.kind === 'diff') entries.push({ name, files: r.files.map((f) => f.path) });
      }
    } catch (e) {
      out.innerHTML = `<p class="hl-none">${U.esc(t('health.clashFail'))}</p>`;
      btn.disabled = false;
      return;
    }
    const c = GB.health.clashes(entries);
    btn.disabled = false;
    setUrlParam('conflicts', '1'); // la vista con los choques se comparte con la URL
    if (!c.rows.length) return void (out.innerHTML = `<p class="hl-none">${U.esc(t('health.clashNone', { n: entries.length }))}</p>`);
    out.innerHTML = `<ul class="hl-list" data-list="clash">${c.rows
      .map((r, i) => `<li><button type="button" class="hl-row" data-go="${i}" title="${U.esc(t('feed.locate'))}"><span class="hl-main">${U.esc(r.path)}</span><span class="hl-aside">${U.esc(r.branches.join(', '))}</span></button></li>`)
      .join('')}</ul>`;
    out.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        closeHealth();
        shownGraph().focusBranch(c.rows[Number(b.dataset.go)].branches[0]);
      }),
    );
  }

  /** Las pestañas abiertas de la organización seguida a la que pertenece el repo activo (GitHub), o null. */
  const isGitHub = (x) => !x.source.host || x.source.host === 'github';
  function orgTabs() {
    const owner = !active || active.demo || !isGitHub(active) ? '' : String(active.source.owner || '').toLowerCase();
    const key = owner && Object.keys(followedOwners).find((k) => k.toLowerCase() === owner);
    if (!key) return null;
    const mine = realTabs().filter((x) => isGitHub(x) && String(x.source.owner || '').toLowerCase() === owner);
    return mine.length > 1 ? { owner: key, tabs: mine } : null;
  }

  /** La sección del resumen de la organización (solo con 2 o más de sus repos abiertos). */
  function orgDigestHtml() {
    const o = orgTabs();
    if (!o) return '';
    const title = t('digest.org', { owner: o.owner });
    return `<section class="hl-sec" id="hl-digest-org"><h3>${U.esc(title)}</h3><p class="hl-none">${U.esc(t('digest.help'))}</p><pre class="hl-digest" id="digest-org-md" tabindex="0" aria-label="${U.esc(title)}"></pre><div class="sr-row"><button type="button" class="btn btn-ghost" id="digest-org-copy">${U.esc(t('digest.copy'))}</button><button type="button" class="btn btn-ghost" id="digest-org-save">${U.esc(t('digest.save'))}</button><button type="button" class="btn btn-ghost" id="digest-org-png">${U.esc(t('digest.png'))}</button></div><div id="digest-org-out" role="status" aria-live="polite"></div></section>`;
  }

  /** Copiar y guardar un resumen como Markdown o como imagen: `id` es el prefijo de sus elementos y
      `image()` arma el canvas de la imagen. */
  function wireDigest(id, text, name, image) {
    const out = $(`#${id}-out`);
    $(`#${id}-md`).textContent = text;
    $(`#${id}-copy`).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        out.textContent = t('digest.copied');
      } catch {
        const range = document.createRange();
        range.selectNodeContents($(`#${id}-md`));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range); // sin permiso del portapapeles: queda seleccionado para copiar a mano
      }
    });
    $(`#${id}-save`).addEventListener('click', () => GB.snapshot.download(new Blob([text], { type: 'text/markdown' }), GB.snapshot.fileName(name, { ext: 'md', kind: 'semana' })));
    $(`#${id}-png`)?.addEventListener('click', () => {
      image().toBlob((b) => {
        if (!b) return;
        GB.snapshot.download(b, GB.snapshot.fileName(name, { kind: 'semana' }));
      }, 'image/png');
    });
  }

  // colores fijos: la imagen es para compartir y se ve igual con cualquier tema de la página
  const DIGEST_COLORS = { bg: '#0e1514', fg: '#e6efed', dim: '#93a5a1', accent: '#4ade80' };
  const digestLabels = () => {
    const label = (k) => t('digest.' + k);
    return { head: label('head'), commits: label('commits'), perday: label('perday'), newcomers: label('newcomers'), newbranches: label('newbranches'), merged: label('merged'), mergers: label('mergers'), opened: label('opened'), openers: label('openers'), closed: label('closed'), closers: label('closers'), dropped: label('dropped'), releases: label('releases'), tags: label('tags'), people: label('people'), branch: label('branch') };
  };

  /** El resumen de la semana (js/digest.js): se arma con lo ya cargado, se copia o se baja como .md. */
  function setupDigest(data, acts) {
    const d = GB.digest.compute(data, acts, Date.now(), 7, GB.i18n.text);
    const repoName = active?.demo ? 'demo' : active?.key || data.repo.name || '';
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    wireDigest('digest', GB.digest.toMarkdown(d, repoName, digestLabels(), GB.i18n.fmtDate, t('health.none')), repoName, () =>
      GB.digest.toCanvas(document, d, repoName, digestLabels(), GB.i18n.fmtDate, t('health.none'), DIGEST_COLORS, rtl));
  }

  /** El de toda la organización: los repos abiertos de la misma organización seguida, sin consultas nuevas. */
  function setupOrgDigest() {
    const o = orgTabs();
    if (!o) return;
    const entries = o.tabs.map((x) => ({ repo: `${x.source.owner}/${x.source.name}`, data: x.source.view ? x.source.view() : x.source.data, acts: feed.items.filter((a) => a.repo === x.key) }));
    const d = GB.digest.computeOrg(entries, Date.now(), 7, GB.i18n.text);
    wireDigest('digest-org', GB.digest.toMarkdownOrg(d, o.owner, digestLabels(), GB.i18n.fmtDate, t('health.none')), o.owner, () =>
      GB.digest.toCanvasOrg(document, d, o.owner, digestLabels(), GB.i18n.fmtDate, t('health.none'), DIGEST_COLORS, getComputedStyle(document.documentElement).direction === 'rtl'));
  }

  function closeHealth() {
    if (typeof el.health.close === 'function') el.health.close();
    else el.health.removeAttribute('open');
  }
  let forksByStars = false; // el panel de salud ordena los forks por estrellas en vez de por push
  let showForks = true; // ?forks=0: el panel de salud no muestra los forks ni los pide (cuota)
  function syncHealthForks() {
    const asked = source;
    if (showForks && asked.syncForks) asked.syncForks().then((ran) => ran && source === asked && el.health.open && renderHealth(), () => {});
  }
  let initialHealth = false; // ?health=1: el panel de salud se abre solo en cuanto el repo a la vista tiene grafo
  function openHealth() {
    initialHealth = false;
    if (el.health.open) return;
    renderHealth();
    const asked = source;
    syncHealthForks();
    if (asked.syncDeployStatuses && asked.data.deploys?.size) asked.syncDeployStatuses().then((ran) => ran && source === asked && el.health.open && renderHealth(), () => {});
    if (asked.syncFirstCommits) {
      const merged = feed.items.filter((a) => a.repo === active?.key && a.kind === 'pr-merge' && a.number && a.openedAt).sort((a, b) => b.time - a.time).slice(0, 20);
      asked.syncFirstCommits(merged.map((a) => a.number)).then((ran) => ran && source === asked && el.health.open && renderHealth(), () => {});
    }
    if (typeof el.health.showModal === 'function') el.health.showModal();
    else el.health.setAttribute('open', '');
  }
  el.healthBtn.addEventListener('click', openHealth);
  $('#health-close').addEventListener('click', closeHealth);
  el.health.addEventListener('close', () => {
    setUrlParam('conflicts', null);
    setUrlParam('health', null);
  });

  let initialConflicts = false; // ?conflicts=1: la salud se abre sola y busca los choques en cuanto hay dos ramas con PR
  let conflictsOpened = false;
  function startUrlConflicts() {
    if (!source.files || source.data.repo.practice || source.data.repo.rehearsal) return void (initialConflicts = false);
    if (conflictsOpened && !el.health.open) return void (initialConflicts = false); // quien lo cerró no lo quiere de vuelta
    if (!el.health.open) {
      conflictsOpened = true;
      el.healthBtn.click();
      setUrlParam('conflicts', '1'); // cerrar el panel la quita; abrirlo así la conserva
    }
    const data = source.view ? source.view() : source.data;
    if (GB.health.clashCandidates(data).length < 2) return; // los PRs pueden llegar después que las ramas
    initialConflicts = false;
    renderHealth(); // con los PRs ya cargados
    const btn = $('#hl-clash-go');
    if (btn && !btn.hidden && !btn.disabled) findClashes(data, btn);
  }

  /* ---------- agentes e interacciones: quién trabaja con quién, entre personas y agentes (ver agents.js) ---------- */
  const AGENTS_EVERY = 1500; // con el panel abierto, se rehace a lo más cada 1,5 s
  const AGENTS_ROWS = 12; // filas de cada lista
  const AG_KIND = { continued: 'agents.kind.continued', merged: 'agents.kind.merged', reviewed: 'agents.kind.reviewed', commented: 'agents.kind.commented' };
  const AG_EVENT = { continued: 'agents.ev.continued', merged: 'agents.ev.merged', reviewed: 'agents.ev.reviewed', commented: 'agents.ev.commented' };
  let initialAgents = false; // ?agents=1: el panel se abre solo en cuanto el repo a la vista tiene grafo
  let agentsOnly = U.store.get('agentsOnly', false) === true; // solo los vínculos entre dos agentes
  let agentsTimer = 0;
  let agentsHtml = ''; // el último HTML: si no cambió, no se toca (ni el foco ni el desplazamiento)
  let agentsSel = null; // el participante elegido en la red: las listas y la línea de tiempo se centran en él
  let agentsSeen = null; // lo que ya se mostró ({ ev: Set, edges: Map }): lo que llega después se anima
  let agentsLit = null; // a quién se ilumina en la red (puntero o foco): sobrevive a que el tablero se rehaga
  /** El id de una interacción, el mismo en cada vuelta: para saber cuál es nueva. */
  const agentEventId = (e) => [e.kind, e.from, e.to, e.time, e.sha || '', e.number ?? ''].join('|');
  const agentSession = (a) => (a?.session ? t('agents.session', { id: GB.agents.shortSession(a.session) }) : '');
  /** Cómo se nombra a un participante: una persona, por su nombre; un agente, por su producto y su sesión, si la tiene.
      Va aislado (FSI…PDI): dos nombres latinos en una frase en árabe no dan vuelta la flecha ni el orden. */
  const actorName = (x) => '\u2068' + (!x ? t('author.unknown') : x.agent ? [x.agent.name, agentSession(x.agent)].filter(Boolean).join(' · ') : x.name || x.login || t('author.unknown')) + '\u2069';
  const kindsText = (k) => Object.keys(AG_KIND).filter((x) => k[x]).map((x) => `${t(AG_KIND[x])}: ${U.fmtNum(k[x])}`).join(' · ');

  /** Qué es cada trazo (continuó, fusionó, revisó, comentó): en la leyenda del grafo y en la del panel. */
  const kindsLegend = () =>
    `<span class="agk-k"><span class="agk-line" aria-hidden="true"></span>${U.esc(t('agents.kind.continued'))}</span>` +
    `<span class="agk-k"><span class="agk-line agk-dash" aria-hidden="true"></span>${U.esc(t('agents.kind.merged'))}</span>` +
    `<span class="agk-k"><span class="agk-glyph" aria-hidden="true">✓</span>${U.esc(t('agents.kind.reviewed'))}</span>` +
    `<span class="agk-k"><span class="agk-glyph" aria-hidden="true">…</span>${U.esc(t('agents.kind.commented'))}</span>`;

  /* ---------- el enjambre: la vista de agentes como una consola en vivo (ver swarm.js y cortex.js) ---------- */
  const SWARM_TABS = 6; // pestañas del hilo
  const SWARM_LINES = 12; // líneas del hilo
  const SWARM_LOG = 14; // líneas del log
  const SWARM_PULSES = 16; // interacciones que viajan por la corteza
  const SWARM_TASKS = 9; // filas del ingreso de tareas
  const SWARM_BARS = 6; // agentes en las barras
  const CI_STATES = new Set(['success', 'failure', 'pending']);
  const SW_ROLE = { writes: 'swarm.role.writes', integrates: 'swarm.role.integrates', reviews: 'swarm.role.reviews', comments: 'swarm.role.comments' };
  let cortex = null; // la corteza 3D: una sola, sobrevive a que el tablero se rehaga (ver pushCortex)
  let swarmView = null; // lo último que se armó para ella: { model, text }, o null si no hay a quién mostrar
  const r2 = (x) => Math.round(x * 100) / 100;
  const fmtPct = (x) => new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 0 }).format(x);
  const fmtClock = (ms) => new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ms);

  /** Las partes del enjambre en el tablero: los indicadores, la corteza (con la ficha de quien está elegido), el ingreso
      de tareas, el hilo de un agente, el ritmo, las barras por agente y el log. Deja en `swarmView` lo que recibe la
      corteza. `ctx`: lo que agentsMarkup ya tiene a mano. */
  function swarmParts({ data, r, byKey, net, slot, sw, row, none }) {
    const S = GB.swarm;
    const now = Date.now();
    const k = S.kpis(r, data, { now });
    const roleMap = S.roles(r, data);
    const keys = net.nodes.map((n) => n.key);
    const hubKey = S.hub(roleMap, keys);
    const pos = S.place(keys, roleMap, hubKey);
    const roleOf = (key) => t(SW_ROLE[roleMap.get(key)?.role] || SW_ROLE.writes);
    const topAgent = r.actors.find((a) => a.agent)?.key || null;
    const pick = agentsSel && byKey.has(agentsSel) ? agentsSel : null;
    const name = (key) => actorName(byKey.get(key));
    const plainName = (key) => name(key).replace(/[⁨⁩]/g, '');
    /** Corto, para las pestañas, las barras y el log: el producto y los últimos 6 de su sesión; una persona, su nombre. */
    const short = (key) => {
      const a = byKey.get(key);
      return a?.agent ? [a.agent.name, a.agent.session ? GB.agents.shortSession(a.agent.session) : ''].filter(Boolean).join(' · ') : plainName(key);
    };
    const span = t('swarm.window', { span: i18n.fmtSpan(k.win.span) });
    const evText = (x) => U.esc(t(AG_EVENT[x.kind], { from: name(x.from), to: name(x.to) })) + (x.number != null ? ` · #${U.esc(x.number)}` : '');

    // los indicadores: lo que es, el número en grande, una línea más y, si tiene, su curva en la ventana (decorativa)
    const tile = (id, label, value, sub, series = null, cls = '') =>
      `<div class="sw-kpi${cls}" id="${id}"><span class="sw-kpi-label">${U.esc(label)}</span><b class="sw-kpi-n">${U.esc(value)}</b>${sub ? `<span class="sw-kpi-sub">${U.esc(sub)}</span>` : ''}${series ? S.spark(series) : ''}</div>`;
    const kpis =
      `<div class="sw-kpis" id="sw-kpis">` +
      tile('sw-k-active', t('swarm.kpiActive'), `${U.fmtNum(k.active.n)}/${U.fmtNum(k.active.total)}`, t('agents.people', { n: U.fmtNum(r.actors.length - k.active.total) })) +
      tile('sw-k-commits', t('swarm.kpiCommits'), U.fmtNum(k.commits.n), k.commits.share == null ? span : `${t('swarm.kpiShare', { pct: fmtPct(k.commits.share) })} · ${span}`, k.commits.series) +
      tile('sw-k-links', t('agents.statLinks'), U.fmtNum(k.links.n), span, k.links.series) +
      tile('sw-k-ci', t('swarm.kpiCi'), k.ci ? fmtPct(k.ci.ok / k.ci.known) : '—', k.ci ? `${U.fmtNum(k.ci.ok)}/${U.fmtNum(k.ci.known)}` : '', null, k.ci && k.ci.ok < k.ci.known ? ' is-warn' : '') +
      tile('sw-k-queue', t('swarm.kpiQueue'), U.fmtNum(k.queue), '') +
      tile('sw-k-waiting', t('swarm.kpiWaiting'), U.fmtNum(k.waiting), '', null, k.waiting ? ' is-ask' : '') +
      tile('sw-k-last', t('swarm.kpiLast'), k.last ? U.timeAgo(k.last.time, now) : '—', k.last ? short(k.last.key) : '') +
      `</div>`;

    // la corteza: cada participante de la red en el lóbulo de su rol; los vínculos y las últimas interacciones, por dentro
    const maxW = Math.max(1, ...keys.map((x) => net.weight.get(x) || 0));
    const maxT = Math.max(1, ...net.links.map((l) => l.total));
    const linked = new Set(net.links.map((l) => l.from + '>' + l.to));
    const pulses = r.events.filter((e) => linked.has(e.from + '>' + e.to)).slice(0, SWARM_PULSES);
    const focusKey = pick && pos.has(pick) ? pick : hubKey || keys[0] || null;
    swarmView = keys.length
      ? {
          model: {
            nodes: net.nodes.map((n) => ({
              key: n.key,
              label: n.agent ? n.agent.name : n.name || n.login || t('author.unknown'),
              sub: [n.agent?.session ? GB.agents.shortSession(n.agent.session) : '', roleOf(n.key)].filter(Boolean).join(' · '),
              title: `${plainName(n.key)} · ${roleOf(n.key)}`,
              slot: slot.get(n.key) ?? 0,
              agent: !!n.agent,
              w: r2((net.weight.get(n.key) || 0) / maxW),
              pos: pos.get(n.key),
            })),
            links: net.links.map((l) => ({ from: l.from, to: l.to, slot: slot.get(l.from) ?? 0, w: r2(l.total / maxT) })),
            pulses: pulses.map((e) => ({ id: agentEventId(e), from: e.from, to: e.to, slot: slot.get(e.from) ?? 0 })),
            sel: pick,
            focus: focusKey,
          },
          text: {
            aria: t('swarm.cortexAria', { nodes: net.nodes.length, links: net.links.length }),
            noGl: t('swarm.noGl'),
            planes: { axial: t('swarm.axial'), coronal: t('swarm.coronal'), sagittal: t('swarm.sagittal') },
          },
        }
      : null;
    // la ficha: quien está elegido (o el orquestador, o el agente más activo), su rol y en qué anda
    const inspKey = pick || hubKey || topAgent;
    const insp = byKey.get(inspKey);
    let inspHtml = '';
    if (insp) {
      const task = U.firstLine(data.commits.get(insp.sha)?.message || '');
      const rows = [[t('swarm.fRole'), roleOf(inspKey)], task ? [t('swarm.fTask'), task] : null, insp.agent?.model ? [t('swarm.fModel'), insp.agent.model] : null, insp.last ? [t('swarm.fLast'), U.timeAgo(insp.last, now)] : null].filter(Boolean);
      inspHtml =
        `<div class="sw-insp" id="sw-insp"><p class="sw-insp-name">${sw(inspKey)}<span>${U.esc(name(inspKey))}</span></p>` +
        `<dl>${rows.map(([a, b]) => `<div><dt>${U.esc(a)}</dt><dd>${U.esc(b)}</dd></div>`).join('')}</dl>` +
        `<p class="sw-insp-foot">${U.esc(t('agents.commits', { n: U.fmtNum(insp.commits) }))} · ${U.esc(t('agents.statLinks'))}: ${U.fmtNum(insp.links)}</p></div>`;
    }
    const cortexHtml = swarmView
      ? `<section class="hl-sec ab-card sw-cortex-card" id="sw-cortex-card"><h3>${U.esc(t('swarm.cortex'))} <span class="hl-n">${U.fmtNum(keys.length)}</span></h3>` +
        `<div class="sw-cortex-wrap"><div class="sw-slot" id="sw-cortex"></div>${inspHtml}</div><p class="hl-line ag-hint">${U.esc(t('swarm.cortexHint'))}</p></section>`
      : '';

    // el ingreso de tareas: los PRs abiertos y las ramas sin PR, y a quién le tocó cada uno
    const g = S.ingest(r, data, { max: SWARM_TASKS });
    const ciMark = (ci) => (CI_STATES.has(ci) ? `<span class="sw-ci sw-ci-${ci}" role="img" aria-label="${U.esc(t('ci.' + ci))}" title="${U.esc(t('ci.' + ci))}"></span>` : '');
    const taskRows = g.items.map((x) => {
      const tag = x.kind === 'branch' ? `<span class="sw-tag" aria-hidden="true">⎇</span>` : `<span class="sw-tag">#${U.esc(x.number)}</span>`;
      const draft = x.kind === 'draft' ? `<span class="sw-chip">${U.esc(t('health.prState.draft'))}</span>` : '';
      const ask = x.waiting ? `<span class="sw-chip sw-chip-ask">${U.esc(t('swarm.waits'))}</span>` : '';
      const to = x.who && byKey.has(x.who) ? `<span class="sw-to">→ ${sw(x.who)}${U.esc(short(x.who))}</span>` : '';
      return row('', `${ciMark(x.ci)}${to}`, x.sha, '', `${tag}<span class="sw-task">${U.esc(x.title || x.branch)}</span>${draft}${ask}`);
    });
    const ingestHtml =
      `<section class="hl-sec ab-card" id="sw-ingest"><h3>${U.esc(t('swarm.ingest'))}${g.total ? ` <span class="hl-n">${U.esc(t('swarm.routed', { n: U.fmtNum(g.routed), m: U.fmtNum(g.total) }))}</span>` : ''}</h3>` +
      (taskRows.length ? `<ul class="hl-list">${taskRows.join('')}</ul>` : none) +
      `</section>`;

    // el hilo: lo que escribió un agente (sus commits) y lo que pasó con él (sus interacciones), como una conversación
    const threadKey = pick || topAgent || hubKey;
    const tabKeys = r.actors.filter((a) => a.agent).slice(0, SWARM_TABS).map((a) => a.key);
    if (threadKey && !tabKeys.includes(threadKey)) tabKeys.splice(0, tabKeys.length >= SWARM_TABS ? 1 : 0, threadKey);
    const tabs = tabKeys.map((key) => `<button type="button" class="sw-tab${key === threadKey ? ' on' : ''}" data-pick="${U.esc(key)}" aria-pressed="${key === pick}">${sw(key)}${U.esc(short(key))}</button>`).join('');
    const msgs = (threadKey ? S.lines(r, data, threadKey, { max: SWARM_LINES }) : []).map((x) => {
      const text = x.type === 'commit' ? U.esc(x.text) : evText(x);
      const body = `<span class="sw-msg-head">${sw(x.key)}<b>${U.esc(short(x.key))}</b><time>${U.esc(U.fmtDateTime(x.time))}</time></span><span class="sw-msg-text">${text}</span>`;
      const cls = `sw-msg${x.key === threadKey ? ' mine' : ''}${x.type === 'event' ? ' is-ev' : ''}`;
      return x.sha && data.commits.has(x.sha) ? `<li class="${cls}"><button type="button" class="sw-msg-btn" data-sha="${U.esc(x.sha)}" title="${U.esc(t('feed.locate'))}">${body}</button></li>` : `<li class="${cls}"><div class="sw-msg-btn">${body}</div></li>`;
    });
    const threadHtml =
      `<section class="hl-sec ab-card sw-thread" id="sw-thread"><h3>${U.esc(t('swarm.thread'))}</h3>` +
      (tabs ? `<div class="sw-tabs" role="group" aria-label="${U.esc(t('swarm.thread'))}">${tabs}</div>` : '') +
      (msgs.length ? `<ol class="sw-msgs">${msgs.join('')}</ol>` : none) +
      `</section>`;

    // el ritmo: commits de agentes y de personas por tramo de la ventana
    const edge = (ms) => (k.win.span <= 7 * 864e5 ? U.fmtDateTime(ms) : U.fmtDate(ms));
    const rateHtml =
      `<section class="hl-sec ab-card" id="sw-rate"><h3>${U.esc(t('swarm.throughput'))} <span class="hl-n">${U.esc(span)}</span></h3>` +
      S.rate(k, { aria: t('swarm.rateAria', { a: U.fmtNum(k.commits.n), p: U.fmtNum(k.people.n), span: i18n.fmtSpan(k.win.span) }), start: edge(k.win.t0), end: edge(k.win.t1) }) +
      `<p class="sw-legend"><span class="sw-key sw-key-a" aria-hidden="true"></span>${U.esc(t('agents.statAgents'))}<span class="sw-key sw-key-p" aria-hidden="true"></span>${U.esc(t('agents.statPeople'))}</p></section>`;

    // por agente: sus commits, en barras de su color
    const per = S.perAgent(r, { max: SWARM_BARS });
    const maxC = Math.max(1, ...per.map((x) => x.commits));
    const bars = per.map(
      (x) =>
        `<li class="sw-bar-row"><span class="sw-bar-name">${sw(x.key)}<span>${U.esc(short(x.key))}</span></span><span class="sw-bar" aria-hidden="true"><span class="sw-bar-fill ag-s${slot.get(x.key) ?? 0}" style="width:${Math.max(2, Math.round((x.commits / maxC) * 100))}%"></span></span><b class="sw-bar-n">${U.fmtNum(x.commits)}</b></li>`,
    );
    const perHtml =
      `<section class="hl-sec ab-card" id="sw-per"><h3>${U.esc(t('swarm.perAgent'))} <span class="hl-n">${U.esc(t('agents.commits', { n: U.fmtNum(per.reduce((n, x) => n + x.commits, 0)) }))}</span></h3>` +
      (bars.length ? `<ul class="sw-bars">${bars.join('')}</ul>` : none) +
      `</section>`;

    // el log: todo lo de los agentes, de lo más viejo a lo más nuevo, como un tail -f
    const logRows = S.lines(r, data, null, { max: SWARM_LOG }).map((x) => {
      // un commit: su sha corto y su titular; una interacción: qué hizo y con quién (quién la hizo ya va al lado)
      const what =
        x.type === 'commit'
          ? `<span class="sw-log-sha">${U.esc(x.sha.slice(0, 7))}</span> ${U.esc(x.text)}`
          : `<span class="sw-log-kind">${U.esc(t(AG_KIND[x.kind]))}</span> → ${U.esc(short(x.to))}${x.number != null ? ` · #${U.esc(x.number)}` : ''}`;
      const when = x.time > now - 864e5 ? fmtClock(x.time) : U.fmtDateTime(x.time);
      const body = `<time>${U.esc(when)}</time><span class="sw-log-who ag-s${slot.get(x.key) ?? 0}">${U.esc(short(x.key))}</span><span class="sw-log-what">${what}</span>`;
      const id = x.type === 'commit' ? `log|c|${x.sha}` : `log|${agentEventId(x)}`;
      return `<li data-ev="${U.esc(id)}">${x.sha && data.commits.has(x.sha) ? `<button type="button" class="sw-log-row" data-sha="${U.esc(x.sha)}" title="${U.esc(t('feed.locate'))}">${body}</button>` : `<span class="sw-log-row">${body}</span>`}</li>`;
    });
    const logHtml =
      `<section class="hl-sec ab-card ab-live sw-log" id="sw-log"><h3><span class="live-dot" aria-hidden="true"></span><code>tail -f ${U.esc(t('swarm.log'))}</code></h3>` +
      (logRows.length ? `<ol class="sw-log-list">${logRows.join('')}</ol><span class="sw-caret" aria-hidden="true"></span>` : none) +
      `</section>`;

    return { kpis, cortex: cortexHtml, ingest: ingestHtml, thread: threadHtml, rate: rateHtml, per: perHtml, log: logHtml };
  }

  /** La corteza en su lugar del tablero recién rehecho, con lo último que se armó para ella. Se crea la primera vez. */
  function pushCortex() {
    const slotEl = el.agentsBody.querySelector('#sw-cortex');
    if (!slotEl || !swarmView || !GB.cortex) return cortex?.setActive(false);
    if (!cortex) {
      cortex = GB.cortex.create({ onPick: (key) => selectAgent(key, '.sw-label[data-key]') });
      U.onThemeChange(() => cortex.retheme());
    }
    if (cortex.host.parentNode !== slotEl) slotEl.append(cortex.host);
    cortex.update(swarmView.model, swarmView.text);
    cortex.setActive(cortexLive());
  }
  /** La corteza se anima mientras se ve, salvo con el modo TV en pausa (ahí la pausa detiene todo lo que se mueve). */
  const cortexLive = () => agentsOn && !(paused && tv.on);

  /** El reloj del tablero, al segundo, mientras se mira. */
  let clockTimer = 0;
  function tickClock() {
    clearInterval(clockTimer);
    clockTimer = 0;
    if (!agentsOn || !el.agentsClock) return;
    const put = () => {
      const now = Date.now();
      el.agentsClock.textContent = `${new Intl.DateTimeFormat(i18n.locale, { weekday: 'short' }).format(now)} ${fmtClock(now)}`;
      el.agentsClock.dateTime = new Date(now).toISOString();
    };
    put();
    clockTimer = setInterval(put, 1000);
  }

  function agentsMarkup() {
    const data = source.view ? source.view() : source.data;
    const acts = feed.items.filter((a) => a.repo === active?.key);
    const r = GB.agents.compute(data, acts, { max: Infinity });
    const byKey = new Map(r.actors.map((a) => [a.key, a]));
    const both = (x) => !!(byKey.get(x.from)?.agent && byKey.get(x.to)?.agent);
    if (agentsSel && !byKey.has(agentsSel)) agentsSel = null; // quien estaba elegido ya no está en lo cargado
    const mine = (x) => !agentsSel || x.from === agentsSel || x.to === agentsSel;
    const links = (agentsOnly ? r.links.filter(both) : r.links).filter(mine);
    const events = (agentsOnly ? r.events.filter(both) : r.events).filter(mine).slice(0, AGENTS_ROWS);
    const agents = r.actors.filter((a) => a.agent);
    const net = GB.agents.network(r, { onlyAgents: agentsOnly });
    const slot = net.slot;
    const none = `<p class="hl-none">${U.esc(t('health.none'))}</p>`;
    /** Una fila: lleva al commit `sha` en el grafo si lo hay; `aside`, HTML ya escapado; `extra`, algo más junto a ella (el
        enlace a la sesión). */
    const row = (main, aside, sha, extra = '', mainHtml = null) => {
      const body = `<span class="hl-main">${mainHtml ?? U.esc(main)}</span><span class="hl-aside">${aside}</span>`;
      const item = sha && data.commits.has(sha) ? `<button type="button" class="hl-row" data-sha="${U.esc(sha)}" title="${U.esc(t('feed.locate'))}">${body}</button>` : `<span class="hl-row">${body}</span>`;
      return `<li${extra ? ' class="ag-item"' : ''}>${item}${extra}</li>`;
    };
    const list = (rows) => (rows.length ? `<ul class="hl-list">${rows.join('')}</ul>` : none);
    /** La marca de color de un participante: cuadrada si es un agente, redonda si es una persona. */
    const sw = (key) => `<span class="agk-sw ag-s${slot.get(key) ?? 0}${byKey.get(key)?.agent ? ' agk-agent' : ''}" aria-hidden="true"></span>`;
    /** Quién → quién, cada uno con su color: se lee igual (el texto va entero y aislado), y se ve de un vistazo. */
    const pairHtml = (from, to) => `${sw(from)}${U.esc(t('agents.pair', { from: actorName(byKey.get(from)), to: actorName(byKey.get(to)) }))}${sw(to).replace('agk-sw', 'agk-sw agk-sw-to')}`;
    const chips = (k) =>
      Object.keys(AG_KIND)
        .filter((x) => k[x])
        .map((x) => `<span class="ag-chip ag-k-${x}"><span class="ag-chip-g" aria-hidden="true"></span>${U.esc(t(AG_KIND[x]))}: ${U.fmtNum(k[x])}</span>`)
        .join('');
    const legend = `<p class="ag-legend"><span class="ag-key ag-key-agent" aria-hidden="true"></span>${U.esc(t('agents.legendAgent'))}<span class="ag-key ag-key-person" aria-hidden="true"></span>${U.esc(t('agents.legendPerson'))}<span class="ag-legend-kinds">${kindsLegend()}</span></p>`;
    const netHtml = net.nodes.length
      ? GB.agents.svg(
          net,
          {
            label: (n) => (n.agent ? n.agent.name : n.name || n.login || t('author.unknown')),
            sub: (n) => (n.agent ? agentSession(n.agent) : ''),
            title: (l) => `${t('agents.pair', { from: actorName(byKey.get(l.from)), to: actorName(byKey.get(l.to)) })}: ${kindsText(l.kinds)}`,
            node: (n) => `${actorName(n)} · ${t('agents.statLinks')}: ${U.fmtNum(net.weight.get(n.key) || 0)}`,
            aria: t('agents.netAria', { nodes: net.nodes.length, links: net.links.length }),
          },
          { sel: agentsSel },
        ) +
        legend +
        `<p class="hl-line ag-hint">${U.esc(t('agents.netHint'))}</p>`
      : none;
    const tl = GB.agents.timeline(r, { onlyAgents: agentsOnly });
    const sayEvent = (e) => `${t(AG_EVENT[e.kind], { from: actorName(byKey.get(e.from)), to: actorName(byKey.get(e.to)) })}${e.number != null ? ` · #${e.number}` : ''} · ${U.fmtDateTime(e.time)}`;
    const timeHtml = tl
      ? GB.agents.timelineSvg(
          tl,
          {
            label: (l) => actorName(l).replace(/[⁨⁩]/g, ''),
            event: sayEvent,
            id: agentEventId,
            tick: (ms) => (tl.t1 - tl.t0 < 3 * 864e5 ? U.fmtDateTime(ms) : U.fmtDate(ms)), // en pocos días, la fecha sola se repite
            aria: t('agents.timelineAria', { n: tl.events.length }),
          },
          { sel: agentsSel },
        )
      : none;
    const pairs = links.slice(0, AGENTS_ROWS).map((l) => row('', chips(l.kinds), l.sha, '', pairHtml(l.from, l.to)));
    const demo = !!data.repo?.demo;
    const agentRows = agents.slice(0, AGENTS_ROWS).map((a) => {
      const main = [a.agent.name, agentSession(a.agent), a.agent.model].filter(Boolean).join(' · ');
      const aside = [t('agents.commits', { n: U.fmtNum(a.commits) }), a.last ? U.timeAgo(a.last) : ''].filter(Boolean).join(' · ');
      const url = demo ? null : U.safeUrl(GB.agents.sessionUrl(a.agent));
      const open = url ? `<a class="ag-open" href="${U.esc(U.safeUrl(url))}" target="_blank" rel="noopener noreferrer" title="${U.esc(t('agents.openSession'))}" aria-label="${U.esc(t('agents.openSession') + ': ' + main)}">↗</a>` : '';
      return row(main, U.esc(aside), a.sha, open, `${sw(a.key)}${U.esc(main)}`);
    });
    const eventRows = events.map((e) =>
      row(
        t(AG_EVENT[e.kind], { from: actorName(byKey.get(e.from)), to: actorName(byKey.get(e.to)) }),
        U.esc([e.number != null ? `#${e.number}` : '', e.time ? U.timeAgo(e.time) : ''].filter(Boolean).join(' · ')),
        e.sha,
        '',
        `<span class="ag-chip ag-k-${e.kind} ag-chip-dot" aria-hidden="true"><span class="ag-chip-g"></span></span>${U.esc(t(AG_EVENT[e.kind], { from: actorName(byKey.get(e.from)), to: actorName(byKey.get(e.to)) }))}`,
      ).replace('<li', `<li data-ev="${U.esc(agentEventId(e))}"`),
    );
    const focus = agentsSel
      ? `<p class="ag-focus" id="ag-focus">${sw(agentsSel)}<span class="ag-focus-name">${U.esc(t('agents.focus', { name: actorName(byKey.get(agentsSel)) }))}</span><button type="button" class="btn btn-ghost ag-focus-clear" id="ag-focus-clear">${U.esc(t('agents.focusClear'))}</button></p>`
      : '';
    const swarm = swarmParts({ data, r, byKey, net, slot, sw, row, none });
    return (
      swarm.kpis +
      (agents.length ? '' : `<p class="hl-line" id="ag-noagents">${U.esc(t('agents.noAgents'))}</p>`) +
      focus +
      swarm.cortex +
      `<div class="ab-row">${swarm.ingest}${swarm.thread}</div>` +
      `<div class="ab-row sw-row3">${swarm.rate}${swarm.per}${swarm.log}</div>` +
      `<div class="ab-row">` +
      `<section class="hl-sec ab-card" id="ag-net"><h3>${U.esc(t('agents.network'))}</h3>${netHtml.replace(/^(<svg[\s\S]*?<\/svg>)/, '<div class="ab-scroll">$1</div>')}</section>` +
      `<section class="hl-sec ab-card ab-live" id="ag-recent"><h3><span class="live-dot" aria-hidden="true"></span>${U.esc(t('agents.recent'))}</h3>${list(eventRows)}</section>` +
      `</div>` +
      `<section class="hl-sec ab-card" id="ag-time"><h3>${U.esc(t('agents.timeline'))}${tl ? ` <span class="hl-n">${U.fmtNum(tl.events.length)}</span>` : ''}</h3>${tl ? `<div class="ab-scroll">${timeHtml}</div>` : timeHtml}</section>` +
      `<div class="ab-row ab-row3">` +
      spendMarkup(data, r, slot) +
      `<section class="hl-sec ab-card" id="ag-pairs"><h3>${U.esc(t('agents.pairs'))} <span class="hl-n">${U.fmtNum(links.length)}</span></h3>${list(pairs)}</section>` +
      `<section class="hl-sec ab-card" id="ag-list"><h3>${U.esc(t('agents.statAgents'))} <span class="hl-n">${U.fmtNum(agents.length)}</span></h3>${list(agentRows)}</section>` +
      `</div>`
    );
  }

  /** Rehace el panel. Si nada cambió no toca el DOM; si cambió con el foco adentro, lo deja en el mismo control. */
  function renderAgents() {
    clearTimeout(agentsTimer);
    agentsTimer = 0;
    if (!source) return;
    const html = agentsMarkup();
    if (html === agentsHtml) return pushCortex(); // la corteza igual recibe lo nuevo (un pulso más, por ejemplo)
    const focusables = () => [...el.agentsBody.querySelectorAll('button, a, select, [tabindex="0"]')];
    const at = el.agentsBody.contains(document.activeElement) ? focusables().indexOf(document.activeElement) : -1;
    agentsHtml = html;
    el.agentsBody.innerHTML = html;
    pushCortex(); // antes de devolver el foco: sus rótulos cuentan entre los controles
    if (at >= 0) (focusables()[at] || focusables().pop() || el.agentsOnly).focus({ preventScroll: true });
    // en vivo: lo que no estaba en la vuelta anterior se anima (una interacción nueva, un vínculo que suma una vez)
    const evs = [...el.agentsBody.querySelectorAll('[data-ev]')];
    const edges = [...el.agentsBody.querySelectorAll('.ag-net .ag-e')];
    const edgeKey = (g) => g.dataset.from + '>' + g.dataset.to;
    // otro repo, «solo entre agentes» o alguien elegido muestran otras cosas, pero no nuevas: no se anima nada
    const mode = `${active?.key}|${agentsOnly}|${agentsSel}`;
    if (agentsSeen && agentsSeen.mode !== mode) agentsSeen = null;
    if (agentsSeen) {
      for (const n of evs) if (!agentsSeen.ev.has(n.dataset.ev)) n.classList.add('is-new');
      for (const g of edges) if ((agentsSeen.edges.get(edgeKey(g)) || 0) < Number(g.dataset.n)) g.classList.add('is-new');
    }
    agentsSeen = { mode, ev: new Set([...(agentsSeen?.ev || []), ...evs.map((n) => n.dataset.ev)]), edges: new Map(edges.map((g) => [edgeKey(g), Number(g.dataset.n)])) };
    if (agentsLit) lightAgent([...el.agentsBody.querySelectorAll('.ag-net .ag-n[data-key]')].find((n) => n.dataset.key === agentsLit) || null);
    markCut();
  }
  /** En el modo TV el tablero no se desplaza: lo último y el log muestran lo que cabe y, si algo queda cortado (lo más
      viejo: abajo en lo último, arriba en el log), lo dicen desvaneciéndose de ese lado. */
  function markCut() {
    if (!agentsOn || !document.documentElement.classList.contains('tv')) return; // fuera del modo TV la marca no se usa
    for (const [sel, top] of [['#ag-recent .hl-list', false], ['#sw-log .sw-log-list', true]]) {
      const list = el.agentsBody.querySelector(sel);
      const edge = top ? list?.firstElementChild : list?.lastElementChild;
      if (!edge) continue;
      const a = list.getBoundingClientRect();
      const b = edge.getBoundingClientRect();
      list.classList.toggle('is-cut', top ? b.top < a.top - 1 : b.bottom > a.bottom + 1);
    }
  }
  function scheduleAgents() {
    if (Date.now() - spendState.at > SPEND_EVERY) refreshSpend(); // con la vista abierta, el gasto se renueva solo
    if (!agentsTimer) agentsTimer = setTimeout(() => agentsOn && renderAgents(), AGENTS_EVERY);
  }
  /** La vista de agentes, en el lugar del grafo: el tablero en vivo (la red, la línea de tiempo, lo último, quién con
      quién y el gasto de IA). 3D o 2D, o ir a un commit, vuelven al grafo. Se recuerda como la vista. */
  function setAgentsView(on, { save = true } = {}) {
    on = !!on && !EMBED;
    initialAgents = false;
    if (on === agentsOn) {
      if (on && source) renderAgents();
      return;
    }
    agentsOn = on;
    el.graphPanel.classList.toggle('agents-on', on);
    el.agents.hidden = !on;
    setPressed(el.viewAgents, on);
    setPressed(el.agentsBtn, on);
    setPressed(el.tvAgents, on);
    placeTvBar();
    setPressed(el.view3d, !on && view === '3d');
    setPressed(el.view2d, !on && view === '2d');
    graph3d?.setActive(view === '3d' && !allOn && !on);
    clearTimeout(agentsTimer);
    agentsTimer = 0;
    tickClock();
    cortex?.setActive(cortexLive());
    if (on) {
      graph.unpin?.(); // una ficha fijada quedaría flotando sobre el tablero
      lowerThird(null);
      el.agentsOnly.checked = agentsOnly;
      agentsHtml = '';
      agentsSeen = null; // lo que ya está no se anima: solo lo que llegue mientras se mira
      if (source) renderAgents();
      refreshSpend();
    } else {
      agentsSel = null; // la próxima vez se abre con todos
      lightAgent(null);
    }
    if (save) U.store.set('agentsView', on || null);
    setUrlParam('agents', on ? '1' : null);
  }
  el.viewAgents.addEventListener('click', () => setAgentsView(true));
  el.agentsBtn.addEventListener('click', () => {
    if (allOn) setAll(false);
    setAgentsView(!agentsOn);
    if (agentsOn) el.graphPanel.scrollIntoView?.({ block: 'nearest' });
  });
  /** Elige (o suelta, si ya estaba elegido) a un participante de la red: las listas y la línea de tiempo se centran
      en él. El foco se queda en su nodo (o en el botón de soltarlo). */
  function selectAgent(key, from = null) {
    const prev = agentsSel;
    agentsSel = key && key !== agentsSel ? key : null;
    renderAgents();
    const want = agentsSel || prev;
    // el foco vuelve a donde se eligió (un rótulo de la corteza, una pestaña del hilo) o, si no, a su nodo en la red
    const find = (sel) => [...el.agentsBody.querySelectorAll(sel)].find((n) => (n.dataset.key ?? n.dataset.pick) === want);
    const node = (from && find(from)) || find('.ag-net .ag-n[data-key]');
    (node || el.agentsOnly).focus({ preventScroll: true });
  }
  /** Al pasar o enfocar un participante de la red, él y sus vínculos se encienden y lo demás queda tenue. */
  function lightAgent(g) {
    const key = g?.dataset.key || null;
    agentsLit = key;
    const svg = el.agentsBody.querySelector('.ag-net');
    if (!svg) return;
    svg.classList.toggle('ag-hl', !!key);
    for (const e of svg.querySelectorAll('.ag-e')) e.classList.toggle('hl', !!key && (e.dataset.from === key || e.dataset.to === key));
    const near = new Set(key ? [key] : []);
    if (key) for (const e of svg.querySelectorAll('.ag-e.hl')) near.add(e.dataset.from).add(e.dataset.to);
    for (const n of svg.querySelectorAll('.ag-n')) n.classList.toggle('hl', near.has(n.dataset.key));
  }
  el.agentsBody.addEventListener('pointerover', (e) => lightAgent(e.target.closest?.('.ag-net .ag-n')));
  el.agentsBody.addEventListener('pointerleave', () => lightAgent(null));
  el.agentsBody.addEventListener('focusin', (e) => lightAgent(e.target.closest?.('.ag-net .ag-n')));
  el.agentsBody.addEventListener('focusout', (e) => {
    if (!e.relatedTarget?.closest?.('.ag-net .ag-n')) lightAgent(null);
  });
  el.agentsBody.addEventListener('keydown', (e) => {
    const g = e.target.closest?.('.ag-net .ag-n[data-key]');
    if (!g || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    selectAgent(g.dataset.key);
  });
  el.agentsOnly.addEventListener('change', () => {
    agentsOnly = el.agentsOnly.checked;
    U.store.set('agentsOnly', agentsOnly || null);
    renderAgents();
    paintAgentGraph(); // «Solo entre agentes» vale también para lo que se ve en el grafo
  });

  /* ---------- las interacciones sobre el grafo, en 2D y en 3D (ver agents.js, overlay) ---------- */
  let agentGraph = U.store.get('agentGraph', false) === true; // de quien lo enciende, en todos sus repos
  // la leyenda desplegada o solo su título; sin decirlo, en el celular empieza plegada (taparía medio grafo)
  let agKeyOpen = U.store.get('agentKeyOpen', null) ?? !window.matchMedia?.('(max-width: 640px)').matches;
  let agKeyHtml = '';
  /** Las interacciones del repo a la vista con sus textos: lo que reciben graph.js y graph3d.js (setAgents). */
  function agentGraphData(data) {
    const acts = feed.items.filter((a) => a.repo === active?.key);
    const r = GB.agents.compute(data, acts, { max: Infinity });
    const ov = GB.agents.overlay(r, { onlyAgents: agentsOnly });
    const byKey = new Map(r.actors.map((a) => [a.key, a]));
    const say = (x) =>
      t(AG_EVENT[x.kind], { from: actorName(byKey.get(x.from)), to: actorName(byKey.get(x.to)) }) +
      (x.number != null ? ` · #${x.number}` : '') +
      (x.n > 1 ? ` · ×${U.fmtNum(x.n)}` : '');
    const notes = new Map(); // sha -> lo que dice su ficha: las interacciones que salen de él o llegan a él
    const note = (sha, text) => (notes.get(sha) || notes.set(sha, []).get(sha)).push(text);
    const arcs = ov.arcs.map((x) => {
      const title = say(x);
      note(x.a, title);
      note(x.b, title);
      return { ...x, id: `${x.kind}|${x.a}|${x.b}|${x.from}|${x.to}`, title };
    });
    const pins = ov.pins.map((x) => {
      const title = say(x);
      note(x.at, title);
      return { ...x, id: `${x.kind}|${x.at}|${x.from}|${x.to}`, title };
    });
    return { ...ov, arcs, pins, notes, byKey };
  }
  /** La leyenda sobre el grafo: cada agente con su color (los de más interacciones primero; cada fila lleva a su último
      commit), los demás agentes y las personas en una línea cada uno, y qué es cada trazo. Si nada cambió no toca el DOM
      (ni el foco). */
  function renderAgentKey(ov) {
    const sw = (slot, agent) => `<span class="agk-sw ag-s${slot}${agent ? ' agk-agent' : ''}" aria-hidden="true"></span>`;
    const line = (slot, agent, text) => `<li><span class="agk-row">${sw(slot, agent)}<span class="agk-name">${U.esc(text)}</span></span></li>`;
    const rows = ov.actors
      .filter((a) => a.agent && a.slot < GB.agents.OTHERS)
      .map((a) => {
        const body = `${sw(a.slot, true)}<span class="agk-name">${U.esc(actorName(ov.byKey.get(a.key) || a))}</span>${a.n ? `<span class="agk-n">${U.fmtNum(a.n)}</span>` : ''}`;
        return `<li>${a.sha ? `<button type="button" class="agk-row" data-sha="${U.esc(a.sha)}" data-key="${U.esc(a.key)}" title="${U.esc(t('agents.keyLocate'))}">${body}</button>` : `<span class="agk-row" data-key="${U.esc(a.key)}">${body}</span>`}</li>`;
      });
    const others = ov.actors.filter((a) => a.agent && a.slot === GB.agents.OTHERS).length;
    const people = ov.actors.filter((a) => !a.agent).length;
    if (others) rows.push(line(GB.agents.OTHERS, true, t('agents.others', { n: U.fmtNum(others) })));
    if (people) rows.push(line(0, false, t('agents.people', { n: U.fmtNum(people) })));
    const kinds = kindsLegend();
    el.agKeyN.textContent = ov.total ? U.fmtNum(ov.total) : '';
    el.agKeyN.title = ov.total ? t('agents.keyShown', { n: U.fmtNum(ov.total) }) : '';
    const html =
      (ov.total ? '' : `<p class="agk-none">${U.esc(t('agents.keyNone'))}</p>`) +
      (rows.length ? `<ul class="agk-list">${rows.join('')}</ul>` : '') +
      `<p class="agk-kinds">${kinds}</p>`;
    if (html === agKeyHtml) return;
    const had = el.agKeyBody.contains(document.activeElement) ? [...el.agKeyBody.querySelectorAll('button')].indexOf(document.activeElement) : -1;
    agKeyHtml = html;
    el.agKeyBody.innerHTML = html;
    if (had >= 0) ([...el.agKeyBody.querySelectorAll('button')][had] || el.agKeyFold).focus({ preventScroll: true });
  }
  function foldAgentKey(open) {
    agKeyOpen = open;
    el.agKey.classList.toggle('folded', !open);
    el.agKeyFold.setAttribute('aria-expanded', String(open));
    el.agKeyBody.hidden = !open;
  }
  /** Dibuja (o quita) las interacciones en las dos vistas con lo ya cargado del repo a la vista. `data`, si ya se tiene. */
  function paintAgentGraph(data) {
    const on = agentGraph && !EMBED && !!source;
    const ov = on ? agentGraphData(data || (source.view ? source.view() : source.data)) : null;
    graph2d?.setAgents?.(ov);
    graph3d?.setAgents?.(ov);
    el.agKey.hidden = !ov;
    if (ov) renderAgentKey(ov);
    else agKeyHtml = '';
  }
  function setAgentGraph(on, { save = true } = {}) {
    agentGraph = !!on;
    el.agentsGraph.checked = agentGraph;
    if (save) U.store.set('agentGraph', agentGraph || null);
    setUrlParam('interactions', agentGraph ? '1' : null);
    paintAgentGraph();
  }
  el.agentsGraph.checked = agentGraph;
  foldAgentKey(agKeyOpen);
  el.agentsGraph.addEventListener('change', () => setAgentGraph(el.agentsGraph.checked));
  $('#ag-key-close').addEventListener('click', () => {
    setAgentGraph(false);
    (el.agentsBtn.offsetParent ? el.agentsBtn : shownGraph().wrap)?.focus?.({ preventScroll: true }); // el foco no cae a <body>
  });
  el.agKeyFold.addEventListener('click', () => {
    foldAgentKey(!agKeyOpen);
    U.store.set('agentKeyOpen', agKeyOpen); // también desplegada: en el celular empieza plegada
  });
  // al pasar o enfocar a un participante de la leyenda, sus interacciones se encienden en el grafo y las demás quedan
  // tenues (en 2D y en 3D)
  const keyFocus = (row) => {
    const key = row?.dataset.key || null;
    graph2d?.focusAgent?.(key);
    graph3d?.focusAgent?.(key);
  };
  el.agKeyBody.addEventListener('pointerover', (e) => keyFocus(e.target.closest?.('.agk-row[data-key]')));
  el.agKeyBody.addEventListener('pointerleave', () => keyFocus(null));
  el.agKeyBody.addEventListener('focusin', (e) => keyFocus(e.target.closest?.('.agk-row[data-key]')));
  el.agKeyBody.addEventListener('focusout', (e) => {
    if (!e.relatedTarget?.closest?.('#ag-key-body .agk-row[data-key]')) keyFocus(null);
  });
  // cada participante de la leyenda lleva a su último commit en el grafo
  el.agKeyBody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sha]');
    if (b) shownGraph().focusSha?.(b.dataset.sha);
  });
  // cada fila lleva a su commit en el grafo (el enlace a la sesión de Claude Code abre aparte)
  el.agentsBody.addEventListener('click', (e) => {
    const g = e.target.closest('.ag-net .ag-n[data-key]');
    if (g) return selectAgent(g.dataset.key);
    if (e.target.closest('#ag-focus-clear')) return selectAgent(null);
    const tab = e.target.closest('.sw-tab[data-pick]');
    if (tab) return selectAgent(tab.dataset.pick, '.sw-tab[data-pick]');
    const b = e.target.closest('button[data-sha], .ag-time .ag-ev[data-sha]');
    if (!b) return;
    shownGraph().focusSha?.(b.dataset.sha); // deja la vista de agentes y va al commit
  });

  /* ---------- gasto en IA (js/spend.js): lo de cada servicio conectado y, con OmniRoute, lo de cada agente ---------- */
  const SPEND_EVERY = 5 * 60_000; // con la vista de agentes abierta, el gasto se vuelve a consultar cada 5 minutos
  let spendDays = U.store.get('spendDays', 30) === 7 ? 7 : 30;
  /* keys: las claves ({ anthropic, openai, openrouter, omniroute: { url, key } }); results: Map servicio -> lo de
     collect o { error, status }; at: cuándo se consultó; loaded: si las claves ya se leyeron */
  const spendState = { keys: {}, results: new Map(), at: 0, busy: false, loaded: false };
  const spendEl = {
    dialog: $('#spend-keys'),
    form: $('#spend-form'),
    anthropic: $('#spend-anthropic'),
    openai: $('#spend-openai'),
    openrouter: $('#spend-openrouter'),
    omnirouteUrl: $('#spend-omniroute-url'),
    omniroute: $('#spend-omniroute'),
    where: $('#spend-where'),
  };
  const spendConnected = (s) => (s === 'omniroute' ? !!GB.spend.baseUrl(spendState.keys.omniroute?.url || '') && !!spendState.keys.omniroute?.url : !!spendState.keys[s]);
  const spendAny = () => GB.spend.SERVICES.some(spendConnected);

  /** Lee las claves guardadas: en la web, de este navegador (U.secret); en escritorio, del llavero. */
  async function loadSpendKeys() {
    const k = {};
    for (const s of GB.spend.SERVICES) {
      const raw = desktop ? (await desktop.getToken(s).catch(() => ({ token: '' }))).token : U.secret.get('spend:' + s, '');
      if (s !== 'omniroute') k[s] = String(raw || '');
      else {
        let o = raw;
        if (typeof raw === 'string') {
          try {
            o = JSON.parse(raw || '{}');
          } catch {
            o = {};
          }
        }
        k.omniroute = { url: String(o?.url || ''), key: String(o?.key || '') };
      }
    }
    spendState.keys = k;
    spendState.loaded = true;
  }

  /** Una consulta desde la página (la web): sin cookies ni referer, con un tope de 15 s. */
  async function spendFetchJson(req) {
    const r = await fetch(req.url, { headers: req.headers, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout?.(15_000) });
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* no era JSON: lo dice collect */
    }
    return { status: r.status, json };
  }

  /** Consulta el gasto de cada servicio conectado (en escritorio, lo hace el proceso principal) y rehace el tablero. */
  async function refreshSpend({ force = false } = {}) {
    if (spendState.busy || (!force && Date.now() - spendState.at < SPEND_EVERY)) return;
    spendState.busy = true;
    try {
      if (!spendState.loaded) await loadSpendKeys();
      spendState.at = Date.now();
      const results = new Map();
      await Promise.all(
        GB.spend.SERVICES.filter(spendConnected).map(async (s) => {
          let r;
          if (desktop?.spend) r = await desktop.spend(s, { days: spendDays }).catch(() => ({ error: 'net' }));
          else {
            const cfg = s === 'omniroute' ? { ...spendState.keys.omniroute, days: spendDays, browser: true } : { key: spendState.keys[s], days: spendDays, browser: true };
            r = await GB.spend.collect(s, cfg, spendFetchJson).catch((err) => ({ error: err.kind || 'net', status: err.status || 0 }));
          }
          results.set(s, { service: s, ...r });
        }),
      );
      spendState.results = results;
    } finally {
      spendState.busy = false;
    }
    if (agentsOn) {
      agentsHtml = '';
      renderAgents();
    }
  }

  /** La tarjeta del gasto en el tablero: el total, las barras por día (un color por servicio), cada servicio con sus
      modelos y, con OmniRoute, cada agente (su clave), con su color si el agente trabaja en este repo. En la demo, sin
      servicios conectados, un ejemplo que lo dice. */
  function spendMarkup(data, r, slot) {
    const demo = !!data.repo?.demo && !spendAny();
    const results = demo ? GB.spend.demo({ days: spendDays }) : [...spendState.results.values()];
    const name = (s) => GB.spend.NAMES[s] || s;
    const select = `<select id="spend-days" class="sp-days" aria-label="${U.esc(t('spend.title'))}">${GB.spend.PERIODS.map((n) => `<option value="${n}"${n === spendDays ? ' selected' : ''}>${U.esc(t('spend.days', { n }))}</option>`).join('')}</select>`;
    const connect = `<button type="button" class="btn btn-ghost sp-connect" id="spend-connect">${U.esc(t('spend.connect'))}</button>`;
    const sum = GB.spend.combine(results, { days: spendDays });
    const head = `<h3>${U.esc(t('spend.title'))}${results.length ? ` <span class="hl-n">${U.esc(U.fmtUsd(sum.total))}</span>` : ''}${demo ? ` <span class="sp-badge">${U.esc(t('spend.example'))}</span>` : ''}</h3>`;
    const tools = `<div class="sp-tools">${select}${connect}</div>`;
    if (!results.length) {
      const msg = spendState.busy ? t('spend.loading') : t('spend.none');
      return `<section class="hl-sec ab-card ab-spend" id="ag-spend">${head}${tools}<p class="hl-line">${U.esc(msg)}</p></section>`;
    }
    // las barras: un día por columna, cada servicio apilado con su color
    const W = 600;
    const H = 120;
    const max = Math.max(1e-9, ...sum.days.map((_, i) => sum.series.reduce((n, x) => n + x.values[i], 0)));
    const bw = W / sum.days.length;
    const bars = sum.days
      .map((d, i) => {
        let y = H;
        const parts = sum.series
          .map((x) => {
            const h = (x.values[i] / max) * (H - 4);
            if (h <= 0) return '';
            y -= h;
            return `<rect class="sp-bar sp-${x.service}" x="${(i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`;
          })
          .join('');
        const tip = `${U.fmtDate(Date.parse(d))}: ${sum.series.filter((x) => x.values[i]).map((x) => `${name(x.service)} ${U.fmtUsd(x.values[i])}`).join(' · ') || U.fmtUsd(0)}`;
        return `<g>${parts}<rect class="sp-hit" x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}"><title>${U.esc(tip)}</title></rect></g>`;
      })
      .join('');
    const chart = `<svg class="sp-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${U.esc(t('spend.chartAria', { total: U.fmtUsd(sum.total) }))}">${bars}</svg><p class="sp-axis"><span>${U.esc(U.fmtDate(Date.parse(sum.days[0])))}</span><span>${U.esc(U.fmtUsd(max))}</span><span>${U.esc(U.fmtDate(Date.parse(sum.days[sum.days.length - 1])))}</span></p>`;
    const err = (x) =>
      x.error === 'auth' ? t('spend.err.auth') : x.error === 'net' ? t('spend.err.net', { service: name(x.service) }) : t('spend.err.http', { service: name(x.service), status: x.status || '' });
    const services = results
      .map((x) => {
        const detail = x.error
          ? `<span class="sp-err">${U.esc(err(x))}</span>`
          : `${x.window ? `<span class="sp-win">${U.esc(t(x.window === 'month' ? 'spend.month' : 'spend.week'))}</span>` : ''}${x.models
              .slice(0, 3)
              .map(([m, usd]) => `<span class="sp-model">${U.esc(m)} <b>${U.esc(U.fmtUsd(usd))}</b></span>`)
              .join('')}`;
        return `<li class="sp-row"><span class="sp-name"><span class="sp-sw sp-${x.service}" aria-hidden="true"></span>${U.esc(name(x.service))}</span><b class="sp-usd">${x.error ? '–' : U.esc(U.fmtUsd(x.total))}</b><span class="sp-detail">${detail}</span></li>`;
      })
      .join('');
    // por agente: las claves de OmniRoute; si nombran un agente que trabaja en este repo, con su color y sus sesiones
    const firstSlot = new Map();
    const sessions = new Map();
    for (const a of r.actors)
      if (a.agent) {
        if (!firstSlot.has(a.agent.id)) firstSlot.set(a.agent.id, slot.get(a.key) ?? 0);
        sessions.set(a.agent.id, (sessions.get(a.agent.id) || 0) + 1);
      }
    const agents = results.flatMap((x) => x.agents || []);
    const agentRows = agents
      .map((a) => {
        const sw = a.agent && firstSlot.has(a.agent) ? `<span class="agk-sw agk-agent ag-s${firstSlot.get(a.agent)}" aria-hidden="true"></span>` : `<span class="agk-sw agk-agent ag-s0" aria-hidden="true"></span>`;
        const sub = [a.requests ? t('spend.requests', { n: U.fmtNum(a.requests) }) : '', a.agent && sessions.get(a.agent) ? t('spend.sessions', { n: U.fmtNum(sessions.get(a.agent)) }) : ''].filter(Boolean).join(' · ');
        return `<li class="sp-row"><span class="sp-name">${sw}${U.esc(a.name)}</span><b class="sp-usd">${U.esc(U.fmtUsd(a.usd))}</b>${sub ? `<span class="sp-detail">${U.esc(sub)}</span>` : ''}</li>`;
      })
      .join('');
    return (
      `<section class="hl-sec ab-card ab-spend" id="ag-spend">${head}${tools}${demo ? `<p class="hl-line sp-note">${U.esc(t('spend.exampleNote'))}</p>` : ''}${chart}` +
      `<ul class="sp-list" id="sp-services">${services}</ul>` +
      (agentRows ? `<h4 class="sp-h4">${U.esc(t('spend.byAgent'))}</h4><ul class="sp-list" id="sp-agents">${agentRows}</ul>` : '') +
      `</section>`
    );
  }

  /** El diálogo de las claves: abre con lo guardado (escondido) y guarda cada una donde va. */
  async function openSpendKeys() {
    if (!spendState.loaded) await loadSpendKeys();
    const k = spendState.keys;
    spendEl.anthropic.value = k.anthropic || '';
    spendEl.openai.value = k.openai || '';
    spendEl.openrouter.value = k.openrouter || '';
    spendEl.omnirouteUrl.value = k.omniroute?.url || '';
    spendEl.omniroute.value = k.omniroute?.key || '';
    spendEl.where.textContent = t(desktop ? 'spend.whereDesktop' : 'spend.whereWeb');
    spendEl.omnirouteUrl.setCustomValidity('');
    if (typeof spendEl.dialog.showModal === 'function') spendEl.dialog.showModal();
    else spendEl.dialog.setAttribute('open', '');
  }
  const closeSpendKeys = () => (typeof spendEl.dialog.close === 'function' ? spendEl.dialog.close() : spendEl.dialog.removeAttribute('open'));
  spendEl.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const url = spendEl.omnirouteUrl.value.trim();
    if (url && !GB.spend.baseUrl(url)) {
      spendEl.omnirouteUrl.setCustomValidity(t('spend.badUrl'));
      spendEl.omnirouteUrl.reportValidity();
      return;
    }
    const keys = {
      anthropic: spendEl.anthropic.value.trim(),
      openai: spendEl.openai.value.trim(),
      openrouter: spendEl.openrouter.value.trim(),
      omniroute: { url, key: spendEl.omniroute.value.trim() },
    };
    for (const s of GB.spend.SERVICES) {
      const v = s === 'omniroute' ? (keys.omniroute.url ? JSON.stringify(keys.omniroute) : '') : keys[s];
      if (desktop) await desktop.setToken(v, s).catch((err) => console.error('No se pudo guardar la clave:', err));
      else U.secret.set('spend:' + s, s === 'omniroute' ? (keys.omniroute.url ? keys.omniroute : null) : v || null);
    }
    spendState.keys = keys;
    spendState.loaded = true;
    spendState.results = new Map();
    closeSpendKeys();
    if (agentsOn) {
      agentsHtml = '';
      renderAgents();
    }
    refreshSpend({ force: true });
  });
  spendEl.omnirouteUrl.addEventListener('input', () => spendEl.omnirouteUrl.setCustomValidity(''));
  $('#spend-cancel').addEventListener('click', closeSpendKeys);
  $('#spend-clear').addEventListener('click', () => {
    for (const f of [spendEl.anthropic, spendEl.openai, spendEl.openrouter, spendEl.omnirouteUrl, spendEl.omniroute]) f.value = '';
    spendEl.anthropic.focus();
  });
  // los controles de la tarjeta viven en el tablero, que se rehace: se escuchan desde él
  el.agentsBody.addEventListener('change', (e) => {
    if (e.target.id !== 'spend-days') return;
    spendDays = Number(e.target.value) === 7 ? 7 : 30;
    U.store.set('spendDays', spendDays === 30 ? null : spendDays);
    agentsHtml = '';
    renderAgents();
    refreshSpend({ force: true });
  });
  el.agentsBody.addEventListener('click', (e) => {
    if (e.target.closest('#spend-connect')) openSpendKeys();
  });

  /* ---------- bitácora en vivo: lo que hizo el repo desde la anterior, con su nota y sus hallazgos (ver bitacora.js) ---------- */
  const BIT_EVERY = 1500; // con el panel abierto, se rehace a lo más cada 1,5 s
  const BIT_CARD_EVERY = 2000; // la tarjeta del resumen, a lo más cada 2 s
  let initialBitacora = false; // ?bitacora=1: el panel se abre solo, con la primera historia del repo a la vista
  let bitCard = { at: 0, key: null, timer: 0 };
  let bitTimer = 0;
  let bitBody = ''; // el último HTML de las secciones: si no cambió, no se toca (ni el foco ni el desplazamiento)
  let bitUndo = null; // la bitácora recién cerrada, para deshacer: { key, n, title }
  let demoBitacoras = null; // la demo trae su historia ficticia; lo que se cierra en ella no se guarda
  const demoTitles = new Map();
  /** La bitácora no tiene sentido en la práctica de git ni en el ensayo de comandos. */
  const bitOn = (tab = active) => !!tab && !tab.source.data.repo.practice && !tab.source.data.repo.rehearsal;
  const bitDemo = (tab) => !!tab.source.data.repo.demo;
  function bitPrev(tab = active) {
    if (!tab) return [];
    if (bitDemo(tab)) return (demoBitacoras ||= GB.bitacora.demoHistory());
    return GB.bitacora.sanitize(U.store.get('bitacora:' + tab.key, []));
  }
  function bitSave(tab, list) {
    if (bitDemo(tab)) demoBitacoras = list;
    else U.store.set('bitacora:' + tab.key, list);
  }
  /** El título que se escribe para la bitácora en curso (vacío: el automático), por repo. */
  const bitDraft = (tab) => (bitDemo(tab) ? demoTitles.get(tab.key) || '' : U.store.get('bitacora-title:' + tab.key, ''));
  function setBitDraft(tab, v) {
    if (bitDemo(tab)) demoTitles.set(tab.key, v);
    else U.store.set('bitacora-title:' + tab.key, v || null);
  }
  function bitCompute(tab = active) {
    const data = tab.source.view ? tab.source.view() : tab.source.data;
    return GB.bitacora.compute(data, feed.items.filter((a) => a.repo === tab.key), { prev: bitPrev(tab), text: i18n.text });
  }
  let bitDay = null;
  /** Día y mes cortos ("18 oct.") en el idioma activo. */
  const bitShort = (ms) => {
    if (bitDay?.locale !== i18n.locale) bitDay = { locale: i18n.locale, f: new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }) };
    return bitDay.f.format(ms);
  };
  const bitFormat = (tab = active) => ({ t, esc: U.esc, num: U.fmtNum, short: bitShort, text: i18n.text, repo: nameOf(tab), title: bitDraft(tab).trim() });
  const bitTrend = (b) => (!b.trend ? t('bitacora.trend.first') : b.score.total > b.trend.prev ? t('bitacora.trend.up', { prev: b.trend.prev }) : b.score.total < b.trend.prev ? t('bitacora.trend.down', { prev: b.trend.prev }) : t('bitacora.trend.same', { n: b.trend.n }));

  /** La tarjeta del resumen: número, nota, si subió o bajó y cuántos hallazgos. Se recalcula a lo más cada 2 s. */
  function renderBitacoraCard(force = false) {
    const on = bitOn();
    el.stBit.hidden = !on;
    if (!on || !source?.data.loaded) return;
    const wait = !force && bitCard.key === active.key ? BIT_CARD_EVERY - (Date.now() - bitCard.at) : 0;
    if (wait > 0) {
      if (!bitCard.timer) bitCard.timer = setTimeout(() => ((bitCard.timer = 0), renderBitacoraCard()), wait);
      return;
    }
    clearTimeout(bitCard.timer);
    bitCard = { at: Date.now(), key: active.key, timer: 0 };
    const b = bitCompute();
    const d = b.trend ? b.score.total - b.trend.prev : 0;
    setText(el.stBitLabel, t('bitacora.card', { n: b.n }));
    setText(el.stBitScore, U.fmtNum(b.score.total));
    setText(el.stBitTrend, d ? `${d > 0 ? '▲' : '▼'}${U.fmtNum(Math.abs(d))}` : '');
    el.stBitTrend.className = `bt-trend${d > 0 ? ' up' : d < 0 ? ' down' : ''}`;
    setText(el.stBitSub, `${t('status.live')} · ${t('bitacora.cardFindings', { n: b.findings.length })}`);
    el.stBit.setAttribute('aria-label', `${t('bitacora.card', { n: b.n })}. ${t('bitacora.score', { score: b.score.total, trend: bitTrend(b) })} ${t('bitacora.cardFindings', { n: b.findings.length })}.`);
  }

  /** El panel entero. Las secciones solo se reemplazan si cambiaron y nadie está parado con el foco en ellas. */
  function renderBitacora() {
    clearTimeout(bitTimer);
    bitTimer = 0;
    if (!el.bitacora.open || !bitOn()) return;
    const b = bitCompute();
    const f = bitFormat();
    const r = GB.bitacora.render(b, f);
    setText(el.btEyebrow, r.eyebrow);
    setText(el.btTitle, r.title);
    setText(el.btDek, r.dek);
    setText(el.btWindow, r.window);
    setText(el.btUpdated, t('bitacora.updated', { ago: U.timeAgo(active.updatedAt || Date.now()) }));
    if (document.activeElement !== el.btTitleInput) {
      el.btTitleInput.value = f.title;
      el.btTitleInput.dataset.key = active.key;
    }
    el.btTitleInput.placeholder = GB.bitacora.autoTitle(b, f);
    setText(el.btCloseBtn, t('bitacora.close', { n: b.n }));
    setText(el.btCloseHelp, t('bitacora.closeHelp', { next: b.n + 1 }));
    if (r.body !== bitBody) {
      if (el.btBody.contains(document.activeElement)) scheduleBitacora(); // se rehace cuando el foco salga
      else {
        el.btBody.innerHTML = r.body;
        bitBody = r.body;
      }
    }
  }
  function scheduleBitacora() {
    if (!bitTimer) bitTimer = setTimeout(renderBitacora, BIT_EVERY);
  }

  function openBitacora() {
    initialBitacora = false;
    if (!bitOn() || el.bitacora.open) return;
    bitBody = '';
    el.btOutText.textContent = '';
    el.btUndo.hidden = true;
    if (typeof el.bitacora.showModal === 'function') el.bitacora.showModal();
    else el.bitacora.setAttribute('open', '');
    renderBitacora();
  }
  function closeBitacora() {
    if (typeof el.bitacora.close === 'function') el.bitacora.close();
    else el.bitacora.removeAttribute('open');
  }
  el.stBit.addEventListener('click', openBitacora);
  $('#bitacora-close').addEventListener('click', closeBitacora);
  el.bitacora.addEventListener('close', () => {
    clearTimeout(bitTimer);
    bitTimer = 0;
  });
  // cada rama de un hallazgo o de lo grande lleva a ella en el grafo
  el.btBody.addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-branch]');
    if (!go) return;
    closeBitacora();
    shownGraph().focusBranch(go.dataset.branch);
  });
  el.btBody.addEventListener('focusout', () => setTimeout(() => !el.btBody.contains(document.activeElement) && bitTimer && renderBitacora(), 0));
  el.btTitleInput.addEventListener('input', () => {
    if (!active || el.btTitleInput.dataset.key !== active.key) return;
    setBitDraft(active, el.btTitleInput.value);
    setText(el.btTitle, el.btTitleInput.value.trim() || el.btTitleInput.placeholder);
  });
  // ¿pasó un rato sin novedades? la línea de "actualizada hace…" igual avanza
  setInterval(() => el.bitacora.open && active && setText(el.btUpdated, t('bitacora.updated', { ago: U.timeAgo(active.updatedAt || Date.now()) })), 10000);

  /** Cerrar la bitácora: se guarda (en la demo, solo en memoria) y la siguiente empieza ahora. */
  el.btCloseBtn.addEventListener('click', () => {
    const tab = active;
    if (!bitOn(tab)) return;
    const b = bitCompute(tab);
    const title = bitDraft(tab).trim() || GB.bitacora.autoTitle(b, bitFormat(tab));
    bitSave(tab, GB.bitacora.append(bitPrev(tab), GB.bitacora.closeEntry(b, title)));
    setBitDraft(tab, '');
    el.btTitleInput.value = '';
    bitUndo = { key: tab.key, n: b.n, title };
    el.btOutText.textContent = t('bitacora.closed', { n: b.n, next: b.n + 1 });
    el.btUndo.hidden = false;
    renderBitacora();
    renderBitacoraCard(true);
  });
  el.btUndo.addEventListener('click', () => {
    const tab = active;
    if (!bitUndo || !tab || bitUndo.key !== tab.key) return;
    const list = bitPrev(tab);
    if (list[list.length - 1]?.n === bitUndo.n) {
      bitSave(tab, list.slice(0, -1));
      setBitDraft(tab, bitUndo.title);
    }
    bitUndo = null;
    el.btOutText.textContent = '';
    el.btUndo.hidden = true;
    el.btCloseBtn.focus();
    renderBitacora();
    renderBitacoraCard(true);
  });
  const bitFile = (ext) => GB.snapshot.fileName(active.demo ? 'demo' : active.key, { ext, kind: 'bitacora' });
  $('#bt-copy').addEventListener('click', async () => {
    const text = GB.bitacora.toMarkdown(bitCompute(), bitFormat());
    try {
      await navigator.clipboard.writeText(text);
      el.btOutText.textContent = t('digest.copied');
    } catch {
      GB.snapshot.download(new Blob([text], { type: 'text/markdown' }), bitFile('md')); // sin permiso del portapapeles, se guarda
    }
    el.btUndo.hidden = true;
  });
  $('#bt-save').addEventListener('click', () => GB.snapshot.download(new Blob([GB.bitacora.toMarkdown(bitCompute(), bitFormat())], { type: 'text/markdown' }), bitFile('md')));
  $('#bt-json').addEventListener('click', () => GB.snapshot.download(new Blob([JSON.stringify(GB.bitacora.toEstado(bitCompute(), bitFormat()), null, 2) + '\n'], { type: 'application/json' }), bitFile('json')));

  /* ---------- el prompt del loop autónomo: para que Claude Code desarrolle el repo solo (ver loopprompt.js) ---------- */
  const lp = { dialog: $('#loop-prompt'), repo: $('#lp-repo'), lang: $('#lp-lang'), integration: $('#lp-integration'), release: $('#lp-release'), goal: $('#lp-goal'), text: $('#lp-text'), size: $('#lp-size'), out: $('#lp-out') };
  const LP_FIELDS = ['repo', 'integration', 'release', 'goal'];
  let lpTab = null; // el repo para el que se abrió: lo escrito se guarda para él (en la demo, no se guarda)
  const lpRead = () => ({ repo: lp.repo.value, integration: lp.integration.value, release: lp.release.value, goal: lp.goal.value, lang: lp.lang.value });
  function lpRender() {
    const text = GB.loopPrompt.build(lpRead());
    lp.text.value = text; // como valor, no como texto del nodo: el prompt nombra cosas como {n} que no son claves
    lp.size.textContent = t('loopPrompt.chars', { n: text.length });
    return text;
  }
  function openLoopPrompt() {
    if (!active) return;
    lpTab = active;
    const repo = active.source.data.repo;
    const saved = active.demo ? {} : U.store.get('loopPrompt:' + active.key, {});
    const v = { repo: active.demo ? '' : nameOf(active), integration: repo.defaultBranch || 'main', release: '', goal: '', lang: i18n.locale === 'es' ? 'es' : 'en', ...saved };
    for (const k of LP_FIELDS) lp[k].value = typeof v[k] === 'string' ? v[k] : '';
    lp.lang.value = GB.loopPrompt.LANGS.includes(v.lang) ? v.lang : 'en';
    lp.out.textContent = '';
    lpRender();
    if (typeof lp.dialog.showModal === 'function') lp.dialog.showModal();
    else lp.dialog.setAttribute('open', '');
  }
  function closeLoopPrompt() {
    if (typeof lp.dialog.close === 'function') lp.dialog.close();
    else lp.dialog.removeAttribute('open');
  }
  $('#loop-btn').addEventListener('click', openLoopPrompt);
  $('#bt-loop').addEventListener('click', () => {
    closeBitacora();
    openLoopPrompt();
  });
  $('#lp-close').addEventListener('click', closeLoopPrompt);
  for (const k of [...LP_FIELDS, 'lang'])
    lp[k].addEventListener('input', () => {
      lpRender();
      lp.out.textContent = '';
      if (lpTab && !lpTab.demo) U.store.set('loopPrompt:' + lpTab.key, lpRead());
    });
  $('#lp-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = lpRender();
    try {
      await navigator.clipboard.writeText(text);
      lp.out.textContent = t('digest.copied');
    } catch {
      lp.text.focus();
      lp.text.select(); // sin permiso del portapapeles: queda seleccionado para copiar a mano
    }
  });
  $('#lp-save').addEventListener('click', () => GB.snapshot.download(new Blob([lpRender()], { type: 'text/markdown' }), GB.snapshot.fileName(lp.repo.value.trim() || 'loop', { ext: 'md', kind: 'loop' })));

  /* ---------- vista de texto: el árbol de ramas y commits para teclado y lector de pantalla (ver textview.js) ---------- */
  function closeTextview() {
    if (typeof el.textview.close === 'function') el.textview.close();
    else el.textview.removeAttribute('open');
  }
  const textview = GB.textview.mount(el.textviewBody, {
    filterInput: el.textviewFilter,
    live: el.textviewLive,
    scopeEl: $('#textview-scope'),
    showAllEl: $('#textview-showall'),
    text: (k, p) => t(k, p),
    ago: (ms) => U.timeAgo(ms),
    canHide: () => !allOn, // en la vista conjunta no se ocultan ramas (como en el grafo)
    onView: (name, how) => {
      onBranchView(name, how);
      textview.update(textTree(viewOf(source.view ? source.view() : source.data).data), textScope());
      textview.say(GB.textview.viewNote(how, name, branchView.solo, t));
    },
    onReset: () => {
      setBranchView({ hidden: [], solo: '' });
      textview.update(textTree(viewOf(source.view ? source.view() : source.data).data), textScope());
      textview.say(GB.textview.viewNote('all', '', '', t));
    },
    onGo: ({ branch, sha }) => {
      closeTextview();
      if (sha && shownGraph().focusSha) shownGraph().focusSha(sha);
      else shownGraph().focusBranch(branch);
    },
  });
  /** El árbol de `data` con los filtros de ruta y los releases que el feed dice de este repo. */
  const textTree = (data) => GB.textview.build(data, { withForks: showForks, pullsKnown: GB.textview.pullsComplete(source?.data), paths: pathShas, releases: GB.textview.releaseMarks(feed.items.filter((a) => a.repo === active?.key)), fresh: GB.textview.freshBranches(feed.items.filter((a) => a.repo === active?.key)) });
  /** El árbol con los filtros del grafo (autor y ruta) y una nota que los dice, también para el lector de pantalla. */
  function textScope() {
    const v = viewOf(source.view ? source.view() : source.data);
    const name = authorFilter && (GB.search.authors(source.data).find((a) => a.key === authorFilter)?.name || authorFilter);
    return authorFilter || pathShas || branchViewOn() || firstParentOn ? { author: name, shown: v.shown, total: v.total, branches: branchViewOn() ? { shown: v.shown, total: v.total } : null, path: pathShas ? pathText : '', count: pathShas ? pathShas.size : 0 } : null;
  }
  function openTextview() {
    textview.render(textTree(viewOf(source.view ? source.view() : source.data).data), textScope());
  }
  function showTextview() {
    openTextview();
    if (typeof el.textview.showModal === 'function') el.textview.showModal();
    else el.textview.setAttribute('open', '');
    el.textviewBody.querySelector('[tabindex="0"]')?.focus();
  }
  $('#textview-btn').addEventListener('click', showTextview);
  let initialPr = 0; // ?pr=N: la vista de ese pull request (descripción y comentarios) al abrir, una vez
  /** La vista del PR que pide la URL: una consulta (`prDetail`), en un diálogo; sin soporte de la fuente, no abre nada. */
  async function startUrlPr() {
    const n = initialPr;
    const src = source;
    initialPr = 0;
    if (!n || !src.prDetail) return;
    el.prviewTitle.textContent = t('prview.title', { n });
    el.prviewBody.textContent = t('prview.busy');
    if (typeof el.prview.showModal === 'function') el.prview.showModal();
    else el.prview.setAttribute('open', '');
    el.prviewBody.focus();
    try {
      const d = await src.prDetail(n);
      if (src !== source || !el.prview.open) return;
      el.prviewBody.innerHTML = GB.graphShared.prBodyHTML(d || {});
    } catch {
      el.prviewBody.textContent = t('prview.fail');
    }
  }
  $('#prview-close').addEventListener('click', () => {
    if (typeof el.prview.close === 'function') el.prview.close();
    else el.prview.removeAttribute('open');
  });
  let initialText = false; // ?vista=texto: se abre una vez, con ?path= y ?q= aplicados a la vista
  /** La vista de texto que pide la URL: espera al filtro por ruta, lo abre y escribe el ?q= en su filtro de ramas. */
  async function startUrlText() {
    const q = initialQuery;
    const path = initialPath;
    initialText = false;
    initialQuery = '';
    initialPath = '';
    if (path) {
      pathEl.input.value = path;
      await applyPathFilter();
    }
    showTextview();
    if (q) textview.setFilter(q);
  }
  $('#textview-close').addEventListener('click', closeTextview);

  /* ---------- constelación: cada repo seguido, una galaxia (ver constellation.js) ---------- */
  const constellation = GB.constellation.mount($('#constellation-body'), {
    text: t,
    fmt: U.fmtNum,
    ago: (ms) => U.timeAgo(ms),
    select: $('#constellation-order'),
    status: $('#constellation-status'),
    onGo(key) {
      const tab = tabs.find((x) => x.key === key);
      if (typeof el.constellation.close === 'function') el.constellation.close();
      else el.constellation.removeAttribute('open');
      if (tab) showTab(tab);
    },
  });
  el.constellation = $('#constellation');
  try {
    // ?order=activity|prs|issues|stars|forks|new|name: la constelación abre ya ordenada (sin anunciarlo: no la pidió nadie con el selector)
    const order = GB.constellation.orderParam(new URLSearchParams(location.search));
    if (order) constellation.setOrder(order, false);
    // ?constellation=texto: solo los repos cuyo nombre lo contiene
    constellation.setFilter(GB.constellation.filterParam(new URLSearchParams(location.search)));
    // ?recent=30: solo los repos con algún commit en los últimos 30 días
    constellation.setRecent(GB.constellation.recentParam(new URLSearchParams(location.search)));
  } catch {
    /* sin query string */
  }
  /** Fecha (ms) del commit más reciente cargado, o `null` si aún no hay ninguno. */
  function lastCommitAt(data) {
    let last = null;
    for (const c of data.commits?.values() || []) if (Number.isFinite(c.date) && (last === null || c.date > last)) last = c.date;
    return last;
  }
  $('#constellation-btn').addEventListener('click', () => {
    constellation.render(
      tabs
        .filter((x) => x.source)
        .map((x) => ({
          key: x.key,
          name: nameOf(x),
          commits: x.source.data.commits?.size || 0,
          last: lastCommitAt(x.source.data),
          branches: x.source.data.branches?.size || 0,
          prs: Math.max(x.source.data.totalPulls || 0, x.source.data.pulls?.size || 0),
          issues: GB.constellation.openIssues(x.source.data),
          stars: GB.constellation.starsOf(x.source.data),
          forks: GB.constellation.forksOf(x.source.data),
          fresh: GB.constellation.newBranches(feed.items.filter((a) => a.repo === x.key), Date.now()),
          state: x.status?.state || 'loading',
          unread: x.unread,
          active: x === active,
        })),
    );
    if (typeof el.constellation.showModal === 'function') el.constellation.showModal();
    else el.constellation.setAttribute('open', '');
    ($('#constellation-body .cs-gx[aria-current]') || $('#constellation-body .cs-gx'))?.focus();
  });
  $('#constellation-close').addEventListener('click', () => el.constellation.close?.() ?? el.constellation.removeAttribute('open'));

  /* ---------- búsqueda de commits por mensaje, SHA o autor (ver search.js) ---------- */
  function closeSearch() {
    if (typeof el.search.close === 'function') el.search.close();
    else el.search.removeAttribute('open');
  }
  const search = GB.search.mount(
    { input: $('#search-input'), select: $('#search-author'), list: $('#search-list'), status: $('#search-status') },
    {
      text: (k, p) => t(k, p),
      ago: (ms) => U.timeAgo(ms),
      data: () => source.data,
      onGo: (sha) => {
        closeSearch();
        shownGraph().focusSha?.(sha);
      },
    }
  );
  function openSearch() {
    search.open();
    fillGraphAuthor();
    if (typeof el.search.showModal === 'function') el.search.showModal();
    else el.search.setAttribute('open', '');
    $('#search-input').focus();
  }
  $('#search-btn').addEventListener('click', openSearch);

  /* ---------- paleta de comandos, Ctrl+K (ver cmdk.js) ---------- */
  if (!EMBED) {
    const cmdBtn = (a) => $(a.btn);
    const palette = GB.cmdk.mount(
      { dialog: $('#cmdk'), input: $('#cmdk-input'), list: $('#cmdk-list'), status: $('#cmdk-status') },
      {
        text: (k, p) => t(k, p),
        available: (a) => {
          const b = cmdBtn(a);
          // plegar el panel de actividad solo tiene sentido con el panel al lado del grafo (en una columna va debajo)
          if (a.id === 'feedFold' && !matchMedia('(min-width: 861px)').matches) return false;
          return !!b && !b.disabled && !b.closest('[hidden]');
        },
        run: (a) => cmdBtn(a)?.click(),
        targets: (q) => GB.cmdk.jumpTargets(source.data, q),
        jump: (j) => (j.kind === 'branch' ? shownGraph().focusBranch(j.name) : shownGraph().focusSha?.(j.sha)),
      }
    );
    document.addEventListener('keydown', (ev) => {
      if (!GB.cmdk.isShortcut(ev) || ev.defaultPrevented) return;
      ev.preventDefault();
      if ($('#cmdk').open) palette.close();
      else if (!document.querySelector('dialog[open]')) palette.open();
    });
    // el botón de la barra: la misma paleta, para quien no sabe del atajo (que se ve a su lado: ⌘K en Mac)
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')) $('#cmdk-kbd').textContent = '⌘K';
    $('#cmdk-btn').addEventListener('click', () => palette.open());
  } else $('#cmdk-btn').hidden = true;
  $('#search-input').addEventListener('input', () => {
    if (!initialQuery) setUrlParam('q', $('#search-input').value.trim().slice(0, 100)); // la búsqueda se comparte con la URL
  });
  let initialQuery = ''; // ?q=texto: se abre una vez, con la primera historia del repo a la vista
  /** La búsqueda que pide la URL, una sola vez y con la primera historia que llega. */
  function startUrlQuery() {
    $('#search-input').value = initialQuery;
    initialQuery = '';
    openSearch();
  }
  $('#search-close').addEventListener('click', closeSearch);

  const syncFiltered = () => $('#search-btn').classList.toggle('filtered', !!authorFilter || !pathEl.clear.hidden || branchViewOn() || firstParentOn);
  const graphAuthor = $('#graph-author');
  function fillGraphAuthor() {
    graphAuthor.textContent = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = t('search.anyAuthor');
    graphAuthor.appendChild(all);
    const list = GB.search.authors(source.data);
    if (authorFilter && !list.some((a) => a.key === authorFilter)) list.push({ key: authorFilter, name: authorFilter, count: 0 });
    for (const a of list) {
      const o = document.createElement('option');
      o.value = a.key;
      o.textContent = `${a.name} (${a.count})`;
      graphAuthor.appendChild(o);
    }
    graphAuthor.value = authorFilter;
    graphAuthorStatus();
    branchViewStatus();
  }
  function graphAuthorStatus() {
    const { shown, total } = authorView(source.view ? source.view() : source.data);
    $('#graph-author-status').textContent = authorFilter ? t('search.graphAuthorCount', { n: shown, total }) : '';
  }
  const branchViewReset = $('#branch-view-reset');
  function branchViewStatus() {
    const on = branchViewOn();
    branchViewReset.hidden = !on;
    const { shown, total } = viewOf(source.view ? source.view() : source.data);
    $('#branch-view-status').textContent = on ? t('branchview.status', { n: shown, total }) : '';
  }
  branchViewReset.addEventListener('click', () => {
    setBranchView({ hidden: [], solo: '' });
    graphAuthor.focus(); // el botón se esconde: el foco no se pierde
  });
  const columnsEl = $('#graph-columns');
  columnsEl.checked = U.store.get('columns', false) === true; // SHA, autor y fecha junto a cada commit del 2D y del 3D: de quien lo enciende, en todos sus repos
  for (const g of [graph2d, graph3d]) g?.setColumns?.(columnsEl.checked);
  columnsEl.addEventListener('change', () => {
    U.store.set('columns', columnsEl.checked ? true : null);
    for (const g of [graph2d, graph3d]) g?.setColumns?.(columnsEl.checked);
  });
  $('#graph-firstparent').addEventListener('change', (e) => {
    firstParentOn = e.target.checked;
    U.store.set('firstparent:' + repoKey(), firstParentOn ? true : null);
    setUrlParam('firstparent', firstParentOn ? '1' : '');
    syncFiltered();
    if (lastRender) {
      const { data, L } = drawGraph(false, true);
      renderSummary(data, L);
    }
  });
  graphAuthor.addEventListener('change', () => {
    authorFilter = graphAuthor.value;
    U.store.set('author:' + repoKey(), authorFilter || null);
    setUrlParam('author', authorFilter);
    syncFiltered();
    graphAuthorStatus();
    if (lastRender) {
      const { data, L } = drawGraph(false, true);
      renderSummary(data, L);
    }
  });

  /* Filtro por ruta: los commits que tocaron un archivo o carpeta quedan a plena luz y el resto se atenúa. */
  const pathEl = { input: $('#search-path'), go: $('#search-path-go'), clear: $('#search-path-clear'), status: $('#search-path-status') };
  let pathToken = 0;
  let pathShas = null; // los commits del filtro por ruta activo (para la vista de texto) y su texto
  let pathText = '';
  let initialPath = ''; // ?path=src/: se aplica una vez, con la primera historia del repo a la vista
  function clearPathFilter() {
    pathToken++;
    pathShas = null;
    pathText = '';
    if (!initialPath) setUrlParam('path', '');
    for (const g of [graph2d, graph3d]) g?.setPathFilter?.(null);
    $('#search-path-clear').hidden = true;
    $('#search-path-status').textContent = '';
    syncFiltered();
  }
  async function applyPathFilter() {
    const path = pathEl.input.value.trim();
    if (!path) return clearPathFilter();
    if (typeof source.commitsByPath !== 'function') {
      pathEl.status.textContent = t('search.pathUnsupported');
      return;
    }
    const mine = ++pathToken;
    pathEl.go.disabled = true;
    try {
      const shas = await source.commitsByPath(path);
      if (mine !== pathToken) return;
      for (const g of [graph2d, graph3d]) g?.setPathFilter?.(shas);
      pathShas = shas.size ? shas : null;
      pathText = path;
      pathEl.clear.hidden = false;
      setUrlParam('path', path); // la vista filtrada se comparte con la URL
      syncFiltered();
      pathEl.status.textContent = shas.size ? t('search.pathCount', { n: shas.size, path }) : t('search.pathNone');
    } catch {
      if (mine === pathToken) pathEl.status.textContent = t('search.pathFail');
    } finally {
      pathEl.go.disabled = false;
    }
  }
  /** «Historial» de un archivo del diff: el filtro por ruta aplicado a ese archivo, con un aviso de cuántos commits tocó. */
  async function fileHistory(path) {
    pathEl.input.value = path;
    await applyPathFilter();
    if (pathEl.input.value !== path) return; // otro filtro pisó a este mientras la consulta volvía
    feed.toast({ kind: 'other', title: t('diff.historyOf', { path }), detail: pathEl.status.textContent, time: Date.now() });
  }
  /** El filtro que pide la URL, una sola vez y con la primera historia que llega. */
  function startUrlPath() {
    pathEl.input.value = initialPath;
    initialPath = '';
    applyPathFilter();
  }
  pathEl.go.addEventListener('click', applyPathFilter);
  pathEl.clear.addEventListener('click', () => {
    pathEl.input.value = '';
    clearPathFilter();
  });
  pathEl.input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    applyPathFilter();
  });

  /** Tags y entornos de despliegue por commit: sha -> { tags: [nombre], envs: [entorno] }. */
  function refsBySha(data) {
    const map = new Map();
    const at = (sha) => map.get(sha) || map.set(sha, { tags: [], envs: [] }).get(sha);
    if (data.tags) for (const [sha, names] of data.tags) if (data.commits.has(sha)) at(sha).tags.push(...names);
    if (data.deploys) for (const [env, d] of data.deploys) if (data.commits.has(d.sha)) at(d.sha).envs.push(env);
    return map;
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
    if (U.safeUrl(repo.url)) {
      el.repoLink.href = U.safeUrl(repo.url);
      el.repoLink.removeAttribute('aria-disabled');
    } else {
      el.repoLink.removeAttribute('href');
      el.repoLink.setAttribute('aria-disabled', 'true');
    }
    el.repoBadge.textContent = badgeOf(repo);
    el.repoBadge.hidden = !el.repoBadge.textContent;
    el.repoBadge.className = `badge${repo.demo ? ' demo' : ''}`;
    el.repoDesc.textContent = repo.rehearsal ? t('practice.rehearseGoal', { repo: `${repo.owner}/${repo.name}` }) : repo.practice ? t('practice.desc') : repo.demo ? t('repo.demoDesc') : repo.description || '';
    el.repoDesc.hidden = !el.repoDesc.textContent;
    feed.setBaseTitle(`${full} · GraphBranch`);
    renderTokenBanner();
    updateRehearse();
  }

  function renderTokenBanner() {
    const data = source?.data;
    // el aviso es del token de GitHub: a un proyecto de GitLab o de Codeberg no le cambia nada
    const show = data && !data.repo.demo && !FORGES[data.repo.host] && !settings.token && data.mode;
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
    renderBitacoraCard();
  }

  /** El detalle de cada cifra, de title de su tarjeta: a ≤560 px la línea se esconde a la vista. */
  function syncStatTitles() {
    for (const sub of [el.st.branchesSub, el.st.commitsSub, el.st.prsSub, el.st.lastSub]) {
      const card = sub.closest('.stat');
      if (card) card.title = sub.textContent;
    }
  }

  /** Cifras en blanco hasta que el repo recién conectado traiga las suyas. */
  function clearStats() {
    for (const [key, node] of Object.entries(el.st)) node.textContent = key.endsWith('Sub') ? '' : '–';
    el.st.branchesSub.title = '';
    syncStatTitles();
    clearTimeout(bitCard.timer);
    bitCard = { at: 0, key: null, timer: 0 };
    el.stBitScore.textContent = '–';
    el.stBitTrend.textContent = '';
    el.stBitSub.textContent = '';
    el.stBit.removeAttribute('aria-label');
    el.stBit.hidden = !bitOn();
  }

  function renderLast() {
    const last = active ? feed.lastTime(active.key) : null;
    el.st.last.textContent = last ? U.timeAgo(last) : '–';
    el.st.lastSub.textContent = last ? U.fmtDateTime(last) : t('stats.noEvents');
    syncStatTitles();
  }

  /* ---------- estado de conexión ---------- */

  function onStatus(tab, s) {
    const changed = tab.status?.state !== s.state;
    tab.status = s;
    if (changed) renderTab(tab);
    if (changed && allOn) syncAll();
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
    const text = s.demo && s.state === 'live' ? t('status.demoLive') : U.statusKey(s) ? t(U.statusKey(s)) : s.state;
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
    else if (action === 'settings') openSettings({ gitlab: el.gitlabTokenInput, codeberg: el.codebergTokenInput, bitbucket: el.bitbucketTokenInput, bitbucketdc: el.bbdcTokenInput, forgejo: el.forgeTokenInput, azure: el.azureTokenInput }[source?.host] || el.tokenInput);
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
  el.practiceBtn.addEventListener('click', () => startPractice());
  el.rehearseBtn.addEventListener('click', () => startRehearsal());
  /* Abrir carpeta (solo en la app de escritorio): el diálogo del sistema elige un repo de esta máquina y el
     proceso principal lo lee con git; la página recibe su id (electron/git.js). */
  el.folderBtn.hidden = !desktop?.git;
  el.folderBtn.addEventListener('click', async () => {
    try {
      const picked = await desktop.git.pick();
      if (picked) connectRepo(`local:${picked.id}/${picked.name}`);
    } catch (err) {
      repoNote(/nogit/.test(err?.message) ? t('err.noGit') : t('repo.notGit'));
    }
  });

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
    cortex?.setActive(cortexLive());
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
    if (ev.key === ' ' && !ev.defaultPrevented && replay.active && !tv.on && !ev.target.closest('button, input, select, textarea, a, [contenteditable]')) {
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
  const tv = { on: false, prevView: null, prevAgents: false, prevAll: false, lock: null, locking: false, attract: false, lastNews: 0, lastAttract: 0, lastSwitch: 0, idleTimer: 0 };
  const tvBarHome = el.tvBar.parentNode; // sobre el grafo; con la vista de agentes va a la cabecera del tablero

  /** La barra del modo TV, donde se ve: sobre el grafo o, con la vista de agentes, en la cabecera del tablero (el grafo
      queda escondido y ella con él). Si tenía el foco, lo conserva. */
  function placeTvBar() {
    const host = allOn ? el.allPanel.querySelector('.panel-head') : agentsOn ? el.agents.querySelector('.ab-head') : tvBarHome;
    if (!host || el.tvBar.parentNode === host) return;
    const had = el.tvBar.contains(document.activeElement) ? document.activeElement : null;
    host.append(el.tvBar);
    had?.focus({ preventScroll: true });
  }

  /** El foco del modo TV: en lo que se ve (el grafo o, con la vista de agentes, su panel), donde están los atajos del
      modo; no en la barra, que no se escondería mientras lo tenga. */
  const tvFocus = () => (allOn ? el.allPanel : agentsOn ? el.graphPanel : graph3d ? el.graph3d : el.graph).focus({ preventScroll: true });

  /** En modo TV, la pantalla pasa del grafo (con el director) al tablero de agentes y vuelve. No cambia lo guardado:
      al salir del modo TV queda la vista que había antes de entrar. */
  function tvShowAgents(on) {
    if (!tv.on) return;
    const before = document.activeElement;
    if (on && tv.attract && replay.active) replay.stop(); // el tablero es el presente: el Replay de ambiente se acaba
    tv.attract = false;
    if (on && allOn) setAll(false, { save: false }); // una pantalla por vez
    setAgentsView(on, { save: false });
    // el foco no se queda en lo que se escondió (ni en la barra): pasa a lo que ahora se ve
    if (!before || before === document.body || el.graphPanel.contains(before) || el.allPanel.contains(before)) tvFocus();
  }

  /** En modo TV, la pantalla pasa del grafo (con el director) a todos los repos seguidos a la vez, cada uno en su
      tarjeta, y vuelve. Tampoco cambia lo guardado. */
  function tvShowAll(on) {
    if (!tv.on || (on && tabs.length < 2)) return;
    const before = document.activeElement;
    if (on && tv.attract && replay.active) replay.stop(); // con todos a la vista no hay Replay de ambiente
    tv.attract = false;
    setAll(on, { save: false });
    if (!before || before === document.body || el.graphPanel.contains(before) || el.allPanel.contains(before)) tvFocus();
  }

  /** En modo TV, las tarjetas de la vista conjunta entran todas en la pantalla: tantas columnas y filas como pide
      su cantidad en el lugar que hay (--tv-cols, --tv-rows; ver GB.overview.fitGrid). */
  const allGrid = $('#all-grid');
  function fitTvGrid() {
    if (!tv.on || !allOn) return;
    const n = allGrid.children.length;
    const r = allGrid.getBoundingClientRect();
    const { cols, rows } = GB.overview.fitGrid(n, r.width, r.height);
    allGrid.style.setProperty('--tv-cols', String(cols));
    allGrid.style.setProperty('--tv-rows', String(rows));
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitTvGrid()).observe(allGrid);

  /** Entra o sale del modo TV. `user`: viene de un clic (solo así se puede pedir pantalla completa). */
  function setTV(on, user = false) {
    if (tv.on === on) return;
    tv.on = on;
    const root = document.documentElement;
    // el botón TV (en la barra que el modo esconde) o el de salir (en la barra del modo) tenía el foco
    const lostFocus = (on ? [el.tvBtn, el.allTvBtn] : [el.tvBar]).some((b) => b.contains(document.activeElement));
    root.classList.toggle('tv', on);
    setPressed(el.tvBtn, on);
    setPressed(el.allTvBtn, on);
    if (on) {
      // desde la vista conjunta se queda en ella (todos los repos a la vez); si no, el grafo con el director, que pasa
      // solo de un repo a otro. La R (o su botón) cambia de una a otra
      tv.prevAll = allOn;
      diffView.close(); // la pantalla compartida no es la de los cambios de un commit
      tv.prevView = view;
      tv.prevAgents = agentsOn || initialAgents; // con ?tv=1&agents=1 el tablero llega cuando el repo tiene grafo
      tv.lastNews = tv.lastAttract = Date.now();
      if (graph3d) setView('3d', false); // detrás, el grafo en 3D con el director
      if (tv.prevAgents && !initialAgents && !allOn) setAgentsView(true, { save: false }); // desde la vista de agentes, se queda en ella
      feed.sound = false; // en un espacio compartido el sonido llega a todos: se enciende a mano
      graph3d?.flight?.exit(); // la pantalla compartida la lleva el director, no un piloto
      director?.setTV(true);
      director?.setOn(true);
      if (user && fullscreenOK && !fullscreenEl()) requestFs(root);
      placeTvBar();
      tvScale();
      lockScreen();
      // el foco pasa al grafo (o al tablero de agentes), donde están los atajos del modo (espacio, F, A, Esc); no a la
      // barra, que no se escondería mientras tenga el foco
      if (lostFocus || document.activeElement === document.body) tvFocus();
    } else {
      if (tv.attract && replay.active) replay.stop();
      tv.attract = false;
      feed.sound = !!U.store.get('sound', false);
      director?.setTV(false);
      director?.setOn(!!U.store.get('director', false));
      if (fullscreenEl() === root) exitFs();
      setView(tv.prevView || view, false);
      if (tv.prevAgents) setAgentsView(true, { save: false }); // se vuelve a la vista de agentes si se entró desde ella
      setAll(tv.prevAll, { save: false }); // y a la vista conjunta, si se entró desde ella (o se sale de la que se abrió en TV)
      tv.lock?.release().catch(() => {});
      tv.lock = null;
      root.style.removeProperty('--tvz');
      // también si lo que tenía el foco se escondió (el grafo, al volver a la vista de agentes): el navegador lo suelta
      // recién al dibujar, así que se mira si todavía se ve
      const at = document.activeElement;
      if (lostFocus || !at || at === document.body || !at.getClientRects().length) (allOn ? el.allTvBtn : el.tvBtn).focus({ preventScroll: true });
    }
    setPressed(el.soundBtn, feed.sound);
    setPressed(el.tvSound, feed.sound);
    cortex?.setActive(cortexLive()); // la pausa del modo TV también detiene la corteza
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
    markCut(); // con otra letra, en lo último y en el log cabe otra cantidad
    fitTvGrid();
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
    // con el tablero de agentes a la vista no hay grafo que reproducir: el tablero ya es lo que pasa ahora
    if (paused || replay.active || agentsOn || allOn || !lastRender || lastRender.L.nodes.length < 8) return;
    if (now - tv.lastNews < ATTRACT_IDLE || now - tv.lastAttract < ATTRACT_EVERY) return;
    tv.lastAttract = now;
    tv.attract = true;
    toggleReplay();
    if (!replay.active) tv.attract = false;
  }

  el.tvBtn.addEventListener('click', () => setTV(!tv.on, true));
  el.allTvBtn.addEventListener('click', () => setTV(!tv.on, true));
  el.tvAgents.addEventListener('click', () => tvShowAgents(!agentsOn));
  el.tvAll.addEventListener('click', () => tvShowAll(!allOn));
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
  // en modo TV: espacio pausa todo, F pone la página entera en pantalla completa, A pasa del grafo al tablero de agentes
  // (y vuelve), R a todos los repos a la vez (y vuelve) y Esc sale del modo
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
    } else if (k === 'a') {
      ev.preventDefault();
      tvShowAgents(!agentsOn);
    } else if (k === 'r' && tabs.length > 1) {
      ev.preventDefault();
      tvShowAll(!allOn);
    }
  });

  el.view3d.addEventListener('click', () => setView('3d'));
  el.view2d.addEventListener('click', () => setView('2d'));
  if (!graph3d) el.view3d.disabled = true;
  function renderWebglNote() {
    el.view3d.title = graph3d ? '' : t('webgl.missing');
  }
  if (graph3d && EMBED && GB.embedOptions(location.search)?.spin === false) graph3d.spin = false; // &spin=0: capa quieta, sin guardarlo
  setPressed(el.spinBtn, !!graph3d?.spin);
  el.spinBtn.addEventListener('click', () => {
    graph3d?.setSpin(!graph3d.spin);
    setPressed(el.spinBtn, !!graph3d?.spin);
  });
  const embedView = EMBED ? GB.embedOptions(location.search)?.view || '' : ''; // &view=2d|3d: la vista de la capa, sin guardarla
  setView(embedView || U.store.get('view', '3d'), !embedView);
  if (!EMBED && U.store.get('agentsView', false) === true) setAgentsView(true, { save: false }); // se dejó en la vista de agentes
  director?.setOn(!!U.store.get('director', false));
  renderDirector();
  renderPause();
  renderWebglNote();

  /* ---------- ajustes ---------- */

  /** Abre Ajustes con el foco en `focus` (el campo del token de GitHub, si no se dice otro). */
  function openSettings(focus = el.tokenInput) {
    el.tokenInput.value = settings.token;
    el.gitlabTokenInput.value = settings.gitlabToken;
    el.codebergTokenInput.value = settings.codebergToken;
    el.bitbucketTokenInput.value = settings.bitbucketToken;
    el.azureTokenInput.value = settings.azureToken;
    el.bbdcTokenInput.value = settings.bbdcToken;
    el.forgeTokenInput.value = settings.forgeToken;
    el.token2Owner.value = settings.account2.owner;
    el.token2Input.value = settings.account2.token;
    for (const [input, toggle] of tokenFields) {
      input.type = 'password';
      toggle.textContent = t('settings.show');
    }
    el.depth.value = settings.depth;
    el.marks.checked = settings.marks;
    for (const f of hookFields) {
      f.input.value = hookUrls[f.service];
      f.state.textContent = '';
      const on = GB.hooks.chosen(hookPrefs, f.service);
      for (const box of f.boxes) box.checked = on.includes(box.dataset.event);
    }
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
    (focus instanceof HTMLElement ? focus : el.tokenInput).focus();
  }

  function closeSettings() {
    if (typeof el.dialog.close === 'function') el.dialog.close();
    else el.dialog.removeAttribute('open');
  }

  /** Los avisos de Ajustes (solo escritorio): por servicio, su URL, los eventos que recibe y una prueba. */
  const hookFields = !desktop
    ? []
    : GB.hooks.SERVICES.map((service) => {
        const name = { slack: 'Slack', discord: 'Discord', teams: 'Microsoft Teams' }[service];
        const row = document.createElement('div');
        row.className = 'field hook';
        const events = GB.hooks.EVENTS.map(
          (e) => `<label><input type="checkbox" data-event="${e}"> <span>${U.esc(t('kind.' + { ci: 'ci-fail' }[e] || e))}</span></label>`,
        ).join('');
        row.innerHTML = `
          <label for="hook-${service}">${U.esc(t('settings.webhook', { service: name }))} <span class="opt">${U.esc(t('settings.optional'))}</span></label>
          <div class="field-row">
            <input id="hook-${service}" type="password" autocomplete="off" spellcheck="false" placeholder="${{ slack: 'https://hooks.slack.com/services/…', discord: 'https://discord.com/api/webhooks/…', teams: 'https://….logic.azure.com/workflows/…' }[service]}">
            <button type="button" class="btn btn-ghost hook-toggle"></button>
            <button type="button" class="btn btn-ghost hook-test">${U.esc(t('settings.hooksTest'))}</button>
          </div>
          <div class="hook-events">${events}</div>
          <span class="hook-state" role="status"></span>`;
        el.hooksList.append(row);
        el.hooksBox.hidden = false;
        const field = { service, input: row.querySelector('input[type=password]'), toggle: row.querySelector('.hook-toggle'), state: row.querySelector('.hook-state'), boxes: [...row.querySelectorAll('[data-event]')] };
        row.querySelector('.hook-test').addEventListener('click', async () => {
          const url = field.input.value.trim();
          field.state.textContent = '';
          try {
            hookUrls[service] = url;
            await desktop.setToken(url, service);
            const r = url ? await desktop.webhook(service, { repo: 'GraphBranch', kind: t('settings.hooksTest'), title: t('settings.hooksTestMsg') }) : { ok: false };
            field.state.textContent = t(r.ok ? 'settings.hooksOk' : 'settings.hooksFail');
          } catch {
            field.state.textContent = t('settings.hooksFail');
          }
        });
        return field;
      });

  /** Los campos de los tokens, cada uno con su botón de mostrar u ocultar. */
  const tokenFields = [
    [el.tokenInput, el.tokenToggle],
    [el.gitlabTokenInput, el.gitlabTokenToggle],
    [el.codebergTokenInput, el.codebergTokenToggle],
    [el.bitbucketTokenInput, el.bitbucketTokenToggle],
    [el.azureTokenInput, el.azureTokenToggle],
    [el.bbdcTokenInput, el.bbdcTokenToggle],
    [el.forgeTokenInput, el.forgeTokenToggle],
    [el.token2Input, el.token2Toggle],
    ...hookFields.map((f) => [f.input, f.toggle]),
  ];
  const showToggle = (input, toggle) => (toggle.textContent = input.type === 'password' ? t('settings.show') : t('settings.hide'));

  el.settingsBtn.addEventListener('click', () => openSettings());
  $('#token-banner-btn').addEventListener('click', () => openSettings());
  el.settingsCancel.addEventListener('click', closeSettings);
  for (const [input, toggle] of tokenFields) {
    toggle.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      showToggle(input, toggle);
    });
  }
  el.tokenClear.addEventListener('click', () => {
    el.tokenInput.value = '';
    el.gitlabTokenInput.value = '';
    el.codebergTokenInput.value = '';
    el.bitbucketTokenInput.value = '';
    el.azureTokenInput.value = '';
    el.bbdcTokenInput.value = '';
    el.forgeTokenInput.value = '';
    el.token2Owner.value = '';
    el.token2Input.value = '';
    for (const f of hookFields) f.input.value = '';
    el.tokenInput.focus();
  });
  el.settingsForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const before = { ...settings };
    settings.token = el.tokenInput.value.trim();
    settings.gitlabToken = el.gitlabTokenInput.value.trim();
    settings.codebergToken = el.codebergTokenInput.value.trim();
    settings.bitbucketToken = el.bitbucketTokenInput.value.trim();
    settings.azureToken = el.azureTokenInput.value.trim();
    if (BITBUCKET_URL) settings.bbdcToken = el.bbdcTokenInput.value.trim(); // sin servidor elegido, el campo no se ve y lo guardado queda como está
    if (FORGE_URL) settings.forgeToken = el.forgeTokenInput.value.trim();
    const account2Stored = GB.GitHubSource.pack2(el.token2Owner.value, el.token2Input.value); // sin dueño o sin token, no hay segunda cuenta
    settings.account2 = GB.GitHubSource.unpack2(account2Stored);
    const bbdcStored = GB.BitbucketServerSource.pack(settings.bbdcToken, BITBUCKET_URL) || null;
    const forgeStored = GB.CodebergSource.pack(settings.forgeToken, FORGE_URL) || null;
    settings.depth = Math.max(10, Math.min(100, Number(el.depth.value) || 40));
    settings.marks = el.marks.checked;
    if (desktop) {
      const failed = (err) => console.error('No se pudo guardar el token:', err);
      desktop.setToken(settings.token).then(showTokenWhere, failed);
      desktop.setToken(settings.gitlabToken, 'gitlab').catch(failed);
      desktop.setToken(settings.codebergToken, 'codeberg').catch(failed);
      desktop.setToken(settings.bitbucketToken, 'bitbucket').catch(failed);
      desktop.setToken(settings.azureToken, 'azure').catch(failed);
      if (BITBUCKET_URL) desktop.setToken(bbdcStored || '', 'bitbucketdc').catch(failed);
      if (FORGE_URL) desktop.setToken(forgeStored || '', 'forgejo').catch(failed);
      desktop.setToken(account2Stored, 'github2').catch(failed);
    } else {
      U.secret.set('token', settings.token || null);
      U.secret.set('gitlabToken', settings.gitlabToken || null);
      U.secret.set('codebergToken', settings.codebergToken || null);
      U.secret.set('bitbucketToken', settings.bitbucketToken || null);
      U.secret.set('azureToken', settings.azureToken || null);
      if (BITBUCKET_URL) U.secret.set('bbdcToken', bbdcStored);
      if (FORGE_URL) U.secret.set('forgeToken', forgeStored);
      U.secret.set('account2', account2Stored || null);
    }
    U.store.set('depth', settings.depth);
    U.store.set('marks', settings.marks ? null : false);
    for (const f of hookFields) {
      hookUrls[f.service] = f.input.value.trim();
      hookPrefs[f.service] = f.boxes.filter((b) => b.checked).map((b) => b.dataset.event);
      desktop.setToken(hookUrls[f.service], f.service).catch((err) => console.error('No se pudo guardar el webhook:', err));
    }
    if (hookFields.length) U.store.set('hooks', hookPrefs);
    closeSettings();
    // se reconecta lo que cambió: un token de GitLab nuevo no gasta la cuota de GitHub. Si no cambió
    // nada, todo, como dice el botón
    const changed = (tab) =>
      settings.depth !== before.depth || settings.marks !== before.marks || ({ gitlab: settings.gitlabToken !== before.gitlabToken, codeberg: settings.codebergToken !== before.codebergToken, bitbucket: settings.bitbucketToken !== before.bitbucketToken, forgejo: settings.forgeToken !== before.forgeToken, azure: settings.azureToken !== before.azureToken, bitbucketdc: settings.bbdcToken !== before.bbdcToken }[tab.source.host] ?? (settings.token !== before.token || settings.account2.token !== before.account2.token || settings.account2.owner !== before.account2.owner));
    if (realTabs().length) reconnectAll(realTabs().some(changed) ? changed : undefined);
    else el.tokenBanner.hidden = true;
  });

  /** En la app de escritorio, los avisos de Ajustes dicen si los tokens quedan cifrados ('keychain') o no ('plain'). */
  function showTokenWhere(where) {
    const keychain = where === 'keychain';
    el.tokenWhere.dataset.i18n = keychain ? 'settings.tokenWhereKeychain' : 'settings.tokenWherePlain';
    el.gitlabTokenWhere.dataset.i18n = keychain ? 'settings.gitlabTokenWhereKeychain' : 'settings.gitlabTokenWherePlain';
    el.codebergTokenWhere.dataset.i18n = keychain ? 'settings.codebergTokenWhereKeychain' : 'settings.codebergTokenWherePlain';
    el.bitbucketTokenWhere.dataset.i18n = keychain ? 'settings.bitbucketTokenWhereKeychain' : 'settings.bitbucketTokenWherePlain';
    el.azureTokenWhere.dataset.i18n = keychain ? 'settings.azureTokenWhereKeychain' : 'settings.azureTokenWherePlain';
    for (const note of [el.tokenWhere, el.gitlabTokenWhere, el.codebergTokenWhere, el.bitbucketTokenWhere, el.azureTokenWhere]) note.textContent = t(note.dataset.i18n);
    bbdcWhere = keychain ? 'settings.bbdcTokenWhereKeychain' : 'settings.bbdcTokenWherePlain';
    renderBbdcField();
    renderForgeField();
  }

  /** El campo del token de un Bitbucket propio: solo con un servidor elegido (?bitbucket=, --bitbucket-url=), y su aviso nombra ese host. */
  let bbdcWhere = 'settings.bbdcTokenWhere';
  function renderBbdcField() {
    el.bbdcTokenField.hidden = !BITBUCKET_URL;
    el.bbdcTokenWhere.textContent = BITBUCKET_URL ? t(bbdcWhere, { host: new URL(BITBUCKET_URL).host }) : '';
  }
  renderBbdcField();

  /** El campo del token de un Forgejo/Gitea propio: igual, solo con ?forge= / --forge-url=. Usa los avisos del Bitbucket propio (dicen lo mismo). */
  function renderForgeField() {
    el.forgeTokenField.hidden = !FORGE_URL;
    el.forgeTokenWhere.textContent = FORGE_URL ? t(bbdcWhere, { host: new URL(FORGE_URL).host }) : '';
  }
  renderForgeField();

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
    settings.gitlabToken = (await desktop.getToken('gitlab')).token;
    settings.codebergToken = (await desktop.getToken('codeberg')).token;
    settings.bitbucketToken = (await desktop.getToken('bitbucket')).token;
    settings.azureToken = (await desktop.getToken('azure')).token;
    if (BITBUCKET_URL) settings.bbdcToken = GB.BitbucketServerSource.unpack((await desktop.getToken('bitbucketdc')).token, BITBUCKET_URL);
    if (FORGE_URL) settings.forgeToken = GB.CodebergSource.unpack((await desktop.getToken('forgejo')).token, FORGE_URL);
    settings.account2 = GB.GitHubSource.unpack2((await desktop.getToken('github2')).token);
    for (const service of GB.hooks.SERVICES) hookUrls[service] = (await desktop.getToken(service)).token;
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
    setRecUI(!!recorder);
    sendDesktopLabels();
    fillLanguages();
    setView(view, !tv.on);
    renderPause();
    renderWebglNote();
    for (const [input, toggle] of tokenFields) showToggle(input, toggle);
    renderBbdcField();
    renderForgeField();
    el.repoInput.setCustomValidity('');
    graph2d.relocalize();
    graph3d?.relocalize();
    replay.relocalize();
    lowerThird(null);
    tvTick();
    renderGame();
    feed.relocalize();
    renderTabs();
    overview.relocalize();
    editor.relocalize();
    if (allOn) renderAllSum();
    diffView.relocalize();
    if (lp.dialog.open) lpRender();
    if (agentsOn && source) renderAgents();
    if (!source) return;
    // la demo inventa mensajes, incidencias y comentarios en el idioma activo: se reinicia para no mezclarlos
    if (source.data.repo.practice) practice.render(); // su historia no se inventa: se queda como está
    else if (source.data.repo.demo) return startDemo();
    renderRepo(source.data.repo);
    if (lastRender) renderStats(lastRender.data, lastRender.L);
    renderBitacoraCard(true);
    if (el.bitacora.open) renderBitacora();
    renderStatus();
    if (overlayState) showOverlay(overlayState.kind, overlayState.message, overlayState.fatal);
  });

  /* ---------- arranque ---------- */

  let urlRepos = [];
  let initialTV = false;
  let initialReplay = null; // ?replay=2026-09-01..2026-09-14&title=…: arranca el Replay con ese tramo en cuanto hay historia
  let initialPractice = null; // ?practice=3 o ?practice=<código>: un ejercicio de Aprender git, de la lista o de quien enseña
  let initialAll = null; // ?all=1 o ?all=0: la vista conjunta al abrir (sin decirlo, la que se recuerda)
  try {
    const q0 = new URLSearchParams(location.search);
    initialBitacora = !EMBED && q0.has('bitacora') && !/^(0|false|no|off)$/i.test(q0.get('bitacora'));
    initialHealth = !EMBED && GB.health.healthParam(q0);
    initialAgents = !EMBED && GB.agents.openParam(q0);
    const ig = EMBED ? null : GB.agents.graphParam(q0); // ?interactions=1 manda sobre lo guardado (y =0 lo apaga)
    if (ig != null) setAgentGraph(ig, { save: false });
    else if (agentGraph) setUrlParam('interactions', '1');
    showForks = GB.health.forksParam(q0);
  } catch {
    /* sin query string */
  }
  try {
    const q = new URLSearchParams(location.search);
    // ?repo=a/b&repo=c/d (o separados por comas): los repos a seguir, el primero a la vista
    urlRepos = q.getAll('repo').flatMap((r) => r.split(',')).map((r) => r.trim()).filter(Boolean);
    // compartido desde el menú del móvil (share_target del manifiesto): ese repo se abre a la vista, y los
    // ?shared_*= salen de la dirección (recargar o copiar el enlace no los arrastra; ?repo= lo pone saveTabs)
    const shared = EMBED ? '' : U.sharedRepo(q);
    if (shared) urlRepos.unshift(shared);
    if (U.SHARE_PARAMS.some((k) => q.has(k))) {
      const url = new URL(location.href);
      for (const k of U.SHARE_PARAMS) url.searchParams.delete(k);
      try {
        history.replaceState(null, '', url);
      } catch {
        /* algunos visores no permiten cambiar la URL */
      }
    }
    initialPractice = !EMBED && q.has('practice') ? GB.gitsim.decodeExercise(q.get('practice').trim()) : null;
    if (initialPractice) initialPractice.solution = q.get('solution') === '1'; // ?solution=1: muestra la solución propuesta, si el ejercicio la trae
    initialReplay = GB.Replay.paramsOf(q);
    initialPath = EMBED ? '' : GB.search.pathParam(q);
    initialAuthor = EMBED ? '' : GB.search.authorParam(q);
    initialFirstParent = !EMBED && q.has('firstparent') ? GB.search.firstParentParam(q) : null;
    initialBranchView = EMBED ? null : GB.search.branchViewParam(q);
    initialQuery = EMBED ? '' : GB.search.queryParam(q);
    initialText = !EMBED && GB.textview.openParam(q);
    initialPr = EMBED ? 0 : GB.search.prParam(q);
    initialConflicts = !EMBED && GB.health.conflictsParam(q);
    initialTV = !EMBED && q.has('tv') && !/^(0|false|no|off)$/i.test(q.get('tv'));
    initialAll = EMBED ? false : GB.overview.allParam(q);
  } catch {
    /* sin query string */
  }

  /** Sigue los repos guardados y los de la URL; muestra el de la URL, el último que se miraba o el primero. */
  function start() {
    wantAll = !EMBED && (initialAll ?? (!initialTV && U.store.get('all', false) === true)); // con ?tv=1, solo si la URL lo pide
    const saved = U.store.get('repos', null);
    const shown = U.store.get('repo', null);
    const list = EMBED ? [] : Array.isArray(saved) ? saved : typeof shown === 'string' ? [shown] : []; // antes se seguía uno solo
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
    // ?repo=org:nombre: sus repos se suman después, con la lista de GitHub
    for (const input of urlRepos) {
      if (parse(input)) continue;
      const grp = U.parseGroup(input);
      const who = !grp && U.parseOwner(input);
      if (grp) connectGroup(grp.group);
      else if (who) connectOwner(who.owner);
    }
    const embedTitle = EMBED ? GB.embedOptions(location.search)?.title || '' : ''; // &title=: rótulo propio sobre la capa
    if (embedTitle) {
      const el = document.createElement('div');
      el.className = 'embed-title';
      el.textContent = embedTitle;
      el.setAttribute('aria-hidden', 'true'); // el h1 del repo sigue siendo el título para los lectores
      document.querySelector('.graph-stage')?.appendChild(el);
    }
    const rotate = EMBED ? GB.embedOptions(location.search)?.rotate || 0 : 0; // &rotate=30: la capa pasa de un repo a otro
    if (rotate)
      setInterval(() => {
        const live = tabs.filter((x) => !x.demo);
        if (live.length > 1) showTab(live[(live.indexOf(active) + 1) % live.length]);
      }, rotate * 1000);
    setTimeout(refreshOwners, 5000 + MAX_REPOS * STAGGER);
    setInterval(refreshOwners, OWNER_REFRESH);
    setTimeout(pollOrgEvents, 8000 + MAX_REPOS * STAGGER);
    setInterval(pollOrgEvents, ORG_EVENTS_EVERY);
    if (initialPractice) {
      if (initialPractice.custom) startPractice(null, GB.gitsim.customExercise(initialPractice.custom), initialPractice.solution);
      else startPractice(initialPractice.index);
    }
    if (initialTV) setTV(true); // ?tv=1: pensado para dejar la URL abierta en una pantalla
  }
  if (desktop) {
    sendDesktopLabels();
    loadDesktopToken().catch((err) => console.error('No se pudo leer el token:', err)).finally(start);
  } else start();
})(window.GB);
