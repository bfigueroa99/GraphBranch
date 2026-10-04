/* GraphBranch — fuente de datos en vivo desde la API de GitHub.

   Pensada para repos de cualquier tamaño (también con miles de ramas). Nunca
   lista todas las ramas en cada ciclo; elige uno de tres modos:

   - graphql (con token): una consulta por ciclo trae las N ramas con commits
     más recientes, el total de ramas, los PRs abiertos y las ramas fijadas.
   - list   (sin token, hasta 100 ramas): lista las ramas por REST con ETag.
   - events (sin token, más de 100 ramas): sigue el feed de eventos del repo
     (pushes, ramas creadas y borradas). Llega con algo de retraso.

   En todos los modos compara cada respuesta con la anterior y emite
   "actividades" (alertas). Con token, las respuestas 304 no gastan cuota. */
(function (GB) {
  'use strict';
  const { U } = GB;
  const API = 'https://api.github.com';
  const GQL_COMMIT =
    'oid url committedDate messageHeadline author { name user { login avatarUrl } } parents(first: 4) { nodes { oid } }';

  class ApiError extends Error {
    constructor(message, { status = 0, kind = 'http', resetAt = 0 } = {}) {
      super(message);
      this.status = status;
      this.kind = kind;
      this.resetAt = resetAt;
    }
  }

  class GitHubSource extends U.Emitter {
    constructor({ owner, name, token = '', maxBranches = 15, depth = 40, filter = '', pins = [] }) {
      super();
      this.owner = owner;
      this.name = name;
      this.token = token;
      this.maxBranches = maxBranches;
      this.depth = depth;
      this.filter = filter.trim();
      this.pins = new Set(pins);
      this.mode = token ? 'graphql' : null;
      this.data = {
        repo: { owner, name, defaultBranch: null, url: `https://github.com/${owner}/${name}`, demo: false },
        branches: new Map(), // ramas visibles
        commits: new Map(),
        pulls: new Map(),
        runs: new Map(),
        mode: null,
        totalBranches: 0,
        totalExact: true,
        matchingBranches: null,
        totalPulls: 0,
        loaded: false,
      };
      this.seenHeads = new Map(); // toda rama observada alguna vez: nombre -> sha
      this.remoteHeads = new Map(); // modo list: todas las ramas
      this.refLatest = new Map(); // último tipo de evento por rama (para el modo events)
      this.recentRefs = [];
      this.seenEvents = new Set();
      this.etags = new Map();
      this.lastPoll = {};
      this.prevCutoff = -Infinity;
      this.eventsInterval = 60;
      this.actionsEnabled = true;
      this.rate = null;
      this.gqlRate = null;
      this.cost = 0;
      this.gqlCost = 0;
      this.avgCost = 3;
      this.failures = 0;
      this.running = false;
      this.paused = false;
      this.busy = false;
      this.reseed = false;
      this.timer = null;
    }

    get base() {
      return `/repos/${this.owner}/${this.name}`;
    }

    /* ---------- ciclo de vida ---------- */

    start() {
      this.running = true;
      this.emitStatus('loading', 'Conectando con GitHub…');
      this.loop();
    }

    stop() {
      this.running = false;
      clearTimeout(this.timer);
    }

    setPaused(paused) {
      this.paused = paused;
      clearTimeout(this.timer);
      if (paused) this.emitStatus('paused');
      else this.loop();
    }

    refreshNow() {
      if (!this.running) {
        this.running = true;
        this.emitStatus('loading', 'Reintentando…');
      }
      clearTimeout(this.timer);
      if (this.busy) this.again = true;
      else this.loop();
    }

    setFilter(filter) {
      this.filter = filter.trim();
      this.reseed = true;
      if (this.data.loaded) this.refreshNow();
    }

    setPins(pins) {
      this.pins = new Set(pins);
      this.reseed = true;
      if (this.data.loaded) this.refreshNow();
    }

    async loop() {
      clearTimeout(this.timer);
      if (!this.running || this.paused || this.busy) return;
      this.busy = true;
      this.again = false;
      let delay = null;
      try {
        const initial = !this.data.loaded;
        this.emitStatus(initial ? 'loading' : 'syncing', initial ? 'Cargando ramas e historial…' : null);
        const activities = await this.poll(initial);
        this.data.loaded = true;
        this.failures = 0;
        this.lastOk = Date.now();
        if (!this.running) return;
        this.emit('update', { activities, initial });
        delay = this.again ? 0 : this.nextDelay();
        this.emitStatus(this.throttled ? 'limited' : 'live', null, delay);
      } catch (err) {
        if (!this.running) return;
        this.failures++;
        const fatal = !this.data.loaded && (err.kind === 'notfound' || err.kind === 'auth');
        if (err.kind === 'rate') delay = Math.max(5000, err.resetAt - Date.now() + 2000);
        else delay = Math.min(300000, 5000 * 2 ** Math.min(this.failures, 6));
        if (!(err instanceof ApiError)) console.error(err);
        this.emitStatus('error', err.message, fatal ? null : delay, err);
        if (fatal) this.running = false;
      } finally {
        this.busy = false;
      }
      if (this.paused) this.emitStatus('paused');
      else if (this.running && delay != null) this.timer = setTimeout(() => this.loop(), delay);
    }

    /** Espacia las consultas para no agotar la cuota antes del próximo reinicio. */
    nextDelay() {
      const base = this.token ? 10000 : 60000;
      const gql = this.mode === 'graphql';
      const rate = gql ? this.gqlRate : this.rate;
      const cost = gql ? this.gqlCost : this.cost;
      this.avgCost = this.avgCost * 0.6 + Math.max(1, cost) * 0.4;
      this.throttled = false;
      if (!rate) return base;
      const secsLeft = Math.max(1, rate.reset - Date.now() / 1000);
      const usable = rate.remaining - (this.token ? 50 : 2);
      if (usable <= 0) {
        this.throttled = true;
        return secsLeft * 1000 + 2000;
      }
      const budget = (secsLeft / (usable / this.avgCost)) * 1000;
      this.throttled = budget > base * 1.5;
      return Math.min(Math.max(base, budget), secsLeft * 1000 + 2000);
    }

    emitStatus(state, message = null, delay = null, error = null) {
      const gql = this.mode === 'graphql';
      this.status = {
        state,
        message,
        error,
        rate: gql ? this.gqlRate : this.rate,
        rateLabel: gql ? 'GraphQL' : 'API',
        nextAt: delay != null ? Date.now() + delay : null,
        lastOk: this.lastOk || null,
        authenticated: !!this.token,
        mode: this.mode,
      };
      this.emit('status', this.status);
    }

    /* ---------- HTTP ---------- */

    async api(path, { cacheKey = null, allow = [] } = {}) {
      const headers = { Accept: 'application/vnd.github+json' };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const cached = cacheKey ? this.etags.get(cacheKey) : null;
      if (cached) headers['If-None-Match'] = cached.etag;

      const res = await this.fetch(API + path, { headers, cache: 'no-store' });
      this.readRate(res);
      if (res.status === 304 && cached) {
        if (!this.token) this.cost++; // sin token, los 304 sí cuentan
        return { data: cached.data, fresh: false, headers: res.headers };
      }
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, await res.json().catch(() => null));
      const data = await res.json();
      const etag = res.headers.get('ETag');
      if (cacheKey && etag) this.etags.set(cacheKey, { etag, data });
      return { data, fresh: true, headers: res.headers };
    }

    async gql(query, variables = {}) {
      const res = await this.fetch(API + '/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { owner: this.owner, name: this.name, ...variables } }),
        cache: 'no-store',
      });
      this.readRate(res);
      if (!res.ok) throw this.toError(res, await res.json().catch(() => null));
      const body = await res.json();
      const rl = body.data?.rateLimit;
      if (rl) this.gqlRate = { limit: rl.limit, remaining: rl.remaining, reset: Date.parse(rl.resetAt) / 1000 };
      this.gqlCost += rl?.cost || 1;
      if (body.errors?.length && !body.data?.repository) {
        const e = body.errors[0];
        if (e.type === 'NOT_FOUND') throw this.notFound();
        if (e.type === 'RATE_LIMITED')
          throw new ApiError('Se agotó la cuota de GraphQL de GitHub. GraphBranch retomará solo cuando se renueve.', {
            kind: 'rate',
            resetAt: (this.gqlRate?.reset || Date.now() / 1000 + 60) * 1000,
          });
        throw new ApiError(`GitHub GraphQL: ${e.message}`, { kind: 'graphql' });
      }
      return body.data;
    }

    async fetch(url, opts) {
      try {
        return await fetch(url, opts);
      } catch {
        throw new ApiError(
          'No se pudo conectar con api.github.com. Revisa la conexión; si abriste GraphBranch dentro de un visor que bloquea la red, usa la versión de GitHub Pages o el archivo local.',
          { kind: 'network' },
        );
      }
    }

    readRate(res) {
      const limit = Number(res.headers.get('X-RateLimit-Limit'));
      const remaining = res.headers.get('X-RateLimit-Remaining');
      const reset = Number(res.headers.get('X-RateLimit-Reset'));
      const resource = res.headers.get('X-RateLimit-Resource');
      if (!limit || remaining == null) return;
      const rate = { limit, remaining: Number(remaining), reset };
      if (resource === 'graphql') this.gqlRate = rate;
      else if (!resource || resource === 'core') this.rate = rate;
    }

    notFound() {
      return new ApiError(
        `No se encontró ${this.owner}/${this.name}. Si el repositorio es privado, agrega un token con permiso de lectura en Ajustes.`,
        { status: 404, kind: 'notfound' },
      );
    }

    toError(res, body) {
      const msg = body?.message || res.statusText || 'error desconocido';
      if (res.status === 401) {
        return new ApiError('El token no es válido o expiró. Revísalo en Ajustes.', { status: 401, kind: 'auth' });
      }
      const limited = (this.rate?.remaining === 0 && res.headers.get('X-RateLimit-Resource') !== 'graphql') || /rate limit/i.test(msg);
      if ((res.status === 403 || res.status === 429) && limited) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const reset = Number(res.headers.get('X-RateLimit-Reset'));
        const resetAt = retryAfter ? Date.now() + retryAfter * 1000 : reset ? reset * 1000 : Date.now() + 60000;
        return new ApiError(
          this.token
            ? 'Se agotó la cuota de la API de GitHub. GraphBranch retomará solo cuando se renueve.'
            : 'Se agotaron las 60 consultas por hora que GitHub permite sin token. Agrega un token en Ajustes para seguir en tiempo real.',
          { status: res.status, kind: 'rate', resetAt },
        );
      }
      if (res.status === 404) return this.notFound();
      return new ApiError(`GitHub respondió ${res.status}: ${msg}`, { status: res.status, kind: 'http' });
    }

    /* ---------- sondeo ---------- */

    due(name) {
      const period = {
        pulls: this.token ? 10000 : 180000,
        runs: this.token ? 10000 : 180000,
        events: Math.max(this.eventsInterval * 1000, this.token ? 30000 : 120000),
        count: 15 * 60000,
      }[name];
      return Date.now() - (this.lastPoll[name] || 0) >= period - 500;
    }

    async poll(initial) {
      this.cost = 0;
      this.gqlCost = 0;
      const acts = [];
      const quiet = initial || this.reseed;
      if (initial) await this.loadRepo(acts);

      if (this.mode === 'graphql') {
        try {
          await this.syncGraphQL(acts, quiet);
        } catch (err) {
          if (this.data.loaded || !['graphql', 'http'].includes(err.kind)) throw err;
          console.warn('GraphQL no disponible, se usa REST:', err.message);
          this.mode = null;
        }
      }
      if (!this.mode) await this.detectRestMode();
      if (this.mode === 'list') await this.syncBranchList(acts, quiet);
      else if (this.mode === 'events') await this.syncFromEvents(acts, initial, quiet);

      if (this.mode !== 'graphql' && (initial || this.due('pulls'))) await this.syncPulls(acts, initial);
      if (this.actionsEnabled && (initial || this.due('runs'))) await this.syncRuns(acts, initial);
      if (!initial && this.mode !== 'events' && this.due('events')) await this.syncEvents(acts, false);
      if (this.mode === 'events' && this.due('count')) await this.countBranches();

      this.data.mode = this.mode;
      this.reseed = false;
      this.gc();
      return acts;
    }

    async loadRepo(acts) {
      const { data: repo } = await this.api(this.base);
      Object.assign(this.data.repo, {
        owner: repo.owner?.login || this.owner,
        name: repo.name || this.name,
        defaultBranch: repo.default_branch,
        url: repo.html_url,
        private: !!repo.private,
        description: repo.description || '',
      });
      try {
        await this.syncEvents(acts, true); // historial del feed + qué ramas se movieron hace poco
      } catch (err) {
        if (err.kind === 'rate' || err.kind === 'network') throw err;
      }
    }

    activity(kind, fields) {
      return {
        id: `${kind}:${fields.branch || ''}:${fields.sha || fields.number || ''}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        kind,
        time: Date.now(),
        ...fields,
      };
    }

    wanted(name) {
      return name === this.data.repo.defaultBranch || this.pins.has(name) || U.matches(name, this.filter);
    }

    /** Cuántas ramas mostrar (además de las fijadas). Sin token se limita para cuidar la cuota. */
    visibleCap() {
      return this.token ? this.maxBranches : Math.min(this.maxBranches, 8);
    }

    /** Agrega una rama visible; si no cabe, saca la menos activa (nunca la por defecto ni las fijadas). */
    addTracked(name, sha) {
      const tracked = this.data.branches;
      const cap = this.visibleCap() + this.pins.size;
      while (tracked.size >= cap) {
        let victim = null;
        let oldest = Infinity;
        for (const b of tracked.values()) {
          if (b.isDefault || this.pins.has(b.name)) continue;
          const t = Math.max(this.data.commits.get(b.sha)?.date || 0, b.movedAt);
          if (t < oldest) {
            oldest = t;
            victim = b;
          }
        }
        if (!victim) break;
        tracked.delete(victim.name);
      }
      const b = { name, sha, isDefault: name === this.data.repo.defaultBranch, protected: false, movedAt: Date.now() };
      tracked.set(name, b);
      return b;
    }

    /* ---------- modo graphql ---------- */

    async syncGraphQL(acts, quiet) {
      const tracked = this.data.branches;
      const check = [...new Set([...tracked.keys(), ...this.pins])].filter((n) => n !== this.data.repo.defaultBranch);
      const aliases = check
        .map((n, i) => `t${i}: ref(qualifiedName: ${JSON.stringify('refs/heads/' + n)}) { target { oid ... on Commit { committedDate } } }`)
        .join('\n');
      const query = `query($owner: String!, $name: String!, $n: Int!, $q: String) {
        rateLimit { cost remaining limit resetAt }
        repository(owner: $owner, name: $name) {
          defaultBranchRef { name target { oid ... on Commit { committedDate } } }
          ${this.filter ? 'all: refs(refPrefix: "refs/heads/", first: 1) { totalCount }' : ''}
          top: refs(refPrefix: "refs/heads/", first: $n, query: $q, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
            totalCount
            nodes { name target { oid ... on Commit { committedDate } } }
          }
          pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
            nodes { number title isDraft url headRefName baseRefName isCrossRepository createdAt author { login avatarUrl } }
          }
          ${aliases}
        }
      }`;
      const n = Math.max(1, Math.min(100, this.maxBranches));
      const data = await this.gql(query, { n, q: this.filter || null });
      const repo = data?.repository;
      if (!repo) throw this.notFound();

      const def = repo.defaultBranchRef?.name || this.data.repo.defaultBranch;
      this.data.repo.defaultBranch = def;
      const want = new Map();
      const add = (name, target) => {
        if (target?.oid) want.set(name, { sha: target.oid, date: Date.parse(target.committedDate) || 0 });
      };
      if (repo.defaultBranchRef) add(def, repo.defaultBranchRef.target);
      const top = repo.top || { totalCount: 0, nodes: [] };
      for (const r of top.nodes) add(r.name, r.target);
      const gone = [];
      check.forEach((name, i) => {
        const r = repo['t' + i];
        if (!r) gone.push(name);
        else if (this.pins.has(name)) add(name, r.target);
      });
      this.data.totalBranches = this.filter ? repo.all?.totalCount || 0 : top.totalCount;
      this.data.matchingBranches = this.filter ? top.totalCount : null;
      this.data.totalExact = true;

      for (const name of gone) {
        const b = tracked.get(name);
        this.seenHeads.delete(name);
        if (!b) continue;
        tracked.delete(name);
        if (!quiet) acts.push(this.branchDeleted(name, b.sha));
      }
      for (const name of [...tracked.keys()]) if (!want.has(name)) tracked.delete(name);

      await this.ensureHistory([...want.values()].map((w) => w.sha));

      const now = Date.now();
      for (const [name, w] of want) {
        const b = tracked.get(name);
        const seen = this.seenHeads.get(name);
        this.seenHeads.set(name, w.sha);
        if (b) {
          if (b.sha === w.sha) continue;
          const from = b.sha;
          b.sha = w.sha;
          b.movedAt = now;
          if (!quiet) {
            const a = await this.branchMoved(name, from, w.sha);
            if (a) acts.push(a);
          }
          continue;
        }
        const nb = { name, sha: w.sha, isDefault: name === def, protected: false, movedAt: 0 };
        tracked.set(name, nb);
        if (quiet) continue;
        if (seen && seen !== w.sha) {
          nb.movedAt = now;
          const a = await this.branchMoved(name, seen, w.sha);
          if (a) acts.push(a);
        } else if (!seen && w.date > this.prevCutoff) {
          // entró a las N más recientes por actividad nueva (no porque se liberó un lugar)
          nb.movedAt = now;
          acts.push(this.branchAppeared(name, w.sha));
        }
      }
      const nodes = top.nodes;
      this.prevCutoff = nodes.length < n ? -Infinity : Date.parse(nodes[nodes.length - 1].target?.committedDate) || -Infinity;
      if (this.seenHeads.size > 20000) this.seenHeads = new Map([...this.seenHeads].slice(-10000));

      const prs = repo.pullRequests || { totalCount: 0, nodes: [] }; // null si el token no tiene permiso de PRs
      const pulls = prs.nodes.map((p) => ({
        number: p.number,
        title: p.title || '',
        head: p.headRefName || '',
        base: p.baseRefName || '',
        sameRepo: !p.isCrossRepository,
        url: p.url,
        draft: !!p.isDraft,
        user: p.author ? { login: p.author.login, name: p.author.login, avatar: p.author.avatarUrl } : null,
        createdAt: Date.parse(p.createdAt) || Date.now(),
      }));
      await this.applyPulls(acts, quiet, pulls, prs.totalCount);
      this.lastPoll.pulls = Date.now();
    }

    /* ---------- modos REST ---------- */

    async detectRestMode() {
      const res = await this.api(`${this.base}/branches?per_page=100`, { cacheKey: 'branches' });
      const more = /rel="next"/.test(res.headers?.get('Link') || '');
      this.mode = more ? 'events' : 'list';
      if (more) await this.countBranches();
    }

    /** Total de ramas sin listarlas: con per_page=1, la última página es el total. */
    async countBranches() {
      this.lastPoll.count = Date.now();
      const res = await this.api(`${this.base}/branches?per_page=1`);
      const last = (res.headers?.get('Link') || '').match(/[?&]page=(\d+)>; rel="last"/);
      this.data.totalBranches = last ? Number(last[1]) : (res.data || []).length;
      this.data.totalExact = true;
    }

    async syncBranchList(acts, quiet) {
      const res = await this.api(`${this.base}/branches?per_page=100`, { cacheKey: 'branches' });
      if (!res.fresh && !quiet && !this.pendingBranches) return;
      this.pendingBranches = true;
      if (/rel="next"/.test(res.headers?.get('Link') || '')) this.mode = 'events'; // creció: desde el próximo ciclo

      const remote = new Map(res.data.map((b) => [b.name, { sha: b.commit.sha, protected: !!b.protected }]));
      this.data.totalBranches = remote.size;
      this.data.matchingBranches = this.filter ? [...remote.keys()].filter((n) => U.matches(n, this.filter)).length : null;
      const tracked = this.data.branches;

      if (quiet) {
        const keep = new Set(this.rankBranches(remote).slice(0, this.visibleCap() + this.pins.size));
        for (const name of [...tracked.keys()]) if (!keep.has(name)) tracked.delete(name);
        for (const name of keep) {
          const info = remote.get(name);
          await this.ensureHistory([info.sha]);
          const b = tracked.get(name) || this.addTracked(name, info.sha);
          Object.assign(b, { sha: info.sha, protected: info.protected });
          if (!this.data.loaded) b.movedAt = 0;
        }
      } else {
        const prev = this.remoteHeads;
        for (const [name, info] of prev) {
          if (remote.has(name)) continue;
          if (tracked.delete(name) || this.wanted(name)) acts.push(this.branchDeleted(name, info.sha));
        }
        for (const [name, info] of remote) {
          if (prev.has(name) || !this.wanted(name)) continue;
          await this.ensureHistory([info.sha]);
          this.addTracked(name, info.sha).protected = info.protected;
          acts.push(this.branchCreated(name, info.sha));
        }
        for (const [name, info] of remote) {
          const before = prev.get(name);
          if (!before || before.sha === info.sha || !this.wanted(name)) continue;
          await this.ensureHistory([info.sha]);
          const b = tracked.get(name) || this.addTracked(name, info.sha);
          Object.assign(b, { sha: info.sha, protected: info.protected, movedAt: Date.now() });
          const a = await this.branchMoved(name, before.sha, info.sha);
          if (a) acts.push(a);
        }
      }
      this.remoteHeads = remote;
      this.pendingBranches = false;
    }

    /** Orden al elegir ramas: por defecto, fijadas, actividad reciente, con PR abierto, resto. */
    rankBranches(remote) {
      const order = [];
      const add = (n) => {
        if (n && remote.has(n) && !order.includes(n) && this.wanted(n)) order.push(n);
      };
      add(this.data.repo.defaultBranch);
      this.pins.forEach(add);
      this.recentRefs.forEach(add);
      [...this.data.pulls.values()].filter((p) => p.sameRepo).forEach((p) => add(p.head));
      [...remote.keys()].sort((a, b) => a.localeCompare(b)).forEach(add);
      return order;
    }

    async syncFromEvents(acts, initial, quiet) {
      if (quiet) {
        const def = this.data.repo.defaultBranch;
        const names = [def, ...this.pins, ...this.recentRefs.filter((n) => U.matches(n, this.filter))];
        const pick = [...new Set(names)].filter((n) => n && this.refLatest.get(n) !== 'DeleteEvent');
        const cap = this.visibleCap() + this.pins.size;
        const keep = new Map();
        for (const name of pick.slice(0, cap)) {
          const old = this.data.branches.get(name);
          const sha = old ? old.sha : await this.fetchBranch(name);
          if (sha) keep.set(name, old || { name, sha, isDefault: name === def, protected: false, movedAt: 0 });
        }
        this.data.branches = keep;
        if (initial) return; // los eventos iniciales ya se leyeron en loadRepo
      }
      const res = await this.api(`${this.base}/events?per_page=50`, { cacheKey: 'events' });
      this.lastPoll.events = Date.now();
      if (!res.fresh) return;
      const fresh = (res.data || []).filter((ev) => !this.seenEvents.has(ev.id)).reverse(); // más antiguos primero
      for (const ev of fresh) {
        this.seenEvents.add(ev.id);
        await this.applyEvent(ev, acts);
      }
    }

    async applyEvent(ev, acts) {
      const p = ev.payload || {};
      const a = this.mapEvent(ev);
      const tracked = this.data.branches;
      let ref = null;
      if (ev.type === 'PushEvent' && p.ref?.startsWith('refs/heads/')) ref = p.ref.slice(11);
      if ((ev.type === 'CreateEvent' || ev.type === 'DeleteEvent') && p.ref_type === 'branch') ref = p.ref;
      if (!ref) {
        if (a) acts.push(a);
        return;
      }
      this.refLatest.set(ref, ev.type);
      this.recentRefs = this.recentRefs.filter((n) => n !== ref);
      if (ev.type !== 'DeleteEvent') this.recentRefs.unshift(ref);
      if (!this.wanted(ref)) return;
      if (ev.type === 'DeleteEvent') {
        const b = tracked.get(ref);
        tracked.delete(ref);
        if (b && a) {
          const d = this.branchDeleted(ref, b.sha);
          Object.assign(a, { kind: d.kind, detail: d.detail, sha: d.sha });
        }
      } else {
        const sha = p.head && this.data.commits.has(p.head) ? p.head : await this.fetchBranch(p.head || ref);
        if (sha) {
          const b = tracked.get(ref) || this.addTracked(ref, sha);
          b.sha = sha;
          b.movedAt = Date.now();
          if (a) {
            a.sha = sha;
            if (ev.type === 'CreateEvent') a.detail = this.branchCreated(ref, sha).detail;
            else a.detail ||= U.firstLine(this.data.commits.get(sha)?.message);
          }
        }
      }
      if (a) acts.push(a);
    }

    /** Trae historial desde una rama o sha (REST) y devuelve el sha de la cabeza. */
    async fetchBranch(refOrSha) {
      const { data } = await this.api(
        `${this.base}/commits?sha=${encodeURIComponent(refOrSha)}&per_page=${this.depth}`,
        { allow: [404, 409, 422] },
      );
      for (const c of data || []) this.addCommit(c);
      return data?.[0]?.sha || null;
    }

    /* ---------- commits ---------- */

    async ensureHistory(shas) {
      let missing = [...new Set(shas)].filter((s) => s && !this.data.commits.has(s));
      if (!missing.length) return;
      if (this.mode !== 'graphql') {
        for (const sha of missing) if (!this.data.commits.has(sha)) await this.fetchBranch(sha);
        return;
      }
      while (missing.length) {
        const chunk = missing.slice(0, 12);
        const query = `query($owner: String!, $name: String!) {
          rateLimit { cost remaining limit resetAt }
          repository(owner: $owner, name: $name) {
            ${chunk.map((s, i) => `h${i}: object(oid: "${s}") { ... on Commit { history(first: ${this.depth}) { nodes { ${GQL_COMMIT} } } } }`).join('\n')}
          }
        }`;
        const data = await this.gql(query);
        chunk.forEach((_, i) => {
          for (const c of data?.repository?.['h' + i]?.history?.nodes || []) this.addGqlCommit(c);
        });
        missing = missing.slice(chunk.length).filter((s) => !this.data.commits.has(s));
      }
    }

    addCommit(c) {
      if (this.data.commits.has(c.sha)) return;
      this.data.commits.set(c.sha, {
        sha: c.sha,
        parents: (c.parents || []).map((p) => p.sha),
        message: c.commit?.message || '',
        author: {
          name: c.commit?.author?.name || c.author?.login || 'desconocido',
          login: c.author?.login || null,
          avatar: c.author?.avatar_url || null,
        },
        date: Date.parse(c.commit?.committer?.date || c.commit?.author?.date) || Date.now(),
        url: c.html_url || `${this.data.repo.url}/commit/${c.sha}`,
      });
    }

    addGqlCommit(c) {
      if (!c?.oid || this.data.commits.has(c.oid)) return;
      this.data.commits.set(c.oid, {
        sha: c.oid,
        parents: (c.parents?.nodes || []).map((p) => p.oid),
        message: c.messageHeadline || '',
        author: {
          name: c.author?.name || c.author?.user?.login || 'desconocido',
          login: c.author?.user?.login || null,
          avatar: c.author?.user?.avatarUrl || null,
        },
        date: Date.parse(c.committedDate) || Date.now(),
        url: c.url || `${this.data.repo.url}/commit/${c.oid}`,
      });
    }

    /** Descarta commits que ya no alcanza ninguna rama visible y limita el total. */
    gc() {
      const { commits, branches } = this.data;
      const heads = [...branches.values()].map((b) => b.sha);
      const keep = U.reachable(commits, heads).set;
      for (const sha of [...commits.keys()]) if (!keep.has(sha)) commits.delete(sha);
      const cap = Math.max(600, this.depth * (this.maxBranches + this.pins.size) * 2);
      if (commits.size > cap) {
        const headSet = new Set(heads);
        const old = [...commits.values()].filter((c) => !headSet.has(c.sha)).sort((a, b) => a.date - b.date);
        for (const c of old.slice(0, commits.size - cap)) commits.delete(c.sha);
      }
    }

    authorOf(sha) {
      const c = this.data.commits.get(sha);
      return c ? { name: c.author.name, login: c.author.login, avatar: c.author.avatar } : null;
    }

    /** Rama visible que contiene `sha` (prefiere la que lo tiene como cabeza, luego la por defecto). */
    branchContaining(sha, exclude) {
      const list = [...this.data.branches.values()].filter((b) => b.name !== exclude);
      const head = list.find((b) => b.sha === sha);
      if (head) return head.name;
      list.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
      for (const b of list) if (U.ancestors(this.data.commits, b.sha).set.has(sha)) return b.name;
      return null;
    }

    branchCreated(name, sha) {
      const from = this.branchContaining(sha, name);
      const c = this.data.commits.get(sha);
      return this.activity('branch-create', {
        title: `Rama ${name} creada`,
        detail: from ? `Sale de ${from} en ${U.shortSha(sha)}` : c ? U.firstLine(c.message) : `En ${U.shortSha(sha)}`,
        actor: this.authorOf(sha),
        branch: name,
        sha,
        url: `${this.data.repo.url}/tree/${encodeURIComponent(name)}`,
      });
    }

    /** Rama que aparece entre las más activas sin haberla visto antes (modo graphql). */
    branchAppeared(name, sha) {
      if (this.branchContaining(sha, name)) return this.branchCreated(name, sha);
      const c = this.data.commits.get(sha);
      return this.activity('push', {
        title: `Nuevos commits en ${name}`,
        detail: c ? U.firstLine(c.message) : '',
        actor: this.authorOf(sha),
        branch: name,
        sha,
        url: c?.url || `${this.data.repo.url}/commits/${encodeURIComponent(name)}`,
      });
    }

    branchDeleted(name, sha) {
      const into = this.branchContaining(sha, name);
      return this.activity(into ? 'branch-delete' : 'branch-delete-unmerged', {
        title: `Rama ${name} eliminada`,
        detail: into
          ? `Sus cambios ya estaban en ${into}`
          : `Tenía commits que no están en ninguna rama visible (última: ${U.shortSha(sha)})`,
        branch: name,
        sha: into ? sha : null,
      });
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
        try {
          const { data } = await this.api(`${this.base}/compare/${from}...${to}?per_page=1`);
          if (data.status === 'identical') return null;
          count = data.ahead_by;
          if (data.status !== 'ahead') {
            force = true;
            behind = data.behind_by;
          }
        } catch (err) {
          if (err.kind === 'rate' || err.kind === 'network') throw err;
          force = true;
        }
      }
      const base = { branch: name, sha: to, actor: this.authorOf(to), detail: head ? U.firstLine(head.message) : '' };
      if (force) {
        return this.activity('force', {
          ...base,
          title: `Force-push en ${name}`,
          detail: `Historia reescrita${behind ? `: ${U.plural(behind, 'commit descartado', 'commits descartados')}` : ''} · ahora en ${U.shortSha(to)}`,
          url: `${this.data.repo.url}/commits/${encodeURIComponent(name)}`,
        });
      }
      if (head && head.parents.length > 1) {
        return this.activity('merge', { ...base, title: `Merge en ${name}`, url: head.url });
      }
      const n = count || 1;
      return this.activity('push', {
        ...base,
        title: `${U.plural(n, 'commit nuevo', 'commits nuevos')} en ${name}`,
        url: n > 1 ? `${this.data.repo.url}/compare/${from.slice(0, 12)}...${to.slice(0, 12)}` : head?.url,
      });
    }

    /* ---------- pull requests ---------- */

    mapPull(p) {
      const full = `${this.owner}/${this.name}`.toLowerCase();
      return {
        number: p.number,
        title: p.title || '',
        head: p.head?.ref || '',
        base: p.base?.ref || '',
        sameRepo: (p.head?.repo?.full_name || '').toLowerCase() === full,
        url: p.html_url,
        draft: !!p.draft,
        user: { login: p.user?.login, name: p.user?.login, avatar: p.user?.avatar_url },
        createdAt: Date.parse(p.created_at) || Date.now(),
      };
    }

    async syncPulls(acts, initial) {
      const { data, fresh } = await this.api(
        `${this.base}/pulls?state=open&per_page=50&sort=updated&direction=desc`,
        { cacheKey: 'pulls' },
      );
      this.lastPoll.pulls = Date.now();
      if (!fresh && !initial) return;
      await this.applyPulls(acts, initial, data.map((p) => this.mapPull(p)), null);
    }

    /** Compara la página de PRs abiertos con la anterior. Solo mira los 50 actualizados más recientemente. */
    async applyPulls(acts, quiet, list, total) {
      const next = new Map(list.map((p) => [p.number, p]));
      this.data.totalPulls = total ?? next.size;
      if (!quiet) {
        const since = (this.lastOk || Date.now()) - 180000;
        for (const [n, pr] of next) {
          if (this.data.pulls.has(n) || pr.createdAt < since) continue; // solo entró a la página, no es nuevo
          acts.push(
            this.activity('pr-open', {
              title: pr.draft ? `PR #${n} abierto como borrador` : `PR #${n} abierto`,
              detail: pr.title,
              ref: `${pr.head} → ${pr.base}`,
              branch: pr.sameRepo ? pr.head : null,
              actor: pr.user,
              url: pr.url,
              number: n,
            }),
          );
        }
        const gone = [...this.data.pulls.values()].filter((p) => !next.has(p.number)).slice(0, 20);
        const states = gone.length ? await this.pullStates(gone.map((p) => p.number)) : new Map();
        for (const pr of gone) {
          const s = states.get(pr.number);
          if (!s || s.state === 'open') continue; // sigue abierto, solo salió de la página
          acts.push(
            this.activity(s.merged ? 'pr-merge' : 'pr-close', {
              title: s.merged ? `PR #${pr.number} fusionado en ${pr.base}` : `PR #${pr.number} cerrado sin fusionar`,
              detail: pr.title,
              ref: `${pr.head} → ${pr.base}`,
              branch: s.merged ? pr.base : null,
              actor: s.by || pr.user,
              url: pr.url,
              number: pr.number,
            }),
          );
        }
      }
      this.data.pulls = next;
    }

    async pullStates(numbers) {
      const out = new Map();
      try {
        if (this.mode === 'graphql') {
          const query = `query($owner: String!, $name: String!) {
            rateLimit { cost remaining limit resetAt }
            repository(owner: $owner, name: $name) {
              ${numbers.map((n, i) => `p${i}: pullRequest(number: ${Number(n)}) { state merged mergedBy { login avatarUrl } }`).join('\n')}
            }
          }`;
          const data = await this.gql(query);
          numbers.forEach((n, i) => {
            const p = data?.repository?.['p' + i];
            if (p)
              out.set(n, {
                state: p.state.toLowerCase(),
                merged: !!p.merged,
                by: p.mergedBy ? { login: p.mergedBy.login, avatar: p.mergedBy.avatarUrl } : null,
              });
          });
        } else {
          for (const n of numbers) {
            const { data: p } = await this.api(`${this.base}/pulls/${n}`);
            out.set(n, {
              state: p.state,
              merged: !!p.merged_at,
              by: p.merged_by ? { login: p.merged_by.login, avatar: p.merged_by.avatar_url } : null,
            });
          }
        }
      } catch (err) {
        if (err.kind === 'rate' || err.kind === 'network') throw err;
      }
      return out;
    }

    /* ---------- GitHub Actions ---------- */

    mapRun(r) {
      return {
        id: r.id,
        name: r.name || 'Workflow',
        title: r.display_title || '',
        branch: r.head_branch,
        sha: r.head_sha,
        status: r.status,
        conclusion: r.conclusion,
        url: r.html_url,
        number: r.run_number,
        event: r.event,
        actor: r.actor ? { login: r.actor.login, avatar: r.actor.avatar_url } : null,
        createdAt: Date.parse(r.created_at) || Date.now(),
      };
    }

    runActivity(run, started) {
      const fields = {
        detail: run.title,
        ref: `#${run.number} · ${run.event}`,
        branch: run.branch,
        sha: run.sha,
        actor: run.actor,
        url: run.url,
      };
      if (started) return this.activity('ci-start', { ...fields, title: `CI en curso: ${run.name}` });
      const c = run.conclusion;
      if (c === 'success') return this.activity('ci-ok', { ...fields, title: `CI aprobado: ${run.name}` });
      if (c === 'failure' || c === 'timed_out' || c === 'startup_failure')
        return this.activity('ci-fail', { ...fields, title: `CI falló: ${run.name}` });
      if (c === 'cancelled') return this.activity('ci-cancel', { ...fields, title: `CI cancelado: ${run.name}` });
      return null;
    }

    async syncRuns(acts, initial) {
      const res = await this.api(`${this.base}/actions/runs?per_page=30`, { cacheKey: 'runs', allow: [403, 404] });
      this.lastPoll.runs = Date.now();
      if (res.data === null) {
        this.actionsEnabled = false;
        return;
      }
      if (!res.fresh && !initial) return;
      const next = new Map((res.data.workflow_runs || []).map((r) => [r.id, this.mapRun(r)]));
      if (!initial) {
        for (const [id, run] of next) {
          if (!U.matches(run.branch || '', this.filter) && !this.data.branches.has(run.branch)) continue;
          const prev = this.data.runs.get(id);
          let a = null;
          if (!prev) a = this.runActivity(run, run.status !== 'completed');
          else if (prev.status !== 'completed' && run.status === 'completed') a = this.runActivity(run, false);
          if (a) acts.push(a);
        }
      }
      this.data.runs = next;
    }

    /* ---------- eventos del repositorio ---------- */

    /** Tipos que ya detectamos comparando ramas y PRs (más rápido que el feed de eventos). */
    coveredLive(ev) {
      if (ev.type === 'PushEvent' || ev.type === 'PullRequestEvent') return true;
      if ((ev.type === 'CreateEvent' || ev.type === 'DeleteEvent') && ev.payload?.ref_type === 'branch') return true;
      return false;
    }

    async syncEvents(acts, initial) {
      const res = await this.api(`${this.base}/events?per_page=50`, { cacheKey: 'events' });
      this.lastPoll.events = Date.now();
      const pi = Number(res.headers?.get('X-Poll-Interval'));
      if (pi) this.eventsInterval = pi;
      if (!res.fresh && !initial) return;
      for (const ev of res.data || []) {
        if (this.seenEvents.has(ev.id)) continue;
        this.seenEvents.add(ev.id);
        if (initial) {
          const p = ev.payload || {};
          let ref = null;
          if (ev.type === 'PushEvent' && p.ref?.startsWith('refs/heads/')) ref = p.ref.slice(11);
          if ((ev.type === 'CreateEvent' || ev.type === 'DeleteEvent') && p.ref_type === 'branch') ref = p.ref;
          if (ref && !this.refLatest.has(ref)) {
            this.refLatest.set(ref, ev.type); // la API entrega primero lo más reciente
            if (ev.type !== 'DeleteEvent') this.recentRefs.push(ref);
          }
        } else if (this.coveredLive(ev)) continue;
        const a = this.mapEvent(ev);
        if (a) acts.push(a);
      }
    }

    mapEvent(ev) {
      const p = ev.payload || {};
      const repoUrl = this.data.repo.url;
      const actor = ev.actor ? { login: ev.actor.display_login || ev.actor.login, avatar: ev.actor.avatar_url } : null;
      const mk = (kind, fields) => ({ id: 'ev:' + ev.id, kind, actor, time: Date.parse(ev.created_at) || Date.now(), ...fields });
      const pr = p.pull_request || {};
      const prNum = p.number ?? pr.number;
      const prUrl = pr.html_url || (prNum ? `${repoUrl}/pull/${prNum}` : repoUrl);
      const prRef = pr.head?.ref && pr.base?.ref ? `${pr.head.ref} → ${pr.base.ref}` : null;
      const issue = p.issue || {};

      switch (ev.type) {
        case 'PushEvent': {
          const ref = p.ref || '';
          if (ref.startsWith('refs/tags/')) return mk('tag', { title: `Push del tag ${ref.slice(10)}`, url: repoUrl });
          const branch = ref.replace('refs/heads/', '');
          const n = p.size ?? p.distinct_size ?? p.commits?.length;
          const last = p.commits?.[p.commits.length - 1];
          return mk('push', {
            title: n ? `${U.plural(n, 'commit', 'commits')} en ${branch}` : `Push a ${branch}`,
            detail: last ? U.firstLine(last.message) : '',
            branch,
            sha: p.head || null,
            url:
              p.before && p.head && !/^0+$/.test(p.before)
                ? `${repoUrl}/compare/${p.before.slice(0, 12)}...${p.head.slice(0, 12)}`
                : `${repoUrl}/commits/${encodeURIComponent(branch)}`,
          });
        }
        case 'CreateEvent':
          if (p.ref_type === 'branch')
            return mk('branch-create', { title: `Rama ${p.ref} creada`, branch: p.ref, url: `${repoUrl}/tree/${encodeURIComponent(p.ref)}` });
          if (p.ref_type === 'tag')
            return mk('tag', { title: `Tag ${p.ref} creado`, url: `${repoUrl}/releases/tag/${encodeURIComponent(p.ref)}` });
          return mk('other', { title: 'Repositorio creado', url: repoUrl });
        case 'DeleteEvent':
          if (p.ref_type === 'branch') return mk('branch-delete', { title: `Rama ${p.ref} eliminada`, branch: p.ref });
          return mk('tag', { title: `Tag ${p.ref} eliminado` });
        case 'PullRequestEvent': {
          const merged = pr.merged === true || !!pr.merged_at;
          const fields = { detail: pr.title || '', ref: prRef, url: prUrl, number: prNum, branch: pr.head?.ref || null };
          if (p.action === 'opened') return mk('pr-open', { ...fields, title: `PR #${prNum} abierto` });
          if (p.action === 'reopened') return mk('pr-open', { ...fields, title: `PR #${prNum} reabierto` });
          if (p.action === 'ready_for_review') return mk('pr-open', { ...fields, title: `PR #${prNum} listo para revisión` });
          if (p.action === 'closed' && merged)
            return mk('pr-merge', { ...fields, title: `PR #${prNum} fusionado${pr.base?.ref ? ` en ${pr.base.ref}` : ''}` });
          if (p.action === 'closed') return mk('pr-close', { ...fields, title: `PR #${prNum} cerrado sin fusionar` });
          if (p.action === 'review_requested') return mk('review', { ...fields, title: `Revisión solicitada en PR #${prNum}` });
          return null;
        }
        case 'PullRequestReviewEvent': {
          const state = (p.review?.state || '').toLowerCase();
          const fields = { detail: U.firstLine(p.review?.body) || pr.title || '', url: p.review?.html_url || prUrl, number: prNum };
          if (state === 'approved') return mk('review-ok', { ...fields, title: `PR #${prNum} aprobado` });
          if (state === 'changes_requested') return mk('review-changes', { ...fields, title: `Cambios solicitados en PR #${prNum}` });
          return mk('review', { ...fields, title: `Revisión en PR #${prNum}` });
        }
        case 'PullRequestReviewCommentEvent':
          return mk('comment', {
            title: `Comentario de código en PR #${prNum}`,
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            url: p.comment?.html_url || prUrl,
          });
        case 'IssuesEvent': {
          const n = issue.number;
          const fields = { detail: issue.title || '', url: issue.html_url || `${repoUrl}/issues/${n}`, number: n };
          if (p.action === 'opened') return mk('issue-open', { ...fields, title: `Issue #${n} abierto` });
          if (p.action === 'reopened') return mk('issue-open', { ...fields, title: `Issue #${n} reabierto` });
          if (p.action === 'closed') return mk('issue-close', { ...fields, title: `Issue #${n} cerrado` });
          return null;
        }
        case 'IssueCommentEvent':
          return mk('comment', {
            title: `Comentario en ${issue.pull_request ? 'PR' : 'issue'} #${issue.number}`,
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            url: p.comment?.html_url || issue.html_url || repoUrl,
          });
        case 'CommitCommentEvent':
          return mk('comment', {
            title: `Comentario en el commit ${U.shortSha(p.comment?.commit_id)}`,
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            sha: p.comment?.commit_id || null,
            url: p.comment?.html_url || repoUrl,
          });
        case 'ReleaseEvent':
          if (p.action && !['published', 'released', 'created'].includes(p.action)) return null;
          return mk('release', {
            title: `Release ${p.release?.tag_name || p.release?.name || ''} publicada`.replace('  ', ' '),
            detail: p.release?.name || '',
            url: p.release?.html_url || `${repoUrl}/releases`,
          });
        case 'WatchEvent':
          return mk('star', { title: 'Nueva estrella', detail: actor ? `${actor.login} marcó el repositorio` : '', url: repoUrl });
        case 'ForkEvent':
          return mk('fork', { title: 'Nuevo fork', detail: p.forkee?.full_name || '', url: p.forkee?.html_url || repoUrl });
        case 'MemberEvent':
          return mk('other', { title: `Colaborador ${p.member?.login || ''} agregado`.replace('  ', ' '), url: repoUrl });
        case 'PublicEvent':
          return mk('other', { title: 'El repositorio ahora es público', url: repoUrl });
        case 'GollumEvent':
          return mk('other', {
            title: 'Wiki actualizada',
            detail: (p.pages || []).map((pg) => pg.title).join(', '),
            url: `${repoUrl}/wiki`,
          });
        case 'DiscussionEvent':
          return mk('comment', { title: 'Nueva discusión', detail: p.discussion?.title || '', url: p.discussion?.html_url || repoUrl });
        case 'DiscussionCommentEvent':
          return mk('comment', {
            title: 'Comentario en una discusión',
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            url: p.comment?.html_url || repoUrl,
          });
        default:
          return mk('other', { title: String(ev.type || 'Evento').replace(/Event$/, ''), url: repoUrl });
      }
    }
  }

  GB.GitHubSource = GitHubSource;
})(window.GB);
