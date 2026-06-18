{
  lib,
  stdenvNoCC,
  coreutils,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-fex-runtime";
  version = "0.1.0";

  src = ./.;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out/share/korri/fex-runtime"
    install -m644 setup-env "$out/share/korri/fex-runtime/setup-env"
    substituteInPlace "$out/share/korri/fex-runtime/setup-env" \
      --replace-fail '@coreutils@' '${coreutils}/bin'

    runHook postInstall
  '';

  passthru = {
    setupEnv = "share/korri/fex-runtime/setup-env";
  };

  meta = {
    description = "Korri FEX runtime environment helper";
    license = lib.licenses.mit;
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
