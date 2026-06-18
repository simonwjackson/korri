{
  lib,
  pkgs,
  ...
}:

# Source-machine image: a host that runs Korri daemon + Sunshine + a Sway
# compositor with no Korri GUI client. Sessiond owns the foreground
# session lifecycle and routes Sunshine-fired managed launches through
# its source-machine role (idle-blank restore, no Electrobun).
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

  # Compositor up, kiosk client off. Sway alive serves as the idle target
  # the sessiond source-machine role asserts (idle-blank restore).
  services.korri.compositor = {
    enable = true;
    kiosk.enable = false;
    user = lib.mkDefault "korri";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri";
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
    path = [ pkgs.sway ];
    port = sessiondPort;
    socketPath = sessiondSocketPath;
    runtimeDir = sessiondRuntimeDir;
    sunshineRuntimeStatusPath = gameStreamStatusPath;
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
}
