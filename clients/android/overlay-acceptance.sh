#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash android-tools coreutils curl diffutils gnugrep gnused jq
# shellcheck shell=bash
# Human-led installed-device gate for the unified TYPE_ACCESSIBILITY_OVERLAY host.
set -euo pipefail

usage() {
  echo 'usage: overlay-acceptance.sh <adb-serial> <exact-device-model> <direct-launch-package> <unrelated-package> [evidence-dir]' >&2
  exit 2
}

[[ $# -ge 4 && $# -le 5 ]] || usage
SERIAL="$1"
EXPECTED_MODEL="$2"
DIRECT_PACKAGE="$3"
UNRELATED_PACKAGE="$4"
EVIDENCE_DIR="${5:-$PWD/overlay-acceptance-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ -n "$SERIAL" && -n "$EXPECTED_MODEL" && -n "$DIRECT_PACKAGE" && -n "$UNRELATED_PACKAGE" ]] || usage
[[ "$DIRECT_PACKAGE" != "$UNRELATED_PACKAGE" ]] || {
  echo 'direct-launch and unrelated negative packages must be distinct' >&2
  exit 2
}

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
KORRI_PACKAGE="${KORRI_PACKAGE:-com.simonwjackson.korri.debug}"
KORRI_ACTIVITY="$KORRI_PACKAGE/com.limelight.KorriShellActivity"
RETROARCH_PACKAGE="${KORRI_RETROARCH_PACKAGE:-com.korri.retroarch}"
STORAGE_ROOT="/storage/emulated/0/korri"
CONFIG_REMOTE="$STORAGE_ROOT/config.yaml"
LIBRARY_REMOTE="$STORAGE_ROOT/library.yaml"
RETROARCH_CONFIG_REMOTE="$STORAGE_ROOT/retroarch.cfg"
STATE_ROOT="$STORAGE_ROOT/states"
STATE_DIR="$STATE_ROOT/mGBA"
STATE_FILE="$STATE_DIR/wl4.state.auto"
SAVE_DIR="$STORAGE_ROOT/saves"
SAVE_FILE="$SAVE_DIR/wl4.srm"
SYSTEM_DIR="$STORAGE_ROOT/system"
SCREENSHOTS_DIR="$STORAGE_ROOT/screenshots"
CHECKPOINT_CONFIG="$ROOT/docs/research/retroarch-plugin-route/config.yaml"
CHECKPOINT_LIBRARY="$ROOT/docs/research/retroarch-plugin-route/library-wl4.yaml"
LOCK_REMOTE="$STORAGE_ROOT/.android-app-route-check.lock"
LOCK_OWNER_REMOTE="$LOCK_REMOTE/owner"
BACKUP_REMOTE="$STORAGE_ROOT/.overlay-acceptance-backup-$$"
PREFS_BACKUP="files/.overlay-acceptance-prefs-$$"
SCREENSHOT_REMOTE="/sdcard/korri-overlay-acceptance.png"
HOST_PORT="${KORRI_OVERLAY_ACCEPTANCE_HOST_PORT:-43122}"
DEBUG_CAPABILITY_SH="${KORRI_ANDROID_DEBUG_CAPABILITY_SH:-$ROOT/services/korrid/android-debug-capability.sh}"

LOCK_ACQUIRED=false
BACKUP_CLASSIFIED=false
FORWARD_ACTIVE=false
RPC_READY=false
KORRI_STARTED=false
CONFIG_WAS_PRESENT=false
LIBRARY_WAS_PRESENT=false
RETROARCH_CONFIG_WAS_PRESENT=false
STATE_WAS_PRESENT=false
SAVE_WAS_PRESENT=false
STATE_ROOT_WAS_PRESENT=false
STATE_DIR_WAS_PRESENT=false
SAVE_DIR_WAS_PRESENT=false
SYSTEM_DIR_WAS_PRESENT=false
SCREENSHOTS_DIR_WAS_PRESENT=false
PREFS_WAS_PRESENT=false
PRIOR_AUTO_ROTATION=''
PRIOR_USER_ROTATION=''
CAPABILITY=''

adb_target() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

adb_capture() {
  timeout 15 "$ADB_BIN" -s "$SERIAL" "$@"
}

adb_shell() {
  adb_capture shell "$@"
}

package_pid() {
  local package="$1"
  local output
  if ! output="$(adb_shell "pidof '$package' || { status=\$?; [ \"\$status\" -eq 1 ] && exit 0; exit \"\$status\"; }")"; then
    echo "could not inspect process state for $package" >&2
    return 1
  fi
  printf '%s' "$output" | tr -d '\r\n'
}

require_preinstalled() {
  local package="$1"
  adb_shell "pm path '$package'" | grep -q '^package:' || {
    echo "required package is not preinstalled: $package" >&2
    exit 1
  }
}

remote_state() {
  local path="$1"
  local state
  state="$(adb_shell "if test -e '$path'; then echo present; else echo absent; fi" | tr -d '\r\n')"
  case "$state" in
    present|absent) printf '%s' "$state" ;;
    *) echo "unexpected state for $path: $state" >&2; return 1 ;;
  esac
}

backup_file() {
  local path="$1"
  local name="$2"
  local flag="$3"
  if [[ "$(remote_state "$path")" == present ]]; then
    adb_shell "cp '$path' '$BACKUP_REMOTE/$name' && cmp -s '$path' '$BACKUP_REMOTE/$name'"
    printf -v "$flag" true
  fi
}

record_directory() {
  local path="$1"
  local flag="$2"
  if [[ "$(remote_state "$path")" == present ]]; then
    printf -v "$flag" true
  fi
}

restore_file() {
  local path="$1"
  local name="$2"
  local present="$3"
  if [[ "$present" == true ]]; then
    adb_shell "mkdir -p '$(dirname "$path")'; cp '$BACKUP_REMOTE/$name' '$path'; cmp -s '$BACKUP_REMOTE/$name' '$path'" >/dev/null
  else
    adb_shell "rm -f '$path'; test ! -e '$path'" >/dev/null
  fi
}

acquire_lock() {
  adb_shell "mkdir -p '$STORAGE_ROOT' && if mkdir '$LOCK_REMOTE' 2>/dev/null; then printf '%s\n' 'pid=$$ started=$(date -u +%Y-%m-%dT%H:%M:%SZ)' > '$LOCK_OWNER_REMOTE'; else echo 'Overlay acceptance lock is held. Remove it only after proving no device gate is active.' >&2; exit 75; fi"
  LOCK_ACQUIRED=true
}

release_lock() {
  [[ "$LOCK_ACQUIRED" == true ]] || return 0
  adb_shell "rm -rf '$LOCK_REMOTE'" >/dev/null
  LOCK_ACQUIRED=false
}

backup_before_mutation() {
  [[ "$(remote_state "$STORAGE_ROOT")" == present ]] || {
    echo "Korri storage root must already exist before acceptance: $STORAGE_ROOT" >&2
    exit 1
  }
  acquire_lock
  adb_shell "rm -rf '$BACKUP_REMOTE'; mkdir -p '$BACKUP_REMOTE'"
  backup_file "$CONFIG_REMOTE" config.yaml CONFIG_WAS_PRESENT
  backup_file "$LIBRARY_REMOTE" library.yaml LIBRARY_WAS_PRESENT
  backup_file "$RETROARCH_CONFIG_REMOTE" retroarch.cfg RETROARCH_CONFIG_WAS_PRESENT
  backup_file "$STATE_FILE" wl4.state.auto STATE_WAS_PRESENT
  backup_file "$SAVE_FILE" wl4.srm SAVE_WAS_PRESENT
  record_directory "$STATE_ROOT" STATE_ROOT_WAS_PRESENT
  record_directory "$STATE_DIR" STATE_DIR_WAS_PRESENT
  record_directory "$SAVE_DIR" SAVE_DIR_WAS_PRESENT
  record_directory "$SYSTEM_DIR" SYSTEM_DIR_WAS_PRESENT
  record_directory "$SCREENSHOTS_DIR" SCREENSHOTS_DIR_WAS_PRESENT

  if adb_shell "run-as '$KORRI_PACKAGE' test -d shared_prefs" >/dev/null 2>&1; then
    PREFS_WAS_PRESENT=true
    adb_shell "run-as '$KORRI_PACKAGE' sh -c \"rm -rf '$PREFS_BACKUP'; mkdir -p '$PREFS_BACKUP'; cp -R shared_prefs '$PREFS_BACKUP/'; diff -r shared_prefs '$PREFS_BACKUP/shared_prefs'\""
  else
    adb_shell "run-as '$KORRI_PACKAGE' sh -c \"rm -rf '$PREFS_BACKUP'; mkdir -p '$PREFS_BACKUP'\""
  fi

  PRIOR_AUTO_ROTATION="$(adb_shell settings get system accelerometer_rotation | tr -d '\r\n')"
  PRIOR_USER_ROTATION="$(adb_shell settings get system user_rotation | tr -d '\r\n')"
  [[ "$PRIOR_AUTO_ROTATION" =~ ^[01]$ && "$PRIOR_USER_ROTATION" =~ ^[0-3]$ ]] || {
    echo 'could not classify system rotation before mutation' >&2
    exit 1
  }
  # Every mutable path is classified and every present value has a verified
  # backup. Only now may cleanup interpret a false flag as original absence.
  BACKUP_CLASSIFIED=true
}

restore_exact_state() {
  local failed=false
  restore_file "$CONFIG_REMOTE" config.yaml "$CONFIG_WAS_PRESENT" || failed=true
  restore_file "$LIBRARY_REMOTE" library.yaml "$LIBRARY_WAS_PRESENT" || failed=true
  restore_file "$RETROARCH_CONFIG_REMOTE" retroarch.cfg "$RETROARCH_CONFIG_WAS_PRESENT" || failed=true
  restore_file "$STATE_FILE" wl4.state.auto "$STATE_WAS_PRESENT" || failed=true
  restore_file "$SAVE_FILE" wl4.srm "$SAVE_WAS_PRESENT" || failed=true

  if [[ "$PREFS_WAS_PRESENT" == true ]]; then
    adb_shell "run-as '$KORRI_PACKAGE' sh -c \"rm -rf shared_prefs; cp -R '$PREFS_BACKUP/shared_prefs' shared_prefs; diff -r '$PREFS_BACKUP/shared_prefs' shared_prefs\"" >/dev/null || failed=true
  else
    adb_shell "run-as '$KORRI_PACKAGE' rm -rf shared_prefs" >/dev/null || failed=true
  fi
  adb_shell "settings put system accelerometer_rotation '$PRIOR_AUTO_ROTATION'; settings put system user_rotation '$PRIOR_USER_ROTATION'" >/dev/null || failed=true
  [[ "$(adb_shell settings get system accelerometer_rotation | tr -d '\r\n')" == "$PRIOR_AUTO_ROTATION" ]] || failed=true
  [[ "$(adb_shell settings get system user_rotation | tr -d '\r\n')" == "$PRIOR_USER_ROTATION" ]] || failed=true

  local state
  for state in \
    "$STATE_DIR_WAS_PRESENT:$STATE_DIR" \
    "$STATE_ROOT_WAS_PRESENT:$STATE_ROOT" \
    "$SAVE_DIR_WAS_PRESENT:$SAVE_DIR" \
    "$SCREENSHOTS_DIR_WAS_PRESENT:$SCREENSHOTS_DIR" \
    "$SYSTEM_DIR_WAS_PRESENT:$SYSTEM_DIR"; do
    if [[ "${state%%:*}" == false ]]; then
      adb_shell "rmdir '${state#*:}' 2>/dev/null || test ! -e '${state#*:}'" >/dev/null || failed=true
    fi
  done

  [[ "$failed" == false ]] || {
    echo "exact restoration failed; backup and lock retained at $BACKUP_REMOTE and $LOCK_REMOTE" >&2
    return 1
  }
  adb_shell "run-as '$KORRI_PACKAGE' rm -rf '$PREFS_BACKUP'" >/dev/null || return 1
  adb_shell "rm -rf '$BACKUP_REMOTE'" >/dev/null || return 1
  BACKUP_CLASSIFIED=false
}

rpc() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $CAPABILITY" \
    -d "$1" "http://127.0.0.1:$HOST_PORT/rpc"
}

