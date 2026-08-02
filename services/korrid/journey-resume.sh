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
EXPECTED_PORTAL_TITLE="${KORRI_JOURNEY_EXPECTED_TITLE:-}"
if [[ -z "$EXPECTED_PORTAL_TITLE" ]]; then
  EXPECTED_PORTAL_TITLE="TMNT: Shredder's Revenge"
fi
ADB_BIN="${KORRI_ADB_BIN:-adb}"
TESSERACT_BIN="${KORRI_TESSERACT_BIN:-tesseract}"
ADB=("$ADB_BIN" -s "$SERIAL")

if ! command -v "$TESSERACT_BIN" >/dev/null 2>&1; then
  echo "FAILED: tesseract binary is required for portal screenshot OCR ($TESSERACT_BIN)"
  exit 1
fi

mkdir -p "$SHOTS"
[[ "$SERIAL" == *:* ]] && { "$ADB_BIN" connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device
if ! "${ADB[@]}" shell pm path "$GAME" | grep -q '^package:'; then
  echo "FAILED: required game package is not installed: $GAME"
  exit 1
fi

# Fixed tap targets only make sense in a known orientation, and a landscape
# game leaves the device rotated. Pin portrait for the run, restore after.
PRIOR_AUTO="$("${ADB[@]}" shell settings get system accelerometer_rotation | tr -d "\r\n")"
PRIOR_USER="$("${ADB[@]}" shell settings get system user_rotation | tr -d "\r\n")"
"${ADB[@]}" shell "settings put system accelerometer_rotation 0; settings put system user_rotation 0"
restore_rotation() {
  "${ADB[@]}" shell "settings put system accelerometer_rotation ${PRIOR_AUTO:-1}; settings put system user_rotation ${PRIOR_USER:-0}" >/dev/null 2>&1 || true
}
trap restore_rotation EXIT

pid_of() { "${ADB[@]}" shell "pidof $GAME || { status=\$?; [ \"\$status\" -eq 1 ] && exit 0; exit \"\$status\"; }" 2>/dev/null | tr -d '\r\n'; }
top_of() {
  "${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity" \
    | sed 's/.*u0 //; s/ .*//' | tr -d '\r\n'
}
shot() { "${ADB[@]}" shell "screencap -p /sdcard/j.png" >/dev/null && "${ADB[@]}" pull /sdcard/j.png "$SHOTS/$1.png" >/dev/null; }
dump_ui() {
  local label="$1"
  "${ADB[@]}" shell "uiautomator dump /sdcard/j.xml" >/dev/null
  "${ADB[@]}" pull /sdcard/j.xml "$SHOTS/$label.xml" >/dev/null
}
ocr_shot() {
  local label="$1"
  "$TESSERACT_BIN" "$SHOTS/$label.png" stdout >"$SHOTS/$label.ocr.txt"
}
print_portal_evidence_paths() {
  local label="$1"
  echo "        screenshot: $SHOTS/$label.png"
  echo "        uiautomator: $SHOTS/$label.xml"
  echo "        ocr: $SHOTS/$label.ocr.txt"
}
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
assert_portal_exposes_title() {
  local label="$1"
  local expected="$2"
  dump_ui "$label"
  if ! ocr_shot "$label"; then
    echo "FAILED: portal screenshot OCR failed before D-pad activation"
    print_portal_evidence_paths "$label"
    exit 1
  fi
  if ! grep -F "$expected" "$SHOTS/$label.ocr.txt" >/dev/null; then
    echo "FAILED: portal screenshot OCR did not expose $expected before D-pad activation"
    print_portal_evidence_paths "$label"
    exit 1
  fi
}

INITIAL_PID="$(pid_of)"
echo "== portal launch"
"${ADB[@]}" shell "am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
open_korri
step "1-korri-home" 7
assert_top_contains "1-korri-home" "$KORRI"
assert_portal_exposes_title "1-korri-home" "$EXPECTED_PORTAL_TITLE"

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
assert_portal_exposes_title "4-korri-return" "$EXPECTED_PORTAL_TITLE"

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
