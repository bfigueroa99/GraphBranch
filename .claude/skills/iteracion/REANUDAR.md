# Reanudar una iteración vencida

Parte de la skill `iteracion` (`.claude/skills/iteracion/SKILL.md`, paso 1). Se lee solo cuando `node
tools/loop.mjs --reclamar` sale **4**, `Vencida`: la rama `loop/N` lleva más de `RECLAMO_H` horas sin commits
(una sesión que murió o dejó su reclamo sin fusionar) y este disparo la releva. Su línea termina en `PR abierto:`
y lo que sigue decide:

- `PR abierto: <url>`: `git fetch origin loop/N && git checkout loop/N`, `git merge origin/dev` (los
  conflictos esperables, como en 5.2), la puerta (paso 3) y, si su entrada dice `Validado: pendiente` o
  `sin verde`, la línea nueva. En verde, se fusiona ese PR con commit de merge como la iteración N (paso 5) y
  se vuelve a `--reclamar` (la N+1). Si el commit del reclamo de `loop/N` nombra un `pedido <dueño/repo>#k`, al
  fusionar se cierra ese issue (`.claude/skills/iteracion/ISSUES.md`, punto 5). Una reanudación no es la iteración del disparo, y se sigue reanudando o
  construyendo hasta tener una propia fusionada, un 3 o el tiempo agotado (la 172, reanudada el 2026-10-31,
  se fusionó sola y dejó la 173 y la 174 con su PR abierto). Si solo fallan pasos ajenos e intermitentes,
  rige el paso 3 (la puerta repite sola su sección; si aun así no hay verde, una puerta más y, si tampoco,
  dejarlo abierto para el disparo siguiente). En rojo por el propio cambio, o con un merge que no se puede
  resolver: se cierra el PR con `mcp__github__update_pull_request` (`state: closed`, comentario «Cerrado por el
  loop: no pasó npm run check al reanudar; el trabajo queda en la rama»); si el merge quedó a medias,
  `git merge --abort`; y se releva con `node tools/loop.mjs --reclamar --relevo` (conserva lo de la rama en
  `loop/N-vencida-<sha>`).
- `PR abierto: ninguno`: no hay PR que cerrar; se releva directo con `--reclamar --relevo`.
- `PR abierto: no se pudo consultar (…)`: `mcp__github__list_pull_requests` (head `bfigueroa99:loop/N`, state
  `open`) y se sigue como `<url>` o como `ninguno`.
