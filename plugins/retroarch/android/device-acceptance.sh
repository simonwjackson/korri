#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash coreutils curl diffutils gnugrep gnused imagemagick jq tesseract android-tools
# shellcheck shell=bash
set -euo pipefail

usage() {
  echo 'usage: device-acceptance.sh <adb-serial> <exact-device-model> <exact-hardware-serial>' >&2
  exit 2
}

[[ $# -eq 3 ]] || usage
SERIAL="$1"
EXPECTED_MODEL="$2"
EXPECTED_HARDWARE_SERIAL="$3"
[[ -n "$SERIAL" && -n "$EXPECTED_MODEL" && -n "$EXPECTED_HARDWARE_SERIAL" ]] || usage
KORRI_PACKAGE="${KORRI_PACKAGE:-com.simonwjackson.korri.debug}"
KORRI_ACTIVITY="$KORRI_PACKAGE/com.limelight.KorriShellActivity"
KORRI_GAME_COMPONENT="$KORRI_PACKAGE/com.limelight.Game"
FORK_PACKAGE="com.korri.retroarch"
STOCK_PACKAGE="com.retroarch.aarch64"
SYSTEM_DIR="/storage/emulated/0/korri/system"
STATES_ROOT_DIR="/storage/emulated/0/korri/states"
STATE_DIR="$STATES_ROOT_DIR/mGBA"
STATE_FILE="$STATE_DIR/wl4.state.auto"
SAVE_DIR="/storage/emulated/0/korri/saves"
SAVE_FILE="$SAVE_DIR/wl4.srm"
SCREENSHOTS_DIR="/storage/emulated/0/korri/screenshots"
HOST_PORT="${KORRI_ACCEPTANCE_HOST_PORT:-43119}"
ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
DEBUG_CAPABILITY_SH="${KORRI_ANDROID_DEBUG_CAPABILITY_SH:-$ROOT/services/korrid/android-debug-capability.sh}"
ANDROID_STORAGE_ROOT="/sdcard/korri"
CONFIG_REMOTE="$ANDROID_STORAGE_ROOT/config.yaml"
LIBRARY_REMOTE="$ANDROID_STORAGE_ROOT/library.yaml"
RETROARCH_CONFIG_REMOTE="$ANDROID_STORAGE_ROOT/retroarch.cfg"
CHECKPOINT_CONFIG="$ROOT/docs/research/retroarch-plugin-route/config.yaml"
CHECKPOINT_LIBRARY="$ROOT/docs/research/retroarch-plugin-route/library-wl4.yaml"
CHECKPOINT_BACKUP_DIR="$ANDROID_STORAGE_ROOT/.retroarch-route-check-backup-$$"
LOCK_REMOTE="$ANDROID_STORAGE_ROOT/.android-app-route-check.lock"
LOCK_OWNER_REMOTE="$LOCK_REMOTE/owner"
CONFIG_WAS_PRESENT=false
LIBRARY_WAS_PRESENT=false
RETROARCH_CONFIG_WAS_PRESENT=false
STATE_WAS_PRESENT=false
SAVE_WAS_PRESENT=false
SYSTEM_DIR_WAS_PRESENT=false
STATES_ROOT_DIR_WAS_PRESENT=false
STATE_DIR_WAS_PRESENT=false
SAVE_DIR_WAS_PRESENT=false
SCREENSHOTS_DIR_WAS_PRESENT=false
CHECKPOINT_RESTORE_NEEDED=false
FORWARD_ACTIVE=false
LOCK_ACQUIRED=false
TARGET_STARTED_BY_GATE=false
SHELL_BROUGHT_FORWARD=false
PORTAL_EVIDENCE_DIR=""
capability=""
GATE_CURRENT_LAUNCH=""
declare -A GATE_LAUNCH_IDS=()
declare -A GATE_RETROARCH_PIDS=()
KORRI_SERVICE_COMPONENT="$KORRI_PACKAGE/com.limelight.korri.overlay.KorriOverlayService"
ADB_BIN="$(command -v adb)"
adb() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

if [[ "$SERIAL" == *:* ]]; then
  timeout 15 adb connect "$SERIAL" >/dev/null || true
fi
ADB=(adb -s "$SERIAL")
if ! timeout 15 "${ADB[@]}" wait-for-device; then
  echo "Android target is not reachable: $SERIAL" >&2
  exit 1
fi
[[ "$("${ADB[@]}" get-state)" == device ]] || {
  echo "Android target is not ready: $SERIAL" >&2
  exit 1
}
ACTUAL_MODEL="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r\n')"
ACTUAL_HARDWARE_SERIAL="$("${ADB[@]}" shell getprop ro.serialno | tr -d '\r\n')"
[[ "$ACTUAL_MODEL" == "$EXPECTED_MODEL" ]] || {
  echo "device model mismatch: expected '$EXPECTED_MODEL', got '$ACTUAL_MODEL'" >&2
  exit 1
}
[[ "$ACTUAL_HARDWARE_SERIAL" == "$EXPECTED_HARDWARE_SERIAL" ]] || {
  echo "hardware serial mismatch: expected '$EXPECTED_HARDWARE_SERIAL', got '$ACTUAL_HARDWARE_SERIAL'" >&2
  exit 1
}

remote_state() {
  local path="$1"
  local state
  if ! state="$("${ADB[@]}" shell "if test -e '$path'; then echo present; else echo absent; fi" 2>/dev/null | tr -d '\r\n')"; then
    echo "failed to inspect device path $path" >&2
    return 1
  fi
  case "$state" in
    present | absent) printf '%s' "$state" ;;
    *)
      echo "unexpected device path state for $path: $state" >&2
      return 1
      ;;
  esac
}

