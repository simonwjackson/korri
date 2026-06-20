# korri-web-runtime — packages the validated web-game runtime bin.
#
# Runs an HTML5/canvas web game in Chromium under gamescope: x11/Xwayland
# fullscreen, gamescope `-S fit -F pixel` scaling at the game's native (+gap)
# resolution, scrollbar/overflow handling, and CDP-driven start-gate clearing.
#
# The TypeScript entrypoint is executed by Bun. chromium and gamescope are
# resolved at runtime from KORRI_WEB_RUNTIME_CHROMIUM / KORRI_WEB_RUNTIME_GAMESCOPE
# (wired by the NixOS module / launcher), defaulting to PATH lookups otherwise.
{
  lib,
  stdenvNoCC,
  makeWrapper,
  bun,
  chromium,
  gamescope-korri ? null,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-web-runtime";
  version = "0.1.0";

  src = ../../src;

  nativeBuildInputs = [ makeWrapper ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/share/korri-web-runtime"
    cp -R . "$out/share/korri-web-runtime/src"

    makeWrapper ${lib.getExe bun} "$out/bin/korri-web-runtime" \
      --add-flags "$out/share/korri-web-runtime/src/runtime/korri-web-runtime.ts" \
      --set-default KORRI_WEB_RUNTIME_CHROMIUM ${lib.getExe chromium} \
      ${lib.optionalString (gamescope-korri != null)
        "--set-default KORRI_WEB_RUNTIME_GAMESCOPE ${gamescope-korri}/bin/gamescope"}

    runHook postInstall
  '';

  meta = {
    description = "Run HTML5/canvas web games in Chromium under gamescope";
    mainProgram = "korri-web-runtime";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
