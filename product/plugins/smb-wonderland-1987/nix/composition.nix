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
      or (throw "smb-wonderland-1987 plugin requires ${name} from another plugin composition");
  smbWonderland1987Package = pkgs.callPackage ../packages/smb-wonderland-1987 {
    fexRuntime = requiredPackage "korri-fex-runtime";
    protonRuntime = requiredPackage "korri-proton-runtime";
    protonGeRuntime = requiredPackage "korri-proton-ge-runtime";
  };
in
{
  enabledPluginIds = lib.optional enable "@korri:smb-wonderland-1987";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    smb-wonderland-1987 = smbWonderland1987Package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    smb-wonderland-1987-check = import ../packages/smb-wonderland-1987/check.nix {
      inherit pkgs;
      smbWonderland1987Package = smbWonderland1987Package;
    };
  };
}
