# SRB2 plugin

First-party catalog plugin for [Sonic Robo Blast 2](https://github.com/STJr/SRB2).

The Nix package surface reuses nixpkgs' native `srb2` package, which builds the
GPL engine and wires the upstream `srb2-data` payload through `SRB2WADDIR`.
