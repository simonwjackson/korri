#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/source/pkg/android/phoenix" "$TMP/bin" "$(dirname "$TMP/fork.apk")"

make_tool() {
  local name="$1"
  local body="$2"
  printf '#!/usr/bin/env bash\nset -euo pipefail\n%s\n' "$body" > "$TMP/bin/$name"
  chmod +x "$TMP/bin/$name"
}
make_tool fetch 'exit 0'
make_tool source-verify 'exit 0'
make_tool core 'exit 0'
# shellcheck disable=SC2016 # Expanded when the generated helper runs.
make_tool verify 'test -s "$1"'
make_tool gradle-fail 'exit 23'
# shellcheck disable=SC2016 # Expanded when the generated helper runs.
make_tool gradle-pass 'printf fresh-apk > "$RETROARCH_APK"'

export RETROARCH_UPSTREAM_DIR="$TMP/source"
export RETROARCH_APK="$TMP/fork.apk"
export RETROARCH_FETCH="$TMP/bin/fetch"
export RETROARCH_SOURCE_VERIFY="$TMP/bin/source-verify"
export RETROARCH_CORE_BUILD="$TMP/bin/core"
export RETROARCH_APK_VERIFY="$TMP/bin/verify"

printf stale-apk > "$RETROARCH_APK"
if RETROARCH_GRADLE="$TMP/bin/gradle-fail" "$BUILD" >/dev/null 2>&1; then
  echo 'expected failed Gradle build to fail' >&2
  exit 1
fi
[[ ! -e "$RETROARCH_APK" ]] || {
  echo 'failed build left a stale deployable APK' >&2
  exit 1
}

RETROARCH_GRADLE="$TMP/bin/gradle-pass" "$BUILD"
test "$(cat "$RETROARCH_APK")" = fresh-apk

printf 'RetroArch fresh-artifact build tests passed\n'
