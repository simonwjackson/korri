{ korri }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.korriLinuxHost;
  system = pkgs.stdenv.hostPlatform.system;
  sunshineApproved = import ../../sunshine/approved-patches.nix;
  gameplayHome = config.users.users.${cfg.gameplayUser}.home or "/home/${cfg.gameplayUser}";
  sunshineConfig =
    if cfg.sunshine.configDirectory == null then
      "${gameplayHome}/.config/sunshine"
    else
      cfg.sunshine.configDirectory;
  generatedDeviceConfig = pkgs.writeText "korrid-${cfg.label}-host.toml" ''
    label = "${cfg.label}"

    [environment]
    DISPLAY = "${cfg.display}"

    ${lib.optionalString cfg.validation.enable ''
      [[games]]
      id = "inputd-gate"
      title = "Input gate"
      command = ["${pkgs.coreutils}/bin/sleep", "600"]
    ''}
  '';
  deviceConfig = if cfg.deviceConfig == null then generatedDeviceConfig else cfg.deviceConfig;
  waitForX11 = pkgs.writeShellScript "korri-wait-for-x11" ''
    set -eu
    attempt=0
    while [ "$attempt" -lt 60 ]; do
      if ${pkgs.xorg.xdpyinfo}/bin/xdpyinfo -display ${lib.escapeShellArg cfg.display} >/dev/null 2>&1; then
        exit 0
      fi
      attempt=$((attempt + 1))
      ${pkgs.coreutils}/bin/sleep 0.25
    done
    echo "X11 display ${cfg.display} did not become ready" >&2
    exit 1
  '';
  validationActionSource = pkgs.writeText "korri-input-action-fixture.c" ''
    #include <unistd.h>

    int main(void) {
      for (;;) {
        pause();
      }
    }
  '';
  validationActionFixture = pkgs.runCommandCC "korri-input-action-fixture" { } ''
    mkdir -p "$out/bin"
    "$CC" -O2 -Wall -Wextra -Werror ${validationActionSource} \
      -o "$out/bin/korri-input-action-fixture"
  '';
  validationActions = lib.optionalAttrs cfg.validation.enable {
    workspace-next.command = [
      "${validationActionFixture}/bin/korri-input-action-fixture"
    ];
  };
  validAbsolutePath =
    path:
    lib.hasPrefix "/" path
    && path != "/"
    && !(lib.hasInfix "//" path)
    && !(lib.hasInfix "/./" path)
    && !(lib.hasSuffix "/." path)
    && !(lib.hasInfix "/../" path)
    && !(lib.hasSuffix "/.." path)
    && builtins.match ".*[[:space:]].*" path == null;