session_is_idle() {
  local status
  status="$(rpc '{"_tag":"app.session.status","payload":{}}')" || return 1
  jq -e '.outcome._tag == "Ok" and (.outcome.payload.active | not)' <<<"$status" >/dev/null
}

cleanup() {
  local status=$?
  local safe=true
  local pid=''
  trap - EXIT
  adb_target -s "$SERIAL" shell "rm -f '$SCREENSHOT_REMOTE'" >/dev/null 2>&1 || true

  if [[ "$BACKUP_CLASSIFIED" == true ]]; then
    pid="$(package_pid "$RETROARCH_PACKAGE" 2>/dev/null || printf probe-failed)"
    [[ -z "$pid" ]] || safe=false
    if [[ "$RPC_READY" == true ]] && ! session_is_idle; then
      safe=false
    fi
    if [[ "$safe" == true && "$KORRI_STARTED" == true ]]; then
      adb_shell "am force-stop '$KORRI_PACKAGE'" >/dev/null 2>&1 || safe=false
      pid="$(package_pid "$KORRI_PACKAGE" 2>/dev/null || printf probe-failed)"
      [[ -z "$pid" ]] || safe=false
    fi
    if [[ "$safe" == true ]]; then
      restore_exact_state || safe=false
      [[ "$safe" == true ]] && release_lock || safe=false
    fi
    if [[ "$safe" != true ]]; then
      echo "could not establish safe quiescence; backup and lock retained at $BACKUP_REMOTE and $LOCK_REMOTE" >&2
      status=1
    fi
  elif [[ "$LOCK_ACQUIRED" == true ]]; then
    release_lock || status=1
  fi
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
    FORWARD_ACTIVE=false
  fi
  exit "$status"
}
trap cleanup EXIT

