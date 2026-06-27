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
    KORRI_REMOVABLE_CONFIG_ANCHORS = lib.concatStringsSep " " cfg.configAnchorDirs;
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
    config_anchor_dirs="''${KORRI_REMOVABLE_CONFIG_ANCHORS:-${lib.concatStringsSep " " cfg.configAnchorDirs}}"

    config_signal_suffix() {
      local anchor="$1"
      anchor="''${anchor//./dot-}"
      anchor="''${anchor//_/-}"
      printf '%s' "$anchor"
    }

    publish_config_roots() {
      local mountpoint="$1"
      local media_id="$2"
      local entry anchor anchor_dir suffix

      # Remove the pre-anchor signal from older deployments plus any stale
      # anchor signals for this media id before publishing the current set.
      ${pkgs.coreutils}/bin/rm -f "$config_roots_dir/$media_id"
      for entry in "$config_roots_dir/$media_id"-*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        ${pkgs.coreutils}/bin/rm -f "$entry"
      done

      for anchor in $config_anchor_dirs; do
        anchor_dir="$mountpoint/$anchor"
        [ -d "$anchor_dir" ] || continue
        suffix="$(config_signal_suffix "$anchor")"
        ${pkgs.coreutils}/bin/ln -sfn "$anchor_dir" "$config_roots_dir/$media_id-$suffix"
      done
    }

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
        publish_config_roots "$mountpoint" "$media_id"
        exit 0
      fi
      if [ -z "$current_source" ]; then
        # The mount vanished between the mountpoint(1) check and findmnt
        # (card yanked mid-trigger). Do nothing; the remove event converges.
        echo "korri-removable-media-mount: $mountpoint disappeared while checking; skipping" >&2
        exit 0
      fi
      echo "korri-removable-media-mount: $mountpoint already mounted from $current_source; skipping clone $dev" >&2
      exit 0
    fi
    # Note: a card mounted under a pre-media-id path (old kernel-name layout,
    # in-place activation) is caught by the findmnt source guard below and
    # left untouched without a config-root signal until it is re-inserted or
    # the system reboots.
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

    # Signal korrid: each mounted volume contributes only explicit, small
    # config anchors through the stable config-roots.d directory. The media
    # root itself is content, not a config root, so large ROM trees are never
    # recursively walked just because the card is mounted.
    publish_config_roots "$mountpoint" "$media_id"
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
          # Mirror the matcher's id posture: never act on dot-leading or
          # empty names, so a degenerate mount-table target (e.g. a lexical
          # "$media_root/.." form) cannot reach umount/rm outside our scope.
          case "$media_id" in
            "" | .*)
              echo "korri-removable-media-unmount: skipping unexpected mount target $target" >&2
              continue
              ;;
          esac
          # Remove config-root signals first so korrid converges even when
          # the card was yanked and the lazy unmount lingers. Remove both the
          # legacy whole-media signal and anchor-specific signals.
          ${pkgs.coreutils}/bin/rm -f "$config_roots_dir/$media_id"
          for entry in "$config_roots_dir/$media_id"-*; do
            [ -e "$entry" ] || [ -L "$entry" ] || continue
            ${pkgs.coreutils}/bin/rm -f "$entry"
          done
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
      readOnly = true;
      default = "/run/media/korri";
      description = ''
        Directory that removable filesystem partitions are mounted under,
        one mountpoint per media id (the partition's filesystem UUID), so
        the same media lands on the same path regardless of slot or
        insertion order. Media without a filesystem UUID is refused.

        Read-only by design: card config fragments reference their own
        content by absolute path, and those paths are resolved on whatever
        Korri device the media is inserted into — the mount prefix is a
        cross-device contract, not a per-platform preference. Platform
        hardware posture belongs in `match`, `requiredSystemMounts`, and
        `fsTypes`.
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
      readOnly = true;
      default = "/run/korri/config-roots.d";
      description = ''
        Stable signal directory korrid watches for dynamic config roots.
        Mount units add one symlink per mounted config anchor; unmount removes
        it. Root-owned so the runtime user cannot inject roots. Read-only by
        design: korrid, sessiond, and the daemon module all share this
        path as one host contract.
      '';
    };

    configAnchorDirs = mkOption {
      type = types.listOf types.str;
      default = [ ".korri" ];
      example = [
        ".korri"
        "korri-config"
      ];
      description = ''
        Immediate child directories on a mounted removable volume that are
        published as Korri config roots. Defaults are intentionally hidden and
        config-specific so ordinary card content trees (ROMs, media, broad
        `korri` folders) are not recursively scanned. Broader names may be
        added by an operator, but each name must be a single safe path segment.
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
        assertion = cfg.configAnchorDirs != [ ];
        message = "services.korri.removableMedia.configAnchorDirs must name at least one config anchor directory.";
      }
      {
        assertion =
          let
            validAnchor = name:
              name != ""
              && name != "."
              && name != ".."
              && !(lib.hasInfix "/" name)
              && builtins.match "[-._A-Za-z0-9]+" name != null;
          in
          lib.all validAnchor cfg.configAnchorDirs;
        message = "services.korri.removableMedia.configAnchorDirs entries must be safe single path segments.";
      }
      {
        assertion =
          let
            suffixes = map (lib.replaceStrings [ "." "_" ] [ "dot-" "-" ]) cfg.configAnchorDirs;
          in
          builtins.length suffixes == builtins.length (lib.unique suffixes);
        message = "services.korri.removableMedia.configAnchorDirs entries must not collide after signal-name sanitization.";
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

    # The foreground-session supervisor spawns games under ProtectSystem=strict;
    # children inherit its read-only view. Mounted cards must stay writable for
    # launched apps (emulator save data lives on the card next to the content —
    # validated on bandai 2026-06-11: Ryujinx aborted in LibHac save-indexer
    # commit with EROFS until mediaRoot joined sessiond's ReadWritePaths).
    systemd.user.services.korri-sessiond =
      lib.mkIf (config.services.korri.sessiond.enable or false) {
        serviceConfig.ReadWritePaths = [ cfg.mediaRoot ];
      };

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
