{
  config,
  lib,
  pkgs,
  ...
}:

# Source-machine image: a host that runs Korri daemon + Sunshine + a Sway
# compositor with no Korri GUI client. Sessiond owns the foreground
# session lifecycle and routes Sunshine-fired managed launches through
# its source-machine role (idle-blank restore, no kiosk renderer).
#
# Composition is purely capability-driven \u2014 there is no
# services.korri.role enum; the image just enables the boolean toggles
# that together describe a source-machine host. The boundary refactor
# (docs/plans/2026-05-25-001-refactor-korri-nixos-module-boundary-plan.md)
# explicitly rejected a role aggregate option.
#
# Plan: docs/plans/2026-05-27-002-feat-foreground-session-source-machine-phase4c-plan.md (U7)

let
  sessiondSocketPath = "%t/korri/sessiond.sock";
  sessiondRuntimeDir = "%t/korri";
  sessiondPort = 3003;
  gameStreamRuntimeDir = "%t/korri-game-stream";
  gameStreamStatusPath = "${gameStreamRuntimeDir}/status.json";
  runtime = config.services.korri.runtime;
  compositorCfg = config.services.korri.compositor;
in
{
  # The headless base wires the server bits (users, federation defaults).
  imports = [ ./headless.nix ];

  services.seatd.enable = lib.mkDefault true;
  services.dbus.enable = lib.mkDefault true;
  hardware.graphics = {
    enable = lib.mkDefault true;
    enable32Bit = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 (lib.mkDefault true);
  };

  # x86 source machines own the standard PipeWire audio stack by default so
  # launched games discover /run/user/<uid>/pulse/native and pipewire-0 at
  # their canonical paths without host-level hand wiring. mkDefault lets a host
  # override the topology; the x86 guard keeps ROCKNIX/portable adapters on
  # their substrate-owned audio graphs.
  services.pulseaudio.enable = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 (lib.mkDefault false);
  services.pipewire = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 {
    enable = lib.mkDefault true;
    alsa.enable = lib.mkDefault true;
    alsa.support32Bit = lib.mkDefault true;
    pulse.enable = lib.mkDefault true;
    jack.enable = lib.mkDefault true;
    # wireplumber.enable is intentionally left to its nixpkgs default
    # (services.pipewire.enable) so a host opt-out of PipeWire also drops
    # WirePlumber instead of stranding its user unit.
  };
  security.rtkit.enable = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 (lib.mkDefault true);

  # Compositor up, kiosk client off. Sway alive serves as the idle target
  # the sessiond source-machine role asserts (idle-blank restore).
  services.korri.compositor = {
    enable = true;
    kiosk.enable = false;
    # Source-machine runs the canonical logind user runtime as
    # XDG_RUNTIME_DIR ("%t" -> /run/user/<uid>) so launched games, Sunshine,
    # and sessiond children discover D-Bus, PipeWire, and PulseAudio-compatible
    # sockets at their standard paths. Korri-owned IPC/state stays under
    # explicit subdirectories (%t/korri, %t/korri-game-stream); only the
    # compositor-standard Wayland socket and stable Sway IPC symlink live
    # directly under the runtime root, matching normal Wayland convention.
    runtimeDir = lib.mkDefault "%t";
    # Share the normal user session bus (%t/bus) instead of an isolated
    # dbus-run-session. Sessiond-launched games and Sunshine are sibling-unit
    # peers, not Sway children; dbus-run-session would hand them a private bus
    # and hide portal/session services they expect to reach.
    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=%t/bus";
    };
    user = lib.mkDefault runtime.user;
    group = lib.mkDefault runtime.group;
    createUser = lib.mkDefault false;
    home = lib.mkDefault runtime.home;
    wants = lib.mkDefault [ "seatd.service" ];
    after = lib.mkDefault [ "seatd.service" ];
    path = with pkgs; [
      bashInteractive
      coreutils
      dbus
      procps
      sway
      xwayland
    ];
    environment = {
      XDG_CURRENT_DESKTOP = "sway";
      SDL_VIDEODRIVER = "wayland";
    };
    sway.extraConfig = ''
      # Source-machine: keep Sway alive so sessiond's source-machine role
      # has something to restore to. Hide the cursor between launches.
      xwayland enable
      seat * hide_cursor 1500
    '';
  };

  # Streaming on; the federation v1 baseline is already provided by the
  # headless base. Streaming hosts also need the input provider (Xbox 360
  # over /dev/uinput via InputPlumber) so Sunshine can synthesize streamed
  # controllers.
  services.korri.daemon.streaming.enable = lib.mkDefault true;
  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
  };

  # Sessiond owns the foreground session lifecycle. Role is inferred
  # from compositor.kiosk.enable = false above, so this resolves to
  # "source-machine" without needing the deploy-role aggregate.
  services.korri.sessiond = {
    enable = true;
    path = [
      pkgs.bashInteractive
      compositorCfg.sway.package
    ];
    port = sessiondPort;
    socketPath = sessiondSocketPath;
    runtimeDir = sessiondRuntimeDir;
    sunshineRuntimeStatusPath = gameStreamStatusPath;
    extraEnvironment = {
      HOME = compositorCfg.home;
      XDG_RUNTIME_DIR = compositorCfg.runtimeDir;
      XDG_STATE_HOME = compositorCfg.stateHome;
      XDG_DATA_HOME = compositorCfg.dataHome;
      XDG_CONFIG_HOME = compositorCfg.configHome;
      WAYLAND_DISPLAY = "wayland-1";
      SWAYSOCK = "${compositorCfg.runtimeDir}/sway-ipc.sock";
      XDG_SESSION_TYPE = "wayland";
      XDG_CURRENT_DESKTOP = "sway";
      DISPLAY = ":0";
      SDL_VIDEODRIVER = "wayland,x11";
      GDK_BACKEND = "wayland,x11";
      QT_QPA_PLATFORM = "wayland;xcb";
    }
    // lib.optionalAttrs
      (compositorCfg.sessionBus.mode == "existing" && compositorCfg.sessionBus.address != null)
      {
        # Sessiond-spawned foreground apps are sibling-unit children, not Sway
        # descendants, so hand them the same session bus address the compositor
        # uses (mirrors the kiosk renderer env in images/kiosk.nix).
        DBUS_SESSION_BUS_ADDRESS = compositorCfg.sessionBus.address;
      };
  };

  # Game-stream runner routes lifecycle:"foreground" intents through
  # sessiond. The Sunshine wrapper exports KORRI_SESSIOND_SOCKET so the
  # runner's createSessionLauncherFromEnv builds an active sessiondLauncher.
  services.korri.gameStream = {
    enable = lib.mkDefault true;
    runtimeDir = gameStreamRuntimeDir;
    statusPath = gameStreamStatusPath;
    sessiond.socketPath = sessiondSocketPath;
  };

  # Without this, korrid's Launcher falls through to the in-process
  # shell launcher instead of delegating to the foreground lifecycle service.
  services.korri.daemon.sessiond.socketPath = sessiondSocketPath;

  assertions = [
    {
      assertion = config.services.korri.sessiond.enable;
      message = "Korri source-machine composition requires services.korri.sessiond.enable = true.";
    }
    {
      assertion = compositorCfg.runtimeDir == "%t";
      message = ''
        Korri source-machine composition sets XDG_RUNTIME_DIR from
        services.korri.compositor.runtimeDir. A private subdirectory such as
        "%t/korri-compositor" hides PipeWire, PulseAudio-compatible, and D-Bus
        sockets from launched games and Sunshine. Keep runtimeDir = "%t";
        override with lib.mkForce only alongside an explicit audio/session
        bridge plan.
      '';
    }
    {
      assertion =
        compositorCfg.sessionBus.mode == "existing"
        && compositorCfg.sessionBus.address == "unix:path=%t/bus";
      message = ''
        Korri source-machine composition shares the normal user session bus so
        sessiond-launched foreground apps and Sunshine reach the same D-Bus the
        compositor uses. Keep services.korri.compositor.sessionBus.mode =
        "existing" with address "unix:path=%t/bus"; a "private"
        dbus-run-session bus would hide portal/session services from launched
        apps. Override only alongside an explicit bus bridge plan.
      '';
    }
    {
      assertion =
        config.services.korri.sessiond.socketPath == sessiondSocketPath
        && config.services.korri.daemon.sessiond.socketPath == sessiondSocketPath
        && config.services.korri.gameStream.sessiond.socketPath == sessiondSocketPath;
      message = ''
        Korri source-machine composition requires sessiond, daemon, and gameStream
        to share ${sessiondSocketPath}; partial socket overrides would make korrid
        or Sunshine fall back away from sessiond-owned foreground lifecycle.
      '';
    }
  ];
}
