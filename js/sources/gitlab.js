/* GraphBranch — fuente de datos en vivo desde gitlab.com (API REST v4), para proyectos públicos.

   Hereda de la fuente de GitHub todo lo que no depende del servicio: el ciclo de sondeo con sus
   reintentos y su espera sin red, la prioridad para traer la historia de las ramas de a poco, la
   comparación entre ciclos que da las actividades (ramas nuevas, movidas, borradas; MRs abiertas,
   fusionadas y cerradas) y la limpieza de commits. Cambia lo propio de GitLab:

   - Las ramas se listan de a 100 por página, las actualizadas más recientemente primero, con ETag.
     Con más de 100, la primera página va en cada ciclo (ahí aparecen las nuevas y las que se
     movieron) y el listado entero, hasta MAX_PAGES, cada FULL_MS (ahí se notan las borradas).
   - La historia sale de comparar dos puntos (`repository/compare`), no del listado de commits:
     gitlab.com le pone un desafío de Cloudflare a ese listado cuando la consulta no lleva token, y
     una página no lo puede resolver. Una rama nueva trae lo suyo desde la rama por defecto; una
     rama que se movió, lo nuevo desde su cabeza anterior; la rama por defecto, sus últimos pasos.
   - Las merge requests se muestran como en GitLab: MR !12.
   - Sin token: gitlab.com permite cientos de consultas por minuto desde cada IP, así que el sondeo
     va cada POLL_MS. Los proyectos privados quedan para una entrega con token propio. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  const WEB = 'https://gitlab.com';
  const API = WEB + '/api/v4';
  const POLL_MS = 15000; // entre ciclos
  const PULLS_MS = 30000; // entre consultas de MRs
  const FULL_MS = 3 * 60000; // entre listados enteros de ramas, con más de 100
  const MAX_PAGES = 10; // ramas listadas como mucho: 1.000, las actualizadas más recientemente
  const TREE_PAGES = 20; // archivos del árbol como mucho: 2.000 (los planetas del modo galaxias)
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);
  /** Los textos que nombran a GitHub o a sus PRs, cambiados por los de GitLab. */
  const TERMS = {
    'status.connecting': 'status.connectingGitlab',
    'err.network': 'err.networkGitlab',
    'err.timeout': 'err.timeoutGitlab',
    'act.prOpened': 'act.mrOpened',
    'act.prOpenedDraft': 'act.mrOpenedDraft',
    'act.prMergedInto': 'act.mrMergedInto',
    'act.prClosed': 'act.mrClosed',
  };
  /** Cada parte de una ruta (grupos, ramas con "/") escapada por separado: las barras quedan. */
  const segs = (path) => String(path).split('/').map(encodeURIComponent).join('/');

  class GitLabSource extends GB.GitHubSource {
    /** `path`: grupo(s) y proyecto, como en su URL (`gitlab-org/gitlab-runner`, `grupo/sub/proyecto`). */
    constructor({ path, depth = 40, filter = '', pins = [] }) {
      const cut = path.lastIndexOf('/');
      super({ owner: path.slice(0, cut), name: path.slice(cut + 1), token: '', depth, filter, pins });
      this.host = 'gitlab';
      this.path = path;
      this.mode = 'list';
      this.data.repo.url = `${WEB}/${segs(path)}`;
      this.data.repo.host = 'gitlab';
      this.fullAt = 0; // último listado entero de ramas
      this.paged = false; // tiene más de 100 ramas
      this.prevHead = new Map(); // cabeza nueva -> la anterior de esa rama: de ahí se pide lo nuevo
    }

    get base() {
      return `/projects/${encodeURIComponent(this.path)}`;
    }

    term(key) {
      return TERMS[key] || key;
    }

    /** Las páginas de GitLab de una rama, un commit, una comparación o un archivo. */
    link(kind, a, b) {
      const u = this.data.repo.url;
      if (kind === 'tree') return `${u}/-/tree/${segs(a)}`;
      if (kind === 'commits') return `${u}/-/commits/${segs(a)}`;
      if (kind === 'commit') return `${u}/-/commit/${a}`;
      if (kind === 'compare') return `${u}/-/compare/${a}...${b}`;
      return `${u}/-/blob/${a}/${segs(b)}`;
    }

    /* ---------- HTTP ---------- */

    async api(path, { cacheKey = null, allow = [] } = {}) {
      const headers = {};
      const cached = cacheKey ? this.etags.get(cacheKey) : null;
      if (cached) headers['If-None-Match'] = cached.etag;
      const { res, body } = await this.request(API + path, { headers, cache: 'no-store' });
      this.cost++;
      if (res.status === 304 && cached) return { data: cached.data, fresh: false, headers: res.headers };
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      const etag = res.headers.get('ETag');
      if (cacheKey && etag) this.etags.set(cacheKey, { etag, data: body });
      return { data: body, fresh: true, headers: res.headers };
    }

    notFound() {
      return new ApiError(M('err.notFoundGitlab', { repo: this.path }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      const msg = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : res.statusText || '';
      if (res.status === 404) return this.notFound();
      // demasiadas consultas: GitLab no deja leer cuándo se renueva su cuota, se espera un minuto
      if (res.status === 429) return new ApiError(M('err.rateGitlab'), { status: 429, kind: 'rate', resetAt: Date.now() + 60000 });
      return new ApiError(msg ? M('err.httpGitlab', { status: res.status, message: msg }) : M('err.httpNoMessageGitlab', { status: res.status }), {
        status: res.status,
        kind: 'http',
      });
    }

    /** GitLab no deja leer su cuota desde la página (no expone esos encabezados): un ritmo fijo, holgado. */
    nextDelay() {
      this.exhausted = false;
      this.throttled = false;
      return POLL_MS;
    }

    due(name) {
      return name === 'pulls' && Date.now() - (this.lastPoll.pulls || 0) >= PULLS_MS - 500;
    }

    /** Historias de rama por ciclo, repartidas entre los proyectos de GitLab que se siguen a la vez. */
    restBudget() {
      return Math.max(1, Math.floor(40 / Math.max(1, this.share || 1)));
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
      if (initial) await this.loadRepo();
      if (reseed !== this.reseeded) this.prune();
      await this.syncBranchList(acts, quiet);
      if (initial || this.due('pulls')) await this.syncPulls(acts, initial);
      const before = this.cost;
      await this.fillBacklog(deadline);
      this.bulkCost += this.cost - before;
      this.data.mode = this.mode;
      this.reseeded = reseed;
      this.gc();
      this.countPending();
      return acts;
    }

    async loadRepo() {
      const { data: p } = await this.api(this.base);
      const path = p.path_with_namespace || this.path;
      const cut = path.lastIndexOf('/');
      Object.assign(this.data.repo, {
        owner: path.slice(0, cut),
        name: path.slice(cut + 1),
        defaultBranch: p.default_branch || null,
        url: p.web_url || `${WEB}/${segs(path)}`,
        private: !!p.visibility && p.visibility !== 'public',
        description: p.description || '',
      });
    }

    /** Una página de ramas, las actualizadas más recientemente primero. */
    async branchPage(page) {
      const res = await this.api(`${this.base}/repository/branches?per_page=100&sort=updated_desc&page=${page}`, { cacheKey: 'branches:' + page });
      const next = Number(res.headers?.get('X-Next-Page')) || (/rel="next"/.test(res.headers?.get('Link') || '') ? page + 1 : 0);
      return { list: res.data || [], next, total: Number(res.headers?.get('X-Total')) || 0 };
    }

    async syncBranchList(acts, quiet) {
      const first = await this.branchPage(1);
      this.paged = !!first.next;
      const entry = (b) => [b.name, { sha: b.commit?.id, protected: !!b.protected }];
      let remote;
      let total = first.list.length;
      if (!this.paged) remote = new Map(first.list.map(entry));
      else if (quiet || !this.fullAt || Date.now() - this.fullAt >= FULL_MS) {
        // el listado entero (hasta MAX_PAGES): con él se notan las ramas borradas
        const list = [...first.list];
        let next = first.next;
        for (let page = 2; next && page <= MAX_PAGES; page++) {
          const res = await this.branchPage(page);
          list.push(...res.list);
          next = res.next;
        }
        remote = new Map(list.map(entry));
        this.fullAt = Date.now();
        total = Math.max(first.total, remote.size);
      } else {
        // entre listados enteros, la primera página: las ramas nuevas y las que se movieron
        remote = new Map(this.remoteHeads);
        for (const b of first.list) remote.set(...entry(b));
        total = Math.max(first.total, remote.size);
      }
      // de dónde viene cada cabeza nueva: lo que falta se pide desde ahí
      this.prevHead.clear();
      for (const [name, info] of remote) {
        const was = this.data.branches.get(name)?.sha || this.remoteHeads.get(name)?.sha;
        if (was && was !== info.sha) this.prevHead.set(info.sha, was);
      }
      await this.applyBranchList(acts, quiet, remote);
      this.data.totalBranches = total;
      this.data.totalExact = !this.paged || remote.size < MAX_PAGES * 100;
    }

    /* ---------- commits ---------- */

    /**
     * Trae la historia que falta de esas cabezas, cada una con una comparación: desde su cabeza
     * anterior (una rama que se movió), desde la rama por defecto (una rama nueva: solo lo suyo) o,
     * para la rama por defecto, sus últimos pasos.
     */
    async ensureHistory(shas) {
      const { commits } = this.data;
      for (const sha of new Set(shas)) if (sha && !commits.has(sha)) await this.fetchBranch(sha);
    }

    /** Trae la historia de una cabeza y devuelve su sha (o null si GitLab no la encuentra). */
    async fetchBranch(sha) {
      const { commits, branches, repo } = this.data;
      const def = branches.get(repo.defaultBranch);
      const from = this.prevHead.get(sha) || (def && def.sha !== sha ? def.sha : null);
      if (from && commits.has(from)) {
        // tres puntos: desde donde se separaron; así una rama nueva trae solo lo suyo
        await this.compare(from, sha, false);
        if (commits.has(sha)) return sha;
      }
      // la rama por defecto, o una que no toca lo ya cargado: sus últimos pasos (o todos, si son
      // menos: cuántos hay lo dice GitLab, así no se pide un `sha~N` que no existe)
      const { data: seq } = await this.api(`${this.base}/repository/commits/${encodeURIComponent(sha)}/sequence?first_parent=true`, { allow: [404] });
      if (!seq) return null; // ese commit ya no existe
      const want = Math.max(2, Math.round(this.depth / 2));
      const n = Math.min(want, Math.max(0, (seq.count || 1) - 1));
      if (n > 0) await this.compare(`${sha}~${n}`, sha, true);
      if (n < want) await this.one(`${sha}~${n}`); // la historia entera cabe: también su primer commit
      return commits.has(sha) ? sha : null;
    }

    /** Un commit suelto (`sha` o `sha~N`); devuelve si existe. */
    async one(ref) {
      const { data } = await this.api(`${this.base}/repository/commits/${encodeURIComponent(ref)}`, { allow: [404] });
      if (data) this.addCommit(data);
      return !!data;
    }

    /** Suma los commits de una comparación (con el de la cabeza); null si alguno de los dos no existe. */
    async compare(from, to, straight) {
      const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&straight=${straight}`;
      const { data } = await this.api(`${this.base}/repository/compare?${q}`, { allow: [400, 404] });
      if (!data) return null;
      const list = data.commits || [];
      // los más nuevos primero, como mucho el doble de la profundidad (una rama muy larga se corta)
      list.sort((a, b) => Date.parse(b.committed_date) - Date.parse(a.committed_date));
      for (const c of list.slice(0, this.depth * 2)) this.addCommit(c);
      if (data.commit) this.addCommit(data.commit);
      return list.length;
    }

    addCommit(c) {
      if (!c?.id || this.data.commits.has(c.id)) return false;
      this.data.commits.set(c.id, {
        sha: c.id,
        parents: c.parent_ids || [],
        message: c.message || c.title || '',
        author: { name: c.author_name || '', login: null, avatar: null },
        date: Date.parse(c.committed_date || c.authored_date || c.created_at) || Date.now(),
        url: c.web_url || this.link('commit', c.id),
      });
      this.kids = null;
      return true;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = this.link('tree', name);
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
        // la cabeza anterior no está en lo cargado: si no es ancestro de la nueva, fue un force-push
        try {
          const { data } = await this.api(`${this.base}/repository/merge_base?refs[]=${encodeURIComponent(from)}&refs[]=${encodeURIComponent(to)}`, {
            allow: [400, 404],
          });
          force = data?.id !== from;
        } catch (err) {
          if (hard(err)) throw err;
          force = true;
        }
      }
      const base = { branch: name, sha: to, actor: this.authorOf(to), detail: head ? U.firstLine(head.message) : '' };
      if (force) {
        return this.activity('force', { ...base, title: M('act.force', { name }), detail: M('act.forceDetail', { sha: U.shortSha(to) }), url: this.link('commits', name) });
      }
      if (head && head.parents.length > 1) return this.activity('merge', { ...base, title: M('act.merge', { name }), url: head.url });
      const n = count || 1;
      return this.activity('push', { ...base, title: M('act.pushNew', { n, name }), url: n > 1 ? this.link('compare', from.slice(0, 12), to.slice(0, 12)) : head?.url });
    }

    /* ---------- merge requests ---------- */

    /** Una persona de GitLab; su avatar solo si está en gitlab.com (los de Gravatar los bloquea el CSP). */
    person(u) {
      if (!u) return null;
      const avatar = /^https:\/\/gitlab\.com\//.test(u.avatar_url || '') ? u.avatar_url : null;
      return { login: u.username, name: u.name || u.username, avatar };
    }

    mapPull(m) {
      return {
        number: m.iid,
        title: m.title || '',
        head: m.source_branch || '',
        base: m.target_branch || '',
        sameRepo: m.source_project_id === m.target_project_id,
        url: m.web_url,
        draft: !!(m.draft ?? m.work_in_progress),
        user: this.person(m.author),
        createdAt: Date.parse(m.created_at) || Date.now(),
        mr: true,
      };
    }

    async syncPulls(acts, initial) {
      const { data, fresh } = await this.api(`${this.base}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=50`, { cacheKey: 'pulls' });
      this.lastPoll.pulls = Date.now();
      if (!fresh && !initial) return;
      await this.applyPulls(acts, initial, (data || []).map((m) => this.mapPull(m)), null);
    }

    /** Qué pasó con las MRs que dejaron de estar abiertas: una consulta con las actualizadas hace poco. */
    async pullStates(numbers) {
      const out = new Map();
      try {
        const { data } = await this.api(`${this.base}/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=50`, { cacheKey: 'pulls-all' });
        const page = new Map((data || []).map((m) => [m.iid, m]));
        for (const n of numbers) {
          const m = page.get(n);
          if (!m) continue;
          const state = m.state === 'merged' || m.state === 'closed' ? m.state : 'open';
          out.set(n, { state, merged: state === 'merged', by: this.person(m.merged_by || m.merge_user) });
        }
      } catch (err) {
        if (hard(err)) throw err;
      }
      return out;
    }

    /* ---------- archivos (los planetas del modo galaxias) ---------- */

    /** En la rama por defecto, su árbol (GitLab no da el tamaño de cada archivo: los planetas salen
        parejos); en las demás, lo que cambió respecto de la rama por defecto, con sus líneas. */
    async files({ name, sha, isDefault }) {
      const def = this.data.branches.get(this.data.repo.defaultBranch);
      if (isDefault || !def) {
        const files = [];
        let url = `${this.base}/repository/tree?ref=${encodeURIComponent(sha)}&recursive=true&per_page=100&pagination=keyset`;
        let pages = 0;
        for (; url && pages < TREE_PAGES; pages++) {
          const res = await this.api(url);
          for (const e of res.data || []) if (e.type === 'blob') files.push({ path: e.path, size: null, url: this.link('blob', sha, e.path) });
          const next = (res.headers?.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
          url = next ? next[1].replace(API, '') : null;
        }
        return { kind: 'tree', files, truncated: !!url };
      }
      const { data } = await this.api(`${this.base}/repository/compare?from=${encodeURIComponent(def.sha)}&to=${encodeURIComponent(sha)}&straight=false`);
      const lines = (diff, mark) => (String(diff || '').match(new RegExp(`^\\${mark}(?!\\${mark}\\${mark} )`, 'gm')) || []).length;
      const files = (data?.diffs || []).map((d) => {
        const status = d.new_file ? 'added' : d.deleted_file ? 'removed' : d.renamed_file ? 'renamed' : 'modified';
        return {
          path: d.new_path,
          status,
          add: lines(d.diff, '+'),
          del: lines(d.diff, '-'),
          from: d.renamed_file ? d.old_path : null,
          url: status === 'removed' ? null : this.link('blob', sha, d.new_path),
        };
      });
      return { kind: 'diff', base: def.name, files, truncated: !!data?.compare_timeout };
    }
  }

  GB.GitLabSource = GitLabSource;
})(window.GB);
