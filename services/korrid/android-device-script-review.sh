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

bash -n "$ANDROID_SMOKE" "$ANDROID_APP_ROUTE" "$JOURNEY_RESUME"

# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if sed '/^[[:space:]]*#/d' "$ANDROID_SMOKE" | grep -E 'push "\$CHECKPOINT_(CONFIG|LIBRARY)"' >/dev/null; then
  echo 'android-smoke.sh must not push checkpoint config.yaml/library.yaml in the general device smoke path' >&2
  exit 1
fi
if ! grep -F -- '--expect-installed-route' "$ANDROID_SMOKE" >/dev/null; then
  echo 'android-smoke.sh must keep TMNT installed-route assertions behind --expect-installed-route' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F -- '--expect-installed-route "$SERIAL"' "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must opt in to installed-route smoke assertions explicitly' >&2
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
# shellcheck disable=SC2034 # Used by the sourced journey-resume.sh pid_of function.
ADB=("$PIDOF_ADB" -s device-1)
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
if ! grep -F 'TESSERACT_BIN="${KORRI_TESSERACT_BIN:-tesseract}"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must expose a tesseract binary override seam for deterministic review' >&2
  exit 1
fi
# shellcheck disable=SC2016 # Literal grep needle; this reviews script text.
if ! grep -F 'ocr_shot "$label"' "$JOURNEY_RESUME" >/dev/null; then
  echo 'journey-resume.sh must OCR the portal screenshot before D-pad activation' >&2
  exit 1
fi
if ! sed -n '/android-app-route-check = {/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.tesseract' >/dev/null; then
  echo 'android-app-route-check task must put tesseract on PATH for the journey gate' >&2
  exit 1
fi
if ! sed -n '/journey-resume = deviceScript/,/^    };/p' "$ROOT/nix/tasks.nix" | grep -F 'pkgs.tesseract' >/dev/null; then
  echo 'journey-resume task must put tesseract on PATH for the portal OCR gate' >&2
  exit 1
fi

JOURNEY_REVIEW_BIN="$TMP/journey-bin"
JOURNEY_REVIEW_ADB="$TMP/journey-adb"
JOURNEY_REVIEW_TESSERACT="$TMP/journey-tesseract"
JOURNEY_REVIEW_SLEEP="$JOURNEY_REVIEW_BIN/sleep"
mkdir -p "$JOURNEY_REVIEW_BIN"
cat >"$JOURNEY_REVIEW_SLEEP" <<'JOURNEY_SLEEP'
#!/usr/bin/env bash
set -euo pipefail
exit 0
JOURNEY_SLEEP
chmod +x "$JOURNEY_REVIEW_SLEEP"
cat >"$JOURNEY_REVIEW_TESSERACT" <<'JOURNEY_TESSERACT'
#!/usr/bin/env bash
set -euo pipefail
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
        case "$(cat "$state_file" 2>/dev/null || true)" in
          game)
            printf 'topResumedActivity=ActivityRecord{1 u0 %s/.MainActivity t1}\n' "${KORRI_DEVICE_SCRIPT_REVIEW_GAME:-review.game}"
            ;;
          home)
            printf 'topResumedActivity=ActivityRecord{1 u0 com.android.launcher/.Launcher t1}\n'
            ;;
          *)
            printf 'topResumedActivity=ActivityRecord{1 u0 com.simonwjackson.korri.debug/.MainActivity t1}\n'
            ;;
        esac
        ;;
      screencap\ -p\ /sdcard/j.png)
        ;;
      uiautomator\ dump\ /sdcard/j.xml)
        ;;
      monkey\ -p*)
        printf 'korri\n' >"$state_file"
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
        printf 'korri\n' >"$state_file"
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

