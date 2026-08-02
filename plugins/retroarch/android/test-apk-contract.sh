#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${1:-$HERE/upstream/pkg/android/phoenix/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk}"
AAPT="${ANDROID_HOME:?run inside the RetroArch Nix devshell}/build-tools/30.0.3/aapt"
# The APK temporarily carries the independently owned @korri:mgba output.
CORE="${MGBA_CORE:-$HERE/../../mgba/android/out/mgba_libretro_android.so}"

[[ -f "$APK" ]] || { echo "RetroArch APK missing: $APK" >&2; exit 1; }
badging="$($AAPT dump badging "$APK")"
manifest="$($AAPT dump xmltree "$APK" AndroidManifest.xml)"
listing="$(unzip -Z1 "$APK")"

grep -q "package: name='com.korri.retroarch'" <<<"$badging"
grep -q "application-label:'Korri RetroArch'" <<<"$badging"
grep -q 'lib/arm64-v8a/libretroarch-activity.so' <<<"$listing"
grep -q 'assets/cores/mgba_libretro_android.so' <<<"$listing"
[[ -f "$CORE" ]] || { echo "built mGBA core missing: $CORE" >&2; exit 1; }
cmp "$CORE" <(unzip -p "$APK" assets/cores/mgba_libretro_android.so)
if grep -q '^lib/x86_64/' <<<"$listing"; then
  echo "fork APK unexpectedly contains x86_64" >&2
  exit 1
fi
if grep -q 'android.intent.category.LAUNCHER' <<<"$manifest"; then
  echo "fork APK unexpectedly exposes a launcher activity" >&2
  exit 1
fi
future_activity="$(grep -A5 'com.retroarch.browser.retroactivity.RetroActivityFuture' <<<"$manifest")"
grep -q 'com.korri.retroarch.permission.LAUNCH' <<<"$future_activity"
grep -q 'android:exported.*0xffffffff' <<<"$future_activity"
grep -q 'android:launchMode.*0x0' <<<"$future_activity"
core_sideload_activity="$(grep -A2 'CoreSideloadActivity' <<<"$manifest")"
grep -q 'android:exported.*0x0' <<<"$core_sideload_activity"

printf 'RetroArch APK identity contract passed\n'
