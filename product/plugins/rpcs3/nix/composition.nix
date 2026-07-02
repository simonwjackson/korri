{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  module = import ./nixos-module.nix;
in
{
  enabledPluginIds = lib.optional enable "@korri:rpcs3";
  overlays = [ ];
  nixosModules = lib.optional enable module;
  packages = { };
  apps = { };
  checks = lib.optionalAttrs enable {
    korri-rpcs3-module = import ./module-check.nix {
      inherit pkgs;
      korriRpcs3Module = module;
    };
  };
}
