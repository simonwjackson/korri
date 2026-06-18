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
    packagesForSystem.korri-game-stream
      or (throw "Korri game stream runner package is not available for system `${system}`. Set services.korri.gameStream.package explicitly.");
  inherit (lib)
    mkIf
    mkOption
    types
    optionalString
    ;

  shellPathExpression =
    path:
    if lib.hasPrefix "%t/" path then
      ''"$XDG_RUNTIME_DIR/${lib.removePrefix "%t/" path}"''
    else
      lib.escapeShellArg path;

  runtimeDirExpression = if cfg.runtimeDir != null then shellPathExpression cfg.runtimeDir else null;

  isAbsolutePath = path: lib.hasPrefix "/" path;
  isUserRuntimePath = path: lib.hasPrefix "%t/" path;
  isSupportedPath = path: path == null || isAbsolutePath path || isUserRuntimePath path;
  isConcreteChildPath =
    parent: child: child == null || parent == null || lib.hasPrefix "${parent}/" child;

  intentPathExpression =
    if cfg.intentPath != null then
      shellPathExpression cfg.intentPath
    else
      ''"$runtime_dir/next-launch.json"'';

  statusPathExpression =
    if cfg.statusPath != null then
      shellPathExpression cfg.statusPath
    else
      ''"''${KORRI_GAME_STREAM_STATUS_PATH:-$runtime_dir/status.json}"'';

  displayCompatEnv = cfg.displayCompat.defaults // cfg.displayCompat.extraEnv;
  displayCompatExports = lib.concatMapStringsSep "\n" (
    name:
    let
      value = displayCompatEnv.${name};
    in
    ''
      : "''${${name}:=${lib.escapeShellArg value}}"
      export ${name}''
  ) (lib.attrNames displayCompatEnv);

  runnerCommand = pkgs.writeShellScript "korri-game-stream-sunshine-app" ''
    set -eu

    export PATH=${lib.escapeShellArg (lib.makeBinPath cfg.path)}:$PATH

    if [ "$(id -u)" = "0" ]; then
      echo "korri-game-stream: refusing to run as root" >&2
      exit 126
    fi

    ${optionalString (cfg.sessionEnvFile != null) ''
      env_file=${lib.escapeShellArg cfg.sessionEnvFile}
      if [ -e "$env_file" ]; then
        if [ -L "$env_file" ] || [ ! -f "$env_file" ]; then
          echo "korri-game-stream: session env file must be a regular non-symlink file" >&2
          exit 126
        fi

        env_file_uid="$(stat -c '%u' "$env_file")"
        current_uid="$(id -u)"
        if [ "$env_file_uid" != "$current_uid" ] && [ "$env_file_uid" != "0" ]; then
          echo "korri-game-stream: session env file must be owned by root or the runner user" >&2
          exit 126
        fi

        env_file_mode="$(stat -c '%a' "$env_file")"
        if (( (8#$env_file_mode & 0022) != 0 )); then
          echo "korri-game-stream: session env file must not be group/world writable" >&2
          exit 126
        fi

        set -a
        . "$env_file"
        set +a
        export PATH=${lib.escapeShellArg (lib.makeBinPath cfg.path)}:$PATH
      fi
    ''}

    export KORRI_GAME_STREAM_SWAYMSG_COMMAND=${lib.escapeShellArg "${cfg.sway.package}/bin/swaymsg"}

    # Discover Sway's IPC socket so the runner's Sway-repair preflight can
    # talk to the host compositor. Sway writes the socket as
    # `$XDG_RUNTIME_DIR/sway-ipc.$UID.$PID.sock` and exports SWAYSOCK to
    # children it `exec`s itself. Peer services that did NOT come through
    # sway's exec chain (e.g. the korri-sunshine system unit on a headless
    # streaming host) inherit XDG_RUNTIME_DIR but never see SWAYSOCK. Auto-
    # discover it here so a single sway session is visible to the runner
    # without baking the volatile PID-suffixed socket path into the NixOS
    # configuration. Trusted session env files (sessionEnvFile) and the
    # caller environment continue to win when SWAYSOCK is already set.
    if [ -z "''${SWAYSOCK:-}" ] && [ -n "''${XDG_RUNTIME_DIR:-}" ]; then
      sway_socket_candidate="$(ls -t "$XDG_RUNTIME_DIR"/sway-ipc.*.sock 2>/dev/null | head -1 || true)"
      if [ -n "$sway_socket_candidate" ] && [ -S "$sway_socket_candidate" ]; then
        export SWAYSOCK="$sway_socket_candidate"
      fi
    fi

    ${optionalString (cfg.displayCompat.enable && displayCompatEnv != { }) ''
            # Display/input compatibility defaults for graphical games launched via
            # Sunshine. Each variable is only set if not already present, so trusted
            # session env files (services.korri.gameStream.sessionEnvFile) and the
            # caller environment continue to win.
      ${displayCompatExports}
    ''}

    ${optionalString (runtimeDirExpression != null) ''
      : "''${KORRI_GAME_STREAM_RUNTIME_DIR:=${runtimeDirExpression}}"
      export KORRI_GAME_STREAM_RUNTIME_DIR
    ''}

    if [ -n "''${KORRI_GAME_STREAM_RUNTIME_DIR:-}" ]; then
      runtime_dir="$KORRI_GAME_STREAM_RUNTIME_DIR"
    else
      if [ -z "''${XDG_RUNTIME_DIR:-}" ]; then
        echo "korri-game-stream: XDG_RUNTIME_DIR is required unless KORRI_GAME_STREAM_RUNTIME_DIR is set" >&2
        exit 126
      fi
      runtime_dir="$XDG_RUNTIME_DIR/korri-game-stream"
    fi
    if [ ! -d "$runtime_dir" ]; then
      mkdir -p -m 700 "$runtime_dir"
    fi
    chmod 700 "$runtime_dir"

    export KORRI_GAME_STREAM_INTENT_PATH=${intentPathExpression}
    export KORRI_GAME_STREAM_LOCK_PATH="''${KORRI_GAME_STREAM_LOCK_PATH:-$runtime_dir/run.lock}"
    export KORRI_GAME_STREAM_STATUS_PATH=${statusPathExpression}

    ${optionalString (
      cfg.sessiond.socketPath != null
    ) "export KORRI_SESSIOND_SOCKET=${lib.escapeShellArg cfg.sessiond.socketPath}"}

    exec ${cfg.package}/bin/korri-game-stream-runner
  '';
in
{
  options.services.korri.gameStream = {
    enable = lib.mkEnableOption "Korri headless game stream runner";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-game-stream";
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
      example = "/home/korri/.config/korri/game-stream.env";
      description = ''
        Optional trusted runtime environment file sourced before launching the
        runner as the non-root Sunshine/session user. This must be an absolute
        path because the wrapper runs as a Sunshine application, not as a
        systemd unit that expands %h/%t specifiers. The wrapper rejects
        symlinks, non-regular files, files not owned by root or the runner user,
        and files writable by group/other before sourcing. Use this to provide
        fresh Sway/Wayland session values such as WAYLAND_DISPLAY,
        XDG_RUNTIME_DIR, and SWAYSOCK without baking volatile socket paths into
        the NixOS configuration.
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

    runtimeDir = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/korri-game-stream";
      description = ''
        Private runtime directory the Sunshine app wrapper exports as
        KORRI_GAME_STREAM_RUNTIME_DIR. The runner derives the trusted intent,
        status, and lock paths from this directory unless intentPath/statusPath
        are overridden. When null, the wrapper falls back to
        $XDG_RUNTIME_DIR/korri-game-stream.
      '';
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
        KORRI_GAME_STREAM_INTENT_PATH to the same path when needed. Launch intent
        commands must be absolute executable paths; PATH is for wrapper tooling,
        not game command resolution.
      '';
    };

    statusPath = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/user/1000/korri-game-stream/status.json";
      description = "Runner status path written by the generic Sunshine app and read by the Korri daemon.";
    };

    displayCompat = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = ''
          Export sensible Wayland/X11/SDL/Qt/GTK/Java environment defaults to
          launched games before exec'ing the runner. Hosts running Korri inside
          a Wayland compositor (sway, wlroots-based) almost always want this on;
          set to false only if you provide every value via
          services.korri.gameStream.sessionEnvFile or expect games to manage
          their own backend selection.

          Each variable is set via `''${VAR:=value}` so anything already exported
          by the inherited environment or by sessionEnvFile wins. Per-game
          overrides in the launcher-profile `env` block also continue to win
          because they are applied by the runner after this wrapper.
        '';
      };

      defaults = mkOption {
        type = types.attrsOf types.str;
        default = {
          SDL_VIDEODRIVER = "wayland,x11";
          QT_QPA_PLATFORM = "wayland;xcb";
          GDK_BACKEND = "wayland,x11";
          CLUTTER_BACKEND = "wayland";
          WINIT_UNIX_BACKEND = "wayland";
          XDG_SESSION_TYPE = "wayland";
          _JAVA_AWT_WM_NONREPARENTING = "1";
          DISPLAY = ":0";
        };
        defaultText = lib.literalExpression ''
          {
            SDL_VIDEODRIVER = "wayland,x11";
            QT_QPA_PLATFORM = "wayland;xcb";
            GDK_BACKEND = "wayland,x11";
            CLUTTER_BACKEND = "wayland";
            WINIT_UNIX_BACKEND = "wayland";
            XDG_SESSION_TYPE = "wayland";
            _JAVA_AWT_WM_NONREPARENTING = "1";
            DISPLAY = ":0";
          }
        '';
        description = ''
          Curated default environment exported into every game launched through
          the Korri Sunshine wrapper:

          - `SDL_VIDEODRIVER=wayland,x11`: SDL2 games try Wayland first, fall
            back to Xwayland.
          - `QT_QPA_PLATFORM=wayland;xcb`: Qt apps try the Wayland platform
            plugin first, fall back to xcb.
          - `GDK_BACKEND=wayland,x11`: GTK apps prefer Wayland.
          - `CLUTTER_BACKEND=wayland`: Clutter-based apps use Wayland.
          - `WINIT_UNIX_BACKEND=wayland`: Rust/winit apps target Wayland.
          - `XDG_SESSION_TYPE=wayland`: Session-type hint for libraries that
            sniff it.
          - `_JAVA_AWT_WM_NONREPARENTING=1`: Java AWT compatibility hint for
            tiling/Wayland compositors.
          - `DISPLAY=:0`: Xwayland fallback target so Sway lazy-starts
            Xwayland on first X11 connect.

          Replace this attrset wholesale to customize. Use
          `services.korri.gameStream.displayCompat.extraEnv` to add or override
          individual entries without restating the curated set.
        '';
      };

      extraEnv = mkOption {
        type = types.attrsOf types.str;
        default = { };
        example = lib.literalExpression ''
          {
            MESA_GL_VERSION_OVERRIDE = "4.5";
            __GL_THREADED_OPTIMIZATIONS = "1";
          }
        '';
        description = ''
          Additional environment variables merged on top of
          `services.korri.gameStream.displayCompat.defaults`. Use this for host-
          specific tuning (GPU hints, locale, audio, etc.) without restating
          the curated defaults.
        '';
      };
    };

    uinput = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = ''
          Legacy uinput kernel module + udev rule loader. As of the
          korri-input module introduction, `services.korri.input.provider`
          (name = "inputplumber") is the canonical owner of /dev/uinput for
          Sunshine streaming sessions, and `services.korri.daemon.streaming`
          asserts that the provider is enabled. This option remains so a
          caller can explicitly load uinput without going through the
          provider; it defaults to `false` because enabling the provider is
          the supported path.
        '';
      };
    };

    sway = {
      package = mkOption {
        type = types.package;
        default = pkgs.sway;
        defaultText = lib.literalExpression "pkgs.sway";
        description = "Sway package that provides swaymsg.";
      };
    };

    sessiond = {
      socketPath = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "%t/korri/sessiond.sock";
        description = ''
          Optional sessiond Unix socket exported to the runner as
          `KORRI_SESSIOND_SOCKET`. When set, the runner routes lifecycle
          intents through same-user sessiond IPC.
        '';
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
          endpoint. Restrict Sunshine exposure to Sunshine-paired clients on
          trusted networks or VPN; public/untrusted Sunshine exposure is not
          supported for arbitrary launch intents. Disable this when the host wants
          to wire Sunshine applications itself.
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
    assertions = [
      {
        assertion = cfg.appName != "";
        message = "services.korri.gameStream.appName must not be empty.";
      }
      {
        assertion = isSupportedPath cfg.runtimeDir;
        message = ''
          services.korri.gameStream.runtimeDir must be an absolute path or %t path
          when set (got "${toString cfg.runtimeDir}").
        '';
      }
      {
        assertion = isSupportedPath cfg.intentPath;
        message = ''
          services.korri.gameStream.intentPath must be an absolute path or %t path
          when set (got "${toString cfg.intentPath}").
        '';
      }
      {
        assertion = isSupportedPath cfg.statusPath;
        message = ''
          services.korri.gameStream.statusPath must be an absolute path or %t path
          when set (got "${toString cfg.statusPath}").
        '';
      }
      {
        assertion = cfg.sessionEnvFile == null || isAbsolutePath cfg.sessionEnvFile;
        message = ''
          services.korri.gameStream.sessionEnvFile must be an absolute path when set
          (got "${toString cfg.sessionEnvFile}").
        '';
      }
      {
        assertion = isConcreteChildPath cfg.runtimeDir cfg.intentPath;
        message = ''
          services.korri.gameStream.intentPath must live under runtimeDir when both are set
          (runtimeDir="${toString cfg.runtimeDir}", intentPath="${toString cfg.intentPath}").
        '';
      }
      {
        assertion = isConcreteChildPath cfg.runtimeDir cfg.statusPath;
        message = ''
          services.korri.gameStream.statusPath must live under runtimeDir when both are set
          (runtimeDir="${toString cfg.runtimeDir}", statusPath="${toString cfg.statusPath}").
        '';
      }
    ];

    environment.systemPackages = [
      cfg.package
      cfg.sway.package
    ]
    ++ cfg.path;

    boot.kernelModules = mkIf cfg.uinput.enable [ "uinput" ];

    services.udev.extraRules = mkIf cfg.uinput.enable ''
      # Uinput for Sunshine virtual mouse/keyboard/touch input.
      KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
      KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess"
    '';

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
