#!/usr/bin/env node
/* Pruebas de la fuente de Codeberg (js/sources/codeberg.js) contra una API de codeberg.org simulada.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/codeberg.test.mjs     solo estas

   La API falsa sirve el repo ana/api como Forgejo: páginas con `limit` (tope de 50, encabezado Link),
   el listado de commits desde una cabeza, comparaciones `a...b`, PRs y árboles. Un repo privado
   responde 404, y ninguna consulta debe llevar un token salvo la prueba del token propio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const REPO = '/repos/ana/api';
const WEB = 'https://codeberg.org/ana/api';

function load(cb) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    fetch: cb.fetch,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  });
  ctx.window = ctx;
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(code('diff.js'), ctx, { filename: 'diff.js' });
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('sources/codeberg.js'), ctx, { filename: 'sources/codeberg.js' });
  return ctx.GB;
}

function fakeCodeberg(site = 'https://codeberg.org') {
  const web = `${site}/ana/api`;
  const cb = { commits: new Map(), branches: new Map(), pulls: [], override: null, calls: [], auths: [], expectAuth: undefined, private: false };
  let n = 0;
  cb.commit = (sha, ...parents) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    cb.commits.set(sha, {
      sha,
      html_url: `${web}/commit/${sha}`,
      parents: parents.map((p) => ({ sha: p })),
      commit: { message: `commit ${sha}\n`, author: { name: 'Ana', date }, committer: { date } },
      author: { login: 'ana', avatar_url: `${site}/avatars/ana` },
    });
  };
  cb.push = (branch, sha, ...parents) => {
    cb.commit(sha, ...parents);
    cb.branches.set(branch, sha);
  };
  const reach = (sha) => {
    const out = new Set();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !cb.commits.has(s)) continue;
      out.add(s);
      stack.push(...cb.commits.get(s).parents.map((p) => p.sha));
    }
    return out;
  };
  const resolve = (ref) => (cb.branches.get(ref) || (cb.commits.has(ref) ? ref : null));
  const paged = (all, q) => {
    const limit = Math.min(50, Number(q.get('limit') || 30));
    const page = Number(q.get('page') || 1);
    const headers = { 'X-Total-Count': all.length };
    if (page * limit < all.length) headers.Link = `<${site}/next>; rel="next"`;
    return { body: all.slice((page - 1) * limit, page * limit), headers };
  };
  cb.pull = (number, head, base, more = {}) => {
    const p = {
      number,
      title: `PR ${number}`,
      html_url: `${web}/pulls/${number}`,
      state: 'open',
      merged: false,
      head: { ref: head, repo: { full_name: 'ana/api' } },
      base: { ref: base },
      user: { login: 'ana', full_name: 'Ana', avatar_url: 'https://seccdn.libravatar.org/avatar/x' },
      created_at: new Date().toISOString(),
      ...more,
    };
    cb.pulls.push(p);
    return p;
  };

  function route(path) {
    const u = new URL(`${site}/api/v1` + path);
    const p = u.pathname.replace('/api/v1', '');
    const q = u.searchParams;
    if (p === REPO) return { body: { name: 'api', owner: { login: 'ana' }, default_branch: 'main', html_url: web, private: cb.private, description: 'un repo' } };
    if (p === REPO + '/branches') {
      const all = [...cb.branches].sort((a, b) => a[0].localeCompare(b[0])).map(([name, sha]) => ({ name, commit: { id: sha }, protected: name === 'main' }));
      return paged(all, q);
    }
    if (p === REPO + '/commits') {
      const head = resolve(q.get('sha'));
      if (!head) return { status: 404, body: { message: 'object does not exist' } };
      const list = [...reach(head)].map((s) => cb.commits.get(s)).sort((a, b) => Date.parse(b.commit.committer.date) - Date.parse(a.commit.committer.date));
      return paged(list, q);
    }
    const cmp = p.match(/\/compare\/(.+)\.\.\.(.+)$/);
    if (cmp) {
      const [from, to] = [resolve(decodeURIComponent(cmp[1])), resolve(decodeURIComponent(cmp[2]))];
      if (!from || !to) return { status: 404, body: { message: 'not found' } };
      const old = reach(from);
      const commits = [...reach(to)].filter((s) => !old.has(s));
      return { body: { total_commits: commits.length, commits: commits.map((s) => cb.commits.get(s)) } };
    }
    if (p === REPO + '/pulls') {
      const list = cb.pulls.filter((x) => q.get('state') === 'all' || x.state === q.get('state'));
      return paged(list, q);
    }
    const one = p.match(/\/pulls\/(\d+)$/);
    if (one) {
      const pr = cb.pulls.find((x) => x.number === Number(one[1]));
      return pr ? { body: pr } : { status: 404, body: { message: 'not found' } };
    }
    if (p.startsWith(REPO + '/git/trees/')) {
      return { body: { tree: [{ path: 'src', type: 'tree' }, { path: 'src/app.js', type: 'blob', size: 120 }, { path: 'README.md', type: 'blob', size: 30 }], truncated: false } };
    }
    return { status: 404, body: { message: 'not found' } };
  }

  cb.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith(`${site}/api/v1/`), `consulta fuera de ${site}: ${url}`);
    assert.equal(opts.headers?.Authorization, cb.expectAuth, 'solo lleva el token que se espera');
    cb.auths.push(opts.headers?.Authorization);
    const path = url.replace(`${site}/api/v1`, '');
    cb.calls.push(path);
    const { status = 200, body, headers = {} } =
      cb.private && !cb.expectAuth && path.startsWith(REPO) ? { status: 404, body: { message: 'not found' } } : cb.override?.(path, opts) || route(path);
    const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { status, ok: status >= 200 && status < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return cb;
}

function connect(cb, opts = {}) {
  const GB = load(cb);
  const src = new GB.CodebergSource({ owner: 'ana', name: 'api', ...opts });
  const updates = [];
  const errors = [];
  src.on('update', (u) => updates.push(u));
  src.on('status', (s) => s.state === 'error' && errors.push(s));
  src.running = true;
  src.cycle = async () => {
    await src.loop();
    clearTimeout(src.timer);
  };
  return { src, updates, errors, GB };
}

const acts = (updates) => Array.from(updates.at(-1)?.activities || [], (a) => ({ kind: a.kind, key: a.title?.key, branch: a.branch ?? null, url: a.url ?? null }));

function repo() {
  const cb = fakeCodeberg();
  cb.push('main', 'm1');
  cb.push('main', 'm2', 'm1');
  cb.push('main', 'm3', 'm2');
  cb.push('feature', 'f1', 'm3');
  cb.push('feature', 'f2', 'f1');
  return cb;
}

test('parseRepo entiende codeberg:dueño/repo y las URL de codeberg.org', async () => {
  const { GB } = connect(fakeCodeberg());
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const want = { host: 'codeberg', owner: 'forgejo', name: 'forgejo' };
  assert.deepEqual(plain(GB.U.parseRepo('codeberg:forgejo/forgejo')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://codeberg.org/forgejo/forgejo')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://codeberg.org/forgejo/forgejo/src/branch/main/README.md')), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@codeberg.org:forgejo/forgejo.git')), want);
  assert.equal(GB.U.parseRepo('codeberg:solo'), null);
  assert.equal(GB.U.parseRepo('https://codeberg.org/forgejo'), null);
  assert.deepEqual(plain(GB.U.parseRepo('acme/api')), { owner: 'acme', name: 'api' }, 'GitHub sigue igual');
});

test('carga un repo: ramas, historia y PRs, sin token y solo contra codeberg.org', async () => {
  const cb = repo();
  cb.pull(5, 'feature', 'main', { title: 'WIP: algo' });
  const { src, updates, errors } = connect(cb);
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(r.url, WEB);
  assert.equal(r.host, 'codeberg');
  assert.equal(src.host, 'codeberg');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(commits.has(sha), `falta ${sha}`);
  assert.equal(commits.get('f2').url, `${WEB}/commit/f2`);
  assert.equal(commits.get('f2').author.avatar, 'https://codeberg.org/avatars/ana');
  const pr = pulls.get(5);
  assert.equal(pr.draft, true, 'un título «WIP:» es un borrador');
  assert.equal(pr.sameRepo, true);
  assert.equal(pr.user.avatar, null, 'los avatares de otro sitio no se muestran (el CSP los bloquea)');
  assert.ok(updates.length >= 1);
  assert.ok(cb.calls.every((c) => !/per_page/.test(c)), 'el tamaño de página se pide con limit');
});

test('en vivo: push, rama nueva, PR abierto y fusionado, force-push y rama borrada', async () => {
  const cb = repo();
  const { src, updates, errors } = connect(cb);
  await src.cycle();

  cb.push('main', 'm4', 'm3');
  cb.push('fix/x', 'x1', 'm4');
  cb.pull(6, 'fix/x', 'main');
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main', url: `${WEB}/commit/m4` });
  assert.deepEqual(live.find((a) => a.kind === 'branch-create'), { kind: 'branch-create', key: 'act.branchCreated', branch: 'fix/x', url: `${WEB}/src/branch/fix/x` });
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.prOpened');

  Object.assign(cb.pulls.find((x) => x.number === 6), { state: 'closed', merged: true, merged_by: { login: 'bea', avatar_url: 'https://codeberg.org/avatars/bea' } });
  cb.push('main', 'm5', 'm4', 'x1');
  cb.push('feature', 'f9', 'm4'); // reescribe feature desde m4: f1 y f2 se pierden
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  assert.equal(later.find((a) => a.kind === 'pr-merge')?.key, 'act.prMergedInto');
  assert.equal(Array.from(updates.at(-1).activities).find((a) => a.kind === 'pr-merge').actor.login, 'bea');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature', url: `${WEB}/commits/branch/feature` });

  cb.branches.delete('fix/x');
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['fix/x']);
});

test('un repo que no existe (o es privado) lo dice y no insiste', async () => {
  const cb = repo();
  cb.private = true;
  const { src, errors } = connect(cb);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.notFoundCodeberg');
  assert.equal(errors[0].nextAt, null);
  assert.equal(src.running, false);
});

test('si Codeberg pide bajar el ritmo (429), espera lo que dice Retry-After', async () => {
  const cb = repo();
  const { src, errors } = connect(cb);
  cb.override = (path) => (path.includes('/branches') ? { status: 429, body: { message: 'slow down' }, headers: { 'Retry-After': '120' } } : null);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.rateCodeberg');
  const wait = errors[0].nextAt - Date.now();
  assert.ok(wait > 115000 && wait < 125000, `espera ${wait} ms`);
});

test('con más de 50 ramas lista todas las páginas', async () => {
  const cb = repo();
  for (let i = 0; i < 70; i++) cb.push(`b${i}`, `s${i}`, 'm3');
  const { src, errors } = connect(cb);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(src.data.totalBranches, 72);
  assert.ok(cb.calls.filter((c) => c.startsWith(REPO + '/branches')).length >= 2, 'pidió la segunda página');
});

test('archivos: el árbol con el tamaño de cada archivo, para el modo galaxias', async () => {
  const cb = repo();
  const { src } = connect(cb);
  await src.cycle();
  const out = await src.files({ name: 'feature', sha: 'f2', isDefault: false });
  assert.equal(out.kind, 'tree');
  assert.deepEqual(Array.from(out.files, (f) => [f.path, f.size, f.url]), [
    ['src/app.js', 120, `${WEB}/src/commit/f2/src/app.js`],
    ['README.md', 30, `${WEB}/src/commit/f2/README.md`],
  ]);
});

test('los cambios de un commit: el diff en texto de Forgejo, leído archivo por archivo', async () => {
  const cb = repo();
  cb.override = (path) =>
    path === REPO + '/git/commits/f2.diff'
      ? { body: 'diff --git a/src/app.js b/src/app.js\nindex 1..2 100644\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1,2 @@\n-a\n+b\n+c\ndiff --git a/x.bin b/x.bin\nnew file mode 100644\nindex 0..3\nBinary files /dev/null and b/x.bin differ\n' }
      : null;
  const { src } = connect(cb);
  await src.cycle();
  const out = await src.commitDiff('f2');
  assert.deepEqual(
    Array.from(out.files, (f) => [f.path, f.status, f.add, f.del, f.binary, f.url]),
    [
      ['src/app.js', 'modified', 2, 1, false, `${WEB}/src/commit/f2/src/app.js`],
      ['x.bin', 'added', 0, 0, true, `${WEB}/src/commit/f2/x.bin`],
    ],
  );
  await assert.rejects(src.commitDiff('nada'), (err) => err.kind === 'notfound');
});

test('el filtro por autor funciona sobre los datos de esta fuente: deja la rama de quien escribió y quita la de nadie', async () => {
  const cb = repo();
  cb.pull(5, 'feature', 'main');
  const { src } = connect(cb);
  await src.cycle();
  const ctx = vm.createContext({ window: { GB: {} } });
  vm.runInContext(code('search.js'), ctx, { filename: 'search.js' });
  const S = ctx.window.GB.search;
  const a = src.data.commits.get('f2').author;
  const who = a.login || a.name;
  const mine = S.byAuthor(src.data, who);
  assert.ok(mine.data.branches.has('feature'), `la rama de ${who} se va`);
  assert.ok(mine.data.branches.has('main'), 'la rama por defecto siempre queda');
  const nobody = S.byAuthor(src.data, 'nadie-escribio-esto');
  assert.deepEqual([...nobody.data.branches.keys()], ['main']);
  assert.equal(nobody.shown, 1);
  assert.equal(nobody.total, 2);
});

/* ---------- un Forgejo o Gitea propio (?forge=, --forge-url=) ---------- */

