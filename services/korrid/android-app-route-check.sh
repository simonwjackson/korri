#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash android-tools coreutils curl gnugrep gnused imagemagick jq tesseract websocat
# shellcheck shell=bash
# Canonical installed Android application route proof.
#
# This gate is intentionally device-only: it installs the current Korri APK,
# copies the reviewed readable checkpoint into Korri's existing Android storage
# root, proves the protected RPC route/signature, then launches the configured
# Android app route through the portal and verifies Android's real foreground/task
# behavior. It never installs, uninstalls, clears, or otherwise mutates the
# user's installed game package, and it restores any pre-existing fixed config
# files before exiting.
set -euo pipefail

SERIAL="${1:?usage: android-app-route-check.sh <adb-serial>}"
GAME="${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}"
KORRI_PACKAGE="${KORRI_ANDROID_PACKAGE:-com.simonwjackson.korri.debug}"
HOST_PORT="${KORRI_ANDROID_APP_ROUTE_HOST_PORT:-43120}"
ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ANDROID_STORAGE_ROOT="/sdcard/korri"
CHECKPOINT_CONFIG="$ROOT/docs/research/retroarch-plugin-route/config.yaml"
CHECKPOINT_LIBRARY="${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-$ROOT/docs/research/retroarch-plugin-route/library.yaml}"
EXPECT_RETROARCH_ROUTE=true
if [[ -n "${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-}" ]]; then
  EXPECT_RETROARCH_ROUTE=false
fi
CONFIG_REMOTE="$ANDROID_STORAGE_ROOT/config.yaml"
LIBRARY_REMOTE="$ANDROID_STORAGE_ROOT/library.yaml"
CHECKPOINT_BACKUP_DIR="$ANDROID_STORAGE_ROOT/.android-app-route-check-backup-$$"
LOCK_REMOTE="$ANDROID_STORAGE_ROOT/.android-app-route-check.lock"
LOCK_OWNER_REMOTE="$LOCK_REMOTE/owner"
ANDROID_SMOKE="${KORRI_ANDROID_APP_ROUTE_SMOKE_SH:-$ROOT/services/korrid/android-smoke.sh}"
JOURNEY_RESUME="${KORRI_ANDROID_APP_ROUTE_JOURNEY_SH:-$ROOT/services/korrid/journey-resume.sh}"
DEBUG_CAPABILITY_SH="${KORRI_ANDROID_DEBUG_CAPABILITY_SH:-$ROOT/services/korrid/android-debug-capability.sh}"
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
CURL=(curl --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused)
CONFIG_WAS_PRESENT=false
LIBRARY_WAS_PRESENT=false
CHECKPOINT_RESTORE_NEEDED=false
FORWARD_ACTIVE=false
LOCK_ACQUIRED=false

adb_target() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

adb_capture() {
  timeout 15 "$ADB_BIN" -s "$SERIAL" "$@"
}

adb_shell_capture() {
  adb_capture shell "$@"
}

resumed_component_from_line() {
  local line="${1:-$(cat)}"
  sed -nE 's/.*[[:space:]]u[0-9]+[[:space:]]([^[:space:]}]+\/[^[:space:]}]+)\}?[[:space:]].*/\1/p' <<<"$line" | tr -d '\r\n'
}

package_from_component() {
  local component="$1"
  printf '%s' "${component%%/*}"
}

acquire_device_lock() {
  if ! adb_target -s "$SERIAL" shell "mkdir -p '$ANDROID_STORAGE_ROOT' && if mkdir '$LOCK_REMOTE' 2>/dev/null; then printf '%s\n' 'pid=$$ started=$(date -u +%Y-%m-%dT%H:%M:%SZ)' > '$LOCK_OWNER_REMOTE'; else echo 'Android app route check lock is held at $LOCK_REMOTE. If this is stale, remove it manually only after verifying no route check is running.' >&2; exit 75; fi"; then
    echo "Android app route check could not acquire the device config lock at $LOCK_REMOTE" >&2
    exit 1
  fi
  LOCK_ACQUIRED=true
}

release_device_lock() {
  if [[ "$LOCK_ACQUIRED" != true ]]; then
    return 0
  fi
  if ! adb_target -s "$SERIAL" shell "rm -rf '$LOCK_REMOTE'" >/dev/null 2>&1; then
    echo "Android app route check failed to release the device config lock at $LOCK_REMOTE" >&2
    return 1
  fi
  LOCK_ACQUIRED=false
}

restore_checkpoint_files() {
  local restore_failed=false

  if [[ "$CHECKPOINT_RESTORE_NEEDED" != true ]]; then
    return 0
  fi

  if [[ "$CONFIG_WAS_PRESENT" == true ]]; then
    if ! adb_target -s "$SERIAL" shell "cp '$CHECKPOINT_BACKUP_DIR/config.yaml' '$CONFIG_REMOTE'" >/dev/null 2>&1; then
      echo "Android app route check failed to restore prior config.yaml" >&2
      restore_failed=true
    fi
  else
    if ! adb_target -s "$SERIAL" shell "rm -f '$CONFIG_REMOTE'" >/dev/null 2>&1; then
      echo "Android app route check failed to remove created config.yaml" >&2
      restore_failed=true
    fi
  fi

  if [[ "$LIBRARY_WAS_PRESENT" == true ]]; then
    if ! adb_target -s "$SERIAL" shell "cp '$CHECKPOINT_BACKUP_DIR/library.yaml' '$LIBRARY_REMOTE'" >/dev/null 2>&1; then
      echo "Android app route check failed to restore prior library.yaml" >&2
      restore_failed=true
    fi
  else
    if ! adb_target -s "$SERIAL" shell "rm -f '$LIBRARY_REMOTE'" >/dev/null 2>&1; then
      echo "Android app route check failed to remove created library.yaml" >&2
      restore_failed=true
    fi
  fi

  if ! adb_target -s "$SERIAL" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'" >/dev/null 2>&1; then
    echo "Android app route check failed to remove checkpoint backup directory $CHECKPOINT_BACKUP_DIR" >&2
    restore_failed=true
  fi

  [[ "$restore_failed" == false ]]
}

