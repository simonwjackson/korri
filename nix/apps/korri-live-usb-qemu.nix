{
  pkgs,
  isoPackage,
  persistenceMode ? false,
}:

let
  appName = if persistenceMode then "korri-live-usb-qemu-persistence" else "korri-live-usb-qemu";
  modeName = if persistenceMode then "same-stick persistence topology" else "ephemeral ISO boot";
in
pkgs.writeShellApplication {
  name = appName;
  runtimeInputs = with pkgs; [
    coreutils
    gnugrep
    qemu
    util-linux
  ];
  text = ''
    set -euo pipefail

    iso_dir="${isoPackage}/iso"
    iso_path="$(find "$iso_dir" -maxdepth 1 -type f -name '*.iso' | head -n 1)"
    if [ -z "$iso_path" ]; then
      echo "No ISO found under $iso_dir" >&2
      exit 1
    fi

    evidence_root="''${KORRI_QEMU_EVIDENCE_DIR:-out/live-usb-smoke}"
    evidence_dir="$evidence_root/$(date -u +%Y%m%dT%H%M%SZ)-${appName}"
    mkdir -p "$evidence_dir"

    echo "Korri live USB QEMU validation (${modeName})"
    echo "ISO: $iso_path"
    echo "Evidence: $evidence_dir"

    qemu_accel=()
    if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
      qemu_accel=(-enable-kvm)
      echo "QEMU acceleration: KVM"
    else
      echo "QEMU acceleration: TCG (no writable /dev/kvm)"
    fi

    firmware_args=()
    ovmf_code="${pkgs.OVMF.fd}/FV/OVMF_CODE.fd"
    ovmf_vars="${pkgs.OVMF.fd}/FV/OVMF_VARS.fd"
    ovmf_combined="${pkgs.OVMF.fd}/FV/OVMF.fd"
    if [ -e "$ovmf_code" ] && [ -e "$ovmf_vars" ]; then
      vars_copy="$evidence_dir/OVMF_VARS.fd"
      cp "$ovmf_vars" "$vars_copy"
      chmod u+w "$vars_copy"
      firmware_args=(
        -drive "if=pflash,format=raw,readonly=on,file=$ovmf_code"
        -drive "if=pflash,format=raw,file=$vars_copy"
      )
      echo "Firmware: OVMF pflash"
    elif [ -e "$ovmf_combined" ]; then
      firmware_args=(-bios "$ovmf_combined")
      echo "Firmware: OVMF BIOS image"
    else
      echo "Could not find OVMF firmware files in ${pkgs.OVMF.fd}" >&2
      exit 1
    fi

    display="''${KORRI_QEMU_DISPLAY:-gtk}"
    serial_log="$evidence_dir/serial.log"

    if ${if persistenceMode then "true" else "false"}; then
      echo "Preparing same-stick persistence topology evidence." | tee "$evidence_dir/persistence-notes.txt"
      echo "This runner copies the hybrid ISO to one writable USB disk image, extends it, and adds a sibling KORRI-PERSIST partition on the same image." | tee -a "$evidence_dir/persistence-notes.txt"
      echo "It does not replace physical NUC acceptance; verify resolver behavior from the guest logs." | tee -a "$evidence_dir/persistence-notes.txt"
      usb_img="$evidence_dir/korri-live-usb-with-persist.img"
      cp "$iso_path" "$usb_img"
      chmod u+w "$usb_img"
      original_bytes="$(stat -c %s "$usb_img")"
      start_sector=$(((original_bytes + 511) / 512))
      truncate -s +"''${KORRI_QEMU_PERSIST_SIZE:-2G}" "$usb_img"
      printf 'start=%s, type=83\n' "$start_sector" | sfdisk --append "$usb_img" >/dev/null
      ${pkgs.e2fsprogs}/bin/mkfs.ext4 -F -L KORRI-PERSIST -E offset=$((start_sector * 512)) "$usb_img" >/dev/null
      extra_storage=(
        -drive "id=korriusb,if=none,format=raw,file=$usb_img"
        -device usb-ehci,id=ehci
        -device usb-storage,drive=korriusb,bootindex=0
      )
    else
      extra_storage=(-cdrom "$iso_path" -boot d)
    fi

    cat > "$evidence_dir/README.txt" <<EOF
    Korri live USB QEMU validation
    Mode: ${modeName}
    ISO: $iso_path
    Serial log: $serial_log

    This is an operator/manual validation aid. It is not a replacement for
    physical 8th-gen Intel NUC acceptance with Ethernet and wired controller.
    EOF

    exec qemu-system-x86_64 \
      "''${qemu_accel[@]}" \
      -m "''${KORRI_QEMU_MEMORY:-4096}" \
      -smp "''${KORRI_QEMU_CPUS:-4}" \
      "''${firmware_args[@]}" \
      "''${extra_storage[@]}" \
      -netdev user,id=net0 \
      -device virtio-net-pci,netdev=net0 \
      -serial "file:$serial_log" \
      -display "$display" \
      "$@"
  '';
}
