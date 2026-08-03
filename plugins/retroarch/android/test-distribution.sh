#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$HERE/stage-distribution.sh"
SIGN="$HERE/sign-distribution.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/sdk/build-tools/30.0.3"
printf 'candidate-apk\n' > "$TMP/source.apk"
printf 'keystore\n' > "$TMP/release.jks"
cat > "$TMP/sdk/build-tools/30.0.3/apksigner" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == sign ]]; then
  output=""
  input="${!#}"
  while (($#)); do
    if [[ "$1" == --out ]]; then
      output="$2"
      break
    fi
    shift
  done
  [[ -n "$output" && -f "$input" ]]
  cp "$input" "$output"
  exit 0
fi
[[ "$1" == verify && "$2" == --verbose && "$3" == --print-certs && -f "$4" ]]
cat <<REPORT
Verifies
Number of signers: ${MOCK_SIGNER_COUNT:-1}
Signer #1 certificate SHA-256 digest: AA:BB:CC:DD
REPORT
SCRIPT
chmod +x "$TMP/sdk/build-tools/30.0.3/apksigner"

RETROARCH_APK="$TMP/source.apk" "$STAGE" "$TMP/candidate"
candidate="$TMP/candidate/korri-retroarch-arm64-candidate.apk"
cmp "$TMP/source.apk" "$candidate"
(
  cd "$TMP/candidate"
  sha256sum -c korri-retroarch-arm64-candidate.apk.sha256 >/dev/null
)

sign_candidate() {
  local expected_cert="$1"
  local signer_count="$2"
  local output="$3"
  ANDROID_HOME="$TMP/sdk" \
  MOCK_SIGNER_COUNT="$signer_count" \
  RETROARCH_RELEASE_KEYSTORE="$TMP/release.jks" \
  RETROARCH_RELEASE_STORE_PASSWORD="store-password" \
  RETROARCH_RELEASE_KEY_ALIAS="release" \
  RETROARCH_RELEASE_KEY_PASSWORD="key-password" \
  RETROARCH_RELEASE_CERT_SHA256="$expected_cert" \
    "$SIGN" "$candidate" "$output"
}

sign_candidate "aabbccdd" 1 "$TMP/good"
cmp "$candidate" "$TMP/good/korri-retroarch-arm64.apk"
(
  cd "$TMP/good"
  sha256sum -c korri-retroarch-arm64.apk.sha256 >/dev/null
)

if sign_candidate "deadbeef" 1 "$TMP/bad-cert" >/dev/null 2>&1; then
  echo 'distribution accepted an unexpected signing certificate' >&2
  exit 1
fi
[[ ! -e "$TMP/bad-cert/korri-retroarch-arm64.apk" ]]

if sign_candidate "aabbccdd" 2 "$TMP/bad-count" >/dev/null 2>&1; then
  echo 'distribution accepted multiple APK signers' >&2
  exit 1
fi
[[ ! -e "$TMP/bad-count/korri-retroarch-arm64.apk" ]]

printf 'RetroArch distribution staging and signing tests passed\n'
