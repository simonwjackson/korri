{
  lib,
  stdenvNoCC,
  coreutils,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-proton-runtime";
  version = "0.1.0";

  src = ./.;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out/share/korri/proton-runtime"
    install -m644 setup-env "$out/share/korri/proton-runtime/setup-env"
    substituteInPlace "$out/share/korri/proton-runtime/setup-env" \
      --replace-fail '@coreutils@' '${coreutils}/bin'

    runHook postInstall
  '';

  passthru = {
    setupEnv = "share/korri/proton-runtime/setup-env";
  };

  meta = {
    description = "Korri Proton runtime environment helper";
    license = lib.licenses.mit;
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
