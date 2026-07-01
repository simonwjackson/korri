{
  pkgs,
  lib,
  src,
  bunDeps,
  portal,
}:

pkgs.stdenv.mkDerivation {
  pname = "korri-web-surface-host";
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

    bun build product/services/device/web-surface-host.ts --target=bun --outfile=korri-web-surface-host.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-web-surface-host" "$out/bin"
    cp korri-web-surface-host.js "$out/share/korri-web-surface-host/korri-web-surface-host.js"

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-web-surface-host" \
      --set-default KORRI_ASSET_ROOT ${portal} \
      --add-flags "$out/share/korri-web-surface-host/korri-web-surface-host.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    if [ ! -x "$out/bin/korri-web-surface-host" ]; then
      echo "korri-web-surface-host wrapper is missing or not executable" >&2
      exit 1
    fi

    if [ ! -f "$out/share/korri-web-surface-host/korri-web-surface-host.js" ]; then
      echo "korri-web-surface-host bundled JS is missing" >&2
      exit 1
    fi

    if [ -d "$out/share/korri-web-surface-host/node_modules" ]; then
      echo "korri-web-surface-host install closure must not contain node_modules" >&2
      exit 1
    fi

    if [ ! -f ${portal}/index.html ]; then
      echo "korri-web-surface-host KORRI_ASSET_ROOT must point at the portal root" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri network web-surface host (SPA + /api proxy)";
    platforms = lib.platforms.linux;
  };
}
