{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  ...
}:

let
  lib = pkgs.lib;
  package = pkgs.callPackage ../packages/korri-web-canvas { };
in
{
  enabledPluginIds = lib.optional enable "@korri:web-canvas";
  packages = lib.optionalAttrs enable {
    korri-web-canvas = package;
  };
  apps = lib.optionalAttrs enable {
    korri-web-canvas = {
      type = "app";
      program = "${package}/bin/korri-web-canvas";
    };
  };
  overlays = [ ];
  nixosModules = [ ];
  checks = { };
}
