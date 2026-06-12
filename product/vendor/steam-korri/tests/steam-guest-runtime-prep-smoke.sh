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

cat > "$proton_dir/proton" <<'EOS'
#!/usr/bin/env python3
print("hello")
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

STEAM_HOME="$steam_home" FEX_BIN="$fex_prefix/bin/FEX" bash "$SCRIPT" --apply

[ -f "$pv/srt-bwrap.x86_64" ] || fail "srt-bwrap backup was not preserved"
grep -q 'exec bwrap "$@"' "$pv/srt-bwrap" \
  || fail "srt-bwrap should be replaced by a native bwrap trampoline"
[ -f "$fonts/.uuid" ] || fail "font .uuid marker missing"
[ "$(head -n 1 "$proton_dir/proton")" = '#!/usr/bin/python3' ] \
  || fail "Proton python shebang was not repaired"
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
