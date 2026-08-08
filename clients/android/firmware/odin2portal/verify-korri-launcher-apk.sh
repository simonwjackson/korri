#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${1:?usage: verify-korri-launcher-apk.sh <signed-release-apk> <evidence-directory>}"
EVIDENCE="${2:?usage: verify-korri-launcher-apk.sh <signed-release-apk> <evidence-directory>}"
CERT_CONTRACT="$HERE/contract/korri-release-cert-SHA256.txt"

[[ -f "$APK" && ! -L "$APK" ]] || {
  echo 'Korri APK must be a regular non-symbolic file' >&2
  exit 1
}
[[ -f "$CERT_CONTRACT" && ! -L "$CERT_CONTRACT" ]] || {
  echo 'Korri release certificate contract is missing or symbolic' >&2
  exit 1
}
[[ ! -e "$EVIDENCE" && ! -L "$EVIDENCE" ]] || {
  echo 'APK evidence directory already exists' >&2
  exit 1
}
expected_cert="$(tr -d '[:space:]' < "$CERT_CONTRACT")"
[[ "$expected_cert" =~ ^[0-9a-f]{64}$ ]] || {
  echo 'Korri release certificate contract is malformed' >&2
  exit 1
}

ANDROID_HOME="${ANDROID_HOME:?run through a Nix Android task}"
apksigner="$(find -L "$ANDROID_HOME/build-tools" -mindepth 2 -maxdepth 2 -name apksigner -type f -print | sort -V | tail -n1)"
apkanalyzer="$(find -L "$ANDROID_HOME/cmdline-tools" -mindepth 3 -maxdepth 3 -name apkanalyzer -type f -print | sort -V | tail -n1)"
[[ -x "$apksigner" && -x "$apkanalyzer" ]] || {
  echo 'Android APK inspection tools are unavailable' >&2
  exit 1
}

umask 077
mkdir "$EVIDENCE"
cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    rm -rf "$EVIDENCE"
  fi
  exit "$status"
}
trap cleanup EXIT

"$apksigner" verify --verbose --print-certs "$APK" > "$EVIDENCE/apksigner.txt"
"$apkanalyzer" manifest print "$APK" > "$EVIDENCE/AndroidManifest.xml"
"$apkanalyzer" files list "$APK" > "$EVIDENCE/files.txt"
(
  cd "$(dirname "$APK")"
  sha256sum "$(basename "$APK")"
) > "$EVIDENCE/apk-SHA256SUMS"

signer_count="$(sed -n 's/^Number of signers: //p' "$EVIDENCE/apksigner.txt" | head -n1 | tr -d '[:space:]')"
[[ "$signer_count" == 1 ]] || {
  echo 'Korri APK must have exactly one signer' >&2
  exit 1
}
actual_cert="$(sed -n -e 's/^Signer #1 certificate SHA-256 digest: //p' -e 's/^V[0-9.]* Signer: certificate SHA-256 digest: //p' "$EVIDENCE/apksigner.txt" | tr '[:upper:]' '[:lower:]' | tr -d ':[:space:]' | sort -u)"
[[ "$actual_cert" == "$expected_cert" ]] || {
  echo 'Korri APK signer does not match the release certificate contract' >&2
  exit 1
}

python3 - "$EVIDENCE/AndroidManifest.xml" <<'PY'
import sys
import xml.etree.ElementTree as ET

manifest_path = sys.argv[1]
android = "{http://schemas.android.com/apk/res/android}"
root = ET.parse(manifest_path).getroot()
if root.get("package") != "com.simonwjackson.korri":
    raise SystemExit("Korri APK package is not the release application ID")
application = root.find("application")
if application is None:
    raise SystemExit("Korri APK has no application")
if application.get(android + "debuggable", "false") == "true":
    raise SystemExit("Korri release APK is debuggable")
activity = None
for candidate in application.findall("activity"):
    name = candidate.get(android + "name", "")
    if name in ("com.limelight.KorriShellActivity", ".KorriShellActivity"):
        activity = candidate
        break
if activity is None or activity.get(android + "exported") != "true":
    raise SystemExit("Korri HOME activity is absent or not exported")
required = {
    ("action", "android.intent.action.MAIN"),
    ("category", "android.intent.category.HOME"),
    ("category", "android.intent.category.DEFAULT"),
}
matched = False
for intent_filter in activity.findall("intent-filter"):
    values = set()
    for kind in ("action", "category"):
        for node in intent_filter.findall(kind):
            values.add((kind, node.get(android + "name", "")))
    if required <= values:
        matched = True
        break
if not matched:
    raise SystemExit("Korri HOME activity lacks one MAIN+HOME+DEFAULT filter")
PY

if ! grep -Eq '^/lib/arm64-v8a/[^/]+\.so$' "$EVIDENCE/files.txt"; then
  echo 'Korri APK has no arm64-v8a native code' >&2
  exit 1
fi
if grep -Eq '^/lib/(x86|x86_64|armeabi-v7a)/' "$EVIDENCE/files.txt"; then
  echo 'Korri Odin APK must be the arm64-only release split' >&2
  exit 1
fi

printf '%s\n' \
  'KORRI_LAUNCHER_APK_VERIFIED' \
  'package: com.simonwjackson.korri' \
  'component: com.simonwjackson.korri/com.limelight.KorriShellActivity' \
  'home filter: MAIN+HOME+DEFAULT' \
  'ABI: arm64-v8a' \
  "certificate SHA-256: $actual_cert" \
  > "$EVIDENCE/RESULT.txt"
trap - EXIT
printf 'KORRI_LAUNCHER_APK_VERIFIED apk=%s\n' "$APK"