checkpoint() {
  local token="$1"
  shift
  printf '\nHUMAN CHECKPOINT — %s\n' "$token"
  printf '%s\n' "$@"
  printf 'Type exactly "%s" after observing every item: ' "$token"
  local answer
  IFS= read -r answer
  [[ "$answer" == "$token" ]] || {
    echo "checkpoint not confirmed: $token" >&2
    exit 1
  }
}

accessibility_snapshot() {
  printf 'accessibility_enabled=%s\n' "$(adb_shell settings get secure accessibility_enabled | tr -d '\r')"
  printf 'enabled_accessibility_services=%s\n' "$(adb_shell settings get secure enabled_accessibility_services | tr -d '\r')"
}

assert_overlay_window() {
  local expected="$1"
  local windows
  windows="$(adb_shell dumpsys window windows)"
  if [[ "$expected" == present ]]; then
    grep -Fq 'Korri gameplay overlay' <<<"$windows"
  elif grep -Fq 'Korri gameplay overlay' <<<"$windows"; then
    return 1
  fi
}

assert_top_package() {
  local package="$1"
  adb_shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" \
    | grep -F "$package/" >/dev/null
}

capture_evidence() {
  local label="$1"
  local controls_json="$2"
  local image="$EVIDENCE_DIR/$label.png"
  local sidecar="$EVIDENCE_DIR/$label.txt"
  adb_target -s "$SERIAL" exec-out screencap -p >"$image"
  {
    printf 'label=%s\nserial=%s\nexpected_model=%s\ncaptured_utc=%s\n' \
      "$label" "$SERIAL" "$EXPECTED_MODEL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '\n[top activity]\n'
    adb_shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" || true
    printf '\n[pids]\n'
    for package in "$KORRI_PACKAGE" "$RETROARCH_PACKAGE" "$DIRECT_PACKAGE" "$UNRELATED_PACKAGE"; do
      printf '%s=%s\n' "$package" "$(package_pid "$package" || printf probe-failed)"
    done
    printf '\n[accessibility: read only]\n'
    accessibility_snapshot
    printf '\n[window]\n'
    adb_shell "dumpsys window windows | grep -E -A8 -B3 'Korri gameplay overlay|mCurrentFocus|mFocusedApp'" || true
    printf '\n[active controls and telemetry]\n%s\n' "$controls_json"
    printf '\n[overlay telemetry]\n'
    adb_shell "logcat -d -t 500 -s KorriOverlay:I MoonBridge:I" || true
  } >"$sidecar"
  [[ -s "$image" && -s "$sidecar" ]] || {
    echo "incomplete screenshot/sidecar pair for $label" >&2
    exit 1
  }
  echo "evidence pair: $image + $sidecar"
}

