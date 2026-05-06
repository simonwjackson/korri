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
  reconcile)
    log "Reconciling supervised Korri session"
    post /control/reconcile >/dev/null
    status
    ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|toggle|reconcile|status}" >&2; exit 64 ;;
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
    log "focused app is Korri Electrobun; restarting through sessiond"
    korri_stop_electrobun
    /storage/bin/korri-session-toggle reconcile >/dev/null
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

  cat > "$tmpdir/korri-swap-screens" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source /storage/bin/korri-electrobun-control-lib
korri_wayland_env

log() { printf '%s [korri-screens] %s\n' "$(date -Is)" "$*" >&2; }

if ! command -v swaymsg >/dev/null 2>&1; then
  log "swaymsg not found; cannot swap screens"
  exit 0
fi

commands="$(swaymsg -t get_outputs 2>/dev/null | /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
const outputs = JSON.parse(raw || "[]")
const byName = new Map(outputs.filter(o => o.active !== false && o.rect).map(o => [o.name, o]))
const dsi1 = byName.get("DSI-1")
const dsi2 = byName.get("DSI-2")
if (!dsi1 || !dsi2) process.exit(0)
const dx = Math.abs(dsi1.rect.x - dsi2.rect.x)
const dy = Math.abs(dsi1.rect.y - dsi2.rect.y)
const minX = Math.min(dsi1.rect.x, dsi2.rect.x)
const minY = Math.min(dsi1.rect.y, dsi2.rect.y)
const quote = value => String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
if (dx >= dy) {
  const dsi1First = dsi1.rect.x <= dsi2.rect.x
  const left = dsi1First ? dsi2 : dsi1
  const right = dsi1First ? dsi1 : dsi2
  console.log(`output "${quote(left.name)}" pos ${minX} ${minY}`)
  console.log(`output "${quote(right.name)}" pos ${minX + left.rect.width} ${minY}`)
} else {
  const dsi1First = dsi1.rect.y <= dsi2.rect.y
  const top = dsi1First ? dsi2 : dsi1
  const bottom = dsi1First ? dsi1 : dsi2
  const width = Math.max(top.rect.width, bottom.rect.width)
  const topX = minX + Math.floor((width - top.rect.width) / 2)
  const bottomX = minX + Math.floor((width - bottom.rect.width) / 2)
  console.log(`output "${quote(top.name)}" pos ${topX} ${minY}`)
  console.log(`output "${quote(bottom.name)}" pos ${bottomX} ${minY + top.rect.height}`)
}
' 2>/dev/null || true)"

if [ -z "${commands// }" ]; then
  log "DSI-1 and DSI-2 are not both active; falling back to screen_switch"
  if command -v screen_switch >/dev/null 2>&1; then
    screen_switch
  fi
  exit 0
fi

log "swapping DSI-1 and DSI-2"
printf '%s\n' "$commands" | while IFS= read -r command; do
  [ -n "$command" ] || continue
  swaymsg "$command" >/dev/null
  log "swaymsg $command"
done
REMOTE_SCRIPT

  cat > "$tmpdir/korri-toggle-screen" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source /storage/bin/korri-electrobun-control-lib
korri_wayland_env

log() { printf '%s [korri-screen-power] %s\n' "$(date -Is)" "$*" >&2; }

if ! command -v swaymsg >/dev/null 2>&1; then
  log "swaymsg not found; cannot change screen power"
  exit 0
fi

is_active() {
  local output="$1"
  swaymsg -t get_outputs 2>/dev/null | OUTPUT="$output" /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
const outputs = JSON.parse(raw || "[]")
const output = outputs.find(o => o.name === process.env.OUTPUT)
process.exit(output?.active === true ? 0 : 1)
' >/dev/null 2>&1
}

restore_both() {
  log "restoring stacked dual-screen layout"
  if [ -x /storage/bin/korri-apply-sway-layout ]; then
    /storage/bin/korri-apply-sway-layout >/dev/null 2>&1 || true
  else
    swaymsg 'output DSI-2 enable transform 90 pos 0 0 bg #000000 solid_color' >/dev/null 2>&1 || true
    swaymsg 'output DSI-1 enable transform 90 pos 340 1080 bg #000000 solid_color' >/dev/null 2>&1 || true
  fi
}

