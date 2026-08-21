#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
READINESS="$HERE/launcher-install-readiness.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$READINESS" ]]
if grep -E '(^|[[:space:]])(adb|fastboot)([[:space:]]|$)' "$READINESS" >/dev/null; then
  echo 'launcher install readiness check contains a device command' >&2
  exit 1
fi
mkdir "$TMP/launcher" "$TMP/rollback"
if "$READINESS" "$TMP/launcher" "$TMP/rollback" >"$TMP/incomplete.stdout" 2>"$TMP/incomplete.stderr"; then
  echo 'launcher install readiness accepted incomplete inputs' >&2
  exit 1
fi
grep -F 'launcher output is incomplete or symbolic' "$TMP/incomplete.stderr" >/dev/null
ln -s "$TMP/launcher" "$TMP/launcher-link"
if "$READINESS" "$TMP/launcher-link" "$TMP/rollback" >"$TMP/symlink.stdout" 2>"$TMP/symlink.stderr"; then
  echo 'launcher install readiness accepted a symbolic input directory' >&2
  exit 1
fi
grep -F 'input directory is missing or symbolic' "$TMP/symlink.stderr" >/dev/null

if [[ -n "${ODIN2PORTAL_MARKER_OUTPUT:-}" && -n "${ODIN2PORTAL_ROLLBACK_BUNDLE:-}" ]]; then
  if "$READINESS" "$ODIN2PORTAL_MARKER_OUTPUT" "$ODIN2PORTAL_ROLLBACK_BUNDLE" \
    >"$TMP/marker.stdout" 2>"$TMP/marker.stderr"; then
    echo 'launcher install readiness accepted the marker-only output' >&2
    exit 1
  fi
fi

if [[ -z "${ODIN2PORTAL_LAUNCHER_OUTPUT:-}" || -z "${ODIN2PORTAL_ROLLBACK_BUNDLE:-}" ]]; then
  printf 'odin2portal launcher install readiness integration skipped: set both artifact variables\n'
  exit 0
fi
"$READINESS" "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$ODIN2PORTAL_ROLLBACK_BUNDLE" \
  > "$TMP/readiness.txt"
tail -n 1 "$TMP/readiness.txt" | grep -Fx 'ODIN2PORTAL_LAUNCHER_INSTALL_ARTIFACTS_READY' >/dev/null
grep -Fx 'device writes: none' "$TMP/readiness.txt" >/dev/null
grep -Fx 'installation approved: no' "$TMP/readiness.txt" >/dev/null

clone_artifacts() {
  local source="$1"
  local destination="$2"
  mkdir "$destination"
  cp -a --reflink=always "$source/." "$destination/"
}
expect_rejection() {
  local name="$1"
  local expected="$2"
  local launcher="$3"
  local rollback="$4"
  if "$READINESS" "$launcher" "$rollback" >"$TMP/$name.stdout" 2>"$TMP/$name.stderr"; then
    echo "launcher install readiness accepted mutation: $name" >&2
    exit 1
  fi
  if [[ -n "$expected" ]]; then
    grep -F "$expected" "$TMP/$name.stderr" >/dev/null
  fi
}

clone_artifacts "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$TMP/tampered-evidence"
printf '\ntampered evidence\n' >> "$TMP/tampered-evidence/evidence/ayn-root-key.txt"
(
  cd "$TMP/tampered-evidence"
  replacement="$(sha256sum ./evidence/ayn-root-key.txt)"
  awk -v replacement="$replacement" \
    '$2 == "./evidence/ayn-root-key.txt" {$0 = replacement} {print}' \
    MANIFEST-SHA256SUMS > MANIFEST-SHA256SUMS.new
  mv MANIFEST-SHA256SUMS.new MANIFEST-SHA256SUMS
)
expect_rejection tampered-evidence \
  'operator file does not match its contract: launcher/MANIFEST-SHA256SUMS' \
  "$TMP/tampered-evidence" "$ODIN2PORTAL_ROLLBACK_BUNDLE"

clone_artifacts "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$TMP/unmanifested-file"
touch "$TMP/unmanifested-file/unexpected-file"
expect_rejection unmanifested-file \
  'launcher output contains an unmanifested or missing file' \
  "$TMP/unmanifested-file" "$ODIN2PORTAL_ROLLBACK_BUNDLE"

clone_artifacts "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$TMP/internal-symlink"
mv "$TMP/internal-symlink/evidence/ayn-root-key.txt" "$TMP/ayn-root-key.target"
ln -s "$TMP/ayn-root-key.target" "$TMP/internal-symlink/evidence/ayn-root-key.txt"
expect_rejection internal-symlink 'artifact directories contain a symbolic link' \
  "$TMP/internal-symlink" "$ODIN2PORTAL_ROLLBACK_BUNDLE"

clone_artifacts "$ODIN2PORTAL_ROLLBACK_BUNDLE" "$TMP/tampered-rollback"
printf '\ntampered rollback procedure\n' >> "$TMP/tampered-rollback/README.md"
expect_rejection tampered-rollback \
  'operator file does not match its contract: rollback/README.md' \
  "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$TMP/tampered-rollback"

clone_artifacts "$ODIN2PORTAL_LAUNCHER_OUTPUT" "$TMP/tampered-super"
truncate -s 65536 "$TMP/tampered-super/NON_FLASHABLE_ARTIFACTS/super.img.not-flashable"
expect_rejection tampered-super '' \
  "$TMP/tampered-super" "$ODIN2PORTAL_ROLLBACK_BUNDLE"

printf 'odin2portal launcher install readiness integration passed\n'
