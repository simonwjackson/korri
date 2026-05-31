{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-inputd";
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

    bun build tools/device/inputd.ts --target=bun --outfile=korri-inputd.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-inputd" "$out/bin"
    cp korri-inputd.js "$out/share/korri-inputd/korri-inputd.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-inputd" \
      --add-flags "$out/share/korri-inputd/korri-inputd.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    if [ ! -x "$out/bin/korri-inputd" ]; then
      echo "korri-inputd wrapper is missing or not executable" >&2
      exit 1
    fi

    if [ ! -f "$out/share/korri-inputd/korri-inputd.js" ]; then
      echo "korri-inputd bundled JS is missing" >&2
      exit 1
    fi

    if [ -d "$out/share/korri-inputd/node_modules" ]; then
      echo "korri-inputd install closure must not contain node_modules" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri native input bridge and shortcut daemon";
    platforms = lib.platforms.linux;
  };
}
