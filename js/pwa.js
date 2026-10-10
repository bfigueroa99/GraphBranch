/* Instalable y sin conexión: registra el service worker (sw.js), que guarda la página para abrirla
   sin red, y el manifiesto (manifest.webmanifest) la deja instalar como app en el celular o el
   escritorio. Solo en la web servida por https o localhost: la app de escritorio (app://) ya lleva
   todo dentro y con doble clic (file://) los navegadores no admiten service workers. Se registra
   después de cargar la página, así no compite con ella. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const register = () =>
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* sin worker la página funciona igual, solo que necesita red para abrir */
    });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
