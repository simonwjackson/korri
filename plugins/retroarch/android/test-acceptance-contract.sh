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
grep -F 'focus_wario_in_installed_library' "$ACCEPTANCE" >/dev/null
grep -F 'traverse_library_to_final_viewport' "$ACCEPTANCE" >/dev/null
grep -F 'DEBUG_PORTAL_FOCUS_GAME_SH=' "$ACCEPTANCE" >/dev/null
grep -F 'portal_shot_focuses_wario' "$ACCEPTANCE" >/dev/null
grep -F 'render_focused_wario_crop_evidence' "$ACCEPTANCE" >/dev/null
grep -F 'focus-crop-4x.png' "$ACCEPTANCE" >/dev/null
grep -F 'focusRingBoundaryMaxRatio' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract pattern includes `$12`.
if grep -Eq 'deskew|tolower\(\$12\) == "wario"|brightness.*-ge' "$ACCEPTANCE"; then
  echo 'RetroArch focus evidence must not depend on full-frame OCR title coordinates' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F -- '"$SERIAL" "$KORRI_PACKAGE" --library' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F -- '"$SERIAL" "$KORRI_PACKAGE" --verify-library' "$ACCEPTANCE" >/dev/null
grep -F -- "--game 'local-game:wl4' 'Wario Land 4'" "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_A' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_DPAD_CENTER' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BUTTON_MODE' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 1' "$ACCEPTANCE" >/dev/null
grep -F 'assert_overlay_window_absent' "$ACCEPTANCE" >/dev/null
grep -F 'Korri gameplay overlay' "$ACCEPTANCE" >/dev/null
grep -F 'authenticated_retroarch_status' "$ACCEPTANCE" >/dev/null
grep -F 'discover_live_korri_authority' "$ACCEPTANCE" >/dev/null
grep -F 'DEBUG_PORTAL_RELOAD_SH=' "$ACCEPTANCE" >/dev/null
grep -F -- "--expect-game wl4 'Wario Land 4'" "$ACCEPTANCE" >/dev/null
grep -F -- '--expect-portal' "$ACCEPTANCE" >/dev/null
grep -F 'assert_pristine_gate_state' "$ACCEPTANCE" >/dev/null
grep -F 'assert_session_idle' "$ACCEPTANCE" >/dev/null
grep -F 'revalidate_gate_state_after_mutation' "$ACCEPTANCE" >/dev/null
grep -F 'RUN_NONCE=' "$ACCEPTANCE" >/dev/null
grep -F 'BACKUP_OWNER_REMOTE=' "$ACCEPTANCE" >/dev/null
grep -F 'BACKUP_CREATED=false' "$ACCEPTANCE" >/dev/null
grep -F 'remove_owned_backup' "$ACCEPTANCE" >/dev/null
grep -F 'refusing pre-existing backup directory' "$ACCEPTANCE" >/dev/null
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
grep -F 'UDP_COMPLETION_MARKER=' "$ACCEPTANCE" >/dev/null
grep -F 'assert_adb_probe_ready' "$ACCEPTANCE" >/dev/null
grep -F 'remote_nc_rc=124 remote_nc_output=' "$ACCEPTANCE" >/dev/null
grep -F 'UDP probe transport failed before its remote completion marker' "$ACCEPTANCE" >/dev/null
grep -F 'unauthenticated UDP probe must report exact remote rc=124 and no response' "$ACCEPTANCE" >/dev/null
grep -F 'KEYCODE_BACK' "$ACCEPTANCE" >/dev/null
grep -F 'invoke_overlay_row 2' "$ACCEPTANCE" >/dev/null
grep -F 'enabled_accessibility_services' "$ACCEPTANCE" >/dev/null
grep -F 'use: "@korri:retroarch/retroarch"' "$WL4_LIBRARY" >/dev/null
grep -F 'runtime: "@korri:mgba/mgba"' "$WL4_LIBRARY" >/dev/null
library_focus_source="$(sed -n '/^focus_wario_in_installed_library() {/,/^}/p' "$ACCEPTANCE")"
# shellcheck disable=SC2016 # Literal source-contract needles.
nav_focus_line="$(grep -nF -- '"$SERIAL" "$KORRI_PACKAGE" --library' <<<"$library_focus_source" | head -1 | cut -d: -f1)"
open_library_line="$(grep -nF 'KEYCODE_BUTTON_A' <<<"$library_focus_source" | head -1 | cut -d: -f1)"
# shellcheck disable=SC2016 # Literal source-contract needle.
verify_library_line="$(grep -nF -- '"$SERIAL" "$KORRI_PACKAGE" --verify-library' <<<"$library_focus_source" | head -1 | cut -d: -f1)"
traversal_line="$(grep -nF 'traverse_library_to_final_viewport' <<<"$library_focus_source" | head -1 | cut -d: -f1)"
strict_focus_line="$(grep -nF -- "--game 'local-game:wl4'" <<<"$library_focus_source" | head -1 | cut -d: -f1)"
[[ -n "$nav_focus_line" && -n "$open_library_line" && -n "$verify_library_line" \
  && -n "$traversal_line" && -n "$strict_focus_line" \
  && "$nav_focus_line" -lt "$open_library_line" \
  && "$open_library_line" -lt "$verify_library_line" \
  && "$verify_library_line" -lt "$traversal_line" \
  && "$traversal_line" -lt "$strict_focus_line" ]] || {
  echo 'RetroArch acceptance must focus Library, activate it, verify its view, traverse, then focus Wario' >&2
  exit 1
}
if grep -F 'KEYCODE_DPAD_RIGHT' <<<"$library_focus_source" >/dev/null; then
  echo 'RetroArch acceptance must not assume retained Home focus before opening Library' >&2
  exit 1
