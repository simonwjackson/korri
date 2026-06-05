{
  pkgs,
  pkgs2405,
  lib ? pkgs.lib,
  system,
  src,
  bunDeps,
  portal,
}:

let
  versions = import ./nix/versions.nix;

  supportedSystems = [
    "x86_64-linux"
    "aarch64-linux"
  ];
  isSupportedSystem = builtins.elem system supportedSystems;
  isX86Linux = system == "x86_64-linux";

  hostRuntimeLibraries = lib.optionals pkgs.stdenv.isLinux (
    (with pkgs; [
      gtk3
      webkitgtk_4_1
      libayatana-appindicator
      librsvg
      libsoup_3
      glib
      glibc
      gdk-pixbuf
      at-spi2-core
      pango
      cairo
      gsettings-desktop-schemas
      glib-networking
    ])
    ++ [ pkgs.stdenv.cc.cc.lib ]
  );

  # Full pkgs2405 closure mirroring `hostRuntimeLibraries` for the libraries
  # libNativeWrapper.so directly NEEDs. Order matters: pkgs2405 entries come
  # first so the loader prefers them; current-nixpkgs glibc / gcc-lib fall in
  # at the end because that is what bun + the launcher's interpreter were
  # patchelfed to use.
  deviceRuntimeLibraries = lib.optionals pkgs.stdenv.isLinux (
    (with pkgs2405; [
      webkitgtk_4_1
      gtk3
      libayatana-appindicator
      librsvg
      libsoup_3
      glib
      gdk-pixbuf
      at-spi2-core
      pango
      cairo
      glib-networking
    ])
    ++ [
      pkgs.glibc
      pkgs.stdenv.cc.cc.lib
    ]
  );

  deviceDataDirs = lib.optionals pkgs.stdenv.isLinux [
    pkgs2405.gsettings-desktop-schemas
    pkgs2405.gtk3
  ];

  devPackages = lib.optionals pkgs.stdenv.isLinux (
    (with pkgs; [
      pkg-config
      cmake
      gcc
      patchelf
    ])
    ++ hostRuntimeLibraries
  );

  shellHook = lib.optionalString pkgs.stdenv.isLinux ''
    export KORRI_NIX_LD_INTERPRETER=${pkgs.stdenv.cc.bintools.dynamicLinker}
    export KORRI_NIX_LD_LIBRARY_PATH=${lib.makeLibraryPath hostRuntimeLibraries}
  '';

  electrobunBinaries =
    if isSupportedSystem then
      import ./nix/electrobun-binaries.nix {
        inherit
          pkgs
          lib
          system
          versions
          ;
      }
    else
      null;

  wrap = args: pkgs.callPackage ./nix/wrap.nix args;

  # Device variant uses the pkgs2405 closure as a *cohesive* set: WebKitGTK
  # 2.44.3 + matching GTK 3.24.43 + gsettings-desktop-schemas + glib-networking
  # all move together. WebKit 2.44.3 was built against an older Pango ABI than
  # current nixpkgs ships, so the closure cannot be split. The paths are baked
  # into libNativeWrapper.so's RPATH at build time (no runtime LD_LIBRARY_PATH).
  # See docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md.
  #
  # Every pkgs2405 entry from `deviceRuntimeLibraries` must appear in this
  # shared override set. Missing entries would silently auto-fill from current
  # nixpkgs and break the cohesive closure invariant.
  deviceWrapOverrides = {
    korri-desktop-unwrapped = unwrapped;
    webkitgtk_4_1 = pkgs2405.webkitgtk_4_1;
    gtk3 = pkgs2405.gtk3;
    libsoup_3 = pkgs2405.libsoup_3;
    glib = pkgs2405.glib;
    gdk-pixbuf = pkgs2405.gdk-pixbuf;
    cairo = pkgs2405.cairo;
    pango = pkgs2405.pango;
    libayatana-appindicator = pkgs2405.libayatana-appindicator;
    librsvg = pkgs2405.librsvg;
    at-spi2-core = pkgs2405.at-spi2-core;
    glib-networking = pkgs2405.glib-networking;
    gsettings-desktop-schemas = pkgs2405.gsettings-desktop-schemas;
    stdenvCcLib = pkgs.stdenv.cc.cc.lib;
  };

  # Heavy build runs once and is shared between every variant. The wrap step
  # re-RPATHs shared objects per variant and writes the wrapper script; the
  # unwrapped output's executables (bun, launcher) already have their
  # interpreter set and are left alone by wrap.
  unwrapped =
    if isSupportedSystem then
      pkgs.callPackage ./nix/unwrapped.nix {
        inherit system bunDeps src;
        inherit electrobunBinaries portal;
        buildtimeLibraries = hostRuntimeLibraries;
      }
    else
      null;

  # Host variant: current nixpkgs libraries throughout (callPackage auto-fills
  # each named arg from `pkgs`).
  host =
    if isSupportedSystem then
      wrap {
        korri-desktop-unwrapped = unwrapped;
        stdenvCcLib = pkgs.stdenv.cc.cc.lib;
        profile = "host";
      }
    else
      null;

  device = if isSupportedSystem then wrap (deviceWrapOverrides // { profile = "device"; }) else null;

  x86Kiosk =
    if isX86Linux then
      wrap (
        deviceWrapOverrides
        // {
          moonlightPackage = pkgs.moonlight-embedded;
          profile = "x86-kiosk";
        }
      )
    else
      null;
in
{
  inherit
    supportedSystems
    isSupportedSystem
    versions
    ;

  runtime = {
    inherit
      hostRuntimeLibraries
      deviceRuntimeLibraries
      deviceDataDirs
      ;
  };

  devShell = {
    packages = devPackages;
    inherit shellHook;
  };

  packages = {
    binaries = electrobunBinaries;
    inherit
      unwrapped
      host
      device
      x86Kiosk
      ;
  };

  lib = {
    inherit wrap deviceWrapOverrides;
  };
}
