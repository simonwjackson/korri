#!/usr/bin/env bash
# Launcher for the Korri API server on the Device.
#
# Ensures the Wayland env from /storage/.guest/korri/app/.env is loaded before bun
# spawns runemu.sh children, so emulators render to the handheld screen.
#
# Run on the device (not the dev machine) — invoked by scripts/device/dev.sh.

set -euo pipefail

PROJECT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
PORT="${PORT:-3001}"

cd "$PROJECT"

if [ -f "$PROJECT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROJECT/.env"
  set +a
fi

export PORT
export NODE_ENV="${NODE_ENV:-development}"
export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"

if [ "${KORRI_ENABLE_SESSIOND_LAUNCHER:-0}" = "1" ]; then
  export KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:3003}"
  export KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-/storage/.guest/korri/sessiond.token}"
fi

exec /storage/bin/bun run tools/http/server.ts
