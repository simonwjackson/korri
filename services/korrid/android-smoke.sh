#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash coreutils curl gnugrep gnused android-tools unzip jq
# Install the built APK and call Rust Axum over adb forward.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DEVICE="${KORRI_ANDROID_DEVICE:-100.65.66.40:39991}"
APK="$ROOT/clients/android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk"
PACKAGE="com.simonwjackson.korri.debug"
HOST_PORT=43118
UPSTREAMS_CONFIG="${KORRI_ANDROID_UPSTREAMS_CONFIG:-$ROOT/services/korrid/deploy/upstreams.android.json}"
CURL=(curl --connect-timeout 2 --max-time 5 --retry 2 --retry-connrefused)
ADB_BIN="$(command -v adb)"
adb() {
  if ! timeout 15 "$ADB_BIN" "$@"; then
    echo "adb command failed or timed out: $*" >&2
    return 1
  fi
}

if [[ "$DEVICE" == *:* ]]; then
  timeout 15 adb connect "$DEVICE" >/dev/null || true
fi
if ! timeout 15 adb -s "$DEVICE" wait-for-device; then
  echo "Android target is not reachable: $DEVICE" >&2
  exit 1
fi

# grep must drain the whole listing: with pipefail, `grep -q` exiting at
# the first match SIGPIPEs unzip and fails the pipeline spuriously.
if ! unzip -l "$APK" | grep 'assets/portal/index.html' >/dev/null; then
  echo "APK is missing assets/portal/index.html" >&2
  exit 1
fi

adb -s "$DEVICE" shell mkdir -p /sdcard/korri-retro
adb -s "$DEVICE" push "$UPSTREAMS_CONFIG" /sdcard/korri-retro/upstreams.json >/dev/null
if ! timeout 60 adb -s "$DEVICE" install -r "$APK"; then
  echo 'Android app install failed or timed out after 60s' >&2
  exit 1
fi
adb -s "$DEVICE" logcat -c
adb -s "$DEVICE" shell am start -S -n "$PACKAGE/com.limelight.KorriShellActivity" >/dev/null

port=""
capability=""
portal_ready=""
for _ in $(seq 1 20); do
  line="$(adb -s "$DEVICE" logcat -d -s KorridServer:I 2>/dev/null | grep 'listening on 127.0.0.1:' | tail -1 || true)"
  port="$(printf '%s' "$line" | sed -n 's/.*127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p')"
  capability_line="$(adb -s "$DEVICE" logcat -d -s KorridServer:I 2>/dev/null | grep 'debug capability=' | tail -1 || true)"
  capability="$(printf '%s' "$capability_line" | sed -n 's/.*debug capability=\([0-9a-f][0-9a-f]*\).*/\1/p')"
  portal_ready="$(adb -s "$DEVICE" logcat -d -s KorriPortal:I 2>/dev/null | grep 'title="Korri"' | tail -1 || true)"
  if [[ -n "$port" && -n "$capability" && -n "$portal_ready" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$port" || -z "$capability" || -z "$portal_ready" ]]; then
  echo "Complete app smoke failed (Rust port='$port', capability=${capability:+present}, portal='$portal_ready')" >&2
  adb -s "$DEVICE" logcat -d -t 300 >&2
  exit 1
fi

webview_errors="$(adb -s "$DEVICE" logcat -d -s WebViewAssetLoader:E)"
if grep -q 'Error opening asset path' <<<"$webview_errors"; then
  echo "WebViewAssetLoader reported missing portal assets" >&2
  exit 1
fi
console_logs="$(adb -s "$DEVICE" logcat -d)"
if grep -qE 'INFO:CONSOLE.*(blocked|Error|error)' <<<"$console_logs"; then
  echo "Portal emitted a console error" >&2
  exit 1
fi

adb -s "$DEVICE" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
adb -s "$DEVICE" forward "tcp:$HOST_PORT" "tcp:$port"
cleanup() {
  adb -s "$DEVICE" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Localhost alone is not authority: an unauthenticated caller must be rejected.
unauthorized_status="$("${CURL[@]}" --silent --output /dev/null --write-out '%{http_code}' \
  -H 'content-type: application/json' \
  -d '{"_tag":"system.health","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if [[ "$unauthorized_status" != "401" ]]; then
  echo "Unauthenticated RPC returned HTTP $unauthorized_status, expected 401" >&2
  exit 1
fi

response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.catalog.snapshot","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! jq -e '
  .outcome._tag == "Ok"
  and any(.outcome.payload.games[]; .id == "neverball" and .host == "zao")
  and any(.outcome.payload.games[]; .host == "aka")
' <<<"$response" >/dev/null; then
  echo "Android catalog is missing the configured aka + zao hosts: $response" >&2
  exit 1
fi

# The device-local launcher source is independent of the upstream host and
# must always expose the hardcoded v1 entry through embedded korrid.
local_games_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.local-games.list","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! printf '%s' "$local_games_response" | grep -q '"id":"wl4"'; then
  echo "Local-games probe is missing Wario Land 4: $local_games_response" >&2
  exit 1
fi
if ! printf '%s' "$local_games_response" | grep -q '"title":"Wario Land 4"'; then
  echo "Local-games probe returned an unexpected title: $local_games_response" >&2
  exit 1
fi

# Embedded Android must return a signed, deferred instruction. Rust must not
# attempt the external-storage write that scoped storage denies.
local_launch_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.local-games.launch","payload":{"gameId":"wl4"}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
for expected in '"launcherId":"retroarch"' '"KORRI_CONTROL_TOKEN":"' '"directories":[' '"files":[' '"integrity":"'; do
  if ! printf '%s' "$local_launch_response" | grep -F "$expected" >/dev/null; then
    echo "Deferred local launch is missing $expected: $local_launch_response" >&2
    exit 1
  fi
done

# Session status must round-trip through the on-device brain: either a
# well-formed Ok (with or without an active session) or a tagged Err code
# — anything else means the proxy or the wire is broken.
session_response="$("${CURL[@]}" --fail --silent \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $capability" \
  -d '{"_tag":"app.session.status","payload":{}}' \
  "http://127.0.0.1:$HOST_PORT/rpc")"
if ! printf '%s' "$session_response" | grep -q '"_tag":"app.session.status"'; then
  echo "Session status probe returned an unexpected shape: $session_response" >&2
  exit 1
fi
if ! printf '%s' "$session_response" | grep -qE '"_tag":"(Ok|Err)"'; then
  echo "Session status outcome is neither Ok nor Err: $session_response" >&2
  exit 1
fi

printf 'Android portal: %s\n' "$portal_ready"
printf 'Android Rust RPC: %s\n' "$response"
printf 'Android local games: %s\n' "$local_games_response"
printf 'Android local launch: %s\n' "$local_launch_response"
printf 'Android session status: %s\n' "$session_response"
printf 'Android Rust library: %s\n' "$(adb -s "$DEVICE" shell dumpsys package "$PACKAGE" | grep versionName | head -1 | xargs)"
