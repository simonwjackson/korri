{
  lib,
  stdenvNoCC,
  fetchurl,
  protonCachyosX86Src ? fetchurl {
    url = "https://github.com/CachyOS/proton-cachyos/releases/download/cachyos-11.0-20260601-slr/proton-cachyos-11.0-20260601-slr-x86_64.tar.xz";
    hash = "sha256-N2bcB4voaFNlRpAyQ6NvDCw/tSwfC5tHXuIPV0+puZs=";
  },
}:

stdenvNoCC.mkDerivation rec {
  pname = "proton-cachyos-x86_64";
  version = "11.0-20260601-slr-x86_64";

  src = protonCachyosX86Src;

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out/share/korri/proton-cachyos-x86_64/dist"
    cp -a . "$out/share/korri/proton-cachyos-x86_64/dist/"

    toolmanifest="$out/share/korri/proton-cachyos-x86_64/dist/toolmanifest.vdf"
    if [ -f "$toolmanifest" ]; then
      tmp="$toolmanifest.tmp"
      grep -v 'require_tool_appid' "$toolmanifest" > "$tmp"
      mv "$tmp" "$toolmanifest"
    fi

    # Upstream carries a few gamefix symlinks to fixes that are absent from
    # this release archive. Nix's fixup rejects dangling links, and Steam does
    # not require these absent per-game fixes for tool discovery.
    find "$out/share/korri/proton-cachyos-x86_64" -xtype l -delete

    runHook postInstall
  '';

  passthru = {
    toolName = "proton-cachyos-${version}";
    dist = "share/korri/proton-cachyos-x86_64/dist";
  };

  meta = {
    description = "Vendored x86_64 proton-cachyos compatibility tool for Korri Steam";
    license = lib.licenses.unfreeRedistributable;
    platforms = [ "x86_64-linux" ];
  };
}
