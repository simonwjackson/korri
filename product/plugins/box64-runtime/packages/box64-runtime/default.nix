{
  lib,
  stdenvNoCC,
  box64,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-box64-runtime";
  version = "0.1.0";

  src = ./.;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/share/korri/box64-runtime
    ln -s ${box64}/bin/box64 $out/bin/box64
    cp setup-env $out/share/korri/box64-runtime/setup-env
    substituteInPlace $out/share/korri/box64-runtime/setup-env \
      --replace-fail @box64@ ${box64}
    runHook postInstall
  '';

  meta = {
    description = "Korri Box64 runtime package";
    mainProgram = "box64";
    platforms = lib.platforms.linux;
  };
}
