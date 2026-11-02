---
name: omc
description: Agentes y recetas de oh-my-claudecode (OMC) adaptados al loop desatendido — plan por consenso (planner, architect, critic), revisión en dos ejes (code-reviewer, security-reviewer), verificación con evidencia (verifier) y diagnóstico (tracer, debugger, test-engineer). Usar en los pasos del loop que la citan, o con /omc.
---

# OMC en el loop

[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC) es un plugin de orquestación multiagente para Claude Code. Este repo trae **sus agentes** fijados a una versión (`UPSTREAM`) y **sus recetas** de planificación, revisión y verificación reescritas para un loop que nadie mira. El protocolo del loop dice **en qué paso** se usa cada receta; esta skill dice **cómo**.

## Agentes

Viven en `.claude/agents/omc-*.md`. Los genera `sync.sh`: el cuerpo es el de OMC, textual, con un bloque `<Adaptacion_Loop>` delante (sin persona a quien preguntar, sin las herramientas del plugin, entregable = mensaje final).

| Agente | Para qué en el loop | Modelo | Escribe |
|---|---|---|---|
| `omc-planner` | Borrador del plan por consenso | opus | no (lo prohíbe el adaptador) |
| `omc-architect` | Antítesis y tensiones del plan; análisis de código | opus | no |
| `omc-critic` | Veredicto del plan: APPROVE / ITERATE / REJECT | opus | no |
| `omc-code-reviewer` | Revisión del diff con severidad | opus | no |
| `omc-security-reviewer` | Revisión de seguridad del diff | opus | no |
| `omc-verifier` | ¿La evidencia prueba cada criterio? | sonnet | no |
| `omc-tracer` | Causa de un fallo con hipótesis en competencia | sonnet | no, salvo que el brief lo pida |
| `omc-debugger` | Build o test roto con traza | sonnet | no, salvo que el brief lo pida |
| `omc-test-engineer` | El test que falla antes del arreglo | sonnet | no, salvo que el brief lo pida |

**Cómo se lanzan.** Con la herramienta Agent y `subagent_type: "omc-critic"` (o el que toque). Si ese tipo no existe en la sesión (una sesión con varios repos, OpenCode u otra herramienta que no lee `.claude/agents/`), lanza un agente `general-purpose` y pásale como prompt el cuerpo del archivo, desde `<Adaptacion_Loop>` hasta el final, seguido del brief. El resultado es el mismo; solo se pierde el bloqueo de Write/Edit, así que el brief dice «no edites archivos».

**El brief.** Rutas, el diff (`git diff origin/dev...HEAD`, o la base que use el loop) y salidas resumidas con su código de salida; nunca archivos enteros pegados. Siempre: la tarea, sus criterios de aceptación y qué reglas del repo aplican (CLAUDE.md y el protocolo del loop).

## Receta 1 · Plan por consenso (`ralplan` de OMC)

Cuándo: lo fija el protocolo del loop (tarea grande, varios módulos, algo difícil de deshacer). **Modo deliberado** obligatorio si toca autenticación o permisos, datos personales, migraciones o borrado de datos, algo destructivo, una API pública o un incidente en producción.

1. **`omc-planner`**: la tarea, el contexto del backlog y las reglas. Pide el plan (pasos, archivos), criterios de aceptación comprobables (comando y resultado esperado) y el resumen RALPLAN-DR: 3 a 5 principios, los 3 drivers de la decisión y al menos 2 opciones viables con pros y contras, o por qué las demás quedan descartadas. En modo deliberado, además: pre-mortem de 3 escenarios y plan de pruebas ampliado (unitarias, integración, e2e, observabilidad).
2. **`omc-architect` y `omc-critic` en paralelo**, los dos sobre el mismo plan copiado textual, sin que uno vea la respuesta del otro. Architect: la antítesis más fuerte, al menos una tensión real y la síntesis si la hay. Critic: veredicto APPROVE / ITERATE / REJECT con hallazgos CRITICAL / MAJOR / MINOR.
3. **Sin APPROVE**: el planner revisa con las dos devoluciones (solo él las combina) y vuelven architect y critic. **Máximo 2 rondas**: OMC permite 5 con alguien al teclado; aquí cada ronda la paga una iteración.
4. **Sin APPROVE tras 2 rondas**: achica la tarea a la parte aprobada o descártala con su motivo, como diga el protocolo del loop. Nunca ejecutes un plan con un CRITICAL abierto.
5. **Con APPROVE**, la aprobación de ejecución la da el protocolo del loop (en OMC la da una persona). Implementas tú, con las puertas del loop; no lances `ralph`, `team` ni `autopilot` para ejecutarlo.

## Receta 2 · Revisión en dos ejes (`omc-review`)

Cuándo: con el cambio terminado y la puerta del repo en verde, antes de abrir o mergear el PR.

- **Diff chico** (un tema, menos de ~150 líneas): un `omc-code-reviewer` con los dos ejes.
- **Diff grande**: dos `omc-code-reviewer` en paralelo, uno por eje, con un brief de menos de 400 palabras cada uno:
  - *Estándares*: el diff contra las normas escritas del repo (CLAUDE.md, el protocolo del loop, sus documentos de estándares). Lo que ya vigila una herramienta (lint, tests, chequeos del loop) se salta.
  - *Intención*: el diff contra lo que pedía la tarea. Requisitos que faltan o quedaron a medias, comportamiento que nadie pidió; cada hallazgo cita la línea de la tarea.
