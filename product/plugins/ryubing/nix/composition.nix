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
      throw "Ryubing plugin composition requires nixpkgs-mesa"
    else
      nixpkgs-mesa;
  overlay = import ./overlay.nix { nixpkgs-mesa = resolvedNixpkgsMesa; };
  overlayed = pkgs.extend overlay;
in
{
  enabledPluginIds = lib.optional enable "@korri:ryubing";
  overlays = lib.optional enable overlay;
  packages = lib.optionalAttrs enable {
    ryubing-korri = overlayed.ryubing-korri;
  };
}
