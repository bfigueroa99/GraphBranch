#!/usr/bin/env node
/* Pruebas de la fuente de GitLab (js/sources/gitlab.js) contra una API de gitlab.com simulada.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/gitlab.test.mjs     solo estas

   La API falsa sirve el proyecto g/sub/p (con subgrupo) con ETag, pagina las ramas como GitLab
   (X-Next-Page, las actualizadas más recientemente primero) y, como gitlab.com sin token, responde
   el listado de commits con el desafío de Cloudflare: la fuente nunca debe usarlo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');
const PROJECT = '/projects/g%2Fsub%2Fp';
const WEB = 'https://gitlab.com/g/sub/p';

/** Carga util.js, github.js y gitlab.js en un contexto aislado cuyo `fetch` es el de la API falsa. */
function load(gl) {
  const ctx = vm.createContext({
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
    fetch: gl.fetch,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
  });
  ctx.window = ctx;
  vm.runInContext(code('util.js'), ctx, { filename: 'util.js' });
  vm.runInContext(
    `GB.i18n = { msg: (k, p) => ({ key: k, params: p }), text: (m) => (m && m.key) || String(m ?? ''),
       timeAgo: () => '', fmtNum: String, fmtDate: String, fmtDateTime: String };`,
    ctx,
  );
  vm.runInContext(code('sources/github.js'), ctx, { filename: 'sources/github.js' });
  vm.runInContext(code('sources/gitlab.js'), ctx, { filename: 'sources/gitlab.js' });
  return ctx.GB;
}

