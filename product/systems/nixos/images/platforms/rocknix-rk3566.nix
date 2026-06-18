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
  inputplumberPackage = substratePackages.inputplumber;
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  gamescopeRuntimeEnvironment = gamescopeNix.rk3566RuntimeEnvironment;
  enabledFirstPartyPlugins = "@korri:gamescope,@korri:neverball";

  panfrostEnvironment = {
    # RG353M/RK3566 exposes rockchip KMS on card0 and Mali-G52/Panfrost on the
    # render node. wlroots needs both explicitly in the current guest bring-up:
    # KMS on card0, rendering on renderD128.
    WLR_DRM_DEVICES = "/dev/dri/card0";
    WLR_RENDER_DRM_DEVICE = "/dev/dri/renderD128";
    WLR_RENDERER = "gles2";
    WLR_NO_HARDWARE_CURSORS = "1";
    WLR_LIBINPUT_NO_DEVICES = "1";
    MESA_LOADER_DRIVER_OVERRIDE = "panfrost";
    GALLIUM_DRIVER = "panfrost";
    XDG_CURRENT_DESKTOP = "sway";
    XDG_CACHE_HOME = "/home/korri/.cache";
    USER = "korri";
  };

in
{
  imports = [
    nix-on-rocks.nixosModules.rocknix-guest-base
    nix-on-rocks.nixosModules.rk3566
    deviceProfile
  ];

  services.inputplumber.package = lib.mkForce inputplumberPackage;
  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

  services.korri.compositor = {
    user = lib.mkDefault "root";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri";
    runtimeDir = lib.mkDefault "%t";

    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=%t/bus";
      services = lib.mkDefault [ "main-space-session-dbus.service" ];
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
      korri.packages.${targetSystem}.smb-remastered
    ];

    environment = panfrostEnvironment;

    sway.extraConfig = ''
      # ROCKNIX RK3566/RG353M kiosk fragment supplied by Korri.
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

  services.korri.sessiond = {
    path = [
      gamescopePackage
      pkgs.moonlight-embedded
      korri.packages.${targetSystem}.smb-remastered
    ];
    # The plugin-owned foreground runtime inherits this env, so the PanVK
    # runtime knobs must live here alongside the Panfrost ones.
    extraEnvironment = panfrostEnvironment // gamescopeRuntimeEnvironment // {
      KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
    };
  };

  # RK3566/PanVK RetroArch is the known deadlock case, but platform defaults
  # must not define an apps.retroarch record because user-authored app records
  # would collide in ProseQL. Apply the Xwayland route at the host layer; more
  # specific app/library policy can opt back in later if a native-Wayland app is
  # proven safe on this platform.
  services.korri.daemon.library.platformDefaults.host.gamescope.app.environment.WAYLAND_DISPLAY =
    null;

  systemd.user.services.korrid.environment.KORRI_ENABLED_PLUGINS =
    enabledFirstPartyPlugins;

  # Keep the nix-on-rocks boot-selected guest profile in sync after switches.
  system.activationScripts.korri-rocknix-guest-profile = {
    text = ''
      profile_dir=/nix/var/nix/profiles/per-user/root
      ${pkgs.coreutils}/bin/mkdir -p "$profile_dir"
      ${pkgs.nix}/bin/nix-env \
        --profile "$profile_dir/rocknix-guest-system" \
        --set "$systemConfig"
    '';
    deps = [ "users" ];
  };

  systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
    lib.concatStringsSep ":" [
      "/run/current-system/sw/share"
      "${config.services.inputplumber.package}/share"
    ]
  );

  environment.systemPackages = [
    korri.packages.${targetSystem}.smb-remastered
  ];

  environment.etc."rocknix-stage10-proof-marker".text = ''
    korri-rk3566-kiosk-system
    target=${config.networking.hostName}
  '';
}
