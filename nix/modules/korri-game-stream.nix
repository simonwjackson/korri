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
  inherit (lib)
    mkIf
    mkOption
    types
    optionalString
    ;

  intentPathExpression =
    if cfg.intentPath != null then
      lib.escapeShellArg cfg.intentPath
    else
      ''"$runtime_dir/next-launch.json"'';

  runnerCommand = pkgs.writeShellScript "korri-game-stream-sunshine-app" ''
    set -eu

    if [ "$(id -u)" = "0" ]; then
      echo "korri-game-stream: refusing to run as root" >&2
      exit 126
    fi

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
    export KORRI_GAME_STREAM_INTENT_PATH=${intentPathExpression}
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
      default = "Korri Stream";
      description = "Generic Sunshine application name used by Moonlight clients.";
    };

    sessionEnvFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "%h/.config/korri/game-stream.env";
      description = ''
        Optional trusted runtime environment file sourced before launching the
        runner as the non-root Sunshine/session user. Use this to provide fresh
        Sway/Wayland session values such as WAYLAND_DISPLAY, XDG_RUNTIME_DIR,
        and SWAYSOCK without baking volatile socket paths into the NixOS
        configuration.
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

    intentPath = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/user/1000/korri-game-stream/next-launch.json";
      description = ''
        Trusted pending launch-intent path consumed by the generic Sunshine app.
        When null, the wrapper uses $KORRI_GAME_STREAM_RUNTIME_DIR/next-launch.json,
        or $XDG_RUNTIME_DIR/korri-game-stream/next-launch.json. Enqueue a launch
        with `korri-game-stream-enqueue -- /absolute/command args...` while setting
        KORRI_GAME_STREAM_INTENT_PATH to the same path when needed.
      '';
    };

    gamescope = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Wrap the pending launch intent with Gamescope for fullscreen containment.";
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
          Add the generic Korri Stream application to services.sunshine.applications.
          Sunshine launches only this stable foreground runner; the actual process
          comes from the trusted pending launch intent consumed at session start.
          This module does not add a Korri TCP listener or arbitrary remote command
          endpoint. Restrict Sunshine exposure to trusted networks or VPN. Disable
          this when the host wants to wire Sunshine applications itself.
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
    ]
    ++ cfg.path
    ++ lib.optionals cfg.gamescope.enable [ cfg.gamescope.package ];

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
