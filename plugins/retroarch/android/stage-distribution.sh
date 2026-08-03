#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${1:?usage: stage-distribution.sh <output-directory>}"
APK="${RETROARCH_APK:-$HERE/upstream/pkg/android/phoenix/build/outputs/apk/aarch64/release/phoenix-aarch64-release.apk}"
CANDIDATE_NAME="korri-retroarch-arm64-candidate.apk"

[[ -f "$APK" ]] || {
  echo "RetroArch APK missing: $APK" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/$CANDIDATE_NAME" "$OUTPUT_DIR/$CANDIDATE_NAME.sha256"
install -m 0644 "$APK" "$OUTPUT_DIR/$CANDIDATE_NAME"
(
  cd "$OUTPUT_DIR"
  sha256sum "$CANDIDATE_NAME" > "$CANDIDATE_NAME.sha256"
)
