#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${RETROARCH_APK:-$HERE/upstream/pkg/android/phoenix/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk}"
VERIFY="${RETROARCH_APK_VERIFY:-$HERE/test-apk-contract.sh}"
AAPT="${RETROARCH_AAPT:-${ANDROID_HOME:?run inside the RetroArch Nix devshell}/build-tools/30.0.3/aapt}"
SERIAL="${1:-${ANDROID_SERIAL:-}}"
STOCK_PACKAGE="com.retroarch.aarch64"
FORK_PACKAGE="com.korri.retroarch"
INSTALL_TIMEOUT_SECONDS="${RETROARCH_INSTALL_TIMEOUT_SECONDS:-120}"

if [[ -z "$SERIAL" ]]; then
  echo 'usage: install-device.sh <adb-serial> (or set ANDROID_SERIAL)' >&2
  exit 2
fi
[[ -f "$APK" ]] || { echo "RetroArch APK missing: $APK" >&2; exit 1; }
"$VERIFY" "$APK"
badging="$("$AAPT" dump badging "$APK")"
expected_version_code="$(sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" <<<"$badging" | head -n1)"
expected_version_name="$(sed -n "s/.*versionName='\([^']*\)'.*/\1/p" <<<"$badging" | head -n1)"
[[ -n "$expected_version_code" && -n "$expected_version_name" ]] || {
  echo 'unable to read fork APK version identity' >&2
  exit 1
}

ADB=(adb -s "$SERIAL")
[[ "$("${ADB[@]}" get-state)" == device ]] || {
  echo "Android target is not ready: $SERIAL" >&2
  exit 1
}

stock_before="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
verifier_before="$("${ADB[@]}" shell settings get global verifier_verify_adb_installs)"
restore_verifier() {
  if [[ -z "$verifier_before" || "$verifier_before" == null ]]; then
    "${ADB[@]}" shell settings delete global verifier_verify_adb_installs >/dev/null
  else
    "${ADB[@]}" shell settings put global verifier_verify_adb_installs \
      "$verifier_before" >/dev/null
  fi
}
trap restore_verifier EXIT

"${ADB[@]}" shell settings put global verifier_verify_adb_installs 0 >/dev/null
if ! timeout "$INSTALL_TIMEOUT_SECONDS" "${ADB[@]}" install -r "$APK"; then
  echo "fork APK install failed or timed out after ${INSTALL_TIMEOUT_SECONDS}s" >&2
  exit 1
fi

fork_path="$("${ADB[@]}" shell pm path "$FORK_PACKAGE" 2>/dev/null || true)"
[[ "$fork_path" == package:* ]] || {
  echo "installed APK did not register $FORK_PACKAGE" >&2
  exit 1
}
for permission in \
    android.permission.READ_EXTERNAL_STORAGE \
    android.permission.WRITE_EXTERNAL_STORAGE; do
  "${ADB[@]}" shell pm grant "$FORK_PACKAGE" "$permission" >/dev/null
done
package_dump="$("${ADB[@]}" shell dumpsys package "$FORK_PACKAGE")"
installed_version_code="$(sed -n 's/.*versionCode=\([^[:space:]]*\).*/\1/p' <<<"$package_dump" | head -n1)"
installed_version_name="$(sed -n 's/.*versionName=\(.*\)$/\1/p' <<<"$package_dump" | head -n1 | tr -d '\r')"
[[ "$installed_version_code" == "$expected_version_code" ]] || {
  echo "installed fork versionCode mismatch: expected $expected_version_code, got $installed_version_code" >&2
  exit 1
}
[[ "$installed_version_name" == "$expected_version_name" ]] || {
  echo "installed fork versionName mismatch: expected $expected_version_name, got $installed_version_name" >&2
  exit 1
}
for permission in \
    android.permission.READ_EXTERNAL_STORAGE \
    android.permission.WRITE_EXTERNAL_STORAGE; do
  grep -q "$permission: granted=true" <<<"$package_dump" || {
    echo "installed fork is missing runtime grant: $permission" >&2
    exit 1
  }
done
stock_after="$("${ADB[@]}" shell pm path "$STOCK_PACKAGE" 2>/dev/null || true)"
[[ "$stock_after" == "$stock_before" ]] || {
  echo "stock RetroArch package changed during fork deployment" >&2
  exit 1
}

restore_verifier
trap - EXIT
printf 'Installed %s on %s\n' "$FORK_PACKAGE" "$SERIAL"
printf 'APK sha256: '
sha256sum "$APK" | cut -d' ' -f1
if [[ -n "$stock_before" ]]; then
  printf 'Stock RetroArch preserved: %s\n' "$stock_before"
fi
