# Super Mario Bros. & The Midas Machine final demo, packaged for Korri.
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
  version = "final-demo";
  system = stdenvNoCC.hostPlatform.system;
  isAarch64 = system == "aarch64-linux";
  isX86_64 = system == "x86_64-linux";
  wineCommand = if isX86_64 then lib.getExe wineWow64Packages.stable else "wine";
  wineVersion = if isX86_64 then wineWow64Packages.stable.version or "unknown" else "not-used";

  payload = stdenvNoCC.mkDerivation {
    pname = "midas-machine-payload";
    inherit version;

    src = fetchurl {
      url = "https://mfgg.net/index.php?act=resdb&param=03&c=2&id=30096";
      name = "midas-machine-${version}.zip";
      hash = "sha256-6lxsLeZ+BBifYIJNkpouXzPlAnxmyp8qKTTouotI4Bo=";
    };

    nativeBuildInputs = [ unzip ];

    dontConfigure = true;
    dontBuild = true;

    unpackPhase = ''
      runHook preUnpack

      mkdir -p source-root source
      unzip -q "$src" -d source-root
      cp -R --no-preserve=mode,ownership source-root/midas_demo/. source/

      test -f source/midas_demo.exe
      test -f source/midasReadMe.txt
      test -f source/bass.dll
      test -d source/levels
      test -d source/music

      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d "$out/bin" "$out/share/midas-machine" "$out/nix-support/midas-machine"
      cp -R --no-preserve=mode,ownership source/. "$out/share/midas-machine/"
      chmod -R u=rwX,go=rX "$out/share/midas-machine"

      install -m755 ${./midas-machine} "$out/bin/midas-machine-wine"
      substituteInPlace "$out/bin/midas-machine-wine" \
        --replace-fail '@bash@' '${bash}' \
        --replace-fail '@appDir@' "$out/share/midas-machine" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@version@' '${version}' \
        --replace-fail '@wine@' '${wineCommand}'

      install -m755 ${./midas-machine-fex} "$out/bin/midas-machine-fex"
      substituteInPlace "$out/bin/midas-machine-fex" \
        --replace-fail '@appDir@' "$out/share/midas-machine" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@fexRuntimeSetup@' '${fexRuntime}/share/korri/fex-runtime/setup-env' \
        --replace-fail '@protonRuntimeSetup@' '${protonRuntime}/share/korri/proton-runtime/setup-env' \
        --replace-fail '@protonGeRuntimeSetup@' '${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env' \
        --replace-fail '@version@' '${version}'

      ln -s "$out/bin/${if isAarch64 then "midas-machine-fex" else "midas-machine-wine"}" \
        "$out/bin/midas-machine"

      cat > "$out/nix-support/midas-machine/manifest.txt" <<MANIFEST
      pname=midas-machine
      version=${version}
      upstream-page=https://mfgg.net/index.php?act=resdb&param=02&c=2&id=30096
      upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=30096
      source-sha256=ea5c6c2de67e04189f60824d929a2e5f33e5027c66ca9f2a2934e8ba8b48e01a
      engine=multimedia-fusion-2-windows
      runner=${if isAarch64 then "fex-proton-ge" else "wine ${wineVersion}"}
      binary=midas_demo.exe
      license=mfgg-fangame-binary-export
      MANIFEST

      runHook postInstall
    '';

    passthru = {
      inherit version;
      appDir = "share/midas-machine";
      binaryName = "midas_demo.exe";
      fexRuntime = fexRuntime;
      protonRuntime = protonRuntime;
      protonGeRuntime = protonGeRuntime;
      sourceSha256 = "ea5c6c2de67e04189f60824d929a2e5f33e5027c66ca9f2a2934e8ba8b48e01a";
    };

    meta = {
      description = "Super Mario Bros. & The Midas Machine final demo Windows payload";
      homepage = "https://mfgg.net/index.php?act=resdb&param=02&c=2&id=30096";
      license = lib.licenses.unfreeRedistributable;
      mainProgram = "midas-machine";
      platforms = [
        "aarch64-linux"
        "x86_64-linux"
      ];
    };
  };

  aarch64Fhs = buildFHSEnv {
    name = "midas-machine";
    executableName = "midas-machine";
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

    runScript = "${payload}/bin/midas-machine-fex";

    passthru = payload.passthru // {
      inherit payload;
      launcher = "fex-proton-ge";
    };

    meta = payload.meta // {
      description = "Super Mario Bros. & The Midas Machine final demo launched through FEX/Proton for aarch64 Korri devices";
    };
  };
in
if isAarch64 then
  aarch64Fhs
else if isX86_64 then
  payload
else
  throw "midas-machine: unsupported system '${system}'"
