{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-server";
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

    bun build tools/device/korri-server.ts --target=bun --external '@proseql/*' --outfile=korri-server.js
    bun build tools/http/server.ts --target=bun --external '@proseql/*' --outfile=korri-api.js
    bun build tools/device/lan-stream-advertise-cli.ts --target=bun --outfile=korri-lan-stream-advertise.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-server" "$out/bin"
    cp korri-server.js korri-api.js korri-lan-stream-advertise.js "$out/share/korri-server/"
    cp -R node_modules "$out/share/korri-server/node_modules"

    # The headless server runtime never imports electrobun — it ships in
    # bunDeps because the desktop derivation needs it. Drop the npm files
    # from the server output so the closure doesn't carry them.
    rm -rf "$out/share/korri-server/node_modules/electrobun"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-server" \
      --add-flags "$out/share/korri-server/korri-server.js"
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-api" \
      --add-flags "$out/share/korri-server/korri-api.js"
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-lan-stream-advertise" \
      --add-flags "$out/share/korri-server/korri-lan-stream-advertise.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    if [ -d "$out/share/korri-server/node_modules/electrobun" ]; then
      echo "korri-server install closure must not contain electrobun npm files" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri headless server and compatibility tools";
    platforms = lib.platforms.linux;
  };
}
