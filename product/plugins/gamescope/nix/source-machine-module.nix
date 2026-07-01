# Source-machine stream-host composition for the Gamescope launch plugin.
# Keeps Gamescope-owned package/env contributions in the plugin tree while
# letting product image and downstream NixOS module compositions import one
# stream-host-safe module.
{ lib, ... }:

let
  enabledPlugin = "@korri:gamescope";
in
{
  imports = [ (import ./nixos-module.nix) ];

  nixpkgs.overlays = [ (import ./overlay.nix) ];

  systemd.user.services.korrid.environment.KORRI_ENABLED_PLUGINS = lib.mkDefault enabledPlugin;
  services.korri.sessiond.extraEnvironment = {
    KORRI_ENABLED_PLUGINS = lib.mkDefault enabledPlugin;
    KORRI_STREAM_SURFACE_APP_IDS = lib.mkDefault "gamescope";
  };
  services.korri.gameStream.extraEnvironment.KORRI_ENABLED_PLUGINS = lib.mkDefault enabledPlugin;
}