cleanup() {
  local status=$?
  local cleanup_failed=false

  if [[ "$FORWARD_ACTIVE" == true ]]; then
    adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
  fi
  if ! restore_checkpoint_files; then
    cleanup_failed=true
  fi
  if ! release_device_lock; then
    cleanup_failed=true
  fi

  if [[ "$cleanup_failed" == true && "$status" -eq 0 ]]; then
    echo "Android app route check cleanup failed after successful run; fixed config may need manual inspection" >&2
    exit 1
  fi
  exit "$status"
}
trap cleanup EXIT

remote_exists() {
  adb_target -s "$SERIAL" shell "test -e '$1'" >/dev/null 2>&1
}

provision_checkpoint_files() {
  acquire_device_lock
  adb_target -s "$SERIAL" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'; mkdir -p '$CHECKPOINT_BACKUP_DIR'"
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
if ! adb_shell_capture "pm path $GAME" | grep -q '^package:'; then
  echo "Required Android package is not installed: $GAME" >&2
  echo "Install it on the target device, then rerun this check. The check will not install, uninstall, clear, or otherwise mutate the game package." >&2
  exit 1
fi

# Only the dedicated installed-route gate provisions the reviewed checkpoint.
# The general android-smoke/korrid-check-device path must leave user
# config.yaml and library.yaml untouched.
provision_checkpoint_files

# The smoke script installs Korri and proves protected RPC list/launch
# signatures for the configured Android app route and, for the canonical
# checkpoint, the plugin-backed WL4 route. Keep this call first so the portal
# journey below drives the same configured app state that RPC just observed.
KORRI_EXPECT_RETROARCH_ROUTE="$EXPECT_RETROARCH_ROUTE" \
  "$ANDROID_SMOKE" --expect-installed-route "$SERIAL"

# Drive the real portal/native bridge path. This uses Home plus relaunching
# Korri as the measured return path; Back is never used as resume evidence.
"$JOURNEY_RESUME" "$SERIAL" "$GAME"

if ! top_activity="$(adb_shell_capture "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" | tr -d '\r')"; then
  echo "Android app route check could not read the resumed activity from the device" >&2
  exit 1
fi
top_component="$(resumed_component_from_line "$top_activity")"
top_package="$(package_from_component "$top_component")"
if [[ "$top_package" != "$GAME" ]]; then
  echo "Android app route check ended without $GAME top-resumed: $top_activity" >&2
  exit 1
fi
if ! pid="$(adb_shell_capture "pidof $GAME || { status=\$?; [ \"\$status\" -eq 1 ] && exit 0; exit \"\$status\"; }" 2>/dev/null | tr -d '\r\n')"; then
  echo "Android app route check could not read process evidence for $GAME" >&2
  exit 1
fi
if [[ -z "$pid" ]]; then
  echo "Android app route check ended with $GAME top-resumed but no process evidence" >&2
  exit 1
fi

port=""
for _ in $(seq 1 10); do
  logcat_output=""
  if logcat_output="$(adb_capture logcat -d -s KorridServer:I 2>/dev/null)"; then
    line="$(grep 'listening on 127.0.0.1:' <<<"$logcat_output" | tail -1 || true)"
    port="$(printf '%s' "$line" | sed -n 's/.*127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p')"
  fi
  [[ -n "$port" ]] && break
  sleep 1
done
if [[ -z "$port" ]]; then
  echo "Could not recover embedded brain readiness after portal journey" >&2
  exit 1
fi
capability="${KORRI_ANDROID_DEBUG_CAPABILITY:-}"
if [[ -z "$capability" ]]; then
  capability="$("$DEBUG_CAPABILITY_SH" "$SERIAL" "$KORRI_PACKAGE" 43121)"
fi

adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb_target -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$port"
FORWARD_ACTIVE=true

health_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"system.health","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! jq -e '
  ._tag == "system.health"
  and .outcome._tag == "Ok"
  and (.outcome.payload.version | type == "string" and length > 0)
' <<<"$health_response" >/dev/null; then
  echo "Embedded brain health while game foreground was not a valid Ok health response: $health_response" >&2
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
' <<<"$local_games_response" >/dev/null; then
  echo "Embedded brain survived but Android route state did not: $local_games_response" >&2
  exit 1
fi
if [[ "$EXPECT_RETROARCH_ROUTE" == true ]] && ! jq -e '
  any(.outcome.payload.games[]; .id == "wl4")
' <<<"$local_games_response" >/dev/null; then
  echo "Embedded brain lost the canonical RetroArch route: $local_games_response" >&2
  exit 1
fi

printf 'Android app route package: %s pid=%s\n' "$GAME" "$pid"
printf 'Android app route topResumedActivity: %s\n' "$top_activity"
printf 'Android app route health while game foreground: %s\n' "$health_response"
printf 'Android app route local games while game foreground: %s\n' "$local_games_response"
