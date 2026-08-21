#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCEPTANCE="$HERE/launcher-device-acceptance.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$ACCEPTANCE" ]]
if grep -E '(^|[[:space:]])fastboot([[:space:]]|$)' "$ACCEPTANCE" >/dev/null; then
  echo 'launcher device acceptance contains fastboot' >&2
  exit 1
fi
if grep -E 'adb .*\b(reboot|push|install|uninstall|remount|root)\b|set-home-activity|settings put|pm (clear|disable|enable|install|uninstall)' "$ACCEPTANCE" >/dev/null; then
  echo 'launcher device acceptance contains a device mutation' >&2
  exit 1
fi
if "$ACCEPTANCE" wrong-serial "$TMP/wrong-serial" >"$TMP/wrong.stdout" 2>"$TMP/wrong.stderr"; then
  echo 'launcher device acceptance accepted the wrong serial' >&2
  exit 1
fi
grep -F 'device serial does not match its contract' "$TMP/wrong.stderr" >/dev/null

if [[ -z "${ODIN2PORTAL_ACCEPTANCE_SERIAL:-}" ]]; then
  printf 'odin2portal launcher device acceptance integration skipped: set ODIN2PORTAL_ACCEPTANCE_SERIAL\n'
  exit 0
fi
if "$ACCEPTANCE" "$ODIN2PORTAL_ACCEPTANCE_SERIAL" "$TMP/current-device" \
  >"$TMP/current.stdout" 2>"$TMP/current.stderr"; then
  echo 'launcher device acceptance unexpectedly passed before the launcher image was installed' >&2
  exit 1
fi
grep -F 'Korri is not installed at the approved product path' "$TMP/current.stderr" >/dev/null
printf 'odin2portal launcher device acceptance pre-install rejection passed\n'
