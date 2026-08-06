#!/usr/bin/env bash
# Shared, source-only helpers for selecting the main Shell WebView from Android
# DevTools. The accessibility overlay intentionally uses the same trusted asset
# URL, so URL alone is not an identity. Classification is inert: it checks only
# for the presence of the Shell-only narrow KorriNative authority functions and
# never invokes them.
# shellcheck shell=bash disable=SC2016,SC2154

korri_debug_socket_valid() {
  local socket="$1"
  [[ "$socket" =~ ^ws://(127\.0\.0\.1|localhost):${devtools_port}/devtools/page/[A-Za-z0-9._:-]+$ ]]
}

# A DevTools target can accept the websocket before it is ready to answer, so
# an empty reply is a retryable transport outcome rather than a verdict about
# the page. Retry a bounded number of times and state the failure explicitly:
# propagating jq's bare exit status hid this as a silent non-zero exit.
korri_debug_evaluate() {
  local socket="$1"
  local expression="$2"
  local request response value attempt
  request="$("$JQ_BIN" -cn --arg expression "$expression" \
    '{id:1,method:"Runtime.evaluate",params:{expression:$expression,returnByValue:true,awaitPromise:false}}')"
  for attempt in 1 2 3 4 5; do
    response="$(printf '%s\n' "$request" | "$TIMEOUT_BIN" 5 "$WEBSOCAT_BIN" -1 "$socket" || true)"
    if [[ -n "$response" ]]; then
      if value="$("$JQ_BIN" -ce '
        select(.id == 1)
        | select(.error == null)
        | select(.result.exceptionDetails == null)
        | .result.result.value
      ' <<<"$response" | tail -1)" && [[ -n "$value" ]]; then
        printf '%s\n' "$value"
        return 0
      fi
      # A structured refusal is the page's answer and must not be retried.
      if "$JQ_BIN" -e 'select(.id == 1) | (.error != null or .result.exceptionDetails != null)' \
        <<<"$response" >/dev/null 2>&1; then
        echo 'trusted portal evaluation was refused by the page' >&2
        return 1
      fi
    fi
    sleep 0.25
  done
  echo 'trusted portal target did not answer a bounded evaluation request' >&2
  return 1
}

korri_debug_select_main_portal_socket() {
  local targets="$1"
  local url_js expression socket classification candidate_count
  local shell_socket=''
  local shell_count=0
  local -a sockets=()

  "$JQ_BIN" -e 'type == "array"' <<<"$targets" >/dev/null || return 1
  candidate_count="$("$JQ_BIN" -er --arg url "$TRUSTED_PORTAL_URL" \
    '[.[] | select(.type == "page" and .url == $url)] | length' <<<"$targets")" || return 1
  [[ "$candidate_count" =~ ^[0-9]+$ && "$candidate_count" -gt 0 ]] || return 1
  mapfile -t sockets < <("$JQ_BIN" -er --arg url "$TRUSTED_PORTAL_URL" '
    .[]
    | select(.type == "page" and .url == $url)
    | .webSocketDebuggerUrl
    | select(type == "string")
  ' <<<"$targets")
  [[ "${#sockets[@]}" -eq "$candidate_count" ]] || return 1

  url_js="$("$JQ_BIN" -Rn --arg value "$TRUSTED_PORTAL_URL" '$value')"
  expression="(() => {
    const expectedUrl = $url_js;
    const native = window.KorriNative;
    const hasNative = typeof native === 'object' && native !== null;
    return {
      exactPortal: location.href === expectedUrl,
      hasNative,
      hasPort: hasNative && typeof native.korridPort === 'function',
      hasCapability: hasNative && typeof native.korridCapability === 'function'
    };
  })()"

  for socket in "${sockets[@]}"; do
    korri_debug_socket_valid "$socket" || return 1
    # This is the sole evaluation permitted on a same-URL overlay target.
    # Any evaluation failure or partial native interface makes classification
    # ambiguous and rejects the whole target set.
    classification="$(korri_debug_evaluate "$socket" "$expression" 2>/dev/null)" || return 1
    "$JQ_BIN" -e '
      type == "object"
      and (keys == ["exactPortal", "hasCapability", "hasNative", "hasPort"])
      and .exactPortal == true
      and (
        (.hasNative == false and .hasPort == false and .hasCapability == false)
        or
        (.hasNative == true and .hasPort == true and .hasCapability == true)
      )
    ' <<<"$classification" >/dev/null || return 1
    if "$JQ_BIN" -e '.hasNative and .hasPort and .hasCapability' \
      <<<"$classification" >/dev/null; then
      shell_socket="$socket"
      shell_count=$((shell_count + 1))
    fi
  done

  [[ "$shell_count" -eq 1 && -n "$shell_socket" ]] || return 1
  printf '%s\n' "$shell_socket"
}
