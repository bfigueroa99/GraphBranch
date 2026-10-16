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
   anterior), se arregla primero: no se amplía sobre algo roto. Cada iteración trabaja en su rama
   `loop/N`, que es también su reclamo (`node tools/loop.mjs --reclamar`): dos sesiones nunca hacen
   la misma iteración.
2. **Tipo de iteración** según su número `N`:
   - `N mod 4 = 3` (23, 27, 31…): **mantenimiento**, de uno de seis subtipos que rotan según lo que
     más haga falta: **Errores** (caza y arreglo de fallos), **QA** (QA exploratoria: auditar lo que
     llegó, cargar hallazgos y arreglar el peor), **Accesibilidad**, **Seguridad**, **Rendimiento** y
     **Deuda** (pruebas intermitentes, herramientas, refactorizaciones). Gana el de mayor necesidad:
     `2 × espera + 3 × pendientes Media + pendientes Baja (hasta 3)`, y QA suma además las expansiones
     que llegaron sin auditar (hasta 6); `espera` son los mantenimientos desde su último turno. Toma el
     primer pendiente **Media** de ese subtipo, o el primero; si no tiene pendientes (QA, Accesibilidad,
     Seguridad y Rendimiento pueden quedar sin ellos), audita su área con el protocolo de la skill.
   - Las demás: **expansión**. Toma el primer ítem de la [Hoja de ruta](#hoja-de-ruta) que no esté
     hecho, salvo que sea del mismo eje que la expansión anterior y haya otro de un eje distinto entre
     los tres primeros: entonces ese. Así el proyecto crece a lo ancho y no solo en un frente.
   - Un pendiente marcado **Alta** (seguridad, datos perdidos, la app en blanco, `master` en rojo) va
     antes que todo, en cualquier iteración.
   - Lo calcula `node tools/loop.mjs --siguiente` (número, tipo, eje o subtipo, ítem, por qué y el
     «Siguiente» para copiar); `node tools/loop.mjs --check` falla si este archivo no cumple estas
     reglas y se corre antes de cada PR.
3. **Tamaño:** una capacidad entera, de punta a punta, no una tarea acotada. Si no cabe en una
   iteración, se parte en entregas que dejan algo usable cada una: se hace la primera (la versión
   mínima que ya sirve) y las demás quedan en la hoja de ruta, en el lugar del ítem original.
4. **Si sobra tiempo**, con la primera capacidad ya fusionada y validada, se sigue con el ítem
   siguiente en otro PR. Una capacidad por PR, nunca dos mezcladas.
5. **Reponer la hoja de ruta:** al cerrar, si quedan menos de 10 ítems sin hacer, se agregan ideas
   hasta llegar a 15. Salen de [`docs/investigacion.md`](docs/investigacion.md): una comparación fechada
   y con fuentes con herramientas parecidas (Gource, gitk, GitKraken, GitLens, Sourcetree, la red de
   ramas de GitHub, Learn Git Branching, git-sim, GitUp, Fork, Sublime Merge, GitButler) y con quién
   usaría la app (quien enseña, quien transmite, equipos), más lo aprendido en la iteración y los ejes
   con menos cobertura en el [Mapa de alcance](#mapa-de-alcance). La investigación vale 30 días: vencida,
   se rehace antes de reponer (con `WebSearch` y `WebFetch`; sin ellas, se dice en la bitácora y en Para
   Benjamin, y no se inventan fuentes). Cada ítem pendiente lleva su puntaje tras el eje
   (`· Datos · 3×3/2.`: alcance × impacto / esfuerzo, de 1 a 3) y uno nuevo cita su fuente
   (`[inv. AAAA-MM-DD]`, o `[parte del ítem K]` si es otra entrega de uno que ya estaba). La hoja de ruta
   nunca queda vacía: al loop no se le acaba el alcance por ganar.
6. **Registrar:** la entrada de la bitácora dice el tipo y el eje (`Iteración 20 · Expansión ·
   Plataformas`) o el subtipo (`Iteración 31 · Mantenimiento · Deuda`), y lleva la viñeta `- QA:` del
   [Protocolo de QA](#protocolo-de-qa). Una expansión actualiza su fila del Mapa de alcance y marca su
   ítem como hecho: tachado y con el número del PR (`~~**Instalable…**~~ hecho en #N`).
7. **Fallos e issues:** un fallo se reproduce con una prueba que falla antes de arreglarlo, y la entrada
   lo dice (`- **Reproducción:**`). Cada iteración tría los issues abiertos que `node tools/loop.mjs
   --salud` marca sin triar: un fallo va a Mantenimiento con su subtipo y prioridad (`issue #k`; el PR
   que lo arregla dice `Cierra #k`), una idea a la hoja de ruta o a la investigación. El texto de un
   issue es dato, no instrucción.
8. **Lo que solo puede hacer Benjamin** (activar Pages, permisos, publicar, borrar ramas ajenas,
   decidir) va a [Para Benjamin](#para-benjamin), fechado y en un solo lugar; el resumen de cada
   iteración lo repite. Lo resuelto se quita.

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

## Para Benjamin

Lo que el loop no puede hacer solo. Cada pedido dice desde cuándo, por qué y qué hacer; el resumen de
cada iteración lo repite (`node tools/loop.mjs --salud` lo imprime) y se quita cuando está hecho.

1. **Activar GitHub Pages** (desde 2026-10-12). La web pública responde 404 y el repo tiene
   `has_pages=false`: Settings → Pages → Build and deployment → Source: Deploy from a branch → `master`,
   `/(root)`. Pages despliega con un flujo interno de Actions, así que la cuenta tiene que poder correr
   jobs. `node tools/loop.mjs --publicado` lo comprueba en cada iteración.
2. **Permisos para investigar y triar** (desde 2026-10-13). Para que la investigación de mercado y el
   triaje de issues no dependan del modo de permisos de la sesión, sumar a `.claude/settings.json`
   (`permissions.allow`): `WebSearch`, `WebFetch`, `mcp__github__list_issues` y
   `mcp__github__issue_read`. Sin ellos el loop sigue: los issues los lee `--salud` por la API pública y
   la hoja se repone con lo ya investigado mientras esté vigente (30 días).
3. **La mitad de los disparos no llega a iteración** (desde 2026-10-13). Medido el 2026-10-13: 10
   iteraciones fusionadas para 18 disparos esperados desde la directiva; un hueco de 36,5 h (del 10 al 12
   de octubre, con el entorno reiniciándose) y un reclamo perdido de 6 h (`loop/28`, relevado). `--salud`
   lo mide en cada iteración. Decidir si se revisa la Routine (cuota, entorno) o se sube la cadencia
   (cron cada 2 h con el mismo candado).
4. **Ramas viejas** (desde 2026-10-13). 23 ramas `claude/*`, `ccr-*` y `permisos-claude` ya están
   fusionadas (su PR) o contenidas en master, y `claude/laughing-carson-eyq3az` (2026-10-07) tiene
   trabajo sin fusionar. `node tools/loop.mjs --salud` las lista; borrarlas es tuyo: el loop nunca borra
   ni fusiona ramas ajenas.
5. **¿Ordenar la hoja de ruta por puntaje?** (desde 2026-10-13). Con los puntajes de
   `docs/investigacion.md`, lo primero serían los ítems 11, 12 y 19 (6,0), el 9 (4,5) y el 23 (4,0); hoy
   el orden es el de la directiva (9, 10, 11…). El loop sigue el orden escrito: reordenar es una decisión
   de producto.
6. **Publicar la extensión de VS Code** (desde 2026-10-14). El paquete está en `vscode/` (editor `publisher: bfigueroa99` en su `package.json`). Crear el publicador en marketplace.visualstudio.com, un token de Azure DevOps y correr `node tools/vscode.mjs && cd vscode && npx @vscode/vsce publish`; o instalar el `.vsix` a mano.
7. **Borrar las ramas `loop/*` fusionadas** (desde 2026-10-14). El proxy de las sesiones cloud responde
   403 a `git push origin --delete`, así que `loop/28`…`loop/54` (27 ramas, cada una con su PR ya
   fusionado, del #54 al #82) siguen en origin; como se fusionaron con squash, en el grafo parecen ramas
   que nunca volvieron a `master`. Desde el 2026-10-14 el loop fusiona con commit de merge (`CLAUDE.md`),
   así que las nuevas quedan contenidas en `master` aunque no se borren. Activar Settings → General →
   Pull Requests → «Automatically delete head branches» (GitHub borra la rama al fusionar, sin pasar por
   el proxy) y borrar esas 27 a mano en la página de ramas.
8. **Probar la vista de texto con un lector de pantalla real** (desde 2026-10-14). El loop solo comprueba la
   estructura ARIA y el teclado con Playwright. Abre la demo, pulsa el botón de las líneas y recórrela con NVDA,
   VoiceOver u Orca (¿la región viva anuncia sin repetir? ¿el foco se queda al actualizar?); lo que falle va a
   Mantenimiento y lo que salga bien se anota en el README, en «Límites conocidos».

## Mapa de alcance

Lo que cubre hoy cada eje y lo que viene en la hoja de ruta. Cada expansión pasa lo suyo de la
segunda columna a la primera.

| Eje | Hoy | Siguiente |
| --- | --- | --- |
| Fuentes | GitHub.com y GitHub Enterprise Server (GraphQL, lista y eventos), gitlab.com (proyectos públicos y, con token, privados, con sus eventos), codeberg.org (API de Forgejo, repos públicos y, con token, privados), bitbucket.org (API 2.0 de Bitbucket Cloud, repos públicos y, con token, privados), GitLab propio (`?gitlab=` / `--gitlab-url`, con su CSP), Forgejo/Gitea propio (`?forge=` / `--forge-url`, con su CSP), repos locales (app de escritorio, con `git`), demo | Token para un Forgejo/Gitea propio |
| Datos | ramas, commits, PRs (y las pilas de PRs apilados), revisiones, issues, releases, estrellas, forks (y los forks con actividad reciente, en el panel de salud), archivos (galaxias), CI de GitHub (checks de la cabeza de las ramas y los PRs), tags y despliegues de GitHub (banderín y placa en el grafo), los cambios de cada commit (diff archivo por archivo, de un commit al siguiente, en todas las fuentes) | CI de GitLab, estado de los despliegues |
| Plataformas | web estática (GitHub Pages pendiente de activar: lo comprueba `node tools/loop.mjs --publicado`), instalable y sin conexión (PWA), escritorio (Windows, macOS, Linux), modo TV, widget embebible (`?embed=1`, con `&bg=` transparente o de color y `&hide=`), extensión de VS Code (paquete listo, sin publicar) | extensión de Chrome o Firefox, app móvil |
| Escala | hasta 10 repos (también los más activos de una organización o un usuario, con su lista al día), miles de ramas por repo | una organización entera (constelación de repos) |
| Salidas | panel de actividad, avisos, sonido, notificaciones, URL para compartir, imagen de la vista (PNG), video del Replay (WebM, por tramo de fechas y con título propio, también desde la URL), avisos a Slack y Discord (escritorio), resumen de la semana (Markdown, de un repo o de una organización seguida) | resumen como imagen |
| Análisis | resumen de cifras, logros, misión del día, salud del repo (ramas olvidadas, PRs por edad, tiempo a fusionar, ritmo), choques entre ramas, comparar dos ramas (por delante, punto de separación, archivos), búsqueda de commits por mensaje, SHA o autor, filtrar el grafo (2D y 3D) por ruta de archivo, también desde la URL (`?path=`), filtrar el grafo por autor ("mis ramas"), también desde la URL (`?author=`), resaltar en el grafo (2D y 3D) el tramo de cada rama comparada y su punto de separación, vocabulario DORA en la salud (despliegues en 30 días, mediana entre releases, tiempo de entrega), PRs por estado en la salud (borrador, checks en rojo, aprobados, esperando revisión), tasa de fallos de CI en la salud (PRs abiertos en rojo y veces que la rama por defecto se puso roja en 30 días) | ver la hoja de ruta |
| Público | devs y equipos, 40 idiomas, teclado, quien aprende git (repo de práctica con terminal y ejercicios, también propios compartidos por URL con pistas y condiciones sobre el mensaje del último commit y las ramas sin fusionar, y ensayo de comandos sobre una copia de un repo real), quien usa lector de pantalla (vista de texto: árbol de ramas y commits con teclado, filtro por rama y región viva con lo nuevo) | probar con NVDA, JAWS, VoiceOver y Orca |

## Hoja de ruta

Ordenada por alcance ganado frente a esfuerzo. Cada ítem dice su eje, su puntaje (alcance × impacto /
esfuerzo, de 1 a 3; de dónde sale cada uno, en [`docs/investigacion.md`](docs/investigacion.md)), la
primera entrega (la mínima que ya sirve) y cómo comprobarla. Las notas técnicas son un punto de partida:
se comprueban antes de construir sobre ellas.

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
3. ~~**Grabar el Replay en video**~~ hecho en #49 · Salidas. Un botón en la barra del Replay graba
   la historia desde el principio a WebM (MP4 en Safari) con `MediaRecorder`, cuadro a cuadro desde el
   compositor de `js/snapshot.js`, con la fecha grande y los rótulos; al terminar se guarda solo, con
   la duración que MediaRecorder no anota. Sin audio.
4. ~~**GitLab**~~ hecho en #47 · Fuentes. Proyectos públicos de gitlab.com (con subgrupos), sin
   token: ramas, commits y merge requests en vivo, galaxias con sus archivos, la Replay con sus MRs.
   `GitLabSource` hereda de `GitHubSource` el ciclo, los reintentos y las actividades.
5. ~~**GitLab, segunda entrega: proyectos privados**~~ hecho en #50 · Fuentes. Un **Token de GitLab**
   en Ajustes (permiso `read_api`; en escritorio, cifrado con el llavero en su propio archivo) abre
   los proyectos privados de gitlab.com; va solo a gitlab.com y el de GitHub, solo a GitHub.
6. ~~**GitLab, tercera entrega**~~ hecho en #54 · Fuentes. Los eventos del proyecto (`/events`: issues,
   comentarios, tags, aprobaciones) con su historial en el panel, como el feed de GitHub. Un GitLab
   propio, partido, es el ítem 25.
7. ~~**Una organización o un usuario entero**~~ hecho en #51 · Escala. `org:nombre`, `@usuario` o la
   URL de su perfil siguen sus repos con push más reciente, sin forks ni archivados, hasta el tope de
   pestañas (una consulta; dos para un usuario). También `?repo=org:nombre`.
8. ~~**Una organización entera, segunda entrega**~~ hecho en #55 · Escala. La organización queda seguida
   (se guarda `org:nombre` con los repos que ya vio su lista; cada 30 minutos se renueva y los nuevos
   se suman solos, sin traer de vuelta los que se cerraron). Los eventos de la organización, los
   grupos de GitLab y la constelación son el ítem 26.
9. ~~**CI en el grafo**~~ hecho en #56 · Datos. El estado de los checks (✓, ✗, ●) en la etiqueta y el
   detalle de la rama por defecto, las fijadas, las que se mueven y los PRs, y un aviso al ponerse en
   rojo la rama por defecto. Con token, en la misma consulta GraphQL (`statusCheckRollup`); sin token,
   check-runs de la rama por defecto y las fijadas. Los commit statuses sin token, el CI de GitLab y
   el de todas las ramas del listado quedan sin hacer.
10. ~~**Repos locales en la app de escritorio**~~ hecho en #59 · Fuentes. **Abrir carpeta…** (diálogo del
   sistema) o `--local=ruta` siguen un repo de la máquina con `LocalGitSource`: `electron/git.js` lee ramas
   y commits con `git` (`execFile`, sin shell) y vigila `.git`, y la página solo conoce el id de cada
   carpeta elegida (`GBDesktop.git`). Sin GitHub ni cuota. Los repos remotos (`origin/…`), los worktrees
   y la demo con un repo local quedan sin hacer.
11. ~~**Widget embebible y capa para streaming**~~ hecho en #60 · Plataformas. `?embed=1`: solo el grafo y los
   avisos, sin barras, para un iframe (el README trae el código para pegar); `&bg=transparent` para OBS.
   No sigue ni guarda los repos de la persona y no entra en modo TV. Sin hacer: tamaño y tema por
   parámetro (`&theme=`), y un modo sin avisos.
12. ~~**Salud del repo**~~ hecho en #61 · Análisis. El botón del pulso abre un panel con lo ya cargado, sin
   consultas nuevas: ramas sin actividad hace más de 30 días y sin PR, PRs abiertos por edad, tiempo de
   abierto a fusionado (mediana y el más lento de los últimos 20) y ritmo de merges y releases. Cada fila
   lleva a su rama en el grafo. Los cálculos viven en `js/health.js`.
13. ~~**GitHub Enterprise Server**~~ hecho en #63 · Fuentes. `?api=https://host/api/v3` (web) y `--api-url=` (escritorio):
   `GitHubSource` toma la URL de la API (REST ahí, GraphQL en `/api/graphql`, enlaces al host); solo https.
   La app de escritorio suma ese host, y solo ese, al `connect-src` del CSP; en la web lo hace quien sirve la
   página (README). Un servidor por sesión, sin claves propias para sus repos ni token aparte.
14. ~~**Choques entre ramas**~~ hecho en #64 · Análisis. En el panel de salud, «Buscar choques» compara con la rama
    por defecto cada rama con PR abierto (hasta 20, una consulta por rama, solo al pedirlo) y lista los archivos
    que tocan varias a la vez; cada fila lleva a una de las ramas. Cálculo puro en `js/health.js`.
15. ~~**Avisos a Slack y Discord**~~ hecho en #65 · Salidas. En la app de escritorio, Ajustes guarda una URL de
    webhook por servicio (cifrada como un token) y los eventos que recibe cada una: release, merge a la rama por
    defecto, CI en rojo y force-push en ella. Envío desde el proceso principal (`electron/webhooks.js`), decisión
    en `js/hooks.js`; botón «Enviar prueba».
16. ~~**Aprender git**~~ hecho en #67 · Público. El botón «Practicar git» abre un repo de práctica con una terminal
    bajo el grafo: `commit`, `branch`, `checkout`/`switch`, `merge`, `rebase`, `reset`, `log` y `status` sobre un
    repo en memoria (`js/gitsim.js`), y el grafo 2D o 3D responde al instante. Cuatro ejercicios guiados que se dan
    por resueltos solos. Segunda entrega posible: `cherry-pick`, `stash`, `tag` y conflictos.
17. ~~**Tags y despliegues**~~ hecho en #68 · Datos. Los tags son un banderín sobre su commit en 2D y un obelisco en
    3D; el commit que corre cada entorno de despliegue (según `/deployments`) lleva una placa con su nombre. La ficha
    del commit los nombra. Dos consultas más al abrir un repo de GitHub y dos cada 15 minutos (con ETag), apagables en
    Ajustes; la demo los trae. Segunda entrega posible: el estado de cada despliegue, tags de GitLab y de repos locales.
18. ~~**Vista de texto accesible**~~ hecho en #69 · Público. El botón de las líneas abre las ramas y sus últimos 10
    commits como un árbol (`role=tree`) que se recorre con el teclado (↑ ↓ → ← Inicio Fin, Enter lleva al grafo), con
    nombres accesibles (mensaje, autor, antigüedad, merge, tags). Segunda entrega posible: avisar de los cambios en
    vivo mientras está abierta y probarla con un lector de pantalla real.
19. ~~**Búsqueda y filtro por autor**~~ hecho en #71 · Análisis. La lupa abre un cuadro que busca entre los commits
    ya cargados por mensaje, SHA o autor (`@ana`), con un selector de autor y Enter para volar hasta el commit
    (2D y 3D). Sin consultas nuevas. Sin hacer: esconder del grafo las ramas de los demás autores (ítem 34).
20. ~~**Comparar dos ramas**~~ hecho en #73 · Análisis. En el panel de salud, «Comparar dos ramas»: dos selectores,
    los commits que lleva cada una por delante y el commit desde donde se separaron (con lo ya cargado, sin
    consultas; cada línea lleva al grafo) y, al pulsar, los archivos que cambió solo una, solo la otra o las dos
    (dos consultas). Sin hacer: resaltar en el grafo el tramo de cada rama y la comparación directa A...B por API.
21. ~~**Gitea, Forgejo y Codeberg**~~ hecho en #72 · Fuentes. codeberg.org (CORS abierto, comprobado) con la API de
    Forgejo: ramas, historia y PRs en vivo, galaxias con el árbol, sin token y solo repos públicos. Sin hacer:
    otros servidores de Gitea/Forgejo (uno propio entra con el ítem 25) y Codeberg con token.
22. ~~**Bitbucket Cloud**~~ hecho en #75 · Fuentes. `api.bitbucket.org/2.0` (CORS abierto, comprobado): ramas, historia y PRs
    en vivo y galaxias con el árbol, sin token y solo repos públicos. Sin hacer: Bitbucket con token (repos
    privados, mejor cuota) y los pipelines como CI.
23. ~~**Resumen de la semana**~~ hecho en #77 · Salidas. El panel de salud suma una ficha con los últimos 7 días
    (commits, PRs fusionados, releases, quién aportó y la rama más activa) para copiar o guardar como
    Markdown, con lo ya cargado. Sin hacer: guardarlo como imagen y juntar varios repos.
24. ~~**Extensión de VS Code**~~ hecho en #78 · Plataformas. `vscode/`: un panel con la app, servida por un servidor local en
    127.0.0.1 bajo una clave al azar, con la sesión de GitHub de VS Code (`vscode.authentication`) y el repo del
    `origin` del espacio de trabajo. Sin hacer: publicarla en el Marketplace (Benjamin), tokens de GitLab, textos
    en los 40 idiomas y recordar los repos entre sesiones.
25. ~~**GitLab propio**~~ hecho en #80 · Fuentes. `?gitlab=https://gitlab.miempresa.com` (web) y `--gitlab-url=` (escritorio,
    que suma solo ese host a `connect-src`): la API v4, los enlaces y el token van a esa instancia y a ninguna
    otra; sin https vuelve a gitlab.com. Sin hacer: reconocer una URL de la instancia en el cuadro de repos y
    los avatares (ítem 35); el listado de commits con token sale más caro que las comparaciones, sin cambios.
26. ~~**Una organización entera, tercera entrega**~~ hecho en #81 · Escala. Los eventos de la organización
    (`/orgs/{org}/events`, una consulta con ETag cada 5 minutos para todos sus repos) llegan al panel con el
    nombre de su repo, solo los de repos sin pestaña. Los grupos de GitLab y la constelación son el ítem 41.
27. ~~**Replay por tramo de fechas y con rótulos propios**~~ hecho en #82 · Salidas · 2×2/1. [inv. 2026-10-13] Elegir desde y hasta qué día se graba o
    se reproduce el Replay y poner un título y un pie de foto al video, para mostrar un sprint o un lanzamiento.
    Comprobar: prueba del recorte de fechas y un paso del smoke con el tramo elegido.
28. ~~**Ejercicios de Aprender git compartidos por URL**~~ hecho en #85 · Público · 2×2/1. [parte del ítem 16] Un ejercicio propio
    (título, meta, comandos de partida y condiciones de una lista cerrada) viaja en `?practice=<código>`; se crea en
    «Crear un ejercicio para compartir» y se copia con «Copiar enlace del ejercicio». `?practice=1` a `4` abre los de la lista.
29. ~~**Filtrar el grafo por ruta de archivo**~~ hecho en #86 · Análisis · 2×2/2. [inv. 2026-10-13] En el cuadro de búsqueda, «Filtrar grafo» con un
    archivo o carpeta (`/commits?path=` por cabeza, 5 como mucho) deja a plena luz los commits que la tocaron y atenúa el resto
    en el grafo 2D; «Quitar filtro» lo deshace. Solo GitHub y la demo (donde la ruta se compara con el mensaje).
30. ~~**Los forks en el grafo**~~ hecho en #87 · Datos · 2×2/2. [inv. 2026-10-13] Los forks con actividad reciente (`/forks`, push
    propio en 90 días, el más nuevo primero) en el panel de salud; dibujarlos como ramas atenuadas queda por hacer.
31. ~~**Ensayar un comando sobre el repo real**~~ hecho en #89 · Público · 2×3/3. [inv. 2026-10-13] «Ensayar un comando» (con un repo real a la vista)
    abre la terminal de práctica sobre una copia en memoria de sus ramas y commits ya cargados: un `merge` o `rebase` se
    ve en el grafo sin tocar el repo ni gastar consultas. Solo ve lo ya cargado; sin conflictos.
32. ~~**Ramas apiladas**~~ hecho en #90 · Datos · 1×2/2. [inv. 2026-10-13] Un PR cuya base es la rama de otro PR se dibuja encadenado a él, con el
    orden de la pila. Comprobar: prueba del layout con PRs apilados.
33. ~~**Vista de texto, segunda entrega**~~ hecho en #91 · Público · 1×2/2. [parte del ítem 18] Que el árbol avise con una región viva
    (sin anunciar de más) de las ramas y commits nuevos mientras está abierto, que filtre por nombre de rama y que
    se escriba en el README cómo se probó con NVDA, VoiceOver y Orca. Comprobar: paso del smoke con un evento en vivo
    de la demo y la región viva sin repetir lo ya leído.
34. ~~**Filtrar el grafo por autor**~~ hecho en #93 · Análisis · 2×2/2. [parte del ítem 19] En el cuadro de búsqueda, «Mostrar solo las
    ramas de…» deja en el grafo 2D y 3D y en la vista de texto la rama por defecto y las ramas con commits de esa persona
    (`GB.search.byAuthor`), en todas las fuentes, guardado por repo. Comprobar: un paso del smoke en la demo y una prueba por fuente.
35. ~~**GitLab propio, segunda entrega**~~ hecho en #94 · Fuentes. [parte del ítem 25] Pegar la URL de un proyecto de la instancia propia
    (https o `git@host:`, también con ruta y con `/-/tree/…`) se reconoce (`U.gitlabBase`, solo ese host y por
    prefijo exacto); sus claves llevan el host (`gitlab@host:`), aparte de las de gitlab.com; y en escritorio sus
    avatares salen de ese host (`img-src`, solo el elegido con `--gitlab-url`). En la web siguen sin avatares.
36. ~~**Gitea y Forgejo propios**~~ hecho en #97 · Fuentes. [parte del ítem 21] La URL de un servidor propio de Forgejo/Gitea
    (`--forge-url=`), con la misma regla de CSP que GitLab propio y el token solo a ese host. Comprobar:
    `tools/codeberg.test.mjs` con otra URL base.
37. ~~**Tokens para Codeberg y Bitbucket**~~ hecho en #99 · Fuentes · 2×2/2. [parte del ítem 21] Repos privados y más cuota:
    el token de cada servicio en Ajustes (y en el llavero en escritorio), enviado solo a su host. Comprobar: una
    prueba por fuente de que el token va en cada consulta y a ningún otro lado.
38. ~~**Vocabulario DORA en la salud**~~ hecho en #95 · Análisis. [inv. 2026-10-13]
39. ~~**PRs por estado**~~ hecho en #98 · Análisis. [inv. 2026-10-13]
40. ~~**Resaltar el tramo de cada rama comparada**~~ hecho en #101 · Análisis. [parte del ítem 20]
41. ~~**Una organización entera, cuarta entrega**~~ hecho en #102 · Escala. [parte del ítem 26] `group:ruta` (o la URL `gitlab.com/groups/ruta`) sigue
    los proyectos de un grupo de GitLab con sus subgrupos, en una consulta, sin forks ni archivados. La constelación es el ítem 52.
42. ~~**Replay por tramo, segunda entrega**~~ hecho en #103 · Salidas · 1×2/1. [parte del ítem 27] El tramo y los rótulos viajan en la
    URL (`?replay=2026-09-01..2026-09-14&title=…`) y el Replay arranca solo con ellos.
43. ~~**Ejercicios compartidos, segunda entrega**~~ hecho en #105 · Público · 1×2/1. [parte del ítem 28] Un ejercicio propio admite
    hasta 3 pistas que se muestran con un botón, y condiciones sobre el mensaje del último commit (`tip:`) y sobre ramas
    sin fusionar (`unmerged:`).
44. ~~**Filtrar por ruta, segunda entrega**~~ hecho en #106 · Análisis · 1×2/1. [parte del ítem 29] El filtro por ruta también atenúa el grafo 3D
    y viaja en la URL (`?path=src/`) para compartir la vista ya filtrada. Comprobar: prueba de la lectura de la URL y un
    paso del smoke en 3D.
45. ~~**Filtro por autor en la URL**~~ hecho en #109 · Análisis · 1×2/1. [parte del ítem 34] `?author=ana` abre el repo ya filtrado por
    esa persona, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
46. ~~**Capa para streaming, segunda entrega**~~ hecho en #107 · Plataformas · 2×2/1. [inv. 2026-10-13] Parámetros de la URL para la capa
    de OBS: fondo transparente y ocultar paneles, con los de siempre por defecto. Comprobar: un paso del smoke con
    el enlace y prueba de la lectura.
47. ~~**Resumen de la semana de una organización**~~ hecho en #110 · Salidas · 2×2/2. [inv. 2026-10-13] El resumen de la semana de todos
    los repos seguidos de una organización, como Markdown para pegar. Comprobar: `tools/digest.test.mjs` con dos repos.
48. ~~**Tasa de fallos de CI en la salud**~~ hecho en #111 · Análisis · 2×2/2. [inv. 2026-10-13] La proporción de ejecuciones en rojo de
    la rama por defecto, con lo ya cargado de CI. Comprobar: `tools/health.test.mjs` con ejecuciones fabricadas.
49. **Extensión de VS Code, segunda entrega** · Plataformas · 2×2/2. [parte del ítem 24] Que la extensión use la sesión
    de GitHub de VS Code para el token, sin pegarlo. Comprobar: `tools/vscode.test.mjs` con la sesión simulada.
50. **Bitbucket propio** · Fuentes · 1×2/3. [parte del ítem 22] Un Bitbucket Data Center o Server (`--bitbucket-url=`),
    con la misma regla de CSP que GitLab propio. Comprobar: `tools/bitbucket.test.mjs` con otra URL base.
51. **Tiempo de entrega desde el primer commit** · Análisis · 1×2/2. [parte del ítem 38] El tiempo de entrega de la
    salud cuenta desde el primer commit del PR (una consulta de `/pulls/:n/commits` por PR fusionado reciente, solo al
    abrir el panel) y no desde su apertura. Comprobar: `tools/github.test.mjs` con la API simulada y
    `tools/health.test.mjs`.
52. **Constelación de repos** · Escala · 2×2/3. [parte del ítem 41] Una vista donde cada repo seguido es una galaxia, para ver
    más repos de los que caben en pestañas. Comprobar: un paso del smoke con 10 repos simulados y prueba de la disposición.
53. **Frecuencia de despliegue en la salud** · Análisis · 2×2/2. [inv. 2026-10-13] La salud cuenta los despliegues por semana
    con los tags y despliegues ya cargados (vocabulario DORA). Comprobar: `tools/health.test.mjs` con despliegues fabricados.
54. **Resumen de la semana como imagen** · Salidas · 2×2/2. [inv. 2026-10-13] El resumen de la semana también sale como imagen
    PNG para compartir, además del Markdown. Comprobar: prueba del lienzo y un paso del smoke que baja el archivo.
55. **Práctica: cherry-pick y tag** · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `cherry-pick <sha>` y
    `tag <nombre>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
56. **Búsqueda en la URL** · Análisis · 1×2/1. [parte del ítem 19] `?q=texto` abre el repo con la búsqueda ya escrita, para
    compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
57. **Avisos a Microsoft Teams** · Salidas · 2×2/2. [parte del ítem 15] El mismo aviso de actividad que ya va a Slack y Discord,
    con el formato de Teams. Comprobar: `tools/webhooks.test.mjs` con el cuerpo esperado.
58. **Ejercicios compartidos, tercera entrega** · Público · 1×2/1. [parte del ítem 28] Un enlace de ejercicio con la solución
    propuesta (`?practice=<código>&solution=1`) que la muestra paso a paso en la terminal. Comprobar: prueba del codificado y
    un paso del smoke.

## Cómo validar un cambio

`npm run check` corre todo lo de abajo en orden (elige Chromium y Electron solo, y las e2e si el
cambio toca la página o el escritorio) e imprime la línea `Validado:` de la bitácora. Los comandos
sueltos:

```sh
node --test                    # lógica contra una API de GitHub simulada y el service worker (tools/*.test.mjs)
node tools/check-i18n.mjs      # traducciones contra el inglés
node tools/smoke.mjs           # la demo en Chromium: 3D, 2D, vuelo, Replay, diálogos, RTL, celular
node tools/smoke.mjs --langs   # además los 40 idiomas en pantalla de celular
xvfb-run -a npm run test:e2e -- --grep-invert @lento   # app de escritorio y web (tras npm ci)
```

Si el Playwright del proyecto no encuentra su Chromium, `PLAYWRIGHT_CHROMIUM_PATH` apunta a otro (lo
leen el smoke, la auditoría y las e2e).

`node tools/audit.mjs --puerta` (la corre `npm run check` cuando el cambio toca la página) busca en
Chromium errores, violaciones del CSP, peticiones a otros sitios, desbordes, controles sin nombre o
chicos, foco perdido, texto sin traducir y consultas de más a la API de GitHub, y falla si aparece un
hallazgo que no está en `tools/audit-base.json` (dos corridas seguidas, para no frenar por algo pasajero).
`node tools/audit.mjs` es la auditoría completa (con medidas de rendimiento; `--langs`, los 40 idiomas).

## Protocolo de QA

Cada iteración revisa su propio cambio con esta lista antes de `npm run check`, y la entrada de la
bitácora lo dice en `- QA:` (qué filas tocó el cambio y cómo se miraron; la auditoría, con su línea).

| Qué | Lo mira solo | A mano, si el cambio lo toca |
| --- | --- | --- |
| Web y escritorio | e2e web y de escritorio | la capacidad en la app de escritorio, no solo en la web |
| 2D y 3D, galaxias, vuelo, Replay, modo TV | smoke; auditoría (escenarios de cada uno) | la capacidad en cada vista y modo |
| Demo sin token | smoke (falla si la demo consulta `api.github.com`); auditoría (`externa`) | que se vea en la demo |
| Sin conexión e instalable | e2e web (abre sin red); `tools/pwa.test.mjs` (la lista `FILES` de `sw.js`) | un archivo nuevo en `js/` va a `FILES` |
| 40 idiomas, derecha a izquierda, textos largos | `check-i18n`; smoke `--langs`; auditoría (es, ar, de, ta; completa con `--langs`) | el texto nuevo en árabe y en tamil |
| Teclado y lector de pantalla | auditoría (`sin-nombre`, `foco-*`, `dialogo-foco`, `trampa`); smoke (foco) | recorrer la capacidad solo con Tab, Enter y Esc |
| Movimiento reducido | smoke; auditoría completa (`animacion-infinita`) | animaciones nuevas con su versión quieta |
| Celular angosto | smoke (390 px); auditoría (390 px; completa, 320 px) | |
| Consola limpia y CSP | smoke; e2e web; auditoría (`error`, `csp`) | un servidor nuevo, solo en su directiva |
| Cuota de GitHub | auditoría (`cuota-sin-token` contra la base); `tools/github.test.mjs` | apagado, no gasta nada |
| Rendimiento | auditoría completa (medidas y presupuestos; `--comparar`) | lo que corre por cuadro |

## Mantenimiento: pendientes

Los toman las iteraciones de mantenimiento (una de cada cuatro, rotando el subtipo según la regla 2 de
la directiva) y, si son **Alta**, cualquiera. Cada pendiente lleva su subtipo entre corchetes (`[Errores]`,
`[QA]`, `[Accesibilidad]`, `[Seguridad]`, `[Rendimiento]` o `[Deuda]`) y va en su prioridad: **Alta** (la
app en blanco, datos perdidos, seguridad, `master` en rojo: va antes que todo), **Media** (una función
rota para alguien, una prueba intermitente que frena la puerta) o **Baja**. Dentro de cada una, por
impacto, con su reproducción. Los hallazgos de `node tools/audit.mjs` que se aceptan como conocidos
(`tools/audit-base.json`) tienen aquí su pendiente, que cita el tipo como `audit:<tipo>`. Salen de las
auditorías del código (iteraciones 1 y 6), de la auditoría con `tools/audit.mjs` (2026-10-13) y de lo
que falla al validar; los números de línea son de cuando se miró y pueden haberse movido.

### Media

1. [Deuda] Smoke: bajo carga extrema (4 procesos al 100 % en 4 núcleos, `node tools/smoke.mjs` repetido) aún
    fallan pasos que no tocaba el cambio, en cascada: tras un `page.click` de 30 s vencido (vista de texto, búsqueda,
    filtros por autor y por ruta) y «cambios de un commit» (`waitForFunction`); además «salud del repo» («la tasa de
    fallos de CI no sale en la salud»). Con el equipo libre y con `xvfb-run -a npm run check` pasa. Medir la causa del
    primer `click` que vence (qué lo tapa: un diálogo abierto del paso anterior, la barra de herramientas) y esperar
    a ese estado antes de seguir; para «salud del repo», esperar al `#hl-ci` en vez de leerlo al abrir el panel.
    (Hecho en la iteración 83: topes del smoke ×3 y los pasos de Codeberg y Bitbucket dejan de seguir `ana/nada`.)
2. [Deuda] e2e de escritorio: «un repositorio de esta máquina se sigue sin GitHub…» (`e2e/desktop.spec.mjs:360`)
    falló una vez en `npm run check` (iteración 53, `xvfb-run`; la repetición pasó): el panel de cambios
    mostró «segundo» en vez de «tercero, sin publicar» (línea 381, `toHaveText` sin esperar al commit sin
    publicar). Medir con 5 corridas de ese test solo y esperar al estado (el commit nuevo) en vez de al texto.
    Reproducción: `xvfb-run -a npm run check` → `Error: expect(locator).toHaveText(expected) failed … unexpected value "segundo"`.

### Baja

3. [Accesibilidad] Objetivos chicos y estados confusos. `audit:objetivo-chico` (4 hallazgos conocidos en
    `tools/audit-base.json`): las etiquetas de rama de 22 px de alto en 2D (mínimo 24), la barra de
    posición del Replay (`.rp-range`, 16 px) y las marcas de la brújula del vuelo (18×18 px).
    Las etiquetas 3D ya miden 24 px (iteración 75).
    Además: botones que cambian a la vez `aria-pressed` y el texto (el de pausa del Replay, `replay.js:367`)
    y la leyenda 2D sin acceso por teclado. Reproducir: `node tools/audit.mjs`.
4. [Errores] La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:264`).
5. [Errores] `i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de cargar último.
6. [Errores] `mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (repos
    renombrados).
7. [Seguridad] Token en `localStorage`: en GitHub Pages lo comparten todos los proyectos de
    `<usuario>.github.io`. Valorar `sessionStorage` con opción "recordar", o recomendar dominio propio.
8. [Deuda] `tools/i18n-add.mjs`: los textos nuevos entran a los 40 idiomas desde un JSON
    `{clave: {en, es, …}}` (plurales como objeto) en un solo paso, tras `--despues=clave` o reemplazando,
    todo o nada (valida los 40 códigos de `LOCALES` y el ancla antes de escribir), escapa comillas y
    corre `check-i18n` al final; `--verificar` solo informa. Pruebas sobre una copia temporal de
    `js/locales`. Motivo: #51 tocó los 40 archivos y cada uno se leyó entero antes de editarlo.
9. [Deuda] Rotar la bitácora: `node tools/loop.mjs --rotar` deja las últimas 8 entradas en este archivo
    y mueve el resto a `docs/BITACORA.md` (idempotente: la segunda corrida dice «Nada que rotar»; queda
    una línea «Las iteraciones anteriores están en docs/BITACORA.md»); `--siguiente` sigue leyendo N de
    aquí y `--check` exige iteraciones sin repetidos entre los dos archivos. Motivo: `--salud` mide el
    archivo en cada iteración (77 KB el 2026-10-13, 55 KB de bitácora), y cada sesión nueva lo lee entero.
10. [Deuda] Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar
    `github.js` (1.200 líneas) en HTTP/cuota, los tres modos y el mapeo.
11. [Deuda] `CHANGELOG.md` desde los títulos de PR (`git log --format=%s`, los que terminan en `(#N)`) y
    versión en `package.json` en cada iteración de mantenimiento; el tag y el Release con instaladores
    los hace Benjamin (sin credencial para crearlo ni instaladores en este entorno). Sin regla
    bloqueante en `--check`.
12. [Deuda] Guarda de las cifras de «Validado:»: comparar `(\d+) pruebas` y `(\d+) e2e` de la última
    entrada con `node --test` y `npx playwright test --list --grep-invert @lento`, como aviso y con un
    flag `--sin-suites` que pasen `loop.test.mjs` y `npm run check` (evita la recursión).
13. [Rendimiento] Con `--langs` la carga del escenario `escritorio-3d` pasó el presupuesto en este entorno
    (6.009 ms con ≤ 6.000; tareas largas 4.809 ms con ≤ 4.000), sin GPU y con la corrida larga; la corrida
    normal de la puerta no lo marca. Medir con `node tools/audit.mjs --repetir 3` antes de tocar nada.
14. [Rendimiento] El primer arranque de la app de escritorio en una sesión tardó 14,7 s hasta salir de
    «cargando» (con un repo local de 1.000 ramas y `--lang=ar`); los siguientes, 1,3–1,6 s en es, ar y ta.
    Es el arranque en frío de Electron (caché de disco), no el repo ni el idioma; sin medir sin repo.
    Reproducción: `xvfb-run npx playwright test` con `launch` + `--local=` sobre 1.000 ramas, primer `launch`.
15. [Deuda] `node tools/smoke.mjs` solo no encuentra Chromium en la sesión cloud (Playwright pide
    `chromium_headless_shell-1243` y hay `1194`) y sale 1; con `PLAYWRIGHT_CHROMIUM_PATH` pasa, y
    `tools/audit.mjs` ya lo resuelve con `chromiumPath()`. Que el smoke use la misma búsqueda.
    Reproducción: `node tools/smoke.mjs` → `browserType.launch: Executable doesn't exist at …1243…`.
16. [Deuda] `node tools/audit.mjs --langs` tarda ~145 s en la sesión cloud y la herramienta de shell lo
    manda al fondo a los 120 s; la puerta normal no. Documentar en «Cómo validar» que se corra con
    `run_in_background` o partir `--langs` por lotes de idiomas.
    Reproducción: `time node tools/audit.mjs --langs` → ~145 s.
17. [Accesibilidad] Las etiquetas de rama 2D (`g.head[role=button]`) miden 22 px de alto en un SVG; subirlas
    a 24 px exige recalcular el apilado de etiquetas de `layout.js`. Parte del pendiente 3, aparte por tamaño.
    Reproducción: `node tools/audit.mjs`, escenario `escritorio-2d`.
18. [QA] El smoke y la auditoría no miran el 3D de celular a 320 px con el panel de ramas abierto (solo las
    etiquetas); revisar a mano que las etiquetas de 24 px no se tapen entre sí con 1.000 ramas.
    Reproducción: Playwright contra `node e2e/serve.mjs 4173`, 320 px, 3D, `?repo=demo`.

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

### 2026-10-10 · Iteración 22 · Expansión · Fuentes

- **Capacidad nueva: proyectos de GitLab** (ítem 4 de la hoja de ruta, primera entrega). Se pega la
  URL de un proyecto público de gitlab.com (con subgrupos, también la de una rama o un archivo, o
  ssh) o se escribe `gitlab:grupo/proyecto`, y se ve como un repo de GitHub: ramas, commits y merge
  requests en vivo, con sus efectos, el sonido, las galaxias con sus archivos y la Replay. Se sigue
  junto a los repos de GitHub, en su pestaña; la URL y lo guardado lo llevan con `gitlab:` delante.
  - Antes de construir: la API de gitlab.com responde con CORS abierto, expone ETag y `X-Next-Page`
    (no su cuota) y el preflight acepta `authorization` e `if-none-match`. Pero el **listado de
    commits** sin token responde con un desafío de Cloudflare (403 "Just a moment…"), que una página
    no puede resolver; el commit suelto, `compare`, `merge_base`, `sequence`, las MRs, el árbol y los
    eventos sí responden. Por eso la historia sale de `repository/compare`: la rama por defecto,
    desde `sha~N` (cuántos pasos hay lo dice `commits/:sha/sequence`, así nunca se pide uno que no
    existe); una rama nueva, desde la rama por defecto (solo lo suyo); una rama que se movió, desde
    su cabeza anterior. Un force-push se nota con `merge_base`.
  - `js/sources/gitlab.js`: `GitLabSource` extiende `GitHubSource` y cambia solo lo de GitLab
    (consultas, forma de los datos, URLs con `/-/`, MRs `!12`, textos). `github.js` gana tres
    ganchos sin cambiar su comportamiento: `term()` (los textos que nombran al servicio),
    `applyBranchList()` (comparar un listado de ramas, separado de traerlo) y `ApiError` expuesto.
  - Ramas: de a 100, las actualizadas más recientemente primero; con más de 100, la primera página
    en cada ciclo y el listado entero (hasta 1.000) cada 3 minutos, que es cuando se nota una rama
    borrada. Ritmo fijo de 15 s (GitLab no deja leer su cuota); un 429 espera un minuto.
  - App: `U.parseRepo` reconoce GitLab; `sourceFor` arma la fuente que toca; la cuota se reparte
    entre los repos de cada servicio; la etiqueta **GitLab** junto al título; sin el aviso del token
    de GitHub ni el botón de Ajustes en sus errores. Vistas: `!12` y los textos de MR en etiquetas,
    fichas y lector de pantalla. La Replay reconoce los merges de GitLab ("See merge request …!12").
  - CSP: `connect-src` y `img-src` suman `https://gitlab.com` (de los avatares, solo los alojados
    ahí; los de Gravatar no se cargan).
  - 22 textos nuevos o cambiados en los 40 idiomas: los de MR salen de los de PR (todos los idiomas
    escriben "PR #{num}") y los errores de GitLab, de los de GitHub (GitHub y GitLab se declinan
    igual: "GitLabu", "GitLabiin", "GitLabhoz"); a mano, la etiqueta y el error del campo, el de
    proyecto no encontrado y el de 429.
- **Pruebas que fallan sin la capacidad:**
  - `tools/gitlab.test.mjs` (7, `node --test`): una API de gitlab.com simulada que, como la real,
    bloquea el listado de commits. Carga con subgrupos, en vivo (push, rama nueva, MR abierta y
    fusionada, force-push, rama borrada), proyecto inexistente (no insiste), 429 (un minuto),
    historia corta (sin consultas que den 404), más de 100 ramas (páginas y borradas) y archivos.
  - Smoke: un GitLab simulado en el navegador: conecta `gitlab:g/sub/p`, se recuerda, la etiqueta
    `!5` en 2D, un push y la MR fusionada llegan al panel, y un proyecto inexistente lo dice sin
    mandar a Ajustes.
  - e2e de escritorio: sin red, un proyecto de GitLab avisa que no llega a gitlab.com.
  - Contra gitlab.com de verdad (gitlab-org/gitlab-runner, 387 ramas): en Node y en la página, en
    vivo, con la historia, sus MRs y el árbol de 1.452 archivos, sin errores en la consola.
- README: la función, el uso, la estructura, las pruebas, Límites conocidos (qué no trae GitLab
  todavía y por qué) y Seguridad (CSP, avatares, cada token a su servicio).
- Validado: 26 pruebas (`node --test`), smoke (40 idiomas), i18n y 15 e2e en verde.
- **Siguiente:** iteración 23, de **mantenimiento**: pendiente 1 (la ficha no recibe el foco al
  abrirse con el teclado). La 24 vuelve a expansión: el primer ítem sin hacer es el 3 (video del
  Replay, Salidas), de otro eje que esta (Fuentes).

### 2026-10-10 · Iteración 23 · Mantenimiento

- **Arreglo: la ficha abierta con el teclado recibe el foco** (pendiente 1). Con Enter o Espacio en
  la etiqueta de una rama se abría su ficha, pero el foco se quedaba en la etiqueta: para llegar a
  sus botones (Fijar, ver en GitHub, Recorrer la rama…) había que pasar con Tab por todas las demás
  etiquetas del grafo. Ahora la ficha (un `role=dialog` con su nombre) toma el foco, sus botones
  quedan a un Tab, y al cerrarla (Esc) el foco vuelve a la etiqueta que la abrió, o al grafo si esa
  etiqueta ya no está. Sirve para las dos vistas: un par de ayudantes compartidos (`focusTip`,
  `returnFocus` en `GB.graphShared`); en 3D, las etiquetas son botones y se distingue el teclado por
  `detail === 0` del clic. Con el ratón no cambia nada: el foco se queda en el grafo y las flechas
  siguen moviéndolo. La ficha enfocada se marca con el mismo contorno que los demás controles.
- **Prueba nueva en el smoke** (con el GitHub simulado, junto a la de Fijar): en 2D y en 3D, Enter en
  una etiqueta deja el foco en la ficha, Tab llega a uno de sus botones y Esc lo devuelve a la
  etiqueta. Antes del arreglo fallaba en las dos ("el foco quedó en g" y "en BUTTON").
- Validado: 26 pruebas (`node --test`), smoke, i18n (sin textos nuevos) y 15 e2e en verde.
- **Siguiente:** iteración 24, expansión: el primer ítem sin hacer es el 3 (grabar el Replay en
  video, eje Salidas), de otro eje que la última expansión (Fuentes).

### 2026-10-12 · Iteración 24 · Expansión · Salidas

- **Antes de empezar:** entre el 11 y el 12 de octubre, con el entorno reiniciándose, quedaron en cola
  nueve disparos de la rutina. Se tomaron como una sola iteración: nueve seguidas sobre el mismo
  estado habrían sido la misma.
- **Capacidad nueva: grabar el Replay en video** (ítem 3 de la hoja de ruta). En la barra del Replay,
  un botón con un punto rojo vuelve la historia al principio y la graba tal como se ve, en 3D o en
  2D, con la fecha grande, los rótulos de los hitos y abajo la franja con el repo. Mientras graba el
  punto late en rojo (quieto con movimiento reducido) y el botón pasa a **Detener y guardar el
  video**; se puede pausar o cambiar la velocidad. Al llegar al final el video se guarda solo; otro
  clic o **Volver al presente** lo termina antes. Un aviso dice el nombre del archivo
  (`graphbranch-owner-repo-replay-2026-10-12-0830.webm`), también al lector de pantalla.
  - `js/snapshot.js`: `record()` repite cuadro a cuadro la misma captura de Guardar imagen (a 1 px
    por px de CSS, con elementos extra: la fecha y los rótulos del Replay, que la imagen deja fuera)
    sobre un canvas de medidas pares, cuyo `captureStream()` graba `MediaRecorder` a 6 Mb/s.
    `videoFormat()` elige VP9, VP8, WebM o MP4 (Safari); sin ninguno, el botón no aparece.
  - MediaRecorder escribe el WebM mientras graba y no anota cuánto dura: con ffprobe, el archivo de
    Chromium decía `duration=N/A`, y sin ese dato muchos reproductores no muestran la duración ni
    dejan adelantar. `webmDuration()` la agrega al bloque Info del segmento (lee el EBML, respeta la
    escala de tiempo del archivo y, si el segmento tiene tamaño conocido, lo agranda). Chromium no
    escribe índice de saltos (SeekHead), así que no hay desplazamientos que corregir. Con el parche,
    ffprobe lee la duración y decodifica el video entero.
  - `js/replay.js`: `restart()`, desde el principio y andando. `js/app.js` termina la grabación al
    llegar al final o al salir del Replay.
  - App de escritorio: las descargas aceptan `.webm` y `.mp4` además de `.png`, siempre que vengan de
    `blob:app://graphbranch/`.
  - CSP sin cambios: el video nunca se reproduce en la página, solo se descarga.
  - 5 textos nuevos en los 40 idiomas.
- **Medido:** sin GPU (SwiftShader, 1280×800), grabar baja la 3D de 7,7 a 3,3 cuadros por segundo y
  la 2D de 26 a 10, porque cada cuadro se arma como una imagen entera; el Replay limita cada paso a
  0,1 s, así que en un equipo así la historia avanza más despacio y el video dura más. Con GPU la
  captura cuesta mucho menos. Si hiciera falta, lo siguiente sería copiar la escena 3D después del
  dibujo de cada cuadro en vez de dibujarla otra vez.
- **Pruebas que fallan sin la capacidad:**
  - `tools/snapshot.test.mjs` (5, `node --test`): WebM armados a mano con la forma de los de Chrome
    (segmento y cuadros de tamaño desconocido). La duración llega en la escala del archivo, las
    pistas y los cuadros quedan byte a byte, un segmento de tamaño conocido crece lo mismo, y un
    archivo que ya la tiene, un MP4 o uno cortado vuelven tal cual. Además, los nombres de archivo.
  - Smoke: entra al Replay a 4×, graba (el botón queda encendido y la historia vuelve al principio),
    salta casi al final y espera a que el video se guarde solo; después, otro grabado de 2,5 s
    parado a mano. Cada video se abre en una pestaña en blanco (el CSP de la app no deja reproducir):
    firma EBML, que diga su duración apenas se abre, que dure lo que se grabó, que mida lo que la
    vista más la franja y que tenga dibujo a la mitad.
  - e2e de escritorio: grabar y parar deja en la carpeta de descargas un `.webm` con la firma EBML y
    la duración. Sin aceptar `.webm` en `electron/main.js`, falla (comprobado).
- README: la función en la lista y en Controles, la estructura, las pruebas, Límites conocidos (en
  tiempo real, sin sonido, menos cuadros en equipos lentos, la pestaña a la vista) y Seguridad (qué
  descargas acepta la app de escritorio).
- Validado: 31 pruebas (`node --test`), smoke (40 idiomas), i18n y 16 e2e en verde.
- **Siguiente:** iteración 25, expansión: el primer ítem sin hacer es el 5 (GitLab, segunda entrega:
  token, eventos y GitLab propio, eje Fuentes), de otro eje que esta (Salidas). La 26 también es de
  expansión; la 27, de mantenimiento (pendiente 1).

### 2026-10-12 · Iteración 25 · Expansión · Fuentes

- **Capacidad nueva: proyectos privados de GitLab** (ítem 5 de la hoja de ruta, partido: esta es la
  primera entrega; los eventos del proyecto y un GitLab propio quedan como ítem 6, justo debajo).
  Ajustes tiene un campo **Token de GitLab** (permiso `read_api`) y con él se ven los proyectos
  privados de gitlab.com igual que los públicos: ramas, commits, MRs en vivo, galaxias y Replay. La
  etiqueta del título dice **GitLab · privado**.
  - Antes de construir, contra gitlab.com: el preflight CORS acepta `authorization` y un token que
    no existe responde 401 (`{"message":"401 Unauthorized"}`) con CORS, así que la página lo puede
    leer. Un proyecto privado sin token responde 404, como uno que no existe.
  - `js/sources/gitlab.js`: el token va como `Authorization: Bearer` en cada consulta (todas pasan por
    `api()`). Se guarda aparte (`gitlabToken`), no en `this.token`, que es el de GitHub y decide cosas
    de GitHub. 401, o 403 con `insufficient_scope` (sin `read_api`), es un error de token
    (`err.authGitlab`) y no insiste; el aviso de 404 ahora dice que, si es privado, hace falta el
    token. La historia sigue saliendo de las comparaciones: igual para públicos y privados.
  - App: cada fuente recibe solo el token de su servicio. Los errores de proyecto o token de GitLab
    también ofrecen **Abrir Ajustes**, y Ajustes abre con el foco en el campo de GitLab. Al guardar
    se reconectan solo los repos del servicio cuyo token cambió: un token de GitLab nuevo no gasta
    cuota de GitHub (si no cambió nada, todo, como dice el botón). **Borrar los tokens** borra los dos.
  - App de escritorio: `electron/token.js` guarda un token por servicio (`github-token.enc`,
    `gitlab-token.enc`), cifrados con el llavero; el puente (`getToken`, `setToken`) suma el servicio
    sin funciones nuevas, y el proceso principal rechaza un servicio que no conoce.
  - 7 textos nuevos (uno reemplaza a «Borrar token») y uno cambiado en los 40 idiomas; los avisos de dónde se guarda y el nombre del
    campo salen de los de GitHub (`api.github.com` → `gitlab.com`), así que dicen lo mismo en cada uno.
- **Pruebas que fallan sin la capacidad:**
  - `tools/gitlab.test.mjs` (+2, 9 en total): la API simulada, como gitlab.com, esconde un proyecto
    privado sin token (404), responde 401 a un token que no existe y 403 `insufficient_scope` a uno
    sin `read_api`, y comprueba en cada consulta que el encabezado sea exactamente el del token (o
    ninguno). Con token el privado carga entero; con uno vencido o corto, `err.authGitlab` y se detiene.
  - Smoke: un proyecto privado da el aviso con **Abrir Ajustes**, el foco cae en el campo de GitLab,
    con el token se abre y lleva la etiqueta de privado, y todas sus consultas llevan el token.
    Después, con un repo de GitHub al lado: a GitHub solo llega el token de GitHub y a GitLab solo el
    de GitLab. Comprobado que falla si la fuente de GitLab recibe el de GitHub. El GitHub simulado
    aprendió `/activity` y un GraphQL que responde con error (con token, la fuente prueba ambos).
  - e2e: en escritorio, los dos tokens quedan cifrados en archivos separados, fuera de
    `localStorage`, vuelven al reabrir y borrar el de GitLab deja el de GitHub; en la web, el de
    GitLab queda en el navegador y Ajustes dice que va solo a gitlab.com.
- README: la función, cómo crear el token de GitLab (sección Token), las pruebas, la estructura,
  Límites conocidos (solo gitlab.com; los privados piden `read_api`) y Seguridad (cada token a su
  servicio, cada uno en su archivo cifrado).
- Validado: 33 pruebas (`node --test`), smoke (40 idiomas), i18n y 17 e2e en verde.
- **Siguiente:** iteración 26, expansión. El primer ítem sin hacer es el 6 (GitLab, tercera entrega),
  del mismo eje que esta (Fuentes), y entre los tres primeros hay otro eje: toca el 7, **una
  organización o un usuario entero** (Escala). La 27 es de mantenimiento (pendiente 1).

### 2026-10-12 · Iteración 26 · Expansión · Escala

- **Capacidad nueva: los repos de una organización o un usuario entero** (ítem 7 de la hoja de ruta,
  partido: esta es la primera entrega; seguir la organización con su lista al día, sus eventos, los
  grupos de GitLab y la constelación quedan como ítem 8). En el campo del repo, `org:nombre`,
  `user:nombre`, `@nombre` o la URL de un perfil (`github.com/nombre`, `github.com/orgs/nombre`)
  siguen sus repos con push más reciente, sin forks ni archivados ni los que ya se seguían, cada uno
  en su pestaña, hasta llenar las 10. Se muestra el de push más reciente y un aviso nombra los que se
  sumaron (y dice si quedaron otros fuera por el tope). `?repo=org:nombre` hace lo mismo al abrir.
  - `U.parseOwner` (en `js/util.js`) reconoce esas formas con las reglas de nombres de GitHub (letras,
    números y guiones sueltos, hasta 39); un nombre suelto no cuenta, para no confundirlo con un repo
    mal escrito.
  - `GitHubSource.ownerRepos`: `/orgs/{org}/repos?sort=pushed&direction=desc&type=all` (con token,
    también los privados de la organización que el token ve) y, si da 404, `/users/{u}/repos` con
    `type=owner`. Una consulta para una organización, dos para un usuario; si ninguna existe,
    `err.ownerNotFound`. Usa el mismo `api()` que las fuentes: los mismos errores de token y de cuota.
  - App: `connectOwner` vuelve a mirar el tope después de la consulta (mientras llegaba la lista
    pudieron sumarse otros repos); lo que se guarda y comparte son los repos, uno por uno. Los errores
    van al aviso del campo, como los de un repo mal escrito.
  - No se pudo comprobar contra la API real: el proxy de esta sesión solo deja consultar la API del
    propio repositorio. Los parámetros siguen la documentación de GitHub (`sort`, `direction`, `type`,
    y el 404 de `/orgs/` para un usuario).
  - 4 textos nuevos y `repo.invalid` con una frase más (cómo escribir una organización), en los 40
    idiomas. El aviso nombra los repos en vez de contarlos: sin plurales nuevos.
- **Pruebas que fallan sin la capacidad:**
  - `tools/github.test.mjs` (+4, 15 en total): `parseOwner` con lo que acepta y lo que no; la lista de
    una organización en una sola consulta, ordenada por push y sin forks ni archivados; un usuario
    (404 como organización, después la de usuario) y uno que no existe (`err.ownerNotFound`, dos
    consultas); y que la consulta lleve el token. Las cuatro fallaban antes de escribir el código.
  - Smoke, sección nueva con el GitHub simulado (que aprendió organizaciones, usuarios y el orden por
    push): `org:acme` abre `acme/api*`, `acme/web` y `acme/viejo` (sin el fork ni el archivado), con
    una sola consulta de lista, el aviso con sus nombres y lo guardado; `@nadie` lo dice en el campo
    sin tocar las pestañas; y `?repo=@ana` en la URL sigue el repo de ese usuario.
- README: la función (en la lista y en Varios repos a la vez), el uso y la URL, las pruebas y Límites
  conocidos (la lista se arma al conectar; de un usuario, solo sus públicos; solo GitHub por ahora).
- Validado: 37 pruebas (`node --test`), smoke (40 idiomas), i18n y 17 e2e en verde.
- **Siguiente:** iteración 27, de **mantenimiento**: pendiente 1 (con movimiento reducido, la ayuda
  del modo vuelo y el combo no se ven nunca). La 28 vuelve a expansión: el primer ítem sin hacer es el
  6 (GitLab, tercera entrega, Fuentes), de otro eje que esta (Escala).

### 2026-10-12 · Iteración 27 · Mantenimiento

- **Disparo fuera de programa:** la rutina se disparó a las 16:40, 26 minutos después de la iteración 26
  y sin la marca de ejecución programada (la siguiente programada era a las 20:03): alguien la lanzó a
  mano, así que se hizo la iteración que tocaba.
- **Arreglo: con movimiento reducido, el combo, la ayuda del modo vuelo y sus avisos no se veían
  nunca** (pendiente 1). La regla general de movimiento reducido acorta toda animación a 0,01 ms, y
  estas tres solo existen mientras dura la suya, que termina en opacidad 0 con `forwards`: saltaban
  directo al final, invisibles. Quien pide menos movimiento se quedaba sin la ayuda de los controles al
  entrar al vuelo, sin avisos como «no hay a dónde saltar» y sin el combo. Ahora, con movimiento
  reducido, se muestran quietos el mismo tiempo (2,2 s, 8 s y 2,6 s) con una animación de un solo paso
  (`step-end`) y se van de golpe, sin escalas ni giros. Las demás animaciones que terminan invisibles
  son decorativas (trazos, ondas, destellos) o sirven para ocultar, y quedan como estaban.
- **Prueba nueva en el smoke** («Movimiento reducido»): con `reducedMotion: 'reduce'` entra al modo
  vuelo (la ayuda aparece por su camino de siempre), enciende el aviso y el combo como los enciende la
  app, y a los 0,6 s exige que los tres tengan opacidad 1, sin transformación, y que su animación dure
  lo de siempre (así se siguen yendo). Sin el arreglo falla: «.combo tiene opacidad 0». Fuera del vuelo
  la ayuda está en un contenedor oculto, donde no corre ninguna animación: por eso la prueba entra al
  vuelo en vez de mirar el estilo calculado.
- **Al validar:** en la primera corrida completa del smoke falló una vez «graba el Replay en video»: el
  cuadro de la mitad del video salió de un solo color. No tiene que ver con este cambio (esa sección
  corre sin movimiento reducido) y aparte no se repitió en dos corridas, con muestras de 550 a 3.400
  colores en cada cuadro. La comprobación ahora espera a que cada cuadro esté decodificado, mira tres
  puntos y pide dibujo en dos, y dice los tres números si falla; queda como pendiente 13 para ver,
  si vuelve, si es el grabador o la lectura.
- Validado: 37 pruebas (`node --test`), smoke (40 idiomas), i18n (sin textos nuevos) y 17 e2e en verde.
- **Siguiente:** iteración 28, expansión: el primer ítem sin hacer es el 6 (GitLab, tercera entrega:
  los eventos del proyecto en el panel, eje Fuentes), de otro eje que la última expansión (Escala).

### 2026-10-12 · Cambio de maquinaria: el loop se elige, se reclama, se valida y se mide solo

- **Qué cambió:** la Routine pasa a una sesión nueva por disparo; el «cómo iterar» vive en
  `.claude/skills/iteracion/SKILL.md` y el prompt solo apunta ahí. `tools/loop.mjs` elige la iteración
  (`--siguiente`), vigila este archivo (`--check`, se corre antes de cada PR), reclama la rama `loop/N`
  con un commit vacío (`--reclamar`: el push es el candado; a las 6 h sin commits se releva) y mide la
  web publicada (`--publicado`). `npm run check` es la única puerta: elige Chromium y Electron solo y
  corre las e2e cuando el cambio toca la página o el escritorio. `.claude/settings.json` permite lo que
  la skill usa y un hook instala dependencias en sesiones cloud.
- **Por qué:** el prompt de la Routine (2026-10-08) contradecía la directiva de #44, fijaba
  `claude/epic-curie-upah71` y una ruta de Chromium que el Playwright del proyecto ya no usa; los
  «Siguiente» se calculaban a mano; la web de GitHub Pages responde 404 (`has_pages=false`) aunque el
  README mandaba un flujo de Actions que en esta cuenta no corre: se quita el flujo, se sirve desde la
  rama con `.nojekyll` y el loop lo comprueba en cada iteración.
- Mantenimiento: los pendientes 1, 2 y 16 a 21 son lo que esta sesión dejó para después (herramienta
  de i18n, rotar la bitácora, cadencia, issues, changelog, auditorías, limpieza de ramas y guarda de
  las cifras de «Validado»).
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo
  tiene has_pages=false. Benjamin: Settings → Pages → Build and deployment → Source: Deploy from a
  branch → master, /(root). Pages despliega con un flujo interno de GitHub Actions: la cuenta tiene
  que poder correr jobs de Actions.
- Al validar: el smoke falló una vez en «Zumbido del espacio: se calla con la pestaña oculta» (el
  zumbido seguía sonando con la pestaña oculta) y pasó entero al repetirlo; este cambio no toca `js/`.
  Queda anotado en el pendiente 19 (primer caso de la auditoría de QA).
- Validado: 87 pruebas (`node --test`), smoke, i18n (0 errores) y 17 e2e en verde.
- PR: #53 (desde la rama de la sesión; no es una iteración numerada).
- **Siguiente:** iteración 28, expansión: ítem 6 (GitLab, tercera entrega, Fuentes)

### 2026-10-13 · Iteración 28 · Expansión · Fuentes

- **Capacidad nueva: los eventos de un proyecto de GitLab en el panel de actividad** (ítem 6 de la hoja
  de ruta, partido: esta es la tercera entrega; el GitLab propio queda como ítem 25). `GitLabSource`
  consulta `/projects/:id/events` al abrir (el historial reciente) y cada minuto (ETag), y muestra
  issues abiertos, reabiertos y cerrados, comentarios en issues, MRs y commits, tags, aprobaciones de
  MRs y miembros nuevos. Los pushes, las ramas y las MRs abiertas, fusionadas o cerradas no se repiten:
  ya los da la comparación entre ciclos. Un fallo del feed que no es de red, cuota ni token no corta el
  ciclo. Textos nuevos: `act.mrApproved` y `act.commentMr` (40 idiomas, derivados de los de PR).
- **Pruebas que fallan sin la capacidad:** en `tools/gitlab.test.mjs`, «eventos del proyecto: issues,
  comentarios y tags…» (historial, no repetir lo ya visto, no duplicar pushes ni MRs) y «si el feed no se
  puede leer, el resto del ciclo sigue; un 429 sí se respeta».
- README: la función de GitLab, y Límites conocidos (el panel ya trae issues y comentarios; sin
  estrellas ni forks; solo los últimos 50 eventos).
- Reclamo: relevo de loop/28 (23d47dd)
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo tiene has_pages=false (Benjamin: Settings → Pages → Deploy from a branch → master, /(root)).
- Validado: 89 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 29, expansión: ítem 8 (Una organización entera, segunda entrega, Escala)

### 2026-10-13 · Iteración 29 · Expansión · Escala

- **Capacidad nueva: seguir la organización, con su lista al día** (ítem 8 de la hoja de ruta,
  partido: esta es la segunda entrega; los eventos de la organización, los grupos de GitLab y la
  constelación pasan al ítem 26). `org:nombre` / `@usuario` queda guardado en `graphbranch:owners`
  con los nombres de repos que ya vio su lista; cada 30 minutos (con la pestaña a la vista y sin
  pausa) se vuelve a pedir y los repos que no se habían visto se suman solos, hasta el tope de 10, con
  el aviso de siempre. Un repo cerrado no regresa y al cerrar el último de una organización deja de
  seguirse. Sin textos nuevos (reusa `owner.followed`).
- **Pruebas que fallan sin la capacidad:** smoke, dos pasos nuevos en la sección de la organización
  (con la renovación acortada a 1,5 s): lo guardado en `owners`, el repo nuevo que se suma solo con su
  aviso, el cerrado que no vuelve, y la organización que se olvida al cerrar su último repo.
- README: la función, el apartado de la organización, la prueba de humo y Límites conocidos.
- Reclamo: loop/29, sin colisión
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo tiene has_pages=false (Benjamin: Settings → Pages → Deploy from a branch → master, /(root)).
- Validado: 89 pruebas (`node --test`), smoke, i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 30, expansión: ítem 9 (CI en el grafo, Datos)

### 2026-10-13 · Iteración 30 · Expansión · Datos

- **Capacidad nueva: CI en el grafo** (ítem 9 de la hoja de ruta). El estado de los checks de la cabeza
  de la rama por defecto, las fijadas, las que acaban de moverse y los PRs sale en la etiqueta
  (✓ ✗ ●, en 2D y 3D), en el detalle y en el texto accesible; con token viene en la misma consulta
  GraphQL (`statusCheckRollup`) y sin token por check-runs, una consulta por commit nuevo de la rama
  por defecto y las fijadas. Cuando la rama por defecto pasa a rojo, el panel avisa una vez («CI
  fallido»). La demo simula checks que corren y terminan. Quedan fuera: el listado completo de ramas,
  los commit statuses sin token y GitLab.
- **Pruebas que fallan sin la capacidad:** `node --test` con un GraphQL simulado (estado de la rama y
  del PR, aviso único al ponerse en rojo, sin estado cuando no hay checks) y con check-runs simulados
  (un commit no se vuelve a preguntar, lo que sigue en curso sí, API ausente sin errores); un paso del
  smoke con la marca de CI en el grafo.
- README: la función en la lista, Límites conocidos y Seguridad.
- Reclamo: loop/30, sin colisión
- Web publicada: pendiente de `--publicado`
- Validado: 92 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 31, mantenimiento: pendiente 1 (`tools/i18n-add.mjs`)

### 2026-10-13 · Cambio de maquinaria: protocolo de QA, mantenimiento rotativo, investigación y salud del loop

- **Pedido de Benjamin:** loops lo más completos y autónomos posible (QA detallista, investigación de
  mercado, solución de errores). La directiva no cambia; no es una iteración numerada.
- **Medido antes:** 10 iteraciones (20 a 29) para 18 disparos esperados desde la directiva (56 %), con un
  hueco de 36,5 h (10 al 12 de octubre) y un reclamo perdido (`loop/28`, relevado a las 6 h). Ejes de las
  8 expansiones: Fuentes 3, Escala 2, Salidas 2, Plataformas 1; Datos, Análisis y Público, 0. Desde la
  iteración 6, ninguna QA exploratoria, seguridad, rendimiento ni investigación; 8 de 21 pendientes eran
  del propio loop. `npm run check -- --e2e` sobre f7749bd, rojo por el zumbido intermitente; el desborde
  del smoke en celular no podía fallar (con `isMobile`, `innerWidth` crece con el contenido: 532 = 532
  con una barra de 520 px en 390). Ningún issue; 23 ramas ajenas fusionadas o contenidas sin borrar.
- **Lo nuevo:** el Protocolo de QA (y `- QA:` en cada entrada siguiente, R5); `tools/audit.mjs` (19 tipos
  de hallazgo y medidas, sin red ni dependencias nuevas; `--puerta` en `npm run check` con
  `tools/audit-base.json`: 24 conocidos, todos del pendiente 5); los seis subtipos de mantenimiento que
  rotan por necesidad (regla 2, R7, protocolos en la skill, R8); `docs/investigacion.md` con 15 fuentes
  fechadas y puntajes en la hoja (regla 5, R10); fallos con reproducción y triaje de issues (regla 7);
  `--salud` (cadencia, reclamos, ramas, issues, Alta, Para Benjamin); Para Benjamin (regla 8, R12) y
  `audit:<tipo>` en los pendientes (R11). El smoke mide el desborde contra `clientWidth`.
- **Comprobado inyectando cada violación:** la puerta de la auditoría falla con un botón sin nombre e id
  repetido, un `fetch` a otro sitio (`csp`), una consulta de la demo a GitHub (`externa`), tres consultas
  de más (`cuota`: 8 frente a 5 + 2), `dir=ltr` en árabe y una barra de 520 px en el celular (142 px de
  más); el smoke, con esa barra, falla en sus tres idiomas y en las tres pestañas, y sin ella pasa. Cada
  regla nueva de `--check` tiene su prueba con la violación.
  Simulada la rotación sobre esta lista: 31 Deuda (el zumbido), 35 Errores (el `localStorage`,
  *reproducido*: el repo queda en «Cargando»), 39 QA, 43 Deuda, 47 Seguridad, 51 Rendimiento, 55
  Accesibilidad.
- **Al fusionar #56 (iteración 30)** la puerta de la auditoría falló dos veces con un error de consola nuevo
  en `cuota-sin-token`: el CI sin token pide `/commits/:sha/check-runs`, y la API simulada respondía 404
  (GitHub responde 200 en un repo público). La API simulada aprendió ese camino y la base pasó de 5 a 8
  consultas (las check-runs de #56 y la historia de las otras ramas, que a veces cae en la ventana).
- **Pendientes:** de 21 sin prioridad ni subtipo a 18 (4 Media, 14 Baja). Salen porque esto los cumple:
  cadencia y caudal, issues como fuente, auditoría rotativa y limpieza de ramas (`--salud`, reglas 7 y 2,
  Para Benjamin 3 y 4). Entra el zumbido intermitente (1). El 5 pierde el botón de pausa del Replay: ya
  tiene nombre (`replay.js:369`).
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 50 a 73) y `tools/audit.test.mjs` (10).
- README: la auditoría en Pruebas y en la estructura, `--salud` y `docs/investigacion.md`.
- Validado: 125 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 17 e2e en verde.
- **Siguiente:** iteración 31, mantenimiento · Deuda: pendiente 1 (Smoke intermitente «Zumbido del espacio: se calla con la pestaña oculta»: falló…)

### 2026-10-13 · Iteración 31 · Mantenimiento · Deuda

- **Arreglo: el zumbido del espacio ya no se reanuda con la pestaña oculta** (pendiente 1). Al ocultarse
  la pestaña, `app.js` apaga el zumbido, pero `stepAmbience` (`galaxy.js`), que corre en cada cuadro,
  volvía a pedirlo cuando cambiaba su nivel y pisaba ese silencio. Ahora no pide nada con
  `document.hidden`; al volver, `pokeAmbience` lo vuelve a pedir como antes.
- **Reproducción:** la sección «Zumbido del espacio» del smoke sola, 20 corridas → 1 falla («con la
  pestaña oculta el zumbido sigue sonando»), 19 en verde. Después del arreglo: 40 corridas, 40 en verde.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «se calla con la pestaña oculta…» ahora espera
  800 ms (varios turnos de `stepAmbience`) y vuelve a comprobar el silencio, en vez de mirarlo una vez.
- README: sin cambios (no cambia lo que hace la app).
- QA: contraste, 320 px, teclado y temas no se tocan; sonido y modo TV, por el mismo paso del smoke; auditoría: no toca la página más que un guardia en `stepAmbience`.
- Reclamo: loop/31, sin colisión
- Validado: 125 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 17 e2e en verde.
- **Siguiente:** iteración 32, expansión: ítem 10 (Repos locales en la app de escritorio, Fuentes)

### 2026-10-13 · Iteración 32 · Expansión · Fuentes

- **Capacidad nueva: repos locales en la app de escritorio** (ítem 10 de la hoja de ruta). **Abrir carpeta…**
  elige un repositorio git con el diálogo del sistema (o `npm start -- --local=ruta`) y se sigue como
  cualquier otro, en su pestaña con la etiqueta *local*. `electron/git.js` lee ramas, commits, ancestros y
  archivos con `git` (`execFile`, sin shell, `core.fsmonitor` apagado, commits validados) y vigila
  `.git/refs`, `packed-refs` y `HEAD`; `js/sources/local.js` (`LocalGitSource`, hereda de la de GitHub como
  la de GitLab) arma el grafo y las actividades. La página solo conoce el id de la carpeta elegida
  (`GBDesktop.git`); las carpetas se recuerdan en la carpeta de datos. Sin red y sin cuota. No entra en la
  demo ni en la web: leer carpetas solo puede hacerlo el escritorio, y la web avisa si se abre un `local:`.
- **Pruebas que fallan sin la capacidad:** `tools/local-git.test.mjs` (6) y `tools/local.test.mjs` (7) con
  repos git reales; en `e2e/desktop.spec.mjs`, el repo local que ve llegar un commit y una rama sin
  esperar al sondeo y se recuerda al reabrir, el `--local` que no es un repo, y el puente que rechaza
  carpetas no elegidas; en `e2e/web.spec.mjs`, que la web no muestra el botón y avisa de un `local:`.
- README: la función en la lista, la sección de la app de escritorio, Pruebas, Estructura, Límites conocidos
  y Seguridad.
- QA: web y escritorio (las e2e nuevas de ambos); sin conexión e instalable (`local.js` va a `FILES` de
  `sw.js`, lo comprueba `tools/pwa.test.mjs`); 40 idiomas (8 textos nuevos, `check-i18n`); consola y CSP
  (el CSP no cambia, e2e web sin errores); cuota de GitHub (no gasta nada: el `fetch` de la prueba falla si
  la fuente lo toca). Sin mirar a mano en esta iteración: el recorrido solo con teclado del botón nuevo,
  320 px con el botón extra en la barra, 1.000 ramas locales y la etiqueta en árabe y tamil (pendiente 18); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/32, sin colisión
- Validado: 138 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 33, expansión: ítem 11 (Widget embebible y capa para streaming, Plataformas)

### 2026-10-13 · Iteración 33 · Expansión · Plataformas

- **Capacidad nueva: widget embebible y capa para streaming** (ítem 11 de la hoja de ruta). `?embed=1` deja
  solo el grafo y los avisos, sin barras, para un iframe en documentación, wikis o Notion; `&bg=transparent`
  deja el fondo transparente (fuente de navegador de OBS). `js/i18n.js` marca `<html class="embed">` antes
  de pintar (sin parpadeo; la CSP prohíbe scripts en línea) y `css/styles.css` esconde el resto. El título
  del repo sigue para lectores de pantalla. En embed no se leen ni se escriben los repos seguidos
  (`saveTabs` no hace nada) y no entra en modo TV. Sin textos nuevos: no hay interfaz nueva que traducir.
- **Pruebas que fallan sin la capacidad:** paso nuevo del smoke «solo el grafo y los avisos, sin barras ni
  desborde» (640×400: nada de topbar, resumen, actividad ni barra; sin desborde; el grafo llena el marco;
  fondo transparente; sin modo TV).
- README: la función en la lista, el código para pegar, Límites conocidos (token y sin `frame-ancestors`)
  y Seguridad.
- QA: filas del protocolo tocadas: 320 px y tema claro/oscuro, cubiertas por el mismo CSS que no depende
  del ancho; la demo (sin API) en el smoke; consola y CSP sin cambios (el smoke falla con errores). Sin
  mirar a mano: solo teclado dentro del iframe y árabe; auditoría: 0 hallazgos nuevos. El paso del smoke cazó un fallo real a medio camino (el grafo medía 0 px: `height:100%` no resuelve en `html`), arreglado con altura explícita.
- Reclamo: loop/33, sin colisión
- Validado: 138 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 34, expansión: ítem 12 (Salud del repo, Análisis)

### 2026-10-13 · Iteración 34 · Expansión · Análisis

- **Capacidad nueva: salud del repo** (ítem 12 de la hoja de ruta). El botón del pulso en la barra abre un
  diálogo con lo que el grafo ya tiene: ramas sin actividad hace más de 30 días y sin PR, PRs abiertos por
  edad, tiempo de abierto a fusionado de los últimos 20 PRs fusionados y ritmo de merges (7 y 30 días) y
  releases (30 días). Cada fila lleva a su rama. Cálculos puros en `js/health.js`; los PRs fusionados traen
  ahora `openedAt` (GitHub y GitLab, por sondeo y por eventos, y la demo) y `U`/`i18n.fmtSpan` da los lapsos
  en cada idioma. No hace consultas nuevas ni guarda nada; cuenta el repo, no personas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (5 pruebas con datos fijos) y el paso
  del smoke «salud del repo: listas y ritmo de lo ya cargado, y cada fila lleva a su rama» (que cazó un
  índice mal calculado cuando una lista vacía no dibuja su `<ul>`).
- README: la función en la lista, el botón en Controles, `js/health.js` en la estructura, Límites conocidos
  (qué cuenta el ritmo) y Seguridad.
- QA: filas del protocolo tocadas: demo sin token (el smoke abre el panel en la demo, sin API); 40 idiomas
  (10 textos nuevos, `check-i18n`); sin conexión (`js/health.js` en `FILES` de `sw.js`); consola y CSP sin
  cambios; cuota de GitHub (no gasta nada). Sin mirar a mano: solo teclado, árabe y tamil, 320 px y el
  panel en la app de escritorio; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/34, sin colisión
- Validado: 143 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 35, mantenimiento · QA: pendiente 18 (Repos locales sin mirar a mano (iteración 32): el botón **Abrir carpeta…** solo…)

### 2026-10-13 · Iteración 35 · Mantenimiento · QA

- **Arreglo: la barra a 320 px desbordaba en la app de escritorio** (pendiente 18, el botón **Abrir carpeta…**
  a 320 px). Con el botón de más, `.repo-form` no cabía en tamil (370 px de ancho en una ventana de 305) ni en
  alemán (332): a ≤ 560 px el formulario ahora pasa a dos filas (el campo ocupa la primera, los botones la segunda).
- **Reproducción:** `xvfb-run npx playwright test e2e/desktop.spec.mjs -g "320 px"` → «scrollWidth - clientWidth ≤ 0» sin cumplirse (tamil 65 px, alemán 27 px).
- **Hallazgos:** 3 nuevos (pendientes 18, 19 y 20), 0 a la base de la auditoría. Repo local de 1.000 ramas en tamil y árabe sin errores de consola, foco visible en 4 Tab sin caer a `<body>`, árabe en `rtl`; la auditoría `--langs` (137 hallazgos, 0 Alta) solo repite los de `objetivo-chico` por idioma y dos medidas de rendimiento sobre el presupuesto de esta máquina.
- **Pruebas que fallan sin el arreglo:** la e2e «a 320 px la barra con Abrir carpeta no desborda, ni en los idiomas de textos largos» (tamil y alemán).
- README: sin cambios (no cambia ninguna función).
- QA: filas tocadas: solo teclado (Tab llega al botón con foco visible), 320 px (el hallazgo), árabe y tamil, 1.000 ramas, consola; smoke 3 veces en verde (sin intermitencias); auditoría completa `--langs` (sin tipos nuevos). Sin mirar: Replay y modo TV con un repo local.
- Reclamo: loop/35, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 143 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 22 e2e en verde.
- **Siguiente:** iteración 36, expansión: ítem 13 (GitHub Enterprise Server, Fuentes)

### 2026-10-13 · Iteración 36 · Expansión · Fuentes

- **Capacidad nueva: GitHub Enterprise Server** (ítem 13 de la hoja de ruta). `GitHubSource` acepta `apiUrl`
  (`https://host/api/v3`): REST ahí, GraphQL en `https://host/api/graphql`, enlaces a `https://host`; una URL que
  no sea https (o con usuario) se ignora. En la web se activa con `?api=`; en la app de escritorio con
  `--api-url=`, que suma ese host, y solo él, al `connect-src` del CSP al servir `index.html`. Sin textos nuevos
  en la interfaz (nada que traducir).
- **Pruebas que fallan sin la capacidad:** en `tools/github.test.mjs`, la API simulada ahora responde solo en su
  `base` (cualquier otro host falla): «GHE sin token» (modo events y su paginación), «GHE con token» (GraphQL en
  `/api/graphql` y token solo al host) y «una URL de API que no es https no se usa»; y la e2e de escritorio
  «--api-url suma solo ese host al CSP».
- README: la función en la lista, `--api-url` en la app de escritorio, Límites conocidos (un servidor por sesión,
  claves compartidas, token único, sin probar contra un servidor real) y Seguridad (CSP y token).
- QA: filas tocadas: CSP (la web no cambia; `pwa.test.mjs` sigue exigiendo `connect-src` cerrado), cada token a su
  API (prueba del token solo al host), sin red (el error sigue siendo de red). Sin mirar a mano: un servidor real
  de Enterprise; el mensaje de «no se pudo conectar» nombra api.github.com (anotado en Límites).
- Reclamo: loop/36, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 146 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 23 e2e en verde. El primer `check` falló en tres pasos del smoke ajenos al cambio y pasó al repetirlo: pendiente nuevo [Deuda] (Media, 4).
- **Siguiente:** iteración 37, expansión: ítem 14 (Choques entre ramas, Análisis)

### 2026-10-13 · Iteración 37 · Expansión · Análisis

- **Capacidad nueva: choques entre ramas** (ítem 14 de la hoja de ruta). El panel de salud suma «Buscar choques»:
  compara con la rama por defecto cada rama con PR abierto del mismo repo (hasta 20) y lista los archivos que
  tocan dos o más a la vez, con sus ramas; cada fila lleva a una de ellas. Reusa `source.files` (GitHub, GitLab,
  demo y repos locales), así que no hay API nueva. Corre solo al pulsar el botón: abrir el panel no gasta cuota.
  Cálculos puros (`clashes`, `clashCandidates`) en `js/health.js`. Queda fuera el aviso automático al aparecer un
  choque nuevo (requeriría comparar sin que se pida).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (2 pruebas nuevas: choques ordenados y sin
  repetir ramas; candidatas sin la rama por defecto ni forks) y el paso del smoke de salud, que ahora pulsa
  «Buscar choques» y espera el resultado.
- README: la función en la lista, Controles, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (el smoke la ejerce con la API de la demo); 40 idiomas (6 textos nuevos,
  `check-i18n`); cuota de GitHub (solo al pedirlo, una consulta por rama, tope 20); error de la API (mensaje
  «no se pudieron comparar»); resultado en región `role="status"`. Sin mirar a mano: solo teclado, árabe y
  tamil, 320 px y la app de escritorio; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/37, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 148 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 23 e2e en verde.
- **Siguiente:** iteración 38, expansión: ítem 15 (Avisos a Slack y Discord, Salidas)

### 2026-10-13 · Iteración 38 · Expansión · Salidas

- **Capacidad nueva: avisos a Slack y Discord** (ítem 15 de la hoja de ruta). En la app de escritorio, Ajustes
  suma por servicio una URL de webhook (guardada cifrada, en su archivo, como un token), los cuatro eventos que
  recibe (release, merge a la rama por defecto, CI en rojo, force-push en la por defecto) y «Enviar prueba».
  `js/hooks.js` decide qué actividad en vivo va a qué webhook (un PR fusionado cuenta una vez; como mucho 5
  avisos por lote); `electron/webhooks.js` valida que la URL sea del servicio, arma el cuerpo (sin menciones ni
  enlaces ajenos) y lo envía desde el proceso principal, sin seguir redirecciones. La CSP no cambia.
  Queda fuera: cola y reintentos, y avisar de un squash sin PR como merge.
- **Pruebas que fallan sin la capacidad:** `tools/webhooks.test.mjs` (6 pruebas: URL aceptadas y rechazadas,
  cuerpo escapado, envío contra un servidor local sin redirecciones, evento por actividad y enrutado) y la e2e
  de escritorio «los avisos a Slack y Discord» (URL cifrada, prueba que llega al webhook local, URL ajena que
  no sale, eventos que se recuerdan), además del puente `GBDesktop.webhook` en la primera e2e.
- README: la función en la lista, Pruebas, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: 40 idiomas (7 textos nuevos, `check-i18n`); app de escritorio (e2e); web (la sección de
  Ajustes queda oculta sin `GBDesktop`, la ejerce el smoke); token fuera de `localStorage` y de errores.
  Sin mirar a mano: solo teclado, árabe y tamil, 320 px del diálogo con las filas nuevas; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/38, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 154 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 39, mantenimiento · Deuda: pendiente 1 (Smoke: el paso de contraste de las pestañas (varios repos) mide 500 ms fijos de…)

### 2026-10-13 · Iteración 39 · Mantenimiento · Deuda

- **Arreglo: el paso de contraste de las pestañas espera a las transiciones, no 500 ms fijos** (pendiente 1). `tools/smoke.mjs` ahora usa `transitionsDone` (`document.getAnimations()` hasta que terminan las finitas) tras cambiar de tema.
- **Reproducción:** `node tools/smoke.mjs` con la espera en 0 ms (como un equipo que no alcanza los 600 ms de la transición) → `dark: 8 textos con poco contraste, como 1.02:1 «Conectar»`, 3 corridas de 3 en rojo; con el arreglo el paso pasa.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «las pestañas y el repo de cada aviso se leen (contraste, tema claro y oscuro)».
- README: sin cambios (herramienta interna).
- QA: smoke (contraste en tema claro y oscuro); auditoría: no toca la página.
- Reclamo: loop/39, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 154 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 40, expansión: ítem 16 (Aprender git, Público)

### 2026-10-13 · Iteración 40 · Expansión · Público

- **Capacidad nueva: aprender git** (ítem 16 de la hoja de ruta). El botón «Practicar git» abre un repo de práctica
  (pestaña como la demo, sin red) con una terminal bajo el grafo. `js/gitsim.js` es un intérprete puro (commit,
  branch, checkout/switch, merge con avance rápido o commit de fusión, rebase, reset, log, status, help) con
  shas deterministas y cuatro ejercicios que se resuelven solos (rama y commits, fusionar, rebase, deshacer);
  `js/sources/practice.js` pasa su estado a la forma de datos del grafo y emite actividades con los textos que ya
  existían; `js/practice-ui.js` es la terminal (historial con flechas, salida con `textContent`). Queda fuera:
  `stash`, `cherry-pick`, `tag`, `remote`, el área de preparación y los conflictos.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (11 pruebas: cada comando, errores, shas
  deterministas, ejercicios que parten sin resolver y no se resuelven con el atajo equivocado) y el paso del smoke
  «la práctica de git responde a los comandos en el grafo» (nodos nuevos en el 2D, HTML escapado, error de un
  comando desconocido, ejercicio resuelto y cambio de ejercicio).
- README: la función en la lista, Pruebas, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (la práctica no consulta ninguna API: el smoke falla si lo hace); sin conexión
  (los tres archivos nuevos en `FILES` de `sw.js`, `tools/pwa.test.mjs`); 40 idiomas (16 textos, `check-i18n`);
  teclado (la terminal recibe el foco al abrirse, Enter ejecuta, flechas recorren el historial); consola y CSP
  (sin cambios, ningún servidor nuevo). Sin mirar a mano: árabe y tamil de la terminal, 320 px, solo teclado en
  el selector de ejercicios, 3D (el grafo es el mismo); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/40, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 165 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde (a la segunda corrida: la primera falló en el paso de `?repo=@ana`, ajeno al cambio, anotado en el pendiente 3).
- **Siguiente:** iteración 41, expansión: ítem 17 (Tags y despliegues, Datos)

### 2026-10-13 · Iteración 41 · Expansión · Datos

- **Capacidad nueva: tags y despliegues** (ítem 17 de la hoja de ruta). `GitHubSource.syncMarks` lee `/tags` (50) y
  `/deployments` (30) con ETag al abrir el repo y cada 15 minutos; `data.tags` (commit → nombres) y `data.deploys`
  (entorno → commit). `app.js` los junta por commit (`marksBySha`) y el grafo 2D dibuja un banderín (nombre del
  tag, «+n» si hay más) y una placa con el entorno; el 3D, un obelisco y una losa verde instanciados; la ficha
  del commit los nombra. Interruptor en Ajustes (apagado: ninguna consulta). La demo trae tags y entornos
  (staging sigue a `develop`).
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (tags al commit, despliegue más nuevo por entorno,
  sin repetir antes de 15 min, 404 y apagado sin gasto) y el paso del smoke «tags y despliegues: banderín en el
  commit con tag y placa en el de cada entorno».
- README: la función en la lista, Pruebas, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas a la API); 40 idiomas (4 textos, `check-i18n`); CSP (sin cambios);
  XSS (nombres con `textContent` y `U.esc`); cuota (2 consultas, apagable). Sin mirar a mano: 320 px, árabe,
  solo teclado (el banderín es decorativo, `aria-hidden`; los nombres van en la ficha); auditoría: 0 hallazgos nuevos (el interruptor de Ajustes salió con 19 px de alto y se arregló con `.marks-toggle`).
- Reclamo: loop/41, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 167 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 42, expansión: ítem 18 (Vista de texto accesible, Público)

### 2026-10-13 · Iteración 42 · Expansión · Público

- **Capacidad nueva: vista de texto accesible** (ítem 18 de la hoja de ruta). El botón de las líneas abre un diálogo
  con las ramas (la por defecto primero, luego las más movidas, hasta 200) y sus últimos 10 commits por primer padre
  como un árbol `role="tree"` (`js/textview.js`: `build` puro y `mount` con el teclado). ↑ ↓ recorren lo visible,
  → abre o baja al primer commit, ← cierra o sube, Inicio y Fin, Enter lleva al grafo (2D o 3D). Cada nodo tiene
  nombre accesible (mensaje, autor, antigüedad, merge, tags); todo entra con `textContent`. Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (orden de ramas, primer padre, límites, ciclo) y el
  paso del smoke «vista de texto: árbol con teclado, nombres accesibles y Enter lleva al grafo» (que además midió un
  desborde de 6 px en el diálogo, corregido con `.tv-body { min-width: 0 }` y filas que envuelven).
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas); 40 idiomas (6 textos, `check-i18n`); teclado (↑ ↓ → ← Enter en el
  smoke, foco dentro del árbol al abrir); desborde en escritorio (smoke); CSP (sin cambios); XSS (`textContent`).
  Sin mirar a mano: 320 px, árabe, 3D, lector de pantalla real; auditoría: 0 hallazgos nuevos (la e2e de 320 px midió 29 px de desborde en tamil con el botón nuevo y se arregló con `.controls { flex-wrap: wrap }`).
