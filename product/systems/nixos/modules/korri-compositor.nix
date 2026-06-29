{ korri }:

{
  config,
  options,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.compositor;
  inputCfg = config.services.korri.input;
  packagesForSystem = korri.packages.${pkgs.stdenv.hostPlatform.system} or { };
  # `rocknix.sm8550.moonlight.package` is declared by
  # `nix-on-rocks-guest.nixosModules.sm8550`. Hosts that import korri
  # without that substrate (e.g. the x86 desktop / x86 kiosk configs, the
  # live USB image, aka on mountainous) do not see the option, so we gate
  # the default on its presence to avoid the module system's
  # "option not declared" error. When it IS present (sobo via mountainous
  # plus nix-on-rocks-guest, or korri's own rocknix-sm8550 platform module),
  # korri defaults the package to the Korri downstream
  # moonlight-embedded-korri build (which carries the absolute-touch and
  # Sunshine runtime-settings MVP patches).
  hasRocknixSm8550MoonlightOption =
    options ? rocknix
    && options.rocknix ? sm8550
    && options.rocknix.sm8550 ? moonlight
    && options.rocknix.sm8550.moonlight ? package;
  groupName =
    if cfg.group != null then
      cfg.group
    else if cfg.createUser then
      cfg.user
    else
      null;
  runtimeDirIsSystemdSpecifier = cfg.runtimeDir == "%t" || lib.hasPrefix "%t/" cfg.runtimeDir;
  runtimeDirIsSystemdRuntimeDirectory = lib.hasPrefix "%t/" cfg.runtimeDir;
  runtimeDirectoryName =
    if runtimeDirIsSystemdRuntimeDirectory then
      lib.removePrefix "%t/" cfg.runtimeDir
    else
      lib.removePrefix "/run/" cfg.runtimeDir;
  sessionBusServices = lib.optionals (cfg.sessionBus.mode == "existing") cfg.sessionBus.services;
  ownsRuntimeDir = cfg.sessionBus.mode == "private" && runtimeDirIsSystemdRuntimeDirectory;

  # The kiosk surface depends on the inputd WebSocket bridge for local
  # client input. The input module owns the inputd unit + port; the
  # compositor module wires the systemd ordering and the env vars the
  # client reads. Additionally, when the kiosk surface is on, platform-
  # supplied provider services (e.g. seatd, inputplumber, or an external
  # normalized-input service) are also ordered before the compositor so
  # the session always boots into a complete input stack.
  inputdServices = lib.optional cfg.kiosk.enable "korri-inputd.service";
  providerOrderingServices = lib.optionals cfg.kiosk.enable inputCfg.provider.services;
  inputdBridgeUrl = "ws://127.0.0.1:${toString inputCfg.inputd.port}";

  inherit (lib)
    mkDefault
    mkEnableOption
    mkIf
    mkMerge
    mkOption
    types
    ;

  compositorExec = pkgs.writeShellApplication {
    name = "korri-compositor-exec";
    runtimeInputs = [
      pkgs.coreutils
      cfg.sway.package
    ];
    text = ''
      set -euo pipefail

      configured_runtime_dir=${lib.escapeShellArg cfg.runtimeDir}
      case "$configured_runtime_dir" in
        %t)
          : "''${XDG_RUNTIME_DIR:?korri-compositor-exec: XDG_RUNTIME_DIR is required to expand %t}"
          runtime_dir="$XDG_RUNTIME_DIR"
          ;;
        %t/*)
          : "''${XDG_RUNTIME_DIR:?korri-compositor-exec: XDG_RUNTIME_DIR is required to expand %t}"
          runtime_dir="$XDG_RUNTIME_DIR/''${configured_runtime_dir#%t/}"
          ;;
        *)
          runtime_dir="$configured_runtime_dir"
          ;;
      esac

      if [ $# -eq 0 ]; then
        echo "usage: korri-compositor-exec <command> [args...]" >&2
        exit 64
      fi

      if [ -n "''${SWAYSOCK:-}" ] && [ -S "$SWAYSOCK" ]; then
        sway_socket="$SWAYSOCK"
      else
        sway_socket=""
        for candidate in "$runtime_dir"/sway-ipc.*.sock; do
          if [ -S "$candidate" ]; then
            sway_socket="$candidate"
            break
          fi
        done
      fi

      if [ -z "$sway_socket" ] || [ ! -S "$sway_socket" ]; then
        echo "korri-compositor-exec: no Sway IPC socket found under $runtime_dir" >&2
        echo "korri-compositor-exec: is korri-compositor.service running?" >&2
        exit 69
      fi

      command_name="$1"
      if [ "''${command_name#/}" = "$command_name" ] && [ "''${command_name#./}" = "$command_name" ] && [ "''${command_name#../}" = "$command_name" ]; then
        resolved_command="$(command -v -- "$command_name" || true)"
        if [ -z "$resolved_command" ]; then
          echo "korri-compositor-exec: command not found: $command_name" >&2
          exit 127
        fi
        shift
        set -- "$resolved_command" "$@"
      fi

      command_string="$(printf '%q ' "$@")"
      exec swaymsg -s "$sway_socket" -- exec "$command_string"
    '';
  };

  swayCommand = "${cfg.sway.package}/bin/sway --config ${swayConfig}";
  sessionCommand =
    if cfg.sessionBus.mode == "private" then
      "${pkgs.dbus}/bin/dbus-run-session -- ${swayCommand}"
    else
      swayCommand;

  # NOTE: korri-compositor no longer launches the kiosk renderer.
  # Electrobun lifecycle ownership moved to korri-sessiond in the
  # renderer-ownership cut (Phase 4 kiosk slice). The compositor owns
  # Sway only; sessiond's enterIdle spawns the renderer. The previous
  # `kioskClientLauncher` shell wrapper and the Sway `exec --no-startup-id`
  # line that drove it are intentionally absent.

  swayConfigPrelude = ''
    # Generated by services.korri.compositor. Platform modules may append
    # display/input fragments through services.korri.compositor.sway.extraConfig.
    default_border none
    default_floating_border none
    hide_edge_borders both

    # Start Xwayland eagerly. `xwayland enable` (sway's default) is lazy:
    # sway itself holds the X11 listen socket and only forks Xwayland on the
    # first client connect. Some X11 clients issue libX11 calls during init and
    # have been observed to segfault when Xwayland isn't yet accepting
    # connections. `xwayland force` starts the Xwayland process at sway startup
    # so no client ever pays the cold-start cost.
    xwayland force
  '';

  swayConfig = pkgs.writeText "korri-compositor-sway.conf" (
    swayConfigPrelude + "\n" + cfg.sway.extraConfig
  );

  seatBackendEnvironment =
    if cfg.seatBackend == "direct" then {
      # Legacy ROCKNIX-guest path: wlroots' builtin libseat opens the VT, DRM,
      # and input nodes directly via the runtime user's ACLs, bypassing
      # systemd-logind seat management.
      WLR_SESSION = "direct";
      LIBSEAT_BACKEND = "builtin";
      WLR_LIBINPUT_NO_DEVICES = "1";
    } else {
      # "logind": let wlroots/libseat autodetect the guest's systemd-logind
      # seat0. No session/backend override is emitted.
    };

  sessionEnvironment =
    cfg.environment
    // seatBackendEnvironment
    // {
      HOME = cfg.home;
      XDG_RUNTIME_DIR = cfg.runtimeDir;
      XDG_STATE_HOME = cfg.stateHome;
      XDG_DATA_HOME = cfg.dataHome;
      XDG_CONFIG_HOME = cfg.configHome;
      # Do NOT set WAYLAND_DISPLAY here. wlroots' backend autodetection
      # treats a pre-set WAYLAND_DISPLAY as "I am a nested wayland
      # client" and tries to connect to a parent compositor, which fails
      # for a session compositor like Sway. Sway itself picks the socket
      # name (default `wayland-1`) when it starts. Peer system services
      # that need to attach to sway's socket should set WAYLAND_DISPLAY
      # on their own unit (see services.korri.daemon's korri-sunshine.
      # service for an example).
    }
    // lib.optionalAttrs (cfg.sessionBus.mode == "existing" && cfg.sessionBus.address != null) {
      DBUS_SESSION_BUS_ADDRESS = cfg.sessionBus.address;
    };
in
{
  # Stable module key so multiple imports (e.g. via nixosModules.korri-daemon
  # composite + aggregate korri) deduplicate to a single declaration.
  _file = ./korri-compositor.nix;
  key = ./korri-compositor.nix;

  imports = [
    korri.nixosModules.korri-cli
  ];

  options.services.korri.compositor = {
    enable = mkEnableOption "Korri compositor session (Sway/Wayland substrate)";

    user = mkOption {
      type = types.str;
      default = "korri-compositor";
      description = ''
        Unix user that owns the Korri compositor session. Platform adapters
        for constrained guests may set this to `root` only when they also
        set `createUser = false`.
      '';
    };

    group = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Unix group for the Korri compositor session. Defaults to `services.korri.compositor.user`.";
    };

    createUser = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Create the configured compositor user and group. Disable when a
        platform adapter supplies the user itself, including constrained
        guests that run the session as root.
      '';
    };

    home = mkOption {
      type = types.str;
      default = if cfg.user == "root" then "/root" else "/var/lib/korri-compositor";
      description = "Home directory used by the compositor session and any product client launched from it.";
    };

    runtimeDir = mkOption {
      type = types.str;
      default = "%t/korri-compositor";
      description = "Runtime directory exposed to the compositor as XDG_RUNTIME_DIR. The default is a user-manager %t path so RuntimeDirectory creates the same directory that Sway uses for Wayland sockets.";
    };

    stateHome = mkOption {
      type = types.str;
      default = "${cfg.home}/.local/state";
      description = "XDG state root for the compositor session.";
    };

    dataHome = mkOption {
      type = types.str;
      default = "${cfg.home}/.local/share";
      description = "XDG data root for the compositor session.";
    };

    configHome = mkOption {
      type = types.str;
      default = "${cfg.home}/.config";
      description = "XDG config root for the compositor session.";
    };

    environment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables for the Korri compositor session.";
    };

    seatBackend = mkOption {
      type = types.enum [
        "direct"
        "logind"
      ];
      default = "logind";
      description = ''
        Seat/session backend for the wlroots compositor. "direct" uses
        wlroots' builtin libseat backend, which opens the VT, DRM, and input
        devices directly via the runtime user's ACLs -- the legacy
        ROCKNIX-guest workaround for environments where systemd-logind could
        not own seat0. "logind" emits no session override and lets
        wlroots/libseat acquire the guest's systemd-logind seat0 directly.
      '';
    };

    path = mkOption {
      type = types.listOf types.package;
      default = with pkgs; [
        coreutils
        dbus
      ];
      description = "Packages added to PATH for the compositor session service.";
    };

    sessionBus = {
      mode = mkOption {
        type = types.enum [
          "private"
          "existing"
        ];
        default = "private";
        description = ''
          D-Bus session bus strategy for the compositor.

          `private` starts Sway with dbus-run-session and lets Korri own the
          runtime directory. `existing` starts Sway directly with a
          platform-owned DBUS_SESSION_BUS_ADDRESS; platform modules use this
          when a constrained guest or device substrate must own the bus.
        '';
      };

      address = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "unix:path=%t/bus";
        description = "Existing session bus address used when sessionBus.mode = \"existing\".";
      };

      services = mkOption {
        type = types.listOf types.str;
        default = [ ];
        example = [ "platform-session-dbus.service" ];
        description = ''
          Platform-owned service units that provide the existing session bus.
          These units are wanted, required, and ordered before korri-compositor
          when sessionBus.mode = "existing".
        '';
      };
    };

    wants = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "Additional systemd units wanted by korri-compositor.service.";
    };

    after = mkOption {
      type = types.listOf types.str;
      default = [ "network.target" ];
      description = "Systemd units that korri-compositor.service starts after.";
    };

    exec = {
      package = mkOption {
        type = types.package;
        readOnly = true;
        default = compositorExec;
        description = ''
          Helper package that provides `korri-compositor-exec`, a CLI for
          launching arbitrary commands into the managed Sway compositor session.
        '';
      };
    };

    sway = {
      package = mkOption {
        type = types.package;
        default = pkgs.sway;
        description = "Sway package used for the Korri compositor backend.";
      };

      extraPackages = mkOption {
        type = types.listOf types.package;
        default = [ ];
        description = "Additional packages available to Sway config fragments.";
      };

      extraConfig = mkOption {
        type = types.lines;
        default = "";
        description = ''
          Platform-provided Sway configuration fragments. Hardware facts such as
          display transforms, touchscreen calibration, and device-specific input
          maps belong here or in platform modules, not in Korri defaults.
        '';
      };

      configFile = mkOption {
        type = types.path;
        readOnly = true;
        default = swayConfig;
        description = "Generated Sway config consumed by korri-compositor.service.";
      };
    };

    kiosk = {
      enable = mkEnableOption ''
        the local Korri kiosk surface (the product client launched from the
        compositor session). Disabled by default so that the compositor can
        host a headless streaming appliance (aka shape) without a local GUI.

        With this enabled, the compositor still owns Sway only; the kiosk
        renderer (Electrobun) is launched by `services.korri.sessiond`,
        which auto-enables on kiosk images via `product/systems/nixos/images/kiosk.nix`. The
        legacy `kiosk.command` / `kiosk.launcher` options were removed when
        renderer-ownership moved to sessiond; downstream hosts pinning them
        will hit an evaluation error.
      '';

      inputdBridgeUrl = mkOption {
        type = types.str;
        readOnly = true;
        default = inputdBridgeUrl;
        description = ''
          Read-only WebSocket URL for the local inputd bridge. Derived from
          `services.korri.input.inputd.port`. Exposed so peer units (notably
          `services.korri.sessiond` on kiosk images) can read the same URL
          the compositor publishes to the renderer without duplicating the
          host/port math. Setting this option directly has no effect.
        '';
      };
    };
  };

  config = mkMerge [
    # When `nix-on-rocks-guest.nixosModules.sm8550` is also in the eval
    # (sobo on mountainous, Korri SM8550 kiosk products internally), default the
    # rocknix Moonlight package to the Korri downstream build. Priority 900
    # wins against the substrate's `mkDefault` (1000) but still loses to any
    # explicit host override, so a host that wants stock
    # `moonlight-embedded` only needs a plain assignment to put it back.
    #
    # `lib.optionalAttrs` (not `lib.mkIf`) is required here: `mkIf` still
    # surfaces the attribute path for module-system validation even when its
    # condition is false, which would raise `option 'rocknix' does not
    # exist` on hosts that did not import the rocknix substrate. Returning
    # `{}` removes the attribute path entirely.
    (lib.optionalAttrs hasRocknixSm8550MoonlightOption {
      rocknix.sm8550.moonlight.package = lib.mkOverride 900 packagesForSystem.moonlight-embedded-korri;
    })
    {
      # Cross-tree assertion lives outside the `mkIf cfg.enable` gate so it
      # fires when a host sets `compositor.kiosk.enable = true` without
      # `compositor.enable = true`. Without this gate, the dormant kiosk
      # sub-tree would silently produce no systemd unit; this assertion
      # makes the contradiction loud.
      assertions = lib.optionals cfg.kiosk.enable [
        {
          assertion = cfg.enable;
          message = ''
            services.korri.compositor.kiosk.enable = true requires
            services.korri.compositor.enable = true. The kiosk surface is a
            sub-tree of the compositor substrate and cannot run without it.
          '';
        }
      ];
    }
    (mkIf cfg.enable {
      assertions = [
        {
          assertion = cfg.user != "";
          message = "services.korri.compositor.user must not be empty.";
        }
        {
          assertion = lib.hasPrefix "/" cfg.runtimeDir || runtimeDirIsSystemdSpecifier;
          message = ''
            services.korri.compositor.runtimeDir must be an absolute path or %t path (got
            "${cfg.runtimeDir}").
          '';
        }
        {
          assertion = lib.hasPrefix "/run/" cfg.runtimeDir || runtimeDirIsSystemdSpecifier;
          message = ''
            services.korri.compositor.runtimeDir must live under /run or %t so the
            session owns the runtime directory (got "${cfg.runtimeDir}").
          '';
        }
        {
          assertion = lib.hasPrefix "/" cfg.home;
          message = ''
            services.korri.compositor.home must be an absolute path (got "${cfg.home}").
          '';
        }
        {
          assertion = lib.hasPrefix "/" cfg.configHome;
          message = ''
            services.korri.compositor.configHome must be an absolute path (got "${cfg.configHome}").
          '';
        }
        {
          assertion = lib.hasPrefix "/" cfg.dataHome;
          message = ''
            services.korri.compositor.dataHome must be an absolute path (got "${cfg.dataHome}").
          '';
        }
        {
          assertion = lib.hasPrefix "/" cfg.stateHome;
          message = ''
            services.korri.compositor.stateHome must be an absolute path (got "${cfg.stateHome}").
          '';
        }
        {
          assertion = !(cfg.createUser && cfg.user == "root");
          message = ''
            services.korri.compositor.createUser cannot manage the root user. Set
            createUser = false when a constrained platform adapter intentionally
            runs the compositor as root.
          '';
        }
        {
          assertion =
            cfg.sessionBus.mode != "existing"
            || (cfg.sessionBus.address != null && cfg.sessionBus.address != "");
          message = ''
            services.korri.compositor.sessionBus.address must be set when
            sessionBus.mode = "existing".
          '';
        }
      ];

      users.groups = mkIf (cfg.createUser && groupName != null) {
        ${groupName} = { };
      };

      users.users = mkIf cfg.createUser {
        ${cfg.user} = {
          isSystemUser = true;
          group = groupName;
          home = cfg.home;
          createHome = true;
        };
      };

      # Auto-enable the local Korri client + CLI + inputd bridge only when
      # the kiosk surface is on. Headless compositor (aka) intentionally does
      # not install or launch the client and does not need the local input
      # bridge — streaming hosts get their input via input.provider directly.
      services.korri.client.enable = mkIf cfg.kiosk.enable (mkDefault true);
      services.korri.cli.enable = mkIf cfg.kiosk.enable (mkDefault true);
      services.korri.input.inputd = mkIf cfg.kiosk.enable {
        enable = mkDefault true;
        before = [ "korri-compositor.service" ];
      };

      environment.systemPackages = [ cfg.exec.package ];

      systemd.user.services."korri-compositor" = {
        description = "Korri appliance compositor session";
        wantedBy = [ "korri-session.target" ];
        wants = cfg.wants ++ inputdServices ++ providerOrderingServices ++ sessionBusServices;
        requires = sessionBusServices;
        after = cfg.after ++ inputdServices ++ providerOrderingServices ++ sessionBusServices;
        environment = sessionEnvironment;
        path = [
          cfg.exec.package
          pkgs.bashInteractive
        ]
        ++ cfg.path
        ++ [ cfg.sway.package ]
        ++ cfg.sway.extraPackages;
        unitConfig = {
          StartLimitBurst = 5;
          StartLimitIntervalSec = 60;
        };
        serviceConfig = {
          ExecStart = sessionCommand;
          Restart = "always";
          RestartSec = 2;
          WorkingDirectory = cfg.home;
        }
        // lib.optionalAttrs ownsRuntimeDir {
          RuntimeDirectory = runtimeDirectoryName;
          RuntimeDirectoryMode = "0700";
        };
      };
    })
  ];
}
