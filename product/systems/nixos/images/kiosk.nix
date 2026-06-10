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
  sessiondSocketPath = "%t/korri/sessiond.sock";

  # Sessiond owns the kiosk renderer (Electrobun). The renderer
  # inherits sessiond's process environment when spawned via the
  # in-process runner, so the renderer-side identity has to live on
  # sessiond's unit env, not the compositor's. See
  # product/services/device/sessiond-electrobun.ts buildElectrobunCommand: HOME
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
    # Renderer stdout/stderr capture. realElectrobunRunner.spawn writes
    # in append mode (commit 70ea2e7), so multiple spawn attempts in a
    # sessiond restart loop accumulate. Persistent path so the log
    # survives reboots — critical because /run/systemd overrides do
    # not, and on ROCKNIX /etc is read-only.
    KORRI_ELECTROBUN_LOG = "${compositorCfg.stateHome}/korri/electrobun.log";
    # Wayland-session identity. These are the env keys Sway puts on
    # its own process env at compositor-init and propagates to every
    # `exec` child. Hardcoded for the kiosk shape: kiosk-on-Wayland
    # under Sway with Xwayland's first display.
    XDG_SESSION_TYPE = "wayland";
    XDG_CURRENT_DESKTOP = "sway";
    DISPLAY = ":0";
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

  # Minimal RetroArch closure for the kiosk: retroarch-bare (zero
  # default cores) joined with exactly one libretro core
  # (libretro-fake-08, PICO-8). We INTENTIONALLY do NOT use
  # `pkgs.retroarch-bare.passthru.wrapper { cores = ...; }` here.
  #
  # That nixpkgs wrapper unconditionally prepends
  #   -L <wrapper-out>/lib/retroarch/cores --appendconfig=<cfg>
  # to every `retroarch` invocation. When our launcher then passes its
  # own `-L <core> <content>`, RetroArch sees two `-L` flags AND the
  # first one is a directory (not a core file). The CLI parser does
  # not cleanly last-wins in that case: it routes by content extension
  # and frequently picks the built-in `image display` core for `.png`
  # files, ignoring the explicit `-L` we asked for. The user-visible
  # symptom on Sobo was "press A on celeste-classic shows a cart
  # browser, not the game".
  #
  # `symlinkJoin` exposes the bare retroarch binary AND the core .so on
  # PATH / lib/retroarch/cores without injecting any flags. The
  # closure-shape assertions in `tools/testing/nix/korri-*-config-check.nix`
  # match on `passthru.cores` + `passthru.unwrapped`, so we propagate
  # both attributes here to keep the assertions valid.
  #
  # IMPORTANT: `cores` here intentionally contains exactly one entry.
  # Korri ships RetroArch as a per-cart runtime, not as an emulator-
  # of-everything; adding cores grows every kiosk image's closure for
  # every user. New libretro cores should land as their own packages
  # with their own kiosk opt-ins, not appended here. The closure-shape
  # check guards this.
  retroarchKiosk = pkgs.symlinkJoin {
    name = "korri-retroarch-fake-08";
    paths = [
      pkgs.retroarch-bare
      pkgs.libretro-fake-08
    ];
    passthru = {
      cores = [ pkgs.libretro-fake-08 ];
      unwrapped = pkgs.retroarch-bare;
    };
  };
