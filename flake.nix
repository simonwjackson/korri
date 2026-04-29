{
  description = "Starter React + Effect RPC app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    nixpkgs,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        commonPackages = with pkgs; [
          bash
          coreutils
          git
          gitleaks
          lefthook
          biome
          nixfmt-rfc-style
          bun
          just
          ripgrep
        ];

        commonShellHook = ''
          repo_root="$PWD"

          mkdir -p "$repo_root/.nix-bin"

          export PATH="$repo_root/.nix-bin:$PATH:$repo_root/node_modules/.bin"

        '';
      in {
        devShells.ci = pkgs.mkShell {
          buildInputs = commonPackages;
          shellHook =
            commonShellHook
            + ''
              export CI=true
            '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs =
            commonPackages
            ++ (with pkgs; [
              gum
              concurrently
              watchexec
              lsof
              curl
            ]);

          shellHook = commonShellHook;
        };
      }
    );
}
