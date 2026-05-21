{
  flakeRoot,
  system ? builtins.currentSystem,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  pkgs2405 = import flake.inputs.nixpkgs-2405.outPath {
    inherit system;
    config.allowUnfree = true;
  };

  packages = flake.outputs.packages.${system};
  host = packages.korri-desktop;
  device = packages.korri-desktop-device;
  unwrapped = packages.korri-desktop-unwrapped;

  # The wrap derivation interpolates pkgs2405 store paths into its
  # installPhase at evaluation time (no build required). Check whether
  # the device wrapper's installPhase mentions a given store path.
  containsStorePath = haystack: needle:
    let
      hayLen = builtins.stringLength haystack;
      needleLen = builtins.stringLength needle;
      indices = builtins.genList (i: i) (hayLen - needleLen + 1);
      matches =
        builtins.filter (i: builtins.substring i needleLen haystack == needle)
          indices;
    in
    matches != [ ];

  hostInstall = host.installPhase or "";
  deviceInstall = device.installPhase or "";

  hasPkgs2405WebkitInDevice =
    containsStorePath deviceInstall pkgs2405.webkitgtk_4_1.outPath;
  hasPkgs2405GtkInDevice =
    containsStorePath deviceInstall pkgs2405.gtk3.outPath;
  hasPkgs2405LibsoupInDevice =
    containsStorePath deviceInstall pkgs2405.libsoup_3.outPath;
  hasPkgs2405LibrsvgInDevice =
    containsStorePath deviceInstall pkgs2405.librsvg.outPath;
  hasPkgs2405AtSpiInDevice =
    containsStorePath deviceInstall pkgs2405.at-spi2-core.outPath;

  hasPkgs2405WebkitInHost =
    containsStorePath hostInstall pkgs2405.webkitgtk_4_1.outPath;
  hasPkgs2405GtkInHost =
    containsStorePath hostInstall pkgs2405.gtk3.outPath;
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
}
