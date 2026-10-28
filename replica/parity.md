## Parity: 75.0 / 100

features 75.0  (38 counted, must-haves 11 of 13 done)

Not shippable yet: 2 must-have features are not done.

## By area, weakest first
- navegación                     0.0  (1 features)
- cuentas                        0.0  (1 features)
- launchpad                     30.0  (3 features)
- diffs                         70.0  (5 features)
- grafo                         75.0  (8 features)
- varios repos                  75.0  (3 features)
- integraciones                 78.9  (7 features)
- pull requests                 83.3  (3 features)
- búsqueda                     100.0  (1 features)
- ci                           100.0  (1 features)
- análisis                     100.0  (1 features)
- conflictos                   100.0  (1 features)
- interfaz                     100.0  (2 features)
- compartir                    100.0  (1 features)

## Missing, in build order
- [must] integraciones: Azure DevOps, no  (no hay fuente de Azure DevOps)
- [must] launchpad: Launchpad: PRs de varios repos agrupados por estado, partial  (la salud agrupa por estado los PRs de un repo y «Todos» muestra cada repo en su tarjeta; falta una lista única de los PRs de todos los repos seguidos por estado)
- [should] cuentas: Varios perfiles o cuentas, no  (un token por servicio)
- [should] diffs: Blame de un archivo (autor y fecha por línea), no
- [should] grafo: Ocultar una rama o dejarla sola en el grafo, no  (hay Fijar ramas (las sube) y el filtro por autor; no ocultar ni dejar sola una rama elegida)
- [should] diffs: Historial de un archivo, partial  (el filtro por ruta (?path=) deja los commits que la tocaron; no hay una vista del historial de un archivo)
- [should] grafo: Columnas de autor fecha y SHA a la vista en el grafo, partial  (autor fecha y SHA están en la ficha del commit y en la vista de texto; el grafo no tiene columnas)
- [should] grafo: Resaltar los commits de una rama y atenuar el resto, partial  (comparar dos ramas resalta sus tramos y el filtro por autor o ruta atenúa; no al pasar el puntero por una rama)
- [should] integraciones: Issues de rastreadores (Jira Trello GitHub Issues), partial  (issues de GitHub GitLab Codeberg y Bitbucket en el panel de actividad y la salud; sin Jira ni Trello)
- [should] pull requests: Vista de un PR (descripción comentarios revisores checks), partial  (la ficha de la rama dice su PR y sus checks y enlaza al servicio; sin descripción ni comentarios)
- [should] varios repos: Pestañas por repo con alias, partial  (pestañas por repo, sin alias)
- [could] launchpad: Launchpad: fijar y posponer PRs e issues, no
- [could] launchpad: Launchpad: vista de equipo filtrada por colaborador, no
- [could] navegación: Paleta de comandos, no  (atajos de teclado sí; no hay paleta de comandos)
- [could] grafo: Cargar más historia (límite de commits configurable), partial  (README: Repositorios con miles de ramas; el tope de commits por rama no se elige desde la interfaz)
- [could] varios repos: Workspaces compartidos con el equipo, partial  (se comparten por URL con sus repos; sin cuentas ni nube (lo que no cambia))

## Left out on purpose (not scored)
- Crear un PR desde la app: GraphBranch mira repos: no abre PRs (Replica en la directiva)
- Fusionar un PR desde la app: GraphBranch mira repos: no fusiona PRs
- Sugerir cambios en un PR: revisar código es del servicio; GraphBranch no escribe en los PRs
- Fetch y pull de varios repos a la vez: opera sobre clones locales; GraphBranch no los modifica
- Herramienta de merge para resolver conflictos: escribe en el repo; GraphBranch lo mira
- Team View: qué cambian los compañeros sin commitear: necesita un agente en cada máquina; GraphBranch solo ve lo publicado
- Commit stage push pull y fetch: GraphBranch mira el repo y no opera un clon (Replica en la directiva); la práctica de git las simula y solo «Editar el código» hace un commit, por la API y a pedido
- Rebase interactivo cherry-pick y stash: igual que el commit: se practican en la terminal de práctica, no sobre el repo real
- Worktrees y submódulos: son del clon local
- Mensajes de commit y de PR con IA: sin servicios externos ni telemetría (lo que no cambia)
- Sesiones de agentes de código: GraphBranch no corre agentes; arma el prompt del loop autónomo

## Yours, not in the original (not scored)
- Vista 3D y modo galaxias
- Replay de la historia y video
- Widget embebible y capa para streaming
- Web sin instalar ni cuenta y gratis
- Vista de texto para lector de pantalla
- Práctica de git en el navegador
- Bitácora en vivo y resumen de la semana
- Mostrar solo el primer padre en el grafo
- Ver de un vistazo en qué trabaja cada uno
- Varias cuentas del mismo servicio
