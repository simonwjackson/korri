{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  overlay = import ./overlay.nix;
  overlayed = pkgs.extend overlay;
  package = overlayed.super-mario-127;
in
{
  enabledPluginIds = lib.optional enable "@korri:super-mario-127";
  overlays = lib.optional enable overlay;
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    super-mario-127 = package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    super-mario-127-check = import ../check.nix {
      inherit pkgs;
      superMario127Package = package;
    };
  };
}
