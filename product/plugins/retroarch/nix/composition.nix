{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  nixpkgs-mesa ? null,
}:

let
  lib = pkgs.lib;
  module = import ./nixos-module.nix { inherit nixpkgs-mesa; };
in
{
  enabledPluginIds = lib.optional enable "@korri:retroarch";
  overlays = [ ];
  nixosModules = lib.optional enable module;
  packages = { };
  apps = { };
  checks = { };
}
