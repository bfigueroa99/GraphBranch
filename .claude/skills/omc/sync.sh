#!/usr/bin/env bash
# Vendoriza los agentes de oh-my-claudecode (OMC) que usa el loop, fijados a un tag.
#
#   bash .claude/skills/omc/sync.sh            # el tag de UPSTREAM (o el de abajo si no existe)
#   bash .claude/skills/omc/sync.sh v5.7.24    # sube de versión
#
# Por qué copiar y no declarar el plugin: una sesión cloud (las Routines del loop) no
# instala los plugins que el repo declara en .claude/settings.json, pero sí carga
# .claude/agents/ y .claude/skills/ del clon. Detalle en SKILL.md, «Por qué vendorizado».
#
# Qué hace: clona el tag, copia cada agente de AGENTES a .claude/agents/omc-<agente>.md
# con el nombre cambiado a omc-<agente> y el bloque <Adaptacion_Loop> antepuesto al
# cuerpo (el cuerpo de OMC queda textual, para que el próximo sync sea un diff limpio),
# y deja LICENSE y UPSTREAM junto a este script. Idempotente: con el mismo tag no cambia nada.
set -euo pipefail

REPO_URL="https://github.com/Yeachan-Heo/oh-my-claudecode.git"
TAG_POR_DEFECTO="v5.7.23"
AGENTES=(planner architect critic code-reviewer security-reviewer verifier tracer debugger test-engineer)

DIR_SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DIR_SKILL/../../.." && pwd)"
DIR_AGENTES="$RAIZ/.claude/agents"

TAG="${1:-}"
if [ -z "$TAG" ] && [ -f "$DIR_SKILL/UPSTREAM" ]; then
  TAG="$(sed -n 's/^tag: //p' "$DIR_SKILL/UPSTREAM")"
fi
TAG="${TAG:-$TAG_POR_DEFECTO}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -c advice.detachedHead=false clone -q --depth 1 --branch "$TAG" "$REPO_URL" "$TMP/omc"
SHA="$(git -C "$TMP/omc" rev-parse HEAD)"

mkdir -p "$DIR_AGENTES"
for a in "${AGENTES[@]}"; do
  src="$TMP/omc/agents/$a.md"
  [ -f "$src" ] || { echo "sync.sh: $TAG no trae agents/$a.md" >&2; exit 1; }
  # El frontmatter son las líneas entre el primer y el segundo '---'.
  fin="$(awk 'NR>1 && /^---$/ {print NR; exit}' "$src")"
  [ -n "$fin" ] || { echo "sync.sh: agents/$a.md sin frontmatter" >&2; exit 1; }
  {
    sed -n "1,${fin}p" "$src" | sed "s/^name: $a\$/name: omc-$a/"
    cat <<EOF

<!-- Vendorizado de oh-my-claudecode $TAG (agents/$a.md, commit ${SHA:0:12}), licencia MIT: ver .claude/skills/omc/LICENSE. No se edita a mano: lo regenera .claude/skills/omc/sync.sh. -->

<Adaptacion_Loop>
  Corres como subagente dentro del loop autónomo de este repositorio, sin el plugin oh-my-claudecode cargado. Este bloque manda sobre lo que diga el resto del prompt:
  - No hay una persona mirando: no entrevistes ni preguntes. Si falta un dato, declara el supuesto o déjalo como pregunta abierta en tu respuesta.
  - No existen las herramientas lsp_* ni ast_grep_*, ni los handoffs /oh-my-claudecode:* o Task(subagent_type="oh-my-claudecode:..."). Usa Grep, Glob, Read y los comandos de verificación que documenta el repositorio (CLAUDE.md y el protocolo del loop).
  - Tu entregable es tu mensaje final. No escribas en .omc/ ni edites archivos del repositorio salvo que el brief lo pida explícitamente.
  - Las reglas del repositorio (CLAUDE.md, el protocolo del loop) mandan sobre tus preferencias. Responde en el idioma del brief.
</Adaptacion_Loop>
EOF
    sed -n "$((fin + 1)),\$p" "$src"
  } > "$DIR_AGENTES/omc-$a.md"
done

cp "$TMP/omc/LICENSE" "$DIR_SKILL/LICENSE"
{
  echo "# oh-my-claudecode vendorizado por .claude/skills/omc/sync.sh"
  echo "repo: $REPO_URL"
  echo "tag: $TAG"
  echo "commit: $SHA"
  echo "agentes: ${AGENTES[*]}"
} > "$DIR_SKILL/UPSTREAM"

echo "omc: ${#AGENTES[@]} agentes de $TAG (${SHA:0:12}) en .claude/agents/omc-*.md"