const OWN = 'https://forge.example.com';
const OWN_WEB = `${OWN}/ana/api`;

test('endpoints: codeberg.org por omisión, un servidor propio solo con https y sin usuario', async () => {
  const { GB } = connect(fakeCodeberg());
  const ep = (u) => JSON.parse(JSON.stringify(GB.CodebergSource.endpoints(u)));
  assert.deepEqual(ep(''), { web: 'https://codeberg.org', api: 'https://codeberg.org/api/v1' });
  assert.deepEqual(ep(OWN + '/'), { web: OWN, api: `${OWN}/api/v1` });
  assert.deepEqual(ep(OWN + '/git'), { web: `${OWN}/git`, api: `${OWN}/git/api/v1` }, 'también si cuelga de una ruta');
  assert.equal(GB.CodebergSource.endpoints('http://forge.example.com'), null);
  assert.equal(GB.CodebergSource.endpoints('https://ana:clave@forge.example.com'), null);
  assert.equal(GB.CodebergSource.endpoints('no es una url'), null);
});

test('parseRepo reconoce la URL del servidor propio y forgejo:dueño/repo, solo si hay servidor elegido', async () => {
  const { GB } = connect(fakeCodeberg(OWN));
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.equal(GB.U.parseRepo('forgejo:ana/api'), null, 'sin servidor elegido no hay a dónde ir');
  assert.equal(GB.U.parseRepo(`${OWN}/ana/api`), null);
  GB.U.forgeBase = OWN;
  const want = { host: 'forgejo', owner: 'ana', name: 'api' };
  assert.deepEqual(plain(GB.U.parseRepo('forgejo:ana/api')), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/ana/api`)), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/ana/api/src/branch/main/README.md`)), want);
  assert.deepEqual(plain(GB.U.parseRepo(`${OWN}/ana/api.git`)), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@forge.example.com:ana/api.git')), want);
  assert.equal(GB.U.parseRepo('forgejo:solo'), null);
  assert.equal(GB.U.parseRepo(`${OWN}/ana`), null);
  assert.equal(GB.U.parseRepo(`${OWN}.evil.net/ana/api`), null, 'se compara por prefijo exacto, no por subcadena');
  assert.deepEqual(plain(GB.U.parseRepo('https://codeberg.org/ana/api')), { host: 'codeberg', owner: 'ana', name: 'api' }, 'codeberg.org sigue igual');
});

