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
fonts="$common/SteamLinuxRuntime_sniper/sniper_platform_0.20240101/files/share/fonts/subdir"
runtime_bin="$common/SteamLinuxRuntime_sniper/sniper_platform_0.20240101/files/bin"
proton_dir="$common/Proton 11.0 (ARM64)"
proton_bin="$proton_dir/files/bin"
fex_prefix="$tmp/fex"
fex_share="$fex_prefix/share/fex-emu"
mkdir -p "$pv" "$fonts" "$runtime_bin" "$proton_dir" "$proton_bin" "$proton_dir/files/share" \
  "$steam_home/steam-runtime-steamrt-arm64/bin" "$steam_home/steamrtarm64/bin" "$fex_prefix/bin" "$fex_share/GuestThunks"

cat > "$pv/srt-bwrap" <<'EOS'
#!/bin/sh
echo original bwrap "$@"
EOS
chmod 755 "$pv/srt-bwrap"

# Use a real executable with an embedded FEX-looking string to ensure wrapper
# detection does not grep binary payloads and skip newly downloaded runtime
# helpers that still need FEX trampolines.
cp "$(command -v sh)" "$pv/pressure-vessel-wrap"
chmod u+w "$pv/pressure-vessel-wrap"
printf '\n/FEX false-positive marker\n' >> "$pv/pressure-vessel-wrap"
chmod 755 "$pv/pressure-vessel-wrap"
expect_pv_wrap=0
if command -v file >/dev/null 2>&1 && file "$pv/pressure-vessel-wrap" | grep -q 'x86-64'; then
  expect_pv_wrap=1
fi

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
chmod 755 "$fex_prefix/bin/FEX"
: > "$fex_share/ThunksDB.json"

cat > "$runtime_bin/python3.11" <<'EOS'
#!/bin/sh
exit 0
EOS
chmod 755 "$runtime_bin/python3.11"

STEAM_HOME="$steam_home" FEX_BIN="$fex_prefix/bin/FEX" FEX_WRAPPER_BIN="/usr/bin/FEX" bash "$SCRIPT" --apply

[ -f "$pv/srt-bwrap.x86_64" ] || fail "srt-bwrap backup was not preserved"
grep -q 'exec bwrap "$@"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should be replaced by a native bwrap trampoline"
if [ "$expect_pv_wrap" = 1 ]; then
  [ -f "$pv/pressure-vessel-wrap.x86_64" ] \
    || fail "pressure-vessel x86_64 backup was not preserved"
  grep -q 'exec /usr/bin/FEX "$0.x86_64"' "$pv/pressure-vessel-wrap" \
    || fail "pressure-vessel x86_64 binary should be replaced by a FHS-visible FEX trampoline"
  grep -q 'KORRI_STEAM_OVERLAY_FILTER' "$pv/pressure-vessel-wrap" \
    || fail "pressure-vessel wrapper should filter Steam overlay preload injection"
fi
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

echo "steam-guest-runtime-prep-smoke: ok"
