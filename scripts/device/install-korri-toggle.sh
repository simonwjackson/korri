#!/usr/bin/env bash
# Installer for the Device Korri <-> EmulationStation session-toggle command.
#
# Input chords are owned by korri-inputd. This script installs the
# /storage/bin/korri-* action commands used by those chords. Session commands
# delegate to korri-sessiond, which owns Electrobun, Sway reconciliation, and
# reversible essway masking.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}"
KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-/storage/.guest/korri/sessiond.token}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION_SCRIPT_DIR="$SCRIPT_DIR/bin"

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"

log() { printf '\033[0;36m[device-toggle-install]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[device-toggle-install]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_device() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$DEVICE_HOST" "$@"
}

scp_device() {
  scp \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$@"
}

device_known_hosts_name() {
  local target="$DEVICE_HOST"
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
  local scripts=(
    korri-session-toggle
    korri-electrobun-control-lib
    korri-kill-active-application
    korri-swap-screens
    korri-toggle-screen
    korri-toggle-bottom-keyboard
  )

  for script in "${scripts[@]}"; do
    [ -f "$ACTION_SCRIPT_DIR/$script" ] || fail "missing action script: $ACTION_SCRIPT_DIR/$script"
  done
  chmod 0755 "$ACTION_SCRIPT_DIR/korri-session-toggle" "$ACTION_SCRIPT_DIR/korri-kill-active-application" "$ACTION_SCRIPT_DIR/korri-swap-screens" "$ACTION_SCRIPT_DIR/korri-toggle-screen" "$ACTION_SCRIPT_DIR/korri-toggle-bottom-keyboard"
  chmod 0644 "$ACTION_SCRIPT_DIR/korri-electrobun-control-lib"

  log "Installing session/input action commands on $DEVICE_HOST:/storage/bin"
  ssh_device 'mkdir -p /storage/bin'
  scp_device \
    "$ACTION_SCRIPT_DIR/korri-session-toggle" \
    "$ACTION_SCRIPT_DIR/korri-electrobun-control-lib" \
    "$ACTION_SCRIPT_DIR/korri-kill-active-application" \
    "$ACTION_SCRIPT_DIR/korri-swap-screens" \
    "$ACTION_SCRIPT_DIR/korri-toggle-screen" \
    "$ACTION_SCRIPT_DIR/korri-toggle-bottom-keyboard" \
    "$DEVICE_HOST:/storage/bin/"

  ssh_device "KORRI_SESSIOND_URL='$KORRI_SESSIOND_URL' KORRI_SESSIOND_TOKEN_FILE='$KORRI_SESSIOND_TOKEN_FILE' bash -s" <<'REMOTE'
set -euo pipefail
chmod 0755 /storage/bin/korri-session-toggle /storage/bin/korri-kill-active-application /storage/bin/korri-swap-screens /storage/bin/korri-toggle-screen /storage/bin/korri-toggle-bottom-keyboard
chmod 0644 /storage/bin/korri-electrobun-control-lib
legacy_pids=""
for p in /proc/[0-9]*; do
  [ -r "$p/exe" ] || continue
  pid="${p##*/}"
  exe="$(readlink "$p/exe" 2>/dev/null || true)"
  [ "$exe" = "/storage/bin/korri-toggle-daemon" ] && legacy_pids="$legacy_pids $pid"
done
[ -z "$legacy_pids" ] || kill -TERM $legacy_pids 2>/dev/null || true
rm -f /storage/bin/korri-toggle-daemon /storage/bin/korri-go-chromium /storage/.guest/korri/run/toggle-daemon.pid
bash -n /storage/bin/korri-session-toggle
bash -n /storage/bin/korri-electrobun-control-lib
bash -n /storage/bin/korri-kill-active-application
bash -n /storage/bin/korri-swap-screens
bash -n /storage/bin/korri-toggle-screen
bash -n /storage/bin/korri-toggle-bottom-keyboard
/storage/bin/korri-session-toggle status || true
REMOTE

  log "Installed. Button chords are handled by korri-inputd; session lifecycle is handled by korri-sessiond."
}

remove_toggle() {
  log "Removing session toggle command and legacy toggle daemon from $DEVICE_HOST"
  ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail
legacy_pids=""
for p in /proc/[0-9]*; do
  [ -r "$p/exe" ] || continue
  pid="${p##*/}"
  exe="$(readlink "$p/exe" 2>/dev/null || true)"
  [ "$exe" = "/storage/bin/korri-toggle-daemon" ] && legacy_pids="$legacy_pids $pid"
done
[ -z "$legacy_pids" ] || kill -TERM $legacy_pids 2>/dev/null || true
rm -f /storage/bin/korri-session-toggle /storage/bin/korri-electrobun-control-lib /storage/bin/korri-kill-active-application /storage/bin/korri-swap-screens /storage/bin/korri-toggle-screen /storage/bin/korri-toggle-bottom-keyboard /storage/bin/korri-go-chromium /storage/bin/korri-toggle-daemon /storage/.guest/korri/run/toggle-daemon.pid
REMOTE
}

reset_host_key() {
  local host
  host="$(device_known_hosts_name)"
  log "Removing stale SSH known_hosts entries for $host"
  ssh-keygen -R "$host" >/dev/null 2>&1 || true
  ssh-keygen -R "[$host]:22" >/dev/null 2>&1 || true
  log "Done. Next install/status will learn the current key for $host."
}

case "${1:-install}" in
  install) install_toggle ;;
  remove) remove_toggle ;;
  status)
    ssh_device '/storage/bin/korri-session-toggle status 2>/dev/null || true; ps -ef | grep "[k]orri-toggle-daemon" || true'
    ;;
  reset-host-key) reset_host_key ;;
  *) echo "usage: $0 {install|remove|status|reset-host-key}" >&2; exit 64 ;;
esac