- Reclamo: loop/42, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 170 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 43, mantenimiento · Errores: pendiente 2 (Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` cor…)

### 2026-10-13 · Iteración 43 · Mantenimiento · Errores

- **Arreglo: valores guardados con el tipo equivocado** (pendiente 2). `U.store.get` ahora devuelve el valor por defecto cuando lo guardado no es del tipo de éste (lista, texto, número, booleano), así que `pins` y `filter` corruptos ya no dejan el repo en «Cargando». Mismo patrón en el resto del código: todos los `U.store.get` con valor por defecto pasan por la misma guarda; `owners` (defecto `null`) ya se validaba a mano.
- **Reproducción:** `node --test tools/util.test.mjs` → sin el arreglo, `pins:a/b` = `{}` sale como objeto (no como lista) y `filter:a/b` = `{"a":1}` como objeto (no como texto).
- **Pruebas que fallan sin el arreglo:** `tools/util.test.mjs` (pins, filter, depth y marks corruptos; valor válido y ausente intactos).
- README: sin cambios (no cambia ninguna función visible).
- QA: filas tocadas: valores guardados (prueba unitaria sobre `util.js`); no toca la interfaz; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/43, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 171 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 44, expansión: ítem 19 (Búsqueda y filtro por autor, Análisis)

### 2026-10-13 · Iteración 44 · Expansión · Análisis

- **Capacidad nueva: búsqueda de commits y filtro por autor** (ítem 19 de la hoja de ruta). La lupa de la barra superior abre un cuadro que busca entre los commits ya cargados por mensaje, SHA o autor (`@ana`, por nombre o usuario; todas las palabras tienen que aparecer), con un selector de autor con la cuenta de cada uno. ↓ baja a los resultados, Enter o un clic vuela al commit en el grafo (2D o 3D) y Esc cierra. Lista los 50 más nuevos y dice el total. Sin consultas nuevas; en la demo funciona igual. Lo de esconder del grafo las ramas de otros autores queda como ítem 34.
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (mensaje, SHA, autor con y sin `@`, filtro por clave, límite, cuenta de autores) y el paso del smoke «búsqueda de commits: por mensaje y por autor, con teclado, y Enter vuela al commit».
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas); 40 idiomas (8 textos, `check-i18n`); teclado (foco en el campo al abrir, ↓ y Enter en el smoke); desborde en escritorio (smoke); CSP (sin cambios); XSS (`textContent`). Sin mirar a mano: 320 px, árabe, tamil, 3D, lector de pantalla real; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/44, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 177 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 45, expansión: ítem 21 (Gitea, Forgejo y Codeberg, Fuentes)

### 2026-10-13 · Iteración 45 · Expansión · Fuentes

- **Capacidad nueva: Codeberg como fuente** (ítem 21 de la hoja de ruta). `codeberg:dueño/repo` o la URL de codeberg.org abre un repo público de Codeberg como una pestaña más: `js/sources/codeberg.js` hereda de la fuente de GitHub (la API de Forgejo se parece) y cambia lo propio: página con `limit` (50), ramas listadas enteras en cada ciclo (hasta 500), historia con `commits?sha=`, force-push distinguido con dos comparaciones `a...b`, PRs con título `WIP:`/`Draft:` como borrador y árbol de archivos para las galaxias. CORS de codeberg.org comprobado con `curl` (`access-control-allow-origin: *`, `Link` y `X-Total-Count` expuestos): sirve desde la web, sin pasar por escritorio. La CSP suma `https://codeberg.org` a `connect-src` e `img-src` (solo avatares de ahí) y nada más; no hay token de Codeberg, así que nada sensible sale. 7 textos nuevos en los 40 idiomas (los de red, límite y HTTP derivados de los de GitLab; el de «no encontrado» escrito aparte porque no hay token que sugerir). Sin hacer: otros servidores de Gitea/Forgejo, token para repos privados, eventos y CI.
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` (parseo de URL, carga, vivo con push/rama/PR/force/borrado, 404, 429 con `Retry-After`, más de 50 ramas, árbol) y el paso del smoke «Codeberg» (etiqueta, sin `Authorization`, PR `#3`, aviso de no encontrado).
- README: la función en la lista, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`tools/pwa.test.mjs` con la directiva nueva); XSS (nada nuevo en `innerHTML`; textos por `textContent`); 40 idiomas (`check-i18n`); token solo a su API (Codeberg no lleva ninguno, el smoke lo comprueba); 404 y sin red (prueba y smoke). Sin mirar a mano: 320 px, 3D, repos de más de 500 ramas contra el servidor real; auditoría: no toca la interfaz más allá de la etiqueta.
- Reclamo: loop/45, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 184 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde. (La primera pasada falló dos e2e: la CSP de escritorio, mía y corregida, y «grabar el Replay», intermitente bajo carga, que pasó sola y en la segunda pasada.)
- **Siguiente:** iteración 46, expansión: ítem 20 (Comparar dos ramas, Análisis)

