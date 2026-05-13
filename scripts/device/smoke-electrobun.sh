#!/usr/bin/env bash
# Opt-in proof smoke for the Korri Electrobun Layer 8 renderer on the Device.

set -euo pipefail

DEVICE_HOST="${DEVICE_HOST:-root@thor}"
DEVICE_APP_ROOT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
KORRI_ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-korri-desktop-device}"
KORRI_ELECTROBUN_ROOT="${KORRI_ELECTROBUN_ROOT:-/storage/.local/share/nix-apps/korri-electrobun}"
KORRI_ELECTROBUN_STATUS_FILE="${KORRI_DESKTOP_STATUS_FILE:-$KORRI_ELECTROBUN_ROOT/status.json}"
KORRI_ELECTROBUN_LOG="${KORRI_ELECTROBUN_LOG:-/storage/.guest/korri/logs/electrobun-layer8.log}"
KORRI_ELECTROBUN_GPU_EVIDENCE="${KORRI_ELECTROBUN_GPU_EVIDENCE:-0}"

log()  { printf '\033[0;36m[electrobun-smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[electrobun-smoke]\033[0m %s\n' "$*" >&2; exit 1; }

log "Launching Electrobun proof candidate on $DEVICE_HOST..."
ssh -o ConnectTimeout=5 -o BatchMode=yes "$DEVICE_HOST" \
  "cd '$DEVICE_APP_ROOT' && KORRI_ELECTROBUN_APP='$KORRI_ELECTROBUN_APP' KORRI_ELECTROBUN_ROOT='$KORRI_ELECTROBUN_ROOT' KORRI_DESKTOP_STATUS_FILE='$KORRI_ELECTROBUN_STATUS_FILE' KORRI_ELECTROBUN_LOG='$KORRI_ELECTROBUN_LOG' KORRI_ELECTROBUN_GPU_EVIDENCE='$KORRI_ELECTROBUN_GPU_EVIDENCE' bash -s" <<'REMOTE' \
  || fail "Electrobun Layer 8 proof smoke failed"
set -euo pipefail

export PATH="/storage/.nix-profile/bin:/storage/bin:$PATH"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

app_path="$(command -v "$KORRI_ELECTROBUN_APP" 2>/dev/null || true)"
if [ -z "$app_path" ]; then
  echo "Electrobun app not found on PATH: $KORRI_ELECTROBUN_APP" >&2
  exit 1
fi

resolved="$(readlink -f "$app_path" 2>/dev/null || printf '%s' "$app_path")"
case "$resolved" in
  /nix/store/*|/storage/.nix-profile/*) ;;
  *) echo "Electrobun app is not Nix-managed: $resolved" >&2; exit 1 ;;
esac

mkdir -p "$KORRI_ELECTROBUN_ROOT" "$(dirname "$KORRI_DESKTOP_STATUS_FILE")"
rm -f "$KORRI_DESKTOP_STATUS_FILE"
: > "$KORRI_ELECTROBUN_LOG"

unset GSK_RENDERER WEBKIT_DISABLE_COMPOSITING_MODE WEBKIT_DISABLE_DMABUF_RENDERER
export KORRI_DESKTOP_PROFILE=device
export KORRI_DESKTOP_STATUS_FILE
export XDG_DATA_HOME="$KORRI_ELECTROBUN_ROOT/data"
export XDG_CONFIG_HOME="$KORRI_ELECTROBUN_ROOT/config"
export XDG_CACHE_HOME="$KORRI_ELECTROBUN_ROOT/cache"
export CHROME_CONFIG_HOME="$KORRI_ELECTROBUN_ROOT/config"

setsid "$app_path" >> "$KORRI_ELECTROBUN_LOG" 2>&1 < /dev/null &
app_pid="$!"
cleanup() { kill "$app_pid" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ready=0
for _ in $(seq 1 40); do
  if [ -s "$KORRI_DESKTOP_STATUS_FILE" ]; then ready=1; break; fi
  if ! kill -0 "$app_pid" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

if [ "$ready" != "1" ]; then
  echo "Electrobun did not write status file: $KORRI_DESKTOP_STATUS_FILE" >&2
  tail -80 "$KORRI_ELECTROBUN_LOG" >&2 || true
  exit 1
fi

KORRI_DESKTOP_STATUS_FILE="$KORRI_DESKTOP_STATUS_FILE" \
KORRI_ELECTROBUN_GPU_EVIDENCE="$KORRI_ELECTROBUN_GPU_EVIDENCE" \
  /storage/bin/bun run tools/device/electrobun-proof-smoke.ts
REMOTE

log "Electrobun Layer 8 proof smoke passed"
