{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  portmasterPackage = pkgs.callPackage ../packages/portmaster { };
  portmasterArmhfRuntimePackage = pkgs.callPackage ../packages/portmaster-armhf-runtime { };
  portmasterFrtRuntimePackage = pkgs.callPackage ../packages/portmaster-frt-runtime { };
in
{
  enabledPluginIds = lib.optional enable "@korri:portmaster";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    portmaster = portmasterPackage;
    portmaster-armhf-runtime = portmasterArmhfRuntimePackage;
    portmaster-frt-runtime = portmasterFrtRuntimePackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    portmaster-check = import ../packages/portmaster/check.nix {
      inherit pkgs portmasterPackage;
    };
    portmaster-armhf-runtime-check = import ../packages/portmaster-armhf-runtime/check.nix {
      inherit pkgs portmasterArmhfRuntimePackage;
    };
    portmaster-frt-runtime-check = import ../packages/portmaster-frt-runtime/check.nix {
      inherit pkgs portmasterFrtRuntimePackage;
    };
  };
}
