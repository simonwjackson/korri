{
  lib,
  stdenvNoCC,
  stagedRoot ? null,
}:

assert stagedRoot != null;

stdenvNoCC.mkDerivation {
  pname = "korri-3dsen-app";
  version = "0.1.0";

  dontUnpack = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    cat > $out/bin/3dsen <<'SH'
    #!/usr/bin/env sh
    set -eu
    exec "${stagedRoot}/3dSen.exe" "$@"
    SH
    chmod 755 $out/bin/3dsen
    runHook postInstall
  '';

  meta = {
    description = "Korri wrapper for a staged 3dSen payload";
    mainProgram = "3dsen";
    platforms = lib.platforms.aarch64;
  };
}
