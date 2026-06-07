{
  self,
  nixpkgs,
  nix-on-rocks,
  fake-08-src,
  smbr-src,
  sm127-src,
  nixpkgs-godot,
  ...
}@inputs:

let
  productRegistry = import ./products.nix { inherit nix-on-rocks; };
  explicitProductList = productRegistry.explicitProductList;
  byCompatibleProduct = productRegistry.byCompatible;
  attrsForProducts = f: builtins.listToAttrs (map f explicitProductList);
  rocknixPlatform = import ./rocknix-platform.nix (inputs // { inherit productRegistry; });
in
attrsForProducts (product: {
  name = product.configName;
  value = rocknixPlatform.mkRocknixProductSystem product;
})
// nixpkgs.lib.optionalAttrs rocknixPlatform.hasRocknixGuestCompatible {
  ${byCompatibleProduct.configName} = rocknixPlatform.rocknixByCompatibleSystem;
}
