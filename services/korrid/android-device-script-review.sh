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

# shellcheck source=/dev/null
KORRI_ANDROID_SMOKE_LIBRARY=true source "$ANDROID_SMOKE"

set +e
KORRI_ANDROID_SMOKE_LIBRARY=true bash "$ANDROID_SMOKE" >"$TMP/executed-library.out" 2>"$TMP/executed-library.err"
executed_library_status=$?
set -e
if [[ "$executed_library_status" -eq 0 ]]; then
  echo 'android-smoke.sh returned early when library mode was set during execution' >&2
  exit 1
fi
if ! grep -F 'usage: android-smoke.sh' "$TMP/executed-library.err" >/dev/null; then
  echo 'android-smoke.sh executed library-mode failure did not reach the normal usage guard' >&2
  exit 1
fi

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
