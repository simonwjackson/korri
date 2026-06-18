{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  overlay = import ./overlay.nix;
  overlayed = pkgs.extend overlay;
  package = overlayed.yoshis-fabrication-station;
in
{
  enabledPluginIds = lib.optional enable "@korri:yoshis-fabrication-station";
  overlays = lib.optional enable overlay;
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    yoshis-fabrication-station = package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    yoshis-fabrication-station-check = import ../check.nix {
      inherit pkgs;
      yfsPackage = package;
    };
  };
}
