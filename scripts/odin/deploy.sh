#!/usr/bin/env bash
# Make an Odin/Thor device match the current repo for supervised Electrobun testing.
#
# This is the one-command testing deploy path: sync the working tree, install the
# current Nix-managed korri-desktop-odin app, refresh Odin services/scripts, start
# Korri, then smoke-test sessiond.

set -euo pipefail

ODIN_HOST="${ODIN_HOST:-root@sm8550}"
ODIN_PROJECT="${ODIN_PROJECT:-/storage/korri}"
KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-/storage/.nix-profile/bin/korri-desktop-odin}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

read -r -a SSH_EXTRA_OPTS <<< "${ODIN_SSH_OPTS:-}"

log() { printf '\033[0;36m[odin-deploy]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[odin-deploy]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_odin() {
  ssh \
    -o ConnectTimeout=5 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA_OPTS[@]}" \
    "$ODIN_HOST" "$@"
}

log "Probing $ODIN_HOST..."
ssh_odin 'echo ok' >/dev/null || fail "Cannot reach $ODIN_HOST. Check SSH key auth and Tailscale connectivity."

log "Syncing repo to $ODIN_HOST:$ODIN_PROJECT..."
ODIN_HOST="$ODIN_HOST" ODIN_PROJECT="$ODIN_PROJECT" "$SCRIPT_DIR/sync.sh"

log "Installing current korri-desktop-odin Nix app into /storage/.nix-profile..."
ssh_odin "cd '$ODIN_PROJECT' && KORRI_ELECTROBUN_APP='$KORRI_ELECTROBUN_APP' bash -s" <<'REMOTE'
set -euo pipefail

export PATH="/storage/bin:/storage/.nix-portable/bin:/storage/.nix-profile/bin:$PATH"

nix_cmd() {
  nix --extra-experimental-features 'nix-command flakes' "$@"
}

if ! command -v nix >/dev/null 2>&1; then
  echo "nix is missing on the device; cannot install .#korri-desktop-odin" >&2
  exit 1
fi

mkdir -p /storage

nix_cmd profile remove --profile /storage/.nix-profile korri-desktop-odin >/dev/null 2>&1 || true
nix_cmd profile remove --profile /storage/.nix-profile korri-desktop >/dev/null 2>&1 || true

nix_cmd profile install --profile /storage/.nix-profile .#korri-desktop-odin

if ! command -v "$KORRI_ELECTROBUN_APP" >/dev/null 2>&1 && [ ! -x "$KORRI_ELECTROBUN_APP" ]; then
  echo "installed Electrobun app is not executable: $KORRI_ELECTROBUN_APP" >&2
  exit 1
fi

resolved="$(readlink -f "$KORRI_ELECTROBUN_APP" 2>/dev/null || printf '%s' "$KORRI_ELECTROBUN_APP")"
printf 'korri-desktop-odin=%s\n' "$resolved"
REMOTE

log "Stopping existing supervised Korri session before service refresh..."
ssh_odin '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true'

log "Refreshing base Odin install: Bun, env, scripts, Sway layout, and services..."
ODIN_HOST="$ODIN_HOST" ODIN_PROJECT="$ODIN_PROJECT" "$SCRIPT_DIR/install.sh"

log "Starting supervised Korri session..."
ssh_odin '/storage/bin/korri-session-toggle stop >/dev/null 2>&1 || true; /storage/bin/korri-session-toggle start >/dev/null'

log "Running sessiond smoke check..."
ODIN_HOST="$ODIN_HOST" ODIN_PROJECT="$ODIN_PROJECT" "$SCRIPT_DIR/smoke-sessiond.sh"

log "Deploy complete."
