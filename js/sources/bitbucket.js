/* GraphBranch — fuente de datos en vivo desde bitbucket.org (API 2.0 de Bitbucket Cloud), para
   repositorios públicos.

   Hereda de la fuente de GitHub todo lo que no depende del servicio: el ciclo de sondeo con sus
   reintentos y su espera sin red, la prioridad para traer la historia de las ramas de a poco, la
   comparación entre ciclos que da las actividades (ramas nuevas, movidas, borradas; PRs abiertos,
   fusionados y cerrados) y la limpieza de commits. Cambia:

   - Sin token, Bitbucket deja 60 consultas por hora por IP, y su respuesta no deja leer cuántas
     quedan (el encabezado no se expone al navegador). Por eso la fuente lleva su propia cuenta de lo
     gastado en la última hora, reparte ese tope entre los repos de Bitbucket abiertos, y espacia los
     ciclos: cada POLL_MS como mínimo y más si cada ciclo cuesta más de una consulta.
   - Las páginas se piden con `pagelen` (tope de 100) y se siguen con el `next` de la respuesta.
   - Las ramas salen ordenadas por la fecha de su última cambio, hasta MAX_PAGES páginas: 300 ramas.
   - La historia sale del listado de commits de cada cabeza (`commits/{hash}`).
   - Una rama que se movió y cuya cabeza anterior no está cargada se distingue de un force-push con
     dos consultas (`commits/{b}?exclude={a}` y la inversa).
   - Los PRs son los de siempre ("#12"); Bitbucket marca los borradores con `draft`.
   - Sin feed de eventos, ni tags, ni despliegues, ni checks: el panel cuenta lo que se ve comparando
     ciclos. El árbol de archivos (galaxias) se lee hasta TREE_PAGES páginas: 500 archivos.
   - Sin avatares: los de Bitbucket están en hosts que el CSP no admite.
   - Sin token, solo repos públicos: uno privado responde 404 (o 403), como uno que no existe. Con el
     token de Bitbucket de Ajustes (un token de acceso de repositorio o de espacio de trabajo, con
     `Authorization: Bearer …`) se ven también los privados: va en cada consulta, y solo a
     api.bitbucket.org. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  const WEB = 'https://bitbucket.org';
  const API = 'https://api.bitbucket.org/2.0';
  const POLL_MS = 90000; // entre ciclos, como mínimo
  const PULLS_MS = 300000; // entre consultas de PRs
  const PAGE = 100; // tope del servidor por página
  const MAX_PAGES = 3; // páginas de ramas como mucho: 300
  const TREE_PAGES = 5; // páginas del árbol como mucho: 500 archivos
  const HOUR = 3600000;
  const QUOTA = 48; // de las 60 por hora: el resto queda de margen
  const LOAD_SHARE = 0.6; // de esa cuota, lo más que gasta cargar historia
  const RESERVE = 2; // consultas que se dejan de margen para la lista de ramas y los PRs
  const WAIT_429 = 60000; // sin Retry-After legible, lo que se espera tras un 429
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);
  /** Los textos que nombran a GitHub, cambiados por los de Bitbucket. */
  const TERMS = {
    'status.connecting': 'status.connectingBitbucket',
    'err.network': 'err.networkBitbucket',
    'err.timeout': 'err.timeoutBitbucket',
  };
  const segs = (path) => String(path).split('/').map(encodeURIComponent).join('/');
  const enc = encodeURIComponent;

  class BitbucketSource extends GB.GitHubSource {
    /** `token`: el de Bitbucket; no va en `this.token`, que es el de GitHub. */
    constructor({ owner, name, token = '', depth = 40, filter = '', pins = [] }) {
      super({ owner, name, token: '', depth, filter, pins });
      this.bitbucketToken = token;
      this.host = 'bitbucket';
      this.mode = 'list';
      this.data.repo.url = `${WEB}/${enc(owner)}/${enc(name)}`;
      this.data.repo.host = 'bitbucket';
      this.sent = []; // cuándo salió cada consulta de la última hora
    }

    get base() {
      return `/repositories/${enc(this.owner)}/${enc(this.name)}`;
    }

    term(key) {
      return TERMS[key] || key;
    }

    /* ---------- HTTP y cuota ---------- */

    /** Consultas gastadas en la última hora. */
    used() {
      const from = Date.now() - HOUR;
      this.sent = this.sent.filter((t) => t > from);
      return this.sent.length;
    }

    /** El tope por hora de esta fuente: se reparte entre los repos de Bitbucket abiertos. */
    quota() {
      return Math.max(1, Math.floor(QUOTA / Math.max(1, this.share || 1)));
    }

    /** Las cabeceras de una consulta: el token de Bitbucket, si lo hay, solo a api.bitbucket.org. */
    headers(accept) {
      return this.bitbucketToken ? { Accept: accept, Authorization: `Bearer ${this.bitbucketToken}` } : { Accept: accept };
    }

    async api(path, { allow = [] } = {}) {
      this.sent.push(Date.now());
      const { res, body } = await this.request(API + path, { headers: this.headers('application/json'), cache: 'no-store' });
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      return { data: body, fresh: true, headers: res.headers };
    }

    /** La ruta de la página siguiente de una respuesta, solo si es de la propia API. */
    nextOf(data) {
      const next = typeof data?.next === 'string' ? data.next : '';
      return next.startsWith(API + '/') ? next.slice(API.length) : null;
    }

    notFound() {
      return new ApiError(M('err.notFoundBitbucket', { repo: `${this.owner}/${this.name}` }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      if (res.status === 404 || res.status === 403) return this.notFound();
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        return new ApiError(M('err.rateBitbucket'), { status: 429, kind: 'rate', resetAt: Date.now() + (wait > 0 ? wait * 1000 : WAIT_429) });
      }
      const msg = typeof body?.error?.message === 'string' ? body.error.message : res.statusText || '';
      return new ApiError(msg ? M('err.httpBitbucket', { status: res.status, message: msg }) : M('err.httpNoMessageBitbucket', { status: res.status }), {
        status: res.status,
        kind: 'http',
      });
    }

    /** Espacia los ciclos para que las 60 consultas por hora alcancen: lo que cuesta un ciclo normal
        (sin cargar ramas que esperaban) por los ciclos que caben. Con la cuota gastada, espera a que
        la consulta más vieja salga de la hora. */
    nextDelay() {
      this.avgCost = this.avgCost * 0.6 + Math.max(1, this.cost - this.bulkCost) * 0.4;
      const share = Math.max(1, this.share || 1);
      this.exhausted = false;
      if (this.more) {
        // quedan ramas por cargar y hay cuota: se sigue enseguida (el ciclo lo acorta); sin cuota, countPending ya apagó `more`
        this.throttled = false;
        return POLL_MS;
      }
      let delay = Math.max(POLL_MS, (this.avgCost * share * HOUR) / (QUOTA - RESERVE * 2));
      if (this.used() >= this.quota() - RESERVE) {
        this.exhausted = true;
        delay = Math.max(delay, (this.sent[0] || Date.now()) + HOUR - Date.now() + 2000);
      }
      this.throttled = delay > POLL_MS * 1.5;
      return delay;
    }

    due(name) {
      const period = { pulls: PULLS_MS }[name];
      return !!period && Date.now() - (this.lastPoll[name] || 0) >= period - 500;
    }

    /** Consultas que quedan para cargar historia: hasta el 60 % de la cuota de la hora. El resto queda
        para los ciclos, que son los que traen lo que pasa en vivo. */
    restBudget() {
      return Math.max(0, Math.floor(this.quota() * LOAD_SHARE) - this.used());
    }

    /** Las páginas de Bitbucket de una rama, un commit, una comparación o un archivo. */
    link(kind, a, b) {
      const u = this.data.repo.url;
      if (kind === 'tree') return `${u}/src/${segs(a)}`;
      if (kind === 'commits') return `${u}/commits/branch/${segs(a)}`;
      if (kind === 'commit') return `${u}/commits/${a}`;
      if (kind === 'compare') return `${u}/branches/compare/${a}%0D${b}`;
      return `${u}/src/${a}/${segs(b)}`;
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
      const before = this.cost;
      await this.fillBacklog(deadline);
      this.bulkCost += this.cost - before;
      this.data.mode = this.mode;
      this.reseeded = reseed;
      this.gc();
      this.countPending();
      return acts;
    }

    /** Un enlace de la API solo vale si cuelga de bitbucket.org: lo demás (javascript:, otro sitio) se descarta. */
    webUrl(u) {
      return typeof u === 'string' && u.startsWith(WEB + '/') ? u : '';
    }

    async loadRepo() {
      const { data: p } = await this.api(this.base);
      Object.assign(this.data.repo, {
        owner: p.workspace?.slug || this.owner,
        name: p.slug || this.name,
        defaultBranch: p.mainbranch?.name || null,
        url: this.webUrl(p.links?.html?.href) || this.data.repo.url,
        private: !!p.is_private,
        description: p.description || '',
      });
    }

    async syncBranchList(acts, quiet) {
      const list = [];
      let full = true;
      let total = null;
      let path = `${this.base}/refs/branches?pagelen=${PAGE}&sort=-target.date`;
      for (let page = 1; path; page++) {
        const { data } = await this.api(path);
        list.push(...(data?.values || []));
        if (Number.isFinite(data?.size)) total = data.size;
        path = this.nextOf(data);
        if (path && page >= MAX_PAGES) {
          full = false;
          break;
        }
      }
      const remote = new Map(list.filter((b) => b.name && b.target?.hash).map((b) => [b.name, { sha: b.target.hash, protected: false }]));
      await this.applyBranchList(acts, quiet, remote);
      this.data.totalExact = full;
      if (!full && total) this.data.totalBranches = total;
    }

    /* ---------- commits ---------- */

    async fetchBranch(sha) {
      const { data } = await this.api(`${this.base}/commits/${enc(sha)}?pagelen=${Math.min(PAGE, this.depth)}`, { allow: [404] });
      const values = data?.values || [];
      for (const c of values) this.addCommit(c);
      return values[0]?.hash || null;
    }

    /** Pasa un commit de Bitbucket a la forma que entiende la fuente de GitHub. */
    addCommit(c) {
      if (!c?.hash) return false;
      const user = c.author?.user;
      const raw = String(c.author?.raw || '').replace(/\s*<[^>]*>\s*$/, '');
      const added = super.addCommit({
        sha: c.hash,
        parents: (c.parents || []).map((p) => ({ sha: p.hash })),
        html_url: this.webUrl(c.links?.html?.href) || undefined,
        commit: { message: c.message || '', author: { name: user?.display_name || raw, date: c.date }, committer: { date: c.date } },
        author: { login: user?.nickname || user?.display_name || null, avatar_url: null },
      });
      if (added) this.data.commits.get(c.hash).url = this.webUrl(c.links?.html?.href) || this.link('commit', c.hash);
      return added;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = this.link('tree', name);
      return a;
    }

    /** Los commits que `to` tiene y `from` no; null si alguno ya no existe. Hasta 100. */
    async ahead(from, to) {
      const { data } = await this.api(`${this.base}/commits/${enc(to)}?exclude=${enc(from)}&pagelen=${PAGE}`, { allow: [404] });
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
      return this.activity('push', { ...base, title: M('act.pushNew', { n, name }), url: n > 1 ? this.link('compare', from.slice(0, 12), to.slice(0, 12)) : head?.url });
    }

    /* ---------- pull requests ---------- */

    person(u) {
      if (!u) return null;
      return { login: u.nickname || u.display_name || null, name: u.display_name || u.nickname || '', avatar: null };
    }

    mapPull(p) {
      const full = `${this.owner}/${this.name}`.toLowerCase();
      return {
        number: p.id,
        title: p.title || '',
        head: p.source?.branch?.name || '',
        base: p.destination?.branch?.name || '',
        sameRepo: (p.source?.repository?.full_name || '').toLowerCase() === full,
        url: this.webUrl(p.links?.html?.href) || `${this.data.repo.url}/pull-requests/${p.id}`,
        draft: !!p.draft,
        user: this.person(p.author),
        createdAt: Date.parse(p.created_on) || Date.now(),
      };
    }

    async syncPulls(acts, initial) {
      const { data } = await this.api(`${this.base}/pullrequests?state=OPEN&pagelen=50&sort=-updated_on&fields=values.id,values.title,values.draft,values.created_on,values.links.html,values.author,values.source.branch.name,values.source.repository.full_name,values.destination.branch.name`);
      this.lastPoll.pulls = Date.now();
      await this.applyPulls(acts, initial, (data?.values || []).map((p) => this.mapPull(p)), null);
    }

    /** Qué pasó con los PRs que dejaron de estar abiertos: una consulta por PR (son pocos por ciclo). */
    async pullStates(numbers) {
      const out = new Map();
      for (const n of numbers) {
        try {
          const { data: p } = await this.api(`${this.base}/pullrequests/${Number(n)}?fields=state,closed_by.display_name,closed_by.nickname`, { allow: [404] });
          if (!p) continue;
          out.set(n, { state: p.state === 'OPEN' ? 'open' : 'closed', merged: p.state === 'MERGED', by: this.person(p.closed_by) });
        } catch (err) {
          if (hard(err)) throw err;
        }
      }
      return out;
    }

    /* ---------- archivos (los planetas del modo galaxias) ---------- */

    /** El árbol del commit con el tamaño de cada archivo. Bitbucket no da los cambios de una rama
        contra la principal por esta vía: una rama que no es la principal muestra también su árbol. */
    async files({ sha }) {
      const files = [];
      let truncated = false;
      let path = `${this.base}/src/${enc(sha)}/?max_depth=20&pagelen=${PAGE}&fields=next,values.type,values.path,values.size`;
      for (let page = 1; path; page++) {
        const { data } = await this.api(path);
        for (const e of data?.values || []) if (e.type === 'commit_file') files.push({ path: e.path, size: e.size || 0, url: this.link('blob', sha, e.path) });
        path = this.nextOf(data);
        if (path && page >= TREE_PAGES) {
          truncated = true;
          break;
        }
      }
      return { kind: 'tree', files, truncated };
    }

    /* ---------- los cambios de un commit (el panel de js/diff.js) ---------- */

    /** Los cambios de un commit frente a su primer padre: el diff en texto de Bitbucket (`diff/{sha}`),
        una consulta que cuenta en la cuota de la hora. */
    async commitDiff(sha) {
      this.sent.push(Date.now());
      const { res, body } = await this.request(`${API}${this.base}/diff/${enc(sha)}`, { headers: this.headers('text/plain'), cache: 'no-store', raw: true });
      this.cost++;
      if (!res.ok) throw this.toError(res, null);
      const files = GB.diff.parseGit(body).map((f) => ({ ...f, url: f.status === 'removed' ? null : this.link('blob', sha, f.path) }));
      return { files, truncated: false };
    }

    /** Sin token, Bitbucket deja 60 consultas por hora: solo se piden los cambios que se abren. */
    diffCheap() {
      return false;
    }
  }

  GB.BitbucketSource = BitbucketSource;
})(window.GB);
