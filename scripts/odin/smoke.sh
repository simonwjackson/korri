#!/usr/bin/env bash
# Smoke test the Odin API + native input stack end-to-end.
#
# 1. Verify Bun is installed on the device.
# 2. Hit /api/health directly over Tailscale.
# 3. Hit /api/rpc with `app.library.list` (delegated to the Bun TS sidecar
#    so the wire format stays in sync with @effect/rpc).
# 4. Subscribe to Korri inputd's native input endpoint, expect device frames,
#    and verify inactive clients do not receive standard input frames.
# 5. Print a summary.
#
# This is the equivalent of `just desktop-runtime-check` for the Odin loop.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
ODIN_API_PORT="${ODIN_API_PORT:-3001}"
ODIN_INPUT_BRIDGE_PORT="${ODIN_INPUT_BRIDGE_PORT:-3002}"

HERE="$(cd "$(dirname "$0")" && pwd)"

log()  { printf '\033[0;36m[odin-smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[odin-smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[odin-smoke]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_host_from_target() {
  local target="$1"
  target="${target##*@}"
  if [[ "$target" == \[*\]* ]]; then
    target="${target#\[}"
    target="${target%%\]*}"
  else
    target="${target%%:*}"
  fi
  printf '%s' "$target"
}

ODIN_HOST_NAME="$(ssh_host_from_target "$ODIN_HOST")"
ODIN_API_BASE_URL="${ODIN_API_BASE_URL:-http://$ODIN_HOST_NAME:$ODIN_API_PORT}"
ODIN_INPUT_BRIDGE_URL="${ODIN_INPUT_BRIDGE_URL:-ws://$ODIN_HOST_NAME:$ODIN_INPUT_BRIDGE_PORT}"

log "1/4 Verifying Bun on $ODIN_HOST..."
ssh -o ConnectTimeout=5 -o BatchMode=yes "$ODIN_HOST" \
  'test -x /storage/bin/bun && /storage/bin/bun --version' >/dev/null \
  || fail "Bun not installed at /storage/bin/bun. Run: just install-odin"
ok "  bun on PATH"

# Wait for remote /api/health directly.
log "Waiting for API health on $ODIN_API_BASE_URL/api/health..."
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 1 "$ODIN_API_BASE_URL/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" != "1" ]; then
  fail "API /api/health did not respond at $ODIN_API_BASE_URL. Is \`just dev-odin\` running, and does ODIN_HOST/ODIN_API_BASE_URL point at the Odin's Tailscale address?"
fi

log "2/4 Hitting /api/health..."
health="$(curl -fsS --max-time 5 "$ODIN_API_BASE_URL/api/health")"
case "$health" in
  *'"status":"ok"'*) ok "  $health" ;;
  *) fail "Unexpected /api/health response: $health" ;;
esac

log "3/4 Hitting /api/rpc app.library.list..."
LOCAL_BASE="$ODIN_API_BASE_URL" \
  bun run "$HERE/smoke-rpc.ts"

log "4/4 Checking Korri input daemon on $ODIN_INPUT_BRIDGE_URL..."
ODIN_INPUT_BRIDGE_URL="$ODIN_INPUT_BRIDGE_URL" \
  bun run "$HERE/smoke-input.ts"

if [ "${KORRI_SMOKE_SESSIOND:-0}" = "1" ]; then
  log "Checking supervised renderer sessiond..."
  "$HERE/smoke-sessiond.sh"
fi

ok "All checks passed."
