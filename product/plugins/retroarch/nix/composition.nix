{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
}:

let
  lib = pkgs.lib;
in
{
  enabledPluginIds = lib.optional enable "@korri:retroarch";
  overlays = [ ];
  nixosModules = lib.optional enable (import ./nixos-module.nix);
  packages = { };
  apps = { };
  checks = { };
}
