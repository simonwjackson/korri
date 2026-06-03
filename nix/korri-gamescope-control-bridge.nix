{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-gamescope-control-bridge";
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

    bun --config=/dev/null --no-install ${../tools/nix/bun-production-deps.ts} package-json > package.json.production && mv package.json.production package.json
    bun --config=/dev/null --no-install ${../tools/nix/bun-production-deps.ts} bun-lock > bun.lock.production && mv bun.lock.production bun.lock
    ! grep -q '"devDependencies"' package.json

    runHook postUnpack
  '';

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"

    bun build product/apps/cli/gamescope-control.ts --target=bun --outfile=gamescope-control.js
    bun build product/apps/cli/gamescope-control-bridge.ts --target=bun --outfile=gamescope-control-bridge.js
    bun build product/apps/cli/stream-control-bench.ts --target=bun --outfile=stream-control-bench.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-gamescope-control-bridge" "$out/bin"
    cp gamescope-control.js "$out/share/korri-gamescope-control-bridge/gamescope-control.js"
    cp gamescope-control-bridge.js "$out/share/korri-gamescope-control-bridge/gamescope-control-bridge.js"
    cp stream-control-bench.js "$out/share/korri-gamescope-control-bridge/stream-control-bench.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/gamescope-control" \
      --add-flags "$out/share/korri-gamescope-control-bridge/gamescope-control.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/gamescope-control-bridge" \
      --prefix PATH : ${
        lib.makeBinPath [
          pkgs.xorg.xprop
          pkgs.xorg.xrandr
        ]
      } \
      --add-flags "$out/share/korri-gamescope-control-bridge/gamescope-control-bridge.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/stream-control-bench" \
      --add-flags "$out/share/korri-gamescope-control-bridge/stream-control-bench.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    for exe in gamescope-control gamescope-control-bridge stream-control-bench; do
      if [ ! -x "$out/bin/$exe" ]; then
        echo "$exe wrapper is missing or not executable" >&2
        exit 1
      fi
    done

    for bundle in gamescope-control.js gamescope-control-bridge.js stream-control-bench.js; do
      if [ ! -f "$out/share/korri-gamescope-control-bridge/$bundle" ]; then
        echo "$bundle is missing" >&2
        exit 1
      fi
    done

    if [ -d "$out/share/korri-gamescope-control-bridge/node_modules" ]; then
      echo "korri-gamescope-control-bridge install closure must not contain node_modules" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri Gamescope runtime-control bridge, operator CLI, and stream control bench";
    platforms = lib.platforms.linux;
  };
}
