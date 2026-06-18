{
  description = "Starter React + Effect RPC app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-2405.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";

    bun2nix.url = "github:nix-community/bun2nix?ref=2.1.0";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";

    nix-on-rocks.url = "github:simonwjackson/nix-on-rocks/main";

    fake-08-src.url = "git+https://github.com/jtothebell/fake-08?rev=0d26fd59103941e5f95e0ee665c6e0fb8c6b6f03&submodules=1";
    fake-08-src.flake = false;

    # WASM-4 libretro core. nixpkgs does not package wasm4/wasm4_libretro at
    # this pin, so Korri carries an additive opt-in package lane mirroring
    # libretro-fake-08. Keep submodules enabled: the native/libretro runtime
    # vendors wasm3 and libretro headers in-tree.
    wasm4-src.url = "git+https://github.com/aduros/wasm4?rev=92490f261659921d8b724f10b5b842cdf5a0a1bb&submodules=1";
    wasm4-src.flake = false;

    nixpkgs-godot.url = "github:NixOS/nixpkgs/331800de5053fcebacf6813adb5db9c9dca22a0c";

    # Mesa >= 26 pin for the ryubing-korri Turnip wrapper. The main
    # nixpkgs-25.11 pin ships Mesa 25.2.6, whose Turnip driver is
    # pathologically slow for Ryujinx on Adreno (SM8550); Mesa >= 26
    # fixes it. Narrow-scope cross-channel substitution mirroring the
    # nixpkgs-godot precedent — see product/vendor/ryubing-korri/package.nix.
    nixpkgs-mesa.url = "github:NixOS/nixpkgs/9ae611a455b90cf061d8f332b977e387bda8e1ca";
  };

  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
      "https://simonwjackson.cachix.org"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "simonwjackson.cachix.org-1:MtG0AE8J6bjFO/wD04X5h8MlQh7Sbee8KAJrAsPJydI="
    ];
  };

  outputs = inputs: import ./product/systems/nixos/flake inputs;
}
