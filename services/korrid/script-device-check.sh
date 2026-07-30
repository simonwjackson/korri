#!/usr/bin/env bash
# Keep the arm64 plugin path honest: build the probe for Android, push it, run
# the example plugin on the device, and assert the declaration comes back.
#
# Costs the app nothing — this runs a standalone probe binary, not the APK.
# When korrid's plugin runtime is wired into the shell, this check gains an
# in-app counterpart; until then it is what proves the runtime still crosses
# the NDK cleanly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRATE="$ROOT/services/korrid"
PLUGIN="$CRATE/examples/catalog.plugin.ts"
SERIAL="${1:?usage: script-device-check.sh <adb-serial>}"
ADB=(adb -s "$SERIAL")

# Network adb targets drop between runs; fail loudly here rather than midway.
if [[ "$SERIAL" == *:* ]]; then
  adb connect "$SERIAL" >/dev/null || true
fi
"${ADB[@]}" wait-for-device

cd "$CRATE"
cargo ndk -t arm64-v8a build --release --bin script_probe
PROBE="${CARGO_TARGET_DIR:-$CRATE/target}/aarch64-linux-android/release/script_probe"

"${ADB[@]}" push "$PROBE" /data/local/tmp/korri_script_probe >/dev/null
"${ADB[@]}" push "$PLUGIN" /data/local/tmp/korri_example.plugin.ts >/dev/null
"${ADB[@]}" shell chmod 755 /data/local/tmp/korri_script_probe

OUTPUT="$("${ADB[@]}" shell /data/local/tmp/korri_script_probe /data/local/tmp/korri_example.plugin.ts)"
echo "$OUTPUT"

grep -q '"kind":"catalog"' <<<"$OUTPUT" || {
  echo "FAILED: device did not return a catalog declaration" >&2
  exit 1
}
grep -q '"routes"' <<<"$OUTPUT" || {
  echo "FAILED: declaration lost its fulfilment routes" >&2
  exit 1
}
echo "OK: TypeScript plugin transpiled and evaluated on device"
