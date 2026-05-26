{
  korri,
  nixpkgs,
  system,
  # Overlays threaded into every nixosConfiguration we evaluate, so the
  # Korri downstream Moonlight/Sunshine packages reach service-level
  # defaults (`services.sunshine.package`, `services.korri.compositor.path`)
  # without per-module rewrites. Callers in flake.nix pass the
  # `nix/overlays/korri-packages.nix` overlay here.
  overlays ? [ ],
}:
let
  evalConfig = import (nixpkgs.outPath + "/nixos/lib/eval-config.nix");

  liveUsbModule = import ./live-usb.nix { inherit korri nixpkgs; };
  liveUsbRuntimeModule = import ./live-usb-runtime.nix { inherit korri; };

  baseModule =
    { lib, ... }:
    {
      nixpkgs.hostPlatform = system;
      nixpkgs.overlays = overlays;
      system.stateVersion = lib.mkDefault "24.11";
      networking.hostName = lib.mkDefault "korri-image";
      boot.loader.systemd-boot.enable = lib.mkDefault false;
      boot.loader.grub.devices = lib.mkDefault [ "nodev" ];
      fileSystems."/" = lib.mkDefault {
        device = "/dev/null";
        fsType = "ext4";
      };
    };

  mkProductModules =
    {
      productModule,
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    (if includeBase then [ baseModule ] else [ ])
    ++ [
      korri.nixosModules.korri
      productModule
    ]
    ++ platformModules
    ++ modules;

  mkSystemFromModules = modules: evalConfig { inherit system modules; };

  mkSystem =
    {
      productModule,
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkProductModules {
      inherit productModule platformModules modules;
      includeBase = true;
    });
in
rec {
  inherit mkSystem mkSystemFromModules;

  mkHeadlessModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkProductModules {
      productModule = ./headless.nix;
      inherit platformModules modules includeBase;
    };

  mkKioskModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkProductModules {
      productModule = ./kiosk.nix;
      inherit platformModules modules includeBase;
    };

  mkLiveUsbKioskRuntimeModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkKioskModules {
      inherit platformModules includeBase;
      modules = [ liveUsbRuntimeModule ] ++ modules;
    };

  mkLiveUsbKioskModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkKioskModules {
      inherit platformModules includeBase;
      modules = [ liveUsbModule ] ++ modules;
    };

  mkHeadlessSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkHeadlessModules {
      inherit platformModules modules;
    });

  mkKioskSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkKioskModules {
      inherit platformModules modules;
    });

  mkLiveUsbKioskRuntimeSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkLiveUsbKioskRuntimeModules {
      inherit platformModules modules;
    });

  mkLiveUsbKioskSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkLiveUsbKioskModules {
      inherit platformModules modules;
    });
}
