#!/usr/bin/env bash
# Iteration loop: rsync project to the Odin, restart the API as a
# detached `setsid` background process on the device (logs to
# /storage/korri-api.log), and start the local Vite dev server pointed
# directly at the Odin API over Tailscale.
#
# Ctrl-C stops local Vite. The remote API process survives because it's
# in its own session with no controlling terminal.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
ODIN_PROJECT="${ODIN_PROJECT:-/storage/korri}"
ODIN_API_PORT="${ODIN_API_PORT:-3001}"
PORTAL_PORT="${PORTAL_PORT:-3000}"
REMOTE_LOG="/storage/korri-api.log"

HERE="$(cd "$(dirname "$0")" && pwd)"

log()  { printf '\033[0;36m[odin-dev]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[odin-dev]\033[0m %s\n' "$*" >&2; exit 1; }

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
  fail "Local port $PORTAL_PORT is already in use. Set PORTAL_PORT to a free port (e.g. \`PORTAL_PORT=3100 just dev-odin\`)."
fi

ODIN_API_BASE_URL="${ODIN_API_BASE_URL:-http://$(ssh_host_from_target "$ODIN_HOST"):$ODIN_API_PORT}"

# Refuse to start if bootstrap hasn't run.
ssh -o ConnectTimeout=5 -o BatchMode=yes "$ODIN_HOST" "test -x /storage/bin/bun && test -f '$ODIN_PROJECT/.env'" \
  || fail "Device not bootstrapped (missing /storage/bin/bun or $ODIN_PROJECT/.env). Run: just bootstrap-odin"

log "Syncing project..."
"$HERE/odin-sync.sh"

log "Restarting remote API process (logs: $REMOTE_LOG)..."
ssh "$ODIN_HOST" "ODIN_PROJECT='$ODIN_PROJECT' PORT='$ODIN_API_PORT' bash -s" <<REMOTE_SH
set -euo pipefail
pkill -f 'bun run tools/http/server.ts' 2>/dev/null || true
# Briefly let the old listener release the port.
for _ in 1 2 3 4 5; do
  if ! (echo > /dev/tcp/127.0.0.1/$ODIN_API_PORT) >/dev/null 2>&1; then break; fi
  sleep 0.2
done
: > '$REMOTE_LOG'
setsid bash -c "exec '$ODIN_PROJECT/tools/scripts/odin-run-api.sh' >> '$REMOTE_LOG' 2>&1 < /dev/null" &
disown || true
REMOTE_SH

# Wait for the API to come up directly over the reachable device address.
log "Waiting for API health on $ODIN_API_BASE_URL/api/health..."
ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 1 "$ODIN_API_BASE_URL/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" != "1" ]; then
  log "API never responded. Last 60 lines of $REMOTE_LOG:"
  ssh "$ODIN_HOST" "tail -60 '$REMOTE_LOG' 2>/dev/null" || true
  fail "API did not become ready at $ODIN_API_BASE_URL. Verify the Odin's Tailscale name/IP is in ODIN_HOST or set ODIN_API_BASE_URL explicitly."
fi

log "API ready. Renderer logs follow."
log "→ Renderer:  http://localhost:$PORTAL_PORT"
log "→ API target: $ODIN_API_BASE_URL"
log "→ Remote logs: ssh $ODIN_HOST tail -f $REMOTE_LOG"

KORRI_API_PROXY_TARGET="$ODIN_API_BASE_URL" \
  exec bun run vite --mode development --strictPort --host 0.0.0.0 --port "$PORTAL_PORT" --clearScreen false
