inputs@{
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
    pkgsContext = import ./pkgs.nix {
      inherit
        system
        nixpkgs
        nixpkgs-2405
        bun2nix
        nix-on-rocks
        fake-08-src
        smbr-src
        sm127-src
        nixpkgs-godot
        ;
    };
    inherit (pkgsContext)
      korriPackagesOverlay
      pkgs
      pkgs2405
      ;

    desktop = import ../../../../product/apps/desktop {
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
    productRegistry = import ../../../../product/systems/nixos/flake/products.nix {
      inherit nix-on-rocks;
    };
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

    bunDependencyCache = import ../../../../tools/nix/bun-deps {
      inherit pkgs;
      lib = pkgs.lib;
    };
    bunDeps = bunDependencyCache.deps;

    # Sources used by the Bun/Electrobun package derivations. Keep these
    # narrower than the flake root so docs, backlog, artifact downloads,
    # test tooling, and unrelated Nix/package work do not invalidate device
    # runtime package builds.
    korriSources = import ./sources.nix { inherit pkgs; };

    # Single portal build for every desktop variant. The native input-bridge
    # URL is now pushed at runtime via window.__korriRuntime (see
    # product/apps/portal/main.tsx and product/apps/desktop/runtime-config.ts).
    korriPortal = import ../../../../product/apps/portal/package.nix {
      inherit pkgs;
      src = korriSources.portal;
      inherit bunDeps;
    };

    korriInputd = import ../../../../product/services/device/nix/inputd.nix {
      inherit pkgs;
      lib = pkgs.lib;
      src = korriSources.inputd;
      inherit bunDeps;
    };

    korriGameStream = import ../../../../product/services/device/nix/game-stream.nix {
      inherit pkgs;
      lib = pkgs.lib;
      src = korriSources.gameStream;
      inherit bunDeps;
    };

    korriSessiond = import ../../../../product/services/device/nix/sessiond.nix {
      inherit pkgs;
      lib = pkgs.lib;
      src = korriSources.sessiond;
      inherit bunDeps;
    };

    korriCli = import ../../../../product/apps/cli/package.nix {
      inherit pkgs;
      lib = pkgs.lib;
      src = korriSources.cli;
      inherit bunDeps;
    };

    korriGamescopeControlBridge =
      import ../../../../product/services/device/nix/gamescope-control-bridge.nix
        {
          inherit pkgs;
          lib = pkgs.lib;
          src = korriSources.cli;
          inherit bunDeps;
        };

    korrid = import ../../../../product/services/server/package.nix {
      inherit pkgs;
      lib = pkgs.lib;
      src = korriSources.server;
      inherit bunDeps;
    };

    # korrid bundles the headless source binaries (korri-api,
    # korri-lan-stream-advertise) alongside its main daemon binary, so the
    # headless-source package output is satisfied by the same derivation.
    # The dedicated slim package was removed when the server absorbed those
    # binaries; resurrect a slim variant only if downstream consumers need
    # to avoid the server closure.
    korriHeadlessSource = korrid;

    electrobunBinaries = desktop.packages.binaries;
    korriDesktopUnwrapped = desktop.packages.unwrapped;
    korriDesktop = desktop.packages.host;
    korriDesktopDevice = desktop.packages.device;
    korriDesktopX86Kiosk = desktop.packages.x86Kiosk;

    korriImages = import ../../../../product/systems/nixos/images/common.nix {
      korri = self;
      inherit nixpkgs system;
      overlays = [ korriPackagesOverlay ];
    };

    steamKorri = pkgs.steam-korri;
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
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };

    korriKioskSystem = korriImages.mkKioskSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };

    korriDesktopLabSystem = korriImages.mkDesktopLabSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };

    korriSourceMachineSystem = korriImages.mkSourceMachineSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };

    korriKioskLiveUsbSystem = korriImages.mkLiveUsbKioskSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };

    korriKioskLiveUsbDeveloperSystem = korriImages.mkLiveUsbKioskSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
      modules = [
        {
          services.korri.liveUsbPersistence.artifact = "developer";
        }
      ];
    };

    korriKioskLiveUsbRuntimeSystem = korriImages.mkLiveUsbKioskRuntimeSystem {
      platformModules = [ ../../../../product/systems/nixos/images/platforms/x86.nix ];
    };
  in
  {
    packages = import ./packages.nix {
      inherit
        self
        pkgs
        system
        isSupportedDesktopSystem
        isX86Linux
        hasRocknixGuestCompatible
        attrsForProducts
        byCompatibleProduct
        productRevision
        productShortRevision
        productRevisionIsClean
        nixOnRocksRevision
        korriPortal
        korriInputd
        korriGameStream
        korriSessiond
        korriCli
        korriGamescopeControlBridge
        korrid
        korriHeadlessSource
        sunshineKorri
        moonlightEmbeddedKorri
        steamKorri
        libretroFake08
        gamescopeKorri
        smbRemastered
        superMario127
        yoshisFabricationStation
        electrobunBinaries
        korriDesktopUnwrapped
        korriDesktop
        korriDesktopDevice
        korriDesktopX86Kiosk
        korriHeadlessSystem
        korriKioskSystem
        korriDesktopLabSystem
        korriSourceMachineSystem
        korriKioskLiveUsbSystem
        korriKioskLiveUsbDeveloperSystem
        ;
    };

    lib = import ./lib.nix {
      inherit
        pkgs
        isSupportedDesktopSystem
        korriImages
        desktop
        ;
    };

    checks = import ./checks.nix {
      inherit
        self
        pkgs
        pkgs2405
        system
        isX86Linux
        explicitProducts
        explicitProductList
        byCompatibleProduct
        bunDependencyCache
        korriDesktop
        korriDesktopDevice
        korriDesktopX86Kiosk
        korriDesktopUnwrapped
        korriImages
        korriKioskLiveUsbSystem
        korriKioskLiveUsbDeveloperSystem
        korriSourceMachineSystem
        korriSources
        ;
    };

    apps = import ./apps.nix {
      inherit
        pkgs
        isSupportedDesktopSystem
        isX86Linux
        korriInputd
        korriGameStream
        korriCli
        korriGamescopeControlBridge
        korrid
        korriHeadlessSource
        korriDesktop
        korriDesktopDevice
        korriKioskLiveUsbRuntimeSystem
        korriKioskLiveUsbSystem
        korriKioskLiveUsbDeveloperSystem
        ;
    };

    devShells = import ./dev-shells.nix {
      inherit
        pkgs
        commonPackages
        commonShellHook
        desktop
        ;
    };
  }
)
// (import ./top-level.nix inputs)
