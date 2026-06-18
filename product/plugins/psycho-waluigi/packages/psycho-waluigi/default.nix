# Psycho Waluigi public Windows release, packaged for Korri.
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
  version = "2011-10-31";
  system = stdenvNoCC.hostPlatform.system;
  isAarch64 = system == "aarch64-linux";
  isX86_64 = system == "x86_64-linux";
  wineCommand = if isX86_64 then lib.getExe wineWow64Packages.stable else "wine";
  wineVersion = if isX86_64 then wineWow64Packages.stable.version or "unknown" else "not-used";

  payload = stdenvNoCC.mkDerivation {
    pname = "psycho-waluigi-payload";
    inherit version;

    src = fetchurl {
      url = "https://mfgg.net/index.php?act=resdb&param=03&c=2&id=25698";
      name = "psycho-waluigi-${version}.zip";
      hash = "sha256-TVyOAuYvALt6AYZkQAQlqvmhEFYLYmw2bNG9gXzKwXc=";
    };

    nativeBuildInputs = [ unzip ];

    dontConfigure = true;
    dontBuild = true;

    unpackPhase = ''
      runHook preUnpack

      mkdir -p source
      unzip -q "$src" -d source

      test -f source/psychowaluigi.exe
      test -f source/psychowaluigi.txt

      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d "$out/bin" "$out/share/psycho-waluigi" "$out/nix-support/psycho-waluigi"
      cp -R --no-preserve=mode,ownership source/. "$out/share/psycho-waluigi/"
      chmod -R u=rwX,go=rX "$out/share/psycho-waluigi"

      install -m755 ${./psycho-waluigi} "$out/bin/psycho-waluigi-wine"
      substituteInPlace "$out/bin/psycho-waluigi-wine" \
        --replace-fail '@bash@' '${bash}' \
        --replace-fail '@appDir@' "$out/share/psycho-waluigi" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@version@' '${version}' \
        --replace-fail '@wine@' '${wineCommand}'

      install -m755 ${./psycho-waluigi-fex} "$out/bin/psycho-waluigi-fex"
      substituteInPlace "$out/bin/psycho-waluigi-fex" \
        --replace-fail '@appDir@' "$out/share/psycho-waluigi" \
        --replace-fail '@coreutils@' '${coreutils}/bin' \
        --replace-fail '@fexRuntimeSetup@' '${fexRuntime}/share/korri/fex-runtime/setup-env' \
        --replace-fail '@protonRuntimeSetup@' '${protonRuntime}/share/korri/proton-runtime/setup-env' \
        --replace-fail '@protonGeRuntimeSetup@' '${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env' \
        --replace-fail '@version@' '${version}'

      ln -s "$out/bin/${if isAarch64 then "psycho-waluigi-fex" else "psycho-waluigi-wine"}" \
        "$out/bin/psycho-waluigi"

      cat > "$out/nix-support/psycho-waluigi/manifest.txt" <<MANIFEST
      pname=psycho-waluigi
      version=${version}
      upstream-page=https://mfgg.net/index.php?act=resdb&param=02&c=2&id=25698
      upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=25698
      source-sha256=4d5c8e02e62f00bb7a018664400425aaf9a110560b626c366cd1bd817ccac177
      engine=multimedia-fusion-2-windows
      runner=${if isAarch64 then "fex-proton-ge" else "wine ${wineVersion}"}
      binary=psychowaluigi.exe
      license=mfgg-fangame-binary-export
      MANIFEST

      runHook postInstall
    '';

    passthru = {
      inherit version;
      appDir = "share/psycho-waluigi";
      binaryName = "psychowaluigi.exe";
      fexRuntime = fexRuntime;
      protonRuntime = protonRuntime;
      protonGeRuntime = protonGeRuntime;
      sourceSha256 = "4d5c8e02e62f00bb7a018664400425aaf9a110560b626c366cd1bd817ccac177";
    };

    meta = {
      description = "Psycho Waluigi public Windows release payload";
      homepage = "https://mfgg.net/index.php?act=resdb&param=02&c=2&id=25698";
      license = lib.licenses.unfreeRedistributable;
      mainProgram = "psycho-waluigi";
      platforms = [
        "aarch64-linux"
        "x86_64-linux"
      ];
    };
  };

  aarch64Fhs = buildFHSEnv {
    name = "psycho-waluigi";
    executableName = "psycho-waluigi";
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

    runScript = "${payload}/bin/psycho-waluigi-fex";

    passthru = payload.passthru // {
      inherit payload;
      launcher = "fex-proton-ge";
    };

    meta = payload.meta // {
      description = "Psycho Waluigi Windows release launched through FEX/Proton for aarch64 Korri devices";
    };
  };
in
if isAarch64 then
  aarch64Fhs
else if isX86_64 then
  payload
else
  throw "psycho-waluigi: unsupported system '${system}'"