fi
traversal_source="$(sed -n '/^traverse_library_to_final_viewport() {/,/^}/p' "$ACCEPTANCE")"
traversal_max="$(sed -n 's/^[[:space:]]*local max_steps=\([0-9][0-9]*\)$/\1/p' <<<"$traversal_source")"
[[ "$traversal_max" =~ ^[0-9]+$ && "$traversal_max" -ge 1 && "$traversal_max" -le 64 ]] || {
  echo 'RetroArch Library traversal must have an explicit bound no larger than 64' >&2
  exit 1
}
grep -F 'KEYCODE_DPAD_DOWN' <<<"$traversal_source" >/dev/null
grep -F 'sleep 0.15' <<<"$traversal_source" >/dev/null
if grep -Eq 'DEBUG_PORTAL_FOCUS_GAME_SH|input (tap|swipe)' <<<"$traversal_source"; then
  echo 'RetroArch Library traversal must use only bounded controller focus movement' >&2
  exit 1
fi
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
discovery_line="$(grep -nF 'discover_live_korri_authority ||' "$ACCEPTANCE" | head -1 | cut -d: -f1)"
pristine_line="$(grep -nF 'assert_pristine_gate_state' "$ACCEPTANCE" | tail -1 | cut -d: -f1)"
idle_line="$(grep -nF 'assert_session_idle' "$ACCEPTANCE" | tail -1 | cut -d: -f1)"
mutation_line="$(grep -nF 'provision_checkpoint_files' "$ACCEPTANCE" | tail -1 | cut -d: -f1)"
[[ -n "$discovery_line" && -n "$pristine_line" && -n "$idle_line" && -n "$mutation_line" \
  && "$discovery_line" -lt "$mutation_line" \
  && "$pristine_line" -lt "$mutation_line" \
  && "$idle_line" -lt "$mutation_line" ]] || {
  echo 'RetroArch acceptance must prove live RPC, idle session, activities, processes, and foreground before mutation' >&2
  exit 1
}
if grep -F '.retroarch-route-check-backup-$$' "$ACCEPTANCE" >/dev/null; then
  echo 'RetroArch acceptance backup ownership must never be PID-derived' >&2
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
discovery_source="$(sed -n '/^discover_live_korri_authority() {/,/^}/p' "$ACCEPTANCE")"
if grep -Eq 'logcat|KorridServer|KorriPortal|listening on 127' <<<"$discovery_source"; then
  echo 'RetroArch authority discovery must not depend on historical logcat' >&2
  exit 1
fi
grep -F 'KORRI_ANDROID_DEBUG_AUTHORITY_JSON' "$ACCEPTANCE" >/dev/null
# shellcheck disable=SC2016 # Literal source-contract needle.
grep -F -- '"$DEBUG_CAPABILITY_SH" "$SERIAL" "$KORRI_PACKAGE" --json' "$ACCEPTANCE" >/dev/null
if grep -Eq 'settings (put|delete) secure (enabled_accessibility_services|accessibility_enabled)' "$ACCEPTANCE"; then
  echo 'RetroArch acceptance must not modify Android accessibility settings' >&2
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

ACTIVITY_PARSER="$TMP/activity-dump-parser.sh"
sed -n '/^activity_dump_has_live_component() {/,/^}/p' "$ACCEPTANCE" >"$ACTIVITY_PARSER"
# shellcheck source=/dev/null
source "$ACTIVITY_PARSER"
GAME_COMPONENT='com.simonwjackson.korri.debug/com.limelight.Game'
FORK_COMPONENT='com.korri.retroarch/com.retroarch.browser.retroactivity.RetroActivityFuture'
STOCK_COMPONENT='com.retroarch.aarch64/com.retroarch.browser.retroactivity.RetroActivityFuture'
# Attached task ids (t0+) are live even when the record is paused/history.
activity_dump_has_live_component \
  "    mLastPausedActivity: ActivityRecord{ac82bb6 u0 $GAME_COMPONENT t69}" \
  "$GAME_COMPONENT"
