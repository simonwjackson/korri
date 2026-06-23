# korri-web-canvas — single-canvas web games fullscreen (composes korri-webpage).
{
  lib,
  stdenvNoCC,
  makeWrapper,
  bun,
  chromium,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-web-canvas";
  version = "0.1.0";

  # Bundles both web-canvas and the webpage core it imports.
  srcs = [
    ../../src
    ../../../webpage/src
  ];

  nativeBuildInputs = [ makeWrapper ];
  dontConfigure = true;
  dontBuild = true;

  unpackPhase = ''
    runHook preUnpack
    mkdir -p plugins/web-canvas plugins/webpage
    cp -R ${../../src}/. plugins/web-canvas/src
    cp -R ${../../../webpage/src}/. plugins/webpage/src
    runHook postUnpack
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/share/korri-web-canvas"
    cp -R plugins "$out/share/korri-web-canvas/plugins"
    makeWrapper ${lib.getExe bun} "$out/bin/korri-web-canvas" \
      --add-flags "$out/share/korri-web-canvas/plugins/web-canvas/src/runtime/korri-web-canvas.ts" \
      --add-flags "--chromium=${lib.getExe chromium}" \
      --set-default KORRI_WEBPAGE_CHROMIUM ${lib.getExe chromium}
    runHook postInstall
  '';

  meta = {
    description = "Run single-canvas HTML5 games fullscreen in Chromium";
    mainProgram = "korri-web-canvas";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
