{ ... }:

let
  deviceProfiles = {
    thor = ../devices/rocknix/thor.nix;
    odin2portal = ../devices/rocknix/odin2portal.nix;
    rg353m = ../devices/rocknix/rg353m.nix;
  };

  # Korri owns the product/device identity mapping. The substrate still owns
  # the generic ROCKNIX guest modules that declare the hardware option surface,
  # but product-facing profiles must not come from nix-on-rocks.
  deviceProfileByCompatible = {
    "ayn,thor" = deviceProfiles.thor;
    "ayn,odin2portal" = deviceProfiles.odin2portal;
    "rockchip,rk3566-rk817-tablet" = deviceProfiles.rg353m;
  };

  deviceProfileByModel = {
    "Anbernic RG353M" = "rockchip,rk3566-rk817-tablet";
  };

  findFirst = predicate: fallback: values:
    if values == [ ] then
      fallback
    else if predicate (builtins.head values) then
      builtins.head values
    else
      findFirst predicate fallback (builtins.tail values);

  deviceProfileKeyFromIdentity =
    args:
    let
      profiles = args.profiles or deviceProfileByCompatible;
      modelAliases = args.modelAliases or deviceProfileByModel;
      model = args.model or "";
      compatibleStrings = args.compatibleStrings or [ ];
      modelProfileKey =
        if model != "" && builtins.hasAttr model modelAliases then
          modelAliases.${model}
        else
          null;
      compatibleProfileKey = findFirst (compatible: builtins.hasAttr compatible profiles) null compatibleStrings;
    in
    if modelProfileKey != null && builtins.hasAttr modelProfileKey profiles then
      modelProfileKey
    else
      compatibleProfileKey;

  selectDeviceProfileFromIdentity =
    args:
    let
      profiles = args.profiles or deviceProfileByCompatible;
      profileKey = deviceProfileKeyFromIdentity (args // { inherit profiles; });
    in
    if profileKey == null then
      throw ''
        Korri guest: no product device profile registered for device identity.
        Model: ${builtins.toJSON (args.model or "")}
        Compatible strings: ${builtins.toJSON (args.compatibleStrings or [ ])}
        Add product/systems/nixos/devices/rocknix/<device>.nix and register a
        matching compatible string or documented model alias in Korri's product
        registry.
      ''
    else
      profiles.${profileKey};

  # Impure host-promoter path. Off-device evaluation should use the explicit
  # product entries below; image/device promotion may set this from normalized
  # /proc/device-tree/compatible.
  selectDeviceProfileFromCompatible =
    let
      compatible = builtins.getEnv "ROCKNIX_GUEST_DEVICE_COMPATIBLE";
    in
    if compatible == "" then
      throw ''
        Korri guest: ROCKNIX_GUEST_DEVICE_COMPATIBLE is not set.
        Off-device evaluation should use an explicit per-device product
        configuration.
      ''
    else if !(builtins.hasAttr compatible deviceProfileByCompatible) then
      throw ''
        Korri guest: no product device profile registered for device-tree
        compatible ${builtins.toJSON compatible}.
        Add product/systems/nixos/devices/rocknix/<device>.nix and register its
        compatible string in Korri's product registry.
      ''
    else
      deviceProfileByCompatible.${compatible};

  defaultBrandingSplashPatch = ../../rocknix/branding/rocknix-splash-boot-logo.patch;

  mkProduct =
    {
      id,
      displayName,
      compatible,
      deviceProfile,
      chipset,
      brandingSplashPatch ? defaultBrandingSplashPatch,
    }:
    rec {
      inherit
        id
        displayName
        compatible
        deviceProfile
        chipset
        brandingSplashPatch
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
      deviceProfile = deviceProfiles.thor;
      chipset = "sm8550";
    };

    odin2portal = mkProduct {
      id = "odin2portal";
      displayName = "Odin2Portal";
      compatible = "ayn,odin2portal";
      deviceProfile = deviceProfiles.odin2portal;
      chipset = "sm8550";
    };

    rg353m = mkProduct {
      id = "rg353m";
      displayName = "Anbernic RG353M";
      compatible = "rockchip,rk3566-rk817-tablet";
      deviceProfile = deviceProfiles.rg353m;
      chipset = "rk3566";
    };
  };
in
{
  inherit
    deviceProfiles
    deviceProfileByCompatible
    deviceProfileByModel
    deviceProfileKeyFromIdentity
    selectDeviceProfileFromCompatible
    selectDeviceProfileFromIdentity
    explicitProducts
    ;

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
    deviceProfile = selectDeviceProfileFromCompatible;
    configName = "korri-kiosk-by-compatible";
    kioskSystemPackageName = "korri-kiosk-system-by-compatible";
    rootfsPackageName = "korri-rootfs-by-compatible";
    buildTarget = ".#nixosConfigurations.korri-kiosk-by-compatible.config.system.build.toplevel";
    brandingSplashPatch = defaultBrandingSplashPatch;
  };
}