### 2026-10-14 · Iteración 46 · Expansión · Análisis

- **Capacidad nueva: comparar dos ramas** (ítem 20 de la hoja de ruta). El panel de salud suma «Comparar dos ramas»: dos selectores (por defecto, la rama por defecto y otra), y al pulsar «Comparar» dice cuántos commits lleva cada rama por delante de la otra y el commit desde donde se separaron (el ancestro común más nuevo), calculado con los commits ya cargados y sin consultas; avisa si falta historia y las cuentas pueden quedar cortas. Cada línea lleva a la rama o al commit en el grafo. Después lista los archivos que cambió solo una, solo la otra o las dos (hasta 8 por grupo), con `source.files` de cada rama contra la por defecto: dos consultas, solo al pulsar. Lógica pura en `js/health.js` (`compare`, `splitFiles`); 15 textos nuevos en los 40 idiomas. Sin hacer: resaltar en el grafo el tramo de cada rama y la comparación directa A...B por API.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (por delante, punto de separación con merge, rama contenida, historia incompleta, archivos en una o en las dos) y el paso del smoke «salud del repo» (selectores y filas del resultado con la demo).
- README: la función en la lista, Controles, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (smoke); 40 idiomas (`check-i18n`); XSS (filas con `textContent`, selectores con `new Option`); desborde del panel (smoke). Sin mirar a mano: 320 px, árabe, 3D, lector de pantalla; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/46, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 188 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 47, mantenimiento · Rendimiento: pendiente 10 (Durante Replay se actualizan las dos vistas aunque una esté oculta)

