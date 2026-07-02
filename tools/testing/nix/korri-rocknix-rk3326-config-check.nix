{
  pkgs,
  products,
  r36tmaxSystem,
  rk3326PlatformAdapterSourceFile,
  targetPackages,
  hostPackages,
  configurations,
}:

# Focused RK3326/R36T Max conformance gate for the unified Korri
# runtime-session contract. RK3326 already runs the canonical logind
# runtime root and disables the per-user PipeWire graph in favour of the
# substrate main-space graph, remapped into the Korri runtime user's
# directory. This check characterizes that conforming posture and the
# explicit audio bridge envs RK3326 still needs (its root-owned compositor
# and system-scope substrate audio are named compatibility exceptions), so
# regressions surface as contract-specific failures rather than silent env
# loss.

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  r36tmaxProduct = products.r36tmax;
  cfg = r36tmaxSystem.config;
  runtime = cfg.services.korri.runtime;
  compositor = cfg.services.korri.compositor;
  targetSystem = cfg.nixpkgs.hostPlatform.system;
  userServices = cfg.systemd.user.services or { };
  userSockets = cfg.systemd.user.sockets or { };
  sessiondEnv = (userServices."korri-sessiond" or { }).environment or { };
  inputdEnv = (userServices.korri-inputd or { }).environment or { };
  rocknixGuestProfile = cfg.services.korri.rocknixGuestProfile or { };
  rk3326PulseServer = "unix:/run/user/${toString runtime.uid}/pulse/native";
  rk3326PlatformAdapterSource = builtins.readFile rk3326PlatformAdapterSourceFile;
  adapterKeepsRuntimeDirRemap =
    lib.hasInfix "rocknix.session.runtimeDir.uid = runtime.uid" rk3326PlatformAdapterSource
    && lib.hasInfix "systemd.user.services.pipewire.enable = lib.mkForce false" rk3326PlatformAdapterSource;

  checks = [
    (check "R36T Max kiosk configuration must be exposed" (
      lib.hasAttr r36tmaxProduct.configName configurations
    ))
    (check "R36T Max target system package must be exposed" (
      lib.hasAttr r36tmaxProduct.kioskSystemPackageName targetPackages
    ))
    (check "R36T Max host rootfs package must be exposed" (
      lib.hasAttr r36tmaxProduct.rootfsPackageName hostPackages
    ))
    (check "R36T Max evaluated target system must be aarch64-linux" (targetSystem == "aarch64-linux"))
    (check "R36T Max compositor uses the canonical logind runtime root" (
      compositor.runtimeDir == "%t"
    ))
    (check "R36T Max compositor stays root-owned while guest device-access is unadopted" (
      compositor.user == "root" && compositor.createUser == false
    ))
    (check "R36T Max remaps the substrate audio graph into the Korri runtime user" (
      (cfg.rocknix.session.runtimeDir.uid or null) == runtime.uid
      && ((userServices.pipewire or { }).enable or true) == false
      && ((userServices.pipewire-pulse or { }).enable or true) == false
      && ((userServices.wireplumber or { }).enable or true) == false
      && ((userSockets.pipewire or { }).enable or true) == false
      && ((userSockets.pipewire-pulse or { }).enable or true) == false
      && adapterKeepsRuntimeDirRemap
    ))
    (check "R36T Max sessiond inherits the runtime-user Pulse socket" (
      (sessiondEnv.PULSE_SERVER or null) == rk3326PulseServer
    ))
    (check "R36T Max inputd controls the runtime-user Pulse default sink" (
      (inputdEnv.PULSE_SERVER or null) == rk3326PulseServer
    ))
    (check "R36T Max InputPlumber provider must be enabled" (
      cfg.services.korri.input.provider.enable
      && (cfg.services.korri.input.provider.name or null) == "inputplumber"
    ))
    (check "R36T Max RockNIX guest profile must be enabled" (
      (rocknixGuestProfile.enable or false) == true
      && (rocknixGuestProfile.proofMarkerLabel or null) == "korri-rk3326-r36tmax-kiosk-system"
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri RK3326 kiosk config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rk3326-kiosk-config-check" { } ''
    echo "All ${toString (builtins.length checks)} Korri RK3326 config invariants passed."
    touch $out
  ''
