# Shared ROCKNIX guest device-access convergence.
#
# ROCKNIX guest platforms can inherit device nodes that already exist in the
# host-owned namespace before guest udev has a chance to tag them. This module
# owns the reusable retrigger + ACL convergence mechanics. Platform adapters
# own topology facts and systemd ordering against substrate/display-manager
# services.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.rocknixGuestDeviceAccess;

  inherit (lib)
    concatMapStringsSep
    mkEnableOption
    mkIf
    mkOption
    optionalString
    types
    ;

  matches = pattern: value: builtins.match pattern value != null;
  safeName = "[-_a-z0-9]+";
  safeSubsystem = "[-A-Za-z0-9_+.]+";
  safeShellGlob = "[-A-Za-z0-9_./*+@:]+";

  # Device node entries are shell globs by design, so do not quote them here:
  # quoting would turn `/dev/dri/card*` into a literal string and skip existing
  # host-bound nodes. Option assertions below restrict entries to safe path-glob
  # characters before they are rendered into the loop.
  shellGlobs = values: lib.concatStringsSep " " values;
  aclNodeWords = shellGlobs cfg.aclNodeGlobs;
  backlightNodeWords = shellGlobs cfg.backlightNodeGlobs;

  retriggerCommands = concatMapStringsSep "\n" (subsystem: ''
    udevadm trigger --subsystem-match=${lib.escapeShellArg subsystem} --action=change || true
  '') cfg.retriggerSubsystems;

  aclLoop = ''
    for node in ${aclNodeWords}; do
      [ -e "$node" ] || continue
      setfacl -m m::rw,u:${cfg.runtimeUser}:rw "$node" || true
    done
  '';

  backlightRepairLoop = optionalString cfg.enableBacklightRepair ''
    for node in ${backlightNodeWords}; do
      [ -e "$node" ] || continue
      chgrp ${lib.escapeShellArg cfg.backlightGroup} "$node" || true
      chmod g+w "$node" || true
    done
  '';

  setupScript = pkgs.writeShellScript "korri-rocknix-seat-device-setup" ''
    set -u
    export PATH=${
      lib.makeBinPath (
        with pkgs;
        [
          acl
          coreutils
          systemd
        ]
      )
    }

    # Host-bound ROCKNIX device nodes may already exist when the guest boots.
    # Re-ask guest udev to apply metadata when nspawn sysfs permits it. Read-
    # only uevent paths are expected on some guests, so retrigger failures are
    # warnings, not boot gates.
    udevadm control --reload >/dev/null 2>&1 || true
    ${retriggerCommands}
    udevadm settle --timeout=${toString cfg.udevSettleTimeoutSeconds} || true

    # The guest's numeric device groups can differ from the NixOS group ids.
    # Directly grant the runtime user access to the nodes this platform declares
    # so the appliance can start even when guest udev cannot tag host devices.
    ${aclLoop}

    # Some sysfs backlight brightness files do not support POSIX ACLs; repair
    # group writability only when the platform explicitly opts in.
    ${backlightRepairLoop}
  '';

  fallbackScript = pkgs.writeShellScript "korri-rocknix-device-acl-fallback" ''
    set -u
    export PATH=${
      lib.makeBinPath (
        with pkgs;
        [
          acl
          coreutils
        ]
      )
    }

    # A display/session manager may re-open and chmod the active tty after the
    # early setup unit has run. Re-apply only direct access repairs here; the
    # platform adapter decides when this service runs.
    sleep ${toString cfg.fallbackDelaySeconds}
    for attempt in $(${pkgs.coreutils}/bin/seq 1 ${toString cfg.fallbackAttempts}); do
      ${aclLoop}
      ${backlightRepairLoop}
      if [ "$attempt" -lt ${toString cfg.fallbackAttempts} ]; then
        ${pkgs.coreutils}/bin/sleep ${toString cfg.fallbackRetryDelaySeconds}
      fi
    done
  '';

  drmSeatRule = optionalString cfg.enableDrmSeatTag ''
    # Rootless wlroots compositors acquire DRM through logind/libseat, so the
    # KMS card must be attached to seat0 when the guest's device metadata does
    # not already carry systemd's generic seat tags.
    SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"
  '';

  inputUdevAclRule = optionalString cfg.enableInputUdevAcl ''
    # Korri inputd runs as the kiosk user and reads evdev directly. Restate both
    # the group/mode invariant and an explicit ACL so late-created normalized
    # controller nodes remain readable.
    SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess", RUN+="${pkgs.acl}/bin/setfacl -m u:${cfg.runtimeUser}:rw /dev/input/%k"
  '';

  videoUdevAclRule = optionalString cfg.enableVideoUdevAcl ''
    # SM8550 V4L2 codec nodes are host-bound into the guest. Guest and host
    # numeric device groups can differ, so restate the semantic video group and
    # grant the runtime user direct access when video nodes are created late.
    SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", GROUP="video", MODE="0660", TAG+="uaccess", RUN+="${pkgs.acl}/bin/setfacl -m u:${cfg.runtimeUser}:rw /dev/%k"
  '';

  generatedUdevRules = drmSeatRule + inputUdevAclRule + videoUdevAclRule;
