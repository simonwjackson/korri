{
  korri,
  nixpkgs,
  system,
  # Overlays threaded into every nixosConfiguration we build through this
  # library. Used by korri's own configurations (korri-rocknix-kiosk-*,
  # korri-kiosk, live USB) to apply the Korri substrate-package overlay so
  # platform modules that read `pkgs.moonlight-embedded` resolve to the
  # Korri downstream build.
  #
  # Downstream consumers (mountainous host configs) do NOT go through this
  # library — they call `nixpkgs.lib.nixosSystem` directly with their own
  # pkgs construction. The korri product modules they import default
  # `services.sunshine.package` and `rocknix.sm8550.moonlight.package` at
  # the option level, which is the seam that actually reaches those hosts.
  overlays ? [ ],
}:
let
  evalConfig = import (nixpkgs.outPath + "/nixos/lib/eval-config.nix");

  liveUsbModule = import ./live-usb.nix { inherit korri nixpkgs; };
  liveUsbRuntimeModule = import ./live-usb-runtime.nix { inherit korri; };
  desktopLabModule = ./desktop-lab.nix;
  sourceMachineModule = ./source-machine.nix;

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

  mkDesktopLabModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkProductModules {
      productModule = desktopLabModule;
      inherit platformModules modules includeBase;
    };

  mkSourceMachineModules =
    {
      platformModules ? [ ],
      modules ? [ ],
      includeBase ? true,
    }:
    mkProductModules {
      productModule = sourceMachineModule;
      inherit platformModules includeBase;
      # korri-game-stream is transitively imported via korri-server.
      # korri-sessiond is the new Phase 4C module — added explicitly here
      # because no aggregate transitively imports it yet.
      modules = [
        korri.nixosModules.korri-sessiond
      ]
      ++ modules;
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

  mkDesktopLabSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkDesktopLabModules {
      inherit platformModules modules;
    });

  mkSourceMachineSystem =
    {
      platformModules ? [ ],
      modules ? [ ],
    }:
    mkSystemFromModules (mkSourceMachineModules {
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
