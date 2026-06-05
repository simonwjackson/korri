{
  description = "Starter React + Effect RPC app";

  inputs = {
    # Pinned to nixos-25.11 (same channel as nix-on-rocks) so the kiosk
    # image closure is single-channel and fully covered by cache.nixos.org
    # aarch64 binaries. The previous nixpkgs-unstable pin diverged from
    # nix-on-rocks's pin and forced uncached aarch64 rebuilds of nodejs-slim
    # and everything it transitively reaches through bun2nix.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-2405.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix?ref=2.1.0";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    nix-on-rocks.url = "github:simonwjackson/nix-on-rocks/main";

    # PICO-8 libretro core. Pinned to the same commit ROCKNIX ships in its
    # `fake08-lr` package (commit 0d26fd59, 2024-09-02), which is the most
    # recent revision known to build the libretro target on a modern gcc.
    # The v0.0.2.20 tag (2023) predates upstream's `<cstdint>` include
    # fixes and fails to compile on gcc 13+ with errors like
    # `'uint8_t' does not name a type`. Bump via
    # `nix flake update fake-08-src` and verify the closure-shape check
    # still passes.
    #
    # `submodules=1` is required: the libretro Makefile reads sources from
    # the in-tree `libs/z8lua` submodule, which the default tarball fetch
    # would omit and the build would fail at `libs/z8lua/eris.o`.
    fake-08-src.url = "git+https://github.com/jtothebell/fake-08?rev=0d26fd59103941e5f95e0ee665c6e0fb8c6b6f03&submodules=1";
    fake-08-src.flake = false;

    # Super Mario Bros. Remastered (community Godot remake by JHDev2006)
    # source pin. Pinned to the `1.1-26w21c` release tag (commit
    # 21b06818). `flake = false` because upstream has no flake.nix
    # and no submodules. Bump via `nix flake update smbr-src` and
    # re-run `nix flake check` so the colocated `smb-remastered-check`
    # re-verifies that the in-game ROM allowlist hashes still match
    # (a change there would silently invalidate every user's
    # previously accepted `baserom.nes`).
    smbr-src.url = "github:JHDev2006/Super-Mario-Bros.-Remastered-Public?rev=21b068182fdf07bf5aa7c73b4d399650970fd2f0";
    smbr-src.flake = false;

    # Super Mario 127 (community Godot fan game by Level Share Square)
    # source pin. Pinned to the v0.9.1 release tag (commit
    # 6118c65d). `flake = false` because upstream has no flake.nix
    # and no submodules. Bump via `nix flake update sm127-src` and
    # re-run the colocated `super-mario-127-check` on x86_64 and
    # aarch64 so the Godot export, level-format marker, and direct
    # launch patch are deliberately re-verified.
    sm127-src.url = "github:Level-Share-Square/SuperMario127?rev=6118c65d8e799dae73f2c02596af827c8056a330";
    sm127-src.flake = false;

    # Secondary nixpkgs pin carrying Godot 4.6.3-stable (editor +
    # export templates, pre-cached on cache.nixos.org for both
    # x86_64-linux and aarch64-linux). Only consumed by the
    # `smb-remastered` vendor package, which exports a Godot 4.6
    # project; the repo's main `nixpkgs.nixos-25.11` pin is still on
    # Godot 4.5.1, which cannot honestly export a project whose
    # `project.godot` declares `config/features=("4.6", ...)`. Mirrors
    # the existing `nixpkgs-2405` precedent for narrow-scope
    # cross-channel substitution; deliberately not `follows`-linked
    # to `nixpkgs` so the prebuilt Godot binaries stay cache-hits
    # instead of rebuilding against our older nixpkgs.
    nixpkgs-godot.url = "github:NixOS/nixpkgs/331800de5053fcebacf6813adb5db9c9dca22a0c";
  };

  # Pull the prebuilt bun2nix (Rust CLI + Zig cache-entry-creator) from the
  # nix-community binary cache instead of building it from source on every
  # fresh checkout.
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

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-2405,
      flake-utils,
      bun2nix,
      nix-on-rocks,
      fake-08-src,
      smbr-src,
      sm127-src,
      nixpkgs-godot,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        korriPackagesOverlay = import ./product/systems/nixos/overlays/korri-packages.nix {
          inherit
            nix-on-rocks
            fake-08-src
            smbr-src
            sm127-src
            nixpkgs-godot
            ;
        };

        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [
            bun2nix.overlays.default
            korriPackagesOverlay
          ];
        };

        pkgs2405 = import nixpkgs-2405 {
          inherit system;
          config.allowUnfree = true;
        };

        desktop = import ./product/apps/desktop {
          inherit
            pkgs
            pkgs2405
            system
            bunDeps
            ;
          lib = pkgs.lib;
          src = korriSources.desktop;
          portal = korriPortal;
        };
        hasRocknixGuestCompatible = builtins.getEnv "ROCKNIX_GUEST_DEVICE_COMPATIBLE" != "";
        isSupportedDesktopSystem = desktop.isSupportedSystem;
        isX86Linux = system == "x86_64-linux";
        productRevision = self.rev or self.dirtyRev or "local-candidate";
        productShortRevision =
          if self ? rev then
            builtins.substring 0 12 self.rev
          else if self ? dirtyRev then
            builtins.substring 0 12 self.dirtyRev
          else
            "local";
        productRevisionIsClean = self ? rev;
        nixOnRocksRevision = nix-on-rocks.rev or nix-on-rocks.dirtyRev or "unknown";
        productRegistry = import ./product/systems/nixos/flake/products.nix { inherit nix-on-rocks; };
        explicitProductList = productRegistry.explicitProductList;
        explicitProducts = productRegistry.explicitProducts;
        byCompatibleProduct = productRegistry.byCompatible;
        attrsForProducts = f: builtins.listToAttrs (map f explicitProductList);

        commonPackages =
          (with pkgs; [
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
          ])
          ++ [
            # The bun2nix CLI used by `just refresh-bun-deps`. We take it
            # directly from the flake input's package output (the plain Rust
            # binary derivation) rather than from `pkgs.bun2nix`, because the
            # overlay exposes `bun2nix` as an extended attrset with .hook /
            # .fetchBunDeps that mkShell's buildInputs validation rejects.
            # Using the flake-pinned binary keeps the CLI version locked to
            # the same revision that processes tools/nix/generated/bun.nix in fetchBunDeps.
            bun2nix.packages.${system}.bun2nix
          ];

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

        bunDependencyCache = import ./tools/nix/bun-deps {
          inherit pkgs;
          lib = pkgs.lib;
        };
        bunDeps = bunDependencyCache.deps;

        # Sources used by the Bun/Electrobun package derivations. Keep these
        # narrower than the flake root so docs, backlog, artifact downloads,
        # test tooling, and unrelated Nix/package work do not invalidate Fuji's
        # SM8550 runtime package builds.
        korriSources =
          let
            fileset = pkgs.lib.fileset;
            common = [
              ./bun.lock
              ./bunfig.toml
              ./package.json
              ./tsconfig.api.json
              ./tsconfig.json
              ./tsconfig.server.json
            ];
            mkSource =
              extra:
              fileset.toSource {
                root = ./.;
                fileset = fileset.unions (common ++ extra);
              };
            sharedRuntime = [
              ./product/platform
            ];
            deviceRuntime = [
              ./product/apps/portal
              ./product/services/device
              ./tools/library
            ]
            ++ sharedRuntime;
          in
          {
            portal = mkSource (
              [
                ./components.json
                ./vite.config.mjs
                ./product/apps/desktop/runtime-config-shape.ts
                ./product/apps/portal
                ./product/themes
              ]
              ++ sharedRuntime
            );
            desktop = mkSource (
              [
                ./electrobun.config.ts
                ./product/apps/desktop
                ./product/apps/cli
              ]
              ++ sharedRuntime
            );
            inputd = mkSource (deviceRuntime ++ [ ./tools/types ]);
            gameStream = mkSource deviceRuntime;
            sessiond = mkSource deviceRuntime;
            cli = mkSource ([ ./product/apps/cli ] ++ deviceRuntime);
            server = mkSource (
              [
                ./product/apps/cli
                ./product/services/server
              ]
              ++ deviceRuntime
            );
          };

        # Single portal build for every desktop variant. The native input-bridge
        # URL is now pushed at runtime via window.__korriRuntime (see
        # product/apps/portal/main.tsx and product/apps/desktop/runtime-config.ts).
        korriPortal = import ./product/apps/portal/package.nix {
          inherit pkgs;
          src = korriSources.portal;
          inherit bunDeps;
        };

        korriInputd = import ./product/services/device/nix/inputd.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.inputd;
          inherit bunDeps;
        };

        korriGameStream = import ./product/services/device/nix/game-stream.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.gameStream;
          inherit bunDeps;
        };

        korriSessiond = import ./product/services/device/nix/sessiond.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.sessiond;
          inherit bunDeps;
        };

        korriCli = import ./product/apps/cli/package.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.cli;
          inherit bunDeps;
        };

        korriGamescopeControlBridge = import ./product/services/device/nix/gamescope-control-bridge.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.cli;
          inherit bunDeps;
        };

        korriServer = import ./product/services/server/package.nix {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.server;
          inherit bunDeps;
        };

        # korri-server bundles the headless source binaries (korri-api,
        # korri-lan-stream-advertise) alongside its main server binary, so the
        # headless-source package output is satisfied by the same derivation.
        # The dedicated slim package was removed when the server absorbed those
        # binaries; resurrect a slim variant only if downstream consumers need
        # to avoid the server closure.
        korriHeadlessSource = korriServer;

        electrobunBinaries = desktop.packages.binaries;
        korriDesktopUnwrapped = desktop.packages.unwrapped;
        korriDesktop = desktop.packages.host;
        korriDesktopDevice = desktop.packages.device;
        korriDesktopX86Kiosk = desktop.packages.x86Kiosk;

        korriImages = import ./product/systems/nixos/images/common.nix {
          korri = self;
          inherit nixpkgs system;
          overlays = [ korriPackagesOverlay ];
        };

        libretroFake08 = pkgs.libretro-fake-08;
        smbRemastered = pkgs.smb-remastered;
        superMario127 = pkgs.super-mario-127;
        yoshisFabricationStation = pkgs.yoshis-fabrication-station;

        # The named outputs match the overlay-substituted runtime package names
        # so downstream consumers can ask for either name and get the same
        # derivation.
        gamescopeKorri = pkgs.gamescope;
        sunshineKorri = pkgs.sunshine;
        moonlightEmbeddedKorri = pkgs.moonlight-embedded;

        korriHeadlessSystem = korriImages.mkHeadlessSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };

        korriKioskSystem = korriImages.mkKioskSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };

        korriDesktopLabSystem = korriImages.mkDesktopLabSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };

        korriSourceMachineSystem = korriImages.mkSourceMachineSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };

        korriKioskLiveUsbSystem = korriImages.mkLiveUsbKioskSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };

        korriKioskLiveUsbDeveloperSystem = korriImages.mkLiveUsbKioskSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
          modules = [
            {
              services.korri.liveUsbPersistence.artifact = "developer";
            }
          ];
        };

        korriKioskLiveUsbRuntimeSystem = korriImages.mkLiveUsbKioskRuntimeSystem {
          platformModules = [ ./product/systems/nixos/images/platforms/x86.nix ];
        };
      in
      {
        packages = {
          korri-portal = korriPortal;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          korri-inputd = korriInputd;
          korri-game-stream = korriGameStream;
          korri-sessiond = korriSessiond;
          korri-cli = korriCli;
          korri-gamescope-control-bridge = korriGamescopeControlBridge;
          korri-server = korriServer;
          korri-headless-source = korriHeadlessSource;
          sunshine-korri = sunshineKorri;
          moonlight-embedded-korri = moonlightEmbeddedKorri;
          libretro-fake-08 = libretroFake08;
          gamescope-korri = gamescopeKorri;
          smb-remastered = smbRemastered;
          super-mario-127 = superMario127;
          yoshis-fabrication-station = yoshisFabricationStation;
        }
        // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
          electrobun-cli = electrobunBinaries.cli;
          electrobun-core = electrobunBinaries.core;
          korri-desktop-unwrapped = korriDesktopUnwrapped;
          korri-desktop = korriDesktop;
          korri-desktop-device = korriDesktopDevice;
          default = korriDesktop;
        }
        // pkgs.lib.optionalAttrs isX86Linux {
          korri-desktop-x86-kiosk = korriDesktopX86Kiosk;
          korri-headless-system = korriHeadlessSystem.config.system.build.toplevel;
          korri-kiosk-system = korriKioskSystem.config.system.build.toplevel;
          korri-desktop-lab-system = korriDesktopLabSystem.config.system.build.toplevel;
          korri-source-machine-system = korriSourceMachineSystem.config.system.build.toplevel;
          korri-kiosk-live-iso = korriKioskLiveUsbSystem.config.system.build.isoImage;
          korri-kiosk-live-developer-iso = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
        }
        // pkgs.lib.optionalAttrs (system == "aarch64-linux") (
          attrsForProducts (product: {
            name = product.kioskSystemPackageName;
            value = self.nixosConfigurations.${product.configName}.config.system.build.toplevel;
          })
        )
        // pkgs.lib.optionalAttrs (system == "aarch64-linux" && hasRocknixGuestCompatible) {
          ${byCompatibleProduct.kioskSystemPackageName} =
            self.nixosConfigurations.${byCompatibleProduct.configName}.config.system.build.toplevel;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux (
          attrsForProducts (product: {
            name = product.rootfsPackageName;
            value = import ./product/systems/rocknix/rootfs.nix {
              inherit pkgs;
              configuration = self.nixosConfigurations.${product.configName};
            };
          })
        )
        // pkgs.lib.optionalAttrs (pkgs.stdenv.isLinux && hasRocknixGuestCompatible) {
          ${byCompatibleProduct.rootfsPackageName} = import ./product/systems/rocknix/rootfs.nix {
            inherit pkgs;
            configuration = self.nixosConfigurations.${byCompatibleProduct.configName};
          };
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux (
          attrsForProducts (product: {
            name = product.productPayloadPackageName;
            value = import ./product/systems/rocknix/product-payload.nix {
              inherit
                pkgs
                productRevision
                productShortRevision
                productRevisionIsClean
                ;
              rootfsPackage = self.packages.${system}.${product.rootfsPackageName};
              device = product.id;
              inherit (product) compatible buildTarget;
              authorityRepo = "simonwjackson/korri";
              sourceSubdir = ".";
              substrateRevision = nixOnRocksRevision;
            };
          })
        );

        lib = {
          korriImages = korriImages;
        }
        // pkgs.lib.optionalAttrs isSupportedDesktopSystem {
          # Downstream consumers (mountainous, future device profiles) can
          # build their own variants without vendoring build logic:
          #   inputs.korri.lib.${system}.wrapKorriDesktop {
          #     korri-desktop-unwrapped =
          #       inputs.korri.packages.${system}.korri-desktop-unwrapped;
          #     webkitgtk_4_1 = customPkgs.webkitgtk_4_1;
          #     ...
          #     profile = "steamdeck";
          #   }
          wrapKorriDesktop = desktop.lib.wrap;
        };

        checks =
          pkgs.lib.optionalAttrs isX86Linux {
            korri-desktop-build-graph = import ./tools/testing/nix/korri-desktop-build-graph-check.nix {
              inherit pkgs pkgs2405;
              host = korriDesktop;
              device = korriDesktopDevice;
              x86Kiosk = korriDesktopX86Kiosk;
              unwrapped = korriDesktopUnwrapped;
            };
            korri-package-outputs = import ./tools/testing/nix/korri-package-outputs-check.nix {
              inherit pkgs;
              packages = self.packages.${system};
            };
            korri-image-outputs = import ./tools/testing/nix/korri-image-outputs-check.nix {
              inherit pkgs;
              packages = self.packages.${system};
              apps = self.apps.${system};
              imageLib = korriImages;
              x86Platform = ./product/systems/nixos/images/platforms/x86.nix;
              liveUsbConfigCheck = import ./tools/testing/nix/korri-live-usb-config-check.nix {
                inherit pkgs;
                liveUsbSystem = korriKioskLiveUsbSystem;
              };
              liveUsbDeveloperConfigCheck = import ./tools/testing/nix/korri-live-usb-config-check.nix {
                inherit pkgs;
                liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
                expectedArtifact = "developer";
              };
              liveUsbVmSmokeCheck = import ./tools/testing/nix/korri-live-usb-vm-smoke.nix {
                inherit pkgs;
                imageLib = korriImages;
                x86Platform = ./product/systems/nixos/images/platforms/x86.nix;
              };
              hardwareFactSourceFiles = [
                ./product/systems/nixos/images/common.nix
                ./product/systems/nixos/images/headless.nix
                ./product/systems/nixos/images/kiosk.nix
                ./product/systems/nixos/images/desktop-lab.nix
                ./product/systems/nixos/images/platforms/x86.nix
              ];
            };
          }
          // {
            # Module-eval checks: pure Nix evaluation, no platform-specific build
            # graph, safe to gate on any system.
            korri-bun-deps-policy = bunDependencyCache.check;
            korri-compositor-module = import ./tools/testing/nix/korri-compositor-module-check.nix {
              inherit pkgs;
              korriCompositorModule = self.nixosModules.korri-compositor;
            };
            korri-input-module = import ./tools/testing/nix/korri-input-module-check.nix {
              inherit pkgs;
              korriInputModule = self.nixosModules.korri-input;
            };
            korri-game-stream-module = import ./tools/testing/nix/korri-game-stream-module-check.nix {
              inherit pkgs;
              korriGameStreamModule = self.nixosModules.korri-game-stream;
            };
            korri-sessiond-module = import ./tools/testing/nix/korri-sessiond-module-check.nix {
              inherit pkgs;
              korriSessiondModule = self.nixosModules.korri-sessiond;
            };
            korri-source-machine-image = import ./tools/testing/nix/korri-source-machine-image-check.nix {
              inherit pkgs;
              sourceMachineSystem = korriSourceMachineSystem;
            };
            korri-server-module = import ./tools/testing/nix/korri-server-module-check.nix {
              inherit pkgs;
              korriServerModule = self.nixosModules.korri-server;
            };
            korri-module-identity-audit = import ./tools/testing/nix/korri-module-identity-audit-check.nix {
              inherit pkgs;
              src = ./product/systems/nixos/modules;
            };
          }
          // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
            korri-sunshine-runtime-bitrate-patch =
              import ./tools/testing/nix/korri-sunshine-runtime-bitrate-patch-check.nix
                {
                  inherit pkgs;
                  patchPaths = [
                    ./product/vendor/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch
                    ./product/vendor/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch
                    ./product/vendor/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch
                    ./product/vendor/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch
                    ./product/vendor/sunshine-korri/patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch
                  ];
                  readmePath = ./product/vendor/sunshine-korri/README.md;
                  sunshinePackagePath = ./product/vendor/sunshine-korri/package.nix;
                  moonlightPatchPaths = [
                    ./product/vendor/moonlight-embedded-korri/patches/0005a-add-sunshine-runtime-settings-protocol-sender.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch
                  ];
                  moonlightReadmePath = ./product/vendor/moonlight-embedded-korri/README.md;
                  sunshinePackage = self.packages.${system}.sunshine-korri;
                  moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
                };
            korri-moonlight-control-protocol-patch =
              import ./tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix
                {
                  inherit pkgs;
                  patchPaths = [
                    ./product/vendor/moonlight-embedded-korri/patches/0006-add-local-control-observability-ipc.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch
                    ./product/vendor/moonlight-embedded-korri/patches/0012-add-runtime-touch-bounds-control.patch
                  ];
                  absoluteTouchPatchPath = ./product/vendor/moonlight-embedded-korri/patches/0004-add-absolutetouch-flag-for-tap-to-click.patch;
                  readmePath = ./product/vendor/moonlight-embedded-korri/README.md;
                  moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
                };
            korri-retroarch-xdelta = import ./tools/testing/nix/korri-retroarch-xdelta-check.nix {
              inherit pkgs;
            };
            libretro-fake-08-check = import ./product/vendor/libretro-fake-08/check.nix {
              inherit pkgs;
              libretroFake08Package = self.packages.${system}.libretro-fake-08;
            };
            smb-remastered-check = import ./product/vendor/super-mario-bros-remastered/check.nix {
              inherit pkgs;
              smbRemasteredPackage = self.packages.${system}.smb-remastered;
            };
            super-mario-127-check = import ./product/vendor/super-mario-127/check.nix {
              inherit pkgs;
              superMario127Package = self.packages.${system}.super-mario-127;
            };
            yoshis-fabrication-station-check = import ./product/vendor/yoshis-fabrication-station/check.nix {
              inherit pkgs;
              yfsPackage = self.packages.${system}.yoshis-fabrication-station;
            };
          }
          // pkgs.lib.optionalAttrs isX86Linux {
            korri-sm8550-kiosk-config = import ./tools/testing/nix/korri-rocknix-sm8550-config-check.nix {
              inherit pkgs;
              products = explicitProducts;
              byCompatibleProduct = byCompatibleProduct;
              thorSystem = self.nixosConfigurations.${explicitProducts.thor.configName};
              soboSystem = self.nixosConfigurations.${explicitProducts.odin2portal.configName};
              byCompatibleSystem = self.nixosConfigurations.${byCompatibleProduct.configName} or null;
              targetPackages = self.packages.aarch64-linux;
              hostPackages = self.packages.${system};
              configurations = self.nixosConfigurations;
              hardwareFactSourceFiles = [
                ./product/systems/nixos/images/common.nix
                ./product/systems/nixos/images/headless.nix
                ./product/systems/nixos/images/kiosk.nix
                ./product/systems/nixos/images/desktop-lab.nix
                ./product/systems/nixos/images/platforms/x86.nix
              ];
              # The SM8550 platform adapter is the one image-side file
              # that *should* know about RockNix — it composes the
              # substrate into a Korri appliance. The literal-scan
              # asserts that even this file no longer hard-codes the
              # substrate's hardware capability values (v4l2m2m /
              # pulseaudio), which now come from
              # `rocknix.sm8550.video.decodeBackend` and
              # `rocknix.sm8550.audio.api`.
              sm8550PlatformAdapterSourceFile = ./product/systems/nixos/images/platforms/rocknix-sm8550.nix;
            };
            korri-product-payload =
              let
                fixtureRevision = "9f0ed234b4eff39f76801c09daedc9795c8b07fb";
                fixtureShortRevision = builtins.substring 0 12 fixtureRevision;
                fixtureRootfs = pkgs.runCommand "korri-rootfs-fixture" { } ''
                  mkdir -p "$out/tarball"
                  printf 'fixture rootfs\n' > "$out/tarball/rocknix-layer10b-guest-rootfs-aarch64-linux.tar.zst"
                '';
                mkFixturePayload =
                  product:
                  let
                    fixtureArchiveName = "rocknix-guest-rootfs-${product.id}-${fixtureShortRevision}.tar.zst";
                  in
                  {
                    device = product.id;
                    inherit (product) compatible buildTarget;
                    inherit fixtureArchiveName;
                    fixturePayloadPackage = import ./product/systems/rocknix/product-payload.nix {
                      inherit pkgs;
                      device = product.id;
                      inherit (product) compatible buildTarget;
                      rootfsPackage = fixtureRootfs;
                      authorityRepo = "simonwjackson/korri";
                      sourceSubdir = ".";
                      productRevision = fixtureRevision;
                      productShortRevision = fixtureShortRevision;
                      productRevisionIsClean = true;
                      substrateRevision = "fixture-nix-on-rocks";
                    };
                  };
              in
              import ./tools/testing/nix/korri-rocknix-product-payload-check.nix {
                inherit pkgs;
                targetPackages = self.packages.aarch64-linux;
                hostPackages = self.packages.${system};
                configurations = self.nixosConfigurations;
                contract = import ./product/systems/rocknix/product-payload-contract.nix;
                payloadSpecs = map (
                  product:
                  (mkFixturePayload product)
                  // {
                    expectedBuildTarget = product.buildTarget;
                    expectedRootfsAlias = product.rootfsPackageName;
                    expectedKioskSystemAlias = product.kioskSystemPackageName;
                    expectedConfigAlias = product.configName;
                    payloadPackage = self.packages.${system}.${product.productPayloadPackageName};
                  }
                ) explicitProductList;
              };
            # Named standard-check entry for the Thor lane. The shared check
            # above covers Odin2Portal and Thor together so the two products
            # cannot drift, while this name keeps CI/check ownership explicit.
            korri-thor-product-payload = self.checks.${system}.korri-product-payload;
            korri-live-usb-config = import ./tools/testing/nix/korri-live-usb-config-check.nix {
              inherit pkgs;
              liveUsbSystem = korriKioskLiveUsbSystem;
            };
            korri-live-usb-developer-config = import ./tools/testing/nix/korri-live-usb-config-check.nix {
              inherit pkgs;
              liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
              expectedArtifact = "developer";
            };
            korri-live-usb-vm-smoke = import ./tools/testing/nix/korri-live-usb-vm-smoke.nix {
              inherit pkgs;
              imageLib = korriImages;
              x86Platform = ./product/systems/nixos/images/platforms/x86.nix;
            };
            korri-live-usb-invalid-artifact =
              import ./tools/testing/nix/korri-live-usb-invalid-artifact-check.nix
                {
                  inherit pkgs;
                  imageLib = korriImages;
                  x86Platform = ./product/systems/nixos/images/platforms/x86.nix;
                };
            korri-live-usb-persistence-resolver =
              import ./tools/testing/nix/korri-live-usb-persistence-resolver-check.nix
                {
                  inherit pkgs;
                  resolverScript = ./product/systems/nixos/images/live-usb-persistence-resolver.sh;
                };
            korri-sm8550-build-performance =
              import ./tools/testing/nix/korri-rocknix-build-performance-check.nix
                {
                  inherit pkgs;
                  runtimeSources = korriSources;
                  productionBunPackageNames = bunDependencyCache.productionPackageNames;
                  rootfsBuilder = ./product/systems/rocknix/rootfs.nix;
                };

            korri-standard-native = import ./tools/testing/nix/korri-standard-native-check.nix {
              inherit pkgs;
              ownerMatrix = [
                {
                  name = "korri-bun-deps-policy";
                  owner = "flake-wiring";
                }
                {
                  name = "korri-compositor-module";
                  owner = "module";
                }
                {
                  name = "korri-input-module";
                  owner = "module";
                }
                {
                  name = "korri-game-stream-module";
                  owner = "module";
                }
                {
                  name = "korri-sessiond-module";
                  owner = "module";
                }
                {
                  name = "korri-source-machine-image";
                  owner = "composed-system";
                }
                {
                  name = "korri-server-module";
                  owner = "module";
                }
                {
                  name = "korri-module-identity-audit";
                  owner = "module";
                }
                {
                  name = "korri-sunshine-runtime-bitrate-patch";
                  owner = "package-output";
                }
                {
                  name = "korri-moonlight-control-protocol-patch";
                  owner = "package-output";
                }
                {
                  name = "libretro-fake-08-check";
                  owner = "package-output";
                }
                {
                  name = "smb-remastered-check";
                  owner = "package-output";
                }
                {
                  name = "super-mario-127-check";
                  owner = "package-output";
                }
                {
                  name = "korri-desktop-build-graph";
                  owner = "package-output";
                }
                {
                  name = "korri-package-outputs";
                  owner = "package-output";
                }
                {
                  name = "korri-image-outputs";
                  owner = "composed-system";
                }
                {
                  name = "korri-sm8550-kiosk-config";
                  owner = "composed-system";
                }
                {
                  name = "korri-sm8550-build-performance";
                  owner = "package-output";
                }
                {
                  name = "korri-product-payload";
                  owner = "package-output";
                }
                {
                  name = "korri-thor-product-payload";
                  owner = "package-output";
                }
                {
                  name = "korri-live-usb-config";
                  owner = "composed-system";
                }
                {
                  name = "korri-live-usb-developer-config";
                  owner = "composed-system";
                }
                {
                  name = "korri-live-usb-invalid-artifact";
                  owner = "composed-system";
                }
                {
                  name = "korri-live-usb-persistence-resolver";
                  owner = "composed-system";
                }
              ];
            };
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
            gamescope-control = {
              type = "app";
              program = "${korriGamescopeControlBridge}/bin/gamescope-control";
            };
            gamescope-control-bridge = {
              type = "app";
              program = "${korriGamescopeControlBridge}/bin/gamescope-control-bridge";
            };
            korri-stream-control-bench = {
              type = "app";
              program = "${korriGamescopeControlBridge}/bin/stream-control-bench";
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
          }
          // pkgs.lib.optionalAttrs isX86Linux {
            korri-live-usb-vm = {
              type = "app";
              program = "${
                import ./product/systems/nixos/apps/korri-live-usb-vm.nix {
                  inherit pkgs;
                  vmSystem = korriKioskLiveUsbRuntimeSystem;
                }
              }/bin/korri-live-usb-vm";
            };
            korri-live-usb-qemu = {
              type = "app";
              program = "${
                import ./product/systems/nixos/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
                }
              }/bin/korri-live-usb-qemu";
            };
            korri-live-usb-qemu-persistence = {
              type = "app";
              program = "${
                import ./product/systems/nixos/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
                  persistenceMode = true;
                }
              }/bin/korri-live-usb-qemu-persistence";
            };
            korri-live-usb-developer-qemu = {
              type = "app";
              program = "${
                import ./product/systems/nixos/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
                  appName = "korri-live-usb-developer-qemu";
                }
              }/bin/korri-live-usb-developer-qemu";
            };
            korri-live-usb-developer-qemu-persistence = {
              type = "app";
              program = "${
                import ./product/systems/nixos/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
                  persistenceMode = true;
                  appName = "korri-live-usb-developer-qemu-persistence";
                }
              }/bin/korri-live-usb-developer-qemu-persistence";
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
            ++ desktop.devShell.packages;

          shellHook = commonShellHook + desktop.devShell.shellHook;
        };
      }
    )
    // (
      let
        rocknixTargetSystem = "aarch64-linux";
        productRegistry = import ./product/systems/nixos/flake/products.nix { inherit nix-on-rocks; };
        explicitProductList = productRegistry.explicitProductList;
        byCompatibleProduct = productRegistry.byCompatible;
        attrsForProducts = f: builtins.listToAttrs (map f explicitProductList);
        rocknixImages = import ./product/systems/nixos/images/common.nix {
          korri = self;
          nixpkgs = nix-on-rocks.inputs.nixpkgs;
          system = rocknixTargetSystem;
          overlays = [
            (import ./product/systems/nixos/overlays/korri-packages.nix {
              inherit
                nix-on-rocks
                fake-08-src
                smbr-src
                sm127-src
                nixpkgs-godot
                ;
            })
          ];
        };
        hasRocknixGuestCompatible = builtins.getEnv "ROCKNIX_GUEST_DEVICE_COMPATIBLE" != "";
        rocknixPlatformFor =
          product:
          let
            compatible = builtins.getEnv "ROCKNIX_GUEST_DEVICE_COMPATIBLE";
            inferredChipset =
              if (product.chipset or "") != "by-compatible" then
                product.chipset
              else if compatible == "rockchip,rk3566-rk817-tablet" || compatible == "rockchip,rk3566" then
                "rk3566"
              else
                "sm8550";
            adapter =
              if inferredChipset == "rk3566" then
                ./product/systems/nixos/images/platforms/rocknix-rk3566.nix
              else
                ./product/systems/nixos/images/platforms/rocknix-sm8550.nix;
          in
          import adapter {
            korri = self;
            inherit nixpkgs nix-on-rocks;
            inherit (product) deviceProfile;
          };
        mkRocknixProductSystem =
          product:
          rocknixImages.mkKioskSystem {
            platformModules = [
              (rocknixPlatformFor product)
            ];
          };
        rocknixByCompatibleSystem = rocknixImages.mkKioskSystem {
          platformModules = [
            (rocknixPlatformFor byCompatibleProduct)
          ];
        };
      in
      {
        # Top-level overlays so downstream flakes (mountainous host configs,
        # bespoke device images) can pick up Korri-downstream runtime packages
        # by adding `korri.overlays.default` to their own `nixpkgs.overlays`.
        # Without this, consumers that build their own `pkgs` instance (e.g.
        # mountainous's nixpkgs.lib.nixosSystem) never see the substitution and
        # end up with stock nixpkgs gamescope/sunshine/moonlight-embedded.
        overlays = rec {
          korri-packages = import ./product/systems/nixos/overlays/korri-packages.nix {
            inherit
              nix-on-rocks
              fake-08-src
              smbr-src
              sm127-src
              nixpkgs-godot
              ;
          };
          default = korri-packages;
        };

        nixosConfigurations =
          attrsForProducts (product: {
            name = product.configName;
            value = mkRocknixProductSystem product;
          })
          // nixpkgs.lib.optionalAttrs hasRocknixGuestCompatible {
            ${byCompatibleProduct.configName} = rocknixByCompatibleSystem;
          };

        nixosModules = rec {
          # Power-user opt-in: a module that wires the Korri substrate-package
          # overlay into `nixpkgs.overlays`. Importing this module replaces
          # `pkgs.gamescope`, `pkgs.sunshine`, and `pkgs.moonlight-embedded`
          # for the whole host.
          # Avoid in evaluations where `nixpkgs.pkgs` is set externally (e.g.
          # `pkgs.testers.runNixOSTest`), because that marks
          # `nixpkgs.overlays` read-only. Day-to-day consumers do NOT need
          # this: every Korri product module below already defaults the
          # specific package options (`services.sunshine.package`,
          # `rocknix.sm8550.moonlight.package`) it cares about to the Korri
          # downstream builds, so the substitution happens through the option
          # graph rather than through `pkgs` itself.
          korri-nixpkgs-overlay = import ./product/systems/nixos/modules/korri-nixpkgs-overlay.nix {
            overlay = import ./product/systems/nixos/overlays/korri-packages.nix {
              inherit
                nix-on-rocks
                fake-08-src
                smbr-src
                sm127-src
                nixpkgs-godot
                ;
            };
          };

          # Auto-attached sway pin for the x86 compositor runtime contract.
          # Gamescope is owned by the global Korri package overlay so
          # `pkgs.gamescope` remains `gamescope-korri`. Imported by
          # korri-compositor below so downstream consumers inherit the
          # known-good sway version without touching nixpkgs.overlays
          # themselves. No-ops on non-x86 systems via the overlay itself.
          korri-x86-compositor-overlay =
            import ./product/systems/nixos/modules/korri-x86-compositor-overlay.nix
              {
                overlay = import ./product/systems/nixos/overlays/korri-x86-compositor.nix;
              };

          korri-client = import ./product/systems/nixos/modules/korri-client.nix { korri = self; };
          korri-cli = import ./product/systems/nixos/modules/korri-cli.nix { korri = self; };
          korri-game-stream = import ./product/systems/nixos/modules/korri-game-stream.nix { korri = self; };
          korri-sessiond = import ./product/systems/nixos/modules/korri-sessiond.nix { korri = self; };
          # Per-role input module: provider + inputd peer sub-trees.
          korri-input = import ./product/systems/nixos/modules/korri-input.nix { korri = self; };
          # Per-role compositor module. Bundles the Korri client install so the
          # kiosk-surface sub-tree can default `kiosk.command` to the selected
          # client package without callers wiring it themselves, and imports
          # the input module so `services.korri.input.inputd.*` is in scope
          # when the kiosk surface wires inputd ordering.
          korri-compositor = {
            imports = [
              korri-client
              korri-input
              korri-x86-compositor-overlay
              (import ./product/systems/nixos/modules/korri-compositor.nix { korri = self; })
            ];
          };
          # Server module imports compositor + input alongside its own file so
          # the cross-tree streaming assertions can reference the
          # services.korri.{compositor,input.provider}.enable options. Hosts
          # that only enable services.korri.server without streaming still get
          # those option declarations but no behavior, since each module's
          # config block is gated on its own enable toggle. Duplicate imports
          # dedupe via the `key` field on compositor/input/cli/client modules.
          korri-server = {
            imports = [
              korri-compositor
              korri-input
              (import ./product/systems/nixos/modules/korri-server.nix { korri = self; })
            ];
          };
          # Aggregate composes the three product roles. Compositor and input
          # are listed explicitly even though korri-server transitively
          # imports them, so consumers can read the role topology directly
          # off the aggregate. Duplicate imports dedupe via the `key` field.
          korri = {
            imports = [
              korri-compositor
              korri-input
              korri-server
            ];
          };
          default = korri;
        };
      }
    );
}
