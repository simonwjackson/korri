{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  overlay = import ./overlay.nix;
  overlayed = pkgs.extend overlay;
  steamKorriPackage = overlayed.steam-korri;
  steamNixosModule = {
    imports = [
      ../../../systems/nixos/modules/korri-runtime.nix
      (import ./nixos-module.nix)
    ];
  };
  steamSourceMachineModule = {
    imports = [
      ../../../systems/nixos/modules/korri-runtime.nix
      (import ./source-machine-module.nix)
    ];
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:steam";
  overlays = lib.optional enable overlay;
  nixosModules = lib.optional enable steamNixosModule;
  sourceMachineNixosModules = lib.optional enable steamSourceMachineModule;
  packages = lib.optionalAttrs enable {
    steam-korri = steamKorriPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    korri-steam-module = import ./module-check.nix {
      inherit pkgs;
      korriSteamModule = steamNixosModule;
    };
    korri-steam-source-machine-module = import ./source-machine-module-check.nix {
      inherit pkgs;
      korriSteamSourceMachineModule = steamSourceMachineModule;
    };
    steam-korri-check = import ../packages/steam-korri/check.nix {
      inherit pkgs steamKorriPackage;
    };
  };
}