controls_for_launch() {
  local launch_id="$1"
  rpc "{\"_tag\":\"app.session.controls\",\"payload\":{\"launchId\":\"$launch_id\"}}"
}

if [[ "$SERIAL" == *:* ]]; then
  timeout 15 "$ADB_BIN" connect "$SERIAL" >/dev/null || true
fi
adb_target -s "$SERIAL" wait-for-device
[[ "$(adb_capture get-state | tr -d '\r\n')" == device ]] || {
  echo "Android target is not ready: $SERIAL" >&2
  exit 1
}
ACTUAL_MODEL="$(adb_shell getprop ro.product.model | tr -d '\r\n')"
[[ "$ACTUAL_MODEL" == "$EXPECTED_MODEL" ]] || {
  echo "device model mismatch: expected '$EXPECTED_MODEL', got '$ACTUAL_MODEL'" >&2
  exit 1
}
for package in "$KORRI_PACKAGE" "$RETROARCH_PACKAGE" "$DIRECT_PACKAGE" "$UNRELATED_PACKAGE"; do
  require_preinstalled "$package"
done
for package in "$KORRI_PACKAGE" "$RETROARCH_PACKAGE"; do
  [[ -z "$(package_pid "$package")" ]] || {
    echo "$package must be stopped before acceptance backs up mutable state" >&2
    exit 1
  }
