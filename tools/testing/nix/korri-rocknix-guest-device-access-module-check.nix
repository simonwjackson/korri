# Pure-Nix module-evaluation check for `services.korri.rocknixGuestDeviceAccess`.
#
# Device-neutral: evaluates the shared ROCKNIX guest device-access module
# against a minimal fixture host and asserts the rendered udev rules, service
# bodies, option validation, and absence of platform-owned ordering.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-rocknix-guest-device-access-module --no-link
{
  pkgs,
  korriRocknixGuestDeviceAccessModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "korri-device-access-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriRocknixGuestDeviceAccessModule
        baseModule
        overrides
      ];
    }).config;

  disabled = evaluateWith { };

  enabledDefault = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      enableDrmSeatTag = true;
      enableInputUdevAcl = true;
      enableBacklightRepair = true;
    };
  };

  customPolicy = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "custom-user";
      retriggerSubsystems = [
        "drm"
        "input"
      ];
      aclNodeGlobs = [
        "/dev/custom0"
        "/dev/custom/render*"
      ];
      fallbackDelaySeconds = 7;
      enableBacklightRepair = true;
      backlightGroup = "custom-video";
      backlightNodeGlobs = [ "/sys/class/backlight/custom/brightness" ];
    };
  };

  noBacklightRepair = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      enableBacklightRepair = false;
    };
  };

  missingRuntimeUser = evaluateWith {
    services.korri.rocknixGuestDeviceAccess.enable = true;
  };

  emptyRuntimeUser = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "";
    };
  };

  emptyAclGlobs = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = [ ];
    };
  };

  emptyBacklightGlobs = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      enableBacklightRepair = true;
      backlightNodeGlobs = [ ];
    };
  };

  triggerUnit = cfg: cfg.systemd.services.korri-rocknix-seat-device-trigger or { };
  fallbackUnit = cfg: cfg.systemd.services.korri-rocknix-device-acl-fallback or { };

  execScript =
    unit:
    let
      raw = unit.serviceConfig.ExecStart or null;
      path = if builtins.isList raw then builtins.head raw else raw;
    in
    if path == null then "" else builtins.readFile path;

  triggerScript = cfg: execScript (triggerUnit cfg);
  fallbackScript = cfg: execScript (fallbackUnit cfg);
  udevRules = cfg: cfg.services.udev.extraRules or "";

  failedAssertions = cfg: map (a: a.message) (builtins.filter (a: !a.assertion) cfg.assertions);
  hasFailure =
    needle: cfg: builtins.any (message: lib.hasInfix needle message) (failedAssertions cfg);

  hasNoPlatformOrdering =
    unit:
    (unit.wantedBy or [ ]) == [ ]
    && (unit.after or [ ]) == [ ]
    && (unit.before or [ ]) == [ ]
    && (unit.wants or [ ]) == [ ]
    && (unit.requires or [ ]) == [ ];

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "disabled module emits no device access services" (
      !(disabled.systemd.services ? korri-rocknix-seat-device-trigger)
      && !(disabled.systemd.services ? korri-rocknix-device-acl-fallback)
    ))
    (check "disabled module emits no ROCKNIX device-access udev rules" (
      !(lib.hasInfix "master-of-seat" (udevRules disabled))
      && !(lib.hasInfix "setfacl -m u:" (udevRules disabled))
    ))
    (check "enabled module emits canonical oneshot services" (
      (triggerUnit enabledDefault).serviceConfig.Type == "oneshot"
      && (fallbackUnit enabledDefault).serviceConfig.Type == "oneshot"
      && (triggerUnit enabledDefault).serviceConfig.RemainAfterExit == true
      && (fallbackUnit enabledDefault).serviceConfig.RemainAfterExit == true
    ))
    (check "module services do not own platform ordering" (
      hasNoPlatformOrdering (triggerUnit enabledDefault)
      && hasNoPlatformOrdering (fallbackUnit enabledDefault)
    ))
    (check "drm seat tag rule is emitted only when requested" (
      lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"'' (
        udevRules enabledDefault
      )
      && !(lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat"'' (
        udevRules noBacklightRepair
      ))
    ))
    (check "input udev acl rule uses configured runtime user" (
      lib.hasInfix ''SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess"'' (
        udevRules enabledDefault
      )
      && lib.hasInfix "setfacl -m u:test-user:rw /dev/input/%k" (udevRules enabledDefault)
    ))
    (check "default setup script preserves current retrigger and acl posture" (
      lib.hasInfix "udevadm control --reload" (triggerScript enabledDefault)
      && lib.hasInfix "--subsystem-match=drm" (triggerScript enabledDefault)
      && lib.hasInfix "--subsystem-match=input" (triggerScript enabledDefault)
      && lib.hasInfix "--subsystem-match=sound" (triggerScript enabledDefault)
      && lib.hasInfix "/dev/dri/card* /dev/dri/renderD* /dev/input/event* /dev/snd/* /dev/tty0 /dev/tty1" (
        triggerScript enabledDefault
      )
      && lib.hasInfix "setfacl -m m::rw,u:test-user:rw" (triggerScript enabledDefault)
    ))
    (check "fallback script reuses acl posture and default delay" (
      lib.hasInfix "sleep 2" (fallbackScript enabledDefault)
      && lib.hasInfix "/dev/dri/card* /dev/dri/renderD* /dev/input/event* /dev/snd/* /dev/tty0 /dev/tty1" (
        fallbackScript enabledDefault
      )
      && lib.hasInfix "setfacl -m m::rw,u:test-user:rw" (fallbackScript enabledDefault)
    ))
    (check "custom policy controls retrigger subsystems and node globs" (
      lib.hasInfix "--subsystem-match=drm" (triggerScript customPolicy)
      && lib.hasInfix "--subsystem-match=input" (triggerScript customPolicy)
      && !(lib.hasInfix "--subsystem-match=sound" (triggerScript customPolicy))
      && lib.hasInfix "/dev/custom0 /dev/custom/render*" (triggerScript customPolicy)
      && lib.hasInfix "setfacl -m m::rw,u:custom-user:rw" (triggerScript customPolicy)
      && lib.hasInfix "sleep 7" (fallbackScript customPolicy)
    ))
    (check "backlight repair is explicit and configurable" (
      lib.hasInfix "/sys/class/backlight/*/brightness" (triggerScript enabledDefault)
      && lib.hasInfix "chgrp video" (triggerScript enabledDefault)
      && lib.hasInfix "/sys/class/backlight/custom/brightness" (triggerScript customPolicy)
      && lib.hasInfix "chgrp custom-video" (triggerScript customPolicy)
      && !(lib.hasInfix "/sys/class/backlight/*/brightness" (triggerScript noBacklightRepair))
      && !(lib.hasInfix "chgrp video" (triggerScript noBacklightRepair))
    ))
    (check "runtime user is required only when enabled" (
      hasFailure "rocknixGuestDeviceAccess.runtimeUser" missingRuntimeUser
      && hasFailure "rocknixGuestDeviceAccess.runtimeUser" emptyRuntimeUser
      && failedAssertions disabled == [ ]
    ))
    (check "declared node globs are validated when enabled" (
      hasFailure "rocknixGuestDeviceAccess.aclNodeGlobs" emptyAclGlobs
      && hasFailure "rocknixGuestDeviceAccess.backlightNodeGlobs" emptyBacklightGlobs
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "Korri ROCKNIX guest device-access module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-guest-device-access-module-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'SUMMARY'
    Korri ROCKNIX guest device-access module check passed.
    SUMMARY
  ''
