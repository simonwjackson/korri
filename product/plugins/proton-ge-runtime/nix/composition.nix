{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  protonGeRuntimePackage = pkgs.callPackage ../packages/proton-ge-runtime { };
in
{
  enabledPluginIds = lib.optional enable "@korri:proton-ge";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    korri-proton-ge-runtime = protonGeRuntimePackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    proton-ge-runtime-check = import ../packages/proton-ge-runtime/check.nix {
      inherit pkgs;
      protonGeRuntimePackage = protonGeRuntimePackage;
    };
  };
}
