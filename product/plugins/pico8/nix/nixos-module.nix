{
  config,
  lib,
  pkgs,
  ...
}:

{
  config = lib.mkIf config.services.korri.compositor.kiosk.enable {
    # Stable abs path the cascade-side launcher YAML can reference for the
    # fake-08 core without baking a per-build nix store hash into user data.
    environment.etc."korri/cores/fake08_libretro.so".source =
      "${pkgs.libretro-fake-08}/lib/retroarch/cores/fake08_libretro.so";
  };
}
