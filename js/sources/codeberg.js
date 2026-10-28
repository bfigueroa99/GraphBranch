/* GraphBranch — fuente de datos en vivo desde codeberg.org (API REST v1 de Forgejo, la de Gitea), para
   repositorios públicos.

   Hereda de la fuente de GitHub todo lo que no depende del servicio: el ciclo de sondeo con sus
   reintentos y su espera sin red, la prioridad para traer la historia de las ramas de a poco, la
   comparación entre ciclos que da las actividades (ramas nuevas, movidas, borradas; PRs abiertos,
   fusionados y cerrados) y la limpieza de commits. La API de Forgejo se parece a la de GitHub, y por
   eso casi todo se hereda; cambia:

   - El tamaño de página se pide con `limit` (no `per_page`), con 50 como tope del servidor.
   - Las ramas se listan enteras en cada ciclo (el servidor las da por orden alfabético, no por
     actividad), hasta MAX_PAGES páginas: 500 ramas. Un repo grande tarda más entre ciclos.
   - La historia sale del listado de commits de cada cabeza (`commits?sha=`), igual que en GitHub.
   - Una rama que se movió y cuya cabeza anterior no está cargada se distingue de un force-push con
     dos comparaciones (`compare/a...b` y `compare/b...a`).
   - Los PRs son los de siempre ("#12"); un título que empieza con "WIP:" o "Draft:" es un borrador.
   - Sin feed de eventos, ni tags, ni despliegues, ni checks: el panel cuenta lo que se ve comparando
     ciclos. En el modo galaxias, una rama que no es la principal muestra su árbol, no sus cambios.
   - Sin token: solo repositorios públicos. codeberg.org permite varios cientos de consultas cada
     10 minutos por IP, así que el sondeo va cada POLL_MS. Un repo privado responde 404, como uno
     que no existe. Con el token de Codeberg de Ajustes (`Authorization: token …`) se ven también los
     repos privados y la cuota es la de la cuenta: va en cada consulta, y solo a codeberg.org. Un
     Forgejo/Gitea propio nunca lo recibe. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const M = i18n.msg;
  const { ApiError } = GB.GitHubSource;
  const WEB = 'https://codeberg.org';
  /** Las direcciones de un Forgejo/Gitea: codeberg.org o uno propio (`https://git.miempresa.com`, también con una
      ruta si cuelga de una). null si no es una URL https o lleva usuario. */
  const endpoints = (webUrl) => {
    if (!webUrl) return { web: WEB, api: WEB + '/api/v1' };
    try {
      const u = new URL(String(webUrl));
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      const web = (u.origin + u.pathname).replace(/\/+$/, '');
      return { web, api: web + '/api/v1' };
    } catch {
      return null;
    }
  };
  const POLL_MS = 20000; // entre ciclos
  const PULLS_MS = 40000; // entre consultas de PRs
  const PAGE = 50; // tope del servidor por página
  const MAX_PAGES = 10; // ramas listadas como mucho: 500
  const TREE_PAGES = 20; // páginas del árbol como mucho: 20.000 archivos
  const FIRST_MS = 1500;
  const BATCH_MS = 4000;
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);
  /** Los textos que nombran a GitHub, cambiados por los de Codeberg o, en un servidor propio, por los del servidor. */
  const TERMS = {
    'status.connecting': 'status.connectingCodeberg',
    'err.network': 'err.networkCodeberg',
    'err.timeout': 'err.timeoutCodeberg',
  };
  const OWN_TERMS = {
    'status.connecting': 'status.connectingForge',
    'err.network': 'err.networkForge',
    'err.timeout': 'err.timeoutForge',
  };
  const segs = (path) => String(path).split('/').map(encodeURIComponent).join('/');
  const DRAFT = /^\s*(?:\[wip\]|wip:|draft:|\[draft\])/i;

  class CodebergSource extends GB.GitHubSource {
    /** `webUrl` vacío es codeberg.org; con la dirección de un Forgejo/Gitea propio (?forge=, --forge-url=), ese servidor. Sin token en ningún caso.
        `token`: el de Codeberg; no va en `this.token` (el de GitHub) y solo se usa contra codeberg.org. */
    constructor({ owner, name, token = '', depth = 40, filter = '', pins = [], webUrl = '', avatars = false }) {
      super({ owner, name, token: '', depth, filter, pins });
      const own = !!webUrl && !!endpoints(webUrl); // una dirección que no sea https no se usa: queda codeberg.org
      this.codebergToken = own ? '' : token;
      this.ep = (own && endpoints(webUrl)) || endpoints('');
      this.own = own;
      this.avatars = !own || avatars; // los de un servidor propio, solo si el CSP nombra su host en img-src (escritorio)
      this.host = own ? 'forgejo' : 'codeberg';
      this.mode = 'list';
      this.data.repo.url = `${this.ep.web}/${segs(owner)}/${segs(name)}`;
      this.data.repo.host = this.host;
      this.prevHead = new Map(); // cabeza nueva -> la anterior de esa rama
    }

    get base() {
      return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}`;
    }

    term(key) {
      return (this.own ? OWN_TERMS : TERMS)[key] || key;
    }

    /* ---------- HTTP ---------- */

    /** Las cabeceras de una consulta: el token de Codeberg, si lo hay, solo a codeberg.org. */
    headers(accept) {
      return this.codebergToken ? { Accept: accept, Authorization: `token ${this.codebergToken}` } : { Accept: accept };
    }

    async api(path, { allow = [] } = {}) {
      const { res, body } = await this.request(this.ep.api + path, { headers: this.headers('application/json'), cache: 'no-store' });
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      return { data: body, fresh: true, headers: res.headers };
    }

    notFound() {
      return new ApiError(M(this.own ? 'err.notFoundForge' : 'err.notFoundCodeberg', { repo: `${this.owner}/${this.name}` }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      if (res.status === 404) return this.notFound();
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        return new ApiError(M(this.own ? 'err.rateForge' : 'err.rateCodeberg'), { status: 429, kind: 'rate', resetAt: Date.now() + (wait > 0 ? wait * 1000 : 60000) });
      }
      const msg = typeof body?.message === 'string' ? body.message : res.statusText || '';
      const [withMsg, noMsg] = this.own ? ['err.httpForge', 'err.httpNoMessageForge'] : ['err.httpCodeberg', 'err.httpNoMessageCodeberg'];
      return new ApiError(msg ? M(withMsg, { status: res.status, message: msg }) : M(noMsg, { status: res.status }), {
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

    /** Las páginas de Codeberg de una rama, un commit, una comparación o un archivo. */
    link(kind, a, b) {
      const u = this.data.repo.url;
      if (kind === 'tree') return `${u}/src/branch/${segs(a)}`;
      if (kind === 'commits') return `${u}/commits/branch/${segs(a)}`;
      if (kind === 'commit') return `${u}/commit/${a}`;
      if (kind === 'compare') return `${u}/compare/${a}...${b}`;
      return `${u}/src/commit/${a}/${segs(b)}`;
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
      Object.assign(this.data.repo, {
        owner: p.owner?.login || this.owner,
        name: p.name || this.name,
        defaultBranch: p.default_branch || null,
        url: typeof p.html_url === 'string' && p.html_url.startsWith(this.ep.web + '/') ? p.html_url : this.data.repo.url,
        private: !!p.private,
        description: p.description || '',
      });
    }

    async syncBranchList(acts, quiet) {
      const list = [];
      let full = true;
      for (let page = 1; ; page++) {
        const res = await this.api(`${this.base}/branches?limit=${PAGE}&page=${page}`);
        list.push(...(res.data || []));
        const more = /rel="next"/.test(res.headers?.get('Link') || '') || (res.data || []).length >= PAGE;
        if (!more || !(res.data || []).length) break;
        if (page >= MAX_PAGES) {
          full = false;
          break;
        }
      }
      const remote = new Map(list.map((b) => [b.name, { sha: b.commit?.id, protected: !!b.protected }]));
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
      const { data } = await this.api(`${this.base}/commits?sha=${encodeURIComponent(sha)}&limit=${Math.min(PAGE, this.depth)}&stat=false&verification=false&files=false`, {
        allow: [404, 409, 422],
      });
      for (const c of data || []) this.addCommit(c);
      return data?.[0]?.sha || null;
    }

    addCommit(c) {
      if (!c?.sha) return false;
      const added = super.addCommit(c);
      if (added) {
        const mine = this.data.commits.get(c.sha);
        // los avatares que no son del servidor (Gravatar, Libravatar) los bloquea el CSP: se omiten
        if (mine.author.avatar && !(this.avatars && mine.author.avatar.startsWith(this.ep.web + '/'))) mine.author.avatar = null;
        mine.url = c.html_url || this.link('commit', c.sha);
      }
      return added;
    }

    branchCreated(name, sha) {
      const a = super.branchCreated(name, sha);
      a.url = this.link('tree', name);
      return a;
    }

    /** Los commits que `to` tiene y `from` no (compare/from...to); null si alguno ya no existe. */
    async ahead(from, to) {
      const { data } = await this.api(`${this.base}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`, { allow: [404] });
      return data ? Number(data.total_commits) || (data.commits || []).length : null;
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
      const avatar = this.avatars && (u.avatar_url || '').startsWith(this.ep.web + '/') ? u.avatar_url : null;
      return { login: u.login, name: u.full_name || u.login, avatar };
    }

    mapPull(p) {
      const full = `${this.owner}/${this.name}`.toLowerCase();
      return {
        number: p.number,
        title: p.title || '',
        head: p.head?.ref || '',
        base: p.base?.ref || '',
        sameRepo: (p.head?.repo?.full_name || '').toLowerCase() === full,
        url: typeof p.html_url === 'string' && p.html_url.startsWith(this.ep.web + '/') ? p.html_url : `${this.data.repo.url}/pulls/${p.number}`,
        draft: !!p.draft || DRAFT.test(p.title || ''),
        user: this.person(p.user),
        createdAt: Date.parse(p.created_at) || Date.now(),
      };
    }

    async syncPulls(acts, initial) {
      const { data } = await this.api(`${this.base}/pulls?state=open&sort=recentupdate&limit=${PAGE}`);
      this.lastPoll.pulls = Date.now();
      await this.applyPulls(acts, initial, (data || []).map((p) => this.mapPull(p)), null);
    }

    /** Qué pasó con los PRs que dejaron de estar abiertos: una consulta por PR (son pocos por ciclo). */
    async pullStates(numbers) {
      const out = new Map();
      for (const n of numbers) {
        try {
          const { data: p } = await this.api(`${this.base}/pulls/${Number(n)}`, { allow: [404] });
          if (!p) continue;
          out.set(n, { state: p.state, merged: !!p.merged, by: this.person(p.merged_by) });
        } catch (err) {
          if (hard(err)) throw err;
        }
      }
      return out;
    }

    /* ---------- archivos (los planetas del modo galaxias) ---------- */

    /** El árbol de la rama con el tamaño de cada archivo. Forgejo no da los cambios de una rama
        contra la principal por esta vía: una rama que no es la principal muestra también su árbol. */
    async files({ sha }) {
      const files = [];
      let truncated = false;
      for (let page = 1; ; page++) {
        const { data } = await this.api(`${this.base}/git/trees/${encodeURIComponent(sha)}?recursive=true&per_page=1000&page=${page}`);
        for (const e of data?.tree || []) if (e.type === 'blob') files.push({ path: e.path, size: e.size || 0, url: this.link('blob', sha, e.path) });
        if (!data?.truncated) break;
        if (page >= TREE_PAGES) {
          truncated = true;
          break;
        }
      }
      return { kind: 'tree', files, truncated };
    }

    /** Los cambios de un commit: el diff en texto que da Forgejo (`git/commits/{sha}.diff`), una consulta. */
    async commitDiff(sha) {
      const text = await this.raw(`${this.base}/git/commits/${encodeURIComponent(sha)}.diff`);
      const files = GB.diff.parseGit(text).map((f) => ({ ...f, url: f.status === 'removed' ? null : this.link('blob', sha, f.path) }));
      return { files, truncated: false };
    }

    /** Una consulta cuya respuesta es texto y no JSON. */
    async raw(path) {
      const { res, body } = await this.request(this.ep.api + path, { headers: this.headers('text/plain'), cache: 'no-store', raw: true });
      this.cost++;
      if (!res.ok) throw this.toError(res, null);
      return body;
    }

    diffCheap() {
      return true;
    }

    /* ---------- editar un archivo (js/editor.js): la API de contenidos de Forgejo, como la de GitHub ---------- */

    canEdit() {
      return true;
    }

    /** Un Forgejo propio no recibe token (ver el constructor): ahí no se escribe. */
    canWrite() {
      if (this.own) return 'editor.noWrite';
      return this.codebergToken ? null : 'editor.noToken';
    }

    async readFile({ path, ref }) {
      if (!U.safePath(path)) throw GB.GitHubSource.editError('path');
      const { data, status } = await this.api(`${this.base}/contents/${U.encPath(path)}?ref=${encodeURIComponent(ref)}`, { allow: [404] });
      if (status === 404) return { missing: true };
      if (Array.isArray(data) || data?.type !== 'file') throw GB.GitHubSource.editError('dir');
      if (data.encoding !== 'base64' || (data.size > 0 && !data.content)) return { tooLarge: true };
      const { text, binary } = U.b64decode(data.content);
      return { text, binary, sha: data.sha };
    }

    /** Un commit que deja el archivo con `text`: PUT con su sha si existía, POST si es nuevo. */
    async writeFile({ path, branch, text, message, sha = null }) {
      if (this.own || !this.codebergToken) throw GB.GitHubSource.editError(this.own ? 'noWrite' : 'noToken');
      if (!U.safePath(path)) throw GB.GitHubSource.editError('path');
      const payload = { content: U.b64encode(text), message, branch };
      if (sha) payload.sha = sha;
      const { res, body } = await this.request(this.ep.api + `${this.base}/contents/${U.encPath(path)}`, {
        method: sha ? 'PUT' : 'POST',
        headers: { ...this.headers('application/json'), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      this.cost++;
      if (!res.ok) throw this.writeError(res, body);
      return { sha: body?.commit?.sha || null, url: U.safeUrl(body?.commit?.html_url) || null, blob: body?.content?.sha || null };
    }
  }

  CodebergSource.endpoints = endpoints;
  GB.CodebergSource = CodebergSource;
})(window.GB);
