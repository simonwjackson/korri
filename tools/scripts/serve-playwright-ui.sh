#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

PORTAL_PORT="${PORTAL_PORT:-3000}"
API_PORT="${API_PORT:-3001}"
PW_PORT="${PW_PORT:-9876}"
APP_HOST="${APP_HOST:-localhost}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_TEST_BASE_URL:-http://${APP_HOST}:${PORTAL_PORT}}"

find_free_port() {
  bun -e 'const net = require("node:net"); const server = net.createServer(); server.listen(0, "127.0.0.1", () => { process.stdout.write(String(server.address().port) + "\n"); server.close(); });'
}

PW_INTERNAL_PORT="${PW_INTERNAL_PORT:-$(find_free_port)}"
CADDY_STATE_DIR="${CADDY_STATE_DIR:-${REPO_ROOT}/out/tmp/caddy-playwright-$$}"

mkdir -p "${CADDY_STATE_DIR}/data" "${CADDY_STATE_DIR}/config"

PLAYWRIGHT_PID=""
CADDY_PID=""
CLEANED_UP=false

cleanup() {
  if [[ "${CLEANED_UP}" == "true" ]]; then
    return 0
  fi
  CLEANED_UP=true

  if [[ -n "${PLAYWRIGHT_PID}" ]] && kill -0 "${PLAYWRIGHT_PID}" 2>/dev/null; then
    kill "${PLAYWRIGHT_PID}" 2>/dev/null || true
  fi

  if [[ -n "${CADDY_PID}" ]] && kill -0 "${CADDY_PID}" 2>/dev/null; then
    kill "${CADDY_PID}" 2>/dev/null || true
  fi

  wait "${PLAYWRIGHT_PID}" 2>/dev/null || true
  wait "${CADDY_PID}" 2>/dev/null || true
  rm -rf "${CADDY_STATE_DIR}"
}
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap cleanup EXIT

if ! command -v caddy >/dev/null 2>&1; then
  echo "caddy not found. Enter the Nix dev shell: nix develop" >&2
  exit 1
fi

bun run "${REPO_ROOT}/tools/scripts/generate-bdd-playwright-tests.ts"

echo "Playwright UI: https://${APP_HOST}:${PW_PORT}"
echo "  internal Playwright: http://127.0.0.1:${PW_INTERNAL_PORT}"
echo "  ephemeral Caddy state: ${CADDY_STATE_DIR}"
echo ""

(
  cd "${REPO_ROOT}"
  PLAYWRIGHT_USE_EXISTING_STACK=true \
    PLAYWRIGHT_TEST_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
    KORRI_PORT_PORTAL="${PORTAL_PORT}" \
    KORRI_PORT_API="${API_PORT}" \
    playwright test \
      --config tools/playwright/playwright.e2e.config.ts \
      --ui-host=127.0.0.1 \
      --ui-port="${PW_INTERNAL_PORT}" \
      "$@"
) &
PLAYWRIGHT_PID=$!

(
  cat <<CADDYEOF | XDG_DATA_HOME="${CADDY_STATE_DIR}/data" \
    XDG_CONFIG_HOME="${CADDY_STATE_DIR}/config" \
    caddy run --adapter caddyfile --config -
{
  auto_https disable_redirects
}

https://${APP_HOST}:${PW_PORT}, https://localhost:${PW_PORT}, https://127.0.0.1:${PW_PORT} {
  tls internal
  reverse_proxy 127.0.0.1:${PW_INTERNAL_PORT}
}
CADDYEOF
) &
CADDY_PID=$!

wait -n "${PLAYWRIGHT_PID}" "${CADDY_PID}"
