#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/device-check.sh"
FIXTURES="$HERE/fixtures"
EXPECTED_KEYS='304,305,307,308,310,311,314,315,316,317,318,704,705,706,707'
EXPECTED_ABS='0,1,2,3,4,5,16,17'

decode() {
  local bits="$1" fixture="$2"
  "$GATE" --remote bitmap-codes "$FIXTURES/$fixture" "$bits" | paste -sd, -
}

[[ "$(decode 64 capabilities-64-key.txt)" == "$EXPECTED_KEYS" ]]
[[ "$(decode 64 capabilities-64-abs.txt)" == "$EXPECTED_ABS" ]]
[[ "$(decode 32 capabilities-32-key.txt)" == "$EXPECTED_KEYS" ]]
[[ "$(decode 32 capabilities-32-abs.txt)" == "$EXPECTED_ABS" ]]
for malformed in capabilities-malformed.txt capabilities-overlong-32.txt capabilities-empty.txt; do
  bits=64
  [[ "$malformed" != capabilities-overlong-32.txt ]] || bits=32
  if "$GATE" --remote bitmap-codes "$FIXTURES/$malformed" "$bits" >/dev/null 2>&1; then
    printf 'malformed capability bitmap unexpectedly decoded: %s\n' "$malformed" >&2
    exit 1
  fi
done
printf 'inputd capability bitmap tests passed\n'
