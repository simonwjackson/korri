# Behavioral check for the Korri removable-media two-gate matcher.
#
# Runs the standalone matcher script against fake findmnt/lsblk/blkid
# binaries so the positive removable gate, the runtime system-disk
# deny-list, the fail-safe abort paths, and the TOCTOU identity guard are
# proven as behavior — not just as script text.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-removable-media-matcher --no-link
{
  pkgs,
  matcherScript,
}:

pkgs.runCommand "korri-removable-media-matcher-check"
  {
    nativeBuildInputs = [
      pkgs.bash
      pkgs.coreutils
      pkgs.gnugrep
    ];
  }
  ''
    set -euo pipefail

    matcher=${matcherScript}
    failures=()

    fail() {
      failures+=("$1")
    }

    # make_rig <name> <sysfs_map> <tran_map> <uuid_map> <mounts> [uuid_flip]
    #   sysfs_map: space-separated `dev=parent` entries; builds a fake
    #     /sys/class/block tree (entry -> devices/block/<parent>/<name>, or
    #     devices/block/<name> when parent equals the name, i.e. whole disk).
    #     Devices absent from the map have no sysfs entry (resolution fails).
    #   tran_map / uuid_map: space-separated `dev=value` entries
    #   mounts: newline-separated `TARGET SOURCE` lines (findmnt -rn output)
    #   uuid_flip: when 1, blkid reports a different UUID on the second call
    make_rig() {
      local name="$1" sysfs_map="$2" tran_map="$3" uuid_map="$4" mounts="$5" uuid_flip="''${6:-0}"
      local dir="$TMPDIR/$name"
      local bin="$dir/bin"
      mkdir -p "$bin" "$dir/class-block"

      printf '%s\n' "$mounts" > "$dir/mounts.tab"

      local entry devpath devname parent
      for entry in $sysfs_map; do
        devpath="''${entry%%=*}"
        devname="''${devpath##*/}"
        parent="''${entry#*=}"
        if [ "$parent" = "$devname" ]; then
          mkdir -p "$dir/devices/block/$devname"
          ln -sfn "$dir/devices/block/$devname" "$dir/class-block/$devname"
        else
          mkdir -p "$dir/devices/block/$parent/$devname"
          ln -sfn "$dir/devices/block/$parent/$devname" "$dir/class-block/$devname"
        fi
      done

      cat > "$bin/findmnt" <<EOF
    #!${pkgs.bash}/bin/bash
    cat '$dir/mounts.tab'
    EOF

      cat > "$bin/lsblk" <<EOF
    #!${pkgs.bash}/bin/bash
    args="\$*"
    device="\''${@: -1}"
    lookup() {
      local map="\$1" entry
      for entry in \$map; do
        if [ "\''${entry%%=*}" = "\$device" ]; then
          printf '%s\n' "\''${entry#*=}"
          return 0
        fi
      done
      return 0
    }
    case "\$args" in
      *TRAN*) lookup '$tran_map' ;;
      *) exit 64 ;;
    esac
    EOF

      cat > "$bin/blkid" <<EOF
    #!${pkgs.bash}/bin/bash
    device="\''${@: -1}"
    count_file='$dir/blkid-count'
    count=0
    if [ -f "\$count_file" ]; then count=\$(cat "\$count_file"); fi
    count=\$((count + 1))
    printf '%s\n' "\$count" > "\$count_file"
    for entry in $uuid_map; do
      if [ "\''${entry%%=*}" = "\$device" ]; then
        uuid="\''${entry#*=}"
        if [ '$uuid_flip' = '1' ] && [ "\$count" -gt 1 ]; then
          uuid="\$uuid-recycled"
        fi
        printf '%s\n' "\$uuid"
        exit 0
      fi
    done
    exit 2
    EOF

      chmod +x "$bin"/*
      printf '%s\n' "$dir"
    }

    # run_matcher <rig_dir> <dev> <match_mmc> <match_usb> <required_mounts>
    run_matcher() {
      local dir="$1" dev="$2" match_mmc="$3" match_usb="$4" required="$5"
      set +e
      PATH="$dir/bin:${pkgs.coreutils}/bin:${pkgs.gnugrep}/bin:${pkgs.bash}/bin" \
      KORRI_REMOVABLE_MATCH_MMC="$match_mmc" \
      KORRI_REMOVABLE_MATCH_USB="$match_usb" \
      KORRI_REMOVABLE_REQUIRED_SYSTEM_MOUNTS="$required" \
      KORRI_REMOVABLE_SYSFS_BLOCK_ROOT="$dir/class-block" \
      KORRI_REMOVABLE_SKIP_BLOCK_DEVICE_CHECK="1" \
      ${pkgs.bash}/bin/bash "$matcher" "$dev" > "$dir/stdout.log" 2> "$dir/stderr.log"
      printf '%s\n' "$?" > "$dir/status"
      set -e
    }

    expect_status() {
      local name="$1" dir="$2" expected="$3"
      local actual
      actual="$(cat "$dir/status")"
      if [ "$actual" != "$expected" ]; then
        fail "$name: expected exit $expected, got $actual (stderr: $(cat "$dir/stderr.log"))"
      fi
    }

    expect_stderr_contains() {
      local name="$1" dir="$2" needle="$3"
      if ! grep -F -- "$needle" "$dir/stderr.log" >/dev/null; then
        fail "$name: expected stderr to contain '$needle' (got: $(cat "$dir/stderr.log"))"
      fi
    }

    # --- happy paths --------------------------------------------------------

    scenario_usb_accepted() {
      local name=usb-accepted dir
      dir=$(make_rig "$name" \
        "/dev/sdb1=sdb /dev/nvme0n1p2=nvme0n1" \
        "/dev/sdb=usb" \
        "/dev/sdb1=AAAA-1111" \
        "/ /dev/nvme0n1p2")
      run_matcher "$dir" /dev/sdb1 0 1 "/"
      expect_status "$name" "$dir" 0
      [ "$(cat "$dir/stdout.log")" = "AAAA-1111" ] || fail "$name: expected accepted UUID on stdout"
    }

    scenario_mmc_accepted() {
      local name=mmc-accepted dir
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1 /dev/sda2=sda" \
        "" \
        "/dev/mmcblk1p1=BBBB-2222" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 0
    }

    scenario_second_usb_stick_accepted() {
      local name=second-usb-stick-accepted dir
      # Live-USB shape: the boot stick (sdb) backs /iso; a second stick (sdc)
      # backs no system mount and must be accepted.
      dir=$(make_rig "$name" \
        "/dev/sdb1=sdb /dev/sdc1=sdc" \
        "/dev/sdb=usb /dev/sdc=usb" \
        "/dev/sdc1=CCCC-3333" \
        "/iso /dev/sdb1")
      run_matcher "$dir" /dev/sdc1 0 1 "/iso"
      expect_status "$name" "$dir" 0
    }

    scenario_bind_mount_source_suffix() {
      local name=bind-mount-source-suffix dir
      # Bind mounts report `/dev/sda19[/subdir]` and — in the nspawn guest —
      # the /dev/sda* node does not even exist; only the sysfs block entry
      # does. The deny-list must still resolve the parent disk from sysfs
      # (the exact bandai regression that fail-safed all card mounts).
      dir=$(make_rig "$name" \
        "/dev/sda19=sda /dev/mmcblk1p1=mmcblk1" \
        "" \
        "/dev/mmcblk1p1=DDDD-4444" \
        "/storage /dev/sda19[/korri]")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/storage"
      expect_status "$name" "$dir" 0
    }

    # --- deny-list rejections -------------------------------------------------

    scenario_boot_emmc_denied() {
      local name=boot-emmc-denied dir
      dir=$(make_rig "$name" \
        "/dev/mmcblk0p1=mmcblk0 /dev/mmcblk0p2=mmcblk0" \
        "" \
        "/dev/mmcblk0p1=EEEE-5555" \
        "/ /dev/mmcblk0p2")
      run_matcher "$dir" /dev/mmcblk0p1 1 0 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "backs a system mount"
    }

    scenario_boot_stick_denied() {
      local name=boot-stick-denied dir
      # The live-USB boot stick is USB and removable, but it backs /iso: the
      # deny-list is the only discriminator and must reject it.
      dir=$(make_rig "$name" \
        "/dev/sdb1=sdb /dev/sdb2=sdb" \
        "/dev/sdb=usb" \
        "/dev/sdb2=FFFF-6666" \
        "/iso /dev/sdb1")
      run_matcher "$dir" /dev/sdb2 0 1 "/iso"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "backs a system mount"
    }

    # --- positive-gate rejections ---------------------------------------------

    scenario_internal_nvme_rejected() {
      local name=internal-nvme-rejected dir
      dir=$(make_rig "$name" \
        "/dev/nvme0n1p3=nvme0n1 /dev/nvme0n1p2=nvme0n1" \
        "/dev/nvme0n1=nvme" \
        "/dev/nvme0n1p3=GGGG-7777" \
        "/ /dev/nvme0n1p2")
      run_matcher "$dir" /dev/nvme0n1p3 1 1 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "not operator-swappable"
    }

    scenario_empty_transport_rejected() {
      local name=empty-transport-rejected dir
      dir=$(make_rig "$name" \
        "/dev/vda1=vda /dev/vda2=vda" \
        "" \
        "/dev/vda1=HHHH-8888" \
        "/ /dev/vda2")
      run_matcher "$dir" /dev/vda1 0 1 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "not operator-swappable"
    }

    scenario_usb_gate_off_rejected() {
      local name=usb-gate-off-rejected dir
      dir=$(make_rig "$name" \
        "/dev/sdb1=sdb /dev/sda2=sda" \
        "/dev/sdb=usb" \
        "/dev/sdb1=IIII-9999" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/sdb1 1 0 "/"
      expect_status "$name" "$dir" 1
    }

    # --- fail-safe aborts -------------------------------------------------------

    scenario_unresolvable_mount_source_aborts() {
      local name=unresolvable-mount-source-aborts dir
      # The mount source /dev/sda2 has no sysfs block entry at all — parent
      # resolution fails and the matcher must abort, never fail open.
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1" \
        "" \
        "/dev/mmcblk1p1=JJJJ-0000" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 2
      expect_stderr_contains "$name" "$dir" "fail-safe"
    }

    scenario_empty_deny_list_aborts() {
      local name=empty-deny-list-aborts dir
      # Only non-block-backed mounts visible: resolution succeeds but the
      # derived set is empty — never fail open.
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1" \
        "" \
        "/dev/mmcblk1p1=KKKK-1010" \
        "/ overlay")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 2
      expect_stderr_contains "$name" "$dir" "deny-list is empty"
    }

    scenario_missing_required_mount_aborts() {
      local name=missing-required-mount-aborts dir
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1 /dev/sda2=sda" \
        "" \
        "/dev/mmcblk1p1=LLLL-2020" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/iso"
      expect_status "$name" "$dir" 2
      expect_stderr_contains "$name" "$dir" "required system mount /iso"
    }

    # --- media identity requirement ---------------------------------------------

    scenario_no_uuid_rejected() {
      local name=no-uuid-rejected dir
      # Media identity (fs UUID) is required: it names the stable mountpoint
      # and makes the TOCTOU guard non-vacuous. UUID-less media is refused.
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1 /dev/sda2=sda" \
        "" \
        "" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "no filesystem UUID"
    }

    scenario_malicious_uuid_rejected() {
      local name=malicious-uuid-rejected dir
      # The UUID comes from attacker-controlled media headers and becomes a
      # path component; anything outside the safe charset is refused.
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1 /dev/sda2=sda" \
        "" \
        "/dev/mmcblk1p1=../evil" \
        "/ /dev/sda2")
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "unsafe filesystem UUID"
    }

    # --- TOCTOU guard ------------------------------------------------------------

    scenario_recycled_device_rejected() {
      local name=recycled-device-rejected dir
      dir=$(make_rig "$name" \
        "/dev/mmcblk1p1=mmcblk1 /dev/sda2=sda" \
        "" \
        "/dev/mmcblk1p1=MMMM-3030" \
        "/ /dev/sda2" \
        1)
      run_matcher "$dir" /dev/mmcblk1p1 1 0 "/"
      expect_status "$name" "$dir" 1
      expect_stderr_contains "$name" "$dir" "identity changed"
    }

    scenario_usb_accepted
    scenario_mmc_accepted
    scenario_second_usb_stick_accepted
    scenario_bind_mount_source_suffix
    scenario_boot_emmc_denied
    scenario_boot_stick_denied
    scenario_internal_nvme_rejected
    scenario_empty_transport_rejected
    scenario_usb_gate_off_rejected
    scenario_unresolvable_mount_source_aborts
    scenario_empty_deny_list_aborts
    scenario_missing_required_mount_aborts
    scenario_no_uuid_rejected
    scenario_malicious_uuid_rejected
    scenario_recycled_device_rejected

    if [ "''${#failures[@]}" -gt 0 ]; then
      printf 'Korri removable-media matcher check failed:\n' >&2
      printf -- '- %s\n' "''${failures[@]}" >&2
      exit 1
    fi

    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri removable-media matcher invariants passed.
    EOF
  ''
