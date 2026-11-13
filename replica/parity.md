## Parity: 97.0 / 100

features 97.0  (38 counted, must-haves 13 of 13 done)

## By area, weakest first
- cuentas                       50.0  (1 features)
- varios repos                  91.7  (3 features)
- integraciones                 94.7  (7 features)
- grafo                        100.0  (8 features)
- búsqueda                     100.0  (1 features)
- navegación                   100.0  (1 features)
- diffs                        100.0  (5 features)
- pull requests                100.0  (3 features)
- launchpad                    100.0  (3 features)
- ci                           100.0  (1 features)
- análisis                     100.0  (1 features)
- conflictos                   100.0  (1 features)
- interfaz                     100.0  (2 features)
- compartir                    100.0  (1 features)

## Missing, in build order
- [should] cuentas: Varios perfiles o cuentas, partial  (un token por servicio y hasta 5 cuentas más de GitHub, cada una atada a un dueño (README, Token); faltan perfiles completos (cada cuenta con sus repos seguidos))
- [should] integraciones: Issues de rastreadores (Jira Trello GitHub Issues), partial  (issues de GitHub GitLab Codeberg y Bitbucket en el panel de actividad y la salud; sin Jira ni Trello)
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
