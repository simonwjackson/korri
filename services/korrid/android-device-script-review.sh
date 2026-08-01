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
if ! grep -F "jq -e '.outcome._tag == \"Ok\"'" "$ANDROID_APP_ROUTE" >/dev/null; then
  echo 'android-app-route-check.sh must semantically assert foreground health outcome Ok' >&2
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
ADB_LOG="$TMP/adb.log"
CHILD_LOG="$TMP/children.log"
FAKE_ADB="$TMP/adb"

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
