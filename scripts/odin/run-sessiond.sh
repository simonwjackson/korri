#!/usr/bin/env bash
# Launcher for the Korri renderer session supervisor on the Odin.

set -euo pipefail

PROJECT="${ODIN_PROJECT:-/storage/korri}"
KORRI_SESSIOND_PORT="${KORRI_SESSIOND_PORT:-3003}"
KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-$PROJECT/sessiond.token}"

cd "$PROJECT"

if [ -f "$PROJECT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PROJECT/.env"
  set +a
fi

if [ ! -f "$KORRI_SESSIOND_TOKEN_FILE" ]; then
  umask 077
  mkdir -p "$(dirname "$KORRI_SESSIOND_TOKEN_FILE")"
  head -c 32 /dev/urandom | base64 > "$KORRI_SESSIOND_TOKEN_FILE"
fi

export KORRI_SESSIOND_PORT
export KORRI_SESSIOND_TOKEN_FILE
export KORRI_SESSIOND_TOKEN="$(tr -d '\n' < "$KORRI_SESSIOND_TOKEN_FILE")"
export KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:$KORRI_SESSIOND_PORT}"
export KORRI_URL="${KORRI_URL:-http://127.0.0.1:3100}"
export KORRI_SESSION_RENDERER="${KORRI_SESSION_RENDERER:-chromium}"
export KORRI_CHROMIUM_PATH="${KORRI_CHROMIUM_PATH:-/storage/apps/chromium/squashfs-root/AppRun}"
export KORRI_CHROMIUM_PROFILE_DIR="${KORRI_CHROMIUM_PROFILE_DIR:-/storage/apps/chromium/korri-profile}"
export KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-korri-desktop-odin}"
export KORRI_ELECTROBUN_STATE_ROOT="${KORRI_ELECTROBUN_STATE_ROOT:-/storage/.local/share/nix-apps/korri-electrobun}"
export KORRI_ELECTROBUN_STATUS_FILE="${KORRI_ELECTROBUN_STATUS_FILE:-$KORRI_ELECTROBUN_STATE_ROOT/status.json}"
export NODE_ENV="${NODE_ENV:-development}"
export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"

exec /storage/bin/bun run tools/odin/sessiond.ts
