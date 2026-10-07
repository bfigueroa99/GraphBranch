/* GraphBranch — fuente de datos en vivo desde la API de GitHub.

   Muestra todas las ramas del repo (o todas las que pasan el filtro), también con miles. Nunca
   consulta todas en cada ciclo; según lo que tenga disponible usa uno de tres modos:

   - graphql (con token): lista todas las ramas por GraphQL, de a 100 por consulta, al cargar y
     cada unos minutos (en cada ciclo si caben en una consulta). Entre medio, la API de actividad
     del repo dice qué ramas recibieron pushes, se crearon o se borraron (casi al instante) y
     solo esas se consultan.
   - list   (sin token, hasta 100 ramas): lista las ramas por REST con ETag.
   - events (sin token, más de 100 ramas): sigue el feed de eventos del repo
     (pushes, ramas creadas y borradas). Llega con algo de retraso.

   La historia de las ramas llega de a poco y por prioridad (la por defecto, las fijadas y las de
   actividad más reciente primero): el grafo aparece enseguida y se completa en unos ciclos, sin
   agotar la cuota. Con GraphQL cada rama pide solo lo suyo: unos pocos commits y, si con eso no
   llega a lo ya cargado, el resto desde donde quedó.

   En todos los modos compara cada respuesta con la anterior y emite
   "actividades" (alertas). Con token, las respuestas 304 no gastan cuota.

   El ciclo (loop) se cuida solo: cada consulta tiene un tope de tiempo, tras un error reintenta cada
   vez más espaciado (o justo cuando GitHub dice, si fue la cuota), sin red espera a que vuelva, y si
   la pestaña vuelve al frente con el ciclo vencido consulta al momento. Detener la fuente corta las
   consultas en curso. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  /* mensaje diferido: se traduce al mostrarlo, no al crearlo (ver i18n.js) */
  const M = i18n.msg;
  const API = 'https://api.github.com';
  const GQL_COMMIT =
    'oid url committedDate messageHeadline author { name user { login avatarUrl } } parents(first: 4) { nodes { oid } }';
  const GQL_TARGET = 'target { oid ... on Commit { committedDate } }';
  const PAGE = 100; // ramas por consulta al listarlas (el máximo de GitHub)
  const FIRST = 10; // commits que pide primero cada rama nueva; casi siempre bastan para tocar lo ya cargado
  const BATCH_MS = 4000; // tiempo por ciclo para listar ramas y traer historia; el resto, en el ciclo siguiente
  const FIRST_MS = 1500; // el primer ciclo es corto: que el grafo aparezca rápido
  const REQUEST_MS = 30000; // tope por consulta: una conexión colgada no deja el ciclo trabado para siempre
  const OFFLINE_MS = 30000; // sin red se espera al aviso del navegador; esto es por si no llega
  /** Errores que cortan el ciclo entero: una consulta secundaria que falla así no los tapa. */
  const HARD = new Set(['rate', 'network', 'auth', 'aborted']);
  const hard = (err) => HARD.has(err?.kind);

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
    constructor({ owner, name, token = '', depth = 40, filter = '', pins = [] }) {
      super();
      this.owner = owner;
      this.name = name;
      this.token = token;
      this.depth = depth;
      this.filter = filter.trim();
      this.pins = new Set(pins);
      this.mode = token ? 'graphql' : null;
      this.data = {
        repo: { owner, name, defaultBranch: null, url: `https://github.com/${owner}/${name}`, demo: false },
        branches: new Map(), // ramas dibujadas: las que ya tienen su historia
        commits: new Map(),
        pulls: new Map(),
        pins: this.pins, // van justo debajo de la rama por defecto (ver layout.js)
        mode: null,
        totalBranches: 0,
        totalExact: true,
        matchingBranches: null,
        pending: 0, // ramas que existen y esperan su historia para dibujarse
        totalPulls: 0,
        loaded: false,
      };
      this.known = new Map(); // ramas que existen y se quieren mostrar: nombre -> { sha, date, at, fresh, miss }
      this.listing = null; // listado de todas las ramas en curso (modo graphql): { after, startedAt, pages }
      this.listedAt = 0;
      this.listedOnce = false;
      this.listPages = 1;
      this.pushedAt = new Map(); // último push o borrado conocido por rama: nombre -> { time, deleted }
      this.freshRefs = new Set(); // ramas con actividad nueva (push, creación o borrado) desde el ciclo anterior
      this.seenActivity = new Set();
      this.activityOk = true;
      this.remoteHeads = new Map(); // modo list: todas las ramas
      this.refLatest = new Map(); // último tipo de evento por rama (para el modo events)
      this.recentRefs = [];
      this.seenEvents = new Set();
      this.prInfo = new Map(); // número -> { title, draft } de PRs que solo conocemos por eventos (o null)
      this.prHeads = new Set();
      this.kids = null; // commit -> hijos, para saber qué ramas contienen un commit (se rehace al cambiar los commits)
      this.etags = new Map();
      this.lastPoll = {};
      this.eventsInterval = 60;
      this.rate = null;
      this.gqlRate = null;
      this.cost = 0;
      this.gqlCost = 0;
      this.bulkCost = 0; // lo gastado en traer ramas que esperaban o en listarlas: no marca el ritmo de los ciclos
      this.avgCost = 3;
      this.failures = 0;
      this.running = false;
      this.paused = false;
      this.busy = false;
      this.reseed = false;
      this.more = false; // quedan ramas por cargar: el próximo ciclo va enseguida
      this.calm = false; // el ciclo sumó ramas que esperaban: el grafo las agrega sin efectos de llegada
      this.timer = null;
      this.nextAt = null; // cuándo toca el próximo ciclo: para adelantarlo si vuelve la red o la pestaña
      this.lastTry = 0;
      this.limitedUntil = 0; // cuota agotada hasta entonces: no vale la pena insistir antes
      this.offline = false;
      this.avgRest = 1; // gasto REST por ciclo en modo GraphQL (actividad, eventos, comparaciones)
      this.halt = null; // AbortController de esta conexión: stop() corta las consultas en curso
      this.watching = false;
      this.onWake = (ev) => {
        if (ev.type === 'visibilitychange' && document.hidden) return;
        this.nudge(ev.type);
      };
    }

    get base() {
      return `/repos/${this.owner}/${this.name}`;
    }

    /* ---------- ciclo de vida ---------- */

    start() {
      this.wake();
      this.emitStatus('loading', M('status.connecting'));
      this.loop();
    }

    stop() {
      this.running = false;
      this.unschedule();
      this.halt?.abort(); // las consultas en curso se cortan: nadie va a usar su respuesta
      this.watch(false);
    }

    /** Deja la fuente lista para consultar: al arrancar y al revivirla tras detenerla o tras un error fatal. */
    wake() {
      this.running = true;
      if (!this.halt || this.halt.signal.aborted) this.halt = new AbortController();
      this.watch(true);
    }

    /** Avisos del navegador que adelantan el ciclo: volvió la red, la pestaña volvió al frente o la descongeló. */
    watch(on) {
      if (this.watching === on) return;
      this.watching = on;
      const fn = on ? 'addEventListener' : 'removeEventListener';
      for (const type of ['online', 'pageshow']) window[fn](type, this.onWake);
      for (const type of ['visibilitychange', 'resume']) document[fn](type, this.onWake);
    }

    unschedule() {
      clearTimeout(this.timer);
      this.timer = null;
      this.nextAt = null;
    }

    schedule(delay) {
      this.unschedule();
      this.nextAt = Date.now() + delay;
      this.timer = setTimeout(() => this.loop(), delay);
    }

    setPaused(paused) {
      this.paused = paused;
      this.unschedule();
      if (paused) this.emitStatus('paused');
      else if (!this.running) this.refreshNow(); // se había detenido por un error fatal: reanudar es reintentar
      else if (this.busy) this.emitStatus(this.throttled ? 'limited' : 'live', null, null, null, { syncing: true }); // el ciclo en curso programa el siguiente
      else this.loop();
    }

    refreshNow() {
      if (!this.running) {
        this.wake();
        this.emitStatus('loading', M('status.retrying'));
      }
      this.unschedule();
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
      this.data.pins = this.pins;
      this.reseed = true;
      if (this.data.loaded) this.refreshNow();
    }

    /**
     * Si ya tocaba consultar (el navegador frena los temporizadores de las pestañas de atrás) o se
     * estaba esperando para reintentar tras un error, se consulta ahora. Con la cuota agotada no:
     * hasta que se renueve no hay nada que hacer.
     */
    nudge(type) {
      if (!this.running || this.paused || this.busy) return;
      const now = Date.now();
      if (now < this.limitedUntil) return;
      const waiting = this.status?.state === 'error' && navigator.onLine !== false;
      // volvió la red: se reintenta ya; el freno de 2 s es para los demás avisos, que llegan en cadena
      const reconnect = waiting && (type === 'online' || this.offline);
      if (!reconnect && now - this.lastTry < 2000) return;
      const due = this.nextAt != null && this.nextAt - now <= 1000;
      if (due || waiting) this.loop();
    }

    /**
     * Un ciclo: consulta, avisa lo nuevo y deja programado el siguiente. Si algo falla, reintenta
     * cada vez más espaciado (salvo que GitHub diga cuánto esperar); sin red, espera a que vuelva.
     */
    async loop() {
      this.unschedule();
      if (!this.running || this.paused || this.busy) return;
      this.busy = true;
      this.again = false;
      this.lastTry = Date.now();
      let delay = null;
      try {
        const initial = !this.data.loaded;
        if (initial) this.emitStatus('loading', M('status.loadingBranches'));
        else this.emitStatus(this.throttled ? 'limited' : 'live', null, null, null, { syncing: true });
        const activities = await this.poll(initial);
        this.data.loaded = true;
        this.failures = 0;
        this.offline = false;
        this.limitedUntil = 0;
        this.lastOk = Date.now();
        if (!this.running) return;
        this.emit('update', { activities, initial, calm: this.calm });
        delay = this.nextDelay();
        if (this.again && !this.exhausted) delay = 0; // pidieron actualizar durante el ciclo (botón, filtro, fijadas)
        else if (this.more && !this.throttled) delay = Math.min(delay, 250); // quedan ramas por cargar: se sigue enseguida
        // si pausaron a mitad del ciclo, el estado lo pone el final
        if (!this.paused) this.emitStatus(this.throttled ? 'limited' : 'live', null, delay, null, { syncing: delay < 1000 });
      } catch (err) {
        if (!this.running) return;
        if (err.kind === 'aborted') delay = 0; // stop() cortó el ciclo y refreshNow() revivió la fuente: se empieza de nuevo
        else {
          const offline = navigator.onLine === false;
          const fatal = !this.data.loaded && (err.kind === 'notfound' || err.kind === 'auth');
          if (err.kind === 'rate') {
            // la cuota se agotó: se espera justo hasta que se renueve, y no cuenta como fallo
            this.limitedUntil = err.resetAt;
            delay = Math.max(5000, err.resetAt - Date.now() + 2000);
          } else if (offline) delay = OFFLINE_MS; // sin red no se insiste: el aviso del navegador adelanta el reintento
          else {
            // cada fallo seguido espera el doble (5 s, 10 s… hasta 5 min), con algo de azar: que no reintenten todos a la vez
            this.failures++;
            delay = Math.min(300000, Math.round(2500 * 2 ** Math.min(this.failures, 7) * (0.8 + 0.4 * Math.random())));
          }
          this.offline = offline;
          if (!(err instanceof ApiError)) console.error(err);
          this.emitStatus('error', err.msg || err.message, fatal ? null : delay, err, { offline });
          if (fatal) this.running = false;
        }
      } finally {
        this.busy = false;
      }
      if (this.paused) this.emitStatus('paused');
      else if (this.running && delay != null) this.schedule(delay);
    }

    /**
     * Espacia los ciclos para que la cuota alcance hasta su próximo reinicio: la de GraphQL y la
     * de REST, cada una con lo que gasta un ciclo normal (sin lo de cargar ramas que esperaban).
     */
    nextDelay() {
      const base = this.token ? 10000 : 60000;
      const gql = this.mode === 'graphql';
      this.avgCost = this.avgCost * 0.6 + Math.max(1, (gql ? this.gqlCost : this.cost) - this.bulkCost) * 0.4;
      if (gql) this.avgRest = this.avgRest * 0.6 + this.cost * 0.4;
      this.exhausted = false;
      let delay = base;
      const fit = (rate, avg, reserve) => {
        if (!rate) return;
        const secsLeft = rate.reset - Date.now() / 1000;
        if (secsLeft <= 1) return; // ya se renovó (o está por hacerlo): el próximo ciclo trae la cuota nueva
        const usable = rate.remaining - reserve;
        if (usable <= 0) {
          this.exhausted = true;
          delay = Math.max(delay, secsLeft * 1000 + 2000);
        } else delay = Math.max(delay, Math.min((secsLeft / (usable / avg)) * 1000, secsLeft * 1000 + 2000));
      };
      fit(gql ? this.gqlRate : this.rate, this.avgCost, this.token ? 50 : 2);
      if (gql) fit(this.rate, this.avgRest, 50);
      this.throttled = delay > base * 1.5;
      return delay;
    }

    emitStatus(state, message = null, delay = null, error = null, extra = null) {
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
        syncing: false, // hay un ciclo en curso (o empieza enseguida): "actualizando…"
        offline: false, // el navegador dice que no hay red: se espera a que vuelva
        ...extra,
      };
      this.emit('status', this.status);
    }

    /* ---------- HTTP ---------- */

    async api(path, { cacheKey = null, allow = [] } = {}) {
      const headers = { Accept: 'application/vnd.github+json' };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const cached = cacheKey ? this.etags.get(cacheKey) : null;
      if (cached) headers['If-None-Match'] = cached.etag;

      const { res, body } = await this.request(API + path, { headers, cache: 'no-store' });
      this.readRate(res);
      if (res.status === 304 && cached) {
        if (!this.token) this.cost++; // sin token, los 304 sí cuentan
        return { data: cached.data, fresh: false, headers: res.headers };
      }
      this.cost++;
      if (allow.includes(res.status)) return { data: null, fresh: true, status: res.status, headers: res.headers };
      if (!res.ok) throw this.toError(res, body);
      const etag = res.headers.get('ETag');
      if (cacheKey && etag) this.etags.set(cacheKey, { etag, data: body });
      return { data: body, fresh: true, headers: res.headers };
    }

    async gql(query, variables = {}) {
      const { res, body } = await this.request(API + '/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { owner: this.owner, name: this.name, ...variables } }),
        cache: 'no-store',
      });
      this.readRate(res);
      if (!res.ok) throw this.toError(res, body);
      const rl = body?.data?.rateLimit;
      if (rl) this.gqlRate = { limit: rl.limit, remaining: rl.remaining, reset: Date.parse(rl.resetAt) / 1000 };
      this.gqlCost += rl?.cost || 1;
      if (body?.errors?.length && !body.data?.repository) {
        const e = body.errors[0];
        if (e.type === 'NOT_FOUND') throw this.notFound();
        if (e.type === 'RATE_LIMITED')
          throw new ApiError(M('err.rateGraphql'), {
            kind: 'rate',
            resetAt: (this.gqlRate?.reset || Date.now() / 1000 + 60) * 1000,
          });
        throw new ApiError(M('err.graphql', { message: e.message }), { kind: 'graphql' });
      }
      return body?.data;
    }

    /**
     * Una consulta a GitHub con su respuesta ya leída. Si no llega entera en REQUEST_MS se corta y
     * cuenta como fallo de red (se reintenta); si la fuente se detuvo mientras tanto, se corta y no
     * cuenta como nada.
     */
    async request(url, opts) {
      const halt = this.halt || (this.halt = new AbortController());
      const stopped = () => new ApiError(M('err.network'), { kind: 'aborted' });
      if (halt.signal.aborted) throw stopped();
      const ctl = new AbortController();
      const onHalt = () => ctl.abort();
      halt.signal.addEventListener('abort', onHalt, { once: true });
      let late = false;
      const timer = setTimeout(() => {
        late = true;
        ctl.abort();
      }, REQUEST_MS);
      try {
        const res = await fetch(url, { ...opts, signal: ctl.signal });
        let body = null;
        if (res.status !== 204 && res.status !== 304) {
          const text = await res.text(); // el cuerpo también entra en el tope de tiempo
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = undefined;
          }
          if (res.ok && !body) throw new ApiError(M('err.network'), { kind: 'network' }); // llegó vacía o cortada
        }
        return { res, body };
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (halt.signal.aborted) throw stopped();
        throw new ApiError(M(late ? 'err.timeout' : 'err.network'), { kind: 'network' });
      } finally {
        clearTimeout(timer);
        halt.signal.removeEventListener('abort', onHalt);
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
      const retryAfter = Number(res.headers.get('Retry-After')); // límite secundario: GitHub dice cuánto esperar
      const secondary = /secondary rate limit/i.test(msg); // y si no lo dice, pide esperar un minuto
      const limited = retryAfter > 0 || secondary || (this.rate?.remaining === 0 && res.headers.get('X-RateLimit-Resource') !== 'graphql') || /rate limit/i.test(msg);
      if ((res.status === 403 || res.status === 429) && limited) {
        const reset = Number(res.headers.get('X-RateLimit-Reset'));
        const resetAt = retryAfter ? Date.now() + retryAfter * 1000 : !secondary && reset ? reset * 1000 : Date.now() + 60000;
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

    spent() {
      return this.mode === 'graphql' ? this.gqlCost : this.cost;
    }

    async poll(initial) {
      this.cost = 0;
      this.gqlCost = 0;
      this.bulkCost = 0;
      this.calm = false;
      const acts = [];
      const quiet = initial || this.reseed;
      const deadline = Date.now() + (initial ? FIRST_MS : BATCH_MS);
      if (initial) await this.loadRepo(acts);
      if (this.reseed) this.prune();

      if (this.mode === 'graphql') {
        try {
          await this.syncGraphQL(acts, quiet, deadline);
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
      const before = this.spent();
      await this.fillBacklog(deadline);
      this.bulkCost += this.spent() - before;
      if (!initial && this.mode !== 'events' && this.due('events')) await this.syncEvents(acts, false);
      if (this.mode === 'events' && this.due('count')) await this.countBranches();

      await this.completePushes(acts);
      this.data.mode = this.mode;
      this.reseed = false;
      this.gc();
      this.countPending();
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
        if (hard(err)) throw err;
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

    /** Filtro o fijadas nuevos: fuera lo que ya no se quiere mostrar. */
    prune() {
      for (const m of [this.known, this.data.branches]) for (const name of [...m.keys()]) if (!this.wanted(name)) m.delete(name);
      if (!this.filter) this.data.matchingBranches = null;
    }

    /* ---------- ramas que esperan su historia ---------- */

    /** Rama ya cargada que pasa a dibujarse. */
    admit(name, e) {
      const b = {
        name,
        sha: e.sha,
        isDefault: name === this.data.repo.defaultBranch,
        protected: !!e.protected,
        movedAt: this.pushedAt.get(name)?.time || 0,
      };
      this.data.branches.set(name, b);
      return b;
    }

    /** No se pudo traer la historia de esa cabeza: no se insiste hasta que la rama se mueva. */
    missed(e) {
      return !!e.sha && e.miss === e.sha;
    }

    /** Prioridad para traer la historia: la por defecto, las fijadas y luego la actividad más reciente. */
    score(name, e) {
      if (name === this.data.repo.defaultBranch) return Infinity;
      if (this.pins.has(name)) return 1e15;
      return Math.max(this.pushedAt.get(name)?.time || 0, e.date || 0) + (this.prHeads.has(name) ? 1 : 0);
    }

    /** Consultas REST que se pueden gastar en historia en este ciclo (sin token la cuota es de 60 por hora). */
    restBudget() {
      const left = (this.rate?.remaining ?? 60) - (this.token ? 100 : 12);
      return Math.max(0, Math.min(this.token ? 60 : 12, left));
    }

    canLoad() {
      return this.mode === 'graphql' ? (this.gqlRate?.remaining ?? 5000) > 300 : this.restBudget() > 0;
    }

    /**
     * Trae la historia de las ramas que esperan, las más importantes primero, hasta que se acabe el
     * tiempo del ciclo (GraphQL) o las consultas que se pueden gastar (REST). Lo que quede, en el
     * ciclo siguiente: el grafo se completa de a poco en vez de hacer esperar al primero.
     */
    async fillBacklog(deadline) {
      const { branches: tracked, commits } = this.data;
      const waiting = [];
      for (const [name, e] of this.known) {
        if (tracked.has(name) || this.missed(e)) continue;
        if (e.sha && commits.has(e.sha)) {
          this.admit(name, e); // su cabeza ya está en el grafo: entra sin consultar nada
          this.calm = true;
        } else waiting.push(name);
      }
      if (!waiting.length) return;
      this.prHeads = new Set([...this.data.pulls.values()].filter((p) => p.sameRepo).map((p) => p.head));
      const score = new Map(waiting.map((name) => [name, this.score(name, this.known.get(name))]));
      waiting.sort((a, b) => score.get(b) - score.get(a));

      if (this.mode !== 'graphql') {
        let budget = this.restBudget();
        for (let i = 0; i < waiting.length && budget > 0 && (i === 0 || Date.now() < deadline); i++, budget--) {
          const name = waiting[i];
          const e = this.known.get(name);
          const sha = await this.fetchBranch(e.sha || name); // modo events: el nombre basta, y así se sabe su cabeza
          if (!e.sha) {
            if (!sha) {
              this.known.delete(name); // ya no existe
              continue;
            }
            e.sha = sha;
          }
          this.settle(name);
        }
        return;
      }

      let i = 0;
      // la por defecto primero y entera: así las demás solo piden lo suyo, hasta tocarla
      if (waiting[0] === this.data.repo.defaultBranch) {
        await this.ensureHistory([this.known.get(waiting[0]).sha], this.depth);
        this.settle(waiting[i++]);
      }
      // al menos una tanda por ciclo, aunque el tiempo ya se haya ido en listar
      for (let n = 0; i < waiting.length && (!n || (Date.now() < deadline && this.canLoad())); n++) {
        const slice = waiting.slice(i, (i += 60));
        await this.ensureHistory(slice.map((name) => this.known.get(name).sha));
        for (const name of slice) this.settle(name);
      }
    }

    settle(name) {
      const e = this.known.get(name);
      if (!e?.sha || this.data.branches.has(name)) return;
      if (this.data.commits.has(e.sha)) {
        this.admit(name, e);
        this.calm = true;
      } else e.miss = e.sha;
    }

    countPending() {
      let pending = 0;
      for (const [name, e] of this.known) if (!this.data.branches.has(name) && !this.missed(e)) pending++;
      this.data.pending = pending;
      this.more = !!this.listing || (pending > 0 && this.canLoad());
    }

    /* ---------- modo graphql ---------- */

    async syncGraphQL(acts, quiet, deadline) {
      const { branches: tracked, commits } = this.data;
      await this.syncActivity(quiet, PAGE);
      const now = Date.now();
      if (quiet) {
        this.listing = null; // filtro nuevo o primera carga: se lista todo desde el principio
        this.listedOnce = false;
      }
      if (!this.listing && (quiet || now - this.listedAt >= this.listPeriod())) this.listing = { after: null, startedAt: now, pages: 0 };

      /* ramas que se consultan una por una: las de actividad nueva (pushes, creadas o borradas),
         las fijadas (pueden no pasar el filtro) y, al cargar, las de pushes recientes, así lo más
         activo aparece antes de que el listado llegue a ellas */
      const def0 = this.data.repo.defaultBranch;
      const fresh = new Set([...this.freshRefs].filter((name) => this.wanted(name)));
      this.freshRefs.clear();
      const check = new Set([...this.pins, ...fresh]);
      if (quiet) for (const name of this.recentPushes(PAGE)) check.add(name);
      // sin la API de actividad los cambios llegan tarde por el feed: las más activas se miran en cada ciclo
      if (!this.activityOk) for (const name of this.mostActive(50)) check.add(name);
      check.delete(def0);
      const names = [...check];

      const gone = [];
      const absent = []; // no aparecieron en un listado completo: se confirma una por una antes de darlas por borradas
      const see = (name, target) => {
        if (!target?.oid) return;
        const date = Date.parse(target.committedDate) || 0;
        const e = this.known.get(name);
        if (!e) {
          // nueva desde el último listado completo (o con un push recién visto): llega con su aviso
          this.known.set(name, { sha: target.oid, date, at: now, fresh: !quiet && (this.listedOnce || fresh.has(name)) });
          return;
        }
        e.at = now;
        if (e.sha !== target.oid) Object.assign(e, { sha: target.oid, date });
        if (!quiet && fresh.has(name) && !tracked.has(name)) e.fresh = true;
      };
      const readRefs = (repo, list) =>
        list.forEach((name, i) => {
          const r = repo?.['t' + i];
          if (r) see(name, r.target);
          else gone.push(name);
        });
      const aliases = (list) =>
        list.map((name, i) => `t${i}: ref(qualifiedName: ${JSON.stringify('refs/heads/' + name)}) { ${GQL_TARGET} }`).join('\n');

      const listing = this.listing;
      const first = names.slice(0, PAGE);
      const query = `query($owner: String!, $name: String!${listing ? ', $q: String, $after: String' : ''}) {
        rateLimit { cost remaining limit resetAt }
        repository(owner: $owner, name: $name) {
          defaultBranchRef { name ${GQL_TARGET} }
          all: refs(refPrefix: "refs/heads/", first: 1) { totalCount }
          ${listing ? `page: ${this.refsPage()}` : ''}
          pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
            nodes { number title isDraft url headRefName baseRefName isCrossRepository createdAt author { login avatarUrl } }
          }
          ${aliases(first)}
        }
      }`;
      let data;
      try {
        data = await this.gql(query, listing ? { q: this.filter || null, after: listing.after } : {});
      } catch (err) {
        if (listing?.after && err.kind === 'graphql') this.listing = null; // un cursor vencido no traba el ciclo: se vuelve a listar
        throw err;
      }
      const repo = data?.repository;
      if (!repo) throw this.notFound();

      const def = repo.defaultBranchRef?.name || def0;
      this.data.repo.defaultBranch = def;
      if (repo.defaultBranchRef) see(def, repo.defaultBranchRef.target);
      if (repo.all) this.data.totalBranches = repo.all.totalCount;
      this.data.totalExact = true;
      readRefs(repo, first);
      const checkRefs = async (list) => {
        for (let i = 0; i < list.length; i += PAGE) {
          const chunk = list.slice(i, i + PAGE);
          const more = await this.gql(`query($owner: String!, $name: String!) {
            rateLimit { cost remaining limit resetAt }
            repository(owner: $owner, name: $name) { ${aliases(chunk)} }
          }`);
          readRefs(more?.repository, chunk);
        }
      };
      await checkRefs(names.slice(PAGE));

      if (listing) {
        this.readPage(repo.page, see, absent);
        // el resto del listado mientras quede tiempo (la mitad del ciclo: la otra es para la historia)
        const until = now + (deadline - now) / 2;
        const before = this.spent();
        while (this.listing && Date.now() < until) {
          let page;
          try {
            const more = await this.gql(
              `query($owner: String!, $name: String!, $q: String, $after: String) {
                rateLimit { cost remaining limit resetAt }
                repository(owner: $owner, name: $name) { page: ${this.refsPage()} }
              }`,
              { q: this.filter || null, after: this.listing.after },
            );
            page = more?.repository?.page;
          } catch (err) {
            if (hard(err)) throw err;
            this.listing = null; // se vuelve a empezar en el próximo turno
            break;
          }
          this.readPage(page, see, absent);
        }
        // el listado pagina sobre una lista que puede cambiar mientras tanto: una rama que falta no
        // necesariamente se borró, así que se pregunta por ella antes de avisar
        await checkRefs(absent.filter((name) => name !== def));
        this.bulkCost += this.spent() - before;
      }

      for (const name of new Set(gone)) {
        if (name === def) continue;
        this.known.delete(name);
        const p = this.pushedAt.get(name);
        if (p && !p.deleted) p.deleted = true; // no volver a preguntar por ella
        const b = tracked.get(name);
        if (!b) continue;
        tracked.delete(name);
        if (!quiet) acts.push(this.branchDeleted(name, b.sha));
      }

      /* ramas dibujadas que se movieron y ramas nuevas con actividad: su historia va antes que la del resto */
      const moved = [];
      const arrived = [];
      for (const [name, e] of this.known) {
        if (this.missed(e)) continue;
        const b = tracked.get(name);
        if (b ? b.sha !== e.sha : e.fresh) (b ? moved : arrived).push(name);
      }
      await this.ensureHistory([...moved, ...arrived].map((name) => this.known.get(name).sha));
      for (const name of moved) {
        const b = tracked.get(name);
        const e = this.known.get(name);
        if (!commits.has(e.sha)) {
          e.miss = e.sha;
          continue;
        }
        const from = b.sha;
        b.sha = e.sha;
        if (quiet) continue;
        b.movedAt = now;
        const a = await this.branchMoved(name, from, e.sha);
        if (a) acts.push(a);
      }
      for (const name of arrived) {
        const e = this.known.get(name);
        e.fresh = false;
        if (!commits.has(e.sha)) {
          e.miss = e.sha;
          continue;
        }
        this.admit(name, e).movedAt = now;
        acts.push(this.branchAppeared(name, e.sha));
      }

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

    /** Una página del listado de ramas (en orden alfabético, con el filtro aplicado en GitHub). */
    refsPage() {
      return `refs(refPrefix: "refs/heads/", first: ${PAGE}, after: $after, query: $q) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { name ${GQL_TARGET} }
      }`;
    }

    readPage(page, see, absent) {
      const l = this.listing;
      if (!l) return;
      if (!page) {
        this.listing = null;
        return;
      }
      for (const r of page.nodes) see(r.name, r.target);
      if (this.filter) this.data.matchingBranches = page.totalCount;
      l.pages++;
      if (page.pageInfo?.hasNextPage) {
        l.after = page.pageInfo.endCursor;
        return;
      }
      // listado completo: lo que no apareció en él ni se vio de otra forma desde que empezó, quizás ya no existe
      for (const [name, e] of this.known) if (e.at < l.startedAt) absent.push(name);
      this.listing = null;
      this.listedAt = Date.now();
      this.listedOnce = true;
      this.listPages = l.pages;
    }

    /** Cada cuánto se vuelve a listar todo: en cada ciclo si cabe en una consulta; si no, cada unos
        minutos (los cambios del medio los trae la API de actividad, que dice qué ramas mirar). */
    listPeriod() {
      if (this.listPages <= 1) return 0;
      return Math.max((this.activityOk ? 5 : 1) * 60000, this.listPages * 6000);
    }

    /** Las n ramas con pushes más recientes según la actividad conocida (que pasan el filtro). */
    recentPushes(n) {
      return [...this.pushedAt]
        .filter(([name, p]) => !p.deleted && U.matches(name, this.filter))
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, n)
        .map(([name]) => name);
    }

    /** Las n ramas dibujadas con actividad más reciente. */
    mostActive(n) {
      const { commits } = this.data;
      const t = (b) => Math.max(commits.get(b.sha)?.date || 0, b.movedAt || 0);
      return [...this.data.branches.values()]
        .filter((b) => !b.isDefault)
        .sort((a, b) => t(b) - t(a))
        .slice(0, n)
        .map((b) => b.name);
    }

    /** Registra actividad de una rama (push, creación o borrado) con su hora. */
    notePush(name, time, deleted, live) {
      const p = this.pushedAt.get(name);
      if (p && p.time >= time) return;
      this.pushedAt.set(name, { time, deleted });
      if (live && this.mode === 'graphql') this.freshRefs.add(name);
      if (this.pushedAt.size > 20000) this.pushedAt = new Map([...this.pushedAt].sort((a, b) => b[1].time - a[1].time).slice(0, 15000));
    }

    /**
     * Últimos pushes del repo según su API de actividad: qué ramas se movieron y
     * cuándo, casi al instante y en una sola consulta (con ETag). Al cargar sigue
     * unas páginas hacia atrás, así las ramas más activas se cargan primero.
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
          if (hard(err)) throw err;
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
      else this.branchList = res; // syncBranchList la usa en este mismo ciclo: sin token, repetirla gasta cuota
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
      const res = this.branchList || (await this.api(`${this.base}/branches?per_page=100`, { cacheKey: 'branches' }));
      this.branchList = null;
      if (/rel="next"/.test(res.headers?.get('Link') || '')) this.mode = 'events'; // creció: desde el próximo ciclo

      const remote = new Map(res.data.map((b) => [b.name, { sha: b.commit.sha, protected: !!b.protected }]));
      this.data.totalBranches = remote.size;
      this.data.matchingBranches = this.filter ? [...remote.keys()].filter((n) => U.matches(n, this.filter)).length : null;
      const { branches: tracked, commits } = this.data;
      const prev = this.remoteHeads;
      this.remoteHeads = remote;

      // todas las que se quieren mostrar; las que aún no tienen su historia esperan turno (fillBacklog)
      const known = new Map();
      for (const [name, info] of remote) {
        if (!this.wanted(name)) continue;
        const old = this.known.get(name);
        known.set(name, old && old.sha === info.sha ? Object.assign(old, { protected: info.protected }) : { sha: info.sha, protected: info.protected, date: 0 });
      }
      this.known = known;

      for (const [name, info] of prev) {
        if (remote.has(name)) continue;
        const was = tracked.delete(name);
        if (!quiet && (was || this.wanted(name))) acts.push(this.branchDeleted(name, info.sha));
      }
      for (const name of [...tracked.keys()]) if (!known.has(name)) tracked.delete(name); // ya no pasa el filtro

      /* ramas dibujadas que se movieron y, en vivo, ramas nuevas o que se movieron: van antes que el resto */
      const changed = []; // [nombre, sha anterior o null si es nueva]
      for (const [name, e] of known) {
        const b = tracked.get(name);
        if (b) {
          b.protected = e.protected;
          if (b.sha !== e.sha && !this.missed(e)) changed.push([name, b.sha]);
          continue;
        }
        const before = prev.get(name);
        if (!quiet && prev.size && (!before || before.sha !== e.sha)) changed.push([name, before?.sha || null]);
      }
      if (!changed.length) return;
      await this.ensureHistory(changed.map(([name]) => known.get(name).sha));
      for (const [name, from] of changed) {
        const e = known.get(name);
        if (!commits.has(e.sha)) {
          e.miss = e.sha;
          continue;
        }
        let b = tracked.get(name);
        if (b) b.sha = e.sha;
        else b = this.admit(name, e);
        if (quiet) continue;
        b.movedAt = Date.now();
        if (!from) acts.push(this.branchCreated(name, e.sha));
        else {
          const a = await this.branchMoved(name, from, e.sha);
          if (a) acts.push(a);
        }
      }
    }

    async syncFromEvents(acts, initial, quiet) {
      if (quiet) {
        // las que se conocen por el feed (sin token no se pueden listar miles de ramas)
        const def = this.data.repo.defaultBranch;
        const names = new Set([def, ...this.pins, ...this.recentRefs.filter((n) => U.matches(n, this.filter))]);
        const known = new Map();
        for (const name of names) {
          if (!name || this.refLatest.get(name) === 'DeleteEvent') continue;
          known.set(name, this.known.get(name) || { sha: this.data.branches.get(name)?.sha || null, date: 0 });
        }
        this.known = known;
        for (const name of [...this.data.branches.keys()]) if (!known.has(name)) this.data.branches.delete(name);
        if (initial) return; // los eventos iniciales ya se leyeron en loadRepo
      }
      const res = await this.api(`${this.base}/events?per_page=50`, { cacheKey: 'events' });
      this.lastPoll.events = Date.now();
      if (!res.fresh) return;
      const fresh = (res.data || []).filter((ev) => !this.seenEvents.has(ev.id)).reverse(); // más antiguos primero
      await this.enrichPulls(fresh);
      for (const ev of fresh) {
        this.seenEvents.add(ev.id);
        await this.applyEvent(ev, acts);
      }
      this.forgetOldEvents();
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
        this.known.delete(ref);
        if (b && a) {
          const d = this.branchDeleted(ref, b.sha);
          Object.assign(a, { kind: d.kind, detail: d.detail, sha: d.sha });
        }
      } else {
        const sha = p.head && this.data.commits.has(p.head) ? p.head : await this.fetchBranch(p.head || ref);
        if (sha) {
          this.known.set(ref, { sha, date: 0 });
          const b = tracked.get(ref) || this.admit(ref, { sha });
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

    /**
     * Trae la historia que falta de esas cabezas. Por REST, `depth` commits por rama (una consulta
     * cada una). Con GraphQL, de a poco y muchas ramas por consulta: primero `first` commits por
     * rama y, si su línea principal aún no llega a lo que ya estaba cargado, el resto hasta `depth`,
     * desde el primer commit que falta. Una rama nueva casi nunca pide más de una vuelta.
     */
    async ensureHistory(shas, first = FIRST) {
      const { commits } = this.data;
      const missing = [...new Set(shas)].filter((s) => s && !commits.has(s));
      if (!missing.length) return;
      if (this.mode !== 'graphql') {
        for (const sha of missing) if (!commits.has(sha)) await this.fetchBranch(sha);
        return;
      }
      const added = new Set(); // lo traído en esta llamada; lo de antes es "lo ya cargado"
      let jobs = missing.map((sha) => ({ head: sha, from: sha, n: Math.min(first, this.depth) }));
      for (let round = 0; jobs.length && round < 8; round++) {
        await this.fetchHistories(jobs, added);
        const next = new Map(); // desde -> pedido (dos ramas que siguen por el mismo camino piden una vez)
        for (const job of jobs) {
          if (!commits.has(job.head)) continue; // GitHub no la encontró
          let sha = job.head;
          let steps = 0;
          while (steps < this.depth && added.has(sha)) {
            sha = commits.get(sha).parents[0];
            steps++;
          }
          // llegó al tope, a la raíz o a lo ya cargado; o se trabó en el mismo commit (no hay más que pedir)
          if (steps >= this.depth || !sha || commits.has(sha) || sha === job.from) continue;
          const n = this.depth - steps;
          if ((next.get(sha)?.n || 0) < n) next.set(sha, { head: job.head, from: sha, n });
        }
        jobs = [...next.values()];
      }
    }

    /** Historia de varias ramas, en consultas de unos cientos de commits. */
    async fetchHistories(jobs, added) {
      for (let i = 0; i < jobs.length; ) {
        const size = Math.max(4, Math.min(40, Math.floor(400 / jobs[i].n)));
        await this.historyQuery(jobs.slice(i, (i += size)), added);
      }
    }

    /** Si GitHub no alcanza a resolver la consulta (demasiado pesada), se parte en dos, hasta dos veces. */
    async historyQuery(chunk, added, tries = 2) {
      const query = `query($owner: String!, $name: String!) {
        rateLimit { cost remaining limit resetAt }
        repository(owner: $owner, name: $name) {
          ${chunk.map((j, i) => `h${i}: object(oid: "${j.from}") { ... on Commit { history(first: ${j.n}) { nodes { ${GQL_COMMIT} } } } }`).join('\n')}
        }
      }`;
      let data;
      try {
        data = await this.gql(query);
      } catch (err) {
        const heavy = err.kind === 'graphql' || err.status === 502 || err.status === 504;
        if (!heavy) throw err;
        if (chunk.length === 1) return console.warn('No se pudo traer la historia de', chunk[0].from, err.message);
        if (!tries) throw err;
        const half = Math.ceil(chunk.length / 2);
        await this.historyQuery(chunk.slice(0, half), added, tries - 1);
        await this.historyQuery(chunk.slice(half), added, tries - 1);
        return;
      }
      chunk.forEach((_, i) => {
        for (const c of data?.repository?.['h' + i]?.history?.nodes || []) if (this.addGqlCommit(c)) added.add(c.oid);
      });
    }

    addCommit(c) {
      if (this.data.commits.has(c.sha)) return false;
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
      this.kids = null;
      return true;
    }

    addGqlCommit(c) {
      if (!c?.oid || this.data.commits.has(c.oid)) return false;
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
      this.kids = null;
      return true;
    }

    /** Descarta commits que ya no alcanza ninguna rama visible y limita el total. */
    gc() {
      const { commits, branches } = this.data;
      const heads = [...branches.values()].map((b) => b.sha);
      const keep = U.reachable(commits, heads).set;
      const before = commits.size;
      for (const sha of [...commits.keys()]) if (!keep.has(sha)) commits.delete(sha);
      const cap = Math.max(600, this.depth * (branches.size + 10) * 2);
      if (commits.size > cap) {
        const headSet = new Set(heads);
        const old = [...commits.values()].filter((c) => !headSet.has(c.sha)).sort((a, b) => a.date - b.date);
        for (const c of old.slice(0, commits.size - cap)) commits.delete(c.sha);
      }
      if (commits.size !== before) this.kids = null;
    }

    authorOf(sha) {
      const c = this.data.commits.get(sha);
      return c ? { name: c.author.name, login: c.author.login, avatar: c.author.avatar } : null;
    }

    /** Hijos de cada commit cargado (se rehace solo cuando cambian los commits). */
    childIndex() {
      if (this.kids) return this.kids;
      const kids = new Map();
      for (const c of this.data.commits.values()) for (const p of c.parents) (kids.get(p) || kids.set(p, []).get(p)).push(c.sha);
      return (this.kids = kids);
    }

    /**
     * Rama visible que contiene `sha`: la que lo tiene como cabeza, la por defecto o la más cercana
     * hacia adelante. Recorre los descendientes del commit (unos pocos) en vez de la historia de
     * cada rama, así no cuesta más con miles de ramas.
     */
    branchContaining(sha, exclude) {
      const { branches, commits } = this.data;
      const heads = new Map();
      let def = null;
      for (const b of branches.values()) {
        if (b.name === exclude) continue;
        if (b.sha === sha) return b.name;
        if (b.isDefault) def = b;
        if (!heads.has(b.sha)) heads.set(b.sha, b.name);
      }
      if (def && U.ancestors(commits, def.sha).set.has(sha)) return def.name;
      const kids = this.childIndex();
      const queue = [sha];
      const seen = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        for (const k of kids.get(queue[i]) || []) {
          if (seen.has(k)) continue;
          if (heads.has(k)) return heads.get(k);
          seen.add(k);
          queue.push(k);
        }
      }
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
        if (hard(err)) throw err;
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

    /** Los eventos ya procesados del feed (una página trae 50): acotado, que hay sesiones de días. */
    forgetOldEvents() {
      if (this.seenEvents.size > 2000) this.seenEvents = new Set([...this.seenEvents].slice(-1000));
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
        this.seenEvents.add(ev.id);
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
      this.forgetOldEvents();
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
            if (hard(err)) throw err; // si no, se intenta por REST
          }
        }
        // sin GraphQL: la página de PRs actualizados hace poco (abiertos o no) cubre casi siempre el feed
        const { data } = await this.api(`${this.base}/pulls?state=all&sort=updated&direction=desc&per_page=50`, { cacheKey: 'pulls-all' });
        for (const p of data || []) this.prInfo.set(p.number, { title: p.title || '', draft: !!p.draft });
        for (const n of nums) if (!this.prInfo.has(n)) this.prInfo.set(n, null); // no volver a buscarlo
      } catch (err) {
        if (hard(err)) throw err;
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
            if (hard(err)) throw err;
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
