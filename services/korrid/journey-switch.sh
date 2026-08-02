#!/usr/bin/env bash
# What happens when the user does NOT press Back, but switches to the Korri
# app the way they would switch to any app?
#
# Whichever launch model is installed, this asks: after opening the game and
# then opening Korri, what is on screen — the portal, or the game?
#
# Requires granted storage access and no active host banner: TMNT must be the
# first local-game entry.
set -euo pipefail

SERIAL="${1:?usage: journey-switch.sh <adb-serial>}"
LABEL="${2:-current build}"
GAME=com.playdigious.tmnt
KORRI=com.simonwjackson.korri.debug
SHOTS="${SHOTS:-/tmp/korri-switch}"
ADB=(adb -s "$SERIAL")

mkdir -p "$SHOTS"
[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device
"${ADB[@]}" shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0"

pid_of() { "${ADB[@]}" shell "pidof $GAME" 2>/dev/null | tr -d '\r\n'; }
top_of() {
  "${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 -E '(^|[[:space:]])(topResumedActivity|mResumedActivity)[:=]'" \
    | sed 's/.*u0 //; s|/.*||' | tr -d '\r\n'
}
open_korri() { "${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1; }
say() { printf '  %-26s pid=%-8s top=%s\n' "$1" "$(pid_of)" "$(top_of)"; }

echo "######## $LABEL"
"${ADB[@]}" shell "am force-stop $GAME; am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
open_korri; sleep 7
say "korri home"

# TMNT is the first local-game entry under the script preconditions.
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"; sleep 18
say "game open"
FIRST="$(pid_of)"
[[ "$(top_of)" == *"$GAME"* ]] || { echo "  ABORT: game never opened"; exit 1; }

# The whole point: switch away without Back.
"${ADB[@]}" shell "input keyevent KEYCODE_HOME"; sleep 4
say "pressed home"

open_korri; sleep 7
TOP="$(top_of)"
say "opened the Korri app"
"${ADB[@]}" shell "screencap -p /sdcard/s.png" >/dev/null
"${ADB[@]}" pull /sdcard/s.png "$SHOTS/switch-back-to-korri.png" >/dev/null

echo
if [[ "$TOP" == *"$GAME"* ]]; then
  echo "  Opening Korri lands on THE GAME — the portal is unreachable without Back."
elif [[ "$TOP" == *"$KORRI"* ]]; then
  echo "  Opening Korri lands on THE PORTAL, game still alive (pid $FIRST)."
else
  echo "  Landed somewhere else entirely: $TOP"
fi