done
mkdir -p "$EVIDENCE_DIR"
[[ -z "$(find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || {
  echo "evidence directory must be empty: $EVIDENCE_DIR" >&2
  exit 1
}

backup_before_mutation
adb_target -s "$SERIAL" push "$CHECKPOINT_CONFIG" "$CONFIG_REMOTE" >/dev/null
adb_target -s "$SERIAL" push "$CHECKPOINT_LIBRARY" "$LIBRARY_REMOTE" >/dev/null
adb_target -s "$SERIAL" exec-out cat "$CONFIG_REMOTE" | cmp -s "$CHECKPOINT_CONFIG" -
adb_target -s "$SERIAL" exec-out cat "$LIBRARY_REMOTE" | cmp -s "$CHECKPOINT_LIBRARY" -
adb_shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0" >/dev/null

# Accessibility is Android-owned. This gate only reads it; permission changes
# below are performed by the device owner in Settings.
enabled_services="$(adb_shell settings get secure enabled_accessibility_services | tr -d '\r')"
grep -Fq 'com.limelight.korri.overlay.KorriOverlayService' <<<"$enabled_services" || {
  echo 'enable the Korri accessibility service by hand before starting acceptance' >&2
  exit 1
}

adb_shell "am start --display 0 -n '$KORRI_ACTIVITY'" >/dev/null
KORRI_STARTED=true
port=''
for _ in $(seq 1 30); do
  logs="$(adb_shell "logcat -d -s KorridServer:I KorriPortal:I" 2>/dev/null || true)"
  port="$(sed -n 's/.*listening on 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' <<<"$logs" | tail -1)"
  grep -Fq 'title="Korri"' <<<"$logs" && [[ -n "$port" ]] && break
  sleep 1
done
[[ -n "$port" ]] || { echo 'embedded korrid/portal did not become ready' >&2; exit 1; }
CAPABILITY="${KORRI_ANDROID_DEBUG_CAPABILITY:-}"
[[ -n "$CAPABILITY" ]] || CAPABILITY="$($DEBUG_CAPABILITY_SH "$SERIAL" "$KORRI_PACKAGE")"
adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb_target -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$port" >/dev/null
FORWARD_ACTIVE=true
RPC_READY=true

checkpoint 'LOCAL OVERLAY VERIFIED' \
  'Using only the physical controller, launch Wario Land 4 from Korri.' \
  'After gameplay is visible, press physical Guide. Verify one Shift sheet opens.' \
  'Verify D-pad, A/confirm, B/Back, and supported stick/hat navigation work.' \
  'Verify no input reaches gameplay while the sheet is open; leave it open.'
local_launch="$(rpc '{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}')"
local_launch_id="$(jq -er '.outcome.payload | select(.disposition == "resume") | .launchId' <<<"$local_launch")"
local_controls="$(controls_for_launch "$local_launch_id")"
jq -e '.outcome._tag == "Ok" and ([.outcome.payload.groups[].controls[]] | length >= 2) and .outcome.payload.retroarchTelemetry' <<<"$local_controls" >/dev/null
assert_overlay_window present
capture_evidence local-overlay-open "$local_controls"

checkpoint 'RETROARCH MENU VERIFIED' \
  'Using physical D-pad/A, invoke Open RetroArch menu from the Shift sheet.' \
  'Verify Shift dismisses before RGUI appears, navigate RGUI physically, then Back to gameplay.' \
  'Open Shift again with Guide, dismiss with B/Back, and gracefully quit Wario.'
assert_overlay_window absent
[[ -z "$(package_pid "$RETROARCH_PACKAGE")" ]] || {
  echo 'RetroArch is still running after the local checkpoint' >&2
  exit 1
}
local_after="$(controls_for_launch "$local_launch_id" || printf '{"expected":"ended; stale controls rejected"}')"
capture_evidence local-after-quit "$local_after"

checkpoint 'STREAM OVERLAY VERIFIED' \
  'Using Korri and the physical controller, start the configured Moonlight stream.' \
  'Wait for moving host frames, then press Guide and verify one Shift sheet overlays the live stream.' \
  'Verify physical D-pad, A, B/Back and supported stick/hat input; no input may leak to the host.' \
  'Leave the Shift sheet open for evidence capture.'
stream_status="$(rpc '{"_tag":"app.session.status","payload":{}}')"
stream_launch_id="$(jq -er '.outcome.payload.active.launchId' <<<"$stream_status")"
stream_controls="$(controls_for_launch "$stream_launch_id")"
jq -e '.outcome._tag == "Ok" and ([.outcome.payload.groups[].controls[]] | length == 19)' <<<"$stream_controls" >/dev/null
assert_overlay_window present
capture_evidence stream-overlay-open "$stream_controls"

checkpoint 'STREAM PARITY VERIFIED' \
  'Exercise every control in docs/research/unified-android-game-overlay.md, observing values after nondismissing controls.' \
  'Confirm Disconnect returns to Korri while the host game keeps running.' \
  'Reconnect and confirm host frames resume, then use Quit game on host and confirm termination.' \
  'Confirm the pre-stream progress/failure surface remained intact throughout.'
session_is_idle || { echo 'stream/host session is still active after parity checkpoint' >&2; exit 1; }
capture_evidence stream-after-host-quit '{"activeControls":[],"telemetry":"session status is idle"}'

checkpoint 'DIRECT NEGATIVE VERIFIED' \
  "Launch $DIRECT_PACKAGE directly, outside Korri, using the device UI." \
  'Press physical Guide and verify Korri does not consume it and no Shift sheet appears.'
assert_top_package "$DIRECT_PACKAGE"
assert_overlay_window absent
capture_evidence direct-launch-negative '{"activeControls":[],"telemetry":"no Korri launch permitted"}'

checkpoint 'UNRELATED NEGATIVE VERIFIED' \
  "Foreground $UNRELATED_PACKAGE using the device UI while Korri remains backgrounded." \
  'Press physical Guide and verify it passes through and no Korri overlay appears.'
assert_top_package "$UNRELATED_PACKAGE"
assert_overlay_window absent
capture_evidence unrelated-app-negative '{"activeControls":[],"telemetry":"foreground mismatch"}'

checkpoint 'PERMISSION DISABLED BY HUMAN' \
  'Open Android Settings yourself and disable the Korri accessibility service.' \
  'Return to Korri, verify the loss is visible, launch Wario successfully, and verify Guide does not open Shift.' \
  'Gracefully quit Wario. Do not use adb or an automated grant action.'
enabled_services="$(adb_shell settings get secure enabled_accessibility_services | tr -d '\r')"
if grep -Fq 'com.limelight.korri.overlay.KorriOverlayService' <<<"$enabled_services"; then
  echo 'accessibility service still appears enabled after the disabled checkpoint' >&2
  exit 1
fi
[[ -z "$(package_pid "$RETROARCH_PACKAGE")" ]] || { echo 'RetroArch still running after permission-disabled launch' >&2; exit 1; }
capture_evidence permission-disabled '{"activeControls":[],"telemetry":"accessibility state read only"}'

checkpoint 'PERMISSION RECOVERED BY HUMAN' \
  'Open Android Settings yourself and re-enable the Korri accessibility service.' \
  'If Android exposes restricted-settings UI, record what it actually says; do not infer success from opening Settings.' \
  'Return to Korri, launch Wario, verify physical Guide opens Shift without reinstall/restart, then gracefully quit.'
enabled_services="$(adb_shell settings get secure enabled_accessibility_services | tr -d '\r')"
grep -Fq 'com.limelight.korri.overlay.KorriOverlayService' <<<"$enabled_services" || {
  echo 'accessibility service is not enabled after the recovery checkpoint' >&2
  exit 1
}
[[ -z "$(package_pid "$RETROARCH_PACKAGE")" ]] || { echo 'RetroArch still running after permission recovery' >&2; exit 1; }
session_is_idle
assert_overlay_window absent
capture_evidence permission-recovered '{"activeControls":[],"telemetry":"human grant recovery; no screenshot-only claim"}'

printf '\nPre-cutover overlay acceptance evidence captured at %s\n' "$EVIDENCE_DIR"
printf 'This run records evidence; it does not authorize cutover or claim parity by itself.\n'