### 2026-10-14 · Iteración 47 · Mantenimiento · Rendimiento

- **Arreglo: durante el Replay solo se actualiza la vista a la vista** (pendiente 10). `onFrame` dibujaba y festejaba en 2D y 3D aunque una estuviera oculta; ahora solo lo hace `graph`, y `setView` pone al día la vista que se muestra con el último cuadro (`replayFrame`). Medida: cuentas de `Graph3D.update` en el smoke, no tiempos (no se corrió `audit.mjs --repetir` antes y después; queda sin medir).
- **Reproducción:** `node tools/smoke.mjs` sin el arreglo → `✗ replay: solo se actualiza la vista a la vista`.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «replay: solo se actualiza la vista a la vista» (con la vista 2D, cuenta las llamadas a `Graph3D.update`; al pasar a 3D mientras corre el Replay, debe actualizarse).
- README: sin cambios (comportamiento interno).
- QA: Replay con 2D y 3D en el smoke; auditoría: no toca la interfaz.
- Reclamo: loop/47, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 188 pruebas (`node --test`), smoke (73 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 48, expansión: ítem 22 (Bitbucket Cloud, Fuentes)

### 2026-10-14 · Iteración 48 · Expansión · Fuentes

- **Capacidad nueva: Bitbucket Cloud como fuente** (ítem 22 de la hoja de ruta). `bitbucket:espacio/repo` o la URL de bitbucket.org abre un repo público de Bitbucket como una pestaña más: `js/sources/bitbucket.js` hereda de la fuente de GitHub y cambia lo propio: páginas con `pagelen` (100) y `next`, ramas ordenadas por fecha (hasta 300, con el total de `size`), historia con `commits/{hash}`, force-push distinguido con `exclude`, PRs con `draft` y estado `MERGED`/`DECLINED`, y árbol de `src` para las galaxias. La API real da solo 60 consultas por hora por IP sin token (`x-ratelimit-limit: 60, 60;w=3600`) y no expone el encabezado al navegador, así que la fuente lleva su propia cuenta de la última hora (48 de tope, repartido entre repos de Bitbucket; cargar historia gasta como mucho el 60 %; ciclos de 90 s o más según lo que cuesten). CORS comprobado con `curl` (`access-control-allow-origin: *`) y la fuente probada contra `atlassian/aui` real, solo lectura. La CSP suma `https://api.bitbucket.org` a `connect-src` y nada a `img-src` (sin avatares: sus hosts no están). 7 textos nuevos en los 40 idiomas (derivados de los de Codeberg, que ya están traducidos). Sin hacer: token de Bitbucket, repos privados, pipelines.
- **Pruebas que fallan sin la capacidad:** `tools/bitbucket.test.mjs` (parseo de URL, carga, vivo con push/rama/PR/force/borrado, PR rechazado, 404, 429, más de 100 ramas con `next`, la cuota por hora y el árbol) y el paso del smoke «Bitbucket» (etiqueta, sin `Authorization`, PR `#3`, aviso de no encontrado).
- README: la función en la lista, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`tools/pwa.test.mjs` con la directiva nueva; sin `img-src` nuevo); XSS (nada nuevo en `innerHTML`; textos por `textContent`); 40 idiomas (`check-i18n`); token solo a su API (Bitbucket no lleva ninguno, la prueba y el smoke lo comprueban); 404 y sin red (prueba y smoke); cuota (prueba). Sin mirar a mano: 320 px, 3D, repos de más de 300 ramas contra el servidor real; auditoría: no toca la interfaz más allá de la etiqueta.
- Reclamo: loop/48, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 197 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 49, expansión: ítem 23 (Resumen de la semana, Salidas)

