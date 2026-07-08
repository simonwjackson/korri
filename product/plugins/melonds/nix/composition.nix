{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  melonDsPackage = pkgs.melonDS;
  moduleFactory = import ./nixos-module.nix;
  module = moduleFactory { inherit melonDsPackage; };
in
{
  enabledPluginIds = lib.optional enable "@korri:melonds";
  overlays = [ ];
  nixosModules = lib.optional enable module;
  packages = lib.optionalAttrs enable { melonds = melonDsPackage; };
  apps = { };
  checks = lib.optionalAttrs enable {
    korri-melonds-package = import ./package-check.nix {
      inherit pkgs melonDsPackage;
    };
    korri-melonds-module = import ./module-check.nix {
      inherit pkgs;
      korriMelonDsModule = moduleFactory;
    };
  };
}
