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
function sessionScript(token, hadToken = false) {
  if (token) return `try{localStorage.setItem('graphbranch:token',${JSON.stringify(JSON.stringify(token))})}catch(e){}\n`;
  // la sesión se cerró: el token que dejó este servidor no se queda en el almacenamiento de la página
  return hadToken ? `try{localStorage.removeItem('graphbranch:token')}catch(e){}\n` : '\n';
}

/** Arranca el servidor. `root` es la carpeta de la app; resuelve con { url, close }. */
function start({ root, token: first = '', key = crypto.randomBytes(16).toString('hex'), repo = '' } = {}) {
  const base = '/' + key + '/';
  let token = first;
  let hadToken = !!first;
  const server = http.createServer((req, res) => {
    const fail = (code) => res.writeHead(code, { 'Content-Type': 'text/plain' }).end('Not found');
    if (req.method !== 'GET' || !req.url) return fail(404);
    let rel;
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(base)) return fail(404);
      rel = path.posix.normalize(p.slice(base.length)) || 'index.html';
    } catch {
      return fail(404);
    }
    if (rel === SESSION) {
      return res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(sessionScript(token, hadToken));
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

module.exports = { start, repoFromGitConfig, sessionScript, SESSION };
