#!/usr/bin/env bash
# Installer for the Odin Korri <-> EmulationStation session-toggle command.
#
# Input chords are owned by korri-inputd. This script installs only
# /storage/bin/korri-session-toggle; the command delegates to korri-sessiond,
# which owns Chromium, Sway reconciliation, and reversible essway masking.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}"
KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-/storage/korri/sessiond.token}"

read -r -a SSH_EXTRA_OPTS <<< "${ODIN_SSH_OPTS:-}"

log() { printf '\033[0;36m[odin-toggle-install]\033[0m %s\n' "$*" >&2; }

ssh_odin() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$ODIN_HOST" "$@"
}

scp_odin() {
  scp \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$@"
}

odin_known_hosts_name() {
  local target="$ODIN_HOST"
  target="${target##*@}"
  if [[ "$target" == \[*\]* ]]; then
    target="${target#\[}"
    target="${target%%\]*}"
  else
    target="${target%%:*}"
  fi
  printf '%s\n' "$target"
}

install_toggle() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/korri-session-toggle" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}"
KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-/storage/korri/sessiond.token}"

log() { printf '%s [korri-session] %s\n' "$(date -Is)" "$*" >&2; }

token() {
  if [ ! -f "$KORRI_SESSIOND_TOKEN_FILE" ]; then
    log "sessiond token file missing: $KORRI_SESSIOND_TOKEN_FILE"
    exit 1
  fi
  tr -d '\n' < "$KORRI_SESSIOND_TOKEN_FILE"
}

post() {
  local path="$1"
  curl -fsS \
    -X POST \
    -H "x-korri-sessiond-token: $(token)" \
    "$KORRI_SESSIOND_URL$path"
}

status() {
  curl -fsS --max-time 2 "$KORRI_SESSIOND_URL/status" 2>/dev/null || echo '{"state":{"mode":"unknown"}}'
}

case "${1:-toggle}" in
  start)
    log "Starting supervised Korri Chromium session"
    post /control/start >/dev/null
    status
    ;;
  stop)
    log "Stopping supervised Korri Chromium session and restoring EmulationStation"
    post /control/stop >/dev/null
    status
    ;;
  toggle)
    current="$(status)"
    case "$current" in
      *'"mode":"home"'*|*'"mode":"starting"'*|*'"mode":"launching"'*|*'"mode":"game"'*|*'"mode":"restoring"'*|*'"mode":"recovering"'*)
        log "Korri appears active; stopping"
        post /control/stop >/dev/null
        ;;
      *)
        log "Korri appears stopped; starting"
        post /control/start >/dev/null
        ;;
    esac
    status
    ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|toggle|status}" >&2; exit 64 ;;
esac
REMOTE_SCRIPT

  chmod 0755 "$tmpdir/korri-session-toggle"

  log "Installing session toggle command on $ODIN_HOST:/storage/bin"
  ssh_odin 'mkdir -p /storage/bin'
  scp_odin "$tmpdir/korri-session-toggle" "$ODIN_HOST:/storage/bin/"

  ssh_odin "KORRI_SESSIOND_URL='$KORRI_SESSIOND_URL' KORRI_SESSIOND_TOKEN_FILE='$KORRI_SESSIOND_TOKEN_FILE' bash -s" <<'REMOTE'
set -euo pipefail
chmod 0755 /storage/bin/korri-session-toggle
pkill -f '[k]orri-toggle-daemon' 2>/dev/null || true
rm -f /storage/bin/korri-toggle-daemon /storage/korri-toggle-daemon.pid
bash -n /storage/bin/korri-session-toggle
/storage/bin/korri-session-toggle status || true
REMOTE

  log "Installed. Button chords are handled by korri-inputd; session lifecycle is handled by korri-sessiond."
}

remove_toggle() {
  log "Removing session toggle command and legacy toggle daemon from $ODIN_HOST"
  ssh_odin 'bash -s' <<'REMOTE'
set -euo pipefail
pkill -f '[k]orri-toggle-daemon' 2>/dev/null || true
rm -f /storage/bin/korri-session-toggle /storage/bin/korri-toggle-daemon /storage/korri-toggle-daemon.pid
REMOTE
}

reset_host_key() {
  local host
  host="$(odin_known_hosts_name)"
  log "Removing stale SSH known_hosts entries for $host"
  ssh-keygen -R "$host" >/dev/null 2>&1 || true
  ssh-keygen -R "[$host]:22" >/dev/null 2>&1 || true
  log "Done. Next install/status will learn the current key for $host."
}

case "${1:-install}" in
  install) install_toggle ;;
  remove) remove_toggle ;;
  status)
    ssh_odin '/storage/bin/korri-session-toggle status 2>/dev/null || true; ps -ef | grep "[k]orri-toggle-daemon" || true'
    ;;
  reset-host-key) reset_host_key ;;
  *) echo "usage: $0 {install|remove|status|reset-host-key}" >&2; exit 64 ;;
esac
