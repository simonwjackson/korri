#!/usr/bin/env bash
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
ACCEPTANCE="$ROOT/clients/android/overlay-acceptance.sh"
TASKS="$ROOT/nix/tasks.nix"
CONNECTION_PROBE="$(type -P true)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for needle in \
  'EXPECTED_HARDWARE_SERIAL="$3"' \
  'DIRECT_PACKAGE="$4"' \
  'UNRELATED_PACKAGE="$5"' \
  'EVIDENCE_DIR="${6:-' \
  'ACTUAL_HARDWARE_SERIAL="$(adb_shell getprop ro.serialno' \
  'expected_hardware_serial=%s' \
  'actual_hardware_serial=%s'; do
  grep -F "$needle" "$ACCEPTANCE" >/dev/null
done
grep -F '<exact-hardware-serial>' "$TASKS" >/dev/null
grep -F 'KORRI_OVERLAY_ACCEPT_SCOPE' "$TASKS" >/dev/null
grep -F ": \"''\${2:?usage: overlay-accept" "$TASKS" >/dev/null
grep -F "\"''\${3:?usage: overlay-accept" "$TASKS" >/dev/null
if grep -Eq 'expected_(model|hardware_serial)=' "$TASKS"; then
  echo 'overlay-accept wrapper must not create unused validation-only assignments' >&2
  exit 1
fi

cat >"$TMP/adb" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$MOCK_ADB_LOG"
case "$*" in
  '-s test-endpoint wait-for-device') ;;
  '-s test-endpoint get-state') printf 'device\n' ;;
  '-s test-endpoint get-serialno') printf 'test-endpoint\n' ;;
  '-s test-endpoint shell getprop ro.product.model') printf 'Exact Model\n' ;;
  '-s test-endpoint shell getprop ro.serialno') printf 'wrong-hardware\n' ;;
  *) printf 'unexpected mock adb invocation: %s\n' "$*" >&2; exit 90 ;;
esac
MOCK
chmod +x "$TMP/adb"

set +e
PATH="$TMP:$PATH" \
MOCK_ADB_LOG="$TMP/adb.log" \
KORRI_ADB_BIN="$TMP/adb" \
KORRI_STREAM_CONNECTION_LOSS_PROBE="$CONNECTION_PROBE" \
bash "$ACCEPTANCE" \
  test-endpoint 'Exact Model' expected-hardware \
  com.korri.retroarch com.example.unrelated "$TMP/evidence" \
  >"$TMP/stdout" 2>"$TMP/stderr"
status=$?
set -e

if [[ "$status" -ne 1 ]]; then
  cat "$TMP/stderr" >&2
  echo "identity mismatch probe exited $status instead of 1" >&2
  exit 1
fi
grep -F "hardware serial mismatch: expected 'expected-hardware', got 'wrong-hardware'" \
  "$TMP/stderr" >/dev/null
[[ "$(wc -l <"$TMP/adb.log")" -eq 5 ]]
if grep -Eq '(^| )(push|pull|install|uninstall|shell (mkdir|rm|cp|mv|settings|am|input))([[:space:]]|$)' \
  "$TMP/adb.log"; then
  echo 'hardware mismatch must fail before any device mutation or cleanup' >&2
  exit 1
fi

# An unknown scope must fail before any device contact at all, so a typo can
# never mutate hardware or produce a run whose coverage is ambiguous.
for invalid_scope in partial retroarch FULL Stream stream-only local; do
  : >"$TMP/scope-adb.log"
  set +e
  PATH="$TMP:$PATH" \
  MOCK_ADB_LOG="$TMP/scope-adb.log" \
  KORRI_ADB_BIN="$TMP/adb" \
  KORRI_STREAM_CONNECTION_LOSS_PROBE="$CONNECTION_PROBE" \
  KORRI_OVERLAY_ACCEPT_SCOPE="$invalid_scope" \
  bash "$ACCEPTANCE" \
    test-endpoint 'Exact Model' expected-hardware \
    com.korri.retroarch com.example.unrelated "$TMP/scope-evidence" \
    >"$TMP/scope-stdout" 2>"$TMP/scope-stderr"
  scope_status=$?
  set -e
  if [[ "$scope_status" -ne 2 ]]; then
    cat "$TMP/scope-stderr" >&2
    echo "scope '$invalid_scope' exited $scope_status instead of 2" >&2
    exit 1
  fi
  grep -F "unknown KORRI_OVERLAY_ACCEPT_SCOPE: $invalid_scope" "$TMP/scope-stderr" >/dev/null || {
    echo "scope '$invalid_scope' did not report the exact unknown-scope rejection" >&2
    exit 1
  }
  [[ ! -s "$TMP/scope-adb.log" ]] || {
    echo "scope '$invalid_scope' contacted adb before rejection" >&2
    exit 1
  }
  [[ ! -e "$TMP/scope-evidence" ]] || {
    echo "scope '$invalid_scope' created an evidence directory before rejection" >&2
    exit 1
  }
