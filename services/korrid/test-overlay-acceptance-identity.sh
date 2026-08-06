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

printf 'Overlay acceptance identity contract passed\n'
