#!/usr/bin/env bash
# Debug-device helper for reloading only the bundled main Korri portal WebView.
# Same-URL overlay pages receive only inert Shell-interface classification;
# reload/probe expressions run only in the uniquely classified main Shell. The
# helper never invokes or reads the korrid authority. Release WebViews expose no
# inspector.
# shellcheck disable=SC2016 # jq programs intentionally use jq variables in single quotes.
set -euo pipefail

usage() {
  echo 'usage: android-debug-reload-portal.sh <adb-serial> <package> (--expect-game <game-id> <title> | --expect-portal) [devtools-port]' >&2
  exit 2
}

[[ $# -ge 3 ]] || usage
serial="$1"
package="$2"
mode="$3"
shift 3
expected_game_id=''
expected_title=''
case "$mode" in
  --expect-game)
    [[ $# -eq 2 || $# -eq 3 ]] || usage
    expected_game_id="$1"
    expected_title="$2"
    shift 2
    ;;
  --expect-portal)
    [[ $# -eq 0 || $# -eq 1 ]] || usage
    ;;
  *) usage ;;
esac
devtools_port="${1:-43121}"
[[ "$serial" =~ ^[A-Za-z0-9._:-]+$ ]] || usage
[[ "$package" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || usage
[[ "$devtools_port" =~ ^[0-9]+$ && "$devtools_port" -ge 1024 && "$devtools_port" -le 65535 ]] || usage
if [[ "$mode" == --expect-game ]]; then
  [[ "$expected_game_id" =~ ^[A-Za-z0-9._:@/-]+$ && -n "$expected_title" ]] || usage
fi

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
game_id_js="$("$JQ_BIN" -Rn --arg value "$expected_game_id" '$value')"
title_js="$("$JQ_BIN" -Rn --arg value "$expected_title" '$value')"

socket=''
for _ in $(seq 1 20); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(korri_debug_select_main_portal_socket "$targets" 2>/dev/null)"; then
    break
  fi
  socket=''
  sleep 0.25
done
[[ -n "$socket" ]] || {
  echo 'could not find exactly one trusted bundled main Korri portal page' >&2
  exit 1
}

before_expression="(() => {
  const expectedUrl = $url_js;
  return {
    href: location.href,
    exactPortal: location.href === expectedUrl,
    readyState: document.readyState,
    timeOrigin: performance.timeOrigin
  };
})()"
before="$(korri_debug_evaluate "$socket" "$before_expression")"
"$JQ_BIN" -e --arg url "$TRUSTED_PORTAL_URL" '
  .exactPortal == true and .href == $url and (.timeOrigin | type == "number")
' <<<"$before" >/dev/null
before_time_origin="$("$JQ_BIN" -er '.timeOrigin' <<<"$before")"

reload_expression="(() => {
  const expectedUrl = $url_js;
  if (location.href !== expectedUrl) throw new Error('not the trusted main portal');
  const beforeTimeOrigin = performance.timeOrigin;
  setTimeout(() => location.reload(), 100);
  return {requested: true, href: location.href, beforeTimeOrigin};
})()"
reload_result="$(korri_debug_evaluate "$socket" "$reload_expression")"
"$JQ_BIN" -e --arg url "$TRUSTED_PORTAL_URL" --argjson before "$before_time_origin" '
  .requested == true and .href == $url and .beforeTimeOrigin == $before
' <<<"$reload_result" >/dev/null

probe_expression="(() => {
  const expectedUrl = $url_js;
  const gameId = $game_id_js;
  const title = $title_js;
  const gameMatches = Array.from(document.querySelectorAll('[data-shift-game-id]'))
    .filter((element) => element.getAttribute('data-shift-game-id') === gameId
      && element.getAttribute('aria-label') === title).length;
  return {
    href: location.href,
    exactPortal: location.href === expectedUrl,
    readyState: document.readyState,
    timeOrigin: performance.timeOrigin,
    navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
    mounted: document.querySelector('[data-shift-surface]') !== null,
    homeMatches: document.querySelectorAll('[data-shift-home]').length,
    libraryMatches: document.querySelectorAll('[data-shift-library]').length,
    loadError: Array.from(document.querySelectorAll('[data-korri-part]'))
      .some((element) => element.getAttribute('data-korri-part') === 'shift.home-load-error'),
    gameMatches
  };
})()"

verified=''
for _ in $(seq 1 80); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(korri_debug_select_main_portal_socket "$targets" 2>/dev/null)" \
    && candidate="$(korri_debug_evaluate "$socket" "$probe_expression" 2>/dev/null)"; then
    # Home is curated: a valid catalog game may intentionally be absent from
    # the mounted Home DOM. The acceptance caller proves the exact game through
    # app.local-games.list after this verified reload; this helper proves only
    # that the trusted portal performed a fresh, error-free mount.
    predicate='.exactPortal == true and .href == $url and .readyState == "complete"
      and .timeOrigin > $before and .navigationType == "reload"
      and .mounted == true and .homeMatches == 1 and .libraryMatches == 0
      and .loadError == false'
    if "$JQ_BIN" -e --arg url "$TRUSTED_PORTAL_URL" --argjson before "$before_time_origin" \
      "$predicate" <<<"$candidate" >/dev/null; then
      verified="$candidate"
      break
    fi
  fi
  sleep 0.25
done
[[ -n "$verified" ]] || {
  echo 'trusted main portal did not complete a verified reload with the expected semantic content' >&2
  exit 1
}

"$JQ_BIN" -cn \
  --arg url "$TRUSTED_PORTAL_URL" \
  --arg mode "$mode" \
  --arg gameId "$expected_game_id" \
  --arg title "$expected_title" \
  '{url:$url,mode:$mode,gameId:$gameId,title:$title,reloaded:true}'
