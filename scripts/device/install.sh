#!/usr/bin/env bash
# Idempotently install/update everything Korri needs on the AYN Device 2 Portal.
#
# Re-running this script ensures Bun, PATH setup, the synced project,
# aarch64-native dependencies, Wayland runtime env, the Korri session toggle
# command, and the Korri input daemon service are present and current.
#
# See docs/development/device-iterative-loop.md.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
DEVICE_APP_ROOT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
DEVICE_INPUT_BRIDGE_PORT="${DEVICE_INPUT_BRIDGE_PORT:-3002}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log()  { printf '\033[0;36m[device-install]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[device-install]\033[0m %s\n' "$*" >&2; exit 1; }

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"
RSYNC_SSH=(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "${SSH_EXTRA_OPTS[@]}")

ssh_device() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$DEVICE_HOST" "$@"
}

# 1. Reachability ------------------------------------------------------------
log "Probing $DEVICE_HOST..."
ssh_device 'echo ok' >/dev/null \
  || fail "Cannot reach $DEVICE_HOST. Check SSH key auth and Tailscale connectivity."

# 2. Bun ---------------------------------------------------------------------
log "Installing latest Bun under /storage/bin/bun..."
ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p /storage/bin
cd /tmp
rm -rf bun-linux-aarch64 bun-linux-aarch64.zip
curl -fsSL -o bun-linux-aarch64.zip \
  https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64.zip
if command -v unzip >/dev/null 2>&1; then
  unzip -q bun-linux-aarch64.zip
else
  busybox unzip -q bun-linux-aarch64.zip
fi
install -m 0755 bun-linux-aarch64/bun /storage/bin/bun
rm -rf bun-linux-aarch64 bun-linux-aarch64.zip
echo "bun: $(/storage/bin/bun --version)"
REMOTE

# 3. /storage/.profile PATH --------------------------------------------------
log "Ensuring /storage/.profile puts /storage/bin and nix on PATH..."
ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail
profile=/storage/.profile
marker='# korri:bin-path'
touch "$profile"
if ! grep -qF "$marker" "$profile" 2>/dev/null; then
  {
    echo ""
    echo "$marker"
    echo 'export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"'
  } >> "$profile"
fi
REMOTE

# 4. Project rsync -----------------------------------------------------------
log "Syncing project to $DEVICE_HOST:$DEVICE_APP_ROOT..."
ssh_device "mkdir -p '$DEVICE_APP_ROOT' /storage/.guest/korri/logs /storage/.guest/korri/run /storage/.guest/korri/library"
rsync -az --delete \
  -e "${RSYNC_SSH[*]}" \
  --exclude=node_modules \
  --exclude=out \
  --exclude=.worktrees \
  --exclude=.direnv \
  --exclude=.tanstack \
  --exclude=.git \
  --exclude=.nix-bin \
  --exclude=.env \
  --exclude=sessiond.token \
  --exclude=media \
  "$REPO_ROOT/" "$DEVICE_HOST:$DEVICE_APP_ROOT/"

# 5. bun install -------------------------------------------------------------
log "Running bun install on the device (aarch64-native dependencies)..."
ssh_device "cd '$DEVICE_APP_ROOT' && /storage/bin/bun install"

# 6. Harvest Wayland env from the live session -------------------------------
log "Harvesting Wayland session env from emulationstation or sway..."
es_env="$(ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail
session_pid="$(pgrep -f emulationstation | head -1 || true)"
if [ -z "$session_pid" ]; then
  session_pid="$(pgrep -x sway | head -1 || true)"
fi
if [ -z "$session_pid" ]; then
  session_pid="$(pgrep -f '/usr/bin/sway -V|/usr/bin/sway$|sway.sh' | head -1 || true)"
fi
if [ -z "$session_pid" ]; then
  echo "WAYLAND_SESSION_NOT_RUNNING" >&2
  exit 2
