{ config, lib, pkgs, ... }:

let
  inherit (lib) mkEnableOption mkOption types;
in
{
  key = "korri-runtime";

  options.services.korri.runtime = {
    enable = mkEnableOption "Korri appliance runtime identity" // { default = true; };

    user = mkOption {
      type = types.str;
      default = "korri";
      description = "Single Korri-owned runtime user.";
    };

    group = mkOption {
      type = types.str;
      default = "korri";
      description = "Primary Korri runtime group.";
    };

    uid = mkOption {
      type = types.ints.positive;
      default = 2000;
      description = "Stable non-zero UID for the Korri appliance user.";
    };

    home = mkOption {
      type = types.str;
      default = "/home/korri";
      description = "Korri runtime home directory.";
    };

    stateRoot = mkOption {
      type = types.str;
      default = "/var/lib/korri";
      description = "Korri product/service state root.";
    };

    gamesRoot = mkOption {
      type = types.str;
      default = "/var/lib/korri/content/games";
      description = "Human-facing manual game content root.";
    };

    runtimeSubdir = mkOption {
      type = types.str;
      default = "korri";
      description = "Subdirectory under XDG_RUNTIME_DIR for Korri session sockets.";
    };

    socketDir = mkOption {
      type = types.str;
      readOnly = true;
      default = "%t/korri";
      description = "User-manager socket directory for Korri session IPC.";
    };

    launchArtifactsDir = mkOption {
      type = types.str;
      default = "/run/korri/launch-artifacts";
      description = "Cross-session launch artifact directory prepared by root setup.";
    };

    extraGroups = mkOption {
      type = types.listOf types.str;
      default = [ "input" "render" "seat" "video" ];
      description = "Baseline appliance groups needed by Korri user services.";
    };
  };

  config = lib.mkIf config.services.korri.runtime.enable {
    assertions = [
      {
        assertion = config.services.korri.runtime.user != "root";
        message = "services.korri.runtime.user must not be root.";
      }
      {
        assertion = config.services.korri.runtime.uid != 0;
        message = "services.korri.runtime.uid must be non-zero.";
      }
      {
        assertion = lib.hasPrefix "/home/" config.services.korri.runtime.home;
        message = "services.korri.runtime.home must be a normal /home/<user> path.";
      }
      {
        assertion = lib.hasPrefix "/var/lib/korri" config.services.korri.runtime.stateRoot;
        message = "services.korri.runtime.stateRoot must live under /var/lib/korri.";
      }
      {
        assertion = lib.hasPrefix config.services.korri.runtime.stateRoot config.services.korri.runtime.gamesRoot;
        message = "services.korri.runtime.gamesRoot must live under services.korri.runtime.stateRoot.";
      }
      {
        assertion = lib.hasPrefix "/run/korri/" config.services.korri.runtime.launchArtifactsDir;
        message = "services.korri.runtime.launchArtifactsDir must live under /run/korri.";
      }
      {
        assertion = (config.users.users.${config.services.korri.runtime.user}.linger or false) != true;
        message = "Korri must not use pre-session lingering; start korri-session.target from a real greetd/logind session.";
      }
    ];

    users.groups = lib.genAttrs ([ config.services.korri.runtime.group ] ++ config.services.korri.runtime.extraGroups) (_: { });

    users.users.${config.services.korri.runtime.user} = {
      isNormalUser = true;
      uid = config.services.korri.runtime.uid;
      group = config.services.korri.runtime.group;
      home = config.services.korri.runtime.home;
      createHome = true;
      shell = "${pkgs.shadow}/bin/nologin";
      extraGroups = config.services.korri.runtime.extraGroups;
    };

    systemd.user.targets.korri-session = {
      description = "Korri appliance session";
      wantedBy = [ "default.target" ];
    };
  };
}
