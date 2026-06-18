{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  portmasterPackage = pkgs.callPackage ../packages/portmaster { };
in
{
  enabledPluginIds = lib.optional enable "@korri:portmaster";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    portmaster = portmasterPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    portmaster-check = import ../packages/portmaster/check.nix {
      inherit pkgs portmasterPackage;
    };
  };
}
