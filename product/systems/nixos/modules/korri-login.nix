{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.login;
  runtime = config.services.korri.runtime;

  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  sessionCommand = pkgs.writeShellScript "korri-login-session" ''
    set -euo pipefail

    ${pkgs.systemd}/bin/systemctl --user start ${lib.escapeShellArg cfg.target}
    exec ${pkgs.coreutils}/bin/sleep infinity
  '';
in
{
  key = "korri-login";

  imports = [
    ./korri-runtime.nix
    ./korri-setup.nix
  ];

  options.services.korri.login = {
    enable = mkEnableOption "Korri boot login session";

    autologin = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Start the Korri runtime user automatically through greetd. This creates
        a real PAM/logind user session, starts the Korri user target, and keeps
        that login session alive for user-scoped Korri services.
      '';
    };

    target = mkOption {
      type = types.str;
      default = "korri-session.target";
      description = "User-systemd target started by the Korri login session.";
    };

    vt = mkOption {
      type = types.ints.positive;
      default = 1;
      description = "Virtual terminal used by greetd for the Korri login session.";
    };

    command = mkOption {
      type = types.path;
      readOnly = true;
      default = sessionCommand;
      description = "Generated greetd session command that starts the Korri user target.";
    };
  };

  config = mkIf (cfg.enable && cfg.autologin) {
    services.greetd = {
      enable = true;
      settings = {
        initial_session = {
          command = toString cfg.command;
          user = runtime.user;
        };
        default_session = {
          command = toString cfg.command;
          user = runtime.user;
        };
        terminal.vt = cfg.vt;
      };
    };

    systemd.services.greetd = {
      wants = [ "systemd-user-sessions.service" ];
      after = [ "systemd-user-sessions.service" ];
    };
  };
}
