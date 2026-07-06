#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
SCRIPT="$PACKAGE_DIR/scripts/steam-guest-runtime-prep"

fail() { echo "FAIL: $*" >&2; exit 1; }
[ -f "$SCRIPT" ] || fail "missing runtime prep script: $SCRIPT"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

steam_home="$tmp/Steam"
common="$steam_home/steamapps/common"
mkdir -p "$common"

# Missing common is intentionally a no-op once STEAM_HOME is explicit.
STEAM_HOME="$tmp/MissingSteam" bash "$SCRIPT" --apply

pv="$common/SteamLinuxRuntime_sniper/pressure-vessel"
pv_wrap="$pv/bin/pressure-vessel-wrap"
fonts="$common/SteamLinuxRuntime_sniper/sniper_platform_0.20240101/files/share/fonts/subdir"
runtime_bin="$common/SteamLinuxRuntime_sniper/sniper_platform_0.20240101/files/bin"
proton_dir="$common/Proton 11.0 (ARM64)"
proton_bin="$proton_dir/files/bin"
fex_prefix="$tmp/fex"
fex_share="$fex_prefix/share/fex-emu"
mkdir -p "$pv/bin" "$fonts" "$runtime_bin" "$proton_dir" "$proton_bin" "$proton_dir/files/share" \
  "$steam_home/steam-runtime-steamrt-arm64/bin" "$steam_home/steamrtarm64/bin" "$fex_prefix/bin" "$fex_prefix/usr/bin" "$fex_prefix/usr/lib" "$fex_share/GuestThunks"

cat > "$pv/srt-bwrap" <<'EOS'
#!/bin/sh
echo original bwrap "$@"
EOS
chmod 755 "$pv/srt-bwrap"

# Use a real executable with an embedded FEX-looking string to ensure wrapper
# detection does not grep binary payloads and skip newly downloaded runtime
# helpers that still need FEX trampolines.
cp "$(command -v sh)" "$pv_wrap"
chmod u+w "$pv_wrap"
printf '\n/FEX false-positive marker\n' >> "$pv_wrap"
chmod 755 "$pv_wrap"
expect_pv_wrap=0
if command -v file >/dev/null 2>&1 && file "$pv_wrap" | grep -q 'x86-64'; then
  expect_pv_wrap=1
else
  # Keep this smoke portable on aarch64 builders: exercise the same interrupted
  # mutable-runtime repair path as pv-adverb when the host shell is not x86_64.
  : > "$pv_wrap"
  cat > "$pv_wrap.x86_64" <<'EOS'
#!/bin/sh
echo real pressure-vessel-wrap "$@"
EOS
  chmod 755 "$pv_wrap" "$pv_wrap.x86_64"
  expect_pv_wrap=1
fi

zero_byte_pv="$pv/libexec/steam-runtime-tools-0/pv-adverb"
mkdir -p "$(dirname "$zero_byte_pv")"
: > "$zero_byte_pv"
cat > "$zero_byte_pv.x86_64" <<'EOS'
#!/bin/sh
echo real pv-adverb "$@"
EOS
chmod 755 "$zero_byte_pv" "$zero_byte_pv.x86_64"

cat > "$proton_dir/proton" <<'EOS'
#!/usr/bin/env python3
import json
import os
import platform
import shutil
import subprocess
import sys

class CompatData:
    fex_config_file = "/tmp/fex-config.json"
class Proton:
    dist_dir = "/tmp/proton"
    host_pe_arch = "x86_64-windows"
    wine_bin = "/tmp/proton/files/bin/wine"
    lib_dir = "/tmp/proton/files/lib"
    def path(self, suffix):
        return "/tmp/proton/" + suffix

g_compatdata = CompatData()
g_proton = Proton()

class Session:
    env = {}
    log_file = sys.stderr
    remote_debug_cmd = None
    cmdlineappend = []
    def log_enabled_for(self, name, default):
        return default
    def generate_fex_app_config(self):
        app_config = {"Config": {}, "ThunksDB": {}}
        if "PROTON_LOG" in self.env:
            app_config["Config"]["SilentLog"] = "0" if self.log_enabled_for("fex", True) else "1"

        return app_config

    def init_session(self, update_prefix_files):
        self.env["FEX_APP_CONFIG_LOCATION"] = os.path.join(g_proton.dist_dir, "share/fex-emu/")

    def run_proc(self, args, local_env=None):
        if local_env is None:
            local_env = self.env
        return subprocess.call(args, env=local_env, stderr=self.log_file, stdout=self.log_file)

    def run(self):
        adverb = []
        remote_debug_proc = None

        # CoD: Black Ops 3 workaround
        if os.environ.get("SteamGameId", 0) in [
                    "311210",
                ]:
            argv = [g_proton.wine_bin, "c:\\Program Files (x86)\\Steam\\steam.exe"]
        else:
            argv = [g_proton.lib_dir + "/wine/x86_64-unix/wine-preloader", g_proton.lib_dir + "/wine/x86_64-unix/wine", "c:\\windows\\system32\\steam.exe"]

        rc = self.run_proc(adverb + argv + sys.argv[2:] + self.cmdlineappend)
