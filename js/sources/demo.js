/* GraphBranch — repositorio simulado. Genera historia, ramas, PRs e issues
   con la misma forma de datos que la fuente de GitHub, para ver la app en
   movimiento sin conexión ni token. Todo lo que muestra es ficticio. */
(function (GB) {
  'use strict';
  const { U } = GB;

  const AUTHORS = [
    { name: 'Valentina Rojas', login: 'vrojas' },
    { name: 'Matías Soto', login: 'msoto' },
    { name: 'Camila Fuentes', login: 'cfuentes' },
    { name: 'Diego Muñoz', login: 'dmunoz' },
    { name: 'Josefa Pérez', login: 'jperez' },
    { name: 'Tomás Araya', login: 'taraya' },
  ];

  const MESSAGES = {
    feature: [
      'feat({s}): primera versión del componente',
      'feat({s}): estados de carga y vacío',
      'feat({s}): validación en el cliente',
      'feat({s}): atajos de teclado',
      'refactor({s}): separa la lógica del renderizado',
      'test({s}): casos para entradas inválidas',
      'fix({s}): corrige el foco al cerrar el diálogo',
      'style({s}): ajusta espaciados en móvil',
      'docs({s}): documenta las opciones',
      'perf({s}): memoriza el cálculo de totales',
      'chore({s}): limpia imports sin uso',
    ],
    fix: [
      'fix({s}): maneja la respuesta vacía del servidor',
      'fix({s}): evita doble envío del formulario',
      'test({s}): reproduce el error reportado',
      'fix({s}): zona horaria en las fechas',
    ],
    develop: [
      'chore(deps): actualiza dependencias menores',
      'ci: cachea node_modules entre ejecuciones',
      'refactor(core): unifica el cliente HTTP',
      'docs: actualiza el README',
      'build: divide el bundle por ruta',
    ],
    hotfix: ['fix(api): reintenta cuando la base de datos no responde', 'fix(auth): cookie segura en producción'],
  };

  const NEW_BRANCHES = [
    ['feature/notificaciones', 'notif'],
    ['feature/busqueda', 'search'],
    ['feature/exportar-csv', 'export'],
    ['feature/perfil', 'profile'],
    ['feature/i18n', 'i18n'],
    ['feature/onboarding', 'onboarding'],
    ['fix/paginacion', 'pager'],
    ['fix/timeout-login', 'auth'],
    ['fix/scroll-ios', 'ui'],
    ['feature/webhooks', 'hooks'],
    ['feature/graficos', 'charts'],
    ['fix/memoria-worker', 'worker'],
  ];

  const ISSUES = [
    'El botón de guardar no responde en Safari',
    'Agregar exportación a PDF',
    'Error 500 al subir imágenes grandes',
    'La sesión expira demasiado rápido',
    'Mejorar el contraste del modo oscuro',
    'Documentar la API de webhooks',
  ];
  const COMMENTS = [
    '¿Podemos agregar una prueba para este caso?',
    'Lo reviso hoy en la tarde.',
    'Se ve bien, solo un detalle de nombres.',
    'Confirmo que se reproduce en producción.',
  ];

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class DemoSource extends U.Emitter {
    constructor() {
      super();
      this.data = {
        repo: { owner: 'acme', name: 'orbita', defaultBranch: 'main', url: null, demo: true },
        mode: 'demo',
        branches: new Map(),
        commits: new Map(),
        pulls: new Map(),
        totalBranches: 0,
        loaded: false,
      };
      this.rnd = mulberry32(Date.now() % 100000);
      this.prSeq = 30;
      this.issueSeq = 85;
      this.release = [1, 4, 0];
      this.openIssues = [];
      this.timers = new Set();
      this.running = false;
      this.paused = false;
      this.history = [];
    }

    /* ---------- utilidades ---------- */
    pick(arr) {
      return arr[Math.floor(this.rnd() * arr.length)];
    }
    chance(p) {
      return this.rnd() < p;
    }
    sha() {
      let s = '';
      for (let i = 0; i < 40; i++) s += Math.floor(this.rnd() * 16).toString(16);
      return s;
    }
    actor(a) {
      return { name: a.name, login: a.login, avatar: null };
    }
    later(ms, fn) {
      const id = setTimeout(() => {
        this.timers.delete(id);
        if (!this.running) return;
        if (this.paused) this.later(1000, fn);
        else fn();
      }, ms);
      this.timers.add(id);
    }

    act(kind, fields, time = Date.now()) {
      return { id: `demo:${kind}:${time}:${Math.random().toString(36).slice(2, 8)}`, kind, time, ...fields };
    }

    /* ---------- operaciones git simuladas ---------- */

    commit(branch, message, author, time, extraParents = []) {
      const b = this.data.branches.get(branch);
      const c = {
        sha: this.sha(),
        parents: [b.sha, ...extraParents].filter(Boolean),
        message,
        author: this.actor(author),
        date: time,
        url: null,
      };
      this.data.commits.set(c.sha, c);
      b.sha = c.sha;
      b.own = (b.own || 0) + 1;
      b.movedAt = time;
      return c;
    }

    createBranch(name, from, scope, time) {
      const base = this.data.branches.get(from);
      this.data.branches.set(name, {
        name,
        sha: base.sha,
        isDefault: false,
        protected: false,
        movedAt: time,
        base: from,
        scope,
        own: 0,
        createdAt: time,
      });
      this.data.totalBranches = this.data.branches.size;
    }

    message(b) {
      const pool = b.name === 'develop' ? MESSAGES.develop : b.name.startsWith('fix/') ? MESSAGES.fix : MESSAGES.feature;
      return this.pick(pool).replace('{s}', b.scope || 'app');
    }

    /* ---------- historia inicial ---------- */

    seed() {
      const H = this.history;
      const [V, M, C, D, J, T] = AUTHORS;
      let t = Date.now() - 3.1 * 864e5;
      const step = (min = 35, max = 140) => (t += (min + this.rnd() * (max - min)) * 60e3);
      const push = (branch, author, msg) => {
        const c = this.commit(branch, msg, author, step());
        H.push(this.act('push', { title: `1 commit en ${branch}`, detail: msg, branch, sha: c.sha, actor: this.actor(author) }, c.date));
        return c;
      };
      const create = (name, from, scope, author) => {
        this.createBranch(name, from, scope, step(10, 30));
        H.push(this.act('branch-create', { title: `Rama ${name} creada`, detail: `Sale de ${from}`, branch: name, actor: this.actor(author) }, t));
      };
      const merge = (head, base, num, author, del) => {
        const hb = this.data.branches.get(head);
        const msg = `Merge pull request #${num} from acme/${head}`;
        const c = this.commit(base, msg, author, step(), [hb.sha]);
        H.push(this.act('pr-merge', { title: `PR #${num} fusionado en ${base}`, detail: hb.prTitle || msg, ref: `${head} → ${base}`, branch: base, sha: c.sha, actor: this.actor(author) }, c.date));
        if (del) {
          this.data.branches.delete(head);
          H.push(this.act('branch-delete', { title: `Rama ${head} eliminada`, detail: `Sus cambios ya estaban en ${base}`, branch: head }, t + 20e3));
        }
        return c;
      };

      this.data.branches.set('main', { name: 'main', sha: null, isDefault: true, protected: true, movedAt: t, scope: 'core', own: 0 });
      push('main', V, 'chore: estructura inicial del proyecto');
      push('main', M, 'feat(api): endpoint de salud /healthz');
      push('main', V, 'docs: guía de instalación');
      create('develop', 'main', 'core', V);
      this.data.branches.get('develop').protected = true;
      push('develop', C, 'feat(ui): layout base con barra lateral');
      push('develop', D, 'feat(auth): modelo de usuario y sesiones');
      create('fix/payload-vacio', 'main', 'api', M);
      push('fix/payload-vacio', M, 'fix(api): evita el crash con payload vacío');
      this.data.branches.get('fix/payload-vacio').prTitle = 'Evita el crash con payload vacío';
      merge('fix/payload-vacio', 'main', 31, V, true);
      push('develop', D, 'test(auth): pruebas de expiración de sesión');
      create('feature/login', 'develop', 'login', J);
      push('feature/login', J, 'feat(login): formulario con validación');
      push('develop', C, 'refactor(ui): tokens de color y tipografía');
      create('feature/modo-oscuro', 'develop', 'theme', T);
      push('feature/login', J, 'feat(login): callback OAuth de GitHub');
      push('feature/modo-oscuro', T, 'feat(theme): variables para modo oscuro');
      this.data.branches.get('develop').prTitle = 'Release 1.4';
      merge('develop', 'main', 34, V, false);
      H.push(this.act('release', { title: 'Release v1.4.0 publicada', detail: 'Login con GitHub y layout nuevo', actor: this.actor(V) }, t + 60e3));
      push('feature/login', J, 'fix(login): mensaje de error accesible');
      push('feature/modo-oscuro', T, 'feat(theme): interruptor en el encabezado');
      H.push(this.act('issue-open', { title: `Issue #${++this.issueSeq} abierto`, detail: ISSUES[0], actor: this.actor(C) }, step(5, 20)));
      this.openIssues.push(this.issueSeq);
      push('develop', D, 'chore(deps): actualiza vite a 6.2');
      create('fix/rate-limit', 'main', 'api', M);
      push('fix/rate-limit', M, 'fix(api): respeta el header Retry-After');
      push('feature/login', J, 'test(login): flujo completo con OAuth simulado');

      const openPR = (head, base, title, user, draft = false) => {
        const n = ++this.prSeq;
        this.data.branches.get(head).pr = n;
        this.data.pulls.set(n, { number: n, title, head, base, sameRepo: true, url: null, draft, user: this.actor(user), createdAt: t });
      };
      this.prSeq = 35;
      openPR('feature/login', 'develop', 'Login con GitHub', J);
      openPR('feature/modo-oscuro', 'develop', 'Modo oscuro', T, true);
      openPR('fix/rate-limit', 'main', 'Respeta Retry-After en el cliente', M);
      H.push(this.act('comment', { title: `Comentario en PR #38`, detail: COMMENTS[0], actor: this.actor(V) }, t + 120e3));
      H.push(this.act('star', { title: 'Nueva estrella', detail: 'pgarrido marcó el repositorio' }, t + 140e3));
      this.data.totalBranches = this.data.branches.size;
    }

    /* ---------- actividad en vivo ---------- */

    actions() {
      const b = [...this.data.branches.values()];
      const topics = b.filter((x) => !x.isDefault && x.name !== 'develop' && !x.merged);
      const prs = [...this.data.pulls.values()];
      const list = [
        [30, topics.length > 0, () => this.doCommit(this.pick(topics))],
        [7, true, () => this.doCommit(this.data.branches.get('develop'))],
        [10, topics.length < 6, () => this.doNewBranch()],
        [8, topics.some((x) => !x.pr && x.own > 0), () => this.doOpenPR()],
        [7, prs.length > 0, () => this.doReview()],
        [9, prs.some((p) => !p.draft && this.data.branches.get(p.head)?.own >= 2), () => this.doMerge()],
        [6, true, () => this.doIssue()],
        [3, true, () => [this.act(this.chance(0.7) ? 'star' : 'fork', this.chance(0.7) ? { title: 'Nueva estrella', detail: `${this.pick(['pgarrido', 'nlagos', 'fvera', 'icortes'])} marcó el repositorio` } : { title: 'Nuevo fork', detail: `${this.pick(['nlagos', 'fvera'])}/orbita` })]],
        [2, topics.some((x) => x.own >= 2), () => this.doForcePush()],
        [2, true, () => this.doHotfix()],
        [3, prs.every((p) => p.head !== 'develop') && this.data.branches.get('develop').own >= 3, () => this.doReleasePR()],
      ].filter(([, ok]) => ok);
      const total = list.reduce((s, [w]) => s + w, 0);
      let r = this.rnd() * total;
      for (const [w, , fn] of list) if ((r -= w) <= 0) return fn();
      return list[0][2]();
    }

    doCommit(b) {
      const acts = [];
      const n = this.chance(0.75) ? 1 : 2 + Math.floor(this.rnd() * 2);
      const author = this.pick(AUTHORS);
      let c;
      for (let i = 0; i < n; i++) c = this.commit(b.name, this.message(b), author, Date.now() - (n - 1 - i) * 1500);
      acts.push(this.act('push', { title: `${U.plural(n, 'commit nuevo', 'commits nuevos')} en ${b.name}`, detail: U.firstLine(c.message), branch: b.name, sha: c.sha, actor: this.actor(author) }));
      return acts;
    }

    doNewBranch() {
      const free = NEW_BRANCHES.filter(([n]) => !this.data.branches.has(n));
      if (!free.length) return [];
      const [name, scope] = this.pick(free);
      const from = name.startsWith('fix/') && this.chance(0.5) ? 'main' : 'develop';
      this.createBranch(name, from, scope, Date.now());
      const author = this.pick(AUTHORS);
      const b = this.data.branches.get(name);
      const acts = [this.act('branch-create', { title: `Rama ${name} creada`, detail: `Sale de ${from} en ${U.shortSha(b.sha)}`, branch: name, sha: b.sha, actor: this.actor(author) })];
      if (this.chance(0.5)) {
        this.later(1800, () => this.publish(this.doCommit(this.data.branches.get(name) || b)));
      }
      return acts;
    }

    doOpenPR() {
      const b = this.pick([...this.data.branches.values()].filter((x) => !x.isDefault && x.name !== 'develop' && !x.pr && x.own > 0));
      const n = ++this.prSeq;
      const title = U.firstLine(this.data.commits.get(b.sha).message).replace(/^\w+\([^)]*\):\s*/, '');
      const draft = this.chance(0.2);
      const user = this.pick(AUTHORS);
      b.pr = n;
      this.data.pulls.set(n, { number: n, title: title[0].toUpperCase() + title.slice(1), head: b.name, base: b.base, sameRepo: true, url: null, draft, user: this.actor(user), createdAt: Date.now() });
      return [this.act('pr-open', { title: draft ? `PR #${n} abierto como borrador` : `PR #${n} abierto`, detail: this.data.pulls.get(n).title, ref: `${b.name} → ${b.base}`, branch: b.name, sha: b.sha, actor: this.actor(user), number: n })];
    }

    doReview() {
      const pr = this.pick([...this.data.pulls.values()]);
      const who = this.actor(this.pick(AUTHORS.filter((a) => a.login !== pr.user.login)));
      const r = this.rnd();
      if (pr.draft && this.chance(0.5)) {
        pr.draft = false;
        return [this.act('pr-open', { title: `PR #${pr.number} listo para revisión`, detail: pr.title, ref: `${pr.head} → ${pr.base}`, branch: pr.head, actor: pr.user, number: pr.number })];
      }
      if (r < 0.55) return [this.act('review-ok', { title: `PR #${pr.number} aprobado`, detail: pr.title, branch: pr.head, actor: who, number: pr.number })];
      if (r < 0.8) return [this.act('review-changes', { title: `Cambios solicitados en PR #${pr.number}`, detail: this.pick(COMMENTS), branch: pr.head, actor: who, number: pr.number })];
      return [this.act('comment', { title: `Comentario en PR #${pr.number}`, detail: this.pick(COMMENTS), branch: pr.head, actor: who, number: pr.number })];
    }

    doMerge() {
      const pr = this.pick([...this.data.pulls.values()].filter((p) => !p.draft && this.data.branches.get(p.head)?.own >= 2));
      const head = this.data.branches.get(pr.head);
      const author = this.pick(AUTHORS);
      const c = this.commit(pr.base, `Merge pull request #${pr.number} from acme/${pr.head}`, author, Date.now(), [head.sha]);
      this.data.pulls.delete(pr.number);
      head.pr = null;
      const acts = [this.act('pr-merge', { title: `PR #${pr.number} fusionado en ${pr.base}`, detail: pr.title, ref: `${pr.head} → ${pr.base}`, branch: pr.base, sha: c.sha, actor: this.actor(author), number: pr.number })];
      head.own = 0;
      if (!head.protected) {
        head.merged = true;
        this.later(2200, () => {
          if (!this.data.branches.has(pr.head)) return;
          this.data.branches.delete(pr.head);
          this.data.totalBranches = this.data.branches.size;
          this.publish([this.act('branch-delete', { title: `Rama ${pr.head} eliminada`, detail: `Sus cambios ya estaban en ${pr.base}`, branch: pr.head, sha: c.sha, actor: this.actor(author) })]);
        });
      }
      if (pr.base === 'main' && pr.head === 'develop') {
        this.later(4000, () => {
          this.release[1]++;
          this.release[2] = 0;
          this.publish([this.act('release', { title: `Release v${this.release.join('.')} publicada`, detail: 'Nueva versión estable', actor: this.actor(author), sha: c.sha })]);
        });
      }
      return acts;
    }

    doReleasePR() {
      const n = ++this.prSeq;
      const dev = this.data.branches.get('develop');
      dev.pr = n;
      dev.base = 'main';
      const user = this.actor(AUTHORS[0]);
      const title = `Release ${this.release[0]}.${this.release[1] + 1}`;
      this.data.pulls.set(n, { number: n, title, head: 'develop', base: 'main', sameRepo: true, url: null, draft: false, user, createdAt: Date.now() });
      dev.own = Math.max(dev.own, 2);
      return [this.act('pr-open', { title: `PR #${n} abierto`, detail: title, ref: 'develop → main', branch: 'develop', sha: dev.sha, actor: user, number: n })];
    }

    doIssue() {
      const who = this.actor(this.pick(AUTHORS));
      if (this.openIssues.length && this.chance(0.4)) {
        const n = this.openIssues.shift();
        return [this.act('issue-close', { title: `Issue #${n} cerrado`, detail: 'Resuelto en la última versión', actor: who, number: n })];
      }
      if (this.openIssues.length && this.chance(0.3)) {
        const n = this.pick(this.openIssues);
        return [this.act('comment', { title: `Comentario en issue #${n}`, detail: this.pick(COMMENTS), actor: who, number: n })];
      }
      const n = ++this.issueSeq;
      this.openIssues.push(n);
      return [this.act('issue-open', { title: `Issue #${n} abierto`, detail: this.pick(ISSUES), actor: who, number: n })];
    }

    doForcePush() {
      const b = this.pick([...this.data.branches.values()].filter((x) => !x.isDefault && x.name !== 'develop' && x.own >= 2));
      const old = this.data.commits.get(b.sha);
      b.sha = old.parents[0];
      b.own -= 1;
      const author = this.pick(AUTHORS);
      const c = this.commit(b.name, U.firstLine(old.message) + ' (corregido)', author, Date.now());
      return [this.act('force', { title: `Force-push en ${b.name}`, detail: `Historia reescrita: 1 commit descartado · ahora en ${U.shortSha(c.sha)}`, branch: b.name, sha: c.sha, actor: this.actor(author) })];
    }

    doHotfix() {
      const main = this.data.branches.get('main');
      const author = this.pick(AUTHORS);
      const c = this.commit('main', this.pick(MESSAGES.hotfix), author, Date.now());
      main.own = 0;
      return [this.act('push', { title: `1 commit nuevo en main`, detail: c.message, branch: 'main', sha: c.sha, actor: this.actor(author) })];
    }

    /** Mantiene acotada la historia en memoria. */
    trim() {
      const { commits, branches } = this.data;
      if (commits.size <= 260) return;
      const heads = new Set([...branches.values()].map((b) => b.sha));
      const old = [...commits.values()].filter((c) => !heads.has(c.sha)).sort((a, b) => a.date - b.date);
      for (const c of old.slice(0, commits.size - 240)) commits.delete(c.sha);
    }

    /* ---------- ciclo de vida ---------- */

    publish(activities) {
      if (!this.running) return;
      this.trim();
      this.emit('update', { activities: activities.filter(Boolean), initial: false });
      this.emitStatus();
    }

    emitStatus() {
      this.status = {
        state: this.paused ? 'paused' : 'live',
        message: null,
        rate: null,
        nextAt: this.nextAt || null,
        lastOk: Date.now(),
        demo: true,
      };
      this.emit('status', this.status);
    }

    schedule() {
      if (!this.running || this.paused) return;
      const delay = 2600 + this.rnd() * 4200;
      this.nextAt = Date.now() + delay;
      clearTimeout(this.stepTimer);
      this.stepTimer = setTimeout(() => {
        if (!this.running || this.paused) return;
        this.publish(this.actions() || []);
        this.schedule();
      }, delay);
    }

    start() {
      this.running = true;
      if (!this.data.loaded) this.seed();
      this.data.loaded = true;
      setTimeout(() => {
        if (!this.running) return;
        this.emit('update', { activities: this.history.splice(0), initial: true });
        this.schedule();
        this.emitStatus();
      }, 0);
    }

    stop() {
      this.running = false;
      clearTimeout(this.stepTimer);
      for (const id of this.timers) clearTimeout(id);
      this.timers.clear();
    }

    setPaused(paused) {
      this.paused = paused;
      clearTimeout(this.stepTimer);
      if (!paused) this.schedule();
      this.emitStatus();
    }

    setFilter(filter) {
      this.filter = filter.trim();
      this.publish([]);
    }

    setPins() {
      /* en la demo todas las ramas están siempre visibles */
    }

    /** Datos con el filtro de ramas aplicado (la rama por defecto siempre queda). */
    view() {
      if (!this.filter) return { ...this.data, matchingBranches: null };
      const branches = new Map([...this.data.branches].filter(([n, b]) => b.isDefault || U.matches(n, this.filter)));
      const matching = [...this.data.branches.keys()].filter((n) => U.matches(n, this.filter)).length;
      return { ...this.data, branches, matchingBranches: matching };
    }

    refreshNow() {
      if (this.paused) return;
      clearTimeout(this.stepTimer);
      this.publish(this.actions() || []);
      this.schedule();
    }
  }

  GB.DemoSource = DemoSource;
})(window.GB);
