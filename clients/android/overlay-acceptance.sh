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

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
KORRI_PACKAGE="${KORRI_PACKAGE:-com.simonwjackson.korri.debug}"
KORRI_ACTIVITY="$KORRI_PACKAGE/com.limelight.KorriShellActivity"
KORRI_SERVICE_COMPONENT="$KORRI_PACKAGE/com.limelight.korri.overlay.KorriOverlayService"
RETROARCH_PACKAGE="${KORRI_RETROARCH_PACKAGE:-com.korri.retroarch}"
ANDROID_PACKAGE_PATTERN='^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
[[ "$SERIAL" =~ ^[A-Za-z0-9._:-]+$ ]] || {
  echo "invalid adb serial: $SERIAL" >&2
  exit 2
}
for package in "$KORRI_PACKAGE" "$RETROARCH_PACKAGE" "$DIRECT_PACKAGE" "$UNRELATED_PACKAGE"; do
  [[ "$package" =~ $ANDROID_PACKAGE_PATTERN ]] || {
    echo "invalid Android package: $package" >&2
    exit 2
  }
done
[[ "$DIRECT_PACKAGE" == com.korri.retroarch ]] || {
  echo 'DIRECT_PACKAGE must be exactly com.korri.retroarch' >&2
  exit 2
}
[[ "$DIRECT_PACKAGE" != "$UNRELATED_PACKAGE" ]] || {
  echo 'direct-launch and unrelated negative packages must be distinct' >&2
  exit 2
}
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
HOST_PORT="${KORRI_OVERLAY_ACCEPTANCE_HOST_PORT:-43122}"
DEBUG_CAPABILITY_SH="${KORRI_ANDROID_DEBUG_CAPABILITY_SH:-$ROOT/services/korrid/android-debug-capability.sh}"

LOCK_ACQUIRED=false
BACKUP_CLASSIFIED=false
FORWARD_ACTIVE=false
RPC_READY=false
SHELL_BROUGHT_FORWARD=false
SEMANTIC_COMPARISON_REQUIRED=false
SEMANTIC_VALUES_EQUAL=false
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
PREFS_BACKUP_READY=false
KORRI_PID=''
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

  # SharedPreferences are diagnostic evidence only. The live Korri process owns
  # these files; acceptance never overwrites or removes shared_prefs. Stateful
  # controls are restored through their public overlay actions and compared
  # semantically before the gate can pass.
  adb_shell "run-as '$KORRI_PACKAGE' sh -c \"rm -rf '$PREFS_BACKUP'; mkdir -p '$PREFS_BACKUP'; if test -d shared_prefs; then cp -R shared_prefs '$PREFS_BACKUP/'; diff -r shared_prefs '$PREFS_BACKUP/shared_prefs'; fi; chmod -R a-w '$PREFS_BACKUP'\""
  PREFS_BACKUP_READY=true

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
  if [[ "$SEMANTIC_COMPARISON_REQUIRED" == true && "$SEMANTIC_VALUES_EQUAL" != true ]]; then
    echo "semantic control restoration is incomplete; read-only preference backup retained at $PREFS_BACKUP" >&2
    echo "recovery: restore every changed control through the Korri gameplay overlay, using $EVIDENCE_DIR/stream-controls-original.json as the source of truth" >&2
    echo "external backup and lock retained at $BACKUP_REMOTE and $LOCK_REMOTE until semantic values are verified equal" >&2
    return 1
  fi
  if [[ "$PREFS_BACKUP_READY" == true ]]; then
    adb_shell "run-as '$KORRI_PACKAGE' sh -c \"chmod -R u+w '$PREFS_BACKUP'; rm -rf '$PREFS_BACKUP'\"" >/dev/null || return 1
    PREFS_BACKUP_READY=false
  fi
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

