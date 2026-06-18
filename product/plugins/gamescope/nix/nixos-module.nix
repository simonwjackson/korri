{
  config,
  lib,
  pkgs,
  ...
}:

let
  pluginPackage = pkgs.gamescope-korri or null;
in
{
  config = lib.mkIf (pluginPackage != null) {
    services.korri.compositor.path = [ pluginPackage ];
    services.korri.sessiond.path = [ pluginPackage ];
    services.korri.gameStream.path = [ pluginPackage ];
  };
}
