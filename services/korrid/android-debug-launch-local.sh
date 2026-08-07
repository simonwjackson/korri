#!/usr/bin/env bash
# Debug-device helper for invoking production launchLocal in the current bundled
# main portal WebView. It uses DevTools only to reach the already-running trusted
# Shell WebView, so the launch spec remains signed by the same embedded korrid
# process that produced it. The launch spec is read from stdin and never argv.
# shellcheck disable=SC2016 # jq/JavaScript variables are intentionally quoted.
set -euo pipefail

usage() {
  echo 'usage: android-debug-launch-local.sh <adb-serial> <package> [devtools-port]' >&2
  exit 2
}

[[ $# -eq 2 || $# -eq 3 ]] || usage
serial="$1"
package="$2"
devtools_port="${3:-43120}"
[[ "$serial" =~ ^[A-Za-z0-9._:-]+$ ]] || usage
[[ "$package" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || usage
[[ "$devtools_port" =~ ^[0-9]+$ && "$devtools_port" -ge 1024 && "$devtools_port" -le 65535 ]] || usage

readonly TRUSTED_PORTAL_URL='https://appassets.androidplatform.net/assets/portal/index.html'
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
CURL_BIN="${KORRI_CURL_BIN:-$(command -v curl)}"
JQ_BIN="${KORRI_JQ_BIN:-$(command -v jq)}"
WEBSOCAT_BIN="${KORRI_WEBSOCAT_BIN:-$(command -v websocat)}"
TIMEOUT_BIN="${KORRI_TIMEOUT_BIN:-$(command -v timeout)}"
ADB=("$ADB_BIN" -s "$serial")
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=services/korrid/android-debug-portal-target.sh
source "$SCRIPT_DIR/android-debug-portal-target.sh"

spec_input="$(cat)"
if [[ -z "$spec_input" ]]; then
  echo 'launch spec stdin was empty' >&2
  exit 1
fi
compact_spec_json="$(
  "$JQ_BIN" -sce 'if length == 1 and (.[0] | type == "object") then .[0] else error("expected one object") end' <<<"$spec_input" 2>/dev/null
)" || {
  echo 'launch spec stdin must be one JSON object' >&2
  exit 1
}
launch_spec_base64="$(printf '%s' "$compact_spec_json" | base64 -w 0)"
if [[ -z "$launch_spec_base64" || "$launch_spec_base64" == *$'\n'* || "$launch_spec_base64" == *$'\r'* ]]; then
  echo 'could not prepare no-wrap launch spec transport' >&2
  exit 1
fi

pid="$("${ADB[@]}" shell pidof "$package" | tr -d '\r\n')"
[[ "$pid" =~ ^[0-9]+$ ]] || {
  echo 'Korri process is missing or ambiguous' >&2
  exit 1
}
"${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
"${ADB[@]}" forward "tcp:$devtools_port" "localabstract:webview_devtools_remote_$pid" >/dev/null
cleanup() {
  "${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
}
trap cleanup EXIT

json_targets() {
  "$CURL_BIN" --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    "http://127.0.0.1:$devtools_port/json"
}

url_js="$("$JQ_BIN" -Rn --arg value "$TRUSTED_PORTAL_URL" '$value')"
readiness_expression="(() => {
  const expectedUrl = $url_js;
  const native = window.KorriNative;
  const hasNative = typeof native === 'object' && native !== null;
  return {
    href: location.href,
    exactPortal: location.href === expectedUrl,
    readyState: document.readyState,
    hasNative,
    hasLaunchLocal: hasNative && typeof native.launchLocal === 'function'
  };
})()"

socket=''
for _ in $(seq 1 20); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(korri_debug_select_main_portal_socket "$targets" 2>/dev/null)" \
    && readiness="$(korri_debug_evaluate "$socket" "$readiness_expression" 2>/dev/null)" \
    && "$JQ_BIN" -e --arg url "$TRUSTED_PORTAL_URL" '
      .href == $url and .exactPortal == true and .readyState == "complete"
      and .hasNative == true and .hasLaunchLocal == true
    ' <<<"$readiness" >/dev/null; then
    break
  fi
  socket=''
  sleep 0.25
done
[[ -n "$socket" ]] || {
  echo 'could not find one ready trusted bundled main portal with launchLocal' >&2
  exit 1
}

launch_spec_base64_js="$("$JQ_BIN" -Rn --arg value "$launch_spec_base64" '$value')"
launch_expression="(() => {
  const expectedUrl = $url_js;
  const encodedLaunchSpec = $launch_spec_base64_js;
  if (location.href !== expectedUrl) throw new Error('not the trusted main portal');
  const native = window.KorriNative;
  if (typeof native !== 'object' || native === null
      || typeof native.launchLocal !== 'function') {
    throw new Error('launchLocal is not available');
  }
  const binary = atob(encodedLaunchSpec);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const specJson = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  const parsedSpec = JSON.parse(specJson);
  if (parsedSpec === null || Array.isArray(parsedSpec) || typeof parsedSpec !== 'object') {
    throw new Error('launch spec is not a JSON object');
  }
  return JSON.parse(native.launchLocal(specJson));
})()"

# This mutation must be sent exactly once. A lost or empty DevTools response may
# mean launchLocal was delivered, so it is a hard failure rather than retryable.
launch_result="$(korri_debug_evaluate_once "$socket" "$launch_expression")" || {
  echo 'trusted portal launchLocal response was lost or refused; not retrying' >&2
  exit 1
}

if "$JQ_BIN" -e '. == {"_tag":"Launched"}' <<<"$launch_result" >/dev/null; then
  "$JQ_BIN" -c '.' <<<"$launch_result"
  exit 0
fi

if "$JQ_BIN" -e '
  type == "object" and ._tag == "LaunchFailed"
  and (.reason | type == "string"
    and IN("UnsupportedLauncher", "InvalidSpec", "NotInstalled", "ProvisionFailed", "StartFailed"))
  and (.message | type == "string")
' <<<"$launch_result" >/dev/null; then
  reason="$("$JQ_BIN" -r '.reason' <<<"$launch_result")"
  message_length="$("$JQ_BIN" -r '.message | length' <<<"$launch_result")"
  printf 'launchLocal failed: reason=%s message=<redacted:%s chars>\n' "$reason" "$message_length" >&2
  exit 1
fi

echo 'launchLocal returned an invalid LaunchLocalResult' >&2
exit 1
