#!/usr/bin/env bash
# Debug-device helper for scheduling production launchLocal in the current bundled
# main portal WebView. It uses DevTools only to reach the already-running trusted
# Shell WebView, so the launch spec remains signed by the same embedded korrid
# process that produced it. The launch envelope is read from stdin and never argv.
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

FORWARD_ACTIVE=false
cleanup() {
  local status=$?
  local cleanup_status=0
  trap - EXIT INT TERM
  set +e
  if [[ "$FORWARD_ACTIVE" == true ]]; then
    "$TIMEOUT_BIN" 10 "${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1
    cleanup_status=$?
    FORWARD_ACTIVE=false
    if [[ "$cleanup_status" -ne 0 ]]; then
      if [[ "$status" -eq 0 ]]; then
        echo 'failed to remove trusted portal DevTools forward during cleanup' >&2
        exit 1
      fi
      echo "trusted portal DevTools forward cleanup also failed; preserving primary status $status" >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

json_string() {
  "$JQ_BIN" -Rs '.'
}

bounded_adb_capture() {
  local output_file="$1"
  local error_file="$2"
  shift 2
  local status=0
  "$TIMEOUT_BIN" 10 "${ADB[@]}" "$@" >"$output_file" 2>"$error_file"
  status=$?
  return "$status"
}

remove_stale_forward() {
  local output_file=""
  local error_file=""
  local status=0
  output_file="$(mktemp)"
  error_file="$(mktemp)"
  set +e
  bounded_adb_capture "$output_file" "$error_file" forward --remove "tcp:$devtools_port"
  status=$?
  set -e
  rm -f "$output_file" "$error_file"
  # adb reports failure when there was no existing forward on some versions.
  # The later forward acquisition is the authoritative check.
  return 0
}

envelope_input="$(cat)"
if [[ -z "$envelope_input" ]]; then
  echo 'launch envelope stdin was empty' >&2
  exit 1
fi
compact_envelope_json="$(
  "$JQ_BIN" -sce '
    if length != 1 then error("expected one JSON envelope") else .[0] end
    | if (
        type == "object"
        and (keys == ["expectedSigner", "spec"])
        and (.expectedSigner | type == "object" and (keys == ["capability", "port"]))
        and (.expectedSigner.port | type == "number" and floor == . and . >= 1 and . <= 65535)
        and (.expectedSigner.capability | type == "string" and test("^[0-9a-f]{64}$"))
        and (.spec | type == "object")
      ) then {
        expectedSigner: {
          port: .expectedSigner.port,
          capability: .expectedSigner.capability
        },
        spec: .spec
      } else error("invalid launch envelope") end
  ' <<<"$envelope_input" 2>/dev/null
)" || {
  echo 'launch stdin must be one JSON envelope with spec and expected signer authority' >&2
  exit 1
}
expected_port="$("$JQ_BIN" -er '.expectedSigner.port' <<<"$compact_envelope_json" 2>/dev/null)"
expected_capability="$("$JQ_BIN" -er '.expectedSigner.capability' <<<"$compact_envelope_json" 2>/dev/null)"
compact_spec_json="$("$JQ_BIN" -c '.spec' <<<"$compact_envelope_json" 2>/dev/null)"
launch_spec_base64="$(printf '%s' "$compact_spec_json" | base64 -w 0)"
if [[ -z "$launch_spec_base64" || "$launch_spec_base64" == *$'\n'* || "$launch_spec_base64" == *$'\r'* ]]; then
  echo 'could not prepare no-wrap launch spec transport' >&2
  exit 1
fi

pid_stdout="$(mktemp)"
pid_stderr="$(mktemp)"
pid_status=0
set +e
bounded_adb_capture "$pid_stdout" "$pid_stderr" shell pidof "$package"
pid_status=$?
set -e
pid_output="$(tr '\r\n\t' '   ' <"$pid_stdout")"
pid_tokens=()
read -r -a pid_tokens <<<"$pid_output"
pid="${pid_tokens[0]:-}"
if [[ "$pid_status" -ne 0 || "${#pid_tokens[@]}" -ne 1 || ! "$pid" =~ ^[0-9]+$ ]]; then
  echo 'Korri process is missing or ambiguous' >&2
  if [[ -s "$pid_stdout" ]]; then
    sed 's/^/pidof stdout: /' "$pid_stdout" >&2
  fi
  if [[ -s "$pid_stderr" ]]; then
    sed 's/^/pidof stderr: /' "$pid_stderr" >&2
  fi
  rm -f "$pid_stdout" "$pid_stderr"
  exit 1
fi
rm -f "$pid_stdout" "$pid_stderr"

