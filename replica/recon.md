# Mapa de reconocimiento: GitKraken Desktop (escritorio: Windows, macOS y Linux)

Tajada: el grafo de ramas y commits y lo que lo rodea para seguir un repo: ramas, pull requests, CI,
integraciones con los servicios de Git, búsqueda, filtros y varios repos a la vez (Workspaces y
Launchpad). Las operaciones sobre el clon local (commit, push, rebase, merge) se mapean solo para
marcarlas fuera de alcance.
Para: el público de `docs/investigacion.md`: devs y equipos que siguen un repo, quien enseña o aprende
Git, quien transmite y quien usa lector de pantalla.
Fecha: 2026-10-28

Solo fuentes públicas y sin iniciar sesión, leídas página por página con `WebFetch`; sin capturas
(`replica/screens/` no se versiona) ni código de la app. Lo que la página no dice queda como «no consta».

## Fuentes

| # | fuente | URL | notas |
| --- | --- | --- | --- |
| 1 | sitio (portada del cliente) | https://www.gitkraken.com/git-client | funciones por grupo: grafo, diffs, conflictos, IA, Launchpad, Workspaces, integraciones; enlaces a ayuda, precios y notas de versión |
| 2 | precios | https://www.gitkraken.com/pricing | Community (gratis: solo repos locales y públicos), Pro, Advanced, Business, Enterprise; los montos no salen en el texto de la página |
| 3 | centro de ayuda (índice) | https://help.gitkraken.com/gitkraken-client/gitkraken-client-home/ | secciones y artículos: interfaz, búsqueda, diffs, PRs, Workspaces, Launchpad, integraciones |
| 4 | ayuda: interfaz | https://help.gitkraken.com/gitkraken-desktop/interface/ | barra, panel izquierdo, grafo (columnas, filtro por autor), panel del commit, pestañas |
| 5 | ayuda: búsqueda | https://help.gitkraken.com/gitkraken-desktop/search/ | mensaje, SHA y autor; resalta el commit; 2000 commits por defecto |
| 6 | ayuda: diffs, historial y blame | https://help.gitkraken.com/gitkraken-desktop/diff/ | Hunk, Inline y Split; palabras; historial y blame de un archivo |
| 7 | ayuda: pull requests | https://help.gitkraken.com/gitkraken-desktop/pull-requests/ | crear, ver y fusionar; filtros; iconos de CI y revisión; PRs apilados |
| 8 | ayuda: Launchpad | https://help.gitkraken.com/gitkraken-desktop/gitkraken-launchpad/ | PRs, issues y WIPs de un Workspace; filtros; fijar y posponer; vista personal y de equipo |
| 9 | ayuda: Workspaces | https://help.gitkraken.com/gitkraken-desktop/workspaces/ | locales y en la nube; acciones sobre varios repos; Insights |
| 10 | ayuda: Conflict Prevention | https://help.gitkraken.com/gitkraken-desktop/conflict-prevention/ | aviso de choques con la rama destino y con el trabajo de otros (plan Pro) |
| 11 | ayuda: Team View | https://help.gitkraken.com/gitkraken-desktop/team-view/ | rama y cambios sin commitear de cada compañero (plan Advanced) |
| 12 | ayuda: Azure DevOps | https://help.gitkraken.com/gitkraken-desktop/azure-devops/ | clonar, PRs y revisores; OAuth o token personal; plan Pro |
| 13 | ayuda: GitHub Actions | https://help.gitkraken.com/gitkraken-desktop/github-actions/ | se quitó del panel izquierdo en la 11.10 |
| 14 | notas de versión | https://help.gitkraken.com/gitkraken-desktop/current/ | 12.6.1 (2026-10-20), 12.6.0 y 12.5.0 (2026-09-15): terminales, agentes, PRs apilados |

## Ciclo principal

Abrir un repo y leer su historia en el grafo (ramas, merges, PRs y su estado) para decidir qué hacer
con él; lo que se paga es lo privado, el Launchpad, los Workspaces en la nube y el aviso de choques.

## Pantallas

| ID | pantalla | ruta / cómo se llega | propósito | componentes clave | estados vistos |
| --- | --- | --- | --- | --- | --- |
| S01 | Grafo de commits | al abrir un repo (una pestaña por repo) | la historia: una fila por commit, el más nuevo arriba | columnas Rama/Tag, Grafo y Mensaje (más Autor, Fecha y SHA a elección), nodo WIP, filtro por autor | con repo, sin repo (casi todo oculto), búsqueda activa |
| S02 | Panel izquierdo | a la izquierda del grafo | referencias e integraciones | secciones Local, Remote, Pull Requests, Issues, Teams, Tags, Stashes, Submodules | secciones plegadas, maximizadas u ocultas; lista o agentes |
| S03 | Panel del commit | clic en un commit o en el WIP | archivos del commit y mensaje | sin preparar, preparados, mensaje (resumen y descripción) | commit, WIP |
| S04 | Diff de un archivo | clic en un archivo del panel del commit | qué cambió | Hunk, Inline y Split; palabras; minimapa; historial; blame | diff, vista de archivo con blame |
| S05 | Vista de un PR | desde el panel izquierdo o el Launchpad | detalle del PR | título, descripción, revisores, etiquetas, estado del build, comentarios | GitHub con más funciones que los demás |
| S06 | Launchpad | barra de estado o su pestaña | PRs, issues y WIPs de un Workspace | pestañas (PRs, Issues, WIPs, Todo), columna de estado, filtros, vistas guardadas | personal, equipo, pospuestos |
| S07 | Workspaces | su pestaña | agrupar repos y actuar sobre varios | lista con casillas, Fetch, Pull, Clone, Open | local, en la nube, compartido |
| S08 | Aviso de choques | icono de alerta al abrir la app | choques con la rama destino o con otros | archivos y líneas que se pisan, ramas | sin choques (con enlace a abrir un PR) |
| S09 | Team View | icono de equipo en la barra | qué cambia cada compañero | rama, archivos sin commitear, activo o ausente | sin equipo elegido |
| S10 | Búsqueda | barra de arriba a la derecha o paleta (Ctrl/⌘+P) | encontrar un commit | campo, resultados en vivo, resaltado en el grafo | sin resultados por el tope de commits cargados |
| S11 | Preferencias > Integraciones | menú de preferencias | conectar servicios | GitHub, GitLab, Bitbucket, Azure DevOps, Jira, Trello | OAuth, token personal |

