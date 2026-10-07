/* GraphBranch — capa de juego: logros, nivel y misión del día del repositorio.
   Celebra lo que consigue el repo y el equipo (merges, revisiones, releases, issues cerrados,
   limpieza), nunca a personas: no hay rankings, rachas personales ni contadores por autor, que
   empujan a trabajar de más (GitHub quitó sus rachas en 2016 por eso). Los puntos premian
   resultados y no volumen: un commit vale poco; un merge o una release, mucho. Todo se guarda
   solo en este navegador, por repositorio, y se puede apagar desde la vitrina de trofeos. */
(function (GB) {
  'use strict';
  const { U } = GB;

  /** Puntos por tipo de actividad. */
  const XP = {
    push: 1,
    merge: 4,
    'branch-create': 2,
    'pr-open': 3,
    'pr-merge': 12,
    review: 2,
    'review-ok': 5,
    'review-changes': 2,
    'issue-open': 1,
    'issue-close': 5,
    comment: 1,
    release: 30,
    tag: 5,
    star: 3,
    fork: 4,
    'branch-delete': 3,
  };
  /** Qué contador suma cada tipo de actividad. */
  const COUNT = {
    'pr-merge': 'merges',
    'review-ok': 'approvals',
    'issue-close': 'issuesClosed',
    'branch-create': 'branches',
    release: 'releases',
    'branch-delete': 'cleaned', // solo las fusionadas: borrar trabajo sin fusionar no es limpieza
    star: 'stars',
    fork: 'forks',
  };
  const COUNTERS = ['merges', 'approvals', 'issuesClosed', 'branches', 'releases', 'cleaned', 'stars', 'forks', 'replays'];

  /* logros del repo: el criterio de cada uno se explica en la vitrina */
  const ACHIEVEMENTS = [
    { id: 'firstMerge', icon: '🤝', test: (s) => s.total.merges >= 1 },
    { id: 'mergeDay', icon: '🚀', test: (s) => s.today.merges >= 5 },
    { id: 'shipIt', icon: '📦', test: (s) => s.total.releases >= 1 },
    { id: 'releaseTrain', icon: '🚂', test: (s) => s.total.releases >= 3 },
    { id: 'approved', icon: '✅', test: (s) => s.total.approvals >= 1 },
    { id: 'reviewCircle', icon: '🔁', test: (s) => s.total.approvals >= 10 },
    { id: 'bugSquasher', icon: '🐞', test: (s) => s.total.issuesClosed >= 3 },
    { id: 'tidy', icon: '🧹', test: (s) => s.total.cleaned >= 3 },
    { id: 'stargazer', icon: '⭐', test: (s) => s.total.stars >= 5 },
    { id: 'forked', icon: '🍴', test: (s) => s.total.forks >= 1 },
    { id: 'inboxZero', icon: '📭', test: (s, ctx) => !!ctx.inboxZero },
    { id: 'recordDay', icon: '🏆', test: (s, ctx) => !!ctx.recordDay },
    { id: 'forest', icon: '🌳', test: (s, ctx) => (ctx.liveBranches || 0) >= 10 },
    { id: 'timeTraveler', icon: '⏳', test: (s) => s.total.replays >= 1 },
  ];

  /* misiones del día: metas de equipo, una por día y por repo */
  const MISSIONS = [
    { id: 'merge', n: 3, count: 'merges' },
    { id: 'approve', n: 3, count: 'approvals' },
    { id: 'close', n: 2, count: 'issuesClosed' },
    { id: 'branch', n: 2, count: 'branches' },
    { id: 'release', n: 1, count: 'releases' },
    { id: 'clean', n: 2, count: 'cleaned' },
  ];
  const MISSION_XP = 40;
  const COMBO_WINDOW = 30000; // ms: actividades seguidas dentro de esta ventana forman un combo
  const COMBO_MIN = 3;

  /** XP necesaria para llegar al nivel n (1 → 0, 2 → 50, 3 → 150, 4 → 300, 5 → 500…). */
  const floorOf = (n) => 25 * n * (n - 1);
  const levelOf = (xp) => {
    let n = 1;
    while (floorOf(n + 1) <= xp) n++;
    return n;
  };
  const zeros = () => Object.fromEntries(COUNTERS.map((k) => [k, 0]));

  class Game {
    constructor(hooks = {}) {
      this.hooks = hooks; // onUnlock(ach), onLevel(n), onMission(m), onCombo(n), onChange(view)
      this.enabled = U.store.get('game', true) !== false;
      this.key = null;
      this.state = null;
      this.recent = [];
      this.lastOpen = null;
    }

    static get achievements() {
      return ACHIEVEMENTS;
    }

    /** Cambia de repositorio: cada uno tiene sus logros, su nivel y su misión. */
    load(key) {
      this.key = key;
      const saved = U.store.get('game:' + key, null);
      this.state = saved && saved.total ? saved : { xp: 0, unlocked: {}, total: zeros(), today: zeros(), day: '', mission: null };
      for (const k of COUNTERS) {
        this.state.total[k] ||= 0;
        this.state.today[k] ||= 0;
      }
      this.recent = [];
      this.lastOpen = null;
      this.rollover();
      this.emitChange();
    }

    setEnabled(on) {
      this.enabled = on;
      U.store.set('game', on);
      this.emitChange();
    }

    save() {
      if (this.key) U.store.set('game:' + this.key, this.state);
    }

    /** Día nuevo: contadores de hoy a cero y otra misión, elegida igual para todos los que miran ese repo ese día. */
    rollover() {
      const day = U.dayKey(Date.now());
      if (this.state.day === day) return;
      this.state.day = day;
      this.state.today = zeros();
      const m = MISSIONS[U.hash(`${this.key}|${day}`) % MISSIONS.length];
      this.state.mission = { id: m.id, done: false };
      this.save();
    }

    /** Actividades en vivo. `ctx`: { openPrs, liveBranches, recordDay } con el estado actual del repo. */
    observe(acts, ctx = {}) {
      if (!this.state) return;
      this.rollover();
      const s = this.state;
      const before = levelOf(s.xp);
      const now = Date.now();
      for (const a of acts) {
        if (a.kind === 'push') s.xp += Math.min(5, Number(a.title?.params?.n) || 1);
        else s.xp += XP[a.kind] || 0;
        const c = COUNT[a.kind];
        if (c) {
          s.total[c]++;
          s.today[c]++;
        }
        if (XP[a.kind]) this.recent.push(now);
      }
      // combo: el equipo encadena varias cosas en poco tiempo
      this.recent = this.recent.filter((t) => now - t < COMBO_WINDOW);
      const n = this.recent.length;
      if (n < COMBO_MIN) this.comboBest = 0; // la racha se cortó
      // solo cuando la racha supera su marca, y como mucho uno cada 12 s: la actividad continua no infla los puntos
      if (n >= COMBO_MIN && n > (this.comboBest || 0) && now - (this.comboAt || 0) > 12000) {
        this.comboAt = now;
        this.comboBest = n;
        s.xp += n;
        this.hooks.onCombo?.(n);
      }
      // bandeja vacía: había PRs abiertos y ya no queda ninguno
      const inboxZero = this.lastOpen > 0 && ctx.openPrs === 0;
      if (ctx.openPrs != null) this.lastOpen = ctx.openPrs;
      this.check({ ...ctx, inboxZero });
      this.finish(before);
    }

    /** Un Replay que llegó hasta el final. */
    replayDone() {
      if (!this.state) return;
      const before = levelOf(this.state.xp);
      this.state.total.replays++;
      this.check({});
      this.finish(before);
    }

    check(ctx) {
      const s = this.state;
      const m = this.mission();
      if (m && !m.done && m.progress >= m.n) {
        s.mission.done = true;
        s.xp += MISSION_XP;
        this.hooks.onMission?.(m);
      }
      for (const a of ACHIEVEMENTS) {
        if (s.unlocked[a.id] || !a.test(s, ctx)) continue;
        s.unlocked[a.id] = Date.now();
        this.hooks.onUnlock?.(a);
      }
    }

    finish(before) {
      const after = levelOf(this.state.xp);
      if (after > before) this.hooks.onLevel?.(after);
      this.save();
      this.emitChange();
    }

    mission() {
      const st = this.state?.mission;
      const def = st && MISSIONS.find((m) => m.id === st.id);
      if (!def) return null;
      return { id: def.id, n: def.n, progress: Math.min(def.n, this.state.today[def.count] || 0), done: !!st.done };
    }

    /** Lo que muestra la interfaz. */
    view() {
      if (!this.state) return null;
      const xp = this.state.xp;
      const level = levelOf(xp);
      return {
        enabled: this.enabled,
        level,
        xp,
        floor: floorOf(level),
        next: floorOf(level + 1),
        mission: this.mission(),
        unlocked: this.state.unlocked,
        count: Object.keys(this.state.unlocked).length,
        total: ACHIEVEMENTS.length,
      };
    }

    emitChange() {
      this.hooks.onChange?.(this.view());
    }
  }

  GB.Game = Game;
})(window.GB);
