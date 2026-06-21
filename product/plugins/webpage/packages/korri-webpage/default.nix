# korri-webpage — renders a web page fullscreen in kiosk Chromium (Bun + CDP).
{
  lib,
  stdenvNoCC,
  makeWrapper,
  bun,
  chromium,
}:

stdenvNoCC.mkDerivation {
  pname = "korri-webpage";
  version = "0.1.0";

  src = ../../src;

  nativeBuildInputs = [ makeWrapper ];
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/share/korri-webpage"
    cp -R . "$out/share/korri-webpage/src"
    makeWrapper ${lib.getExe bun} "$out/bin/korri-webpage" \
      --add-flags "$out/share/korri-webpage/src/runtime/korri-webpage.ts" \
      --set-default KORRI_WEBPAGE_CHROMIUM ${lib.getExe chromium}
    runHook postInstall
  '';

  meta = {
    description = "Render a web page fullscreen in kiosk Chromium";
    mainProgram = "korri-webpage";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
