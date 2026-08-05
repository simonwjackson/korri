#!/usr/bin/env bash
# Debug-device helper for focusing one game already rendered in Shift Library.
# It selects only the exact bundled main portal target, never clicks, and never
# reads or invokes Korri's native bridge. Release WebViews expose no inspector.
# shellcheck disable=SC2016 # jq/JavaScript variables are intentionally quoted.
set -euo pipefail

usage() {
  echo 'usage: android-debug-focus-portal-game.sh <adb-serial> <package> <game-id> <exact-title> [devtools-port]' >&2
  exit 2
}

[[ $# -ge 4 && $# -le 5 ]] || usage
serial="$1"
package="$2"
game_id="$3"
title="$4"
devtools_port="${5:-43123}"
[[ "$serial" =~ ^[A-Za-z0-9._:-]+$ ]] || usage
[[ "$package" =~ ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$ ]] || usage
[[ "$game_id" =~ ^[A-Za-z0-9._:@/-]+$ && -n "$title" ]] || usage
[[ "$devtools_port" =~ ^[0-9]+$ && "$devtools_port" -ge 1024 && "$devtools_port" -le 65535 ]] || usage

readonly TRUSTED_PORTAL_URL='https://appassets.androidplatform.net/assets/portal/index.html'
ADB_BIN="${KORRI_ADB_BIN:-$(command -v adb)}"
CURL_BIN="${KORRI_CURL_BIN:-$(command -v curl)}"
JQ_BIN="${KORRI_JQ_BIN:-$(command -v jq)}"
WEBSOCAT_BIN="${KORRI_WEBSOCAT_BIN:-$(command -v websocat)}"
TIMEOUT_BIN="${KORRI_TIMEOUT_BIN:-$(command -v timeout)}"
ADB=("$ADB_BIN" -s "$serial")

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

select_trusted_portal_socket() {
  local targets="$1"
  local count socket
  count="$("$JQ_BIN" -er --arg url "$TRUSTED_PORTAL_URL" \
    '[.[] | select(.type == "page" and .url == $url)] | length' <<<"$targets")"
  [[ "$count" == 1 ]] || {
    echo "expected exactly one bundled main Korri portal page, found $count" >&2
    return 1
  }
  socket="$("$JQ_BIN" -er --arg url "$TRUSTED_PORTAL_URL" \
    '.[] | select(.type == "page" and .url == $url) | .webSocketDebuggerUrl' <<<"$targets")"
  [[ "$socket" =~ ^ws://(127\.0\.0\.1|localhost):${devtools_port}/devtools/page/[A-Za-z0-9._:-]+$ ]] || {
    echo 'trusted portal exposed an unexpected debugger socket' >&2
    return 1
  }
  printf '%s\n' "$socket"
}

evaluate() {
  local socket="$1" expression="$2" request response
  request="$("$JQ_BIN" -cn --arg expression "$expression" \
    '{id:1,method:"Runtime.evaluate",params:{expression:$expression,returnByValue:true,awaitPromise:false}}')"
  response="$(printf '%s\n' "$request" | "$TIMEOUT_BIN" 5 "$WEBSOCAT_BIN" -1 "$socket")"
  "$JQ_BIN" -ce '
    select(.id == 1)
    | select(.error == null)
    | select(.result.exceptionDetails == null)
    | .result.result.value
  ' <<<"$response" | tail -1
}

url_js="$("$JQ_BIN" -Rn --arg value "$TRUSTED_PORTAL_URL" '$value')"
game_id_js="$("$JQ_BIN" -Rn --arg value "$game_id" '$value')"
title_js="$("$JQ_BIN" -Rn --arg value "$title" '$value')"
expression="(() => {
  const expectedUrl = $url_js;
  const gameId = $game_id_js;
  const title = $title_js;
  if (location.href !== expectedUrl) throw new Error('not the trusted main portal');
  if (document.querySelectorAll('[data-shift-library]').length !== 1) {
    throw new Error('Shift Library is not the current installed view');
  }
  const renderedFocusable = (element) => {
    const style = getComputedStyle(element);
    return element instanceof HTMLElement && !element.hasAttribute('disabled')
      && element.tabIndex >= 0 && element.getClientRects().length > 0
      && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const renderedIdMatches = Array.from(document.querySelectorAll('[data-shift-game-id]'))
    .filter(renderedFocusable)
    .filter((element) => element.getAttribute('data-shift-game-id') === gameId);
  const exactMatches = renderedIdMatches
    .filter((element) => element.getAttribute('aria-label') === title);
  if (renderedIdMatches.length !== 1 || exactMatches.length !== 1) {
    throw new Error('expected exactly one rendered focusable game with exact identity');
  }
  const target = exactMatches[0];
  target.focus();
  return {
    href: location.href,
    library: true,
    gameId: target.getAttribute('data-shift-game-id'),
    title: target.getAttribute('aria-label'),
    renderedIdMatches: renderedIdMatches.length,
    exactMatches: exactMatches.length,
    activeExact: document.activeElement === target
      && document.activeElement.getAttribute('data-shift-game-id') === gameId
      && document.activeElement.getAttribute('aria-label') === title
  };
})()"

verified=''
for _ in $(seq 1 80); do
  if targets="$(json_targets 2>/dev/null)" \
    && socket="$(select_trusted_portal_socket "$targets" 2>/dev/null)" \
    && candidate="$(evaluate "$socket" "$expression" 2>/dev/null)" \
    && "$JQ_BIN" -e --arg url "$TRUSTED_PORTAL_URL" --arg gameId "$game_id" --arg title "$title" '
      .href == $url and .library == true and .gameId == $gameId and .title == $title
      and .renderedIdMatches == 1 and .exactMatches == 1 and .activeExact == true
    ' <<<"$candidate" >/dev/null; then
    verified="$candidate"
    break
  fi
  sleep 0.25
done
[[ -n "$verified" ]] || {
  echo 'trusted main portal Library did not expose exactly one focusable game with the expected identity' >&2
  exit 1
}

"$JQ_BIN" -cn --arg url "$TRUSTED_PORTAL_URL" --arg gameId "$game_id" --arg title "$title" \
  '{url:$url,view:"library",gameId:$gameId,title:$title,focused:true}'
