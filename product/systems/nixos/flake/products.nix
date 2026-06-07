{ nix-on-rocks }:

let
  mkProduct =
    {
      id,
      displayName,
      compatible,
      deviceProfile,
      chipset,
    }:
    rec {
      inherit
        id
        displayName
        compatible
        deviceProfile
        chipset
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
    };

    odin2portal = mkProduct {
      id = "odin2portal";
      displayName = "Odin2Portal";
      compatible = "ayn,odin2portal";
      deviceProfile = nix-on-rocks.nixosModules.odin2portal;
      chipset = "sm8550";
    };

    rg353m = mkProduct {
      id = "rg353m";
      displayName = "Anbernic RG353M";
      compatible = "rockchip,rk3566-rk817-tablet";
      deviceProfile = nix-on-rocks.nixosModules.rg353m;
      chipset = "rk3566";
    };
  };
in
{
  inherit explicitProducts;

  explicitProductList = [
    explicitProducts.odin2portal
    explicitProducts.thor
    explicitProducts.rg353m
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