remove_stale_forward
# A timed-out adb may have registered the forward before losing its response.
# Mark cleanup as needed before acquisition so every partial result is removed.
FORWARD_ACTIVE=true
forward_stdout="$(mktemp)"
forward_stderr="$(mktemp)"
if ! bounded_adb_capture "$forward_stdout" "$forward_stderr" forward "tcp:$devtools_port" "localabstract:webview_devtools_remote_$pid"; then
  echo 'failed to acquire trusted portal DevTools forward' >&2
  if [[ -s "$forward_stdout" ]]; then
    sed 's/^/forward stdout: /' "$forward_stdout" >&2
  fi
  if [[ -s "$forward_stderr" ]]; then
    sed 's/^/forward stderr: /' "$forward_stderr" >&2
  fi
  rm -f "$forward_stdout" "$forward_stderr"
  exit 1
fi
rm -f "$forward_stdout" "$forward_stderr"

json_targets() {
  "$CURL_BIN" --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    "http://127.0.0.1:$devtools_port/json"
}

readiness_matches_expected() {
  local readiness="$1"
  {
    printf '%s\n' "$readiness"
    printf '%s\n' "$expected_port"
    printf '%s' "$expected_capability"
  } | "$JQ_BIN" -e -Rsc '
    split("\n") as $parts
    | ($parts[0] | fromjson) as $readiness
    | ($parts[1] | tonumber) as $expectedPort
    | $parts[2] as $expectedCapability
    | $readiness
    | type == "object"
      and (keys == ["capability", "exactPortal", "hasCapability", "hasLaunchLocal", "hasNative", "hasPort", "href", "port", "readyState"])
      and .href == "https://appassets.androidplatform.net/assets/portal/index.html"
      and .exactPortal == true
      and .readyState == "complete"
      and .hasNative == true
      and .hasPort == true
      and .hasCapability == true
      and .hasLaunchLocal == true
      and .port == $expectedPort
      and .capability == $expectedCapability
  ' >/dev/null
}

url_js="$(printf '%s' "$TRUSTED_PORTAL_URL" | json_string)"
readiness_expression="(() => {
  const expectedUrl = $url_js;
  const native = window.KorriNative;
  const hasNative = typeof native === 'object' && native !== null;
  const hasPort = hasNative && typeof native.korridPort === 'function';
  const hasCapability = hasNative && typeof native.korridCapability === 'function';
  return {
    href: location.href,
    exactPortal: location.href === expectedUrl,
    readyState: document.readyState,
    hasNative,
    hasPort,
    hasCapability,
    hasLaunchLocal: hasNative && typeof native.launchLocal === 'function',
    port: hasPort ? native.korridPort() : null,
    capability: hasCapability ? native.korridCapability() : null
  };
})()"

socket=''
for _ in $(seq 1 20); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(korri_debug_select_main_portal_socket "$targets" 2>/dev/null)" \
    && readiness="$(korri_debug_evaluate "$socket" "$readiness_expression" 2>/dev/null)" \
    && readiness_matches_expected "$readiness"; then
    break
  fi
  socket=''
  sleep 0.25
done
[[ -n "$socket" ]] || {
  echo 'could not find one ready trusted bundled main portal with expected signer authority' >&2
  exit 1
}

launch_spec_base64_js="$(printf '%s' "$launch_spec_base64" | json_string)"
expected_capability_js="$(printf '%s' "$expected_capability" | json_string)"
launch_expression="(() => {
  const expectedUrl = $url_js;
  const expectedPort = $expected_port;
  const expectedCapability = $expected_capability_js;
  const encodedLaunchSpec = $launch_spec_base64_js;
  const signerMatches = () => {
    const currentNative = window.KorriNative;
    return location.href === expectedUrl
      && typeof currentNative === 'object' && currentNative !== null
      && typeof currentNative.korridPort === 'function'
      && typeof currentNative.korridCapability === 'function'
      && typeof currentNative.launchLocal === 'function'
      && currentNative.korridPort() === expectedPort
      && currentNative.korridCapability() === expectedCapability;
  };
  if (!signerMatches()) throw new Error('trusted portal signer changed before launch scheduling');
  const binary = atob(encodedLaunchSpec);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const specJson = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  const parsedSpec = JSON.parse(specJson);
  if (parsedSpec === null || Array.isArray(parsedSpec) || typeof parsedSpec !== 'object') {
    throw new Error('launch spec is not a JSON object');
  }
  setTimeout(() => {
    if (!signerMatches()) return;
    window.KorriNative.launchLocal(specJson);
  }, 0);
  return {_tag: 'LaunchScheduled'};
})()"

# This mutation must be sent exactly once. A lost or empty DevTools response may
# mean launchLocal was scheduled, so it is a hard failure rather than retryable.
launch_result="$(korri_debug_evaluate_once "$socket" "$launch_expression")" || {
  echo 'trusted portal launchLocal schedule ack was lost or refused; not retrying' >&2
  exit 1
}

if "$JQ_BIN" -e '. == {"_tag":"LaunchScheduled"}' <<<"$launch_result" >/dev/null; then
  "$JQ_BIN" -c '.' <<<"$launch_result"
  exit 0
fi

echo 'launchLocal returned an invalid LaunchScheduled ack' >&2
exit 1