close_exact_acceptance_paths() {
  local failed=false
  local pid=''
  local session=''
  local launch_id=''
  local controls=''
  local close_response=''
  local current_korri_pid=''

  # Active local emulation uses its authenticated Quit control; an active
  # stream uses Disconnect to finish the exact Game Activity without
  # terminating the host game. A stray fork RetroArch process is the only
  # package cleanup target.
  if [[ "$RPC_READY" == true ]]; then
    session="$(rpc '{"_tag":"app.session.status","payload":{}}' 2>/dev/null || true)"
    launch_id="$(jq -r '.outcome.payload.active.launchId // empty' <<<"$session" 2>/dev/null || true)"
    if [[ -n "$launch_id" ]]; then
      controls="$(controls_for_launch "$launch_id" 2>/dev/null || true)"
      if jq -e --arg id '@korri:retroarch/quit' \
          '[.outcome.payload.groups[].controls[].id] | index($id) != null' <<<"$controls" >/dev/null 2>&1; then
        close_response="$(invoke_control "$launch_id" '@korri:retroarch/quit' 2>/dev/null || true)"
      elif jq -e --arg id '@korri:moonlight/disconnect' \
          '[.outcome.payload.groups[].controls[].id] | index($id) != null' <<<"$controls" >/dev/null 2>&1; then
        close_response="$(invoke_control "$launch_id" '@korri:moonlight/disconnect' 2>/dev/null || true)"
      else
        failed=true
      fi
      if [[ -z "$close_response" ]] \
        || ! jq -e '.outcome._tag == "Ok" and .outcome.payload._tag == "Completed"' \
          <<<"$close_response" >/dev/null 2>&1; then
        failed=true
      fi
      for _ in $(seq 1 20); do
        session_is_idle && break
        sleep 0.25
      done
      session_is_idle || failed=true
    fi
  fi

  pid="$(package_pid "$RETROARCH_PACKAGE" 2>/dev/null || printf probe-failed)"
  if [[ -n "$pid" ]]; then
    adb_shell "am force-stop '$RETROARCH_PACKAGE'" >/dev/null 2>&1 || failed=true
  fi
  pid="$(package_pid "$RETROARCH_PACKAGE" 2>/dev/null || printf probe-failed)"
  [[ -z "$pid" ]] || failed=true

  if [[ "$SHELL_BROUGHT_FORWARD" == true ]]; then
    adb_shell "am start --display 0 --activity-clear-top -n '$KORRI_ACTIVITY'" >/dev/null 2>&1 || failed=true
    for _ in $(seq 1 20); do
      assert_top_component "$KORRI_ACTIVITY" && assert_overlay_window absent && break
      sleep 0.25
    done
    assert_top_component "$KORRI_ACTIVITY" || failed=true
    assert_overlay_window absent || failed=true
    current_korri_pid="$(package_pid "$KORRI_PACKAGE" 2>/dev/null || printf probe-failed)"
    [[ -n "$current_korri_pid" && "$current_korri_pid" == "$KORRI_PID" ]] || failed=true
  fi

  [[ "$failed" == false ]]
}

cleanup() {
  local status=$?
  local safe=true
  trap - EXIT

  if [[ "$BACKUP_CLASSIFIED" == true ]] && ! close_exact_acceptance_paths; then
    safe=false
  fi
  if [[ "$BACKUP_CLASSIFIED" == true ]]; then
    if [[ "$safe" != true ]]; then
      echo "could not establish safe quiescence; backup and lock retained at $BACKUP_REMOTE and $LOCK_REMOTE" >&2
      status=1
    elif ! restore_exact_state; then
      status=1
    elif ! release_lock; then
      echo "device state was restored, but the acceptance lock remains at $LOCK_REMOTE" >&2
      status=1
    fi
  elif [[ "$LOCK_ACQUIRED" == true ]]; then
    release_lock || status=1
  fi
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
    FORWARD_ACTIVE=false
  fi
  assert_accessibility_service_enabled || status=1
  exit "$status"
}

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

