# Auto-injected `nixpkgs.overlays` entry that every public Korri nixosModule
# pulls in via `imports`. The goal is "import any korri module, get the Korri
# downstream Moonlight + Sunshine builds for free" — so a downstream flake
# (mountainous, bespoke host configs) does not have to remember to compose
# `inputs.korri.overlays.default` into its own `nixpkgs.overlays` list.
#
# Apply this module exactly once per system evaluation: applying the overlay
# twice would re-derive `sunshine-korri` from itself and the version string
# would end up suffixed `-korri-korri`. NixOS dedupes modules by referential
# identity, so as long as every consumer reaches this file through the
# `korriPackagesOverlayModule` value built in flake.nix (which is what every
# published korri nixosModule does), the merge collapses to a single entry.
{ overlay }:

{ ... }:
{
  nixpkgs.overlays = [ overlay ];
}
