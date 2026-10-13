# Investigación de mercado

De aquí sale la hoja de ruta de `IMPROVEMENTS.md` cuando se repone (regla 5 de la directiva): qué hacen
las herramientas parecidas, para quién, y qué implica para GraphBranch. Cada fuente lleva la fecha en que
se consultó y su URL, y dice solo lo que la página dice: lo que no consta, se anota como «no consta».

## Reglas

- **Frescura:** la investigación vale 30 días. Pasados, la próxima reposición de la hoja de ruta empieza
  por investigar de nuevo (`node tools/loop.mjs --check` lo avisa en R10).
- **Con qué:** `WebSearch` y `WebFetch` sobre la página oficial de cada herramienta. Sin esas herramientas
  (no están o se niegan) no se inventa nada: se repone con las ideas puntuadas de abajo, si la
  investigación está vigente, y si no, se dice en la bitácora y en Para Benjamin.
- **Puntaje:** `alcance × impacto / esfuerzo`, cada uno de 1 a 3. Alcance: 1 un nicho, 2 un grupo claro,
  3 casi todos los que usan la app o un público nuevo grande. Impacto: 1 un detalle, 2 útil, 3 cambia
  para qué sirve. Esfuerzo: 1 cabe holgado en una iteración, 2 una iteración justa, 3 hay que partirlo.
  En la hoja de ruta va tras el eje (`· Datos · 3×3/2.`).
- **De la investigación a la hoja:** un ítem nuevo (después del 26) cita su fuente con `[inv. AAAA-MM-DD]`
  (una fecha de las entradas de abajo) o, si es una entrega más de otro ítem, `[parte del ítem K]`.

## Fuentes

### 2026-10-13 · Gource

- **Qué es:** animación del historial de un repo como un árbol: directorios como ramas, archivos como
  hojas y los autores apareciendo cuando aportan. Lee logs de Git, Mercurial, Bazaar y SVN; saca la
  animación por `--output-stream` hacia ffmpeg, admite archivos de rótulos (captions), filtra por fechas
  (`--start-date`, `--stop-date`) y guarda capturas PNG. Versión 0.56 del 6 de marzo de 2026.
