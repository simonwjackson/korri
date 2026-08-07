#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
HELPER="$ROOT/services/korrid/android-debug-launch-local.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

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
      value='{"exactPortal":true,"hasNative":false,"hasPort":false,"hasCapability":false}' ;;
    *) exit 13 ;;
  esac
elif grep -Fq 'hasLaunchLocal:' <<<"$expression"; then
  [[ "$socket" == */main ]] || exit 14
  value='{"href":"https://appassets.androidplatform.net/assets/portal/index.html","exactPortal":true,"readyState":"complete","hasNative":true,"hasLaunchLocal":true}'
elif grep -Fq 'launchLocal(specJson)' <<<"$expression"; then
  encoded="$(awk -F'"' '/const encodedLaunchSpec = /{print $2; exit}' <<<"$expression")"
  printf '%s\n' "$socket" >>"$FAKE_LAUNCH_LOG"
  printf '%s' "$encoded" >>"$FAKE_LAUNCH_BASE64_LOG"
  printf '%s' "$encoded" | base64 -d >"$FAKE_LAUNCH_SPEC_LOG"
  case "${FAKE_LAUNCH_RESULT:-success}" in
    success) value='{"_tag":"Launched"}' ;;
    failed) value='{"_tag":"LaunchFailed","reason":"InvalidSpec","message":"signature rejected transport-secret"}' ;;
    empty) exit 0 ;;
    *) exit 15 ;;
  esac
else
  exit 16
fi
jq -cn --argjson value "$value" '{id:1,result:{result:{value:$value}}}'
SH
chmod +x "$TMP/adb" "$TMP/curl" "$TMP/timeout" "$TMP/websocat"

export FAKE_ADB_LOG="$TMP/adb.log"
export FAKE_EVAL_LOG="$TMP/eval.log"
export FAKE_LAUNCH_LOG="$TMP/launch.log"
export FAKE_LAUNCH_BASE64_LOG="$TMP/launch.base64.log"
export FAKE_LAUNCH_SPEC_LOG="$TMP/launch-spec.json"
export FAKE_TARGETS="$TMP/targets.json"
export KORRI_ADB_BIN="$TMP/adb"
export KORRI_CURL_BIN="$TMP/curl"
export KORRI_WEBSOCAT_BIN="$TMP/websocat"
export KORRI_TIMEOUT_BIN="$TMP/timeout"
KORRI_JQ_BIN="$(command -v jq)"
export KORRI_JQ_BIN
trusted='https://appassets.androidplatform.net/assets/portal/index.html'
secret_spec='{"launchId":"launch-1","launcherId":"retroarch","integrity":"transport-secret","component":{"packageName":"com.korri.retroarch"}}'

set_targets() {
  case "$1" in
    shell-overlay)
      jq -cn --arg url "$trusted" \
        '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/main"},
          {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"}]' \
        >"$FAKE_TARGETS"
      ;;
    ambiguous)
      jq -cn --arg url "$trusted" \
        '[{type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/shell-a"},
          {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/shell-b"},
          {type:"page",url:$url,webSocketDebuggerUrl:"ws://127.0.0.1:43120/devtools/page/overlay"}]' \
        >"$FAKE_TARGETS"
      ;;
  esac
}

reset_logs() {
  : >"$FAKE_ADB_LOG"
  : >"$FAKE_EVAL_LOG"
  : >"$FAKE_LAUNCH_LOG"
  : >"$FAKE_LAUNCH_BASE64_LOG"
  : >"$FAKE_LAUNCH_SPEC_LOG"
}

launch_count() {
  if [[ -s "$FAKE_LAUNCH_LOG" ]]; then
    wc -l <"$FAKE_LAUNCH_LOG" | tr -d ' '
  else
    printf '0'
  fi
}

assert_one_main_launch() {
  [[ "$(launch_count)" == 1 ]]
  grep -Fx 'ws://127.0.0.1:43120/devtools/page/main' "$FAKE_LAUNCH_LOG" >/dev/null
}

set_targets shell-overlay
reset_logs
output="$(printf '%s' "$secret_spec" | "$HELPER" fake-device com.simonwjackson.korri.debug >"$TMP/success.out" 2>"$TMP/success.err"; cat "$TMP/success.out")"
jq -e '. == {"_tag":"Launched"}' <<<"$output" >/dev/null
assert_one_main_launch
jq -e --argjson expected "$secret_spec" '. == $expected' "$FAKE_LAUNCH_SPEC_LOG" >/dev/null
if jq -e 'select((.socket | endswith("/overlay")) and (.expression | contains("launchLocal") or contains("hasLaunchLocal:")))' \
  "$FAKE_EVAL_LOG" >/dev/null; then
  echo 'launchLocal helper evaluated readiness or mutation on the same-URL overlay target' >&2
  exit 1
fi
if grep -F 'transport-secret' "$FAKE_ADB_LOG" "$TMP/success.out" "$TMP/success.err" >/dev/null; then
  echo 'launchLocal helper leaked the stdin launch spec through argv or output' >&2
  exit 1
fi
if grep -F "$(cat "$FAKE_LAUNCH_BASE64_LOG")" "$FAKE_ADB_LOG" "$TMP/success.out" "$TMP/success.err" >/dev/null; then
  echo 'launchLocal helper leaked base64 transport through argv or output' >&2
  exit 1
fi

set_targets shell-overlay
reset_logs
export FAKE_LAUNCH_RESULT=failed
if printf '%s' "$secret_spec" | "$HELPER" fake-device com.simonwjackson.korri.debug >"$TMP/failed.out" 2>"$TMP/failed.err"; then
  echo 'launchLocal helper accepted LaunchFailed' >&2
  exit 1
fi
assert_one_main_launch
grep -F 'reason=InvalidSpec message=<redacted:' "$TMP/failed.err" >/dev/null
if grep -F 'transport-secret' "$TMP/failed.err" "$TMP/failed.out" >/dev/null; then
  echo 'launchLocal helper printed an unredacted LaunchFailed message' >&2
  exit 1
fi
unset FAKE_LAUNCH_RESULT

set_targets ambiguous
reset_logs
if printf '%s' "$secret_spec" | "$HELPER" fake-device com.simonwjackson.korri.debug >"$TMP/ambiguous.out" 2>"$TMP/ambiguous.err"; then
  echo 'launchLocal helper accepted ambiguous trusted Shell targets' >&2
  exit 1
fi
[[ "$(launch_count)" == 0 ]]

set_targets shell-overlay
reset_logs
export FAKE_LAUNCH_RESULT=empty
if printf '%s' "$secret_spec" | "$HELPER" fake-device com.simonwjackson.korri.debug >"$TMP/empty.out" 2>"$TMP/empty.err"; then
  echo 'launchLocal helper accepted an empty one-shot mutation response' >&2
  exit 1
fi
assert_one_main_launch
grep -F 'not retrying' "$TMP/empty.err" >/dev/null
unset FAKE_LAUNCH_RESULT

printf 'Android debug launchLocal helper contract passed\n'
