#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
HELPER="$ROOT/services/korrid/android-debug-focus-portal-game.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

cat >"$TMP/adb" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_ADB_LOG"
if [[ "$*" == *' shell pidof com.simonwjackson.korri.debug' ]]; then
  printf '4242\n'
fi
SH
cat >"$TMP/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cat "$FAKE_TARGETS"
SH
cat >"$TMP/timeout" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
shift
exec "$@"
SH
cat >"$TMP/websocat" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
request="$(cat)"
printf '%s\n' "$request" >>"$FAKE_EVAL_LOG"
id="$(jq -r '.id' <<<"$request")"
case "${FAKE_FOCUS_RESULT:-ok}" in
  ok) value='{"href":"https://appassets.androidplatform.net/assets/portal/index.html","library":true,"gameId":"wl4","title":"Wario Land 4","renderedIdMatches":1,"exactMatches":1,"activeExact":true}' ;;
  ambiguous) value='{"href":"https://appassets.androidplatform.net/assets/portal/index.html","library":true,"gameId":"wl4","title":"Wario Land 4","renderedIdMatches":2,"exactMatches":2,"activeExact":false}' ;;
  *) exit 2 ;;
esac
jq -cn --argjson id "$id" --argjson value "$value" '{id:$id,result:{result:{value:$value}}}'
SH
chmod +x "$TMP/adb" "$TMP/curl" "$TMP/timeout" "$TMP/websocat"

export FAKE_ADB_LOG="$TMP/adb.log"
export FAKE_EVAL_LOG="$TMP/eval.log"
export FAKE_TARGETS="$TMP/targets.json"
export KORRI_ADB_BIN="$TMP/adb"
export KORRI_CURL_BIN="$TMP/curl"
export KORRI_WEBSOCAT_BIN="$TMP/websocat"
export KORRI_TIMEOUT_BIN="$TMP/timeout"
KORRI_JQ_BIN="$(command -v jq)"
export KORRI_JQ_BIN

trusted='https://appassets.androidplatform.net/assets/portal/index.html'
jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/main"},
    {type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/overlay"},
    {type:"page",url:"https://example.invalid/",webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/external"}]' \
  >"$FAKE_TARGETS"

output="$($HELPER fake-device com.simonwjackson.korri.debug wl4 'Wario Land 4')"
jq -e --arg url "$trusted" '
  .url == $url and .view == "library" and .gameId == "wl4"
  and .title == "Wario Land 4" and .focused == true
' <<<"$output" >/dev/null
grep -F 'forward tcp:43123 localabstract:webview_devtools_remote_4242' "$FAKE_ADB_LOG" >/dev/null
grep -F 'forward --remove tcp:43123' "$FAKE_ADB_LOG" >/dev/null
grep -F "document.querySelectorAll('[data-shift-library]').length !== 1" "$FAKE_EVAL_LOG" >/dev/null
grep -F 'target.focus()' "$FAKE_EVAL_LOG" >/dev/null
for forbidden in '.click(' KorriNative korridCapability 'fetch(' XMLHttpRequest surface=overlay example.invalid; do
  if grep -F "$forbidden" "$FAKE_EVAL_LOG" >/dev/null; then
    echo "debug focus evaluated forbidden content: $forbidden" >&2
    exit 1
  fi
done

export FAKE_FOCUS_RESULT=ambiguous
if "$HELPER" fake-device com.simonwjackson.korri.debug wl4 'Wario Land 4' \
  >"$TMP/ambiguous.out" 2>"$TMP/ambiguous.err"; then
  echo 'debug focus helper accepted an ambiguous rendered identity' >&2
  exit 1
fi
grep -F 'did not expose exactly one focusable game' "$TMP/ambiguous.err" >/dev/null
unset FAKE_FOCUS_RESULT

jq -cn --arg url "$trusted" \
  '[{type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/overlay"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug wl4 'Wario Land 4' \
  >"$TMP/overlay.out" 2>"$TMP/overlay.err"; then
  echo 'debug focus helper accepted an overlay-only target set' >&2
  exit 1
fi

grep -F 'did not expose exactly one focusable game' "$TMP/overlay.err" >/dev/null

jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/a"},
    {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43123/devtools/page/b"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug wl4 'Wario Land 4' \
  >"$TMP/duplicate.out" 2>"$TMP/duplicate.err"; then
  echo 'debug focus helper accepted duplicate trusted portal targets' >&2
  exit 1
fi

grep -F 'did not expose exactly one focusable game' "$TMP/duplicate.err" >/dev/null

printf 'Android debug portal game focus contract passed\n'
