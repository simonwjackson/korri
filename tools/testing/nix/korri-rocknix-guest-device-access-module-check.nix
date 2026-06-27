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

  defaultAclNodeGlobs = [
    "/dev/dri/card*"
    "/dev/dri/renderD*"
    "/dev/input/event*"
    "/dev/snd/*"
    "/dev/tty0"
    "/dev/tty1"
  ];

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

  enabledBase = {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = defaultAclNodeGlobs;
    };
  };

  disabled = evaluateWith { };

  enabledPolicy = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      retriggerSubsystems = [
        "drm"
        "input"
        "sound"
      ];
      aclNodeGlobs = defaultAclNodeGlobs;
      enableDrmSeatTag = true;
      enableInputUdevAcl = true;
      enableBacklightRepair = true;
      backlightNodeGlobs = [ "/sys/class/backlight/*/brightness" ];
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
      udevSettleTimeoutSeconds = 9;
      aclNodeGlobs = [
        "/dev/custom0"
        "/dev/custom/render*"
      ];
      fallbackDelaySeconds = 7;
      fallbackAttempts = 4;
      fallbackRetryDelaySeconds = 3;
      enableBacklightRepair = true;
      backlightGroup = "custom-video";
      backlightNodeGlobs = [ "/sys/class/backlight/custom/brightness" ];
    };
  };

  noBacklightRepair = evaluateWith enabledBase;

  missingRuntimeUser = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      aclNodeGlobs = defaultAclNodeGlobs;
    };
  };

  emptyRuntimeUser = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "";
      aclNodeGlobs = defaultAclNodeGlobs;
    };
  };

  unsafeRuntimeUser = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "bad user";
      aclNodeGlobs = defaultAclNodeGlobs;
    };
  };

  unsafeSubsystem = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      retriggerSubsystems = [ "bad subsystem" ];
      aclNodeGlobs = defaultAclNodeGlobs;
    };
  };

  emptyAclGlobs = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = [ ];
    };
  };

  unsafeAclGlob = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = [ "/dev/input/event*;rm" ];
    };
  };

  emptyBacklightGlobs = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = defaultAclNodeGlobs;
      enableBacklightRepair = true;
      backlightNodeGlobs = [ ];
    };
  };

  unsafeBacklightGlob = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = defaultAclNodeGlobs;
      enableBacklightRepair = true;
      backlightNodeGlobs = [ "/sys/class/backlight/*/brightness;rm" ];
    };
  };

  unsafeBacklightGroup = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = defaultAclNodeGlobs;
      enableBacklightRepair = true;
      backlightNodeGlobs = [ "/sys/class/backlight/*/brightness" ];
      backlightGroup = "bad group";
    };
  };

  zeroFallbackAttempts = evaluateWith {
    services.korri.rocknixGuestDeviceAccess = {
      enable = true;
      runtimeUser = "test-user";
      aclNodeGlobs = defaultAclNodeGlobs;
      fallbackAttempts = 0;
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

  allIn = values: text: builtins.all (value: lib.hasInfix value text) values;

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
      (triggerUnit enabledPolicy).serviceConfig.Type == "oneshot"
      && (fallbackUnit enabledPolicy).serviceConfig.Type == "oneshot"
      && (triggerUnit enabledPolicy).serviceConfig.RemainAfterExit == true
      && (fallbackUnit enabledPolicy).serviceConfig.RemainAfterExit == true
    ))
    (check "module services do not own platform ordering" (
      hasNoPlatformOrdering (triggerUnit enabledPolicy)
      && hasNoPlatformOrdering (fallbackUnit enabledPolicy)
    ))
    (check "drm seat tag rule is emitted only when requested" (
      lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"'' (
        udevRules enabledPolicy
      )
      && !(lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat"'' (
        udevRules noBacklightRepair
      ))
    ))
    (check "input udev acl rule uses configured runtime user" (
      lib.hasInfix ''SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess"'' (
        udevRules enabledPolicy
      )
      && lib.hasInfix "setfacl -m u:test-user:rw /dev/input/%k" (udevRules enabledPolicy)
    ))
    (check "setup script applies declared retrigger and acl posture" (
      lib.hasInfix "udevadm control --reload" (triggerScript enabledPolicy)
      && lib.hasInfix "udevadm settle --timeout=5" (triggerScript enabledPolicy)
      && lib.hasInfix "--subsystem-match=drm" (triggerScript enabledPolicy)
      && lib.hasInfix "--subsystem-match=input" (triggerScript enabledPolicy)
      && lib.hasInfix "--subsystem-match=sound" (triggerScript enabledPolicy)
      && allIn defaultAclNodeGlobs (triggerScript enabledPolicy)
      && lib.hasInfix "setfacl -m m::rw,u:test-user:rw" (triggerScript enabledPolicy)
    ))
    (check "fallback script reapplies declared acl posture with bounded attempts" (
      lib.hasInfix "sleep 2" (fallbackScript enabledPolicy)
      && lib.hasInfix "seq 1 3" (fallbackScript enabledPolicy)
      && lib.hasInfix "sleep 1" (fallbackScript enabledPolicy)
      && allIn defaultAclNodeGlobs (fallbackScript enabledPolicy)
      && lib.hasInfix "setfacl -m m::rw,u:test-user:rw" (fallbackScript enabledPolicy)
    ))
    (check "custom policy controls retrigger subsystems and node globs" (
      lib.hasInfix "udevadm settle --timeout=9" (triggerScript customPolicy)
      && lib.hasInfix "--subsystem-match=drm" (triggerScript customPolicy)
      && lib.hasInfix "--subsystem-match=input" (triggerScript customPolicy)
      && !(lib.hasInfix "--subsystem-match=sound" (triggerScript customPolicy))
      && allIn [
        "/dev/custom0"
        "/dev/custom/render*"
      ] (triggerScript customPolicy)
      && lib.hasInfix "setfacl -m m::rw,u:custom-user:rw" (triggerScript customPolicy)
      && lib.hasInfix "sleep 7" (fallbackScript customPolicy)
      && lib.hasInfix "seq 1 4" (fallbackScript customPolicy)
      && lib.hasInfix "sleep 3" (fallbackScript customPolicy)
    ))
    (check "backlight repair is explicit and configurable" (
      lib.hasInfix "/sys/class/backlight/*/brightness" (triggerScript enabledPolicy)
      && lib.hasInfix "chgrp video" (triggerScript enabledPolicy)
      && lib.hasInfix "/sys/class/backlight/custom/brightness" (triggerScript customPolicy)
      && lib.hasInfix "chgrp custom-video" (triggerScript customPolicy)
      && !(lib.hasInfix "/sys/class/backlight/*/brightness" (triggerScript noBacklightRepair))
      && !(lib.hasInfix "chgrp video" (triggerScript noBacklightRepair))
    ))
    (check "runtime user is required only when enabled" (
      hasFailure "rocknixGuestDeviceAccess.runtimeUser" missingRuntimeUser
      && hasFailure "rocknixGuestDeviceAccess.runtimeUser" emptyRuntimeUser
      && hasFailure "rocknixGuestDeviceAccess.runtimeUser" unsafeRuntimeUser
      && failedAssertions disabled == [ ]
    ))
    (check "shell-rendered option values are validated" (
      hasFailure "rocknixGuestDeviceAccess.retriggerSubsystems" unsafeSubsystem
      && hasFailure "rocknixGuestDeviceAccess.aclNodeGlobs" emptyAclGlobs
      && hasFailure "rocknixGuestDeviceAccess.aclNodeGlobs" unsafeAclGlob
      && hasFailure "rocknixGuestDeviceAccess.backlightNodeGlobs" emptyBacklightGlobs
      && hasFailure "rocknixGuestDeviceAccess.backlightNodeGlobs" unsafeBacklightGlob
      && hasFailure "rocknixGuestDeviceAccess.backlightGroup" unsafeBacklightGroup
      && hasFailure "rocknixGuestDeviceAccess.fallbackAttempts" zeroFallbackAttempts
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