move_workspaces() {
  local from="$1"
  local to="$2"
  swaymsg -t get_workspaces 2>/dev/null | FROM_OUTPUT="$from" TO_OUTPUT="$to" /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
const workspaces = JSON.parse(raw || "[]")
for (const workspace of workspaces) {
  if (workspace.output !== process.env.FROM_OUTPUT) continue
  console.log(`workspace ${JSON.stringify(workspace.name)}; move workspace to output ${process.env.TO_OUTPUT}`)
}
' 2>/dev/null | while IFS= read -r command; do
    [ -n "$command" ] || continue
    swaymsg "$command" >/dev/null 2>&1 || true
  done
}

top_only() {
  log "switching to top screen only"
  swaymsg 'output DSI-2 enable transform 90 pos 0 0 bg #000000 solid_color' >/dev/null 2>&1 || true
  sleep 0.2
  if ! is_active DSI-2; then
    log "top screen did not become active; refusing to disable bottom"
    restore_both
    return 0
  fi
  swaymsg 'focus output DSI-2' >/dev/null 2>&1 || true
  move_workspaces DSI-1 DSI-2
  swaymsg 'output DSI-1 disable' >/dev/null 2>&1 || true
  if ! is_active DSI-2; then
    log "top screen inactive after toggle; restoring both"
    restore_both
  fi
}

bottom_only() {
  log "switching to bottom screen only"
  swaymsg 'output DSI-1 enable transform 90 pos 0 0 bg #000000 solid_color' >/dev/null 2>&1 || true
  sleep 0.2
  if ! is_active DSI-1; then
    log "bottom screen did not become active; refusing to disable top"
    restore_both
    return 0
  fi
  swaymsg 'focus output DSI-1' >/dev/null 2>&1 || true
  move_workspaces DSI-2 DSI-1
  swaymsg 'output DSI-2 disable' >/dev/null 2>&1 || true
  if ! is_active DSI-1; then
    log "bottom screen inactive after toggle; restoring both"
    restore_both
  fi
}

mode="${1:-bottom}"
case "$mode" in
  bottom)
    if is_active DSI-1 && is_active DSI-2; then
      top_only
    else
      restore_both
    fi
    ;;
  top)
    if is_active DSI-1 && is_active DSI-2; then
      bottom_only
    else
      restore_both
    fi
    ;;
  restore|both) restore_both ;;
  *) echo "usage: $0 {bottom|top|restore|both}" >&2; exit 64 ;;
esac
REMOTE_SCRIPT

  cat > "$tmpdir/korri-toggle-bottom-keyboard" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source /storage/bin/korri-electrobun-control-lib
korri_wayland_env

log() { printf '%s [korri-keyboard] %s\n' "$(date -Is)" "$*" >&2; }

keyboard_command="${KORRI_BOTTOM_KEYBOARD_COMMAND:-${KORRI_INPUTD_BOTTOM_KEYBOARD:-}}"
if [ -z "${keyboard_command// }" ]; then
  for candidate in wvkbd-mobintl wvkbd squeekboard maliit-keyboard; do
    if command -v "$candidate" >/dev/null 2>&1; then
      keyboard_command="$candidate"
      break
    fi
  done
fi

if [ -z "${keyboard_command// }" ]; then
  log "no on-screen keyboard command found; set KORRI_BOTTOM_KEYBOARD_COMMAND"
  exit 0
fi

keyboard_exe="${keyboard_command%% *}"
keyboard_base="${keyboard_exe##*/}"
running=""
for p in /proc/[0-9]*; do
  [ -r "$p/exe" ] || continue
  pid="${p##*/}"
  exe="$(readlink "$p/exe" 2>/dev/null || true)"
  [ "${exe##*/}" = "$keyboard_base" ] && running="$running $pid"
done

if [ -n "${running// }" ]; then
  log "stopping bottom keyboard:$running"
  kill -TERM $running 2>/dev/null || true
  exit 0
fi

bottom_output="${KORRI_BOTTOM_KEYBOARD_OUTPUT:-${KORRI_INPUTD_BOTTOM_KEYBOARD_OUTPUT:-}}"
if [ -z "$bottom_output" ] && command -v swaymsg >/dev/null 2>&1; then
  bottom_output="$(swaymsg -t get_outputs 2>/dev/null | /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
const outputs = JSON.parse(raw || "[]")
const enabled = outputs.filter(o => o.active !== false && o.rect)
enabled.sort((a, b) => {
  const yDelta = (b.rect?.y ?? 0) - (a.rect?.y ?? 0)
  if (yDelta !== 0) return yDelta
  return (b.rect?.x ?? 0) - (a.rect?.x ?? 0)
})
if (enabled[0]?.name) console.log(enabled[0].name)
' 2>/dev/null || true)"
fi

