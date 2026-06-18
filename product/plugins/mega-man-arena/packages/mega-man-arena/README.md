# Mega Man Arena package

Packages the upstream Mega Man Arena 4.20 Windows x86_64 release for Korri.

- `default.nix` installs the immutable game payload and exposes launchers.
- `mega-man-arena` launches through nixpkgs Wine on x86_64 Linux.
- `mega-man-arena-fex` launches through Bandai's FEX + Proton runtime on aarch64 Linux.
- `check.nix` verifies payload shape, PE architecture, launcher contracts, and provenance metadata.
