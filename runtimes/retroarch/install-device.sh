#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${RETROARCH_APK:-$HERE/upstream/pkg/android/phoenix/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk}"
VERIFY="${RETROARCH_APK_VERIFY:-$HERE/test-apk-contract.sh}"
SERIAL="${1:-${ANDROID_SERIAL:-}}"
STOCK_PACKAGE="com.retroarch.aarch64"
FORK_PACKAGE="com.korri.retroarch"

if [[ -z "$SERIAL" ]]; then
  echo 'usage: install-device.sh <adb-serial> (or set ANDROID_SERIAL)' >&2
  exit 2
fi
[[ -f "$APK" ]] || { echo "RetroArch APK missing: $APK" >&2; exit 1; }
"$VERIFY" "$APK"

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
"${ADB[@]}" install -r "$APK"

fork_path="$("${ADB[@]}" shell pm path "$FORK_PACKAGE" 2>/dev/null || true)"
[[ "$fork_path" == package:* ]] || {
  echo "installed APK did not register $FORK_PACKAGE" >&2
  exit 1
}
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
