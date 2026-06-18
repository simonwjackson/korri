{
  config,
  lib,
  pkgs,
  ...
}:

let
  # Minimal RetroArch closure for PICO-8 carts: retroarch-bare (zero default
  # cores) joined with exactly one libretro core (fake-08). We intentionally do
  # not use `pkgs.retroarch-bare.passthru.wrapper { cores = ...; }` because that
  # wrapper injects its own `-L <coredir>` before Korri's launcher-provided
  # `-L <core> <content>` and can make RetroArch route `.p8.png` carts through
  # its image-display core instead of fake-08.
  #
  # `symlinkJoin` exposes the bare retroarch binary and core without injecting
  # flags. The closure-shape assertions in tools/testing/nix/korri-*-config-check.nix
  # match on `passthru.cores` + `passthru.unwrapped`, so those attributes are
  # propagated here.
  retroarchKiosk = pkgs.symlinkJoin {
    name = "korri-retroarch-fake-08";
    paths = [
      pkgs.retroarch-bare
      pkgs.libretro-fake-08
    ];
    passthru = {
      cores = [ pkgs.libretro-fake-08 ];
      unwrapped = pkgs.retroarch-bare;
    };
  };
in
{
  config = lib.mkIf config.services.korri.compositor.kiosk.enable {
    # Stable abs path the cascade-side launcher YAML can reference for the
    # fake-08 core without baking a per-build nix store hash into user data.
    environment.etc."korri/cores/fake08_libretro.so".source =
      "${pkgs.libretro-fake-08}/lib/retroarch/cores/fake08_libretro.so";

    services.korri.compositor.path = lib.mkAfter [ retroarchKiosk ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ retroarchKiosk ];
  };
}
