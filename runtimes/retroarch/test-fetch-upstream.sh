#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH="$HERE/fetch-upstream.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SOURCE="$TMP/source"
mkdir -p "$SOURCE"
git -C "$SOURCE" init -q
git -C "$SOURCE" config user.name test
git -C "$SOURCE" config user.email test@example.invalid
printf 'upstream\n' > "$SOURCE/value.txt"
git -C "$SOURCE" add value.txt
git -C "$SOURCE" commit -qm upstream
git -C "$SOURCE" tag v-test
PIN="$(git -C "$SOURCE" rev-parse HEAD)"

run_fetch() {
  local destination="$1"
  local patches="$2"
  local expected_pin="$3"
  RETROARCH_UPSTREAM_URL="$SOURCE" \
  RETROARCH_UPSTREAM_REF=v-test \
  RETROARCH_UPSTREAM_COMMIT="$expected_pin" \
  RETROARCH_UPSTREAM_DIR="$destination" \
  RETROARCH_PATCH_DIR="$patches" \
    "$FETCH"
}

mkdir -p "$TMP/no-patches"
if run_fetch "$TMP/wrong-pin" "$TMP/no-patches" "0000000000000000000000000000000000000000" \
    >"$TMP/wrong-pin.log" 2>&1; then
  echo "expected a mismatched pin to fail" >&2
  exit 1
fi
grep -q 'pin mismatch' "$TMP/wrong-pin.log"

mkdir -p "$TMP/good-patches"
cat > "$TMP/good-patches/0001-change-value.patch" <<'PATCH'
diff --git a/value.txt b/value.txt
index 0453f65..aaf793a 100644
--- a/value.txt
+++ b/value.txt
@@ -1 +1 @@
-upstream
+patched
PATCH
run_fetch "$TMP/good" "$TMP/good-patches" "$PIN"
test "$(cat "$TMP/good/value.txt")" = patched

mkdir -p "$TMP/bad-patches"
cat > "$TMP/bad-patches/0001-does-not-apply.patch" <<'PATCH'
diff --git a/value.txt b/value.txt
--- a/value.txt
+++ b/value.txt
@@ -8 +8 @@
-never-there
+still-not-there
PATCH
if run_fetch "$TMP/bad" "$TMP/bad-patches" "$PIN" >"$TMP/bad.log" 2>&1; then
  echo "expected a stale patch to fail" >&2
  exit 1
fi
grep -q '0001-does-not-apply.patch' "$TMP/bad.log"

printf 'fetch-upstream pipeline tests passed\n'