assert_journey_wake_dismiss_precede_launcher() {
  local log="$1"
  awk '
    /^shell:input keyevent KEYCODE_WAKEUP$/ { saw_wake = NR }
    /^shell:wm dismiss-keyguard$/ { saw_dismiss = NR }
    /^shell:monkey -p com\.simonwjackson\.korri\.debug -c android\.intent\.category\.LAUNCHER 1$/ {
      if (!(saw_wake && saw_dismiss && saw_wake < saw_dismiss && saw_dismiss < NR)) {
        failed = 1
        printf "journey-resume.sh opened Korri before wake/dismiss (line %d)\n", NR > "/dev/stderr"
        exit 1
      }
      launches += 1
      saw_wake = 0
      saw_dismiss = 0
    }
    END {
      if (!failed && launches < 2) {
        printf "journey-resume.sh review saw %d Korri launcher activations, expected at least 2\n", launches > "/dev/stderr"
        exit 1
      }
    }
  ' "$log"
}

review_title='Review OCR Title'
review_game='review.android.game'
review_shots="$TMP/journey-success"
review_state="$TMP/journey-success.state"
review_tesseract_log="$TMP/journey-success-tesseract.log"
review_adb_log="$TMP/journey-success-adb.log"
printf 'korri\n' >"$review_state"
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_JOURNEY_EXPECTED_TITLE="$review_title" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_ADB_LOG="$review_adb_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT="$review_title" \
KORRI_DEVICE_SCRIPT_REVIEW_GAME="$review_game" \
SHOTS="$review_shots" \
  "$JOURNEY_RESUME" device-1 "$review_game" >"$TMP/journey-success.out" 2>"$TMP/journey-success.err"
assert_journey_wake_dismiss_precede_launcher "$review_adb_log"
if ! grep -F -- "$review_shots/1-korri-home.png stdout" "$review_tesseract_log" >/dev/null; then
  echo 'journey-resume.sh did not OCR the captured portal screenshot' >&2
  exit 1
fi
if ! grep -Fx -- "$review_title" "$review_shots/1-korri-home.ocr.txt" >/dev/null; then
  echo 'journey-resume.sh did not save portal OCR text beside screenshot evidence' >&2
  exit 1
fi
if ! test -f "$review_shots/1-korri-home.xml"; then
  echo 'journey-resume.sh did not keep UIAutomator XML evidence while using OCR for assertion' >&2
  exit 1
fi

review_shots="$TMP/journey-failure"
review_state="$TMP/journey-failure.state"
review_tesseract_log="$TMP/journey-failure-tesseract.log"
printf 'korri\n' >"$review_state"
set +e
PATH="$JOURNEY_REVIEW_BIN:$PATH" \
KORRI_ADB_BIN="$JOURNEY_REVIEW_ADB" \
KORRI_TESSERACT_BIN="$JOURNEY_REVIEW_TESSERACT" \
KORRI_JOURNEY_EXPECTED_TITLE="$review_title" \
KORRI_DEVICE_SCRIPT_REVIEW_JOURNEY_STATE="$review_state" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_LOG="$review_tesseract_log" \
KORRI_DEVICE_SCRIPT_REVIEW_TESSERACT_TEXT='different review text' \
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
  "$review_shots/1-korri-home.ocr.txt"; do
  if ! grep -F -- "$evidence_path" "$journey_failure_evidence" >/dev/null; then
    echo "journey-resume.sh failure did not print evidence path: $evidence_path" >&2
    exit 1
  fi
done

observed_home=/tmp/korri-journey/1-korri-home.png
if [[ -f "$observed_home" ]] && command -v tesseract >/dev/null 2>&1; then
  observed_ocr="$TMP/observed-korri-home.ocr.txt"
  default_title="$(awk -F'"' '/EXPECTED_PORTAL_TITLE="TMNT:/ { print $2; exit }' "$JOURNEY_RESUME")"
  if [[ -z "$default_title" ]]; then
    echo 'journey-resume.sh default expected portal title could not be recovered for observed screenshot review' >&2
    exit 1
  fi
  tesseract "$observed_home" stdout >"$observed_ocr" 2>"$TMP/observed-korri-home.ocr.err"
  if ! grep -F -- "$default_title" "$observed_ocr" >/dev/null; then
    echo "observed portal screenshot OCR did not contain expected title: $observed_home" >&2
    echo "        ocr: $observed_ocr" >&2
    exit 1
  fi
fi

