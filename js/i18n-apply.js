/* Vuelve a traducir el DOM estático cuando la página ya existe completa.
   i18n.js se carga en el <head>: si los idiomas llegan antes de que se analice el resto del HTML,
   su primera pasada no ve todos los elementos. Este script va al final del <body>, justo antes
   de los demás, y es un archivo (no un <script> en línea) porque el CSP de index.html no
   permite scripts en línea. */
GB.i18n.ready.then(() => GB.i18n.apply());
