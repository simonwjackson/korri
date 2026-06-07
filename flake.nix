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

    smbr-src.url = "github:JHDev2006/Super-Mario-Bros.-Remastered-Public?rev=21b068182fdf07bf5aa7c73b4d399650970fd2f0";
    smbr-src.flake = false;

    sm127-src.url = "github:Level-Share-Square/SuperMario127?rev=6118c65d8e799dae73f2c02596af827c8056a330";
    sm127-src.flake = false;

    nixpkgs-godot.url = "github:NixOS/nixpkgs/331800de5053fcebacf6813adb5db9c9dca22a0c";
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
