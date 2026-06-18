# gamescope-korri

Korri's downstream Gamescope package lane. This package wraps the pinned Gamescope base used by Korri images and applies the plugin-owned patch set in `patches/`.

Root product composition exposes this derivation as an explicit plugin package/app output. Generic overlays no longer replace `pkgs.gamescope` globally.
