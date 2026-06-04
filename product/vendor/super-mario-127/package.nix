# Super Mario 127 (community Godot fan game by Level Share Square),
# exported natively for the Korri target system from upstream sources.
#
# Why this vendor entry exists:
#
# Upstream distributes source plus desktop/web builds for the public
# release, but Korri's primary device target is Linux aarch64. Shipping
# the x86_64 Linux build through emulation would make the same mistake
# the SMBR package avoided: the game is available as Godot source, so
# the honest ARM path is a native Godot export.
#
# This project is Godot 3.6, not Godot 4. The export pipeline therefore
# uses `godot3-headless` and `godot3-export-templates` from the repo's
# main nixpkgs pin. Godot 3 templates live under
# `$XDG_DATA_HOME/godot/templates/<version>.stable/`, not Godot 4's
# `export_templates` directory. The aarch64 template from nixpkgs is
# built for ARM but installed under the generic `linux_x11_64_release`
# name, so this derivation adds the Godot-expected `linux_x11_arm64_*`
# symlink when exporting for aarch64.
#
# `autoPatchelfHook` rewrites ELF interpreter/RPATH for ordinary dynamic
# dependencies. The installed wrapper also exposes the same runtime
# library set through `LD_LIBRARY_PATH` because Godot's Linux X11/OpenGL
# and audio backends discover several libraries with `dlopen`.
#
# What this package does NOT ship:
#
#   - A kiosk launch-module entry. New launch modules belong in their
#     own product opt-in; this package is an additive lane only.
#
#   - A Level Share Square acquisition/downloader integration. Korri
#     direct launch consumes pre-seeded `.127level` files.
#
#   - Linux Discord Game SDK support. Upstream's Discord GDNative addon
#     has no usable Linux aarch64 SDK; Korri patches the unsupported ARM
#     runtime path to no-op and installs a tiny binding stub so Godot can
#     load the optional NativeScript library without failing startup.
{
  lib,
  stdenv,
  autoPatchelfHook,
  makeWrapper,
  # Runtime closure the exported Godot 3 binary needs at exec time or
  # through runtime `dlopen` calls.
  alsa-lib,
  dbus,
  fontconfig,
  freetype,
  libGL,
  libpulseaudio,
  libxkbcommon,
  systemdLibs,
  wayland,
  xorg,
  # Engine + game source pin, wired by the overlay.
  godot3-headless,
  godot3-export-templates,
  sm127-src,
}:

let
  system = stdenv.hostPlatform.system;
  godot = godot3-headless;
  godotExportTemplates = godot3-export-templates;
  godotVersion = godot.version;
  godotTemplatesDir = "${godotVersion}.stable";

  exportPresetByArch = {
    aarch64-linux = {
      preset = "Linux ARM64";
      binaryName = "Super_Mario_127.arm64";
    };
    x86_64-linux = {
      preset = "Linux/X11";
      binaryName = "Super_Mario_127.x86_64";
    };
  };
  archEntry =
    exportPresetByArch.${system}
      or (throw "super-mario-127: no Godot export preset wired for system '${system}'");

  runtimeLibs = [
    alsa-lib
    dbus.lib
    fontconfig.lib
    freetype
    libGL
    libpulseaudio
    libxkbcommon
    stdenv.cc.cc.lib
    systemdLibs
    wayland
    xorg.libX11
    xorg.libXcursor
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXinerama
    xorg.libXrandr
    xorg.libXrender
  ];

  version =
    if sm127-src ? shortRev then sm127-src.shortRev else sm127-src.lastModifiedDate or "unknown";
in

stdenv.mkDerivation {
  pname = "super-mario-127";
  inherit version;

  src = sm127-src;

  nativeBuildInputs = [
    autoPatchelfHook
    godot
    makeWrapper
  ];

  buildInputs = runtimeLibs;

  strictDeps = true;

  unpackPhase = ''
    runHook preUnpack
    mkdir -p project
    cp -R --no-preserve=mode,ownership "$src/." project/
    runHook postUnpack
  '';

  patchPhase = ''
    runHook prePatch
    cd project
    patch -p1 < ${./patches/0001-add-linux-arm64-export-preset.patch}
    patch -p1 < ${./patches/0002-disable-unavailable-discord-native-runtime.patch}
    patch -p1 < ${./patches/0003-add-level-launch-flag.patch}
    cd ..
    runHook postPatch
  '';

  configurePhase = ''
    runHook preConfigure

    export HOME=$PWD/godot-home
    export XDG_DATA_HOME=$HOME/.local/share
    mkdir -p "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}"
    for template in "${godotExportTemplates}/share/godot/templates/${godotTemplatesDir}"/*; do
      ln -s "$template" "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}/$(basename "$template")"
    done

    ${lib.optionalString (system == "aarch64-linux") ''
      ln -sf linux_x11_64_release \
        "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}/linux_x11_arm64_release"
      if [ -e "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}/linux_x11_64_debug" ]; then
        ln -sf linux_x11_64_debug \
          "$XDG_DATA_HOME/godot/templates/${godotTemplatesDir}/linux_x11_arm64_debug"
      fi
    ''}

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    mkdir -p build
    cd project
    godot3-headless --path "$PWD" --export "${archEntry.preset}" "$PWD/../build/${archEntry.binaryName}"
    cd ..

    test -f "build/${archEntry.binaryName}"
    test -f build/Super_Mario_127.pck

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -d "$out/bin" "$out/share/super-mario-127" "$out/nix-support/super-mario-127"
    cp -R build/. "$out/share/super-mario-127/"
    chmod +x "$out/share/super-mario-127/${archEntry.binaryName}"

    ${lib.optionalString (system == "aarch64-linux") ''
      # Upstream's Discord SDK libraries are x86_64-only. Keep Godot's
      # optional NativeScript load path satisfied with a local no-op ARM
      # binding stub, and drop the unusable x86_64 Discord SDK payload.
      rm -f "$out/share/super-mario-127"/libdiscord*.so
      cat > discord-gdnative-stub.c <<'EOF'
      void godot_gdnative_init(void *options) { (void)options; }
      void godot_gdnative_terminate(void *options) { (void)options; }
      void godot_nativescript_init(void *handle) { (void)handle; }
      EOF
      $CC -shared -fPIC discord-gdnative-stub.c \
        -o "$out/share/super-mario-127/libdiscord-game-sdk-godot.so"
    ''}

    makeWrapper "$out/share/super-mario-127/${archEntry.binaryName}" "$out/bin/super-mario-127" \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibs}

    cat > "$out/nix-support/super-mario-127/manifest.txt" <<EOF
    pname=super-mario-127
    version=${version}
    upstream-repo=github.com/Level-Share-Square/SuperMario127
    upstream-rev=${sm127-src.rev or "unknown"}
    engine=godot3 ${godotVersion}
    export-preset=${archEntry.preset}
    binary=${archEntry.binaryName}
    license=unlicensed-upstream-source
    EOF

    runHook postInstall
  '';

  dontStrip = true;

  passthru = {
    exportPreset = archEntry.preset;
    binaryName = archEntry.binaryName;
    inherit godotVersion;
  };

  meta = {
    description = "Super Mario 127 exported natively for Korri Linux targets";
    homepage = "https://github.com/Level-Share-Square/SuperMario127";
    license = lib.licenses.unfreeRedistributable;
    mainProgram = "super-mario-127";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
