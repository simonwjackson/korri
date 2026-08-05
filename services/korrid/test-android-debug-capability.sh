#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
HELPER="$ROOT/services/korrid/android-debug-capability.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

secret=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
cat >"$TMP/adb" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_ADB_LOG"
if [[ "$*" == *' shell pidof com.simonwjackson.korri.debug' ]]; then printf '4242\n'; fi
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
expression="$(jq -r '.params.expression' <<<"$request")"
if [[ "$expression" == '({port: KorriNative.korridPort(), capability: KorriNative.korridCapability()})' ]]; then
  value="$(jq -cn --argjson port "${FAKE_PORT:-43210}" --arg capability "$FAKE_SECRET" '{port:$port,capability:$capability}')"
elif [[ "$expression" == 'KorriNative.korridCapability()' ]]; then
  value="$(jq -cn --arg capability "$FAKE_SECRET" '$capability')"
else
  exit 12
fi
jq -cn --argjson value "$value" '{id:1,result:{result:{value:$value}}}'
SH
chmod +x "$TMP/adb" "$TMP/curl" "$TMP/timeout" "$TMP/websocat"

export FAKE_ADB_LOG="$TMP/adb.log"
export FAKE_EVAL_LOG="$TMP/eval.log"
export FAKE_TARGETS="$TMP/targets.json"
export FAKE_SECRET="$secret"
export KORRI_ADB_BIN="$TMP/adb"
export KORRI_CURL_BIN="$TMP/curl"
export KORRI_WEBSOCAT_BIN="$TMP/websocat"
export KORRI_TIMEOUT_BIN="$TMP/timeout"
KORRI_JQ_BIN="$(command -v jq)"
export KORRI_JQ_BIN

trusted='https://appassets.androidplatform.net/assets/portal/index.html'
jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"},
    {type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"},
    {type:"page",url:"https://example.invalid/",webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/external"}]' \
  >"$FAKE_TARGETS"

output="$($HELPER fake-device com.simonwjackson.korri.debug --json 2>"$TMP/json.err")"
jq -e --arg capability "$secret" \
  '. == {port:43210,capability:$capability}' <<<"$output" >/dev/null
if grep -F "$secret" "$TMP/json.err" >/dev/null; then
  echo 'debug authority secret entered stderr' >&2
  exit 1
fi
grep -Fx '({port: KorriNative.korridPort(), capability: KorriNative.korridCapability()})' \
  < <(jq -r '.params.expression' "$FAKE_EVAL_LOG") >/dev/null
grep -F 'forward tcp:43120 localabstract:webview_devtools_remote_4242' "$FAKE_ADB_LOG" >/dev/null
grep -F 'forward --remove tcp:43120' "$FAKE_ADB_LOG" >/dev/null
if grep -F "$secret" "$FAKE_ADB_LOG" "$FAKE_EVAL_LOG" "$TMP/json.err" >/dev/null; then
  echo 'debug authority secret escaped captured stdout' >&2
  exit 1
fi

: >"$FAKE_EVAL_LOG"
plain="$($HELPER fake-device com.simonwjackson.korri.debug)"
[[ "$plain" == "$secret" ]]
grep -Fx 'KorriNative.korridCapability()' \
  < <(jq -r '.params.expression' "$FAKE_EVAL_LOG") >/dev/null

jq -cn --arg url "$trusted" \
  '[{type:"page",url:($url + "?surface=overlay"),webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/rejected.out" 2>"$TMP/rejected.err"; then
  echo 'debug authority accepted an overlay-only target set' >&2
  exit 1
fi
[[ ! -s "$TMP/rejected.out" ]]
if grep -F "$secret" "$TMP/rejected.err" >/dev/null; then
  echo 'rejected debug authority leaked its secret' >&2
  exit 1
fi

jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/a"},
    {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/b"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/duplicate.out" 2>"$TMP/duplicate.err"; then
  echo 'debug authority accepted duplicate trusted portal targets' >&2
  exit 1
fi
[[ ! -s "$TMP/duplicate.out" ]]

jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"}]' \
  >"$FAKE_TARGETS"
export FAKE_PORT=65536
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/port.out" 2>"$TMP/port.err"; then
  echo 'debug authority accepted an out-of-range port' >&2
  exit 1
fi
[[ ! -s "$TMP/port.out" ]]
unset FAKE_PORT
export FAKE_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/cap.out" 2>"$TMP/cap.err"; then
  echo 'debug authority accepted a non-lowercase capability' >&2
  exit 1
fi
[[ ! -s "$TMP/cap.out" ]]

printf 'Android debug authority contract passed\n'