EOS
chmod 755 "$proton_dir/proton"

cat > "$proton_bin/wine" <<'EOS'
#!/bin/sh
FEX_ROOTFS=/old exec FEX "$@"
EOS
cat > "$proton_bin/wine.x86_64" <<'EOS'
#!/bin/sh
echo restored wine "$@"
EOS
chmod 755 "$proton_bin/wine" "$proton_bin/wine.x86_64"

cat > "$proton_bin/wine64" <<'EOS'
#!/bin/sh
FEX_ROOTFS=/old exec FEX "$@"
EOS
cat > "$proton_bin/wine64.x86_64" <<'EOS'
#!/bin/sh
FEX_ROOTFS=/older exec FEX "$@"
EOS
cat > "$proton_bin/wine64.x86_64.x86_64" <<'EOS'
#!/bin/sh
echo deepest restored wine64 "$@"
EOS
chmod 755 "$proton_bin/wine64" "$proton_bin/wine64.x86_64" "$proton_bin/wine64.x86_64.x86_64"

cat > "$steam_home/steam-runtime-steamrt-arm64/bin/steam-runtime-launcher-service" <<'EOS'
#!/bin/sh
echo launcher "$@"
EOS
chmod 755 "$steam_home/steam-runtime-steamrt-arm64/bin/steam-runtime-launcher-service"

cat > "$fex_prefix/bin/FEX" <<'EOS'
#!/bin/sh
exit 0
EOS
cat > "$fex_prefix/usr/bin/bwrap" <<'EOS'
#!/bin/sh
exit 0
EOS
chmod 755 "$fex_prefix/bin/FEX" "$fex_prefix/usr/bin/bwrap"
printf '\177ELF' > "$fex_prefix/usr/lib/libvulkan_freedreno.so"
dd if=/dev/zero bs=1 count=14 >> "$fex_prefix/usr/lib/libvulkan_freedreno.so" 2>/dev/null
printf '\x3e\x00' >> "$fex_prefix/usr/lib/libvulkan_freedreno.so"
: > "$fex_share/ThunksDB.json"

cat > "$runtime_bin/python3.11" <<'EOS'
#!/bin/sh
exit 0
EOS
chmod 755 "$runtime_bin/python3.11"

STEAM_HOME="$steam_home" FEX_BIN="$fex_prefix/bin/FEX" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --apply

[ -f "$pv/srt-bwrap.x86_64" ] || fail "srt-bwrap backup was not preserved"
grep -q 'bwrap_bin="${FEX_ROOTFS%/}/usr/bin/bwrap"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should resolve bwrap from the FEX rootfs"
grep -q 'PATH="/run/current-system/sw/bin:${PATH:-}"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should expose NixOS host tools for bwrap child sanity execs"
grep -q 'exec /usr/bin/FEX "$bwrap_bin" "$@"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should direct-FEX the x86_64 rootfs bwrap"
if [ "$expect_pv_wrap" = 1 ]; then
  [ -f "$pv_wrap.x86_64" ] \
    || fail "pressure-vessel x86_64 backup was not preserved"
  grep -q 'exec /usr/bin/FEX "$0.x86_64"' "$pv_wrap" \
    || fail "pressure-vessel x86_64 binary should be replaced by a FHS-visible FEX trampoline"
  grep -q 'KORRI_STEAM_OVERLAY_FILTER' "$pv_wrap" \
    || fail "pressure-vessel wrapper should filter Steam overlay preload injection"
fi
grep -q 'exec /usr/bin/FEX "$0.x86_64"' "$zero_byte_pv" \
  || fail "zero-byte pressure-vessel helper should be repaired to a FEX trampoline"
grep -q 'KORRI_STEAM_OVERLAY_FILTER' "$zero_byte_pv" \
  || fail "zero-byte pressure-vessel helper repair should preserve overlay filtering"
