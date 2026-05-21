{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-game-stream-runner";
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

    bun build tools/device/game-stream-runner.ts --target=bun --outfile=korri-game-stream-runner.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-game-stream-runner" "$out/bin"
    cp korri-game-stream-runner.js "$out/share/korri-game-stream-runner/korri-game-stream-runner.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-game-stream-runner" \
      --add-flags "$out/share/korri-game-stream-runner/korri-game-stream-runner.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-game-stream-enqueue" \
      --add-flags "$out/share/korri-game-stream-runner/korri-game-stream-runner.js" \
      --add-flags enqueue

    runHook postInstall
  '';

  meta = {
    description = "Korri headless game stream runner for Sunshine app sessions";
    platforms = lib.platforms.linux;
  };
}
