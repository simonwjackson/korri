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
    services.korri.compositor.path = lib.mkAfter [ pluginPackage ];
    services.korri.sessiond.path = lib.mkAfter [ pluginPackage ];
    services.korri.gameStream.path = lib.mkAfter [ pluginPackage ];
  };
}
