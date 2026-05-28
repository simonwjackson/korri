{
  pkgs,
  imageLib,
  x86Platform,
}:

let
  # Stub sway. The kiosk renderer is no longer launched from the Sway
  # config — sessiond owns Electrobun launch — so this stub no longer
  # needs to parse `exec --no-startup-id` lines. It records its own
  # startup and then sleeps forever, mimicking a long-running
  # compositor process.
  fakeSway = pkgs.runCommand "korri-vm-fake-sway" { } ''
    mkdir -p "$out/bin"
    cat > "$out/bin/sway" <<'EOF'
    #!${pkgs.runtimeShell}
    set -euo pipefail
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

  # Stand-in for the real korri-desktop client package. Sessiond's
  # renderer-launch path resolves the binary by the hardcoded name
  # `korri-desktop-device` (see DEFAULT_ELECTROBUN_EXECUTABLE in
  # tools/device/sessiond-electrobun.ts) and asserts the resolved
  # path lives under /nix/store, so a writeShellApplication with the
  # right binary name satisfies both shapes.
  markerClientPackage = pkgs.writeShellApplication {
    name = "korri-desktop-device";
    text = ''
      touch "$HOME/.korri-vm-client-started"
      exec ${pkgs.coreutils}/bin/sleep infinity
    '';
  };
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
            services.korri.compositor = {
              sessionBus = {
                mode = "existing";
                address = "unix:path=/run/korri-vm-test-session-bus";
              };
              sway.package = fakeSway;
            };
            # Sessiond's renderer is now the kiosk client; substitute
            # the marker package so the in-process runner resolves
            # `korri-desktop-device` to a Nix-store path that touches
            # the marker file the test checks for.
            services.korri.client.package = lib.mkForce markerClientPackage;
            # Live-USB launches Sway via greetd, not via
            # korri-compositor.service. Drop sessiond's wants/after
            # ordering against korri-compositor so it doesn't try to
            # pull the systemd-managed compositor into the activation
            # graph (greetd already owns the live Sway).
            systemd.services.korri-sessiond = {
              wants = lib.mkForce [ ];
              after = lib.mkForce [
                "network.target"
                "greetd.service"
              ];
              requires = lib.mkForce [ ];
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
    kiosk.wait_for_unit("greetd.service")
    kiosk.wait_for_unit("korri-sessiond.service")
    kiosk.wait_until_succeeds("test -e /persist/korri-live-usb/.korri-live-usb-ephemeral")
    kiosk.wait_until_succeeds("test -e /home/korri/.korri-vm-fake-sway-started")
    kiosk.wait_until_succeeds("test -e /home/korri/.korri-vm-client-started")
    kiosk.succeed("systemctl is-active greetd.service")
    kiosk.succeed("systemctl is-active korri-inputd.service")
    kiosk.succeed("systemctl show -p Requires greetd.service | grep korri-live-usb-persistence.service")
    kiosk.succeed("systemctl show -p After greetd.service | grep korri-live-usb-persistence.service")
    kiosk.succeed("tr '\\0' '\\n' < /proc/$(cat /home/korri/.korri-vm-fake-sway.pid)/environ | grep KORRI_LIVE_USB_PERSISTENCE_ROOT=/persist/korri-live-usb")
    kiosk.succeed("tr '\\0' '\\n' < /proc/$(cat /home/korri/.korri-vm-fake-sway.pid)/environ | grep KORRI_LIVE_USB_ARTIFACT=product")
    kiosk.succeed("tr '\\0' '\\n' < /proc/$(cat /home/korri/.korri-vm-fake-sway.pid)/environ | grep KORRI_MOONLIGHT_STATE_HOME=/home/korri/.cache/moonlight")
    kiosk.succeed("findmnt /persist/korri-live-usb | grep tmpfs")
    kiosk.succeed("test ! -e /persist/korri-live-usb/.korri-live-usb-persistent")
  '';
}