assert_accessibility_service_enabled() {
  local enabled_services
  enabled_services="$(adb_shell settings get secure enabled_accessibility_services | tr -d '\r')" || return 1
  grep -Fq "$KORRI_SERVICE_COMPONENT" <<<"$enabled_services" || {
    echo 'Korri gameplay overlay accessibility service is no longer enabled.' >&2
    echo 'Re-enable it manually in Android Settings; acceptance never writes secure settings.' >&2
    return 1
  }
}

semantic_control_values() {
  jq -cS '[
    .outcome.payload.groups[].controls[]
    | select(.interaction.kind != "command")
    | {id, kind: .interaction.kind, value: .interaction.payload.value}
  ] | sort_by(.id)'
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

assert_top_component() {
  local component="$1"
  adb_shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" \
    | grep -F "$component" >/dev/null
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

invoke_control() {
  local launch_id="$1"
  local control_id="$2"
  rpc "{\"_tag\":\"app.session.control.invoke\",\"payload\":{\"launchId\":\"$launch_id\",\"controlId\":\"$control_id\"}}"
}

wait_for_local_session_end() {
  for _ in $(seq 1 30); do
    if [[ -z "$(package_pid "$RETROARCH_PACKAGE")" ]] \
      && session_is_idle \
      && assert_overlay_window absent; then
      return 0
    fi
    sleep 1
  done
  echo 'local session, process, or overlay did not end after exact Quit' >&2
  return 1
}

assert_stale_or_unavailable() {
  local response="$1"
  local failure="$2"
  jq -e '.outcome._tag == "Err" and (.outcome.payload.reason == "StaleSession" or .outcome.payload.reason == "Unavailable")' \
    <<<"$response" >/dev/null || {
      echo "$failure" >&2
      return 1
    }
}

if [[ "$SERIAL" == *:* ]]; then
  timeout 15 "$ADB_BIN" connect "$SERIAL" >/dev/null || true
fi
adb_target -s "$SERIAL" wait-for-device
[[ "$(adb_capture get-state | tr -d '\r\n')" == device ]] || {
  echo "Android target is not ready: $SERIAL" >&2
  exit 1
}
TARGET_SERIAL="$(adb_capture get-serialno | tr -d '\r\n')"
[[ "$TARGET_SERIAL" == "$SERIAL" ]] || {
  echo "device serial mismatch: expected '$SERIAL', got '$TARGET_SERIAL'" >&2
  exit 1
}
ACTUAL_MODEL="$(adb_shell getprop ro.product.model | tr -d '\r\n')"
[[ "$ACTUAL_MODEL" == "$EXPECTED_MODEL" ]] || {
  echo "device model mismatch: expected '$EXPECTED_MODEL', got '$ACTUAL_MODEL'" >&2
  exit 1
}
# Cleanup is armed only after the exact target identity has been proven. A
# typo or wrong device can therefore never trigger even a cleanup mutation.
trap cleanup EXIT
for package in "$KORRI_PACKAGE" "$RETROARCH_PACKAGE" "$DIRECT_PACKAGE" "$UNRELATED_PACKAGE"; do
  require_preinstalled "$package"
done
[[ -z "$(package_pid "$RETROARCH_PACKAGE")" ]] || {
  echo "$RETROARCH_PACKAGE must be stopped before acceptance backs up mutable state" >&2
  exit 1
}
assert_accessibility_service_enabled
KORRI_PID="$(package_pid "$KORRI_PACKAGE")"
[[ -n "$KORRI_PID" ]] || {
  echo 'Korri must already be running before acceptance; open it normally and leave Shell visible.' >&2
  echo 'Do not force-stop, reinstall, clear, or restart Korri after granting accessibility access.' >&2
  exit 1
}
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

# Accessibility is Android-owned. This gate only reads it; permission changes
# below are performed by the device owner in Settings.
assert_accessibility_service_enabled

adb_shell "am start --display 0 -n '$KORRI_ACTIVITY'" >/dev/null
SHELL_BROUGHT_FORWARD=true
[[ "$(package_pid "$KORRI_PACKAGE")" == "$KORRI_PID" ]] || {
  echo 'Bringing Shell foreground changed the Korri process; refusing acceptance with uncertain grant state.' >&2
  exit 1
}
port=''
for _ in $(seq 1 30); do
  logs="$(adb_shell "logcat -d --pid='$KORRI_PID' -s KorridServer:I KorriPortal:I" 2>/dev/null || true)"
  port="$(sed -n 's/.*listening on 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' <<<"$logs" | tail -1)"
  grep -Fq 'title="Korri"' <<<"$logs" && [[ -n "$port" ]] && break
  sleep 1
done
[[ -n "$port" ]] || { echo 'embedded korrid/portal did not become ready in the existing Korri process' >&2; exit 1; }
CAPABILITY="${KORRI_ANDROID_DEBUG_CAPABILITY:-}"
[[ -n "$CAPABILITY" ]] || CAPABILITY="$($DEBUG_CAPABILITY_SH "$SERIAL" "$KORRI_PACKAGE")"
adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb_target -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$port" >/dev/null
FORWARD_ACTIVE=true
health="$(rpc '{"_tag":"system.health","payload":{}}')"
jq -e '
  ._tag == "system.health"
  and .outcome._tag == "Ok"
  and (.outcome.payload.version | type == "string" and length > 0)
' <<<"$health" >/dev/null || {
  echo 'discovered Korri endpoint did not validate as the live authenticated brain' >&2
  exit 1
}
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
  'Verify Shift dismisses before RGUI appears and navigate RGUI physically.' \
  'Return to gameplay, open Shift again with physical Guide, and leave Shift visibly open.'
