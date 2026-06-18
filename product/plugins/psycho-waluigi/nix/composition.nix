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
      or (throw "psycho-waluigi plugin requires ${name} from another plugin composition");
  psychoWaluigiPackage = pkgs.callPackage ../packages/psycho-waluigi {
    fexRuntime = requiredPackage "korri-fex-runtime";
    protonRuntime = requiredPackage "korri-proton-runtime";
    protonGeRuntime = requiredPackage "korri-proton-ge-runtime";
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:psycho-waluigi";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    psycho-waluigi = psychoWaluigiPackage;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    psycho-waluigi-check = import ../packages/psycho-waluigi/check.nix {
      inherit pkgs;
      psychoWaluigiPackage = psychoWaluigiPackage;
    };
  };
}
