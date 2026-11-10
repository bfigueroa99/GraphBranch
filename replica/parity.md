## Parity: 93.3 / 100

features 93.3  (38 counted, must-haves 13 of 13 done)

## By area, weakest first
- cuentas                       50.0  (1 features)
- launchpad                     70.0  (3 features)
- grafo                         91.7  (8 features)
- varios repos                  91.7  (3 features)
- integraciones                 94.7  (7 features)
- búsqueda                     100.0  (1 features)
- navegación                   100.0  (1 features)
- diffs                        100.0  (5 features)
- pull requests                100.0  (3 features)
- ci                           100.0  (1 features)
- análisis                     100.0  (1 features)
- conflictos                   100.0  (1 features)
- interfaz                     100.0  (2 features)
- compartir                    100.0  (1 features)

## Missing, in build order
- [should] cuentas: Varios perfiles o cuentas, partial  (un token por servicio y una segunda cuenta de GitHub atada a un dueño (README, Token); faltan perfiles completos y más de dos cuentas)
- [should] grafo: Columnas de autor fecha y SHA a la vista en el grafo, partial  (SHA corto, autor y fecha junto a cada commit del grafo 2D con un interruptor (README: Búsqueda de commits); falta el 3D)
- [should] integraciones: Issues de rastreadores (Jira Trello GitHub Issues), partial  (issues de GitHub GitLab Codeberg y Bitbucket en el panel de actividad y la salud; sin Jira ni Trello)
- [could] launchpad: Launchpad: vista de equipo filtrada por colaborador, no
- [could] grafo: Cargar más historia (límite de commits configurable), partial  (README: Repositorios con miles de ramas; el tope de commits por rama no se elige desde la interfaz)
- [could] launchpad: Launchpad: fijar y posponer PRs e issues, partial  (README, «Todos a la vez»: el 📌 fija un PR arriba de su grupo y el 💤 lo pospone un día; faltan los issues (el Launchpad solo lista PRs))
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
