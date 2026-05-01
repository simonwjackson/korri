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
              --set-rpath ${runtimeLibraryPath} \
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
      --prefix GIO_EXTRA_MODULES : ${pkgs.glib-networking}/lib/gio/modules

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
