#!/usr/bin/env bash
# Install Korri's Odin dual-screen Sway layout under /storage.
# The ROCKNIX root is immutable, but /storage/.config/sway/config is writable
# and is the active Sway config on the Odin Portal.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"

read -r -a SSH_EXTRA_OPTS <<< "${ODIN_SSH_OPTS:-}"

log() { printf '\033[0;36m[odin-sway-layout]\033[0m %s\n' "$*" >&2; }

ssh_odin() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$ODIN_HOST" "$@"
}

install_layout() {
  log "Installing stacked dual-screen Sway layout on $ODIN_HOST"
  ssh_odin 'bash -s' <<'REMOTE'
set -euo pipefail

config=/storage/.config/sway/config
marker_begin='# korri:dual-screen-layout begin'
marker_end='# korri:dual-screen-layout end'
mkdir -p "$(dirname "$config")"
touch "$config"

tmp="$(mktemp)"
awk -v begin="$marker_begin" -v end="$marker_end" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
' "$config" > "$tmp"
cat >> "$tmp" <<'CONFIG'
# korri:dual-screen-layout begin
# The Odin Portal is physically stacked like a 3DS. Keep Sway geometry stacked
# too: DSI-2 is the top/main screen, DSI-1 is the bottom/secondary screen.
output DSI-2 transform 90
output DSI-2 pos 0 0
output DSI-1 transform 90
output DSI-1 pos 340 1080
# korri:dual-screen-layout end
CONFIG
mv "$tmp" "$config"

if command -v swaymsg >/dev/null 2>&1; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/run/0-runtime-dir}"
  export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
  export SWAYSOCK="${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.0.sock}"
  swaymsg 'output DSI-2 transform 90 pos 0 0' >/dev/null 2>&1 || true
  swaymsg 'output DSI-1 transform 90 pos 340 1080' >/dev/null 2>&1 || true
fi
REMOTE
}

case "${1:-install}" in
  install) install_layout ;;
  *) echo "usage: $0 {install}" >&2; exit 64 ;;
esac
