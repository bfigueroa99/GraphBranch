/* Saca `dueño/repo` de la dirección de una página de github.com y arma el enlace a GraphBranch.
   Sin DOM ni permisos: lo cargan el script de contenido y las pruebas (`tools/browser-extension.test.mjs`). */
(function (root) {
  'use strict';
  var APP = 'https://bfigueroa99.github.io/GraphBranch/';
  // Primeros segmentos de github.com que no son un dueño.
  var RESERVED = ['orgs', 'settings', 'marketplace', 'sponsors', 'notifications', 'login', 'logout', 'join', 'pricing',
    'features', 'explore', 'topics', 'collections', 'trending', 'search', 'new', 'about', 'apps', 'enterprise', 'users',
    'issues', 'pulls', 'codespaces', 'dashboard', 'organizations', 'site', 'security', 'sessions', 'account', 'readme',
    'customer-stories', 'team', 'contact', 'events', 'gist', 'stars', 'watching', 'copilot', 'models', 'mcp'];
  var NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$/;

  /** `dueño/repo` de una URL de github.com, o null si no es la página de un repo. */
  function repoFromUrl(href) {
    var u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port) return null;
    var seg = u.pathname.split('/').filter(Boolean);
    if (seg.length < 2) return null;
    var owner = seg[0], repo = seg[1].replace(/\.git$/, '');
    if (RESERVED.indexOf(owner.toLowerCase()) >= 0) return null;
    if (!NAME.test(owner) || owner.length > 39 || owner.indexOf('..') >= 0) return null;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
    return owner + '/' + repo;
  }

  /** El enlace a la web publicada, con el repo en `?repo=` (codificado). */
  function appUrl(repo) {
    return APP + '?repo=' + encodeURIComponent(repo);
  }

  var api = { APP: APP, repoFromUrl: repoFromUrl, appUrl: appUrl };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GBRepo = api;
})(typeof self !== 'undefined' ? self : this);
