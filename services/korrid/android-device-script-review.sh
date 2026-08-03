#!/usr/bin/env bash
# Deterministic review checks for Android device shell gates. These do not
# contact hardware; they guard the safety properties that are otherwise easy to
# regress while preserving the real device gates as the source of journey truth.
set -euo pipefail

ROOT="${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
CRATE="$ROOT/services/korrid"
ANDROID_SMOKE="$CRATE/android-smoke.sh"
ANDROID_APP_ROUTE="$CRATE/android-app-route-check.sh"
JOURNEY_RESUME="$CRATE/journey-resume.sh"

# The review's canonical cases must stay deterministic even when a developer's
# shell is primed for an alternate device-gate run. Individual alternate cases
# below set their own overrides explicitly.
for name in "${!KORRI_DEVICE_SCRIPT_REVIEW_@}"; do
  unset "$name"
done
unset \
  ANDROID_SERIAL \
  KORRI_ADB_BIN \
  KORRI_ANDROID_APK \
  KORRI_ANDROID_APP_PACKAGE \
  KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY \
  KORRI_ANDROID_APP_ROUTE_HOST_PORT \
  KORRI_ANDROID_APP_ROUTE_JOURNEY_SH \
  KORRI_ANDROID_APP_ROUTE_SMOKE_SH \
  KORRI_ANDROID_DEVICE \
  KORRI_ANDROID_SMOKE_LIBRARY \
  KORRI_ANDROID_UPSTREAMS_CONFIG \
  KORRI_JOURNEY_EXPECTED_TITLE \
  KORRI_MAGICK_BIN \
  KORRI_TESSERACT_BIN \
  SHOTS

bash -n "$ANDROID_SMOKE" "$ANDROID_APP_ROUTE" "$JOURNEY_RESUME"

for resumed_activity_script in \
  "$ANDROID_APP_ROUTE" \
  "$CRATE/journey-compare.sh" \
  "$JOURNEY_RESUME" \
  "$CRATE/journey-switch.sh" \
  "$CRATE/storage-notice-check.sh"; do
  if sed '/^[[:space:]]*#/d' "$resumed_activity_script" \
    | grep -E 'grep .*ResumedActivity' \
    | grep -Fv '(topResumedActivity|mResumedActivity)' >/dev/null; then
    echo "$(basename "$resumed_activity_script") must match only topResumedActivity/mResumedActivity, not broad ResumedActivity history" >&2
    exit 1
  fi
done

# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if sed '/^[[:space:]]*#/d' "$ANDROID_SMOKE" | grep -E 'push "\$CHECKPOINT_(CONFIG|LIBRARY)"' >/dev/null; then
  echo 'android-smoke.sh must not push checkpoint config.yaml/library.yaml in the general device smoke path' >&2
  exit 1
fi
if ! grep -F -- '--expect-installed-route' "$ANDROID_SMOKE" >/dev/null; then
  echo 'android-smoke.sh must keep installed-route assertions behind --expect-installed-route' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F -- '--expect-installed-route "$SERIAL"' "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must opt in to installed-route smoke assertions explicitly' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'CHECKPOINT_LIBRARY="${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-$ROOT/docs/research/retroarch-plugin-route/library.yaml}"' "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must expose an override for the checkpoint library while keeping the canonical default' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'CHECKPOINT_LIBRARY="${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-$ROOT/docs/research/retroarch-plugin-route/library.yaml}"' "$ANDROID_SMOKE" >/dev/null; then
  echo 'android-smoke.sh must byte-check the same overrideable checkpoint library as the dedicated installed-route gate' >&2
  exit 1
fi
if ! grep -F 'PRIOR_USER=' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must capture user_rotation before pinning portrait' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'settings put system user_rotation ${PRIOR_USER:-0}' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must restore user_rotation on exit' >&2
  exit 1
fi
if ! grep -F 'assert_portal_exposes_title' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must verify the portal exposes the expected title before D-pad activation' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'KORRI_ACTIVITY="$KORRI/com.limelight.KorriShellActivity"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must target KorriShellActivity explicitly when foregrounding Korri' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F '"$JOURNEY_RESUME" "$SERIAL" "$GAME"' "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must pass the configured Android app package into journey-resume.sh' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'adb_shell_capture "pm path $GAME"' "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must run the package probe through the bounded adb helper' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'timeout 15 "$ADB_BIN" connect "$SERIAL"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must bound wireless adb connect attempts' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'pid_of() { adb_shell "pidof $GAME' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must route pid_of through the bounded adb shell helper' >&2
  exit 1
fi
if sed '/^[[:space:]]*#/d' "$JOURNEY_RESUME" | grep -F 'monkey -p' >/dev/null; then
  echo 'journey-resume.sh must not use monkey launcher activation for Korri foregrounding' >&2
  exit 1
fi
foreground_health_check="$(sed -n '/health_response=/,/local_games_response=/p' "$ANDROID_APP_ROUTE")"
if ! grep -F '._tag == "system.health"' <<<"$foreground_health_check" >/dev/null; then
  echo 'android-app-route-check.sh must semantically assert foreground health top-level system.health tag' >&2
  exit 1
fi
if ! grep -F '.outcome._tag == "Ok"' <<<"$foreground_health_check" >/dev/null; then
  echo 'android-app-route-check.sh must semantically assert foreground health outcome Ok' >&2
  exit 1
fi
if ! grep -F '.outcome.payload.version | type == "string" and length > 0' <<<"$foreground_health_check" >/dev/null; then
  echo 'android-app-route-check.sh must semantically assert foreground health response version is a non-empty string' >&2
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
ADB_LOG="$TMP/adb.log"
CHILD_LOG="$TMP/children.log"
FAKE_ADB="$TMP/adb"

PID_OF_FUNCTION="$TMP/journey-pid-of.sh"
grep -E '^pid_of\(\) \{' "$JOURNEY_RESUME" >"$PID_OF_FUNCTION"
if [[ "$(wc -l <"$PID_OF_FUNCTION")" -ne 1 ]]; then
  echo 'journey-resume.sh must keep exactly one pid_of function for deterministic review' >&2
  exit 1
fi
PIDOF_BIN="$TMP/pidof-bin"
PIDOF_ADB="$TMP/pidof-adb"
mkdir -p "$PIDOF_BIN"
cat >"$PIDOF_BIN/pidof" <<'PIDOF'
#!/usr/bin/env bash
set -euo pipefail
case "${KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_MODE:-missing}" in
  missing)
    exit 1
    ;;
  present)
    printf '12345\r\n'
    ;;
  error)
    exit 2
    ;;
  *)
    exit 64
    ;;