function fakeGitLab() {
  const gl = {
    commits: new Map(), // sha -> { id, parent_ids, … } como los da la API
    branches: new Map(), // nombre -> sha
    updated: new Map(), // nombre -> cuándo se movió (para ordenar como sort=updated_desc)
    mrs: [], // como los da la API
    override: null, // (ruta) => { status, body } para responder otra cosa
    calls: [],
    misses: [], // consultas que respondieron 404 (el navegador las anota como errores en la consola)
  };
  let n = 0;
  gl.commit = (sha, ...parents) => {
    const date = new Date(Date.UTC(2026, 0, 1) + ++n * 60000).toISOString();
    gl.commits.set(sha, {
      id: sha,
      short_id: sha.slice(0, 8),
      parent_ids: parents,
      title: `commit ${sha}`,
      message: `commit ${sha}\n`,
      author_name: 'Ana',
      committed_date: date,
      web_url: `${WEB}/-/commit/${sha}`,
    });
  };
  gl.push = (branch, sha, ...parents) => {
    gl.commit(sha, ...parents);
    gl.branches.set(branch, sha);
    gl.updated.set(branch, ++n);
  };
  /** Todo lo que se alcanza desde `sha` siguiendo a los padres. */
  const reach = (sha) => {
    const out = new Set();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop();
      if (!s || out.has(s) || !gl.commits.has(s)) continue;
      out.add(s);
      stack.push(...gl.commits.get(s).parent_ids);
    }
    return out;
  };
  /** Un nombre, sha o `sha~N` (N pasos por el primer padre); null si no existe. */
  const resolve = (ref) => {
    const m = /^(.+?)(?:~(\d+))?$/.exec(ref);
    let sha = gl.branches.get(m[1]) || m[1];
    for (let i = 0; i < Number(m[2] || 0) && sha; i++) sha = gl.commits.get(sha)?.parent_ids[0];
    return sha && gl.commits.has(sha) ? sha : null;
  };

  function route(path) {
    const u = new URL('https://gitlab.com/api/v4' + path);
    const p = u.pathname.replace('/api/v4', '');
    const q = u.searchParams;
    if (p === PROJECT) return { body: { id: 7, path_with_namespace: 'g/sub/p', default_branch: 'main', web_url: WEB, visibility: 'public', description: 'un proyecto' } };
    if (p === PROJECT + '/repository/branches') {
      const all = [...gl.branches]
        .sort((a, b) => gl.updated.get(b[0]) - gl.updated.get(a[0]))
        .map(([name, sha]) => ({ name, commit: gl.commits.get(sha), protected: name === 'main', default: name === 'main' }));
      const per = Number(q.get('per_page'));
      const page = Number(q.get('page') || 1);
      const headers = { 'X-Total': all.length, 'X-Next-Page': page * per < all.length ? page + 1 : '' };
      return { body: all.slice((page - 1) * per, page * per), headers };
    }
    if (p === PROJECT + '/repository/commits') {
      return { status: 403, text: '<!DOCTYPE html><title>Just a moment...</title>' }; // Cloudflare, sin token
    }
    const seq = p.match(/\/repository\/commits\/([^/]+)\/sequence$/);
    if (seq) {
      // los commits por el primer padre desde la raíz hasta ese, contándolo
      let sha = resolve(decodeURIComponent(seq[1]));
      if (!sha) return { status: 404, body: { message: '404 Commit Not Found' } };
      let count = 0;
      for (; sha; sha = gl.commits.get(sha)?.parent_ids[0]) count++;
      return { body: { count } };
    }
    const one = p.match(/\/repository\/commits\/([^/]+)$/);
    if (one) {
      const sha = resolve(decodeURIComponent(one[1]));
      return sha ? { body: gl.commits.get(sha) } : { status: 404, body: { message: '404 Commit Not Found' } };
    }
    if (p === PROJECT + '/repository/compare') {
      const from = resolve(q.get('from'));
      const to = resolve(q.get('to'));
      if (!from || !to) return { status: 404, body: { message: '404 Not found' } };
      const old = reach(from);
      const commits = [...reach(to)].filter((s) => !old.has(s)).map((s) => gl.commits.get(s));
      commits.sort((a, b) => Date.parse(a.committed_date) - Date.parse(b.committed_date)); // los más viejos primero, como GitLab
      const diffs = [{ new_path: 'src/app.js', old_path: 'src/app.js', new_file: false, deleted_file: false, renamed_file: false, diff: '@@ -1,2 +1,3 @@\n-a\n+b\n+c\n d\n' }];
      return { body: { commit: gl.commits.get(to), commits, diffs, compare_timeout: false } };
    }
    if (p === PROJECT + '/repository/merge_base') {
      const [a, b] = q.getAll('refs[]').map(resolve);
      const other = reach(b);
      const base = [...reach(a)].filter((s) => other.has(s)).sort((x, y) => Date.parse(gl.commits.get(y).committed_date) - Date.parse(gl.commits.get(x).committed_date))[0];
      return base ? { body: { id: base } } : { status: 404, body: { message: '404 Not found' } };
    }
    if (p === PROJECT + '/merge_requests') {
      const state = q.get('state');
      const list = gl.mrs.filter((m) => state === 'all' || m.state === state).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      return { body: list.slice(0, Number(q.get('per_page'))) };
    }
    return { status: 404, body: { message: '404 Not Found' } };
  }

  gl.mr = (iid, source, target, more = {}) => {
    const m = {
      iid,
      title: `MR ${iid}`,
      source_branch: source,
      target_branch: target,
      source_project_id: 7,
      target_project_id: 7,
      web_url: `${WEB}/-/merge_requests/${iid}`,
      draft: false,
      state: 'opened',
      author: { username: 'ana', name: 'Ana', avatar_url: 'https://secure.gravatar.com/avatar/x' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...more,
    };
    gl.mrs.push(m);
    return m;
  };

  gl.fetch = async (url, opts = {}) => {
    assert.ok(url.startsWith('https://gitlab.com/api/v4/'), `consulta fuera de GitLab: ${url}`);
    assert.equal(opts.headers?.Authorization, undefined, 'sin token: nada de Authorization');
    const path = url.replace('https://gitlab.com/api/v4', '');
    gl.calls.push(path);
    const { status = 200, body, text, headers = {} } = gl.override?.(path) || route(path);
    if (status === 404) gl.misses.push(path);
    const json = text ?? JSON.stringify(body);
    const etag = `W/"${json.length}-${[...json].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)}"`;
    const inm = opts.headers?.['If-None-Match'];
    const res = (st, b, h) => {
      const hs = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
      return { status: st, ok: st >= 200 && st < 300, statusText: '', headers: { get: (k) => hs.get(k.toLowerCase()) || null }, text: async () => b };
    };
    if (status === 200 && inm === etag) return res(304, '', headers);
    return res(status, json, status === 200 ? { ...headers, ETag: etag } : headers);
  };
  return gl;
}

