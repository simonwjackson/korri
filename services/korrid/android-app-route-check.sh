#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash android-tools coreutils curl gnugrep gnused jq
# shellcheck shell=bash
# Canonical installed Android application route proof.
#
# This gate is intentionally device-only: it installs the current Korri APK,
# copies the reviewed readable checkpoint into Korri's existing Android storage
# root, proves the protected RPC route/signature, then launches TMNT through the
# portal and verifies Android's real foreground/task behavior. It never
# installs, uninstalls, clears, or otherwise mutates the user's installed game
# package, and it restores any pre-existing fixed config files before exiting.
set -euo pipefail

SERIAL="${1:?usage: android-app-route-check.sh <adb-serial>}"
GAME="${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}"
HOST_PORT="${KORRI_ANDROID_APP_ROUTE_HOST_PORT:-43120}"
ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ANDROID_STORAGE_ROOT="/sdcard/korri-retro"
CHECKPOINT_CONFIG="$ROOT/docs/research/android-app-plugin-schema-checkpoint/config.yaml"
CHECKPOINT_LIBRARY="$ROOT/docs/research/android-app-plugin-schema-checkpoint/library.yaml"
CONFIG_REMOTE="$ANDROID_STORAGE_ROOT/config.yaml"
LIBRARY_REMOTE="$ANDROID_STORAGE_ROOT/library.yaml"
CHECKPOINT_BACKUP_DIR="$ANDROID_STORAGE_ROOT/.android-app-route-check-backup-$$"
ANDROID_SMOKE="${KORRI_ANDROID_APP_ROUTE_SMOKE_SH:-$ROOT/services/korrid/android-smoke.sh}"
JOURNEY_RESUME="${KORRI_ANDROID_APP_ROUTE_JOURNEY_SH:-$ROOT/services/korrid/journey-resume.sh}"
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
CURL=(curl --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused)
ADB=("$ADB_BIN" -s "$SERIAL")
CONFIG_WAS_PRESENT=false
LIBRARY_WAS_PRESENT=false
CHECKPOINT_RESTORE_NEEDED=false
FORWARD_ACTIVE=false

adb_target() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

restore_checkpoint_files() {
  if [[ "$CHECKPOINT_RESTORE_NEEDED" != true ]]; then
    return
  fi

  if [[ "$CONFIG_WAS_PRESENT" == true ]]; then
    adb_target -s "$SERIAL" shell "cp '$CHECKPOINT_BACKUP_DIR/config.yaml' '$CONFIG_REMOTE'" >/dev/null 2>&1 || true
  else
    adb_target -s "$SERIAL" shell "rm -f '$CONFIG_REMOTE'" >/dev/null 2>&1 || true
  fi

  if [[ "$LIBRARY_WAS_PRESENT" == true ]]; then
    adb_target -s "$SERIAL" shell "cp '$CHECKPOINT_BACKUP_DIR/library.yaml' '$LIBRARY_REMOTE'" >/dev/null 2>&1 || true
  else
    adb_target -s "$SERIAL" shell "rm -f '$LIBRARY_REMOTE'" >/dev/null 2>&1 || true
  fi

  adb_target -s "$SERIAL" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'" >/dev/null 2>&1 || true
}

cleanup() {
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
  fi
  restore_checkpoint_files
}
trap cleanup EXIT

remote_exists() {
  adb_target -s "$SERIAL" shell "test -e '$1'" >/dev/null 2>&1
}

provision_checkpoint_files() {
  adb_target -s "$SERIAL" shell "mkdir -p '$ANDROID_STORAGE_ROOT'; rm -rf '$CHECKPOINT_BACKUP_DIR'; mkdir -p '$CHECKPOINT_BACKUP_DIR'"
  CHECKPOINT_RESTORE_NEEDED=true

  if remote_exists "$CONFIG_REMOTE"; then
    CONFIG_WAS_PRESENT=true
    adb_target -s "$SERIAL" shell "cp '$CONFIG_REMOTE' '$CHECKPOINT_BACKUP_DIR/config.yaml'"
  fi
  if remote_exists "$LIBRARY_REMOTE"; then
    LIBRARY_WAS_PRESENT=true
    adb_target -s "$SERIAL" shell "cp '$LIBRARY_REMOTE' '$CHECKPOINT_BACKUP_DIR/library.yaml'"
  fi

  adb_target -s "$SERIAL" push "$CHECKPOINT_CONFIG" "$CONFIG_REMOTE" >/dev/null
  adb_target -s "$SERIAL" push "$CHECKPOINT_LIBRARY" "$LIBRARY_REMOTE" >/dev/null
  if ! adb_target -s "$SERIAL" exec-out cat "$CONFIG_REMOTE" | cmp -s "$CHECKPOINT_CONFIG" -; then
    echo "Device config.yaml does not match the reviewed checkpoint bytes" >&2
    exit 1
  fi
  if ! adb_target -s "$SERIAL" exec-out cat "$LIBRARY_REMOTE" | cmp -s "$CHECKPOINT_LIBRARY" -; then
    echo "Device library.yaml does not match the reviewed checkpoint bytes" >&2
    exit 1
  fi
}

