#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
VERIFY="$HERE/verify-korri-launcher-apk.sh"
PIPELINE="$HERE/launcher-image-dry-run.sh"
PRODUCT="$HERE/launcher-product-dry-run.sh"
MANIFEST="$ROOT/clients/android/app/src/main/AndroidManifest.xml"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - "$MANIFEST" <<'PY'
import sys
import xml.etree.ElementTree as ET
android = "{http://schemas.android.com/apk/res/android}"
root = ET.parse(sys.argv[1]).getroot()
activity = next(a for a in root.find("application").findall("activity")
                if a.get(android + "name") == ".KorriShellActivity")
filters = []
for intent_filter in activity.findall("intent-filter"):
    values = {(kind, node.get(android + "name"))
              for kind in ("action", "category")
              for node in intent_filter.findall(kind)}
    filters.append(values)
required = {("action", "android.intent.action.MAIN"),
            ("category", "android.intent.category.HOME"),
            ("category", "android.intent.category.DEFAULT")}
assert sum(required <= values for values in filters) == 1
assert any(("category", "android.intent.category.LAUNCHER") in values for values in filters)
assert any(("category", "android.intent.category.LEANBACK_LAUNCHER") in values for values in filters)
PY

mkdir -p "$TMP/sdk/build-tools/35.0.0" "$TMP/sdk/cmdline-tools/19.0/bin"
cat > "$TMP/sdk/build-tools/35.0.0/apksigner" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == verify ]]
printf '%s\n' \
  'Verifies' \
  "Number of signers: ${MOCK_SIGNER_COUNT:-1}" \
  "Signer #1 certificate SHA-256 digest: ${MOCK_CERT:-f46183b71944a33c4c3d2fde42471846ff8d41d22f33b14c1dcf2265d1c7e8ad}"
SCRIPT
cat > "$TMP/sdk/cmdline-tools/19.0/bin/apkanalyzer" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == 'manifest print' ]]; then
  package="${MOCK_PACKAGE:-com.simonwjackson.korri}"
  home="${MOCK_HOME_CATEGORY:-android.intent.category.HOME}"
  debuggable="${MOCK_DEBUGGABLE:-false}"
  cat <<XML
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$package">
  <application android:debuggable="$debuggable">
    <activity android:name="com.limelight.KorriShellActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="$home"/>
        <category android:name="android.intent.category.DEFAULT"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
XML
else
  printf '%s\n' "${MOCK_ABI_FILE:-/lib/arm64-v8a/libmoonlight-core.so}"
fi
SCRIPT
chmod +x "$TMP/sdk/build-tools/35.0.0/apksigner" "$TMP/sdk/cmdline-tools/19.0/bin/apkanalyzer"
printf 'fixture apk\n' > "$TMP/Korri.apk"

ANDROID_HOME="$TMP/sdk" "$VERIFY" "$TMP/Korri.apk" "$TMP/pass"
grep -Fx KORRI_LAUNCHER_APK_VERIFIED "$TMP/pass/RESULT.txt" >/dev/null

expect_rejection() {
  local name="$1"
  shift
  if env ANDROID_HOME="$TMP/sdk" "$@" "$VERIFY" "$TMP/Korri.apk" "$TMP/$name" >/dev/null 2>&1; then
    echo "launcher APK verifier accepted $name" >&2
    exit 1
  fi
  [[ ! -e "$TMP/$name" ]]
}
expect_rejection wrong-signer MOCK_CERT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
expect_rejection extra-signer MOCK_SIGNER_COUNT=2
expect_rejection wrong-package MOCK_PACKAGE=com.simonwjackson.korri.debug
expect_rejection missing-home MOCK_HOME_CATEGORY=android.intent.category.LAUNCHER
expect_rejection debuggable MOCK_DEBUGGABLE=true
expect_rejection wrong-abi MOCK_ABI_FILE=/lib/x86_64/libmoonlight-core.so

for script in "$VERIFY" "$PIPELINE" "$PRODUCT"; do
  if grep -Eq '(^|[[:space:]])(adb|fastboot)([[:space:]]|$)' "$script"; then
    echo "device tool found in host-only launcher pipeline: $script" >&2
    exit 1
  fi
done
grep -F 'launcher-product-dry-run.sh' "$PIPELINE" >/dev/null
grep -F '/app/Korri/Korri.apk' "$PRODUCT" >/dev/null
grep -F 'NON_FLASHABLE_ARTIFACTS' "$PIPELINE" >/dev/null
grep -Fx 'f46183b71944a33c4c3d2fde42471846ff8d41d22f33b14c1dcf2265d1c7e8ad' \
  "$HERE/contract/korri-release-cert-SHA256.txt" >/dev/null

echo 'odin2portal launcher image guards: PASS'
