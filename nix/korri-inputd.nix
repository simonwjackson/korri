{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-inputd";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
    pkgs.makeWrapper
  ];

  dontConfigure = true;

  unpackPhase = ''
    runHook preUnpack

    cp -R "$src"/. .
    chmod -R u+w .

    runHook postUnpack
  '';

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"

    rm -rf node_modules
    mkdir -p node_modules
    cp -R ${bunDeps}/. node_modules/
    chmod -R u+w node_modules

    bun build tools/device/inputd.ts --target=bun --outfile=korri-inputd.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-inputd" "$out/bin"
    cp korri-inputd.js "$out/share/korri-inputd/korri-inputd.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-inputd" \
      --add-flags "$out/share/korri-inputd/korri-inputd.js"

    runHook postInstall
  '';

  meta = {
    description = "Korri native input bridge and shortcut daemon";
    platforms = lib.platforms.linux;
  };
}
