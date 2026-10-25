#!/bin/bash
# Deja listas las dependencias en las sesiones cloud de Claude Code para que `npm run check`
# funcione desde el primer minuto. En un PC no hace nada.
set -u
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" || exit 0
export ELECTRON_GET_USE_PROXY=1 GLOBAL_AGENT_HTTPS_PROXY="${HTTPS_PROXY:-}"
# la sesión cloud clona con --depth: sin la historia entera, `node tools/loop.mjs --check` (R3) no ve los PR
# viejos y --salud ve huecos que no existen
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  echo "=> git fetch --unshallow"; timeout 300 git fetch -q --unshallow origin || echo "git fetch --unshallow falló: --reclamar lo reintenta"
fi
if [ ! -x node_modules/.bin/playwright ]; then
  echo "=> npm ci"; npm ci --no-audit --no-fund --loglevel=error || echo "npm ci falló: npm run check lo dirá"
fi
if [ ! -x node_modules/electron/dist/electron ]; then
  echo "=> Electron"; node node_modules/electron/install.js || echo "Electron no disponible: npm run check lo dirá"
fi
echo "=> listo"
exit 0
