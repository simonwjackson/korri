{
  config,
  lib,
  pkgs,
  ...
}:

let
  # Loopback HTTP surface for the in-image korri-sessiond. Shared by
  # both the sessiond unit and korri-server's delegation env so the two
  # cannot drift.
  sessiondPort = 3003;
  sessiondTokenFile = "/run/korri-sessiond/token";

  # Sessiond owns the kiosk renderer (Electrobun). The renderer
  # inherits sessiond's process environment when spawned via the
  # in-process runner, so the renderer-side identity has to live on
  # sessiond's unit env, not the compositor's. See
  # tools/device/sessiond-electrobun.ts buildElectrobunCommand: HOME
  # and XDG_STATE_HOME are read from the parent env to derive the
  # Electrobun state root; KORRI_KIOSK and the inputd URLs are read
  # directly by the renderer at startup.
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
    # Wayland-session identity. These are the env keys Sway puts on
    # its own process env at compositor-init and propagates to every
    # `exec` child. Hardcoded for the kiosk shape: kiosk-on-Wayland
    # under Sway with Xwayland's first display.
    XDG_SESSION_TYPE = "wayland";
    XDG_CURRENT_DESKTOP = "sway";
    DISPLAY = ":0";
  }
  // lib.optionalAttrs (
    compositorCfg.sessionBus.mode == "existing" && compositorCfg.sessionBus.address != null
  ) {
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

  # Minimal RetroArch closure for the kiosk: retroarch-bare (zero default
  # cores) wrapped with exactly one core, libretro-fake-08 (PICO-8). The
  # wrapper reads each core's passthru.libretroCore string and the
  # produced .so to compose -L flags, and exposes the cores list at
  # wrapper.passthru.cores for the closure-shape assertions in
  # nix/tests/korri-*-config-check.nix to introspect.
  #
  # IMPORTANT: this list intentionally contains exactly one entry. Korri
  # ships RetroArch as a per-cart runtime, not as an emulator-of-everything;
  # adding cores grows every kiosk image's closure for every user. New
  # libretro cores should land as their own packages with their own kiosk
  # opt-ins, not by appending here. The closure-shape check guards this.
  retroarchKiosk = pkgs.retroarch-bare.passthru.wrapper {
    cores = [ pkgs.libretro-fake-08 ];
  };
in
{
  imports = [ ./headless.nix ];

  services.korri.client.enable = lib.mkDefault true;

  services.korri.compositor = {
    enable = true;
    kiosk.enable = true;
    # RetroArch wired into the compositor unit PATH so the Korri launch
    # flow can invoke `retroarch -L fake08_libretro.so <cart>` once the
    # cascade-side launcher record lands. Closure-shape assertion in
    # nix/tests/korri-*-config-check.nix prevents core bloat.
    path = [ retroarchKiosk ];
  };

  # Kiosk appliance images require host-side normalized appliance input via
  # the canonical InputPlumber provider. Platforms can override by setting
  # `services.korri.input.provider.name` to something else (or disabling the
  # provider entirely if a downstream test image deliberately runs without it).
  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
  };

  # Sessiond owns the foreground-session lifecycle on every kiosk image:
  # default-gamescope launches, gamescope-wl reap on exit, and the
  # role-specific idle restore. Without this enabled, korri-server's
  # app.library.launch falls through to the in-process shell launcher
  # and explodes with ENOENT on gamescope because the server unit's bare
  # systemd PATH does not include it (see docs/solutions/runtime-errors/
  # korri-server-launch-falls-through-to-bare-path-2026-05-27.md).
  #
  # Role is inferred from compositor.kiosk.enable = true above, so this
  # resolves to "kiosk".
  services.korri.sessiond = {
    enable = true;
    port = sessiondPort;
    tokenFile = sessiondTokenFile;
    # korri-server runs as the korri-server user; the token file must be
    # group-readable by that user so its Launcher can authenticate to
    # sessiond's HTTP surface.
    sharedGroup = "korri-server";
    # Sessiond spawns the foreground app via the in-process shell
    # launcher (createShellLauncher inside tools/device/sessiond.ts),
    # which inherits this unit's PATH when it spawns. Anything the
    # default-gamescope launch path needs to find by name has to be
    # listed here:
    #   - bashInteractive: the renderer-launch path's `resolve` step
    #     runs `Bun.spawn(["sh", "-lc", ...])` to look up the
    #     Electrobun binary; without sh on PATH every renderer launch
    #     fails with `Executable not found in $PATH: "sh"`. systemd's
    #     default unit PATH on NixOS does NOT include a shell.
    #   - compositor.gamescope.package: any platform-level package
    #     override flows through automatically.
    #   - retroarchKiosk: kiosk RetroArch wrapper so cascade-resolved
    #     `retroarch -L ... <cart>` launches resolve.
    #   - client.package: the renderer (Electrobun) binary that
    #     sessiond's enterIdle spawns by name ("korri-desktop-device").
    path = [
      pkgs.bashInteractive
      compositorCfg.gamescope.package
      retroarchKiosk
      config.services.korri.client.package
    ];
    # Gamescope spawned by sessiond connects to the kiosk compositor's
    # wayland socket at $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY. The compositor
    # publishes the socket under /run/user/0 (compositor.runtimeDir),
    # named "wayland-1" by sway's default-first allocation, mirroring
    # the korri-sunshine attach pattern in nix/modules/korri-server.nix.
    extraEnvironment = {
      XDG_RUNTIME_DIR = compositorCfg.runtimeDir;
      WAYLAND_DISPLAY = "wayland-1";
    }
    // kioskRendererEnvironment;
  };

  # Boot ordering: sessiond's enterIdle spawns Electrobun, which
  # attaches to sway's wayland-1 socket and dials the inputd bridge
  # on startup. Both must be up first. `requires = [korri-inputd]`
  # because the renderer hangs without the bridge; `wants = [korri-
  # compositor]` because a failed sway is recoverable (sessiond
  # restart-loops until the socket appears) and we want diagnostics
  # to point at the compositor's own failure, not a cascaded sessiond
  # one.
  systemd.services.korri-sessiond = {
    after = [
      "korri-compositor.service"
      "korri-inputd.service"
    ];
    wants = [ "korri-compositor.service" ];
    requires = [ "korri-inputd.service" ];
  };

  # Source-machine sessiond owns its own sway; kiosk sessiond ATTACHES
  # to the existing compositor session. The module's default
  # `ProtectHome = true` masks /run/user/* in sessiond's mount namespace
  # and would block the wayland-1 socket connect. Relax it for the
  # kiosk role only.
  systemd.services.korri-sessiond.serviceConfig.ProtectHome = lib.mkForce false;

  # Wire korri-server to delegate managed launches to the in-image
  # sessiond. The both-or-neither assertion in the server module would
  # fire on a partial wire.
  services.korri.server.sessiond = {
    url = "http://127.0.0.1:${toString sessiondPort}";
    tokenFile = sessiondTokenFile;
  };
}
