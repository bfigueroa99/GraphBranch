#!/usr/bin/env node
/* Pruebas de la extensión de VS Code (vscode/): el servidor local que entrega la app y el token de la
   sesión, y cómo se saca el repo de un `.git/config`.

     node --test                   todas las pruebas (archivos *.test.mjs)
     node tools/vscode.test.mjs    solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { start, repoFromGitConfig, cleanState } = createRequire(import.meta.url)('../vscode/server.js');
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

/** Carga vscode/extension.js con un `vscode` simulado: una sesión de GitHub que la prueba cambia a mano. */
function conExtension() {
  const sesion = { token: 'ghs_uno' };
  const oyentes = [];
  const paneles = [];
  const fake = {
    workspace: { workspaceFolders: [] },
    window: {
      showErrorMessage() {},
      createWebviewPanel() {
        const p = { webview: { html: '' }, reveal() {}, dispose() { this.cierres.forEach((f) => f()); }, cierres: [], onDidDispose(f) { this.cierres.push(f); } };
        paneles.push(p);
        return p;
      },
    },
    ViewColumn: { Beside: 2 },
    Uri: { parse: (u) => ({ toString: () => u }) },
    env: { asExternalUri: async (u) => u },
    l10n: { t: (m) => m },
    commands: { registerCommand: (id, f) => ((fake.cmds ||= {})[id] = f) },
    authentication: {
      getSession: async () => (sesion.token ? { accessToken: sesion.token } : undefined),
      onDidChangeSessions(f) {
        oyentes.push(f);
        return { dispose() { oyentes.splice(oyentes.indexOf(f), 1); } };
      },
    },
  };
  const load = Module._load;
  Module._load = (req, ...r) => (req === 'vscode' ? fake : load(req, ...r));
  try {
    const req = createRequire(import.meta.url);
    delete req.cache[req.resolve('../vscode/extension.js')]; // cada prueba, su `vscode` simulado
    const ext = req('../vscode/extension.js');
    const guardado = {};
    ext.activate({
      extensionPath: join(root, 'vscode'),
      subscriptions: [],
      globalState: { get: (k, d) => guardado[k] ?? d, update: async (k, v) => void (guardado[k] = v) },
    });
    fake.guardado = guardado;
  } finally {
    Module._load = load;
  }
  return { fake, sesion, oyentes, paneles };
}

test('la extensión sigue la sesión de GitHub de VS Code mientras el panel está abierto', async () => {
  const { fake, sesion, oyentes, paneles } = conExtension();
  await fake.cmds['graphbranch.open']();
  const panel = paneles[0];
  const src = () => panel.webview.html.match(/iframe src="([^"]+)"/)[1];
  const sesionJs = async () => (await get(new URL('vscode-session.js', src()))).text;
  try {
    assert.match(await sesionJs(), /setItem\('graphbranch:token',"\\"ghs_uno\\""\)/);
    const antes = panel.webview.html;

    sesion.token = 'ghs_dos'; // renovó la sesión: otra cuenta
    await oyentes[0]({ provider: { id: 'github' } });
    assert.match(await sesionJs(), /ghs_dos/);
    assert.notEqual(panel.webview.html, antes, 'la página se recarga');

    const html = panel.webview.html;
    await oyentes[0]({ provider: { id: 'microsoft' } }); // otro proveedor: nada cambia
    await oyentes[0]({ provider: { id: 'github' } }); // mismo token: nada cambia
    assert.equal(panel.webview.html, html);

    sesion.token = ''; // cerró sesión: el token guardado en la página se borra
    await oyentes[0]({ provider: { id: 'github' } });
    const js = await sesionJs();
    assert.match(js, /removeItem\('graphbranch:token'\)/);
    assert.doesNotMatch(js, /ghs_/);
  } finally {
    panel.dispose();
  }
  assert.equal(oyentes.length, 0, 'al cerrar el panel se deja de escuchar');
});

