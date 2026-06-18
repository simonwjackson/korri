{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  protonRuntimePackage = pkgs.callPackage ../packages/proton-runtime { };
in
{
  enabledPluginIds = lib.optional enable "@korri:proton";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    korri-proton-runtime = protonRuntimePackage;
  };
  apps = { };
  checks = { };
}
