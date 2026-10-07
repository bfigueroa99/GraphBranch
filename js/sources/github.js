/* GraphBranch — fuente de datos en vivo desde la API de GitHub.

   Pensada para repos de cualquier tamaño (también con miles de ramas). Nunca
   lista todas las ramas en cada ciclo; elige uno de tres modos:

   - graphql (con token): la API de actividad del repo dice qué ramas recibieron
     pushes y cuándo (casi al instante); una consulta GraphQL por ciclo trae la
     cabeza de esas ramas, el total de ramas, los PRs abiertos y las fijadas.
   - list   (sin token, hasta 100 ramas): lista las ramas por REST con ETag.
   - events (sin token, más de 100 ramas): sigue el feed de eventos del repo
     (pushes, ramas creadas y borradas). Llega con algo de retraso.

   En todos los modos compara cada respuesta con la anterior y emite
   "actividades" (alertas). Con token, las respuestas 304 no gastan cuota. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  /* mensaje diferido: se traduce al mostrarlo, no al crearlo (ver i18n.js) */
  const M = i18n.msg;
  const API = 'https://api.github.com';
  const GQL_COMMIT =
    'oid url committedDate messageHeadline author { name user { login avatarUrl } } parents(first: 4) { nodes { oid } }';

  class ApiError extends Error {
    constructor(message, { status = 0, kind = 'http', resetAt = 0 } = {}) {
      super(i18n.text(message));
      this.msg = message; // el mensaje diferido, para mostrarlo en el idioma activo
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
        mode: null,
        totalBranches: 0,
        totalExact: true,
        matchingBranches: null,
        totalPulls: 0,
        loaded: false,
      };
      this.seenHeads = new Map(); // toda rama observada alguna vez: nombre -> sha
      this.pushedAt = new Map(); // último push o borrado conocido por rama: nombre -> { time, deleted }
      this.freshRefs = new Set(); // ramas con actividad nueva desde el ciclo anterior
      this.seenActivity = new Set();
      this.activityOk = true;
      this.remoteHeads = new Map(); // modo list: todas las ramas
      this.refLatest = new Map(); // último tipo de evento por rama (para el modo events)
      this.recentRefs = [];
      this.seenEvents = new Set();
      this.prInfo = new Map(); // número -> { title, draft } de PRs que solo conocemos por eventos (o null)
      this.etags = new Map();
      this.lastPoll = {};
      this.eventsInterval = 60;
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
      this.emitStatus('loading', M('status.connecting'));
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
        this.emitStatus('loading', M('status.retrying'));
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
        this.emitStatus(initial ? 'loading' : 'syncing', initial ? M('status.loadingBranches') : null);
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
        // el ciclo se cortó: el feed se vuelve a pedir entero, así sus eventos aún no vistos no se pierden tras un 304
        this.etags.delete('events');
        const fatal = !this.data.loaded && (err.kind === 'notfound' || err.kind === 'auth');
        if (err.kind === 'rate') delay = Math.max(5000, err.resetAt - Date.now() + 2000);
        else delay = Math.min(300000, 5000 * 2 ** Math.min(this.failures, 6));
        if (!(err instanceof ApiError)) console.error(err);
        this.emitStatus('error', err.msg || err.message, fatal ? null : delay, err);
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
          throw new ApiError(M('err.rateGraphql'), {
            kind: 'rate',
            resetAt: (this.gqlRate?.reset || Date.now() / 1000 + 60) * 1000,
          });
        throw new ApiError(M('err.graphql', { message: e.message }), { kind: 'graphql' });
      }
      return body.data;
    }

    async fetch(url, opts) {
      try {
        return await fetch(url, opts);
      } catch {
        throw new ApiError(M('err.network'), { kind: 'network' });
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
      return new ApiError(M('err.notFound', { repo: `${this.owner}/${this.name}` }), { status: 404, kind: 'notfound' });
    }

    toError(res, body) {
      const msg = body?.message || res.statusText || '';
      if (res.status === 401) {
        return new ApiError(M('err.auth'), { status: 401, kind: 'auth' });
      }
      const limited = (this.rate?.remaining === 0 && res.headers.get('X-RateLimit-Resource') !== 'graphql') || /rate limit/i.test(msg);
      if ((res.status === 403 || res.status === 429) && limited) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const reset = Number(res.headers.get('X-RateLimit-Reset'));
        const resetAt = retryAfter ? Date.now() + retryAfter * 1000 : reset ? reset * 1000 : Date.now() + 60000;
        return new ApiError(M(this.token ? 'err.rate' : 'err.rateAnon'), { status: res.status, kind: 'rate', resetAt });
      }
      if (res.status === 404) return this.notFound();
      return new ApiError(msg ? M('err.http', { status: res.status, message: msg }) : M('err.httpNoMessage', { status: res.status }), {
        status: res.status,
        kind: 'http',
      });
    }

    /* ---------- sondeo ---------- */

    due(name) {
      const period = {
        pulls: this.token ? 10000 : 180000,
        events: Math.max(this.eventsInterval * 1000, this.token ? 30000 : 120000),
        count: 15 * 60000,
      }[name];
      return Date.now() - (this.lastPoll[name] || 0) >= period - 500;
    }

    async poll(initial) {
      this.cost = 0;
      this.gqlCost = 0;
      this.seenNow = []; // eventos leídos en este ciclo: se dan por vistos solo si el ciclo termina bien
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
      if (!initial && this.mode !== 'events' && this.due('events')) await this.syncEvents(acts, false);
      if (this.mode === 'events' && this.due('count')) await this.countBranches();

      await this.completePushes(acts);
      for (const id of this.seenNow) this.seenEvents.add(id);
      if (this.seenEvents.size > 5000) this.seenEvents = new Set([...this.seenEvents].slice(-2000));
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
      const def = this.data.repo.defaultBranch;
      const n = Math.max(1, Math.min(100, this.maxBranches));
      await this.syncActivity(quiet, n);
      // GitHub no ordena ramas por fecha (TAG_COMMIT_DATE solo sirve para tags): las
      // candidatas salen de los últimos pushes conocidos y de las ramas ya visibles
      const recent = [...this.pushedAt]
        .filter(([name, p]) => !p.deleted && name !== def && U.matches(name, this.filter))
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, n + 10)
        .map(([name]) => name);
      const check = [...new Set([...tracked.keys(), ...this.pins, ...recent])].filter((name) => name !== def);
      const aliases = check
        .map((name, i) => `t${i}: ref(qualifiedName: ${JSON.stringify('refs/heads/' + name)}) { target { oid ... on Commit { committedDate } } }`)
        .join('\n');
      const query = `query($owner: String!, $name: String!, $q: String) {
        rateLimit { cost remaining limit resetAt }
        repository(owner: $owner, name: $name) {
          defaultBranchRef { name target { oid ... on Commit { committedDate } } }
          ${this.filter ? 'all: refs(refPrefix: "refs/heads/", first: 1) { totalCount }' : ''}
          top: refs(refPrefix: "refs/heads/", first: 100, query: $q) {
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
      const data = await this.gql(query, { q: this.filter || null });
      const repo = data?.repository;
      if (!repo) throw this.notFound();

      const defName = repo.defaultBranchRef?.name || def;
      this.data.repo.defaultBranch = defName;
      const heads = new Map(); // ramas que existen: nombre -> { sha, date }
      const add = (name, target) => {
        if (target?.oid) heads.set(name, { sha: target.oid, date: Date.parse(target.committedDate) || 0 });
      };
      if (repo.defaultBranchRef) add(defName, repo.defaultBranchRef.target);
      const top = repo.top || { totalCount: 0, nodes: [] };
      for (const r of top.nodes) add(r.name, r.target); // relleno (orden alfabético) para repos con poca actividad registrada
      const gone = [];
      check.forEach((name, i) => {
        const r = repo['t' + i];
        if (r) add(name, r.target);
        else gone.push(name);
      });
      this.data.totalBranches = this.filter ? repo.all?.totalCount || 0 : top.totalCount;
      this.data.matchingBranches = this.filter ? top.totalCount : null;
      this.data.totalExact = true;

      /* visibles: la por defecto, las fijadas y las N con actividad más reciente (push visto o commit más nuevo) */
      const score = (name) => Math.max(this.pushedAt.get(name)?.time || 0, tracked.get(name)?.movedAt || 0, heads.get(name).date);
      const others = [...heads.keys()]
        .filter((name) => name !== defName && !this.pins.has(name) && U.matches(name, this.filter))
        .sort((a, b) => score(b) - score(a));
      const want = new Map();
      for (const name of [defName, ...this.pins, ...others.slice(0, n)]) if (heads.has(name)) want.set(name, heads.get(name));

      for (const name of gone) {
        const p = this.pushedAt.get(name);
        if (p && !p.deleted) p.deleted = true; // no volver a preguntar por ella
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
        const nb = { name, sha: w.sha, isDefault: name === defName, protected: false, movedAt: this.pushedAt.get(name)?.time || 0 };
        tracked.set(name, nb);
        if (quiet) continue;
        if (seen && seen !== w.sha) {
          nb.movedAt = now;
          const a = await this.branchMoved(name, seen, w.sha);
          if (a) acts.push(a);
        } else if (this.freshRefs.has(name)) {
          // entró a las N más activas por un push nuevo (no porque se liberó un lugar)
          nb.movedAt = now;
          acts.push(this.branchAppeared(name, w.sha));
        }
      }
      // recuerda también las cabezas que no se muestran: si una de ellas se mueve y entra, es un push
      for (const [name, h] of heads) if (!want.has(name)) this.seenHeads.set(name, h.sha);
      this.freshRefs.clear();
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

    /** Registra actividad de una rama (push, creación o borrado) con su hora. */
    notePush(name, time, deleted, live) {
      const p = this.pushedAt.get(name);
      if (p && p.time >= time) return;
      this.pushedAt.set(name, { time, deleted });
      if (live && !deleted && this.mode === 'graphql') this.freshRefs.add(name);
      if (this.pushedAt.size > 6000) this.pushedAt = new Map([...this.pushedAt].sort((a, b) => b[1].time - a[1].time).slice(0, 4000));
    }

    /**
     * Últimos pushes del repo según su API de actividad: qué ramas se movieron y
     * cuándo, casi al instante y en una sola consulta (con ETag). Al cargar sigue
     * unas páginas hacia atrás hasta conocer suficientes ramas para llenar el grafo.
     * Si el token no puede leerla, quedan los eventos del repo (llegan con retraso).
     */
    async syncActivity(deep, need) {
      if (!this.activityOk) return;
      let path = `${this.base}/activity?per_page=100`;
      for (let page = 0; path && page < (deep ? 5 : 1); page++) {
        let res;
        try {
          res = await this.api(path, { cacheKey: page ? null : 'activity' });
        } catch (err) {
          if (['rate', 'network', 'auth'].includes(err.kind)) throw err;
          this.activityOk = false;
          console.warn('No se pudo leer la API de actividad; se usan los eventos del repo:', err.message);
          return;
        }
        if (!res.fresh && !deep) return;
        for (const it of res.data || []) {
          if (!it.ref?.startsWith('refs/heads/')) continue;
          const live = !deep && !this.seenActivity.has(it.id);
          this.seenActivity.add(it.id);
          this.notePush(it.ref.slice(11), Date.parse(it.timestamp) || 0, it.activity_type === 'branch_deletion', live);
        }
        if (this.seenActivity.size > 5000) this.seenActivity = new Set([...this.seenActivity].slice(-2000));
        const known = [...this.pushedAt].filter(([name, p]) => !p.deleted && U.matches(name, this.filter)).length;
        if (known >= need + 10) return;
        const next = (res.headers?.get('Link') || '').match(/<([^>]+)>;\s*rel="next"/);
        path = next ? next[1].replace(API, '') : null;
      }
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
      await this.enrichPulls(fresh);
      for (const ev of fresh) {
        this.seenNow.push(ev.id);
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
          name: c.commit?.author?.name || c.author?.login || '',
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
          name: c.author?.name || c.author?.user?.login || '',
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
        title: M('act.branchCreated', { name }),
        detail: from ? M('act.branchFrom', { from, sha: U.shortSha(sha) }) : c ? U.firstLine(c.message) : M('act.branchAt', { sha: U.shortSha(sha) }),
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
        title: M('act.pushNewIn', { name }),
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
        title: M('act.branchDeleted', { name }),
        detail: into ? M('act.branchDeletedMerged', { into }) : M('act.branchDeletedUnmerged', { sha: U.shortSha(sha) }),
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
          title: M('act.force', { name }),
          detail: behind ? M('act.forceDetailDropped', { n: behind, sha: U.shortSha(to) }) : M('act.forceDetail', { sha: U.shortSha(to) }),
          url: `${this.data.repo.url}/commits/${encodeURIComponent(name)}`,
        });
      }
      if (head && head.parents.length > 1) {
        return this.activity('merge', { ...base, title: M('act.merge', { name }), url: head.url });
      }
      const n = count || 1;
      return this.activity('push', {
        ...base,
        title: M('act.pushNew', { n, name }),
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
              title: pr.draft ? M('act.prOpenedDraft', { num: n }) : M('act.prOpened', { num: n }),
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
              title: s.merged ? M('act.prMergedInto', { num: pr.number, base: pr.base }) : M('act.prClosed', { num: pr.number }),
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
      await this.enrichPulls((res.data || []).filter((ev) => !this.seenEvents.has(ev.id) && (initial || !this.coveredLive(ev))));
      for (const ev of res.data || []) {
        if (this.seenEvents.has(ev.id)) continue;
        this.seenNow.push(ev.id);
        const p = ev.payload || {};
        let ref = null;
        if (ev.type === 'PushEvent' && p.ref?.startsWith('refs/heads/')) ref = p.ref.slice(11);
        if ((ev.type === 'CreateEvent' || ev.type === 'DeleteEvent') && p.ref_type === 'branch') ref = p.ref;
        if (ref) this.notePush(ref, Date.parse(ev.created_at) || 0, ev.type === 'DeleteEvent', !initial);
        if (initial) {
          if (ref && !this.refLatest.has(ref)) {
            this.refLatest.set(ref, ev.type); // la API entrega primero lo más reciente
            if (ev.type !== 'DeleteEvent') this.recentRefs.push(ref);
          }
        } else if (this.coveredLive(ev)) continue;
        const a = this.mapEvent(ev);
        if (a) acts.push(a);
      }
    }

    /* Desde octubre de 2025 GitHub recorta los payloads de la API de eventos: un PushEvent ya no trae
       sus commits (ni cuántos son) y el pull_request de los eventos de PR solo trae número, ramas y
       url; además los merges llegan con action "merged". Lo que falta se completa aparte. */

    /** Títulos de los PRs que solo conocemos por eventos: una consulta por ciclo, y solo si hace falta. */
    async enrichPulls(events) {
      const need = new Set();
      for (const ev of events) {
        if (!String(ev.type).startsWith('PullRequest')) continue;
        const pr = ev.payload?.pull_request;
        const n = ev.payload?.number ?? pr?.number;
        if (n && !pr?.title && !this.prInfo.has(n) && !this.data.pulls.has(n)) need.add(n);
      }
      if (!need.size) return;
      const nums = [...need].slice(0, 25);
      try {
        if (this.token) {
          try {
            const query = `query($owner: String!, $name: String!) {
              rateLimit { cost remaining limit resetAt }
              repository(owner: $owner, name: $name) {
                ${nums.map((n, i) => `p${i}: pullRequest(number: ${Number(n)}) { title isDraft }`).join('\n')}
              }
            }`;
            const data = await this.gql(query);
            nums.forEach((n, i) => {
              const p = data?.repository?.['p' + i];
              this.prInfo.set(n, p ? { title: p.title || '', draft: !!p.isDraft } : null);
            });
            return;
          } catch (err) {
            if (err.kind === 'rate' || err.kind === 'network') throw err; // si no, se intenta por REST
          }
        }
        // sin GraphQL: la página de PRs actualizados hace poco (abiertos o no) cubre casi siempre el feed
        const { data } = await this.api(`${this.base}/pulls?state=all&sort=updated&direction=desc&per_page=50`, { cacheKey: 'pulls-all' });
        for (const p of data || []) this.prInfo.set(p.number, { title: p.title || '', draft: !!p.draft });
        for (const n of nums) if (!this.prInfo.has(n)) this.prInfo.set(n, null); // no volver a buscarlo
      } catch (err) {
        if (err.kind === 'rate' || err.kind === 'network') throw err;
      }
    }

    /** Cuántos commits trajo cada push del feed y su mensaje: del grafo ya cargado o, con token,
        de la comparación de GitHub (pocas por ciclo). */
    async completePushes(acts) {
      const { commits } = this.data;
      let budget = this.token ? 6 : 0;
      for (const a of acts) {
        if (a.kind !== 'push' || !('pushFrom' in a)) continue;
        const from = a.pushFrom;
        delete a.pushFrom;
        const created = !from || /^0+$/.test(from); // rama nueva: no hay con qué comparar
        let n = null;
        if (!created && commits.has(from) && commits.has(a.sha)) {
          const now = U.ancestors(commits, a.sha).set;
          if (now.has(from)) {
            const before = U.ancestors(commits, from).set;
            n = [...now].filter((sha) => !before.has(sha)).length;
          }
        }
        if (n == null && !created && budget > 0) {
          budget--;
          try {
            const { data } = await this.api(`${this.base}/compare/${from}...${a.sha}?per_page=1`, { allow: [404, 422] });
            n = data?.ahead_by ?? null;
          } catch (err) {
            if (err.kind === 'rate' || err.kind === 'network') throw err;
          }
        }
        if (n) a.title = M('act.pushCommits', { n, name: a.branch });
        if (!a.detail) a.detail = U.firstLine(commits.get(a.sha)?.message);
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
      const prInfo = this.prInfo.get(prNum) || this.data.pulls.get(prNum);
      const prTitle = pr.title || prInfo?.title || '';
      const issue = p.issue || {};

      switch (ev.type) {
        case 'PushEvent': {
          const ref = p.ref || '';
          if (ref.startsWith('refs/tags/')) return mk('tag', { title: M('act.tagPushed', { name: ref.slice(10) }), url: repoUrl });
          const branch = ref.replace('refs/heads/', '');
          const n = p.size ?? p.distinct_size ?? p.commits?.length; // formato anterior a oct-2025
          const last = p.commits?.[p.commits.length - 1];
          return mk('push', {
            title: n ? M('act.pushCommits', { n, name: branch }) : M('act.pushTo', { name: branch }),
            detail: last ? U.firstLine(last.message) : U.firstLine(this.data.commits.get(p.head)?.message),
            branch,
            sha: p.head || null,
            ...(n == null && p.head ? { pushFrom: p.before || null } : {}), // lo completa completePushes
            url:
              p.before && p.head && !/^0+$/.test(p.before)
                ? `${repoUrl}/compare/${p.before.slice(0, 12)}...${p.head.slice(0, 12)}`
                : `${repoUrl}/commits/${encodeURIComponent(branch)}`,
          });
        }
        case 'CreateEvent':
          if (p.ref_type === 'branch')
            return mk('branch-create', { title: M('act.branchCreated', { name: p.ref }), branch: p.ref, url: `${repoUrl}/tree/${encodeURIComponent(p.ref)}` });
          if (p.ref_type === 'tag')
            return mk('tag', { title: M('act.tagCreated', { name: p.ref }), url: `${repoUrl}/releases/tag/${encodeURIComponent(p.ref)}` });
          return mk('other', { title: M('act.repoCreated'), url: repoUrl });
        case 'DeleteEvent':
          if (p.ref_type === 'branch') return mk('branch-delete', { title: M('act.branchDeleted', { name: p.ref }), branch: p.ref });
          return mk('tag', { title: M('act.tagDeleted', { name: p.ref }) });
        case 'PullRequestEvent': {
          // hoy un merge llega como "merged"; antes, como "closed" con merged: true
          const merged = p.action === 'merged' || (p.action === 'closed' && (pr.merged === true || !!pr.merged_at));
          const fields = { detail: prTitle, ref: prRef, url: prUrl, number: prNum, branch: pr.head?.ref || null };
          const num = { num: prNum };
          if (p.action === 'opened') return mk('pr-open', { ...fields, title: M(prInfo?.draft ? 'act.prOpenedDraft' : 'act.prOpened', num) });
          if (p.action === 'reopened') return mk('pr-open', { ...fields, title: M('act.prReopened', num) });
          if (p.action === 'ready_for_review') return mk('pr-open', { ...fields, title: M('act.prReady', num) });
          if (merged)
            return mk('pr-merge', {
              ...fields,
              branch: pr.base?.ref || null, // la rama del PR suele borrarse al fusionar; el merge vive en la base
              title: pr.base?.ref ? M('act.prMergedInto', { num: prNum, base: pr.base.ref }) : M('act.prMerged', num),
            });
          if (p.action === 'closed') return mk('pr-close', { ...fields, title: M('act.prClosed', num) });
          if (p.action === 'review_requested') return mk('review', { ...fields, title: M('act.reviewRequested', num) });
          return null;
        }
        case 'PullRequestReviewEvent': {
          const state = (p.review?.state || '').toLowerCase();
          const fields = { detail: U.firstLine(p.review?.body) || prTitle, url: p.review?.html_url || prUrl, number: prNum };
          if (state === 'approved') return mk('review-ok', { ...fields, title: M('act.prApproved', { num: prNum }) });
          if (state === 'changes_requested') return mk('review-changes', { ...fields, title: M('act.prChanges', { num: prNum }) });
          return mk('review', { ...fields, title: M('act.prReview', { num: prNum }) });
        }
        case 'PullRequestReviewCommentEvent':
          return mk('comment', {
            title: M('act.prCodeComment', { num: prNum }),
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            url: p.comment?.html_url || prUrl,
          });
        case 'IssuesEvent': {
          const n = issue.number;
          const fields = { detail: issue.title || '', url: issue.html_url || `${repoUrl}/issues/${n}`, number: n };
          if (p.action === 'opened') return mk('issue-open', { ...fields, title: M('act.issueOpened', { num: n }) });
          if (p.action === 'reopened') return mk('issue-open', { ...fields, title: M('act.issueReopened', { num: n }) });
          if (p.action === 'closed') return mk('issue-close', { ...fields, title: M('act.issueClosed', { num: n }) });
          return null;
        }
        case 'IssueCommentEvent':
          return mk('comment', {
            title: M(issue.pull_request ? 'act.commentPr' : 'act.commentIssue', { num: issue.number }),
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            url: p.comment?.html_url || issue.html_url || repoUrl,
          });
        case 'CommitCommentEvent':
          return mk('comment', {
            title: M('act.commentCommit', { sha: U.shortSha(p.comment?.commit_id) }),
            detail: U.truncate(U.firstLine(p.comment?.body), 160),
            sha: p.comment?.commit_id || null,
            url: p.comment?.html_url || repoUrl,
          });
        case 'ReleaseEvent':
          if (p.action && !['published', 'released', 'created'].includes(p.action)) return null;
          return mk('release', {
            title: p.release?.tag_name || p.release?.name ? M('act.release', { tag: p.release.tag_name || p.release.name }) : M('act.releaseNoTag'),
            detail: p.release?.name || '',
            url: p.release?.html_url || `${repoUrl}/releases`,
          });
        case 'WatchEvent':
          return mk('star', { title: M('act.star'), detail: actor ? M('act.starDetail', { login: actor.login }) : '', url: repoUrl });
        case 'ForkEvent':
          return mk('fork', { title: M('act.fork'), detail: p.forkee?.full_name || '', url: p.forkee?.html_url || repoUrl });
        case 'MemberEvent':
          return mk('other', { title: p.member?.login ? M('act.member', { login: p.member.login }) : M('act.memberNoName'), url: repoUrl });
        case 'PublicEvent':
          return mk('other', { title: M('act.public'), url: repoUrl });
        case 'GollumEvent':
          return mk('other', {
            title: M('act.wiki'),
            detail: (p.pages || []).map((pg) => pg.title).join(', '),
            url: `${repoUrl}/wiki`,
          });
        case 'DiscussionEvent':
          return mk('comment', { title: M('act.discussionNew'), detail: p.discussion?.title || '', url: p.discussion?.html_url || repoUrl });
        case 'DiscussionCommentEvent':
          return mk('comment', {
            title: M('act.discussionComment'),
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
