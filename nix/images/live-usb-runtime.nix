{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.liveUsbPersistence;
  compositorCfg = config.services.korri.compositor;
  inputCfg = config.services.korri.input;
  compositorGroup = if compositorCfg.group != null then compositorCfg.group else compositorCfg.user;
  packagesForSystem = korri.packages.${pkgs.stdenv.hostPlatform.system} or { };
  resolver = pkgs.writeShellScript "korri-live-usb-persistence-resolver" (
    builtins.readFile ./live-usb-persistence-resolver.sh
  );
  compositorSessionEnvironment =
    compositorCfg.environment
    // {
      HOME = compositorCfg.home;
      XDG_STATE_HOME = compositorCfg.stateHome;
      XDG_DATA_HOME = compositorCfg.dataHome;
      XDG_CONFIG_HOME = compositorCfg.configHome;
    }
    // lib.optionalAttrs compositorCfg.kiosk.enable {
      KORRI_KIOSK = "1";
      KORRI_NATIVE_BRIDGE_URL = "ws://127.0.0.1:${toString inputCfg.inputd.port}";
      KORRI_DESKTOP_INPUTD_URL = "ws://127.0.0.1:${toString inputCfg.inputd.port}";
    };
  compositorSessionExports = lib.concatStringsSep "\n" (
    lib.mapAttrsToList (
      name: value: "export ${name}=${lib.escapeShellArg value}"
    ) compositorSessionEnvironment
  );
  greetdSession = pkgs.writeShellScript "korri-live-usb-greetd-session" ''
    set -euo pipefail
    ${compositorSessionExports}

    if [ -z "''${XDG_RUNTIME_DIR:-}" ]; then
      export XDG_RUNTIME_DIR="/tmp/korri-runtime-$(id -u)"
      mkdir -p "$XDG_RUNTIME_DIR"
      chmod 0700 "$XDG_RUNTIME_DIR"
    fi

    exec ${pkgs.dbus}/bin/dbus-run-session -- ${compositorCfg.sway.package}/bin/sway --config ${compositorCfg.sway.configFile}
  '';
  inputServices =
    lib.optional inputCfg.inputd.enable "korri-inputd.service" ++ inputCfg.provider.services;
  seatServices = lib.optional (config.services.seatd.enable or false) "seatd.service";
  loginDependencies = [ "korri-live-usb-persistence.service" ] ++ inputServices ++ seatServices;
  persistenceEntryType = lib.types.submodule {
    options = {
      kind = lib.mkOption {
        type = lib.types.enum [
          "directory"
          "file"
        ];
        description = "Kind of Product live USB persistence entry.";
      };

      target = lib.mkOption {
        type = lib.types.str;
        description = "Runtime path exposed to the Product kiosk session.";
      };

      source = lib.mkOption {
        type = lib.types.str;
        description = "Path relative to the approved persistence root.";
      };

      owner = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Owner applied when preparing this entry.";
      };

      group = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Group applied when preparing this entry.";
      };

      mode = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Mode applied when preparing this entry.";
      };
    };
  };
  productHome = "/home/${compositorCfg.user}";
  developerHome = "${cfg.root}/developer/home";
  effectiveHome = if cfg.artifact == "developer" then developerHome else productHome;
  productAllowlist = [
    {
      kind = "directory";
      target = "${productHome}/.config/korri";
      source = "product/home/.config/korri";
      owner = compositorCfg.user;
      group = compositorGroup;
      mode = "0700";
    }
    {
      kind = "directory";
      target = "${productHome}/.local/share/korri";
      source = "product/home/.local/share/korri";
      owner = compositorCfg.user;
      group = compositorGroup;
      mode = "0700";
    }
    {
      kind = "directory";
      target = "${productHome}/.local/state/korri";
      source = "product/home/.local/state/korri";
      owner = compositorCfg.user;
      group = compositorGroup;
      mode = "0700";
    }
    {
      kind = "directory";
      target = "${productHome}/.cache/moonlight";
      source = "product/home/.cache/moonlight";
      owner = compositorCfg.user;
      group = compositorGroup;
      mode = "0700";
    }
    {
      kind = "file";
      target = "/var/lib/korri-live-usb/device-id";
      source = "product/device-id";
      owner = "root";
      group = "root";
      mode = "0600";
    }
  ];
  persistenceScope = if cfg.artifact == "developer" then "developer-broad" else "product-allowlist";
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

    artifact = lib.mkOption {
      type = lib.types.enum [
        "product"
        "developer"
      ];
      default = "product";
      description = "Live USB artifact contract. Product is allowlisted; Developer is broad and opt-in.";
    };

    scope = lib.mkOption {
      type = lib.types.enum [
        "product-allowlist"
        "developer-broad"
      ];
      description = "Derived persistence scope for the selected live USB artifact.";
    };

    productAllowlist = lib.mkOption {
      type = lib.types.listOf persistenceEntryType;
      default = [ ];
      description = "Concrete Product ISO persistence entries prepared from approved same-stick storage.";
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

    services.korri.liveUsbPersistence = lib.mkIf cfg.enable {
      scope = persistenceScope;
      productAllowlist = productAllowlist;
    };

    services.korri.compositor = lib.mkIf cfg.enable {
      user = lib.mkDefault "korri";
      home = lib.mkDefault effectiveHome;
      configHome = lib.mkDefault "${effectiveHome}/.config";
      dataHome = lib.mkDefault "${effectiveHome}/.local/share";
      stateHome = lib.mkDefault "${effectiveHome}/.local/state";
      wants = [ "korri-live-usb-persistence.service" ];
      after = [ "korri-live-usb-persistence.service" ];
      environment = {
        XDG_CACHE_HOME = "${effectiveHome}/.cache";
        KORRI_LIVE_USB_ARTIFACT = cfg.artifact;
        KORRI_LIVE_USB_PERSISTENCE_ROOT = cfg.root;
        KORRI_LIVE_USB_PERSISTENCE_SCOPE = persistenceScope;
        KORRI_MOONLIGHT_STATE_HOME = "${effectiveHome}/.cache/moonlight";
      };
    };

    systemd.services."korri-compositor" = lib.mkIf cfg.enable {
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
          user = compositorCfg.user;
        };
        default_session = {
          command = toString greetdSession;
          user = compositorCfg.user;
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

    users.users.${compositorCfg.user} = lib.mkIf (cfg.enable && compositorCfg.createUser) {
      shell = pkgs.bashInteractive;
      openssh.authorizedKeys.keys = cfg.debugSsh.authorizedKeys;
      extraGroups = lib.mkAfter [
        "adm"
        "systemd-journal"
      ];
    };

    systemd.services."korri-live-usb-persistence" = lib.mkIf cfg.enable {
      description = "Resolve Korri live USB same-stick persistence";
      wantedBy = [ "multi-user.target" ];
      before = [ "korri-compositor.service" ];
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
        KORRI_LIVE_USB_ARTIFACT = cfg.artifact;
        KORRI_LIVE_USB_PERSISTENCE_SCOPE = persistenceScope;
        KORRI_LIVE_USB_RUNTIME_HOME = compositorCfg.home;
        KORRI_LIVE_USB_DEVICE_ID_TARGET = "/var/lib/korri-live-usb/device-id";
        KORRI_LIVE_USB_STATE_USER = compositorCfg.user;
        KORRI_LIVE_USB_STATE_GROUP = compositorGroup;
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
