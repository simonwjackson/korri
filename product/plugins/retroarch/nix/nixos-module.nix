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
    ];
    passthru = {
      cores = [ pkgs.libretro.mgba ];
      unwrapped = pkgs.retroarch-bare;
    };
  };
in
{
  config = lib.mkIf config.services.korri.compositor.kiosk.enable {
    # Stable abs path the plugin-owned readable runtime can reference without
    # baking a per-build nix store hash into user-authored launch data.
    environment.etc."korri/cores/mgba_libretro.so".source =
      "${pkgs.libretro.mgba}/lib/retroarch/cores/mgba_libretro.so";

    services.korri.compositor.path = lib.mkAfter [ retroarchKiosk ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ retroarchKiosk ];
  };
}
