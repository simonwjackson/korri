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

    bun --config=/dev/null --no-install ${../../../../tools/nix/bun-production-deps.ts} package-json > package.json.production && mv package.json.production package.json
    bun --config=/dev/null --no-install ${../../../../tools/nix/bun-production-deps.ts} bun-lock > bun.lock.production && mv bun.lock.production bun.lock
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
    # the CLI bundle can be fully self-contained without `--external`.
    #
    # Keep this sed loop in korri-cli as defense-in-depth
    # because the central override is keyed on an exact proseql version
    # string; this loop is version-agnostic and protects the bundle if
    # a future bump silently misses the override key.
    for codec in hjson json5 jsonc; do
      file="node_modules/@proseql/core/dist/serializers/codecs/$codec.js"
      if [ -f "$file" ]; then
        sed -i 's/^import pkg from /import * as pkg from /' "$file"
      fi
    done

    bun build product/surfaces/terminal/korri-cli/korri-cli.ts --target=bun --outfile=korri-cli.js

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
      --set KORRI_FIND_BIN ${pkgs.findutils}/bin/find \
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

        # Smoke-test the bundle: dropping `--external '@proseql/*'` makes
        # static bundling the only path, so a future regression where the
        # bundler can't resolve a dynamic import (or a new codec the sed
        # loop missed) would build cleanly and only fail at first invocation
        # on the device. Running `--version` exercises module-load and
        # CLI-init paths without performing any side effects.
        export HOME="$TMPDIR/install-check-home"
        mkdir -p "$HOME"
        if ! "$out/bin/korri" --version >/dev/null 2>&1; then
          echo "korri-cli smoke test failed: bundle did not respond to --version" >&2
          "$out/bin/korri" --version >&2 || true
          exit 1
        fi

        bazzar_help="$TMPDIR/korri-bazzar-help.txt"
        if ! "$out/bin/korri" bazzar --help > "$bazzar_help" 2>&1; then
          echo "korri-cli smoke test failed: bundle did not respond to bazzar --help" >&2
          cat "$bazzar_help" >&2
          exit 1
        fi

        for command in search details plugins validate-providers resolve-download; do
          if ! grep -q "$command" "$bazzar_help"; then
            echo "korri-cli smoke test failed: bazzar help missing $command" >&2
            cat "$bazzar_help" >&2
            exit 1
          fi
        done

        scout_root="$TMPDIR/scout-root"
        scout_config="$TMPDIR/scout-config/korri.yaml"
        mkdir -p "$scout_root" "$(dirname "$scout_config")"
        touch "$scout_root/Metroid Fusion.gba"
        if ! env -i HOME="$HOME" XDG_DATA_HOME="$TMPDIR/xdg-data" KORRI_ENABLED_PLUGINS="@korri:retroarch" "$out/bin/korri" scout scan releases --root "$scout_root" --storage scout-smoke --config "$scout_config" > "$TMPDIR/korri-scout-smoke.out" 2> "$TMPDIR/korri-scout-smoke.err"; then
          echo "korri-cli smoke test failed: scout scan releases did not run with isolated environment" >&2
          cat "$TMPDIR/korri-scout-smoke.out" >&2 || true
          cat "$TMPDIR/korri-scout-smoke.err" >&2 || true
          exit 1
        fi
        if ! grep -q "metroid-fusion" "$scout_config"; then
          echo "korri-cli smoke test failed: scout scan did not merge candidate config" >&2
          cat "$TMPDIR/korri-scout-smoke.out" >&2 || true
          cat "$scout_config" >&2 || true
          exit 1
        fi
        if ! env -i HOME="$HOME" XDG_DATA_HOME="$TMPDIR/xdg-data" KORRI_CONFIG_ROOTS="$(dirname "$scout_config")" KORRI_ENABLED_PLUGINS="@korri:retroarch" "$out/bin/korri" scout scan configured --config "$scout_config" > "$TMPDIR/korri-scout-configured-smoke.out" 2> "$TMPDIR/korri-scout-configured-smoke.err"; then
          echo "korri-cli smoke test failed: configured scout scan did not run with isolated environment" >&2
          cat "$TMPDIR/korri-scout-configured-smoke.out" >&2 || true
          cat "$TMPDIR/korri-scout-configured-smoke.err" >&2 || true
          exit 1
        fi
        if ! grep -q '"scanned": 1' "$TMPDIR/korri-scout-configured-smoke.out"; then
          echo "korri-cli smoke test failed: configured scout scan did not scan configured storage" >&2
          cat "$TMPDIR/korri-scout-configured-smoke.out" >&2 || true
          exit 1
        fi

        # Safe Bazzar contract-command smoke: use an unknown-but-valid source name
        # so the command exercises the bundled acquisition CLI/RPC contract envelope
        # without performing network IO or loading private quarantined .mjs plugins.
        bazzar_contract="$TMPDIR/korri-bazzar-contract.json"
        bazzar_contract_err="$TMPDIR/korri-bazzar-contract.err"
        set +e
        "$out/bin/korri" bazzar resolve-download packaging-smoke https://example.invalid/rom.zip --title Smoke > "$bazzar_contract" 2> "$bazzar_contract_err"
        bazzar_contract_status=$?
        set -e
        if [ "$bazzar_contract_status" -ne 21 ]; then
          echo "korri-cli smoke test failed: expected bazzar contract smoke exit 21, got $bazzar_contract_status" >&2
          cat "$bazzar_contract" >&2 || true
          cat "$bazzar_contract_err" >&2 || true
          exit 1
        fi
        if [ -s "$bazzar_contract_err" ]; then
          echo "korri-cli smoke test failed: unexpected stderr output from bazzar contract-command" >&2
          cat "$bazzar_contract_err" >&2
          exit 1
        fi

        node - "$bazzar_contract" <<'NODE'
    const fs = require("node:fs")
    const file = process.argv[2]
    const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n")
    if (lines.length !== 1 || lines[0] === "") {
      console.error("expected exactly one bazzar contract stdout line")
      process.exit(1)
    }
    const parsed = JSON.parse(lines[0])
    if (typeof parsed !== "object" || parsed === null) {
      console.error("expected bazzar contract stdout to be a JSON object")
      process.exit(1)
    }
    NODE

        if [ -e "$out/bin/bazzar" ]; then
          echo "korri-cli must not install a standalone bazzar binary" >&2
          exit 1
        fi

        runHook postInstallCheck
  '';

  meta = {
    description = "Korri command line interface";
    platforms = lib.platforms.linux;
  };
}
