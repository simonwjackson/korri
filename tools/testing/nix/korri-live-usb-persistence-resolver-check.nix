{
  pkgs,
  resolverScript,
}:

pkgs.runCommand "korri-live-usb-persistence-resolver-check"
  {
    nativeBuildInputs = [
      pkgs.bash
      pkgs.coreutils
      pkgs.gawk
      pkgs.gnugrep
    ];
  }
  ''
    set -euo pipefail

    resolver=${resolverScript}
    failures=()

    fail() {
      failures+=("$1")
    }

    assert_file_contains() {
      local name="$1" file="$2" expected="$3"
      if ! grep -F -- "$expected" "$file" >/dev/null; then
        fail "$name: expected $file to contain '$expected'"
      fi
    }

    assert_file_not_contains() {
      local name="$1" file="$2" unexpected="$3"
      if grep -F -- "$unexpected" "$file" >/dev/null; then
        fail "$name: expected $file not to contain '$unexpected'"
      fi
    }

    make_rig() {
      local name="$1" artifact="$2" boot_source="$3" parent_device="$4" transport="$5" removable="$6" partitions="$7" mount_failures="''${8:-}" chown_fails="''${9:-0}"
      local dir="$TMPDIR/$name"
      local bin="$dir/bin"
      local parent_name="''${parent_device#/dev/}"
      parent_name="''${parent_name#/fake/}"
      mkdir -p "$bin" "$dir/state" "$dir/home"
      : > "$dir/mount.log"
      : > "$dir/chown.log"
      : > "$dir/umount.log"

      cat > "$bin/findmnt" <<EOF
    #!${pkgs.bash}/bin/bash
    printf '%s\n' '$boot_source'
    EOF
      cat > "$bin/readlink" <<'EOF'
    #!${pkgs.bash}/bin/bash
    if [ "$1" = "-f" ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi
    EOF
      cat > "$bin/lsblk" <<EOF
    #!${pkgs.bash}/bin/bash
    args="\$*"
    case "\$args" in
      *PKNAME*) printf '%s\n' '$parent_name' ;;
      *TRAN*) printf '%s\n' '$transport' ;;
      *RM*) printf '%s\n' '$removable' ;;
      *)
        for entry in $partitions; do
          device="\''${entry%%:*}"
          printf '%s part\n' "\$device"
        done
        ;;
    esac
    EOF
      cat > "$bin/blkid" <<EOF
    #!${pkgs.bash}/bin/bash
    for entry in $partitions; do
      device="\''${entry%%:*}"
      label="\''${entry#*:}"
      if [ "\$device" = "\''${@: -1}" ]; then printf '%s\n' "\$label"; exit 0; fi
    done
    exit 2
    EOF
      cat > "$bin/mountpoint" <<'EOF'
    #!${pkgs.bash}/bin/bash
    exit 1
    EOF
      cat > "$bin/mount" <<EOF
    #!${pkgs.bash}/bin/bash
    printf '%s\n' "\$*" >> '$dir/mount.log'
    for failed in $mount_failures; do
      for arg in "\$@"; do
        if [ "\$arg" = "\$failed" ]; then exit 32; fi
      done
    done
    exit 0
    EOF
      cat > "$bin/chown" <<EOF
    #!${pkgs.bash}/bin/bash
    printf '%s\n' "\$*" >> '$dir/chown.log'
    if [ '$chown_fails' = '1' ] && [ ! -f '$dir/chown-failed-once' ]; then
      touch '$dir/chown-failed-once'
      exit 33
    fi
    exit 0
    EOF
      cat > "$bin/umount" <<EOF
    #!${pkgs.bash}/bin/bash
    printf '%s\n' "\$*" >> '$dir/umount.log'
    exit 0
    EOF
      chmod +x "$bin"/*
      printf '%s\n' "$dir"
    }

    run_resolver() {
      local dir="$1" artifact="$2"
      set +e
      PATH="$dir/bin:${pkgs.coreutils}/bin:${pkgs.gawk}/bin:${pkgs.gnugrep}/bin:${pkgs.bash}/bin" \
      KORRI_LIVE_USB_PERSISTENCE_ROOT="$dir/state" \
      KORRI_LIVE_USB_BOOT_MOUNT="/iso" \
      KORRI_LIVE_USB_SKIP_BLOCK_DEVICE_CHECK="1" \
      KORRI_LIVE_USB_ARTIFACT="$artifact" \
      KORRI_LIVE_USB_RUNTIME_HOME="$dir/home" \
      KORRI_LIVE_USB_DEVICE_ID_TARGET="$dir/device-id" \
      KORRI_LIVE_USB_STATE_USER="korri" \
      KORRI_LIVE_USB_STATE_GROUP="korri" \
      ${pkgs.bash}/bin/bash "$resolver" > "$dir/stdout.log" 2> "$dir/stderr.log"
      local status=$?
      set -e
      printf '%s\n' "$status" > "$dir/status"
    }

    cleanup_rig() {
      chmod -R u+rwx "$1" 2>/dev/null || true
    }

    scenario_sibling_usb() {
      local name=sibling-usb
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST")
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed: $(cat "$dir/stderr.log")"
      assert_file_contains "$name" "$dir/mount.log" "-o nosuid,nodev /fake/sdb2 "
      [ -e "$dir/state/.korri-live-usb-persistent" ] || fail "$name: persistent marker missing"
      [ -d "$dir/state/product/home/.config/korri" ] || fail "$name: korri config state missing"
      [ -d "$dir/state/product/home/.cache/moonlight" ] || fail "$name: moonlight state missing"
      [ ! -e "$dir/state/home" ] || fail "$name: broad home unexpectedly exists"
      [ -L "$dir/home/.config/korri" ] || fail "$name: korri config link missing"
      [ "$(readlink "$dir/home/.config/korri")" = "$dir/state/product/home/.config/korri" ] || fail "$name: korri config link target wrong"
      [ -L "$dir/home/.cache/moonlight" ] || fail "$name: moonlight link missing"
      [ -s "$dir/device-id" ] || fail "$name: device id missing"
      assert_file_contains "$name" "$dir/chown.log" "korri:korri"
      cleanup_rig "$dir"
    }

    scenario_duplicate_labels() {
      local name=duplicate-labels
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST /fake/sdb3:KORRI-PERSIST")
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      assert_file_contains "$name" "$dir/mount.log" "tmpfs"
      assert_file_not_contains "$name" "$dir/mount.log" "/fake/sdb2"
      assert_file_not_contains "$name" "$dir/mount.log" "/fake/sdb3"
      assert_file_contains "$name" "$dir/stderr.log" "multiple"
      cleanup_rig "$dir"
    }

    scenario_lock_legacy_home() {
      local name=lock-legacy-home
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST")
      mkdir -p "$dir/state/home"
      echo old > "$dir/state/home/legacy"
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      [ "$(stat -c %a "$dir/state/home")" = 0 ] || fail "$name: legacy home was not locked"
      cleanup_rig "$dir"
    }

    scenario_lock_developer_namespace() {
      local name=lock-developer-namespace
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST")
      mkdir -p "$dir/state/developer/home"
      echo dev > "$dir/state/developer/home/sentinel"
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      [ "$(stat -c %a "$dir/state/developer")" = 0 ] || fail "$name: developer namespace was not locked"
      cleanup_rig "$dir"
    }

    scenario_refuse_symlinked_developer() {
      local name=refuse-symlinked-developer
      local dir
      dir=$(make_rig "$name" developer /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST")
      mkdir -p "$dir/state/developer"
      ln -s "$dir/home" "$dir/state/developer/home"
      run_resolver "$dir" developer
      [ "$(cat "$dir/status")" != 0 ] || fail "$name: resolver unexpectedly succeeded"
      assert_file_contains "$name" "$dir/stderr.log" "symlinked"
      cleanup_rig "$dir"
    }

    scenario_developer_broad_state() {
      local name=developer-broad-state
      local dir
      dir=$(make_rig "$name" developer /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST")
      run_resolver "$dir" developer
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      [ -e "$dir/state/.korri-live-usb-persistent" ] || fail "$name: persistent marker missing"
      [ -d "$dir/state/developer/home/.config" ] || fail "$name: developer config missing"
      [ -d "$dir/state/developer/home/.cache/moonlight" ] || fail "$name: developer moonlight cache missing"
      [ ! -e "$dir/state/product/home/.config/korri" ] || fail "$name: product state unexpectedly created"
      cleanup_rig "$dir"
    }

    scenario_developer_non_removable() {
      local name=developer-non-removable
      local dir
      dir=$(make_rig "$name" developer /fake/nvme0n1p1 /fake/nvme0n1 nvme 0 "/fake/nvme0n1p2:KORRI-PERSIST")
      run_resolver "$dir" developer
      [ "$(cat "$dir/status")" != 0 ] || fail "$name: resolver unexpectedly succeeded"
      assert_file_contains "$name" "$dir/stderr.log" "Developer"
      assert_file_not_contains "$name" "$dir/mount.log" "tmpfs"
      [ ! -e "$dir/state/.korri-live-usb-ephemeral" ] || fail "$name: ephemeral marker unexpectedly exists"
      cleanup_rig "$dir"
    }

    scenario_product_non_removable_tmpfs() {
      local name=product-non-removable-tmpfs
      local dir
      dir=$(make_rig "$name" product /fake/nvme0n1p1 /fake/nvme0n1 nvme 0 "/fake/nvme0n1p2:KORRI-PERSIST")
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      assert_file_contains "$name" "$dir/mount.log" "tmpfs"
      assert_file_not_contains "$name" "$dir/mount.log" "/fake/nvme0n1p2"
      [ -e "$dir/state/.korri-live-usb-ephemeral" ] || fail "$name: ephemeral marker missing"
      cleanup_rig "$dir"
    }

    scenario_chown_failure_tmpfs() {
      local name=chown-failure-tmpfs
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST" "" 1)
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      assert_file_contains "$name" "$dir/mount.log" "/fake/sdb2"
      assert_file_contains "$name" "$dir/umount.log" "$dir/state"
      assert_file_contains "$name" "$dir/mount.log" "tmpfs"
      [ -e "$dir/state/.korri-live-usb-ephemeral" ] || fail "$name: ephemeral marker missing"
      cleanup_rig "$dir"
    }

    scenario_mount_failure_tmpfs() {
      local name=mount-failure-tmpfs
      local dir
      dir=$(make_rig "$name" product /fake/sdb1 /fake/sdb usb 1 "/fake/sdb1:KORRI-ISO /fake/sdb2:KORRI-PERSIST" "/fake/sdb2")
      run_resolver "$dir" product
      [ "$(cat "$dir/status")" = 0 ] || fail "$name: resolver failed"
      assert_file_contains "$name" "$dir/mount.log" "/fake/sdb2"
      assert_file_contains "$name" "$dir/mount.log" "tmpfs"
      [ -e "$dir/state/.korri-live-usb-ephemeral" ] || fail "$name: ephemeral marker missing"
      cleanup_rig "$dir"
    }

    scenario_script_shape() {
      local name=script-shape
      grep -F "findmnt" "$resolver" >/dev/null || fail "$name: missing findmnt"
      grep -F "lsblk" "$resolver" >/dev/null || fail "$name: missing lsblk"
      grep -F "PKNAME" "$resolver" >/dev/null || fail "$name: missing PKNAME"
      grep -F "blkid" "$resolver" >/dev/null || fail "$name: missing blkid"
      grep -F "KORRI_LIVE_USB_BOOT_MOUNT" "$resolver" >/dev/null || fail "$name: missing boot mount env"
      if grep -F "/dev/disk/by-label" "$resolver" >/dev/null; then
        fail "$name: resolver must not use a generic by-label mount"
      fi
    }

    scenario_sibling_usb
    scenario_duplicate_labels
    scenario_lock_legacy_home
    scenario_lock_developer_namespace
    scenario_refuse_symlinked_developer
    scenario_developer_broad_state
    scenario_developer_non_removable
    scenario_product_non_removable_tmpfs
    scenario_chown_failure_tmpfs
    scenario_mount_failure_tmpfs
    scenario_script_shape

    if [ "''${#failures[@]}" -gt 0 ]; then
      printf 'Korri live USB resolver check failed:\n' >&2
      printf -- '- %s\n' "''${failures[@]}" >&2
      exit 1
    fi

    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri live USB persistence resolver invariants passed.
    EOF
  ''
