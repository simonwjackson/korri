{
  pkgs,
  lib,
  src,
  outputHash,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-bun-deps";
  version = "1";

  inherit src outputHash;
  outputHashAlgo = "sha256";
  outputHashMode = "recursive";

  nativeBuildInputs = [
    pkgs.bun
    pkgs.cacert
  ];

  dontConfigure = true;
  dontFixup = true;

  unpackPhase = ''
    runHook preUnpack

    cp -R "$src"/. .
    chmod -R u+w .

    runHook postUnpack
  '';

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
    mkdir -p "$HOME" "$BUN_INSTALL_CACHE_DIR"

    bun install --frozen-lockfile --ignore-scripts

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -R node_modules/. "$out/"

    if [ ! -f "$out/electrobun/package.json" ]; then
      echo "Expected electrobun package in node_modules output" >&2
      exit 1
    fi

    if [ -f "$out/electrobun/bin/electrobun" ]; then
      echo "Native Electrobun binary should not be present after --ignore-scripts" >&2
      exit 1
    fi

    runHook postInstall
  '';

  meta.description = "Hermetic Bun node_modules for Korri, with package scripts disabled";
}
