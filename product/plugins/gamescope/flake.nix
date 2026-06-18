{
  description = "Korri Gamescope plugin package lane";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/0c6db2b5d257d845bbee67a38dee43bbca3bd462";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
        gamescope-korri = pkgs.callPackage ./packages/gamescope-korri/default.nix {
          gamescope = pkgs.gamescope;
        };
      in
      {
        packages = {
          inherit gamescope-korri;
          default = gamescope-korri;
        };

        checks = {
          gamescope-korri = gamescope-korri;
        };
      }
    );
}
