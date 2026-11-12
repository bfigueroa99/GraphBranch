#!/usr/bin/env node
/* Pruebas de la extensión de Chrome y Firefox (browser-extension/): permisos mínimos del manifiesto y armado del
   enlace a GraphBranch.

     node --test                          todas las pruebas (archivos *.test.mjs)
     node tools/browser-extension.test.mjs  solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'browser-extension');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const { repoFromUrl, targetFromUrl, appUrl, APP } = createRequire(import.meta.url)('../browser-extension/repo.js');

test('el manifiesto: MV3, sin permisos ni host_permissions, solo github.com, gitlab.com, codeberg.org y bitbucket.org', () => {
  assert.equal(manifest.manifest_version, 3);
  for (const k of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions',
    'background', 'web_accessible_resources', 'externally_connectable', 'content_security_policy'])
    assert.equal(manifest[k], undefined, `${k} no va`);
  assert.equal(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.matches, ['https://github.com/*', 'https://gitlab.com/*', 'https://codeberg.org/*', 'https://bitbucket.org/*']);
  assert.deepEqual(cs.js, ['repo.js', 'content.js']);
  for (const f of [...cs.js, ...Object.values(manifest.icons)]) assert.ok(existsSync(join(dir, f)), `${f} existe`);
  assert.match(manifest.browser_specific_settings.gecko.id, /@/);
});

test('ni la extensión ni su script usan la red, eval ni el almacenamiento', () => {
  for (const f of ['repo.js', 'content.js']) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|eval\(|new Function|innerHTML|localStorage|chrome\.|browser\.|cookie/, f);
  }
});

test('repoFromUrl: la página de un repo (con subrutas) da dueño/repo; lo demás, null', () => {
  assert.equal(repoFromUrl('https://github.com/bfigueroa99/GraphBranch'), 'bfigueroa99/GraphBranch');
  assert.equal(repoFromUrl('https://github.com/o/r/pull/12/files?x=1#y'), 'o/r');
  assert.equal(repoFromUrl('https://github.com/o/r.git'), 'o/r');
  assert.equal(repoFromUrl('https://github.com/o/.github'), 'o/.github');
  assert.equal(repoFromUrl('https://github.com/o'), null, 'un perfil');
  assert.equal(repoFromUrl('https://github.com/'), null);
  assert.equal(repoFromUrl('https://github.com/orgs/acme/people'), null);
  assert.equal(repoFromUrl('https://github.com/settings/profile'), null);
  assert.equal(repoFromUrl('https://github.com/marketplace/actions'), null);
  assert.equal(repoFromUrl('https://gist.github.com/o/abc'), null);
  assert.equal(repoFromUrl('https://github.com.evil.com/o/r'), null);
  assert.equal(repoFromUrl('https://evil.com/github.com/o/r'), null);
  assert.equal(repoFromUrl('http://github.com/o/r'), null);
  assert.equal(repoFromUrl('https://github.com:8443/o/r'), null);
  assert.equal(repoFromUrl('https://github.com/o/..'), null);
  assert.equal(repoFromUrl('javascript:alert(1)'), null);
  assert.equal(repoFromUrl('no es una url'), null);
});

test('appUrl: va a la web publicada con ?repo= codificado', () => {
  assert.equal(APP, 'https://bfigueroa99.github.io/GraphBranch/');
  assert.equal(appUrl('o/r'), 'https://bfigueroa99.github.io/GraphBranch/?repo=o%2Fr');
  const u = new URL(appUrl('o/r.x-y_z'));
  assert.equal(u.searchParams.get('repo'), 'o/r.x-y_z');
  assert.equal(u.origin, 'https://bfigueroa99.github.io');
});

test('targetFromUrl: GitHub sigue dando dueño/repo; GitLab, Codeberg y Bitbucket, la URL del proyecto', () => {
  assert.equal(targetFromUrl('https://github.com/o/r/pull/1'), 'o/r');
  assert.equal(targetFromUrl('https://gitlab.com/grupo/proyecto'), 'https://gitlab.com/grupo/proyecto');
  assert.equal(targetFromUrl('https://gitlab.com/g/sub/proyecto/-/merge_requests/3?x=1#y'), 'https://gitlab.com/g/sub/proyecto');
  assert.equal(targetFromUrl('https://gitlab.com/g/p.git'), 'https://gitlab.com/g/p');
  assert.equal(targetFromUrl('https://codeberg.org/dueño/repo'), null, 'segmento no ASCII');
  assert.equal(targetFromUrl('https://codeberg.org/ana/repo/issues/4'), 'https://codeberg.org/ana/repo');
  assert.equal(targetFromUrl('https://bitbucket.org/espacio/repo/src/main/'), 'https://bitbucket.org/espacio/repo');
  assert.equal(targetFromUrl('https://bitbucket.org/espacio/repo.git'), 'https://bitbucket.org/espacio/repo');
  for (const u of ['https://gitlab.com/', 'https://gitlab.com/ana', 'https://gitlab.com/users/ana/projects', 'https://gitlab.com/explore/projects',
    'https://gitlab.com/groups/g/-/issues', 'https://gitlab.com/-/profile', 'https://codeberg.org/explore/repos', 'https://codeberg.org/user/settings',
    'https://codeberg.org/ana', 'https://bitbucket.org/account/signin', 'https://bitbucket.org/dashboard/overview', 'https://bitbucket.org/ana',
    'http://gitlab.com/g/p', 'https://gitlab.com:8443/g/p', 'https://u:p@gitlab.com/g/p', 'https://www.gitlab.com/g/p', 'https://gitlab.com.evil.com/g/p',
    'https://evil.com/gitlab.com/g/p', 'https://gitlab.com/g/..', 'https://gitlab.com/g/%2e%2e/p', 'https://bitbucket.org/a/b%2fc'])
    assert.equal(targetFromUrl(u), null, u);
});

test('lo que arma la extensión lo entiende la web: parseRepo da el mismo proyecto', () => {
  const ctx = vm.createContext({ window: {}, console, document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { onLine: true }, addEventListener() {}, removeEventListener() {} });
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(dir, '..', 'js', 'util.js'), 'utf8'), ctx, { filename: 'util.js' });
  const parse = (x) => JSON.parse(JSON.stringify(ctx.GB.U.parseRepo(x)));
  for (const [page, want] of [
    ['https://gitlab.com/g/sub/p/-/issues', { host: 'gitlab', owner: 'g/sub', name: 'p' }],
    ['https://codeberg.org/ana/r/src/branch/main', { host: 'codeberg', owner: 'ana', name: 'r' }],
    ['https://bitbucket.org/ws/r/src/main', { host: 'bitbucket', owner: 'ws', name: 'r' }],
  ]) {
    const link = new URL(appUrl(targetFromUrl(page)));
    assert.equal(link.origin, 'https://bfigueroa99.github.io');
    assert.deepEqual(parse(link.searchParams.get('repo')), want, page);
  }
});

/** Corre content.js en una página falsa: `boton` es el enlace que agregó (o null) y `navegar` cambia la dirección
    como lo hace una página que no recarga (GitHub con Turbo) y avisa con `turbo:load`. */
