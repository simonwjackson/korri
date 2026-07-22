# Overlay that pins Sway 1.12 from nixpkgs master for every Korri compositor
# host. Stock Sway 1.11 segfaults deterministically at struct offset 0xb8 in
# `sway[+5a000]` when nested Xwayland Wine/Proton workloads are present
# (Balatro reproduces on aka). Sway 1.12 (released 2026-05-25) ships several
# null-deref / use-after-free fixes around xdg_shell / view_init /
# tiling_resize that pattern-match the crash class.
#
# Bandai also runs nested Gamescope/Wine, so keeping aarch64 on Sway 1.11 left
# the same compositor boundary on an older lifecycle implementation. The pin
# is intentionally architecture-neutral; nixpkgs builds Sway 1.12 and its
# wlroots stack for each host platform.
#
# Delete this overlay once the regular nixpkgs input provides Sway >= 1.12.
# Reading `prev.stdenv` (the un-overlaid pkgs that already has stdenv resolved
# upstream) avoids recursion while selecting the host-system package set.
final: prev:
let
  swayPin =
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
  inherit (swayPin) sway sway-unwrapped;
}
