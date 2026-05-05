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

  cat > "$tmpdir/korri-electrobun-control-lib" <<'REMOTE_SCRIPT'
# shellcheck shell=bash

korri_wayland_env() {
  local project="${ODIN_PROJECT:-/storage/korri}"
  if [ -f "$project/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$project/.env"
    set +a
  fi

  export DISPLAY="${DISPLAY:-:0}"
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/run/0-runtime-dir}"
  export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
  export SWAYSOCK="${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.0.sock}"
  export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"
}

korri_electrobun_pids() {
  local p pid exe
  for p in /proc/[0-9]*; do
    [ -r "$p/exe" ] || continue
    pid="${p##*/}"
    exe="$(readlink "$p/exe" 2>/dev/null || true)"
    case "$exe" in
      */share/korri-desktop/*/Korri-dev/bin/launcher|*/share/korri-desktop/*/Korri-dev/bin/bun)
        printf '%s\n' "$pid"
        ;;
    esac
  done
}

korri_stop_electrobun() {
  local pids alive pid
  pids="$(korri_electrobun_pids | tr '\n' ' ')"
  [ -n "${pids// }" ] || return 0

  kill -TERM $pids 2>/dev/null || true
  for _ in $(seq 1 30); do
    alive=""
    for pid in $pids; do
      [ -d "/proc/$pid" ] && alive="$alive $pid"
    done
    [ -z "$alive" ] && return 0
    sleep 0.1
  done

  kill -KILL $alive 2>/dev/null || true
}

korri_start_electrobun() {
  korri_wayland_env
  local app="${KORRI_ELECTROBUN_APP:-korri-desktop-odin}"
  local log="${KORRI_ELECTROBUN_LOG:-/storage/korri-electrobun-profile-hermetic.log}"

  : > "$log"
  nohup "$app" >> "$log" 2>&1 &
  echo $! > /storage/korri-electrobun-profile-hermetic.pid
}

korri_restart_electrobun() {
  korri_stop_electrobun
  sleep 0.5
  korri_start_electrobun
}
REMOTE_SCRIPT

  cat > "$tmpdir/korri-kill-active-application" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source /storage/bin/korri-electrobun-control-lib
korri_wayland_env

log() { printf '%s [korri-active-app] %s\n' "$(date -Is)" "$*" >&2; }

focused_json="$({ swaymsg -t get_tree 2>/dev/null || true; } | /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
if (!raw.trim()) process.exit(2)
const tree = JSON.parse(raw)
let focused
function walk(node) {
  if (node.focused) focused = node
  for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) walk(child)
}
walk(tree)
if (!focused) process.exit(3)
console.log(JSON.stringify({
  pid: focused.pid ?? null,
  name: focused.name ?? null,
  appId: focused.app_id ?? null,
  windowClass: focused.window_properties?.class ?? null,
}))
' 2>/dev/null || true)"

if [ -z "$focused_json" ]; then
  log "no focused sway window found"
  exit 0
fi

pid="$(printf '%s' "$focused_json" | /storage/bin/bun -e 'const f=JSON.parse(await new Response(Bun.stdin.stream()).text()); if (f.pid) console.log(f.pid)' 2>/dev/null || true)"
name="$(printf '%s' "$focused_json" | /storage/bin/bun -e 'const f=JSON.parse(await new Response(Bun.stdin.stream()).text()); if (f.name) console.log(f.name)' 2>/dev/null || true)"
window_class="$(printf '%s' "$focused_json" | /storage/bin/bun -e 'const f=JSON.parse(await new Response(Bun.stdin.stream()).text()); if (f.windowClass) console.log(f.windowClass)' 2>/dev/null || true)"
exe=""
if [ -n "$pid" ] && [ -r "/proc/$pid/exe" ]; then
  exe="$(readlink "/proc/$pid/exe" 2>/dev/null || true)"
fi

case "$exe $window_class $name" in
  *'/share/korri-desktop/'*'/Korri-dev/bin/bun'*|*'ElectrobunKitchenSink-dev'*|*' Korri')
    log "focused app is Korri Electrobun; restarting"
    korri_restart_electrobun
    exit 0
    ;;
esac

if [ -z "$pid" ]; then
  log "focused window has no pid: $focused_json"
  exit 0
fi

log "killing focused app pid=$pid name=$name class=$window_class exe=$exe"
kill -TERM "$pid" 2>/dev/null || true
for _ in $(seq 1 30); do
  [ ! -d "/proc/$pid" ] && exit 0
  sleep 0.1
done
kill -KILL "$pid" 2>/dev/null || true
REMOTE_SCRIPT

  chmod 0755 "$tmpdir/korri-session-toggle" "$tmpdir/korri-kill-active-application"
  chmod 0644 "$tmpdir/korri-electrobun-control-lib"

  log "Installing session/input action commands on $ODIN_HOST:/storage/bin"
  ssh_odin 'mkdir -p /storage/bin'
  scp_odin \
    "$tmpdir/korri-session-toggle" \
    "$tmpdir/korri-electrobun-control-lib" \
    "$tmpdir/korri-kill-active-application" \
    "$ODIN_HOST:/storage/bin/"

  ssh_odin "KORRI_SESSIOND_URL='$KORRI_SESSIOND_URL' KORRI_SESSIOND_TOKEN_FILE='$KORRI_SESSIOND_TOKEN_FILE' bash -s" <<'REMOTE'
set -euo pipefail
chmod 0755 /storage/bin/korri-session-toggle /storage/bin/korri-kill-active-application
chmod 0644 /storage/bin/korri-electrobun-control-lib
legacy_pids=""
for p in /proc/[0-9]*; do
  [ -r "$p/exe" ] || continue
  pid="${p##*/}"
  exe="$(readlink "$p/exe" 2>/dev/null || true)"
  [ "$exe" = "/storage/bin/korri-toggle-daemon" ] && legacy_pids="$legacy_pids $pid"
done
[ -z "$legacy_pids" ] || kill -TERM $legacy_pids 2>/dev/null || true
rm -f /storage/bin/korri-toggle-daemon /storage/bin/korri-go-chromium /storage/korri-toggle-daemon.pid
bash -n /storage/bin/korri-session-toggle
bash -n /storage/bin/korri-kill-active-application
/storage/bin/korri-session-toggle status || true
REMOTE

  log "Installed. Button chords are handled by korri-inputd; session lifecycle is handled by korri-sessiond."
}

remove_toggle() {
  log "Removing session toggle command and legacy toggle daemon from $ODIN_HOST"
  ssh_odin 'bash -s' <<'REMOTE'
set -euo pipefail
legacy_pids=""
for p in /proc/[0-9]*; do
  [ -r "$p/exe" ] || continue
  pid="${p##*/}"
  exe="$(readlink "$p/exe" 2>/dev/null || true)"
  [ "$exe" = "/storage/bin/korri-toggle-daemon" ] && legacy_pids="$legacy_pids $pid"
done
[ -z "$legacy_pids" ] || kill -TERM $legacy_pids 2>/dev/null || true
rm -f /storage/bin/korri-session-toggle /storage/bin/korri-electrobun-control-lib /storage/bin/korri-kill-active-application /storage/bin/korri-go-chromium /storage/bin/korri-toggle-daemon /storage/korri-toggle-daemon.pid
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
