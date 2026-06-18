{
  pkgs,
  enable ? pkgs.stdenv.isLinux,
  nixpkgs-godot ? null,
  ...
}:

let
  lib = pkgs.lib;
  overlay = import ./overlay.nix { inherit nixpkgs-godot; };
  overlayed = pkgs.extend overlay;
  package = overlayed.smb-remastered;
in
{
  enabledPluginIds = lib.optional enable "@korri:super-mario-bros-remastered";
  overlays = lib.optional enable overlay;
  nixosModules = [ ];
  packages = lib.optionalAttrs enable {
    smb-remastered = package;
  };
  apps = { };
  checks = lib.optionalAttrs enable {
    smb-remastered-check = import ../check.nix {
      inherit pkgs;
      smbRemasteredPackage = package;
    };
  };
}
