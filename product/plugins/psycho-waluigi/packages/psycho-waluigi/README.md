# Psycho Waluigi package

Packages the MFGG-hosted Windows 32-bit Psycho Waluigi release as an opaque
binary payload. The launcher copies the game to a writable per-user directory
before running it so MMF2 settings/saves never write into the Nix store.
