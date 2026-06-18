# Mega Man Arena public Windows release, packaged for Korri.
#
# Upstream publishes a Windows x86_64 GameMaker build behind the Wix download
# page's stable bit.ly link. The zip is treated as an opaque upstream binary
# payload: this package installs it read-only and exposes launchers that copy the
# game into a user-writable runtime directory before launching so settings/saves
# never try to write into the Nix store.
#
# x86_64-linux launches with nixpkgs Wine. aarch64-linux launches the same
# Windows binary with the guest's Steam/FEX/Proton runtime, because Bandai-class
# devices already seed FEX rootfs + Proton under /var/lib/korri/steam.
{
  lib,
  stdenvNoCC,
  fetchurl,
  unzip,
  bash,
  buildFHSEnv,
  coreutils,
  fexRuntime,
  protonRuntime,
  protonGeRuntime,
  wineWow64Packages ? null,
}:

let
  version = "4.20";
  system = stdenvNoCC.hostPlatform.system;
  isAarch64 = system == "aarch64-linux";
  isX86_64 = system == "x86_64-linux";
  wineCommand = if isX86_64 then lib.getExe wineWow64Packages.stable else "wine";
  wineVersion = if isX86_64 then wineWow64Packages.stable.version or "unknown" else "not-used";

  payload = stdenvNoCC.mkDerivation {
    pname = "mega-man-arena-payload";
    inherit version;

    src = fetchurl {
      url = "https://bit.ly/mmav420";
      name = "mega-man-arena-${version}.zip";
      hash = "sha256-S/H6Z60f3O2NPl3G00tb8RFubAuQvfs9tHw4utzTQJE=";
    };

    nativeBuildInputs = [ unzip ];

    dontConfigure = true;
    dontBuild = true;

    unpackPhase = ''
      runHook preUnpack

      mkdir -p source
      unzip -q "$src" -d source

      test -f source/MegaManArena.exe
      test -f source/data.win
      test -d source/Music

      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d "$out/bin" "$out/share/mega-man-arena" "$out/nix-support/mega-man-arena"
      cp -R --no-preserve=mode,ownership source/. "$out/share/mega-man-arena/"
      chmod -R u=rwX,go=rX "$out/share/mega-man-arena"

      install -m755 ${./mega-man-arena} "$out/bin/mega-man-arena-wine"
      substituteInPlace "$out/bin/mega-man-arena-wine" \
        --replace-fail '@bash@' '${bash}' \
        --replace-fail '@appDir@' "$out/share/mega-man-arena" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@version@' '${version}' \
        --replace-fail '@wine@' '${wineCommand}'

      install -m755 ${./mega-man-arena-fex} "$out/bin/mega-man-arena-fex"
      substituteInPlace "$out/bin/mega-man-arena-fex" \
        --replace-fail '@appDir@' "$out/share/mega-man-arena" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@fexRuntimeSetup@' '${fexRuntime}/share/korri/fex-runtime/setup-env' \
        --replace-fail '@protonRuntimeSetup@' '${protonRuntime}/share/korri/proton-runtime/setup-env' \
        --replace-fail '@protonGeRuntimeSetup@' '${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env' \
        --replace-fail '@version@' '${version}'

      ln -s "$out/bin/${if isAarch64 then "mega-man-arena-fex" else "mega-man-arena-wine"}" \
        "$out/bin/mega-man-arena"

      cat > "$out/nix-support/mega-man-arena/manifest.txt" <<EOF
      pname=mega-man-arena
      version=${version}
      upstream-page=https://www.megamanarena.com/download-page
      upstream-download=https://bit.ly/mmav420
      source-sha256=4bf1fa67ad1fdced8d3e5dc6d34b5bf1116e6c0b90bdfb3db47c38badcd34091
      engine=gamemaker-windows
      runner=${if isAarch64 then "fex-proton" else "wine ${wineVersion}"}
      binary=MegaManArena.exe
      license=unlicensed-upstream-binary-export
      EOF

      runHook postInstall
    '';

    passthru = {
      inherit version;
      appDir = "share/mega-man-arena";
      binaryName = "MegaManArena.exe";
      fexRuntime = fexRuntime;
      protonRuntime = protonRuntime;
      protonGeRuntime = protonGeRuntime;
      sourceSha256 = "4bf1fa67ad1fdced8d3e5dc6d34b5bf1116e6c0b90bdfb3db47c38badcd34091";
    };

    meta = {
      description = "Mega Man Arena public Windows release payload";
      homepage = "https://www.megamanarena.com/download-page";
      license = lib.licenses.unfreeRedistributable;
      mainProgram = "mega-man-arena";
      platforms = [
        "aarch64-linux"
        "x86_64-linux"
      ];
    };
  };

  aarch64Fhs = buildFHSEnv {
    name = "mega-man-arena";
    executableName = "mega-man-arena";
    privateTmp = true;
    includeClosures = true;

    targetPkgs =
      p: with p; [
        bash
        coreutils
        dbus
        fex
        file
        findutils
        gnugrep
        gnused
        pciutils
        python3
        util-linux
        xorg.xrandr
      ];

    multiPkgs =
      p: with p; [
        alsa-lib
        at-spi2-core
        cairo
        cups.lib
        dbus.lib
        expat
        fontconfig
        freetype
        fribidi
        gdk-pixbuf
        glib
        glibc
        gtk2
        harfbuzz
        libcap
        libdrm
        libgbm
        libGL
        libpulseaudio
        libudev0-shim
        libva
        libxkbcommon
        libxml2
        nspr
        nss
        openal
        pango
        pipewire
        sdl2-compat
        sqlite
        udev
        vulkan-loader
        wayland
        xorg.libICE
        xorg.libSM
        xorg.libX11
        xorg.libXcomposite
        xorg.libXcursor
        xorg.libXdamage
        xorg.libXext
        xorg.libXfixes
        xorg.libXi
        xorg.libXinerama
        xorg.libXrandr
        xorg.libXrender
        xorg.libXScrnSaver
        xorg.libXtst
        xorg.libxcb
        xorg.libxshmfence
        zlib
      ];

    profile = ''
      unset GIO_EXTRA_MODULES
    '';

    runScript = "${payload}/bin/mega-man-arena-fex";

    passthru = payload.passthru // {
      inherit payload;
      launcher = "fex-proton";
    };

    meta = payload.meta // {
      description = "Mega Man Arena Windows release launched through FEX/Proton for aarch64 Korri devices";
    };
  };
in
if isAarch64 then
  aarch64Fhs
else if isX86_64 then
  payload
else
  throw "mega-man-arena: unsupported system '${system}'"
