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
      or (throw "mega-man-maker plugin requires ${name} from another plugin composition");
  megaManMakerPackage = pkgs.callPackage ../packages/mega-man-maker {
    fexRuntime = requiredPackage "korri-fex-runtime";
    protonRuntime = requiredPackage "korri-proton-runtime";
    protonGeRuntime = requiredPackage "korri-proton-ge-runtime";
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:mega-man-maker";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    mega-man-maker = megaManMakerPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    mega-man-maker-check = import ../packages/mega-man-maker/check.nix {
      inherit pkgs;
      megaManMakerPackage = megaManMakerPackage;
    };
  };
}
