{ nix-on-rocks }:

let
  mkProduct =
    {
      id,
      displayName,
      compatible,
      deviceProfile,
      chipset,
      # DRM/KMS connector name of this device's primary ("home") display, e.g.
      # "DSI-2" on Thor or "DSI-1" on the Odin 2 Portal. Neutral hardware fact
      # (not Sway-specific) consumed by the compositor lane pin and the
      # gamescope/Steam/Moonlight output selection. null for the by-compatible
      # image, which resolves its display topology at eval time via the
      # deviceProfile and keeps the transitional inference in the platform.
      homeOutput ? null,
    }:
    rec {
      inherit
        id
        displayName
        compatible
        deviceProfile
        chipset
        homeOutput
        ;
      substrate = "rocknix";
      configName = "korri-${id}-kiosk";
      kioskSystemPackageName = "korri-${id}-kiosk-system";
      rootfsPackageName = "korri-${id}-rootfs";
      productPayloadPackageName = "korri-${id}-product-payload";
      buildTarget = ".#nixosConfigurations.${configName}.config.system.build.toplevel";
    };

  explicitProducts = {
    thor = mkProduct {
      id = "thor";
      displayName = "Thor";
      compatible = "ayn,thor";
      deviceProfile = nix-on-rocks.nixosModules.thor;
      chipset = "sm8550";
      homeOutput = "DSI-2";
    };

    odin2portal = mkProduct {
      id = "odin2portal";
      displayName = "Odin2Portal";
      compatible = "ayn,odin2portal";
      deviceProfile = nix-on-rocks.nixosModules.odin2portal;
      chipset = "sm8550";
      homeOutput = "DSI-1";
    };

    rg353m = mkProduct {
      id = "rg353m";
      displayName = "Anbernic RG353M";
      compatible = "rockchip,rk3566-rk817-tablet";
      deviceProfile = nix-on-rocks.nixosModules.rg353m;
      chipset = "rk3566";
    };

    r36tmax = mkProduct {
      id = "r36tmax";
      displayName = "R36T Max";
      compatible = "gameconsole,r36tmax";
      deviceProfile = nix-on-rocks.nixosModules.r36tmax;
      chipset = "rk3326";
    };
  };
in
{
  inherit explicitProducts;

  explicitProductList = [
    explicitProducts.odin2portal
    explicitProducts.thor
    explicitProducts.rg353m
    explicitProducts.r36tmax
  ];

  byCompatible = {
    id = "by-compatible";
    displayName = "by-compatible";
    compatible = null;
    substrate = "rocknix";
    chipset = "by-compatible";
    deviceProfile = nix-on-rocks.lib.selectDeviceProfileFromCompatible;
    configName = "korri-kiosk-by-compatible";
    kioskSystemPackageName = "korri-kiosk-system-by-compatible";
    rootfsPackageName = "korri-rootfs-by-compatible";
    buildTarget = ".#nixosConfigurations.korri-kiosk-by-compatible.config.system.build.toplevel";
  };
}