function pagina(href) {
  const added = [];
  const oyentes = {};
  const location = { href };
  const ctx = vm.createContext({
    URL,
    encodeURIComponent,
    location,
    document: {
      getElementById: (id) => added.find((a) => a.id === id && !a.quitado) || null,
      createElement: () => ({ style: {}, remove() { this.quitado = true; } }),
      documentElement: { appendChild: (a) => added.push(a) },
      addEventListener: (tipo, fn) => (oyentes[tipo] = fn),
    },
    addEventListener() {},
    setInterval() {},
  });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of manifest.content_scripts[0].js) vm.runInContext(readFileSync(join(dir, f), 'utf8'), ctx, { filename: f });
  return {
    get boton() { return added.find((a) => !a.quitado) || null; },
    navegar(a) { location.href = a; oyentes['turbo:load'](); },
  };
}

test('al pasar a otro repo sin recargar, el botón lleva al nuevo y su título también lo dice', () => {
  const p = pagina('https://github.com/o/uno');
  const a = p.boton;
  assert.equal(a.title, 'Abrir o/uno en GraphBranch');
  assert.equal(a.target, '_blank');
  assert.equal(a.rel, 'noopener noreferrer');
  p.navegar('https://github.com/o/dos/issues');
  assert.equal(p.boton, a, 'es el mismo botón');
  assert.equal(new URL(a.href).searchParams.get('repo'), 'o/dos');
  assert.equal(a.title, 'Abrir o/dos en GraphBranch'); // antes seguía diciendo o/uno
  p.navegar('https://gitlab.com/g/sub/p/-/issues');
  assert.equal(a.title, 'Abrir gitlab.com/g/sub/p en GraphBranch');
  p.navegar('https://github.com/settings/profile');
  assert.equal(p.boton, null, 'fuera de un repo, el botón se va');
});
