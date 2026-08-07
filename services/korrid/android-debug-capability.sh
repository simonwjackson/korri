#!/usr/bin/env bash
# shellcheck shell=bash disable=SC2016
# Debug-device acceptance helper. Production/release WebViews do not expose
# the inspector used here. Secrets are written only to stdout for immediate
# command-substitution by a caller and never to platform logs or stderr.
set -euo pipefail

usage() {
  echo 'usage: android-debug-capability.sh <adb-serial> <package> [--json] [devtools-port]' >&2
  exit 2
}

[[ $# -ge 2 && $# -le 4 ]] || usage
serial="$1"
package="$2"
shift 2
mode=plain
if [[ "${1:-}" == --json ]]; then
  mode=json
  shift
fi
[[ $# -le 1 ]] || usage
devtools_port="${1:-43120}"
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

bounded_adb_capture() {
  local output_file="$1"
  local error_file="$2"
  shift 2
  local status=0
  "$TIMEOUT_BIN" 10 "${ADB[@]}" "$@" >"$output_file" 2>"$error_file"
  status=$?
  return "$status"
}

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

stale_forward_stdout="$(mktemp)"
stale_forward_stderr="$(mktemp)"
bounded_adb_capture "$stale_forward_stdout" "$stale_forward_stderr" forward --remove "tcp:$devtools_port" || true
rm -f "$stale_forward_stdout" "$stale_forward_stderr"
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

for _ in $(seq 1 20); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(korri_debug_select_main_portal_socket "$targets" 2>/dev/null)"; then
    if [[ "$mode" == json ]]; then
      # Keep this expression closed and atomic: acceptance must bind a port and
      # capability from the same trusted portal evaluation.
      value="$(korri_debug_evaluate "$socket" '({port: KorriNative.korridPort(), capability: KorriNative.korridCapability()})' 2>/dev/null || true)"
      if "$JQ_BIN" -e '
        type == "object" and (keys == ["capability", "port"])
        and (.port | type == "number" and floor == . and . >= 1 and . <= 65535)
        and (.capability | type == "string" and test("^[0-9a-f]{64}$"))
      ' <<<"$value" >/dev/null 2>&1; then
        "$JQ_BIN" -c '{port,capability}' <<<"$value"
        exit 0
      fi
    else
      value="$(korri_debug_evaluate "$socket" 'KorriNative.korridCapability()' 2>/dev/null || true)"
      capability="$("$JQ_BIN" -r 'select(type == "string")' <<<"$value" 2>/dev/null || true)"
      if [[ "$capability" =~ ^[0-9a-f]{64}$ ]]; then
        printf '%s\n' "$capability"
        exit 0
      fi
    fi
  fi
  sleep 0.5
done

echo 'Could not obtain current debug authority from exactly one trusted main portal' >&2
exit 1
