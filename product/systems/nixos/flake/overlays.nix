{
  nix-on-rocks,
  fake-08-src,
  wasm4-src,
  smbr-src,
  sm127-src,
  nixpkgs-godot,
  nixpkgs-mesa,
  ...
}:

rec {
  # Top-level overlays so downstream flakes (mountainous host configs,
  # bespoke device images) can pick up Korri-downstream runtime packages
  # by adding `korri.overlays.default` to their own `nixpkgs.overlays`.
  # Without this, consumers that build their own `pkgs` instance (e.g.
  # mountainous's nixpkgs.lib.nixosSystem) never see the substitution and
  # end up with stock nixpkgs gamescope/sunshine/moonlight-embedded.
  korri-packages = import ../overlays/korri-packages.nix {
    inherit
      nix-on-rocks
      fake-08-src
      wasm4-src
      smbr-src
      sm127-src
      nixpkgs-godot
      nixpkgs-mesa
      ;
  };
  default = korri-packages;
}
