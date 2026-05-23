{ korri, nixpkgs }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.liveUsbPersistence;
  packagesForSystem = korri.packages.${pkgs.stdenv.hostPlatform.system} or { };
  resolver = pkgs.writeShellScript "korri-live-usb-persistence-resolver" (
    builtins.readFile ./live-usb-persistence-resolver.sh
  );
in
{
  imports = [
    (nixpkgs.outPath + "/nixos/modules/installer/cd-dvd/iso-image.nix")
  ];

  options.services.korri.liveUsbPersistence = {
    enable = lib.mkEnableOption "Korri live USB same-stick persistence" // {
      default = true;
    };

    root = lib.mkOption {
      type = lib.types.str;
      default = "/persist/korri-live-usb";
      description = "Mount point for Korri live USB client persistence.";
    };

    bootMountPoint = lib.mkOption {
      type = lib.types.str;
      default = "/iso";
      description = "Mounted live ISO path used to derive the boot USB block device.";
    };

    label = lib.mkOption {
      type = lib.types.str;
      default = "KORRI-PERSIST";
      description = "Filesystem label required on the sibling persistence partition.";
    };

    markerPersistent = lib.mkOption {
      type = lib.types.str;
      default = ".korri-live-usb-persistent";
      description = "Marker written when same-stick persistence is mounted.";
    };

    markerEphemeral = lib.mkOption {
      type = lib.types.str;
      default = ".korri-live-usb-ephemeral";
      description = "Marker written when the image falls back to non-persistent tmpfs state.";
    };
  };

  config = {
    # This image is a live USB/ISO appliance. It deliberately exposes an ISO
    # artifact that can be written to removable media; it is not an installer for
    # the target machine's internal disk.
    image = {
      baseName = lib.mkDefault "korri-kiosk-live";
      fileName = lib.mkDefault "korri-kiosk-live-${pkgs.stdenv.hostPlatform.system}.iso";
    };

    isoImage = {
      makeUsbBootable = lib.mkDefault true;
      makeEfiBootable = lib.mkDefault true;
    };

    services.korri.client.package = lib.mkIf (cfg.enable && packagesForSystem ? korri-desktop-x86-kiosk) (
      lib.mkDefault packagesForSystem.korri-desktop-x86-kiosk
    );

    services.korri.kiosk = lib.mkIf cfg.enable {
      home = lib.mkDefault "${cfg.root}/home";
      configHome = lib.mkDefault "${cfg.root}/home/.config";
      dataHome = lib.mkDefault "${cfg.root}/home/.local/share";
      stateHome = lib.mkDefault "${cfg.root}/home/.local/state";
      wants = [ "korri-live-usb-persistence.service" ];
      after = [ "korri-live-usb-persistence.service" ];
      environment = {
        XDG_CACHE_HOME = "${cfg.root}/home/.cache";
        KORRI_LIVE_USB_PERSISTENCE_ROOT = cfg.root;
        KORRI_MOONLIGHT_STATE_HOME = "${cfg.root}/home/.cache/moonlight";
      };
    };

    systemd.services."korri-kiosk" = lib.mkIf cfg.enable {
      requires = [ "korri-live-usb-persistence.service" ];
    };

    systemd.services."korri-live-usb-persistence" = lib.mkIf cfg.enable {
      description = "Resolve Korri live USB same-stick persistence";
      wantedBy = [ "multi-user.target" ];
      before = [ "korri-kiosk.service" ];
      after = [
        "local-fs.target"
        "systemd-udevd.service"
      ];
      path = with pkgs; [
        coreutils
        gawk
        gnugrep
        util-linux
      ];
      environment = {
        KORRI_LIVE_USB_PERSISTENCE_ROOT = cfg.root;
        KORRI_LIVE_USB_BOOT_MOUNT = cfg.bootMountPoint;
        KORRI_LIVE_USB_PERSISTENCE_LABEL = cfg.label;
        KORRI_LIVE_USB_PERSISTENT_MARKER = cfg.markerPersistent;
        KORRI_LIVE_USB_EPHEMERAL_MARKER = cfg.markerEphemeral;
      };
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      script = ''
        exec ${resolver}
      '';
    };

    swapDevices = lib.mkForce [ ];
    services.udisks2.enable = lib.mkForce false;
    services.gvfs.enable = lib.mkForce false;
  };
}
