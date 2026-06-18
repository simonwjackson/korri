{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
  srb2Package = pkgs.srb2;
in
{
  enabledPluginIds = lib.optional enable "@korri:srb2";
  overlays = [ ];
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    srb2 = srb2Package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    srb2-check = import ../packages/srb2/check.nix {
      inherit pkgs;
      srb2Package = srb2Package;
    };
  };
}
