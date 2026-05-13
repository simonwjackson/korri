#!/usr/bin/env bash
# Make an Device/Thor device match the current repo for supervised Electrobun testing.
#
# This is the one-command testing deploy path: sync the working tree, install the
# current Nix-managed korri-desktop-device app, refresh Device services/scripts, start
# Korri, then smoke-test sessiond.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@sm8550}"
DEVICE_APP_ROOT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-/storage/.nix-profile/bin/korri-desktop-device}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

read -r -a SSH_EXTRA_OPTS <<< "${DEVICE_SSH_OPTS:-}"

log() { printf '\033[0;36m[device-deploy]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[device-deploy]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_device() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$DEVICE_HOST" "$@"
}

log "Probing $DEVICE_HOST..."
ssh_device 'echo ok' >/dev/null || fail "Cannot reach $DEVICE_HOST. Check SSH key auth and Tailscale connectivity."

log "Syncing repo to $DEVICE_HOST:$DEVICE_APP_ROOT..."
DEVICE_HOST="$DEVICE_HOST" DEVICE_APP_ROOT="$DEVICE_APP_ROOT" "$SCRIPT_DIR/sync.sh"

log "Installing current korri-desktop-device Nix app into /storage/.nix-profile..."
ssh_device "cd '$DEVICE_APP_ROOT' && KORRI_ELECTROBUN_APP='$KORRI_ELECTROBUN_APP' bash -s" <<'REMOTE'
set -euo pipefail

export PATH="/storage/bin:/storage/.nix-portable/bin:/storage/.nix-profile/bin:$PATH"

nix_cmd() {
  nix --extra-experimental-features 'nix-command flakes' "$@"
}

if ! command -v nix >/dev/null 2>&1; then
  echo "nix is missing on the device; cannot install .#korri-desktop-device" >&2
  exit 1
fi

mkdir -p /storage

nix_cmd profile remove --profile /storage/.nix-profile korri-desktop-device >/dev/null 2>&1 || true
nix_cmd profile remove --profile /storage/.nix-profile korri-desktop >/dev/null 2>&1 || true

nix_cmd profile install --profile /storage/.nix-profile .#korri-desktop-device

if ! command -v "$KORRI_ELECTROBUN_APP" >/dev/null 2>&1 && [ ! -x "$KORRI_ELECTROBUN_APP" ]; then
  echo "installed Electrobun app is not executable: $KORRI_ELECTROBUN_APP" >&2
  exit 1
fi

resolved="$(readlink -f "$KORRI_ELECTROBUN_APP" 2>/dev/null || printf '%s' "$KORRI_ELECTROBUN_APP")"
printf 'korri-desktop-device=%s\n' "$resolved"
REMOTE

log "Stopping existing supervised Korri session before service refresh..."
ssh_device '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true'

log "Refreshing base Device install: Bun, env, scripts, Sway layout, and services..."
DEVICE_HOST="$DEVICE_HOST" DEVICE_APP_ROOT="$DEVICE_APP_ROOT" "$SCRIPT_DIR/install.sh"

log "Starting supervised Korri session..."
ssh_device '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true; /storage/bin/korri-session-toggle start >/dev/null'

log "Running sessiond smoke check..."
DEVICE_HOST="$DEVICE_HOST" DEVICE_APP_ROOT="$DEVICE_APP_ROOT" "$SCRIPT_DIR/smoke-sessiond.sh"

log "Deploy complete."
