# Mejora continua

Hoja de ruta, pendientes y bitácora de las iteraciones del loop (una cada 4 horas).

## Directiva vigente: ampliar el alcance

Pedido de Benjamin, 2026-10-10: **que el loop amplíe lo más posible el alcance del proyecto.** Desde
la iteración 20, el trabajo principal del loop es que GraphBranch sirva para algo, para alguien o en
algún lugar que antes no cubría. Arreglar y pulir sigue, pero en segundo plano: una iteración de cada
cuatro. Esta directiva manda sobre la regla anterior ("tomar el pendiente de mayor impacto") y sobre
el **Siguiente** de las entradas de la bitácora anteriores a ella.

Cuenta como ampliar el alcance una capacidad nueva que alguien pueda usar apenas se fusiona el PR:
otra fuente de datos, otro tipo de dato en el grafo, otra plataforma donde corre, más repos a la vez,
otra forma de sacar la información (exportar, compartir, integrar), otro análisis o un público nuevo.
No lo amplían los arreglos, el pulido, las refactorizaciones ni las pruebas por sí solas: eso es
mantenimiento.

### Cómo elige cada iteración

1. **Sincronizar** con `master`. Si algo está roto (pruebas en rojo, una regresión de la iteración
   anterior), se arregla primero: no se amplía sobre algo roto.
