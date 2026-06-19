{
  pkgs,
  enable ? true,
  ...
}:

let
  lib = pkgs.lib;
  packageEnable = enable && pkgs.stdenv.hostPlatform.isAarch64;
  package = pkgs.callPackage ../packages/box64-runtime { };
in
{
  enabledPluginIds = lib.optional packageEnable "@korri:box64-runtime";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs packageEnable {
    korri-box64-runtime = package;
  };
  apps = { };
  checks = lib.optionalAttrs packageEnable {
    korri-box64-runtime-check = pkgs.callPackage ../packages/box64-runtime/check.nix {
      inherit package;
    };
  };
}
