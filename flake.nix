{
  description = "Korri";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane.url = "github:ipetkov/crane";
    proseql = {
      url = "github:simonwjackson/proseql/7ba57cf17c01b15ccdb030237a96b6376a349253";
      flake = false;
    };
  };

  # This flake is an index: it wires inputs and composes per-area nix
  # expressions that live next to the code they serve. No derivations or
  # shells are defined inline here.
  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      crane,
      proseql,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
          # Required by the Android SDK composition in clients/android.
          config = {
            android_sdk.accept_license = true;
            allowUnfree = true;
          };
        };
        craneLib = (crane.mkLib pkgs).overrideToolchain pkgs.rust-bin.stable.latest.default;
      in
      {
        apps = import ./nix/tasks.nix { inherit pkgs proseql; };
        devShells.android = import ./clients/android/devshell.nix { inherit pkgs; };
        devShells.portal = import ./clients/portal/devshell.nix { inherit pkgs; };
        devShells.korrid = import ./services/korrid/devshell.nix { inherit pkgs proseql; };
        devShells.retroarch = import ./runtimes/retroarch/devshell.nix { inherit pkgs; };
        packages.korrid = import ./services/korrid/package.nix {
          inherit pkgs proseql craneLib;
        };
        packages.default = self.packages.${system}.korrid;
      }
    );
}
