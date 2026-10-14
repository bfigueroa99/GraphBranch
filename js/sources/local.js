/* GraphBranch — fuente de datos de un repositorio de esta máquina (solo en la app de escritorio).

   Hereda de la fuente de GitHub el ciclo de sondeo, la prioridad para traer la historia de las ramas
   de a poco, la comparación entre ciclos que da las actividades (ramas nuevas, movidas, borradas) y la
   limpieza de commits. Cambia de dónde sale todo: nada va a la red. El proceso principal lee la
   carpeta con `git` (electron/git.js) y la página solo conoce su id, el de una carpeta que el usuario
   eligió; sin GitHub ni cuota, sirve para repos privados, sin conexión y de cualquier servidor.

   - Las ramas son las locales (refs/heads), también las que nunca se publicaron.
   - La historia de una rama sale de `git log`: lo suyo desde la rama por defecto (una rama nueva),
     lo nuevo desde su cabeza anterior (una rama que se movió) o sus últimos commits.
   - Cada cambio en .git (un commit, una rama nueva o borrada, un fetch) llega al instante porque el
     proceso principal vigila refs, packed-refs y HEAD; el sondeo cada POLL_MS es solo la red de
     seguridad por si el sistema no avisa.
   - Sin pull requests, sin eventos y sin enlaces a la web: no hay a dónde llevar. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  const POLL_MS = 4000;
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const BUDGET = 40; // historias de rama por ciclo: git local no cuesta cuota
  const TERMS = { 'status.connecting': 'status.connectingLocal' };

  class LocalGitSource extends GB.GitHubSource {
    /** `id`: el de la carpeta que dio el diálogo de la app de escritorio; `name`: su nombre, para mostrarlo. */
    constructor({ id, name, depth = 40, filter = '', pins = [] }) {
      super({ owner: id, name, token: '', depth, filter, pins });
      this.host = 'local';
      this.id = id;
      this.mode = 'list';
      Object.assign(this.data.repo, { owner: 'local', url: null, host: 'local', local: true });
      this.prevHead = new Map(); // cabeza nueva -> la anterior de esa rama: de ahí se pide lo nuevo
      this.unfollow = null;
    }

    term(key) {
      return TERMS[key] || key;
    }

    get git() {
      return window.GBDesktop?.git || null;
    }

    /* ---------- git ---------- */

    /** Una llamada al proceso principal. Por IPC solo viaja el mensaje: el proceso principal le pone el tipo delante. */
    async call(fn, ...args) {
      const git = this.git;
      if (!git) throw this.toError({ kind: 'unknown' });
      try {
        return await git[fn](this.id, ...args);
      } catch (err) {
        throw this.toError(err);
      }
    }

    toError(err) {
      const m = /(nogit|notrepo|unknown|git): ([^]*)$/.exec(String(err?.message || ''));
      const kind = err?.kind || m?.[1] || 'git';
      if (kind === 'nogit') return new ApiError(M('err.noGit'), { kind: 'notfound' });
      if (kind === 'unknown' || kind === 'notrepo') return new ApiError(M('err.notFoundLocal', { repo: this.name }), { status: 404, kind: 'notfound' });
      return new ApiError(M('err.gitLocal', { message: (m?.[2] || err?.message || '').trim() }), { kind: 'http' });
    }

    /** El proceso principal avisa de cada cambio en las ramas: el ciclo siguiente va ya. */
    wake() {
      super.wake();
      const git = this.git;
      if (!git || this.unfollow) return;
      const off = git.onChange((id) => id === this.id && this.running && !this.paused && (this.busy ? (this.again = true) : this.loop()));
      git.watch(this.id).catch(() => {});
      this.unfollow = () => {
        off();
        git.unwatch(this.id).catch(() => {});
      };
    }

    stop() {
      super.stop();
      this.unfollow?.();
      this.unfollow = null;
    }

    nextDelay() {
      this.exhausted = false;
      this.throttled = false;
      return POLL_MS;
    }

    restBudget() {
      return BUDGET;
    }

    due() {
      return false;
    }

    /* ---------- sondeo ---------- */

    async poll(initial) {
      this.cost = 0;
      this.bulkCost = 0;
      this.calm = false;
      const acts = [];
      const reseed = this.reseed;
      const quiet = initial || reseed !== this.reseeded;
      const deadline = Date.now() + (initial ? FIRST_MS : BATCH_MS);
      const info = await this.call('branches');
      Object.assign(this.data.repo, { name: info.name || this.name, defaultBranch: info.defaultBranch });
      if (reseed !== this.reseeded) this.prune();
      const remote = new Map(info.branches.map((b) => [b.name, { sha: b.sha, protected: false, date: b.date }]));
      // de dónde viene cada cabeza nueva: lo que falta se pide desde ahí
      this.prevHead.clear();
      for (const [name, b] of remote) {
        const was = this.data.branches.get(name)?.sha || this.remoteHeads.get(name)?.sha;
        if (was && was !== b.sha) this.prevHead.set(b.sha, was);
      }
      await this.applyBranchList(acts, quiet, remote);
      for (const [name, e] of this.known) e.date = remote.get(name)?.date || 0;
      await this.fillBacklog(deadline);
      this.data.totalExact = true;
      this.data.mode = this.mode;
      this.reseeded = reseed;
      this.gc();
      this.countPending();
      return acts;
    }

    /* ---------- commits ---------- */

    async ensureHistory(shas) {
      const { commits } = this.data;
      for (const sha of new Set(shas)) if (sha && !commits.has(sha)) await this.fetchBranch(sha);
    }

    /** Trae la historia de una cabeza y devuelve su sha (o null si ya no existe). */
    async fetchBranch(sha) {
      const { commits, branches, repo } = this.data;
      const def = branches.get(repo.defaultBranch);
      const from = this.prevHead.get(sha) || (def && def.sha !== sha ? def.sha : null);
      // lo nuevo de una rama que se movió, lo suyo en una nueva, o los últimos commits
      const list = await this.call('log', sha, from && commits.has(from) ? from : null, this.depth * 2).catch((err) => {
        if (err.kind === 'notfound' || err.kind === 'http') return [];
        throw err;
      });
      for (const c of list) this.addCommit(c);
      return commits.has(sha) ? sha : null;
    }

    addCommit(c) {
      if (!c?.sha || this.data.commits.has(c.sha)) return false;
      this.data.commits.set(c.sha, {
        sha: c.sha,
        parents: c.parents || [],
        message: c.message || '',
        author: { name: c.name || '', login: null, avatar: null },
        date: c.date || Date.now(),
        url: null,
      });
      this.kids = null;
      return true;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = null;
      return a;
    }

    async branchMoved(name, from, to) {
      const { commits } = this.data;
      const head = commits.get(to);
      const now = U.ancestors(commits, to).set;
      let count = null;
      let force = false;
      if (now.has(from)) {
        const before = U.ancestors(commits, from).set;
        count = [...now].filter((s) => !before.has(s)).length;
      } else {
        // la cabeza anterior no está en lo cargado: si no es ancestro de la nueva, fue una reescritura
        try {
          force = !(await this.call('isAncestor', from, to));
        } catch {
          force = true;
        }
      }
      const base = { branch: name, sha: to, actor: this.authorOf(to), detail: head ? U.firstLine(head.message) : '' };
      if (force) return this.activity('force', { ...base, title: M('act.force', { name }), detail: M('act.forceDetail', { sha: U.shortSha(to) }) });
      if (head && head.parents.length > 1) return this.activity('merge', { ...base, title: M('act.merge', { name }) });
      return this.activity('push', { ...base, title: M('act.pushNew', { n: count || 1, name }) });
    }

    /* ---------- archivos (los planetas del modo galaxias) ---------- */

    async files({ sha, isDefault }) {
      const def = this.data.branches.get(this.data.repo.defaultBranch);
      if (isDefault || !def) {
        const r = await this.call('files', sha, null);
        return { kind: 'tree', files: r.files.map((f) => ({ path: f.path, size: f.size, url: null })), truncated: !!r.truncated };
      }
      const r = await this.call('files', sha, def.sha);
      return { kind: 'diff', base: def.name, files: r.files.map((f) => ({ ...f, url: null })), truncated: !!r.truncated };
    }

    /* ---------- los cambios de un commit (el panel de js/diff.js) ---------- */

    async commitDiff(sha) {
      const r = await this.call('diff', sha);
      return { files: GB.diff.parseGit(r.text), truncated: !!r.truncated };
    }

    /** git local no gasta cuota: los commits vecinos se adelantan. */
    diffCheap() {
      return true;
    }
  }

  GB.LocalGitSource = LocalGitSource;
})(window.GB);
