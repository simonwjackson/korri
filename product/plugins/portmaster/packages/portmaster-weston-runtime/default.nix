{
  lib,
  stdenv,
  fetchurl,
  squashfsTools,
  patchelf,
  bzip2,
  expat,
  libevdev,
  libglvnd,
  libjpeg8,
  systemdMinimal,
  util-linuxMinimal,
  xwayland,
  zlib,
}:

let
  runtimeName = "weston_pkg_0.2";
  libraryPath = lib.makeLibraryPath [
    expat
    libevdev
    libglvnd
    libjpeg8.out
    systemdMinimal
    util-linuxMinimal.lib
    zlib
  ];
  xwaylandLibraryPath = lib.makeLibraryPath [
    bzip2
    libglvnd
  ];
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    lib.removeSuffix "\n" (builtins.readFile "${stdenv.cc}/nix-support/dynamic-linker")
  );
in
stdenv.mkDerivation {
  pname = "portmaster-weston-runtime";
  version = "0.2";

  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-New/releases/download/2025-07-24_0745/${runtimeName}.squashfs";
    sha256 = "14qsphl85mq9z92kgmmw0id5r5l2rdvrd317whgvp5hjq7msxk0b";
  };

  nativeBuildInputs = [ squashfsTools patchelf ];

  dontUnpack = true;

  installPhase = ''
    runHook preInstall

    runtime_root="$out/share/korri/portmaster/runtimes/${runtimeName}"
    mkdir -p "$runtime_root"
    unsquashfs -f -d "$runtime_root" "$src"

    ${lib.optionalString stdenv.hostPlatform.isAarch64 ''
      while IFS= read -r -d "" candidate; do
        if interpreter="$(patchelf --print-interpreter "$candidate" 2>/dev/null)"; then
          case "$interpreter" in
            */ld-linux-aarch64.so.1)
              patchelf --set-interpreter '${linuxInterpreter}' "$candidate"
              ;;
          esac
        fi
      done < <(find "$runtime_root" -type f -print0)
    ''}

    # The upstream Xwayland binary is not patchelf-compatible on NixOS
    # (patchelf reports `section header table out of bounds`). Westonpack
    # invokes it by relative path as `bin/Xwayland`, so replace just that
    # executable with a Nix-provided build while preserving the rest of the
    # PortMaster runtime layout. Weston also supplies XWAYLAND_LD_LIBRARY_PATH,
    # so the wrapper restores Nix-only dependencies that would otherwise be
    # missing under that launch environment.
    rm -f "$runtime_root/bin/Xwayland"
    cat > "$runtime_root/bin/Xwayland" <<'EOF_XWAYLAND'
#!${stdenv.shell}
runtime_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export XKB_CONFIG_ROOT="''${XKB_CONFIG_ROOT:-$runtime_root/share/xkb}"
append_library_path="${xwaylandLibraryPath}"
if [ -n "''${LD_LIBRARY_PATH:-}" ]; then
  export LD_LIBRARY_PATH="''${LD_LIBRARY_PATH}:$append_library_path"
else
  export LD_LIBRARY_PATH="$append_library_path"
fi
exec '${xwayland}/bin/Xwayland' "$@"
EOF_XWAYLAND
    chmod +x "$runtime_root/bin/Xwayland"

    mkdir -p "$out/nix-support"
    printf '%s\n' '${runtimeName}' > "$out/nix-support/runtime-name"
    printf '%s\n' "$runtime_root" > "$out/nix-support/runtime-root"
    printf '%s\n' '${libraryPath}' > "$out/nix-support/library-path"
    cat > "$out/nix-support/compatibility-profile.json" <<EOF
    {
      "env": {
        "CFW_NAME": "ROCKNIX",
        "LD_LIBRARY_PATH": "${libraryPath}",
        "XKB_CONFIG_ROOT": "/tmp/weston/share/xkb"
      },
      "runtimeCompatibility": {
        "mode": "runtime-mounts",
        "runtimeMounts": [
          {
            "runtime": "${runtimeName}",
            "sourcePath": "$runtime_root"
          }
        ]
      }
    }
EOF

    runHook postInstall
  '';

  meta = {
    description = "Extracted PortMaster Weston runtime root for Godot 4 runtime-mounts compatibility";
    homepage = "https://portmaster.games/runtimes.html";
    license = lib.licenses.mit;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
