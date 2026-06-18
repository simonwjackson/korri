{
  config,
  lib,
  pkgs,
  ...
}:

let
  # RetroArch plugin-owned kiosk closure: the bare RetroArch binary plus the
  # first-party libretro cores that nixpkgs already provides. Keep this as a
  # flag-free symlinkJoin; Korri's launch materializer passes exactly one
  # `-L <core> <content>` pair per foreground launch.
  retroarchKiosk = pkgs.symlinkJoin {
    name = "korri-retroarch";
    paths = [
      pkgs.retroarch-bare
      pkgs.libretro.mgba
      pkgs.libretro.genesis-plus-gx
      pkgs.libretro.mesen
      pkgs.libretro.bsnes
    ];
    passthru = {
      cores = [
        pkgs.libretro.mgba
        pkgs.libretro.genesis-plus-gx
        pkgs.libretro.mesen
        pkgs.libretro.bsnes
      ];
      unwrapped = pkgs.retroarch-bare;
    };
  };
in
{
  config = lib.mkIf config.services.korri.compositor.kiosk.enable {
    # Stable abs path the plugin-owned readable runtime can reference without
    # baking a per-build nix store hash into user-authored launch data.
    nixpkgs.config.allowUnfreePredicate =
      pkg: builtins.elem (lib.getName pkg) [ "libretro-genesis-plus-gx" ];

    environment.etc."korri/cores/mgba_libretro.so".source =
      "${pkgs.libretro.mgba}/lib/retroarch/cores/mgba_libretro.so";
    environment.etc."korri/cores/genesis_plus_gx_libretro.so".source =
      "${pkgs.libretro.genesis-plus-gx}/lib/retroarch/cores/genesis_plus_gx_libretro.so";
    environment.etc."korri/cores/mesen_libretro.so".source =
      "${pkgs.libretro.mesen}/lib/retroarch/cores/mesen_libretro.so";
    environment.etc."korri/cores/bsnes_libretro.so".source =
      "${pkgs.libretro.bsnes}/lib/retroarch/cores/bsnes_libretro.so";

    services.korri.compositor.path = lib.mkAfter [ retroarchKiosk ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ retroarchKiosk ];
  };
}
