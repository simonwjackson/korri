#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${RETROARCH_UPSTREAM_DIR:-$HERE/upstream}"
FETCH="${RETROARCH_FETCH:-$HERE/fetch-upstream.sh}"
SOURCE_VERIFY="${RETROARCH_SOURCE_VERIFY:-$HERE/test-source-contract.sh}"
CORE_BUILD="${RETROARCH_CORE_BUILD:-$HERE/cores/mgba/build.sh}"
GRADLE_DIR="$SOURCE/pkg/android/phoenix"
GRADLE="${RETROARCH_GRADLE:-$GRADLE_DIR/gradlew}"
APK="${RETROARCH_APK:-$GRADLE_DIR/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk}"
VERIFY="${RETROARCH_APK_VERIFY:-$HERE/test-apk-contract.sh}"

"$FETCH"
"$SOURCE_VERIFY"
rm -f "$APK"
"$CORE_BUILD"
(
  cd "$GRADLE_DIR"
  "$GRADLE" assembleAarch64Release
)
[[ -f "$APK" ]] || {
  echo "RetroArch build did not produce a fresh APK: $APK" >&2
  exit 1
}
"$VERIFY" "$APK"
