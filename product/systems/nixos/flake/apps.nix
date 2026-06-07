{
  pkgs,
  isSupportedDesktopSystem,
  isX86Linux,
  korriInputd,
  korriGameStream,
  korriCli,
  korriGamescopeControlBridge,
  korriServer,
  korriHeadlessSource,
  korriDesktop,
  korriDesktopDevice,
  korriKioskLiveUsbRuntimeSystem,
  korriKioskLiveUsbSystem,
  korriKioskLiveUsbDeveloperSystem,
  ...
}:

pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
  korri-inputd = {
    type = "app";
    program = "${korriInputd}/bin/korri-inputd";
  };
  korri-game-stream = {
    type = "app";
    program = "${korriGameStream}/bin/korri-game-stream-runner";
  };
  korri-cli = {
    type = "app";
    program = "${korriCli}/bin/korri";
  };
  gamescope-control = {
    type = "app";
    program = "${korriGamescopeControlBridge}/bin/gamescope-control";
  };
  gamescope-control-bridge = {
    type = "app";
    program = "${korriGamescopeControlBridge}/bin/gamescope-control-bridge";
  };
  korri-stream-control-bench = {
    type = "app";
    program = "${korriGamescopeControlBridge}/bin/stream-control-bench";
  };
  korri-server = {
    type = "app";
    program = "${korriServer}/bin/korri-server";
  };
  korri-api = {
    type = "app";
    program = "${korriHeadlessSource}/bin/korri-api";
  };
  korri-lan-stream-advertise = {
    type = "app";
    program = "${korriHeadlessSource}/bin/korri-lan-stream-advertise";
  };
}
// pkgs.lib.optionalAttrs isSupportedDesktopSystem {
  default = {
    type = "app";
    program = "${korriDesktop}/bin/korri-desktop";
  };
  korri-desktop = {
    type = "app";
    program = "${korriDesktop}/bin/korri-desktop";
  };
  korri-desktop-device = {
    type = "app";
    program = "${korriDesktopDevice}/bin/korri-desktop-device";
  };
}
// pkgs.lib.optionalAttrs isX86Linux {
  korri-live-usb-vm = {
    type = "app";
    program = "${
      import ../../../../product/systems/nixos/apps/korri-live-usb-vm.nix {
        inherit pkgs;
        vmSystem = korriKioskLiveUsbRuntimeSystem;
      }
    }/bin/korri-live-usb-vm";
  };
  korri-live-usb-qemu = {
    type = "app";
    program = "${
      import ../../../../product/systems/nixos/apps/korri-live-usb-qemu.nix {
        inherit pkgs;
        isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
      }
    }/bin/korri-live-usb-qemu";
  };
  korri-live-usb-qemu-persistence = {
    type = "app";
    program = "${
      import ../../../../product/systems/nixos/apps/korri-live-usb-qemu.nix {
        inherit pkgs;
        isoPackage = korriKioskLiveUsbSystem.config.system.build.isoImage;
        persistenceMode = true;
      }
    }/bin/korri-live-usb-qemu-persistence";
  };
  korri-live-usb-developer-qemu = {
    type = "app";
    program = "${
      import ../../../../product/systems/nixos/apps/korri-live-usb-qemu.nix {
        inherit pkgs;
        isoPackage = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
        appName = "korri-live-usb-developer-qemu";
      }
    }/bin/korri-live-usb-developer-qemu";
  };
  korri-live-usb-developer-qemu-persistence = {
    type = "app";
    program = "${
      import ../../../../product/systems/nixos/apps/korri-live-usb-qemu.nix {
        inherit pkgs;
        isoPackage = korriKioskLiveUsbDeveloperSystem.config.system.build.isoImage;
        persistenceMode = true;
        appName = "korri-live-usb-developer-qemu-persistence";
      }
    }/bin/korri-live-usb-developer-qemu-persistence";
  };
}