keyboard_height="${KORRI_BOTTOM_KEYBOARD_HEIGHT:-${KORRI_INPUTD_BOTTOM_KEYBOARD_HEIGHT:-}}"
if [ -z "${keyboard_height// }" ] && command -v swaymsg >/dev/null 2>&1; then
  keyboard_height="$(swaymsg -t get_outputs 2>/dev/null | BOTTOM_OUTPUT="$bottom_output" /storage/bin/bun -e '
const raw = await new Response(Bun.stdin.stream()).text()
const outputs = JSON.parse(raw || "[]")
const enabled = outputs.filter(o => o.active !== false && o.rect)
enabled.sort((a, b) => {
  const yDelta = (b.rect?.y ?? 0) - (a.rect?.y ?? 0)
  if (yDelta !== 0) return yDelta
  return (b.rect?.x ?? 0) - (a.rect?.x ?? 0)
})
const selected = enabled.find(o => o.name === process.env.BOTTOM_OUTPUT) ?? enabled[0]
if (selected?.rect?.height) console.log(Math.floor(selected.rect.height / 2))
' 2>/dev/null || true)"
fi
keyboard_height="${keyboard_height:-540}"
if [ -n "${keyboard_height// }" ]; then
  case "$keyboard_base" in
    wvkbd|wvkbd-mobintl)
      case " $keyboard_command " in
        *' -H '*) ;;
        *) keyboard_command="$keyboard_command -H $keyboard_height" ;;
      esac
      case " $keyboard_command " in
        *' -L '*) ;;
        *) keyboard_command="$keyboard_command -L $keyboard_height" ;;
      esac
      ;;
  esac
fi

quote_for_shell() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

if [[ "$keyboard_command" == *'{output}'* ]]; then
  bottom_output_quoted="$(quote_for_shell "$bottom_output")"
  keyboard_command="${keyboard_command//\{output\}/$bottom_output_quoted}"
elif [ -n "$bottom_output" ]; then
  case "$keyboard_base" in
    wvkbd|wvkbd-mobintl)
      keyboard_command="$keyboard_command --output $(quote_for_shell "$bottom_output")"
      ;;
  esac
fi

log "starting bottom keyboard: $keyboard_command"
nohup sh -c "$keyboard_command" >> /storage/korri-bottom-keyboard.log 2>&1 &
echo $! > /storage/korri-bottom-keyboard.pid
REMOTE_SCRIPT

  chmod 0755 "$tmpdir/korri-session-toggle" "$tmpdir/korri-kill-active-application" "$tmpdir/korri-swap-screens" "$tmpdir/korri-toggle-screen" "$tmpdir/korri-toggle-bottom-keyboard"
  chmod 0644 "$tmpdir/korri-electrobun-control-lib"

  log "Installing session/input action commands on $ODIN_HOST:/storage/bin"
  ssh_odin 'mkdir -p /storage/bin'
  scp_odin \
    "$tmpdir/korri-session-toggle" \
    "$tmpdir/korri-electrobun-control-lib" \
    "$tmpdir/korri-kill-active-application" \
    "$tmpdir/korri-swap-screens" \
    "$tmpdir/korri-toggle-screen" \
    "$tmpdir/korri-toggle-bottom-keyboard" \
    "$ODIN_HOST:/storage/bin/"

  ssh_odin "KORRI_SESSIOND_URL='$KORRI_SESSIOND_URL' KORRI_SESSIOND_TOKEN_FILE='$KORRI_SESSIOND_TOKEN_FILE' bash -s" <<'REMOTE'
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
rm -f /storage/bin/korri-toggle-daemon /storage/bin/korri-go-chromium /storage/korri-toggle-daemon.pid
bash -n /storage/bin/korri-session-toggle
bash -n /storage/bin/korri-kill-active-application
bash -n /storage/bin/korri-swap-screens
bash -n /storage/bin/korri-toggle-screen
bash -n /storage/bin/korri-toggle-bottom-keyboard
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
rm -f /storage/bin/korri-session-toggle /storage/bin/korri-electrobun-control-lib /storage/bin/korri-kill-active-application /storage/bin/korri-swap-screens /storage/bin/korri-toggle-bottom-keyboard /storage/bin/korri-go-chromium /storage/bin/korri-toggle-daemon /storage/korri-toggle-daemon.pid
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
