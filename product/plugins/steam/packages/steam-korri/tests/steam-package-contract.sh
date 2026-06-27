#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
SCRIPT_DIR="$PACKAGE_DIR/scripts"
MANIFEST="$PACKAGE_DIR/manifest.nix"
README="$PACKAGE_DIR/README.md"

fail() { echo "FAIL: $*" >&2; exit 1; }

for script in \
  steam-arm64-bootstrap \
  steam-arm64-seed \
  steam-guest-native \
  steam-guest-runtime-prep \
  steam-guest-run; do
  [ -f "$SCRIPT_DIR/$script" ] || fail "missing package script: $script"
done

grep -q 'explicit legacy Steam Runtime / pressure-vessel repair' "$README" \
  || fail "README must describe runtime prep as explicit legacy repair"
grep -q 'not part of normal launch startup' "$README" \
  || fail "README must state runtime prep is not normal startup"
grep -q 'FHS Steam execution capsule' "$README" \
  || fail "README must describe the package-owned FHS Steam execution capsule"
grep -q 'not a product compatibility surface' "$README" \
  || fail "README must state x86 support is not a product compatibility surface"

grep -q 'steam-guest-runtime-prep' "$MANIFEST" \
  || fail "manifest must list steam-guest-runtime-prep in the package contract"
grep -q 'steam-guest-run' "$MANIFEST" \
  || fail "manifest must list steam-guest-run in the package contract"
grep -q 'fex-emu/Config.json' "$MANIFEST" \
  || fail "manifest must list the ROCKNIX FEX config template"
grep -q 'steamdeck_stable' "$SCRIPT_DIR/steam-arm64-bootstrap" \
  || fail "ARM64 bootstrap should default to the steamdeck_stable tracking channel"
grep -q 'steamdeck_stable' "$SCRIPT_DIR/steam-arm64-seed" \
  || fail "ARM64 seed should default to the steamdeck_stable tracking channel"
grep -q 'steam_client_${STEAM_BETA}_linuxarm64' "$SCRIPT_DIR/steam-arm64-seed" \
  || fail "ARM64 seed should resolve the configured linuxarm64 channel"
[ -f "$PACKAGE_DIR/resources/fex-emu/Config.json" ] \
  || fail "missing vendored FEX Config.json template"
[ -f "$PACKAGE_DIR/resources/fex-emu/AppConfig/steamwebhelper.json" ] \
  || fail "missing vendored FEX steamwebhelper app config"

if grep -R -nE '\b(systemctl|swaymsg|gamescope)\b|services\.korri|korri\.' "$SCRIPT_DIR"; then
  fail "Steam package scripts must not own system/session/product orchestration"
fi

if grep -R -n '/storage' "$SCRIPT_DIR"; then
  fail "Steam package scripts must not hardcode guest /storage defaults"
fi

expect_missing_env_failure() {
  local script="$1" env_name="$2"
  local out status
  set +e
  out=$(env -i PATH="$PATH" bash "$SCRIPT_DIR/$script" --check 2>&1)
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail "$script --check should fail without $env_name"
  printf '%s\n' "$out" | grep -q "$env_name" \
    || fail "$script missing-env error should mention $env_name"
}

expect_missing_env_failure steam-guest-runtime-prep STEAM_HOME
expect_missing_env_failure steam-guest-run STEAM_HOME

echo "steam-package-contract: ok"
