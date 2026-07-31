#!/usr/bin/env bash
# Does korrid outlive the screen?
#
# Before KorriBrainService, korrid was stopped in the shell activity's
# onDestroy -- so launching a game killed the brain. This asks the only
# question that matters: with Korri off screen, is korrid still working?
set -euo pipefail

SERIAL="${1:?usage: brain-service-check.sh <adb-serial>}"
KORRI=com.simonwjackson.korri.debug
ADB=(adb -s "$SERIAL")

[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null 2>&1 || true; }
"${ADB[@]}" wait-for-device

report() { printf '  %-34s %s\n' "$1" "$2"; }
# grep -c exits non-zero on zero matches, which under set -e would end the run
# at exactly the moment something interesting happened.
count() { "${ADB[@]}" shell "$1" 2>/dev/null | tr -d '\r\n' || true; }

alive() {
  # Asks korrid to do real work rather than reading Android's process list: a
  # cached process reports alive while being dead. A malformed probe is no
  # better -- a half-dead server still rejects it -- so this is the real
  # health op, and only 200 counts.
  local port="$1" code
  code="$("${ADB[@]}" shell "curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    -H 'Content-Type: application/json' -H 'Authorization: Bearer $CAPABILITY' \
    -X POST -d '{\"_tag\":\"system.health\",\"payload\":{}}' \
    http://127.0.0.1:$port/rpc" 2>/dev/null | tr -d '\r\n' || true)"
  [[ "$code" == "200" ]] && echo "yes (200)" || echo "NO (http ${code:-none})"
}

echo "== fresh start"
"${ADB[@]}" logcat -c
"${ADB[@]}" shell "am force-stop $KORRI; input keyevent KEYCODE_WAKEUP"
"${ADB[@]}" shell "monkey -p $KORRI -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
sleep 8

PORT="$("${ADB[@]}" logcat -d -s KorriBrain KorridServer | grep -oE '127\.0\.0\.1:[0-9]+' | tail -1 | cut -d: -f2)"
[[ -z "$PORT" ]] && { echo "  korrid never reported a port"; "${ADB[@]}" logcat -d -s KorriBrain KorridServer | tail; exit 1; }
CAPABILITY="$("${ADB[@]}" logcat -d -s KorridServer | grep -oE 'debug capability=[a-f0-9]+' | tail -1 | cut -d= -f2)"
STARTPID="$(count "pidof $KORRI")"

report "korrid port" "$PORT"
report "pid holding the brain" "$STARTPID"
report "service is foreground" "$(count "dumpsys activity services $KORRI | grep -c 'isForeground=true'")"
report "works while on screen" "$(alive "$PORT")"

echo
echo "== screen goes away (HOME), which used to kill it"
"${ADB[@]}" shell "input keyevent KEYCODE_HOME"
sleep 5
report "works with Korri off screen" "$(alive "$PORT")"

echo
echo "== background kill sweep"
"${ADB[@]}" shell "am kill-all" >/dev/null 2>&1
sleep 4
report "works after kill sweep" "$(alive "$PORT")"

echo
echo "== survived, or quietly restarted?"
# One start means it survived. More means Android restarted the service, which
# is a fresh brain wearing survival's clothes: any session state is gone.
report "times the brain started" "$(count "logcat -d -s KorriBrain | grep -c 'brain service up'")"
NOWPID="$(count "pidof $KORRI")"
report "pid now" "$NOWPID"
[[ "$STARTPID" == "$NOWPID" ]] && report "same process throughout" "yes" \
  || report "same process throughout" "NO -- it restarted"

echo
echo "== can the user see it running?"
report "'Ready to play' notifications" "$(count "dumpsys notification --noredact | grep -c 'Ready to play'")"
report "notification permission" "$(count "dumpsys package $KORRI | grep -m1 'POST_NOTIFICATIONS: granted'")"
