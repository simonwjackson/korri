{
  pkgs,
  imageLib,
  x86Platform,
}:

let
  fakeSway = pkgs.runCommand "korri-vm-fake-sway" { } ''
    mkdir -p "$out/bin"
    cat > "$out/bin/sway" <<'EOF'
    #!${pkgs.runtimeShell}
    set -euo pipefail

    config_file=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --config)
          config_file="''${2:-}"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done

    if [ -n "$config_file" ] && [ -f "$config_file" ]; then
      client_command="$(${pkgs.gawk}/bin/awk '/^exec --no-startup-id / { sub(/^exec --no-startup-id /, ""); print; exit }' "$config_file")"
      if [ -n "$client_command" ]; then
        ${pkgs.bash}/bin/bash -c "$client_command" &
      fi
    fi

    echo $$ > "$HOME/.korri-vm-fake-sway.pid"
    touch "$HOME/.korri-vm-fake-sway-started"
    exec ${pkgs.coreutils}/bin/sleep infinity
    EOF
    cat > "$out/bin/swaymsg" <<'EOF'
    #!${pkgs.runtimeShell}
    exit 0
    EOF
    chmod +x "$out/bin/sway" "$out/bin/swaymsg"
  '';

  markerClient = pkgs.writeShellScript "korri-vm-marker-client" ''
    touch "$HOME/.korri-vm-client-started"
  '';
in
pkgs.testers.runNixOSTest {
  name = "korri-live-usb-vm-smoke";

  nodes.kiosk =
    { lib, ... }:
    {
      imports = imageLib.mkLiveUsbKioskRuntimeModules {
        platformModules = [ x86Platform ];
        includeBase = false;
        modules = [
          {
            networking.hostName = "korri-live-usb-vm-smoke";
            services.korri.server.enable = lib.mkForce false;
            services.korri.kiosk = {
              client.command = "${markerClient}";
              sessionBus = {
                mode = "existing";
                address = "unix:path=/run/korri-vm-test-session-bus";
              };
              sway.package = fakeSway;
            };
            virtualisation = {
              cores = 2;
              diskSize = 2048;
              memorySize = 2048;
            };
          }
        ];
      };
    };

  testScript = ''
    start_all()
    kiosk.wait_for_unit("multi-user.target")
    kiosk.wait_for_unit("korri-live-usb-persistence.service")
    kiosk.wait_for_unit("korri-inputd.service")
    kiosk.wait_for_unit("korri-kiosk.service")
    kiosk.wait_until_succeeds("test -e /persist/korri-live-usb/.korri-live-usb-ephemeral")
    kiosk.wait_until_succeeds("test -e /persist/korri-live-usb/home/.korri-vm-fake-sway-started")
    kiosk.wait_until_succeeds("test -e /persist/korri-live-usb/home/.korri-vm-client-started")
    kiosk.succeed("systemctl is-active korri-kiosk.service")
    kiosk.succeed("systemctl is-active korri-inputd.service")
    kiosk.succeed("systemctl show -p Requires korri-kiosk.service | grep korri-live-usb-persistence.service")
    kiosk.succeed("systemctl show -p After korri-kiosk.service | grep korri-live-usb-persistence.service")
    kiosk.succeed("tr '\\0' '\\n' < /proc/$(cat /persist/korri-live-usb/home/.korri-vm-fake-sway.pid)/environ | grep KORRI_LIVE_USB_PERSISTENCE_ROOT=/persist/korri-live-usb")
    kiosk.succeed("tr '\\0' '\\n' < /proc/$(cat /persist/korri-live-usb/home/.korri-vm-fake-sway.pid)/environ | grep KORRI_MOONLIGHT_STATE_HOME=/persist/korri-live-usb/home/.cache/moonlight")
    kiosk.succeed("findmnt /persist/korri-live-usb | grep tmpfs")
    kiosk.succeed("test ! -e /persist/korri-live-usb/.korri-live-usb-persistent")
  '';
}
