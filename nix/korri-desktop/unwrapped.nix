{
  pkgs,
  lib,
  src,
  system,
  bunDeps,
  electrobunBinaries,
  portal,
  # Build-host library set for the in-derivation patchelf pass that runs
  # before `electrobun build`. node_modules/electrobun ships ELFs that need
  # a working dynamic linker on the build host. The per-variant wrap step
  # re-RPATHs every shared object with the variant's library set.
  buildtimeLibraries,
}:

let
  platformBySystem = {
    x86_64-linux = {
      os = "linux";
      arch = "x64";
    };
    aarch64-linux = {
      os = "linux";
      arch = "arm64";
    };
  };

  platform =
    platformBySystem.${system}
      or (throw "korri-desktop-unwrapped is only supported on x86_64-linux and aarch64-linux");

  buildtimeLibraryPath = lib.makeLibraryPath buildtimeLibraries;
in
pkgs.stdenv.mkDerivation {
  pname = "korri-desktop-unwrapped";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
    pkgs.patchelf
    pkgs.file
    pkgs.bun2nix.hook
  ];

  buildInputs = buildtimeLibraries;

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

        # node_modules has been populated by bun2nix.hook's
        # bunNodeModulesInstallPhase. The @proseql/core codec import patch is
        # applied centrally in the bun cache derivation (flake.nix), so we no
        # longer need a per-consumer sed loop here.
        rm -rf out

        mkdir -p node_modules/electrobun/bin
        cp ${electrobunBinaries.cli}/electrobun node_modules/electrobun/bin/electrobun
        chmod +x node_modules/electrobun/bin/electrobun

        mkdir -p node_modules/electrobun/dist-${platform.os}-${platform.arch}
        cp -R ${electrobunBinaries.core}/. node_modules/electrobun/dist-${platform.os}-${platform.arch}/
        chmod -R u+w node_modules/electrobun/dist-${platform.os}-${platform.arch}

        mkdir -p out/build/portal
        cp -R ${portal}/. out/build/portal/

        # File-type-branched patchelf: executables (interpreter set) get
        # only --set-interpreter; shared objects get only --set-rpath. The
        # wrap step preserves this branching when re-RPATHing per variant.
        # Adding RPATH to executables (bun, launcher) is a semantic change
        # we explicitly avoid — see plan U5/U6 Key Technical Decisions.
        patch_elf_tree() {
          local root="$1"
          find "$root" -type f -print | while IFS= read -r file; do
            file_type="$(${pkgs.file}/bin/file "$file")"
            if echo "$file_type" | grep -q 'ELF'; then
              chmod u+w "$file"
              if echo "$file_type" | grep -q 'interpreter '; then
                ${pkgs.patchelf}/bin/patchelf \
                  --set-interpreter ${pkgs.stdenv.cc.bintools.dynamicLinker} \
                  "$file"
              elif echo "$file_type" | grep -q 'shared object'; then
                ${pkgs.patchelf}/bin/patchelf \
                  --set-rpath "\$ORIGIN:${buildtimeLibraryPath}" \
                  "$file"
              fi
            fi
          done
        }

        patch_elf_tree node_modules/electrobun/bin
        patch_elf_tree node_modules/electrobun/dist-${platform.os}-${platform.arch}

        node node_modules/electrobun/bin/electrobun.cjs build || {
          if [ -d out/build/electrobun ]; then
            echo "Electrobun artifact bundling failed, but build output exists; continuing with the unpacked desktop bundle" >&2
          else
            exit 1
          fi
        }

        app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"
        if [ -z "$app_bundle" ]; then
          echo "Could not find unpacked Electrobun app bundle" >&2
          find out/build/electrobun -maxdepth 4 -type d | sort >&2
          exit 1
        fi

        if [ ! -f "$app_bundle/Resources/app/bun/index.js" ]; then
          echo "Electrobun did not emit flat app code; building Resources/app/bun/index.js directly" >&2
          mkdir -p "$app_bundle/Resources/app/bun" "$app_bundle/Resources/app/views/mainview"
          bun build korri/deploy/desktop/index.ts --target bun --outdir "$app_bundle/Resources/app/bun"
          cp -R out/build/portal/. "$app_bundle/Resources/app/views/mainview/"
        fi

        # Compile the renderer-side preload that installs window.__korriInput
        # plus Korri's owned window.__korriInputDispatch entry point, so the
        # React shell can subscribe to brokered semantic input actions from the
        # desktop input broker. Connection-state and runtime-config are no
        # longer pushed over this channel (see plan 2026-05-24-004 U1/U2/U6):
        # they're served via the bun-side Hono composition and an inlined
        # `<script>` tag respectively. Electrobun's receiveMessageFromBun hook
        # remains framework-owned and is not used for Korri input delivery.
        mkdir -p "$app_bundle/Resources/app/views/mainview"
        bun build korri/deploy/desktop/preload-entry.ts \
          --target=browser \
          --outfile="$app_bundle/Resources/app/views/mainview/preload.js"

        # Bundle the waiting-page polling-loop bootstrap as a browser
        # module and copy the co-located waiting.css. Both are served by
        # bun while the connection controller is not yet `connected`
        # (the React bundle never loads in that state).
        bun build korri/deploy/desktop/waiting-page/polling-loop-bootstrap.ts \
          --target=browser \
          --outfile="$app_bundle/Resources/app/views/mainview/waiting-polling-loop.js"
        cp korri/deploy/desktop/waiting-page/waiting.css \
          "$app_bundle/Resources/app/views/mainview/waiting.css"

        if [ ! -f "$app_bundle/Resources/version.json" ]; then
          cat > "$app_bundle/Resources/version.json" <<'EOF'
    {"version":"1.0.0","hash":"dev","channel":"dev","baseUrl":"","name":"Korri","identifier":"dev.korri.desktop"}
    EOF
        fi

        if [ ! -f "$app_bundle/Resources/build.json" ]; then
          cat > "$app_bundle/Resources/build.json" <<'EOF'
    {"defaultRenderer":"native","availableRenderers":["native"],"runtime":{},"bunVersion":"1.3.9"}
    EOF
        fi

        patch_elf_tree out/build/electrobun

        # Postcondition: every file the wrap step depends on — plus the
        # waiting-page assets the catch-all serve references while
        # disconnected — must exist in the bundled output. The electrobun
        # build path has multiple fallback branches; assert here so a
        # regression surfaces at build time, not at first launch.
        for required in \
          "Resources/app/bun/index.js" \
          "Resources/version.json" \
          "Resources/build.json" \
          "Resources/app/views/mainview/preload.js" \
          "Resources/app/views/mainview/waiting.css" \
          "Resources/app/views/mainview/waiting-polling-loop.js"; do
          if [ ! -f "$app_bundle/$required" ]; then
            echo "korri-desktop-unwrapped: missing required artifact $required" >&2
            exit 1
          fi
        done

        runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-desktop"
    cp -R out/build/electrobun/. "$out/share/korri-desktop/"

    launcher="$(find "$out/share/korri-desktop" -path '*/bin/launcher' -type f -perm -0100 | head -n 1)"
    if [ -z "$launcher" ]; then
      echo "Could not find Electrobun launcher in built desktop output" >&2
      find "$out/share/korri-desktop" -maxdepth 4 -type f | sort >&2
      exit 1
    fi
    chmod +x "$launcher"

    runHook postInstall
  '';

  meta = {
    description = "Korri Electrobun desktop bundle (unwrapped: no per-variant RPATH or wrapper)";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