2. **Tipo de iteración** según su número `N`:
   - `N mod 4 = 3` (23, 27, 31…): **mantenimiento**. Toma el primer pendiente de
     [Mantenimiento](#mantenimiento-pendientes), como hasta ahora.
   - Las demás: **expansión**. Toma el primer ítem de la [Hoja de ruta](#hoja-de-ruta) que no esté
     hecho, salvo que sea del mismo eje que la expansión anterior y haya otro de un eje distinto entre
     los tres primeros: entonces ese. Así el proyecto crece a lo ancho y no solo en un frente.
   - Un pendiente marcado **Alta** (seguridad, datos perdidos, la app en blanco) va antes que todo.
3. **Tamaño:** una capacidad entera, de punta a punta, no una tarea acotada. Si no cabe en una
   iteración, se parte en entregas que dejan algo usable cada una: se hace la primera (la versión
   mínima que ya sirve) y las demás quedan en la hoja de ruta, en el lugar del ítem original.
4. **Si sobra tiempo**, con la primera capacidad ya fusionada y validada, se sigue con el ítem
   siguiente en otro PR. Una capacidad por PR, nunca dos mezcladas.
5. **Reponer la hoja de ruta:** al cerrar, si quedan menos de 10 ítems sin hacer, se agregan ideas
   hasta llegar a 15. Salen de lo aprendido en la iteración, de los ejes con menos cobertura en el
   [Mapa de alcance](#mapa-de-alcance) y de comparar con herramientas parecidas (Gource, gitk,
   GitKraken, GitLens, Sourcetree, la red de ramas de GitHub, Learn Git Branching). La hoja de ruta
   nunca queda vacía: al loop no se le acaba el alcance por ganar.
6. **Registrar:** la entrada de la bitácora dice el tipo y el eje (`Iteración 20 · Expansión ·
   Plataformas`), y una expansión actualiza su fila del Mapa de alcance y marca su ítem como hecho:
   tachado y con el número del PR (`~~**Instalable…**~~ hecho en #N`).

### Lo que trae cada expansión

- La capacidad funcionando en la web y, si aplica, en la app de escritorio; si la web no puede (CORS,
  sistema de archivos), la primera entrega puede ser solo de escritorio, dicho en el README.
- Visible en la **demo** cuando se pueda, para que se vea sin token ni conexión.
- Sus textos en los 40 idiomas (`node tools/check-i18n.mjs`).
- Una prueba que falle sin la capacidad: `node --test` con una API simulada, un paso del smoke o una
  e2e. Las pruebas de siempre siguen en verde (ver [Cómo validar](#cómo-validar-un-cambio)).
- README: la función en la lista de arriba, su sección si hace falta, y **Límites conocidos** y
  **Seguridad** al día.

### Lo que no cambia, por mucho alcance que dé

- App estática, sin compilación y sin servidor propio. Lo que el navegador no permite (leer un repo
  local, llamar a un webhook sin CORS) va en la app de escritorio.
- La CSP sigue cerrada: un servidor nuevo se suma a `connect-src` (o a la directiva que toque) solo
  si es la API que la función necesita. Sin CDN y sin telemetría.
- El token de cada servicio va solo a la API de ese servicio, guardado como el de GitHub (en
  escritorio, cifrado con el llavero del sistema).
- Lo nuevo no hace más lenta la carga de quien no lo usa, ni gasta cuota de GitHub si está apagado.
- Publicar en tiendas o registros (Chrome Web Store, Marketplace de VS Code, Flathub) lo hace
  Benjamin: el loop deja el paquete listo y las instrucciones en el README.

## Mapa de alcance

Lo que cubre hoy cada eje y lo que viene en la hoja de ruta. Cada expansión pasa lo suyo de la
segunda columna a la primera.

| Eje | Hoy | Siguiente |
| --- | --- | --- |
| Fuentes | GitHub.com (GraphQL, lista y eventos), demo | GitLab, repos locales, GitHub Enterprise, Gitea/Forgejo, Bitbucket |
| Datos | ramas, commits, PRs, revisiones, issues, releases, estrellas, forks, archivos (galaxias) | CI, tags, despliegues |
| Plataformas | web estática (GitHub Pages), instalable y sin conexión (PWA), escritorio (Windows, macOS, Linux), modo TV | widget y capa para streaming, VS Code |
| Escala | hasta 10 repos, miles de ramas por repo | una organización o un usuario entero |
| Salidas | panel de actividad, avisos, sonido, notificaciones, URL para compartir, imagen de la vista (PNG) | video del Replay, Slack y Discord, resumen de la semana |
| Análisis | resumen de cifras, logros, misión del día | salud del repo, choques entre ramas, comparar ramas, búsqueda |
| Público | devs y equipos, 40 idiomas, teclado | quien enseña o aprende git, quien usa lector de pantalla |

## Hoja de ruta

Ordenada por alcance ganado frente a esfuerzo. Cada ítem dice su eje, la primera entrega (la mínima
que ya sirve) y cómo comprobarla. Las notas técnicas son un punto de partida: se comprueban antes de
construir sobre ellas.

1. ~~**Instalable y sin conexión (PWA)**~~ hecho en #45 · Plataformas. `manifest.webmanifest` con íconos (sale de
   `electron/icon.png`) y un service worker que guarda la página, `css/`, `js/` y `vendor/`, así se
   instala en el celular o el escritorio sin Electron y abre sin red (con la demo y el aviso de sin
   conexión). Nunca guarda respuestas de la API: llevan datos privados si hay token. CSP: hace falta
   `manifest-src 'self'` (con `default-src 'none'` el manifiesto queda bloqueado). Registrar el worker
   solo en `https:` o `localhost`, no en `app://` de la app de escritorio. Comprobar: una e2e web que
   carga, pasa a sin conexión, recarga y ve la demo.
2. ~~**Exportar imagen**~~ hecho en #46 · Salidas. El botón de la cámara de fotos guarda la vista
   como PNG, en 3D y en 2D, con las etiquetas y una franja con el repo y la fecha; en la app de
   escritorio va a la carpeta de descargas.
3. **Grabar el Replay en video** · Salidas. Segunda entrega de exportar: un botón en la barra del
   Replay graba la historia a WebM con `MediaRecorder`, cuadro a cuadro desde el compositor de
   `js/snapshot.js` (la escena 3D o el SVG, más las etiquetas y la fecha grande) sobre un canvas con
   `captureStream()`; la grabación dura lo que el Replay (menos de un minuto). Sin audio en la primera
   entrega. Comprobar: el smoke graba unos segundos y verifica la firma WebM (EBML) y que dure más de
   un segundo.
4. **GitLab** · Fuentes. `js/sources/gitlab.js` con la interfaz de `GitHubSource` y `DemoSource`
   (`data`, `start`, `stop`, `setPaused`, `setFilter`, `setPins`, `refreshNow`, `files`, los eventos
   `update` y `status`, y `view()` si filtra por su cuenta), sobre la API REST v4 de gitlab.com:
   ramas, commits por rama, merge requests y eventos del proyecto. `U.parseRepo` acepta URLs de GitLab con subgrupos; token propio en ajustes;
   `connect-src` suma `https://gitlab.com`. Primero comprobar que la API responde con CORS desde la
   página. Primera entrega: ramas, commits y MRs con sondeo. Comprobar: `tools/gitlab.test.mjs` con una
   API simulada, como `github.test.mjs`.
5. **Una organización o un usuario entero** · Escala. Conectar `org:nombre` o `@usuario` sigue sus
   repos con push más reciente (`/orgs/{org}/repos?sort=pushed`, `/users/{u}/repos?sort=pushed`)
   hasta el tope de pestañas, y el panel de actividad suma los eventos de la organización
   (`/orgs/{org}/events`). Segunda entrega: una vista de constelación (cada repo, una galaxia) para
   ver más repos de los que caben en pestañas. Comprobar: prueba de cuota con la API simulada.
6. **CI en el grafo** · Datos. El estado de los checks de la cabeza de cada rama y de cada PR (✓, ✗,
   en curso) en su etiqueta y en el detalle, y un aviso cuando se pone en rojo la rama por defecto. Con
   token, en la misma consulta GraphQL (`statusCheckRollup`); sin token, solo la rama por defecto y las
   fijadas, para no gastar cuota. La demo simula checks. Comprobar: `node --test` con rollups
   simulados.
7. **Repos locales en la app de escritorio** · Fuentes. `LocalGitSource`: elegir una carpeta (diálogo
   del sistema), leer ramas y commits con `git` desde el proceso principal (`execFile`, sin shell) y
   vigilar `.git/HEAD`, `.git/refs` y `packed-refs` para ver cada commit al instante. Sin GitHub y sin
   cuota: sirve para repos privados, sin conexión y de cualquier servidor, incluidas las ramas que no
   se han publicado. `preload.js` expone lo mínimo y solo para carpetas elegidas por el usuario.
   Comprobar: una e2e de escritorio sobre un repo creado en la prueba que hace un commit y lo ve llegar.
8. **Widget embebible y capa para streaming** · Plataformas. `?embed=1`: solo el grafo y los avisos,
   sin barra, para un iframe en documentación, wikis o Notion (el README trae el código para pegar).
   Con `&bg=transparent`, fondo transparente para OBS al transmitir mientras se programa. Sin token por
   defecto: pensado para repos públicos. Comprobar: el smoke abre `?embed=1` y verifica que no hay
   barras y que no desborda.
9. **Salud del repo** · Análisis. Un panel con lo que ya está cargado, sin consultas nuevas: ramas sin
   actividad hace más de 30 días y sin PR, PRs abiertos por edad, tiempo de abierto a fusionado de los
   últimos PRs, ritmo de merges y releases. Cada fila lleva a su rama o PR en el grafo. Comprobar:
   `node --test` sobre los cálculos con datos fijos.
10. **GitHub Enterprise Server** · Fuentes. `GitHubSource` con la URL de la API configurable
   (`https://host/api/v3` y `/api/graphql`). En la web, el host tiene que estar en la CSP: el README
   explica cómo sumarlo al servirlo uno mismo; en la app de escritorio, `--api-url`. Comprobar: las
   pruebas de `github.test.mjs` corridas también con otra URL base.
11. **Choques entre ramas** · Análisis. Archivos tocados a la vez por varias ramas abiertas (de las
    comparaciones con la rama por defecto, que ya pide el modo galaxias): "feature/a y feature/b tocan
    `src/pagos.js`", en el detalle de cada rama y como aviso al aparecer uno nuevo. Comprobar: prueba
    con comparaciones simuladas.
12. **Avisos a Slack y Discord** · Salidas. En la app de escritorio (las URL de webhook no aceptan
    llamadas desde una página): elegir qué eventos se envían (release, merge a la rama por defecto, CI
    en rojo, force-push en la rama por defecto) y a qué webhook, guardado cifrado como el token.
    Comprobar: una e2e de escritorio con un servidor local que hace de webhook.
13. **Aprender git** · Público. Un repo de práctica donde se escriben comandos (`commit`, `branch`,
    `checkout`, `merge`, `rebase`, `reset`) y el grafo 2D o 3D responde al instante, con ejercicios
    guiados ("crea una rama, haz dos commits y fusiónala"). Reutiliza la maquinaria de `DemoSource`.
    Para quien enseña o aprende git. Comprobar: `node --test` sobre el intérprete de comandos.
14. **Tags y despliegues** · Datos. Los tags como marcas en sus commits (banderín en 2D, obelisco en
    3D) y dónde está cada entorno de despliegue (producción, staging) según `/deployments`. Comprobar:
    la demo con tags y entornos, y un paso del smoke.
15. **Vista de texto accesible** · Público. Las ramas y sus commits como un árbol navegable con el
    teclado (`role=tree`), con lo mismo que dicen los grafos, para quien usa lector de pantalla.
    Comprobar: un paso del smoke recorre el árbol con el teclado y lee los nombres accesibles.
16. **Búsqueda y filtro por autor** · Análisis. Buscar un commit por mensaje, SHA o autor y volar
    hasta él; filtrar el grafo por autor ("mis ramas"). Comprobar: un paso del smoke en la demo.
17. **Comparar dos ramas** · Análisis. Elegir dos ramas: cuántos commits lleva cada una por delante,
    desde dónde se separaron y qué archivos cambian, resaltado en el grafo. Comprobar: prueba con la
    API simulada.
18. **Gitea, Forgejo y Codeberg** · Fuentes. Con la interfaz de fuente de GitLab ya hecha; su API se
    parece a la de GitHub. Comprobar CORS de codeberg.org primero; si no lo hay, solo escritorio.
19. **Bitbucket Cloud** · Fuentes. `api.bitbucket.org/2.0`: ramas, commits y pull requests.
20. **Resumen de la semana** · Salidas. Una ficha con lo que pasó en los últimos 7 días (PRs
    fusionados, releases, quién aportó, la rama más activa), para copiar como Markdown o guardar como
    imagen.
21. **Extensión de VS Code** · Plataformas. Un webview con la app y el token de la sesión de GitHub
    que ya tiene VS Code (`vscode.authentication`), abierta en el repo del espacio de trabajo. El loop
    deja el paquete; publicarlo en el Marketplace lo hace Benjamin.

## Cómo validar un cambio

```sh
node --test                    # lógica contra una API de GitHub simulada y el service worker (tools/*.test.mjs)
node tools/check-i18n.mjs      # traducciones contra el inglés
node tools/smoke.mjs           # la demo en Chromium: 3D, 2D, vuelo, Replay, diálogos, RTL, celular
node tools/smoke.mjs --langs   # además los 40 idiomas en pantalla de celular
xvfb-run -a npm run test:e2e -- --grep-invert @lento   # app de escritorio y web (tras npm ci)
```

Si el Playwright del proyecto no encuentra su Chromium, `PLAYWRIGHT_CHROMIUM_PATH` apunta a otro (lo
leen el smoke y las e2e).

## Mantenimiento: pendientes

Los toman las iteraciones de mantenimiento (una de cada cuatro) y, si son **Alta**, cualquiera.
Ordenados por impacto. Salen de las auditorías del código: datos y lógica, y vistas y accesibilidad
(iteración 1), y el código que llegó después: director, modo TV, mundo abierto, galaxias, 2D y 3D de
#26 y #27 (iteración 6). Cada uno se verificó leyendo el código, y los marcados con *reproducido*
también se probaron. Los números de línea son de cuando se auditó: con los cambios
posteriores pueden haberse movido.

### Baja

1. La ficha de rama o commit no recibe foco al abrirse desde el teclado (Enter en una etiqueta de rama):
   para llegar a sus botones hay que recorrer con Tab todas las etiquetas (`graph.js`, `graph3d.js`).
2. Con movimiento reducido, la ayuda del modo vuelo y el combo no se ven nunca (`styles.css:1383`,
    `:2121`): su animación termina en opacidad 0.
3. Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora sobre una etiqueta de
    rama en 2D también pausa el Replay (`app.js:671` no mira `ev.defaultPrevented`).
4. Durante Replay se actualizan las dos vistas aunque una esté oculta (`app.js:278`).
5. Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`placeTip`) y un
    `Intl.DateTimeFormat` nuevo por cuadro en Replay (`replay.js:343`). Revisar tras #15, que rehízo
    buena parte de `graph.js` y `graph3d.js` (ya quitó `computeLineDistances()` por cuadro).
6. Accesibilidad menor: etiquetas de rama de 22 px de alto (mínimo 24), botones que cambian a la vez
    `aria-pressed` y el texto, leyenda 2D sin acceso por teclado, el botón de pausa del Replay sin nombre
    accesible (`index.html:190`).
7. La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:264`).
8. `i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de cargar último.
9. `mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (repos renombrados).
10. `parseRepo` acepta `..` como owner o nombre (`util.js:39`): rechazar nombres hechos solo de puntos.
11. Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` corrupto deja la app en
    blanco al arrancar.
12. Token en `localStorage`: en GitHub Pages lo comparten todos los proyectos de `<usuario>.github.io`.
    Valorar `sessionStorage` con opción "recordar", o recomendar dominio propio.
13. Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar `github.js`
    (1.200 líneas) en HTTP/cuota, los tres modos y el mapeo.
14. Smoke: el paso de contraste de las pestañas (varios repos) mide 500 ms fijos después de cambiar de
    tema, y los colores tienen transiciones de hasta 0,6 s; con el equipo cargado falló una vez
    (iteración 21: «En vivo» a 3,83:1 en el oscuro) y pasó al repetirlo. Esperar a que terminen las
    transiciones (`getAnimations()`) en vez de un tiempo fijo.

- Ideas menores de la auditoría de la iteración 6: la caché de archivos de las galaxias limita
  entradas y no tamaño (`galaxy.js:1987`); `placeLabels`/`placeNotes` crean arreglos por cuadro
  (`graph3d.js:2611`); el contenedor 2D enfocable no tiene rol ni nombre (`graph.js:306`); las marcas
  de la brújula del mundo abierto son botones que se mueven y ocultan cada cuadro (`world.js:849`).

## Bitácora

### 2026-10-07 · Iteración 1

- **Red de pruebas.** `tools/smoke.mjs` abre la demo en Chromium sin ventana (WebGL por software) y
  recorre 3D, 2D, modo vuelo, Replay, ajustes, logros, cambio a árabe en vivo y la pantalla de celular;
  falla ante cualquier excepción o error de consola, si la demo consulta `api.github.com` o si la página
  desborda. Con `--langs`, los 40 idiomas. Se comprobó que detecta un error inyectado a propósito.
- **Pruebas de la fuente de GitHub.** `tools/github.test.mjs` (`node --test`) carga `github.js` en un
  contexto aislado con una API de GitHub simulada (ETag, 304, fallos de red a pedido).
- **Arreglo: un ciclo cortado ya no pierde actividad.** Los eventos se daban por vistos y el ETag del
  feed se guardaba antes de que el ciclo terminara; si algo fallaba después (red, cuota), el reintento
  recibía 304 o los saltaba como vistos. Pasaba en la carga inicial (el panel arrancaba vacío) y en el
  modo events (los pushes de ese ciclo nunca avisaban). Ahora los eventos se marcan vistos solo al
  terminar bien el ciclo, el feed se vuelve a pedir entero tras un fallo y `seenEvents` tiene tope.
  Validado: las dos pruebas nuevas fallaban antes del arreglo y pasan después; smoke e i18n en verde.
- **Siguiente:** pendiente 1 (`aria-live` del estado), luego 2 y 3.

### 2026-10-07 · Iteración 2

- **Sincronización.** Master trajo #13 (director de cámara y modo TV); se fusionó en la rama sin
  conflictos y las pruebas, el smoke y el chequeo de idiomas siguieron en verde.
- **Arreglo: el estado ya no se le anuncia al lector de pantalla cada segundo.** `aria-live` envolvía
  todo `#status`, incluida la línea "actualizado hace 5 s · próximo en 7 s" que se reescribe cada
  segundo; además el texto del estado se reescribía cada segundo aunque no cambiara. Ahora la región
  viva es solo `#status-text` y se escribe solo cuando cambia (al pasar a "Error", "Pausado"…).
- **Prueba nueva en el smoke:** observa la región viva del estado 3,5 s y falla si cambia más de una
  vez. Antes del arreglo marcaba 10 cambios; después, ninguno.
- **Siguiente:** pendiente 1 (filtro o fijada que se pierden durante un ciclo), luego 2 (datos del repo
  anterior al cambiar de repo).

### 2026-10-07 · Iteración 3

- **Arreglo: un filtro o una rama fijada que cambian a mitad de un ciclo ya no se pierden.** El ciclo
  en curso apagaba `reseed` al terminar aunque el cambio hubiera llegado durante él; el siguiente
  recibía 304 por la lista de ramas y no volvía a elegirlas, así que el filtro no se aplicaba hasta que
  alguna rama cambiara (modos lista y eventos; con la carga inicial, que hace más de diez consultas,
  pasaba seguido). Ahora `reseed` cuenta pedidos y cada ciclo da por atendido solo el que vio al
  empezar: un cambio a mitad de camino o un ciclo que falla dejan el pedido pendiente, y el siguiente
  ciclo corre enseguida.
- **Pruebas:** dos nuevas en `tools/github.test.mjs` (filtro y fijadas cambiados mientras el ciclo
  espera la lista de ramas). Fallaban antes del arreglo y pasan después; smoke e i18n en verde.
- **Siguiente:** pendiente 1 (datos del repo anterior al cambiar de repo), luego 2 (reloj adelantado).

### 2026-10-07 · Fusión de #15 antes de abrir el PR

- Master trajo #15 (todas las ramas, sin tope; carga por lotes). Hubo conflicto en
  `js/sources/github.js` con los arreglos de las iteraciones 1 y 3: se combinaron los dos lados y el
  nuevo `if (this.reseed) this.prune()` pasó a usar el contador de pedidos.
- Con #15 el modo lista recorre la lista completa de ramas en cada ciclo, así que allí el filtro
  cambiado a mitad de ciclo ya se aplicaba; en el modo events, no. Las pruebas de filtro y fijadas se
  rehicieron para la lógica nueva (ya no hay tope de ramas) y ahora cubren los dos modos: las de modo
  events fallan con el `github.js` de master y pasan con el arreglo; las de modo lista quedan como
  regresión.
- Validado: 7 pruebas, smoke (incluidos los 40 idiomas en celular) e i18n en verde.

### 2026-10-07 · Iteración 4

- **Sincronización.** El PR #16 sigue abierto. Master trajo #14 (mundo abierto en la vista 3D); se
  fusionó sin conflictos y todo siguió en verde.
- **Arreglo: cambiar de repo ya no deja datos del anterior.** `connect()` no limpiaba `lastRender` ni
  las cifras: al pasar a un repo que da 404 (o mientras el nuevo cargaba) se veían las ramas, commits y
  PRs del anterior, y el botón de Replay, o el Replay de ambiente del modo TV, reproducían el grafo del
  repo anterior. Ahora `connect()` olvida el último dibujo y deja las cifras en "–" hasta que el repo
  nuevo traiga las suyas.
- **Prueba nueva en el smoke:** tras la demo conecta a `nadie/no-existe` con la API respondiendo 404 y
  comprueba que las cifras quedan en "–" y que el Replay no arranca. Antes del arreglo mostraba las de la
  demo (5, 18, 3).
- **Siguiente:** pendiente 1 (auditar y probar lo que llegó con #13 y #14), luego 2 (reloj adelantado).

### 2026-10-07 · Iteración 5

- **Sincronización.** El PR #16 sigue abierto. Master trajo #17–#22 (modo galaxias, aristas finas y
  #19, que rehízo el loop de sondeo). Hubo conflictos con #19 en `github.js` y `app.js`: se tomó la
  estructura nueva y se reaplicaron los arreglos de esta rama (ETag del feed borrado al cortarse un
  ciclo, también por `stop()`; pedido de filtro o fijadas pendiente adelanta el ciclo; texto de la
  región viva del estado escrito solo si cambia). Los eventos vistos se recortan con el
  `forgetOldEvents()` de master, una vez y tras confirmarlos.
- **Arnés de pruebas** adaptado a #19 (`navigator`, `AbortController`, escuchas, respuestas con
  `text()`). Las 4 pruebas de los arreglos siguen fallando con el `github.js` de master y pasan con la
  rama.
- **#19 resolvió dos pendientes:** el sondeo cada 3 s con el reloj adelantado (`nextDelay` ya no baja
  de la base si el reinicio ya pasó) y `stop()` sin cortar la consulta en curso (ahora usa
  `AbortController`). Se quitaron de la lista.
- **Mejora: el smoke test cubre lo que llegó sin pruebas.** Nuevos pasos en 3D: modo galaxias, director
  de cámara y modo TV (entrar, unos segundos de director, salir y que la URL pierda `?tv`), y una carga
  directa con `?tv=1` a 1920×1080. Se comprobó que detectan un error inyectado en `setGalaxy` y en
  `setTV`. Todo en verde, también los 40 idiomas.
- **Siguiente:** pendiente 1 (auditar director, modo TV, mundo abierto y galaxias), luego 2 (efectos 3D
  acumulados mientras la vista no dibuja).

### 2026-10-08 · Iteración 6

- **Sincronización.** El PR #16 se fusionó; la rama se reinició desde master y luego avanzó hasta #28
  (vista 2D con efectos y minimapa, línea de tiempo 3D, pruebas e2e locales). Con `npm ci` se instaló
  Electron y las 11 pruebas e2e (sin la lenta) pasaron antes y después del cambio.
- **Auditoría** del código que había llegado sin revisar (director, modo TV, mundo abierto, galaxias y
  las vistas de #26 y #27): sin problemas de seguridad ni escuchas duplicadas; 7 hallazgos, 5 de ellos
  reproducidos en Chromium. Quedan como pendientes 1–6.
- **Arreglo: el director de cámara ya no le quita la nave al piloto.** Encenderlo en pleno vuelo lo
  dejaba al mando: sus cortes teletransportaban la nave y su deriva la movía cada cuadro. Entrar al modo
  TV volando dejaba la pantalla congelada en primera persona con la interfaz del vuelo. Además, en modo
  TV echaba del vuelo a quien pilotaba activamente, porque volar no contaba como interacción. Ahora el
  director se enciende a la espera si hay vuelo, el modo TV sale del vuelo al entrar y pilotar cuenta
  como usar la cámara.
- **Pruebas nuevas en el smoke:** encender el director volando (el botón debe quedar "a la espera") y
  entrar al modo TV volando (el vuelo debe terminar). Las dos fallaban antes del arreglo.
- **Herramientas:** el smoke acepta `PLAYWRIGHT_CHROMIUM_PATH`, como las e2e: con `node_modules`
  instalado toma el Playwright del proyecto, que busca otro Chromium.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (`readTheme` en cada movimiento del ratón en modo TV), luego 2 (campo de
  visión tras cortar un salto).

### 2026-10-08 · Iteración 7

- **Arreglo: en modo TV, mover el ratón ya no vuelve a leer el tema ni redibuja el grafo.** `wake()`
  quitaba la clase `tv-idle` de `<html>` en cada movimiento, aunque no estuviera, y los observadores de
  las vistas 3D y 2D releían todos los colores ante cualquier escritura de clase: cada movimiento
  marcaba los materiales 3D para subirlos de nuevo y reescribía cada nodo y arista del grafo 2D oculto.
  Ahora hay un solo observador del tema, `U.onThemeChange` (`util.js`), que usan las dos vistas: avisa
  solo si cambia `data-theme`, el tema del sistema o una clase de `<html>` que pueda cambiar colores
  (no `tv-idle`, que solo esconde el puntero y la barra). `wake()` toca la clase solo si está.
- **Prueba nueva en el smoke:** en modo TV cuenta las lecturas del tema durante 30 movimientos del
  ratón (antes 90, ahora 0) y comprueba que cambiar `data-theme` sí lo relee.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (campo de visión tras cortar un salto hiperespacial), luego 2 (rótulo de
  llegada a una galaxia para lectores de pantalla).

### 2026-10-08 · Iteración 8

- **Arreglo: cortar un salto hiperespacial ya no deja mal el campo de visión.** El túnel del salto abre
  el campo de visión hasta 70°, y solo el aterrizaje lo devolvía. Si se cortaba a mitad (pasar a 2D,
  apagar las galaxias, cambiar de repo), la cámara se quedaba así hasta salir del modo vuelo. Ahora lo
  restaura `endHyper()`, por donde pasan el aterrizaje y todos los cortes; y al desactivar la vista 3D
  el salto se corta antes de salir del vuelo, para que quede el campo de visión de la órbita.
- **Prueba nueva en el smoke** (página propia, toma la instancia 3D desde la prueba): salta a otra
  galaxia, pasa a 2D en pleno túnel, vuelve a 3D y compara el campo de visión. Antes del arreglo
  quedaba en 68,9° (era 46°); después, igual al de antes del salto.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (rótulo de llegada a una galaxia para lectores de pantalla), luego 2
  (foco al entrar y salir del modo TV).

### 2026-10-08 · Iteración 9

- **Arreglo: al llegar a una galaxia, el lector de pantalla ya no lee el nombre "descifrándose".** El
  rótulo de llegada era una región `role=status` (atómica) y su nombre se reescribía cada cuadro durante
  800 ms con glifos al azar: un lector podía anunciar "Entrando en m>\\▒" una y otra vez, en cada galaxia
  que recorre el director en modo TV. Ahora el rótulo visual es `aria-hidden` y un texto aparte, solo
  para lectores (`gx-arrive-say`, `role=status`), dice el rótulo entero ("Entrando en main. 5 commits ·
  hace 2 d") y se escribe solo cuando cambia.
- **Prueba nueva en el smoke:** en modo galaxias entra a otra galaxia y registra lo que puede leer un
  lector del rótulo durante 4 s: que no haya glifos del efecto, que cambie como mucho 3 veces y que
  incluya el nombre. Antes del arreglo leía versiones a medio descifrar.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (foco al entrar y salir del modo TV), luego 2 (zumbido del espacio en modo
  TV y con la pestaña oculta).

### 2026-10-08 · Iteración 10

- **Arreglo: el modo TV ya no pierde el foco del teclado, y `Esc` sale.** El botón TV está en la barra
  que el modo esconde y el de salir en la barra del modo, que se esconde al volver: al entrar o salir
  con el teclado el foco caía al `<body>`, y no había tecla para salir. Ahora, al entrar, el foco pasa
  al grafo (donde están los atajos: espacio, `F`, `Esc`); al salir con el botón de la barra, vuelve al
  botón TV; y `Esc` sale del modo. Si `Esc` cerró antes una ficha del grafo o aterrizó el vuelo, no
  hace nada más (esos manejadores ahora lo marcan con `preventDefault`). README: `Esc` en los controles
  del modo TV.
- **Prueba nueva en el smoke:** entra al modo TV con Enter sobre el botón (el foco debe quedar en el
  grafo), sale con `Esc`, y vuelve a entrar y sale con el botón de la barra (el foco debe volver al
  botón TV). Antes del arreglo el foco quedaba en `BODY`.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (zumbido del espacio en modo TV y con la pestaña oculta), luego 2
  (consulta de archivos del repo anterior en las galaxias del nuevo).

### 2026-10-08 · Iteración 11

- **Arreglo: los zumbidos se callan con la pestaña oculta y al entrar al modo TV.** El zumbido del
  espacio (galaxias) y el motor del vuelo solo bajan de volumen desde el cuadro a cuadro, que se detiene
  con la pestaña en segundo plano: quedaban sonando indefinidamente. Ahora, al ocultarse la pestaña, los
  dos se callan, y al volver se vuelven a pedir; los avisos de actividad siguen sonando en segundo
  plano. Además, el modo TV apaga el sonido pero no avisaba a las galaxias (sus botones de sonido sí):
  ahora llama a `pokeAmbience()`, así el zumbido sigue al sonido al instante y no recién cuando la
  cámara cambia de galaxia.
- **Prueba nueva en el smoke** (página propia, registra el volumen pedido al zumbido): con sonido y
  galaxias, ocultar la pestaña lo calla y volver lo recupera; entrar al modo TV lo calla y salir lo
  recupera. La parte de la pestaña oculta fallaba antes del arreglo. La del modo TV no alcanza a
  distinguirlo en la demo, porque el director mueve la cámara enseguida y eso ya vuelve a pedir el
  zumbido; queda como guarda.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (consulta de archivos del repo anterior en las galaxias del nuevo), luego 2
  (efectos 3D acumulados mientras la vista no dibuja).

### 2026-10-09 · Iteración 12

- **Arreglo: cambiar de repo mientras cargan los archivos de una galaxia ya no los deja en el nuevo.**
  La consulta pendiente guardaba sus archivos en `lastData` aunque `reset()` ya hubiera limpiado todo al
  cambiar de repo; y `lastData` es lo que se muestra mientras llegan los archivos nuevos. La rama del
  mismo nombre en el repo nuevo (típicamente `main`) mostraba los planetas y enlaces del anterior hasta
  que llegaran los suyos, o para siempre si su consulta fallaba (por ejemplo, un 403 sin token). Ahora
  `reset()` sube un contador de generación y las respuestas de una generación anterior no se guardan
  ni se muestran.
- **Prueba nueva en el smoke** (página de galaxias): retiene la respuesta de archivos de la demo, llama a
  `reset()` como hace `connect()` al cambiar de repo, la suelta y comprueba que no quede nada. Antes del
  arreglo quedaban los archivos de `main`.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (efectos 3D acumulados mientras la vista no dibuja), luego 2 (osciladores de
  los zumbidos que nunca se detienen).

### 2026-10-09 · Iteración 13

- **Arreglo: lo que llega mientras la vista 3D no se ve ya no se acumula para cuando vuelve.** En 2D o
  con la pestaña oculta, `update()` seguía preparando efectos de llegada (ondas y chispas en la cola
  `pending`, commits por desvanecer en `dying`). Esas colas solo se vacían cuadro a cuadro, que no corre
  en esos casos: al volver a la 3D salían todas juntas, cada una con su malla y su material. Ahora
  `update()` no prepara efectos si la vista no está activa o la pestaña está oculta (los commits
  aparecen ya en su lugar), y `stepFx` descarta los efectos programados que se atrasaron más de un
  segundo.
- **Prueba nueva en el smoke** (página propia, toma la instancia 3D): con la vista en 2D espera a que la
  demo traiga commits y comprueba que la 3D no dejó nada en cola. Antes del arreglo quedaba un efecto
  por cada tanda.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (osciladores de los zumbidos que nunca se detienen), luego 2 (contraste del
  texto secundario en el tema claro).

### 2026-10-09 · Iteración 14

- **Arreglo: los zumbidos apagados dejan de generar audio.** El motor del vuelo y el zumbido del
  espacio creaban sus osciladores la primera vez y después solo bajaban el volumen a 0: tras el primer
  vuelo o la primera visita a las galaxias quedaban 2 y 5 osciladores sonando en silencio para siempre,
  y el contexto de audio seguía trabajando. Ahora, cuando un zumbido queda en 0, al terminar de
  desvanecerse (1,5 s el motor, 4 s el espacio) se detienen sus osciladores y se suelta; si vuelve a
  sonar antes, sigue; si suena después, se crea de nuevo (`letGo`/`keep` en `sound.js`).
- **Pruebas nuevas en el smoke** (cuentan osciladores iniciados y detenidos): apagar las galaxias deja
  0 osciladores vivos a los 5 s, y aterrizar tras acelerar deja los del motor en 0. Sin el arreglo
  quedaban 5 y 2.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (contraste del texto secundario en el tema claro), luego 2 (avisos que no
  se pueden retener con el teclado).

### 2026-10-09 · Iteración 15

- **Arreglo: el texto secundario del tema claro ya se lee bien.** `--ink-3: #78837f` daba 3,45–3,82:1
  sobre los fondos del tema claro (WCAG AA pide 4,5:1 para texto normal), y es el color de etiquetas y
  cifras secundarias, la actividad (tipo, autor, hora), los chips, la ayuda y las teclas: 108 textos
  visibles en la demo quedaban por debajo. Ahora es `#636e6a` (4,65–5,14:1). El tema oscuro ya cumplía.
  Los valores de respaldo repetidos en `graph.js`, `graph3d.js` y `world.js` siguen al nuevo.
- **Prueba nueva en el smoke:** recorre todo el texto visible de la página, en tema claro y oscuro, y
  calcula su contraste contra el fondo efectivo (mezclando fondos semitransparentes): 4,5:1, o 3:1 si
  es grande. Quedan fuera los grafos (colores de cada rama sobre el lienzo) y lo escondido. Sin el
  arreglo marcaba los 108 textos; con él, ninguno en los dos temas.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (avisos que no se pueden retener con el teclado), luego 2 (sin GraphQL, una
  consulta por cada PR que sale de la página).

### 2026-10-09 · Iteración 16

- **Arreglo: los avisos se retienen también con el teclado y se anuncian una sola vez.** La pausa del
  aviso solo respondía al puntero: con el foco adentro se cerraba igual a los 6 s y el foco caía al
  `<body>`. Además cada aviso era `role=status`/`alert` dentro del contenedor `aria-live`: regiones
  vivas anidadas, que algunos lectores anuncian dos veces. Ahora el aviso espera con el puntero encima
  o con el foco adentro (un solo estado para los dos); si se cierra con el teclado, el foco pasa al
  aviso siguiente; cuando hay más de tres, se va el más viejo que no se esté leyendo; y la única región
  viva es el contenedor.
- **Prueba nueva en el smoke:** con un aviso en pantalla comprueba que no haya regiones vivas anidadas y
  que, con el foco adentro, siga ahí pasados 7 s. Las dos partes fallaban por separado sin el arreglo.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (sin GraphQL, una consulta por cada PR que sale de la página), luego 2 (un
  error 5xx suelto apaga funciones para toda la sesión).

### 2026-10-09 · Iteración 17

- **Arreglo: sin token, los PRs que solo salen de la página de abiertos ya no cuestan una consulta
  cada uno.** Se siguen los 50 PRs abiertos actualizados más recientemente; cuando otros se actualizan,
  algunos salen de esa página aunque sigan abiertos, y para saber si se cerraron se pedía cada uno
  (hasta 20 por ciclo, con una cuota de 60 por hora sin token). Ahora es una sola consulta a la página
  de PRs actualizados hace poco, abiertos o no (`pulls-all`, la misma que ya usaba el feed): uno que se
  fusionó o cerró acaba de actualizarse y está ahí; el que no está sigue abierto. Solo para los
  fusionados se pide el PR, porque la lista no dice quién lo fusionó.
- **Prueba nueva** en `tools/github.test.mjs` (la API simulada ahora sirve PRs como GitHub, sin
  `merged_by` en las listas): con 60 PRs abiertos, tres viejos se actualizan y desplazan a otros tres,
  uno se fusiona y otro se cierra. Se avisan la fusión (con quien fusionó) y el cierre, y solo se pide
  el PR fusionado. Antes del arreglo se pedían los cuatro que salieron de la página.
- Validado: 8 pruebas, smoke, i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (un error 5xx suelto apaga funciones para toda la sesión), luego 2 (el foco
  al pulsar **Fijar** en el detalle).

### 2026-10-10 · Iteración 18

- **Arreglo: un error pasajero del servidor ya no apaga funciones para toda la sesión.** Cualquier error
  que no fuera de red ni de cuota (un 502 suelto, por ejemplo) apagaba la API de actividad hasta
  recargar, y en la carga inicial cualquier error HTTP de GraphQL pasaba a REST para siempre: con token,
  la sesión entera quedaba con el modo más pobre por un tropiezo de GitHub. Ahora solo se degrada con
  errores que dicen que la función no está disponible (400, 403, 404, 410, 422 o un error propio de
  GraphQL); los demás cortan el ciclo o se saltan y se reintentan en el siguiente.
- **Pruebas nuevas** en `tools/github.test.mjs` (la API simulada responde a pedido): un 502 de la API de
  actividad no la apaga y un 403 sí; un 502 de GraphQL en la carga inicial falla el ciclo y sigue en
  GraphQL, y un error propio de GraphQL sí pasa a REST. Las dos fallaban antes del arreglo.
- Validado: 10 pruebas, smoke, i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (el detalle pierde el foco al pulsar **Fijar**), luego 2 (con movimiento
  reducido, la ayuda del vuelo no se ve).

### 2026-10-10 · Iteración 19

- **Sincronización.** Master trajo #42 (varios repos a la vez, cada uno en su pestaña); la rama se
  adelantó a master y todo siguió en verde (11 pruebas, smoke, i18n y 12 e2e).
- **Arreglo: el botón Fijar de la ficha conserva el foco.** Al fijar o soltar una rama, el botón se
  reemplazaba con `outerHTML`: quien lo pulsaba con el teclado perdía el foco, que caía al `<body>`.
  Ahora se actualiza en su lugar (`aria-pressed` y el texto). Sirve para las dos vistas, que comparten
  el helper (`wirePinButton`). El pendiente queda en la otra mitad: que la ficha reciba el foco al
  abrirse con el teclado.
- **Prueba nueva en el smoke** (con el GitHub simulado de #42, porque en la demo no se puede fijar): en
  2D abre la ficha de una rama con Enter sobre su etiqueta, pulsa Fijar con Enter y comprueba que el
  foco sigue en el botón y que cambió de estado. Antes del arreglo quedaba en `BODY`.
- Validado: 11 pruebas, smoke (40 idiomas), i18n y 12 e2e en verde.
- **Siguiente:** pendiente 1 (foco a la ficha al abrirse con el teclado), luego 2 (con movimiento
  reducido, la ayuda del vuelo no se ve).

### 2026-10-10 · Cambio de objetivo: ampliar el alcance

- **Pedido de Benjamin:** que el loop amplíe lo más posible el alcance del proyecto. Las iteraciones
  pasan a ser de **expansión** (una capacidad nueva por PR) salvo una de cada cuatro, de
  mantenimiento. Las reglas están en [Directiva vigente](#directiva-vigente-ampliar-el-alcance); el
  punto de partida, en el [Mapa de alcance](#mapa-de-alcance) y la [Hoja de ruta](#hoja-de-ruta), que
  sale de recorrer lo que hay hoy (una sola fuente de datos, solo web y escritorio, hasta 10 repos, sin
  salidas fuera de la app) y de los huecos frente a herramientas parecidas.
- Los pendientes de mantenimiento quedan como estaban, con su orden.
- **Siguiente:** iteración 20, expansión: ítem 1 de la hoja de ruta (instalable y sin conexión). La
  21 y la 22 también son de expansión; la 23, de mantenimiento (pendiente 1).

### 2026-10-10 · Iteración 20 · Expansión · Plataformas

- **Capacidad nueva: la web se instala y abre sin red** (ítem 1 de la hoja de ruta). En el celular o
  el escritorio se instala como una app más, sin Electron, y después de la primera visita abre aunque
  no haya red: la demo entera, y los repos de GitHub con el aviso de que esperan la conexión (siguen
  solos cuando vuelve, como ya hacían).
  - `manifest.webmanifest`: nombre, colores e íconos de `icons/` (192 y 512, uno adaptable para
    Android y el de iOS), sacados de `electron/icon.png`. `index.html` suma `theme-color` para el tema
    claro y el oscuro.
  - `sw.js`: al instalarse guarda la página, el manifiesto, los íconos y todo `css/`, `js/` y
    `vendor/` (93 archivos, ~950 KB comprimidos, la mayoría ya en la caché HTTP). Con red pide primero
    a la red y pone al día la copia, así que quien está conectado siempre ve la última versión y
    publicar no exige subir un número de versión; sin red sirve la copia. La query string no cuenta
    (`?repo=` abre igual). Usa *navigation preload* para que el arranque del worker no demore la
    página. Nunca toca `api.github.com`, los avatares ni otro sitio: esas peticiones no pasan por él.
  - `js/pwa.js` lo registra después de cargar la página y solo por `http(s)` (en la práctica, https o
    localhost): ni `file://` ni `app://` de la app de escritorio.
  - CSP: `manifest-src 'self'`, `worker-src 'self'` e `img-src 'self'`. Lo último no estaba previsto:
    Chromium carga los íconos del manifiesto como imágenes de la página y, sin `'self'`, el CSP los
    bloqueaba y la página dejaba de ser instalable (`no-acceptable-icon`).
- **Pruebas que fallan sin la capacidad:**
  - `tools/pwa.test.mjs` (8 pruebas, `node --test`): `sw.js` en un contexto aislado con caché y red
    falsas. `FILES` coincide con los archivos de `icons/`, `css/`, `js/` y `vendor/` (si alguien suma
    un archivo y no lo agrega, falla); la instalación guarda todo revalidando; nunca responde por la
    API, los avatares, otro sitio, un POST ni el propio worker; con red pone al día la copia y sin red
    la sirve; un 404 no pisa la copia buena; al activarse borra lo que ya no está. Además, el
    manifiesto (tamaños reales de los PNG) y las directivas del CSP. Comprobado que fallan quitando el
    filtro de origen o un archivo de la lista.
  - e2e web: con un servidor propio carga la página, espera a que el worker la controle, pregunta a
    Chromium si es instalable (`Page.getInstallabilityErrors`: ningún error, salvo el de incógnito
    propio de las pruebas), apaga el servidor, pasa a sin conexión, recarga y ve la demo con sus
    librerías y fuentes, abre `?repo=` y ve el aviso de sin conexión, y comprueba que en la caché no
    hay nada de otro sitio. Sin `js/pwa.js`, falla.
  - `e2e/serve.mjs` exporta `serve(port)` para esa prueba y sirve `.webmanifest` y `.txt` con su tipo.
- README: la función en la lista, cómo se instala, la lista `FILES` al publicar, la estructura,
  Límites conocidos (solo https o localhost, la primera visita necesita red, sin red solo la demo) y
  Seguridad (qué guarda el worker y qué no, y las directivas nuevas del CSP).
- Validado: 19 pruebas (`node --test`), smoke, i18n (sin textos nuevos) y 13 e2e en verde.
- **Siguiente:** iteración 21, expansión: ítem 2 (exportar imagen y video, eje Salidas). La 22 también
  es de expansión; la 23, de mantenimiento (pendiente 1).

### 2026-10-10 · Iteración 21 · Expansión · Salidas

- **Capacidad nueva: guardar la vista como imagen** (primera entrega del ítem 2 de la hoja de ruta; la
  segunda, grabar el Replay en video, queda como ítem 3). Un botón con una cámara de fotos en la barra
  del grafo descarga un PNG de la vista tal como se ve, en 3D o en 2D y en cualquier modo (galaxias,
  vuelo, tema claro u oscuro), con una franja abajo con el repo, la fecha y el nombre de la app. Un
  aviso dice el nombre del archivo, también al lector de pantalla.
  - `js/snapshot.js` arma la imagen en un canvas. En 3D, `Graph3D.renderNow()` dibuja la escena y se
    copia en la misma tarea (WebGL no conserva el cuadro). En 2D, el SVG se clona con sus estilos ya
    resueltos y se pasa a imagen por tandas de grupos, en el orden en que se pintan, a 2× de
    resolución. Los textos (del SVG y de las etiquetas HTML) se escriben con el canvas de la página,
    porque un SVG convertido en imagen no puede cargar las fuentes de la página. Las etiquetas,
    paneles y el minimapa se pintan como cajas con fondo, borde, radio y texto, ordenadas por
    `z-index` y con su opacidad (las etiquetas tapadas salen atenuadas, como se ven). Cada línea de
    texto se ubica por las cajas de sus letras y se escribe en su dirección: probado con la interfaz
    en árabe en modo vuelo (la ayuda del teclado, la brújula y los indicadores) y en el Replay.
  - Sin `foreignObject` (Safari deja el canvas sin poder exportarse) y sin imágenes de otros sitios
    (los avatares harían lo mismo en cualquier navegador). El CSP no cambia: la imagen del SVG va como
    `data:`, que `img-src` ya permite, y la descarga es un enlace `blob:`.
  - App de escritorio: `will-download` guarda la imagen en la carpeta de descargas sin preguntar y sin
    pisar otra (`… (1).png`); solo acepta `.png` que vengan de `blob:app://graphbranch/`.
- **Pruebas que fallan sin la capacidad:**
  - Smoke: en 2D, con la demo en pausa, guarda la imagen y comprueba el PNG (firma, proporciones de la
    vista más la franja, nombre del archivo, el aviso) y que en el centro de cada commit a la vista la
    imagen tenga el color de su rama. En 3D, que la imagen tenga la escena: con ella salen más de
    1.000 colores; leyendo el canvas fuera de la tarea en que se dibujó, solo el fondo y las
    etiquetas, unos 125 (medido); el umbral es 500.
  - e2e de escritorio: dos clics dejan dos PNG en la carpeta de descargas (el segundo con `(1)`), y la
    ventana no navega. Sin el manejador de descargas, Electron abre un diálogo y la prueba falla
    (comprobado).
- README: la función en la lista y en Controles, la estructura, las pruebas, Límites conocidos (qué no
  se copia) y Seguridad (nada sale de la página; qué descargas acepta la app de escritorio).
- `sw.js` suma `js/snapshot.js` a lo que guarda para abrir sin red (la prueba de #45 lo pidió).
- Validado: 19 pruebas (`node --test`), smoke (40 idiomas), i18n (4 textos nuevos en los 40 idiomas)
  y 14 e2e en verde.
- **Siguiente:** iteración 22, expansión. El primer ítem sin hacer es el 3 (video del Replay), del
  mismo eje que esta (Salidas), y entre los tres primeros hay otros ejes: toca el 4, **GitLab**
  (Fuentes). La 23 es de mantenimiento (pendiente 1).
