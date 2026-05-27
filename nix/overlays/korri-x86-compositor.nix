# Overlay that pins sway 1.12 + gamescope 3.16.23 from nixpkgs master for
# x86_64 compositor hosts. Stock sway 1.11 segfaults deterministically at
# struct offset 0xb8 in `sway[+5a000]` when gamescope nests an Xwayland
# that handles Wine/Proton workloads (Balatro reproduces on aka). Sway
# 1.12 (released 2026-05-25) ships several null-deref / use-after-free
# fixes around xdg_shell / view_init / tiling_resize that pattern-match
# the crash class. Gamescope 3.16.23 bundles a pipewire loop-lock fix.
#
# Acts as a no-op on aarch64 / other systems; Snapdragon/ROCKNIX
# compositor hosts keep their existing nixpkgs sway+gamescope.
#
# Delete this overlay once nixos-unstable picks up sway 1.12 (expected
# within a few weeks); the regular nixpkgs flake input will then suffice.
# Reading `prev.stdenv` (the un-overlaid pkgs that already has stdenv
# resolved upstream) instead of `final.stdenv` avoids the infinite
# recursion that would otherwise arise from making stdenv depend on an
# overlay that depends on stdenv.
final: prev:
prev.lib.optionalAttrs prev.stdenv.hostPlatform.isx86_64 (
  let
    swayGamescopePin =
      import
        (builtins.fetchTarball {
          url = "https://github.com/NixOS/nixpkgs/archive/0c6db2b5d257d845bbee67a38dee43bbca3bd462.tar.gz";
          sha256 = "0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3";
        })
        {
          system = prev.stdenv.hostPlatform.system;
          config.allowUnfree = true;
        };
  in
  {
    inherit (swayGamescopePin) sway sway-unwrapped gamescope;
  }
)
