{
  nix-on-rocks,
  wasm4-src,
  nixpkgs-godot,
  ...
}:

rec {
  # Top-level overlays so downstream flakes (mountainous host configs,
  # bespoke device images) can pick up Korri-downstream shared runtime packages
  # by adding `korri.overlays.default` to their own `nixpkgs.overlays`.
  # Plugin package overlays are composed separately by explicit product/image
  # plugin composition.
  korri-packages = import ../overlays/korri-packages.nix {
    inherit
      nix-on-rocks
      wasm4-src
      nixpkgs-godot
      ;
  };
  default = korri-packages;
}
