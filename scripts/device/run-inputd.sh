#!/usr/bin/env bash
# Launcher for the Korri input daemon on the Device.
#
# Run on the device (not the dev machine) — invoked by scripts/device/dev.sh
# and the optional korri-inputd systemd service.

set -euo pipefail

PROJECT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
KORRI_INPUT_BRIDGE_PORT="${KORRI_INPUT_BRIDGE_PORT:-3002}"

cd "$PROJECT"

if [ -f "$PROJECT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROJECT/.env"
  set +a
fi

export KORRI_INPUT_BRIDGE_PORT
export NODE_ENV="${NODE_ENV:-development}"
export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"

exec /storage/bin/bun run tools/device/inputd.ts
