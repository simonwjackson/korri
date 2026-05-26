{
  config,
  lib,
  pkgs,
  ...
}:

let
  compositorCfg = config.services.korri.compositor;
  isX86Linux = pkgs.stdenv.hostPlatform.system == "x86_64-linux";

  swayExec = pkgs.writeShellApplication {
    name = "korri-desktop-lab-sway-exec";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.sway
    ];
    text = ''
      set -euo pipefail

      runtime_dir="${compositorCfg.runtimeDir}"
      if [ $# -eq 0 ]; then
        echo "usage: korri-desktop-lab-sway-exec <command> [args...]" >&2
        exit 64
      fi

      if [ -n "''${SWAYSOCK:-}" ] && [ -S "$SWAYSOCK" ]; then
        sway_socket="$SWAYSOCK"
      else
        sway_socket="$(ls -t "$runtime_dir"/sway-ipc.*.sock 2>/dev/null | head -n 1 || true)"
      fi

      if [ -z "$sway_socket" ] || [ ! -S "$sway_socket" ]; then
        echo "korri-desktop-lab-sway-exec: no Sway IPC socket found under $runtime_dir" >&2
        echo "korri-desktop-lab-sway-exec: is korri-compositor.service running?" >&2
        exit 69
      fi

      command_string="$(printf '%q ' "$@")"
      exec swaymsg -s "$sway_socket" exec -- "$command_string"
    '';
  };

  steamLauncher = pkgs.writeShellApplication {
    name = "korri-desktop-lab-start-steam";
    runtimeInputs = [ swayExec ];
    text = ''
      exec korri-desktop-lab-sway-exec steam "$@"
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
        gamescope
        git
        procps
        sway
        swaybg
        xwayland
      ])
      ++ steamPackages
      ++ [
        swayExec
        steamLauncher
      ];
    environment = {
      XDG_CURRENT_DESKTOP = "sway";
      SDL_VIDEODRIVER = "wayland";
    };
    sway.extraConfig = ''
      # Desktop-lab defaults: keep a persistent Sway session up while commands
      # are launched into it later with korri-desktop-lab-sway-exec.
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

  environment.systemPackages = [
    swayExec
    steamLauncher
  ]
  ++ steamPackages;
}
