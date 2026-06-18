# Mega Man Maker public Windows release, packaged for Korri.
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
  version = "1.10.4.2";
  system = stdenvNoCC.hostPlatform.system;
  isAarch64 = system == "aarch64-linux";
  isX86_64 = system == "x86_64-linux";
  wineCommand = if isX86_64 then lib.getExe wineWow64Packages.stable else "wine";
  wineVersion = if isX86_64 then wineWow64Packages.stable.version or "unknown" else "not-used";

  payload = stdenvNoCC.mkDerivation {
    pname = "mega-man-maker-payload";
    inherit version;

    src = fetchurl {
      url = "https://megamanmaker.com/downloads/MegaMaker_v1_10_4_2.zip";
      name = "mega-man-maker-${version}.zip";
      hash = "sha256-PSFFE2u4KLhviPDvvW1xnRzeocPCPWx1P1Qy0zxv5q8=";
    };

    nativeBuildInputs = [ unzip ];

    dontConfigure = true;
    dontBuild = true;

    unpackPhase = ''
      runHook preUnpack

      mkdir -p source
      unzip -q "$src" -d source

      test -f source/MegaMaker.exe
      test -f source/data.win
      test -f source/options.ini
      test -f source/gme.dll
      test -d source/DLL
      test -d source/ExampleLevels

      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d "$out/bin" "$out/share/mega-man-maker" "$out/nix-support/mega-man-maker"
      cp -R --no-preserve=mode,ownership source/. "$out/share/mega-man-maker/"
      chmod -R u=rwX,go=rX "$out/share/mega-man-maker"

      install -m755 ${./mega-man-maker} "$out/bin/mega-man-maker-wine"
      substituteInPlace "$out/bin/mega-man-maker-wine" \
        --replace-fail '@bash@' '${bash}' \
        --replace-fail '@appDir@' "$out/share/mega-man-maker" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@version@' '${version}' \
        --replace-fail '@wine@' '${wineCommand}'

      install -m755 ${./mega-man-maker-fex} "$out/bin/mega-man-maker-fex"
      substituteInPlace "$out/bin/mega-man-maker-fex" \
        --replace-fail '@appDir@' "$out/share/mega-man-maker" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@fexRuntimeSetup@' '${fexRuntime}/share/korri/fex-runtime/setup-env' \
        --replace-fail '@protonRuntimeSetup@' '${protonRuntime}/share/korri/proton-runtime/setup-env' \
        --replace-fail '@protonGeRuntimeSetup@' '${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env' \
        --replace-fail '@version@' '${version}'

      ln -s "$out/bin/${if isAarch64 then "mega-man-maker-fex" else "mega-man-maker-wine"}" \
        "$out/bin/mega-man-maker"

      cat > "$out/nix-support/mega-man-maker/manifest.txt" <<MANIFEST
      pname=mega-man-maker
      version=${version}
      upstream-page=https://megamanmaker.com/
      upstream-download=https://megamanmaker.com/downloads/MegaMaker_v1_10_4_2.zip
      source-sha256=3d2145136bb828b86f88f0efbd6d719d1cdea1c3c23d6c753f5432d33c6fe6af
      engine=gamemaker-windows
      runner=${if isAarch64 then "fex-proton" else "wine ${wineVersion}"}
      binary=MegaMaker.exe
      license=unlicensed-upstream-binary-export
      MANIFEST

      runHook postInstall
    '';

    passthru = {
      inherit version;
      appDir = "share/mega-man-maker";
      binaryName = "MegaMaker.exe";
      fexRuntime = fexRuntime;
      protonRuntime = protonRuntime;
      protonGeRuntime = protonGeRuntime;
      sourceSha256 = "3d2145136bb828b86f88f0efbd6d719d1cdea1c3c23d6c753f5432d33c6fe6af";
    };

    meta = {
      description = "Mega Man Maker public Windows release payload";
      homepage = "https://megamanmaker.com/";
      license = lib.licenses.unfreeRedistributable;
      mainProgram = "mega-man-maker";
      platforms = [
        "aarch64-linux"
        "x86_64-linux"
      ];
    };
  };

  aarch64Fhs = buildFHSEnv {
    name = "mega-man-maker";
    executableName = "mega-man-maker";
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

    runScript = "${payload}/bin/mega-man-maker-fex";

    passthru = payload.passthru // {
      inherit payload;
      launcher = "fex-proton";
    };

    meta = payload.meta // {
      description = "Mega Man Maker Windows release launched through FEX/Proton for aarch64 Korri devices";
    };
  };
in
if isAarch64 then
  aarch64Fhs
else if isX86_64 then
  payload
else
  throw "mega-man-maker: unsupported system '${system}'"
