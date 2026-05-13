#!/usr/bin/env bash
# Launcher for the Korri renderer session supervisor on the Device.

set -euo pipefail

PROJECT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
KORRI_SESSIOND_PORT="${KORRI_SESSIOND_PORT:-3003}"
KORRI_SESSIOND_TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-/storage/.guest/korri/sessiond.token}"

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

export DISPLAY="${DISPLAY:-:0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/var/run/0-runtime-dir}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export SWAYSOCK="${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.0.sock}"
export KORRI_SESSIOND_PORT
export KORRI_SESSIOND_TOKEN_FILE
export KORRI_SESSIOND_TOKEN="$(tr -d '\n' < "$KORRI_SESSIOND_TOKEN_FILE")"
export KORRI_SESSIOND_URL="${KORRI_SESSIOND_URL:-http://127.0.0.1:$KORRI_SESSIOND_PORT}"
export KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-/storage/.nix-profile/bin/korri-desktop-device}"
export KORRI_ELECTROBUN_STATE_ROOT="${KORRI_ELECTROBUN_STATE_ROOT:-/storage/.guest/korri/electrobun}"
export KORRI_ELECTROBUN_STATUS_FILE="${KORRI_ELECTROBUN_STATUS_FILE:-$KORRI_ELECTROBUN_STATE_ROOT/status.json}"
export KORRI_ELECTROBUN_LOG="${KORRI_ELECTROBUN_LOG:-/storage/.guest/korri/logs/electrobun-sessiond.log}"
export NODE_ENV="${NODE_ENV:-development}"
export PATH="/storage/bin:/storage/.nix-profile/bin:$PATH"

mkdir -p "$(dirname "$KORRI_ELECTROBUN_LOG")" "$KORRI_ELECTROBUN_STATE_ROOT"

exec /storage/bin/bun run tools/device/sessiond.ts
