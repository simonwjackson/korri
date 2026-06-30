{ config, lib, pkgs, ... }:

let
  cfg = config.services.korri.runtime;

  inherit (lib) mkEnableOption mkOption types;

  korriSessionShellInit = ''
    if [ "''${USER:-}" = "${cfg.user}" ]; then
      export XDG_RUNTIME_DIR="/run/user/$(id -u)"

      if [ -z "''${WAYLAND_DISPLAY:-}" ]; then
        for candidate in "$XDG_RUNTIME_DIR"/wayland-*; do
          case "$candidate" in
            *.lock) continue ;;
          esac
          if [ -S "$candidate" ]; then
            export WAYLAND_DISPLAY="$(basename "$candidate")"
            break
          fi
        done
      fi

      if [ -z "''${SWAYSOCK:-}" ]; then
        for candidate in "$XDG_RUNTIME_DIR"/sway-ipc.*.sock; do
          if [ -S "$candidate" ]; then
            export SWAYSOCK="$candidate"
            break
          fi
        done
      fi
    fi
  '';
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

    createUser = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Create the configured Korri runtime user and group. Disable on
        desktop/source hosts that intentionally map Korri's runtime identity
        to an already-managed local user while still using Korri-owned runtime
        paths and setup services.
      '';
    };

    uid = mkOption {
      type = types.ints.positive;
      default = 2000;
      description = "Stable non-zero UID for the Korri appliance user when createUser is true.";
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

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.user != "root";
        message = "services.korri.runtime.user must not be root.";
      }
      {
        assertion = cfg.uid != 0;
        message = "services.korri.runtime.uid must be non-zero.";
      }
      {
        assertion = lib.hasPrefix "/home/" cfg.home;
        message = "services.korri.runtime.home must be a normal /home/<user> path.";
      }
      {
        assertion = lib.hasPrefix "/var/lib/korri" cfg.stateRoot;
        message = "services.korri.runtime.stateRoot must live under /var/lib/korri.";
      }
      {
        assertion = lib.hasPrefix cfg.stateRoot cfg.gamesRoot;
        message = "services.korri.runtime.gamesRoot must live under services.korri.runtime.stateRoot.";
      }
      {
        assertion = lib.hasPrefix "/run/korri/" cfg.launchArtifactsDir;
        message = "services.korri.runtime.launchArtifactsDir must live under /run/korri.";
      }
      {
        assertion = (config.users.users.${cfg.user}.linger or false) != true;
        message = "Korri must not use pre-session lingering; start korri-session.target from a real greetd/logind session.";
      }
    ];

    users.groups = lib.mkIf cfg.createUser (
      lib.genAttrs ([ cfg.group ] ++ cfg.extraGroups) (_: { })
    );

    users.users.${cfg.user} = lib.mkIf cfg.createUser {
      isNormalUser = true;
      uid = cfg.uid;
      group = cfg.group;
      home = cfg.home;
      createHome = true;
      shell = pkgs.bashInteractive;
      extraGroups = cfg.extraGroups;
    };

    environment.loginShellInit = korriSessionShellInit;
    environment.interactiveShellInit = korriSessionShellInit;

    systemd.user.targets.korri-session = {
      description = "Korri appliance session";
    };
  };
}
