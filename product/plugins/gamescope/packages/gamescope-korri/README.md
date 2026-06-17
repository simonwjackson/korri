# gamescope-korri

Korri's downstream Gamescope package lane. This package wraps the pinned Gamescope base used by Korri images and applies the plugin-owned patch set in `patches/`.

The package name and overlay behavior remain stable: root NixOS composition exposes both `pkgs.gamescope-korri` and `pkgs.gamescope` as this derivation.
