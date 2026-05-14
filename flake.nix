{
  description = "Starter React + Effect RPC app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nixpkgs-2405.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-2405,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        pkgs2405 = import nixpkgs-2405 {
          inherit system;
          config.allowUnfree = true;
        };

        versions = import ./nix/versions.nix;
        supportedDesktopSystems = [
          "x86_64-linux"
          "aarch64-linux"
        ];
        isSupportedDesktopSystem = builtins.elem system supportedDesktopSystems;

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
          caddy
        ];

        linuxDesktopRuntimeLibraries = pkgs.lib.optionals pkgs.stdenv.isLinux (
          (with pkgs; [
            gtk3
            webkitgtk_4_1
            libayatana-appindicator
            librsvg
            libsoup_3
            glib
            glibc
            gdk-pixbuf
            at-spi2-core
            pango
            cairo
            gsettings-desktop-schemas
            glib-networking
          ])
          ++ [ pkgs.stdenv.cc.cc.lib ]
        );

        deviceDesktopRuntimeLibraries = pkgs.lib.optionals pkgs.stdenv.isLinux [
          pkgs2405.webkitgtk_4_1
          pkgs2405.gtk3
        ];

        deviceDesktopDataDirs = pkgs.lib.optionals pkgs.stdenv.isLinux [
          pkgs2405.gsettings-desktop-schemas
          pkgs2405.gtk3
        ];

        linuxDesktopPackages = pkgs.lib.optionals pkgs.stdenv.isLinux (
          (with pkgs; [
            pkg-config
            cmake
            gcc
            patchelf
          ])
          ++ linuxDesktopRuntimeLibraries
        );

        linuxDesktopShellHook = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
          export KORRI_NIX_LD_INTERPRETER=${pkgs.stdenv.cc.bintools.dynamicLinker}
          export KORRI_NIX_LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath linuxDesktopRuntimeLibraries}
        '';

        commonShellHook = ''
          repo_root="$PWD"

          mkdir -p "$repo_root/.nix-bin"

          export PATH="$repo_root/.nix-bin:$PATH:$repo_root/node_modules/.bin"
          export PW_TEST_HTML_REPORT_OPEN="never"
          export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

        '';

        bunDepsSrc = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.unions [
            ./package.json
            ./bun.lock
          ];
        };

        bunDeps = import ./nix/bun-deps.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = bunDepsSrc;
          outputHash =
            if builtins.isAttrs versions.bunDepsHash then
              versions.bunDepsHash.${system}
            else
              versions.bunDepsHash;
        };

        korriPortal = import ./nix/korri-portal.nix {
          inherit pkgs;
          src = self;
          inherit bunDeps;
        };

        korriPortalDevice = import ./nix/korri-portal.nix {
          inherit pkgs;
          src = self;
          inherit bunDeps;
          nativeBridgeUrl = "ws://127.0.0.1:3002";
        };

        korriInputd = import ./nix/korri-inputd.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = self;
          inherit bunDeps;
        };

        electrobunBinaries =
          if isSupportedDesktopSystem then
            import ./nix/electrobun-binaries.nix {
              inherit pkgs system versions;
              lib = pkgs.lib;
            }
          else
            null;

        korriDesktop =
          if isSupportedDesktopSystem then
            import ./nix/korri-desktop.nix {
              inherit pkgs system bunDeps;
              lib = pkgs.lib;
              src = self;
              electrobunBinaries = electrobunBinaries;
              portal = korriPortal;
              runtimeLibraries = linuxDesktopRuntimeLibraries;
            }
          else
            null;

        korriDesktopDevice =
          if isSupportedDesktopSystem then
            import ./nix/korri-desktop.nix {
              inherit pkgs system bunDeps;
              lib = pkgs.lib;
              src = self;
              electrobunBinaries = electrobunBinaries;
              portal = korriPortalDevice;
              runtimeLibraries = linuxDesktopRuntimeLibraries;
              deviceRuntimeLibraries = deviceDesktopRuntimeLibraries;
              deviceDesktopDataDirs = deviceDesktopDataDirs;
              deviceBinaryAliases = [ "korri-desktop-odin" ];
              deviceGioExtraModules = pkgs2405.glib-networking;
            }
          else
            null;
      in
      {
        packages = {
          bun-deps = bunDeps;
          korri-portal = korriPortal;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          korri-inputd = korriInputd;
        }
        // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
          electrobun-cli = electrobunBinaries.cli;
          electrobun-core = electrobunBinaries.core;
          korri-desktop = korriDesktop;
          korri-desktop-device = korriDesktopDevice;
          korri-desktop-odin = korriDesktopDevice;
          default = korriDesktop;
        };

        apps = pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          korri-inputd = {
            type = "app";
            program = "${korriInputd}/bin/korri-inputd";
          };
        } // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
          default = {
            type = "app";
            program = "${korriDesktop}/bin/korri-desktop";
          };
          korri-desktop = {
            type = "app";
            program = "${korriDesktop}/bin/korri-desktop";
          };
          korri-desktop-device = {
            type = "app";
            program = "${korriDesktopDevice}/bin/korri-desktop-device";
          };
          korri-desktop-odin = {
            type = "app";
            program = "${korriDesktopDevice}/bin/korri-desktop-odin";
          };
        };

        devShells.ci = pkgs.mkShell {
          buildInputs = commonPackages;
          shellHook = commonShellHook + ''
            export CI=true
          '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs =
            commonPackages
            ++ (with pkgs; [
              gum
              concurrently
              hivemind
              watchexec
              lsof
              curl
              nodejs_20
              playwright-driver.browsers
            ])
            ++ linuxDesktopPackages;

          shellHook = commonShellHook + linuxDesktopShellHook;
        };
      }
    )
    // {
      nixosModules = rec {
        korri-frontend = import ./nix/modules/korri-frontend.nix { korri = self; };
        korri-inputd = import ./nix/modules/korri-inputd.nix { korri = self; };
        korri = {
          imports = [
            korri-frontend
            korri-inputd
          ];
        };
        default = korri;
      };
    };
}
