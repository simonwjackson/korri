{
  description = "Starter React + Effect RPC app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
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
  };

  # Pull the prebuilt bun2nix (Rust CLI + Zig cache-entry-creator) from the
  # nix-community binary cache instead of building it from source on every
  # fresh checkout.
  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
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
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        korriPackagesOverlay = import ./nix/overlays/korri-packages.nix {
          inherit nix-on-rocks fake-08-src;
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

        versions = import ./nix/versions.nix;
        supportedDesktopSystems = [
          "x86_64-linux"
          "aarch64-linux"
        ];
        isSupportedDesktopSystem = builtins.elem system supportedDesktopSystems;
        isX86Linux = system == "x86_64-linux";

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
            # the same revision that processes nix/bun.nix in fetchBunDeps.
            bun2nix.packages.${system}.bun2nix
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

        # Full pkgs2405 closure mirroring `linuxDesktopRuntimeLibraries` for the
        # libraries libNativeWrapper.so directly NEEDs. Order matters: pkgs2405
        # entries come first so the loader prefers them; current-nixpkgs glibc
        # / gcc-lib fall in at the end because that is what bun + the launcher's
        # interpreter were patchelfed to use.
        deviceDesktopRuntimeLibraries = pkgs.lib.optionals pkgs.stdenv.isLinux (
          (with pkgs2405; [
            webkitgtk_4_1
            gtk3
            libayatana-appindicator
            librsvg
            libsoup_3
            glib
            gdk-pixbuf
            at-spi2-core
            pango
            cairo
            glib-networking
          ])
          ++ [
            pkgs.glibc
            pkgs.stdenv.cc.cc.lib
          ]
        );

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

        # Lockfile-derived Bun dependency cache.
        #
        # nix/bun.nix is regenerated from bun.lock via `just refresh-bun-deps`
        # (which invokes `bun x bun2nix -o nix/bun.nix`). Each lockfile entry
        # becomes a per-package fetchurl whose SRI hash comes directly from
        # bun.lock, so there is no separate FOD hash to maintain per system.
        #
        # The @proseql/core override rewrites the hjson/json5/jsonc codec
        # imports from default to namespace form before they enter Bun's
        # offline cache. Bun runs them as-is, but Bun's bundler rejects the
        # default-export pattern while building the desktop native bundle.
        # Centralizing the patch here removes a per-consumer sed loop.
        bunDeps =
          let
            # Loud-fail at eval time if a future bun.lock bump moves proseql
            # past the version this override is keyed on. bun2nix.fetchBunDeps
            # silently no-ops on unknown override keys, which would otherwise
            # cause korri-desktop to fail confusingly inside `bun build` when
            # the codec patch goes missing. korri-cli/korri-server have an
            # in-buildPhase sed loop as defense-in-depth; korri-desktop does
            # not, so this assertion is its primary guard.
            proseqlOverrideKey = "@proseql/core@0.13.2";
            # bun.nix is a function expecting fetchurl etc. We only need
            # attribute names for the existence check; values are lazy, so
            # passing nulls is safe (we never access them).
            bunNixManifest = import ./nix/bun.nix {
              copyPathToStore = null;
              fetchFromGitHub = null;
              fetchgit = null;
              fetchurl = null;
            };
          in
          assert
            (builtins.hasAttr proseqlOverrideKey bunNixManifest)
            || throw ''
              flake.nix bunDeps: override key '${proseqlOverrideKey}' is not present in nix/bun.nix.
              The proseql codec patch will not be applied to the bun offline cache.
              Update the override key to match the version recorded in nix/bun.nix
              (run `just refresh-bun-deps` if bun.lock changed).
            '';
          pkgs.bun2nix.fetchBunDeps {
            bunNix = ./nix/bun.nix;
            overrides = {
              ${proseqlOverrideKey} =
                pkg:
                pkgs.runCommandLocal "proseql-core-codec-patched" { } ''
                  cp -R ${pkg} $out
                  chmod -R u+w $out
                  for codec in hjson json5 jsonc; do
                    file="$out/dist/serializers/codecs/$codec.js"
                    if [ -f "$file" ]; then
                      sed -i 's/^import pkg from /import * as pkg from /' "$file"
                    fi
                  done
                '';
            };
          };

        # Single portal build for every desktop variant. The native input-bridge
        # URL is now pushed at runtime via window.__korriRuntime (see
        # korri/deploy/portal/main.tsx and korri/deploy/desktop/runtime-config.ts).
        korriPortal = import ./nix/korri-portal.nix {
          inherit pkgs;
          src = self;
          inherit bunDeps;
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

        # Heavy build runs once and is shared between every variant. The wrap
        # step below re-RPATHs shared objects per variant and writes the wrapper
        # script; the unwrapped output's executables (bun, launcher) already
        # have their interpreter set and are left alone by wrap.
        korriDesktopUnwrapped =
          if isSupportedDesktopSystem then
            pkgs.callPackage ./nix/korri-desktop/unwrapped.nix {
              inherit system bunDeps;
              src = self;
              inherit electrobunBinaries;
              portal = korriPortal;
              buildtimeLibraries = linuxDesktopRuntimeLibraries;
            }
          else
            null;

        # Host variant: current nixpkgs libraries throughout (callPackage
        # auto-fills each named arg from `pkgs`).
        korriDesktop =
          if isSupportedDesktopSystem then
            pkgs.callPackage ./nix/korri-desktop/wrap.nix {
              korri-desktop-unwrapped = korriDesktopUnwrapped;
              stdenvCcLib = pkgs.stdenv.cc.cc.lib;
              profile = "host";
            }
          else
            null;

        # Device variant uses the pkgs2405 closure as a *cohesive* set: WebKitGTK
        # 2.44.3 + matching GTK 3.24.43 + gsettings-desktop-schemas + glib-networking
        # all move together. WebKit 2.44.3 was built against an older Pango ABI than
        # current nixpkgs ships, so the closure cannot be split. The paths are baked
        # into libNativeWrapper.so's RPATH at build time (no runtime LD_LIBRARY_PATH).
        # See docs/solutions/integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md.
        #
        # Every pkgs2405 entry from deviceDesktopRuntimeLibraries must appear in
        # this shared override set. Missing entries would silently auto-fill from
        # current nixpkgs and break the cohesive closure invariant.
        deviceDesktopWrapOverrides = {
          korri-desktop-unwrapped = korriDesktopUnwrapped;
          webkitgtk_4_1 = pkgs2405.webkitgtk_4_1;
          gtk3 = pkgs2405.gtk3;
          libsoup_3 = pkgs2405.libsoup_3;
          glib = pkgs2405.glib;
          gdk-pixbuf = pkgs2405.gdk-pixbuf;
          cairo = pkgs2405.cairo;
          pango = pkgs2405.pango;
          libayatana-appindicator = pkgs2405.libayatana-appindicator;
          librsvg = pkgs2405.librsvg;
          at-spi2-core = pkgs2405.at-spi2-core;
          glib-networking = pkgs2405.glib-networking;
          gsettings-desktop-schemas = pkgs2405.gsettings-desktop-schemas;
          stdenvCcLib = pkgs.stdenv.cc.cc.lib;
        };

        korriDesktopDevice =
          if isSupportedDesktopSystem then
            pkgs.callPackage ./nix/korri-desktop/wrap.nix (
              deviceDesktopWrapOverrides // { profile = "device"; }
            )
          else
            null;

        korriDesktopX86Kiosk =
          if isX86Linux then
            pkgs.callPackage ./nix/korri-desktop/wrap.nix (
              deviceDesktopWrapOverrides
              // {
                moonlightPackage = pkgs.moonlight-embedded;
                profile = "x86-kiosk";
              }
            )
          else
            null;

        korriImages = import ./nix/images/common.nix {
          korri = self;
          inherit nixpkgs system;
          overlays = [ korriPackagesOverlay ];
        };

        libretroFake08 = pkgs.libretro-fake-08;

        # The named outputs match the overlay-substituted `pkgs.sunshine` and
        # `pkgs.moonlight-embedded` so downstream consumers can ask for either
        # name and get the same derivation.
        sunshineKorri = pkgs.sunshine;
        moonlightEmbeddedKorri = pkgs.moonlight-embedded;

        korriHeadlessSystem = korriImages.mkHeadlessSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriKioskSystem = korriImages.mkKioskSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriDesktopLabSystem = korriImages.mkDesktopLabSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriKioskLiveUsbSystem = korriImages.mkLiveUsbKioskSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriKioskLiveUsbDeveloperSystem = korriImages.mkLiveUsbKioskSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
          modules = [
            {
              services.korri.liveUsbPersistence.artifact = "developer";
            }
          ];
        };

        korriKioskLiveUsbRuntimeSystem = korriImages.mkLiveUsbKioskRuntimeSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };
      in
      {
        packages = {
          korri-portal = korriPortal;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          korri-inputd = korriInputd;
          korri-game-stream = korriGameStream;
          korri-cli = korriCli;
          korri-server = korriServer;
          korri-headless-source = korriHeadlessSource;
          sunshine-korri = sunshineKorri;
          moonlight-embedded-korri = moonlightEmbeddedKorri;
          libretro-fake-08 = libretroFake08;
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
          korri-kiosk-live-iso = korriKioskLiveUsbSystem.config.system.build.isoImage;
          korri-kiosk-live-developer-iso = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
        }
        // pkgs.lib.optionalAttrs (system == "aarch64-linux") {
          korri-rocknix-kiosk-system-thor =
            self.nixosConfigurations.korri-rocknix-kiosk-thor.config.system.build.toplevel;
          korri-rocknix-kiosk-system-odin2portal =
            self.nixosConfigurations.korri-rocknix-kiosk-odin2portal.config.system.build.toplevel;
          korri-rocknix-kiosk-system-by-compatible =
            self.nixosConfigurations.korri-rocknix-kiosk-by-compatible.config.system.build.toplevel;
        }
        // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          korri-rocknix-rootfs-thor = nix-on-rocks.lib.mkGuestRootfs system self.nixosConfigurations.korri-rocknix-kiosk-thor;
          korri-rocknix-rootfs-odin2portal = nix-on-rocks.lib.mkGuestRootfs system self.nixosConfigurations.korri-rocknix-kiosk-odin2portal;
          korri-rocknix-rootfs-by-compatible = nix-on-rocks.lib.mkGuestRootfs system self.nixosConfigurations.korri-rocknix-kiosk-by-compatible;
        };

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
          wrapKorriDesktop = args: pkgs.callPackage ./nix/korri-desktop/wrap.nix args;
        };

        checks =
          pkgs.lib.optionalAttrs isX86Linux {
            korri-desktop-build-graph = import ./nix/tests/korri-desktop-build-graph-check.nix {
              inherit pkgs pkgs2405;
              host = korriDesktop;
              device = korriDesktopDevice;
              x86Kiosk = korriDesktopX86Kiosk;
              unwrapped = korriDesktopUnwrapped;
            };
            korri-package-outputs = import ./nix/tests/korri-package-outputs-check.nix {
              inherit pkgs;
              packages = self.packages.${system};
            };
            korri-image-outputs = import ./nix/tests/korri-image-outputs-check.nix {
              inherit pkgs;
              packages = self.packages.${system};
              apps = self.apps.${system};
              imageLib = korriImages;
              x86Platform = ./nix/images/platforms/x86.nix;
              liveUsbConfigCheck = import ./nix/tests/korri-live-usb-config-check.nix {
                inherit pkgs;
                liveUsbSystem = korriKioskLiveUsbSystem;
              };
              liveUsbDeveloperConfigCheck = import ./nix/tests/korri-live-usb-config-check.nix {
                inherit pkgs;
                liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
                expectedArtifact = "developer";
              };
              liveUsbVmSmokeCheck = import ./nix/tests/korri-live-usb-vm-smoke.nix {
                inherit pkgs;
                imageLib = korriImages;
                x86Platform = ./nix/images/platforms/x86.nix;
              };
              hardwareFactSourceFiles = [
                ./nix/images/common.nix
                ./nix/images/headless.nix
                ./nix/images/kiosk.nix
                ./nix/images/desktop-lab.nix
                ./nix/images/platforms/x86.nix
              ];
            };
          }
          // {
            # Module-eval checks: pure Nix evaluation, no platform-specific build
            # graph, safe to gate on any system.
            korri-compositor-module = import ./nix/tests/korri-compositor-module-check.nix {
              inherit pkgs;
              korriCompositorModule = self.nixosModules.korri-compositor;
            };
            korri-input-module = import ./nix/tests/korri-input-module-check.nix {
              inherit pkgs;
              korriInputModule = self.nixosModules.korri-input;
            };
            korri-game-stream-module = import ./nix/tests/korri-game-stream-module-check.nix {
              inherit pkgs;
              korriGameStreamModule = self.nixosModules.korri-game-stream;
            };
            korri-server-module = import ./nix/tests/korri-server-module-check.nix {
              inherit pkgs;
              korriServerModule = self.nixosModules.korri-server;
            };
            korri-module-identity-audit = import ./nix/tests/korri-module-identity-audit-check.nix {
              inherit pkgs;
              src = ./nix/modules;
            };
          }
          // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
            korri-sunshine-runtime-bitrate-patch =
              import ./nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix
                {
                  inherit pkgs;
                  patchPaths = [
                    ./packages/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch
                    ./packages/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch
                    ./packages/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch
                    ./packages/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch
                  ];
                  readmePath = ./packages/sunshine-korri/README.md;
                  moonlightPatchPaths = [
                    ./packages/moonlight-embedded-korri/patches/0005a-add-sunshine-runtime-settings-protocol-sender.patch
                    ./packages/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch
                    ./packages/moonlight-embedded-korri/patches/0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch
                    ./packages/moonlight-embedded-korri/patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch
                  ];
                  moonlightReadmePath = ./packages/moonlight-embedded-korri/README.md;
                  sunshinePackage = self.packages.${system}.sunshine-korri;
                  moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
                };
            korri-moonlight-control-protocol-patch =
              import ./nix/tests/korri-moonlight-control-protocol-patch-check.nix
                {
                  inherit pkgs;
                  patchPaths = [
                    ./packages/moonlight-embedded-korri/patches/0006-add-local-control-observability-ipc.patch
                    ./packages/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch
                  ];
                  absoluteTouchPatchPath = ./packages/moonlight-embedded-korri/patches/0004-add-absolutetouch-flag-for-tap-to-click.patch;
                  readmePath = ./packages/moonlight-embedded-korri/README.md;
                  moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
                };
            libretro-fake-08-check = import ./packages/libretro-fake-08/check.nix {
              inherit pkgs;
              libretroFake08Package = self.packages.${system}.libretro-fake-08;
            };
          }
          // pkgs.lib.optionalAttrs isX86Linux {
            korri-rocknix-sm8550-config = import ./nix/tests/korri-rocknix-sm8550-config-check.nix {
              inherit pkgs;
              thorSystem = self.nixosConfigurations.korri-rocknix-kiosk-thor;
              soboSystem = self.nixosConfigurations.korri-rocknix-kiosk-odin2portal;
              byCompatibleSystem = self.nixosConfigurations.korri-rocknix-kiosk-by-compatible;
              targetPackages = self.packages.aarch64-linux;
              hostPackages = self.packages.${system};
              configurations = self.nixosConfigurations;
              hardwareFactSourceFiles = [
                ./nix/images/common.nix
                ./nix/images/headless.nix
                ./nix/images/kiosk.nix
                ./nix/images/desktop-lab.nix
                ./nix/images/platforms/x86.nix
              ];
            };
            korri-live-usb-config = import ./nix/tests/korri-live-usb-config-check.nix {
              inherit pkgs;
              liveUsbSystem = korriKioskLiveUsbSystem;
            };
            korri-live-usb-developer-config = import ./nix/tests/korri-live-usb-config-check.nix {
              inherit pkgs;
              liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
              expectedArtifact = "developer";
            };
            korri-live-usb-vm-smoke = import ./nix/tests/korri-live-usb-vm-smoke.nix {
              inherit pkgs;
              imageLib = korriImages;
              x86Platform = ./nix/images/platforms/x86.nix;
            };
            korri-live-usb-invalid-artifact = import ./nix/tests/korri-live-usb-invalid-artifact-check.nix {
              inherit pkgs;
              imageLib = korriImages;
              x86Platform = ./nix/images/platforms/x86.nix;
            };
            korri-live-usb-persistence-resolver =
              import ./nix/tests/korri-live-usb-persistence-resolver-check.nix
                {
                  inherit pkgs;
                  resolverScript = ./nix/images/live-usb-persistence-resolver.sh;
                };
            korri-standard-native = import ./nix/tests/korri-standard-native-check.nix {
              inherit pkgs;
              standardChecks = [
                self.checks.${system}.korri-compositor-module
                self.checks.${system}.korri-input-module
                self.checks.${system}.korri-game-stream-module
                self.checks.${system}.korri-server-module
                self.checks.${system}.korri-module-identity-audit
                self.checks.${system}.korri-sunshine-runtime-bitrate-patch
                self.checks.${system}.korri-moonlight-control-protocol-patch
                self.checks.${system}.libretro-fake-08-check
                self.checks.${system}.korri-desktop-build-graph
                self.checks.${system}.korri-package-outputs
                self.checks.${system}.korri-image-outputs
                self.checks.${system}.korri-rocknix-sm8550-config
                self.checks.${system}.korri-live-usb-config
                self.checks.${system}.korri-live-usb-developer-config
                self.checks.${system}.korri-live-usb-vm-smoke
                self.checks.${system}.korri-live-usb-invalid-artifact
                self.checks.${system}.korri-live-usb-persistence-resolver
              ];
              ownerMatrix = [
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
                  name = "korri-rocknix-sm8550-config";
                  owner = "composed-system";
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
                  name = "korri-live-usb-vm-smoke";
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
                import ./nix/apps/korri-live-usb-vm.nix {
                  inherit pkgs;
                  vmSystem = korriKioskLiveUsbRuntimeSystem;
                }
              }/bin/korri-live-usb-vm";
            };
            korri-live-usb-qemu = {
              type = "app";
              program = "${
                import ./nix/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
                }
              }/bin/korri-live-usb-qemu";
            };
            korri-live-usb-qemu-persistence = {
              type = "app";
              program = "${
                import ./nix/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
                  persistenceMode = true;
                }
              }/bin/korri-live-usb-qemu-persistence";
            };
            korri-live-usb-developer-qemu = {
              type = "app";
              program = "${
                import ./nix/apps/korri-live-usb-qemu.nix {
                  inherit pkgs;
                  isoPackage = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
                  appName = "korri-live-usb-developer-qemu";
                }
              }/bin/korri-live-usb-developer-qemu";
            };
            korri-live-usb-developer-qemu-persistence = {
              type = "app";
              program = "${
                import ./nix/apps/korri-live-usb-qemu.nix {
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
            ++ linuxDesktopPackages;

          shellHook = commonShellHook + linuxDesktopShellHook;
        };
      }
    )
    // (
      let
        rocknixTargetSystem = "aarch64-linux";
        rocknixImages = import ./nix/images/common.nix {
          korri = self;
          nixpkgs = nix-on-rocks.inputs.nixpkgs;
          system = rocknixTargetSystem;
          overlays = [
            (import ./nix/overlays/korri-packages.nix { inherit nix-on-rocks fake-08-src; })
          ];
        };
        rocknixPlatformFor =
          deviceProfile:
          import ./nix/images/platforms/rocknix-sm8550.nix {
            korri = self;
            inherit nixpkgs nix-on-rocks deviceProfile;
          };
        rocknixThorSystem = rocknixImages.mkKioskSystem {
          platformModules = [
            (rocknixPlatformFor nix-on-rocks.nixosModules.thor)
          ];
        };
        rocknixOdin2PortalSystem = rocknixImages.mkKioskSystem {
          platformModules = [
            (rocknixPlatformFor nix-on-rocks.nixosModules.odin2portal)
          ];
        };
        rocknixByCompatibleSystem = rocknixImages.mkKioskSystem {
          platformModules = [
            (rocknixPlatformFor nix-on-rocks.lib.selectDeviceProfileFromCompatible)
          ];
        };
      in
      {
        # Top-level overlays so downstream flakes (mountainous host configs,
        # bespoke device images) can pick up the Korri-downstream Moonlight
        # and Sunshine packages by adding `korri.overlays.default` to their
        # own `nixpkgs.overlays`. Without this, consumers that build their
        # own `pkgs` instance (e.g. mountainous's nixpkgs.lib.nixosSystem)
        # never see the substitution and end up with stock nixpkgs sunshine
        # / nix-on-rocks moonlight-embedded.
        overlays = rec {
          korri-packages = import ./nix/overlays/korri-packages.nix {
            inherit nix-on-rocks fake-08-src;
          };
          default = korri-packages;
        };

        nixosConfigurations = {
          korri-rocknix-kiosk-thor = rocknixThorSystem;
          korri-rocknix-kiosk-odin2portal = rocknixOdin2PortalSystem;
          korri-rocknix-kiosk-by-compatible = rocknixByCompatibleSystem;
        };

        nixosModules = rec {
          # Power-user opt-in: a module that wires the Korri substrate-package
          # overlay into `nixpkgs.overlays`. Importing this module replaces
          # `pkgs.sunshine` and `pkgs.moonlight-embedded` for the whole host.
          # Avoid in evaluations where `nixpkgs.pkgs` is set externally (e.g.
          # `pkgs.testers.runNixOSTest`), because that marks
          # `nixpkgs.overlays` read-only. Day-to-day consumers do NOT need
          # this: every Korri product module below already defaults the
          # specific package options (`services.sunshine.package`,
          # `rocknix.sm8550.moonlight.package`) it cares about to the Korri
          # downstream builds, so the substitution happens through the option
          # graph rather than through `pkgs` itself.
          korri-nixpkgs-overlay = import ./nix/modules/korri-nixpkgs-overlay.nix {
            overlay = import ./nix/overlays/korri-packages.nix {
              inherit nix-on-rocks fake-08-src;
            };
          };

          # Auto-attached sway/gamescope pin for the x86 compositor runtime
          # contract. Imported by korri-compositor below so downstream consumers
          # inherit the known-good versions without touching nixpkgs.overlays
          # themselves. No-ops on non-x86 systems via the overlay itself.
          korri-x86-compositor-overlay = import ./nix/modules/korri-x86-compositor-overlay.nix {
            overlay = import ./nix/overlays/korri-x86-compositor.nix;
          };

          korri-client = import ./nix/modules/korri-client.nix { korri = self; };
          korri-cli = import ./nix/modules/korri-cli.nix { korri = self; };
          korri-game-stream = import ./nix/modules/korri-game-stream.nix { korri = self; };
          # Per-role input module: provider + inputd peer sub-trees.
          korri-input = import ./nix/modules/korri-input.nix { korri = self; };
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
              (import ./nix/modules/korri-compositor.nix { korri = self; })
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
              (import ./nix/modules/korri-server.nix { korri = self; })
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
