/* GraphBranch — fuente de datos en vivo desde un Bitbucket Data Center o Server propio (API REST 1.0,
   `https://host/rest/api/1.0`), para repos a los que se llega sin credenciales.

   Hereda de la fuente de GitHub todo lo que no depende del servicio (el ciclo de sondeo con sus
   reintentos y su espera sin red, la prioridad para traer la historia de las ramas de a poco, la
   comparación entre ciclos que da las actividades y la limpieza de commits). Cambia:

   - El repo es `CLAVE/repo` (la clave del proyecto, o `~usuario` para uno personal) y se escribe como
     `bitbucketdc:CLAVE/repo` o con su URL (`https://host/projects/CLAVE/repos/repo/browse`, también
     `/users/ana/repos/repo`, `/scm/clave/repo.git`).
   - Las páginas se piden con `limit` y se siguen con `start` mientras `isLastPage` sea falso.
   - Las ramas salen ordenadas por modificación, hasta MAX_PAGES páginas: 500 ramas.
   - La historia sale del listado de commits de cada cabeza (`commits?until=`), y un force-push se
     distingue con `since`/`until` en las dos direcciones.
   - Los PRs son los de siempre ("#12"); el servidor marca los borradores con `draft`.
   - Sin feed de eventos, ni tags, ni despliegues, ni checks: el panel cuenta lo que se ve comparando
     ciclos. El árbol de archivos (galaxias) sale de `files?at=`, sin tamaños.
   - Sin avatares (el CSP no nombra el host en `img-src`) y sin token: ni el de Bitbucket Cloud de
     Ajustes ni ningún otro sale hacia un servidor propio. Solo se leen repos que el servidor deja ver
     sin credenciales; uno que no, responde 401 o 404 y se dice como no encontrado.
   - El servidor es de quien lo opera, sin cuota de la plataforma: se sondea cada POLL_MS. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  /** Las direcciones de un Bitbucket propio: `https://git.miempresa.com`, también con una ruta si cuelga de una. null si no es una
      URL https o lleva usuario. */
  const endpoints = (webUrl) => {
    try {
      const u = new URL(String(webUrl || ''));
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      const web = (u.origin + u.pathname).replace(/\/+$/, '');
      return { web, api: web + '/rest/api/1.0' };
    } catch {
      return null;
    }
  };
  const POLL_MS = 20000; // entre ciclos
  const PULLS_MS = 40000; // entre consultas de PRs
  const PAGE = 100; // por página
  const MAX_PAGES = 5; // ramas listadas como mucho: 500
  const TREE_PAGES = 10; // páginas del árbol como mucho: 10.000 archivos
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);
  const TERMS = {
    'status.connecting': 'status.connectingForge',
    'err.network': 'err.networkForge',
    'err.timeout': 'err.timeoutForge',
  };
  const segs = (path) => String(path).split('/').map(encodeURIComponent).join('/');
  const enc = encodeURIComponent;

  class BitbucketServerSource extends GB.GitHubSource {
    /** `webUrl`: la dirección del servidor (?bitbucket=, --bitbucket-url=). `owner` es la clave del proyecto; `name`, el slug. */
    constructor({ owner, name, depth = 40, filter = '', pins = [], webUrl = '' }) {
      super({ owner, name, token: '', depth, filter, pins });
      this.ep = endpoints(webUrl) || { web: 'https://bitbucket.invalid', api: 'https://bitbucket.invalid/rest/api/1.0' };
      this.host = 'bitbucketdc';
      this.mode = 'list';
      this.data.repo.url = this.repoUrl();
      this.data.repo.host = 'bitbucketdc';
      this.prevHead = new Map();
    }

    /** La página del repo: `projects/CLAVE/repos/repo` o, si es personal (`~ana`), `users/ana/repos/repo`. */
    repoUrl() {
      const personal = this.owner.startsWith('~');
      return `${this.ep.web}/${personal ? 'users' : 'projects'}/${enc(personal ? this.owner.slice(1) : this.owner)}/repos/${enc(this.name)}`;
    }

    get base() {
      return `/projects/${enc(this.owner)}/repos/${enc(this.name)}`;
    }

    term(key) {
      return TERMS[key] || key;
    }

    /* ---------- HTTP ---------- */

    async api(path, { allow = [] } = {}) {
      const { res, body } = await this.request(this.ep.api + path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      return { data: body, fresh: true, headers: res.headers };
    }

    notFound() {
      return new ApiError(M('err.notFoundForge', { repo: `${this.owner}/${this.name}` }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      if (res.status === 404 || res.status === 401 || res.status === 403) return this.notFound();
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        return new ApiError(M('err.rateForge'), { status: 429, kind: 'rate', resetAt: Date.now() + (wait > 0 ? wait * 1000 : 60000) });
      }
      const msg = typeof body?.errors?.[0]?.message === 'string' ? body.errors[0].message : res.statusText || '';
      return new ApiError(msg ? M('err.httpForge', { status: res.status, message: msg }) : M('err.httpNoMessageForge', { status: res.status }), {
        status: res.status,
        kind: 'http',
      });
    }

    nextDelay() {
      this.exhausted = false;
      this.throttled = false;
      return POLL_MS;
    }

    due(name) {
      const period = { pulls: PULLS_MS }[name];
      return !!period && Date.now() - (this.lastPoll[name] || 0) >= period - 500;
    }

    restBudget() {
      return Math.max(1, Math.floor(40 / Math.max(1, this.share || 1)));
    }

    /** Las páginas de Bitbucket de una rama, un commit, una comparación o un archivo. */
    link(kind, a, b) {
      const u = this.data.repo.url;
      if (kind === 'tree') return `${u}/browse?at=${enc('refs/heads/' + a)}`;
      if (kind === 'commits') return `${u}/commits?until=${enc('refs/heads/' + a)}`;
      if (kind === 'commit') return `${u}/commits/${a}`;
      if (kind === 'compare') return `${u}/compare/commits?sourceBranch=${enc(b)}&targetBranch=${enc(a)}`;
      return `${u}/browse/${segs(b)}?at=${enc(a)}`;
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
      const { data: def } = await this.api(`${this.base}/default-branch`, { allow: [404, 204] }).catch((err) => {
        if (hard(err)) throw err;
        return { data: null };
      });
      Object.assign(this.data.repo, {
        owner: p.project?.key || this.owner,
        name: p.slug || this.name,
        defaultBranch: def?.displayId || null,
        private: p.public === false,
        description: p.description || '',
      });
    }

    async syncBranchList(acts, quiet) {
      const list = [];
      let full = true;
      let start = 0;
      for (let page = 1; ; page++) {
        const { data } = await this.api(`${this.base}/branches?limit=${PAGE}&start=${start}&orderBy=MODIFICATION`);
        list.push(...(data?.values || []));
        if (data?.isLastPage !== false || !Number.isFinite(data?.nextPageStart)) break;
        start = data.nextPageStart;
        if (page >= MAX_PAGES) {
          full = false;
          break;
        }
      }
      const remote = new Map(list.filter((b) => b.displayId && b.latestCommit).map((b) => [b.displayId, { sha: b.latestCommit, protected: false }]));
      this.prevHead.clear();
      for (const [name, info] of remote) {
        const was = this.data.branches.get(name)?.sha || this.remoteHeads.get(name)?.sha;
        if (was && was !== info.sha) this.prevHead.set(info.sha, was);
      }
      await this.applyBranchList(acts, quiet, remote);
      this.data.totalExact = full;
    }

    /* ---------- commits ---------- */

    async fetchBranch(sha) {
      const { data } = await this.api(`${this.base}/commits?until=${enc(sha)}&limit=${Math.min(PAGE, this.depth)}`, { allow: [404] });
      const values = data?.values || [];
      for (const c of values) this.addCommit(c);
      return values[0]?.id || null;
    }

    /** Pasa un commit de Bitbucket Data Center a la forma que entiende la fuente de GitHub. */
    addCommit(c) {
      if (!c?.id) return false;
      const a = c.author || {};
      const added = super.addCommit({
        sha: c.id,
        parents: (c.parents || []).map((p) => ({ sha: p.id })),
        commit: { message: c.message || '', author: { name: a.displayName || a.name || '', date: new Date(c.authorTimestamp || 0).toISOString() }, committer: { date: new Date(c.committerTimestamp || c.authorTimestamp || 0).toISOString() } },
        author: { login: a.slug || a.name || null, avatar_url: null },
      });
      if (added) this.data.commits.get(c.id).url = this.link('commit', c.id);
      return added;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = this.link('tree', name);
      return a;
    }

    /** Los commits que `to` tiene y `from` no (hasta 100); null si alguno ya no existe. */
    async ahead(from, to) {
      const { data } = await this.api(`${this.base}/commits?until=${enc(to)}&since=${enc(from)}&limit=${PAGE}`, { allow: [404] });
      return data ? (data.values || []).length : null;
    }

    async branchMoved(name, from, to) {
      const { commits } = this.data;
      const head = commits.get(to);
      const now = U.ancestors(commits, to).set;
      let count = null;
      let force = false;
      let behind = 0;
      if (now.has(from)) {
        const before = U.ancestors(commits, from).set;
        count = [...now].filter((s) => !before.has(s)).length;
      } else {
        // la cabeza anterior no está en lo cargado: si tiene commits que la nueva no tiene, fue un force-push
        try {
          const lost = await this.ahead(to, from);
          if (lost === null) force = true;
          else if (lost > 0) {
            force = true;
            behind = lost;
          } else count = await this.ahead(from, to);
        } catch (err) {
          if (hard(err)) throw err;
          force = true;
        }
      }
      const base = { branch: name, sha: to, actor: this.authorOf(to), detail: head ? U.firstLine(head.message) : '' };
      if (force) {
        return this.activity('force', {
          ...base,
          title: M('act.force', { name }),
          detail: behind ? M('act.forceDetailDropped', { n: behind, sha: U.shortSha(to) }) : M('act.forceDetail', { sha: U.shortSha(to) }),
          url: this.link('commits', name),
        });
      }
      if (head && head.parents.length > 1) return this.activity('merge', { ...base, title: M('act.merge', { name }), url: head.url });
      const n = count || 1;
      return this.activity('push', { ...base, title: M('act.pushNew', { n, name }), url: n > 1 ? this.link('compare', name, name) : head?.url });
    }

    /* ---------- pull requests ---------- */

    person(u) {
      const user = u?.user || u;
      if (!user) return null;
      return { login: user.slug || user.name || null, name: user.displayName || user.name || '', avatar: null };
    }

    mapPull(p) {
      const ref = p.fromRef?.repository;
      const sameRepo = (ref?.slug || '').toLowerCase() === this.name.toLowerCase() && (ref?.project?.key || '').toLowerCase() === this.owner.toLowerCase();
      const href = p.links?.self?.[0]?.href;
      return {
        number: p.id,
        title: p.title || '',
        head: p.fromRef?.displayId || '',
        base: p.toRef?.displayId || '',
        sameRepo,
        url: typeof href === 'string' && href.startsWith(this.ep.web + '/') ? href : `${this.data.repo.url}/pull-requests/${p.id}`,
        draft: !!p.draft,
        user: this.person(p.author),
        createdAt: Number(p.createdDate) || Date.now(),
      };
    }

    async syncPulls(acts, initial) {
      const { data } = await this.api(`${this.base}/pull-requests?state=OPEN&order=NEWEST&limit=${PAGE}`);
      this.lastPoll.pulls = Date.now();
      await this.applyPulls(acts, initial, (data?.values || []).map((p) => this.mapPull(p)), null);
    }

    /** Qué pasó con los PRs que dejaron de estar abiertos: una consulta por PR (son pocos por ciclo). */
    async pullStates(numbers) {
      const out = new Map();
      for (const n of numbers) {
        try {
          const { data: p } = await this.api(`${this.base}/pull-requests/${Number(n)}`, { allow: [404] });
          if (!p) continue;
          out.set(n, { state: p.state === 'OPEN' ? 'open' : 'closed', merged: p.state === 'MERGED', by: null });
        } catch (err) {
          if (hard(err)) throw err;
        }
      }
      return out;
    }

    /* ---------- archivos (los planetas del modo galaxias) ---------- */

    /** El árbol del commit: el servidor da solo las rutas, sin tamaños (cada archivo cuenta como 1). */
    async files({ sha }) {
      const files = [];
      let truncated = false;
      let start = 0;
      for (let page = 1; ; page++) {
        const { data } = await this.api(`${this.base}/files?at=${enc(sha)}&limit=1000&start=${start}`);
        for (const path of data?.values || []) if (typeof path === 'string') files.push({ path, size: 1, url: this.link('blob', sha, path) });
        if (data?.isLastPage !== false || !Number.isFinite(data?.nextPageStart)) break;
        start = data.nextPageStart;
        if (page >= TREE_PAGES) {
          truncated = true;
          break;
        }
      }
      return { kind: 'tree', files, truncated };
    }

    /* ---------- los cambios de un commit (el panel de js/diff.js) ---------- */

    /** Los cambios de un commit frente a su primer padre: el JSON de `commits/{sha}/diff`, pasado a diff en texto. */
    async commitDiff(sha) {
      const { data } = await this.api(`${this.base}/commits/${enc(sha)}/diff?contextLines=3`);
      const out = [];
      for (const d of data?.diffs || []) {
        const from = d.source?.toString || '';
        const to = d.destination?.toString || '';
        out.push(`diff --git a/${from || to} b/${to || from}`);
        if (!from) out.push('new file mode 100644');
        else if (!to) out.push('deleted file mode 100644');
        out.push(`--- ${from ? 'a/' + from : '/dev/null'}`, `+++ ${to ? 'b/' + to : '/dev/null'}`);
        for (const h of d.hunks || []) {
          out.push(`@@ -${h.sourceLine},${h.sourceSpan} +${h.destinationLine},${h.destinationSpan} @@`);
          for (const seg of h.segments || []) {
            const mark = seg.type === 'ADDED' ? '+' : seg.type === 'REMOVED' ? '-' : ' ';
            for (const l of seg.lines || []) out.push(mark + (l.line ?? ''));
          }
        }
      }
      const files = GB.diff.parseGit(out.join('\n')).map((f) => ({ ...f, url: f.status === 'removed' ? null : this.link('blob', sha, f.path) }));
      return { files, truncated: !!data?.truncated };
    }

    diffCheap() {
      return true;
    }
  }

  BitbucketServerSource.endpoints = endpoints;
  GB.BitbucketServerSource = BitbucketServerSource;
})(window.GB);
