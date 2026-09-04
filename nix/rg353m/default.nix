{ nixpkgs }:

let
  system = "aarch64-linux";
  configuration = nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [ ./sd-image.nix ];
  };
in
{
  inherit configuration;
  sdImage = configuration.config.system.build.sdImage;
  uboot = configuration.pkgs.callPackage ./uboot.nix { };
}