esac
PIDOF
chmod +x "$PIDOF_BIN/pidof"
cat >"$PIDOF_ADB" <<'PIDOF_ADB'
#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s)
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
subcommand="${1:-}"
if [[ $# -gt 0 ]]; then
  shift
fi
if [[ "$subcommand" != shell ]]; then
  exit 1
fi
PATH="$KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_BIN:$PATH" bash -c "$*"
PIDOF_ADB
chmod +x "$PIDOF_ADB"
# shellcheck disable=SC2034 # Used by the sourced journey-resume.sh pid_of function.
GAME=com.playdigious.tmnt
adb_shell() {
  "$PIDOF_ADB" -s device-1 shell "$@"
}
export KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_BIN="$PIDOF_BIN"
# shellcheck source=/dev/null
source "$PID_OF_FUNCTION"
export KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_MODE=missing
if ! empty_pid="$(pid_of)"; then
  echo 'journey-resume.sh pid_of must treat pidof exit 1 as an empty process result' >&2
  exit 1
fi
if [[ -n "$empty_pid" ]]; then
  echo "journey-resume.sh pid_of returned output for an absent process: $empty_pid" >&2
  exit 1
fi
export KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_MODE=present
if [[ "$(pid_of)" != 12345 ]]; then
  echo 'journey-resume.sh pid_of must trim CR/LF while returning a real pid' >&2
  exit 1
fi
export KORRI_DEVICE_SCRIPT_REVIEW_PIDOF_MODE=error
set +e
pid_of >"$TMP/pid-error.out" 2>"$TMP/pid-error.err"
pid_error_status=$?
set -e
if [[ "$pid_error_status" -eq 0 ]]; then
  echo 'journey-resume.sh pid_of must not mask non-empty pidof failures' >&2
  exit 1
fi

# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'MAGICK_BIN="${KORRI_MAGICK_BIN:-magick}"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must expose a magick binary override seam for deterministic review' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'TESSERACT_BIN="${KORRI_TESSERACT_BIN:-tesseract}"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must expose a tesseract binary override seam for deterministic review' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'ocr_shot "$label"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must OCR the portal screenshot before D-pad activation' >&2
  exit 1
fi
if ! sed -n '/android-app-route-check = {/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.imagemagick' >/dev/null; then
  echo 'android-app-route-check task must put ImageMagick on PATH for the journey OCR gate' >&2
  exit 1
fi
if ! sed -n '/android-app-route-check = {/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.tesseract' >/dev/null; then
  echo 'android-app-route-check task must put tesseract on PATH for the journey gate' >&2
  exit 1
fi
if ! sed -n '/journey-resume = deviceScript/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.imagemagick' >/dev/null; then
  echo 'journey-resume task must put ImageMagick on PATH for the portal OCR gate' >&2
  exit 1
fi
if ! sed -n '/journey-resume = deviceScript/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.tesseract' >/dev/null; then
  echo 'journey-resume task must put tesseract on PATH for the portal OCR gate' >&2
  exit 1
fi

JOURNEY_REVIEW_BIN="$TMP/journey-bin"
JOURNEY_REVIEW_ADB="$TMP/journey-adb"
JOURNEY_REVIEW_MAGICK="$TMP/journey-magick"
JOURNEY_REVIEW_TESSERACT="$TMP/journey-tesseract"
JOURNEY_REVIEW_SLEEP="$JOURNEY_REVIEW_BIN/sleep"
# Seed the stale-screenshot hazard under this review's temp dir; the source
# guard below keeps the deterministic review from reading the live external dir.
AMBIENT_CONVENTIONAL_SHOTS="$TMP/ambient/korri-journey"
AMBIENT_CONVENTIONAL_HOME="$AMBIENT_CONVENTIONAL_SHOTS/1-korri-home.png"
mkdir -p "$JOURNEY_REVIEW_BIN" "$AMBIENT_CONVENTIONAL_SHOTS"
printf 'stale black screenshot placeholder\n' >"$AMBIENT_CONVENTIONAL_HOME"
external_shots_root="/tmp/korri""-journey"
if sed '/^[[:space:]]*#/d' "${BASH_SOURCE[0]}" | grep -F "$external_shots_root" >/dev/null; then
  echo 'android-device-script-review.sh must not inspect the live journey screenshot directory' >&2
  exit 1
fi
cat >"$JOURNEY_REVIEW_SLEEP" <<'JOURNEY_SLEEP'
#!/usr/bin/env bash
set -euo pipefail
exit 0
JOURNEY_SLEEP
chmod +x "$JOURNEY_REVIEW_SLEEP"
cat >"$JOURNEY_REVIEW_MAGICK" <<'JOURNEY_MAGICK'
#!/usr/bin/env bash
set -euo pipefail
input="${1:?}"
shift
if [[ "$input" == "${KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT:-}" ]]; then
  echo 'deterministic review attempted deskew on an ambient journey screenshot' >&2
  exit 97
fi
printf '%s %s\n' "$input" "$*" >>"$KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG"
output="${@: -1}"
cp "$input" "$output"
JOURNEY_MAGICK
chmod +x "$JOURNEY_REVIEW_MAGICK"
cat >"$JOURNEY_REVIEW_TESSERACT" <<'JOURNEY_TESSERACT'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "${KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT:-}" ]]; then
  echo 'deterministic review attempted OCR on an ambient journey screenshot' >&2
  exit 97
