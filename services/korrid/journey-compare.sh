#!/usr/bin/env bash
# Evidence for weighing two launch models. Runs the same journey twice, once
# leaving the game with BACK and once with HOME, and reports whether the game
# resumed or restarted, and where the user ended up.
#
# Requires granted storage access and no active host banner: TMNT must be the
# first local-game entry. Decides nothing. Prints what happens.
set -euo pipefail

SERIAL="${1:?usage: journey-compare.sh <adb-serial>}"
GAME=com.playdigious.tmnt
KORRI=com.simonwjackson.korri.debug
SHOTS="${SHOTS:-/tmp/korri-journey}"
ADB=(adb -s "$SERIAL")

mkdir -p "$SHOTS"
[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device
"${ADB[@]}" shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0"

pid_of() { "${ADB[@]}" shell "pidof $GAME" 2>/dev/null | tr -d '\r\n'; }
top_of() {
  "${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity" \
    | sed 's/.*u0 //; s|/.*||' | tr -d '\r\n'
}
open_game() {
  "${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
  sleep 18
}

run_journey() { # $1 = BACK | HOME
  local exit_key="$1"
  echo
  echo "######## leaving the game with $exit_key"
  "${ADB[@]}" shell "am force-stop $GAME; am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
  "${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
  sleep 7

  open_game
  local first top1
  first="$(pid_of)"; top1="$(top_of)"
  printf '  %-22s pid=%-8s top=%s\n' "game opened" "$first" "$top1"
  if [[ "$top1" != *"$GAME"* ]]; then
    echo "  ABORT: the game never opened"
    return 1
  fi

  "${ADB[@]}" shell "input keyevent KEYCODE_$exit_key"
  sleep 5
  printf '  %-22s pid=%-8s top=%s\n' "left the game" "$(pid_of)" "$(top_of)"

  # Return to Korri the way a user would after HOME.
  if [[ "$exit_key" == "HOME" ]]; then
    "${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
    sleep 6
    printf '  %-22s pid=%-8s top=%s\n' "back in Korri" "$(pid_of)" "$(top_of)"
  fi

  open_game
  local second top2
  second="$(pid_of)"; top2="$(top_of)"
  printf '  %-22s pid=%-8s top=%s\n' "game reopened" "$second" "$top2"
  "${ADB[@]}" shell "screencap -p /sdcard/c.png" >/dev/null
  "${ADB[@]}" pull /sdcard/c.png "$SHOTS/compare-$exit_key.png" >/dev/null

  if [[ "$top2" != *"$GAME"* ]]; then
    echo "  RESULT: reopening did not reach the game (ended on $top2)"
  elif [[ -n "$first" && "$first" == "$second" ]]; then
    echo "  RESULT: RESUMED — same process, player keeps their place"
  else
    echo "  RESULT: RESTARTED — new process, player loses their place"
  fi
}

run_journey BACK || true
run_journey HOME || true
echo
echo "screenshots in $SHOTS"