if [[ "$SERIAL" == *:* ]]; then
  timeout 15 "$ADB_BIN" connect "$SERIAL" >/dev/null || true
fi
if ! timeout 15 "$ADB_BIN" -s "$SERIAL" wait-for-device; then
  echo "Android target is not reachable: $SERIAL" >&2
  exit 1
fi
if ! "${ADB[@]}" shell pm path "$GAME" | grep -q '^package:'; then
  echo "Required Android package is not installed: $GAME" >&2
  echo "Install it on the target device, then rerun this check. The check will not install, uninstall, clear, or otherwise mutate the game package." >&2
  exit 1
fi

# Only the dedicated installed-route gate provisions the reviewed checkpoint.
# The general android-smoke/korrid-check-device path must leave user
# config.yaml and library.yaml untouched.
provision_checkpoint_files

# The smoke script installs Korri and proves protected RPC list/launch
# signatures for TMNT and WL4 against the already-provisioned checkpoint. Keep
# this call first so the portal journey below drives the same configured app
# state that RPC just observed.
"$ANDROID_SMOKE" --expect-installed-route "$SERIAL"

# Drive the real portal/native bridge path. This uses Home plus relaunching
# Korri as the measured return path; Back is never used as resume evidence.
"$JOURNEY_RESUME" "$SERIAL" "$GAME"

top_activity="$("${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity" | tr -d '\r')"
if [[ "$top_activity" != *"$GAME"* ]]; then
  echo "Android app route check ended without $GAME top-resumed: $top_activity" >&2
  exit 1
fi
pid="$("${ADB[@]}" shell "pidof $GAME" 2>/dev/null | tr -d '\r\n')"
if [[ -z "$pid" ]]; then
  echo "Android app route check ended with $GAME top-resumed but no process evidence" >&2
  exit 1
fi

port=""
capability=""
for _ in $(seq 1 10); do
  line="$("${ADB[@]}" logcat -d -s KorridServer:I 2>/dev/null | grep 'listening on 127.0.0.1:' | tail -1 || true)"
  port="$(printf '%s' "$line" | sed -n 's/.*127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p')"
  capability_line="$("${ADB[@]}" logcat -d -s KorridServer:I 2>/dev/null | grep 'debug capability=' | tail -1 || true)"
  capability="$(printf '%s' "$capability_line" | sed -n 's/.*debug capability=\([0-9a-f][0-9a-f]*\).*/\1/p')"
  if [[ -n "$port" && -n "$capability" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$port" || -z "$capability" ]]; then
  echo "Could not recover embedded brain RPC details after portal journey (port='$port', capability=${capability:+present})" >&2
  exit 1
fi

adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb_target -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$port"
FORWARD_ACTIVE=true

health_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"system.health","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! jq -e '.outcome._tag == "Ok"' <<<"$health_response" >/dev/null; then
  echo "Embedded brain health while game foreground was not Ok: $health_response" >&2
  exit 1
fi
local_games_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.local-games.list","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! jq -e '
  .outcome._tag == "Ok"
  and .outcome.payload.games[0].id == "tmnt-shredders-revenge"
  and any(.outcome.payload.games[]; .id == "wl4")
' <<<"$local_games_response" >/dev/null; then
  echo "Embedded brain survived but local route state did not: $local_games_response" >&2
  exit 1
fi

printf 'Android app route package: %s pid=%s\n' "$GAME" "$pid"
printf 'Android app route topResumedActivity: %s\n' "$top_activity"
printf 'Android app route health while game foreground: %s\n' "$health_response"
printf 'Android app route local games while game foreground: %s\n' "$local_games_response"
