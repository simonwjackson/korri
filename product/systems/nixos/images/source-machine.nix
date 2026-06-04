{
  lib,
  pkgs,
  ...
}:

# Source-machine image: a host that runs Korri server + Sunshine + a Sway
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
  sessiondTokenFile = "/run/korri-sessiond/token";
  sessiondRuntimeDir = "/run/korri-sessiond";
  sessiondPort = 3003;
  gameStreamRuntimeDir = "/run/korri-game-stream";
  gameStreamStatusPath = "${gameStreamRuntimeDir}/status.json";
in
{
  # The headless base wires the server bits (users, federation defaults).
  imports = [ ./headless.nix ];

  # Shared Unix group for processes that must read the sessiond
  # capability token. Source-machine has two such consumers:
  #   - korri-server (system unit, declared in headless.nix as the
  #     korri-server user) — delegates managed launches to sessiond.
  #   - korri-source (Sunshine session user, declared below) — runs
  #     the game-stream runner that routes lifecycle:"foreground"
  #     intents through sessiond.
  # Kiosk reuses `korri-server` for the same purpose because only the
  # server user reads the token there. Source-machine has two distinct
  # consuming users, so a purpose-named group is clearer than overloading
  # either user's primary group.
  users.groups.korri-sessiond-clients = { };

  users.users.korri-server.extraGroups = [ "korri-sessiond-clients" ];

  users.groups.korri-source = { };
  users.users.korri-source = {
    isNormalUser = true;
    group = "korri-source";
    home = "/home/korri-source";
    createHome = true;
    extraGroups = [
      "input"
      "korri-sessiond-clients"
      "render"
      "seat"
      "video"
    ];
  };

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
    user = lib.mkDefault "korri-source";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri-source";
    wants = lib.mkDefault [ "seatd.service" ];
    after = lib.mkDefault [ "seatd.service" ];
    path = with pkgs; [
      bashInteractive
      coreutils
      dbus
      gamescope
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
  services.korri.server.streaming.enable = lib.mkDefault true;
  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
  };

  # Sessiond owns the foreground session lifecycle. Role is inferred
  # from compositor.kiosk.enable = false above, so this resolves to
  # "source-machine" without needing the deploy-role aggregate.
  services.korri.sessiond = {
    enable = true;
    port = sessiondPort;
    tokenFile = sessiondTokenFile;
    runtimeDir = sessiondRuntimeDir;
    sunshineRuntimeStatusPath = gameStreamStatusPath;
    # Share the token (mode 0640) with the korri-sessiond-clients group
    # so both korri-server (system unit) and korri-source (Sunshine
    # session user, running the game-stream runner) can authenticate
    # against sessiond's HTTP surface. Without this, the token stays
    # root:root 0600 and every cross-user managed launch fails closed.
    sharedGroup = "korri-sessiond-clients";
  };

  # Game-stream runner routes lifecycle:"foreground" intents through
  # sessiond. The Sunshine wrapper exports KORRI_SESSIOND_URL and
  # KORRI_SESSIOND_TOKEN_FILE so the runner's createSessionLauncherFromEnv
  # builds an active sessiondLauncher.
  services.korri.gameStream = {
    enable = lib.mkDefault true;
    runtimeDir = gameStreamRuntimeDir;
    statusPath = gameStreamStatusPath;
    sessiond.url = "http://127.0.0.1:${toString sessiondPort}";
    sessiond.tokenFile = sessiondTokenFile;
  };

  # Without this, korri-server's Launcher falls through to the in-process
  # shell launcher which spawns from the unit's bare systemd PATH and
  # then explodes with ENOENT on gamescope. Mirrors product/systems/nixos/images/kiosk.nix.
  services.korri.server.sessiond = {
    url = "http://127.0.0.1:${toString sessiondPort}";
    tokenFile = sessiondTokenFile;
  };
}
