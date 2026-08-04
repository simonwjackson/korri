#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash coreutils curl diffutils gnugrep gnused imagemagick jq tesseract android-tools
# shellcheck shell=bash
set -euo pipefail

SERIAL="${1:-${ANDROID_SERIAL:-}}"
KORRI_PACKAGE="${KORRI_PACKAGE:-com.simonwjackson.korri.debug}"
KORRI_ACTIVITY="$KORRI_PACKAGE/com.limelight.KorriShellActivity"
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
PORTAL_EVIDENCE_DIR=""
ADB_BIN="$(command -v adb)"
adb() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

if [[ -z "$SERIAL" ]]; then
  echo 'usage: device-acceptance.sh <adb-serial> (or set ANDROID_SERIAL)' >&2
  exit 2
fi
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
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    "${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
  fi
  "${ADB[@]}" shell rm -f /sdcard/korri-acceptance.png >/dev/null 2>&1 || true
  if [[ "$TARGET_STARTED_BY_GATE" == true ]]; then
    if ! "${ADB[@]}" shell am force-stop "$FORK_PACKAGE" >/dev/null 2>&1; then
      safe_to_restore=false
    fi
    if ! target_pid="$(package_pid "$FORK_PACKAGE")"; then
      safe_to_restore=false
    elif [[ -n "$target_pid" ]]; then
      safe_to_restore=false
    fi
    if [[ "$safe_to_restore" != true ]]; then
      echo "RetroArch acceptance could not quiesce the target; backup and lock retained at $CHECKPOINT_BACKUP_DIR and $LOCK_REMOTE" >&2
      cleanup_failed=true
    fi
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
"${ADB[@]}" shell am force-stop "$KORRI_PACKAGE"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null

port=''
portal_ready=''
for _ in $(seq 1 30); do
  logs="$("${ADB[@]}" logcat -d -s KorridServer:I KorriPortal:I 2>/dev/null || true)"
  port="$(sed -n 's/.*listening on 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' <<<"$logs" | tail -1)"
  portal_ready="$(grep 'title="Korri"' <<<"$logs" | tail -1 || true)"
  [[ -n "$port" && -n "$portal_ready" ]] && break
  sleep 1
done
[[ -n "$port" && -n "$portal_ready" ]] || {
  echo 'Korri portal or embedded korrid did not become ready' >&2
  exit 1
}

# Deeper debug acceptance reads the bridge directly through WebView inspection;
# readiness above never depends on a bearer and no secret crosses logcat.
capability="${KORRI_ANDROID_DEBUG_CAPABILITY:-}"
if [[ -z "$capability" ]]; then
  capability="$("$DEBUG_CAPABILITY_SH" "$SERIAL" "$KORRI_PACKAGE")"
fi
"${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
"${ADB[@]}" forward "tcp:$HOST_PORT" "tcp:$port" >/dev/null
FORWARD_ACTIVE=true
rpc() {
  curl --fail --silent --show-error \
    --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $capability" \
    -d "$1" "http://127.0.0.1:$HOST_PORT/rpc"
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
launch_spec="$(rpc '{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}')"
token="$(sed -n 's/.*"KORRI_CONTROL_TOKEN":"\([0-9a-f]\{64\}\)".*/\1/p' <<<"$launch_spec")"
[[ ${#token} == 64 ]] || {
  echo 'signed launch spec did not contain a 64-character control token' >&2
  exit 1
}
session="$(rpc '{"_tag":"app.session.status","payload":{}}')"
if grep -q '"active":{' <<<"$session"; then
  echo 'host streaming session is active; stop it before local-runtime acceptance' >&2
  exit 1
fi

udp() {
  local payload="$1"
  "${ADB[@]}" shell "printf '%s\\n' '$payload' | toybox timeout 2 nc -4 -u -q 1 127.0.0.1 55355" 2>/dev/null | tr -d '\r'
}
wait_playing() {
  local response=''
  for _ in $(seq 1 30); do
    response="$(udp "$token GET_STATUS" || true)"
    grep -q '^GET_STATUS PLAYING mGBA,wl4,crc32=' <<<"$response" && {
      printf '%s\n' "$response"
      return 0
    }
    sleep 1
  done
  echo "fork did not report PLAYING: ${response:-no response}" >&2
  return 1
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
  "${ADB[@]}" shell screencap -p /sdcard/korri-acceptance.png >/dev/null
  "${ADB[@]}" pull /sdcard/korri-acceptance.png "$image" >/dev/null
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
      [[ -n "$pid" ]] && return 0
    fi
  done
  echo "portal did not semantically select Wario; evidence is in $PORTAL_EVIDENCE_DIR" >&2
  return 1
}

launch_wario_entry first
status_first="$(wait_playing)"
if ! pid_first="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ -n "$pid_first" ]] || { echo 'fork process is missing after launch' >&2; exit 1; }

# Loopback is transport, not authority: blank/stale tokens and extra verbs fail closed.
stale_token="${token%?}$([[ "${token: -1}" == 0 ]] && printf 1 || printf 0)"
[[ -z "$(udp 'GET_STATUS' || true)" ]]
[[ -z "$(udp "$stale_token GET_STATUS" || true)" ]]
[[ -z "$(udp "$token VERSION" || true)" ]]
if ! current_pid="$(package_pid "$FORK_PACKAGE")"; then
  exit 1
fi
[[ "$current_pid" == "$pid_first" ]]

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
pause_error_logs="$("${ADB[@]}" logcat -d -s DEBUG:E AndroidRuntime:E)"
if grep -qE 'Fatal signal|FATAL EXCEPTION' <<<"$pause_error_logs"; then
  echo 'runtime emitted a fatal process error during pause acceptance' >&2
  exit 1
fi
"${ADB[@]}" logcat -c

# Relaunch through Korri again; verbose runtime logging proves the non-empty
# auto-state was loaded successfully rather than merely left on disk.
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null
launch_wario_entry second
status_second="$(wait_playing)"
"${ADB[@]}" shell "test -s '$STATE_FILE'"
auto_load_log="$("${ADB[@]}" logcat -d 2>/dev/null | \
  grep -F '[State] Auto-loading save state from' | \
  grep -F "$STATE_FILE" | grep 'succeeded' | tail -1 || true)"
[[ -n "$auto_load_log" ]] || {
  echo 'relaunch did not report a successful auto-state load' >&2
  exit 1
}

before_quit_mtime="$("${ADB[@]}" shell stat -c %Y "$STATE_FILE" | tr -d '\r')"
sleep 1
udp "$token QUIT" >/dev/null || true
wait_stopped
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
acceptance_error_logs="$("${ADB[@]}" logcat -d -s DEBUG:E AndroidRuntime:E)"
if grep -qE 'Fatal signal|FATAL EXCEPTION' <<<"$acceptance_error_logs"; then
  echo 'runtime emitted a fatal process error during acceptance' >&2
  exit 1
fi

printf 'First launch: %s\n' "$status_first"
printf 'Pause state: %s bytes at %s\n' "$state_size" "$after_mtime"
printf 'Relaunch: %s\n' "$status_second"
printf 'Auto-load: %s\n' "$auto_load_log"
printf 'Quit state refreshed at: %s\n' "$after_quit_mtime"
printf 'Graceful return: %s\n' "$resumed"
printf 'Stock RetroArch preserved: %s\n' "$stock_after"
