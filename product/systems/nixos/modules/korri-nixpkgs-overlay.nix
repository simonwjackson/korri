# `nixpkgs.overlays` helper for installing Korri's global runtime package
# substitutions. The goal is "compose the Korri overlay once, then use the
# ordinary upstream package names everywhere": `pkgs.gamescope` resolves to
# gamescope-korri, `pkgs.moonlight-embedded` resolves to
# moonlight-embedded-korri, and `pkgs.sunshine` resolves to sunshine-korri.
#
# Apply this module exactly once per system evaluation: applying the overlay
# twice would re-derive `sunshine-korri` from itself and the version string
# would end up suffixed `-korri-korri`. NixOS dedupes modules by referential
# identity, so as long as every consumer reaches this file through the
# `korriPackagesOverlayModule` value built in flake.nix (which is what every
# published korri nixosModule does), the merge collapses to a single entry.
{ overlay }:

{ lib, ... }:
{
  nixpkgs.overlays = lib.mkDefault [ overlay ];
}