# shellcheck source=/dev/null
KORRI_ANDROID_SMOKE_LIBRARY=true source "$ANDROID_SMOKE"

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
  if [[ "$*" == "-s device-1 shell mkdir -p '/sdcard/korri-retro'" ]]; then
    return 0
  fi
  if [[ "$*" == "-s device-1 shell cd '/sdcard/korri-retro' && pwd -P" ]]; then
    printf '/storage/emulated/0/korri-retro\r\n'
    return 0
  fi
  return 1
}
ANDROID_STORAGE_ROOT="/sdcard/korri-retro"
resolve_android_storage_root device-1 "/sdcard/korri-retro"
if [[ "$ANDROID_STORAGE_ROOT" != "/storage/emulated/0/korri-retro" ]]; then
  echo "android-smoke.sh did not canonicalize the Android storage root: $ANDROID_STORAGE_ROOT" >&2
  exit 1
fi
if ! grep -F -- "-s device-1 shell cd '/sdcard/korri-retro' && pwd -P" "$ADB_RESOLVE_LOG" >/dev/null; then
  echo 'android-smoke.sh did not resolve the storage root through adb shell pwd -P' >&2
  exit 1
fi

SIGNED_WL4_RESPONSE="$(jq -n --arg root '/storage/emulated/0/korri-retro' '{
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
MISSING_WL4_RESPONSE="$(jq -n --arg root '/storage/emulated/0/korri-retro' '{
  _tag: "app.local-games.launch",
  outcome: {
    _tag: "Err",
    payload: {
      code: "LocalRomMissing",
      message: ("local ROM is missing: " + $root + "/roms/wl4.gba")
    }
  }
}')"
ALIAS_WL4_RESPONSE="$(jq -n --arg root '/sdcard/korri-retro' '{
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
    case "$shell_command" in
      pm\ path*)
        printf 'package:/data/app/com.playdigious.tmnt/base.apk\n'
        ;;
      "test -e '/sdcard/korri-retro/config.yaml'")
        exit 0
        ;;
      "test -e '/sdcard/korri-retro/library.yaml'")
        exit 1
        ;;
    esac
    exit 0
    ;;
  exec-out)
    if [[ "${1:-}" == cat && "${2:-}" == /sdcard/korri-retro/config.yaml ]]; then
      cat "$KORRI_ROOT/docs/research/android-app-plugin-schema-checkpoint/config.yaml"
      exit 0
    fi
    if [[ "${1:-}" == cat && "${2:-}" == /sdcard/korri-retro/library.yaml ]]; then
      cat "$KORRI_ROOT/docs/research/android-app-plugin-schema-checkpoint/library.yaml"
      exit 0
    fi
    exit 0
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
printf 'smoke:%s\n' "$*" >>"$KORRI_DEVICE_SCRIPT_REVIEW_CHILD_LOG"
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
if ! grep -F -- 'smoke:--expect-installed-route device-1' "$CHILD_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not invoke android-smoke.sh in installed-route mode' >&2
  exit 1
fi
if ! grep -F -- "push $ROOT/docs/research/android-app-plugin-schema-checkpoint/config.yaml /sdcard/korri-retro/config.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not provision checkpoint config.yaml in the dedicated gate' >&2
  exit 1
fi
if ! grep -F -- "push $ROOT/docs/research/android-app-plugin-schema-checkpoint/library.yaml /sdcard/korri-retro/library.yaml" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not provision checkpoint library.yaml in the dedicated gate' >&2
  exit 1
fi
if ! grep -F -- "cp '/sdcard/korri-retro/config.yaml' '/sdcard/korri-retro/.android-app-route-check-backup-" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not back up a pre-existing config.yaml before provisioning' >&2
  exit 1
fi
if ! grep -F -- "cp '/sdcard/korri-retro/.android-app-route-check-backup-" "$ADB_LOG" | grep -F -- "/config.yaml' '/sdcard/korri-retro/config.yaml'" >/dev/null; then
  echo 'android-app-route-check.sh did not restore a pre-existing config.yaml after failure' >&2
  exit 1
fi
if ! grep -F -- "rm -f '/sdcard/korri-retro/library.yaml'" "$ADB_LOG" >/dev/null; then
  echo 'android-app-route-check.sh did not remove a library.yaml it created after failure' >&2
  exit 1
fi

printf 'Android device script review: ok\n'
