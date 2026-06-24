{
  lib,
  stdenv,
  fetchurl,
  pkgsCross,
  SDL2,
  zlib,
  bzip2,
  unzip,
  patchelf,
  makeWrapper,
  file,
}:

let
  # PortMaster has not published a standalone gmloader-next runtime yet. Seed
  # Korri's package from a fixed PortMaster port that bundles the real upstream
  # aarch64 runner, then expose that runner as the plugin-owned runtime.
  # Upstream source for the runner remains JohnnyonFlame/gmloader-next; the
  # binary is recorded as binary native code and checked below as AArch64 ELF.
  version = "2025-01-14_1009-c2fca354";
  portmasterRelease = "2025-01-14_1009";
  portmasterPort = "spelunky";
  sourceRev = "c2fca354df73761887c15f44a0b28ec823581cd5";
  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-New/releases/download/${portmasterRelease}/${portmasterPort}.zip";
    hash = "sha256-A/Vex/Xn74lSNUDcprlmaVVyHVqXPxPTPSEq6xdgf9A=";
  };
  target = pkgsCross.aarch64-multiplatform;
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    lib.removeSuffix "\n" (builtins.readFile "${target.stdenv.cc}/nix-support/dynamic-linker")
  );
  bundledLibraryPath = "$out/lib/gmloader-next:$out/lib/gmloader-next/arm64-v8a";
  hostLibraryPath = lib.makeLibraryPath [
    target.stdenv.cc.cc.lib
    SDL2
    zlib
    bzip2
  ];
  runtimeLibraryPath = "${bundledLibraryPath}:${hostLibraryPath}";
in
stdenv.mkDerivation {
  pname = "gmloader-next";
  inherit version src;

  nativeBuildInputs = [ unzip patchelf makeWrapper file ];

  dontUnpack = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/libexec/gmloader-next" "$out/lib/gmloader-next" "$out/bin" "$out/nix-support"
    unzip -q "$src" \
      '${portmasterPort}/gmloadernext.aarch64' \
      '${portmasterPort}/lib/arm64-v8a/*' \
      '${portmasterPort}/lib/libzip.so.5' \
      '${portmasterPort}/lib/libopenal.so.1' \
      '${portmasterPort}/lib/libcrypto.so.1.1' \
      '${portmasterPort}/license/LICENSE.gmloadernext.md' \
      -d extracted

    install -Dm755 "extracted/${portmasterPort}/gmloadernext.aarch64" \
      "$out/libexec/gmloader-next/gmloadernext.aarch64"
    cp -R "extracted/${portmasterPort}/lib/." "$out/lib/gmloader-next/"
    install -Dm644 "extracted/${portmasterPort}/license/LICENSE.gmloadernext.md" \
      "$out/share/doc/gmloader-next/LICENSE.gmloadernext.md"

    ${lib.optionalString stdenv.hostPlatform.isLinux ''
      patchelf \
        --set-interpreter '${linuxInterpreter}' \
        --set-rpath "${runtimeLibraryPath}" \
        "$out/libexec/gmloader-next/gmloadernext.aarch64"
    ''}

    makeWrapper "$out/libexec/gmloader-next/gmloadernext.aarch64" "$out/bin/gmloader-next" \
      --prefix LD_LIBRARY_PATH : "${runtimeLibraryPath}"

    printf '%s\n' '${sourceRev}' > "$out/nix-support/source-rev"
    printf '%s\n' '${portmasterRelease}/${portmasterPort}.zip' > "$out/nix-support/binary-seed"
    printf '%s\n' "${runtimeLibraryPath}" > "$out/nix-support/library-path"
    printf '%s\n' "$out/libexec/gmloader-next/gmloadernext.aarch64" > "$out/nix-support/runner-path"

    runHook postInstall
  '';

  postFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
    file "$out/libexec/gmloader-next/gmloadernext.aarch64" | grep -Eq 'aarch64|ARM aarch64|ARM64'
  '';

  meta = {
    description = "GMLoader Next aarch64 GameMaker runner packaged for Korri";
    homepage = "https://github.com/JohnnyonFlame/gmloader-next";
    license = lib.licenses.gpl2Only;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
    mainProgram = "gmloader-next";
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
