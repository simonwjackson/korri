{
  lib,
  stdenv,
  fetchurl,
  squashfsTools,
  patchelf,
  SDL2,
  zlib,
}:

let
  runtimeName = "frt_3.5.2";
  runtimeLibraryPath = lib.makeLibraryPath [
    SDL2
    zlib
    stdenv.cc.cc.lib
  ];
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    lib.removeSuffix "\n" (builtins.readFile "${stdenv.cc}/nix-support/dynamic-linker")
  );
in
stdenv.mkDerivation {
  pname = "portmaster-frt-runtime";
  version = "3.5.2";

  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-Runtime/releases/download/runtimes/${runtimeName}.squashfs";
    sha256 = "0ppl632da7mghvva9iyr3skbr67jji358vxdzjzab4vp80q94ndp";
  };

  nativeBuildInputs = [ squashfsTools patchelf ];

  dontUnpack = true;

  installPhase = ''
    runHook preInstall

    runtime_root="$out/share/korri/portmaster/runtimes/${runtimeName}"
    mkdir -p "$runtime_root"
    unsquashfs -f -d "$runtime_root" "$src"

    ${lib.optionalString stdenv.hostPlatform.isAarch64 ''
      patchelf \
        --set-interpreter '${linuxInterpreter}' \
        --set-rpath '${runtimeLibraryPath}' \
        "$runtime_root/${runtimeName}"
    ''}

    mkdir -p "$out/nix-support"
    printf '%s\n' '${runtimeName}' > "$out/nix-support/runtime-name"
    printf '%s\n' "$runtime_root" > "$out/nix-support/runtime-root"
    printf '%s\n' '${runtimeLibraryPath}' > "$out/nix-support/library-path"
    cat > "$out/nix-support/compatibility-profile.json" <<EOF
    {
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
    description = "Extracted PortMaster FRT/Godot 3.5.2 runtime root for runtime-mounts compatibility";
    homepage = "https://portmaster.games/runtimes.html";
    license = lib.licenses.mit;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
