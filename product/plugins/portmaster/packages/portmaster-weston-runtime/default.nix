{
  lib,
  stdenv,
  fetchurl,
  squashfsTools,
  patchelf,
  expat,
  libevdev,
  libjpeg8,
  systemdMinimal,
  util-linuxMinimal,
  zlib,
}:

let
  runtimeName = "weston_pkg_0.2";
  libraryPath = lib.makeLibraryPath [
    expat
    libevdev
    libjpeg8.out
    systemdMinimal
    util-linuxMinimal.lib
    zlib
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

    mkdir -p "$out/nix-support"
    printf '%s\n' '${runtimeName}' > "$out/nix-support/runtime-name"
    printf '%s\n' "$runtime_root" > "$out/nix-support/runtime-root"
    printf '%s\n' '${libraryPath}' > "$out/nix-support/library-path"
    cat > "$out/nix-support/compatibility-profile.json" <<EOF
    {
      "env": {
        "LD_LIBRARY_PATH": "${libraryPath}"
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