/** Fuente conectada a la API falsa; `cycle()` corre un ciclo de sondeo completo. */
function connect(gl, opts = {}) {
  const GB = load(gl);
  const src = new GB.GitLabSource({ path: 'g/sub/p', ...opts });
  const updates = [];
  const errors = [];
  src.on('update', (u) => updates.push(u));
  src.on('status', (s) => s.state === 'error' && errors.push(s));
  src.running = true;
  src.cycle = async () => {
    await src.loop();
    clearTimeout(src.timer);
  };
  return { src, updates, errors };
}

/** Las actividades de la última actualización, sin lo que es del contexto aislado. */
const acts = (updates) =>
  Array.from(updates.at(-1)?.activities || [], (a) => ({ kind: a.kind, key: a.title?.key, branch: a.branch ?? null, url: a.url ?? null }));

/** main con historia, y feature que sale de ella con dos commits propios. */
function project() {
  const gl = fakeGitLab();
  gl.push('main', 'm1');
  gl.push('main', 'm2', 'm1');
  gl.push('main', 'm3', 'm2');
  gl.push('feature', 'f1', 'm3');
  gl.push('feature', 'f2', 'f1');
  return gl;
}

test('carga un proyecto con subgrupos: ramas, historia y MRs, sin el listado de commits bloqueado', async () => {
  const gl = project();
  gl.mr(5, 'feature', 'main', { draft: true });
  const { src, updates, errors } = connect(gl);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(updates.length, 1);
  const { repo, branches, commits, pulls } = src.data;
  assert.equal(`${repo.owner}/${repo.name}`, 'g/sub/p');
  assert.equal(repo.url, WEB);
  assert.equal(repo.host, 'gitlab');
  assert.deepEqual([...branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(commits.has(sha), `falta ${sha}`);
  assert.deepEqual(Array.from(commits.get('f1').parents), ['m3'], 'la rama queda unida a la rama por defecto');
  assert.equal(commits.get('f2').url, `${WEB}/-/commit/f2`);
  const mr = pulls.get(5);
  assert.equal(mr.mr, true);
  assert.equal(mr.draft, true);
  assert.equal(mr.head, 'feature');
  assert.equal(mr.user.avatar, null, 'los avatares de Gravatar no se muestran (el CSP los bloquea)');
  assert.ok(!gl.calls.some((c) => c.startsWith(PROJECT + '/repository/commits?')), 'usó el listado de commits');
});

test('en vivo: push, rama nueva, MR abierta y fusionada, force-push y rama borrada', async () => {
  const gl = project();
  const { src, updates, errors } = connect(gl);
  await src.cycle();

  gl.push('main', 'm4', 'm3');
  gl.push('fix/x', 'x1', 'm4');
  gl.mr(6, 'fix/x', 'main');
  src.lastPoll.pulls = 0;
  await src.cycle();
  assert.deepEqual(errors, []);
  const live = acts(updates);
  assert.deepEqual(live.find((a) => a.kind === 'push'), { kind: 'push', key: 'act.pushNew', branch: 'main', url: `${WEB}/-/commit/m4` });
  assert.deepEqual(live.find((a) => a.kind === 'branch-create'), { kind: 'branch-create', key: 'act.branchCreated', branch: 'fix/x', url: `${WEB}/-/tree/fix/x` });
  assert.equal(live.find((a) => a.kind === 'pr-open')?.key, 'act.mrOpened');

  // la MR se fusiona: deja de estar abierta y en la lista de todas aparece fusionada
  Object.assign(gl.mrs.find((m) => m.iid === 6), { state: 'merged', merged_by: { username: 'bea', name: 'Bea', avatar_url: 'https://gitlab.com/uploads/bea.png' }, updated_at: new Date(Date.now() + 1000).toISOString() });
  gl.push('main', 'm5', 'm4', 'x1');
  // y alguien reescribe feature desde m4
  gl.push('feature', 'f9', 'm4');
  src.lastPoll.pulls = 0;
  await src.cycle();
  const later = acts(updates);
  const merged = later.find((a) => a.kind === 'pr-merge');
  assert.equal(merged?.key, 'act.mrMergedInto');
  assert.equal(Array.from(updates.at(-1).activities).find((a) => a.kind === 'pr-merge').actor.avatar, 'https://gitlab.com/uploads/bea.png');
  assert.equal(later.find((a) => a.kind === 'merge')?.branch, 'main');
  assert.deepEqual(later.find((a) => a.kind === 'force'), { kind: 'force', key: 'act.force', branch: 'feature', url: `${WEB}/-/commits/feature` });

  gl.branches.delete('fix/x');
  await src.cycle();
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['fix/x']);
  assert.ok(!gl.calls.some((c) => c.startsWith(PROJECT + '/repository/commits?')));
});

test('un proyecto que no existe (o es privado) lo dice y no insiste', async () => {
  const gl = fakeGitLab();
  gl.override = (path) => (path === PROJECT ? { status: 404, body: { message: '404 Project Not Found' } } : null);
  const { src, errors } = connect(gl);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.notFoundGitlab');
  assert.equal(errors[0].nextAt, null);
  assert.equal(src.running, false);
});

test('si GitLab pide bajar el ritmo (429), espera un minuto', async () => {
  const gl = project();
  const { src, errors } = connect(gl);
  gl.override = (path) => (path.includes('/repository/branches') ? { status: 429, body: { message: 'Retry later' } } : null);
  await src.cycle();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.key, 'err.rateGitlab');
  const wait = errors[0].nextAt - Date.now();
  assert.ok(wait > 55000 && wait < 70000, `espera ${wait} ms`);
});

