{ pkgs }:

pkgs.stdenv.mkDerivation {
  pname = "korri-overlay-renderer";
  version = "1.0.0";

  src = ./.;

  nativeBuildInputs = [
    pkgs.pkg-config
    pkgs.wayland-scanner
  ];

  buildInputs = [
    pkgs.wayland
    pkgs.cairo
  ];

  buildPhase = ''
    runHook preBuild

    wlr=${pkgs.wlr-protocols}/share/wlr-protocols/unstable/wlr-layer-shell-unstable-v1.xml
    xdg=${pkgs.wayland-protocols}/share/wayland-protocols/stable/xdg-shell/xdg-shell.xml

    # The layer-shell protocol references xdg_popup_interface (get_popup), so the
    # xdg-shell protocol code must be generated and linked too.
    wayland-scanner client-header "$xdg" xdg-shell-client-protocol.h
    wayland-scanner private-code   "$xdg" xdg-shell-protocol.c
    wayland-scanner client-header "$wlr" wlr-layer-shell-unstable-v1-client-protocol.h
    wayland-scanner private-code   "$wlr" wlr-layer-shell-unstable-v1-protocol.c

    cc -O2 -Wall renderer.c \
      wlr-layer-shell-unstable-v1-protocol.c xdg-shell-protocol.c \
      -o korri-overlay-renderer \
      $(pkg-config --cflags --libs wayland-client cairo)

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm755 korri-overlay-renderer "$out/bin/korri-overlay-renderer"
    runHook postInstall
  '';

  meta = {
    description = "Korri featherweight Wayland layer-shell overlay renderer";
    platforms = pkgs.lib.platforms.linux;
  };
}
