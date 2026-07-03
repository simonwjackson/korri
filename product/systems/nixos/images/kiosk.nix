{
  config,
  lib,
  pkgs,
  ...
}:

let
  # Loopback HTTP surface for the in-image korri-sessiond. Shared by
  # both the sessiond unit and korrid's delegation env so the two
  # cannot drift.
  sessiondPort = 3003;
  webSurfacePort = 8099;
  sessiondSocketPath = "%t/korri/sessiond.sock";
  rendererStatusFile = "${config.services.korri.compositor.stateHome}/korri/chromium/status.json";

  # Sessiond owns the Chromium kiosk renderer. The renderer inherits
  # sessiond's process environment when spawned via the in-process
  # runner, so renderer-side identity has to live on sessiond's unit
  # env, not the compositor's.
  #
  # The Wayland-session identity (XDG_SESSION_TYPE, XDG_CURRENT_DESKTOP,
  # DBUS_SESSION_BUS_ADDRESS, DISPLAY) is required because when sway
  # was previously the renderer's parent, it set these on every
  # exec'd child at compositor-init time. With sessiond as a sibling
  # unit instead of a sway child, the same identity must be carried
  # on sessiond's unit env. Without these, GTK falls through to an
  # X11 backend with empty DISPLAY and the renderer dies with
  # `Gtk-WARNING: cannot open display:` before the status file is
  # written.
  compositorCfg = config.services.korri.compositor;
  inputCfg = config.services.korri.input;
  kioskRendererEnvironment = {
    HOME = compositorCfg.home;
    XDG_STATE_HOME = compositorCfg.stateHome;
    XDG_DATA_HOME = compositorCfg.dataHome;
    XDG_CONFIG_HOME = compositorCfg.configHome;
    KORRI_KIOSK = "1";
    KORRI_DESKTOP_INPUTD_URL = compositorCfg.kiosk.inputdBridgeUrl;
    KORRI_NATIVE_BRIDGE_URL = compositorCfg.kiosk.inputdBridgeUrl;
    KORRI_WEB_SURFACE_URL = "http://127.0.0.1:${toString webSurfacePort}/";
    KORRI_DESKTOP_STATUS_FILE = rendererStatusFile;
    # Renderer stdout/stderr capture. realChromiumRunner.spawn writes
    # in append mode, so multiple spawn attempts in a sessiond restart
    # loop accumulate. Persistent path so the log survives reboots —
    # critical because /run/systemd overrides do not, and on ROCKNIX
    # /etc is read-only.
    KORRI_CHROMIUM_LOG = "${compositorCfg.stateHome}/korri/chromium.log";
    # Wayland-session identity. These are the env keys Sway puts on
    # its own process env at compositor-init and propagates to every
    # `exec` child. Chromium connects directly to the Wayland socket;
    # do not pin GTK/WebKit/X11 backend flags here.
    XDG_SESSION_TYPE = "wayland";
    XDG_CURRENT_DESKTOP = "sway";
  }
  //
    lib.optionalAttrs
      (compositorCfg.sessionBus.mode == "existing" && compositorCfg.sessionBus.address != null)
      {
        # When the platform provides a session bus, sessiond's renderer
        # needs the same DBUS_SESSION_BUS_ADDRESS the compositor uses so
        # the renderer can reach AT-SPI / dconf / portal services.
        DBUS_SESSION_BUS_ADDRESS = compositorCfg.sessionBus.address;
      }
  // lib.optionalAttrs (inputCfg.provider.name == "inputplumber") {
    # The renderer's Moonlight launch path refuses to start a stream
    # without the InputPlumber virtual gamepad when the host has
    # declared the InputPlumber provider. Carries over verbatim from
    # the compositor's previous sessionEnvironment.
    KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER = "1";
  };