fi
printf '%s\n' "$*" >>"$KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG"
printf '%s\n' "${KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT:-}"
JOURNEY_TESSERACT
chmod +x "$JOURNEY_REVIEW_TESSERACT"
cat >"$JOURNEY_REVIEW_ADB" <<'JOURNEY_ADB'
#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s)
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
subcommand="${1:-}"
if [[ $# -gt 0 ]]; then
  shift
fi
state_file="$KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE"
case "$subcommand" in
  wait-for-device|connect)
    exit 0
    ;;
  pull)
    source_path="${1:?}"
    destination="${2:?}"
    mkdir -p "$(dirname "$destination")"
    case "$source_path" in
      /sdcard/j.png)
        printf 'review png\n' >"$destination"
        ;;
      /sdcard/j.xml)
        printf '<hierarchy><node class="android.webkit.WebView" /></hierarchy>\n' >"$destination"
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  shell)
    shell_command="$*"
    if [[ -n "${KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG:-}" ]]; then
      printf 'shell:%s\n' "$shell_command" >>"$KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG"
    fi
    case "$shell_command" in
      pm\ path*)
        printf 'package:/data/app/%s/base.apk\n' "${KORRI_DEVICE_SCRIPT_REVIEW_GAME:-review.game}"
        ;;
      settings\ get\ system*)
        printf '0\r\n'
        ;;
      settings\ put\ system*)
        ;;
      pidof\ *)
        if [[ "$(cat "$state_file" 2>/dev/null || true)" == game ]]; then
          printf '12345\r\n'
        fi
        ;;
      dumpsys\ activity\ activities*)
        resumed_activity_line() {
          local component="$1"
          case "${KORRI_DEVICE_SCRIPT_REVIEW_RESUMED_ACTIVITY_FORMAT:-modern}" in
            modern)
              printf 'topResumedActivity=ActivityRecord{1 u0 %s t1}\n' "$component"
              ;;
            android13)
              printf 'topResumedActivity=ActivityRecord{1 u0 %s} t10}\n' "$component"
              ;;
            android12)
              printf '  mResumedActivity: ActivityRecord{1 u0 %s t1}\n' "$component"
              ;;
            *)
              exit 64
              ;;
          esac
        }
        case "$(cat "$state_file" 2>/dev/null || true)" in
          game)
            activity_line="$(resumed_activity_line "${KORRI_DEVICE_SCRIPT_REVIEW_GAME:-review.game}/.MainActivity")"
            ;;
          home)
            activity_line="$(resumed_activity_line 'com.android.launcher/.Launcher')"
            ;;
          korri)
            activity_line="$(resumed_activity_line 'com.simonwjackson.korri.debug/com.limelight.KorriShellActivity')"
            ;;
          *)
            activity_line="$(resumed_activity_line 'com.android.launcher/.Launcher')"
            ;;
        esac
        if [[ "$shell_command" == *"grep -m1 topResumedActivity"* && "$activity_line" != *topResumedActivity* ]]; then
          exit 1
        fi
        printf '%s\n' "$activity_line"
        ;;
      screencap\ -p\ /sdcard/j.png)
        ;;
      uiautomator\ dump\ /sdcard/j.xml)
        ;;
      am\ start\ -n\ com.simonwjackson.korri.debug/com.limelight.KorriShellActivity)
        count_file="${KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT:?}"
        count="$(cat "$count_file" 2>/dev/null || printf '0')"
        count="$((count + 1))"
        printf '%s\n' "$count" >"$count_file"
        case "${KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_MODE:-retry}" in
          retry)
            if ((count % 2 == 0)); then
              printf 'korri\n' >"$state_file"
            fi
            ;;
          fail-once)
            if ((count % 2 == 1)); then
              printf 'review am start failure\n' >&2
              exit 23
            fi
            printf 'korri\n' >"$state_file"
            ;;
          always-fail)
            printf 'review am start failure\n' >&2
            exit 23
            ;;
          never)
            ;;
          *)
            exit 64
            ;;
        esac
        ;;
      wm\ dismiss-keyguard)
        ;;
      input\ keyevent\ KEYCODE_DPAD_CENTER)
        printf 'game\n' >"$state_file"
        ;;
      input\ keyevent\ KEYCODE_HOME)
        printf 'home\n' >"$state_file"
        ;;
      am\ force-stop*)
        printf 'stopped\n' >"$state_file"
        ;;
      *)
        ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac
JOURNEY_ADB
chmod +x "$JOURNEY_REVIEW_ADB"

assert_journey_wake_dismiss_precede_explicit_start() {
  local log="$1"
  awk '
    /^shell:input keyevent KEYCODE_WAKEUP$/ {
      saw_wake = NR
      open_has_start = 0
    }
    /^shell:wm dismiss-keyguard$/ { saw_dismiss = NR }
    /^shell:am start -n com\.simonwjackson\.korri\.debug\/com\.limelight\.KorriShellActivity$/ {
      if (!(saw_wake && saw_dismiss && saw_wake < saw_dismiss && saw_dismiss < NR)) {
        failed = 1
        printf "journey-resume.sh explicitly started Korri before wake/dismiss (line %d)\n", NR > "/dev/stderr"
        exit 1
      }
      starts += 1
      if (!open_has_start) {
        opens += 1
        open_has_start = 1
      }
    }
    index($0, "shell:dumpsys activity activities 2>/dev/null | grep -m1 -E ") == 1 && index($0, "topResumedActivity|mResumedActivity") {
      if (open_has_start) {
        top_polls_after_start += 1
      }
    }
    /^shell:input keyevent KEYCODE_DPAD_CENTER$/ || /^shell:input keyevent KEYCODE_HOME$/ {
      saw_wake = 0
      saw_dismiss = 0
      open_has_start = 0
    }
    END {
      if (!failed && opens < 2) {
        printf "journey-resume.sh review saw %d Korri open phases, expected at least 2\n", opens > "/dev/stderr"
        exit 1
      }
      if (!failed && starts < 4) {
        printf "journey-resume.sh review saw %d explicit Korri starts, expected retry evidence\n", starts > "/dev/stderr"
        exit 1
      }
      if (!failed && top_polls_after_start < starts) {
        printf "journey-resume.sh review saw %d top polls after %d explicit starts\n", top_polls_after_start, starts > "/dev/stderr"
        exit 1
      }
    }
  ' "$log"
}

assert_journey_tmnt_launch_navigation() {
  local log="$1"
  local expected_downs="$2"
  local label="$3"
  awk -v expected_downs="$expected_downs" -v label="$label" '
    /^shell:input keyevent KEYCODE_DPAD_UP$/ {
      ups += 1
      next
    }
    /^shell:input keyevent KEYCODE_DPAD_DOWN$/ {
      downs += 1
      next
    }
    /^shell:input keyevent KEYCODE_DPAD_CENTER$/ {
      launches += 1
      if (ups != 12) {
        printf "%s launch %d reset with %d DPAD_UP events, expected 12\n", label, launches, ups > "/dev/stderr"
        exit 1
      }
      if (downs != expected_downs) {
        printf "%s launch %d used %d DPAD_DOWN events, expected %d\n", label, launches, downs, expected_downs > "/dev/stderr"
        exit 1
      }
      ups = 0
      downs = 0
      next
    }
    END {
      if (launches != 2) {
        printf "%s review saw %d TMNT launch confirmations, expected 2\n", label, launches > "/dev/stderr"
        exit 1
      }
    }
  ' "$log"
}

review_title='Review OCR Title'
now_playing_marker='RESUMES'
review_game='review.android.game'
review_shots="$TMP/journey-success"
review_state="$TMP/journey-success.state"
review_magick_log="$TMP/journey-success-magick.log"
review_tesseract_log="$TMP/journey-success-tesseract.log"
review_adb_log="$TMP/journey-success-adb.log"
review_start_count="$TMP/journey-success-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
review_ocr_with_banner="tmnt
shredder
revenge
${now_playing_marker}"
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG="$review_adb_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="$review_ocr_with_banner" \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-success.out" 2>"$TMP/journey-success.err" || {
    cat "$TMP/journey-success.out" >&2
    cat "$TMP/journey-success.err" >&2
    exit 1
  }
