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
FAILED=0

[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null 2>&1 || true; }
"${ADB[@]}" wait-for-device

report() { printf '  %-34s %s\n' "$1" "$2"; }
fail() { echo "  FAILED: $1"; FAILED=1; }
# grep -c exits non-zero on zero matches, which under set -e would end the run
# at exactly the moment something interesting happened.
count() { "${ADB[@]}" shell "$1" 2>/dev/null | tr -d '\r\n' || true; }
is_positive_count() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]] && (( value > 0 ))
}

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

require_alive() {
  local label="$1" observed
  observed="$(alive "$PORT")"
  report "$label" "$observed"
  [[ "$observed" == yes\ * ]] || fail "$label was not a 200 health RPC"
}

require_same_pid() {
  local label="$1" observed="$2"
  report "$label" "$observed"
  if [[ -z "$observed" ]]; then
    fail "$label was empty"
  elif [[ -n "$STARTPID" && "$observed" != "$STARTPID" ]]; then
    fail "$label changed from $STARTPID to $observed"
  fi
}

require_foreground() {
  local label="$1" observed
  observed="$(count "dumpsys activity services $KORRI | grep -c 'isForeground=true'")"
  report "$label" "$observed"
  is_positive_count "$observed" || fail "$label was not foreground"
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
require_same_pid "pid holding the brain" "$STARTPID"
require_foreground "service is foreground"
require_alive "works while on screen"

echo
echo "== screen goes away (HOME), which used to kill it"
"${ADB[@]}" shell "input keyevent KEYCODE_HOME"
sleep 5
require_alive "works with Korri off screen"
require_foreground "service is foreground after HOME"
HOMEPID="$(count "pidof $KORRI")"
require_same_pid "pid after HOME" "$HOMEPID"

echo
echo "== background kill sweep"
"${ADB[@]}" shell "am kill-all" >/dev/null 2>&1
sleep 4
require_alive "works after kill sweep"
require_foreground "service is foreground after kill sweep"
KILLPID="$(count "pidof $KORRI")"
require_same_pid "pid after kill sweep" "$KILLPID"

echo
echo "== survived, or quietly restarted?"
# One start means it survived. More means Android restarted the service, which
# is a fresh brain wearing survival's clothes: any session state is gone.
STARTS="$(count "logcat -d -s KorriBrain | grep -c 'brain service up'")"
report "times the brain started" "$STARTS"
[[ "$STARTS" == "1" ]] || fail "brain service started $STARTS times"
NOWPID="$(count "pidof $KORRI")"
require_same_pid "pid now" "$NOWPID"
if [[ -n "$STARTPID" && "$STARTPID" == "$HOMEPID" && "$STARTPID" == "$KILLPID" && "$STARTPID" == "$NOWPID" ]]; then
  report "same process throughout" "yes"
else
  report "same process throughout" "NO -- it restarted"
  fail "process did not stay the same throughout"
fi

echo
echo "== can the user see it running?"
report "'Ready to play' notifications" "$(count "dumpsys notification --noredact | grep -c 'Ready to play'")"
report "notification permission" "$(count "dumpsys package $KORRI | grep -m1 'POST_NOTIFICATIONS: granted'")"

exit "$FAILED"
