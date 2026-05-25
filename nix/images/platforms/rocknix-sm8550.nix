{
  korri,
  nix-on-rocks,
  deviceProfile,
}:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  targetSystem = pkgs.stdenv.hostPlatform.system;
  substratePackages = nix-on-rocks.packages.${targetSystem};
  sm8550 = config.rocknix.sm8550;
  inputplumberPackage = pkgs.runCommand "korri-rocknix-inputplumber-xb360" {
    meta.mainProgram = "inputplumber";
  } ''
    cp -a ${substratePackages.inputplumber} $out
    chmod -R u+w $out
    substituteInPlace $out/share/inputplumber/devices/02-ayn-controller.yaml \
      --replace-fail "  - xbox-series" "  - xb360"
  '';
  # TEMPORARY Sobo/SM8550 workaround — remove this once nix-on-rocks provides
  # either a healthy kiosk portal stack or a kiosk-safe Gamescope launcher.
  #
  # Why this exists: the current guest advertises /run/user/0/bus with an
  # activatable but unhealthy xdg-desktop-portal. Gamescope's Wayland startup
  # asks the Settings portal for cursor/theme values and blocks before it
  # creates a Sway surface or spawns the child. Pointing Gamescope at a
  # fail-fast DBus address keeps Gamescope working while the substrate fix lands.
  #
  # Revert criteria: delete this wrapper and the launcher `gamescope.command`
  # seed below after plain `gamescope -f -b -- glxgears` creates a focused
  # fullscreen Gamescope surface on Sobo with the normal session environment.
  gamescopeNoPortal = pkgs.writeShellScriptBin "korri-gamescope-no-portal" ''
    export DBUS_SESSION_BUS_ADDRESS="unix:path=${config.services.korri.kiosk.runtimeDir}/korri-gamescope-no-portal-bus"
    exec ${config.services.korri.kiosk.gamescope.package}/bin/gamescope "$@"
  '';
in
{
  imports = [
    nix-on-rocks.nixosModules.rocknix-guest-base
    deviceProfile
  ];

  services.inputplumber.package = lib.mkForce inputplumberPackage;

  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

  services.korri.kiosk = {
    user = lib.mkDefault "root";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/storage";
    runtimeDir = lib.mkDefault "/run/user/0";

    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=/run/user/0/bus";
      services = lib.mkDefault [ "main-space-session-dbus.service" ];
    };

    input = {
      required = lib.mkDefault true;
      provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "inputplumber";
        services = lib.mkDefault [ "inputplumber.service" ];
      };
    };

    path = with pkgs; [
      coreutils
      dbus
      foot
      swaybg
      swaylock
      bashInteractive
      fuzzel
      git
      sway
      config.services.korri.kiosk.gamescope.package
      gamescopeNoPortal
      substratePackages.cemu
      substratePackages.moonlight-embedded
    ];

    environment = {
      XDG_CURRENT_DESKTOP = "sway";
      SDL_AUDIODRIVER = "pulseaudio";
      XDG_CACHE_HOME = "/storage/.cache";
      CEMU_BIOS_ROOT = "/storage/roms/bios/cemu";
      CEMU_AFFINITY_MASK = sm8550.performance.cemuAffinityMask;
      KORRI_MOONLIGHT_COMMAND = "${substratePackages.moonlight-embedded}/bin/moonlight";
      KORRI_MOONLIGHT_CLIENT = "embedded";
      KORRI_MOONLIGHT_MAPPING_FILE = "${substratePackages.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt";
      KORRI_MOONLIGHT_PLATFORM = "v4l2m2m";
      KORRI_MOONLIGHT_STARTUP_OBSERVE_MS = "750";
      SDL_VIDEODRIVER = "wayland";
      WLR_NO_HARDWARE_CURSORS = "1";
      WLR_LIBINPUT_NO_DEVICES = "1";
      USER = "root";
    };

    sway.extraConfig = ''
      # ROCKNIX SM8550 display/session fragment supplied by nix-on-rocks.
      seat * hide_cursor 1000
      default_border none

      ${sm8550.display.swayDeviceConfig}
    '';
  };

  rocknix.sm8550.moonlight = {
    enable = true;
    package = substratePackages.moonlight-embedded;
  };

  systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
    lib.concatStringsSep ":" [
      "${config.services.inputplumber.package}/share"
      "/run/current-system/sw/share"
    ]
  );

  systemd.services.korri-kiosk.preStart = ''
    moonlight_launcher="${config.services.korri.kiosk.dataHome}/korri/library/local-moonlight-launcher.yaml"
    needs_moonlight_launcher=0
    if [ ! -e "$moonlight_launcher" ]; then
      needs_moonlight_launcher=1
    elif grep -q "enabled: false" "$moonlight_launcher" && ! grep -q "korri-gamescope-no-portal" "$moonlight_launcher"; then
      needs_moonlight_launcher=1
    fi

    if [ "$needs_moonlight_launcher" -eq 1 ]; then
      install -d -m 700 "$(dirname "$moonlight_launcher")"
      # TEMPORARY: keep client-side Moonlight Gamescope-wrapped via the
      # no-portal wrapper above. Remove `command:` when Sobo's normal kiosk
      # session can launch plain Gamescope without blocking on portals.
      cat > "$moonlight_launcher" <<'EOF'
launchers:
  moonlight:
    command: moonlight
    args: []
    systems: []
    gamescope:
      enabled: true
      command: ${gamescopeNoPortal}/bin/korri-gamescope-no-portal
EOF
      chmod 600 "$moonlight_launcher"
    fi
  '';

  environment.etc."rocknix-stage10-proof-marker".text = ''
    korri-rocknix-kiosk-system
    target=${config.networking.hostName}
  '';

  environment.systemPackages = [
    substratePackages.cemu
    substratePackages.steam
  ];
}
