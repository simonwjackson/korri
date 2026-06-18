# `nixpkgs.overlays` helper for installing Korri's shared runtime package
# substitutions. Plugin package overlays are composed at the product/image
# plugin seam rather than through this generic module.
#
# Apply this module exactly once per system evaluation: applying the overlay
# twice would re-derive substituted packages from themselves and the version
# string would end up duplicated. NixOS dedupes modules by referential identity,
# so as long as every consumer reaches this file through the published
# nixosModule value, the merge collapses to a single entry.
{ overlay }:

{ lib, ... }:
{
  nixpkgs.overlays = lib.mkDefault [ overlay ];
}
