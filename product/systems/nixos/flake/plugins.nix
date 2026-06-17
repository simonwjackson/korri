{
  pkgs,
  enableGamescope ? true,
  gamescopeKorri ? null,
  korriGamescopeControlBridge ? null,
}:

let
  lib = pkgs.lib;
  gamescopePackages = lib.optionalAttrs enableGamescope {
    korri-gamescope-control-bridge = korriGamescopeControlBridge;
    gamescope-korri = gamescopeKorri;
  };
  gamescopeApps = lib.optionalAttrs enableGamescope {
    gamescope-control = {
      type = "app";
      program = "${korriGamescopeControlBridge}/bin/gamescope-control";
    };
    gamescope-control-bridge = {
      type = "app";
      program = "${korriGamescopeControlBridge}/bin/gamescope-control-bridge";
    };
    korri-stream-control-bench = {
      type = "app";
      program = "${korriGamescopeControlBridge}/bin/stream-control-bench";
    };
  };
in
{
  enabledPluginIds = lib.optional enableGamescope "@korri:gamescope";
  packages = gamescopePackages;
  apps = gamescopeApps;
}
