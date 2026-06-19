{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  nixpkgs-mesa ? null,
  ...
}:

let
  lib = pkgs.lib;
  resolvedNixpkgsMesa =
    if nixpkgs-mesa == null then
      throw "Turnip plugin composition requires nixpkgs-mesa"
    else
      nixpkgs-mesa;
  overlay = import ./overlay.nix { nixpkgs-mesa = resolvedNixpkgsMesa; };
in
{
  enabledPluginIds = lib.optional enable "@korri:turnip";
  overlays = lib.optional enable overlay;
  packages = { };
  apps = { };
  checks = { };
  nixosModules = [ ];
}