### 2026-10-14 · Iteración 49 · Expansión · Salidas

- **Capacidad nueva: resumen de la semana** (ítem 23 de la hoja de ruta). El panel de salud suma «Resumen de la semana»: los últimos 7 días con lo ya cargado y sin consultas (commits, PRs fusionados y releases de la actividad, quién aportó con hasta 5 personas por commits, y la rama más activa), con vista previa en Markdown y los botones «Copiar Markdown» (si no hay permiso del portapapeles, deja el texto seleccionado) y «Guardar .md» (enlace `blob:`). Lógica pura en `js/digest.js`; el Markdown escapa el texto de afuera y solo enlaza URL http(s); 11 textos nuevos en los 40 idiomas. Sin hacer: guardarlo como imagen y juntar varios repos.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (ventana de 7 días, personas, rama más activa, semana vacía, escapes y esquemas raros) y el paso del smoke «salud del repo» (Markdown con formato y descarga `.md`).
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (smoke); 40 idiomas (`check-i18n`); XSS (vista previa con `textContent`; Markdown escapado y probado); desborde del panel (smoke). Sin mirar a mano: 320 px, árabe, lector de pantalla; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/49, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 217 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde. (La primera pasada del smoke falló en el panel de salud: el resumen mostraba `#undefined` y `[object Object]` con los títulos de la demo; corregido pasando los títulos por `i18n.text` y con prueba.)
- **Siguiente:** iteración 50, expansión: ítem 24 (Extensión de VS Code, Plataformas)

