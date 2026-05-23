{
  description = "Starter React + Effect RPC app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nixpkgs-2405.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix?ref=2.1.0";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    nix-on-rocks.url = "github:simonwjackson/nix-on-rocks/main";
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
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [ bun2nix.overlays.default ];
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
        };

        korriHeadlessSystem = korriImages.mkHeadlessSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriKioskSystem = korriImages.mkKioskSystem {
          platformModules = [ ./nix/images/platforms/x86.nix ];
        };

        korriKioskLiveUsbSystem = korriImages.mkLiveUsbKioskSystem {
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
          korri-kiosk-live-iso = korriKioskLiveUsbSystem.config.system.build.isoImage;
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

        checks = pkgs.lib.optionalAttrs isX86Linux {
          korri-live-usb-config = import ./nix/tests/korri-live-usb-config-check.nix {
            inherit pkgs;
            liveUsbSystem = korriKioskLiveUsbSystem;
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
        };
        rocknixPlatformFor =
          deviceProfile:
          import ./nix/images/platforms/rocknix-sm8550.nix {
            korri = self;
            inherit nix-on-rocks deviceProfile;
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
        nixosConfigurations = {
          korri-rocknix-kiosk-thor = rocknixThorSystem;
          korri-rocknix-kiosk-odin2portal = rocknixOdin2PortalSystem;
          korri-rocknix-kiosk-by-compatible = rocknixByCompatibleSystem;
        };

        nixosModules = rec {
          korri-client = import ./nix/modules/korri-client.nix { korri = self; };
          korri-cli = import ./nix/modules/korri-cli.nix { korri = self; };
          korri-inputd = import ./nix/modules/korri-inputd.nix { korri = self; };
          korri-game-stream = import ./nix/modules/korri-game-stream.nix { korri = self; };
          korri-headless-source = import ./nix/modules/korri-headless-source.nix { korri = self; };
          korri-server = import ./nix/modules/korri-server.nix { korri = self; };
          korri-kiosk = {
            imports = [
              korri-client
              korri-inputd
              (import ./nix/modules/korri-kiosk.nix { korri = self; })
            ];
          };
          korri = {
            imports = [
              korri-headless-source
              korri-server
              korri-kiosk
            ];
          };
          default = korri;
        };
      }
    );
}
