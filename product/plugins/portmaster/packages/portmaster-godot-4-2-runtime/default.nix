{
  lib,
  stdenv,
  fetchurl,
  squashfsTools,
  patchelf,
}:

let
  runtimeName = "godot_4.2.2";
  executableName = "godot422.aarch64";
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    lib.removeSuffix "\n" (builtins.readFile "${stdenv.cc}/nix-support/dynamic-linker")
  );
in
stdenv.mkDerivation {
  pname = "portmaster-godot-4-2-runtime";
  version = "4.2.2";

  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-New/releases/download/2025-03-11_0117/${runtimeName}.squashfs";
    sha256 = "0k2k45kqvz2rh8r24mfcw5hgn2kqs501sb3sky3h5klh4pmbj6js";
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
        "$runtime_root/${executableName}"
    ''}

    mkdir -p "$out/nix-support"
    printf '%s\n' '${runtimeName}' > "$out/nix-support/runtime-name"
    printf '%s\n' "$runtime_root" > "$out/nix-support/runtime-root"
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
    description = "Extracted PortMaster Godot 4.2.2 runtime root for runtime-mounts compatibility";
    homepage = "https://portmaster.games/runtimes.html";
    license = lib.licenses.mit;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
