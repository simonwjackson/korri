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

    # @proseql/core ships default imports for a few CommonJS serializer
    # dependencies. Bun's runtime accepts them but Bun's bundler does
    # not. Patch the installed build output to use namespace imports so
    # the CLI bundle can be fully self-contained without `--external`.
    # Mirrors the same fix in korri-desktop/unwrapped.nix.
    for codec in hjson json5 jsonc; do
      file="node_modules/@proseql/core/dist/serializers/codecs/$codec.js"
      if [ -f "$file" ]; then
        sed -i 's/^import pkg from /import * as pkg from /' "$file"
      fi
    done

    bun build tools/cli/korri-cli.ts --target=bun --outfile=korri-cli.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-cli" "$out/bin"
    cp korri-cli.js "$out/share/korri-cli/korri-cli.js"

    # The CLI is fully bundled into a single self-contained JS file
    # above; no node_modules has to ship in the output. Copying the
    # full dev tree previously inflated the closure from ~3 MB to
    # 1.4 GB (kokoro-js, onnxruntime, @babylonjs, playwright, storybook,
    # typescript, ...) despite none of it being reachable at runtime.

    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri" \
      --add-flags "$out/share/korri-cli/korri-cli.js"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    # Guard against future regressions of the dev-deps-in-closure bug:
    # the bundle is self-contained, so $out must not carry any
    # node_modules tree at all.
    if [ -d "$out/share/korri-cli/node_modules" ]; then
      echo "korri-cli install closure must not contain node_modules" >&2
      find "$out/share/korri-cli/node_modules" -maxdepth 2 -type d >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri command line interface";
    platforms = lib.platforms.linux;
  };
}
