{
  pkgs,
  src ? null,
  bunDeps ? null,
  enable ? pkgs.stdenv.isLinux,
  gamescopePackage ? null,
  controlBridgePackage ? null,
  ...
}:

let
  lib = pkgs.lib;
  overlay = import ./overlay.nix;
  overlayed = pkgs.extend overlay;
  resolvedGamescopePackage =
    if gamescopePackage == null then overlayed.gamescope-korri else gamescopePackage;
  resolvedControlBridgePackage =
    if controlBridgePackage != null then
      controlBridgePackage
    else if src == null || bunDeps == null then
      null
    else
      import ../packages/control-bridge/default.nix {
        inherit pkgs src bunDeps;
        lib = pkgs.lib;
      };
in
{
  enabledPluginIds = lib.optional enable "@korri:gamescope";
  overlays = lib.optional enable overlay;
  nixosModules = lib.optional enable (import ./nixos-module.nix);
  packages =
    lib.optionalAttrs enable {
      gamescope-korri = resolvedGamescopePackage;
    }
    // lib.optionalAttrs (enable && resolvedControlBridgePackage != null) {
      korri-gamescope-control-bridge = resolvedControlBridgePackage;
    };
  apps = lib.optionalAttrs (enable && resolvedControlBridgePackage != null) {
    gamescope-control = {
      type = "app";
      program = "${resolvedControlBridgePackage}/bin/gamescope-control";
    };
    gamescope-control-bridge = {
      type = "app";
      program = "${resolvedControlBridgePackage}/bin/gamescope-control-bridge";
    };
    korri-stream-control-bench = {
      type = "app";
      program = "${resolvedControlBridgePackage}/bin/stream-control-bench";
    };
  };
}
