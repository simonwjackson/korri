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

  # Device node entries are shell globs by design, so do not quote them here:
  # quoting would turn `/dev/dri/card*` into a literal string and skip existing
  # host-bound nodes. Option assertions below keep entries single-line.
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
    ${aclLoop}
    ${backlightRepairLoop}
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

  generatedUdevRules = drmSeatRule + inputUdevAclRule;
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
      default = [
        "drm"
        "input"
        "sound"
      ];
      description = "Guest udev subsystems to re-trigger before direct ACL repair.";
    };

    aclNodeGlobs = mkOption {
      type = types.listOf types.str;
      default = [
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
      default = [ "/sys/class/backlight/*/brightness" ];
      description = "Sysfs brightness node globs repaired when backlight repair is enabled.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion =
          cfg.runtimeUser != null && cfg.runtimeUser != "" && !(lib.hasInfix "\n" cfg.runtimeUser);
        message = "services.korri.rocknixGuestDeviceAccess.runtimeUser must be a non-empty single-line user when enabled.";
      }
      {
        assertion = lib.all (value: value != "" && !(lib.hasInfix "\n" value)) cfg.retriggerSubsystems;
        message = "services.korri.rocknixGuestDeviceAccess.retriggerSubsystems entries must be non-empty single-line values.";
      }
      {
        assertion =
          cfg.aclNodeGlobs != [ ]
          && lib.all (value: value != "" && !(lib.hasInfix "\n" value)) cfg.aclNodeGlobs;
        message = "services.korri.rocknixGuestDeviceAccess.aclNodeGlobs must contain non-empty single-line globs when enabled.";
      }
      {
        assertion =
          !cfg.enableBacklightRepair
          || (
            cfg.backlightNodeGlobs != [ ]
            && lib.all (value: value != "" && !(lib.hasInfix "\n" value)) cfg.backlightNodeGlobs
          );
        message = "services.korri.rocknixGuestDeviceAccess.backlightNodeGlobs must contain non-empty single-line globs when backlight repair is enabled.";
      }
      {
        assertion = cfg.backlightGroup != "" && !(lib.hasInfix "\n" cfg.backlightGroup);
        message = "services.korri.rocknixGuestDeviceAccess.backlightGroup must be a non-empty single-line group.";
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
