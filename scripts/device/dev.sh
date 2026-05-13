#!/usr/bin/env bash
# Iteration loop: rsync project to the Device, refresh device dependencies,
# restart the API as a detached `setsid` background process on the device
# (logs to /storage/.guest/korri/logs/api.log), reverse-forward the local Vite port to
# the Device, and start the same local services as `just dev` except for the
# API: Vite, Playwright UI, and Storybook.
#
# Ctrl-C stops local services and the reverse SSH tunnel. The remote API process
# survives because it's in its own session with no controlling terminal.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
DEVICE_APP_ROOT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
DEVICE_API_PORT="${DEVICE_API_PORT:-3001}"
DEVICE_INPUT_BRIDGE_PORT="${DEVICE_INPUT_BRIDGE_PORT:-3002}"
PORTAL_PORT="${PORTAL_PORT:-3100}"
PW_PORT="${PW_PORT:-9876}"
STORYBOOK_PORT="${STORYBOOK_PORT:-6006}"
APP_HOST="${APP_HOST:-localhost}"
REMOTE_LOG="/storage/.guest/korri/logs/api.log"
REMOTE_INPUTD_LOG="/storage/.guest/korri/logs/inputd.log"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

log()  { printf '\033[0;36m[device-dev]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[device-dev]\033[0m %s\n' "$*" >&2; exit 1; }

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"

ssh_device() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$DEVICE_HOST" "$@"
}

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

