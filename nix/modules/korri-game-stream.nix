{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.gameStream;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-game-stream-runner
      or (throw "Korri game stream runner package is not available for system `${system}`. Set services.korri.gameStream.package explicitly.");
  inherit (lib) mkIf mkOption types optionalString;

  runnerCommand = pkgs.writeShellScript "korri-game-stream-sunshine-app" ''
    set -eu

    ${optionalString (cfg.sessionEnvFile != null) ''
      if [ -f ${lib.escapeShellArg cfg.sessionEnvFile} ]; then
        set -a
        . ${lib.escapeShellArg cfg.sessionEnvFile}
        set +a
      fi
    ''}

    runtime_dir="''${KORRI_GAME_STREAM_RUNTIME_DIR:-''${XDG_RUNTIME_DIR:-/tmp}/korri-game-stream}"
    mkdir -p "$runtime_dir"

    export PATH=${lib.escapeShellArg (lib.makeBinPath cfg.path)}:$PATH
    export KORRI_GAME_STREAM_COMMAND=${lib.escapeShellArg cfg.game.command}
    export KORRI_GAME_STREAM_ARGS_JSON=${lib.escapeShellArg (builtins.toJSON cfg.game.args)}
    export KORRI_GAME_STREAM_USE_GAMESCOPE=${if cfg.gamescope.enable then "1" else "0"}
    export KORRI_GAME_STREAM_GAMESCOPE=${lib.escapeShellArg "${cfg.gamescope.package}/bin/gamescope"}
    export KORRI_GAME_STREAM_SWAYMSG=${lib.escapeShellArg "${cfg.sway.package}/bin/swaymsg"}
    export KORRI_GAME_STREAM_SWAY_REPAIR=${if cfg.sway.repair then "1" else "0"}
    export KORRI_GAME_STREAM_LOCK_PATH="''${KORRI_GAME_STREAM_LOCK_PATH:-$runtime_dir/run.lock}"
    export KORRI_GAME_STREAM_STATUS_PATH="''${KORRI_GAME_STREAM_STATUS_PATH:-$runtime_dir/status.json}"

    exec ${cfg.package}/bin/korri-game-stream-runner
  '';
in
{
  options.services.korri.gameStream = {
    enable = lib.mkEnableOption "Korri headless game stream runner";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-game-stream-runner";
      description = "Korri game stream runner package to run as a Sunshine application.";
    };

    appName = mkOption {
      type = types.str;
      default = "Korri Demo";
      description = "Sunshine application name used by Moonlight clients.";
    };

    sessionEnvFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "%h/.config/korri/game-stream.env";
      description = ''
        Optional runtime environment file sourced before launching the runner.
        Use this to provide fresh Sway/Wayland session values such as
        WAYLAND_DISPLAY, XDG_RUNTIME_DIR, and SWAYSOCK without baking volatile
        socket paths into the NixOS configuration.
      '';
    };

    path = mkOption {
      type = types.listOf types.package;
      default = with pkgs; [
        coreutils
        util-linux
      ];
      description = "Packages added to PATH for the Sunshine app wrapper.";
    };

    game = {
      package = mkOption {
        type = types.package;
        default = pkgs.neverball;
        defaultText = lib.literalExpression "pkgs.neverball";
        description = "Simple non-Steam game package used for the validation run.";
      };

      command = mkOption {
        type = types.str;
        default = "${cfg.game.package}/bin/neverball";
        defaultText = lib.literalExpression ''"\${config.services.korri.gameStream.game.package}/bin/neverball"'';
        description = "Absolute command launched by the runner.";
      };

      args = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "Arguments passed to the configured game command.";
      };
    };

    gamescope = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Wrap the validation game with Gamescope for v1 fullscreen containment.";
      };

      package = mkOption {
        type = types.package;
        default = pkgs.gamescope;
        defaultText = lib.literalExpression "pkgs.gamescope";
        description = "Gamescope package used by the runner wrapper.";
      };
    };

    sway = {
      repair = mkOption {
        type = types.bool;
        default = true;
        description = "Use swaymsg to wait for and repair the stream-surface fullscreen state.";
      };

      package = mkOption {
        type = types.package;
        default = pkgs.sway;
        defaultText = lib.literalExpression "pkgs.sway";
        description = "Sway package that provides swaymsg.";
      };
    };

    sunshine = {
      enableApp = mkOption {
        type = types.bool;
        default = true;
        description = ''
          Add the Korri Demo application to services.sunshine.applications.
          Disable this when the host wants to wire Sunshine applications itself.
        '';
      };

      outputLog = mkOption {
        type = types.str;
        default = "$HOME/.local/state/korri/game-stream-runner.log";
        description = "Sunshine app output log path.";
      };
    };
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [
      cfg.package
      cfg.game.package
    ] ++ cfg.path ++ lib.optionals cfg.gamescope.enable [ cfg.gamescope.package ];

    services.sunshine.applications = mkIf cfg.sunshine.enableApp {
      apps = [
        {
          name = cfg.appName;
          cmd = runnerCommand;
          output = cfg.sunshine.outputLog;
          "auto-detach" = false;
          "wait-all" = true;
        }
      ];
    };
  };
}
