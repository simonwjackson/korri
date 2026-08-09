{ korri }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.korridLinuxDevice;
  system = pkgs.stdenv.hostPlatform.system;
  serviceUser = "korrid";
  serviceGroup = "korrid";
  controlGroup = "korri-control";
  controlDirectory = builtins.dirOf cfg.controlSocket;
  validAbsolutePath = path:
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
  options.services.korridLinuxDevice = {
    enable = lib.mkEnableOption "Linux korrid device service";
    package = lib.mkOption {
      type = lib.types.package;
      default = korri.packages.${system}.korrid;
      defaultText = lib.literalExpression "korri.packages.${system}.korrid";
    };
    uid = lib.mkOption { type = lib.types.ints.positive; };
    gid = lib.mkOption { type = lib.types.ints.positive; };
    gameplayUser = lib.mkOption { type = lib.types.str; };
    gameplayUid = lib.mkOption { type = lib.types.ints.positive; };
    gameplayGid = lib.mkOption { type = lib.types.ints.positive; };
    inputdUid = lib.mkOption { type = lib.types.ints.positive; };
    controlGid = lib.mkOption { type = lib.types.ints.positive; };
    address = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1:43117";
    };
    deviceConfig = lib.mkOption {
      type = lib.types.path;
      description = "Root-owned immutable Linux device TOML configuration.";
    };
    storageRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/korri";
    };
    privateStateRoot = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/korrid";
    };
    controlSocket = lib.mkOption {
      type = lib.types.str;
      default = "/run/korrid-control/control.sock";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.uid != cfg.gameplayUid;
        message = "korrid's service UID must differ from the untrusted gameplay UID.";
      }
      {
        assertion =
          let
            user = config.users.users.${cfg.gameplayUser} or { };
            group = config.users.groups.${user.group or ""} or { };
          in
          (user.uid or null) == cfg.gameplayUid && (group.gid or null) == cfg.gameplayGid;
        message = "configured gameplay UID/GID must exactly match the gameplay user's primary identity.";
      }
      {
        assertion = cfg.gid != cfg.gameplayGid && cfg.controlGid != cfg.gameplayGid;
        message = "korrid and local-control GIDs must differ from the gameplay GID.";
      }
      {
        assertion = lib.hasPrefix "/nix/store/" (toString cfg.deviceConfig);
        message = "korrid deviceConfig must be an immutable Nix-store path.";
      }
      {
        assertion = validAbsolutePath cfg.privateStateRoot;
        message = "korrid privateStateRoot must be a normalized absolute path.";
      }
      {
        assertion = validAbsolutePath cfg.controlSocket && validAbsolutePath controlDirectory;
        message = "korrid controlSocket and its directory must be normalized absolute paths.";
      }
      {
        assertion =
          let
            user = config.users.users.${cfg.gameplayUser} or { };
          in
          !(builtins.elem "input" (user.extraGroups or [ ]))
          && !(builtins.elem "uinput" (user.extraGroups or [ ]))
          && !(builtins.elem controlGroup (user.extraGroups or [ ]));
        message = "the gameplay user must not hold raw input, uinput, or local-control groups.";
      }
    ];

    users.groups.${serviceGroup}.gid = cfg.gid;
    users.groups.${controlGroup}.gid = cfg.controlGid;
    users.users.${serviceUser} = {
      uid = cfg.uid;
      group = serviceGroup;
      isSystemUser = true;
    };

    environment.systemPackages = [ cfg.package ];

    systemd.tmpfiles.rules = [
      "d ${controlDirectory} 0750 root ${controlGroup} -"
      "d ${cfg.privateStateRoot} 0700 ${serviceUser} ${serviceGroup} -"
      "d /dev/inputplumber 0700 root root -"
      "d /dev/inputplumber/sources 0700 root root -"
    ];

    systemd.sockets.korrid-control = {
      description = "Private korrid exact-session control socket";
      wantedBy = [ "sockets.target" ];
      before = [ "korrid.service" ];
      requires = [ "systemd-tmpfiles-setup.service" ];
      after = [
        "systemd-tmpfiles-setup.service"
        "systemd-tmpfiles-resetup.service"
      ];
      socketConfig = {
        ListenStream = cfg.controlSocket;
        SocketUser = "root";
        SocketGroup = controlGroup;
        SocketMode = "0660";
        DirectoryMode = "0750";
        RemoveOnStop = true;
        Service = "korrid.service";
      };
    };

    systemd.services.korrid = {
      description = "Korri Linux device daemon";
      wantedBy = [ "multi-user.target" ];
      requires = [ "korrid-control.socket" ];
      after = [
        "network.target"
        "korrid-control.socket"
        "systemd-tmpfiles-setup-dev.service"
        "systemd-tmpfiles-resetup.service"
      ];
      environment = {
        KORRID_MODE = "host";
        KORRID_ADDRESS = cfg.address;
        KORRID_HOST_CONFIG = toString cfg.deviceConfig;
        KORRID_STORAGE_ROOT = cfg.storageRoot;
        KORRID_PRIVATE_STATE_ROOT = cfg.privateStateRoot;
        KORRID_CONTROL_SOCKET = cfg.controlSocket;
        KORRID_CONTROL_DIRECTORY = controlDirectory;
        KORRID_CONTROL_PEER_UID = toString cfg.inputdUid;
        KORRID_CONTROL_PEER_GID = toString cfg.controlGid;
        KORRID_GAMEPLAY_UID = toString cfg.gameplayUid;
        KORRID_GAMEPLAY_GID = toString cfg.gameplayGid;
        KORRID_SYSTEMD_RUN = "${pkgs.systemd}/bin/systemd-run";
        KORRID_SYSTEMCTL = "${pkgs.systemd}/bin/systemctl";
      };
      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        User = serviceUser;
        Group = serviceGroup;
        StateDirectory = "korrid";
        StateDirectoryMode = "0700";
        RuntimeDirectory = "korrid";
        RuntimeDirectoryMode = "0700";
        Restart = "on-failure";
        RestartSec = 1;
        NoNewPrivileges = true;
        CapabilityBoundingSet = [ ];
        AmbientCapabilities = [ ];
        RestrictAddressFamilies = [
          "AF_UNIX"
          "AF_INET"
          "AF_INET6"
        ];
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectProc = "invisible";
        ProcSubset = "pid";
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = false;
        SystemCallArchitectures = "native";
        UMask = "0077";
        ReadWritePaths = [
          cfg.privateStateRoot
          cfg.storageRoot
        ];
        InaccessiblePaths = [
          "/dev/uinput"
          "/dev/inputplumber/sources"
        ];
      };
    };

    security.polkit.enable = true;
    security.polkit.extraConfig = ''
      polkit.addRule(function(action, subject) {
        var unit = action.lookup("unit");
        if (action.id == "org.freedesktop.systemd1.manage-units" &&
            subject.system_unit == "korrid.service" &&
            typeof unit == "string" && /^korri-game-[0-9a-f]{32}\\.service$/.test(unit)) {
          return polkit.Result.YES;
        }
      });
    '';
  };
}
