#!/usr/bin/env node
/* Pruebas de la fuente de GitLab (js/sources/gitlab.js) contra una API de gitlab.com simulada.

     node --test                    todas las pruebas (archivos *.test.mjs)
     node tools/gitlab.test.mjs     solo estas

   La API falsa sirve el proyecto g/sub/p (con subgrupo) con ETag, pagina las ramas como GitLab
   (X-Next-Page, las actualizadas más recientemente primero) y, como gitlab.com sin token, responde
   el listado de commits con el desafío de Cloudflare: la fuente nunca debe usarlo. Como gitlab.com,
   un proyecto privado responde 404 sin token, un token que no existe da 401 y uno sin el permiso
   read_api, 403 (insufficient_scope). */
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
    TextEncoder,
    TextDecoder,
    fetch: gl.fetch,
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
  vm.runInContext(code('sources/gitlab.js'), ctx, { filename: 'sources/gitlab.js' });
  return ctx.GB;
}

function fakeGitLab(web = 'https://gitlab.com') {
  const gl = {
    web, // la dirección de la instancia: gitlab.com o una propia
    commits: new Map(), // sha -> { id, parent_ids, … } como los da la API
    branches: new Map(), // nombre -> sha
    updated: new Map(), // nombre -> cuándo se movió (para ordenar como sort=updated_desc)
    mrs: [], // como los da la API
    events: [], // los eventos del proyecto, del más antiguo al más nuevo
    override: null, // (ruta) => { status, body } para responder otra cosa
    calls: [],
    misses: [], // consultas que respondieron 404 (el navegador las anota como errores en la consola)
    visibility: 'public',
    tokens: new Map(), // token -> sus permisos
    expect: null, // el token que tiene que llevar cada consulta (null: ninguno)
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
    const u = new URL(gl.web + '/api/v4' + path);
    const p = u.pathname.replace(new URL(gl.web).pathname.replace(/\/$/, '') + '/api/v4', '');
    const q = u.searchParams;
    if (p === PROJECT) return { body: { id: 7, path_with_namespace: 'g/sub/p', default_branch: 'main', web_url: gl.web + '/g/sub/p', visibility: gl.visibility, description: 'un proyecto' } };
    const grp = p.match(/^\/groups\/([^/]+)\/projects$/);
    if (grp) {
      const g = decodeURIComponent(grp[1]);
      if (!gl.groups?.[g]) return { status: 404, body: { message: '404 Group Not Found' } };
      gl.groupQuery = q.toString();
      return { body: gl.groups[g] };
    }
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
    if (p === PROJECT + '/events') return { body: [...gl.events].reverse().slice(0, Number(q.get('per_page'))) }; // los más nuevos primero
    return { status: 404, body: { message: '404 Not Found' } };
  }

  /** Un evento del proyecto como lo da /events; `more` pisa campos. */
  gl.event = (more) => {
    const id = gl.events.length + 100;
    gl.events.push({
      id,
      created_at: new Date().toISOString(),
      author: { username: 'ana', name: 'Ana', avatar_url: 'https://gitlab.com/uploads/ana.png' },
      ...more,
    });
    return id;
  };

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
    assert.ok(url.startsWith(gl.web + '/api/v4/'), `consulta fuera de GitLab: ${url}`);
    const auth = opts.headers?.Authorization;
    assert.equal(auth, gl.expect ? `Bearer ${gl.expect}` : undefined, 'el token va en cada consulta, y solo si hay uno');
    const path = url.replace(gl.web + '/api/v4', '');
    gl.calls.push(path);
    const scopes = auth ? gl.tokens.get(auth.slice(7)) : null;
    const { status = 200, body, text, headers = {} } =
      auth && !scopes
        ? { status: 401, body: { message: '401 Unauthorized' } }
        : scopes && !scopes.some((sc) => sc === 'api' || sc === 'read_api')
          ? { status: 403, body: { error: 'insufficient_scope', error_description: 'The request requires higher privileges than provided by the access token.', scope: 'api read_api' } }
          : !scopes && gl.visibility !== 'public' && path.startsWith(PROJECT)
            ? { status: 404, body: { message: '404 Project Not Found' } }
            : gl.override?.(path) || route(path);
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

test('con un token, un proyecto privado carga, y el token va en cada consulta', async () => {
  const gl = project();
  gl.visibility = 'private';
  gl.mr(5, 'feature', 'main');
  // sin token, gitlab.com lo esconde: 404, como un proyecto que no existe
  let { src, errors } = connect(gl);
  await src.cycle();
  assert.equal(errors[0]?.message.key, 'err.notFoundGitlab');

  gl.tokens.set('glpat-bueno', ['read_api']);
  gl.expect = 'glpat-bueno';
  gl.calls.length = 0;
  ({ src, errors } = connect(gl, { token: 'glpat-bueno' }));
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.equal(src.data.repo.private, true);
  assert.deepEqual([...src.data.branches.keys()].sort(), ['feature', 'main']);
  for (const sha of ['m1', 'm2', 'm3', 'f1', 'f2']) assert.ok(src.data.commits.has(sha), `falta ${sha}`);
  assert.ok(src.data.pulls.has(5));
  assert.ok(gl.calls.length > 4);
  assert.equal(src.token, '', 'el token de GitLab no ocupa el lugar del de GitHub');
});

test('un token que no vale, o sin el permiso read_api, lo dice y no insiste', async () => {
  for (const [token, scopes] of [['glpat-viejo', null], ['glpat-corto', ['read_user']]]) {
    const gl = project();
    if (scopes) gl.tokens.set(token, scopes);
    gl.expect = token;
    const { src, errors } = connect(gl, { token });
    await src.cycle();
    assert.equal(errors.length, 1, token);
    assert.equal(errors[0].message.key, 'err.authGitlab', token);
    assert.equal(errors[0].nextAt, null, token);
    assert.equal(src.running, false, token);
  }
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

test('eventos del proyecto: issues, comentarios y tags al panel, sin repetir lo que ya ven las ramas y las MRs', async () => {
  const gl = project();
  gl.event({ action_name: 'opened', target_type: 'Issue', target_iid: 3, target_title: 'Se rompe' });
  gl.event({ action_name: 'pushed to', push_data: { ref_type: 'branch', ref: 'main', action: 'pushed', commit_count: 2 } });
  gl.event({ action_name: 'opened', target_type: 'MergeRequest', target_iid: 5, target_title: 'MR 5' });
  gl.event({ action_name: 'pushed new', push_data: { ref_type: 'tag', ref: 'v1.0', action: 'created' } });
  const { src, updates, errors } = connect(gl);
  await src.cycle();
  assert.deepEqual(errors, []);
  const first = Array.from(updates[0].activities, (a) => ({ kind: a.kind, key: a.title?.key, url: a.url ?? null, login: a.actor?.login }));
  assert.deepEqual(
    first.filter((a) => ['issue-open', 'tag'].includes(a.kind)),
    [
      { kind: 'issue-open', key: 'act.issueOpened', url: `${WEB}/-/issues/3`, login: 'ana' },
      { kind: 'tag', key: 'act.tagCreated', url: `${WEB}/-/tags/v1.0`, login: 'ana' },
    ],
    'el historial del feed, de más antiguo a más nuevo',
  );
  assert.ok(!first.some((a) => a.kind === 'push' || a.kind === 'pr-open'), 'pushes y MRs son de la comparación, no del feed');
  assert.equal(Array.from(updates[0].activities).find((a) => a.kind === 'issue-open').actor.avatar, 'https://gitlab.com/uploads/ana.png');

  // un ciclo sin que venza el feed no lo consulta; al vencer, solo lo nuevo
  const calls = () => gl.calls.filter((c) => c.startsWith(PROJECT + '/events')).length;
  await src.cycle();
  assert.equal(calls(), 1);
  gl.event({ action_name: 'commented on', target_type: 'Note', target_id: 900, note: { noteable_type: 'MergeRequest', noteable_iid: 5, body: 'Se ve bien\nresto' } });
  gl.event({ action_name: 'commented on', target_type: 'Note', target_id: 901, note: { noteable_type: 'Issue', noteable_iid: 3, body: 'Ya lo vi' } });
  gl.event({ action_name: 'approved', target_type: 'MergeRequest', target_iid: 5, target_title: 'MR 5' });
  gl.event({ action_name: 'closed', target_type: 'Issue', target_iid: 3, target_title: 'Se rompe' });
  gl.event({ action_name: 'created', target_type: 'Milestone', target_title: 'v2' });
  src.lastPoll.events = 0;
  await src.cycle();
  assert.equal(calls(), 2);
  const live = Array.from(updates.at(-1).activities, (a) => ({ kind: a.kind, key: a.title?.key, url: a.url ?? null, detail: a.detail ?? null }));
  assert.deepEqual(live, [
    { kind: 'comment', key: 'act.commentMr', url: `${WEB}/-/merge_requests/5#note_900`, detail: 'Se ve bien' },
    { kind: 'comment', key: 'act.commentIssue', url: `${WEB}/-/issues/3#note_901`, detail: 'Ya lo vi' },
    { kind: 'review-ok', key: 'act.mrApproved', url: `${WEB}/-/merge_requests/5`, detail: 'MR 5' },
    { kind: 'issue-close', key: 'act.issueClosed', url: `${WEB}/-/issues/3`, detail: 'Se rompe' },
  ]);
  src.lastPoll.events = 0;
  await src.cycle();
  assert.equal(updates.at(-1).activities.length, 0, 'lo ya visto no vuelve');
});

test('eventos: si el feed no se puede leer, el resto del ciclo sigue; un 429 sí se respeta', async () => {
  const gl = project();
  gl.override = (path) => (path.startsWith(PROJECT + '/events') ? { status: 500, body: { message: '500 Internal Server Error' } } : null);
  const { src, updates, errors } = connect(gl);
  await src.cycle();
  assert.deepEqual(errors, []);
  assert.deepEqual([...src.data.branches.keys()].sort(), ['feature', 'main']);
  assert.equal(updates.length, 1);
  gl.override = (path) => (path.startsWith(PROJECT + '/events') ? { status: 429, body: { message: 'Retry later' } } : null);
  src.lastPoll.events = 0;
  await src.cycle();
  assert.equal(errors.length, 1, 'un 429 corta el ciclo, como en cualquier consulta');
});

test('los cambios de un commit: la comparación con su padre y, el primero, su propio diff; sin el listado bloqueado', async () => {
  const gl = project();
  gl.override = (path) => {
    if (path.startsWith(PROJECT + '/repository/commits/m1/diff'))
      return { body: [{ new_path: 'README.md', old_path: 'README.md', new_file: true, deleted_file: false, renamed_file: false, diff: '@@ -0,0 +1 @@\n+hola\n' }] };
    if (path.startsWith(PROJECT + '/repository/compare?from=f1&to=f2&straight=true'))
      return {
        body: {
          commits: [],
          diffs: [
            { new_path: 'src/b.js', old_path: 'src/a.js', new_file: false, deleted_file: false, renamed_file: true, diff: '@@ -1,2 +1,2 @@\n-x\n+y\n z\n' },
            { new_path: 'img.png', old_path: 'img.png', new_file: false, deleted_file: false, renamed_file: false, diff: 'Binary files a/img.png and b/img.png differ\n' },
            { new_path: 'old.txt', old_path: 'old.txt', new_file: false, deleted_file: true, renamed_file: false, diff: '' },
          ],
          compare_timeout: false,
        },
      };
    return null;
  };
  const { src } = connect(gl);
  await src.cycle();
  const out = await src.commitDiff('f2');
  assert.deepEqual(JSON.parse(JSON.stringify(out.files)), [
    { path: 'src/b.js', from: 'src/a.js', status: 'renamed', add: 1, del: 1, binary: false, patch: '@@ -1,2 +1,2 @@\n-x\n+y\n z', url: `${WEB}/-/blob/f2/src/b.js` },
    { path: 'img.png', from: null, status: 'modified', add: 0, del: 0, binary: true, patch: null, url: `${WEB}/-/blob/f2/img.png` },
    { path: 'old.txt', from: null, status: 'removed', add: 0, del: 0, binary: false, patch: null, url: null },
  ]);
  const first = await src.commitDiff('m1');
  assert.deepEqual(Array.from(first.files, (f) => [f.path, f.status, f.add]), [['README.md', 'added', 1]]);
  assert.ok(!gl.calls.some((c) => /\/repository\/commits(\?|$)/.test(c)), 'nunca el listado de commits');
  assert.equal(src.diffCheap(), true);
});

test('un GitLab propio: todo sale de su host, el token va solo a él, y sin https vuelve a gitlab.com', async () => {
  for (const web of ['https://gitlab.miempresa.com', 'https://git.empresa.com/gitlab']) {
    const gl = project();
    gl.web = web;
    gl.visibility = 'private';
    gl.tokens.set('tok', ['read_api']);
    gl.expect = 'tok';
    const { src, updates, errors } = connect(gl, { token: 'tok', webUrl: web });
    await src.cycle();
    assert.deepEqual(errors, [], web);
    assert.equal(updates.length, 1, web);
    assert.equal(src.data.repo.url, web + '/g/sub/p');
    assert.equal(src.link('commit', 'abc'), web + '/g/sub/p/-/commit/abc');
    assert.ok(gl.calls.length > 0 && gl.misses.length === 0, web);
  }
  const GB = load(fakeGitLab());
  for (const bad of ['http://gitlab.miempresa.com', 'ftp://x', 'no es una url', 'https://u:p@gitlab.miempresa.com']) {
    assert.equal(GB.GitLabSource.endpoints(bad), null, bad);
    const src = new GB.GitLabSource({ path: 'g/p', token: 'secreto', webUrl: bad });
    assert.equal(src.ep.api, 'https://gitlab.com/api/v4', 'una dirección que no sirve no lleva el token a otro lado: queda gitlab.com');
  }
  assert.equal(GB.GitLabSource.endpoints('https://gitlab.miempresa.com/').api, 'https://gitlab.miempresa.com/api/v4');
});

test('un GitLab propio no muestra avatares (su host no está en img-src); gitlab.com sí', async () => {
  const GB = load(fakeGitLab());
  const own = new GB.GitLabSource({ path: 'g/p', webUrl: 'https://gitlab.miempresa.com' });
  assert.equal(own.person({ username: 'a', avatar_url: 'https://gitlab.com/uploads/a.png' }).avatar, null);
  assert.equal(new GB.GitLabSource({ path: 'g/p' }).person({ username: 'a', avatar_url: 'https://gitlab.com/uploads/a.png' }).avatar, 'https://gitlab.com/uploads/a.png');
});

test('el filtro por autor funciona sobre los datos de esta fuente: deja la rama de quien escribió y quita la de nadie', async () => {
  const gl = project();
  gl.mr(5, 'feature', 'main');
  const { src } = connect(gl);
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

test('parseRepo reconoce las URL de un GitLab propio (https y ssh), y sin él no las toma por GitLab', async () => {
  const GB = load(fakeGitLab());
  const plain = (x) => (x ? { ...x } : x);
  const want = { host: 'gitlab', owner: 'grupo/sub', name: 'proyecto' };
  assert.equal(GB.U.parseRepo('https://git.miempresa.com/grupo/sub/proyecto'), null, 'sin ?gitlab= no es de nadie');
  GB.U.gitlabBase = 'https://git.miempresa.com';
  assert.deepEqual(plain(GB.U.parseRepo('https://git.miempresa.com/grupo/sub/proyecto')), want);
  assert.deepEqual(plain(GB.U.parseRepo('https://git.miempresa.com/grupo/sub/proyecto/-/tree/main')), want);
  assert.deepEqual(plain(GB.U.parseRepo('git@git.miempresa.com:grupo/sub/proyecto.git')), want);
  assert.equal(GB.U.parseRepo('https://git.miempresa.com/solo'), null);
  assert.equal(GB.U.parseRepo('https://otro.com/grupo/proyecto'), null, 'otro host no entra');
  assert.equal(GB.U.parseRepo('https://git.miempresa.com.evil.com/grupo/proyecto'), null, 'un host que solo empieza igual no entra');
  assert.deepEqual(plain(GB.U.parseRepo('https://gitlab.com/grupo/proyecto')), { host: 'gitlab', owner: 'grupo', name: 'proyecto' }, 'gitlab.com sigue');
  GB.U.gitlabBase = 'https://host.example.com/gitlab';
  assert.deepEqual(plain(GB.U.parseRepo('https://host.example.com/gitlab/g/p')), { host: 'gitlab', owner: 'g', name: 'p' });
});

test('un GitLab propio muestra avatares solo si se piden (escritorio suma su host a img-src)', async () => {
  const GB = load(fakeGitLab());
  const u = { username: 'a', avatar_url: 'https://gitlab.miempresa.com/uploads/a.png' };
  const web = new GB.GitLabSource({ path: 'g/p', webUrl: 'https://gitlab.miempresa.com' });
  assert.equal(web.person(u).avatar, null);
  const desk = new GB.GitLabSource({ path: 'g/p', webUrl: 'https://gitlab.miempresa.com', avatars: true });
  assert.equal(desk.person(u).avatar, u.avatar_url);
  assert.equal(desk.person({ username: 'a', avatar_url: 'https://www.gravatar.com/avatar/x' }).avatar, null, 'solo los de su host');
});

test('un grupo de GitLab entero: una consulta, con subgrupos, sin forks ni archivados, y el token solo a GitLab', async () => {
  const gl = fakeGitLab();
  gl.groups = {
    'gitlab-org': [
      { path_with_namespace: 'gitlab-org/ci/runner', last_activity_at: '2026-10-02T00:00:00Z', visibility: 'public' },
      { path_with_namespace: 'gitlab-org/viejo', archived: true, visibility: 'public' },
      { path_with_namespace: 'gitlab-org/copia', forked_from_project: { id: 1 }, visibility: 'public' },
      { path_with_namespace: 'gitlab-org/interno', last_activity_at: '2026-10-01T00:00:00Z', visibility: 'private' },
    ],
  };
  gl.tokens.set('tok', ['read_api']);
  gl.expect = 'tok';
  const GB = load(gl);
  const list = Array.from(await GB.GitLabSource.groupProjects('gitlab-org', { token: 'tok' }), (r) => ({ ...r }));
  assert.deepEqual(list, [
    { host: 'gitlab', owner: 'gitlab-org/ci', name: 'runner', pushedAt: '2026-10-02T00:00:00Z', private: false },
    { host: 'gitlab', owner: 'gitlab-org', name: 'interno', pushedAt: '2026-10-01T00:00:00Z', private: true },
  ]);
  assert.equal(gl.calls.length, 1, 'una sola consulta');
  assert.match(gl.groupQuery, /include_subgroups=true/);
  assert.match(gl.groupQuery, /order_by=last_activity_at/);
  await assert.rejects(() => GB.GitLabSource.groupProjects('nadie', { token: 'tok' }), (err) => err.kind === 'notfound');
  const own = fakeGitLab('https://gitlab.miempresa.com');
  own.groups = { eq: [{ path_with_namespace: 'eq/api', visibility: 'public' }] };
  assert.equal((await load(own).GitLabSource.groupProjects('eq', { webUrl: 'https://gitlab.miempresa.com' })).length, 1);
  assert.ok(own.calls.every((c) => c.startsWith('/groups/eq/projects')), 'a la instancia propia');
});

test('parseGroup entiende group:ruta y las URL de grupos, y no confunde un repo ni un usuario de GitHub', async () => {
  const GB = load(fakeGitLab());
  const g = (x) => GB.U.parseGroup(x)?.group ?? null;
  assert.equal(g('group:gitlab-org'), 'gitlab-org');
  assert.equal(g('group:gitlab-org/ci-cd/'), 'gitlab-org/ci-cd');
  assert.equal(g('https://gitlab.com/groups/gitlab-org'), 'gitlab-org');
  assert.equal(g('https://gitlab.com/groups/gitlab-org/ci/-/issues'), 'gitlab-org/ci');
  for (const bad of ['group:', 'group:../x', 'gitlab-org', 'org:acme', '@ana', 'https://gitlab.com/gitlab-org/gitlab', 'https://evil.com/groups/x']) assert.equal(g(bad), null, bad);
  GB.U.gitlabBase = 'https://gitlab.miempresa.com';
  assert.equal(g('https://gitlab.miempresa.com/groups/eq'), 'eq');
});
