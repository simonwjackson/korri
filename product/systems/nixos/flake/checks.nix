{
  self,
  pkgs,
  pkgs2405,
  system,
  isX86Linux,
  explicitProducts,
  explicitProductList,
  byCompatibleProduct,
  bunDependencyCache,
  korriDesktop,
  korriDesktopDevice,
  korriDesktopX86Kiosk,
  korriDesktopUnwrapped,
  korriImages,
  korriKioskLiveUsbSystem,
  korriKioskLiveUsbDeveloperSystem,
  korriSourceMachineSystem,
  korriSources,
  pluginChecks ? { },
  ...
}:

pkgs.lib.optionalAttrs isX86Linux {
  korri-desktop-build-graph =
    import ../../../../tools/testing/nix/korri-desktop-build-graph-check.nix
      {
        inherit pkgs pkgs2405;
        host = korriDesktop;
        device = korriDesktopDevice;
        x86Kiosk = korriDesktopX86Kiosk;
        unwrapped = korriDesktopUnwrapped;
      };
  korri-package-outputs = import ../../../../tools/testing/nix/korri-package-outputs-check.nix {
    inherit pkgs;
    packages = self.packages.${system};
  };
  korri-image-outputs = import ../../../../tools/testing/nix/korri-image-outputs-check.nix {
    inherit pkgs;
    packages = self.packages.${system};
    apps = self.apps.${system};
    imageLib = korriImages;
    x86Platform = ../../../../product/systems/nixos/images/platforms/x86.nix;
    liveUsbConfigCheck = import ../../../../tools/testing/nix/korri-live-usb-config-check.nix {
      inherit pkgs;
      liveUsbSystem = korriKioskLiveUsbSystem;
    };
    liveUsbDeveloperConfigCheck = import ../../../../tools/testing/nix/korri-live-usb-config-check.nix {
      inherit pkgs;
      liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
      expectedArtifact = "developer";
    };
    liveUsbVmSmokeCheck = import ../../../../tools/testing/nix/korri-live-usb-vm-smoke.nix {
      inherit pkgs;
      imageLib = korriImages;
      x86Platform = ../../../../product/systems/nixos/images/platforms/x86.nix;
    };
    hardwareFactSourceFiles = [
      ../../../../product/systems/nixos/images/common.nix
      ../../../../product/systems/nixos/images/headless.nix
      ../../../../product/systems/nixos/images/kiosk.nix
      ../../../../product/systems/nixos/images/desktop-lab.nix
      ../../../../product/systems/nixos/images/platforms/x86.nix
    ];
  };
}
// {
  # Module-eval checks: pure Nix evaluation, no platform-specific build
  # graph, safe to gate on any system.
  korri-bun-deps-policy = bunDependencyCache.check;
  korri-compositor-module = import ../../../../tools/testing/nix/korri-compositor-module-check.nix {
    inherit pkgs;
    korriCompositorModule = self.nixosModules.korri-compositor;
  };
  korri-login-module = import ../../../../tools/testing/nix/korri-login-module-check.nix {
    inherit pkgs;
    korriLoginModule = self.nixosModules.korri-login;
  };
  korri-input-module = import ../../../../tools/testing/nix/korri-input-module-check.nix {
    inherit pkgs;
    korriInputModule = self.nixosModules.korri-input;
  };
  korri-inputplumber-xb360-helper =
    import ../../../../tools/testing/nix/korri-inputplumber-xb360-helper-check.nix
      {
        inherit pkgs;
        inputplumberPlatformHelpers = import ../images/inputplumber-platform-helpers.nix { inherit pkgs; };
      };
  korri-game-stream-module = import ../../../../tools/testing/nix/korri-game-stream-module-check.nix {
    inherit pkgs;
    korriGameStreamModule = self.nixosModules.korri-game-stream;
  };
  korri-sessiond-module = import ../../../../tools/testing/nix/korri-sessiond-module-check.nix {
    inherit pkgs;
    korriSessiondModule = self.nixosModules.korri-sessiond;
  };
  korri-source-machine-image =
    import ../../../../tools/testing/nix/korri-source-machine-image-check.nix
      {
        inherit pkgs;
        sourceMachineSystem = korriSourceMachineSystem;
      };
  korri-daemon-module = import ../../../../tools/testing/nix/korri-daemon-module-check.nix {
    inherit pkgs;
    korriDaemonModule = self.nixosModules.korri-daemon;
  };
  korri-steam-module = import ../../../../product/plugins/steam/nix/module-check.nix {
    inherit pkgs;
    korriSteamModule = self.nixosModules.korri-steam;
  };
  korri-removable-media = import ../../../../tools/testing/nix/korri-removable-media-check.nix {
    inherit pkgs;
    korriRemovableMediaModule = self.nixosModules.korri-removable-media;
    matcherSource = ../../../../product/systems/nixos/modules/korri-removable-media-match.sh;
    moduleSource = ../../../../product/systems/nixos/modules/korri-removable-media.nix;
  };
  korri-module-identity-audit =
    import ../../../../tools/testing/nix/korri-module-identity-audit-check.nix
      {
        inherit pkgs;
        src = ../../../../product/systems/nixos/modules;
      };
}
// pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
  korri-removable-media-matcher =
    import ../../../../tools/testing/nix/korri-removable-media-matcher-check.nix
      {
        inherit pkgs;
        matcherScript = ../../../../product/systems/nixos/modules/korri-removable-media-match.sh;
      };
  korri-sunshine-runtime-bitrate-patch =
    import ../../../../tools/testing/nix/korri-sunshine-runtime-bitrate-patch-check.nix
      {
        inherit pkgs;
        patchPaths = [
          ../../../../product/vendor/sunshine-korri/patches/0001-add-runtime-settings-protocol-surface.patch
          ../../../../product/vendor/sunshine-korri/patches/0002-wire-runtime-settings-control-plane.patch
          ../../../../product/vendor/sunshine-korri/patches/0003-apply-runtime-bitrate-and-fps-changes.patch
          ../../../../product/vendor/sunshine-korri/patches/0004-add-proof-gated-runtime-resolution-apply-path.patch
          ../../../../product/vendor/sunshine-korri/patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch
          ../../../../product/vendor/sunshine-korri/patches/0014-skip-runtime-vaapi-destructor-flush.patch
        ];
        readmePath = ../../../../product/vendor/sunshine-korri/README.md;
        sunshinePackagePath = ../../../../product/vendor/sunshine-korri/package.nix;
        moonlightPatchPaths = [
          ../../../../product/vendor/moonlight-embedded-korri/patches/0005a-add-sunshine-runtime-settings-protocol-sender.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0011-reset-sdl-presenter-on-output-size-change.patch
        ];
        moonlightReadmePath = ../../../../product/vendor/moonlight-embedded-korri/README.md;
        sunshinePackage = self.packages.${system}.sunshine-korri;
        moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
      };
  korri-moonlight-control-protocol-patch =
    import ../../../../tools/testing/nix/korri-moonlight-control-protocol-patch-check.nix
      {
        inherit pkgs;
        patchPaths = [
          ../../../../product/vendor/moonlight-embedded-korri/patches/0006-add-local-control-observability-ipc.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch
          ../../../../product/vendor/moonlight-embedded-korri/patches/0012-add-runtime-touch-bounds-control.patch
        ];
        absoluteTouchPatchPath = ../../../../product/vendor/moonlight-embedded-korri/patches/0004-add-absolutetouch-flag-for-tap-to-click.patch;
        readmePath = ../../../../product/vendor/moonlight-embedded-korri/README.md;
        moonlightPackage = self.packages.${system}.moonlight-embedded-korri;
      };
  korri-retroarch-xdelta = import ../../../../tools/testing/nix/korri-retroarch-xdelta-check.nix {
    inherit pkgs;
  };
  libretro-wasm4-check = import ../../../../product/vendor/libretro-wasm4/check.nix {
    inherit pkgs;
    libretroWasm4Package = self.packages.${system}.libretro-wasm4;
  };
}
// pkgs.lib.optionalAttrs isX86Linux {
  korri-sm8550-kiosk-config =
    import ../../../../tools/testing/nix/korri-rocknix-sm8550-config-check.nix
      {
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
          ../../../../product/systems/nixos/images/common.nix
          ../../../../product/systems/nixos/images/headless.nix
          ../../../../product/systems/nixos/images/kiosk.nix
          ../../../../product/systems/nixos/images/desktop-lab.nix
          ../../../../product/systems/nixos/images/platforms/x86.nix
        ];
        # The SM8550 platform adapter is the one image-side file
        # that *should* know about RockNix — it composes the
        # substrate into a Korri appliance. The literal-scan
        # asserts that even this file no longer hard-codes the
        # substrate's hardware capability values (v4l2m2m /
        # pulseaudio), which now come from
        # `rocknix.sm8550.video.decodeBackend` and
        # `rocknix.sm8550.audio.api`.
        sm8550PlatformAdapterSourceFile = ../../../../product/systems/nixos/images/platforms/rocknix-sm8550.nix;
      };
  korri-rk3566-kiosk-config =
    import ../../../../tools/testing/nix/korri-rocknix-rk3566-config-check.nix
      {
        inherit pkgs;
        products = explicitProducts;
        rg353mSystem = self.nixosConfigurations.${explicitProducts.rg353m.configName};
        rk3566PlatformAdapterSourceFile = ../../../../product/systems/nixos/images/platforms/rocknix-rk3566.nix;
        targetPackages = self.packages.aarch64-linux;
        hostPackages = self.packages.${system};
        configurations = self.nixosConfigurations;
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
          fixturePayloadPackage = import ../../../../product/systems/rocknix/product-payload.nix {
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
    import ../../../../tools/testing/nix/korri-rocknix-product-payload-check.nix {
      inherit pkgs;
      targetPackages = self.packages.aarch64-linux;
      hostPackages = self.packages.${system};
      configurations = self.nixosConfigurations;
      contract = import ../../../../product/systems/rocknix/product-payload-contract.nix;
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
  korri-live-usb-config = import ../../../../tools/testing/nix/korri-live-usb-config-check.nix {
    inherit pkgs;
    liveUsbSystem = korriKioskLiveUsbSystem;
  };
  korri-live-usb-developer-config =
    import ../../../../tools/testing/nix/korri-live-usb-config-check.nix
      {
        inherit pkgs;
        liveUsbSystem = korriKioskLiveUsbDeveloperSystem;
        expectedArtifact = "developer";
      };
  korri-live-usb-vm-smoke = import ../../../../tools/testing/nix/korri-live-usb-vm-smoke.nix {
    inherit pkgs;
    imageLib = korriImages;
    x86Platform = ../../../../product/systems/nixos/images/platforms/x86.nix;
  };
  korri-live-usb-invalid-artifact =
    import ../../../../tools/testing/nix/korri-live-usb-invalid-artifact-check.nix
      {
        inherit pkgs;
        imageLib = korriImages;
        x86Platform = ../../../../product/systems/nixos/images/platforms/x86.nix;
      };
  korri-live-usb-persistence-resolver =
    import ../../../../tools/testing/nix/korri-live-usb-persistence-resolver-check.nix
      {
        inherit pkgs;
        resolverScript = ../../../../product/systems/nixos/images/live-usb-persistence-resolver.sh;
      };
  korri-sm8550-build-performance =
    import ../../../../tools/testing/nix/korri-rocknix-build-performance-check.nix
      {
        inherit pkgs;
        runtimeSources = korriSources;
        productionBunPackageNames = bunDependencyCache.productionPackageNames;
        rootfsBuilder = ../../../../product/systems/rocknix/rootfs.nix;
      };

  korri-standard-native = import ../../../../tools/testing/nix/korri-standard-native-check.nix {
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
        name = "korri-daemon-module";
        owner = "module";
      }
      {
        name = "korri-removable-media";
        owner = "module";
      }
      {
        name = "korri-removable-media-matcher";
        owner = "composed-system";
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
        name = "libretro-wasm4-check";
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
}
// pluginChecks
