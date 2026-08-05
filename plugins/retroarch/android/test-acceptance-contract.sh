#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCEPTANCE="$HERE/device-acceptance.sh"
ROOT="$(cd "$HERE/../../.." && pwd)"
WL4_LIBRARY="$ROOT/docs/research/retroarch-plugin-route/library-wl4.yaml"

[[ -f "$WL4_LIBRARY" ]]
# shellcheck disable=SC2016 # Literal source-contract needles.
grep -F 'CHECKPOINT_LIBRARY="$ROOT/docs/research/retroarch-plugin-route/library-wl4.yaml"' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needles.
grep -F 'LOCK_REMOTE="$ANDROID_STORAGE_ROOT/.android-app-route-check.lock"' "$ACCEPTANCE" >/dev/null
grep -F 'if restore_checkpoint_files; then' "$ACCEPTANCE" >/dev/null
grep -F 'remote_state()' "$ACCEPTANCE" >/dev/null
grep -F 'Only now may cleanup interpret false flags as original absence' "$ACCEPTANCE" >/dev/null
grep -F 'rmdir ' "$ACCEPTANCE" >/dev/null
grep -F 'retroarch.cfg' "$ACCEPTANCE" >/dev/null
grep -F 'wl4.state.auto' "$ACCEPTANCE" >/dev/null
grep -F 'wl4.srm' "$ACCEPTANCE" >/dev/null
grep -F 'must be stopped before acceptance can back up save state' "$ACCEPTANCE" >/dev/null
grep -F 'could not quiesce the target; backup and lock retained' "$ACCEPTANCE" >/dev/null
grep -F 'rm -f /sdcard/korri-acceptance.png' "$ACCEPTANCE" >/dev/null
grep -F '"gameId":"wl4"' "$ACCEPTANCE" >/dev/null
grep -F 'reset_portal_selection_to_top' "$ACCEPTANCE" >/dev/null
grep -F 'portal_shot_focuses_wario' "$ACCEPTANCE" >/dev/null
grep -F 'brightness" -ge 60' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_DPAD_CENTER' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_MODE' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 1' "$ACCEPTANCE" >/dev/null
grep -F 'assert_overlay_window_absent' "$ACCEPTANCE" >/dev/null
grep -F 'Korri gameplay overlay' "$ACCEPTANCE" >/dev/null
grep -F 'assert_rgui_menu_visible' "$ACCEPTANCE" >/dev/null
grep -F 'assert_rgui_selection_moves' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_DPAD_DOWN' "$ACCEPTANCE" >/dev/null
grep -F 'assert_native_shortcut_disabled' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_SELECT' "$ACCEPTANCE" >/dev/null
grep -F 'network_cmd_port' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BACK' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 2' "$ACCEPTANCE" >/dev/null
grep -F 'enabled_accessibility_services' "$ACCEPTANCE" >/dev/null
grep -F 'use: "@korri:retroarch/retroarch"' "$WL4_LIBRARY" >/dev/null
grep -F 'runtime: "@korri:mgba/mgba"' "$WL4_LIBRARY" >/dev/null
if grep -Eq 'input (tap|swipe)' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must select the one-item fixture semantically, not by coordinates' >&2
  exit 1
fi
if grep -Eq 'pm (clear|grant|install|uninstall)| adb install' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must not mutate the installed target package' >&2
  exit 1
fi
if grep -Eq 'settings (put|delete) secure (enabled_accessibility_services|accessibility_enabled)' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must not modify Android accessibility settings' >&2
  exit 1
fi

printf 'RetroArch acceptance config-safety contract passed\n'
