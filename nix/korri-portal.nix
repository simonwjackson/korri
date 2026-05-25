{
  pkgs,
  src,
  bunDeps,
}:

# Single portal build for every desktop variant. Runtime configuration
# (e.g. whether the desktop input bridge is active) is no longer a
# Vite-baked constant: the desktop's bun-side Hono composition inlines
# `window.__korriRuntimeConfig` into the served `index.html` so the same
# bundle ships to host and device. See plan 2026-05-24-004 (U2/U3).
pkgs.stdenv.mkDerivation {
  pname = "korri-portal";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
    pkgs.bun2nix.hook
  ];

  # bun2nix.hook reads `bunDeps` (the offline cache) and runs
  # `bun install --frozen-lockfile --ignore-scripts` against it during
  # `bunNodeModulesInstallPhase`, before buildPhase.
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

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    if [ ! -f "$out/index.html" ]; then
      echo "korri-portal output is missing index.html" >&2
      exit 1
    fi

    if ! find "$out/assets" -maxdepth 1 -type f -name '*.js' | grep -q .; then
      echo "korri-portal output is missing built JavaScript assets" >&2
      exit 1
    fi

    if ! find "$out/assets" -maxdepth 1 -type f -name '*.css' | grep -q .; then
      echo "korri-portal output is missing built CSS assets" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta.description = "Korri Vite portal build for desktop packaging";
}
