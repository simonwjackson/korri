{
  pkgs,
  pluginPackages ? { },
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  requiredPackage =
    name:
    pluginPackages.${name}
      or (throw "midas-machine plugin requires ${name} from another plugin composition");
  midasMachinePackage = pkgs.callPackage ../packages/midas-machine {
    fexRuntime = requiredPackage "korri-fex-runtime";
    protonRuntime = requiredPackage "korri-proton-runtime";
    protonGeRuntime = requiredPackage "korri-proton-ge-runtime";
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:midas-machine";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    midas-machine = midasMachinePackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    midas-machine-check = import ../packages/midas-machine/check.nix {
      inherit pkgs;
      midasMachinePackage = midasMachinePackage;
    };
  };
}
