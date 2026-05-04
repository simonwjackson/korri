#!/usr/bin/env bash
# Launcher for the Korri native input bridge on the Odin.
#
# Run on the device (not the dev machine) — invoked by tools/scripts/odin-dev.sh.

set -euo pipefail

PROJECT="${ODIN_PROJECT:-/storage/korri}"
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

exec /storage/bin/bun run tools/odin/input-bridge.ts
