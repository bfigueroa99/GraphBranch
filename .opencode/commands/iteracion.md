---
description: Una iteración del loop de mejora, como la Routine pero en OpenCode (node tools/opencode.mjs)
---
El prompt de la Routine, tal cual está en `.claude/skills/iteracion/PROMPT.md`:

!`cat .claude/skills/iteracion/PROMPT.md`

Corrés en OpenCode (lo lanza `node tools/opencode.mjs`, normalmente con un modelo detrás de OmniRoute), no en Claude Code. `CLAUDE.md`, la directiva de `IMPROVEMENTS.md`, la skill y la puerta mandan igual; cambian solo las herramientas:

- **La skill**: con la herramienta `skill` (`iteracion`) o leyendo `.claude/skills/iteracion/SKILL.md`. La arena, find-skills y las del pack Replica se leen por ruta, como dice la skill; la CLI de find-skills (`npx skills@1.7.4`) corre con `bash`, igual que en Claude Code.
- **GitHub**: no hay MCP de GitHub; cada `mcp__github__*` de la skill se hace con `gh`. Si `gh auth status` falla, no hay cómo abrir ni fusionar: la rama queda empujada y el resumen lo dice.
  - `create_pull_request` → `gh pr create --base dev --head loop/N --title "<título>" --body-file <archivo>`; P es el número de la URL que imprime. Nunca `--base master`: `master` es el release y lo promueve Benjamin.
  - `merge_pull_request` (`merge_method: merge`, `commit_title: "<título> (#P)"`) → `gh pr merge P --merge --subject "<título> (#P)" --body ""`. Nunca `--squash` ni `--rebase`.
  - `update_pull_request` con `state: closed` y su comentario → `gh pr close P --comment "<comentario>"`.
  - `list_pull_requests` (head `loop/N`, state `open`) → `gh pr list --head loop/N --state open --json number,url`.
- **La Routine**: `mcp__claude-code-remote__list_triggers` y `get_trigger` no existen acá; ese control se salta y el resumen dice «Routine: sin herramientas para compararla (OpenCode)». Este disparo lo programó Benjamin; no crees otro.
- **Subagentes** (la arena y sus jueces): la herramienta `task` con `subagent_type: "general"`. Sin ella, la arena no aplica y se dice, como prevé la skill.
- **Web**: `webfetch` sí; `websearch` solo si OpenCode la trae activada. Sin búsqueda, se dice en la bitácora, como prevé la skill.
- **Comandos largos**: la herramienta `bash` corta a los 2 minutos; a `npm run check` pasale `timeout: 1800000`.
- **Temporales**: en `/tmp/opencode` o en un `mktemp -d`, nunca dentro del repo.
- **Commits y PR**: sin las líneas de Claude Code (`Co-Authored-By: Claude…`, `Claude-Session: …`); el autor de los commits ya lo pone `tools/opencode.mjs`. El cuerpo del PR termina con «Generado con OpenCode (<modelo>)», con el modelo que da `echo "$LOOP_MODELO"`.
