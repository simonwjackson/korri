#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
HELPER="$ROOT/services/korrid/android-debug-reload-portal.sh"
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
expression="$(jq -r '.params.expression' <<<"$request")"
if grep -Fq 'setTimeout(() => location.reload(), 100)' <<<"$expression"; then
  value='{"requested":true,"href":"https://appassets.androidplatform.net/assets/portal/index.html","beforeTimeOrigin":1000}'
elif grep -Fq 'gameMatches' <<<"$expression"; then
  value='{"href":"https://appassets.androidplatform.net/assets/portal/index.html","exactPortal":true,"readyState":"complete","timeOrigin":2000,"navigationType":"reload","mounted":true,"homeMatches":1,"libraryMatches":0,"loadError":false,"gameMatches":1}'
else
  value='{"href":"https://appassets.androidplatform.net/assets/portal/index.html","exactPortal":true,"readyState":"complete","timeOrigin":1000}'
fi
jq -cn --argjson id "$id" --argjson value "$value" \
  '{id:$id,result:{result:{value:$value}}}'
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
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/main"},
    {type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/overlay"},
    {type:"page",url:"https://example.invalid/",webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/external"}]' \
  >"$FAKE_TARGETS"

output="$($HELPER fake-device com.simonwjackson.korri.debug \
  --expect-game wl4 'Wario Land 4')"
jq -e --arg url "$trusted" '
  .url == $url and .mode == "--expect-game" and .gameId == "wl4"
  and .title == "Wario Land 4" and .reloaded == true
' <<<"$output" >/dev/null
grep -F 'forward tcp:43121 localabstract:webview_devtools_remote_4242' "$FAKE_ADB_LOG" >/dev/null
grep -F 'forward --remove tcp:43121' "$FAKE_ADB_LOG" >/dev/null
grep -F "$trusted" "$FAKE_EVAL_LOG" >/dev/null
for forbidden in KorriNative korridCapability surface=overlay example.invalid; do
  if grep -F "$forbidden" "$FAKE_EVAL_LOG" >/dev/null; then
    echo "debug reload evaluated forbidden content: $forbidden" >&2
    exit 1
  fi
done

: >"$FAKE_EVAL_LOG"
output="$($HELPER fake-device com.simonwjackson.korri.debug --expect-portal)"
jq -e '.mode == "--expect-portal" and .gameId == "" and .reloaded == true' <<<"$output" >/dev/null

jq -cn --arg url "$trusted" \
  '[{type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/overlay"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --expect-portal \
  >"$TMP/rejected.out" 2>"$TMP/rejected.err"; then
  echo 'debug reload helper accepted an overlay-only target set' >&2
  exit 1
fi
grep -F 'could not find exactly one trusted bundled main Korri portal page' "$TMP/rejected.err" >/dev/null

jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/a"},
    {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43121/devtools/page/b"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --expect-portal \
  >"$TMP/duplicate.out" 2>"$TMP/duplicate.err"; then
  echo 'debug reload helper accepted duplicate trusted portal targets' >&2
  exit 1
fi
grep -F 'could not find exactly one trusted bundled main Korri portal page' "$TMP/duplicate.err" >/dev/null

printf 'Android debug portal reload contract passed\n'
