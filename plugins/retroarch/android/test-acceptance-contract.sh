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
grep -F 'could not quiesce the exact recorded launch; backup and lock retained' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F 'EXPECTED_MODEL="$2"' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F 'EXPECTED_HARDWARE_SERIAL="$3"' "$ACCEPTANCE" >/dev/null
grep -F 'getprop ro.product.model' "$ACCEPTANCE" >/dev/null
grep -F 'getprop ro.serialno' "$ACCEPTANCE" >/dev/null
grep -F 'exec-out screencap -p' "$ACCEPTANCE" >/dev/null
grep -F 'GATE_LAUNCH_IDS' "$ACCEPTANCE" >/dev/null
grep -F 'assert_no_artemis_game_activity' "$ACCEPTANCE" >/dev/null
grep -F 'assert_korri_process_unchanged' "$ACCEPTANCE" >/dev/null
grep -F 'reset_portal_selection_to_top' "$ACCEPTANCE" >/dev/null
grep -F 'portal_shot_focuses_wario' "$ACCEPTANCE" >/dev/null
grep -F 'brightness" -ge 60' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_DPAD_CENTER' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_MODE' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 1' "$ACCEPTANCE" >/dev/null
grep -F 'assert_overlay_window_absent' "$ACCEPTANCE" >/dev/null
grep -F 'Korri gameplay overlay' "$ACCEPTANCE" >/dev/null
grep -F 'authenticated_retroarch_status' "$ACCEPTANCE" >/dev/null
grep -F 'discover_live_korri_authority' "$ACCEPTANCE" >/dev/null
grep -F 'new_logcat_marker' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F 'logcat_since "$AUTO_LOAD_LOG_MARKER"' "$ACCEPTANCE" >/dev/null
grep -F '"_tag":"system.health"' "$ACCEPTANCE" >/dev/null
grep -F 'existing_korri_pid=' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F 'am start --display 0 -n "$KORRI_ACTIVITY"' "$ACCEPTANCE" >/dev/null
grep -F 'assert_accessibility_service_enabled' "$ACCEPTANCE" >/dev/null
grep -F 'assert_shell_foreground' "$ACCEPTANCE" >/dev/null
grep -F 'assert_menu_status 1' "$ACCEPTANCE" >/dev/null
grep -F 'assert_selection_advanced' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_DPAD_DOWN' "$ACCEPTANCE" >/dev/null
grep -F 'assert_menu_status 0' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_SELECT' "$ACCEPTANCE" >/dev/null
grep -F 'network_cmd_port' "$ACCEPTANCE" >/dev/null
grep -F 'udp_rc' "$ACCEPTANCE" >/dev/null
grep -F 'unauthenticated UDP probe must time out with rc=124 and no response' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BACK' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 2' "$ACCEPTANCE" >/dev/null
grep -F 'enabled_accessibility_services' "$ACCEPTANCE" >/dev/null
grep -F 'use: "@korri:retroarch/retroarch"' "$WL4_LIBRARY" >/dev/null
grep -F 'runtime: "@korri:mgba/mgba"' "$WL4_LIBRARY" >/dev/null
if grep -Eq 'assert_rgui_menu_visible|assert_rgui_selection_moves|compare -metric' "$ACCEPTANCE"; then
  echo 'RetroArch native menu acceptance must use authenticated status telemetry' >&2
  exit 1
fi
if grep -Eq 'input (tap|swipe)' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must select the one-item fixture semantically, not by coordinates' >&2
  exit 1
fi
if grep -F 'launch_spec=' "$ACCEPTANCE" >/dev/null; then
  echo 'RetroArch acceptance must not speculatively launch through RPC before portal activation' >&2
  exit 1
fi
if grep -Eq 'udp_unauthenticated.*\|\| true|rm -f /sdcard/korri-acceptance.png|pull /sdcard/korri-acceptance.png' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must preserve UDP errors and use local screenshot capture' >&2
  exit 1
fi
if grep -Eq 'pm (clear|grant|install|uninstall)| adb install' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must not mutate installed packages' >&2
  exit 1
fi
if sed '/^[[:space:]]*#/d' "$ACCEPTANCE" \
  | grep -Eq '(force-stop|am[[:space:]]+kill|kill[[:space:]]+[^-]).*(KORRI_PACKAGE|existing_korri_pid|com\.simonwjackson\.korri)'; then
  echo 'RetroArch acceptance must never stop or kill Korri after the user-owned grant' >&2
  exit 1
fi
if grep -Eq 'logcat[[:space:]]+-c' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must retain prior logcat while discovering the live authority' >&2
  exit 1
fi
if grep -Eq 'settings (put|delete) secure (enabled_accessibility_services|accessibility_enabled)' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must not modify Android accessibility settings' >&2
  exit 1
fi

printf 'RetroArch acceptance config-safety contract passed\n'