package_pid() {
  local package="$1"
  local output
  if ! output="$("${ADB[@]}" shell "pidof '$package' || { status=\$?; [ \"\$status\" -eq 1 ] && exit 0; exit \"\$status\"; }" 2>/dev/null)"; then
    echo "failed to probe Android process state for $package" >&2
    return 1
  fi
  printf '%s' "$output" | tr -d '\r\n'
}

assert_accessibility_service_enabled() {
  local enabled_services
  enabled_services="$("${ADB[@]}" shell settings get secure enabled_accessibility_services | tr -d '\r')" || return 1
  grep -Fq "$KORRI_SERVICE_COMPONENT" <<<"$enabled_services" || {
    echo 'Korri gameplay overlay accessibility service is no longer enabled.' >&2
    echo 'Re-enable it manually in Android Settings before relying on Guide.' >&2
    return 1
  }
}

assert_shell_foreground() {
  "${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" \
    | grep -F "$KORRI_ACTIVITY" >/dev/null
}

assert_no_artemis_game_activity() {
  local resumed
  resumed="$("${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" | tr -d '\r')"
  if grep -Fq "$KORRI_GAME_COMPONENT" <<<"$resumed"; then
    echo 'RetroArch acceptance must not exercise Artemis Game or its SharedPreferences' >&2
    return 1
  fi
}

assert_korri_process_unchanged() {
  local current
  current="$(package_pid "$KORRI_PACKAGE")" || return 1
  [[ -n "$current" && "$current" == "$existing_korri_pid" ]] || {
    echo 'Korri PID changed during RetroArch acceptance' >&2
    return 1
  }
}

record_gate_launch() {
  local launch_id="$1"
  [[ -n "$launch_id" ]] || return 1
  GATE_LAUNCH_IDS["$launch_id"]=1
}

is_gate_launch() {
  [[ -n "${GATE_LAUNCH_IDS[$1]:-}" ]]
}

record_gate_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  GATE_RETROARCH_PIDS["$pid"]=1
}

new_logcat_marker() {
  local label="$1"
  local marker
  marker="korri-retroarch-acceptance-$label-$$-$(date -u +%s)"
  "${ADB[@]}" shell log -t KorriAcceptance "$marker" >/dev/null
  printf '%s' "$marker"
}

logcat_since() {
  local marker="$1"
  shift
  "${ADB[@]}" logcat -d "$@" \
    | awk -v marker="$marker" 'index($0, marker) { found = 1; next } found'
}

backup_path_if_present() {
  local path="$1"
  local backup_name="$2"
  local flag_name="$3"
  local state
  state="$(remote_state "$path")" || return 1
  if [[ "$state" == present ]]; then
    "${ADB[@]}" shell "cp '$path' '$CHECKPOINT_BACKUP_DIR/$backup_name' && cmp -s '$path' '$CHECKPOINT_BACKUP_DIR/$backup_name'"
    printf -v "$flag_name" true
  fi
}

record_directory_state() {
  local path="$1"
  local flag_name="$2"
  local state
  state="$(remote_state "$path")" || return 1
  if [[ "$state" == present ]]; then
    printf -v "$flag_name" true
  fi
}

acquire_device_lock() {
  if ! "${ADB[@]}" shell "mkdir -p '$ANDROID_STORAGE_ROOT' && if mkdir '$LOCK_REMOTE' 2>/dev/null; then printf '%s\n' 'pid=$$ started=$(date -u +%Y-%m-%dT%H:%M:%SZ)' > '$LOCK_OWNER_REMOTE'; else echo 'Korri config route lock is held at $LOCK_REMOTE. Remove it manually only after verifying no route check is running.' >&2; exit 75; fi"; then
    echo "RetroArch acceptance could not acquire the device config lock at $LOCK_REMOTE" >&2
    exit 1
  fi
  LOCK_ACQUIRED=true
}

release_device_lock() {
  if [[ "$LOCK_ACQUIRED" != true ]]; then
    return 0
  fi
  if ! "${ADB[@]}" shell "rm -rf '$LOCK_REMOTE'" >/dev/null 2>&1; then
    echo "RetroArch acceptance failed to release the device config lock at $LOCK_REMOTE" >&2
    return 1
  fi
  LOCK_ACQUIRED=false
}

restore_checkpoint_files() {
  local restore_failed=false
  local directory=""
  local directory_state
  if [[ "$CHECKPOINT_RESTORE_NEEDED" != true ]]; then
    return 0
  fi

  if [[ "$CONFIG_WAS_PRESENT" == true ]]; then
    "${ADB[@]}" shell "cp '$CHECKPOINT_BACKUP_DIR/config.yaml' '$CONFIG_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  else
    "${ADB[@]}" shell "rm -f '$CONFIG_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  fi
  if [[ "$LIBRARY_WAS_PRESENT" == true ]]; then
    "${ADB[@]}" shell "cp '$CHECKPOINT_BACKUP_DIR/library.yaml' '$LIBRARY_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  else
    "${ADB[@]}" shell "rm -f '$LIBRARY_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  fi
  if [[ "$RETROARCH_CONFIG_WAS_PRESENT" == true ]]; then
    "${ADB[@]}" shell "cp '$CHECKPOINT_BACKUP_DIR/retroarch.cfg' '$RETROARCH_CONFIG_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  else
    "${ADB[@]}" shell "rm -f '$RETROARCH_CONFIG_REMOTE'" >/dev/null 2>&1 || restore_failed=true
  fi
  if [[ "$STATE_WAS_PRESENT" == true ]]; then
    "${ADB[@]}" shell "mkdir -p '$STATE_DIR'; cp '$CHECKPOINT_BACKUP_DIR/wl4.state.auto' '$STATE_FILE'" >/dev/null 2>&1 || restore_failed=true
  else
    "${ADB[@]}" shell "rm -f '$STATE_FILE'" >/dev/null 2>&1 || restore_failed=true
  fi
  if [[ "$SAVE_WAS_PRESENT" == true ]]; then
    "${ADB[@]}" shell "mkdir -p '$SAVE_DIR'; cp '$CHECKPOINT_BACKUP_DIR/wl4.srm' '$SAVE_FILE'" >/dev/null 2>&1 || restore_failed=true
  else
    "${ADB[@]}" shell "rm -f '$SAVE_FILE'" >/dev/null 2>&1 || restore_failed=true
  fi
  for directory_state in \
    "$STATE_DIR_WAS_PRESENT:$STATE_DIR" \
    "$STATES_ROOT_DIR_WAS_PRESENT:$STATES_ROOT_DIR" \
    "$SAVE_DIR_WAS_PRESENT:$SAVE_DIR" \
    "$SCREENSHOTS_DIR_WAS_PRESENT:$SCREENSHOTS_DIR" \
    "$SYSTEM_DIR_WAS_PRESENT:$SYSTEM_DIR"; do
    if [[ "${directory_state%%:*}" == false ]]; then
      directory="${directory_state#*:}"
      "${ADB[@]}" shell "rmdir '$directory' 2>/dev/null || test ! -e '$directory'" >/dev/null 2>&1 || restore_failed=true
    fi
  done
  if [[ "$restore_failed" == true ]]; then
    echo "RetroArch acceptance failed to restore device data; backup retained at $CHECKPOINT_BACKUP_DIR" >&2
    return 1
  fi
  if ! "${ADB[@]}" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'" >/dev/null 2>&1; then
    echo "RetroArch acceptance restored device data but could not remove $CHECKPOINT_BACKUP_DIR" >&2
    return 1
  fi
  CHECKPOINT_RESTORE_NEEDED=false
}

cleanup() {
  local status=$?
  local cleanup_failed=false
  local safe_to_restore=true
  local target_pid=""
  local replacement_observed=false
  if [[ "$TARGET_STARTED_BY_GATE" == true ]]; then
    local active_launch=""
    local session=""
    if [[ "$FORWARD_ACTIVE" == true && -n "$capability" ]]; then
      session="$(rpc '{"_tag":"app.session.status","payload":{}}' 2>/dev/null || true)"
      active_launch="$(jq -r '.outcome.payload.active.launchId // empty' <<<"$session" 2>/dev/null || true)"
      if [[ -n "$active_launch" ]]; then
        if ! is_gate_launch "$active_launch"; then
          safe_to_restore=false
          replacement_observed=true
        else
          invoke_control "$active_launch" '@korri:retroarch/quit' >/dev/null 2>&1 || safe_to_restore=false
        fi
      fi
    fi
    if [[ "$replacement_observed" == false ]]; then
      if ! target_pid="$(package_pid "$FORK_PACKAGE")"; then
        safe_to_restore=false
      elif [[ -n "$target_pid" ]]; then
        if [[ -z "${GATE_RETROARCH_PIDS[$target_pid]:-}" ]]; then
          safe_to_restore=false
          replacement_observed=true
        elif ! "${ADB[@]}" shell am force-stop "$FORK_PACKAGE" >/dev/null 2>&1; then
          safe_to_restore=false
        fi
      fi
      if [[ "$replacement_observed" == false ]] \
        && { ! target_pid="$(package_pid "$FORK_PACKAGE")" || [[ -n "$target_pid" ]]; }; then
        safe_to_restore=false
      fi
    fi
    if [[ "$safe_to_restore" != true ]]; then
      echo "RetroArch acceptance could not quiesce the exact recorded launch; backup and lock retained at $CHECKPOINT_BACKUP_DIR and $LOCK_REMOTE" >&2
      cleanup_failed=true
    fi
  fi
  if [[ "$SHELL_BROUGHT_FORWARD" == true && "$replacement_observed" == false ]]; then
    "${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null 2>&1 || cleanup_failed=true
    for _ in $(seq 1 20); do
      assert_shell_foreground && break
      sleep 0.25
    done
    assert_shell_foreground || cleanup_failed=true
  fi
  if [[ -n "$PORTAL_EVIDENCE_DIR" && "$status" -eq 0 ]]; then
    rm -rf "$PORTAL_EVIDENCE_DIR"
  fi
  if [[ "$safe_to_restore" == true ]]; then
    if [[ "$CHECKPOINT_RESTORE_NEEDED" != true ]]; then
      "${ADB[@]}" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'" >/dev/null 2>&1 || cleanup_failed=true
      release_device_lock || cleanup_failed=true
    elif restore_checkpoint_files; then
      release_device_lock || cleanup_failed=true
    else
      cleanup_failed=true
    fi
  fi
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    "${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
    FORWARD_ACTIVE=false
  fi
  assert_accessibility_service_enabled || cleanup_failed=true
  if [[ "$cleanup_failed" == true && "$status" -eq 0 ]]; then
    status=1
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

provision_checkpoint_files() {
  acquire_device_lock
  "${ADB[@]}" shell "rm -rf '$CHECKPOINT_BACKUP_DIR'; mkdir -p '$CHECKPOINT_BACKUP_DIR'"
  backup_path_if_present "$CONFIG_REMOTE" config.yaml CONFIG_WAS_PRESENT
  backup_path_if_present "$LIBRARY_REMOTE" library.yaml LIBRARY_WAS_PRESENT
  backup_path_if_present "$RETROARCH_CONFIG_REMOTE" retroarch.cfg RETROARCH_CONFIG_WAS_PRESENT
  backup_path_if_present "$STATE_FILE" wl4.state.auto STATE_WAS_PRESENT
  backup_path_if_present "$SAVE_FILE" wl4.srm SAVE_WAS_PRESENT
  record_directory_state "$SYSTEM_DIR" SYSTEM_DIR_WAS_PRESENT
  record_directory_state "$STATES_ROOT_DIR" STATES_ROOT_DIR_WAS_PRESENT
  record_directory_state "$STATE_DIR" STATE_DIR_WAS_PRESENT
  record_directory_state "$SAVE_DIR" SAVE_DIR_WAS_PRESENT
  record_directory_state "$SCREENSHOTS_DIR" SCREENSHOTS_DIR_WAS_PRESENT
  # Every original path is now classified and every present file is verified in
  # the backup. Only now may cleanup interpret false flags as original absence.
  CHECKPOINT_RESTORE_NEEDED=true
  "${ADB[@]}" push "$CHECKPOINT_CONFIG" "$CONFIG_REMOTE" >/dev/null
  "${ADB[@]}" push "$CHECKPOINT_LIBRARY" "$LIBRARY_REMOTE" >/dev/null
  "${ADB[@]}" exec-out cat "$CONFIG_REMOTE" | cmp -s "$CHECKPOINT_CONFIG" - || {
    echo 'RetroArch acceptance config.yaml checkpoint mismatch' >&2
    exit 1
  }
  "${ADB[@]}" exec-out cat "$LIBRARY_REMOTE" | cmp -s "$CHECKPOINT_LIBRARY" - || {
    echo 'RetroArch acceptance library.yaml checkpoint mismatch' >&2
    exit 1
  }
}

stock_before="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
[[ "$stock_before" == package:* ]] || {
  echo 'stock RetroArch must be installed for the coexistence gate' >&2
  exit 1
}
if ! stock_pid="$(package_pid "$STOCK_PACKAGE")"; then
  exit 1
fi
[[ -z "$stock_pid" ]] || {
  echo 'stock RetroArch must be stopped before the coexistence gate' >&2
  exit 1
}
[[ "$("${ADB[@]}" shell pm path "$FORK_PACKAGE" 2>/dev/null || true)" == package:* ]] || {
  echo 'Korri RetroArch is not installed' >&2
  exit 1
}
if ! fork_pid="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ -z "$fork_pid" ]] || {
  echo 'Korri RetroArch must be stopped before acceptance can back up save state' >&2
  exit 1
}
assert_accessibility_service_enabled
existing_korri_pid="$(package_pid "$KORRI_PACKAGE")"
[[ -n "$existing_korri_pid" ]] || {
  echo 'Korri is not already running, so its live brain cannot be safely discovered.' >&2
  echo 'Open Korri normally, leave its Shell visible, and rerun this gate; do not force-stop or reinstall Korri.' >&2
  exit 1
}
provision_checkpoint_files
PORTAL_EVIDENCE_DIR="$(mktemp -d)"
permission_info="$("${ADB[@]}" shell dumpsys package permissions | \
  grep -A6 'Permission \[com.korri.retroarch.permission.LAUNCH\]' || true)"
grep -q 'sourcePackage=com.korri.retroarch' <<<"$permission_info"
grep -q 'prot=signature' <<<"$permission_info"

# The installed fork is the acceptance target. Do not install, clear, grant, or
# otherwise mutate its package state; build-time APK checks prove bundling and
# the launch below proves the already-installed core is fulfillable.
sdk_level="$("${ADB[@]}" shell getprop ro.build.version.sdk | tr -d '\r')"
if [[ "$sdk_level" -ge 30 ]]; then
  korri_storage_op="$("${ADB[@]}" shell appops get "$KORRI_PACKAGE" MANAGE_EXTERNAL_STORAGE 2>/dev/null | tr -d '\r' || true)"
  grep -q ': allow' <<<"$korri_storage_op" || {
    echo 'Korri all-files access must be granted before RetroArch acceptance' >&2
    exit 1
  }
fi
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null
SHELL_BROUGHT_FORWARD=true
foreground_korri_pid="$(package_pid "$KORRI_PACKAGE")"
assert_no_artemis_game_activity
[[ "$foreground_korri_pid" == "$existing_korri_pid" ]] || {
  echo 'Bringing Korri Shell forward changed the existing Korri process; refusing uncertain brain authority.' >&2
  echo 'Leave Korri open and rerun after confirming its accessibility service is still enabled. Do not force-stop or reinstall it.' >&2
  exit 1
}

# Deeper debug acceptance reads the bridge directly through WebView inspection;
# no secret crosses logcat. Prior logcat is retained and filtered to the exact
# existing Korri process before candidate endpoints are authenticated.
capability="${KORRI_ANDROID_DEBUG_CAPABILITY:-}"
if [[ -z "$capability" ]]; then
  capability="$("$DEBUG_CAPABILITY_SH" "$SERIAL" "$KORRI_PACKAGE")"
fi
port=''
discover_live_korri_authority() {
  local logs=''
  local portal_ready=''
  local candidate=''
  local health=''
  local -a candidates=()

  logs="$("${ADB[@]}" logcat -d --pid="$existing_korri_pid" -s KorridServer:I KorriPortal:I 2>/dev/null || true)"
  portal_ready="$(grep 'title="Korri"' <<<"$logs" | tail -1 || true)"
  [[ -n "$portal_ready" ]] || return 1
  mapfile -t candidates < <(
    sed -n 's/.*listening on 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' <<<"$logs" \
      | tac | awk '!seen[$0]++'
  )
  for candidate in "${candidates[@]}"; do
    [[ "$candidate" =~ ^[0-9]+$ && "$candidate" -ge 1024 && "$candidate" -le 65535 ]] || continue
    "${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
    "${ADB[@]}" forward "tcp:$HOST_PORT" "tcp:$candidate" >/dev/null || continue
    FORWARD_ACTIVE=true
    health="$(curl --fail --silent --show-error \
      --connect-timeout 2 --max-time 5 \
      -H 'content-type: application/json' \
      -H "authorization: Bearer $capability" \
      -d '{"_tag":"system.health","payload":{}}' \
      "http://127.0.0.1:$HOST_PORT/rpc" 2>/dev/null || true)"
    if jq -e '
      ._tag == "system.health"
      and .outcome._tag == "Ok"
      and (.outcome.payload.version | type == "string" and length > 0)
    ' <<<"$health" >/dev/null 2>&1; then
      port="$candidate"
      return 0
    fi
    "${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
    FORWARD_ACTIVE=false
  done
  return 1
}
for _ in $(seq 1 30); do
  discover_live_korri_authority && break
  sleep 1
done
[[ -n "$port" ]] || {
  echo 'No live Korri brain/portal authority could be safely discovered and validated.' >&2
  echo 'Open Korri normally, leave its Shell visible, and rerun; do not force-stop, reinstall, or clear Korri.' >&2
  exit 1
}
ACCEPTANCE_LOG_MARKER="$(new_logcat_marker gate-start)"
rpc() {
  curl --fail --silent --show-error \
    --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $capability" \
    -d "$1" "http://127.0.0.1:$HOST_PORT/rpc"
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
assert_old_launch_rejected() {
  local launch_id="$1"
  local controls
  local invocation
  controls="$(controls_for_launch "$launch_id")"
  invocation="$(invoke_control "$launch_id" '@korri:retroarch/quit')"
  jq -e '.outcome._tag == "Err" and (.outcome.payload.reason == "StaleSession" or .outcome.payload.reason == "Unavailable")' <<<"$controls" >/dev/null
  jq -e '.outcome._tag == "Err" and (.outcome.payload.reason == "StaleSession" or .outcome.payload.reason == "Unavailable")' <<<"$invocation" >/dev/null
}
local_games="$(rpc '{"_tag":"app.local-games.list","payload":{}}')"
if ! jq -e '
  .outcome._tag == "Ok"
  and (.outcome.payload.failures | not)
  and (.outcome.payload.games | length == 1)
  and .outcome.payload.games[0].id == "wl4"
  and .outcome.payload.games[0].title == "Wario Land 4"
' <<<"$local_games" >/dev/null; then
  echo "RetroArch acceptance did not load the one-item Wario fixture: $local_games" >&2
  exit 1
fi
session="$(rpc '{"_tag":"app.session.status","payload":{}}')"
if grep -q '"active":{' <<<"$session"; then
  echo 'host streaming session is active; stop it before local-runtime acceptance' >&2
  exit 1
fi

assert_udp_probe_ready() {
  local tools
  tools="$("${ADB[@]}" shell toybox | tr ', ' '\n')" || return 1
  for tool in dd timeout nc; do
    grep -qx "$tool" <<<"$tools" || {
      echo "required Android toybox tool is unavailable: $tool" >&2
      return 1
    }
  done
}

udp_unauthenticated() {
  local port="$1"
  timeout 15 "$ADB_BIN" -s "$SERIAL" shell \
    "toybox dd if=/dev/zero bs=66 count=1 2>/dev/null | toybox timeout 2 nc -4 -u -q 1 127.0.0.1 '$port'" 2>&1 | tr -d '\r'
}
wait_playing() {
  local pid=''
  for _ in $(seq 1 30); do
    if ! pid="$(package_pid "$FORK_PACKAGE")"; then
      return 1
    fi
    [[ -n "$pid" ]] && {
      printf 'RetroArch process %s\n' "$pid"
      return 0
    }
    sleep 1
  done
  echo 'fork process did not become live' >&2
  return 1
}
press_guide() {
  "${ADB[@]}" shell input -d 0 keyevent KEYCODE_BUTTON_MODE
  sleep 1
}
invoke_overlay_row() {
  local rows_after_resume="$1"
  press_guide
  for _ in $(seq 1 "$rows_after_resume"); do
    "${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_DOWN
  done
  "${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_CENTER
  sleep 1
}
authenticated_retroarch_status() {
  local launch_id="$1"
  local controls
  controls="$(controls_for_launch "$launch_id")"
  jq -ce --arg launch_id "$launch_id" '
    .outcome._tag == "Ok"
    and .outcome.payload.launchId == $launch_id
    and .outcome.payload.retroarchTelemetry.contentBasename == "wl4.gba"
    and (.outcome.payload.retroarchTelemetry.crc32 | type == "string" and length > 0)
    | if . then input_filename else error("invalid authenticated RetroArch telemetry") end
  ' <<<"$controls" >/dev/null || {
    echo "RetroArch authenticated status telemetry was invalid: $controls" >&2
    return 1
  }
  jq -c '.outcome.payload.retroarchTelemetry' <<<"$controls"
}
assert_menu_status() {
  local expected="$1"
  local status
  status="$(authenticated_retroarch_status "$GATE_CURRENT_LAUNCH")"
  jq -e --argjson expected "$expected" '.menuAlive == $expected' <<<"$status" >/dev/null || {
    echo "RetroArch menu telemetry did not report menu=$expected: $status" >&2
    return 1
  }
}
assert_selection_advanced() {
  local before="$1"
  local status
  local after
  status="$(authenticated_retroarch_status "$GATE_CURRENT_LAUNCH")"
  after="$(jq -r '.menuSelection' <<<"$status")"
  [[ "$before" =~ ^[0-9]+$ && "$after" -eq $((before + 1)) ]] || {
    echo "RetroArch menu selection did not advance exactly once: before=$before after=$after" >&2
    return 1
  }
}
capture_rgui_evidence() {
  local label="$1"
  local image="$PORTAL_EVIDENCE_DIR/$label.png"
  "${ADB[@]}" exec-out screencap -p >"$image"
}
assert_overlay_window_absent() {
  if "${ADB[@]}" shell dumpsys window windows | grep -Fq 'Korri gameplay overlay'; then
    echo 'Korri accessibility overlay remained present after RetroArch acknowledgement' >&2
    return 1
  fi
}
wait_stopped() {
  local pid=""
  for _ in $(seq 1 20); do
    if ! pid="$(package_pid "$FORK_PACKAGE")"; then
      return 1
    fi
    [[ -z "$pid" ]] && return 0
    sleep 0.5
  done
  echo 'fork did not stop after graceful QUIT' >&2
  return 1
}
reset_portal_selection_to_top() {
  for _ in $(seq 1 12); do
    "${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_UP
  done
}
portal_shot_focuses_wario() {
  local label="$1"
  local image="$PORTAL_EVIDENCE_DIR/$label.png"
  local deskewed="$PORTAL_EVIDENCE_DIR/$label.ocr.png"
  local text="$PORTAL_EVIDENCE_DIR/$label.ocr.txt"
  local tsv="$PORTAL_EVIDENCE_DIR/$label.ocr.tsv"
  local left=""
  local top=""
  local width=""
  local height=""
  local sample_x
  local sample_y
  local brightness
  "${ADB[@]}" exec-out screencap -p >"$image"
  magick "$image" -deskew 40% "$deskewed"
  tesseract "$deskewed" stdout --psm 6 >"$text" 2>/dev/null
  tesseract "$deskewed" stdout --psm 6 tsv >"$tsv" 2>/dev/null
  if ! grep -qi 'wario' "$text" || ! grep -qi 'land' "$text"; then
    return 1
  fi
  read -r left top width height < <(
    awk -F '\t' 'tolower($12) == "wario" { print $7, $8, $9, $10; exit }' "$tsv"
  )
  [[ "$left" =~ ^[0-9]+$ && "$top" =~ ^[0-9]+$ && "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || return 1
  sample_x=$((left > 12 ? left - 12 : left + width + 12))
  sample_y=$((top + height / 2))
  brightness="$(magick "$deskewed" -crop "1x1+$sample_x+$sample_y" -format '%[fx:round(100*(r+g+b)/3)]' info:)"
  [[ "$brightness" =~ ^[0-9]+$ && "$brightness" -ge 60 ]]
}
launch_wario_entry() {
  local label="$1"
  local attempt
  local pid=""
  # Storage access and session checks above remove the only entries that may
  # precede local games. Reset retained selection to the semantic top, require
  # OCR evidence for the one configured Wario route, then confirm it.
  for attempt in $(seq 1 10); do
    reset_portal_selection_to_top
    sleep 1
    if portal_shot_focuses_wario "$label-$attempt"; then
      TARGET_STARTED_BY_GATE=true
      "${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_CENTER
      sleep 2
      if ! pid="$(package_pid "$FORK_PACKAGE")"; then
        return 1
      fi
      if [[ -n "$pid" ]]; then
        local observed_session
        local observed_controls
        GATE_CURRENT_LAUNCH=""
        observed_session="$(rpc '{"_tag":"app.session.status","payload":{}}')"
        GATE_CURRENT_LAUNCH="$(jq -er '.outcome.payload.active.launchId' <<<"$observed_session")"
        record_gate_launch "$GATE_CURRENT_LAUNCH"
        record_gate_pid "$pid"
        observed_controls="$(controls_for_launch "$GATE_CURRENT_LAUNCH")"
        if grep -q 'KORRI_CONTROL_TOKEN' <<<"$observed_session$observed_controls"; then
          echo 'private RetroArch control authority leaked into actual launch evidence' >&2
          return 1
        fi
        return 0
      fi
    fi
  done
  echo "portal did not semantically select Wario; evidence is in $PORTAL_EVIDENCE_DIR" >&2
  return 1
}

enabled_accessibility_services="$("${ADB[@]}" shell settings get secure enabled_accessibility_services | tr -d '\r')"
if ! grep -q 'com.limelight.korri.overlay.KorriOverlayService' \
    <<<"$enabled_accessibility_services"; then
  echo 'Korri gameplay overlay accessibility service must be enabled by the device owner' >&2
  echo 'acceptance will not modify Android accessibility settings' >&2
  exit 1
fi

launch_wario_entry first
status_first="$(wait_playing)"
if ! pid_first="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ -n "$pid_first" ]] || { echo 'fork process is missing after launch' >&2; exit 1; }
record_gate_pid "$pid_first"
assert_no_artemis_game_activity

# Loopback is transport, not authority. The launch-derived endpoint is visible
# in Korri's generated config, but an exact-size unauthenticated frame receives
# no response and cannot forge a command.
control_port="$("${ADB[@]}" shell "grep '^network_cmd_port = ' '$RETROARCH_CONFIG_REMOTE'" | tr -cd '0-9')"
[[ "$control_port" =~ ^[0-9]+$ && "$control_port" -ge 49152 && "$control_port" -le 65535 ]]
assert_udp_probe_ready
set +e
udp_output="$(udp_unauthenticated "$control_port")"
udp_rc=$?
set -e
if [[ "$udp_rc" -ne 124 || -n "$udp_output" ]]; then
  echo "unauthenticated UDP probe must time out with rc=124 and no response; rc=$udp_rc output=$udp_output" >&2
  exit 1
fi
if ! current_pid="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ "$current_pid" == "$pid_first" ]]

# Non-destructive native-menu journey. Authenticated, MAC-covered GET_STATUS
# telemetry is the pass criterion; screenshots are retained only as supporting
# evidence. SHOW_MENU must acknowledge before the portal removes its window.
assert_menu_status 0
invoke_overlay_row 1
assert_overlay_window_absent
assert_menu_status 1
menu_selection_before="$(authenticated_retroarch_status "$GATE_CURRENT_LAUNCH" | jq -r '.menuSelection')"
capture_rgui_evidence retroarch-rgui-before-move
"${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_DOWN
sleep 0.5
assert_selection_advanced "$menu_selection_before"
capture_rgui_evidence retroarch-rgui-after-move
"${ADB[@]}" shell input -d 0 keyevent KEYCODE_BACK
sleep 1
assert_menu_status 0
# This configured native shortcut key is sent after the Korri overlay has
# dismissed; it must not independently reopen RetroArch's menu.
"${ADB[@]}" shell input -d 0 keyevent KEYCODE_BUTTON_SELECT
sleep 0.5
assert_menu_status 0
capture_rgui_evidence retroarch-safe-key
if ! current_pid="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ "$current_pid" == "$pid_first" ]]
press_guide
"${ADB[@]}" shell input -d 0 keyevent KEYCODE_DPAD_CENTER
sleep 1

# Android pause must synchronously replace the auto-state before suspension.
before_mtime="$("${ADB[@]}" shell stat -c %Y "$STATE_FILE" 2>/dev/null | tr -d '\r' || printf 0)"
sleep 1
"${ADB[@]}" shell input -d 0 keyevent KEYCODE_HOME
for _ in $(seq 1 20); do
  after_mtime="$("${ADB[@]}" shell stat -c %Y "$STATE_FILE" 2>/dev/null | tr -d '\r' || printf 0)"
  state_size="$("${ADB[@]}" shell stat -c %s "$STATE_FILE" 2>/dev/null | tr -d '\r' || printf 0)"
  [[ "$after_mtime" -gt "$before_mtime" && "$state_size" -gt 0 ]] && break
  sleep 0.25
done
[[ "${after_mtime:-0}" -gt "$before_mtime" && "${state_size:-0}" -gt 0 ]] || {
  echo 'Android pause did not synchronously refresh the auto-state' >&2
  exit 1
}
"${ADB[@]}" shell am force-stop "$FORK_PACKAGE"
pause_error_logs="$(logcat_since "$ACCEPTANCE_LOG_MARKER" -s KorriAcceptance:I DEBUG:E AndroidRuntime:E)"
if grep -qE 'Fatal signal|FATAL EXCEPTION' <<<"$pause_error_logs"; then
  echo 'runtime emitted a fatal process error during pause acceptance' >&2
  exit 1
fi

# Relaunch through Korri again; verbose runtime logging proves the non-empty
# auto-state was loaded successfully rather than merely left on disk.
AUTO_LOAD_LOG_MARKER="$(new_logcat_marker auto-load)"
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null
launch_wario_entry second
status_second="$(wait_playing)"
assert_no_artemis_game_activity
"${ADB[@]}" shell "test -s '$STATE_FILE'"
auto_load_log="$(logcat_since "$AUTO_LOAD_LOG_MARKER" 2>/dev/null | \
  grep -F '[State] Auto-loading save state from' | \
  grep -F "$STATE_FILE" | grep 'succeeded' | tail -1 || true)"
[[ -n "$auto_load_log" ]] || {
  echo 'relaunch did not report a successful auto-state load' >&2
  exit 1
}

before_quit_mtime="$("${ADB[@]}" shell stat -c %Y "$STATE_FILE" | tr -d '\r')"
sleep 1
# Resume is row zero, Open RetroArch menu is row one, and destructive Quit is row two.
# Completion requires the explicit native QUIT acknowledgement before the sheet dismisses.
quit_launch_id="$GATE_CURRENT_LAUNCH"
invoke_overlay_row 2
wait_stopped
for _ in $(seq 1 20); do
  quit_session="$(rpc '{"_tag":"app.session.status","payload":{}}')"
  jq -e '.outcome._tag == "Ok" and (.outcome.payload.active | not)' <<<"$quit_session" >/dev/null && break
  sleep 0.25
done
jq -e '.outcome._tag == "Ok" and (.outcome.payload.active | not)' <<<"$quit_session" >/dev/null || {
  echo 'active launch did not become idle after Quit' >&2
  exit 1
}
assert_old_launch_rejected "$quit_launch_id"
after_quit_mtime="$("${ADB[@]}" shell stat -c %Y "$STATE_FILE" | tr -d '\r')"
[[ "$after_quit_mtime" -gt "$before_quit_mtime" ]] || {
  echo 'graceful QUIT did not refresh the auto-state' >&2
  exit 1
}
display_zero="$("${ADB[@]}" shell dumpsys window displays | \
  sed -n '/Display: mDisplayId=0/,/Display: mDisplayId=[1-9]/p')"
resumed="$(grep 'mCurrentFocus=' <<<"$display_zero" | head -1 || true)"
grep -q "$KORRI_PACKAGE/com.limelight.KorriShellActivity" <<<"$resumed" || {
  echo "Korri did not resume on display 0 after graceful quit: $resumed" >&2
  exit 1
}
if ! stock_pid="$(package_pid "$STOCK_PACKAGE")"; then
  exit 1
fi
[[ -z "$stock_pid" ]] || {
  echo 'acceptance unexpectedly left stock RetroArch running' >&2
  exit 1
}
stock_after="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
[[ "$stock_after" == "$stock_before" ]] || {
  echo 'stock RetroArch package path changed during acceptance' >&2
  exit 1
}
acceptance_error_logs="$(logcat_since "$ACCEPTANCE_LOG_MARKER" -s KorriAcceptance:I DEBUG:E AndroidRuntime:E)"
if grep -qE 'Fatal signal|FATAL EXCEPTION' <<<"$acceptance_error_logs"; then
  echo 'runtime emitted a fatal process error during acceptance' >&2
  exit 1
fi
assert_accessibility_service_enabled
assert_korri_process_unchanged
assert_no_artemis_game_activity

printf 'First launch: %s\n' "$status_first"
printf 'Pause state: %s bytes at %s\n' "$state_size" "$after_mtime"
printf 'Relaunch: %s\n' "$status_second"
printf 'Auto-load: %s\n' "$auto_load_log"
printf 'Quit state refreshed at: %s\n' "$after_quit_mtime"
printf 'Graceful return: %s\n' "$resumed"
printf 'Stock RetroArch preserved: %s\n' "$stock_after"
