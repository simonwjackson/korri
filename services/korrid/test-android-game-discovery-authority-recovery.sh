#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
DISCOVERY="$ROOT/services/korrid/android-game-discovery-check.sh"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

secret=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

cat >"$TMP/debug-capability" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_HELPER_ARG_LOG"
count=0
if [[ -f "$FAKE_HELPER_COUNT" ]]; then
  count="$(cat "$FAKE_HELPER_COUNT")"
fi
count=$((count + 1))
printf '%s\n' "$count" >"$FAKE_HELPER_COUNT"
case "${FAKE_HELPER_BEHAVIOR:-fail-once}" in
  fail-once)
    if [[ "$count" -eq 1 ]]; then
      echo 'empty DevTools reply from live process' >&2
      exit 1
    fi
    jq -cn --arg capability "$FAKE_SECRET" '{port:43211,capability:$capability}'
    ;;
  always-fail)
    echo "helper failure attempt $count" >&2
    exit 1
    ;;
  *)
    echo 'unknown helper behavior' >&2
    exit 2
    ;;
esac
SH
chmod +x "$TMP/debug-capability"

{
  cat <<'SH'
#!/usr/bin/env bash
set -euo pipefail
SERIAL=fake-device
PKG=com.simonwjackson.korri.debug
DEVTOOLS_HOST_PORT=43120
HOST_PORT=43124
DEBUG_CAPABILITY_SH="$FAKE_DEBUG_CAPABILITY_SH"
FORWARD_ACTIVE=false
RPC_PORT=""
RPC_CAPABILITY=""
clear_rpc_forward() {
  printf 'clear_rpc_forward\n' >>"$FAKE_FORWARD_LOG"
}
adb_target() {
  printf '%s\n' "$*" >>"$FAKE_FORWARD_LOG"
}
SH
  awk '/^recover_rpc_details\(\) \{/{emit=1} emit{print} emit && /^}/{exit}' "$DISCOVERY"
  printf '%s\n' 'recover_rpc_details "test recovery"'
} >"$TMP/recover-wrapper"
chmod +x "$TMP/recover-wrapper"

export FAKE_DEBUG_CAPABILITY_SH="$TMP/debug-capability"
export FAKE_SECRET="$secret"
export FAKE_HELPER_ARG_LOG="$TMP/helper-args.log"
export FAKE_HELPER_COUNT="$TMP/helper-count"
export FAKE_FORWARD_LOG="$TMP/forward.log"

FAKE_HELPER_BEHAVIOR=fail-once "$TMP/recover-wrapper" >"$TMP/retry.out" 2>"$TMP/retry.err"
[[ "$(cat "$FAKE_HELPER_COUNT")" == 2 ]]
if grep -F "$secret" "$TMP/retry.out" "$TMP/retry.err" "$FAKE_FORWARD_LOG" >/dev/null; then
  echo 'recovery leaked RPC capability material after retry' >&2
  exit 1
fi
grep -F 'Recovered test recovery: host tcp:43124 -> device tcp:43211 via trusted portal DevTools' "$TMP/retry.out" >/dev/null
grep -F 'forward tcp:43124 tcp:43211' "$FAKE_FORWARD_LOG" >/dev/null
if grep -F 'empty DevTools reply from live process' "$TMP/retry.err" >/dev/null; then
  echo 'recovery printed stderr from a non-final failed helper attempt' >&2
  exit 1
fi
if [[ "$(grep -Fc 'fake-device com.simonwjackson.korri.debug --json 43120' "$FAKE_HELPER_ARG_LOG")" -ne 2 ]]; then
  echo 'recovery changed helper arguments between retry attempts' >&2
  exit 1
fi

: >"$FAKE_HELPER_ARG_LOG"
: >"$FAKE_FORWARD_LOG"
printf '0\n' >"$FAKE_HELPER_COUNT"
if FAKE_HELPER_BEHAVIOR=always-fail "$TMP/recover-wrapper" >"$TMP/fail.out" 2>"$TMP/fail.err"; then
  echo 'recovery succeeded after all helper attempts failed' >&2
  exit 1
fi
[[ "$(cat "$FAKE_HELPER_COUNT")" == 3 ]]
if [[ "$(grep -Fc 'fake-device com.simonwjackson.korri.debug --json 43120' "$FAKE_HELPER_ARG_LOG")" -ne 3 ]]; then
  echo 'recovery did not bound helper retries at exactly three attempts' >&2
  exit 1
fi
grep -F 'debug authority helper: helper failure attempt 3' "$TMP/fail.err" >/dev/null
if grep -Eq 'helper failure attempt [12]' "$TMP/fail.err"; then
  echo 'recovery printed stderr from a non-final bounded helper attempt' >&2
  exit 1
fi
if grep -F "$secret" "$TMP/fail.out" "$TMP/fail.err" >/dev/null; then
  echo 'recovery leaked RPC capability material after bounded failure' >&2
  exit 1
fi

printf 'Android game discovery authority recovery contract passed\n'
