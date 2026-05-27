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
    # listed here. We reuse the compositor's gamescope package so any
    # platform-level package override flows through automatically, and
    # we add the kiosk's retroarch wrapper so cascade-resolved
    # RetroArch launches resolve.
    path = [
      config.services.korri.compositor.gamescope.package
      retroarchKiosk
    ];
    # Gamescope spawned by sessiond connects to the kiosk compositor's
    # wayland socket at $XDG_RUNTIME_DIR/$WAYLAND_DISPLAY. The compositor
    # publishes the socket under /run/user/0 (compositor.runtimeDir),
    # named "wayland-1" by sway's default-first allocation, mirroring
    # the korri-sunshine attach pattern in nix/modules/korri-server.nix.
    extraEnvironment = {
      XDG_RUNTIME_DIR = config.services.korri.compositor.runtimeDir;
      WAYLAND_DISPLAY = "wayland-1";
    };
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
