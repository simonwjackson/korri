#!/usr/bin/env bash
# Temporary/dev-only installer for the Odin Korri <-> EmulationStation toggle.
# Installs only to /storage/bin on the device; does not modify ROCKNIX-owned files.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
KORRI_URL="${KORRI_URL:-http://127.0.0.1:3100}"
KORRI_ENV="${KORRI_ENV:-/storage/korri/.env}"
KORRI_LOG="${KORRI_LOG:-/storage/chromium-korri.log}"
CHROMIUM_DIR="${CHROMIUM_DIR:-/storage/apps/chromium/squashfs-root}"

# Extra ssh/scp options if needed. The default path intentionally uses the
# stable Tailscale/MagicDNS host (root@sm8550), not a LAN IP alias.
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

KORRI_URL="${KORRI_URL:-http://127.0.0.1:3100}"
KORRI_ENV="${KORRI_ENV:-/storage/korri/.env}"
KORRI_LOG="${KORRI_LOG:-/storage/chromium-korri.log}"
CHROMIUM_DIR="${CHROMIUM_DIR:-/storage/apps/chromium/squashfs-root}"

log() { printf '%s [korri-session] %s\n' "$(date -Is)" "$*" >&2; }

korri_running() {
  pgrep -f "[u]ngoogled-chromium/chrome .*${KORRI_URL}" >/dev/null 2>&1 \
    || pgrep -f "[A]ppRun .*${KORRI_URL}" >/dev/null 2>&1
}

start_korri() {
  if korri_running; then
    log "Korri already running at ${KORRI_URL}"
    return 0
  fi

  log "Stopping EmulationStation/essway and launching Korri (${KORRI_URL})"
  systemctl mask --runtime essway.service >/dev/null 2>&1 || true
  systemctl stop essway.service >/dev/null 2>&1 || true
  pkill -f '^[e]mulationstation' 2>/dev/null || true

  : > "${KORRI_LOG}"
  setsid bash -c "
    set -euo pipefail
    if [ -f '${KORRI_ENV}' ]; then
      set -a
      . '${KORRI_ENV}'
      set +a
    fi
    cd '${CHROMIUM_DIR}'
    exec ./AppRun \
      --enable-features=UseOzonePlatform \
      --ozone-platform=wayland \
      --user-data-dir=/storage/apps/chromium/profile \
      --no-sandbox \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port=9222 \
      --kiosk '${KORRI_URL}' \
      >> '${KORRI_LOG}' 2>&1 < /dev/null
  " >/dev/null 2>&1 &

  log "Korri launch requested; log: ${KORRI_LOG}"
}

stop_korri() {
  log "Stopping Korri Chromium and restoring EmulationStation"
  pkill -f "[u]ngoogled-chromium/chrome .*${KORRI_URL}" 2>/dev/null || true
  pkill -f "[A]ppRun .*${KORRI_URL}" 2>/dev/null || true
  sleep 0.3
  systemctl unmask --runtime essway.service >/dev/null 2>&1 || true
  systemctl start essway.service >/dev/null 2>&1 || true
  log "EmulationStation restore requested"
}

status() {
  if korri_running; then
    echo "korri"
  elif pgrep -f '^[e]mulationstation' >/dev/null 2>&1; then
    echo "emulationstation"
  else
    echo "unknown"
  fi
}

toggle() {
  if korri_running; then
    stop_korri
  else
    start_korri
  fi
}

case "${1:-toggle}" in
  start) start_korri ;;
  stop) stop_korri ;;
  toggle) toggle ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|toggle|status}" >&2; exit 64 ;;
esac
REMOTE_SCRIPT

  cat > "$tmpdir/korri-toggle-daemon" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

LOG="${KORRI_TOGGLE_LOG:-/storage/korri-toggle-daemon.log}"
SESSION="${KORRI_SESSION_TOGGLE:-/storage/bin/korri-session-toggle}"

log() { printf '%s [korri-toggle] %s\n' "$(date -Is)" "$*" >> "$LOG"; }

find_gamepad_event() {
  for dev in /dev/input/event*; do
    [ -e "$dev" ] || continue
    name_path="/sys/class/input/${dev##*/}/device/name"
    [ -r "$name_path" ] || continue
    if [ "$(cat "$name_path")" = "Microsoft Xbox Series S|X Controller" ]; then
      printf '%s\n' "$dev"
      return 0
    fi
  done
  return 1
}

