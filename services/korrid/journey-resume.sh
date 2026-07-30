#!/usr/bin/env bash
# Does leaving a game and coming back RESUME it, the way Android app switching
# does, or restart it?
#
# Two things must both hold. The process id must survive the round trip, and
# the game must actually be on screen afterwards. Checking only the pid is a
# trap: Android keeps recently-used processes cached, so a dead activity can
# leave a live process behind and make a failure look like a success.
set -euo pipefail

SERIAL="${1:?usage: journey-resume.sh <adb-serial> [package] [tap-x tap-y]}"
GAME="${2:-com.playdigious.tmnt}"
TAP_X="${3:-539}"
TAP_Y="${4:-882}"
KORRI=com.simonwjackson.korri.debug
SHOTS="${SHOTS:-/tmp/korri-journey}"
ADB=(adb -s "$SERIAL")

mkdir -p "$SHOTS"
[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device

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
shot() { "${ADB[@]}" shell "screencap -p /sdcard/j.png" && "${ADB[@]}" pull /sdcard/j.png "$SHOTS/$1.png" >/dev/null; }
note() { printf '%-30s pid=%-8s top=%s\n' "$1" "$(pid_of)" "$(top_of)"; }

step() { # label, wait
  sleep "$2"
  note "$1"
  shot "$1"
}

echo "== cold start"
"${ADB[@]}" shell "am force-stop $GAME; am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
"${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
step "1-korri-home" 7

# Orientation-independent: a landscape game leaves the device rotated, so
# fixed tap points miss. Selection resets to the top on each load, and the
# game sits one row below the now-playing banner.
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_DOWN"
sleep 2
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
step "2-game-first" 20
FIRST="$(pid_of)"
if [[ "$(top_of)" != *"$GAME"* ]]; then
  echo "FAILED: first launch never reached the game"; exit 1
fi

"${ADB[@]}" shell "input keyevent KEYCODE_BACK"
step "3-back-to-korri" 6

# Orientation-independent: a landscape game leaves the device rotated, so
# fixed tap points miss. Selection resets to the top on each load, and the
# game sits one row below the now-playing banner.
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_DOWN"
sleep 2
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
step "4-game-second" 20
SECOND="$(pid_of)"
TOP="$(top_of)"

echo
if [[ "$TOP" != *"$GAME"* ]]; then
  echo "FAILED: second launch did not bring the game forward (top=$TOP)"
  echo "        see $SHOTS/4-game-second.png"
  exit 1
fi
if [[ -n "$FIRST" && "$FIRST" == "$SECOND" ]]; then
  echo "RESUMED: same process ($FIRST), on screen — the player keeps their place."
else
  echo "RESTARTED: pid $FIRST -> $SECOND — the player lost their place."
  exit 1
fi
