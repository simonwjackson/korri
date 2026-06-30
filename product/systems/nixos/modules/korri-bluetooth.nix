{ lib, pkgs, ... }:

{
  key = "korri-bluetooth";

  # Korri OS devices should behave like handheld/desktop systems: Bluetooth is
  # available after boot so paired keyboards, controllers, headphones, and other
  # trusted devices can reconnect without a desktop applet or a manual
  # `bluetoothctl power on`. This is device-agnostic policy: no MAC addresses,
  # product names, or pairing assumptions live here.
  hardware.bluetooth = {
    enable = true;
    powerOnBoot = true;
  };

  systemd.services.korri-bluetooth-power-on = {
    description = "Power on Bluetooth controllers for Korri OS";
    wantedBy = [ "multi-user.target" ];
    wants = [ "bluetooth.service" ];
    after = [ "bluetooth.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    path = [
      pkgs.bluez
      pkgs.coreutils
      pkgs.util-linux
    ];
    script = ''
      set -eu

      # AutoEnable=true is BlueZ's normal policy, but some handheld/guest boots
      # leave the controller rfkill-blocked or present slightly after bluetoothd
      # starts. Make the OS policy explicit and harmlessly retry for late
      # controllers.
      rfkill unblock bluetooth 2>/dev/null || true

      i=0
      while [ "$i" -lt 20 ]; do
        controllers="$(bluetoothctl list 2>/dev/null || true)"
        if [ -n "$controllers" ]; then
          printf '%s\n' "$controllers" | while read -r kind address rest; do
            if [ "$kind" = "Controller" ] && [ -n "''${address:-}" ]; then
              bluetoothctl select "$address" >/dev/null 2>&1 || true
              bluetoothctl power on >/dev/null 2>&1 || true
            fi
          done
          exit 0
        fi
        i=$((i + 1))
        sleep 1
      done

      # No controller is not fatal: some Korri images may run on hardware with
      # no Bluetooth adapter attached. The service expresses desired policy when
      # a controller exists, not a hard hardware requirement.
      exit 0
    '';
  };
}
