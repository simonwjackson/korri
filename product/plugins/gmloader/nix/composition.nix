{ pkgs, enable ? pkgs.stdenv.isLinux, ... }:

let
  lib = pkgs.lib;
  gmloaderNextPackage = pkgs.callPackage ../packages/gmloader-next { };
in
{
  enabledPluginIds = lib.optional enable "@korri:gmloader";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    gmloader-next = gmloaderNextPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    gmloader-next-check = import ../packages/gmloader-next/check.nix {
      inherit pkgs gmloaderNextPackage;
    };
  };
}
