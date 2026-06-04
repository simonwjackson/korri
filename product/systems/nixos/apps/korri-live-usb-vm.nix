{ pkgs, vmSystem }:

let
  vm = vmSystem.config.system.build.vm;
  runnerName = "run-${vmSystem.config.system.name}-vm";
in
pkgs.writeShellApplication {
  name = "korri-live-usb-vm";
  text = ''
    set -euo pipefail

    echo "Korri live USB runtime VM"
    echo "VM runner: ${vm}/bin/${runnerName}"
    echo "Note: this direct VM validates the NixOS runtime composition, not ISO/UEFI/USB boot."
    exec ${vm}/bin/${runnerName} "$@"
  '';
}