[ -f "$fonts/.uuid" ] || fail "font .uuid marker missing"
[ "$(head -n 1 "$proton_dir/proton")" = '#!/usr/bin/python3' ] \
  || fail "Proton python shebang was not repaired"
if command -v python3 >/dev/null 2>&1; then
  grep -q 'KORRI_FEX_LAUNCHER_PATCH' "$proton_dir/proton" \
    || fail "Proton FEX launcher patch was not applied"
  grep -q 'KORRI_30XX_DIRECT_EXE_PATCH' "$proton_dir/proton" \
    || fail "Proton 30XX direct-exe patch was not applied"
  grep -q 'KORRI_FEX_CONFIG_MERGE_PATCH' "$proton_dir/proton" \
    || fail "Proton FEX config merge patch was not applied"
fi
grep -q 'restored wine' "$proton_bin/wine" \
  || fail "Proton/Wine FEX wrapper was not restored from backup"
grep -q 'deepest restored wine64' "$proton_bin/wine64" \
  || fail "stacked Proton/Wine FEX wrapper was not restored from deepest backup"
[ -L "$proton_dir/files/share/fex-emu" ] \
  || fail "Proton FEX resource symlink missing"
[ "$(readlink "$proton_dir/files/share/fex-emu")" = "$fex_share" ] \
  || fail "Proton FEX resource symlink points at the wrong target"
[ -L "$steam_home/steamrtarm64/bin/steam-runtime-launcher-service" ] \
  || fail "ARM64 launcher service symlink missing from Steam PATH"
[ "$(readlink "$steam_home/steamrtarm64/bin/steam-runtime-launcher-service")" = "$steam_home/steam-runtime-steamrt-arm64/bin/steam-runtime-launcher-service" ] \
  || fail "ARM64 launcher service symlink points at the wrong target"
[ -L "$runtime_bin/python3" ] || fail "python3 symlink missing"
[ -L "$runtime_bin/python" ] || fail "python symlink missing"
[ "$(readlink "$runtime_bin/python3")" = 'python3.11' ] \
  || fail "python3 symlink should point at versioned runtime interpreter"

check_out=$(STEAM_HOME="$steam_home" FEX_ROOTFS="$fex_prefix" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --check)
printf '%s\n' "$check_out" | grep -q 'runtime-prep-check status=ok name=fex-rootfs-bwrap' \
  || fail "--check should validate FEX rootfs bwrap"
printf '%s\n' "$check_out" | grep -q 'runtime-prep-check status=ok name=fex-rootfs-freedreno' \
  || fail "--check should validate x86_64 Freedreno in the FEX rootfs"
printf '%s\n' "$check_out" | grep -q 'runtime-prep-check status=ok name=SteamLinuxRuntime_sniper-pressure-vessel-wrap' \
  || fail "--check should validate pressure-vessel-wrap trampoline"
printf '%s\n' "$check_out" | grep -q 'runtime-prep-check status=ok name=SteamLinuxRuntime_sniper-pv-adverb' \
  || fail "--check should validate pv-adverb trampoline"
printf '%s\n' "$check_out" | grep -q 'runtime-prep-check status=ok name=SteamLinuxRuntime_sniper-srt-bwrap' \
  || fail "--check should validate srt-bwrap rootfs contract"

set +e
missing_fex_out=$(STEAM_HOME="$steam_home" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --check 2>&1)
missing_fex_status=$?
set -e
[ "$missing_fex_status" -ne 0 ] || fail "--check should fail when FEX_ROOTFS is absent"
printf '%s\n' "$missing_fex_out" | grep -q 'runtime-prep-check status=fail name=FEX_ROOTFS' \
  || fail "missing FEX_ROOTFS diagnostic should name FEX_ROOTFS"


# Runtime 4 narrow repair mode must touch only launch-critical pressure-vessel
# helpers, leaving unrelated executables and legacy font/python mutations alone.
runtime4_home="$tmp/Runtime4Steam"
runtime4_pv="$runtime4_home/steamapps/common/SteamLinuxRuntime_4/pressure-vessel"
runtime4_rootfs="$runtime4_home/fex-rootfs"
mkdir -p \
  "$runtime4_pv/bin" \
  "$runtime4_pv/libexec/steam-runtime-tools-0" \
  "$runtime4_home/steamapps/common/SteamLinuxRuntime_4/steamrt4_platform_test/files/share/fonts/test" \
  "$runtime4_rootfs/usr/bin" \
  "$runtime4_rootfs/usr/lib"