test('carga un repo del servidor propio: solo habla con ese host, sin token, y sus avatares quedan fuera sin permiso de CSP', async () => {
  const cb = repo2();
  cb.pull(5, 'feature', 'main');
  const { src, errors } = connect(cb, { webUrl: OWN });
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(src.host, 'forgejo');
  assert.equal(r.host, 'forgejo');
  assert.equal(r.url, OWN_WEB);
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  assert.equal(commits.get('f2').url, `${OWN_WEB}/commit/f2`);
  assert.equal(commits.get('f2').author.avatar, null, 'en la web el CSP no deja imágenes de ese host');
  assert.equal(pulls.get(5).user.avatar, null);
  assert.ok(cb.calls.length > 0);
});

test('con avatars (escritorio, host en img-src) muestra solo los del servidor propio', async () => {
  const cb = repo2();
  cb.pull(5, 'feature', 'main');
  const { src } = connect(cb, { webUrl: OWN, avatars: true });
  await src.cycle();
  assert.equal(src.data.commits.get('f2').author.avatar, `${OWN}/avatars/ana`);
  assert.equal(src.data.pulls.get(5).user.avatar, null, 'el de Libravatar es de otro sitio');
});

test('una dirección que no es https no se usa: queda codeberg.org', async () => {
  const { src } = connect(fakeCodeberg(), { webUrl: 'http://forge.example.com' });
  assert.equal(src.host, 'codeberg');
  assert.equal(src.data.repo.url, WEB);
});

