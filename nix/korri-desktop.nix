{
  pkgs,
  lib,
  src,
  system,
  bunDeps,
  electrobunBinaries,
  portal,
  runtimeLibraries,
  desktopDataDirs ? [
    pkgs.gsettings-desktop-schemas
    pkgs.gtk3
  ],
  gioExtraModules ? pkgs.glib-networking,
  # "host" emits `bin/korri-desktop` with `GDK_BACKEND=x11` defaults;
  # "device" emits `bin/korri-desktop-device` with `KORRI_DESKTOP_PROFILE=device`
  # and the XDG-home defaulting block for kiosk environments.
  profile ? "host",
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
      or (throw "korri-desktop is only supported on x86_64-linux and aarch64-linux");

  isDevice = profile == "device";
  binName = if isDevice then "korri-desktop-device" else "korri-desktop";
  gdkBackend = if isDevice then "" else "x11";
  desktopProfileEnv = if isDevice then "device" else "";

  runtimeLibraryPath = lib.makeLibraryPath runtimeLibraries;
  desktopDataPath = lib.makeSearchPath "share" desktopDataDirs;
  gioExtraModulesPath = "${gioExtraModules}/lib/gio/modules";
in
pkgs.stdenv.mkDerivation {
  pname = "korri-desktop";
  version = "1.0.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_20
    pkgs.patchelf
    pkgs.file
    pkgs.makeWrapper
  ];

  buildInputs = runtimeLibraries;

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

        rm -rf node_modules out
        mkdir -p node_modules
        cp -R ${bunDeps}/. node_modules/
        chmod -R u+w node_modules

        # @proseql/core@0.11.0 ships default imports for a few CommonJS
        # serializer dependencies. Bun can run them directly, but Bun's bundler
        # rejects the default export while building the Electrobun native bundle.
        # Patch the installed build output until the upstream package publishes
        # namespace imports.
        for codec in hjson json5 jsonc; do
          file="node_modules/@proseql/core/dist/serializers/codecs/$codec.js"
          if [ -f "$file" ]; then
            sed -i 's/^import pkg from /import * as pkg from /' "$file"
          fi
        done

        mkdir -p node_modules/electrobun/bin
        cp ${electrobunBinaries.cli}/electrobun node_modules/electrobun/bin/electrobun
        chmod +x node_modules/electrobun/bin/electrobun

        mkdir -p node_modules/electrobun/dist-${platform.os}-${platform.arch}
        cp -R ${electrobunBinaries.core}/. node_modules/electrobun/dist-${platform.os}-${platform.arch}/
        chmod -R u+w node_modules/electrobun/dist-${platform.os}-${platform.arch}

        mkdir -p out/build/portal
        cp -R ${portal}/. out/build/portal/

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
                  --set-rpath "\$ORIGIN:${runtimeLibraryPath}" \
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

        # Compile the renderer-side preload that installs the
        # connection-state bridge. `main.ts` pushes connection-state
        # transitions via `window.__electrobun.receiveMessageFromBun`; the
        # preload overrides the default stub to fan out validated state to
        # `useConnectionState` subscribers. Without this file the React
        # shell falls back to a 'connected' stub and the ConnectionGate
        # opens before the desktop has actually connected to a server.
        mkdir -p "$app_bundle/Resources/app/views/mainview"
        bun build korri/deploy/desktop/preload-entry.ts \
          --target=browser \
          --outfile="$app_bundle/Resources/app/views/mainview/preload.js"

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

        runHook postBuild
  '';

  installPhase = ''
        runHook preInstall

        mkdir -p "$out/share/korri-desktop" "$out/bin"
        cp -R out/build/electrobun/. "$out/share/korri-desktop/"

        launcher="$(find "$out/share/korri-desktop" -path '*/bin/launcher' -type f -perm -0100 | head -n 1)"
        if [ -z "$launcher" ]; then
          echo "Could not find Electrobun launcher in built desktop output" >&2
          find "$out/share/korri-desktop" -maxdepth 4 -type f | sort >&2
          exit 1
        fi
        chmod +x "$launcher"

        # libNativeWrapper.so's RPATH already points at the closure's WebKitGTK
        # + GTK chain via patch_elf_tree above, so the wrapper does NOT export
        # LD_LIBRARY_PATH. The two env vars that still need to be set are
        # *runtime-discovery* paths the dynamic linker does not honor:
        # GLib reads XDG_DATA_DIRS to find compiled .gschema schemas, and
        # GIO reads GIO_EXTRA_MODULES to find the TLS/HTTP module set
        # (glib-networking). RPATH alone cannot replace these.
        cat > "$out/bin/${binName}" <<EOF
    #!${pkgs.bash}/bin/bash
    export XDG_DATA_DIRS="${desktopDataPath}\''${XDG_DATA_DIRS:+:\$XDG_DATA_DIRS}"
    export GIO_EXTRA_MODULES="${gioExtraModulesPath}\''${GIO_EXTRA_MODULES:+:\$GIO_EXTRA_MODULES}"
    ${lib.optionalString (gdkBackend != "") ''
    export GDK_BACKEND="\''${GDK_BACKEND:-${gdkBackend}}"
    ''}
    ${lib.optionalString (desktopProfileEnv != "") ''
    export KORRI_DESKTOP_PROFILE="${desktopProfileEnv}"
    # Inputd lives behind a local-loopback WebSocket; the desktop preload
    # surfaces it via window.__korriRuntime and the portal switches the
    # spatial-nav controller backend at runtime. (Previously baked into
    # the portal bundle as VITE_KORRI_NATIVE_BRIDGE_URL.)
    export KORRI_NATIVE_BRIDGE_URL="\''${KORRI_NATIVE_BRIDGE_URL:-ws://127.0.0.1:3002}"
    if [ -z "\''${HOME:-}" ] && { [ -z "\''${XDG_DATA_HOME:-}" ] || [ -z "\''${XDG_CONFIG_HOME:-}" ] || [ -z "\''${XDG_CACHE_HOME:-}" ]; }; then
      echo "korri-desktop: HOME is required when XDG home directories are not set" >&2
      exit 126
    fi
    export XDG_DATA_HOME="\''${XDG_DATA_HOME:-\$HOME/.local/share}"
    export XDG_CONFIG_HOME="\''${XDG_CONFIG_HOME:-\$HOME/.config}"
    export XDG_CACHE_HOME="\''${XDG_CACHE_HOME:-\$HOME/.cache}"
    export KORRI_DEVICE_STATE_ROOT="\''${KORRI_DEVICE_STATE_ROOT:-\$XDG_DATA_HOME/korri}"
    export KORRI_LIBRARY_ROOT="\''${KORRI_LIBRARY_ROOT:-\$XDG_DATA_HOME/korri/library}"
    export CHROME_CONFIG_HOME="\''${CHROME_CONFIG_HOME:-\$XDG_CONFIG_HOME}"
    ''}
    exec "$launcher" "\$@"
    EOF
        chmod +x "$out/bin/${binName}"

        runHook postInstall
  '';

  meta = {
    description = "Korri Electrobun desktop app";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
}
