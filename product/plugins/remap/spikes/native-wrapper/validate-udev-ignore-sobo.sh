#!/bin/sh
set -eu

cd "$(dirname "$0")"

RULE=/run/udev/rules.d/99-korri-remap-spike.rules
cleanup() {
  rm -f "$RULE"
  udevadm control --reload-rules >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cat > "$RULE" <<'RULE_EOF'
ACTION=="add|change", SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="korri-remap-spike-*", ENV{LIBINPUT_IGNORE_DEVICE}="1", ENV{ID_INPUT}="0", ENV{ID_INPUT_KEY}="0", ENV{ID_INPUT_KEYBOARD}="0", ENV{ID_INPUT_JOYSTICK}="0", MODE="0600", GROUP="root", TAG-="uaccess", TAG-="seat"
RULE_EOF
udevadm control --reload-rules
udevadm settle || true

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="$(find /nix/store -maxdepth 3 -path '*/bin/python3' 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$PYTHON_BIN" ] || [ ! -x "$PYTHON_BIN" ]; then
  echo "RESULT: FAIL - python3 not found" >&2
  exit 2
fi

"$PYTHON_BIN" ./uinput-leak-probe.py --json --strip-acl --target-user nobody | tee ./last-udev-ignore-result.json

if grep -q '"korriUiIsolatedCandidate": true' ./last-udev-ignore-result.json; then
  echo "RESULT: PASS - udev ignore + ACL strip isolated synthetic devices from Sway/Korri UI"
  exit 0
fi

if grep -q '"swaySawDevices": false' ./last-udev-ignore-result.json; then
  echo "RESULT: PARTIAL - udev ignored synthetic devices for Sway; inspect Korri permissions"
  exit 1
fi

echo "RESULT: FAIL - udev ignore candidate was still visible to Sway"
exit 1
