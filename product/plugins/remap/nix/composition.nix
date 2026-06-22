{ pkgs, enable ? pkgs.stdenv.isLinux, ... }:

let
  lib = pkgs.lib;
  bridgePackage = pkgs.callPackage ./remap-bridge.nix { };
in
{
  enabledPluginIds = lib.optional enable "@korri:remap";
  packages = lib.optionalAttrs enable {
    korri-remap-bridge = bridgePackage;
  };
  apps = lib.optionalAttrs enable {
    korri-remap-bridge = {
      type = "app";
      program = "${bridgePackage}/bin/korri-remap-bridge";
    };
  };
  nixosModules = lib.optional enable (import ./nixos-module.nix);
}
