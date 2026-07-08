{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  melonDsPackage = pkgs.melonDS;
  melonDsPresenterPackage = import ../packages/melonds-presenter/default.nix { inherit pkgs; };
  moduleFactory = import ./nixos-module.nix;
  module = moduleFactory { inherit melonDsPackage melonDsPresenterPackage; };
in
{
  enabledPluginIds = lib.optional enable "@korri:melonds";
  overlays = [ ];
  nixosModules = lib.optional enable module;
  packages = lib.optionalAttrs enable {
    melonds = melonDsPackage;
    melonds-presenter = melonDsPresenterPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    korri-melonds-package = import ./package-check.nix {
      inherit pkgs melonDsPackage melonDsPresenterPackage;
    };
    korri-melonds-module = import ./module-check.nix {
      inherit pkgs;
      korriMelonDsModule = moduleFactory;
    };
  };
}
