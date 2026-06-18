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
      or (throw "mega-man-arena plugin requires ${name} from another plugin composition");
  megaManArenaPackage = pkgs.callPackage ../packages/mega-man-arena {
    fexRuntime = requiredPackage "korri-fex-runtime";
    protonRuntime = requiredPackage "korri-proton-runtime";
    protonGeRuntime = requiredPackage "korri-proton-ge-runtime";
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:mega-man-arena";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    mega-man-arena = megaManArenaPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    mega-man-arena-check = import ../packages/mega-man-arena/check.nix {
      inherit pkgs;
      megaManArenaPackage = megaManArenaPackage;
    };
  };
}
