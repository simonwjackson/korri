{
  lib,
  stdenvNoCC,
  protonCachyosArm64Src ? ./vendor/proton-cachyos-11.0-20260601-slr-arm64,
}:

stdenvNoCC.mkDerivation rec {
  pname = "proton-cachyos-arm64";
  version = "11.0-20260601-slr-arm64";

  src = protonCachyosArm64Src;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out/share/korri/proton-cachyos-arm64/dist"
    cp -a . "$out/share/korri/proton-cachyos-arm64/dist/"

    toolmanifest="$out/share/korri/proton-cachyos-arm64/dist/toolmanifest.vdf"
    if [ -f "$toolmanifest" ]; then
      tmp="$toolmanifest.tmp"
      grep -v '"require_tool_appid"' "$toolmanifest" > "$tmp"
      mv "$tmp" "$toolmanifest"
    fi

    runHook postInstall
  '';

  passthru = {
    toolName = "proton-cachyos-${version}";
    dist = "share/korri/proton-cachyos-arm64/dist";
  };

  meta = {
    description = "Vendored ARM64-native proton-cachyos compatibility tool for Korri Steam";
    license = lib.licenses.unfreeRedistributable;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
  };
}
