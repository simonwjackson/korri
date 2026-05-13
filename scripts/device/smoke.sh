#!/usr/bin/env bash
# Smoke test the Device API + native input stack end-to-end.
#
# 1. Verify Bun is installed on the device.
# 2. Hit /api/health directly over Tailscale.
# 3. Hit /api/rpc with `app.library.list` (delegated to the Bun TS sidecar
#    so the wire format stays in sync with @effect/rpc).
# 4. Subscribe to Korri inputd's native input endpoint and expect a gamepad.
# 5. Print a summary.
#
# This is the equivalent of `just desktop-runtime-check` for the Device loop.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
DEVICE_API_PORT="${DEVICE_API_PORT:-3001}"
DEVICE_INPUT_BRIDGE_PORT="${DEVICE_INPUT_BRIDGE_PORT:-3002}"

HERE="$(cd "$(dirname "$0")" && pwd)"

log()  { printf '\033[0;36m[device-smoke]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[device-smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[device-smoke]\033[0m %s\n' "$*" >&2; exit 1; }

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

DEVICE_HOST_NAME="$(ssh_host_from_target "$DEVICE_HOST")"
DEVICE_API_BASE_URL="${DEVICE_API_BASE_URL:-http://$DEVICE_HOST_NAME:$DEVICE_API_PORT}"
DEVICE_INPUT_BRIDGE_URL="${DEVICE_INPUT_BRIDGE_URL:-ws://$DEVICE_HOST_NAME:$DEVICE_INPUT_BRIDGE_PORT}"

log "1/4 Verifying Bun on $DEVICE_HOST..."
ssh -o ConnectTimeout=5 -o BatchMode=yes "$DEVICE_HOST" \
  'test -x /storage/bin/bun && /storage/bin/bun --version' >/dev/null \
  || fail "Bun not installed at /storage/bin/bun. Run: just install-device"
ok "  bun on PATH"

# Wait for remote /api/health directly.
log "Waiting for API health on $DEVICE_API_BASE_URL/api/health..."
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 1 "$DEVICE_API_BASE_URL/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" != "1" ]; then
  fail "API /api/health did not respond at $DEVICE_API_BASE_URL. Is \`just dev-device\` running, and does DEVICE_HOST/DEVICE_API_BASE_URL point at the Device's Tailscale address?"
fi

log "2/4 Hitting /api/health..."
health="$(curl -fsS --max-time 5 "$DEVICE_API_BASE_URL/api/health")"
case "$health" in
  *'"status":"ok"'*) ok "  $health" ;;
  *) fail "Unexpected /api/health response: $health" ;;
esac

log "3/4 Hitting /api/rpc app.library.list..."
LOCAL_BASE="$DEVICE_API_BASE_URL" \
  bun run "$HERE/smoke-rpc.ts"

log "4/4 Checking Korri input daemon on $DEVICE_INPUT_BRIDGE_URL..."
DEVICE_INPUT_BRIDGE_URL="$DEVICE_INPUT_BRIDGE_URL" \
  bun run "$HERE/smoke-input.ts"

if [ "${KORRI_SMOKE_SESSIOND:-0}" = "1" ]; then
  log "Checking supervised renderer sessiond..."
  "$HERE/smoke-sessiond.sh"
fi

ok "All checks passed."
