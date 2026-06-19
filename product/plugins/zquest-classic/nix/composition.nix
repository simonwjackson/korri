{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  zquestClassicPackage = pkgs.callPackage ../packages/zquest-classic { };
in
{
  enabledPluginIds = lib.optional enable "@korri:zquest-classic";
  overlays = [ ];
  nixosModules = lib.optional enable (import ./nixos-module.nix { inherit zquestClassicPackage; });
  packages = lib.optionalAttrs enable {
    zquest-classic = zquestClassicPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    zquest-classic-check = import ../packages/zquest-classic/check.nix {
      inherit pkgs zquestClassicPackage;
    };
  };
}
