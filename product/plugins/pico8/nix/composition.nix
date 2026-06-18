{
  pkgs,
  fake-08-src ? null,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  requiredFake08Src =
    if fake-08-src != null then
      fake-08-src
    else
      throw "pico8 plugin composition requires fake-08-src when enabled";
  libretroFake08Package = pkgs.callPackage ../packages/libretro-fake-08/package.nix {
    fake-08-src = requiredFake08Src;
  };
  overlay = import ./overlay.nix { fake-08-src = requiredFake08Src; };
in
{
  enabledPluginIds = lib.optional enable "@korri:pico8";
  overlays = lib.optional enable overlay;
  nixosModules = lib.optional enable (import ./nixos-module.nix);
  packages = lib.optionalAttrs enable {
    libretro-fake-08 = libretroFake08Package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    libretro-fake-08-check = import ../packages/libretro-fake-08/check.nix {
      inherit pkgs;
      libretroFake08Package = libretroFake08Package;
    };
  };
}
