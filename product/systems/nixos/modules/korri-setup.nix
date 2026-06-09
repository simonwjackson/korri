{ config, lib, pkgs, ... }:

let
  inherit (lib) mkEnableOption mkIf mkOption types;
  runtime = config.services.korri.runtime;
  cfg = config.services.korri.setup;
  setupScript = pkgs.writeShellScript "korri-setup" ''
    set -eu

    install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${lib.escapeShellArg runtime.home}
    install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${lib.escapeShellArg runtime.stateRoot}
    install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${lib.escapeShellArg runtime.stateRoot}/content
    install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${lib.escapeShellArg runtime.stateRoot}/library
    install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${lib.escapeShellArg runtime.gamesRoot}
    install -d -o ${runtime.user} -g ${runtime.group} -m 0700 ${lib.escapeShellArg runtime.launchArtifactsDir}
  '';
in
{
  key = "korri-setup";

  options.services.korri.setup = {
    enable = mkEnableOption "Korri privileged setup boundary" // { default = runtime.enable; };

    requireForGreetd = mkOption {
      type = types.bool;
      default = true;
      description = "Require korri-setup.service before greetd starts.";
    };
  };

  config = mkIf cfg.enable {
    systemd.services.korri-setup = {
      description = "Prepare Korri appliance runtime directories";
      wantedBy = [ "multi-user.target" ];
      before = lib.optional cfg.requireForGreetd "greetd.service";
      serviceConfig = {
        Type = "oneshot";
        ExecStart = setupScript;
        RemainAfterExit = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ReadWritePaths = [ runtime.home runtime.stateRoot "/run/korri" ];
        NoNewPrivileges = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        RestrictRealtime = true;
        LockPersonality = true;
        SystemCallArchitectures = "native";
      };
    };

    systemd.tmpfiles.rules = [
      "d ${runtime.stateRoot} 0750 ${runtime.user} ${runtime.group} -"
      "d ${runtime.stateRoot}/content 0750 ${runtime.user} ${runtime.group} -"
      "d ${runtime.stateRoot}/library 0750 ${runtime.user} ${runtime.group} -"
      "d ${runtime.gamesRoot} 0750 ${runtime.user} ${runtime.group} -"
      "d /run/korri 0710 ${runtime.user} ${runtime.group} -"
      "d ${runtime.launchArtifactsDir} 0700 ${runtime.user} ${runtime.group} -"
    ];

    systemd.services.greetd = mkIf cfg.requireForGreetd {
      requires = [ "korri-setup.service" ];
      after = [ "korri-setup.service" ];
    };
  };
}