assert_journey_wake_dismiss_precede_explicit_start "$review_adb_log"
assert_journey_tmnt_launch_navigation "$review_adb_log" 1 'journey-resume.sh active-session banner'
if ! grep -F -- "$review_shots/1-korri-home.png -deskew 40% $review_shots/1-korri-home.ocr.png" "$review_magick_log" >/dev/null; then
  echo 'journey-resume.sh did not deskew the captured portal screenshot before OCR' >&2
  exit 1
fi
if ! grep -F -- "$review_shots/1-korri-home.ocr.png stdout --psm 6" "$review_tesseract_log" >/dev/null; then
  echo 'journey-resume.sh did not OCR the deskewed portal screenshot with fixed page segmentation' >&2
  exit 1
fi
for token in tmnt shredder revenge; do
  if ! grep -Fxi -- "$token" "$review_shots/1-korri-home.ocr.txt" >/dev/null; then
    echo "journey-resume.sh did not save portal OCR token beside screenshot evidence: $token" >&2
    exit 1
  fi
done
if ! test -f "$review_shots/1-korri-home.ocr.png"; then
  echo 'journey-resume.sh did not keep deskewed OCR image evidence' >&2
  exit 1
fi
if ! test -f "$review_shots/1-korri-home.xml"; then
  echo 'journey-resume.sh did not keep UIAutomator XML evidence while using OCR for assertion' >&2
  exit 1
fi

review_shots="$TMP/journey-android13-resumed-component"
review_state="$TMP/journey-android13-resumed-component.state"
review_magick_log="$TMP/journey-android13-resumed-component-magick.log"
review_tesseract_log="$TMP/journey-android13-resumed-component-tesseract.log"
review_adb_log="$TMP/journey-android13-resumed-component-adb.log"
review_start_count="$TMP/journey-android13-resumed-component-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_RESUMED_ACTIVITY_FORMAT=android13 \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG="$review_adb_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="$review_ocr_with_banner" \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-android13-resumed-component.out" 2>"$TMP/journey-android13-resumed-component.err" || {
    cat "$TMP/journey-android13-resumed-component.out" >&2
    cat "$TMP/journey-android13-resumed-component.err" >&2
    exit 1
  }
if grep -F 'top=com.simonwjackson.korri.debug/com.limelight.KorriShellActivity}' "$TMP/journey-android13-resumed-component.out" >/dev/null; then
  echo 'journey-resume.sh left a trailing Android 13 activity-record brace on the parsed Korri component' >&2
  exit 1
fi
if grep -F "top=$review_game/.MainActivity}" "$TMP/journey-android13-resumed-component.out" >/dev/null; then
  echo 'journey-resume.sh left a trailing Android 13 activity-record brace on the parsed game component' >&2
  exit 1
fi

review_shots="$TMP/journey-start-failure-retry"
review_state="$TMP/journey-start-failure-retry.state"
review_magick_log="$TMP/journey-start-failure-retry-magick.log"
review_tesseract_log="$TMP/journey-start-failure-retry-tesseract.log"
review_adb_log="$TMP/journey-start-failure-retry-adb.log"
review_start_count="$TMP/journey-start-failure-retry-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_MODE=fail-once \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG="$review_adb_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="$review_ocr_with_banner" \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-start-failure-retry.out" 2>"$TMP/journey-start-failure-retry.err"
assert_journey_wake_dismiss_precede_explicit_start "$review_adb_log"
if [[ "$(cat "$review_start_count")" -lt 4 ]]; then
  echo 'journey-resume.sh did not retry after nonzero explicit am start failures' >&2
  exit 1
fi

review_shots="$TMP/journey-no-banner"
review_state="$TMP/journey-no-banner.state"
review_magick_log="$TMP/journey-no-banner-magick.log"
review_tesseract_log="$TMP/journey-no-banner-tesseract.log"
review_adb_log="$TMP/journey-no-banner-adb.log"
review_start_count="$TMP/journey-no-banner-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_JOURNEY_EXPECTED_TITLE="$review_title" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_RESUMED_ACTIVITY_FORMAT=android12 \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG="$review_adb_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="review ocr title" \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-no-banner.out" 2>"$TMP/journey-no-banner.err"
assert_journey_tmnt_launch_navigation "$review_adb_log" 0 'journey-resume.sh no active-session banner'

review_shots="$TMP/journey-foreground-timeout"
review_state="$TMP/journey-foreground-timeout.state"
review_magick_log="$TMP/journey-foreground-timeout-magick.log"
review_tesseract_log="$TMP/journey-foreground-timeout-tesseract.log"
review_start_count="$TMP/journey-foreground-timeout-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
set +e
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_MODE=always-fail \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="$review_ocr_with_banner" \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-foreground-timeout.out" 2>"$TMP/journey-foreground-timeout.err"
journey_foreground_timeout_status=$?
set -e
if [[ "$journey_foreground_timeout_status" -eq 0 ]]; then
  echo 'journey-resume.sh accepted a Korri foreground timeout' >&2
  exit 1
fi
journey_foreground_timeout_evidence="$TMP/journey-foreground-timeout.evidence"
cat "$TMP/journey-foreground-timeout.out" "$TMP/journey-foreground-timeout.err" >"$journey_foreground_timeout_evidence"
if ! grep -F 'FAILED: 1-korri-home did not bring Korri activity to foreground' "$journey_foreground_timeout_evidence" >/dev/null; then
  echo 'journey-resume.sh foreground timeout did not report the failed open label' >&2
  exit 1
fi
if ! grep -F 'top=com.android.launcher/.Launcher' "$journey_foreground_timeout_evidence" >/dev/null; then
  echo 'journey-resume.sh foreground timeout did not preserve top activity evidence' >&2
  exit 1
fi
if ! grep -F 'am_start_status=23' "$journey_foreground_timeout_evidence" >/dev/null; then
  echo 'journey-resume.sh foreground timeout did not report the nonzero am start status' >&2
  exit 1
fi
if ! grep -F 'am start output: review am start failure' "$journey_foreground_timeout_evidence" >/dev/null; then
  echo 'journey-resume.sh foreground timeout did not report the nonzero am start output' >&2
  exit 1
fi
if [[ "$(cat "$review_start_count")" -ne 4 ]]; then
  echo 'journey-resume.sh did not exhaust bounded retries after nonzero am start failures' >&2
  exit 1
fi
if ! grep -F -- "$review_shots/1-korri-home.png" "$journey_foreground_timeout_evidence" >/dev/null; then
  echo 'journey-resume.sh foreground timeout did not print screenshot evidence path' >&2
  exit 1
fi
if ! test -f "$review_shots/1-korri-home.png"; then
  echo 'journey-resume.sh foreground timeout did not capture screenshot evidence' >&2
  exit 1
fi

