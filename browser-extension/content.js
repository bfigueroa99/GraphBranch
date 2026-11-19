/* Añade «Open in GraphBranch» («Abrir en GraphBranch» en español) a las páginas de un repo de GitHub, GitLab, Codeberg o Bitbucket. Solo lee la dirección de la pestaña:
   no hace consultas, no toca tokens ni cookies, no guarda nada. GitHub navega sin recargar (Turbo), así que
   el botón se repone cuando cambia la página. El texto va en inglés, y en español si el navegador está en español
   (navigator.language: sin la API de extensiones, que este script no usa); lleva su `lang` porque la página puede
   estar en otro idioma. */
(function () {
  'use strict';
  var ID = 'graphbranch-open';
  var ES = /^es\b/i.test((typeof navigator !== 'undefined' && navigator.language) || '');
  var TEXT = ES
    ? { lang: 'es', label: 'Abrir en GraphBranch', title: function (r) { return 'Abrir ' + r + ' en GraphBranch'; } }
    : { lang: 'en', label: 'Open in GraphBranch', title: function (r) { return 'Open ' + r + ' in GraphBranch'; } };
  function sync() {
    var repo = GBRepo.targetFromUrl(location.href);
    var old = document.getElementById(ID);
    if (!repo) { if (old) old.remove(); return; }
    var url = GBRepo.appUrl(repo);
    var title = TEXT.title(repo.replace(/^https:\/\//, ''));
    // al pasar a otro repo sin recargar, el botón es el mismo: el título también cambia, no solo el enlace
    if (old) { if (old.href !== url) { old.href = url; old.title = title; } return; }
    var a = document.createElement('a');
    a.id = ID;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.lang = TEXT.lang;
    a.textContent = '⑂ ' + TEXT.label;
    // el nombre que oye un lector de pantalla es la etiqueta, sin el glifo (U+2442, que se lee «OCR fork» o nada)
    a.setAttribute('aria-label', TEXT.label);
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
