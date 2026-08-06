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

pid="$("${ADB[@]}" shell pidof "$package" | tr -d '\r\n')"
[[ "$pid" =~ ^[0-9]+$ ]] || { echo 'Korri process is missing or ambiguous' >&2; exit 1; }
"${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
"${ADB[@]}" forward "tcp:$devtools_port" "localabstract:webview_devtools_remote_$pid" >/dev/null
# Invoked by EXIT trap.
# shellcheck disable=SC2329
cleanup() {
  "${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
}
trap cleanup EXIT

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
