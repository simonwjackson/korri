{
  korri,
  nixpkgs,
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
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  gamescopeRuntimeEnvironment = gamescopeNix.rk3566RuntimeEnvironment;
  enabledFirstPartyPlugins = "@korri:gamescope,@korri:neverball";
  runtime = config.services.korri.runtime;
  rk3326RuntimeDir = "/run/user/${toString runtime.uid}";
  rk3326PulseServer = "unix:${rk3326RuntimeDir}/pulse/native";

  panfrostEnvironment = {
    # R36T Max/RK3326 is a Mali-G31/Panfrost target. Keep the DRM node broad for
    # first hardware acceptance; connector/mode-specific policy belongs after
    # the Korri guest captures live DRM evidence.
    WLR_DRM_DEVICES = "/dev/dri/card0";
    WLR_RENDER_DRM_DEVICE = "/dev/dri/renderD128";
    WLR_RENDERER = "gles2";
    WLR_NO_HARDWARE_CURSORS = "1";
    WLR_LIBINPUT_NO_DEVICES = "1";
    XDG_CURRENT_DESKTOP = "sway";
    XDG_CACHE_HOME = "/home/korri/.cache";
    USER = "korri";
  };
in
{
  imports = [
    nix-on-rocks.nixosModules.rocknix-guest-base
    nix-on-rocks.nixosModules.rk3326
    deviceProfile
    ../../modules/korri-rocknix-guest-profile.nix
  ];

  services.inputplumber.package = lib.mkForce substratePackages.inputplumber;
  services.korri.rocknixGuestProfile = {
    enable = true;
    proofMarkerLabel = "korri-rk3326-r36tmax-kiosk-system";
  };
  services.korri.client.package = korri.packages.${targetSystem}.korri-chromium-kiosk;

  rocknix.session.runtimeDir.uid = runtime.uid;
  systemd.user.services.pipewire.enable = lib.mkForce false;
  systemd.user.services.pipewire-pulse.enable = lib.mkForce false;
  systemd.user.services.wireplumber.enable = lib.mkForce false;
  systemd.user.sockets.pipewire.enable = lib.mkForce false;
  systemd.user.sockets.pipewire-pulse.enable = lib.mkForce false;

  services.korri.compositor = {
    user = lib.mkDefault "root";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri";
    runtimeDir = lib.mkDefault "%t";

    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=%t/bus";
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
      gamescopePackage
      pkgs.moonlight-embedded
    ];

    environment = panfrostEnvironment;

    sway.extraConfig = ''
      # ROCKNIX RK3326/R36T Max kiosk fragment supplied by Korri.
      seat * hide_cursor 1000
      default_border none
      default_floating_border none
      hide_edge_borders both
      gaps inner 0
      gaps outer 0
      output * bg #000000 solid_color
    '';
  };

  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
    services = lib.mkDefault [ "inputplumber.service" ];
  };

  services.korri.input.inputd.environment = {
    PULSE_SERVER = rk3326PulseServer;
  };

  services.korri.sessiond = {
    path = [
      gamescopePackage
      pkgs.moonlight-embedded
    ];
    extraEnvironment =
      panfrostEnvironment
      // gamescopeRuntimeEnvironment
      // {
        KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
        PULSE_SERVER = rk3326PulseServer;
      };
  };

  services.korri.daemon.library.platformDefaults.host = {
    launch."with"."@korri:gamescope".app.environment.WAYLAND_DISPLAY = null;
  };

  systemd.user.services.korrid.environment.KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;

  systemd.user.services.korri-compositor.serviceConfig.UnsetEnvironment = [
    "DISPLAY"
    "WAYLAND_DISPLAY"
  ];
}