handle_stream() {
  local l3=0 r3=0 start=0 armed=1
  while IFS= read -r line; do
    case "$line" in
      *"(BTN_THUMBL),"*"value 1"*) l3=1 ;;
      *"(BTN_THUMBL),"*"value 0"*) l3=0; armed=1 ;;
      *"(BTN_THUMBR),"*"value 1"*) r3=1 ;;
      *"(BTN_THUMBR),"*"value 0"*) r3=0; armed=1 ;;
      *"(BTN_START),"*"value 1"*) start=1 ;;
      *"(BTN_START),"*"value 0"*) start=0; armed=1 ;;
    esac

    if [ "$l3" = 1 ] && [ "$r3" = 1 ] && [ "$start" = 1 ] && [ "$armed" = 1 ]; then
      armed=0
      log "Detected L3+R3+Start; toggling session"
      "$SESSION" toggle >> "$LOG" 2>&1 || log "toggle command failed"
    fi
  done
}

log "daemon starting; combo=L3+R3+Start"
while true; do
  event="$(find_gamepad_event || true)"
  if [ -z "$event" ]; then
    log "virtual Xbox controller not found; retrying"
    sleep 2
    continue
  fi

  log "watching $event"
  evtest "$event" 2>&1 | handle_stream || true
  log "evtest exited; retrying"
  sleep 1
done
REMOTE_SCRIPT

  chmod 0755 "$tmpdir/korri-session-toggle" "$tmpdir/korri-toggle-daemon"

  log "Installing temporary scripts on $ODIN_HOST:/storage/bin"
  ssh_odin 'mkdir -p /storage/bin'
  scp_odin "$tmpdir/korri-session-toggle" "$tmpdir/korri-toggle-daemon" "$ODIN_HOST:/storage/bin/"

  log "Restarting temporary toggle daemon"
  ssh_odin "KORRI_URL='$KORRI_URL' KORRI_ENV='$KORRI_ENV' KORRI_LOG='$KORRI_LOG' CHROMIUM_DIR='$CHROMIUM_DIR' bash -s" <<'REMOTE'
set -euo pipefail
chmod 0755 /storage/bin/korri-session-toggle /storage/bin/korri-toggle-daemon
if [ -f /storage/korri-toggle-daemon.pid ]; then
  old="$(cat /storage/korri-toggle-daemon.pid 2>/dev/null || true)"
  [ -n "$old" ] && kill "$old" 2>/dev/null || true
fi
pkill -f '[k]orri-toggle-daemon' 2>/dev/null || true
: > /storage/korri-toggle-daemon.log
setsid /storage/bin/korri-toggle-daemon >/dev/null 2>&1 < /dev/null &
echo $! > /storage/korri-toggle-daemon.pid
sleep 0.3
bash -n /storage/bin/korri-session-toggle
bash -n /storage/bin/korri-toggle-daemon
/storage/bin/korri-session-toggle status || true
ps -o pid,ppid,stat,args -p "$(cat /storage/korri-toggle-daemon.pid)" 2>/dev/null || true
tail -5 /storage/korri-toggle-daemon.log 2>/dev/null || true
REMOTE

  log "Installed. Button chord: L3 + R3 + Start"
}

remove_toggle() {
  log "Stopping and removing temporary toggle scripts from $ODIN_HOST"
  ssh_odin 'bash -s' <<'REMOTE'
set -euo pipefail
if [ -f /storage/korri-toggle-daemon.pid ]; then
  old="$(cat /storage/korri-toggle-daemon.pid 2>/dev/null || true)"
  [ -n "$old" ] && kill "$old" 2>/dev/null || true
fi
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
    ssh_odin '/storage/bin/korri-session-toggle status 2>/dev/null || true; ps -ef | grep "[k]orri-toggle-daemon" || true; tail -10 /storage/korri-toggle-daemon.log 2>/dev/null || true'
    ;;
  reset-host-key) reset_host_key ;;
  *) echo "usage: $0 {install|remove|status|reset-host-key}" >&2; exit 64 ;;
esac