test('una historia más corta que la profundidad también carga', async () => {
  const gl = fakeGitLab();
  gl.push('main', 'a1');
  gl.push('main', 'a2', 'a1');
  const { src, errors } = connect(gl);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.ok(src.data.branches.has('main'));
  assert.ok(src.data.commits.has('a1') && src.data.commits.has('a2'));
  assert.deepEqual(gl.misses, [], 'no pide pasos que no existen');
});

test('con más de 100 ramas: la primera página en cada ciclo, y el listado entero cada tanto', async () => {
  const gl = project();
  for (let i = 0; i < 130; i++) gl.push(`topic/${i}`, `t${i}`, 'm3');
  const { src, updates } = connect(gl, { filter: 'topic/1' }); // solo algunas, para no traer 130 historias
  await src.cycle();
  const pages = (from) => gl.calls.slice(from).filter((c) => c.includes('/repository/branches')).map((c) => new URL('http://x' + c).searchParams.get('page'));
  assert.deepEqual(pages(0), ['1', '2']);
  assert.equal(src.data.totalBranches, 132);

  // la rama más vieja (en la segunda página) se borra: entre listados enteros todavía no se nota
  gl.branches.delete('topic/1');
  let from = gl.calls.length;
  await src.cycle();
  assert.deepEqual(pages(from), ['1']);
  assert.ok(src.data.branches.has('topic/1'));

  src.fullAt = Date.now() - 4 * 60000; // pasó el tiempo: toca el listado entero
  from = gl.calls.length;
  await src.cycle();
  assert.deepEqual(pages(from), ['1', '2']);
  assert.ok(!src.data.branches.has('topic/1'));
  assert.deepEqual(acts(updates).filter((a) => a.kind.startsWith('branch-delete')).map((a) => a.branch), ['topic/1']);
});

test('archivos: lo que cambió cada rama, con sus líneas, para el modo galaxias', async () => {
  const gl = project();
  const { src } = connect(gl);
  await src.cycle();
  const out = await src.files({ name: 'feature', sha: 'f2', isDefault: false });
  assert.equal(out.kind, 'diff');
  assert.equal(out.base, 'main');
  assert.deepEqual(JSON.parse(JSON.stringify(out.files)), [{ path: 'src/app.js', status: 'modified', add: 2, del: 1, from: null, url: `${WEB}/-/blob/f2/src/app.js` }]);
});
