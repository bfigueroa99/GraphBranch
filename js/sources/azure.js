/* GraphBranch — fuente de datos en vivo desde Azure DevOps (dev.azure.com, API REST 7.1 de Azure Repos),
   para repositorios de proyectos públicos y sin token.

   Hereda de la fuente de GitHub todo lo que no depende del servicio: el ciclo de sondeo con sus
   reintentos y su espera sin red, la prioridad para traer la historia de las ramas de a poco, la
   comparación entre ciclos que da las actividades (ramas nuevas, movidas, borradas; PRs abiertos,
   fusionados y cerrados) y la limpieza de commits. Cambia:

   - El repo se escribe `azure:organización/proyecto/repo` (o con la URL de `dev.azure.com/…/_git/…`):
     el dueño de la fuente es `organización/proyecto` y el nombre, el del repo.
   - dev.azure.com responde con `Access-Control-Allow-Origin: *`, así que la web lo lee directo.
   - Sin token: solo proyectos públicos. Un proyecto privado no responde 401 sino que redirige al inicio de
     sesión de Microsoft (otro origen): la consulta va con `redirect: 'manual'` y esa redirección cuenta como
     «no se encontró», igual que un repo que no existe.
   - Las ramas salen de `refs?filter=heads/` (hasta MAX_BRANCHES, por orden alfabético: el servicio no las
     ordena por fecha).
   - La lista de commits de Azure no trae los padres: solo la consulta de un commit suelto los da. Por eso la
     historia de una rama es una consulta de lista y, por cada commit que aún no se conoce, una de detalle
     (de a DETAIL_PARALLEL a la vez). Los commits que ya están cargados desde otra rama no se piden otra vez.
   - Los PRs son los de siempre ("#12"): activos, y los que dejan de estarlo se miran uno por uno
     (completado = fusionado, abandonado = cerrado).
   - Sin feed de eventos, ni tags, ni despliegues, ni checks, ni árbol de archivos, ni cambios de un commit, ni
     avatares (los de Azure DevOps piden sesión): el panel cuenta lo que se ve comparando ciclos.
   - Sin cuota publicada para consultas anónimas: el ritmo es POLL_MS entre ciclos y, si el servicio contesta
     429, se espera un minuto. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  const WEB = 'https://dev.azure.com';
  const VERSION = 'api-version=7.1';
  const POLL_MS = 60000; // entre ciclos
  const PULLS_MS = 120000; // entre consultas de PRs
  const MAX_BRANCHES = 500; // ramas pedidas como mucho
  const DETAIL_PARALLEL = 6; // consultas de commit suelto a la vez
  const DETAIL_MAX = 150; // y como mucho por historia pedida: más allá la rama queda cortada
  const LOADS = 6; // ramas por ciclo que se cargan de la lista de espera
  const WAIT_429 = 60000;
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);
  /** Los textos que nombran a GitHub, cambiados por los del servidor genérico (los de Forgejo dicen "el servidor"). */
  const TERMS = {
    'status.connecting': 'status.connectingAzure',
    'err.network': 'err.networkForge',
    'err.timeout': 'err.timeoutForge',
  };
  const enc = encodeURIComponent;
  const HEADS = 'refs/heads/';
  const branchOf = (ref) => (typeof ref === 'string' && ref.startsWith(HEADS) ? ref.slice(HEADS.length) : '');

  class AzureSource extends GB.GitHubSource {
    /** `owner` es "organización/proyecto"; `name`, el repo. */
    constructor({ owner, name, depth = 40, filter = '', pins = [] }) {
      super({ owner, name, token: '', depth, filter, pins });
      [this.org, this.project = ''] = String(owner).split('/');
      this.host = 'azure';
      this.mode = 'list';
      this.data.repo.url = this.web;
      this.data.repo.host = 'azure';
      // todavía sin árbol de archivos ni cambios de commit: la app ve que no están y no ofrece lo que los pide
      this.files = null;
      this.commitDiff = null;
    }

    get web() {
      return `${WEB}/${enc(this.org)}/${enc(this.project)}/_git/${enc(this.name)}`;
    }

    get base() {
      return `/${enc(this.org)}/${enc(this.project)}/_apis/git/repositories/${enc(this.name)}`;
    }

    term(key) {
      return TERMS[key] || key;
    }

    /* ---------- HTTP ---------- */

    async api(path, { allow = [] } = {}) {
      const sep = path.includes('?') ? '&' : '?';
      const { res, body } = await this.request(`${WEB}${path}${sep}${VERSION}`, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'manual' });
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      return { data: body, fresh: true, headers: res.headers };
    }

    notFound() {
      return new ApiError(M('err.notFoundAzure', { repo: `${this.owner}/${this.name}` }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      // un proyecto privado redirige al inicio de sesión (en el navegador, una respuesta opaca de estado 0); 401, 403 y 404, igual que un repo que no existe
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) || [0, 401, 403, 404].includes(res.status)) return this.notFound();
      if (res.status === 429) return new ApiError(M('err.rateForge'), { status: 429, kind: 'rate', resetAt: Date.now() + WAIT_429 });
      const msg = typeof body?.message === 'string' ? body.message.replace(/^TF\d+:\s*/, '').slice(0, 200) : '';
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
      return LOADS;
    }

    /** Las páginas de Azure DevOps de una rama, un commit, una comparación o un archivo. */
    link(kind, a, b) {
      const u = this.data.repo.url;
      if (kind === 'tree') return `${u}?version=GB${enc(a)}`;
      if (kind === 'commits') return `${u}?version=GB${enc(a)}&_a=history`;
      if (kind === 'commit') return `${u}/commit/${a}`;
      if (kind === 'compare') return `${u}/branchCompare?baseVersion=GC${a}&targetVersion=GC${b}`;
      return `${u}?path=/${String(b).split('/').map(enc).join('/')}&version=GC${a}`;
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
      // si quedan ramas por cargar, los ciclos de seguido no vuelven a listar las ramas: solo cargan historia
      const continuing = this.more && !quiet && Date.now() - (this.lastPoll.branches || 0) < POLL_MS;
      if (!continuing) {
        await this.syncBranchList(acts, quiet);
        this.lastPoll.branches = Date.now();
      }
      if (initial || this.due('pulls')) await this.syncPulls(acts, initial);
      await this.fillBacklog(deadline);
      this.data.mode = this.mode;
      this.reseeded = reseed;
      this.gc();
      this.countPending();
      return acts;
    }

    /** Un enlace de la API solo vale si cuelga de dev.azure.com: lo demás (javascript:, otro sitio) se descarta. */
    webUrl(u) {
      return typeof u === 'string' && u.startsWith(WEB + '/') ? u : '';
    }

    async loadRepo() {
      const { data: p } = await this.api(this.base);
      Object.assign(this.data.repo, {
        owner: this.owner,
        name: p.name || this.name,
        defaultBranch: branchOf(p.defaultBranch) || null,
        url: this.webUrl(p.webUrl) || this.data.repo.url,
        private: p.project?.visibility ? p.project.visibility !== 'public' : false,
        description: p.project?.description || '',
      });
    }

    async syncBranchList(acts, quiet) {
      const { data, headers } = await this.api(`${this.base}/refs?filter=heads/&$top=${MAX_BRANCHES}`);
      const values = Array.isArray(data?.value) ? data.value : [];
      const remote = new Map();
      for (const r of values) {
        const name = branchOf(r.name);
        if (name && r.objectId) remote.set(name, { sha: r.objectId, protected: false });
      }
      await this.applyBranchList(acts, quiet, remote);
      this.data.totalExact = !headers?.get?.('x-ms-continuationtoken') && values.length < MAX_BRANCHES;
    }

    /* ---------- commits ---------- */

    /** La historia de una cabeza: la lista (sin padres) y, de cada commit que aún no se conoce, su detalle. */
    async fetchBranch(sha) {
      const { data } = await this.api(`${this.base}/commits?searchCriteria.itemVersion.version=${enc(sha)}&searchCriteria.itemVersion.versionType=commit&searchCriteria.$top=${Math.min(DETAIL_MAX, this.depth)}`, { allow: [404] });
      const list = (data?.value || []).filter((c) => c?.commitId);
      const missing = list.filter((c) => !this.data.commits.has(c.commitId));
      const details = new Map();
      for (let i = 0; i < missing.length; i += DETAIL_PARALLEL) {
        const batch = missing.slice(i, i + DETAIL_PARALLEL);
        const got = await Promise.all(
          batch.map(async (c) => {
            try {
              return (await this.api(`${this.base}/commits/${enc(c.commitId)}?changeCount=0`, { allow: [404] })).data;
            } catch (err) {
              if (hard(err)) throw err;
              return null;
            }
          }),
        );
        batch.forEach((c, k) => got[k] && details.set(c.commitId, got[k]));
      }
      // en el orden de la lista: la cabeza primero
      for (const c of list) if (details.has(c.commitId)) this.addCommit(details.get(c.commitId));
      return list[0]?.commitId || null;
    }

    /** Pasa un commit de Azure DevOps a la forma que entiende la fuente de GitHub. */
    addCommit(c) {
      if (!c?.commitId) return false;
      const name = c.author?.name || c.committer?.name || '';
      const added = super.addCommit({
        sha: c.commitId,
        parents: (c.parents || []).map((sha) => ({ sha })),
        html_url: this.link('commit', c.commitId),
        commit: { message: c.comment || '', author: { name, date: c.author?.date }, committer: { date: c.committer?.date || c.author?.date } },
        author: { login: name || null, avatar_url: null },
      });
      if (added) this.data.commits.get(c.commitId).url = this.link('commit', c.commitId);
      return added;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = this.link('tree', name);
      return a;
    }

    /** Los commits que `to` tiene y `from` no; null si alguno ya no existe. Azure los da al revés de lo que
        parece: con `compareVersion` devuelve lo que ese lado tiene y `itemVersion` no (comprobado contra dev.azure.com). */
    async ahead(from, to) {
      const { data } = await this.api(`${this.base}/commits?searchCriteria.itemVersion.version=${enc(from)}&searchCriteria.itemVersion.versionType=commit&searchCriteria.compareVersion.version=${enc(to)}&searchCriteria.compareVersion.versionType=commit&searchCriteria.$top=100`, { allow: [404] });
      return data ? (data.value || []).length : null;
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
      return this.activity('push', { ...base, title: M('act.pushNew', { n, name }), url: n > 1 ? this.link('compare', from, to) : head?.url });
    }

    /* ---------- pull requests ---------- */

    person(u) {
      if (!u) return null;
      return { login: u.uniqueName || u.displayName || null, name: u.displayName || u.uniqueName || '', avatar: null };
    }

    mapPull(p) {
      return {
        number: p.pullRequestId,
        title: p.title || '',
        head: branchOf(p.sourceRefName),
        base: branchOf(p.targetRefName),
        sameRepo: !p.forkSource,
        url: `${this.data.repo.url}/pullrequest/${p.pullRequestId}`,
        draft: !!p.isDraft,
        user: this.person(p.createdBy),
        createdAt: Date.parse(p.creationDate) || Date.now(),
      };
    }

    async syncPulls(acts, initial) {
      const { data } = await this.api(`${this.base}/pullrequests?searchCriteria.status=active&$top=50`);
      this.lastPoll.pulls = Date.now();
      const list = (data?.value || []).filter((p) => Number.isFinite(p?.pullRequestId));
      await this.applyPulls(acts, initial, list.map((p) => this.mapPull(p)), null);
    }

    /** Qué pasó con los PRs que dejaron de estar activos: una consulta por PR (son pocos por ciclo). */
    async pullStates(numbers) {
      const out = new Map();
      for (const n of numbers) {
        try {
          const { data: p } = await this.api(`${this.base}/pullrequests/${Number(n)}`, { allow: [404] });
          if (!p) continue;
          out.set(n, { state: p.status === 'active' ? 'open' : 'closed', merged: p.status === 'completed', by: this.person(p.closedBy) });
        } catch (err) {
          if (hard(err)) throw err;
        }
      }
      return out;
    }

    /** Todavía sin edición de archivos. */
    canEdit() {
      return false;
    }

    /** Sin cambios de commit: nada que pedir barato. */
    diffCheap() {
      return false;
    }
  }

  GB.AzureSource = AzureSource;
})(window.GB);
