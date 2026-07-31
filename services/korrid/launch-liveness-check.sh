#!/usr/bin/env bash
# Is a pid enough to know whether a launch is still alive?
#
# Android gives no "ended" event, so korrid has to own launch records and poll
# them. The obvious handle is the pid captured at launch. The obvious handle is
# also the one that already fooled this project once: Android keeps processes
# cached after the user has left, so a pid can outlive the thing it named.
#
# Walks a launch through its whole life and records, at each step:
#   - does the pid still exist
#   - what Android thinks the process is for (oom_score_adj: ~0 foreground,
#     high hundreds cached and killable)
#   - whether any task still holds the activity
#
# The question is which of those a launch record should actually believe.
set -euo pipefail

SERIAL="${1:?usage: launch-liveness-check.sh <adb-serial>}"
G=com.playdigious.tmnt
ACT=crc64ce797c93931d6e91.MainActivity
ADB=(adb -s "$SERIAL")

[[ "$SERIAL" == *:* ]] && { adb connect "$SERIAL" >/dev/null 2>&1 || true; }
"${ADB[@]}" wait-for-device

pid_of() { "${ADB[@]}" shell "pidof $G" 2>/dev/null | tr -d '\r\n' | awk '{print $1}'; }
adj_of() {
  local p="$1"
  [[ -z "$p" ]] && { echo "-"; return; }
  "${ADB[@]}" shell "cat /proc/$p/oom_score_adj 2>/dev/null" | tr -d '\r\n' || echo "?"
}
# Android's own word for what the process is doing, e.g. fg, vis, cch+5.
state_of() {
  "${ADB[@]}" shell "dumpsys activity processes 2>/dev/null | grep -m1 -oE 'adj=[a-z+0-9]+|Proc #[0-9]+: [a-z]+' " 2>/dev/null | tr -d '\r\n' || echo "-"
}
has_task() {
  local n
  n="$("${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -c 'A=[0-9]*:$G'" | tr -d '\r\n' || echo 0)"
  [[ "${n:-0}" -gt 0 ]] && echo yes || echo no
}
row() { printf '  %-30s %-9s %-8s %s\n' "$1" "${2:--}" "${3:--}" "$4"; }

echo "== pid_max, for judging how quickly a pid could be reused"
"${ADB[@]}" shell "cat /proc/sys/kernel/pid_max"

echo
printf '  %-30s %-9s %-8s %s\n' "" "pid" "oom_adj" "task exists"
"${ADB[@]}" shell "am force-stop $G; input keyevent KEYCODE_WAKEUP"
sleep 3
row "before launch" "$(pid_of)" "$(adj_of "$(pid_of)")" "$(has_task)"

"${ADB[@]}" shell "am start -n $G/$ACT" >/dev/null 2>&1
sleep 15
P="$(pid_of)"
row "playing (foreground)" "$P" "$(adj_of "$P")" "$(has_task)"

echo
echo "== the player presses HOME: still playing, just not looking"
"${ADB[@]}" shell "input keyevent KEYCODE_HOME"
sleep 6
row "backgrounded" "$(pid_of)" "$(adj_of "$(pid_of)")" "$(has_task)"

echo
echo "== the player quits with Back: the launch is over"
"${ADB[@]}" shell "am start -n $G/$ACT" >/dev/null 2>&1
sleep 8
"${ADB[@]}" shell "input keyevent KEYCODE_BACK"
sleep 2
"${ADB[@]}" shell "input keyevent KEYCODE_BACK"
sleep 6
# This is the case that matters: the game is gone from the user's view, but
# is the process gone too, and can a pid tell the difference?
row "after Back (game closed)" "$(pid_of)" "$(adj_of "$(pid_of)")" "$(has_task)"
sleep 20
row "20s later" "$(pid_of)" "$(adj_of "$(pid_of)")" "$(has_task)"

echo
echo "== force-stop, the only unambiguous ending"
"${ADB[@]}" shell "am force-stop $G"
sleep 4
row "force-stopped" "$(pid_of)" "$(adj_of "$(pid_of)")" "$(has_task)"

echo
echo "  oom_adj near 0 means Android is treating it as foreground work."
echo "  Several hundred means cached: alive, killable, and not being played."
