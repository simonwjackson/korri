#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(dirname -- "${BASH_SOURCE[0]}")"
HERE="$(cd "$SCRIPT_DIR" && pwd)"
RUNTIME_ROOT="$(cd "$HERE/../.." && pwd)"
MGBA_URL="${MGBA_UPSTREAM_URL:-https://github.com/mgba-emu/mgba.git}"
MGBA_REF="${MGBA_UPSTREAM_REF:-0.10.5}"
MGBA_COMMIT="${MGBA_UPSTREAM_COMMIT:-26b7884bc25a5933960f3cdcd98bac1ae14d42e2}"
SOURCE="${MGBA_UPSTREAM_DIR:-$HERE/upstream}"
BUILD="${MGBA_BUILD_DIR:-$HERE/build}"
OUT="${MGBA_OUTPUT_DIR:-$HERE/out}"
BUNDLED_CORES="$RUNTIME_ROOT/upstream/pkg/android/phoenix/assets/cores"

: "${ANDROID_NDK_ROOT:?run inside the RetroArch Nix devshell}"

rm -rf "$BUILD"
rm -f "$OUT/mgba_libretro_android.so" "$BUNDLED_CORES/mgba_libretro_android.so"

if [[ -e "$SOURCE" && ! -d "$SOURCE/.git" ]]; then
  echo "refusing to replace non-git mGBA source: $SOURCE" >&2
  exit 1
fi
if [[ ! -d "$SOURCE/.git" ]]; then
  git clone --quiet --no-checkout --depth 1 --branch "$MGBA_REF" "$MGBA_URL" "$SOURCE"
else
  git -C "$SOURCE" remote set-url origin "$MGBA_URL"
  git -C "$SOURCE" fetch --quiet --depth 1 origin "$MGBA_REF"
fi
if git -C "$SOURCE" rev-parse --verify 'FETCH_HEAD^{commit}' >/dev/null 2>&1; then
  actual="$(git -C "$SOURCE" rev-parse --verify 'FETCH_HEAD^{commit}')"
else
  actual="$(git -C "$SOURCE" rev-parse --verify 'HEAD^{commit}')"
fi
if [[ "$actual" != "$MGBA_COMMIT" ]]; then
  echo "mGBA pin mismatch: expected $MGBA_COMMIT, fetched $actual from $MGBA_REF" >&2
  exit 1
fi
git -C "$SOURCE" checkout --quiet --detach "$MGBA_COMMIT"
git -C "$SOURCE" reset --quiet --hard "$MGBA_COMMIT"
git -C "$SOURCE" clean -qfd

cmake -S "$SOURCE" -B "$BUILD" -G Ninja \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-21 \
  -DCMAKE_BUILD_TYPE=Release \
  -DLIBMGBA_ONLY=ON \
  -DBUILD_LIBRETRO=ON \
  -DM_CORE_GB=OFF \
  -DM_CORE_GBA=ON
cmake --build "$BUILD" --target mgba_libretro

mkdir -p "$OUT" "$BUNDLED_CORES"
install -m 0644 "$BUILD/mgba_libretro.so" "$OUT/mgba_libretro_android.so"
install -m 0644 "$OUT/mgba_libretro_android.so" "$BUNDLED_CORES/mgba_libretro_android.so"
sha256sum "$OUT/mgba_libretro_android.so"
