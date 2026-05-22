{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-cli";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
    pkgs.makeWrapper
    pkgs.bun2nix.hook
  ];

  inherit bunDeps;
  bunInstallFlags = [ "--linker=hoisted" ];
  dontRunLifecycleScripts = true;

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

    bun build tools/cli/korri-cli.ts --target=bun --external '@proseql/*' --outfile=korri-cli.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-cli" "$out/bin"
    cp korri-cli.js "$out/share/korri-cli/korri-cli.js"
    cp -R node_modules "$out/share/korri-cli/node_modules"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri" \
      --add-flags "$out/share/korri-cli/korri-cli.js"

    runHook postInstall
  '';

  meta = {
    description = "Korri command line interface";
    platforms = lib.platforms.linux;
  };
}