review_shots="$TMP/journey-failure"
review_state="$TMP/journey-failure.state"
review_magick_log="$TMP/journey-failure-magick.log"
review_tesseract_log="$TMP/journey-failure-tesseract.log"
review_start_count="$TMP/journey-failure-start-count"
printf 'korri\n' >"$review_state"
printf '0\n' >"$review_start_count"
set +e
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_MAGICK_BIN="$JOURNEY_REVIEW_MAGICK" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_JOURNEY_EXPECTED_TITLE="$review_title" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_START_COUNT="$review_start_count" \
KORRI_DEVICE_SCRIPT_REVIEW_MAGICK_LOG="$review_magick_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT='different review text' \
KORRI_DEVICE_SCRIPT_REVIEW_AMBIENT_SCREENSHOT="$AMBIENT_CONVENTIONAL_HOME" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-failure.out" 2>"$TMP/journey-failure.err"
journey_failure_status=$?
set -e
if [[ "$journey_failure_status" -eq 0 ]]; then
  echo 'journey-resume.sh accepted a portal screenshot OCR result without the expected title' >&2
  exit 1
fi
journey_failure_evidence="$TMP/journey-failure.evidence"
cat "$TMP/journey-failure.out" "$TMP/journey-failure.err" >"$journey_failure_evidence"
for evidence_path in \
  "$review_shots/1-korri-home.png" \
  "$review_shots/1-korri-home.xml" \
  "$review_shots/1-korri-home.ocr.png" \
  "$review_shots/1-korri-home.ocr.txt"; do
  if ! grep -F -- "$evidence_path" "$journey_failure_evidence" >/dev/null; then
    echo "journey-resume.sh failure did not print evidence path: $evidence_path" >&2
    exit 1
  fi
done

if grep -F -- "$AMBIENT_CONVENTIONAL_HOME" "$TMP"/journey-*-magick.log "$TMP"/journey-*-tesseract.log >/dev/null; then
  echo 'android-device-script-review.sh used an ambient journey screenshot instead of fresh review artifacts' >&2
  exit 1
fi

# shellcheck source=/dev/null
KORRI_ANDROID_SMOKE_LIBRARY=true source "$ANDROID_SMOKE"

ALT_ANDROID_APP_RESPONSE="$(jq -n --arg package 'review.android.game' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Ok",
    payload: {
      launcherId: "android-app",
      component: {
        packageName: $package,
        className: ""
      },
      extras: {},
      directories: [],
      files: [],
      integrity: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
  }
}')"
CANONICAL_ANDROID_APP_RESPONSE="$(jq -n --arg package 'com.playdigious.tmnt' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Ok",
    payload: {
      launcherId: "android-app",
      component: {
        packageName: $package,
        className: ""
      },
      extras: {},
      directories: [],
      files: [],
      integrity: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
  }
}')"
if ! KORRI_ANDROID_APP_PACKAGE=review.android.game require_android_app_launch_response "$ALT_ANDROID_APP_RESPONSE"; then
  echo 'android-smoke.sh rejected the configured alternate Android app package in the protected launch response' >&2
  exit 1
fi
set +e
KORRI_ANDROID_APP_PACKAGE=review.android.game require_android_app_launch_response "$CANONICAL_ANDROID_APP_RESPONSE" >"$TMP/android-app-canonical-package.out" 2>"$TMP/android-app-canonical-package.err"
canonical_package_status=$?
set -e
if [[ "$canonical_package_status" -eq 0 ]]; then
  echo 'android-smoke.sh accepted the canonical package when an alternate Android app package was configured' >&2
  exit 1
fi

assert_executed_library_reaches_usage() {
  local label="$1"
  shift
  local out="$TMP/$label.out"
  local err="$TMP/$label.err"
  local status

  set +e
  env -u KORRI_ANDROID_DEVICE -u ANDROID_SERIAL KORRI_ANDROID_SMOKE_LIBRARY=true "$@" >"$out" 2>"$err"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo 'android-smoke.sh returned early when library mode was set during execution' >&2
    exit 1
  fi
  if ! grep -F 'usage: android-smoke.sh' "$err" >/dev/null; then
    echo 'android-smoke.sh executed library-mode failure did not reach the normal usage guard' >&2
    exit 1
  fi
}

assert_executed_library_reaches_usage executed-library bash "$ANDROID_SMOKE"
KORRI_ANDROID_DEVICE=review-inherited-device ANDROID_SERIAL=review-inherited-serial \
  assert_executed_library_reaches_usage executed-library-inherited-device bash "$ANDROID_SMOKE"

ADB_RESOLVE_LOG="$TMP/adb-resolve.log"
adb() {
  printf '%s\n' "$*" >>"$ADB_RESOLVE_LOG"
  if [[ "$*" == "-s device-1 shell mkdir -p '/sdcard/korri'" ]]; then
    return 0
  fi
  if [[ "$*" == "-s device-1 shell cd '/sdcard/korri' && pwd -P" ]]; then
    printf '/storage/emulated/0/korri\r\n'
    return 0
  fi
  return 1
}
ANDROID_STORAGE_ROOT="/sdcard/korri"
resolve_android_storage_root device-1 "/sdcard/korri"
if [[ "$ANDROID_STORAGE_ROOT" != "/storage/emulated/0/korri" ]]; then
  echo "android-smoke.sh did not canonicalize the Android storage root: $ANDROID_STORAGE_ROOT" >&2
  exit 1
fi
if ! grep -F -- "-s device-1 shell cd '/sdcard/korri' && pwd -P" "$ADB_RESOLVE_LOG" >/dev/null; then
  echo 'android-smoke.sh did not resolve the storage root through adb shell pwd -P' >&2
  exit 1
fi

SIGNED_WL4_RESPONSE="$(jq -n --arg root '/storage/emulated/0/korri' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Ok",
    payload: {
      launcherId: "retroarch",
      component: {
        packageName: "com.korri.retroarch",
        className: "com.retroarch.browser.retroactivity.RetroActivityFuture"
      },
      extras: {
        ROM: ($root + "/roms/wl4.gba"),
        LIBRETRO: "/data/data/com.korri.retroarch/cores/mgba_libretro_android.so",
        CONFIGFILE: ($root + "/retroarch.cfg"),
        KORRI_CONTROL_TOKEN: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      directories: (["system", "saves", "states", "screenshots"] | map($root + "/" + .)),
      files: [{
        path: ($root + "/retroarch.cfg"),
        content: "video_driver = \"gl\"\nkiosk_mode_enable = \"true\""
      }],
      integrity: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }
}')"
MISSING_WL4_RESPONSE="$(jq -n --arg root '/storage/emulated/0/korri' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Err",
    payload: {
      code: "LocalRomMissing",
      message: ("local ROM is missing: " + $root + "/roms/wl4.gba")
    }
  }
}')"
ALIAS_WL4_RESPONSE="$(jq -n --arg root '/sdcard/korri' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Err",
    payload: {
      code: "LocalRomMissing",
      message: ("local ROM is missing: " + $root + "/roms/wl4.gba")
    }
  }
}')"
BAD_WL4_RESPONSE="$(jq -n '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Err",
    payload: {
      code: "LocalRomMissing",
      message: "local ROM is missing: /tmp/host-root/roms/wl4.gba"
    }
  }
}')"
EXTRA_HOST_PATH_RESPONSE="$(jq '.outcome.payload.extras.HOST_PATH = "/tmp/host-root/roms/wl4.gba"' <<<"$SIGNED_WL4_RESPONSE")"
EXTRA_ERR_PATH_RESPONSE="$(jq '.outcome.payload.hostPath = "/tmp/host-root/roms/wl4.gba"' <<<"$MISSING_WL4_RESPONSE")"
if ! require_wl4_local_launch_response "$SIGNED_WL4_RESPONSE"; then
  echo 'android-smoke.sh rejected the signed deferred WL4 RetroArch launch branch' >&2
  exit 1