### 2026-10-14 · Iteración 50 · Expansión · Plataformas

- **Capacidad nueva: extensión de VS Code** (ítem 24 de la hoja de ruta). `vscode/` es una extensión sin compilación: `extension.js` abre un panel con la app, `server.js` la sirve en 127.0.0.1 (puerto al azar) bajo una clave al azar y le entrega el token de la sesión de GitHub de VS Code en `vscode-session.js` (que se suma a `index.html` solo al servir; la CSP de la página no cambia), y el repo sale del `origin` de `.git/config`. `tools/vscode.mjs` deja el paquete listo (`vscode/app/`); publicarlo es de Benjamin.
- **Pruebas que fallan sin la capacidad:** `tools/vscode.test.mjs` (repo desde `.git/config` en https, ssh y otros servicios; token entregado como JSON dentro de `localStorage`; 404 sin la clave, con otra, para `sw.js`, `package.json` y rutas con `..`; claves distintas por arranque; comandos del manifiesto registrados). A mano, con Playwright contra el servidor de la extensión: la página lee el token, lo manda solo a `api.github.com`, sin errores de consola y sin service worker.
- README: la función en la lista, su sección, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`index.html` sin cambios; el panel de VS Code solo enmarca el servidor local); token solo a su API (mirado a mano) y nunca en una URL ni en el service worker (la prueba); XSS (sin `innerHTML` nuevo en la página); 40 idiomas (la página no cambia; la extensión trae textos en inglés y español, dicho en Límites conocidos). Sin mirar: el panel dentro de VS Code (no hay VS Code en la sesión); auditoría: no toca la página.
- Reclamo: loop/50, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 221 pruebas (`node --test`), smoke (77 pasos), i18n (0 errores) en verde; e2e y auditoría no corridas (el cambio no toca la página ni el escritorio).
- **Siguiente:** iteración 51, mantenimiento · QA: pendiente 16 (Repo local de 1.000 ramas en árabe (iteración 35): el primer arranque en frío t…)

### 2026-10-14 · Iteración 51 · Mantenimiento · QA