## Flujos

```
F01 Leer la historia de un repo
    S01 (abrir el repo) -> S01 (clic en un commit) -> S03 -> S04
    clics del camino feliz: 3
    borde: más de 2000 commits (hay que subir el tope), repo privado en el plan gratis (no abre)

F02 Revisar qué PRs piden atención en varios repos
    S06 (Launchpad, Workspace elegido) -> S05 (un PR) -> navegador (checks)
    clics del camino feliz: 3
    borde: integración sin conectar, plan sin Launchpad de equipo, PR de un servicio con menos funciones

F03 Encontrar un commit
    S10 (escribir mensaje, SHA o autor) -> S01 (el commit resaltado) -> S03
    clics del camino feliz: 2
    borde: el commit está fuera de los cargados

F04 Ver si una rama va a chocar antes de fusionar
    S08 (alerta) -> archivos y líneas -> abrir un PR o compartir un parche
    clics del camino feliz: 2
    borde: sin otros miembros en la organización (solo compara con la rama destino)
```

## Componentes

| componente | variantes | estados | se usa en |
| --- | --- | --- | --- |
| Fila del grafo | commit, merge, WIP, rama fantasma | normal, al pasar (resalta la rama), elegida | S01 |
| Columna del grafo | Rama/Tag, Grafo, Mensaje, Autor, Fecha, SHA | visible u oculta, reordenable | S01 |
| Sección del panel | Local, Remote, PRs, Issues, Teams, Tags, Stashes, Submodules | plegada, maximizada, oculta | S02 |
| Icono de estado de PR | CI y revisión | pasa, pendiente, falla, cambios pedidos | S02, S05, S06 |
| Selector de diff | Hunk, Inline, Split | diff o archivo con blame | S04 |
| Pestaña de repo | con alias | activa, reordenada | todas |
| Filtro | autor, creador, asignado, etiquetas, hitos | guardado como vista | S01, S06 |

## Modelo de datos inferido

```
Repo        nombre, remotos (servicio), rama actual, pestaña (alias)
            evidencia: S01, S02, fuente 4 · confianza: alta
Commit      sha, mensaje (resumen y descripción), autor, fecha, padres, archivos
            evidencia: S01, S03, fuentes 4 y 5 · confianza: alta
Rama        nombre, local o remota, cabeza (commit), PR asociado
            evidencia: S02, fuente 4 · confianza: alta
PR          número, título, descripción, autor, revisores, etiquetas, estado de CI y de revisión, base, cabeza, apilado sobre otro PR
            evidencia: S05, fuente 7 · confianza: alta
Issue       servicio (Jira, GitHub, GitLab, Trello, Azure DevOps), creador, asignado, etiquetas, hito o sprint
            evidencia: S06, fuente 8 · confianza: media
Workspace   nombre, repos, local o en la nube, compartido con equipos
            evidencia: S07, fuente 9 · confianza: alta
Choque      archivos y líneas, ramas, miembro de la organización
            evidencia: S08, fuente 10 · confianza: media
```

Relaciones: Workspace 1-n Repo, Repo 1-n Rama, Rama 1-n Commit (por su cabeza), Rama 0-1 PR, PR 0-1 PR
(apilado), Workspace 1-n PR e Issue (Launchpad).

## Matriz de funciones

Ver `features.csv`. Must: 13, should: 18, could: 7, skip: 11 (de la referencia); 10 filas más son de
GraphBranch o de las reseñas (`original` en `no`). Paridad: `replica/parity.md`.

## Fuera de alcance (no se puede o no se debe copiar)

- Las operaciones sobre el clon local (commit, stage, push, pull, rebase, stash, worktrees, merge con
  conflictos): GraphBranch mira el repo; la práctica de git las simula y «Editar el código» hace un solo
  commit por la API, a pedido.
- Crear, revisar o fusionar PRs: es del servicio.
- Team View: necesita un agente en la máquina de cada compañero.
- IA y agentes: sin servicios externos ni telemetría.
- Las cuentas, la nube y los planes de GitKraken: GraphBranch no tiene cuentas propias.

## Tamaño

Pantallas 11, flujos 4, entidades 7. Lo difícil: la lista única de PRs de varios repos con su estado
(Launchpad), una fuente más (Azure DevOps, con su CORS) y el historial y el blame de un archivo sin gastar
la cuota. Tamaño: M para lo que falta de la tajada (dos must y ocho should), una capacidad por iteración.
