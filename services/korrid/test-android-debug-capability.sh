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
socket="${!#}"
expression="$(jq -r '.params.expression' <<<"$request")"
jq -cn --arg socket "$socket" --arg expression "$expression" \
  '{socket:$socket,expression:$expression}' >>"$FAKE_EVAL_LOG"
if grep -Fq 'hasCapability:' <<<"$expression"; then
  case "$socket" in
    */main|*/shell-a|*/shell-b)
      value='{"exactPortal":true,"hasNative":true,"hasPort":true,"hasCapability":true}' ;;
    */overlay)
      [[ "${FAKE_OVERLAY_CLASSIFICATION:-ok}" == ok ]] || exit 12
      value='{"exactPortal":true,"hasNative":false,"hasPort":false,"hasCapability":false}' ;;
    *) exit 13 ;;
  esac
elif [[ "$socket" != */main ]]; then
  echo 'non-classification evaluation reached non-shell target' >&2
  exit 14
elif [[ "$expression" == '({port: KorriNative.korridPort(), capability: KorriNative.korridCapability()})' ]]; then
  value="$(jq -cn --argjson port "${FAKE_PORT:-43210}" --arg capability "$FAKE_SECRET" '{port:$port,capability:$capability}')"
elif [[ "$expression" == 'KorriNative.korridCapability()' ]]; then
  value="$(jq -cn --arg capability "$FAKE_SECRET" '$capability')"
else
  exit 15
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

same_url_shell_and_overlay() {
  jq -cn --arg url "$trusted" \
    '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"},
      {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"},
      {type:"page",url:"https://example.invalid/",webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/external"}]' \
    >"$FAKE_TARGETS"
}
same_url_shell_and_overlay

output="$($HELPER fake-device com.simonwjackson.korri.debug --json 2>"$TMP/json.err")"
jq -e --arg capability "$secret" '. == {port:43210,capability:$capability}' \
  <<<"$output" >/dev/null
[[ "$(jq -r 'select(.socket | endswith("/overlay")) | .expression' "$FAKE_EVAL_LOG" | wc -l)" -ge 1 ]]
if jq -e 'select((.socket | endswith("/overlay")) and (.expression | contains("hasCapability:") | not))' \
  "$FAKE_EVAL_LOG" >/dev/null; then
  echo 'authority evaluation reached same-URL overlay target' >&2
  exit 1
fi
grep -Fx '({port: KorriNative.korridPort(), capability: KorriNative.korridCapability()})' \
  < <(jq -r 'select(.socket | endswith("/main")) | .expression' "$FAKE_EVAL_LOG") >/dev/null
if grep -F "$secret" "$FAKE_ADB_LOG" "$FAKE_EVAL_LOG" "$TMP/json.err" >/dev/null; then
  echo 'debug authority secret escaped captured stdout' >&2
  exit 1
fi

: >"$FAKE_EVAL_LOG"
plain="$($HELPER fake-device com.simonwjackson.korri.debug)"
[[ "$plain" == "$secret" ]]
if jq -e 'select((.socket | endswith("/overlay")) and (.expression | contains("hasCapability:") | not))' \
  "$FAKE_EVAL_LOG" >/dev/null; then
  echo 'plain authority evaluation reached overlay target' >&2
  exit 1
fi

# Two classified Shell targets are ambiguous even with an overlay present.
jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/shell-a"},
    {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/shell-b"},
    {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/duplicate.out" 2>"$TMP/duplicate.err"; then
  echo 'debug authority accepted two classified Shell targets' >&2
  exit 1
fi
[[ ! -s "$TMP/duplicate.out" ]]

# A same-URL WebMessage-only overlay does not become a Shell.
jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/overlay.out" 2>"$TMP/overlay.err"; then
  echo 'debug authority accepted overlay-only targets' >&2
  exit 1
fi
[[ ! -s "$TMP/overlay.out" ]]

# Wrong URLs are never candidates and cannot supply authority.
jq -cn '[{type:"page",url:"https://example.invalid/",webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"}]' \
  >"$FAKE_TARGETS"
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/url.out" 2>"$TMP/url.err"; then
  echo 'debug authority accepted a wrong-URL target' >&2
  exit 1
fi

# A classification error on any same-URL candidate rejects the whole set.
same_url_shell_and_overlay
export FAKE_OVERLAY_CLASSIFICATION=error
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/error.out" 2>"$TMP/error.err"; then
  echo 'debug authority ignored an overlay classification error' >&2
  exit 1
fi
unset FAKE_OVERLAY_CLASSIFICATION

# Authority payload validation remains strict.
jq -cn --arg url "$trusted" \
  '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"}]' \
  >"$FAKE_TARGETS"
export FAKE_PORT=65536
if "$HELPER" fake-device com.simonwjackson.korri.debug --json >"$TMP/port.out" 2>"$TMP/port.err"; then
  echo 'debug authority accepted an out-of-range port' >&2
  exit 1
fi
unset FAKE_PORT

printf 'Android debug authority contract passed\n'