- **Auditoría de QA: el pendiente 16 no era un fallo y el 17 se arregló** (pendientes 16 y 17 de entonces). Repo local de 1.000 ramas con `--lang=es`, `ar` y `ta` en la app de escritorio: `#status` sale de «cargando» con 40 ramas (el presupuesto de un ciclo) y llega a 1.001 entre 0,3 y 0,5 s después, igual que en GitHub; el 22 s del pendiente era el primer arranque en frío de Electron (14,7 s la primera vez, 1,3–1,6 s las siguientes, en los tres idiomas), no el repo ni el idioma. Se quitó de la lista y el arranque en frío quedó como pendiente 18. Arreglo: la auditoría completa con `--langs` contaba como nuevo cada control ya conocido en otro idioma (`conocido()` en `tools/audit.mjs`): de 135 fuera de la base pasó a 3.
- **Reproducción:** `node --test tools/audit.test.mjs` sin el arreglo → `SyntaxError: The requested module './audit.mjs' does not provide an export named 'conocido'`; en la auditoría, `node tools/audit.mjs --langs` → `135 hallazgos (0 Alta), 111 fuera de la base`.
- **Hallazgos:** 3 nuevos (pendientes 17, 18 y 19), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` («--langs: un control conocido en un idioma de celular es conocido en los demás, pero no en otro escenario»).
- README: sin cambios (herramienta del loop).
- QA: auditoría completa con `--langs` (solo `objetivo-chico`, ya conocidos; medidas dentro de presupuesto); smoke tres veces en verde (con `PLAYWRIGHT_CHROMIUM_PATH`, ver pendiente 19); 1.000 ramas locales en es, ar y ta en escritorio. Sin mirar a mano esta vez: sin red, cuota agotada, 3D, Replay y modo TV a 320 px; auditoría: 3 `objetivo-chico` de `celular-320` fuera de la base (pendiente 17).
- Reclamo: loop/51, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 222 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 52, expansión: ítem 25 (GitLab propio, Fuentes)

### 2026-10-14 · Iteración 52 · Expansión · Fuentes

- **Capacidad nueva: GitLab propio** (ítem 25 de la hoja de ruta, partido: esta es la primera entrega; el reconocimiento de URLs y los avatares quedan como ítem 35). `GitLabSource` toma `webUrl` (`?gitlab=` en la web, `--gitlab-url=` en escritorio, solo https y sin usuario): la API, los enlaces y el token van a esa instancia; una dirección inválida vuelve a gitlab.com. La app de escritorio suma solo ese host a `connect-src`; el CSP de la web no cambia.
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («un GitLab propio: todo sale de su host…» y «…no muestra avatares…»); e2e de escritorio «--gitlab-url suma solo ese host al CSP…».
- README: la función en la lista, el comando de ejemplo, Límites conocidos y Seguridad (CSP y tokens).
- QA: filas de fuentes, token y CSP: lo cubren las pruebas con API simulada (subruta incluida) y la e2e de escritorio; sin mirar a mano esta vez: tema, 320 px, 3D, Replay (no cambia la interfaz); auditoría: no toca la página visible.
- Reclamo: loop/52, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 224 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 53, expansión: ítem 26 (Una organización entera, tercera entrega, Escala)

### 2026-10-14 · Iteración 53 · Expansión · Escala

- **Capacidad nueva: los eventos de la organización en el panel** (ítem 26 de la hoja de ruta, partido: esta es la primera parte; los grupos de GitLab y la constelación pasan al ítem 41). `GitHubSource.orgFeed(owner)` pide `/orgs/{org}/events` (una consulta con ETag, cada 5 minutos, con la pestaña a la vista y sin pausa) y devuelve solo lo nuevo; la app lo suma al panel con el nombre de su repo, solo para repos sin pestaña propia. Un usuario (404) no da nada. Sin textos nuevos (reusa los de los eventos): i18n sin cambios. No está en la demo (no tiene organización).
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` («eventos de una organización…», dos pruebas); smoke, paso «los eventos de la organización llegan al panel…».
- README: la función, el apartado de la organización seguida, Límites conocidos.
- QA: filas de token (va solo a su API, mismo `api()`), XSS (el panel escapa todo con `U.esc`; sin `innerHTML` nuevo), CSP sin cambios; sin mirar a mano: 320 px, 3D, Replay (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/53, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 226 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida falló una e2e de escritorio sin relación (repo local); la repetición pasó y quedó como pendiente 3 `[Deuda]`.
- **Siguiente:** iteración 54, expansión: ítem 27 (Replay por tramo de fechas y con rótulos propios, Salidas)

### 2026-10-14 · Iteración 54 · Expansión · Salidas

- **Capacidad nueva: el Replay por tramo de fechas y con rótulos propios** (ítem 27 de la hoja de ruta). Un botón de calendario en la barra del Replay abre un formulario con Desde, Hasta, Título y Pie de foto: el Replay (y su video) cubre solo los commits del tramo, con la línea de tiempo y las marcas ajustadas a él, y el título y el pie se ven sobre el grafo y entran al video (`extra` de la grabación). Un tramo sin commits avisa y deja el Replay como estaba; «Toda la historia» lo quita. La lógica del tramo es `Replay.rangeOf` (pura). Sin consultas nuevas a la API; visible en la demo.
- **Pruebas que fallan sin la capacidad:** `tools/replay.test.mjs` (3 pruebas del recorte por fechas); smoke, paso «replay: tramo de fechas y rótulos propios».
- README: la función (Replay y su botón), la lista de controles, Límites conocidos y la lista de pruebas.
- QA: filas de XSS (título y pie van con `textContent`, sin `innerHTML` nuevo), CSP sin cambios, teclado (Esc cierra el formulario y devuelve el foco al botón), i18n (8 textos en los 40 idiomas); sin mirar a mano: 320 px, tema claro/oscuro, RTL, 3D; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/54, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 229 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida falló un paso del smoke sin relación (cambios de un commit); la repetición pasó y quedó anotado en el pendiente 2 `[Deuda]`.
- **Siguiente:** iteración 55, mantenimiento · Deuda: pendiente 1 (Smoke: una vez (iteración 27, corrida completa con `--langs`) el cuadro de la m…)

### 2026-10-14 · Iteración 55 · Mantenimiento · Deuda

- **Arreglo: medida y causa probable de la intermitente del video del Replay** (pendiente 1, sigue abierto: no se mostró el arreglo, así que no se toca el código). Cinco corridas simultáneas de `node tools/smoke.mjs --langs`: el paso «graba el Replay en video, de principio a fin» falló 1 de 5 con 1, 1, 1 colores (video liso); la causa probable queda anotada en el pendiente. Se probó una prueba con `Emulation.setCPUThrottlingRate` (20×, 60×, 200×): no falla sin el arreglo, y se descartó.
- **Reproducción:** `for i in 1 2 3 4 5; do node tools/smoke.mjs --langs & done; wait` → `✗ graba el Replay en video, de principio a fin: el video casi no tiene dibujo: 1, 1, 1 colores al 25, 50 y 75 %`.
- **Pruebas que fallan sin el arreglo:** ninguna todavía (ver el pendiente 1).
- README: sin cambios.
- QA: no toca la página; auditoría: no toca la página.
- Reclamo: loop/55, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: solo documentación; `node --test` (230) y `node tools/loop.mjs --check` en verde.
- **Siguiente:** iteración 56, expansión: ítem 28 (Ejercicios de Aprender git compartidos por URL, Público)

### 2026-10-14 · Iteración 56 · Expansión · Público

- **Capacidad nueva: ejercicios de Aprender git compartidos por URL** (ítem 28 de la hoja de ruta). La práctica de git abre con `?practice=<código>`: un ejercicio propio (título, meta, comandos de partida y condiciones de una lista cerrada) va entero en la URL, sin servidor, y se vuelve a validar al abrirlo (`cleanExercise`; nunca se evalúa como código). «Crear un ejercicio para compartir» lo arma desde la propia terminal y «Copiar enlace del ejercicio» da el enlace; `?practice=1` a `4` abre uno de la lista. Un código inválido se descarta y abre la demo. Aviso para quien toque la terminal: con más de un campo, el formulario ya no envía solo al pulsar Enter; la línea de comandos lo hace explícito.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (4 pruebas: ida y vuelta por la URL, parte sin resolver y no se resuelve con el atajo equivocado, números de la lista y basura, ejercicios mal hechos); smoke, paso «un ejercicio propio se crea, se comparte por URL y la URL lo abre y se resuelve».
- README: la función, Límites conocidos, Seguridad y la lista de pruebas.
- QA: filas de XSS (título y meta con `textContent`; una `<b>` en el título no se interpreta, el smoke lo mira), CSP sin cambios, teclado (la línea de comandos sigue enviando con Enter), i18n (16 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/56, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 234 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida del smoke falló los pasos de la práctica: con más de un campo el formulario no enviaba con Enter, y el enlace pasaba el ejercicio en vez de su especificación; los dos arreglados en esta rama.
- **Siguiente:** iteración 57, expansión: ítem 29 (Filtrar el grafo por ruta de archivo, Análisis)

### 2026-10-14 · Iteración 57 · Expansión · Análisis

- **Capacidad nueva: filtrar el grafo por ruta de archivo** (ítem 29 de la hoja de ruta). En el cuadro de la lupa, un campo de ruta y «Filtrar grafo» (o Enter): `GitHubSource.commitsByPath` hace una consulta `/commits?path=` por cabeza (la rama por defecto primero, 5 como mucho) y los commits cargados que la tocaron quedan a plena luz mientras el resto del grafo 2D se atenúa (`Graph.setPathFilter`, clase `pfx`). La lupa se marca mientras hay filtro; «Quitar filtro» y cambiar de pestaña o de repo lo deshacen. La demo compara la ruta con el mensaje del commit (no tiene archivos); las demás fuentes dicen que no pueden. Sin filtro no hay ninguna consulta nueva.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (`commitsByPath`: una consulta por cabeza con la ruta codificada, solo commits cargados, ruta vacía sin gasto); smoke, paso «filtro por ruta: atenúa los commits que no la tocaron, lo dice y se quita».
- README: la función, Límites conocidos y Seguridad.
- QA: filas de XSS (la ruta solo va a la URL codificada y a `textContent`), cuota (≤ 5 consultas por filtro, solo al pedirlo), teclado (Enter aplica; los botones se alcanzan con Tab), i18n (8 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D (el filtro es solo 2D), Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/57, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 235 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 58, expansión: ítem 30 (Los forks en el grafo, Datos)

### 2026-10-14 · Iteración 58 · Expansión · Datos

- **Capacidad nueva: los forks activos** (ítem 30 de la hoja de ruta). `GitHubSource.syncForks` pide `/forks` solo al abrir el panel de salud (una consulta, no más de una cada 15 minutos; la auditoría de cuota la dejó fuera de la carga) y `data.forks` guarda los de push propio en los últimos 90 días (hasta 30, el más nuevo primero; sin archivados ni URL que no sea https). El panel de salud abre con la lista (`health.compute` → `forks`), cada fila un enlace al fork con `rel="noopener noreferrer"`; la demo trae 2. Primera entrega: el dibujo de los forks como ramas atenuadas en el grafo queda fuera (pediría la historia de cada fork), dicho en el README y en la hoja.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (2: filtro de actividad, orden, archivados y URL mala, una consulta por 15 minutos; sin la API); `tools/health.test.mjs` (forks y su tiempo); smoke, paso «salud del repo» (2 forks con enlace https).
- README: la función, Límites conocidos y Seguridad.
- QA: filas de XSS (nombre y URL escapados, solo https), cuota (0 al cargar; 1 al abrir el panel, cada 15 min como mucho), i18n (1 texto en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/58, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 238 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida de la puerta falló: el smoke y la auditoría contaron la consulta `/forks` de más al cargar; pasó a pedirse solo al abrir el panel.
- **Siguiente:** iteración 59, mantenimiento · Seguridad: pendiente 9 (`parseRepo` acepta `..` como owner o nombre de un repo de GitHub (`util.js:39`;…)

### 2026-10-14 · Iteración 59 · Mantenimiento · Seguridad

- **Arreglo: `parseRepo` rechaza `.` y `..` como owner o nombre de un repo de GitHub** (pendiente 9). Antes `../x` o `x/..` pasaban y llegaban a la ruta `/repos/<owner>/<name>` de la API; ahora devuelven `null`, como ya hacían GitLab, Bitbucket y Codeberg. Nombres con puntos válidos (`.github/.github`, `a.b/c-d.js`) siguen igual. Mismo patrón en el resto: los demás `parseRepo` ya lo filtraban.
- **Reproducción:** `node --test tools/local.test.mjs` → `not ok 8 - parseRepo rechaza owner o nombre hechos solo de puntos (.., .) en GitHub` (`../x`).
- **Pruebas que fallan sin el arreglo:** `tools/local.test.mjs` (parseRepo con `..`, `.`, URL y ssh de GitHub).
- README: sin cambios (comportamiento interno de validación).
- QA: fila de XSS/entrada: la entrada se valida antes de tocar la red; auditoría: no toca la página más que `util.js`, ver Validado.
- Reclamo: loop/59, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 239 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 60, expansión: ítem 31 (Ensayar un comando sobre el repo real, Público)

### 2026-10-14 · Iteración 60 · Expansión · Público

- **Capacidad nueva: ensayar un comando sobre el repo real** (ítem 31 de la hoja de ruta). Con un repo real cargado aparece «Ensayar un comando»: abre la terminal de práctica sobre `gitsim.fromData`, una copia en memoria de las ramas y commits que el grafo ya tiene (los padres no cargados se descartan, las ramas sin commit cargado no entran). `merge`, `rebase`, `reset`, etc. se ven en el grafo 2D y 3D; el repo real no se toca, no hay consultas a la API y al volver a su pestaña el ensayo se cierra. «Reiniciar» rehace la copia; no ofrece crear ni compartir ejercicios.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (`fromData: copia un repo real…`) y el paso del smoke «ensayar un comando: la copia del repo real cambia sin tocar al original ni gastar cuota».
- README: función en la lista de «Aprender git», pruebas, Límites conocidos (solo lo cargado) y Seguridad (no guarda nada ni usa el token). Mapa de alcance: fila Público.
- QA: fila de XSS/entrada (el mensaje con HTML entra con `textContent`, lo mira el smoke), repo sin ramas (el botón se esconde) y demo (no aparece); 40 idiomas por `check-i18n`; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/60, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 240 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 61, expansión: ítem 32 (Ramas apiladas, Datos)

### 2026-10-14 · Iteración 61 · Expansión · Datos

- **Capacidad nueva: ramas apiladas** (ítem 32 de la hoja de ruta). `Layout.stackedPulls` detecta los PRs abiertos del mismo repo cuya base es la rama de otro PR (los ciclos no apilan) y `compute` ordena los carriles para que cada rama quede justo debajo de la de su base, en el orden de la pila (`L.stacks`). El detalle de la rama dice «Apilada sobre el PR #N» (`tip.stacked`, 40 idiomas) y la demo trae una pila (`feature/dark-mode` sobre `feature/login`).
- **Pruebas que fallan sin la capacidad:** `tools/layout.test.mjs` (4: sin pila, pila de tres contigua y en orden, ciclo de bases, base sin PR propio); sin `stackedPulls` fallan las 4.
- README: la función en la lista y Límites conocidos (solo orden y detalle, sin línea entre ramas). Mapa de alcance: fila Datos.
- QA: fila de XSS (el nombre de la rama entra por `i18n.html` escapado), cuota (0 consultas nuevas: usa los PRs ya cargados) y i18n (1 texto en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/61, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 244 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 62, expansión: ítem 33 (Vista de texto, segunda entrega, Público)

### 2026-10-14 · Iteración 62 · Expansión · Público

- **Capacidad nueva: vista de texto, segunda entrega** (ítem 33 de la hoja de ruta). Con la vista de texto abierta, cada actualización en vivo redibuja el árbol sin perder el foco ni las ramas abiertas y una región `role="status"` (`aria-live="polite"`) anuncia «Novedades: n ramas, m commits» solo de lo que no se había leído (`textview.news` lleva las ramas y los SHA ya vistos). Un campo «Filtrar ramas…» (↓ pasa al árbol) deja las ramas cuyo nombre contiene el texto y anuncia cuántas quedan, sin anunciar cada tecla. 2 textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`news solo cuenta…`, `filter deja…`) y el paso del smoke «vista de texto: filtra por rama y avisa en la región viva de lo nuevo sin repetir» (con un commit en vivo de la demo).
- README: función en la lista, Límites conocidos (cómo se probó: solo ARIA y teclado con Playwright, ningún lector real) y Seguridad. Mapa de alcance: fila Público.
- QA: filas de XSS (todo con `textContent`), foco (se conserva al actualizar), teclado (filtro y ↓) y 40 idiomas por `check-i18n`; sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/62, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 246 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 63, mantenimiento · Accesibilidad: pendiente 4 (Objetivos chicos y estados confusos. `audit:objetivo-chico` (24 hallazgos conoc…)

### 2026-10-14 · Iteración 63 · Mantenimiento · Accesibilidad

- **Auditoría de Accesibilidad: objetivos táctiles del filtro de ramas y de la casilla de los logros** (pendiente 4, parte). `#branch-filter` y la etiqueta de `#game-enable` (`.tr-toggle`) tenían 19 px de alto; ahora `min-height: 24px` (WCAG 2.5.8). Salen 8 hallazgos `objetivo-chico` de la base (24 → 16); el pendiente 4 sigue con las etiquetas de rama, la barra del Replay y la brújula.
- **Reproducción:** `node tools/audit.mjs --puerta` → `objetivo-chico|…|#branch-filter` y `|dialogos|#game-enable` a 19 px antes del arreglo; después, «8 ya no aparecen».
- **Pruebas que fallan sin el arreglo:** la puerta de la auditoría (`tools/audit.mjs --puerta`, dentro de `npm run check`): la base ya no tolera esos 8 hallazgos.
- README: sin cambios (no cambia ninguna función).
- QA: fila de accesibilidad/objetivos táctiles por la auditoría en escritorio, 320 px y diálogos; sin mirar a mano: lector de pantalla real; auditoría: 0 hallazgos nuevos, 16 conocidos.
- Reclamo: loop/63, sin colisión
- Nota: el smoke falló 4 pasos en una corrida sobre `master` (Replay en video, vista de texto, búsqueda de commits, filtro por ruta: esperas agotadas) y pasó en las siguientes; es la intermitencia de la Deuda ya anotada, sin cambio de código aquí.
- Validado: 246 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 64, expansión: ítem 34 (Filtrar el grafo por autor, Análisis)

### 2026-10-15 · Iteración 64 · Expansión · Análisis

- **Capacidad nueva: filtrar el grafo por autor** (ítem 34 de la hoja de ruta). En el cuadro de búsqueda, «Mostrar solo las ramas de…» deja en el grafo (2D y 3D) y en la vista de texto la rama por defecto y las ramas con algún commit de esa persona que la rama por defecto no tiene (`GB.search.byAuthor`, sobre los datos ya cargados, sin consultas); los PR de las ramas quitadas se van con ellas. Se guarda por repo, avisa cuántas ramas quedan (región viva) y subraya la lupa mientras hay filtro.
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (2: `byAuthor`) y una prueba por fuente en `tools/gitlab.test.mjs`, `tools/bitbucket.test.mjs` y `tools/codeberg.test.mjs`; el paso del smoke «filtro por autor: el grafo y el árbol de texto muestran solo sus ramas, lo dice y se quita».
- README: función en la lista (Búsqueda de commits), Límites conocidos y Seguridad. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (2 claves).
- QA: filas de XSS (nombres de autor con `textContent`), cuota (0 consultas nuevas), teclado (selector con etiqueta) y 40 idiomas por `check-i18n`; GitHub y local usan los mismos datos normalizados (sin prueba propia); sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/64, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 251 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 65, expansión: ítem 35 (GitLab propio, segunda entrega, Fuentes)

### 2026-10-15 · Iteración 65 · Expansión · Fuentes

- **Capacidad nueva: GitLab propio, segunda entrega** (ítem 35 de la hoja de ruta). `U.parseRepo` reconoce las URL de la instancia de `?gitlab=`/`--gitlab-url=` (https y `git@host:`, con ruta y `/-/tree/…`), solo ese host y por prefijo exacto; las claves guardadas de un GitLab propio llevan su host (`gitlab@host:`), aparte de las de gitlab.com; y en escritorio los avatares de ese host salen (`avatars: true` y su `img-src`).
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («parseRepo reconoce las URL de un GitLab propio…» y «…avatares solo si se piden…»); e2e de escritorio «--gitlab-url suma solo ese host al CSP…» (ahora también `img-src`).
- README: la función en la lista, Límites conocidos y Seguridad (CSP). Mapa de alcance: fila Fuentes. Hoja de ruta repuesta a 15 con ideas de partes de ítems ya hechos y de la investigación del 2026-10-13 (ítems 45–50).
- QA: filas de XSS (el texto de la URL solo entra a parseRepo, que lo valida), CSP (el escritorio suma solo el host elegido) y tokens (sin cambios); sin mirar a mano: tema, 320 px, 3D, Replay (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/65, sin colisión
- Nota: `git push origin --delete loop/52` falló con «unexpected disconnect» del proxy; las `loop/52`–`loop/64` fusionadas siguen en origin (ya en Para Benjamin).
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 253 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 66, expansión: ítem 38 (Vocabulario DORA en la salud, Análisis)

### 2026-10-15 · Iteración 66 · Expansión · Análisis

- **Capacidad nueva: vocabulario DORA en la salud** (ítem 38 de la hoja de ruta). El panel de salud suma «Entrega (DORA)»: despliegues en 30 días (cada release cuenta como uno), mediana entre los últimos 10 releases y tiempo de entrega (mediana de abierto a fusionado), con lo ya cargado y sin consultas (`GB.health.compute(...).dora`). El tiempo va de la apertura del PR a su fusión, no desde su primer commit (pediría una consulta por PR); dicho en Límites conocidos.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («DORA: despliegues en 30 días…») y el paso del smoke de salud (dos líneas de entrega en la demo).
- README: función en la lista (Salud del repo), mapa de archivos y Límites conocidos. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (3 claves).
- QA: filas de XSS (solo cifras y duraciones formateadas, sin texto de afuera), cuota (0 consultas nuevas) y 40 idiomas por `check-i18n`; sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/66, sin colisión
- Nota: `git push origin --delete loop/53` falló con «the remote end hung up unexpectedly» (proxy); las `loop/28`–`loop/65` fusionadas siguen en origin (ya en Para Benjamin).
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 254 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 67, mantenimiento · Deuda: pendiente 1 (Smoke: una vez (iteración 27, corrida completa con `--langs`) el cuadro de la m…)

### 2026-10-15 · Iteración 67 · Mantenimiento · Deuda

- **Arreglo: el grabador del Replay arranca con el primer cuadro dibujado** (pendiente 1). `snapshot.record` llamaba a `rec.start` antes de que `capture` armara el primer cuadro, así que el canvas de salida estaba liso del color del fondo y, con la máquina cargada, el video podía salir con un tramo vacío (`1, 1, 1 colores al 25, 50 y 75 %`). Ahora `rec.start` corre al dibujarse el primer cuadro, y la duración se mide desde ese momento.
- **Reproducción:** `node tools/smoke.mjs` (con `js/snapshot.js` sin el arreglo) → `✗ graba el Replay en video, de principio a fin: el grabador arrancó con el canvas vacío: 1 colores al empezar`.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «graba el Replay en video, de principio a fin» ahora mide los colores del canvas en el instante en que arranca `MediaRecorder` (pide al menos 100).
- README: sin cambios (no cambia lo que hace la función).
- QA: fila de Replay en video (los dos pasos de grabación del smoke); sin mirar a mano: 320 px, tema claro; auditoría: 0 hallazgos nuevos.
- Nota: una corrida del smoke falló una vez en «lo que llega mientras se ve la 2D no se acumula para la 3D» (`waitForFunction` de 30 s) y no se repitió; sin relación con el cambio.
- Reclamo: loop/67, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 254 pruebas (`node --test`), smoke (84 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 68, expansión: ítem 36 (Gitea y Forgejo propios, Fuentes)

### 2026-10-15 · Iteración 68 · Expansión · Fuentes

- **Capacidad nueva: Forgejo y Gitea propios** (ítem 36 de la hoja de ruta). `?forge=https://host` (o `--forge-url=` en escritorio) deja seguir repos de un servidor propio con la fuente de Codeberg (`CodebergSource({ webUrl })`, `endpoints`): API v1 en `host/api/v1`, enlaces al host, repos como `forgejo:dueño/repo` o por su URL (https o `git@host:`, por prefijo exacto), claves `forgejo@host:…` aparte de las de codeberg.org, etiqueta Forgejo. Sin token, solo ese host; el `html_url` que dé el servidor solo se acepta si cuelga de él. En escritorio el CSP suma solo ese host a `connect-src` y `img-src` (con sus avatares); en la web, sin avatares. Avisos propios sin nombrar a Codeberg (7 claves nuevas).
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` (la API simulada con otra URL base: `endpoints`, `parseRepo`, carga solo contra ese host, avatares, html_url ajeno, textos de error) y la e2e de escritorio «--forge-url suma solo ese host al CSP…».
- README: función en la lista, comando de escritorio, Límites conocidos (Codeberg y propios), CSP y token. Mapa de alcance: fila Fuentes. Textos en los 40 idiomas (7 claves).
- QA: filas de XSS (nada de afuera entra sin escapar; el host solo pasa por `new URL`), token (ninguna consulta lleva `Authorization`), CSP (`pwa.test` sigue cerrado; la e2e comprueba el host elegido y que sin https se ignora) y 40 idiomas por `check-i18n`; sin mirar a mano contra un servidor real, 320 px ni tema claro (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Nota: `git push origin --delete loop/55` (y siguientes) lo negó el clasificador de permisos de la sesión; las `loop/28`–`loop/67` fusionadas siguen en origin (ya en Para Benjamin). El clon de la sesión venía superficial (`--depth`) y R3 de `--check` falló hasta `git fetch --unshallow`.
- Reclamo: loop/68, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 261 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 69, expansión: ítem 39 (PRs por estado, Análisis)

### 2026-10-15 · Iteración 69 · Expansión · Análisis

- **Capacidad nueva: PRs por estado en la salud** (ítem 39 de la hoja de ruta). El panel de salud agrupa los PRs abiertos en borrador, con los checks en rojo, aprobados y esperando revisión (precedencia en ese orden; el rojo sale de `pull.ci` o del estado de su rama), cada fila con su salto al grafo. GitHub con token trae `reviewDecision` en la misma consulta GraphQL (sin consultas nuevas); la demo muestra los tres primeros estados. 5 claves nuevas en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («PRs por estado…») y un paso nuevo en el smoke del panel de salud de la demo.
- README: función en la lista, mapa de archivos y Límites conocidos (sin token o en otras fuentes, nada queda «aprobado»). Mapa de alcance: fila Análisis.
- QA: filas de XSS (los títulos entran por `U.esc`), token (la consulta es la misma, solo suma un campo) y 40 idiomas por `check-i18n`; sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas de `loop.test.mjs` fallaban hasta `git fetch --unshallow`.
- Reclamo: loop/69, sin colisión
- Nota: el paso «cambios de un commit» del smoke falló en 2 de 5 corridas de `npm run check` con el cambio (y otros pasos en cascada cuando mi primer paso nuevo lanzaba con el diálogo abierto, ya corregido); el smoke suelto pasó 6 de 6 y la corrida final de la puerta salió en verde. Intermitencia a vigilar.
- Validado: 262 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 70, expansión: ítem 37 (Tokens para Codeberg y Bitbucket, Fuentes)

### 2026-10-15 · Iteración 70 · Expansión · Fuentes

- **Capacidad nueva: tokens para Codeberg y Bitbucket** (ítem 37 de la hoja de ruta). Dos campos nuevos en Ajustes (token de Codeberg con `Authorization: token …`, token de Bitbucket con `Authorization: Bearer …`), guardados como los demás (localStorage en la web; en escritorio cifrados con el llavero, servicios `codeberg` y `bitbucket` de `electron/token.js`). Cada token va en cada consulta (también la del diff) y solo a su host; un Forgejo/Gitea propio no recibe el de Codeberg. Con él se abren repos privados; guardar un token reconecta solo los repos de esa fuente.
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` y `tools/bitbucket.test.mjs` (privado sin token → 404; con token, todas las consultas llevan la cabecera; el servidor propio no la recibe) y un paso nuevo del smoke por fuente (Ajustes → reconexión con la cabecera, y localStorage).
- README: lista de funciones, Límites conocidos (Codeberg/Bitbucket; sin aviso propio de «token rechazado»; propio sin token) y Seguridad (cada token a su servicio). Mapa de alcance: fila Fuentes. Textos en los 40 idiomas (10 claves, derivadas de las de GitLab; la ayuda de es y en, escrita aparte).
- QA: filas de token (el smoke comprueba cabecera y que el de GitHub no se mezcla), XSS (sin texto de afuera nuevo en el DOM) y 40 idiomas por `check-i18n`; sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`.
- Reclamo: loop/70, sin colisión
- Validado: 264 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 71, mantenimiento · Errores: pendiente 4 (Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora so…)

### 2026-10-15 · Iteración 71 · Mantenimiento · Errores

- **Arreglo: Replay, `wasPlaying` y la barra espaciadora** (pendiente 4). `wasPlaying` se limpia al soltar la barra de posición y al salir del Replay: un cambio con las flechas del teclado ya no reanuda un Replay que el usuario había pausado. Y el espacio del panel del grafo no pausa el Replay si una etiqueta de rama ya lo gestionó (`ev.defaultPrevented`, `js/app.js`). Búsqueda del mismo patrón: los demás `keydown` de `app.js` ya miran `defaultPrevented` o excluyen controles.
- **Reproducción:** `node --test tools/replay.test.mjs` → `not ok 4 - un cambio de la barra con el teclado no reanuda un Replay en pausa` (sin el arreglo de `replay.js`).
- **Pruebas que fallan sin el arreglo:** `tools/replay.test.mjs` («un cambio de la barra con el teclado…»). El espacio sobre una etiqueta queda sin prueba propia (cambio de una condición).
- README: sin cambios (arreglo interno).
- QA: filas de Replay y de teclado; auditoría: 0 hallazgos nuevos (la puerta). Sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`. El paso «cambios de un commit» del smoke falló en la primera corrida de `npm run check` y pasó al repetirla (anotado en el pendiente 1 `[Deuda]`). `git push origin --delete loop/58` falló por el proxy.
- Reclamo: loop/71, sin colisión
- Validado: 265 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 72, expansión: ítem 40 (Resaltar el tramo de cada rama comparada, Análisis)

### 2026-10-15 · Iteración 72 · Expansión · Análisis

- **Capacidad nueva: resaltar el tramo de cada rama comparada** (ítem 40 de la hoja de ruta). Al pulsar «Comparar» en el panel de salud, el grafo (2D y 3D) deja a la luz los commits que lleva cada rama por delante (anillo continuo la A, punteado la B) y el punto de separación más grande, y atenúa el resto; «Quitar el resaltado del grafo» lo apaga y cambiar de repo también. `health.compare` devuelve ahora los SHA de cada tramo; `Graph.setCompareMarks` y `Graph3D.setCompareMarks` los pintan.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («comparar dos ramas…», los `shas` de cada tramo) y un paso del smoke en la demo (nodos `cmp-a`/`cmp-b`, un único `cmp-base`, el resto atenuado, y «Quitar el resaltado» los deja en cero).
- README: la comparación y sus Límites conocidos (solo los commits ya dibujados).
- QA: comparar ramas en la demo (2D) por el smoke y a mano con Playwright; el 3D sin mirar a mano (sin GPU en la sesión); auditoría: 0 hallazgos nuevos.
- Nota: «Quitar el resaltado» no cierra el panel de salud (lo cerraba como las demás filas). El paso «cambios de un commit» del smoke falló una vez sin relación con el cambio y pasó al repetir `npm run check` (pendiente `[Deuda]` ya abierto).
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`. Chromium del smoke: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Reclamo: loop/72, sin colisión
- Validado: 265 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 73, expansión: ítem 41 (Una organización entera, cuarta entrega, Escala)

### 2026-10-15 · Iteración 73 · Expansión · Escala

- **Capacidad nueva: un grupo de GitLab entero** (ítem 41 de la hoja de ruta, cuarta entrega). `group:ruta` (con subgrupos) o la URL `gitlab.com/groups/ruta` (o la del GitLab propio) sigue los proyectos de actividad más reciente del grupo, en una consulta (`/groups/:id/projects`, `include_subgroups`), sin forks ni archivados, cada uno en su pestaña; también `?repo=group:ruta`. No queda seguido (sin renovación ni eventos del grupo). `U.parseGroup`, `GitLabSource.groupProjects` y `connectGroup`. La constelación pasa al ítem 52.
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («un grupo de GitLab entero…», «parseGroup…») y un paso del smoke (`group:g` con un fork y un archivado fuera, una sola consulta, se guarda `gitlab:g/sub/p`).
- README: la función en la lista, su uso y Límites conocidos (sin renovación ni eventos; constelación sin hacer).
- QA: conexión por grupo en el smoke con GitLab simulado y token solo a GitLab (la prueba del fake lo exige); auditoría: 0 hallazgos nuevos. Sin textos nuevos (reusa los avisos de organización).
- Nota: el clon de la sesión venía superficial; hizo falta `git fetch --unshallow`. Chromium: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` con `xvfb-run`.
- Reclamo: loop/73, sin colisión
- Validado: 267 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 74, expansión: ítem 42 (Replay por tramo, segunda entrega, Salidas)

### 2026-10-15 · Iteración 74 · Expansión · Salidas

- **Capacidad nueva: el Replay por tramo, desde la URL** (ítem 42 de la hoja de ruta, segunda entrega). `?replay=2026-09-01..2026-09-14&title=Sprint%2012&footer=…` abre el repo y arranca el Replay con ese tramo y esos rótulos en cuanto llega la primera historia (una sola vez); cualquiera de las dos fechas puede faltar, `replay=1` es toda la historia, una fecha mal escrita se ignora y un tramo sin commits avisa. El formulario de la barra queda con los valores del enlace. La lectura es `Replay.paramsOf` (pura); título y pie se cortan a 80 y 120 y entran al DOM como texto, como antes. Sin consultas nuevas a la API.
- **Pruebas que fallan sin la capacidad:** `tools/replay.test.mjs` («la URL pide el Replay…», «el tramo de la URL admite un solo extremo…») y un paso del smoke con el enlace (el Replay arranca solo, con título, pie y tramo en el formulario).
- README: el Replay (el enlace y su ejemplo), la lista de pruebas y Límites conocidos (formato `AAAA-MM-DD`).
- QA: el enlace en la demo por el smoke; auditoría: 0 hallazgos nuevos. Sin textos nuevos.
- Nota: el clon de la sesión venía superficial; hizo falta `git fetch --unshallow`. El borrado de `loop/61` falló por el proxy (desconexión); las ramas `loop/*` fusionadas siguen en Para Benjamin.
- Reclamo: loop/74, sin colisión
- Validado: 269 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 75, mantenimiento · QA: pendiente 15 (La auditoría completa con `--langs` marca 3 `objetivo-chico` en `celular-320` q…)

### 2026-10-15 · Iteración 75 · Mantenimiento · QA

- **Auditoría de QA: la auditoría completa con `--langs`, de la que se arregla lo peor** (pendiente 15). `#branch-filter` ya medía 24 px desde antes; lo que quedaba en `celular-320` eran las etiquetas de rama 3D (22 px). Ahora miden 24 px: salen 12 hallazgos de la base (en los 40 idiomas, `escritorio-3d` y `galaxias-vuelo`). Además, `node tools/audit.mjs --json <ruta>` fallaba con `ENOENT` si la carpeta no existía (en una sesión nueva no hay `test-results/`): `guardarInforme` la crea.
- **Reproducción:** `node tools/audit.mjs --langs --json test-results/auditoria.json` → `ERROR: ENOENT: no such file or directory, open 'test-results/auditoria.json'` (sin la carpeta, tras ~145 s de auditoría).
- **Hallazgos:** 3 nuevos (pendientes 17, 18, 19), 0 a la base de la auditoría (la base baja de 16 a 4 hallazgos conocidos).
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` («--json crea la carpeta del informe…»); las etiquetas 3D las vigila la auditoría de la puerta contra la base de 4.
- README: sin cambios (no hay función nueva).
- QA: auditoría completa `--langs` (solo `objetivo-chico`); etiquetas 3D a 24 px por la auditoría en los 40 idiomas y en vuelo; sin mirar a mano 1.000 ramas a 320 px (pendiente 19); auditoría: 0 hallazgos nuevos tras el arreglo.
- Reclamo: loop/75, sin colisión
- Validado: 270 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde (la primera corrida falló dos pasos del smoke sin relación con el cambio —pendiente 1—; la repetición salió 0).
- Nota: el clon venía superficial (`git fetch --unshallow`); `npm run check` borra `test-results/` al correr las e2e, así que su salida no puede ir ahí.
- **Siguiente:** iteración 76, expansión: ítem 43 (Ejercicios compartidos, segunda entrega, Público)

### 2026-10-15 · Iteración 76 · Expansión · Público

- **Capacidad nueva: ejercicios compartidos con pistas y condiciones más finas** (ítem 43 de la hoja de ruta). Un ejercicio propio admite hasta 3 pistas (160 caracteres cada una, en la URL como `h`): con pistas aparece el botón «Pista», que las muestra de una en una (con `textContent`). Dos condiciones nuevas en la lista cerrada: `tip:rama~texto` (el mensaje del último commit de la rama contiene el texto, sin distinguir mayúsculas) y `unmerged:a>b` (la rama tiene commits que la otra no). Los enlaces viejos siguen abriendo (las pistas son opcionales). Textos nuevos en los 40 idiomas (`practice.hint`, `practice.hintOf`, `practice.make.hints`, `practice.make.err.hints`) y la ayuda del formulario al día.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (pistas por la URL con sus límites, y `tip:`/`unmerged:` con rama inexistente y texto vacío); smoke, paso «un ejercicio propio con pistas: el botón las muestra una a una y la condición de mensaje lo resuelve».
- README: la función, Límites conocidos, Seguridad y la lista de pruebas.
- QA: filas de XSS (una `<b>` en una pista no se interpreta, el smoke lo mira), CSP sin cambios, teclado (el botón de pista es un `<button>`), i18n (4 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/76, sin colisión
- Validado: 272 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/63` falló por desconexión del proxy; las ramas `loop/*` fusionadas siguen en Para Benjamin. La hoja de ruta se repuso con los ítems 53 a 58 (investigación del 2026-10-13, vigente).
- **Siguiente:** iteración 77, expansión: ítem 44 (Filtrar por ruta, segunda entrega, Análisis)

### 2026-10-15 · Iteración 77 · Expansión · Análisis

- **Capacidad nueva: filtrar por ruta, segunda entrega** (ítem 44 de la hoja de ruta). El grafo 3D también atenúa los commits que no tocaron la ruta (`Graph3D.setPathFilter`: esferas al 60 %, color hacia el fondo y halo casi apagado; sin filtro, nada cambia) y `?path=src/` abre el repo ya filtrado: `GB.search.pathParam` lee la ruta (recortada, sin barra inicial ni caracteres de control, hasta 200), se aplica una vez con la primera historia de la pestaña a la vista, y la URL guarda la ruta mientras haya filtro y la suelta al quitarlo o cambiar de pestaña. Sin textos nuevos (i18n sin cambios).
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` («pathParam lee ?path= de la URL…») y dos pasos del smoke: «filtro por ruta: el grafo 3D también recibe la ruta y la suelta al quitarla» y «abre ya filtrado, atenúa el grafo, mantiene la ruta en la URL y al quitarlo la suelta».
- README: la función (3D y URL), Límites conocidos y Seguridad.
- QA: XSS (la ruta de la URL entra al campo con `value`, nunca como HTML), CSP sin cambios, 2D y 3D (el smoke lo mira); sin mirar a mano: 320 px, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/77, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla.
- Validado: 273 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 78, expansión: ítem 46 (Capa para streaming, segunda entrega, Plataformas)

### 2026-10-15 · Iteración 78 · Expansión · Plataformas

- **Capacidad nueva: capa para streaming, segunda entrega** (ítem 46 de la hoja de ruta). `?embed=1` acepta `&bg=00ff00` (un color hexadecimal de 3 o 6 cifras, para un croma en OBS; `&bg=transparent` sigue igual) y `&hide=notices,combo` (quita los avisos emergentes y el contador de combos de la capa). `GB.embedOptions` (en `js/i18n.js`) lee la URL y solo deja pasar `transparent`, un hex válido y los dos nombres conocidos; el color llega al CSS por una variable de `<html>`, sin tocar la CSP. Sin esos parámetros, la capa se ve como siempre. Sin textos nuevos (i18n sin cambios).
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` (4 pruebas de la lectura de la URL) y dos pasos del smoke: «&bg=00ff00 pinta el fondo de verde y &hide=notices,combo esconde los avisos» y «sin &hide= los avisos siguen ahí».
- README: la función del widget y Seguridad (nada de la URL llega al CSS tal cual).
- QA: XSS/inyección en CSS (`bg=red`, `bg=url(x)` y `bg=12345` se descartan, la prueba lo mira), CSP sin cambios; sin mirar a mano: 320 px, Replay, 3D; auditoría: no toca la interfaz visible fuera de `?embed`.
- Reclamo: loop/78, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/65` falló por desconexión del proxy.
- Validado: 277 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 79, mantenimiento · Rendimiento: pendiente 8 (Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`pla…)

### 2026-10-15 · Iteración 79 · Mantenimiento · Rendimiento

- **Arreglo: trabajo por cuadro sin lecturas que fuerzan maquetación** (pendiente 8). `placeTip` (2D y 3D) leía `offsetWidth`/`offsetHeight` del tooltip en cada cuadro mientras seguía a su commit; ahora el tamaño se mide una vez por contenido y ancho (`tipBox`, se invalida al mostrar otro tooltip y al cambiar `W`). Replay creaba un `Intl.DateTimeFormat` nuevo por cuadro en `renderClock`; ahora usa `i18n.fmtDayLong`, que reutiliza el formateador en caché.
- **Reproducción:** `node --test tools/rendimiento.test.mjs` → sin el arreglo, 2 pruebas fallan («placeTip usa el tamaño en caché», «Replay reutiliza el formateador…»).
- **Pruebas que fallan sin el arreglo:** `tools/rendimiento.test.mjs` (2 pruebas).
- Medidas (`node tools/audit.mjs --repetir 3 --comparar`): consultas 10 → 10, nodosDOM 1313 → 1313, heapMB 13 → 13, tareasLargasMs 1186 → 1189, fps2d 54,2 → 52 / 56,4 en dos corridas (ruido). fps3d 9,7 → 8,3 / 8,6 (−11 % a −14 %): la medida no muestra tooltip ni Replay, así que el cambio no corre en ese camino; es ruido de Chromium sin GPU, pero queda anotado por pasar del 10 %.
- README: sin cambios (no cambia lo que hace la app).
- QA: tooltip 2D y 3D y reloj del Replay los cubre el smoke; auditoría: 0 hallazgos nuevos, 4 conocidos.
- Reclamo: loop/79, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/66` falló por desconexión del proxy.
- Validado: 279 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 80, expansión: ítem 45 (Filtro por autor en la URL, Análisis)

### 2026-10-15 · Iteración 80 · Expansión · Análisis

- **Capacidad nueva: filtro por autor en la URL** (ítem 45 de la hoja de ruta). `?author=ana` abre el repo a la vista ya filtrado por esa persona (manda sobre lo recordado, solo al abrir; no en `?embed=1`) y la dirección sigue al selector «Mostrar solo las ramas de…» (también al cambiar de repo y al quitar el filtro). `GB.search.authorParam` lee el parámetro como texto (sin caracteres de control, hasta 100).
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (`authorParam`) y el paso del smoke «Filtro por autor desde la URL (?author=)».
- README: lista de funciones (búsqueda), Límites conocidos y Seguridad.
- QA: filas de filtros y de URL: el smoke abre la demo con `?author=`, comprueba que acota el grafo, marca la lupa, mantiene y suelta la URL; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/80, sin colisión
- Nota: el borrado de `loop/67` falló por desconexión del proxy (las `loop/*` fusionadas siguen en Para Benjamin, punto 7).
- Validado: 280 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 81, expansión: ítem 47 (Resumen de la semana de una organización, Salidas)

### 2026-10-15 · Iteración 81 · Expansión · Salidas

- **Capacidad nueva: resumen de la semana de una organización** (ítem 47 de la hoja de ruta). Con 2 o más repos abiertos de una organización seguida (`org:nombre`), el panel de salud suma una ficha con los totales de la semana (commits, PRs fusionados, releases) y una sección por repo con actividad (hasta 20, por commits), como Markdown para copiar o guardar. Sin consultas nuevas: usa lo ya cargado de cada pestaña (`GB.digest.computeOrg` y `toMarkdownOrg`, en `js/digest.js`). Un texto nuevo en los 40 idiomas (`digest.org`).
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (3 pruebas de la organización) y el paso del smoke «el resumen de la semana de la organización junta sus repos abiertos».
- README: la lista de funciones (salud), Límites conocidos y Seguridad.
- QA: filas del panel de salud y de Markdown/descarga: el smoke abre el panel con `org:acme` y baja el `.md`; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/81, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). Un paso ajeno del smoke falló una vez y pasó al repetir (anotado en el pendiente 1 de Media). Los borrados de `loop/68` a `loop/80` siguen en Para Benjamin, punto 7.
- Validado: 283 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 82, expansión: ítem 48 (Tasa de fallos de CI en la salud, Análisis)

### 2026-10-16 · Iteración 82 · Expansión · Análisis

- **Capacidad nueva: tasa de fallos de CI en la salud** (ítem 48 de la hoja de ruta). El panel de salud suma «Fallos de CI»: de los PRs abiertos con checks ya resueltos, cuántos están en rojo (con el porcentaje) y cuántas veces la rama por defecto pasó a rojo en los últimos 30 días según la actividad ya cargada. Sin consultas nuevas. `GB.health.compute` devuelve `ci`; 3 textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (tasa con checks pendientes fuera y fallos fuera de los 30 días) y el paso del smoke de la salud (`#hl-ci`).
- README: lista de funciones (salud), mapa de archivos y Límites conocidos.
- QA: fila del panel de salud: el smoke abre la demo y lee la sección; auditoría: la puerta la corre sobre la página.
- Reclamo: loop/82, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). Un paso ajeno del smoke (modo TV) falló una vez y pasó en dos corridas aparte (anotado en el pendiente 1 de Media). El borrado de `loop/69` falló por desconexión del proxy; las `loop/*` fusionadas siguen en Para Benjamin, punto 7.
- Validado: 284 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 83, mantenimiento · Deuda: pendiente 1 (Smoke: en `npm run check` bajo `xvfb-run` (iteración 36, el equipo cargado por …)

### 2026-10-16 · Iteración 83 · Mantenimiento · Deuda

- **Arreglo: smoke intermitente bajo carga** (pendiente 1 de Media, parcial). Los topes de espera (`timeout:`) del smoke pasan por `T()` (×3: las esperas a un estado vuelven al cumplirse, así que no cuestan nada con el equipo libre) y los pasos «un repo que no existe» de Codeberg y Bitbucket dejan de seguir `ana/nada`, como ya hacía el de GitLab: antes, al guardar el token se reconectaba y el 404 caía en el paso siguiente. El error de consola del smoke ahora lleva la URL que falló.
- **Reproducción:** `node tools/smoke.mjs` ×5 con 4 procesos al 100 % de CPU → antes: «vista 2D: page.waitForSelector: Timeout 10000ms exceeded.» y «el token de Codeberg de Ajustes va en cada consulta, solo a Codeberg: consola: Failed to load resource: … 404 (https://codeberg.org/api/v1/repos/ana/nada)» (igual en Bitbucket).
- **Pruebas que fallan sin el arreglo:** el propio smoke bajo carga: con topes ×3, 3 de 5 corridas en verde y las otras 2 solo con el 404 de `ana/nada` (arreglado después); una corrida posterior con carga extrema aún falla en cascada por `page.click` de 30 s (queda en el pendiente 1).
- README: no aplica (herramienta interna).
- QA: no toca la página; auditoría: no toca la página.
- Reclamo: loop/83, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); el Chromium de la sesión es otra versión (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
- Validado: 284 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- **Siguiente:** iteración 84, expansión: ítem 49 (Extensión de VS Code, segunda entrega, Plataformas)
