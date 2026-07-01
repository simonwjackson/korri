{
  korri,
  nixpkgs,
  system,
  # Overlays threaded into every nixosConfiguration we build through this
  # library. Used by korri's own configurations (Korri handheld kiosk products,
  # korri-kiosk, live USB) to apply the Korri substrate-package overlay so
  # platform modules that read `pkgs.moonlight-embedded` resolve to the
  # Korri downstream build.
  #
  # Downstream consumers (mountainous host configs) do NOT go through this
  # library — they call `nixpkgs.lib.nixosSystem` directly with their own
  # pkgs construction. The korri product modules they import default
  # the package options they own at the option level, which is the seam
  # that actually reaches those hosts.
  overlays ? [ ],
  pluginNixosModules ? [ ],
  sourceMachinePluginNixosModules ? [ ],
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
      nixpkgs.overlays = lib.mkDefault overlays;
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
      inherit platformModules includeBase;
      # Kiosk images run foreground sessions through sessiond. Without this
      # module included here, korrid has no lifecycle service to delegate to.
      # First-party plugin NixOS modules are kiosk-scoped today: they extend
      # foreground-session runtime PATHs and assume the sessiond option surface
      # imported above exists.
      modules = [
        korri.nixosModules.korri-sessiond
      ]
      ++ pluginNixosModules
      ++ modules;
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
      # korri-game-stream is transitively imported via korrid.
      # korri-sessiond is the foreground lifecycle owner for source-machine
      # launch-capable hosts. Source-machine plugin modules must be explicitly
      # stream-host-safe; content/kiosk plugin modules stay on the kiosk path
      # unless they opt into this narrower composition.
      modules = [
        korri.nixosModules.korri-sessiond
      ]
      ++ sourceMachinePluginNixosModules
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
