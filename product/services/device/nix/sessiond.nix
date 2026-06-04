{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-sessiond";
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

    bun --config=/dev/null --no-install ${../../../../tools/nix/bun-production-deps.ts} package-json > package.json.production && mv package.json.production package.json
    bun --config=/dev/null --no-install ${../../../../tools/nix/bun-production-deps.ts} bun-lock > bun.lock.production && mv bun.lock.production bun.lock
    ! grep -q '"devDependencies"' package.json

    runHook postUnpack
  '';

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"

    bun build product/services/device/sessiond.ts --target=bun --outfile=korri-sessiond.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-sessiond" "$out/bin"
    cp korri-sessiond.js "$out/share/korri-sessiond/korri-sessiond.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-sessiond" \
      --add-flags "$out/share/korri-sessiond/korri-sessiond.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    if [ ! -x "$out/bin/korri-sessiond" ]; then
      echo "korri-sessiond wrapper is missing or not executable" >&2
      exit 1
    fi

    if [ ! -f "$out/share/korri-sessiond/korri-sessiond.js" ]; then
      echo "korri-sessiond bundled JS is missing" >&2
      exit 1
    fi

    if [ -d "$out/share/korri-sessiond/node_modules" ]; then
      echo "korri-sessiond install closure must not contain node_modules" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri foreground-session supervisor daemon (kiosk + source-machine roles)";
    platforms = lib.platforms.linux;
  };
}