fi
cat "/proc/$session_pid/environ" \
  | tr '\0' '\n' \
  | grep -E '^(WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DISPLAY|DBUS_SESSION_BUS_ADDRESS|XDG_SESSION_TYPE)='
REMOTE
)" || fail "No live ROCKNIX Wayland/Sway session env found. Start sway/EmulationStation or hand-write $DEVICE_APP_ROOT/.env with WAYLAND_DISPLAY/XDG_RUNTIME_DIR before continuing."

if [ -z "$es_env" ]; then
  fail "Could not read Wayland env from the live session (/proc env empty). Restart Sway/ES and retry."
fi

if ! grep -q '^WAYLAND_DISPLAY=' <<< "$es_env"; then
  wayland_display="$(ssh_device 'bash -s' <<'REMOTE'
set -euo pipefail
runtime_dir="/var/run/0-runtime-dir"
for candidate in "$runtime_dir"/wayland-*; do
  [ -S "$candidate" ] || continue
  basename "$candidate"
  exit 0
done
REMOTE
)" || true
  if [ -n "${wayland_display:-}" ]; then
    es_env="$es_env
WAYLAND_DISPLAY=$wayland_display"
  fi
fi

if ! grep -q '^DBUS_SESSION_BUS_ADDRESS=' <<< "$es_env" && grep -q '^XDG_RUNTIME_DIR=' <<< "$es_env"; then
  runtime_dir="$(grep '^XDG_RUNTIME_DIR=' <<< "$es_env" | tail -1 | cut -d= -f2-)"
  es_env="$es_env
DBUS_SESSION_BUS_ADDRESS=unix:path=$runtime_dir/bus"
fi

log "Writing $DEVICE_APP_ROOT/.env..."
ssh_device "cat > '$DEVICE_APP_ROOT/.env'" <<EOF
# Generated by scripts/device/install.sh on $(date -u +%FT%TZ).
# Wayland session env harvested from the live emulationstation process so
# children of \`runemu.sh\` (the actual emulators) render to the handheld
# screen instead of the SSH session's nowhere-display.
$es_env
# Korri runtime config — gamelist roots that ROCKNIX actually populates on
# this device. The default rocknix-source roots
# (/storage/games-internal/roms, /storage/games-external/roms) miss most of
# the user's library because /storage/roms/ is the unified mount that
# EmulationStation scans.
KORRI_ROCKNIX_GAMELIST_ROOTS=/storage/roms
EOF

# 7. Device Sway dual-screen layout -------------------------------------------
log "Ensuring Device screens are stacked in Sway..."
"$SCRIPT_DIR/install-sway-layout.sh" install

# 8. Korri session toggle command -------------------------------------------
log "Ensuring Korri session toggle command is installed..."
"$SCRIPT_DIR/install-korri-toggle.sh" install

# 9. Korri input daemon ------------------------------------------------------
log "Installing/restarting Korri input daemon service..."
ssh_device "cd '$DEVICE_APP_ROOT' && DEVICE_APP_ROOT='$DEVICE_APP_ROOT' DEVICE_INPUT_BRIDGE_PORT='$DEVICE_INPUT_BRIDGE_PORT' scripts/device/install-inputd-service.sh install-start-mask"

# 10. Korri session supervisor -----------------------------------------------
log "Installing/restarting Korri session supervisor service..."
ssh_device "cd '$DEVICE_APP_ROOT' && DEVICE_APP_ROOT='$DEVICE_APP_ROOT' scripts/device/install-sessiond-service.sh install-start"

log "Device install/update complete."
log "Next: \`just dev-device\`. Roll back input ownership with: ssh $DEVICE_HOST '$DEVICE_APP_ROOT/scripts/device/install-inputd-service.sh rollback'"
log "Roll back Korri session supervision with: ssh $DEVICE_HOST '$DEVICE_APP_ROOT/scripts/device/install-sessiond-service.sh rollback'"