write_x86_elf() {
  printf '\177ELF\002\001\001\000\000\000\000\000\000\000\000\000\002\000\076\000\001\000\000\000' > "$1"
  chmod 755 "$1"
}

write_x86_elf "$runtime4_pv/bin/pressure-vessel-wrap"
write_x86_elf "$runtime4_pv/libexec/steam-runtime-tools-0/pv-adverb"
write_x86_elf "$runtime4_pv/libexec/steam-runtime-tools-0/srt-bwrap"
write_x86_elf "$runtime4_pv/bin/unrelated-helper"
write_x86_elf "$runtime4_rootfs/usr/lib/libvulkan_freedreno.so"
cat > "$runtime4_rootfs/usr/bin/bwrap" <<'BWRAP'
#!/bin/sh
exit 0
BWRAP
chmod 755 "$runtime4_rootfs/usr/bin/bwrap"

set +e
runtime4_before=$(STEAM_HOME="$runtime4_home" FEX_ROOTFS="$runtime4_rootfs" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --check 2>&1)
runtime4_before_status=$?
set -e
[ "$runtime4_before_status" -ne 0 ] || fail "Runtime 4 x86 helpers should fail check before repair"
printf '%s\n' "$runtime4_before" | grep -q 'name=SteamLinuxRuntime_4-pressure-vessel-wrap' \
  || fail "Runtime 4 check should name pressure-vessel-wrap"
printf '%s\n' "$runtime4_before" | grep -q 'name=SteamLinuxRuntime_4-pv-adverb' \
  || fail "Runtime 4 check should name pv-adverb"
printf '%s\n' "$runtime4_before" | grep -q 'name=SteamLinuxRuntime_4-srt-bwrap' \
  || fail "Runtime 4 check should name srt-bwrap"

STEAM_HOME="$runtime4_home" FEX_ROOTFS="$runtime4_rootfs" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --repair-runtime-helpers
runtime4_after=$(STEAM_HOME="$runtime4_home" FEX_ROOTFS="$runtime4_rootfs" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --check)
printf '%s\n' "$runtime4_after" | grep -q 'status=ok name=SteamLinuxRuntime_4-pressure-vessel-wrap' \
  || fail "Runtime 4 pressure-vessel-wrap should be repaired"
printf '%s\n' "$runtime4_after" | grep -q 'status=ok name=SteamLinuxRuntime_4-pv-adverb' \
  || fail "Runtime 4 pv-adverb should be repaired"
printf '%s\n' "$runtime4_after" | grep -q 'status=ok name=SteamLinuxRuntime_4-srt-bwrap' \
  || fail "Runtime 4 srt-bwrap should be repaired"
grep -q 'exec /usr/bin/FEX "$0.x86_64"' "$runtime4_pv/bin/pressure-vessel-wrap" \
  || fail "Runtime 4 pressure-vessel-wrap should use FEX trampoline"
grep -q 'exec /usr/bin/FEX "$0.x86_64"' "$runtime4_pv/libexec/steam-runtime-tools-0/pv-adverb" \
  || fail "Runtime 4 pv-adverb should use FEX trampoline"
grep -q 'bwrap_bin="${FEX_ROOTFS%/}/usr/bin/bwrap"' "$runtime4_pv/libexec/steam-runtime-tools-0/srt-bwrap" \
  || fail "Runtime 4 srt-bwrap should resolve bwrap from FEX_ROOTFS"
grep -q 'PATH="/run/current-system/sw/bin:${PATH:-}"' "$runtime4_pv/libexec/steam-runtime-tools-0/srt-bwrap" \
  || fail "Runtime 4 srt-bwrap should prefix host PATH"
grep -q 'exec /usr/bin/FEX "$bwrap_bin" "$@"' "$runtime4_pv/libexec/steam-runtime-tools-0/srt-bwrap" \
  || fail "Runtime 4 srt-bwrap should direct-FEX bwrap"
[ ! -e "$runtime4_pv/bin/unrelated-helper.x86_64" ] \
  || fail "repair-runtime-helpers should not wrap unrelated helpers"
[ ! -e "$runtime4_home/steamapps/common/SteamLinuxRuntime_4/steamrt4_platform_test/files/share/fonts/test/.uuid" ] \
  || fail "repair-runtime-helpers should not mutate font marker trees"

echo "steam-guest-runtime-prep-smoke: ok"
