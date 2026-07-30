#!/usr/bin/env bash
# Capture what is actually on screen: the portal with file access denied, and
# where a confirm lands. uiautomator cannot read WebView text, so screenshots
# are the honest check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="$(grep -oP 'applicationId\s+"\K[^"]+' "$ROOT/clients/android/app/build.gradle" | head -1).debug"
SERIAL="${1:?usage: storage-notice-shots.sh <adb-serial>}"
OUT="${2:-/tmp/korri-storage-shots}"
ADB=(adb -s "$SERIAL")

mkdir -p "$OUT"
[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null || true; }
"${ADB[@]}" wait-for-device

"${ADB[@]}" shell "appops set $PKG MANAGE_EXTERNAL_STORAGE deny" || true
"${ADB[@]}" shell "am force-stop $PKG"
"${ADB[@]}" shell "monkey -p $PKG -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
sleep 7
"${ADB[@]}" exec-out screencap -p > "$OUT/1-portal-denied.png"
echo "captured $OUT/1-portal-denied.png"

"${ADB[@]}" shell "input keyevent KEYCODE_DPAD_CENTER"
sleep 5
"${ADB[@]}" exec-out screencap -p > "$OUT/2-after-confirm.png"
echo "captured $OUT/2-after-confirm.png"
"${ADB[@]}" shell "dumpsys window | grep -m2 -E 'mCurrentFocus|mFocusedApp'" || true

"${ADB[@]}" shell "appops set $PKG MANAGE_EXTERNAL_STORAGE allow" || true
