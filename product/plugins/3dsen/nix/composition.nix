{
  pkgs,
  enable ? true,
  stagedRoot ? null,
  ...
}:

let
  lib = pkgs.lib;
  packageEnable = enable && pkgs.stdenv.hostPlatform.isAarch64 && stagedRoot != null;
  package = pkgs.callPackage ../packages/3dsen-app {
    inherit stagedRoot;
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:3dsen";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs packageEnable {
    korri-3dsen-app = package;
  };
  apps = { };
  checks = lib.optionalAttrs packageEnable {
    korri-3dsen-app-check = pkgs.callPackage ../packages/3dsen-app/check.nix {
      inherit package;
    };
  };
}
