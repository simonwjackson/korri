{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-headless-tools";
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

    bun build tools/http/server.ts --target=bun --external '@proseql/*' --outfile=korri-api.js
    bun build tools/device/lan-stream-advertise-cli.ts --target=bun --outfile=korri-lan-stream-advertise.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-headless-tools" "$out/bin"
    cp korri-api.js korri-lan-stream-advertise.js "$out/share/korri-headless-tools/"
    cp -R node_modules "$out/share/korri-headless-tools/node_modules"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-api" \
      --add-flags "$out/share/korri-headless-tools/korri-api.js"
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-lan-stream-advertise" \
      --add-flags "$out/share/korri-headless-tools/korri-lan-stream-advertise.js"

    runHook postInstall
  '';

  meta = {
    description = "Korri headless source RPC API and LAN advertiser";
    platforms = lib.platforms.linux;
  };
}
