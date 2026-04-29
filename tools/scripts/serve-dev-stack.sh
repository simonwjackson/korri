#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

PORTAL_PORT="${PORTAL_PORT:-3000}"
API_PORT="${API_PORT:-3001}"
PW_PORT="${PW_PORT:-9876}"
STORYBOOK_PORT="${STORYBOOK_PORT:-6006}"
APP_HOST="${APP_HOST:-localhost}"

PROCFILE_DIR="${REPO_ROOT}/out/tmp"
mkdir -p "${PROCFILE_DIR}"
PROCFILE="${PROCFILE_DIR}/Procfile.dev-$$"

cleanup() {
  rm -f "${PROCFILE}"
}
trap cleanup EXIT

bun run "${REPO_ROOT}/tools/scripts/generate-bdd-playwright-tests.ts"

cat > "${PROCFILE}" <<PROCEOF
web: cd '${REPO_ROOT}' && KORRI_API_PROXY_TARGET=http://localhost:${API_PORT} bun run vite --mode development --host 0.0.0.0 --port ${PORTAL_PORT} --clearScreen false
api: cd '${REPO_ROOT}' && PORT=${API_PORT} NODE_ENV=development bun x tsx --tsconfig tsconfig.server.json tools/http/server.ts
playwright: cd '${REPO_ROOT}' && PORTAL_PORT=${PORTAL_PORT} API_PORT=${API_PORT} PW_PORT=${PW_PORT} APP_HOST=${APP_HOST} PLAYWRIGHT_TEST_BASE_URL=http://${APP_HOST}:${PORTAL_PORT} tools/scripts/serve-playwright-ui.sh
storybook: cd '${REPO_ROOT}' && bun x storybook dev -c korri/deploy/storybook -p ${STORYBOOK_PORT} --host 0.0.0.0 --no-open
PROCEOF

if command -v gum >/dev/null 2>&1; then
  gum style \
    --border rounded \
    --border-foreground 39 \
    --padding "0 1" \
    --bold \
    "  Web         http://${APP_HOST}:${PORTAL_PORT}" \
    "  API         http://${APP_HOST}:${API_PORT}/api" \
    "  Playwright  https://${APP_HOST}:${PW_PORT}" \
    "  Storybook   http://${APP_HOST}:${STORYBOOK_PORT}"
else
  echo "Web         http://${APP_HOST}:${PORTAL_PORT}"
  echo "API         http://${APP_HOST}:${API_PORT}/api"
  echo "Playwright  https://${APP_HOST}:${PW_PORT}"
  echo "Storybook   http://${APP_HOST}:${STORYBOOK_PORT}"
fi

echo ""
echo "Starting Vite + Hono API + Playwright UI + Storybook..."
echo ""

exec hivemind "${PROCFILE}"
