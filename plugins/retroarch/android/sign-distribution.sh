#!/usr/bin/env bash
set -euo pipefail

CANDIDATE="${1:?usage: sign-distribution.sh <candidate-apk> <output-directory>}"
OUTPUT_DIR="${2:?usage: sign-distribution.sh <candidate-apk> <output-directory>}"
APKSIGNER="${ANDROID_HOME:?run through the RetroArch Nix signing task}/build-tools/30.0.3/apksigner"
KEYSTORE="${RETROARCH_RELEASE_KEYSTORE:?set the release keystore path}"
KEY_ALIAS="${RETROARCH_RELEASE_KEY_ALIAS:?set the release key alias}"
: "${RETROARCH_RELEASE_STORE_PASSWORD:?set the release keystore password}"
: "${RETROARCH_RELEASE_KEY_PASSWORD:?set the release key password}"
EXPECTED_CERT_SHA256="${RETROARCH_RELEASE_CERT_SHA256:?set the expected release certificate SHA-256 fingerprint}"
ARTIFACT_NAME="korri-retroarch-arm64.apk"
ARTIFACT="$OUTPUT_DIR/$ARTIFACT_NAME"
TEMP_ARTIFACT="$OUTPUT_DIR/.$ARTIFACT_NAME.tmp"

[[ -f "$CANDIDATE" ]] || {
  echo "RetroArch distribution candidate missing: $CANDIDATE" >&2
  exit 1
}
[[ -x "$APKSIGNER" ]] || {
  echo "Android APK signer missing: $APKSIGNER" >&2
  exit 1
}
[[ -f "$KEYSTORE" ]] || {
  echo "RetroArch release keystore missing: $KEYSTORE" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
rm -f "$ARTIFACT" "$ARTIFACT.sha256" "$TEMP_ARTIFACT"
trap 'rm -f "$TEMP_ARTIFACT"' EXIT

"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:RETROARCH_RELEASE_STORE_PASSWORD \
  --key-pass env:RETROARCH_RELEASE_KEY_PASSWORD \
  --out "$TEMP_ARTIFACT" \
  "$CANDIDATE"

signer_report="$("$APKSIGNER" verify --verbose --print-certs "$TEMP_ARTIFACT")"
printf '%s\n' "$signer_report"
signer_count="$(sed -n 's/^Number of signers: //p' <<<"$signer_report" | head -n1 | tr -d '[:space:]')"
actual_cert="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$signer_report" | head -n1 | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
expected_cert="$(printf '%s' "$EXPECTED_CERT_SHA256" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
if [[ "$signer_count" != 1 ]]; then
  echo "RetroArch APK must have exactly one signer" >&2
  exit 1
fi
if [[ -z "$actual_cert" || "$actual_cert" != "$expected_cert" ]]; then
  echo "RetroArch APK signer does not match RETROARCH_RELEASE_CERT_SHA256" >&2
  exit 1
fi

mv "$TEMP_ARTIFACT" "$ARTIFACT"
(
  cd "$OUTPUT_DIR"
  sha256sum "$ARTIFACT_NAME" > "$ARTIFACT_NAME.sha256"
)
