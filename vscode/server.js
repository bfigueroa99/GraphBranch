/* El servidor local de la extensión de VS Code: sirve la app de GraphBranch (la misma carpeta que
   publica la web) en 127.0.0.1, solo bajo una ruta secreta (/<clave>/), y le entrega el token de
   la sesión de GitHub de VS Code en un archivo propio (vscode-session.js) que index.html no trae:
   se agrega al servir la página. Sin dependencias y sin `vscode`, para probarlo con `node --test`
   (tools/vscode.test.mjs).

   - Solo escucha en 127.0.0.1 y todo cuelga de la clave: otra página o proceso local que no la
     tenga recibe 404, y el token no viaja por ninguna URL.
   - Solo se sirve lo que la página usa (PUBLIC); sw.js no se sirve, así que el service worker no
     se registra ni guarda el token. */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = new Set(['index.html', 'css', 'js', 'vendor', 'icons']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const SESSION = 'vscode-session.js';
// lo que la página guarda y la extensión recuerda entre sesiones (el puerto cambia cada vez, y con él el origen): repos seguidos, repo a la vista, vista 2D/3D e idioma
const STATE_KEYS = ['repos', 'repo', 'view', 'lang'];
const STATE_MAX = 4000;

/** Lo que la página avisó (`?d=` de /state): solo las claves de STATE_KEYS, cada valor un JSON válido y acotado; lo demás se descarta. */
function cleanState(raw) {
  const out = {};
  let obj;
  try {
    obj = JSON.parse(String(raw || ''));
  } catch {
    return out;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of STATE_KEYS) {
    const v = obj[k];
    if (typeof v !== 'string' || v.length > STATE_MAX) continue;
    try {
      JSON.parse(v);
      out[k] = v;
    } catch {
      /* texto que no es JSON: no es de la página */
    }
  }
  return out;
}

/** El repo que sigue un `.git/config`: la URL de `origin` si es de un servicio que GraphBranch lee, o null. */
function repoFromGitConfig(text) {
  const block = String(text || '').match(/\[remote "origin"\]([^[]*)/);
  const url = block && block[1].match(/^\s*url\s*=\s*(\S+)\s*$/m);
  if (!url) return null;
  const u = url[1].replace(/\.git$/, '').replace(/\/+$/, '');
  const m = u.match(/^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)[/:](.+)$/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const rest = m[2];
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(rest) || rest.split('/').some((p) => /^\.+$/.test(p))) return null;
  // GitHub se pide como owner/repo; los demás, con su URL, que la página reconoce
  return host === 'github.com' ? rest.split('/').slice(0, 2).join('/') : `https://${host}/${rest}`;
}

/** El archivo con el que se arranca la sesión: guarda el token donde la página lo lee (js/util.js, U.store). */
function sessionScript(token, hadToken = false, state = {}) {
  let js = '\n';
  if (token) js = `try{localStorage.setItem('graphbranch:token',${JSON.stringify(JSON.stringify(token))})}catch(e){}\n`;
  // la sesión se cerró: el token que dejó este servidor no se queda en el almacenamiento de la página
  else if (hadToken) js = `try{localStorage.removeItem('graphbranch:token')}catch(e){}\n`;
  return js + stateScript(state);
}

/** Siembra lo que la extensión recordó y avisa a /state (una imagen, que la CSP de la página ya permite) cuando la página lo cambia. */
function stateScript(state) {
  const seed = STATE_KEYS.filter((k) => typeof state[k] === 'string').map((k) => `localStorage.setItem('graphbranch:${k}',${JSON.stringify(state[k])});`).join('');
  return `try{${seed}var K=${JSON.stringify(STATE_KEYS)},t=0,o=Storage.prototype.setItem,r=Storage.prototype.removeItem;
function send(k){if(typeof k!=='string'||k.indexOf('graphbranch:')!==0||K.indexOf(k.slice(12))<0)return;clearTimeout(t);t=setTimeout(function(){var s={};K.forEach(function(n){var v=localStorage.getItem('graphbranch:'+n);if(v!=null)s[n]=v});new Image().src='state?d='+encodeURIComponent(JSON.stringify(s))},300)}
Storage.prototype.setItem=function(k,v){o.call(this,k,v);send(k)};Storage.prototype.removeItem=function(k){r.call(this,k);send(k)}}catch(e){}\n`;
}

/** Arranca el servidor. `root` es la carpeta de la app; resuelve con { url, close }. */
function start({ root, token: first = '', key = crypto.randomBytes(16).toString('hex'), repo = '', state: saved = {}, onState = () => {} } = {}) {
  const base = '/' + key + '/';
  let token = first;
  let hadToken = !!first;
  let state = cleanState(JSON.stringify(saved));
  const server = http.createServer((req, res) => {
    const fail = (code) => res.writeHead(code, { 'Content-Type': 'text/plain' }).end('Not found');
    if (req.method !== 'GET' || !req.url) return fail(404);
    let rel;
    let query = '';
    try {
      const u = new URL(req.url, 'http://x');
      query = u.searchParams.get('d') || '';
      const p = decodeURIComponent(u.pathname);
      if (!p.startsWith(base)) return fail(404);
      rel = path.posix.normalize(p.slice(base.length)) || 'index.html';
    } catch {
      return fail(404);
    }
    if (rel === SESSION) {
      return res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(sessionScript(token, hadToken, state));
    }
    if (rel === 'state') {
      state = cleanState(query);
      onState({ ...state });
      return res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    }
    const file = path.join(root, rel);
    if (!PUBLIC.has(rel.split('/')[0]) || rel.startsWith('..') || path.relative(root, file).startsWith('..')) return fail(404);
    fs.readFile(file, (err, body) => {
      if (err) return fail(404);
      if (rel === 'index.html') {
        body = Buffer.from(String(body).replace('<script src="js/i18n.js"></script>', `<script src="${SESSION}"></script>\n<script src="js/i18n.js"></script>`));
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const q = repo ? `?repo=${encodeURIComponent(repo)}` : '';
      resolve({ url: `http://127.0.0.1:${port}${base}index.html${q}`, port, key, setToken(t) { token = t || ''; hadToken = hadToken || !!token; }, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

module.exports = { start, repoFromGitConfig, sessionScript, cleanState, SESSION, STATE_KEYS };