assert_top_package "$RETROARCH_PACKAGE"
assert_overlay_window present
local_quit="$(invoke_control "$local_launch_id" '@korri:retroarch/quit')"
jq -e --arg launchId "$local_launch_id" \
  '.outcome._tag == "Ok" and .outcome.payload._tag == "Completed" and .outcome.payload.payload.launchId == $launchId' \
  <<<"$local_quit" >/dev/null
wait_for_local_session_end
stale_controls="$(controls_for_launch "$local_launch_id")"
assert_stale_or_unavailable "$stale_controls" \
  'SessionControls after end must be exactly StaleSession or Unavailable'
stale_invocation="$(invoke_control "$local_launch_id" '@korri:retroarch/quit')"
assert_stale_or_unavailable "$stale_invocation" \
  'Invocation after end must be exactly StaleSession or Unavailable'
wait_for_local_session_end
stale_evidence="$(jq -cn --argjson quit "$local_quit" --argjson controls "$stale_controls" --argjson invocation "$stale_invocation" \
  '{quit:$quit,staleControls:$controls,staleInvocation:$invocation}')"
capture_evidence local-mid-overlay-end "$stale_evidence"
checkpoint 'LOCAL MID-OVERLAY END VERIFIED' \
  'The authorized exact-current Quit completed while Shift was visibly open.' \
  'The Shift window disappeared automatically, the exact RetroArch process ended, and the session became idle.' \
  'Old-launch controls and invocation were rejected without relaunching or changing foreground state.'

checkpoint 'ACTIVE KORRI LOCAL SESSION VERIFIED' \
  'From Korri, launch Wario Land 4 again and wait for active gameplay.' \
  'Press physical Guide, verify Shift opens and owns input, then dismiss it with B/Back.'
negative_launch="$(rpc '{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}')"
negative_launch_id="$(jq -er '.outcome.payload | select(.disposition == "resume") | .launchId' <<<"$negative_launch")"
negative_controls="$(controls_for_launch "$negative_launch_id")"
jq -e '.outcome._tag == "Ok" and ([.outcome.payload.groups[].controls[]] | length >= 2)' <<<"$negative_controls" >/dev/null
negative_pid="$(package_pid "$RETROARCH_PACKAGE")"
[[ -n "$negative_pid" ]] || { echo 'active Korri local session has no RetroArch process' >&2; exit 1; }
assert_top_package "$RETROARCH_PACKAGE"
assert_overlay_window absent

