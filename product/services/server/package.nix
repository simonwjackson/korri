{
  pkgs,
  lib,
  src,
  bunDeps,
}:

pkgs.stdenv.mkDerivation {
  pname = "korrid";
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

    bun --config=/dev/null --no-install ${../../../tools/nix/bun-production-deps.ts} package-json > package.json.production && mv package.json.production package.json
    bun --config=/dev/null --no-install ${../../../tools/nix/bun-production-deps.ts} bun-lock > bun.lock.production && mv bun.lock.production bun.lock
    ! grep -q '"devDependencies"' package.json

    runHook postUnpack
  '';

  buildPhase = ''
    runHook preBuild

    export HOME="$TMPDIR/home"
    mkdir -p "$HOME"

    # @proseql/core ships default imports for a few CommonJS serializer
    # dependencies. Bun's runtime accepts them but Bun's bundler does
    # not. Patch the installed build output to use namespace imports so
    # the bundles can be fully self-contained without `--external`.
    #
    # The bun2nix cache override in flake.nix applies the same patch
    # centrally for korri-desktop, which does not get a sed loop here.
    # We keep the sed in korri-cli/korrid as defense-in-depth
    # because the central override is keyed on an exact proseql version
    # string; this loop is version-agnostic and protects the bundle if
    # a future bump silently misses the override key.
    for codec in hjson json5 jsonc; do
      file="node_modules/@proseql/core/dist/serializers/codecs/$codec.js"
      if [ -f "$file" ]; then
        sed -i 's/^import pkg from /import * as pkg from /' "$file"
      fi
    done

    bun build product/services/device/korrid.ts --target=bun --outfile=korrid.js
    bun build product/services/server/http/server.ts --target=bun --outfile=korri-api.js
    bun build product/services/device/lan-stream-advertise-cli.ts --target=bun --outfile=korri-lan-stream-advertise.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korrid" "$out/bin"
    cp korrid.js korri-api.js korri-lan-stream-advertise.js "$out/share/korrid/"

    # All three bundles are fully self-contained — no node_modules has
    # to ship in the output. Copying the full dev tree previously
    # inflated the closure with kokoro-js, onnxruntime, @babylonjs,
    # playwright, storybook, typescript, and the entire electrobun
    # native package, none of which the headless server reaches at
    # runtime.

    # When `avahi-daemon` is running on the host, the server spawns
    # `avahi-publish-service` rather than embedding its own bonjour-service
    # publisher (which would race-NXDOMAIN against the daemon). Bake the
    # avahi CLI directory onto the wrapper's PATH so the server is
    # self-contained — consumers don't have to remember to add
    # `pkgs.avahi` to the systemd unit's path. Same trick for the
    # standalone lan-stream-advertise CLI.
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korrid" \
      --add-flags "$out/share/korrid/korrid.js" \
      --prefix PATH : "${pkgs.avahi}/bin"
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-api" \
      --add-flags "$out/share/korrid/korri-api.js"
    makeWrapper ${pkgs.bun}/bin/bun "$out/bin/korri-lan-stream-advertise" \
      --add-flags "$out/share/korrid/korri-lan-stream-advertise.js" \
      --prefix PATH : "${pkgs.avahi}/bin"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    # Guard against future regressions of the dev-deps-in-closure bug:
    # the bundles are self-contained, so $out must not carry any
    # node_modules tree at all. Subsumes the older electrobun/dangling-
    # symlink checks, which were band-aids for shipping the full tree.
    if [ -d "$out/share/korrid/node_modules" ]; then
      echo "korrid install closure must not contain node_modules" >&2
      find "$out/share/korrid/node_modules" -maxdepth 2 -type d >&2
      exit 1
    fi

    # No runtime smoke for the three server entries: korrid.js,
    # korri-api.js, and korri-lan-stream-advertise.js all bind ports on
    # module load and have no --help/--version flag. The cli smoke in
    # korri-cli.nix already exercises the @proseql/core bundling path,
    # which is the highest-risk regression target for dropping
    # --external. If the server entries grow a --version flag in the
    # future this is the right place to add an analogous probe.

    # avahi-publish-service must be reachable from the wrapper's PATH so
    # the server can advertise without external setup.
    if ! grep -q 'avahi' "$out/bin/korrid" 2>/dev/null; then
      echo "korrid wrapper does not reference avahi on its PATH" >&2
      exit 1
    fi

    runHook postInstallCheck
  '';

  meta = {
    description = "Korri headless server and compatibility tools";
    platforms = lib.platforms.linux;
  };
}
