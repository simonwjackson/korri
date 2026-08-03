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
printf 'Verifies\nNumber of signers: %s\n' "${MOCK_SIGNER_COUNT:-1}"
if [[ "${MOCK_SIGNER_FORMAT:-legacy}" == modern ]]; then
  printf 'V3.0 Signer: certificate SHA-256 digest: AA:BB:CC:DD\n'
else
  printf 'Signer #1 certificate SHA-256 digest: AA:BB:CC:DD\n'
fi
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
  local signer_format="$3"
  local output="$4"
  ANDROID_HOME="$TMP/sdk" \
  MOCK_SIGNER_COUNT="$signer_count" \
  MOCK_SIGNER_FORMAT="$signer_format" \
  RETROARCH_RELEASE_KEYSTORE="$TMP/release.jks" \
  RETROARCH_RELEASE_STORE_PASSWORD="store-password" \
  RETROARCH_RELEASE_KEY_ALIAS="release" \
  RETROARCH_RELEASE_KEY_PASSWORD="key-password" \
  RETROARCH_RELEASE_CERT_SHA256="$expected_cert" \
    "$SIGN" "$candidate" "$output"
}

sign_candidate "aabbccdd" 1 legacy "$TMP/good-legacy"
cmp "$candidate" "$TMP/good-legacy/korri-retroarch-arm64.apk"
(
  cd "$TMP/good-legacy"
  sha256sum -c korri-retroarch-arm64.apk.sha256 >/dev/null
)
sign_candidate "aabbccdd" 1 modern "$TMP/good-modern" >/dev/null

if sign_candidate "deadbeef" 1 modern "$TMP/bad-cert" >/dev/null 2>&1; then
  echo 'distribution accepted an unexpected signing certificate' >&2
  exit 1
fi
[[ ! -e "$TMP/bad-cert/korri-retroarch-arm64.apk" ]]

if sign_candidate "aabbccdd" 2 modern "$TMP/bad-count" >/dev/null 2>&1; then
  echo 'distribution accepted multiple APK signers' >&2
  exit 1
fi
[[ ! -e "$TMP/bad-count/korri-retroarch-arm64.apk" ]]

printf 'RetroArch distribution staging and signing tests passed\n'
