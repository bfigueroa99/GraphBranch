/* GraphBranch — repo de práctica para aprender git. Con la misma forma de datos que la demo, pero sin
   actividad propia: el grafo cambia solo cuando la persona escribe un comando (js/gitsim.js).
   No consulta ninguna API ni guarda el repo; solo recuerda qué ejercicios resolvió. */
(function (GB) {
  'use strict';
  const { U, i18n, gitsim } = GB;
  const MSG = i18n.msg;
  const YOU = { name: 'You', login: 'you', avatar: null };

  class PracticeSource extends U.Emitter {
    /** `index`: el ejercicio de partida (0 a EXERCISES.length - 1). */
    constructor(index = 0) {
      super();
      this.index = Math.max(0, Math.min(gitsim.EXERCISES.length - 1, index | 0));
      this.git = gitsim.start(this.index);
      this.data = {
        repo: { owner: 'practice', name: 'git', defaultBranch: 'main', url: null, demo: true, practice: true },
        mode: 'demo',
        branches: new Map(),
        commits: new Map(),
        pulls: new Map(),
        ci: new Map(),
        totalBranches: 0,
        loaded: false,
      };
      this.running = false;
      this.paused = false;
      this.history = [];
      this.solved = new Set(U.store.get('practice', []));
      this.sync();
    }

    get exercise() {
      return gitsim.EXERCISES[this.index];
    }

    /** ¿Está resuelto el ejercicio de ahora? Una vez resuelto, se recuerda aunque la persona siga jugando. */
    check() {
      const done = this.exercise.done(this.git);
      if (done && !this.solved.has(this.exercise.id)) {
        this.solved.add(this.exercise.id);
        U.store.set('practice', [...this.solved]);
      }
      return done;
    }

    /** Pasa el estado del intérprete a la forma de datos del grafo (solo lo que alcanza alguna rama). */
    sync() {
      const g = this.git;
      const { branches, commits } = this.data;
      const old = new Map(branches);
      branches.clear();
      commits.clear();
      for (const [name, sha] of g.branches) {
        if (!sha) continue;
        const prev = old.get(name);
        branches.set(name, {
          name,
          sha,
          isDefault: name === g.defaultBranch,
          protected: name === g.defaultBranch,
          movedAt: prev && prev.sha === sha ? prev.movedAt : g.commits.get(sha).date,
          own: 0,
        });
        for (const s of g.ancestors(sha)) commits.set(s, g.commits.get(s));
      }
      this.data.totalBranches = branches.size;
    }

    /** Corre una línea de la terminal. Devuelve { ok, lines, solved }: lo que se imprime y si el ejercicio quedó resuelto. */
    run(line) {
      const before = new Map([...this.git.branches]);
      const res = this.git.run(line);
      if (res.changed && this.running) {
        this.sync();
        this.emit('update', { activities: this.activities(before), initial: false });
      } else if (res.changed) this.sync();
      return { ...res, solved: this.check() };
    }

    /** Qué pasó con cada rama: nueva, borrada, con commits nuevos o reescrita. */
    activities(before) {
      const acts = [];
      const g = this.git;
      const now = Date.now();
      const act = (kind, fields) => ({ id: `practice:${kind}:${now}:${acts.length}`, kind, time: now, actor: YOU, ...fields });
      for (const [name, sha] of g.branches) {
        if (!sha) continue;
        const prev = before.get(name);
        if (prev === undefined) {
          acts.push(act('branch-create', { title: MSG('act.branchCreated', { name }), detail: MSG('act.branchFrom', { from: g.defaultBranch, sha: U.shortSha(sha) }), branch: name, sha }));
        } else if (prev !== sha) {
          const fresh = g.ancestors(sha);
          const kept = g.ancestors(prev);
          if (fresh.has(prev)) {
            const n = [...fresh].filter((s) => !kept.has(s)).length;
            acts.push(act('push', { title: MSG('act.pushNew', { n, name }), detail: U.firstLine(g.commits.get(sha).message), branch: name, sha }));
          } else {
            const dropped = [...kept].filter((s) => !fresh.has(s)).length;
            acts.push(act('force', { title: MSG('act.force', { name }), detail: MSG('act.forceDetailDropped', { n: dropped, sha: U.shortSha(sha) }), branch: name, sha }));
          }
        }
      }
      for (const name of before.keys()) {
        if (!g.branches.has(name)) acts.push(act('branch-delete', { title: MSG('act.branchDeleted', { name }), branch: name }));
      }
      return acts;
    }

    /* ---------- ciclo de vida (la fuente no hace nada sola) ---------- */

    emitStatus() {
      this.status = { state: this.paused ? 'paused' : 'live', message: null, rate: null, nextAt: null, lastOk: Date.now(), demo: true };
      this.emit('status', this.status);
    }

    start() {
      this.running = true;
      this.data.loaded = true;
      setTimeout(() => {
        if (!this.running) return;
        this.emit('update', { activities: [], initial: true });
        this.emitStatus();
      }, 0);
    }

    stop() {
      this.running = false;
    }

    setPaused(paused) {
      this.paused = paused;
      this.emitStatus();
    }

    setFilter(filter) {
      this.filter = filter.trim();
      this.emit('update', { activities: [], initial: false });
    }

    setPins() {}

    view() {
      if (!this.filter) return { ...this.data, matchingBranches: null };
      const branches = new Map([...this.data.branches].filter(([n, b]) => b.isDefault || U.matches(n, this.filter)));
      const matching = [...this.data.branches.keys()].filter((n) => U.matches(n, this.filter)).length;
      return { ...this.data, branches, matchingBranches: matching };
    }

    refreshNow() {}
  }

  GB.PracticeSource = PracticeSource;
})(window.GB);
