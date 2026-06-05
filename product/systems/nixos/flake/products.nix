{ nix-on-rocks }:

let
  mkProduct =
    {
      id,
      displayName,
      compatible,
      deviceProfile,
    }:
    rec {
      inherit
        id
        displayName
        compatible
        deviceProfile
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
    };

    odin2portal = mkProduct {
      id = "odin2portal";
      displayName = "Odin2Portal";
      compatible = "ayn,odin2portal";
      deviceProfile = nix-on-rocks.nixosModules.odin2portal;
    };
  };
in
{
  inherit explicitProducts;

  explicitProductList = [
    explicitProducts.odin2portal
    explicitProducts.thor
  ];

  byCompatible = {
    id = "by-compatible";
    displayName = "by-compatible";
    compatible = null;
    substrate = "rocknix";
    deviceProfile = nix-on-rocks.lib.selectDeviceProfileFromCompatible;
    configName = "korri-kiosk-by-compatible";
    kioskSystemPackageName = "korri-kiosk-system-by-compatible";
    rootfsPackageName = "korri-rootfs-by-compatible";
    buildTarget = ".#nixosConfigurations.korri-kiosk-by-compatible.config.system.build.toplevel";
  };
}
