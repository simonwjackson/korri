#!/bin/sh
set -eu

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="$(find /nix/store -maxdepth 3 -path '*/bin/python3' 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$PYTHON_BIN" ] || [ ! -x "$PYTHON_BIN" ]; then
  echo "RESULT: FAIL - python3 not found" >&2
  exit 2
fi

"$PYTHON_BIN" ./uinput-leak-probe.py --json --attach-seat seat-korri-remap | tee ./last-seat-result.json

if grep -q '"privateCandidate": true' ./last-seat-result.json; then
  echo "RESULT: PASS - seat attachment candidate did not leak to observed outside readers"
  exit 0
fi

echo "RESULT: FAIL - seat attachment candidate leaked or did not deliver"
exit 1
