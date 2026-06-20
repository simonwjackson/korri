#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../../../../.."
source_file="product/plugins/proton-runtime/packages/proton-runtime/setup-env"
plugin_file="product/plugins/proton-runtime/src/plugin.ts"
expected_root="/var/lib/korri/steam/steamapps/common/Proton 10.0"
expected_overrides="dxgi,d3d11=n,b"
expected_libgl="/run/opengl-driver/lib/dri"

grep -F -q "proton10Root: \"$expected_root\"" "$plugin_file"
grep -F -q "wineDllOverrides: \"$expected_overrides\"" "$plugin_file"
grep -F -q "libglDriversPath: \"$expected_libgl\"" "$plugin_file"
grep -F -q "proton_root=\"\${KORRI_PROTON_RUNTIME_ROOT:-$expected_root}\"" "$source_file"
grep -F -q "WINEDLLOVERRIDES=\"\${WINEDLLOVERRIDES:-$expected_overrides}\"" "$source_file"
grep -F -q "LIBGL_DRIVERS_PATH=\"\${LIBGL_DRIVERS_PATH:-$expected_libgl}\"" "$source_file"

coreutils_dir="$(dirname "$(command -v mkdir)")"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
sed "s|@coreutils@|$coreutils_dir|g" "$source_file" > "$tmp_dir/setup-env"
mkdir -p "$tmp_dir/proton/files/bin" "$tmp_dir/prefix"
: > "$tmp_dir/proton/files/bin/wine64"
chmod +x "$tmp_dir/proton/files/bin/wine64"

export KORRI_PROTON_RUNTIME_ROOT="$tmp_dir/proton"
export KORRI_PROTON_RUNTIME_WINEPREFIX="$tmp_dir/prefix"
unset KORRI_PROTON_RUNTIME_FILES KORRI_PROTON_RUNTIME_WINE64 WINEDLLOVERRIDES LIBGL_DRIVERS_PATH
# shellcheck source=/dev/null
source "$tmp_dir/setup-env"
test "$KORRI_PROTON_RUNTIME_ROOT" = "$tmp_dir/proton"
test "$KORRI_PROTON_RUNTIME_FILES" = "$tmp_dir/proton/files"
test "$KORRI_PROTON_RUNTIME_WINE64" = "$tmp_dir/proton/files/bin/wine64"
test "$WINEDLLOVERRIDES" = "$expected_overrides"
test "$LIBGL_DRIVERS_PATH" = "$expected_libgl"