- **Además `omc-security-reviewer`** si el diff toca autenticación o permisos, entrada externa, secretos o credenciales, SQL, shell, rutas de archivos, red, deserialización, datos personales o dependencias nuevas.
- Los ejes se reportan por separado y no se re-rankean entre sí: un cambio puede cumplir uno y fallar el otro.

Qué hacer con lo que vuelve: **cada hallazgo se comprueba antes de actuar** (uno que no se reproduce es ruido). CRITICAL o HIGH confirmados se arreglan en esta iteración y se vuelve a correr la puerta; si no se puede, la iteración no mergea y queda registrado por qué. MEDIUM y LOW se arreglan si son baratos y del alcance; si no, van al backlog del loop con su evidencia. La revisión informa; **la puerta del repo es la que decide**.

## Receta 3 · Verificación con evidencia (`verify`)

Cuándo: con la puerta en verde, antes de declarar la tarea hecha (PR, registro, reporte final).

`omc-verifier` recibe los criterios de aceptación, los comandos que corriste con su salida resumida y código de salida, y el diff. Devuelve por criterio VERIFIED / PARTIAL / MISSING y un veredicto PASS / FAIL / INCOMPLETE. Con FAIL o INCOMPLETE la tarea no está hecha: completa la evidencia o rebaja lo que dicen el PR y el registro a lo que sí quedó probado. No reemplaza la puerta del repo: ataca el «está hecho» sin prueba.

## Receta 4 · Diagnóstico (`trace`, `debug`, `tdd`)

- **Una puerta falla y la causa no es obvia tras un intento**: `omc-tracer` con el síntoma, la salida del fallo y lo ya descartado. Devuelve hipótesis en competencia, la evidencia a favor y en contra de cada una, y la próxima sonda. Si es un build o un test roto con traza, `omc-debugger`.
- **Un bug que arreglar**: antes de tocar el código, `omc-test-engineer` propone el test que falla sin el arreglo. El loop lo escribe, lo ve fallar y recién entonces arregla.

## Lo que no se usa en el loop

`autopilot`, `ralph`, `team`, `ultragoal`, `self-improve`, `autoresearch`, `deep-interview`, `omc-setup`, `hud`, `release` y `pr`. El loop ya es la autoridad de bucle de la sesión (la guía de OMC pide una sola); los modos persistentes de OMC bloquean el fin del turno y los interactivos esperan a una persona que no está. Si una sesión trae el plugin completo cargado e inyecta avisos (HUD, setup, actualizaciones, «MAGIC KEYWORD»), se ignoran: aquí no se instala nada a mitad de iteración ni se escribe en `.omc/`.

## Presupuesto, fallas y registro

- **Por iteración, como máximo**: un plan por consenso (2 rondas), una revisión (3 agentes) y una verificación.
- **OMC nunca frena una iteración por sí mismo.** Si un agente falla, no existe o se queda sin cuota, sigue el camino que el loop tenía sin OMC y anótalo.
- **Registro**: una línea donde el protocolo del loop registra la iteración:
  `OMC: plan=APPROVE|ITERATE|REJECT|— · revisión=N hallazgos (M arreglados)|— · verificación=PASS|FAIL|INCOMPLETE|—`
  Con `OMC: no disponible (motivo)` si no se pudo usar.

## Por qué vendorizado y no el plugin

- **Una sesión cloud no instala los plugins que el repo declara** en `.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`), pero sí carga `.claude/agents/` y `.claude/skills/` del clon ([«What carries over from your setup»](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup)). Las Routines del loop son sesiones cloud: declarar el plugin no lo habría traído.
- **El plugin completo trae 21 hooks pensados para una persona al teclado.** Medido el 2026-10-31 con v5.7.23: su detector de palabras clave activa `autopilot` ante «end to end: corre las pruebas e2e», y su inyector de contexto metió 21 KB del README de Brunell_Node en la primera lectura de un archivo. En un loop desatendido eso es un modo persistente que nadie pidió y contexto que nadie eligió. Los agentes y las recetas son lo que sirve sin una persona; eso es lo que vive aquí.
- **Para usar el plugin entero a mano** en tu PC: `/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode` y después `/plugin install oh-my-claudecode`. No choca con esto: sus agentes se llaman `oh-my-claudecode:*` y estos `omc-*`. Para tenerlo en las sesiones cloud hay que habilitarlo en los ajustes administrados de la organización, que aplican a todos sus repos.

## Actualizar

`bash .claude/skills/omc/sync.sh v5.7.24` (o el tag que toque) regenera `.claude/agents/omc-*.md`, `LICENSE` y `UPSTREAM`. Lee el diff de los agentes antes de commitear: cambia cómo planifica, revisa y verifica cada iteración. Para sumar un agente, agrégalo a `AGENTES` en `sync.sh` y a la tabla de arriba.
