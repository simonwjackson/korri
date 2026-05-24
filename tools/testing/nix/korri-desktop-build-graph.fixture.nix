{
  flakeRoot,
  system ? builtins.currentSystem,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  pkgs = import flake.inputs.nixpkgs.outPath {
    inherit system;
    config.allowUnfree = true;
  };
  pkgs2405 = import flake.inputs.nixpkgs-2405.outPath {
    inherit system;
    config.allowUnfree = true;
  };

  packages = flake.outputs.packages.${system};
  host = packages.korri-desktop;
  device = packages.korri-desktop-device;
  x86Kiosk = packages.korri-desktop-x86-kiosk;
  unwrapped = packages.korri-desktop-unwrapped;

  # The wrap derivation interpolates pkgs2405 store paths into its
  # installPhase at evaluation time (no build required). Check whether
  # the device wrapper's installPhase mentions a given store path.
  containsStorePath =
    haystack: needle:
    let
      hayLen = builtins.stringLength haystack;
      needleLen = builtins.stringLength needle;
      indices = builtins.genList (i: i) (hayLen - needleLen + 1);
      matches = builtins.filter (i: builtins.substring i needleLen haystack == needle) indices;
    in
    matches != [ ];

  hostInstall = host.installPhase or "";
  deviceInstall = device.installPhase or "";
  x86KioskInstall = x86Kiosk.installPhase or "";

  hasPkgs2405WebkitInDevice = containsStorePath deviceInstall pkgs2405.webkitgtk_4_1.outPath;
  hasPkgs2405GtkInDevice = containsStorePath deviceInstall pkgs2405.gtk3.outPath;
  hasPkgs2405LibsoupInDevice = containsStorePath deviceInstall pkgs2405.libsoup_3.outPath;
  hasPkgs2405LibrsvgInDevice = containsStorePath deviceInstall pkgs2405.librsvg.outPath;
  hasPkgs2405AtSpiInDevice = containsStorePath deviceInstall pkgs2405.at-spi2-core.outPath;

  hasPkgs2405WebkitInHost = containsStorePath hostInstall pkgs2405.webkitgtk_4_1.outPath;
  hasPkgs2405GtkInHost = containsStorePath hostInstall pkgs2405.gtk3.outPath;

  hostHasMoonlightEmbedded = containsStorePath hostInstall pkgs.moonlight-embedded.outPath;
  hostHasMoonlightQt = containsStorePath hostInstall pkgs.moonlight-qt.outPath;
  deviceHasMoonlightEmbedded = containsStorePath deviceInstall pkgs.moonlight-embedded.outPath;
  deviceHasMoonlightQt = containsStorePath deviceInstall pkgs.moonlight-qt.outPath;
  x86KioskHasMoonlightEmbedded = containsStorePath x86KioskInstall pkgs.moonlight-embedded.outPath;
  x86KioskHasMoonlightQt = containsStorePath x86KioskInstall pkgs.moonlight-qt.outPath;

  deviceExportsDesktopInputdUrl = builtins.match ".*KORRI_DESKTOP_INPUTD_URL.*" deviceInstall != null;
  x86KioskExportsDesktopInputdUrl =
    builtins.match ".*KORRI_DESKTOP_INPUTD_URL.*" x86KioskInstall != null;
  deviceLeaksNativeBridgeUrl = builtins.match ".*KORRI_NATIVE_BRIDGE_URL.*" deviceInstall != null;
in
{
  # Build-graph invariants: both variants must derive from the same
  # unwrapped build, and the unwrapped must be the same one exposed as a
  # top-level package.
  hostUnwrappedDrvPath = host.passthru.unwrapped.drvPath;
  deviceUnwrappedDrvPath = device.passthru.unwrapped.drvPath;
  unwrappedDrvPath = unwrapped.drvPath;

  # Variant identity: host and device must produce distinct out paths.
  hostDrvPath = host.drvPath;
  deviceDrvPath = device.drvPath;
  x86KioskDrvPath = x86Kiosk.drvPath;

  # Closure cohesion (anti-regression for the librsvg/at-spi2-core
  # finding): every pkgs2405 entry from deviceDesktopRuntimeLibraries must
  # appear in the device wrap's installPhase.
  deviceHasPkgs2405Webkit = hasPkgs2405WebkitInDevice;
  deviceHasPkgs2405Gtk = hasPkgs2405GtkInDevice;
  deviceHasPkgs2405Libsoup = hasPkgs2405LibsoupInDevice;
  deviceHasPkgs2405Librsvg = hasPkgs2405LibrsvgInDevice;
  deviceHasPkgs2405AtSpi = hasPkgs2405AtSpiInDevice;

  # Host wrap must NOT pull in any pkgs2405 paths (no accidental closure
  # leak from copy-paste between variants).
  hostHasPkgs2405Webkit = hasPkgs2405WebkitInHost;
  hostHasPkgs2405Gtk = hasPkgs2405GtkInHost;

  inherit hostHasMoonlightEmbedded hostHasMoonlightQt;
  inherit deviceHasMoonlightEmbedded deviceHasMoonlightQt;
  inherit x86KioskHasMoonlightEmbedded x86KioskHasMoonlightQt;
  inherit deviceExportsDesktopInputdUrl x86KioskExportsDesktopInputdUrl deviceLeaksNativeBridgeUrl;
}