checkpoint 'UNRELATED ACTIVE-SESSION NEGATIVE VERIFIED' \
  "Foreground the already-approved unrelated app $UNRELATED_PACKAGE without ending Wario." \
  'Press physical Guide once and verify the unrelated app stays foreground.' \
  'Verify no Shift window opens and Guide is not consumed by Korri.'
assert_top_package "$UNRELATED_PACKAGE"
assert_overlay_window absent
[[ "$(package_pid "$RETROARCH_PACKAGE")" == "$negative_pid" ]] || {
  echo 'the exact old local game process did not survive the unrelated foreground check' >&2
  exit 1
}
capture_evidence unrelated-active-session-negative "$negative_controls"

checkpoint 'OLD GAME REMAINS DISARMED VERIFIED' \
  'Return directly to the already-running Wario Activity using Android recents; do not pass through Korri.' \
  'Press physical Guide and verify no Shift window opens.'
assert_top_package "$RETROARCH_PACKAGE"
assert_overlay_window absent
[[ "$(package_pid "$RETROARCH_PACKAGE")" == "$negative_pid" ]] || {
  echo 'foreground did not return to the exact old local game process' >&2
  exit 1
}
capture_evidence old-game-still-disarmed "$negative_controls"

checkpoint 'FRESH KORRI PUBLICATION REARMS VERIFIED' \
  'Return to Korri and select Wario Land 4 so Korri freshly resumes and publishes the existing local session.' \
  'After gameplay returns, press physical Guide and verify exactly one Shift window opens; leave it open.'
rearmed_launch="$(rpc '{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}')"
rearmed_launch_id="$(jq -er '.outcome.payload | select(.disposition == "resume") | .launchId' <<<"$rearmed_launch")"
[[ "$rearmed_launch_id" == "$negative_launch_id" ]] || {
  echo 'fresh publication did not resume the exact old launch' >&2
  exit 1
}
rearmed_controls="$(controls_for_launch "$rearmed_launch_id")"
jq -e '.outcome._tag == "Ok" and ([.outcome.payload.groups[].controls[]] | length >= 2)' <<<"$rearmed_controls" >/dev/null
assert_top_package "$RETROARCH_PACKAGE"
assert_overlay_window present
capture_evidence fresh-publication-rearmed "$rearmed_controls"
rearmed_quit="$(invoke_control "$rearmed_launch_id" '@korri:retroarch/quit')"
jq -e '.outcome._tag == "Ok" and .outcome.payload._tag == "Completed"' <<<"$rearmed_quit" >/dev/null
wait_for_local_session_end

checkpoint 'DIRECT NEGATIVE VERIFIED' \
  "Launch $DIRECT_PACKAGE directly, outside Korri, using the device UI." \
  'Press physical Guide and verify Korri does not consume it and no Shift sheet appears.'
assert_top_package "$DIRECT_PACKAGE"
assert_overlay_window absent
capture_evidence direct-launch-negative '{"activeControls":[],"telemetry":"no Korri launch permitted"}'
checkpoint 'DIRECT NEGATIVE CLOSED VERIFIED' \
  'Exit the directly launched RetroArch instance through its own UI and return to Korri.'
[[ -z "$(package_pid "$DIRECT_PACKAGE")" ]] || {
  echo 'directly launched RetroArch is still running before stream acceptance' >&2
  exit 1
}
assert_top_component "$KORRI_ACTIVITY"

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

checkpoint 'STREAM CONNECTION LOSS NARRATED' \
  'Dismiss Shift, then cause a real connection loss using an approved host or network action; do not kill the Android process.' \
  'Verify KorriSessionOverlay reattaches over the stream Activity and narrates the observed connection termination/failure.' \
  'Leave that lifecycle surface visible for evidence; do not claim decoder or host-start failure here.'