in
{
  imports = [
    (import ./korri-bundle-module.nix { inherit korri; })
    (import ./korri-input.nix { inherit korri; })
    (import ../../korrid/nixos-module.nix { inherit korri; })
  ];

  options.services.korriLinuxHost = {
    enable = lib.mkEnableOption "isolated Korri Linux input and streaming host";

    label = lib.mkOption {
      type = lib.types.strMatching "^[A-Za-z0-9._-]+$";
      default = config.networking.hostName;
      description = "Non-secret host label published by the local korrid service.";
    };

    gameplayUser = lib.mkOption {
      type = lib.types.str;
      description = "Existing untrusted gameplay user.";
    };
    gameplayUid = lib.mkOption {
      type = lib.types.ints.positive;
      description = "Exact UID of the gameplay user.";
    };
    gameplayGroup = lib.mkOption {
      type = lib.types.str;
      default = "users";
      description = "Existing primary group of the gameplay user.";
    };
    gameplayGid = lib.mkOption {
      type = lib.types.ints.positive;
      description = "Exact primary GID of the gameplay user.";
    };

    apiPort = lib.mkOption {
      type = lib.types.port;
      default = 39217;
      description = "LAN and tailnet korrid API port.";
    };
    firewallInterfaces = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Interfaces that can reach the korrid API port.";
    };

    deviceConfig = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Optional immutable korrid device configuration.";
    };
    storageRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/korri";
    };
    privateStateRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/korrid";
    };

    display = lib.mkOption {
      type = lib.types.strMatching "^:[0-9]+$";
      default = ":0";
    };
    resolution = lib.mkOption {
      type = lib.types.strMatching "^[1-9][0-9]*x[1-9][0-9]*x(16|24|32)$";
      default = "1920x1080x24";
    };

    serviceIdentities = {
      inputdUid = lib.mkOption {
        type = lib.types.ints.positive;
        default = 977;
      };
      controlGid = lib.mkOption {
        type = lib.types.ints.positive;
        default = 977;
      };
      korridUid = lib.mkOption {
        type = lib.types.ints.positive;
        default = 976;
      };
      korridGid = lib.mkOption {
        type = lib.types.ints.positive;
        default = 976;
      };
      sunshineGid = lib.mkOption {
        type = lib.types.ints.positive;
        default = 979;
      };
    };

    sunshine = {
      package = lib.mkOption {
        type = lib.types.package;
        default = korri.packages.${system}.sunshine-korri;
        defaultText = lib.literalExpression "korri.packages.${system}.sunshine-korri";
        description = "Korri-owned patched Sunshine package.";
      };
      configDirectory = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Existing private Sunshine configuration directory.";
      };
      openFirewall = lib.mkOption {
        type = lib.types.bool;
        default = true;
      };
      runtimeSettings.enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Enable the Korri Sunshine live runtime-settings protocol.";
      };
    };

    validation.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Install the bounded input-host validation game and direct action.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion =
          let
            user = config.users.users.${cfg.gameplayUser} or { };
            group = config.users.groups.${cfg.gameplayGroup} or { };
          in
          (user.isNormalUser or false)
          && (user.uid or null) == cfg.gameplayUid
          && (user.group or null) == cfg.gameplayGroup
          && (group.gid or null) == cfg.gameplayGid;
        message = "services.korriLinuxHost gameplay identity must match an existing user and primary group exactly.";
      }
      {
        assertion = lib.all (value: value != cfg.gameplayUid && value != cfg.gameplayGid) [
          cfg.serviceIdentities.inputdUid
          cfg.serviceIdentities.controlGid
          cfg.serviceIdentities.korridUid
          cfg.serviceIdentities.korridGid
          cfg.serviceIdentities.sunshineGid
        ];
        message = "Korri service identities must differ from the gameplay identity.";
      }
      {
        assertion =
          cfg.serviceIdentities.inputdUid != cfg.serviceIdentities.korridUid
          && cfg.serviceIdentities.controlGid != cfg.serviceIdentities.korridGid
          && cfg.serviceIdentities.controlGid != cfg.serviceIdentities.sunshineGid
          && cfg.serviceIdentities.korridGid != cfg.serviceIdentities.sunshineGid;
        message = "Korri service identities must remain distinct.";
      }
      {
        assertion =
          lib.getName cfg.sunshine.package == "sunshine-korri"
          && (cfg.sunshine.package.drvPath or null) == korri.packages.${system}.sunshine-korri.drvPath
          && (cfg.sunshine.package.outPath or null) == korri.packages.${system}.sunshine-korri.outPath
          && (cfg.sunshine.package.korriPatchSetSha256 or null) == sunshineApproved.patchSetSha256
          && (cfg.sunshine.package.korriBaseSunshineVersion or null) == sunshineApproved.baseSunshineVersion
          && (cfg.sunshine.package.korriApprovedBaseSunshineSourceHash or null) == sunshineApproved.approvedBaseSourceHash
          && (cfg.sunshine.package.korriReviewedLibavcodecVersion or null) == sunshineApproved.reviewedLibavcodecVersion
          && builtins.elem (cfg.sunshine.package.korriBaseSunshineDerivation or "") sunshineApproved.approvedBaseDerivations
          && (cfg.sunshine.package.korriApprovedBaseSunshineDerivation or null) == (cfg.sunshine.package.korriBaseSunshineDerivation or null)
          && (cfg.sunshine.package.korriProvenanceRelativePath or null) == "share/korri/sunshine-korri/provenance"
          && builtins.elem "0015-add-korri-input-seat-event-mirror.patch" (cfg.sunshine.package.korriPatchNames or [ ]);
        message = "services.korriLinuxHost must use the exact approved sunshine-korri package and provenance contract.";
      }
      {
        assertion = lib.all validAbsolutePath [
          gameplayHome
          sunshineConfig
          cfg.storageRoot
          cfg.privateStateRoot
        ];
        message = "services.korriLinuxHost paths must be normalized absolute paths without whitespace.";
      }
      {
        assertion = lib.all (name: builtins.match "[A-Za-z0-9_.:-]+" name != null) cfg.firewallInterfaces;
        message = "services.korriLinuxHost firewall interface names are invalid.";
      }
    ];

    services.korriBundle.enable = true;

    services.korriLinuxInput = {
      provider = {
        enable = true;
        # Keep source nodes in /dev/input so InputPlumber's upstream watcher can
        # preserve one persistent target across hotplug. InputPlumber removes
        # uaccess and sets mode 000; the device gate proves gameplay denial.
        sunshine = {
          enableUinputAccess = true;
          serviceName = "sunshine";
          gid = cfg.serviceIdentities.sunshineGid;
        };
      };
      inputd = {
        enable = true;
        requireProvider = true;
        uid = cfg.serviceIdentities.inputdUid;
        controlGid = cfg.serviceIdentities.controlGid;
        actionUser = cfg.gameplayUser;
        actionUid = cfg.gameplayUid;
        actionGid = cfg.gameplayGid;
        actions = validationActions;
      };
    };

    services.korridLinuxDevice = {
      enable = true;
      uid = cfg.serviceIdentities.korridUid;
      gid = cfg.serviceIdentities.korridGid;
      gameplayUser = cfg.gameplayUser;
      gameplayUid = cfg.gameplayUid;
      gameplayGid = cfg.gameplayGid;
      inputdUid = cfg.serviceIdentities.inputdUid;
      controlGid = cfg.serviceIdentities.controlGid;
      inherit deviceConfig;
      address = "0.0.0.0:${toString cfg.apiPort}";
      storageRoot = cfg.storageRoot;
      privateStateRoot = cfg.privateStateRoot;
      sunshinePrivateStateRoot = sunshineConfig;
    };

    services.sunshine = {
      enable = true;
      autoStart = false;
      openFirewall = cfg.sunshine.openFirewall;
      package = cfg.sunshine.package;
    };
    systemd.user.services.sunshine.enable = lib.mkForce false;

    hardware.graphics.enable = true;

    users.users.${cfg.gameplayUser} = {
      uid = lib.mkDefault cfg.gameplayUid;
      group = lib.mkDefault cfg.gameplayGroup;
      extraGroups = lib.mkAfter [
        "render"
        "video"
      ];
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.storageRoot} 0700 korrid korrid -"
    ];

    networking.firewall.interfaces = lib.genAttrs cfg.firewallInterfaces (_: {
      allowedTCPPorts = [ cfg.apiPort ];
    });

    systemd.services.x11-headless = {
      description = "Headless X11 session for Korri";
      wantedBy = [ "multi-user.target" ];
      before = [ "sunshine.service" ];
      after = [ "systemd-tmpfiles-setup.service" ];
      serviceConfig = {
        Type = "simple";
        User = cfg.gameplayUser;
        Group = cfg.gameplayGroup;
        ExecStart = "${pkgs.xorg.xorgserver}/bin/Xvfb ${cfg.display} -screen 0 ${cfg.resolution} -nolisten tcp -noreset";
        Restart = "on-failure";
        RestartSec = 2;
        NoNewPrivileges = true;
        CapabilityBoundingSet = [ ];
        AmbientCapabilities = [ ];
        PrivateTmp = false;
        PrivateDevices = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = true;
        SystemCallArchitectures = "native";
        ReadWritePaths = [ "/tmp" ];
      };
    };

    systemd.services.sunshine = {
      description = "Sunshine stream host for Korri";
      wantedBy = [ "multi-user.target" ];
      requires = [
        "korri-input-source-guard.service"
        "x11-headless.service"
      ];
      after = [
        "korri-input-source-guard.service"
        "network-online.target"
        "x11-headless.service"
      ];
      wants = [ "network-online.target" ];
      environment = {
        DISPLAY = cfg.display;
        HOME = gameplayHome;
        XDG_CONFIG_HOME = "${gameplayHome}/.config";
      }
      // lib.optionalAttrs cfg.sunshine.runtimeSettings.enable {
        SUNSHINE_LIVE_SETTINGS_MVP = "1";
      };
      serviceConfig = {
        Type = "simple";
        User = cfg.gameplayUser;
        Group = cfg.gameplayGroup;
        SupplementaryGroups = [
          "video"
          "render"
        ];
        WorkingDirectory = gameplayHome;
        ExecStartPre = waitForX11;
        ExecStart = "${lib.getExe cfg.sunshine.package} ${sunshineConfig}/sunshine.conf";
        Restart = "on-failure";
        RestartSec = 5;
        UMask = "0077";
        NoNewPrivileges = true;
        CapabilityBoundingSet = [ ];
        AmbientCapabilities = [ ];
        PrivateTmp = false;
        PrivateDevices = false;
        ProtectSystem = "strict";
        ProtectHome = "read-only";
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = false;
        SystemCallArchitectures = "native";
        ReadWritePaths = [
          sunshineConfig
          "/tmp"
        ];
        InaccessiblePaths = [ "/dev/inputplumber/sources" ];
      };
    };

    services.udev.extraRules = lib.mkAfter ''
      KERNEL=="uinput", SUBSYSTEM=="misc", TAG-="uaccess", OWNER="root", GROUP="korri-sunshine-uinput", MODE="0660", OPTIONS+="static_node=uinput"
    '';
  };
}
