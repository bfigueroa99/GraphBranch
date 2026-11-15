# Hoja de ruta: ítems hechos

Los ítems de la hoja de ruta de `IMPROVEMENTS.md` que ya se hicieron, en orden de número: `node tools/loop.mjs
--rotar` los trae aquí (allá quedan los pendientes, que son lo que lee cada iteración). Es historia: no se
edita, y un ítem nuevo va siempre a `IMPROVEMENTS.md`, con el número que dice `node tools/loop.mjs --siguiente`.
`--siguiente`, `--check`, `--reclamar` y `--salud` leen las dos hojas juntas (la numeración, los
«hecho en #K» y los «[parte del ítem K]»).

## Hoja de ruta

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
    en los 40 idiomas (recordar los repos entre sesiones: hecho en #126).
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
49. ~~**Extensión de VS Code, segunda entrega**~~ hecho en #113 · Plataformas · 2×2/2. [parte del ítem 24] La extensión sigue la sesión
    de GitHub de VS Code con el panel abierto: si la persona inicia o cierra sesión (`onDidChangeSessions`), la página se
    recarga con el token nuevo o sin él (se borra el guardado). Comprobar: `tools/vscode.test.mjs` con la sesión simulada.
50. ~~**Bitbucket propio**~~ hecho en #114 · Fuentes · 1×2/3. [parte del ítem 22] Un Bitbucket Data Center o Server (`--bitbucket-url=`),
    con la misma regla de CSP que GitLab propio. Comprobar: `tools/bitbucket.test.mjs` con otra URL base.
    (Hecho en la iteración 85 como `js/sources/bitbucket-server.js`, API REST 1.0, y su prueba `tools/bitbucket-server.test.mjs`: la de Data Center no es la API 2.0 de Cloud, así que es otra fuente.)
51. ~~**Tiempo de entrega desde el primer commit**~~ hecho en #115 · Análisis · 1×2/2. [parte del ítem 38] El tiempo de entrega de la
    salud cuenta desde el primer commit del PR (una consulta de `/pulls/:n/commits` por PR fusionado reciente, solo al
    abrir el panel) y no desde su apertura. Comprobar: `tools/github.test.mjs` con la API simulada y
    `tools/health.test.mjs`.
    (Hecho en la iteración 86: `syncFirstCommits` en `js/sources/github.js` y `leadSource` en `js/health.js`.)
52. ~~**Constelación de repos**~~ hecho en #117 · Escala. [parte del ítem 41] Cada repo seguido es una galaxia en un diálogo (`js/constellation.js`): tamaño por commits cargados, color por nombre, novedades sin ver; Tab y Intro abren su pestaña.
53. ~~**Frecuencia de despliegue en la salud**~~ hecho en #118 · Análisis · 2×2/2. [inv. 2026-10-13] La salud cuenta los despliegues por semana
    (los releases de las últimas 8; los tags y despliegues de GitHub no traen fecha en lo ya cargado). Comprobado con `tools/health.test.mjs`.
54. ~~**Resumen de la semana como imagen**~~ hecho en #119 · Salidas · 2×2/2. [inv. 2026-10-13] El resumen de la semana también sale como imagen
    PNG para compartir, además del Markdown. Comprobar: prueba del lienzo y un paso del smoke que baja el archivo.
55. ~~**Práctica: cherry-pick y tag**~~ hecho en #121 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `cherry-pick <sha>` y
    `tag <nombre>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
56. ~~**Búsqueda en la URL**~~ hecho en #122 · Análisis · 1×2/1. [parte del ítem 19] `?q=texto` abre el repo con la búsqueda ya escrita, para
    compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
57. ~~**Avisos a Microsoft Teams**~~ hecho en #123 · Salidas · 2×2/2. [parte del ítem 15] El mismo aviso de actividad que ya va a Slack y Discord,
    con el formato de Teams. Comprobar: `tools/webhooks.test.mjs` con el cuerpo esperado.
58. ~~**Ejercicios compartidos, tercera entrega**~~ hecho en #125 · Público · 1×2/1. [parte del ítem 28] Un enlace de ejercicio con la solución
    propuesta (`?practice=<código>&solution=1`) que la muestra paso a paso en la terminal. Comprobar: prueba del codificado y
    un paso del smoke.
59. ~~**Extensión de VS Code: recordar repos**~~ hecho en #126 · Plataformas · 1×2/2. [parte del ítem 24] Los repos seguidos y el tema sobreviven
    entre sesiones del panel (el puerto cambia cada vez, así que se guardan en el estado de la extensión y se entregan con
    el token). Comprobar: `tools/vscode.test.mjs` con el estado simulado.
60. ~~**Práctica: rebase y revert**~~ hecho en #128 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `rebase <rama>` y
    `revert <sha>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
61. ~~**Capa para streaming, tercera entrega**~~ hecho en #131 · Plataformas · 2×2/2. [parte del ítem 11] `?embed=1&rotate=30` alterna entre los
    repos seguidos cada tantos segundos, para una escena de OBS sin tocarla. Comprobar: prueba de la lectura de la URL y un paso
    del smoke con dos repos.
62. ~~**Lanzamientos en el resumen de la semana**~~ hecho en #132 · Salidas · 1×2/1. [parte del ítem 23] El resumen de la semana lista los tags y
    lanzamientos de la semana con lo ya cargado. Comprobar: `tools/digest.test.mjs` con tags fabricados.
63. ~~**Vista de texto: filtro por autor**~~ hecho en #133 · Público · 1×2/2. [parte del ítem 33]
64. ~~**Choques entre ramas en la URL**~~ hecho en #135 · Análisis · 1×2/1. [parte del ítem 14] `?conflicts=1` abre el repo con los choques ya
    marcados, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
65. ~~**Token para un Bitbucket propio**~~ hecho en #136 · Fuentes · 2×2/2. [parte del ítem 50] Un token de acceso personal (`Authorization: Bearer …`)
    para un Bitbucket Data Center propio, guardado aparte (llavero en escritorio), que va solo a ese host: la mayoría de los
    servidores no dejan leer sin iniciar sesión. Comprobar: `tools/bitbucket-server.test.mjs` con el token y sin él.
66. ~~**Salud del repo en la URL**~~ hecho en #139 · Análisis · 1×2/1. [parte del ítem 12] `?health=1` abre el repo con el panel de salud ya
    desplegado, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
67. ~~**Búsqueda por fecha**~~ hecho en #143 · Análisis · 1×2/2. [parte del ítem 19] La lupa entiende `desde:2026-09-01` y `hasta:2026-09-14`
    junto al texto, sobre lo ya cargado. Comprobar: `tools/search.test.mjs` con fechas fabricadas.
68. ~~**Práctica: stash y reset**~~ hecho en #142 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `stash`, `stash pop` y
    `reset --hard <sha>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
69. ~~**Resumen de la organización como imagen**~~ hecho en #144 · Salidas · 1×2/2. [parte del ítem 47] El resumen de la semana de una
    organización también se baja como imagen PNG, como el de un repo. Comprobar: `tools/digest.test.mjs` con la imagen simulada.
70. ~~**Los forks en el grafo, segunda entrega**~~ hecho en #147 · Datos · 1×2/2. [parte del ítem 30] Los forks se pueden ocultar o mostrar desde
    un interruptor del panel y la elección viaja en la URL. Comprobar: prueba de la lectura de la URL y un paso del smoke.
71. ~~**Vista de texto: filtro por ruta en la URL**~~ hecho en #148 · Público · 1×2/1. [parte del ítem 33] La vista de texto abre con `?path=` y
    `?q=` aplicados y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
72. ~~**Resumen de la semana: pull requests abiertos**~~ hecho en #150 · Salidas · 1×2/2. [parte del ítem 23] El resumen de la semana suma cuántos pull requests se abrieron en los últimos 7 días, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con PRs fabricados.
73. ~~**Vista de texto: tags**~~ hecho en #152 · Público · 1×2/2. [parte del ítem 33] La vista de texto dice qué commits llevan tag y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
74. ~~**Capa para streaming, cuarta entrega**~~ hecho en #153 · Plataformas · 1×2/1. [parte del ítem 11] `&theme=light|dark` fija el tema de la capa sin tocar el de la página. Comprobar: prueba de la lectura de la URL y un paso del smoke.
75. ~~**Los forks en el grafo, tercera entrega**~~ hecho en #154 · Datos · 1×2/2. [parte del ítem 30] Los forks se ordenan por actividad reciente en el panel. Comprobar: prueba del orden con forks fabricados.
76. ~~**Constelación ordenada por actividad**~~ hecho en #156 · Escala. [parte del ítem 26] Un selector de orden (pestañas, actividad o nombre) reordena las galaxias, también el recorrido con Tab, y lo anuncia en una región viva (`C.sortItems` en `js/constellation.js`).
77. ~~**Práctica: branch -d y merge --abort**~~ hecho en #157 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `branch -d` y `merge --abort`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
78. ~~**Vista de texto: abrirla desde la URL**~~ hecho en #160 · Público · 1×2/1. [parte del ítem 33] `?view=text` abre el repo con la vista de texto ya abierta, con su filtro por autor o por ruta si los trae, para compartir el enlace con quien usa lector de pantalla. Comprobar: prueba de la lectura de la URL y un paso del smoke.
79. ~~**Resumen de la semana: issues cerrados**~~ hecho en #158 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana suma cuántos issues se cerraron en los últimos 7 días, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con issues fabricados.
80. ~~**Vista de texto: releases**~~ hecho en #162 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] La vista de texto dice qué commits llevan release y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
81. ~~**Práctica: switch y restore**~~ hecho en #165 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `switch`, `switch -c` y `restore`. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
82. ~~**Capa para streaming, quinta entrega**~~ hecho en #161 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&title=` pone un rótulo propio sobre la capa, escapado. Comprobar: prueba de la lectura de la URL y un paso del smoke.
83. ~~**Salud del repo: tendencia de merges**~~ hecho en #164 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra los PRs fusionados por semana de las últimas 8, como ya hace con los despliegues. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
84. ~~**Constelación ordenada, en la URL**~~ hecho en #166 · Escala. [parte del ítem 26] `?order=activity` abre la constelación ya ordenada por actividad (`C.orderParam` en `js/constellation.js`).
85. ~~**Práctica: tag -d y cherry-pick --abort**~~ hecho en #168 · Público. [parte del ítem 31] `cherry-pick --no-commit` deja el pick a medias hasta un `commit` o `cherry-pick --continue`; `cherry-pick --abort` lo cancela; noveno ejercicio («tagabort»).
86. ~~**Vista de texto: forks activos**~~ hecho en #169 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] La vista de texto lista los forks activos ya cargados, el más reciente primero, y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
87. ~~**Salud del repo: tendencia de PRs abiertos**~~ hecho en #170 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra cuántos PRs se abrieron por semana en las últimas 8. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
88. ~~**Capa para streaming, sexta entrega**~~ hecho en #173 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&max=N` limita cuántas ramas muestra la capa, escapando y acotando el valor. Comprobar: `tools/embed.test.mjs` y un paso del smoke.
89. ~~**Los forks en el grafo, cuarta entrega**~~ hecho en #174 · Datos · 1×2/2. [inv. 2026-10-13] [parte del ítem 30] El panel de forks suma las estrellas de cada fork (ya vienen en `/forks`) y deja ordenar por ellas. Comprobar: `tools/health.test.mjs` con forks fabricados.
90. ~~**Práctica: revert --abort y rebase --abort**~~ hecho en #176 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `revert --abort` y `rebase --abort`, y vuelve al estado de antes del comando. Comprobar: prueba del simulador y un paso del smoke.
91. ~~**Resumen de la semana: autores nuevos**~~ hecho en #178 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana dice cuántas personas aportaron por primera vez en el repo, con los datos ya cargados. Comprobar: prueba del resumen y un paso del smoke.
92. ~~**Capa para streaming, séptima entrega**~~ hecho en #181 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&hide=` oculta partes de la capa (leyenda, rótulo o reloj) para quien arma su escena de OBS. Comprobar: prueba de `embedOptions` y un paso del smoke.
93. ~~**Constelación ordenada por nombre, en la URL**~~ hecho en #189 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] `?order=name` abre la constelación ordenada alfabéticamente, junto a `?order=activity`. Comprobar: prueba de la lectura de la URL y un paso del smoke.
94. ~~**Vista de texto: PRs abiertos por rama**~~ hecho en #191 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de cada rama dice cuántos PRs abiertos tiene, con los PRs ya cargados. Comprobar: prueba de la vista y un paso del smoke.
95. ~~**Salud del repo: tendencia de issues cerrados**~~ hecho en #192 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra los issues cerrados por semana de las últimas 8, con las actividades ya cargadas. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
96. ~~**Resumen de la semana: commits por día**~~ hecho en #193 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana suma los commits de cada uno de los 7 días, en una línea de siete cifras, para ver el ritmo. Comprobar: `tools/digest.test.mjs` con commits fabricados.
97. ~~**Vista de texto: ramas quietas**~~ hecho en #195 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama sin commits en 30 días lo dice («sin actividad»), con lo ya cargado. Comprobar: prueba de la vista y un paso del smoke.
98. ~~**Capa para streaming, octava entrega**~~ hecho en #203 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&spin=0` apaga la rotación lenta de la vista 3D de la capa, para una escena de OBS quieta (el tema ya lo fija `&theme=`, ítem 74). Comprobar: prueba de `embedOptions` y un paso del smoke.
99. ~~**Salud del repo: tendencia de ramas nuevas**~~ hecho en #228 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra cuántas ramas se crearon por semana en las últimas 8, con las actividades ya cargadas. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
100. ~~**Práctica: reset --mixed y reflog**~~ hecho en #204 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `reset --mixed` y `reflog`, para recuperar un commit tras un `reset --hard`. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
101. ~~**Constelación: filtrar por nombre en la URL**~~ hecho en #206 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] `?constellation=texto` deja en la constelación solo los repos cuyo nombre lo contiene. Comprobar: prueba de la lectura de la URL y un paso del smoke.
102. ~~**Resumen de la semana: ramas nuevas**~~ hecho en #237 · Salidas. [inv. 2026-10-13] [parte del ítem 23]
103. ~~**Vista de texto: ramas fusionadas**~~ hecho en #240 · Público. [inv. 2026-10-13] [parte del ítem 33]
104. ~~**Salud del repo: tendencia de commits**~~ hecho en #241 · Análisis. [inv. 2026-10-13] [parte del ítem 12]
105. ~~**Capa para streaming, novena entrega**~~ hecho en #207 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&lang=` ya fija el idioma; `&view=2d|3d` fija la vista de la capa sin tocar la de la página. Comprobar: prueba de `embedOptions` y un paso del smoke.
106. ~~**Práctica: commit --amend**~~ hecho en #208 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `commit --amend` (con `-m`), para corregir el último commit. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
107. ~~**Fuente Azure DevOps**~~ hecho en #200 · Fuentes · 2×3/3. [replica must 2026-10-28] El primer must que falta frente a GitKraken (su ayuda «Azure DevOps», <https://help.gitkraken.com/gitkraken-desktop/azure-devops/>; `replica/parity.md`): conectar `azure:org/proyecto/repo` y dibujar sus ramas y commits con la API REST de Azure DevOps, primero repos públicos y sin token; la CSP suma solo `https://dev.azure.com`. Si esa API no admite CORS desde la página, la primera entrega es de la app de escritorio, dicho en el README. Comprobar: `tools/azure.test.mjs` con la API simulada y un paso del smoke.
108. ~~**Launchpad: los PRs de todos los repos seguidos, por estado**~~ hecho en #199 · Escala · 2×3/2. [replica must 2026-10-28] El otro must que falta (ayuda «Launchpad», <https://help.gitkraken.com/gitkraken-desktop/gitkraken-launchpad/>): con dos o más repos abiertos, la vista conjunta «Todos» suma una lista única de sus PRs abiertos agrupados por estado (borrador, checks en rojo, aprobados, esperando revisión), con lo ya cargado de cada pestaña; cada fila lleva a su rama en su pestaña. Comprobar: prueba de la agrupación con PRs fabricados y un paso del smoke con la API simulada.
109. ~~**Historial de un archivo**~~ hecho en #202 · Análisis · 2×2/1. [replica 2026-10-28] Frente al historial de archivo de GitKraken (ayuda «Diffs, File History and Blame», <https://help.gitkraken.com/gitkraken-desktop/diff/>): cada archivo de los cambios de un commit suma «Historial», que aplica el filtro por ruta a ese archivo (`?path=`) y deja a la vista los commits ya cargados que lo tocaron. Comprobar: un paso del smoke (de un archivo del diff al grafo filtrado por su ruta).
110. ~~**Ocultar una rama o dejarla sola**~~ hecho en #210 · Análisis · 2×2/2. [replica 2026-10-28] Frente a «Hide and Solo» del grafo de GitKraken (ayuda «Interface», <https://help.gitkraken.com/gitkraken-desktop/interface/>): la ficha de una rama suma «Ocultar» y «Solo esta», en 2D y en 3D, recordados por repo y con un botón para volver a verlas todas. Comprobar: prueba de la selección de ramas y un paso del smoke.
111. ~~**Primer padre en el grafo**~~ hecho en #212 · Análisis · 2×2/2. [replica 2026-10-28] Lo pide un usuario de GitKraken, que no lo tiene («it lacks the ability to show first parent only», <https://news.ycombinator.com/item?id=40486993>; `replica/fixes.md`): un interruptor deja en el grafo 2D solo la cadena del primer padre de cada rama, como `git log --first-parent`, con lo ya cargado, y viaja en la URL. Comprobar: prueba de la selección de commits y un paso del smoke.
112. ~~**Vista de un PR: descripción y comentarios**~~ hecho en #211 · Datos · 2×2/2. [replica 2026-10-28] Frente a la vista de PR de GitKraken (ayuda «Pull Requests», <https://help.gitkraken.com/gitkraken-desktop/pull-requests/>): la ficha de una rama con PR de GitHub suma la descripción del PR y sus últimos comentarios, con una consulta solo al pulsar. Comprobar: `tools/github.test.mjs` con la API simulada y un paso del smoke.
113. ~~**Token para Azure DevOps (proyectos privados)**~~ hecho en #214 · Fuentes · 2×2/2. [parte del ítem 107] La primera entrega de Azure DevOps lee solo proyectos públicos: un campo «Token de Azure DevOps» en Ajustes (un token de acceso personal con el permiso `Code (Read)`, enviado como `Authorization: Basic` solo a `dev.azure.com`, guardado como el de Bitbucket y cifrado con el llavero en escritorio) abre los privados, y con él una redirección al inicio de sesión deja de ser «no encontrado» para ser «token rechazado». Comprobar: `tools/azure.test.mjs` (el token va solo a dev.azure.com y en cada consulta) y el paso del smoke del token.
114. ~~**Capa para streaming, décima entrega**~~ hecho en #215 · Plataformas · 1×2/1. [parte del ítem 11] `&branch=nombre` deja en la capa solo esa rama y la rama por defecto (el nombre se compara tal cual, sin tocar el DOM como HTML). Comprobar: prueba de `embedOptions` y un paso del smoke.
115. ~~**Práctica: merge --no-ff**~~ hecho en #216 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `merge --no-ff`, que crea el commit de fusión aunque se pudiera avanzar. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
116. ~~**Ocultar o dejar sola una rama, en la URL**~~ hecho en #218 · Análisis · 1×2/1. [parte del ítem 110] `?solo=rama` y `?ocultar=rama` abren el repo ya con ese filtro. Comprobar: prueba de la lectura de la URL y un paso del smoke.
117. ~~**Azure DevOps: los PRs en el grafo**~~ hecho en #229 · Datos · 1×2/2. [parte del ítem 107] [replica must 2026-10-28] Lo que le falta al must «Azure DevOps» frente a GitKraken (su ayuda «Azure DevOps», <https://help.gitkraken.com/gitkraken-desktop/azure-devops/>, nombra los PRs y sus revisores; `replica/parity.md`): los pull requests de un repo de Azure DevOps salen en el grafo como los de GitHub. Comprobar: `node --test` con la API simulada y un paso del smoke.
118. ~~**Vista de un PR en la URL**~~ hecho en #219 · Datos · 1×2/1. [parte del ítem 112] `?pr=N` abre la vista del PR (descripción y comentarios). Comprobar: prueba de la lectura de la URL y un paso del smoke.
119. ~~**Azure DevOps: tags en el grafo**~~ hecho en #243 · Datos · 1×2/2. [parte del ítem 107] Los tags de un repo de Azure DevOps (`refs?filter=tags/`) salen en el grafo como los de GitHub. Comprobar: `tools/azure.test.mjs` con la API simulada y un paso del smoke.
120. ~~**Azure DevOps: cambios de un commit**~~ hecho en #220 · Análisis · 2×2/2. [parte del ítem 107] La ficha de un commit de Azure DevOps muestra sus archivos cambiados (`commits/{id}/changes`), como los de GitHub. Comprobar: `tools/azure.test.mjs` con la API simulada y un paso del smoke.
121. ~~**Primer padre en el grafo 3D**~~ hecho en #244 · Análisis · 1×2/2. [parte del ítem 111] El interruptor de primer padre también deja en el 3D solo la cadena del primer padre de cada rama. Comprobar: prueba de la selección de commits y un paso del smoke en 3D.
122. ~~**Capa para streaming, undécima entrega**~~ hecho en #222 · Plataformas · 1×2/1. [parte del ítem 11] `&pr=1` deja en la capa solo las ramas con un PR abierto. Comprobar: prueba de `embedOptions` y un paso del smoke.
123. ~~**Práctica: branch -m**~~ hecho en #224 · Público · 1×2/1. [parte del ítem 31] La terminal de práctica entiende `branch -m` para renombrar una rama. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
124. ~~**Vista de texto: ocultar una rama**~~ hecho en #245 · Público · 1×2/2. [parte del ítem 110] El árbol de la vista de texto respeta las ramas ocultas o «solo esta» y deja ocultarlas desde ahí. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
125. ~~**Alias de las pestañas**~~ hecho en #249 · Escala · 1×1/1. [replica 2026-10-28] La pestaña de un repo se renombra con un alias propio (doble clic o F2), recordado por repo en este navegador.
126. ~~**Varias cuentas del mismo servicio**~~ hecho en #251 · Fuentes · 1×2/2. [replica 2026-10-28]
127. ~~**Resaltar una rama al pasar el puntero**~~ hecho en #231 · Análisis. [replica 2026-10-28]
128. ~~**Paleta de comandos**~~ hecho en #232 · Público. [replica 2026-10-28]
129. ~~**Columnas de autor y fecha en el grafo 2D**~~ hecho en #252 · Análisis · 1×2/2. [replica 2026-10-28] Un interruptor deja, junto a cada commit del grafo 2D, su autor y su fecha, con lo ya cargado. Comprobar: prueba del formato de la fila y un paso del smoke.
130. ~~**Blame de un archivo, primera entrega**~~ hecho en #233 · Datos. [replica 2026-10-28]
132. ~~**Paleta de comandos, segunda entrega**~~ hecho en #235 · Público. [parte del ítem 128]
133. ~~**Resumen de la semana de la organización: ramas nuevas**~~ hecho en #253 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma las ramas nuevas de cada repo seguido, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
134. ~~**Salud del repo: PRs cerrados sin fusionar por semana**~~ hecho en #262 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra los PRs cerrados sin fusionar por semana de las últimas 8, con lo ya cargado. Comprobar: `tools/health.test.mjs` con cierres fabricados.
135. ~~**Vista de texto: ramas nuevas**~~ hecho en #255 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama creada en los últimos 7 días lo dice, con lo ya cargado. Comprobar: prueba de la vista y un paso del smoke.
136. ~~**Resumen de la semana de la organización: rama más activa**~~ hecho en #257 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] Cada repo del resumen de la organización nombra su rama más activa de la semana. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
137. ~~**Salud del repo: tendencia de issues abiertos**~~ hecho en #259 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra los issues abiertos por semana de las últimas 8, con lo ya cargado. Comprobar: `tools/health.test.mjs` con issues fabricados.
138. ~~**Vista de texto: ver todas las ramas desde la vista**~~ hecho en #248 · Público · 1×2/1. [inv. 2026-10-13] [parte del ítem 110] Con ramas ocultas, la vista de texto suma un botón «Ver todas las ramas» (y la tecla A) que limpia el filtro como el del grafo, sin cerrar el árbol. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
139. ~~**Vista de texto: CI de cada rama**~~ hecho en #260 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama dice si su último CI ya cargado falló («CI fallando»), con una marca. Comprobar: prueba de la vista con `data.ci` fabricado y un paso del smoke.
140. ~~**Vista de texto: autor de la punta de cada rama**~~ hecho en #270 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama dice quién hizo el commit de su punta, con lo ya cargado. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
141. ~~**Salud del repo: autores de commits por semana**~~ hecho en #271 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra cuántos autores distintos hicieron commits cada semana de las últimas 8, con los commits ya cargados. Comprobar: `tools/health.test.mjs` con commits fabricados.
142. ~~**Resumen de la semana: PRs fusionados por autor**~~ hecho en #273 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana nombra quién fusionó más PRs, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con PRs fabricados.
143. ~~**Resumen de la semana de la organización: PRs abiertos**~~ hecho en #275 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma los PRs abiertos en la semana de cada repo seguido, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
144. ~~**Resumen de la semana de la organización: autores nuevos**~~ hecho en #278 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma los autores nuevos de cada repo seguido, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
145. ~~**Salud del repo: tendencia de tags**~~ hecho en #256 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud suma los tags nuevos por semana de las últimas 8, con los tags cargados. Comprobar: `tools/health.test.mjs` con tags fabricados.
146. ~~**Vista de texto: ramas sin PR**~~ hecho en #277 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de cada rama dice si no tiene pull request abierto, con lo ya cargado. Comprobar: `node --test` con ramas y PRs fabricados.
147. ~~**Constelación: ordenar por ramas nuevas**~~ hecho en #279 · Escala · 1×2/2. [inv. 2026-10-13] [parte del ítem 26] La constelación se ordena también por ramas nuevas de la semana, con lo ya cargado de cada repo. Comprobar: `node --test` con repos fabricados.
148. ~~**Práctica: restore --staged y clean**~~ hecho en #281 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 16] La práctica de git admite `restore --staged` y `clean` con su ejercicio en los 40 idiomas. Comprobar: `node --test` de la práctica.
149. ~~**Extensión de Chrome y Firefox, primera entrega**~~ hecho en #269 · Plataformas · 2×2/3. [inv. 2026-10-13] [parte del mapa: Plataformas] Una extensión (Manifest V3, sin dependencias ni CDN) añade a las páginas de un repo de GitHub un botón «Abrir en GraphBranch» que lleva a `?repo=dueño/repo` de la web publicada; sin permisos de red nuevos ni lectura de tokens. Comprobar: prueba del manifiesto (permisos mínimos, sin `host_permissions` más allá de github.com) y del armado de la URL.
150. ~~**App móvil, primera entrega: compartir hacia la PWA**~~ hecho en #265 · Plataformas · 2×2/2. [inv. 2026-10-13] [parte del mapa: Plataformas] El manifiesto de la PWA declara `share_target`: compartir un enlace de GitHub, GitLab, Codeberg, Bitbucket o Azure desde el menú del móvil abre GraphBranch con ese repo, sin consultas nuevas. Comprobar: `tools/pwa.test.mjs` (el manifiesto y el reconocimiento del enlace compartido) y un paso del smoke.
151. ~~**Más de 10 repos: subir el tope a 20**~~ hecho en #266 · Escala. [inv. 2026-10-13] [parte del ítem 26]
152. ~~**CI de GitLab, primera entrega**~~ hecho en #267 · Datos · 2×2/2. [inv. 2026-10-13] [parte del mapa: Datos] El grafo muestra el estado del último pipeline de la cabeza de cada rama de un proyecto de GitLab (`/projects/:id/pipelines?ref=`), con la misma marca de CI que ya usa GitHub y una consulta solo si hay token o el proyecto es público. Comprobar: `tools/gitlab.test.mjs` con la API simulada y un paso del smoke.
153. ~~**Estado de los despliegues, primera entrega**~~ hecho en #293 · Datos · 1×2/2. [inv. 2026-10-13] [parte del mapa: Datos] El panel de salud dice el estado del último despliegue de cada entorno de GitHub (producción, preview…) con lo que ya trae la carga de despliegues, sin consultas nuevas. Comprobar: `tools/health.test.mjs` con despliegues fabricados.
154. ~~**Resumen de la semana de la organización: issues cerrados**~~ hecho en #298 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma los issues cerrados de cada repo seguido, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
155. ~~**Extensión de Chrome y Firefox: GitLab, Codeberg y Bitbucket**~~ hecho en #302 · Plataformas · 1×2/2. [parte del ítem 149] El botón «Abrir en GraphBranch» también aparece en las páginas de un proyecto de gitlab.com, codeberg.org y bitbucket.org, con el repo armado como `?repo=https://…`, sin más permisos que los hosts de esas páginas. Comprobar: `tools/browser-extension.test.mjs` con URL de las tres plataformas.
156. ~~**Grafo 2D: el SHA junto a cada commit**~~ hecho en #274 · Análisis · 1×2/1. [replica 2026-10-28] [parte de «Columnas de autor fecha y SHA a la vista en el grafo»] Las columnas de autor y fecha del grafo 2D suman el SHA corto de cada commit (7 caracteres, con el mismo interruptor), con lo ya cargado. Comprobar: un paso del smoke que lea el SHA de una fila y `node --test` del armado de la columna.
157. ~~**Launchpad: fijar un PR arriba**~~ hecho en #303 · Escala · 1×2/2. [replica 2026-10-28] [parte de «Launchpad: fijar y posponer PRs e issues»] Cada PR del Launchpad de la vista conjunta se puede fijar arriba de su grupo; lo fijado se guarda en este navegador (por repo y número, sin títulos) y se suelta con el mismo botón. Comprobar: `node --test` del orden con PRs fijados y un paso del smoke.
158. ~~**Launchpad: filtrar por persona**~~ hecho en #307 · Escala · 1×2/2. [replica 2026-10-28] [parte de «Launchpad: vista de equipo filtrada por colaborador»] El Launchpad de la vista conjunta se filtra por autor del PR (las personas que ya salen en él), con lo ya cargado y sin consultas. Comprobar: `node --test` del filtro con PRs fabricados de dos autores.
159. ~~**CI de GitLab en el resto de las ramas**~~ hecho en #305 · Datos · 1×2/2. [inv. 2026-10-13] [parte del ítem 152] El estado del último pipeline llega también a las ramas que no son la por defecto, las fijadas ni las de una MR abierta, hasta un tope por ciclo y solo con el proyecto visible. Comprobar: `tools/gitlab.test.mjs` con la API simulada (cuántas consultas por ciclo).
160. ~~**Token para un Forgejo o Gitea propio**~~ hecho en #310 · Fuentes · 1×2/2. [inv. 2026-10-13] [parte del ítem 36]
161. ~~**Resumen de la semana de la organización: quién fusionó**~~ hecho en #313 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma quién fusionó los PRs de cada repo seguido (hasta 5 cuentas), con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
162. ~~**Práctica: commit de solo lo preparado**~~ hecho en #283 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `commit` guarda solo lo preparado con `add` y deja lo demás sin commit (con `-a` guarda todo lo cambiado), y un ejercicio lo practica. Comprobar: `node --test tools/gitsim.test.mjs` (qué queda tras `commit` con y sin `-a`) y el ejercicio nuevo en los 40 idiomas.
163. ~~**Práctica: stash -u**~~ hecho en #316 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 16] `stash -u` aparta también los archivos sin seguir y `stash pop` los devuelve; sin `-u` se quedan. Comprobar: `node --test tools/gitsim.test.mjs` con un archivo de `touch --new`.
164. ~~**Resumen de la semana de la organización: PRs cerrados sin fusionar**~~ hecho en #317 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma los PRs cerrados sin fusionar de los repos seguidos, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
165. ~~**Constelación: ordenar por issues abiertos**~~ hecho en #282 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] La constelación se ordena también por issues abiertos (con lo ya cargado de cada repo) y `?order=issues` la abre así. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
166. ~~**Launchpad: posponer un PR**~~ hecho en #318 · Escala · 1×2/2. [replica 2026-10-28] [parte de «Launchpad: fijar y posponer PRs e issues»] Cada PR del Launchpad de la vista conjunta se puede posponer (baja al final de la lista hasta que pase un día) y se recuerda en este navegador. Comprobar: `node --test` del orden con PRs fabricados y un paso del smoke.
167. ~~**Salud del repo: tendencia de estrellas**~~ hecho en #320 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del mapa: Análisis] El panel de salud compara las estrellas nuevas de la semana con las de la anterior, con lo ya cargado y sin consultas nuevas. Comprobar: `node --test tools/health.test.mjs` con estrellas fabricadas.
168. ~~**Constelación: ordenar por estrellas**~~ hecho en #285 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] La constelación se ordena también por estrellas, con el total que ya trae la consulta del repo de cada fuente que lo da (sin consultas nuevas), y `?order=stars` la abre así. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
169. ~~**Práctica: add -u**~~ hecho en #286 · Público · 1×2/1. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `add -u` prepara solo lo cambiado que git ya sigue y deja fuera los archivos sin seguir (`add .` prepara los dos). Comprobar: `node --test tools/gitsim.test.mjs` (qué queda preparado tras `add -u` y `add .` con un archivo cambiado y uno sin seguir).
170. ~~**Constelación: ordenar por forks**~~ hecho en #287 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] La constelación se ordena también por forks, con el total que ya trae la consulta del repo de cada fuente que lo da (`forks_count`, `forks`; sin consultas nuevas), y `?order=forks` la abre así. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
171. ~~**Práctica: add -A**~~ hecho en #290 · Público · 1×2/1. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `add -A` (o `--all`) prepara todo: lo cambiado y los archivos sin seguir, como `add .`, y a diferencia de `add -u`. Comprobar: `node --test tools/gitsim.test.mjs` (qué queda preparado tras `add -A`, `add -u` y `add .` con un archivo cambiado y uno sin seguir).
172. ~~**Constelación: ordenar por último commit**~~ hecho en #292 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] La constelación se ordena también por la fecha del commit más reciente ya cargado de cada repo (el más reciente primero; los que cargan o están vacíos, al final), sin consultas nuevas, y `?order=recent` la abre así. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
173. ~~**Práctica: rm y mv**~~ hecho en #321 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `rm <archivo>` borra un archivo que git sigue y deja el borrado preparado (`rm --cached` lo deja sin seguir), `mv vieja nueva` lo renombra preparado, y `add -A` prepara también los borrados hechos a mano. Comprobar: `node --test tools/gitsim.test.mjs` (qué muestra `status` y qué guarda el commit tras `rm`, `rm --cached` y `mv`).
174. ~~**Constelación: cuánto hace el último commit**~~ hecho en #297 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] Cada galaxia de la constelación dice, junto a sus commits y ramas, cuánto hace de su commit más reciente ya cargado («hace 3 h», con el formato relativo que ya usa la app y en los 40 idiomas; nada si carga o está vacía), sin consultas nuevas, y el lector de pantalla lo lee en el nombre de la galaxia. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
175. ~~**Estado de los despliegues, segunda entrega**~~ hecho en #322 · Datos · 1×2/2. [parte del ítem 153] El panel de salud suma si el último despliegue de cada entorno de GitHub salió bien, falló o sigue en curso (`/deployments/:id/statuses`, una consulta por entorno, solo con el panel abierto y no más de una cada 15 minutos). Comprobar: `tools/github.test.mjs` con la API simulada (cuántas consultas y solo con el panel abierto).
176. ~~**Constelación: las galaxias quietas, tenues**~~ hecho en #299 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] La galaxia de un repo cuyo commit más reciente ya cargado tiene más de 30 días se dibuja tenue y su nombre accesible lo dice («sin actividad hace más de 30 días», como las ramas quietas de la vista de texto), con lo ya cargado y sin consultas nuevas; las que cargan o están vacías no cambian. Comprobar: `node --test tools/constellation.test.mjs` y un paso del smoke.
177. ~~**Launchpad: el filtro por persona en la URL**~~ hecho en #308 · Escala · 1×2/1. [parte del ítem 158] El filtro por persona del Launchpad viaja en `?by=login` (se lee al abrir la vista conjunta y se escribe al elegir), para compartir la vista de una persona. Comprobar: `node --test` de leer y escribir el parámetro, con un login desconocido que se ignora.
178. ~~**Launchpad: cuántos PRs tiene cada persona**~~ hecho en #312 · Escala · 1×2/1. [parte del ítem 158] Cada opción del selector de personas del Launchpad dice cuántos PRs abiertos tiene (`ana (3)`), con lo ya cargado. Comprobar: `node --test` del conteo por persona con PRs fabricados de tres autores.
179. ~~**Resumen de la semana: quién abrió más PRs**~~ hecho en #324 · Salidas · 1×2/2. [parte del ítem 23] El resumen de la semana suma las personas que más PRs abrieron en la semana, con lo ya cargado. Comprobar: `node --test` del conteo con PRs fabricados de dos semanas.
180. ~~**Salud del repo: PRs sin revisión hace días**~~ hecho en #325 · Análisis · 1×2/2. [parte del ítem 12] El panel de salud cuenta los PRs abiertos que llevan más de 7 días sin revisión, con lo ya cargado. Comprobar: `node --test` con PRs de distintas edades, borradores excluidos.
181. ~~**Práctica: git clean**~~ hecho en #326 · Público · 1×2/2. [parte del ítem 16] En la práctica de git, `clean` borra los archivos sin seguir del directorio de trabajo, con su ejercicio y su comprobación. Comprobar: `node --test` del simulador (`js/gitsim.js`) antes y después de `clean`.
182. ~~**Launchpad: filtrar por repo**~~ hecho en #314 · Escala · 1×2/1. [parte del ítem 158] Además de la persona, un segundo selector deja solo los PRs de un repo del Launchpad, con lo ya cargado. Comprobar: `node --test` del filtro con PRs fabricados de dos repos.
183. ~~**Práctica: stash show**~~ hecho en #328 · Público · 1×2/2. [parte del ítem 16] En la práctica de git, `stash show [<stash>]` lista los archivos que guarda un stash sin devolverlos, con su ejercicio. Comprobar: `node --test` del simulador (`js/gitsim.js`) con `stash show` antes y después de un `pop`.
184. ~~**Práctica: tag anotado**~~ hecho en #330 · Público · 1×2/2. [parte del ítem 16] En la práctica de git, `tag -a <nombre> -m "mensaje"` crea una etiqueta con mensaje y el `log` la sigue mostrando como `tag:`. Comprobar: `node --test` del simulador con `tag -a`.
185. ~~**Práctica: branch -c**~~ hecho en #333 · Público · 1×2/2. [parte del ítem 16] En la práctica de git, `branch -c [vieja] <nueva>` copia una rama con sus commits sin mover HEAD. Comprobar: `node --test` del simulador con `branch -c` y el `reflog`.
186. ~~**Resumen de la semana de la organización: quién abrió más PRs**~~ hecho en #329 · Salidas · 1×2/2. [parte del ítem 179] El resumen de la semana de una organización suma las personas que más PRs abrieron en la semana, con lo ya cargado. Comprobar: `node --test` del resumen con PRs simulados de dos repos.
187. ~~**Salud del repo: tendencia de forks**~~ hecho en #332 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del mapa: Análisis] El panel de salud compara los forks nuevos de la semana con los de la anterior, con lo ya cargado. Comprobar: `node --test` de `js/health.js` con forks simulados de dos semanas.
188. ~~**Vista de texto: PRs con CI fallido**~~ hecho en #336 · Público · 1×2/2. [parte del ítem 110] La vista de texto lista los PRs abiertos cuya rama tiene el último CI en rojo, con lo ya cargado y sin consultas nuevas. Comprobar: `node --test` de `js/textview.js` con CI simulado.
189. ~~**Resumen de la semana: quién cerró más issues**~~ hecho en #334 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana de un repo suma las personas que más issues cerraron en la semana (cada issue una vez), con lo ya cargado. Comprobar: `node --test tools/digest.test.mjs` con issues cerrados fabricados de dos semanas.
190. ~~**Práctica: git show**~~ hecho en #338 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `show [<commit>]` imprime el SHA, el mensaje y los archivos de un commit (HEAD si no se da otro), sin mover nada. Comprobar: `node --test tools/gitsim.test.mjs` con `show`, `show HEAD~1` y un SHA que no existe.
191. ~~**Práctica: git diff**~~ hecho en #341 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 16] En la práctica de git, `diff` lista los archivos cambiados sin preparar y `diff --staged` los preparados, sin tocar nada. Comprobar: `node --test tools/gitsim.test.mjs` antes y después de `add`.
192. ~~**Vista de texto: PRs en borrador**~~ hecho en #360 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 110] La vista de texto dice qué PRs abiertos están en borrador, en su lista de PRs y en el nombre de su rama, con lo ya cargado. Comprobar: `node --test tools/textview.test.mjs` con PRs simulados en borrador y listos.
193. ~~**Columnas de SHA, autor y fecha en el grafo 3D**~~ hecho en #339 · Análisis · 1×2/2. [replica 2026-10-28] [parte de «Columnas de autor fecha y SHA a la vista en el grafo»] El interruptor de las columnas también rotula en el 3D cada commit con su SHA corto, su autor y su fecha. Comprobar: un paso del smoke con el interruptor en el 3D.
194. ~~**Salud del repo: autores nuevos por semana**~~ hecho en #342 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud cuenta, por semana de las últimas 8, cuántas personas firmaron su primer commit cargado. Comprobar: `node --test tools/health.test.mjs` con commits fabricados de varias semanas.
195. ~~**Salud del repo: forks nuevos por semana**~~ hecho en #351 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 187] El panel de salud suma, a las series de las últimas 8 semanas, los forks nuevos de cada una (cada fork una vez, de las actividades «fork» ya cargadas). Comprobar: `node --test tools/health.test.mjs` con forks fabricados de varias semanas.
202. ~~**Salud del repo: factor de ausencia**~~ hecho en #346 · Análisis · 2×2/1. [inv. 2026-11-12] El panel de salud dice cuántas personas suman la mitad de los commits cargados (el «Contributor Absence Factor» de CHAOSS: se ordena de más a menos y se suma hasta pasar el 50 %), como una sola cifra, sin nombres ni cifras por persona; con la misma clave de autor que los autores por semana. Comprobar: `node --test tools/health.test.mjs` con commits fabricados (un autor con más de la mitad da 1; cuatro iguales dan 2) y un paso del smoke con la demo.
203. ~~**Práctica: un remoto con push y fetch**~~ hecho en #343 · Público · 2×3/2. [inv. 2026-11-12] [parte del ítem 16] Primera entrega: la práctica de git trae un remoto simulado `origin`; `push` sube la rama actual (y `origin/<rama>` sale en el grafo de la práctica), `fetch` trae lo que un ejercicio dejó en el remoto, y `status` dice cuántos commits va por delante o por detrás. Comprobar: `node --test tools/gitsim.test.mjs` con push, fetch y el aviso de adelanto y atraso.
204. ~~**Práctica: cartas de comandos**~~ hecho en #350 · Público · 2×2/2. [inv. 2026-11-12] [parte del ítem 16] Bajo la terminal de la práctica, una fila de cartas (commit, branch, switch, merge, rebase, reset…) con su descripción corta: pulsar una escribe el comando en la línea, sin ejecutarlo, para quien todavía no sabe qué escribir; navegable con el teclado y en los 40 idiomas. Comprobar: un paso del smoke que pulsa una carta y ve el comando en la línea.
205. ~~**Práctica: el índice y el árbol de trabajo a la vista**~~ hecho en #352 · Público · 2×2/2. [inv. 2026-11-12] [parte del ítem 16] Junto al grafo de la práctica, tres columnas (árbol de trabajo, índice y HEAD) con los archivos de cada una y su estado, que cambian al momento con `touch`, `add`, `commit`, `reset` o `restore`, como el mismo texto para un lector de pantalla. Comprobar: un paso del smoke con `touch`, `add` y `commit`, y `node --test tools/gitsim.test.mjs` para la función que arma las columnas.
206. ~~**Salud del repo: líneas añadidas y borradas por semana**~~ hecho en #348 · Análisis · 2×2/2. [inv. 2026-11-12] En GitHub, al abrir el panel, una consulta a `/repos/:o/:r/stats/code_frequency` (con ETag; si GitHub responde 202 mientras calcula, la línea dice que vuelva a abrir) suma a las series de las últimas 8 semanas las líneas añadidas y borradas; sin consultas con el panel cerrado, y la demo con cifras propias. Comprobar: `node --test` con la API simulada (200, 202 y 204) y un paso del smoke con la demo.
208. ~~**Práctica: pull y borrar ramas del remoto**~~ hecho en #347 · Público · 2×2/1. [parte del ítem 203] Segunda entrega del remoto simulado: `pull` (un `fetch` y un `merge` de la rama que se sigue, o `pull --rebase`), `push --delete origin <rama>` y `fetch --prune` (la rama de seguimiento de una rama borrada en el remoto se va, y `status` dice «the upstream is gone»), y que un ejercicio propio pueda dejar commits ajenos en el remoto (una condición o un comando de partida nuevo, validado como los demás). Comprobar: `node --test tools/gitsim.test.mjs` con `pull` que avanza rápido, que fusiona y con `--rebase`, el borrado y la poda, y un ejercicio propio con un commit ajeno en el remoto.
209. ~~**Práctica: conflictos de merge**~~ hecho en #355 · Público · 2×3/2. [inv. 2026-10-13] Primera entrega: conflictos por nombre de archivo en `merge`, con `status`, `add`, `commit` y `merge --abort`, y su ejercicio guiado.
210. ~~**Launchpad: filtrar por persona**~~ hecho en #354 · Análisis · 2×2/2. (El filtro por quien abrió el PR y su `?by=` ya estaban desde #307 y #308: la entrega suma lo que faltaba de la fila, los PRs en que a la persona se le pidió revisión o está asignada, con su marca, y deja `?by=` en vez de un `?who=` nuevo.) [replica 2026-10-28] La fila «Launchpad: vista de equipo filtrada por colaborador» falta (`replica/features.csv`). En la vista conjunta, un selector de persona sobre el Launchpad deja solo los PRs abiertos de quien se elija (como autor), de todos los repos seguidos, con lo ya cargado y sin consultas nuevas; viaja en la URL (`?who=login`). Comprobar: `node --test` sobre la función que filtra (mayúsculas, PRs sin autor) y un paso del smoke con la demo.
211. ~~**Launchpad: también los issues**~~ hecho en #356 · Análisis · 2×2/2. [replica 2026-10-28] La fila «Launchpad: fijar y posponer PRs e issues» está a medias porque el Launchpad solo lista PRs. Primera entrega: un grupo «Issues abiertos» con los issues abiertos ya cargados de los repos seguidos (los de la actividad, cada número una vez por repo), donde el 📌 y el 💤 valen como para los PRs. Comprobar: `node --test` con issues abiertos y cerrados de dos repos, y un paso del smoke con la demo que fija uno.
212. ~~**Más de dos cuentas de GitHub**~~ hecho en #358 · Fuentes · 2×2/2. [replica 2026-10-28] La fila «Varios perfiles o cuentas» está a medias: hay una sola segunda cuenta, atada a un dueño. Primera entrega: hasta 5 cuentas extra, cada una con su dueño y su token, que va solo a los repos de ese dueño, como la segunda de hoy (que pasa a ser la primera de la lista sin perder lo guardado). Toca cómo se guardan los tokens: plan por consenso. Comprobar: `node --test tools/github.test.mjs` con tres dueños (cada token solo a los suyos, ninguno a un tercero) y la migración de la segunda cuenta guardada.
213. ~~**Cargar más historia de una rama**~~ hecho en #359 · Escala · 2×2/2. [replica 2026-10-28] La fila «Cargar más historia» está a medias: el tope de **Commits por rama** es uno para todo el repo, en Ajustes. En la ficha de una rama cuya historia quedó cortada, **Cargar más** trae otra tanda de sus commits (tantos como el tope) sin recargar el repo ni subir el tope de las demás, y el grafo los dibuja. Comprobar: `node --test` con la API simulada (la segunda página de commits de esa rama, ninguna consulta para las demás) y un paso del smoke con la demo.
214. ~~**Constelación de una organización entera**~~ hecho en #362 · Escala · 2×2/3. [inv. 2026-10-13] El Mapa de alcance pide seguir una organización con más de 20 repos; GitKraken (fuente del 2026-10-13) arma espacios de trabajo con varios repos. Primera entrega: con `org:nombre`, la constelación dibuja todos los repos de la organización (hasta 100, de la lista que ya se pide, una consulta por página), los que no tienen pestaña como galaxias tenues con la fecha de su último push, sin cargar sus ramas; un clic abre su pestaña si queda lugar. Comprobar: `node --test` con la API simulada (dos páginas de repos, ninguna consulta de ramas para los que no tienen pestaña) y un paso del smoke con la demo.
