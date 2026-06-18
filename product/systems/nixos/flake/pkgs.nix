{
  system,
  nixpkgs,
  nixpkgs-2405,
  bun2nix,
  nix-on-rocks,
  fake-08-src,
  wasm4-src,
  nixpkgs-godot,
}:

let
  korriPackagesOverlay = import ../overlays/korri-packages.nix {
    inherit
      nix-on-rocks
      fake-08-src
      wasm4-src
      nixpkgs-godot
      ;
  };

  pkgs = import nixpkgs {
    inherit system;
    config.allowUnfree = true;
    overlays = [
      bun2nix.overlays.default
      korriPackagesOverlay
    ];
  };

  pkgs2405 = import nixpkgs-2405 {
    inherit system;
    config.allowUnfree = true;
  };
in
{
  inherit
    korriPackagesOverlay
    pkgs
    pkgs2405
    ;
}