- **Fuente:** https://gource.io/ (consultada el 2026-10-13)
- **Implica:** el Replay grabado (#49) ya cubre lo de Gource en el navegador y sin instalar nada. Lo que
  falta frente a Gource: elegir el tramo de fechas del Replay y ponerle rótulos propios. Gource no es en
  vivo; GraphBranch sí.

### 2026-10-13 · gitk

- **Qué es:** el navegador gráfico de Git (Tcl/Tk): grafo de commits, detalle de cada uno y sus
  archivos. Filtra por fechas (`--since`, `--until`), por rutas (`-- <path>`), sigue un rango de líneas
  (`-L`) y, tras un merge con conflictos, muestra solo los commits que tocan esos archivos (`--merge`).
- **Fuente:** https://git-scm.com/docs/gitk (consultada el 2026-10-13)
- **Implica:** el filtro por ruta de archivo («qué ramas tocan `src/pagos.js`») es una herramienta básica
  que GraphBranch no tiene; encaja con Choques entre ramas (ítem 14) y la búsqueda (ítem 19).

### 2026-10-13 · Red de ramas de GitHub (network graph)

- **Qué es:** la línea de tiempo de los commits más recientes de toda la red del repo, forks incluidos,
  por dueño de rama. Muestra «hasta 100 de las ramas con push más reciente»; las demás, arrastrando.
- **Fuente:** https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/understanding-connections-between-repositories (consultada el 2026-10-13)
- **Implica:** GraphBranch ya supera el tope de 100 ramas (#15) y es en vivo (la página no dice que la
  red se actualice sola). Lo que la red tiene y GraphBranch no: los forks en el mismo grafo.

### 2026-10-13 · GitHub Pulse

- **Qué es:** el resumen de actividad de un repo: PRs abiertos y fusionados, issues abiertos y cerrados y
  los commits de los 15 que más aportaron a la rama por defecto, en los últimos 7 días (o el período que
  se elija).
- **Fuente:** https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-summary-of-repository-activity (consultada el 2026-10-13)
- **Implica:** el Resumen de la semana (ítem 23) compite con Pulse en un solo repo; su diferencia es
  juntar varios repos y una organización, y sacarlo como Markdown o imagen para compartir.

### 2026-10-13 · Métricas DORA

- **Qué es:** las métricas de entrega de software: tiempo de entrega de un cambio (del commit a
  producción), frecuencia de despliegue, tiempo de recuperación de un despliegue fallido, tasa de
  cambios fallidos y tasa de retrabajo.
- **Fuente:** https://dora.dev/guides/dora-metrics/ (consultada el 2026-10-13)
- **Implica:** lo que los equipos ya miden. Salud del repo (ítem 12) puede hablar ese idioma con lo que
  ya está cargado (de abierto a fusionado); la frecuencia de despliegue necesita Tags y despliegues
  (ítem 17), y la tasa de fallos, CI en el grafo (ítem 9).

### 2026-10-13 · GitKraken Desktop

- **Qué es:** cliente de Git con grafo de commits (gratis en el plan Community para repos locales y
  públicos), integraciones con GitHub, GitLab, Bitbucket y Azure DevOps (las versiones propias de cada
  servidor, desde el plan Advanced), espacios de trabajo con varios repos, Launchpad (PRs e issues por
  estado, Pro) y aviso cuando otro del equipo edita la misma zona del código (Pro). El estado de CI en el
  grafo no consta en la página.
- **Fuente:** https://www.gitkraken.com/git-client (consultada el 2026-10-13)
- **Implica:** los choques entre ramas (ítem 14) y una vista de PRs por estado (ítem 12) son funciones de
  pago en el cliente más conocido: GraphBranch las puede dar gratis y en vivo. Los servidores propios
  (ítems 13 y 25) se cobran como función de empresa: alcance chico para una web estática.

### 2026-10-13 · GitLens (VS Code)

- **Qué es:** extensión de VS Code con más de 40 millones de instalaciones. Gratis: blame en línea,
  CodeLens, búsqueda de commits e historial de archivos. Pro: el Commit Graph, worktrees, el historial
  visual de archivos, Launchpad y los repos privados.
- **Fuente:** https://www.gitkraken.com/gitlens (consultada el 2026-10-13)
- **Implica:** el grafo de ramas dentro de VS Code es de pago en la extensión más usada: la Extensión de
  VS Code (ítem 24) tiene un público enorme, pero hay que partirla (webview, token de la sesión,
  paquete).

### 2026-10-13 · Sourcetree

- **Qué es:** cliente de Git gratis para Windows y macOS, de Atlassian: diagramas de ramas, Git-flow
  integrado, Git LFS, submódulos y rebase interactivo; nombra como integración solo Bitbucket.
- **Fuente:** https://www.sourcetreeapp.com/ (consultada el 2026-10-13)
- **Implica:** el público de Bitbucket usa herramientas de Atlassian y no tiene un grafo en vivo en la
  web: Bitbucket Cloud (ítem 22) amplía la base, a esfuerzo medio. Sin Linux: la app de escritorio de
  GraphBranch sí corre en Linux.

### 2026-10-13 · GitUp

- **Qué es:** cliente de Git gratis y de código abierto para macOS 12.4 o más: un «Live Map» del grafo
  que se actualiza al instante, también con cambios hechos fuera de GitUp; deshacer y rehacer, instantáneas
  del repo y búsqueda instantánea. Dice cargar los 40.000 commits del repo de Git en menos de un segundo.
- **Fuente:** https://gitup.co/ (consultada el 2026-10-13)
- **Implica:** un grafo que reacciona al instante a un repo local es justo lo que pide Repos locales en la
  app de escritorio (ítem 10); GitUp es solo macOS, y GraphBranch corre en Windows, macOS y Linux.

### 2026-10-13 · Fork

- **Qué es:** cliente de Git para macOS y Windows, US$59,99 con evaluación gratis: rebase interactivo,
  resolución de conflictos, diferencias de imágenes y notificaciones discretas de la actividad de
  GitHub. No consta un grafo de ramas en la página.
- **Fuente:** https://git-fork.com/ (consultada el 2026-10-13)
- **Implica:** las notificaciones de actividad de GitHub son un valor reconocido; GraphBranch ya las tiene
  (panel, avisos, sonido, notificaciones del sistema) y le falta llevarlas fuera de la app: Slack y
  Discord (ítem 15).

### 2026-10-13 · Sublime Merge

- **Qué es:** cliente de Git para Windows, macOS y Linux: búsqueda instantánea mientras se escribe en
  todo el repo (por mensaje, autor, ruta o contenido), blame, historial de archivos, paleta de comandos y
  Git Flow. Precio y licencia no constan en la portada.
- **Fuente:** https://www.sublimemerge.com/ (consultada el 2026-10-13)
- **Implica:** buscar por mensaje, autor o ruta es lo esperable en una herramienta de historial:
  Búsqueda y filtro por autor (ítem 19) es una carencia visible y barata.

### 2026-10-13 · GitButler

- **Qué es:** cliente de Git con interfaz y CLI (`but`): ramas en paralelo sin cambiar de rama, ramas
  apiladas, línea de tiempo para deshacer, conflictos que se resuelven después, e integración con GitHub,
  GitLab y Bitbucket para PRs, ramas y estado de CI. Licencia Fair Source que pasa a MIT a los dos años.
- **Fuente:** https://github.com/gitbutlerapp/gitbutler (consultada el 2026-10-13)
- **Implica:** el estado de CI junto a las ramas es parte de lo básico de un cliente moderno: CI en el
  grafo (ítem 9) es de lo más valioso que falta. Las ramas apiladas (un PR sobre otro) son un dato que
  GraphBranch podría dibujar.

### 2026-10-13 · Learn Git Branching

- **Qué es:** visualizador y sandbox para aprender Git en el navegador: el árbol de commits cambia con
  cada comando, niveles por pestañas con «git golf» (cuántos comandos se usan), un constructor de niveles
  que exporta JSON y niveles compartidos por URL (`command`, `gist_level_id`). Todo del lado del cliente,
  sin servidor. Cuántos idiomas trae no consta (nombra a 20 personas que tradujeron).
- **Fuente:** https://github.com/pcottle/learnGitBranching (consultada el 2026-10-13)
- **Implica:** el modelo de Aprender git (ítem 16) está probado y es estático como GraphBranch. La
  diferencia posible: practicar sobre el grafo 2D o 3D de la app y en 40 idiomas, y compartir un ejercicio
  por URL.

### 2026-10-13 · git-sim

- **Qué es:** herramienta en Python (GPL-2.0) que dibuja lo que haría un comando de Git (unos 40: merge,
  rebase, reset, cherry-pick…) sobre el repo propio, sin tocarlo: página HTML interactiva, imagen o video
  (MP4/WebM). Tiene extensión de VS Code, una GitHub Action que comenta PRs y un servidor MCP.
- **Fuente:** https://github.com/initialcommit-com/git-sim (consultada el 2026-10-13)
- **Implica:** «qué pasaría si fusiono esto» sobre el repo real es una forma de aprender y de revisar que
  Aprender git (ítem 16) podría sumar en una segunda entrega; exige instalar Python y Manim, GraphBranch
  no.

### 2026-10-13 · Capas para OBS (streaming)

- **Qué es:** búsqueda de una capa de OBS que muestre la actividad de GitHub de quien transmite mientras
  programa: aparecen capas genéricas en HTML (listas de tareas, alertas) que se cargan como «Browser
  Source», pero ninguna lista para commits o PRs.
- **Fuente:** https://www.jeffgeerling.com/blog/2021/obs-task-list-overlay-livestream-todo-checklist/ y https://github.com/spenibus/obs-overlay-html-js (búsqueda del 2026-10-13)
- **Implica:** el Widget embebible y capa para streaming (ítem 11) llena un hueco sin competencia directa
  encontrada, con poco esfuerzo: la app ya es una página estática que OBS puede cargar.

## Ideas puntuadas

Las de la hoja de ruta (su puntaje está también en `IMPROVEMENTS.md`) y las candidatas que salen de esta
investigación, para la próxima reposición. Ordenadas por puntaje.

| Idea | Eje | a×i/e | Puntaje | De dónde | Estado |
| --- | --- | --- | --- | --- | --- |
| Widget embebible y capa para streaming | Plataformas | 2×3/1 | 6,0 | Capas para OBS | ítem 11 |
| Salud del repo | Análisis | 3×2/1 | 6,0 | GitKraken (Launchpad), DORA | ítem 12 |
| Búsqueda y filtro por autor | Análisis | 3×2/1 | 6,0 | Sublime Merge, GitLens | ítem 19 |
| CI en el grafo | Datos | 3×3/2 | 4,5 | GitButler, DORA | ítem 9 |
| Resumen de la semana | Salidas | 2×2/1 | 4,0 | GitHub Pulse | ítem 23 |
| Replay por tramo de fechas y con rótulos propios | Salidas | 2×2/1 | 4,0 | Gource | ítem 27 |
| Ejercicios de Aprender git compartidos por URL | Público | 2×2/1 | 4,0 | Learn Git Branching | ítem 28 |
| Repos locales en la app de escritorio | Fuentes | 3×3/3 | 3,0 | GitUp | ítem 10 |
| Choques entre ramas | Análisis | 2×3/2 | 3,0 | GitKraken (Pro), gitk | ítem 14 |
| Aprender git | Público | 3×3/3 | 3,0 | Learn Git Branching, git-sim | ítem 16 |
| Avisos a Slack y Discord | Salidas | 2×2/2 | 2,0 | Fork | ítem 15 |
| Tags y despliegues | Datos | 2×2/2 | 2,0 | DORA | hecho en #68 |
| Comparar dos ramas | Análisis | 2×2/2 | 2,0 | gitk | ítem 20 |
| Bitbucket Cloud | Fuentes | 2×2/2 | 2,0 | Sourcetree | ítem 22 |
| Extensión de VS Code | Plataformas | 3×2/3 | 2,0 | GitLens | ítem 24 |
| Filtrar el grafo por ruta de archivo | Análisis | 2×2/2 | 2,0 | gitk | ítem 29 |
| Los forks en el grafo | Datos | 2×2/2 | 2,0 | Red de ramas de GitHub | ítem 30 |
| Ensayar un comando sobre el repo real | Público | 2×3/3 | 2,0 | git-sim | ítem 31 |
| GitHub Enterprise Server | Fuentes | 1×3/2 | 1,5 | GitKraken (plan Advanced) | ítem 13 |
| Vista de texto accesible | Público | 1×3/2 | 1,5 | (accesibilidad) | hecho en #69 |
| Vista de texto, segunda entrega | Público | 1×2/2 | 1,0 | (accesibilidad) | ítem 33 |
| Una organización entera, tercera entrega | Escala | 2×2/3 | 1,3 | Red de ramas de GitHub | ítem 26 |
| Gitea, Forgejo y Codeberg | Fuentes | 1×2/2 | 1,0 | GitLens (autolinks) | ítem 21 |
| GitLab propio | Fuentes | 1×2/2 | 1,0 | GitKraken (plan Advanced) | ítem 25 |
| Ramas apiladas (un PR sobre otro) | Datos | 1×2/2 | 1,0 | GitButler | ítem 32 |

## Públicos

- **Quien enseña o aprende Git:** Learn Git Branching y git-sim muestran que la demanda existe y que
  funciona en el navegador; nadie lo hace sobre un grafo en vivo y en 40 idiomas (ítems 16 y 18).
- **Quien transmite mientras programa:** no hay una capa de OBS lista para la actividad de GitHub
  (ítem 11).
- **Equipos:** miden con DORA y miran Pulse; los clientes de escritorio cobran los choques entre ramas y
  la vista de PRs por estado (ítems 9, 12, 14 y 23).
- **Quien usa lector de pantalla:** ninguna de las herramientas revisadas dice nada de accesibilidad en
  su portada (ítem 18).
