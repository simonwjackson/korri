{
  self,
  nixpkgs,
  nix-on-rocks,
  fake-08-src,
  wasm4-src,
  nixpkgs-godot,
  productRegistry,
  rocknixTargetSystem ? "aarch64-linux",
  ...
}:

let
  rocknixImages = import ../images/common.nix {
    korri = self;
    nixpkgs = nix-on-rocks.inputs.nixpkgs;
    system = rocknixTargetSystem;
    overlays = [
      (import ../overlays/korri-packages.nix {
        inherit
          nix-on-rocks
          fake-08-src
          wasm4-src
          nixpkgs-godot
          ;
      })
    ];
  };

  compatible = builtins.getEnv "ROCKNIX_GUEST_DEVICE_COMPATIBLE";
  hasRocknixGuestCompatible = compatible != "";

  inferChipset =
    product:
    if (product.chipset or "") != "by-compatible" then
      product.chipset
    else if compatible == "rockchip,rk3566-rk817-tablet" || compatible == "rockchip,rk3566" then
      "rk3566"
    else
      "sm8550";

  platformAdapterFor =
    product:
    let
      inferredChipset = inferChipset product;
    in
    if inferredChipset == "rk3566" then
      ../images/platforms/rocknix-rk3566.nix
    else
      ../images/platforms/rocknix-sm8550.nix;

  platformFor =
    product:
    import (platformAdapterFor product) {
      korri = self;
      inherit nixpkgs nix-on-rocks;
      inherit (product) deviceProfile;
    };

  mkProductSystem =
    product:
    rocknixImages.mkKioskSystem {
      platformModules = [
        (platformFor product)
      ];
    };
in
{
  inherit
    hasRocknixGuestCompatible
    inferChipset
    platformAdapterFor
    platformFor
    rocknixImages
    ;

  mkRocknixProductSystem = mkProductSystem;
  rocknixByCompatibleSystem = mkProductSystem productRegistry.byCompatible;
}
