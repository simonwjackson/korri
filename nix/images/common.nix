{
  korri,
  nixpkgs,
  system,
}:
let
  evalConfig = import (nixpkgs.outPath + "/nixos/lib/eval-config.nix");

  liveUsbModule = import ./live-usb.nix { inherit korri nixpkgs; };

  baseModule =
    { lib, ... }:
    {
      nixpkgs.hostPlatform = system;
      system.stateVersion = lib.mkDefault "24.11";
      networking.hostName = lib.mkDefault "korri-image";
      boot.loader.systemd-boot.enable = lib.mkDefault false;
      boot.loader.grub.devices = lib.mkDefault [ "nodev" ];
      fileSystems."/" = lib.mkDefault {
        device = "/dev/null";
        fsType = "ext4";
      };
    };

  mkSystem =
    {
      productModule,
      platformModules ? [ ],
      modules ? [ ],
    }:
    evalConfig {
      inherit system;
      modules = [
        baseModule
        korri.nixosModules.korri
        productModule
      ]
      ++ platformModules
      ++ modules;
    };
in
{
  inherit mkSystem;

  mkHeadlessSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystem {
      productModule = ./headless.nix;
      inherit platformModules modules;
    };

  mkKioskSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystem {
      productModule = ./kiosk.nix;
      inherit platformModules modules;
    };

  mkLiveUsbKioskSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystem {
      productModule = ./kiosk.nix;
      inherit platformModules;
      modules = [ liveUsbModule ] ++ modules;
    };
}
