#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash android-tools coreutils curl gnugrep gnused jq
# Canonical installed Android application route proof.
#
# This gate is intentionally device-only: it installs the current Korri APK,
# copies the reviewed readable checkpoint into Korri's existing Android storage
# root, proves the protected RPC route/signature, then launches TMNT through the
# portal and verifies Android's real foreground/task behavior. It never
# uninstalls or rewrites the user's installed game package.
set -euo pipefail

SERIAL="${1:?usage: android-app-route-check.sh <adb-serial>}"
GAME="${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}"
HOST_PORT="${KORRI_ANDROID_APP_ROUTE_HOST_PORT:-43120}"
ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ADB_BIN="$(command -v adb)"
CURL=(curl --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused)
ADB=("$ADB_BIN" -s "$SERIAL")

adb_target() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

if [[ "$SERIAL" == *:* ]]; then
  timeout 15 "$ADB_BIN" connect "$SERIAL" >/dev/null || true
fi
if ! timeout 15 "$ADB_BIN" -s "$SERIAL" wait-for-device; then
  echo "Android target is not reachable: $SERIAL" >&2
  exit 1
fi
if ! "${ADB[@]}" shell pm path "$GAME" | grep -q '^package:'; then
  echo "Required Android package is not installed: $GAME" >&2
  echo "Install it on the target device, then rerun this check. The check will not install, uninstall, clear, or otherwise mutate the game package." >&2
  exit 1
fi

# The smoke script installs Korri, copies the exact checkpoint config/library
# before brain start, and proves protected RPC list/launch signatures for TMNT
# and WL4. Keep this call first so the portal journey below drives the same
# configured app state that RPC just observed.
"$ROOT/services/korrid/android-smoke.sh" "$SERIAL"

# Drive the real portal/native bridge path. This uses Home plus relaunching
# Korri as the measured return path; Back is never used as resume evidence.
"$ROOT/services/korrid/journey-resume.sh" "$SERIAL" "$GAME"

top_activity="$("${ADB[@]}" shell "dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity" | tr -d '\r')"
if [[ "$top_activity" != *"$GAME"* ]]; then
  echo "Android app route check ended without $GAME top-resumed: $top_activity" >&2
  exit 1
fi
pid="$("${ADB[@]}" shell "pidof $GAME" 2>/dev/null | tr -d '\r\n')"
if [[ -z "$pid" ]]; then
  echo "Android app route check ended with $GAME top-resumed but no process evidence" >&2
  exit 1
fi

port=""
capability=""
for _ in $(seq 1 10); do
  line="$("${ADB[@]}" logcat -d -s KorridServer:I 2>/dev/null | grep 'listening on 127.0.0.1:' | tail -1 || true)"
  port="$(printf '%s' "$line" | sed -n 's/.*127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p')"
  capability_line="$("${ADB[@]}" logcat -d -s KorridServer:I 2>/dev/null | grep 'debug capability=' | tail -1 || true)"
  capability="$(printf '%s' "$capability_line" | sed -n 's/.*debug capability=\([0-9a-f][0-9a-f]*\).*/\1/p')"
  if [[ -n "$port" && -n "$capability" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$port" || -z "$capability" ]]; then
  echo "Could not recover embedded brain RPC details after portal journey (port='$port', capability=${capability:+present})" >&2
  exit 1
fi

adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb_target -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$port"
cleanup() {
  adb_target -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

health_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"system.health","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
local_games_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.local-games.list","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! jq -e '
  .outcome._tag == "Ok"
  and .outcome.payload.games[0].id == "tmnt-shredders-revenge"
  and any(.outcome.payload.games[]; .id == "wl4")
' <<<"$local_games_response" >/dev/null; then
  echo "Embedded brain survived but local route state did not: $local_games_response" >&2
  exit 1
fi

printf 'Android app route package: %s pid=%s\n' "$GAME" "$pid"
printf 'Android app route topResumedActivity: %s\n' "$top_activity"
printf 'Android app route health while game foreground: %s\n' "$health_response"
printf 'Android app route local games while game foreground: %s\n' "$local_games_response"
