#!/usr/bin/env bash
# Device check: when file access is denied, the portal must show a prompt the
# user can reach, and confirming it must land them on the system grant screen.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="$(grep -oP 'applicationId\s+"\K[^"]+' "$ROOT/clients/android/app/build.gradle" | head -1).debug"
SERIAL="${1:?usage: storage-notice-check.sh <adb-serial>}"
ADB=(adb -s "$SERIAL")

[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device

restore_storage_access() {
  echo
  echo "== restore"
  "${ADB[@]}" shell "appops set $PKG MANAGE_EXTERNAL_STORAGE allow" || true
}
trap restore_storage_access EXIT

activity_dump() {
  echo "-- activity dump:"
  "${ADB[@]}" shell "dumpsys activity activities" || true
}

ui_dump() {
  echo "-- UI dump:"
  "${ADB[@]}" shell "uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml" || true
}

fail_with_dumps() {
  echo "FAILED: $1"
  ui_dump
  activity_dump
  exit 1
}

echo "== build + install"
cd "$ROOT"
nix run "path:$ROOT#portal-bundle"
cd "$ROOT/services/korrid"
cargo ndk -t arm64-v8a -o "$ROOT/clients/android/app/src/main/jniLibs" build --release --lib
cd "$ROOT/clients/android"
./gradlew --quiet assembleDebug
"${ADB[@]}" install -r app/build/outputs/apk/debug/app-arm64-v8a-debug.apk >/dev/null

echo "== deny file access, then open the portal"
"${ADB[@]}" shell "appops set $PKG MANAGE_EXTERNAL_STORAGE deny" || true
"${ADB[@]}" shell "am force-stop $PKG"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell "monkey -p $PKG -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
sleep 7

echo "-- portal loaded?"
"${ADB[@]}" logcat -d -s KorriPortal | tail -3

echo "-- is the prompt on screen? (dumping the WebView's rendered text)"
UI_XML="$("${ADB[@]}" shell "uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml" || true)"
PROMPT_TEXT="$(printf '%s\n' "$UI_XML" | tr '>' '>\n' | grep -oE 'text="[^"]*"' | grep -iE 'file access|attention|settings' || true)"
printf '%s\n' "${PROMPT_TEXT:-   (no matching text found)}"
printf '%s\n' "$UI_XML" | grep -qi 'Korri needs file access' \
  || fail_with_dumps "portal did not render the file-access prompt"

echo
echo "== confirm the prompt (D-pad confirm) and see where we land"
"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
sleep 4
echo "-- foreground activity now:"
TOP_ACTIVITY="$("${ADB[@]}" shell "dumpsys activity activities | grep -m1 'topResumedActivity'" || true)"
printf '%s\n' "$TOP_ACTIVITY"
printf '%s\n' "$TOP_ACTIVITY" | grep -Eq 'topResumedActivity.*com\.android\.settings/.*(AllFiles|ExternalStorage|ManageExternalStorage)' \
  || fail_with_dumps "confirm did not land on Android Settings all-files-access screen"
