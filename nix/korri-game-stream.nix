{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-game-stream";
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

    bun build tools/device/game-stream-runner.ts --target=bun --outfile=korri-game-stream-runner.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-game-stream" "$out/bin"
    cp korri-game-stream-runner.js "$out/share/korri-game-stream/korri-game-stream-runner.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-game-stream-runner" \
      --add-flags "$out/share/korri-game-stream/korri-game-stream-runner.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-game-stream-enqueue" \
      --add-flags "$out/share/korri-game-stream/korri-game-stream-runner.js" \
      --add-flags enqueue

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    for binary in korri-game-stream-runner korri-game-stream-enqueue; do
      if [ ! -x "$out/bin/$binary" ]; then
        echo "$binary wrapper is missing or not executable" >&2
        exit 1
      fi
    done

    if [ ! -f "$out/share/korri-game-stream/korri-game-stream-runner.js" ]; then
      echo "korri-game-stream bundled JS is missing" >&2
      exit 1
    fi

    if [ -d "$out/share/korri-game-stream/node_modules" ]; then
      echo "korri-game-stream install closure must not contain node_modules" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri headless game stream runner for Sunshine app sessions";
    platforms = lib.platforms.linux;
  };
}
