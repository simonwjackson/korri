{
  pkgs,
  src,
  bunDeps,
}:

# Single portal build for every desktop variant. The native input-bridge
# URL is no longer a Vite-baked constant — the desktop preload installs
# `window.__korriRuntime` and the bun side pushes the URL on dom-ready,
# so the same bundle ships to host and device.
pkgs.stdenv.mkDerivation {
  pname = "korri-portal";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
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

    rm -rf node_modules
    mkdir -p node_modules
    cp -R ${bunDeps}/. node_modules/
    chmod -R u+w node_modules
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"

    node node_modules/vite/bin/vite.js build --mode production

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -R out/build/portal/. "$out/"

    if [ ! -f "$out/index.html" ]; then
      echo "Expected built portal index.html" >&2
      exit 1
    fi

    runHook postInstall
  '';

  meta.description = "Korri Vite portal build for desktop packaging";
}
