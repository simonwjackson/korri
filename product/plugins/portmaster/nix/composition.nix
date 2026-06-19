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
  portmasterGodot42RuntimePackage = pkgs.callPackage ../packages/portmaster-godot-4-2-runtime { };
  portmasterWestonRuntimePackage = pkgs.callPackage ../packages/portmaster-weston-runtime { };
in
{
  enabledPluginIds = lib.optional enable "@korri:portmaster";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    portmaster = portmasterPackage;
    portmaster-armhf-runtime = portmasterArmhfRuntimePackage;
    portmaster-frt-runtime = portmasterFrtRuntimePackage;
    portmaster-godot-4-2-runtime = portmasterGodot42RuntimePackage;
    portmaster-weston-runtime = portmasterWestonRuntimePackage;
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
    portmaster-godot-4-2-runtime-check = import ../packages/portmaster-godot-4-2-runtime/check.nix {
      inherit pkgs portmasterGodot42RuntimePackage;
    };
    portmaster-weston-runtime-check = import ../packages/portmaster-weston-runtime/check.nix {
      inherit pkgs portmasterWestonRuntimePackage;
    };
  };
}
