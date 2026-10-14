#!/usr/bin/env node
/* Pruebas de la extensión de VS Code (vscode/): el servidor local que entrega la app y el token de la
   sesión, y cómo se saca el repo de un `.git/config`.

     node --test                   todas las pruebas (archivos *.test.mjs)
     node tools/vscode.test.mjs    solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { start, repoFromGitConfig } = createRequire(import.meta.url)('../vscode/server.js');
const get = async (url) => {
  const r = await fetch(url);
  return { status: r.status, type: r.headers.get('content-type'), text: await r.text() };
};

test('repoFromGitConfig: el origin de GitHub, https o ssh, y los otros servicios con su URL', () => {
  const cfg = (url) => `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  assert.equal(repoFromGitConfig(cfg('https://github.com/bfigueroa99/GraphBranch.git')), 'bfigueroa99/GraphBranch');
  assert.equal(repoFromGitConfig(cfg('git@github.com:o/r.git')), 'o/r');
  assert.equal(repoFromGitConfig(cfg('https://usuario:clave@github.com/o/r')), 'o/r');
  assert.equal(repoFromGitConfig(cfg('git@gitlab.com:grupo/sub/proyecto.git')), 'https://gitlab.com/grupo/sub/proyecto');
  assert.equal(repoFromGitConfig(cfg('https://codeberg.org/o/r.git')), 'https://codeberg.org/o/r');
  assert.equal(repoFromGitConfig(cfg('https://git.miempresa.com/o/r.git')), null, 'un servidor que la página no lee');
  assert.equal(repoFromGitConfig(cfg('https://github.com/../x')), null);
  assert.equal(repoFromGitConfig('[core]\n\tbare = false\n'), null);
  assert.equal(repoFromGitConfig(''), null);
});

test('el servidor entrega la página con la sesión solo bajo su clave', async () => {
  const s = await start({ root, token: 'ghp_abc"\\x', key: 'k'.repeat(32), repo: 'o/r' });
  try {
    assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+\/k{32}\/index\.html\?repo=o%2Fr$/);
    const page = await get(s.url);
    assert.equal(page.status, 200);
    assert.ok(page.text.indexOf('vscode-session.js') < page.text.indexOf('js/i18n.js'), 'la sesión se carga antes que la app');
    assert.match(page.text, /Content-Security-Policy/, 'la CSP de la página queda como está');
    assert.equal(page.text.replace(/<script src="vscode-session.js"><\/script>\n/, ''), readFileSync(join(root, 'index.html'), 'utf8'));

    const session = await get(new URL('vscode-session.js', s.url));
    assert.match(session.type, /javascript/);
    // el token queda como texto JSON dentro de localStorage, tal como lo lee U.store
    const store = {};
    new Function('localStorage', session.text)({ setItem: (k, v) => (store[k] = v) });
    assert.equal(JSON.parse(store['graphbranch:token']), 'ghp_abc"\\x');

    assert.equal((await get(new URL('js/app.js', s.url))).status, 200);
    assert.equal((await get(new URL('css/styles.css', s.url))).type, 'text/css; charset=utf-8');
    // sin la clave, o con otra, nada; el token no se entrega
    assert.equal((await get(`http://127.0.0.1:${s.port}/vscode-session.js`)).status, 404);
    assert.equal((await get(`http://127.0.0.1:${s.port}/${'z'.repeat(32)}/vscode-session.js`)).status, 404);
    // solo lo que la página usa: ni el service worker (no debe guardar el token), ni el resto del proyecto
    for (const p of ['sw.js', 'package.json', 'electron/main.js', 'vscode/server.js', '../package.json', '..%2fpackage.json', 'js/../package.json']) {
      assert.equal((await get(new URL(p, s.url))).status, 404, p);
    }
  } finally {
    await s.close();
  }
});

test('sin sesión de GitHub, el archivo de sesión no guarda nada y la clave es nueva cada vez', async () => {
  const a = await start({ root });
  const b = await start({ root });
  try {
    assert.notEqual(a.key, b.key);
    assert.doesNotMatch((await get(new URL('vscode-session.js', a.url))).text, /token/);
    assert.doesNotMatch(a.url, /\?repo=/);
  } finally {
    await a.close();
    await b.close();
  }
});

test('el paquete: el manifiesto declara los comandos que la extensión registra', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'vscode', 'package.json'), 'utf8'));
  const code = readFileSync(join(root, 'vscode', 'extension.js'), 'utf8');
  for (const c of pkg.contributes.commands) assert.ok(code.includes(`'${c.command}'`), c.command + ' sin registrar');
  const nls = JSON.parse(readFileSync(join(root, 'vscode', 'package.nls.json'), 'utf8'));
  for (const c of pkg.contributes.commands) assert.ok(nls[c.title.replace(/%/g, '')], c.title + ' sin texto');
  assert.deepEqual(pkg.activationEvents, [], 'los comandos activan la extensión solos');
});