fi
if ! require_wl4_local_launch_response "$MISSING_WL4_RESPONSE"; then
  echo 'android-smoke.sh rejected the stable WL4 LocalRomMissing branch' >&2
  exit 1
fi
set +e
require_wl4_local_launch_response "$ALIAS_WL4_RESPONSE" >"$TMP/alias-wl4.out" 2>"$TMP/alias-wl4.err"
alias_wl4_status=$?
require_wl4_local_launch_response "$BAD_WL4_RESPONSE" >"$TMP/bad-wl4.out" 2>"$TMP/bad-wl4.err"
bad_wl4_status=$?
require_wl4_local_launch_response "$EXTRA_HOST_PATH_RESPONSE" >"$TMP/extra-host-path.out" 2>"$TMP/extra-host-path.err"
extra_host_path_status=$?
require_wl4_local_launch_response "$EXTRA_ERR_PATH_RESPONSE" >"$TMP/extra-err-path.out" 2>"$TMP/extra-err-path.err"
extra_err_path_status=$?
set -e
if [[ "$alias_wl4_status" -eq 0 ]]; then
  echo 'android-smoke.sh accepted the /sdcard alias after canonical root resolution' >&2
  exit 1
fi
if [[ "$bad_wl4_status" -eq 0 ]]; then
  echo 'android-smoke.sh accepted a WL4 missing-ROM error with an unsanitized path' >&2
  exit 1
fi
if [[ "$extra_host_path_status" -eq 0 ]]; then
  echo 'android-smoke.sh accepted a signed WL4 response with an injected extras.HOST_PATH' >&2
  exit 1
fi
if [[ "$extra_err_path_status" -eq 0 ]]; then
  echo 'android-smoke.sh accepted a WL4 missing-ROM error with an injected path field' >&2
  exit 1
fi

cat >"$FAKE_ADB" <<'FAKE_ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s)
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
subcommand="${1:-}"
if [[ $# -gt 0 ]]; then
  shift
fi
case "$subcommand" in
  connect|wait-for-device|push|forward)
    exit 0
    ;;
  shell)
    shell_command="$*"
    if [[ "$shell_command" == *"mkdir '/sdcard/korri/.android-app-route-check.lock'"* ]]; then
      if [[ "${KORRI_DEVICE_SCRIPT_REVIEW_ROUTE_LOCK_HELD:-false}" == true ]]; then
        echo 'Android app route check lock is held at /sdcard/korri/.android-app-route-check.lock. If this is stale, remove it manually only after verifying no route check is running.' >&2
        exit 75
      fi
    fi
    if [[ "${KORRI_DEVICE_SCRIPT_REVIEW_CLEANUP_FAIL:-}" == restore && "$shell_command" == *"cp '/sdcard/korri/.android-app-route-check-backup-"*"/config.yaml' '/sdcard/korri/config.yaml'"* ]]; then
      echo 'fake adb: restore config failed' >&2
      exit 66
    fi
    if [[ "${KORRI_DEVICE_SCRIPT_REVIEW_CLEANUP_FAIL:-}" == unlock && "$shell_command" == "rm -rf '/sdcard/korri/.android-app-route-check.lock'" ]]; then
      echo 'fake adb: unlock failed' >&2
      exit 67
    fi
    case "$shell_command" in
      pm\ path*)
        package="${shell_command#pm path }"
        printf 'package:/data/app/%s/base.apk\n' "$package"
        ;;
      "test -e '/sdcard/korri/config.yaml'")
        exit 0
        ;;
      "test -e '/sdcard/korri/library.yaml'")
        exit 1
        ;;
      dumpsys\ activity\ activities*)
        case "${KORRI_DEVICE_SCRIPT_REVIEW_RESUMED_ACTIVITY_FORMAT:-modern}" in
          modern)
            activity_line="topResumedActivity=ActivityRecord{1 u0 ${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}/.MainActivity t1}"
            ;;
          android13)
            activity_line="topResumedActivity=ActivityRecord{1 u0 ${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}/.MainActivity} t10}"
            ;;
          android12)
            activity_line="  mResumedActivity: ActivityRecord{1 u0 ${KORRI_ANDROID_APP_PACKAGE:-com.playdigious.tmnt}/.MainActivity t1}"
            ;;
          *)
            exit 64
            ;;
        esac
        if [[ "$shell_command" == *"grep -m1 topResumedActivity"* && "$activity_line" != *topResumedActivity* ]]; then
          exit 1
        fi
        printf '%s\n' "$activity_line"
        ;;
      pidof\ *)
        printf '12345\r\n'
        ;;
    esac
    exit 0
    ;;
  exec-out)
    if [[ "${1:-}" == cat && "${2:-}" == /sdcard/korri/config.yaml ]]; then
      cat "$KORRI_ROOT/docs/research/retroarch-plugin-route/config.yaml"
      exit 0
    fi
    if [[ "${1:-}" == cat && "${2:-}" == /sdcard/korri/library.yaml ]]; then
      cat "${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-$KORRI_ROOT/docs/research/retroarch-plugin-route/library.yaml}"
      exit 0
    fi
    exit 0
    ;;
  logcat)
    printf '08-01 00:00:00.000 I/KorridServer: listening on 127.0.0.1:43210\n'
    printf '08-01 00:00:00.001 I/KorridServer: debug capability=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
    ;;
  *)
    exit 0
    ;;
esac
FAKE_ADB
chmod +x "$FAKE_ADB"

SMOKE="$TMP/smoke.sh"
cat >"$SMOKE" <<'SMOKE'
#!/usr/bin/env bash
set -euo pipefail
printf 'smoke:%s package=%s library=%s retro=%s\n' "$*" "${KORRI_ANDROID_APP_PACKAGE:-}" "${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-}" "${KORRI_EXPECT_RETROARCH_ROUTE:-}" >>"$KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG"
exit 42
SMOKE
chmod +x "$SMOKE"

