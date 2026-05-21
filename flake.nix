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
          fallow_bin="$repo_root/.nix-bin/fallow"
          fallow_detect_libc_hook="$repo_root/.nix-bin/fallow-detect-libc-musl.cjs"

          mkdir -p "$repo_root/.nix-bin"

          cat > "$fallow_detect_libc_hook" <<'EOF'
          const Module = require("module");
          const originalLoad = Module._load;

          Module._load = function loadWithFallowMusl(request, parent, isMain) {
            if (request === "detect-libc") {
              return { familySync: () => "musl" };
            }

            return originalLoad.apply(this, arguments);
          };
          EOF

          cat > "$fallow_bin" <<'EOF'
          #!/usr/bin/env bash
          set -euo pipefail

          script_dir="$(cd "$(dirname "''${BASH_SOURCE[0]}")" && pwd)"
          path_without_script_dir="$(printf '%s' "$PATH" | tr ':' '\n' | grep -vxF "$script_dir" | paste -sd ':' - || true)"
          export PATH="$path_without_script_dir"

          if [[ "$(uname -s)" == "Linux" && -f /etc/NIXOS ]]; then
            fallow_detect_libc_hook="$script_dir/fallow-detect-libc-musl.cjs"

            if [[ -n "''${NODE_OPTIONS:-}" ]]; then
              export NODE_OPTIONS="--require $fallow_detect_libc_hook $NODE_OPTIONS"
            else
              export NODE_OPTIONS="--require $fallow_detect_libc_hook"
            fi
          fi

          exec bun x fallow "$@"
          EOF
          chmod +x "$fallow_bin"

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

        korriGameStream = import ./nix/korri-game-stream.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = self;
          inherit bunDeps;
        };

        korriCli = import ./nix/korri-cli.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = self;
          inherit bunDeps;
        };

        korriServer = import ./nix/korri-server.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = self;
          inherit bunDeps;
        };

        # korri-server bundles the headless source binaries (korri-api,
        # korri-lan-stream-advertise) alongside its main server binary, so the
        # headless-source package output is satisfied by the same derivation.
        # The dedicated slim package was removed when the server absorbed those
        # binaries; resurrect a slim variant only if downstream consumers need
        # to avoid the server closure.
        korriHeadlessSource = korriServer;

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
          korri-game-stream = korriGameStream;
          korri-cli = korriCli;
          korri-server = korriServer;
          korri-headless-source = korriHeadlessSource;
        }
        // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
          electrobun-cli = electrobunBinaries.cli;
          electrobun-core = electrobunBinaries.core;
          korri-desktop = korriDesktop;
          korri-desktop-device = korriDesktopDevice;
          default = korriDesktop;
        };

        apps =
          pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
            korri-inputd = {
              type = "app";
              program = "${korriInputd}/bin/korri-inputd";
            };
            korri-game-stream = {
              type = "app";
              program = "${korriGameStream}/bin/korri-game-stream-runner";
            };
            korri-cli = {
              type = "app";
              program = "${korriCli}/bin/korri";
            };
            korri-server = {
              type = "app";
              program = "${korriServer}/bin/korri-server";
            };
            korri-api = {
              type = "app";
              program = "${korriHeadlessSource}/bin/korri-api";
            };
            korri-lan-stream-advertise = {
              type = "app";
              program = "${korriHeadlessSource}/bin/korri-lan-stream-advertise";
            };
          }
          // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
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
        korri-client = import ./nix/modules/korri-client.nix { korri = self; };
        korri-inputd = import ./nix/modules/korri-inputd.nix { korri = self; };
        korri-game-stream = import ./nix/modules/korri-game-stream.nix { korri = self; };
        korri-headless-source = import ./nix/modules/korri-headless-source.nix { korri = self; };
        korri-server = import ./nix/modules/korri-server.nix { korri = self; };
        korri = {
          imports = [
            korri-client
            korri-inputd
            korri-headless-source
            korri-server
          ];
        };
        default = korri;
      };
    };
}