in
{
  imports = [ ./headless.nix ];

  services.korri.client.enable = lib.mkDefault true;

  services.korri.compositor = {
    enable = true;
    kiosk.enable = true;
  };

  # Kiosk appliance images require host-side normalized appliance input via
  # the canonical InputPlumber provider. Platforms can override by setting
  # `services.korri.input.provider.name` to something else (or disabling the
  # provider entirely if a downstream test image deliberately runs without it).
  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
  };

  services.korri.webSurfaceHost = {
    enable = true;
    port = webSurfacePort;
    inputdUrl = compositorCfg.kiosk.inputdBridgeUrl;
    statusFile = rendererStatusFile;
  };

  # Sessiond owns the foreground-session lifecycle on every kiosk image.
  # Without this enabled, korrid has no lifecycle service to delegate to.
  #
  # Role is inferred from compositor.kiosk.enable = true above, so this
  # resolves to "kiosk".
  services.korri.sessiond = {
    enable = true;
    port = sessiondPort;
    socketPath = sessiondSocketPath;
    kioskPolicy = lib.mkDefault "lanes";
    # Sessiond spawns the foreground app via the in-process shell
    # launcher (createShellLauncher inside product/services/device/sessiond.ts),
    # which inherits this unit's PATH when it spawns. Anything the
    # foreground launch path needs to find by name has to be
    # listed here:
    #   - bashInteractive: the renderer-launch path's `resolve` step
    #     runs `Bun.spawn(["sh", "-lc", ...])` to look up the
    #     Chromium binary; without sh on PATH every renderer launch
    #     fails with `Executable not found in $PATH: "sh"`. systemd's
    #     default unit PATH on NixOS does NOT include a shell.
    #   - compositor.sway.package: the kiosk role's reconcileIdle
    #     step shells out to `swaymsg -t get_tree` (via
    #     getKorriWindows / evaluateHomeInvariant) to check whether
    #     the renderer is already up. Without sway on PATH, every
    #     /control/start throws "Executable not found in $PATH:
    #     swaymsg" before the renderer-launch path runs.
    #   - client.package: the Chromium kiosk binary that sessiond's
    #     enterIdle spawns by name ("korri-chromium-kiosk" by default).
    path = [
      pkgs.bashInteractive
      compositorCfg.sway.package
      config.services.korri.client.package
    ];
    # Foreground children spawned by sessiond connect to the kiosk compositor's
    # wayland socket at $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY. The compositor
    # publishes the socket under the korri user runtime directory (compositor.runtimeDir),
    # named "wayland-1" by sway's default-first allocation, mirroring
    # the korri-sunshine attach pattern in product/systems/nixos/modules/korri-daemon.nix.
    extraEnvironment = {
      XDG_RUNTIME_DIR = compositorCfg.runtimeDir;
      WAYLAND_DISPLAY = "wayland-1";
      # Single source of truth: the compositor module owns the lane workspace
      # names and pins them to the home output; sessiond reads the same values
      # so the sway config and sessiond can never drift on the workspace names.
      KORRI_SESSIOND_HUB_WORKSPACE = compositorCfg.hubWorkspace;
      KORRI_SESSIOND_GAME_WORKSPACE = compositorCfg.gameWorkspace;
      KORRI_SWAY_APP_IDS = "chromium,chromium-browser,google-chrome,chrome";
      KORRI_SWAY_APP_ID_PREFIXES = "chrome-";
      KORRI_SWAY_CLASSES = "Chromium,chromium,Google-chrome";
    }
    // kioskRendererEnvironment;
  };

  # Shortcut actions are executed by inputd, not sessiond. Foreground-control
  # actions use swaymsg today, and default volume actions use pactl against the
  # user Pulse socket. Keep both tools in the kiosk input daemon PATH so
  # hardware shortcuts do not depend on an operator's shell environment.
  services.korri.input.inputd.path = [
    compositorCfg.sway.package
    pkgs.pulseaudio
    pkgs.brightnessctl
  ];

  # User-manager-activated services (notably xdg-desktop-portal backends) do
  # not inherit the compositor unit environment. Seed the real greetd/logind
  # user manager before kiosk services start so DBus activation sees the same
  # display/session identity as foreground children. Without this, local
  # foreground launches can block on portal backends that start with an empty
  # DISPLAY/WAYLAND_DISPLAY.
  systemd.user.services.korri-kiosk-session-environment = {
    description = "Seed Korri kiosk user-manager session environment";
    wantedBy = [ "korri-session.target" ];
    before = [
      "korri-compositor.service"
      "korri-inputd.service"
      "korri-web-surface-host.service"
      "korri-sessiond.service"
      "korrid.service"
    ];
    path = [
      pkgs.coreutils
      pkgs.systemd
    ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      set -eu
      runtime_dir="''${XDG_RUNTIME_DIR:-/run/user/$(${pkgs.coreutils}/bin/id -u)}"
      bus_address="unix:path=$runtime_dir/bus"
      export XDG_RUNTIME_DIR="$runtime_dir"
      export DBUS_SESSION_BUS_ADDRESS="$bus_address"

      systemctl --user set-environment \
        XDG_RUNTIME_DIR="$runtime_dir" \
        DBUS_SESSION_BUS_ADDRESS="$bus_address" \
        DISPLAY=:0 \
        WAYLAND_DISPLAY=wayland-1 \
        XDG_CURRENT_DESKTOP=sway \
        XDG_SESSION_TYPE=wayland \
        NO_AT_BRIDGE=1
    '';
  };

  # Remove the pre-Nix manual workaround that pinned sessiond to a volatile
  # Xwayland display number. It persisted under /home across reboots and could
  # override the declarative DISPLAY=:0 above, leaving /control/start stuck in
  # `starting` when sway recreated Xwayland as :0.
  system.activationScripts.korri-remove-legacy-sessiond-display-dropin.text = ''
    rm -f ${compositorCfg.home}/.config/systemd/user/korri-sessiond.service.d/display.conf
  '';

  # Boot ordering: sessiond's enterIdle spawns Chromium, which
  # attaches to sway's wayland-1 socket and loads the web-surface host;
  # the page then dials inputd directly. Both host and inputd must be up first.
  # `requires = [korri-inputd]`
  # because the renderer hangs without the bridge; `wants = [korri-
  # compositor]` because a failed sway is recoverable (sessiond
  # restart-loops until the socket appears) and we want diagnostics
  # to point at the compositor's own failure, not a cascaded sessiond
  # one.
  systemd.user.services.korri-sessiond = {
    after = [
      "korri-compositor.service"
      "korri-inputd.service"
      "korri-web-surface-host.service"
    ];
    wants = [
      "korri-compositor.service"
      "korri-web-surface-host.service"
    ];
    requires = [
      "korri-inputd.service"
      "korri-web-surface-host.service"
    ];
  };

  # Source-machine sessiond owns its own sway; kiosk sessiond ATTACHES
  # to the existing compositor session. The module's default
  # `ProtectHome = true` masks /run/user/* in sessiond's mount namespace
  # and would block the wayland-1 socket connect. Relax it for the
  # kiosk role only.
  #
  # ReadWritePaths carves a hole in `ProtectSystem = "strict"` (which
  # makes the whole filesystem hierarchy read-only) for the compositor's
  # home subtree. Sessiond's child Chromium writes status.json, the
  # renderer log, XDG_{DATA,CONFIG,CACHE}_HOME state, and the library db
  # there. Without this, every spawn dies on EROFS
  # the moment it tries to persist anything.
  systemd.user.services.korri-sessiond.serviceConfig = {
    ProtectHome = lib.mkForce false;
    ReadWritePaths = [ compositorCfg.home ];
  };

  # Wire korrid to delegate managed launches to the in-image
  # sessiond. The both-or-neither assertion in the server module would
  # fire on a partial wire.
  services.korri.daemon.sessiond.socketPath = sessiondSocketPath;

  # Remote-source Moonlight argv is composed in korrid before the
  # foreground process is delegated to sessiond. The input requirement must
  # therefore be visible to korrid as well as sessiond, otherwise the
  # normal product launch path omits `-input` and can fall back to raw/unstable
  # evdev discovery.
  systemd.user.services.korrid.environment =
    lib.optionalAttrs (inputCfg.provider.name == "inputplumber")
      {
        KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER = "1";
      };
}
