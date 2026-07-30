#!/usr/bin/env bash
# Does korrid outlive the screen?
#
# Before KorriBrainService, korrid was stopped in the shell activity's
# onDestroy -- so launching a game killed the brain. This asks the only
# question that matters: with Korri off screen, is korrid still answering?
set -euo pipefail

SERIAL="${1:?usage: brain-service-check.sh <adb-serial>}"
KORRI=com.simonwjackson.korri.debug
ADB=(adb -s "$SERIAL")

[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null 2>&1 || true; }
"${ADB[@]}" wait-for-device

brain_port() {
  "${ADB[@]}" logcat -d -s KorriBrain KorridServer 2>/dev/null \
    | grep -oE '127\.0\.0\.1:[0-9]+' | tail -1 | cut -d: -f2
}
alive() {
  # Asks korrid itself, not Android's process list: a cached process would
  # lie, an answered request cannot.
  local port="$1"
  "${ADB[@]}" shell "curl -s -o /dev/null -w '%{http_code}' \
    --max-time 3 http://127.0.0.1:$port/rpc -X POST -d '{}'" 2>/dev/null | tr -d '\r\n'
}
report() { printf '  %-34s %s\n' "$1" "$2"; }

echo "== fresh start"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell "am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
"${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
sleep 8
PORT="$(brain_port)"
[[ -z "$PORT" ]] && { echo "  korrid never reported a port"; "${ADB[@]}" logcat -d -s KorriBrain KorridServer | tail; exit 1; }
report "korrid port" "$PORT"
report "service in foreground list" \
  "$("${ADB[@]}" shell "dumpsys activity services $KORRI | grep -c 'isForeground=true'" | tr -d '\r\n')"
report "answers while on screen" "$(alive "$PORT")"

echo
echo "== screen goes away (HOME), which used to kill it"
"${ADB[@]}" shell "input keyevent KEYCODE_HOME"
sleep 5
report "answers with Korri off screen" "$(alive "$PORT")"

echo
echo "== activity destroyed outright"
# Ends the task the way Back does, without stopping the whole app: this is the
# case that previously ran onDestroy and took korrid down.
"${ADB[@]}" shell "am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS" >/dev/null 2>&1
"${ADB[@]}" shell "am kill-all" >/dev/null 2>&1
sleep 4
report "answers after background kill sweep" "$(alive "$PORT")"
report "service still listed" \
  "$("${ADB[@]}" shell "dumpsys activity services $KORRI | grep -c 'KorriBrainService'" | tr -d '\r\n')"

echo
echo "== notification visible to the user"
"${ADB[@]}" shell "dumpsys notification --noredact | grep -c 'Ready to play'" | tr -d '\r\n' | xargs -I{} printf '  %-34s %s\n' "'Ready to play' notifications" "{}"

echo
"${ADB[@]}" logcat -d -s KorriBrain | tail -6
