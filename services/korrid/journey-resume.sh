#!/usr/bin/env bash
# Prove that Korri's installed Android-app route reaches the real game and that
# the measured Home/task-switch journey resumes it. Back is deliberately absent:
# Android finishes a root activity on Back, so it cannot be resume evidence.
#
# Two things must both hold. The process id must survive the round trip, and
# the game must actually be on screen afterwards. Checking only the pid is a
# trap: Android keeps recently-used processes cached, so a dead activity can
# leave a live process behind and make a failure look like a success.
#
# Requires granted storage access and checkpoint config loaded: TMNT must be the
# first local-game entry in the portal.
set -euo pipefail

SERIAL="${1:?usage: journey-resume.sh <adb-serial> [package] [tap-x tap-y]}"
GAME="${2:-com.playdigious.tmnt}"
# shellcheck disable=SC2034 # Backward-compatible positional args; launch is D-pad based now.
TAP_X="${3:-539}"
# shellcheck disable=SC2034 # Backward-compatible positional args; launch is D-pad based now.
TAP_Y="${4:-882}"
KORRI=com.simonwjackson.korri.debug
SHOTS="${SHOTS:-/tmp/korri-journey}"
ADB=(adb -s "$SERIAL")

mkdir -p "$SHOTS"
[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device
if ! "${ADB[@]}" shell pm path "$GAME" | grep -q '^package:'; then
  echo "FAILED: required game package is not installed: $GAME"
  exit 1
fi

# Fixed tap targets only make sense in a known orientation, and a landscape
# game leaves the device rotated. Pin portrait for the run, restore after.
PRIOR_AUTO="$("${ADB[@]}" shell settings get system accelerometer_rotation | tr -d "\r\n")"
"${ADB[@]}" shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0"
restore_rotation() { "${ADB[@]}" shell "settings put system accelerometer_rotation ${PRIOR_AUTO:-1}" >/dev/null 2>&1 || true; }
trap restore_rotation EXIT

pid_of() { "${ADB[@]}" shell "pidof $GAME" 2>/dev/null | tr -d '\r\n'; }
top_of() {
  "${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity" \
    | sed 's/.*u0 //; s/ .*//' | tr -d '\r\n'
}
shot() { "${ADB[@]}" shell "screencap -p /sdcard/j.png" >/dev/null && "${ADB[@]}" pull /sdcard/j.png "$SHOTS/$1.png" >/dev/null; }
note() { printf '%-30s pid=%-8s top=%s\n' "$1" "$(pid_of)" "$(top_of)"; }

step() { # label, wait
  sleep "$2"
  note "$1"
  shot "$1"
}

open_korri() {
  "${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
}
open_selected_local_game() {
  # Orientation-independent: a landscape game leaves the device rotated, so
  # fixed tap points miss. With granted storage, checkpoint config, and no
  # active host banner, TMNT is the first local-game entry.
  "${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
}
assert_top_contains() {
  local label="$1"
  local expected="$2"
  local top
  top="$(top_of)"
  if [[ "$top" != *"$expected"* ]]; then
    echo "FAILED: $label did not reach $expected (top=$top)"
    echo "        see $SHOTS/$label.png"
    exit 1
  fi
}

INITIAL_PID="$(pid_of)"
echo "== portal launch"
"${ADB[@]}" shell "am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
open_korri
step "1-korri-home" 7
assert_top_contains "1-korri-home" "$KORRI"

open_selected_local_game
step "2-game-first" 20
assert_top_contains "2-game-first" "$GAME"
FIRST="$(pid_of)"
if [[ -z "$FIRST" ]]; then
  echo "FAILED: first launch reached $GAME on screen but produced no process evidence"
  exit 1
fi
if [[ -n "$INITIAL_PID" && "$INITIAL_PID" == "$FIRST" ]]; then
  echo "NOTE: $GAME was already resident before launch; using pid $FIRST as resume identity."
fi

"${ADB[@]}" shell "input keyevent KEYCODE_HOME"
step "3-home-away" 4

# Return by task switching/relaunching Korri, not by pressing Back in the game.
open_korri
step "4-korri-return" 7
assert_top_contains "4-korri-return" "$KORRI"

open_selected_local_game
step "5-game-resumed" 20
SECOND="$(pid_of)"
TOP="$(top_of)"

echo
if [[ "$TOP" != *"$GAME"* ]]; then
  echo "FAILED: relaunch did not bring the game forward (top=$TOP)"
  echo "        see $SHOTS/5-game-resumed.png"
  exit 1
fi
if [[ -n "$FIRST" && "$FIRST" == "$SECOND" ]]; then
  echo "RESUMED: same process ($FIRST), on screen — the player keeps their place."
else
  echo "RESTARTED: pid $FIRST -> $SECOND — the player lost their place."
  exit 1
fi