done

# An unset or empty scope must resolve to full coverage, never to a narrowed run.
for default_scope_case in unset empty; do
  : >"$TMP/default-adb.log"
  set +e
  if [[ "$default_scope_case" == unset ]]; then
    PATH="$TMP:$PATH" \
    MOCK_ADB_LOG="$TMP/default-adb.log" \
    KORRI_ADB_BIN="$TMP/adb" \
    KORRI_STREAM_CONNECTION_LOSS_PROBE="$CONNECTION_PROBE" \
    bash "$ACCEPTANCE" \
      test-endpoint 'Exact Model' expected-hardware \
      com.korri.retroarch com.example.unrelated "$TMP/default-evidence" \
      >"$TMP/default-stdout" 2>"$TMP/default-stderr"
  else
    PATH="$TMP:$PATH" \
    MOCK_ADB_LOG="$TMP/default-adb.log" \
    KORRI_ADB_BIN="$TMP/adb" \
    KORRI_STREAM_CONNECTION_LOSS_PROBE="$CONNECTION_PROBE" \
    KORRI_OVERLAY_ACCEPT_SCOPE='' \
    bash "$ACCEPTANCE" \
      test-endpoint 'Exact Model' expected-hardware \
      com.korri.retroarch com.example.unrelated "$TMP/default-evidence" \
      >"$TMP/default-stdout" 2>"$TMP/default-stderr"
  fi
  default_status=$?
  set -e
  if [[ "$default_status" -ne 1 ]]; then
    cat "$TMP/default-stderr" >&2
    echo "$default_scope_case scope exited $default_status instead of the identity-mismatch 1" >&2
    exit 1
  fi
  grep -F 'OVERLAY ACCEPTANCE SCOPE — full' "$TMP/default-stdout" >/dev/null || {
    echo "$default_scope_case scope did not announce full coverage" >&2
    exit 1
  }
  if grep -F 'SKIPPED STAGES' "$TMP/default-stdout" >/dev/null; then
    echo "$default_scope_case scope announced skipped stages" >&2
    exit 1
  fi
done

# The stream scope must name every skipped stage and attribute local parity to
# the separate RetroArch gate before it reaches any device work.
: >"$TMP/stream-adb.log"
set +e
PATH="$TMP:$PATH" \
MOCK_ADB_LOG="$TMP/stream-adb.log" \
KORRI_ADB_BIN="$TMP/adb" \
KORRI_STREAM_CONNECTION_LOSS_PROBE="$CONNECTION_PROBE" \
KORRI_OVERLAY_ACCEPT_SCOPE=stream \
bash "$ACCEPTANCE" \
  test-endpoint 'Exact Model' expected-hardware \
  com.korri.retroarch com.example.unrelated "$TMP/stream-evidence" \
  >"$TMP/stream-stdout" 2>"$TMP/stream-stderr"
stream_status=$?
set -e
if [[ "$stream_status" -ne 1 ]]; then
  cat "$TMP/stream-stderr" >&2
  echo "stream scope exited $stream_status instead of the identity-mismatch 1" >&2
  exit 1
fi
grep -F 'OVERLAY ACCEPTANCE SCOPE — stream' "$TMP/stream-stdout" >/dev/null
grep -F 'ra-accept' "$TMP/stream-stdout" >/dev/null
grep -F 'does not by itself establish full unified overlay coverage' "$TMP/stream-stdout" >/dev/null
for skipped_stage in \
  local-overlay-open \
  local-mid-overlay-end \
  unrelated-active-session-negative \
  old-game-still-disarmed \
  fresh-publication-rearmed; do
  grep -Fx "  $skipped_stage" "$TMP/stream-stdout" >/dev/null || {
    echo "stream scope banner omitted skipped stage: $skipped_stage" >&2
    exit 1
  }
done

printf 'Overlay acceptance identity contract passed\n'
