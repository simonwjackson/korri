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

    ${pkgs.systemd}/bin/systemctl --user start korri-session.target
    exec ${pkgs.coreutils}/bin/sleep infinity
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

  isAbsolutePath = path: lib.hasPrefix "/" path;
  isSafeRelativePath =
    path:
    path != ""
    && !lib.hasPrefix "/" path
    && path != ".."
    && !lib.hasPrefix "../" path
    && !lib.hasSuffix "/.." path
    && !lib.hasInfix "/../" path;
  isSafeMarker = marker: marker != "" && !lib.hasInfix "/" marker && marker != "." && marker != "..";
  isValidMode = mode: mode == null || builtins.match "^[0-7]{3,4}$" mode != null;
  isValidOwner = owner: owner == null || owner != "";
  persistenceEntryAssertions = lib.concatMap (entry: [
    {
      assertion = isAbsolutePath entry.target;
      message = "services.korri.liveUsbPersistence.productAllowlist target must be an absolute path (got \"${entry.target}\").";
    }
    {
      assertion = isSafeRelativePath entry.source;
      message = "services.korri.liveUsbPersistence.productAllowlist source must be a safe relative path (got \"${entry.source}\").";
    }
    {
      assertion = isValidOwner entry.owner && isValidOwner entry.group;
      message = "services.korri.liveUsbPersistence.productAllowlist owner/group must be null or non-empty.";
    }
    {
      assertion = isValidMode entry.mode;
      message = "services.korri.liveUsbPersistence.productAllowlist mode must be an octal mode (got \"${toString entry.mode}\").";
    }
  ]) cfg.productAllowlist;
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
    assertions = lib.optionals cfg.enable (
      [
        {
          assertion = isAbsolutePath cfg.root;
          message = "services.korri.liveUsbPersistence.root must be an absolute path (got \"${cfg.root}\").";
        }
        {
          assertion = isAbsolutePath cfg.bootMountPoint;
          message = "services.korri.liveUsbPersistence.bootMountPoint must be an absolute path (got \"${cfg.bootMountPoint}\").";
        }
        {
          assertion = isSafeMarker cfg.markerPersistent && isSafeMarker cfg.markerEphemeral;
          message = "services.korri.liveUsbPersistence persistence markers must be relative filenames.";
        }
        {
          assertion = cfg.scope == persistenceScope;
          message = ''
            services.korri.liveUsbPersistence.scope must match artifact "${cfg.artifact}"
            (expected "${persistenceScope}", got "${cfg.scope}").
          '';
        }
      ]
      ++ persistenceEntryAssertions
    );

    services.korri.client.package = lib.mkIf (
      cfg.enable && packagesForSystem ? korri-desktop-x86-kiosk
    ) (lib.mkDefault packagesForSystem.korri-desktop-x86-kiosk);

    services.korri.liveUsbPersistence = lib.mkIf cfg.enable {
      scope = persistenceScope;
      productAllowlist = productAllowlist;
    };

    services.korri.daemon = lib.mkIf cfg.enable {
      host = lib.mkForce "127.0.0.1";
      openFirewall = lib.mkForce false;
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
        # Moonlight Embedded uses XDG cache/home paths for client state; the
        # product allowlist below persists .cache/moonlight without retaining
        # the retired KORRI_MOONLIGHT_STATE_HOME launch-policy env seam.
        XDG_CACHE_HOME = "${effectiveHome}/.cache";
        KORRI_LIVE_USB_ARTIFACT = cfg.artifact;
        KORRI_LIVE_USB_PERSISTENCE_ROOT = cfg.root;
        KORRI_LIVE_USB_PERSISTENCE_SCOPE = persistenceScope;
      };
    };

    systemd.user.services."korri-compositor" = lib.mkIf cfg.enable {
      # A real greetd/login session starts korri-session.target; keep persistence
      # ordered before Sway starts inside that user target.
      requires = [ "korri-live-usb-persistence.service" ];
    };

    systemd.user.services."korri-sessiond" = lib.mkIf cfg.enable {
      serviceConfig = {
        # Product live USB exposes allowlisted home state as symlinks into the
        # persistence root. Sessiond's kiosk renderer opens paths under
        # /home/korri, but writes land under /persist/korri-live-usb after
        # symlink resolution; keep that target writable inside sessiond's
        # ProtectSystem=strict namespace.
        ReadWritePaths = [ cfg.root ];
      };
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
