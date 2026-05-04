#!/usr/bin/env bash
# Launcher for the Korri API server on the Odin.
#
# Ensures the Wayland env from /storage/korri/.env is loaded before bun
# spawns runemu.sh children, so emulators render to the handheld screen.
#
# Run on the device (not the dev machine) — invoked by scripts/odin/dev.sh.

set -euo pipefail

PROJECT="${ODIN_PROJECT:-/storage/korri}"
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

exec /storage/bin/bun run tools/http/server.ts