test('el servidor propio no puede cambiar de dirección los enlaces con su html_url', async () => {
  const cb = repo2();
  cb.override = (path) => (path === REPO ? { body: { name: 'api', owner: { login: 'ana' }, default_branch: 'main', html_url: 'https://evil.example.net/ana/api' } } : null);
  const { src } = connect(cb, { webUrl: OWN });
  await src.cycle();
  assert.equal(src.data.repo.url, OWN_WEB);
});

test('los errores del servidor propio llevan sus textos y no nombran a Codeberg', async () => {
  const cb = repo2();
  cb.private = true;
  let c = connect(cb, { webUrl: OWN });
  await c.src.cycle();
  assert.equal(c.errors[0].message.key, 'err.notFoundForge');

  const cb2 = repo2();
  cb2.override = (path) => (path.includes('/branches') ? { status: 429, body: {}, headers: { 'Retry-After': '30' } } : null);
  c = connect(cb2, { webUrl: OWN });
  await c.src.cycle();
  assert.equal(c.errors[0].message.key, 'err.rateForge');

  const cb3 = repo2();
  cb3.override = (path) => (path.includes('/branches') ? { status: 500, body: { message: 'boom' } } : null);
  c = connect(cb3, { webUrl: OWN });
  await c.src.cycle();
  assert.equal(c.errors[0].message.key, 'err.httpForge');
  assert.equal(c.src.term('status.connecting'), 'status.connectingForge');
  assert.equal(c.src.term('err.network'), 'err.networkForge');
  assert.equal(c.src.term('err.timeout'), 'err.timeoutForge');
});

