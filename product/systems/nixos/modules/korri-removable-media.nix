# Generic removable-media mounting for Korri appliances.
#
# Extracted from the SM8550 SD-card POC: mounts each visible removable
# filesystem partition by kernel instance (no UUID/label assumptions) behind
# the two-gate matcher in ./korri-removable-media-match.sh, and exposes every
# mount as a card-wins Korri config root by symlinking it into the
# `config-roots.d` signal directory that korrid watches.
#
# Platforms opt in explicitly (`services.korri.removableMedia.enable`); this
# module is intentionally NOT part of the korri-daemon aggregate.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.removableMedia;
  runtime = config.services.korri.runtime;

  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    optionalString
    types
    ;

  matcherScript = pkgs.writeShellScript "korri-removable-media-match" (
    builtins.readFile ./korri-removable-media-match.sh
  );

  # Shared unit environment so the scripts and the matcher read one contract.
  mediaEnv = {
    KORRI_REMOVABLE_MEDIA_ROOT = cfg.mediaRoot;
    KORRI_REMOVABLE_CONFIG_ROOTS_DIR = cfg.configRootsDir;
    KORRI_REMOVABLE_MATCH_MMC = if cfg.match.mmc then "1" else "0";
    KORRI_REMOVABLE_MATCH_USB = if cfg.match.usb then "1" else "0";
    KORRI_REMOVABLE_REQUIRED_SYSTEM_MOUNTS = lib.concatStringsSep " " cfg.requiredSystemMounts;
  }
  // lib.optionalAttrs (cfg.contentRoot != null) {
    KORRI_REMOVABLE_CONTENT_ROOT = cfg.contentRoot;
  };

  mountScript = pkgs.writeShellScript "korri-removable-media-mount" ''
    set -eu

    name="$1"
    dev="/dev/$name"
    media_root="''${KORRI_REMOVABLE_MEDIA_ROOT:-${cfg.mediaRoot}}"
    config_roots_dir="''${KORRI_REMOVABLE_CONFIG_ROOTS_DIR:-${cfg.configRootsDir}}"

    if [ ! -b "$dev" ]; then
      echo "korri-removable-media-mount: $dev is not a block device; skipping" >&2
      exit 0
    fi

    fs_type="$(${pkgs.util-linux}/bin/blkid -o value -s TYPE "$dev" 2>/dev/null || true)"
    if [ -z "$fs_type" ]; then
      echo "korri-removable-media-mount: $dev has no filesystem type; skipping" >&2
      exit 0
    fi

    # Filesystem-type allowlist: unrecognized types (btrfs subvolume layouts,
    # fuse.*, autofs) are skipped, not mounted.
    fs_allowed=0
    for allowed in ${lib.escapeShellArgs cfg.fsTypes}; do
      if [ "$fs_type" = "$allowed" ]; then
        fs_allowed=1
        break
      fi
    done
    if [ "$fs_allowed" != "1" ]; then
      echo "korri-removable-media-mount: $dev filesystem '$fs_type' is not allowlisted; skipping" >&2
      exit 0
    fi

    # Two-gate matcher: positive removable gate + runtime system-disk
    # deny-list. Reject and fail-safe abort both skip the mount. On accept it
    # prints the sanitized filesystem UUID — the media id that names the
    # mountpoint and config-root entry, so the same card lands on the same
    # path regardless of which slot or port it was inserted into.
    if ! media_id="$(${matcherScript} "$dev")"; then
      echo "korri-removable-media-mount: matcher refused $dev; skipping" >&2
      exit 0
    fi
    mountpoint="$media_root/$media_id"

    uid="$(${pkgs.coreutils}/bin/id -u ${runtime.user})"
    gid="$(${pkgs.coreutils}/bin/id -g ${runtime.user})"

    ${pkgs.coreutils}/bin/mkdir -p "$media_root" "$mountpoint"
    ${optionalString (cfg.contentRoot != null) ''
      content_root="''${KORRI_REMOVABLE_CONTENT_ROOT:-${cfg.contentRoot}}"
      ${pkgs.coreutils}/bin/mkdir -p "$(${pkgs.coreutils}/bin/dirname "$content_root")"
      if [ ! -e "$content_root" ]; then
        ${pkgs.coreutils}/bin/ln -s "$media_root" "$content_root"
      fi
    ''}
    ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} \
      "$media_root" \
      "$mountpoint" \
      2>/dev/null || true

    # Use mountpoint(1) so we only short-circuit when the exact target is a
    # mount, not when a parent directory of the target is mounted (e.g. /run).
    if ${pkgs.util-linux}/bin/mountpoint -q "$mountpoint"; then
      # Same media already mounted (idempotent re-trigger): converge the
      # config-root signal. A *different* device on the same id is a cloned
      # card; aliasing two physical media on one mountpoint would silently
      # mix their contents, so the clone is skipped.
      current_source="$(${pkgs.util-linux}/bin/findmnt -rn -o SOURCE --target "$mountpoint" | ${pkgs.coreutils}/bin/head -n 1)"
      if [ "$current_source" = "$dev" ]; then
        ${pkgs.coreutils}/bin/ln -sfn "$mountpoint" "$config_roots_dir/$media_id"
        exit 0
      fi
      echo "korri-removable-media-mount: $mountpoint already mounted from $current_source; skipping clone $dev" >&2
      exit 0
    fi
    # Some container/nspawn layouts pre-bind block-device nodes from the host
    # under /dev itself (e.g. `devtmpfs on /dev/mmcblk0p1`). Don't treat the
    # device node bind as the filesystem mount we want.
    if ${pkgs.util-linux}/bin/findmnt -rn --source "$dev" --types "$fs_type" >/dev/null; then
      exit 0
    fi

    # TOCTOU guard: the device node must still carry the identity the matcher
    # checked immediately before we hand it to mount(8).
    actual_uuid="$(${pkgs.util-linux}/bin/blkid -o value -s UUID "$dev" 2>/dev/null || true)"
    if [ "$actual_uuid" != "$media_id" ]; then
      echo "korri-removable-media-mount: $dev identity changed before mount; skipping" >&2
      exit 0
    fi

    case "$fs_type" in
      vfat|exfat|ntfs|ntfs3)
        mount_options="rw,noexec,nosuid,nodev,relatime,uid=$uid,gid=$gid,umask=022"
        ;;
      *)
        mount_options="rw,noexec,nosuid,nodev,relatime"
        ;;
    esac

    ${pkgs.util-linux}/bin/mount -t "$fs_type" -o "$mount_options" "$dev" "$mountpoint"

    # Signal korrid: each mounted volume contributes one card-wins config
    # root through the stable config-roots.d directory, named by media id so
    # the root identity is stable across slots and re-inserts.
    ${pkgs.coreutils}/bin/ln -sfn "$mountpoint" "$config_roots_dir/$media_id"
  '';

  unmountScript = pkgs.writeShellScript "korri-removable-media-unmount" ''
    set -eu

    name="$1"
    dev="/dev/$name"
    media_root="''${KORRI_REMOVABLE_MEDIA_ROOT:-${cfg.mediaRoot}}"
    config_roots_dir="''${KORRI_REMOVABLE_CONFIG_ROOTS_DIR:-${cfg.configRootsDir}}"

    # Mountpoints are named by media id, and on ACTION=remove the device
    # node is already gone (no blkid possible) — but its mount-table entries
    # survive until unmounted, so resolve the mountpoints from the table.
    ${pkgs.util-linux}/bin/findmnt -rn -o TARGET --source "$dev" 2>/dev/null \
      | while IFS= read -r target; do
          case "$target" in
            "$media_root"/*) ;;
            *) continue ;;
          esac
          media_id="$(${pkgs.coreutils}/bin/basename "$target")"
          # Remove the config-root signal first so korrid converges even when
          # the card was yanked and the lazy unmount lingers.
          ${pkgs.coreutils}/bin/rm -f "$config_roots_dir/$media_id"
          ${pkgs.util-linux}/bin/umount -l "$target" || true
          ${pkgs.coreutils}/bin/rmdir "$target" 2>/dev/null || true
        done
  '';

  coldplugScript = pkgs.writeShellScript "korri-removable-media-coldplug" ''
    set -eu

    start_candidate() {
      name="$1"
      dev="/dev/$name"
      [ -b "$dev" ] || return 0
      fs_type=$(${pkgs.util-linux}/bin/blkid -o value -s TYPE "$dev" 2>/dev/null || true)
      [ -n "$fs_type" ] || return 0
      ${pkgs.systemd}/bin/systemctl start --no-block "korri-removable-media-mount@$name.service" || true
    }

    ${optionalString cfg.match.mmc ''
      for sysdir in /sys/class/block/mmcblk*p*; do
        [ -d "$sysdir" ] || continue
        start_candidate "$(${pkgs.coreutils}/bin/basename "$sysdir")"
      done
    ''}
    ${optionalString cfg.match.usb ''
      for sysdir in /sys/class/block/sd*[0-9]; do
        [ -d "$sysdir" ] || continue
        start_candidate "$(${pkgs.coreutils}/bin/basename "$sysdir")"
      done
    ''}
  '';
in
{
  key = "korri-removable-media";

  options.services.korri.removableMedia = {
    enable = mkEnableOption "Korri removable-media mounting and config-root exposure";

    mediaRoot = mkOption {
      type = types.str;
      default = "/run/media/korri";
      description = ''
        Directory that removable filesystem partitions are mounted under,
        one mountpoint per media id (the partition's filesystem UUID), so
        the same media lands on the same path regardless of slot or
        insertion order. Media without a filesystem UUID is refused.
      '';
    };

    contentRoot = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/var/lib/korri/content/removable/cards";
      description = ''
        Optional stable content path symlinked to the media root so game
        content references survive across media events. Null disables the
        symlink.
      '';
    };

    configRootsDir = mkOption {
      type = types.str;
      default = "/run/korri/config-roots.d";
      description = ''
        Stable signal directory korrid watches for dynamic config roots.
        Mount units add one symlink per mounted volume; unmount removes it.
        Root-owned so the runtime user cannot inject roots.
      '';
    };

    match = {
      mmc = mkOption {
        type = types.bool;
        default = true;
        description = "Match SD/microSD partitions (mmcblk*p*).";
      };

      usb = mkOption {
        type = types.bool;
        default = false;
        description = "Match partitions whose parent disk has USB transport.";
      };
    };

    requiredSystemMounts = mkOption {
      type = types.listOf types.str;
      default = [ "/" ];
      example = [ "/iso" ];
      description = ''
        System mounts that must resolve into the runtime-derived system-disk
        deny-list before any removable mount is permitted (fail-safe). Set
        per platform to the block-backed mounts the running system depends
        on (e.g. `/iso` on the live USB, `/storage` on RockNix guests).
      '';
    };

    fsTypes = mkOption {
      type = types.listOf types.str;
      default = [
        "vfat"
        "exfat"
        "ntfs"
        "ntfs3"
        "ext4"
      ];
      description = "Filesystem types permitted on removable media (allowlist).";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = lib.hasPrefix "/" cfg.mediaRoot;
        message = "services.korri.removableMedia.mediaRoot must be an absolute path.";
      }
      {
        assertion = lib.hasPrefix "/" cfg.configRootsDir;
        message = "services.korri.removableMedia.configRootsDir must be an absolute path.";
      }
      {
        assertion = cfg.contentRoot == null || lib.hasPrefix "/" cfg.contentRoot;
        message = "services.korri.removableMedia.contentRoot must be null or an absolute path.";
      }
      {
        assertion = cfg.requiredSystemMounts != [ ];
        message = "services.korri.removableMedia.requiredSystemMounts must name at least one system mount (fail-safe deny-list assertion set).";
      }
      {
        assertion = cfg.match.mmc || cfg.match.usb;
        message = "services.korri.removableMedia needs at least one of match.mmc / match.usb enabled.";
      }
    ];

    services.udev.extraRules = ''
      # Swappable operator media, not durable internal storage. Mount each
      # visible removable filesystem partition by kernel instance so media do
      # not need stable labels or UUIDs and multi-slot devices can expose
      # more than one volume at once. The mount unit re-checks every
      # candidate with the two-gate matcher before touching it.
    ''
    + optionalString cfg.match.mmc ''
      ACTION=="add|change", SUBSYSTEM=="block", KERNEL=="mmcblk*p*", ENV{ID_FS_USAGE}=="filesystem", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-media-mount@%k.service"
      ACTION=="remove", SUBSYSTEM=="block", KERNEL=="mmcblk*p*", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-media-unmount@%k.service"
    ''
    + optionalString cfg.match.usb ''
      ACTION=="add|change", SUBSYSTEM=="block", KERNEL=="sd*[0-9]", ENV{ID_BUS}=="usb", ENV{ID_FS_USAGE}=="filesystem", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-media-mount@%k.service"
      ACTION=="remove", SUBSYSTEM=="block", KERNEL=="sd*[0-9]", ENV{ID_BUS}=="usb", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-media-unmount@%k.service"
    '';

    systemd.tmpfiles.rules = [
      "d ${cfg.mediaRoot} 0755 ${runtime.user} ${runtime.group} -"
      # Root-owned signal dir: the runtime user (korrid) can list and resolve
      # entries but cannot create or replace them.
      "d ${cfg.configRootsDir} 0750 root ${runtime.group} -"
    ]
    ++ lib.optionals (cfg.contentRoot != null) [
      "d ${builtins.dirOf cfg.contentRoot} 0750 ${runtime.user} ${runtime.group} -"
      "L+ ${cfg.contentRoot} - - - - ${cfg.mediaRoot}"
    ];

    systemd.services."korri-removable-media-mount@" = {
      description = "Mount Korri removable media partition %I";
      after = [ "systemd-udevd.service" ];
      # The matcher script resolves blkid/lsblk/findmnt from PATH so its
      # behavioral check can shadow them with a fake-binary rig.
      path = [
        pkgs.util-linux
        pkgs.coreutils
      ];
      environment = mediaEnv;
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${mountScript} %I";
      };
    };

    systemd.services."korri-removable-media-unmount@" = {
      description = "Unmount Korri removable media partition %I";
      after = [ "systemd-udevd.service" ];
      environment = mediaEnv;
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${unmountScript} %I";
      };
    };

    # Media already present at boot do not emit a fresh ACTION=add the udev
    # rules above can consume, so the per-partition SYSTEMD_WANTS handler
    # never fires. Enumerate visible candidate partitions once systemd has
    # started so coldplugged media mount without operator interaction.
    systemd.services.korri-removable-media-coldplug = {
      description = "Coldplug Korri removable media partitions";
      wantedBy = [ "multi-user.target" ];
      after = [
        "systemd-udevd.service"
        "systemd-tmpfiles-setup.service"
      ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = toString coldplugScript;
      };
    };
  };
}
