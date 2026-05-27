{
  lib,
  pkgs,
  ...
}:

let
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
}
