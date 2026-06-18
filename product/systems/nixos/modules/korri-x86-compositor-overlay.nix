# Auto-injected nixpkgs overlay for the Korri x86 compositor runtime
# contract. Bundled into korri-compositor's imports so any downstream
# consumer — mountainous host config, korri image builds, bespoke
# nixosSystem — automatically picks up the known-good Sway the Korri
# compositor was validated against, without having to wire the pin themselves.
#
# The overlay (see product/systems/nixos/overlays/korri-x86-compositor.nix) is a no-op on
# non-x86 systems, so this module is safe to include from
# architecture-agnostic module aggregates (korri-compositor is also
# imported on aarch64 ROCKNIX builds).
#
# Module identity: NixOS dedupes module imports by referential identity.
# This file is imported exactly once from flake.nix's nixosModules
# block, so the resulting `nixpkgs.overlays` list contains the overlay
# once regardless of how many korri role modules a consumer pulls in.
{ overlay }:

{ lib, ... }:
{
  nixpkgs.overlays = lib.mkDefault [ overlay ];
}
