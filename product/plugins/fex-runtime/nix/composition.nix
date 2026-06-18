{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  fexRuntimePackage = pkgs.callPackage ../packages/fex-runtime { };
in
{
  enabledPluginIds = lib.optional enable "@korri:fex";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    korri-fex-runtime = fexRuntimePackage;
  };
  apps = { };
  checks = { };
}