in
{
  imports = [ ./headless.nix ];

  services.korri.client.enable = lib.mkDefault true;

  # Stable abs path the cascade-side launcher YAML can reference for
  # the fake-08 core without baking a per-build nix store hash into
  # user data under /var/lib/korrid/.local/share/korri/library/.
  # Pairs with the `retroarchKiosk` symlinkJoin above: the YAML uses
  #   command: retroarch                          # PATH-resolved
  #   cores: { retroarch-fake-08: /etc/korri/cores/fake08_libretro.so }
  # which is rebuild-safe.
  environment.etc."korri/cores/fake08_libretro.so".source =
    "${pkgs.libretro-fake-08}/lib/retroarch/cores/fake08_libretro.so";

  services.korri.compositor = {
    enable = true;
    kiosk.enable = true;
    # RetroArch wired into the compositor unit PATH so the Korri launch
    # flow can invoke `retroarch -L fake08_libretro.so <cart>` once the
    # cascade-side launcher record lands. Closure-shape assertion in
    # tools/testing/nix/korri-*-config-check.nix prevents core bloat.
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
  # role-specific idle restore. Without this enabled, korrid's
  # app.library.launch falls through to the in-process shell launcher
  # and explodes with ENOENT on gamescope because the daemon unit's bare
  # systemd PATH does not include it (see docs/solutions/runtime-errors/
  # korrid-launch-falls-through-to-bare-path-2026-05-27.md).
  #
  # Role is inferred from compositor.kiosk.enable = true above, so this
  # resolves to "kiosk".
  services.korri.sessiond = {
    enable = true;
    port = sessiondPort;
    socketPath = sessiondSocketPath;
    # Sessiond spawns the foreground app via the in-process shell
    # launcher (createShellLauncher inside product/services/device/sessiond.ts),
    # which inherits this unit's PATH when it spawns. Anything the
    # default-gamescope launch path needs to find by name has to be
    # listed here:
    #   - bashInteractive: the renderer-launch path's `resolve` step
    #     runs `Bun.spawn(["sh", "-lc", ...])` to look up the
    #     Electrobun binary; without sh on PATH every renderer launch
    #     fails with `Executable not found in $PATH: "sh"`. systemd's
    #     default unit PATH on NixOS does NOT include a shell.
    #   - compositor.sway.package: the kiosk role's reconcileIdle
    #     step shells out to `swaymsg -t get_tree` (via
    #     getKorriWindows / evaluateHomeInvariant) to check whether
    #     the renderer is already up. Without sway on PATH, every
    #     /control/start throws "Executable not found in $PATH:
    #     swaymsg" before the renderer-launch path runs.
    #   - compositor.gamescope.package: any platform-level package
    #     override flows through automatically.
    #   - retroarchKiosk: kiosk RetroArch wrapper so cascade-resolved
    #     `retroarch -L ... <cart>` launches resolve.
    #   - client.package: the renderer (Electrobun) binary that
    #     sessiond's enterIdle spawns by name ("korri-desktop-device").
    path = [
      pkgs.bashInteractive
      compositorCfg.sway.package
      compositorCfg.gamescope.package
      retroarchKiosk
      config.services.korri.client.package
    ];
    # Gamescope spawned by sessiond connects to the kiosk compositor's
    # wayland socket at $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY. The compositor
    # publishes the socket under the korri user runtime directory (compositor.runtimeDir),
    # named "wayland-1" by sway's default-first allocation, mirroring
    # the korri-sunshine attach pattern in product/systems/nixos/modules/korri-daemon.nix.
    extraEnvironment = {
      XDG_RUNTIME_DIR = compositorCfg.runtimeDir;
      WAYLAND_DISPLAY = "wayland-1";
    }
    // kioskRendererEnvironment;
  };

  # Shortcut actions such as "kill-current-game" are executed by inputd, not
  # sessiond. They use swaymsg to act on the currently focused foreground
  # surface, so the kiosk input daemon needs the compositor's sway package in
  # its own PATH as well as sessiond's.
  services.korri.input.inputd.path = [ compositorCfg.sway.package ];

  # User-manager-activated services (notably xdg-desktop-portal backends) do
  # not inherit the compositor unit environment. Seed the real greetd/logind
  # user manager before kiosk services start so DBus activation sees the same
  # display/session identity as foreground children. Without this, local
  # Gamescope/RetroArch launches can block on portal backends that start with
  # an empty DISPLAY/WAYLAND_DISPLAY.
  systemd.user.services.korri-kiosk-session-environment = {
    description = "Seed Korri kiosk user-manager session environment";
    wantedBy = [ "korri-session.target" ];
    before = [
      "korri-compositor.service"
      "korri-inputd.service"
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

  # Boot ordering: sessiond's enterIdle spawns Electrobun, which
  # attaches to sway's wayland-1 socket and dials the inputd bridge
  # on startup. Both must be up first. `requires = [korri-inputd]`
  # because the renderer hangs without the bridge; `wants = [korri-
  # compositor]` because a failed sway is recoverable (sessiond
  # restart-loops until the socket appears) and we want diagnostics
  # to point at the compositor's own failure, not a cascaded sessiond
  # one.
  systemd.user.services.korri-sessiond = {
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
  #
  # ReadWritePaths carves a hole in `ProtectSystem = "strict"` (which
  # makes the whole filesystem hierarchy read-only) for the compositor's
  # home subtree. Sessiond's child Electrobun writes the
  # status.json, the renderer log, XDG_{DATA,CONFIG,CACHE}_HOME state,
  # and the library db there. Without this, every spawn dies on EROFS
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