test('cleanState: solo las claves de la página, con JSON válido y acotado (nunca el token)', () => {
  const ok = { repos: '["o/r"]', repo: '"o/r"', view: '"2d"', lang: '"es"' };
  assert.deepEqual(cleanState(JSON.stringify(ok)), ok);
  assert.deepEqual(cleanState(JSON.stringify({ ...ok, token: '"ghp_x"', otra: '1' })), ok, 'el token y lo ajeno se descartan');
  assert.deepEqual(cleanState(JSON.stringify({ repos: 'no es json', view: 3, repo: '"' + 'x'.repeat(4000) + '"' })), {});
  for (const mal of ['', 'no', '[]', 'null', '"x"']) assert.deepEqual(cleanState(mal), {}, mal);
});

test('el servidor recuerda lo que la página avisa en /state y lo siembra en la sesión siguiente', async () => {
  const visto = [];
  const a = await start({ root, key: 'a'.repeat(32), onState: (s) => visto.push(s) });
  try {
    const d = encodeURIComponent(JSON.stringify({ repos: '["o/r","p/q"]', repo: '"p/q"', token: '"ghp_x"' }));
    assert.equal((await fetch(new URL('state?d=' + d, a.url))).status, 204);
    assert.deepEqual(visto, [{ repos: '["o/r","p/q"]', repo: '"p/q"' }]);
    assert.equal((await fetch(`http://127.0.0.1:${a.port}/state?d=${d}`)).status, 404, 'sin la clave, nada');
    assert.equal(visto.length, 1);
  } finally {
    await a.close();
  }
  // otro panel, otro puerto y otra clave: la página parte de lo guardado
  const b = await start({ root, state: visto[0] });
  try {
    const store = {};
    const js = (await get(new URL('vscode-session.js', b.url))).text;
    class Storage {}
    Storage.prototype.setItem = function (k, v) { store[k] = v; };
    Storage.prototype.removeItem = function (k) { delete store[k]; };
    const local = Object.create(Storage.prototype);
    local.getItem = (k) => store[k] ?? null;
    const imagenes = [];
    class Image { set src(v) { imagenes.push(v); } }
    new Function('localStorage', 'Storage', 'Image', 'setTimeout', 'clearTimeout', js)(local, Storage, Image, (f) => f(), () => {});
    assert.equal(store['graphbranch:repos'], '["o/r","p/q"]');
    assert.equal(store['graphbranch:repo'], '"p/q"');
    assert.equal(store['graphbranch:token'], undefined, 'el token nunca se recuerda');
    assert.equal(imagenes.length, 0, 'sembrar no avisa');
    Storage.prototype.setItem.call(local, 'graphbranch:view', '"2d"'); // la página guarda algo suyo
    Storage.prototype.setItem.call(local, 'graphbranch:token', '"ghp_y"'); // y el token: no se avisa
    assert.equal(imagenes.length, 1);
    assert.match(imagenes[0], /^state\?d=/);
    const enviado = JSON.parse(decodeURIComponent(imagenes[0].slice(8)));
    assert.deepEqual(Object.keys(enviado).sort(), ['repo', 'repos', 'view']);
  } finally {
    await b.close();
  }
});

test('la extensión guarda lo que avisa la página y se lo devuelve al abrir de nuevo', async () => {
  const { fake, paneles } = conExtension();
  await fake.cmds['graphbranch.open']();
  const src = (i) => paneles[i].webview.html.match(/iframe src="([^"]+)"/)[1];
  await fetch(new URL('state?d=' + encodeURIComponent(JSON.stringify({ repos: '["o/r"]' })), src(0)));
  assert.deepEqual(fake.guardado.pageState, { repos: '["o/r"]' });
  paneles[0].dispose();
  await fake.cmds['graphbranch.open']();
  assert.match((await get(new URL('vscode-session.js', src(1)))).text, /graphbranch:repos',"\[\\"o\/r\\"\]"/);
  paneles[1].dispose();
});
