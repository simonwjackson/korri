#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash coreutils curl gnugrep gnused android-tools
set -euo pipefail

SERIAL="${1:-${ANDROID_SERIAL:-}}"
KORRI_PACKAGE="${KORRI_PACKAGE:-com.simonwjackson.korri.debug}"
KORRI_ACTIVITY="$KORRI_PACKAGE/com.limelight.KorriShellActivity"
FORK_PACKAGE="com.korri.retroarch"
STOCK_PACKAGE="com.retroarch.aarch64"
STATE_FILE="/storage/emulated/0/korri-retro/states/mGBA/wl4.state.auto"
HOST_PORT="${KORRI_ACCEPTANCE_HOST_PORT:-43119}"

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

stock_before="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
[[ "$stock_before" == package:* ]] || {
  echo 'stock RetroArch must be installed for the coexistence gate' >&2
  exit 1
}
[[ -z "$("${ADB[@]}" shell pidof "$STOCK_PACKAGE" | tr -d '\r')" ]] || {
  echo 'stock RetroArch must be stopped before the coexistence gate' >&2
  exit 1
}
[[ "$("${ADB[@]}" shell pm path "$FORK_PACKAGE" 2>/dev/null || true)" == package:* ]] || {
  echo 'Korri RetroArch is not installed' >&2
  exit 1
}
permission_info="$("${ADB[@]}" shell dumpsys package permissions | \
  grep -A6 'Permission \[com.korri.retroarch.permission.LAUNCH\]' || true)"
grep -q 'sourcePackage=com.korri.retroarch' <<<"$permission_info"
grep -q 'prot=signature' <<<"$permission_info"

# Wipe only fork-private data so this run must extract the APK-bundled core.
# External ROM/config/save data and stock RetroArch remain untouched.
"${ADB[@]}" shell pm clear "$FORK_PACKAGE" >/dev/null
"${ADB[@]}" shell pm grant "$FORK_PACKAGE" android.permission.READ_EXTERNAL_STORAGE \
  >/dev/null 2>&1 || true
"${ADB[@]}" shell pm grant "$FORK_PACKAGE" android.permission.WRITE_EXTERNAL_STORAGE \
  >/dev/null 2>&1 || true
"${ADB[@]}" shell am force-stop "$FORK_PACKAGE"
"${ADB[@]}" shell am force-stop "$KORRI_PACKAGE"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null

port=''
capability=''
portal_ready=''
for _ in $(seq 1 30); do
  logs="$("${ADB[@]}" logcat -d -s KorridServer:I KorriPortal:I 2>/dev/null || true)"
  port="$(sed -n 's/.*listening on 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' <<<"$logs" | tail -1)"
  capability="$(sed -n 's/.*debug capability=\([0-9a-f][0-9a-f]*\).*/\1/p' <<<"$logs" | tail -1)"
  portal_ready="$(grep 'title="Korri"' <<<"$logs" | tail -1 || true)"
  [[ -n "$port" && -n "$capability" && -n "$portal_ready" ]] && break
  sleep 1
done
[[ -n "$port" && -n "$capability" && -n "$portal_ready" ]] || {
  echo 'Korri portal or embedded korrid did not become ready' >&2
  exit 1
}
"${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
"${ADB[@]}" forward "tcp:$HOST_PORT" "tcp:$port" >/dev/null
cleanup() {
  "${ADB[@]}" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
}
trap cleanup EXIT
rpc() {
  curl --fail --silent --show-error \
    --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $capability" \
    -d "$1" "http://127.0.0.1:$HOST_PORT/rpc"
}
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
  for _ in $(seq 1 20); do
    [[ -z "$("${ADB[@]}" shell pidof "$FORK_PACKAGE" | tr -d '\r')" ]] && return 0
    sleep 0.5
  done
  echo 'fork did not stop after graceful QUIT' >&2
  return 1
}
launch_first_entry() {
  # The page title precedes completion of the async source fold. Retry confirm
  # only while no fork process exists, so a slow host-status request cannot
  # turn one intended launch into multiple standard activities.
  for _ in $(seq 1 10); do
    "${ADB[@]}" shell input -d 0 keyevent KEYCODE_ENTER
    sleep 2
    [[ -n "$("${ADB[@]}" shell pidof "$FORK_PACKAGE" | tr -d '\r')" ]] && return 0
  done
  echo 'portal did not launch the first local-game entry' >&2
  return 1
}

# Wario Land 4 is the first entry when there is no active host session.
launch_first_entry
status_first="$(wait_playing)"
pid_first="$("${ADB[@]}" shell pidof "$FORK_PACKAGE" | tr -d '\r')"
[[ -n "$pid_first" ]] || { echo 'fork process is missing after launch' >&2; exit 1; }

# Loopback is transport, not authority: blank/stale tokens and extra verbs fail closed.
stale_token="${token%?}$([[ "${token: -1}" == 0 ]] && printf 1 || printf 0)"
[[ -z "$(udp 'GET_STATUS' || true)" ]]
[[ -z "$(udp "$stale_token GET_STATUS" || true)" ]]
[[ -z "$(udp "$token VERSION" || true)" ]]
[[ "$("${ADB[@]}" shell pidof "$FORK_PACKAGE" | tr -d '\r')" == "$pid_first" ]]

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
if "${ADB[@]}" logcat -d -s DEBUG:E AndroidRuntime:E 2>/dev/null | \
    grep -qE 'Fatal signal|FATAL EXCEPTION'; then
  echo 'runtime emitted a fatal process error during pause acceptance' >&2
  exit 1
fi
"${ADB[@]}" logcat -c

# Relaunch through Korri again; verbose runtime logging proves the non-empty
# auto-state was loaded successfully rather than merely left on disk.
"${ADB[@]}" shell am start --display 0 -n "$KORRI_ACTIVITY" >/dev/null
launch_first_entry
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
[[ -z "$("${ADB[@]}" shell pidof "$STOCK_PACKAGE" | tr -d '\r')" ]] || {
  echo 'acceptance unexpectedly left stock RetroArch running' >&2
  exit 1
}
stock_after="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
[[ "$stock_after" == "$stock_before" ]] || {
  echo 'stock RetroArch package path changed during acceptance' >&2
  exit 1
}
if "${ADB[@]}" logcat -d -s DEBUG:E AndroidRuntime:E 2>/dev/null | grep -qE 'Fatal signal|FATAL EXCEPTION'; then
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
