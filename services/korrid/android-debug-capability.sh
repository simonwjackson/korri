#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bash coreutils curl jq android-tools websocat
# shellcheck shell=bash
# Debug-device acceptance helper. The capability is read directly from the
# inspected WebView bridge and written only to this command's stdout; it never
# crosses logcat. Production/release WebViews do not enable this inspector.
set -euo pipefail

serial="${1:?usage: android-debug-capability.sh <adb-serial> <package> [devtools-port]}"
package="${2:?usage: android-debug-capability.sh <adb-serial> <package> [devtools-port]}"
devtools_port="${3:-43120}"
ADB=(adb -s "$serial")

pid="$("${ADB[@]}" shell pidof "$package" | tr -d '\r\n')"
[[ -n "$pid" ]] || { echo 'Korri process is missing' >&2; exit 1; }
"${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
"${ADB[@]}" forward "tcp:$devtools_port" "localabstract:webview_devtools_remote_$pid" >/dev/null
# Invoked by EXIT trap.
# shellcheck disable=SC2329
cleanup() {
  "${ADB[@]}" forward --remove "tcp:$devtools_port" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 20); do
  debugger_url="$(curl --fail --silent "http://127.0.0.1:$devtools_port/json" 2>/dev/null | \
    jq -r 'map(select(.type == "page"))[0].webSocketDebuggerUrl // empty' || true)"
  if [[ -n "$debugger_url" ]]; then
    capability="$(printf '%s\n' '{"id":1,"method":"Runtime.evaluate","params":{"expression":"KorriNative.korridCapability()","returnByValue":true}}' | \
      timeout 5 websocat -1 "$debugger_url" 2>/dev/null | \
      jq -r 'select(.id == 1) | .result.result.value // empty' | tail -1)"
    if [[ "$capability" =~ ^[0-9a-f]{64}$ ]]; then
      printf '%s\n' "$capability"
      exit 0
    fi
  fi
  sleep 0.5
done

echo 'Could not obtain the debug bridge capability through WebView inspection' >&2
exit 1
