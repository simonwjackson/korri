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
# Requires granted storage access and checkpoint config loaded. The configured
# installed Android-app route must be the first local-game entry after any
# active-session banner.
set -euo pipefail

SERIAL="${1:?usage: journey-resume.sh <adb-serial> [package] [tap-x tap-y]}"
GAME="${2:-com.playdigious.tmnt}"
# shellcheck disable=SC2034 # Backward-compatible positional args; launch is D-pad based now.
TAP_X="${3:-539}"
# shellcheck disable=SC2034 # Backward-compatible positional args; launch is D-pad based now.
TAP_Y="${4:-882}"
KORRI=com.simonwjackson.korri.debug
KORRI_ACTIVITY="$KORRI/com.limelight.KorriShellActivity"
KORRI_OPEN_ATTEMPTS=4
KORRI_OPEN_POLLS=3
SHOTS="${SHOTS:-/tmp/korri-journey}"
EXPECTED_PORTAL_TITLE="${KORRI_JOURNEY_EXPECTED_TITLE:-}"
if [[ -z "$EXPECTED_PORTAL_TITLE" ]]; then
  EXPECTED_PORTAL_TITLE="TMNT: Shredder's Revenge"
fi
NOW_PLAYING_OCR_MARKER="resumes"
PORTAL_SELECTION_RESET_STEPS=12
ADB_BIN="${KORRI_ADB_BIN:-adb}"
MAGICK_BIN="${KORRI_MAGICK_BIN:-magick}"
TESSERACT_BIN="${KORRI_TESSERACT_BIN:-tesseract}"
ADB=("$ADB_BIN" -s "$SERIAL")

if ! command -v "$MAGICK_BIN" >/dev/null 2>&1; then
  echo "FAILED: ImageMagick magick binary is required for portal screenshot OCR ($MAGICK_BIN)"
  exit 1
fi
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
  "$MAGICK_BIN" "$SHOTS/$label.png" -deskew 40% "$SHOTS/$label.ocr.png"
  "$TESSERACT_BIN" "$SHOTS/$label.ocr.png" stdout --psm 6 >"$SHOTS/$label.ocr.txt"
}
print_portal_evidence_paths() {
  local label="$1"
  echo "        screenshot: $SHOTS/$label.png"
  echo "        uiautomator: $SHOTS/$label.xml"
  echo "        ocr image: $SHOTS/$label.ocr.png"
  echo "        ocr: $SHOTS/$label.ocr.txt"
}
expected_title_tokens() {
  printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | grep -E '.{3,}' || true
}
ocr_text_tokens() {
  tr '[:upper:]' '[:lower:]' <"$1" | tr -cs '[:alnum:]' '\n' | grep -E '.{3,}' || true
}
ocr_contains_token() {
  local ocr_file="$1"
  local token="$2"
  ocr_text_tokens "$ocr_file" | grep -Fxi -- "$token" >/dev/null
}
assert_ocr_contains_expected_title_tokens() {
  local expected="$1"
  local ocr_file="$2"
  local ocr_tokens
  local missing=()
  local token

  ocr_tokens="$(ocr_text_tokens "$ocr_file")"
  while IFS= read -r token; do
    [[ -z "$token" ]] && continue
    if ! grep -Fx -- "$token" <<<"$ocr_tokens" >/dev/null; then
      missing+=("$token")
    fi
  done < <(expected_title_tokens "$expected")

  if [[ "${#missing[@]}" -gt 0 ]]; then
    printf 'missing expected OCR token(s): %s\n' "${missing[*]}"
    return 1
  fi
}
note() { printf '%-30s pid=%-8s top=%s\n' "$1" "$(pid_of)" "$(top_of)"; }

step() { # label, wait
  sleep "$2"
  note "$1"
  shot "$1"
}

wake_and_dismiss_keyguard() {
  "${ADB[@]}" shell "input keyevent KEYCODE_WAKEUP"
  "${ADB[@]}" shell "wm dismiss-keyguard" >/dev/null 2>&1 || true
}
open_korri() {
  local label="$1"
  local attempt
  local poll
  local top=""
  local start_output=""
  local start_status=0
  local last_start_output=""
  local last_start_status=0

  wake_and_dismiss_keyguard
  for ((attempt = 1; attempt <= KORRI_OPEN_ATTEMPTS; attempt += 1)); do
    if start_output="$("${ADB[@]}" shell "am start -n $KORRI_ACTIVITY" 2>&1)"; then
      start_status=0
    else
      start_status=$?
    fi
    last_start_output="$start_output"
    last_start_status="$start_status"
    for ((poll = 1; poll <= KORRI_OPEN_POLLS; poll += 1)); do
      top="$(top_of || true)"
      if [[ "$top" == *"$KORRI_ACTIVITY"* ]]; then
        return 0
      fi
      sleep 1
    done
  done

  echo "FAILED: $label did not bring Korri activity to foreground (top=$top, am_start_status=$last_start_status)"
  if [[ -n "$last_start_output" ]]; then
    echo "        am start output: $last_start_output"
  fi
  shot "$label" || true
  echo "        see $SHOTS/$label.png"
  exit 1
}
reset_portal_selection_to_top() {
  local step
  for ((step = 0; step < PORTAL_SELECTION_RESET_STEPS; step += 1)); do
    "${ADB[@]}" shell "input keyevent KEYCODE_DPAD_UP"
  done
}
open_tmnt_local_game() {
  local portal_label="$1"

  # Orientation-independent: a landscape game leaves the device rotated, so
  # fixed tap points miss. Reset to the top of the semantic list, then skip the
  # active-session banner only when the screenshot OCR proves it is present.
  reset_portal_selection_to_top
  if ocr_contains_token "$SHOTS/$portal_label.ocr.txt" "$NOW_PLAYING_OCR_MARKER"; then
    "${ADB[@]}" shell "input keyevent KEYCODE_DPAD_DOWN"
  fi
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
  if ! assert_ocr_contains_expected_title_tokens "$expected" "$SHOTS/$label.ocr.txt"; then
    echo "FAILED: portal screenshot OCR did not expose significant tokens from $expected before D-pad activation"
    print_portal_evidence_paths "$label"
    exit 1
  fi
  print_portal_evidence_paths "$label"
}

INITIAL_PID="$(pid_of)"
echo "== portal launch"
"${ADB[@]}" shell "am force-stop $KORRI"
open_korri "1-korri-home"
step "1-korri-home" 7
assert_top_contains "1-korri-home" "$KORRI"
assert_portal_exposes_title "1-korri-home" "$EXPECTED_PORTAL_TITLE"

open_tmnt_local_game "1-korri-home"
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
open_korri "4-korri-return"
step "4-korri-return" 7
assert_top_contains "4-korri-return" "$KORRI"
assert_portal_exposes_title "4-korri-return" "$EXPECTED_PORTAL_TITLE"

open_tmnt_local_game "4-korri-return"
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
