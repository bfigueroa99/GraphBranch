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

  var SEG = /^[A-Za-z0-9._-]{1,100}$/;
  // Primeros segmentos que no son un dueño o grupo, por plataforma.
  var RES_GITLAB = ['users', 'explore', 'dashboard', 'groups', 'admin', 'help', 'api', 'profile', 'search', 'projects', 'oauth',
    'public', 'snippets', '-', 'uploads', 'assets', 'sitemap', 'jwt', 'import', 'invites', 'sign_in', 'sign_up'];
  var RES_CODEBERG = ['explore', 'user', 'repo', 'org', 'admin', 'notifications', 'issues', 'pulls', 'api', 'assets', 'attachments',
    'avatars', 'login', 'devtest', 'milestones', 'stars', 'swagger.v1.json', 'robots.txt', 'favicon.ico', 'sitemap.xml', 'v2'];
  var RES_BITBUCKET = ['account', 'dashboard', 'product', 'workspace', 'workspaces', 'repo', 'repositories', 'snippets', 'support',
    'site', 'blog', 'features', 'pricing', 'login', 'signup', 'gateway', 'atlassian', 'plans', 'enterprise', 'addon', 'integrations'];

  function okSegs(parts, reserved) {
    if (!parts.length || reserved.indexOf(parts[0].toLowerCase()) >= 0) return false;
    for (var i = 0; i < parts.length; i++) if (!SEG.test(parts[i]) || parts[i] === '.' || parts[i] === '..') return false;
    return true;
  }

  /** Lo que va en `?repo=`: `dueño/repo` en github.com, o la URL del proyecto en gitlab.com (con sus subgrupos),
      codeberg.org y bitbucket.org. null si la página no es la de un repo. */
  function targetFromUrl(href) {
    var gh = repoFromUrl(href);
    if (gh) return gh;
    var u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    var seg = u.pathname.split('/').filter(Boolean);
    var host = u.hostname;
    if (host === 'gitlab.com') {
      var cut = seg.indexOf('-');
      if (cut >= 0) seg = seg.slice(0, cut);
      if (seg.length < 2 || seg.length > 20 || !okSegs(seg, RES_GITLAB)) return null;
      seg[seg.length - 1] = seg[seg.length - 1].replace(/\.git$/, '');
      return 'https://gitlab.com/' + seg.join('/');
    }
    if (host === 'codeberg.org' || host === 'bitbucket.org') {
      if (seg.length < 2 || !okSegs(seg.slice(0, 2), host === 'codeberg.org' ? RES_CODEBERG : RES_BITBUCKET)) return null;
      return 'https://' + host + '/' + seg[0] + '/' + seg[1].replace(/\.git$/, '');
    }
    return null;
  }

  /** El enlace a la web publicada, con el repo en `?repo=` (codificado). */
  function appUrl(repo) {
    return APP + '?repo=' + encodeURIComponent(repo);
  }

  var api = { APP: APP, repoFromUrl: repoFromUrl, targetFromUrl: targetFromUrl, appUrl: appUrl };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GBRepo = api;
})(typeof self !== 'undefined' ? self : this);
