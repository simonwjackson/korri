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
  inputplumberPackage = pkgs.runCommand "korri-rocknix-inputplumber-xb360" { } ''
    cp -a ${substratePackages.inputplumber} $out
    chmod -R u+w $out
    substituteInPlace $out/share/inputplumber/devices/02-ayn-controller.yaml \
      --replace-fail "  - xbox-series" "  - xb360"
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
      KORRI_MOONLIGHT_STARTUP_OBSERVE_MS = "750";
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

  environment.systemPackages = [
    substratePackages.cemu
    substratePackages.steam
  ];
}