in
{
  key = "korri-rocknix-guest-device-access";

  options.services.korri.rocknixGuestDeviceAccess = {
    enable = mkEnableOption "Korri ROCKNIX host-bound guest device access convergence";

    runtimeUser = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "korri";
      description = ''
        Runtime user that receives direct ACL grants for platform-declared
        guest device nodes. Required when guest device access is enabled.
      '';
    };

    retriggerSubsystems = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [
        "drm"
        "input"
        "sound"
      ];
      description = "Guest udev subsystems to re-trigger before direct ACL repair.";
    };

    udevSettleTimeoutSeconds = mkOption {
      type = types.ints.unsigned;
      default = 5;
      description = "Best-effort udev settle timeout after configured subsystem retriggers.";
    };

    aclNodeGlobs = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [
        "/dev/dri/card*"
        "/dev/dri/renderD*"
        "/dev/input/event*"
        "/dev/snd/*"
        "/dev/tty0"
        "/dev/tty1"
      ];
      description = "Device node globs that receive direct runtime-user ACL grants.";
    };

    fallbackDelaySeconds = mkOption {
      type = types.ints.unsigned;
      default = 2;
      description = "Delay before the fallback service re-applies direct device access repairs.";
    };

    fallbackAttempts = mkOption {
      type = types.ints.unsigned;
      default = 3;
      description = "Number of bounded fallback repair attempts after the initial delay.";
    };

    fallbackRetryDelaySeconds = mkOption {
      type = types.ints.unsigned;
      default = 1;
      description = "Delay between bounded fallback repair attempts.";
    };

    enableDrmSeatTag = mkOption {
      type = types.bool;
      default = false;
      description = "Emit a static udev rule that tags DRM card nodes as seat0 master devices.";
    };

    enableInputUdevAcl = mkOption {
      type = types.bool;
      default = false;
      description = "Emit a udev rule that grants the runtime user access to late-created input event nodes.";
    };

    enableVideoUdevAcl = mkOption {
      type = types.bool;
      default = false;
      description = "Emit a udev rule that grants the runtime user access to late-created V4L2 video nodes.";
    };

    enableBacklightRepair = mkOption {
      type = types.bool;
      default = false;
      description = "Repair group writability on declared sysfs backlight brightness nodes.";
    };

    backlightGroup = mkOption {
      type = types.str;
      default = "video";
      description = "Group that should be able to write declared backlight brightness nodes.";
    };

    backlightNodeGlobs = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "/sys/class/backlight/*/brightness" ];
      description = "Sysfs brightness node globs repaired when backlight repair is enabled.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.runtimeUser != null && matches safeName cfg.runtimeUser;
        message = "services.korri.rocknixGuestDeviceAccess.runtimeUser must be a non-empty shell-safe user name when enabled.";
      }
      {
        assertion = lib.all (matches safeSubsystem) cfg.retriggerSubsystems;
        message = "services.korri.rocknixGuestDeviceAccess.retriggerSubsystems entries must be shell-safe subsystem names.";
      }
      {
        assertion = cfg.aclNodeGlobs != [ ] && lib.all (matches safeShellGlob) cfg.aclNodeGlobs;
        message = "services.korri.rocknixGuestDeviceAccess.aclNodeGlobs must contain shell-safe path globs when enabled.";
      }
      {
        assertion =
          !cfg.enableBacklightRepair
          || (cfg.backlightNodeGlobs != [ ] && lib.all (matches safeShellGlob) cfg.backlightNodeGlobs);
        message = "services.korri.rocknixGuestDeviceAccess.backlightNodeGlobs must contain shell-safe path globs when backlight repair is enabled.";
      }
      {
        assertion = matches safeName cfg.backlightGroup;
        message = "services.korri.rocknixGuestDeviceAccess.backlightGroup must be a non-empty shell-safe group.";
      }
      {
        assertion = cfg.fallbackAttempts > 0;
        message = "services.korri.rocknixGuestDeviceAccess.fallbackAttempts must be greater than zero.";
      }
    ];

    services.udev.extraRules = generatedUdevRules;

    systemd.services.korri-rocknix-seat-device-trigger = {
      description = "Apply Korri ROCKNIX guest device access metadata";
      serviceConfig = {
        Type = "oneshot";
        ExecStart = setupScript;
        RemainAfterExit = true;
      };
    };

    systemd.services.korri-rocknix-device-acl-fallback = {
      description = "Re-apply Korri ROCKNIX guest device ACLs";
      serviceConfig = {
        Type = "oneshot";
        ExecStart = fallbackScript;
        RemainAfterExit = true;
      };
    };
  };
}