port_in_use() {
  local port="$1"
  # Bash's /dev/tcp can probe a listener; if it connects, the port is taken.
  (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

if port_in_use "$PORTAL_PORT"; then
  fail "Local port $PORTAL_PORT is already in use. Set PORTAL_PORT to a free port (e.g. \`PORTAL_PORT=3100 just dev-device\`)."
fi

DEVICE_HOST_NAME="$(ssh_host_from_target "$DEVICE_HOST")"
DEVICE_API_BASE_URL="${DEVICE_API_BASE_URL:-http://$DEVICE_HOST_NAME:$DEVICE_API_PORT}"
DEVICE_INPUT_BRIDGE_URL="${DEVICE_INPUT_BRIDGE_URL:-ws://$DEVICE_HOST_NAME:$DEVICE_INPUT_BRIDGE_PORT}"

# Refuse to start if install hasn't run.
ssh_device "test -x /storage/bin/bun && test -f '$DEVICE_APP_ROOT/.env'" \
  || fail "Device not installed (missing /storage/bin/bun or $DEVICE_APP_ROOT/.env). Run: just install-device"

log "Syncing project..."
"$HERE/sync.sh"

log "Refreshing remote dependencies..."
ssh_device "cd '$DEVICE_APP_ROOT' && /storage/bin/bun install"

log "Restarting remote API process (logs: $REMOTE_LOG)..."
ssh_device "DEVICE_APP_ROOT='$DEVICE_APP_ROOT' PORT='$DEVICE_API_PORT' KORRI_ENABLE_SESSIOND_LAUNCHER='${KORRI_ENABLE_SESSIOND_LAUNCHER:-0}' KORRI_SESSIOND_URL='${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}' KORRI_SESSIOND_TOKEN_FILE='${KORRI_SESSIOND_TOKEN_FILE:-/storage/.guest/korri/sessiond.token}' bash -s" <<REMOTE_SH
set -euo pipefail
pkill -f 'bun run tools/http/server.ts' 2>/dev/null || true
# Briefly let the old listener release the port.
for _ in 1 2 3 4 5; do
  if ! (echo > /dev/tcp/127.0.0.1/$DEVICE_API_PORT) >/dev/null 2>&1; then break; fi
  sleep 0.2
done
mkdir -p "$(dirname '$REMOTE_LOG')"
: > '$REMOTE_LOG'
setsid bash -c "exec '$DEVICE_APP_ROOT/scripts/device/run-api.sh' >> '$REMOTE_LOG' 2>&1 < /dev/null" &
disown || true
REMOTE_SH

log "Restarting remote input daemon process (logs: $REMOTE_INPUTD_LOG)..."
ssh_device "DEVICE_APP_ROOT='$DEVICE_APP_ROOT' KORRI_INPUT_BRIDGE_PORT='$DEVICE_INPUT_BRIDGE_PORT' bash -s" <<REMOTE_SH
set -euo pipefail
pkill -f 'bun run tools/device/input-bridge.ts' 2>/dev/null || true
pkill -f 'bun run tools/device/inputd.ts' 2>/dev/null || true
pkill -f '[k]orri-toggle-daemon' 2>/dev/null || true
# Briefly let the old listener release the port.
for _ in 1 2 3 4 5; do
  if ! (echo > /dev/tcp/127.0.0.1/$DEVICE_INPUT_BRIDGE_PORT) >/dev/null 2>&1; then break; fi
  sleep 0.2
done
mkdir -p "$(dirname '$REMOTE_INPUTD_LOG')"
: > '$REMOTE_INPUTD_LOG'
setsid bash -c "exec '$DEVICE_APP_ROOT/scripts/device/run-inputd.sh' >> '$REMOTE_INPUTD_LOG' 2>&1 < /dev/null" &
disown || true
REMOTE_SH

# Wait for the API to come up directly over the reachable device address.
log "Waiting for API health on $DEVICE_API_BASE_URL/api/health..."
ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 1 "$DEVICE_API_BASE_URL/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" != "1" ]; then
  log "API never responded. Last 60 lines of $REMOTE_LOG:"
  ssh_device "tail -60 '$REMOTE_LOG' 2>/dev/null" || true
  fail "API did not become ready at $DEVICE_API_BASE_URL. Verify the Device's Tailscale name/IP is in DEVICE_HOST or set DEVICE_API_BASE_URL explicitly."
fi

log "Waiting for Korri input daemon on $DEVICE_INPUT_BRIDGE_URL..."
ready=0
for _ in $(seq 1 30); do
  if ssh_device "(echo > /dev/tcp/127.0.0.1/$DEVICE_INPUT_BRIDGE_PORT) >/dev/null 2>&1"; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" != "1" ]; then
  log "Input daemon never responded. Last 60 lines of $REMOTE_INPUTD_LOG:"
  ssh_device "tail -60 '$REMOTE_INPUTD_LOG' 2>/dev/null" || true
  fail "Input daemon did not become ready at $DEVICE_INPUT_BRIDGE_URL."
fi

PROCFILE_DIR="$REPO_ROOT/out/tmp"
mkdir -p "$PROCFILE_DIR"
PROCFILE="$PROCFILE_DIR/Procfile.dev-device-$$"

log "Generating BDD Playwright wrappers..."
bun run "$REPO_ROOT/tools/scripts/generate-bdd-playwright-tests.ts"

cat > "$PROCFILE" <<PROCEOF
tunnel: ssh -N -o ExitOnForwardFailure=yes -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${DEVICE_SSH_OPTS:-} -R 127.0.0.1:${PORTAL_PORT}:127.0.0.1:${PORTAL_PORT} -L 127.0.0.1:${DEVICE_INPUT_BRIDGE_PORT}:127.0.0.1:${DEVICE_INPUT_BRIDGE_PORT} ${DEVICE_HOST}
web: cd '${REPO_ROOT}' && KORRI_API_PROXY_TARGET=${DEVICE_API_BASE_URL} VITE_KORRI_NATIVE_BRIDGE_URL=ws://127.0.0.1:${DEVICE_INPUT_BRIDGE_PORT} bun run vite --mode development --strictPort --host 127.0.0.1 --port ${PORTAL_PORT} --clearScreen false
playwright: cd '${REPO_ROOT}' && PORTAL_PORT=${PORTAL_PORT} API_PORT=${DEVICE_API_PORT} PW_PORT=${PW_PORT} APP_HOST=${APP_HOST} PLAYWRIGHT_TEST_BASE_URL=http://${APP_HOST}:${PORTAL_PORT} tools/scripts/serve-playwright-ui.sh
storybook: cd '${REPO_ROOT}' && bun x storybook dev -c korri/deploy/storybook -p ${STORYBOOK_PORT} --host 0.0.0.0 --no-open
PROCEOF

if command -v gum >/dev/null 2>&1; then
  gum style \
    --border rounded \
    --border-foreground 39 \
    --padding "0 1" \
    --bold \
    "  Web         http://${APP_HOST}:${PORTAL_PORT}" \
    "  Device Web    http://127.0.0.1:${PORTAL_PORT} forwarded on device" \
    "  Device API    ${DEVICE_API_BASE_URL}/api" \
    "  Device Input  ${DEVICE_INPUT_BRIDGE_URL}" \
    "  Playwright  https://${APP_HOST}:${PW_PORT}" \
    "  Storybook   http://${APP_HOST}:${STORYBOOK_PORT}"
else
  echo "Web         http://${APP_HOST}:${PORTAL_PORT}"
  echo "Device Web    http://127.0.0.1:${PORTAL_PORT} forwarded on device"
  echo "Device API    ${DEVICE_API_BASE_URL}/api"
  echo "Device Input  ${DEVICE_INPUT_BRIDGE_URL}"
  echo "Playwright  https://${APP_HOST}:${PW_PORT}"
  echo "Storybook   http://${APP_HOST}:${STORYBOOK_PORT}"
fi

echo ""
log "Starting reverse tunnel + Vite + Playwright UI + Storybook..."
log "Remote API logs: ssh $DEVICE_HOST tail -f $REMOTE_LOG"
log "Remote input daemon logs: ssh $DEVICE_HOST tail -f $REMOTE_INPUTD_LOG"
echo ""

exec hivemind "$PROCFILE"
