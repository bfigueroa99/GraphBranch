# Mantenimiento: el protocolo de cada subtipo

Parte de la skill `iteracion` (`.claude/skills/iteracion/SKILL.md`, paso 2). `node tools/loop.mjs --reclamar`
imprime el subtipo de la iteración de mantenimiento: se lee aquí la sección de ese subtipo, y solo esa, antes de
tocar nada. Lo común a todos (primero la reproducción, después el arreglo, y la prueba que falla sin él queda en
la suite) está en la skill.

## Errores

1. Reproducir el fallo con una prueba que falla: `node --test` con la API simulada
   (`tools/github.test.mjs`, `tools/gitlab.test.mjs`), un paso del smoke o una e2e. Su línea de fallo
   va a la bitácora como `- **Reproducción:** <comando> → <lo que dice sin el arreglo>`.
2. Arreglar la causa, no el síntoma; buscar el mismo patrón en el resto del código (`grep`) y cargar
   lo que aparezca como pendientes nuevos.
3. La misma prueba en verde, y `npm run check`.

## QA

QA exploratoria de lo que llegó desde la última QA (las expansiones de la bitácora):

```sh
node tools/esperar.mjs --lanzar auditoria -- node tools/audit.mjs --langs --json test-results/auditoria.json
node tools/esperar.mjs auditoria
node tools/esperar.mjs --lanzar smoke -- node tools/smoke.mjs
node tools/esperar.mjs smoke
```

1. La auditoría completa: cada hallazgo fuera de la base es candidato a pendiente.
2. El smoke tres veces, uno detrás de otro (el par de arriba, tres veces: unos 8 minutos cada uno): un paso
   que falla alguna vez es una prueba intermitente (`[Deuda]`, Media).
3. A mano, con Playwright contra `node e2e/serve.mjs 4173` y las APIs simuladas (las del smoke y de
   `tools/audit.mjs`), los bordes de cada capacidad nueva: repo vacío, 404, privado sin token, sin red
   (`context.setOffline`), cuota agotada (403 con `x-ratelimit-remaining: 0`), 1.000 ramas, nombres
   larguísimos y de derecha a izquierda, 320 px, solo teclado, tema claro y oscuro, movimiento reducido,
   2D y 3D, Replay y modo TV. Errores de consola y estados rotos son hallazgos.
4. Cargar al menos 3 hallazgos con subtipo, prioridad y reproducción (`audit:<tipo>` si salen de la
   auditoría y se aceptan como conocidos: `node tools/audit.mjs --base`), y arreglar el peor.
5. La bitácora lleva `- **Hallazgos:** n nuevos (pendientes …), m a la base de la auditoría`.

## Accesibilidad

La auditoría (`sin-nombre`, `foco-*`, `dialogo-foco`, `trampa`, `objetivo-chico`, `animacion-infinita`),
y a mano: la capacidad más reciente solo con Tab, Enter, Espacio y Esc (el foco nunca cae a `<body>` ni
se esconde), nombres y roles de lo que lee un lector de pantalla (regiones vivas que no anuncian de más),
contraste (el smoke lo mide) y movimiento reducido. Al arreglar un hallazgo conocido de la auditoría,
`node tools/audit.mjs --base` lo saca de la base.

## Seguridad

1. El CSP de `index.html` sigue cerrado: ninguna directiva nueva sin la función que la necesita
   (`tools/pwa.test.mjs` las comprueba) y ningún `eval`, script en línea ni CDN.
2. Todo texto de afuera (repos, commits, issues, eventos) entra al DOM escapado (`U.esc` o
   `textContent`): buscar `innerHTML` y revisar cada uno.
3. Cada token va solo a su API (el smoke lo prueba) y nunca a la URL, al registro ni al service worker
   (`sw.js` no guarda respuestas de la API).
4. App de escritorio (`electron/main.js`): aislamiento de contexto, lo mínimo en `preload.js`,
   navegación y ventanas nuevas bloqueadas, descargas solo de `blob:app://graphbranch/`; la versión de
   Electron frente a la última estable (con `WebFetch`, si está; si no, a Para Benjamin).
5. Lo explotable (un token que sale, un XSS) es Alta; lo demás, Media o Baja, con su reproducción.

## Rendimiento

```sh
node tools/esperar.mjs --lanzar antes -- node tools/audit.mjs --repetir 3 --json test-results/antes.json
node tools/esperar.mjs antes
```

Antes de tocar nada (la rama está igual a `dev`): la medida base, la mejor de 3. Se perfila el
camino caliente (lo que corre por cuadro, las consultas al cargar) y se arregla lo más caro. Después,
`node tools/audit.mjs --repetir 3 --comparar test-results/antes.json` (también lanzado y esperado, como la
base): la bitácora lleva las diferencias,
y ninguna otra medida empeora más de un 10 %. Las consultas a la API cuentan como rendimiento: una que
sobra al abrir un repo sin token cuesta 1 de 60 por hora.

## Deuda

Pruebas intermitentes, herramientas del loop, refactorizaciones con su prueba. Una intermitente se mide
antes (cuántas fallas en N corridas de ese paso o de esa prueba; un paso del smoke se corre con su sección
sola, en segundos y no en 10 minutos: `node tools/smoke.mjs --solo <parte del título de su sección>`, y
`--secciones` las lista), se busca la causa (un tiempo fijo, un
estado fingido que el navegador no respeta; con `omc-tracer` y sus hipótesis en competencia, receta 4) y
se muestra después: N corridas en verde.
