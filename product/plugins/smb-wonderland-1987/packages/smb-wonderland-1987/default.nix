# Super Mario Bros. Wonderland 1987 Rev 6, packaged for Korri.
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
  version = "rev6-2024-11-12";
  system = stdenvNoCC.hostPlatform.system;
  isAarch64 = system == "aarch64-linux";
  isX86_64 = system == "x86_64-linux";
  wineCommand = if isX86_64 then lib.getExe wineWow64Packages.stable else "wine";
  wineVersion = if isX86_64 then wineWow64Packages.stable.version or "unknown" else "not-used";

  payload = stdenvNoCC.mkDerivation {
    pname = "smb-wonderland-1987-payload";
    inherit version;

    src = fetchurl {
      url = "https://mfgg.net/index.php?act=resdb&param=03&c=2&id=40985";
      name = "smb-wonderland-1987-${version}.zip";
      hash = "sha256-re3VV3XiWP3uXSEGGDSCV/blblc+0pz9cGfsx6clw5k=";
    };

    nativeBuildInputs = [ unzip ];

    dontConfigure = true;
    dontBuild = true;

    unpackPhase = ''
      runHook preUnpack

      mkdir -p source
      unzip -q "$src" -d source

      test -f "source/SMBWonderland87 (rev6).exe"
      test -f source/artwork.png

      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d "$out/bin" "$out/share/smb-wonderland-1987" "$out/nix-support/smb-wonderland-1987"
      cp -R --no-preserve=mode,ownership source/. "$out/share/smb-wonderland-1987/"
      chmod -R u=rwX,go=rX "$out/share/smb-wonderland-1987"

      install -m755 ${./smb-wonderland-1987} "$out/bin/smb-wonderland-1987-wine"
      substituteInPlace "$out/bin/smb-wonderland-1987-wine" \
        --replace-fail '@bash@' '${bash}' \
        --replace-fail '@appDir@' "$out/share/smb-wonderland-1987" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@version@' '${version}' \
        --replace-fail '@wine@' '${wineCommand}'

      install -m755 ${./smb-wonderland-1987-fex} "$out/bin/smb-wonderland-1987-fex"
      substituteInPlace "$out/bin/smb-wonderland-1987-fex" \
        --replace-fail '@appDir@' "$out/share/smb-wonderland-1987" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@fexRuntimeSetup@' '${fexRuntime}/share/korri/fex-runtime/setup-env' \
        --replace-fail '@protonRuntimeSetup@' '${protonRuntime}/share/korri/proton-runtime/setup-env' \
        --replace-fail '@protonGeRuntimeSetup@' '${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env' \
        --replace-fail '@version@' '${version}'

      ln -s "$out/bin/${if isAarch64 then "smb-wonderland-1987-fex" else "smb-wonderland-1987-wine"}" \
        "$out/bin/smb-wonderland-1987"

      cat > "$out/nix-support/smb-wonderland-1987/manifest.txt" <<MANIFEST
      pname=smb-wonderland-1987
      version=${version}
      upstream-page=https://mfgg.net/index.php?act=resdb&param=02&c=2&id=40985
      upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=40985
      source-sha256=adedd55775e258fdee5d210618348257f6e56e573ed29cfd7067ecc7a725c399
      engine=hello-engine-windows
      runner=${if isAarch64 then "fex-proton-ge" else "wine ${wineVersion}"}
      binary=SMBWonderland87 (rev6).exe
      license=mfgg-fangame-binary-export
      MANIFEST

      runHook postInstall
    '';

    passthru = {
      inherit version;
      appDir = "share/smb-wonderland-1987";
      binaryName = "SMBWonderland87 (rev6).exe";
      fexRuntime = fexRuntime;
      protonRuntime = protonRuntime;
      protonGeRuntime = protonGeRuntime;
      sourceSha256 = "adedd55775e258fdee5d210618348257f6e56e573ed29cfd7067ecc7a725c399";
    };

    meta = {
      description = "Super Mario Bros. Wonderland 1987 Rev 6 Windows payload";
      homepage = "https://mfgg.net/index.php?act=resdb&param=02&c=2&id=40985";
      license = lib.licenses.unfreeRedistributable;
      mainProgram = "smb-wonderland-1987";
      platforms = [
        "aarch64-linux"
        "x86_64-linux"
      ];
    };
  };

  aarch64Fhs = buildFHSEnv {
    name = "smb-wonderland-1987";
    executableName = "smb-wonderland-1987";
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

    runScript = "${payload}/bin/smb-wonderland-1987-fex";

    passthru = payload.passthru // {
      inherit payload;
      launcher = "fex-proton-ge";
    };

    meta = payload.meta // {
      description = "Super Mario Bros. Wonderland 1987 launched through FEX/Proton for aarch64 Korri devices";
    };
  };
in
if isAarch64 then
  aarch64Fhs
else if isX86_64 then
  payload
else
  throw "smb-wonderland-1987: unsupported system '${system}'"
