{
  self,
  pkgs,
  system,
  isSupportedDesktopSystem,
  isX86Linux,
  hasRocknixGuestCompatible,
  attrsForProducts,
  byCompatibleProduct,
  productRevision,
  productShortRevision,
  productRevisionIsClean,
  nixOnRocksRevision,
  korriPortal,
  korriInputd,
  korriGameStream,
  korriSessiond,
  korriCli,
  korriGamescopeControlBridge,
  korrid,
  korriHeadlessSource,
  sunshineKorri,
  moonlightEmbeddedKorri,
  steamKorri,
  libretroFake08,
  gamescopeKorri,
  smbRemastered,
  superMario127,
  yoshisFabricationStation,
  electrobunBinaries,
  korriDesktopUnwrapped,
  korriDesktop,
  korriDesktopDevice,
  korriDesktopX86Kiosk,
  korriHeadlessSystem,
  korriKioskSystem,
  korriDesktopLabSystem,
  korriSourceMachineSystem,
  korriKioskLiveUsbSystem,
  korriKioskLiveUsbDeveloperSystem,
  ...
}:

{
  korri-portal = korriPortal;
}
// pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
  korri-inputd = korriInputd;
  korri-game-stream = korriGameStream;
  korri-sessiond = korriSessiond;
  korri-cli = korriCli;
  korri-gamescope-control-bridge = korriGamescopeControlBridge;
  korrid = korrid;
  korri-headless-source = korriHeadlessSource;
  sunshine-korri = sunshineKorri;
  moonlight-embedded-korri = moonlightEmbeddedKorri;
  steam-korri = steamKorri;
  libretro-fake-08 = libretroFake08;
  gamescope-korri = gamescopeKorri;
  smb-remastered = smbRemastered;
  super-mario-127 = superMario127;
  yoshis-fabrication-station = yoshisFabricationStation;
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
  korri-desktop-lab-system = korriDesktopLabSystem.config.system.build.toplevel;
  korri-source-machine-system = korriSourceMachineSystem.config.system.build.toplevel;
  korri-kiosk-live-iso = korriKioskLiveUsbSystem.config.system.build.isoImage;
  korri-kiosk-live-developer-iso = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
}
// pkgs.lib.optionalAttrs (system == "aarch64-linux") (
  attrsForProducts (product: {
    name = product.kioskSystemPackageName;
    value = self.nixosConfigurations.${product.configName}.config.system.build.toplevel;
  })
)
// pkgs.lib.optionalAttrs (system == "aarch64-linux" && hasRocknixGuestCompatible) {
  ${byCompatibleProduct.kioskSystemPackageName} =
    self.nixosConfigurations.${byCompatibleProduct.configName}.config.system.build.toplevel;
}
// pkgs.lib.optionalAttrs pkgs.stdenv.isLinux (
  attrsForProducts (product: {
    name = product.rootfsPackageName;
    value = import ../../../../product/systems/rocknix/rootfs.nix {
      inherit pkgs;
      configuration = self.nixosConfigurations.${product.configName};
    };
  })
)
// pkgs.lib.optionalAttrs (pkgs.stdenv.isLinux && hasRocknixGuestCompatible) {
  ${byCompatibleProduct.rootfsPackageName} = import ../../../../product/systems/rocknix/rootfs.nix {
    inherit pkgs;
    configuration = self.nixosConfigurations.${byCompatibleProduct.configName};
  };
}
// pkgs.lib.optionalAttrs pkgs.stdenv.isLinux (
  attrsForProducts (product: {
    name = product.productPayloadPackageName;
    value = import ../../../../product/systems/rocknix/product-payload.nix {
      inherit
        pkgs
        productRevision
        productShortRevision
        productRevisionIsClean
        ;
      rootfsPackage = self.packages.${system}.${product.rootfsPackageName};
      device = product.id;
      inherit (product) compatible buildTarget;
      authorityRepo = "simonwjackson/korri";
      sourceSubdir = ".";
      substrateRevision = nixOnRocksRevision;
    };
  })
)