activity_dump_has_live_component \
  "    * Hist #0: ActivityRecord{aabbcc u0 $FORK_COMPONENT t0}" \
  'com.korri.retroarch/'
activity_dump_has_live_component \
  "    * Hist #0: ActivityRecord{ddeeff u0 $STOCK_COMPONENT t42}" \
  'com.retroarch.aarch64/'
# A resumed/top Game record is live even if a malformed summary says t-1.
activity_dump_has_live_component \
  "    topResumedActivity=ActivityRecord{112233 u0 $GAME_COMPONENT t-1 f}" \
  "$GAME_COMPONENT"
# Destroyed/finishing t-1 bookkeeping is not an attached task.
for component in "$GAME_COMPONENT" 'com.korri.retroarch/' 'com.retroarch.aarch64/'; do
  case "$component" in
    "$GAME_COMPONENT") record="$GAME_COMPONENT" ;;
    'com.korri.retroarch/') record="$FORK_COMPONENT" ;;
    'com.retroarch.aarch64/') record="$STOCK_COMPONENT" ;;
  esac
  if activity_dump_has_live_component \
    "    mLastPausedActivity: ActivityRecord{445566 u0 $record t-1 f}}" \
    "$component"; then
    echo "activity parser treated destroyed t-1 tombstone as live: $component" >&2
    exit 1
  fi
done

UDP_ASSERTION="$TMP/assert-udp-no-response.sh"
sed -n '/^assert_udp_no_response() {/,/^}/p' "$ACCEPTANCE" >"$UDP_ASSERTION"
# shellcheck source=/dev/null
source "$UDP_ASSERTION"
marker='korri-udp-probe-complete-review'
assert_udp_no_response "$marker" "$marker remote_nc_rc=124 remote_nc_output="
for rejected in \
  '' \
  'adb transport timeout' \
  "$marker remote_nc_rc=1 remote_nc_output=" \
  "$marker remote_nc_rc=124 remote_nc_output=unexpected"; do
  if assert_udp_no_response "$marker" "$rejected" >/dev/null 2>&1; then
    echo "UDP negative accepted an inexact remote result: $rejected" >&2
    exit 1
  fi
done

FOCUS_RENDERER="$TMP/focus-renderer.sh"
sed -n '/^render_focused_wario_crop_evidence() {/,/^}/p' "$ACCEPTANCE" >"$FOCUS_RENDERER"
# shellcheck source=/dev/null
source "$FOCUS_RENDERER"
cat >"$TMP/focused-wario.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <rect width="640" height="480" fill="#050505"/>
  <g transform="translate(548,230)">
    <rect width="82" height="120" rx="8" fill="#17343d" stroke="#32c7e6" stroke-width="4"/>
    <text x="41" y="112" text-anchor="middle" font-family="DejaVu Sans" font-size="9" fill="white">Wario Land 4</text>
  </g>
</svg>
SVG
magick "$TMP/focused-wario.svg" "$TMP/focused-wario-full.png"
cat >"$TMP/focused-wario.json" <<'JSON'
{"gameId":"local-game:wl4","title":"Wario Land 4","focused":true,"rectFinitePositive":true,"fullyOnScreen":true,"bounds":{"left":548,"top":230,"width":82,"height":120},"viewport":{"width":640,"height":480}}
JSON
# The title is intentionally too small for reliable full-frame OCR. Exact DOM
# bounds must drive the crop and scale before OCR rather than false-failing.
tesseract "$TMP/focused-wario-full.png" stdout --psm 6 >"$TMP/full-frame.txt" 2>/dev/null
if grep -Eqi 'wario[[:space:]]+land[[:space:]]+4' "$TMP/full-frame.txt"; then
  echo 'deterministic focused-Wario fixture unexpectedly became full-frame OCR-readable' >&2
  exit 1
fi
render_focused_wario_crop_evidence \
  "$TMP/focused-wario-full.png" "$TMP/focused-wario.json" \
  "$TMP/focused-wario-crop.png" "$TMP/focused-wario-crop-4x.png" \
  "$TMP/focused-wario-crop.txt" "$TMP/focused-wario-observation.json"
jq -e '
  .crop == {x:538,y:220,width:102,height:140}
  and .focusedElement == {x:548,y:230,width:82,height:120}
  and .focusRingBoundaryMaxRatio >= 0.08
  and .activeElementVerified == true
  and .ocrTitle == "Wario Land 4"
' "$TMP/focused-wario-observation.json" >/dev/null
grep -Eqi 'wario[[:space:]]+land[[:space:]]+4' "$TMP/focused-wario-crop.txt"
[[ -s "$TMP/focused-wario-crop.png" && -s "$TMP/focused-wario-crop-4x.png" ]]

printf 'RetroArch acceptance config-safety contract passed\n'