assert_top_package "$KORRI_PACKAGE"
assert_overlay_window absent
session_is_idle || { echo 'stream session is not idle after narrated connection loss' >&2; exit 1; }
capture_evidence stream-connection-loss-narrated '{"activeControls":[],"telemetry":"asserted idle after human-confirmed lifecycle narration"}'

checkpoint 'STREAM GRACEFUL RETURN VERIFIED' \
  'Use the visible KorriSessionOverlay return action and verify it returns gracefully to the Korri portal.'
assert_top_component "$KORRI_ACTIVITY"
assert_overlay_window absent
session_is_idle || { echo 'session became active during graceful lifecycle return' >&2; exit 1; }
capture_evidence stream-graceful-return '{"activeControls":[],"telemetry":"asserted portal foreground and idle session"}'

checkpoint 'STREAM PARITY STARTED' \
  'Start the configured Moonlight stream again, wait for moving host frames, and leave the stream active.' \
  'Do not exercise any gameplay-overlay control until the gate records original semantic values.'
parity_status="$(rpc '{"_tag":"app.session.status","payload":{}}')"
parity_launch_id="$(jq -er '.outcome.payload.active.launchId' <<<"$parity_status")"
parity_controls_original="$(controls_for_launch "$parity_launch_id")"
jq -e '.outcome._tag == "Ok" and ([.outcome.payload.groups[].controls[]] | length == 19)' \
  <<<"$parity_controls_original" >/dev/null
semantic_original="$(semantic_control_values <<<"$parity_controls_original")"
jq -e 'length == 8 and all(.value != null)' <<<"$semantic_original" >/dev/null || {
  echo 'could not capture all eight reversible gameplay-control values' >&2
  exit 1
}
printf '%s\n' "$semantic_original" >"$EVIDENCE_DIR/stream-controls-original.json"
SEMANTIC_COMPARISON_REQUIRED=true

checkpoint 'STREAM PARITY VERIFIED' \
  'Exercise every non-terminal control in docs/research/unified-android-game-overlay.md through the physical Korri gameplay overlay.' \
  'Restore every toggle, choice, and range to its recorded original value through that same product action; never edit app files.' \
  'Leave the same stream active after every reversible value visibly matches its original value.'
parity_controls_final="$(controls_for_launch "$parity_launch_id")"
semantic_final="$(semantic_control_values <<<"$parity_controls_final")"
printf '%s\n' "$semantic_final" >"$EVIDENCE_DIR/stream-controls-final.json"
if [[ "$semantic_final" != "$semantic_original" ]]; then
  diff -u "$EVIDENCE_DIR/stream-controls-original.json" \
    "$EVIDENCE_DIR/stream-controls-final.json" >"$EVIDENCE_DIR/stream-controls-recovery.diff" || true
  echo 'reversible gameplay controls were not restored to their semantic original values' >&2
  echo "recovery: restore every changed control through the Korri gameplay overlay; evidence is in $EVIDENCE_DIR" >&2
  exit 1
fi
SEMANTIC_VALUES_EQUAL=true

checkpoint 'STREAM TERMINALS VERIFIED' \
  'Use Disconnect and confirm Korri returns while the host game keeps running.' \
  'Reconnect and confirm moving host frames resume, then use Quit game on host and confirm termination.'
session_is_idle || { echo 'stream/host session is still active after terminal-control checkpoint' >&2; exit 1; }
assert_overlay_window absent
capture_evidence stream-after-host-quit '{"activeControls":[],"telemetry":"asserted session status is idle after host quit; reversible semantic values restored"}'
printf '%s\n' 'DECODER/HOST FAILURE: REPOSITORY-ONLY — deterministic repository tests cover these failures; this device run does not claim them as passed.'

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
assert_accessibility_service_enabled
capture_evidence permission-recovered '{"activeControls":[],"telemetry":"human grant recovery; no screenshot-only claim"}'

printf '\nPre-cutover overlay acceptance evidence captured at %s\n' "$EVIDENCE_DIR"
printf 'This run records evidence; it does not authorize cutover or claim parity by itself.\n'
