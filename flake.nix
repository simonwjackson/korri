{
  description = "Korri";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    inputplumber-nixpkgs.url = "github:NixOS/nixpkgs/9a37a7b2ae651b6182ef08d0d446a964339bcdfe";
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
      inputplumber-nixpkgs,
      flake-utils,
      rust-overlay,
      crane,
      proseql,
    }:
    let
      nixosModules = {
        korri-input = import ./services/inputd/nix/korri-input.nix { korri = self; };
        korrid-linux-host = import ./services/korrid/nixos-module.nix { korri = self; };
      };
    in
    {
      inherit nixosModules;
    }
    // flake-utils.lib.eachDefaultSystem (
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
        korridPackage = import ./services/korrid/package.nix {
          inherit pkgs proseql crane;
        };
        inputplumber = import ./services/inputd/nix {
          inherit
            pkgs
            system
            crane
            korridPackage
            ;
          inputplumberNixpkgs = inputplumber-nixpkgs;
          korriInputModule = nixosModules.korri-input;
          korridHostModule = nixosModules.korrid-linux-host;
        };
      in
      {
        apps = import ./nix/tasks.nix { inherit pkgs proseql; };
        devShells.android = import ./clients/android/devshell.nix { inherit pkgs; };
        devShells.portal = import ./clients/portal/devshell.nix { inherit pkgs; };
        devShells.korrid = import ./services/korrid/devshell.nix { inherit pkgs proseql; };
        devShells.inputd = import ./services/inputd/devshell.nix { inherit pkgs; };
        devShells.retroarch = import ./plugins/retroarch/android/devshell.nix { inherit pkgs; };
        packages = {
          korrid = korridPackage;
          default = self.packages.${system}.korrid;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux inputplumber.packages;
        checks = pkgs.lib.optionalAttrs pkgs.stdenv.isLinux inputplumber.checks;
      }
    );
}
