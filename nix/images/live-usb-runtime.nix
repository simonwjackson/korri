{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.liveUsbPersistence;
  kioskCfg = config.services.korri.kiosk;
  kioskGroup = if kioskCfg.group != null then kioskCfg.group else kioskCfg.user;
  packagesForSystem = korri.packages.${pkgs.stdenv.hostPlatform.system} or { };
  resolver = pkgs.writeShellScript "korri-live-usb-persistence-resolver" (
    builtins.readFile ./live-usb-persistence-resolver.sh
  );
  kioskSessionEnvironment =
    kioskCfg.environment
    // {
      HOME = kioskCfg.home;
      XDG_STATE_HOME = kioskCfg.stateHome;
      XDG_DATA_HOME = kioskCfg.dataHome;
      XDG_CONFIG_HOME = kioskCfg.configHome;
      KORRI_KIOSK = "1";
    }
    // lib.optionalAttrs kioskCfg.input.enable {
      KORRI_NATIVE_BRIDGE_URL = "ws://127.0.0.1:${toString config.services.korri.inputd.port}";
      KORRI_DESKTOP_INPUTD_URL = "ws://127.0.0.1:${toString config.services.korri.inputd.port}";
    };
  kioskSessionExports = lib.concatStringsSep "\n" (
    lib.mapAttrsToList (
      name: value: "export ${name}=${lib.escapeShellArg value}"
    ) kioskSessionEnvironment
  );
  greetdSession = pkgs.writeShellScript "korri-live-usb-greetd-session" ''
    set -euo pipefail
    ${kioskSessionExports}

    if [ -z "''${XDG_RUNTIME_DIR:-}" ]; then
      export XDG_RUNTIME_DIR="/tmp/korri-runtime-$(id -u)"
      mkdir -p "$XDG_RUNTIME_DIR"
      chmod 0700 "$XDG_RUNTIME_DIR"
    fi

    exec ${pkgs.dbus}/bin/dbus-run-session -- ${kioskCfg.sway.package}/bin/sway --config ${kioskCfg.sway.configFile}
  '';
  inputServices =
    lib.optional kioskCfg.input.enable "korri-inputd.service" ++ kioskCfg.input.provider.services;
  seatServices = lib.optional (config.services.seatd.enable or false) "seatd.service";
  loginDependencies = [ "korri-live-usb-persistence.service" ] ++ inputServices ++ seatServices;
in
{
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

    debugSsh = {
      authorizedKeys = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "SSH public keys allowed to log in as the live USB kiosk user for debugging.";
      };
    };
  };

  config = {
    services.korri.client.package = lib.mkIf (
      cfg.enable && packagesForSystem ? korri-desktop-x86-kiosk
    ) (lib.mkDefault packagesForSystem.korri-desktop-x86-kiosk);

    services.korri.kiosk = lib.mkIf cfg.enable {
      user = lib.mkDefault "korri";
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
      # A real login session gives Sway the seat/session semantics it expects,
      # while greetd's initial session still boots directly into the kiosk.
      wantedBy = lib.mkForce [ ];
      requires = [ "korri-live-usb-persistence.service" ];
    };

    services.greetd = lib.mkIf cfg.enable {
      enable = true;
      settings = {
        initial_session = {
          command = toString greetdSession;
          user = kioskCfg.user;
        };
        default_session = {
          command = toString greetdSession;
          user = kioskCfg.user;
        };
        terminal.vt = 1;
      };
    };

    systemd.services.greetd = lib.mkIf cfg.enable {
      wants = loginDependencies;
      requires = loginDependencies;
      after = loginDependencies ++ [ "systemd-user-sessions.service" ];
    };

    services.openssh = lib.mkIf (cfg.enable && cfg.debugSsh.authorizedKeys != [ ]) {
      enable = true;
      settings = {
        PasswordAuthentication = false;
        KbdInteractiveAuthentication = false;
        PermitRootLogin = "no";
      };
    };

    services.avahi = lib.mkIf (cfg.enable && cfg.debugSsh.authorizedKeys != [ ]) {
      enable = true;
      nssmdns4 = true;
      openFirewall = true;
    };

    users.users.${kioskCfg.user} = lib.mkIf (cfg.enable && kioskCfg.createUser) {
      openssh.authorizedKeys.keys = cfg.debugSsh.authorizedKeys;
      extraGroups = lib.mkAfter [
        "adm"
        "systemd-journal"
      ];
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
        KORRI_LIVE_USB_STATE_USER = kioskCfg.user;
        KORRI_LIVE_USB_STATE_GROUP = kioskGroup;
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
