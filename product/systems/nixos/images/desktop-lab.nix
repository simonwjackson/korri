{
  config,
  lib,
  pkgs,
  ...
}:

let
  compositorCfg = config.services.korri.compositor;
  isX86Linux = pkgs.stdenv.hostPlatform.system == "x86_64-linux";

  steamLauncher = pkgs.writeShellApplication {
    name = "korri-desktop-lab-start-steam";
    runtimeInputs = [ compositorCfg.exec.package ];
    text = ''
      exec korri-compositor-exec steam "$@"
    '';
  };

  steamPackages = lib.optionals isX86Linux [ pkgs.steam ];
in
{
  nixpkgs.config.allowUnfree = lib.mkDefault true;

  services.korri.compositor = {
    enable = true;
    kiosk.enable = false;
    user = lib.mkDefault "korri-lab";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri-lab";
    wants = lib.mkDefault [ "seatd.service" ];
    after = lib.mkDefault [ "seatd.service" ];
    path =
      (with pkgs; [
        bashInteractive
        coreutils
        dbus
        foot
        fuzzel
        git
        procps
        sway
        swaybg
        xwayland
      ])
      ++ steamPackages
      ++ [ steamLauncher ];
    environment = {
      XDG_CURRENT_DESKTOP = "sway";
      SDL_VIDEODRIVER = "wayland";
    };
    sway.extraConfig = ''
      # Desktop-lab defaults: keep a persistent Sway session up while commands
      # are launched into it later with korri-compositor-exec.
      xwayland enable
      seat * hide_cursor 3000
      set $mod Mod4
      bindsym $mod+Return exec foot
      bindsym $mod+d exec fuzzel
    '';
  };

  services.seatd.enable = lib.mkDefault true;
  services.dbus.enable = lib.mkDefault true;

  users.groups.korri-lab = { };
  users.users.korri-lab = {
    isNormalUser = true;
    group = "korri-lab";
    home = "/home/korri-lab";
    createHome = true;
    extraGroups = [
      "input"
      "render"
      "seat"
      "video"
    ];
  };

  programs.steam.enable = lib.mkIf isX86Linux (lib.mkDefault true);
  hardware.graphics = {
    enable = lib.mkDefault true;
    enable32Bit = lib.mkIf isX86Linux (lib.mkDefault true);
  };

  environment.systemPackages = [ steamLauncher ] ++ steamPackages;
}
