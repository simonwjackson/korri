#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../../../../.."
source_file="product/plugins/fex-runtime/packages/fex-runtime/setup-env"
plugin_file="product/plugins/fex-runtime/src/plugin.ts"
expected_rootfs="/var/lib/korri/steam/fex-rootfs"
expected_icd="/usr/share/vulkan/icd.d/freedreno_icd.x86_64.json"

grep -F -q "rootfs: \"$expected_rootfs\"" "$plugin_file"
grep -F -q "vulkanIcd: \"$expected_icd\"" "$plugin_file"
grep -F -q "FEX_ROOTFS=\"\${FEX_ROOTFS:-$expected_rootfs}\"" "$source_file"
grep -F -q "VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/freedreno_icd.x86_64.json" "$source_file"

coreutils_dir="$(dirname "$(command -v id)")"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
sed "s|@coreutils@|$coreutils_dir|g" "$source_file" > "$tmp_dir/setup-env"

unset FEX_ROOTFS FEX_SERVERSOCKETPATH FEX_APP_CONFIG VK_ICD_FILENAMES
export KORRI_FEX_RUNTIME_ENABLE_THUNKS=0
# shellcheck source=/dev/null
source "$tmp_dir/setup-env"
test "$FEX_ROOTFS" = "$expected_rootfs"

export FEX_ROOTFS="/custom/fex-rootfs"
# shellcheck source=/dev/null
source "$tmp_dir/setup-env"
test "$FEX_ROOTFS" = "/custom/fex-rootfs"