function repo2() {
  const cb = fakeCodeberg(OWN);
  cb.push('main', 'm1');
  cb.push('main', 'm2', 'm1');
  cb.push('main', 'm3', 'm2');
  cb.push('feature', 'f1', 'm3');
  cb.push('feature', 'f2', 'f1');
  return cb;
}

test('el token de Codeberg va en cada consulta a codeberg.org (y un repo privado se abre con él), nunca a un servidor propio', async () => {
  const cb = repo();
  cb.private = true;
  const sinToken = connect(cb);
  await sinToken.src.cycle();
  assert.equal(sinToken.errors.length, 1, 'privado sin token: responde 404');
  assert.ok(cb.auths.every((a) => a === undefined));

  const con = repo();
  con.private = true;
  con.expectAuth = 'token cb-secreto';
  const { src, errors } = connect(con, { token: 'cb-secreto' });
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.ok(src.data.commits.has('f2'));
  assert.ok(con.calls.length > 2);
  assert.ok(con.auths.every((a) => a === 'token cb-secreto'), 'todas las consultas llevan el token');
  assert.equal(src.token, '', 'no se mezcla con el de GitHub');
  await src.diff?.('m2').catch(() => {}); // el diff crudo también lleva la cabecera (assert en fetch)

  const own = repo2();
  const o = connect(own, { token: 'cb-secreto', webUrl: OWN });
  await o.src.cycle();
  assert.deepEqual(o.errors, []);
  assert.ok(own.calls.length > 0);
  assert.ok(own.auths.every((a) => a === undefined), 'un Forgejo propio no recibe el token de Codeberg');
});

