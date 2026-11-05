#!/usr/bin/env node
/* Pruebas de la fuente de Bitbucket Cloud (js/sources/bitbucket.js) contra una API de bitbucket.org simulada.

     node --test                       todas las pruebas (archivos *.test.mjs)
     node tools/bitbucket.test.mjs     solo estas

   La API falsa sirve el repo ana/api como Bitbucket 2.0: páginas con `pagelen` y `next`, el listado
   de commits desde una cabeza (con `exclude`), PRs y el árbol de `src`. Un repo privado responde 404,
   ninguna consulta debe llevar un token salvo la prueba del token propio, y la fuente no debe pasar de su cuota por hora. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const API = 'https://api.bitbucket.org/2.0';
const REPO = '/repositories/ana/api';
const WEB = 'https://bitbucket.org/ana/api';

function load(bb) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    TextEncoder,
    TextDecoder,
    fetch: bb.fetch,
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
  vm.runInContext(code('sources/bitbucket.js'), ctx, { filename: 'sources/bitbucket.js' });
  return ctx.GB;
}

function fakeBitbucket() {
  const bb = { commits: new Map(), branches: new Map(), pulls: [], override: null, calls: [], auths: [], expectAuth: undefined, private: false };
  let n = 0;
  bb.commit = (hash, ...parents) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    bb.commits.set(hash, {
      type: 'commit',
      hash,
      date,
      message: `commit ${hash}\n`,
      parents: parents.map((p) => ({ hash: p })),
      author: { raw: 'Ana <ana@example.com>', user: { display_name: 'Ana Pérez', nickname: 'ana', links: { avatar: { href: 'https://secure.gravatar.com/avatar/x' } } } },
      links: { html: { href: `${WEB}/commits/${hash}` } },
    });
  };
  bb.push = (branch, hash, ...parents) => {
    bb.commit(hash, ...parents);
    bb.branches.set(branch, hash);
  };
  const reach = (hash) => {
    const out = new Set();
    const stack = [hash];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !bb.commits.has(s)) continue;
      out.add(s);
      stack.push(...bb.commits.get(s).parents.map((p) => p.hash));
    }
    return out;
  };
  const paged = (all, q, path) => {
    const len = Math.min(100, Number(q.get('pagelen') || 10));
    const page = Number(q.get('page') || 1);
    const body = { pagelen: len, page, size: all.length, values: all.slice((page - 1) * len, page * len) };
    if (page * len < all.length) {
      const next = new URLSearchParams(q);
      next.set('page', page + 1);
      body.next = `${API}${path}?${next}`;
    }
    return { body };
  };
  bb.pull = (id, head, base, more = {}) => {
    const p = {
      id,
      title: `PR ${id}`,
      state: 'OPEN',
      draft: false,
      links: { html: { href: `${WEB}/pull-requests/${id}` } },
      source: { branch: { name: head }, repository: { full_name: 'ana/api' } },
      destination: { branch: { name: base } },
      author: { display_name: 'Ana Pérez', nickname: 'ana', links: { avatar: { href: 'https://secure.gravatar.com/avatar/x' } } },
      created_on: new Date().toISOString(),
      closed_by: null,
      ...more,
    };
    bb.pulls.push(p);
    return p;
  };

  function route(path) {
    const u = new URL(API + path);
    const p = u.pathname.replace('/2.0', '');
    const q = u.searchParams;
    if (p === REPO) return { body: { slug: 'api', name: 'API', workspace: { slug: 'ana' }, mainbranch: { name: 'main' }, links: { html: { href: WEB } }, is_private: bb.private, description: 'un repo' } };
    if (p === REPO + '/refs/branches') {
      const all = [...bb.branches]
        .map(([name, hash]) => ({ name, target: { hash, date: bb.commits.get(hash).date } }))
        .sort((a, b) => Date.parse(b.target.date) - Date.parse(a.target.date));
      return paged(all, q, p);
    }
    const log = p.match(/^\/repositories\/ana\/api\/commits\/([^/]+)$/);
    if (log) {
      const head = decodeURIComponent(log[1]);
      if (!bb.commits.has(head)) return { status: 404, body: { type: 'error', error: { message: 'not found' } } };
      const skip = q.get('exclude') ? (bb.commits.has(q.get('exclude')) ? reach(q.get('exclude')) : null) : new Set();
      if (!skip) return { status: 404, body: { type: 'error', error: { message: 'not found' } } };
      const list = [...reach(head)].filter((s) => !skip.has(s)).map((s) => bb.commits.get(s)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      return paged(list, q, p);
    }
    if (p === REPO + '/pullrequests') {
      const open = q.get('state') === 'OPEN';
      return paged(bb.pulls.filter((x) => !open || x.state === 'OPEN'), q, p);
    }
    const one = p.match(/\/pullrequests\/(\d+)$/);
    if (one) {
      const pr = bb.pulls.find((x) => x.id === Number(one[1]));
      return pr ? { body: pr } : { status: 404, body: { type: 'error', error: { message: 'not found' } } };
    }
    if (p.startsWith(REPO + '/src/')) {
      const all = [
        { type: 'commit_directory', path: 'src' },
        { type: 'commit_file', path: 'src/app.js', size: 120 },
        { type: 'commit_file', path: 'README.md', size: 30 },
      ];
      return paged(all, q, p);
    }
    return { status: 404, body: { type: 'error', error: { message: 'not found' } } };
  }

  bb.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith(API + '/'), `consulta fuera de Bitbucket: ${url}`);
    assert.equal(opts.headers?.Authorization, bb.expectAuth, 'solo lleva el token que se espera');
    bb.auths.push(opts.headers?.Authorization);
    const path = url.slice(API.length);
    bb.calls.push(path);
    const { status = 200, body, headers = {} } =
      bb.private && !bb.expectAuth && path.startsWith(REPO) ? { status: 404, body: { type: 'error', error: { message: 'not found' } } } : bb.override?.(path) || route(path);
    const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { status, ok: status >= 200 && status < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return bb;
}

function connect(bb, opts = {}) {
  const GB = load(bb);
  const src = new GB.BitbucketSource({ owner: 'ana', name: 'api', ...opts });
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
  const bb = fakeBitbucket();
  bb.push('main', 'm1');
  bb.push('main', 'm2', 'm1');
  bb.push('main', 'm3', 'm2');
  bb.push('feature', 'f1', 'm3');
  bb.push('feature', 'f2', 'f1');
  return bb;
}

test('parseRepo entiende bitbucket:espacio/repo y las URL de bitbucket.org', async () => {
  const { GB } = connect(fakeBitbucket());
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const want = { host: 'bitbucket', owner: 'atlassian', name: 'aui' };
  assert.deepEqual(plain(GB.U.parseRepo('bitbucket:atlassian/aui')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://bitbucket.org/atlassian/aui')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://bitbucket.org/atlassian/aui/src/master/README.md')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://usuario@bitbucket.org/atlassian/aui.git')), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@bitbucket.org:atlassian/aui.git')), want);
  assert.equal(GB.U.parseRepo('bitbucket:solo'), null);
  assert.equal(GB.U.parseRepo('https://bitbucket.org/atlassian'), null);
  assert.deepEqual(plain(GB.U.parseRepo('acme/api')), { owner: 'acme', name: 'api' }, 'GitHub sigue igual');
});

test('carga un repo: ramas, historia y PRs, sin token y solo contra api.bitbucket.org', async () => {
  const bb = repo();
  bb.pull(5, 'feature', 'main', { draft: true });
  const { src, updates, errors } = connect(bb);
  await src.cycle();
  assert.deepEqual(errors, []);
  const { repo: r, branches, commits, pulls } = src.data;
  assert.equal(r.url, WEB);
  assert.equal(r.host, 'bitbucket');
  assert.equal(r.defaultBranch, 'main');
  assert.equal(src.host, 'bitbucket');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(commits.has(sha), `falta ${sha}`);
  const c = commits.get('f2');
  assert.equal(c.url, `${WEB}/commits/f2`);
  assert.deepEqual([c.author.name, c.author.login, c.author.avatar], ['Ana Pérez', 'ana', null], 'sin avatar: el CSP no admite sus hosts');
  assert.deepEqual([...c.parents], ['f1']);
  const pr = pulls.get(5);
  assert.equal(pr.draft, true);
  assert.equal(pr.sameRepo, true);
  assert.equal(pr.user.avatar, null);
  assert.equal(pr.url, `${WEB}/pull-requests/5`);
  assert.ok(updates.length >= 1);
  assert.ok(bb.calls.every((c) => !/per_page|limit=/.test(c)), 'el tamaño de página se pide con pagelen');
});

test('en vivo: push, rama nueva, PR abierto y fusionado, force-push y rama borrada', async () => {
  const bb = repo();
  const { src, updates, errors } = connect(bb);
  await src.cycle();

  bb.push('main', 'm4', 'm3');
  bb.push('fix/x', 'x1', 'm4');
  bb.pull(6, 'fix/x', 'main');
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main', url: `${WEB}/commits/m4` });
  assert.deepEqual(live.find((a) => a.kind === 'branch-create'), { kind: 'branch-create', key: 'act.branchCreated', branch: 'fix/x', url: `${WEB}/src/fix/x` });
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.prOpened');

  Object.assign(bb.pulls.find((x) => x.id === 6), { state: 'MERGED', closed_by: { display_name: 'Bea', nickname: 'bea' } });
  bb.push('main', 'm5', 'm4', 'x1');
  bb.push('feature', 'f9', 'm4'); // reescribe feature desde m4: f1 y f2 se pierden
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  assert.equal(later.find((a) => a.kind === 'pr-merge')?.key, 'act.prMergedInto');
  assert.equal(Array.from(updates.at(-1).activities).find((a) => a.kind === 'pr-merge').actor.login, 'bea');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature', url: `${WEB}/commits/branch/feature` });

  bb.branches.delete('fix/x');
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['fix/x']);
});

test('un PR rechazado cuenta como cerrado, no como fusionado', async () => {
  const bb = repo();
  bb.pull(7, 'feature', 'main');
  const { src, updates } = connect(bb);
  await src.cycle();
  Object.assign(bb.pulls[0], { state: 'DECLINED', closed_by: { display_name: 'Bea', nickname: 'bea' } });
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('pr-')).map((a) => a.kind), ['pr-close']);
});

test('un repo que no existe (o es privado) lo dice y no insiste', async () => {
  const bb = repo();
  bb.private = true;
  const { src, errors } = connect(bb);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.notFoundBitbucket');
  assert.equal(errors[0].nextAt, null);
  assert.equal(src.running, false);
});

test('si Bitbucket pide bajar el ritmo (429), espera y lo dice', async () => {
  const bb = repo();
  const { src, errors } = connect(bb);
  bb.override = (path) => (path.includes('/refs/branches') ? { status: 429, body: { type: 'error', error: { message: 'rate limit' } } } : null);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.rateBitbucket');
  const wait = errors[0].nextAt - Date.now();
  assert.ok(wait > 55000 && wait < 65000, `espera ${wait} ms`);
});

test('con más de 100 ramas sigue el next, hasta 300, y sabe cuántas hay', async () => {
  const bb = repo();
  for (let i = 0; i < 350; i++) bb.push(`b${i}`, `s${i}`, 'm3');
  const { src, errors } = connect(bb);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(bb.calls.filter((c) => c.startsWith(REPO + '/refs/branches')).length, 3, 'tres páginas y no más');
  assert.equal(src.data.totalBranches, 352, 'el total sale de «size» de la respuesta');
  assert.equal(src.data.totalExact, false);
});

test('la cuota: en una hora no pasa de lo que Bitbucket deja sin token, y espacia los ciclos', async () => {
  const bb = repo();
  for (let i = 0; i < 80; i++) bb.push(`b${i}`, `s${i}`, 'm3'); // 82 ramas, cada una con su historia por pedir
  const { src, errors } = connect(bb);
  await src.cycle();
  assert.deepEqual(errors, []);
  for (let i = 0; i < 5 && src.more; i++) await src.cycle(); // la carga sigue de seguido mientras haya cuota para ella
  assert.ok(bb.calls.length <= 29, `gastó ${bb.calls.length} consultas cargando historia: más del 60 % de la cuota`);
  assert.equal(src.restBudget(), 0, 'la historia que falta espera a que la cuota vuelva');
  assert.ok(src.data.pending > 0, 'quedan ramas por cargar');
  assert.equal(src.more, false, 'sin cuota para cargar, no se sigue de seguido');
  assert.ok(src.nextDelay() >= 90000, 'un ciclo nunca va más seguido que cada 90 s');
  assert.ok(src.used() < 48 - 2, 'queda cuota para los ciclos en vivo');
  const before = bb.calls.length;
  src.lastPoll.branches = 0;
  await src.cycle();
  assert.ok(bb.calls.length - before <= 3, 'un ciclo en vivo cuesta la lista de ramas y los PRs, y nada de historia');
  // con otros repos de Bitbucket abiertos, cada uno cuida su parte
  src.share = 3;
  assert.equal(src.quota(), 16);
});

test('archivos: el árbol con el tamaño de cada archivo, para el modo galaxias', async () => {
  const bb = repo();
  const { src } = connect(bb);
  await src.cycle();
  const out = await src.files({ name: 'feature', sha: 'f2', isDefault: false });
  assert.equal(out.kind, 'tree');
  assert.equal(out.truncated, false);
  assert.deepEqual(Array.from(out.files, (f) => [f.path, f.size, f.url]), [
    ['src/app.js', 120, `${WEB}/src/f2/src/app.js`],
    ['README.md', 30, `${WEB}/src/f2/README.md`],
  ]);
});

test('los cambios de un commit: el diff en texto de Bitbucket, que cuenta en la cuota y no adelanta vecinos', async () => {
  const bb = repo();
  bb.override = (path) =>
    path === REPO + '/diff/f2'
      ? { body: 'diff --git a/src/app.js b/src/app.js\nindex 1..2 100644\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1,2 @@\n-a\n+b\n+c\ndiff --git a/viejo.txt b/viejo.txt\ndeleted file mode 100644\nindex 3..0\n--- a/viejo.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n' }
      : null;
  const { src } = connect(bb);
  await src.cycle();
  const before = src.used();
  const out = await src.commitDiff('f2');
  assert.equal(src.used(), before + 1, 'la consulta cuenta en las 60 de la hora');
  assert.deepEqual(
    Array.from(out.files, (f) => [f.path, f.status, f.add, f.del, f.url]),
    [
      ['src/app.js', 'modified', 2, 1, `${WEB}/src/f2/src/app.js`],
      ['viejo.txt', 'removed', 0, 1, null],
    ],
  );
  assert.equal(src.diffCheap(), false);
  await assert.rejects(src.commitDiff('nada'), (err) => err.kind === 'notfound');
});

test('el filtro por autor funciona sobre los datos de esta fuente: deja la rama de quien escribió y quita la de nadie', async () => {
  const bb = repo();
  bb.pull(5, 'feature', 'main');
  const { src } = connect(bb);
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

test('el token de Bitbucket va en cada consulta a api.bitbucket.org y un repo privado se abre con él', async () => {
  const bb = repo();
  bb.private = true;
  const sin = connect(bb);
  await sin.src.cycle();
  assert.equal(sin.errors.length, 1, 'privado sin token: responde 404');
  assert.ok(bb.auths.every((a) => a === undefined));

  const con = repo();
  con.private = true;
  con.expectAuth = 'Bearer bb-secreto';
  const { src, errors } = connect(con, { token: 'bb-secreto' });
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.ok(src.data.commits.has('f2'));
  assert.ok(con.calls.length > 2);
  assert.ok(con.auths.every((a) => a === 'Bearer bb-secreto'), 'todas las consultas llevan el token');
  assert.equal(src.token, '', 'no se mezcla con el de GitHub');
});

test('los enlaces que no cuelgan de bitbucket.org (PR, commit) se descartan y se arman a mano', async () => {
  const bb = repo();
  bb.pull(5, 'feature', 'main', { links: { html: { href: 'javascript:alert(1)' } } });
  bb.pull(6, 'fix', 'main', { links: { html: { href: 'https://evil.example.net/pull-requests/6' } } });
  bb.commits.get('f2').links = { html: { href: 'data:text/html,x' } };
  const { src } = connect(bb);
  await src.cycle();
  assert.equal(src.data.pulls.get(5).url, `${WEB}/pull-requests/5`);
  assert.equal(src.data.pulls.get(6).url, `${WEB}/pull-requests/6`);
  assert.equal(src.data.commits.get('f2').url, `${WEB}/commits/f2`);
});

test('mapPull: un repo renombrado sigue marcando sus PRs de la misma repo', () => {
  const { src } = connect(fakeBitbucket());
  const pr = (from) => ({ id: 1, title: 't', source: { branch: { name: 'f' }, repository: { full_name: from } }, destination: { branch: { name: 'main' }, repository: { full_name: 'Nuevo/Nombre' } }, author: { display_name: 'ana' }, created_on: '2026-10-01T00:00:00Z' });
  assert.equal(src.mapPull(pr('nuevo/nombre')).sameRepo, true);
  assert.equal(src.mapPull(pr('ana/nombre')).sameRepo, false);
});
