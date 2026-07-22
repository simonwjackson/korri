# Auto-injected nixpkgs overlay for the Korri compositor runtime contract.
# Bundled into korri-compositor's imports so every downstream consumer —
# mountainous host config, Korri image build, or bespoke nixosSystem — picks
# up the known-good Sway version without wiring the pin itself.
#
# The historical filename is retained for compatibility, but the overlay now
# applies to both x86 and aarch64 compositor hosts so ROCKNIX devices do not
# remain on the older Sway lifecycle implementation.
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
