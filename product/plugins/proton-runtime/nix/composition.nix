{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  protonRuntimePackage = pkgs.callPackage ../packages/proton-runtime { };
  protonCachyosArm64Package = pkgs.callPackage ../packages/proton-cachyos-arm64 { };
in
{
  enabledPluginIds = lib.optional enable "@korri:proton";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    korri-proton-runtime = protonRuntimePackage;
    proton-cachyos-arm64 = protonCachyosArm64Package;
  };
  apps = { };
  checks = { };
}
