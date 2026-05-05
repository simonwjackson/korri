{
  pkgs,
  lib,
  src,
  system,
  bunDeps,
  electrobunBinaries,
  portal,
  runtimeLibraries,
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
  runtimeLibraryPath = lib.makeLibraryPath runtimeLibraries;
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
        cp -R ${bunDeps} node_modules
        chmod -R u+w node_modules

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

    makeWrapper "$launcher" "$out/bin/korri-desktop" \
      --prefix LD_LIBRARY_PATH : ${runtimeLibraryPath} \
      --prefix XDG_DATA_DIRS : ${pkgs.gsettings-desktop-schemas}/share:${pkgs.gtk3}/share \
      --prefix GIO_EXTRA_MODULES : ${pkgs.glib-networking}/lib/gio/modules \
      --set-default GDK_BACKEND x11 \
      --set-default GSK_RENDERER cairo \
      --set-default WEBKIT_DISABLE_DMABUF_RENDERER 1 \
      --set-default WEBKIT_DISABLE_COMPOSITING_MODE 1

    makeWrapper "$launcher" "$out/bin/korri-desktop-odin" \
      --prefix LD_LIBRARY_PATH : ${runtimeLibraryPath} \
      --prefix XDG_DATA_DIRS : ${pkgs.gsettings-desktop-schemas}/share:${pkgs.gtk3}/share \
      --prefix GIO_EXTRA_MODULES : ${pkgs.glib-networking}/lib/gio/modules \
      --set-default GDK_BACKEND wayland \
      --set-default KORRI_DESKTOP_PROFILE odin

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
