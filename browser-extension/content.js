/* Añade «Abrir en GraphBranch» a las páginas de un repo de GitHub, GitLab, Codeberg o Bitbucket. Solo lee la dirección de la pestaña:
   no hace consultas, no toca tokens ni cookies, no guarda nada. GitHub navega sin recargar (Turbo), así que
   el botón se repone cuando cambia la página. */
(function () {
  'use strict';
  var ID = 'graphbranch-open';
  function sync() {
    var repo = GBRepo.targetFromUrl(location.href);
    var old = document.getElementById(ID);
    if (!repo) { if (old) old.remove(); return; }
    var url = GBRepo.appUrl(repo);
    var title = 'Abrir ' + repo.replace(/^https:\/\//, '') + ' en GraphBranch';
    // al pasar a otro repo sin recargar, el botón es el mismo: el título también cambia, no solo el enlace
    if (old) { if (old.href !== url) { old.href = url; old.title = title; } return; }
    var a = document.createElement('a');
    a.id = ID;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '⑂ Abrir en GraphBranch';
    a.title = title;
    a.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;padding:8px 14px;border-radius:8px;' +
      'background:#1f6feb;color:#fff;font:600 13px/1.2 system-ui,sans-serif;text-decoration:none;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35)';
    document.documentElement.appendChild(a);
  }
  sync();
  document.addEventListener('turbo:load', sync);
  window.addEventListener('popstate', sync);
  var last = location.href;
  setInterval(function () { if (location.href !== last) { last = location.href; sync(); } }, 700);
})();