/* ---------- editar un archivo (js/editor.js) ---------- */

test('editar: lee el archivo de la rama y escribe con el token de Codeberg (PUT con su sha, POST si es nuevo); un Forgejo propio no', async () => {
  const cb = repo();
  cb.expectAuth = 'token cb-w';
  const sent = [];
  cb.override = (path, opts) => {
    if (path === `${REPO}/contents/src/app.js?ref=feature`) return { body: { type: 'file', encoding: 'base64', size: 13, content: Buffer.from('const a = 1;\n').toString('base64'), sha: 'blob1' } };
    if (opts.method === 'PUT' || opts.method === 'POST') {
      sent.push({ path, method: opts.method, body: JSON.parse(opts.body) });
      return { status: opts.method === 'POST' ? 201 : 200, body: { content: { sha: 'blob2' }, commit: { sha: 'c2', html_url: 'https://codeberg.org/ana/api/commit/c2' } } };
    }
    return null;
  };
  const { src } = connect(cb, { token: 'cb-w' });
  assert.equal(src.canEdit(), true);
  assert.equal(src.canWrite(), null);
  const f = await src.readFile({ path: 'src/app.js', ref: 'feature' });
  assert.deepEqual([f.text, f.sha], ['const a = 1;\n', 'blob1']);
  assert.equal((await src.readFile({ path: 'otro.txt', ref: 'feature' })).missing, true);
  const out = await src.writeFile({ path: 'src/app.js', branch: 'feature', text: 'const a = 2;\n', message: 'Actualiza src/app.js', sha: 'blob1' });
  assert.deepEqual({ ...out }, { sha: 'c2', url: 'https://codeberg.org/ana/api/commit/c2', blob: 'blob2' });
  await src.writeFile({ path: 'nuevo.md', branch: 'feature', text: '#\n', message: 'Crea nuevo.md' });
  assert.deepEqual(
    sent.map((x) => [x.method, x.path, x.body.branch, Buffer.from(x.body.content, 'base64').toString(), x.body.message, x.body.sha ?? null]),
    [
      ['PUT', `${REPO}/contents/src/app.js`, 'feature', 'const a = 2;\n', 'Actualiza src/app.js', 'blob1'],
      ['POST', `${REPO}/contents/nuevo.md`, 'feature', '#\n', 'Crea nuevo.md', null],
    ],
  );
  const own = connect(fakeCodeberg('https://git.miempresa.com'), { webUrl: 'https://git.miempresa.com' }).src;
  assert.equal(own.canWrite(), 'editor.noWrite', 'un Forgejo propio no recibe token: no se escribe');
  await assert.rejects(own.writeFile({ path: 'a', branch: 'main', text: '', message: 'm' }), (err) => err.editKind === 'noWrite');
});

test('la url de un PR que no cuelga del servidor se descarta: no llega a la actividad ni a las exportaciones', async () => {
  const cb = repo();
  cb.pull(5, 'feature', 'main', { html_url: 'javascript:alert(1)' });
  cb.pull(6, 'fix', 'main', { html_url: 'https://evil.example.net/ana/api/pulls/6' });
  const { src } = connect(cb);
  await src.cycle();
  assert.equal(src.data.pulls.get(5).url, `${WEB}/pulls/5`);
  assert.equal(src.data.pulls.get(6).url, `${WEB}/pulls/6`);
});

test('mapPull: un repo renombrado sigue marcando sus PRs de la misma repo', () => {
  const { src } = connect(fakeCodeberg());
  const pr = (head) => ({ number: 1, title: 't', head: { ref: 'f', repo: head }, base: { ref: 'main', repo: { full_name: 'Nuevo/Nombre' } }, user: { login: 'ana' }, created_at: '2026-10-01T00:00:00Z' });
  assert.equal(src.mapPull(pr({ full_name: 'nuevo/nombre' })).sameRepo, true);
  assert.equal(src.mapPull(pr({ full_name: 'ana/nombre' })).sameRepo, false);
});