JOURNEY="$TMP/journey.sh"
cat >"$JOURNEY" <<'JOURNEY'
#!/usr/bin/env bash
set -euo pipefail
printf 'journey:%s\n' "$*" >>"$KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG"
JOURNEY
chmod +x "$JOURNEY"

SMOKE_SUCCESS="$TMP/smoke-success.sh"
cat >"$SMOKE_SUCCESS" <<'SMOKE_SUCCESS'
#!/usr/bin/env bash
set -euo pipefail
printf 'smoke-success:%s package=%s library=%s\n' "$*" "${KORRI_ANDROID_APP_PACKAGE:-}" "${KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY:-}" >>"$KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG"
SMOKE_SUCCESS
chmod +x "$SMOKE_SUCCESS"

ROUTE_REVIEW_BIN="$TMP/route-bin"
mkdir -p "$ROUTE_REVIEW_BIN"
cat >"$ROUTE_REVIEW_BIN/curl" <<'ROUTE_CURL'
#!/usr/bin/env bash
set -euo pipefail
request="$*"
case "$request" in
  *system.health*)
    printf '{"_tag":"system.health","outcome":{"_tag":"Ok","payload":{"version":"review"}}}\n'
    ;;
  *app.local-games.list*)
    printf '{"_tag":"app.local-games.list","outcome":{"_tag":"Ok","payload":{"games":[{"id":"tmnt-shredders-revenge"},{"id":"wl4"}]}}}\n'
    ;;
  *)
    exit 64
    ;;
esac
ROUTE_CURL
chmod +x "$ROUTE_REVIEW_BIN/curl"

ALT_CHECKPOINT_LIBRARY="$TMP/alternate-library.yaml"
printf 'alternate installed app checkpoint library\n' >"$ALT_CHECKPOINT_LIBRARY"

set +e
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_ROOT="$ROOT" \
  "$ANDROID_APP_ROUTE" device-1 >"$TMP/route.out" 2>"$TMP/route.err"
status=$?
set -e
if [[ "$status" -ne 42 ]]; then
  echo "android-app-route-check.sh restore seam expected child exit 42, got $status" >&2
  cat "$TMP/route.out" >&2
  cat "$TMP/route.err" >&2
  exit 1
fi
if ! grep -F -- 'smoke:--expect-installed-route device-1 package= library= retro=true' "$CHILD_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not invoke canonical smoke with the RetroArch route enabled' >&2
  exit 1
fi
if ! grep -F -- "push $ROOT/docs/research/retroarch-plugin-route/config.yaml /sdcard/korri/config.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not provision checkpoint config.yaml in the dedicated gate' >&2
  exit 1
fi
if ! grep -F -- "push $ROOT/docs/research/retroarch-plugin-route/library.yaml /sdcard/korri/library.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not provision checkpoint library.yaml in the dedicated gate' >&2
  exit 1
fi
if ! grep -F -- "cp '/sdcard/korri/config.yaml' '/sdcard/korri/.android-app-route-check-backup-" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not back up a pre-existing config.yaml before provisioning' >&2
  exit 1
fi
if ! grep -F -- "cp '/sdcard/korri/.android-app-route-check-backup-" "$ADB_LOG" | grep -F -- "/config.yaml' '/sdcard/korri/config.yaml'" >/dev/null; then
  echo 'android-app-route-check.sh did not restore a pre-existing config.yaml after failure' >&2
  exit 1
fi
if ! grep -F -- "rm -f '/sdcard/korri/library.yaml'" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not remove a library.yaml it created after failure' >&2
  exit 1
fi
lock_line="$(grep -nF -- "mkdir '/sdcard/korri/.android-app-route-check.lock'" "$ADB_LOG" | head -1 | cut -d: -f1)"
backup_line="$(grep -nF -- "cp '/sdcard/korri/config.yaml' '/sdcard/korri/.android-app-route-check-backup-" "$ADB_LOG" | head -1 | cut -d: -f1)"
restore_line="$(grep -nF -- "/config.yaml' '/sdcard/korri/config.yaml'" "$ADB_LOG" | tail -1 | cut -d: -f1)"
unlock_line="$(grep -nF -- "rm -rf '/sdcard/korri/.android-app-route-check.lock'" "$ADB_LOG" | tail -1 | cut -d: -f1)"
if [[ -z "$lock_line" || -z "$backup_line" || -z "$restore_line" || -z "$unlock_line" ]]; then
  echo 'android-app-route-check.sh did not acquire and release the route-check lock around config backup/restore' >&2
  exit 1
fi
if (( lock_line >= backup_line )); then
  echo 'android-app-route-check.sh must acquire the device lock before backing up fixed config files' >&2
  exit 1
fi
if (( unlock_line <= restore_line )); then
  echo 'android-app-route-check.sh must release the device lock only after restoring fixed config files' >&2
  exit 1
fi

: >"$ADB_LOG"
: >"$CHILD_LOG"
set +e
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_ROUTE_LOCK_HELD=true \
KORRI_ROOT="$ROOT" \
  "$ANDROID_APP_ROUTE" device-1 >"$TMP/route-held-lock.out" 2>"$TMP/route-held-lock.err"
held_lock_status=$?
set -e
if [[ "$held_lock_status" -eq 0 ]]; then
  echo 'android-app-route-check.sh accepted a held route-check device lock' >&2
  exit 1
fi
if ! grep -F -- 'If this is stale, remove it manually only after verifying no route check is running.' "$TMP/route-held-lock.err" >/dev/null; then
  echo 'android-app-route-check.sh held-lock failure did not explain manual stale-lock recovery' >&2
  cat "$TMP/route-held-lock.err" >&2
  exit 1
fi
if grep -E -- "push .* /sdcard/korri/(config|library)\.yaml|cp '/sdcard/korri/(config|library)\.yaml'" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh mutated fixed config files after failing to acquire the device lock' >&2
  exit 1
fi

: >"$ADB_LOG"
: >"$CHILD_LOG"
set +e
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CLEANUP_FAIL=restore \
KORRI_ROOT="$ROOT" \
  "$ANDROID_APP_ROUTE" device-1 >"$TMP/route-original-failure-cleanup.out" 2>"$TMP/route-original-failure-cleanup.err"
original_cleanup_status=$?
set -e
if [[ "$original_cleanup_status" -ne 42 ]]; then
  echo "android-app-route-check.sh failed to preserve original nonzero status when cleanup also failed (got $original_cleanup_status)" >&2
  cat "$TMP/route-original-failure-cleanup.out" >&2
  cat "$TMP/route-original-failure-cleanup.err" >&2
  exit 1
fi
if ! grep -F -- 'Android app route check failed to restore prior config.yaml' "$TMP/route-original-failure-cleanup.err" >/dev/null; then
  echo 'android-app-route-check.sh did not emit a clear restore failure while preserving original failure status' >&2
  cat "$TMP/route-original-failure-cleanup.err" >&2
  exit 1
