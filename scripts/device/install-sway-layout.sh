#!/usr/bin/env bash
# Install Korri's Device dual-screen Sway layout under /storage.
# The ROCKNIX root is immutable, but /storage/.config/sway/config is writable
# and is the active Sway config on the Device Portal.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"

log() { printf '\033[0;36m[device-sway-layout]\033[0m %s\n' "$*" >&2; }

ssh_device() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$DEVICE_HOST" "$@"
}

install_layout() {
  log "Installing stacked dual-screen Sway layout on $DEVICE_HOST"
  ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail

config=/storage/.config/sway/config
helper=/storage/bin/korri-apply-sway-layout
marker_begin='# korri:dual-screen-layout begin'
marker_end='# korri:dual-screen-layout end'
mkdir -p "$(dirname "$config")" /storage/bin
touch "$config"

cat > "$helper" <<'HELPER'
#!/usr/bin/env bash
set -euo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/run/0-runtime-dir}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export SWAYSOCK="${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.0.sock}"

for _ in $(seq 1 20); do
  if swaymsg -t get_outputs 2>/dev/null | grep -q '"name": "DSI-1"'; then
    break
  fi
  sleep 0.5
done

swaymsg 'output DSI-2 enable transform 90 pos 0 0 bg #000000 solid_color' >/dev/null 2>&1 || true
swaymsg 'output DSI-1 enable transform 90 pos 340 1080 bg #000000 solid_color' >/dev/null 2>&1 || true
HELPER
chmod 0755 "$helper"

tmp="$(mktemp)"
awk -v begin="$marker_begin" -v end="$marker_end" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
' "$config" > "$tmp"
cat >> "$tmp" <<'CONFIG'
# korri:dual-screen-layout begin
# The Device Portal is physically stacked like a 3DS. Keep Sway geometry stacked
# too: DSI-2 is the top/main screen, DSI-1 is the bottom/secondary screen.
output DSI-2 transform 90
output DSI-2 pos 0 0
output DSI-1 transform 90
output DSI-1 pos 340 1080
exec_always /storage/bin/korri-apply-sway-layout
# korri:dual-screen-layout end
CONFIG
mv "$tmp" "$config"

if command -v swaymsg >/dev/null 2>&1; then
  "$helper" >/dev/null 2>&1 || true
fi
REMOTE
}

case "${1:-install}" in
  install) install_layout ;;
  *) echo "usage: $0 {install}" >&2; exit 64 ;;
esac