fi
if grep -F -- 'cleanup failed after successful run' "$TMP/route-original-failure-cleanup.err" >/dev/null; then
  echo 'android-app-route-check.sh treated an original failure as a successful-main cleanup failure' >&2
  cat "$TMP/route-original-failure-cleanup.err" >&2
  exit 1
fi

: >"$ADB_LOG"
: >"$CHILD_LOG"
set +e
PATH="$ROUTE_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE_SUCCESS" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CLEANUP_FAIL=restore \
KORRI_ROOT="$ROOT" \
  bash "$ANDROID_APP_ROUTE" device-1 >"$TMP/route-success-cleanup-failure.out" 2>"$TMP/route-success-cleanup-failure.err"
success_cleanup_status=$?
set -e
if [[ "$success_cleanup_status" -eq 0 ]]; then
  echo 'android-app-route-check.sh reported success even though cleanup restore failed after a successful run' >&2
  cat "$TMP/route-success-cleanup-failure.out" >&2
  cat "$TMP/route-success-cleanup-failure.err" >&2
  exit 1
fi
if ! grep -F -- 'Android app route check failed to restore prior config.yaml' "$TMP/route-success-cleanup-failure.err" >/dev/null; then
  echo 'android-app-route-check.sh did not emit a clear successful-main restore failure' >&2
  cat "$TMP/route-success-cleanup-failure.err" >&2
  exit 1
fi
if ! grep -F -- 'Android app route check cleanup failed after successful run' "$TMP/route-success-cleanup-failure.err" >/dev/null; then
  echo 'android-app-route-check.sh did not turn successful-main cleanup failure into an explicit nonzero failure' >&2
  cat "$TMP/route-success-cleanup-failure.err" >&2
  exit 1
fi
if ! grep -F -- "rm -rf '/sdcard/korri/.android-app-route-check.lock'" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not attempt to release the route-check lock after a restore cleanup failure' >&2
  exit 1
fi

: >"$ADB_LOG"
: >"$CHILD_LOG"
set +e
PATH="$ROUTE_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE_SUCCESS" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CLEANUP_FAIL=unlock \
KORRI_ROOT="$ROOT" \
  bash "$ANDROID_APP_ROUTE" device-1 >"$TMP/route-success-unlock-failure.out" 2>"$TMP/route-success-unlock-failure.err"
success_unlock_status=$?
set -e
if [[ "$success_unlock_status" -eq 0 ]]; then
  echo 'android-app-route-check.sh reported success even though cleanup unlock failed after a successful run' >&2
  cat "$TMP/route-success-unlock-failure.out" >&2
  cat "$TMP/route-success-unlock-failure.err" >&2
  exit 1
fi
if ! grep -F -- 'Android app route check failed to release the device config lock' "$TMP/route-success-unlock-failure.err" >/dev/null; then
  echo 'android-app-route-check.sh did not emit a clear successful-main unlock failure' >&2
  cat "$TMP/route-success-unlock-failure.err" >&2
  exit 1
fi
if ! grep -F -- 'Android app route check cleanup failed after successful run' "$TMP/route-success-unlock-failure.err" >/dev/null; then
  echo 'android-app-route-check.sh did not turn successful-main unlock failure into an explicit nonzero failure' >&2
  cat "$TMP/route-success-unlock-failure.err" >&2
  exit 1
fi

: >"$ADB_LOG"
: >"$CHILD_LOG"
set +e
KORRI_ADB_BIN="$FAKE_ADB" \
KORRI_ANDROID_APP_PACKAGE=review.android.game \
KORRI_ANDROID_APP_ROUTE_CHECKPOINT_LIBRARY="$ALT_CHECKPOINT_LIBRARY" \
KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE" \
KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
KORRI_ROOT="$ROOT" \
  "$ANDROID_APP_ROUTE" device-1 >"$TMP/route-alternate.out" 2>"$TMP/route-alternate.err"
alternate_status=$?
set -e
if [[ "$alternate_status" -ne 42 ]]; then
  echo "android-app-route-check.sh alternate route seam expected child exit 42, got $alternate_status" >&2
  cat "$TMP/route-alternate.out" >&2
  cat "$TMP/route-alternate.err" >&2
  exit 1
fi
if ! grep -F -- 'pm path review.android.game' "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not require the configured alternate Android app package' >&2
  exit 1
fi
if ! grep -F -- "push $ALT_CHECKPOINT_LIBRARY /sdcard/korri/library.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not provision the configured alternate checkpoint library path' >&2
  exit 1
fi
if grep -F -- "push $ROOT/docs/research/retroarch-plugin-route/library.yaml /sdcard/korri/library.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh ignored the alternate checkpoint library path and pushed the canonical library' >&2
  exit 1
fi
if ! grep -F -- "smoke:--expect-installed-route device-1 package=review.android.game library=$ALT_CHECKPOINT_LIBRARY retro=false" "$CHILD_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not isolate an alternate Android fixture from the canonical RetroArch route' >&2
  exit 1
fi

run_route_resumed_activity_review() {
  local format="$1"
  local expected_field="$2"
  local label="$3"
  local out="$TMP/route-$label.out"
  local err="$TMP/route-$label.err"
  : >"$ADB_LOG"
  : >"$CHILD_LOG"
  PATH="$ROUTE_REVIEW_BIN:$PATH" \
  KORRI_ADB_BIN="$FAKE_ADB" \
  KORRI_ANDROID_APP_ROUTE_SMOKE_SH="$SMOKE_SUCCESS" \
  KORRI_ANDROID_APP_ROUTE_JOURNEY_SH="$JOURNEY" \
  KORRI_DEVICE_SCRIPT_REVIEW_ADB_LOG="$ADB_LOG" \
  KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG="$CHILD_LOG" \
  KORRI_DEVICE_SCRIPT_REVIEW_RESUMED_ACTIVITY_FORMAT="$format" \
  KORRI_ROOT="$ROOT" \
    bash "$ANDROID_APP_ROUTE" device-1 >"$out" 2>"$err"
  if ! grep -F -- "$expected_field" "$out" >/dev/null; then
    echo "android-app-route-check.sh did not preserve $expected_field foreground evidence" >&2
    cat "$out" >&2
    cat "$err" >&2
    exit 1
  fi
  if ! grep -F -- 'Android app route health while game foreground:' "$out" >/dev/null; then
    echo 'android-app-route-check.sh did not complete foreground health assertions under fake adb review' >&2
    cat "$out" >&2
    cat "$err" >&2
    exit 1
  fi
}

run_route_resumed_activity_review modern topResumedActivity modern
run_route_resumed_activity_review android13 topResumedActivity android13
run_route_resumed_activity_review android12 mResumedActivity android12

printf 'Android device script review: ok\n'
