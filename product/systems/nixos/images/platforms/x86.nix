# Sway is pinned for x86 compositor hosts through the
# korri-x86-compositor-overlay nixosModule (wired into korri-compositor in
# flake.nix). That overlay reaches downstream consumers (mountainous, bespoke
# nixosSystem) automatically, so this platform module no longer needs its own
# pin.
{
  config,
  lib,
  pkgs,
  ...
}:

{
  imports = [ ../../modules/korri-removable-media.nix ];

  config = lib.mkMerge [
    (lib.mkIf (config.services.korri.compositor.kiosk.enable or false) {
      # Operator USB sticks become removable config/content roots. Internal
      # disks are excluded twice: the positive gate only admits USB-transport
      # (or SD) media, and the runtime deny-list refuses any disk backing a
      # system mount (the default requiredSystemMounts "/" resolves the
      # installed system disk).
      services.korri.removableMedia = {
        enable = true;
        match.usb = true;
      };

      services.seatd.enable = lib.mkDefault true;
      systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
        lib.concatStringsSep ":" [
          "/run/current-system/sw/share"
          "${config.services.inputplumber.package}/share"
        ]
      );
      networking.firewall.allowedUDPPorts = [ 5353 ];

      users.users.${config.services.korri.compositor.user}.extraGroups =
        lib.mkIf config.services.korri.compositor.createUser
          (
            lib.mkDefault [
              "input"
              "render"
              "seat"
              "video"
            ]
          );

      services.korri.compositor = {
        wants = lib.mkDefault [
          "seatd.service"
          "inputplumber.service"
        ];
        after = lib.mkDefault [
          "seatd.service"
          "inputplumber.service"
        ];
        path = [ pkgs.moonlight-embedded ];
      };

      services.korri.daemon.library.platformDefaults.host.moonlight = {
        command = lib.mkDefault "${pkgs.moonlight-embedded}/bin/moonlight";
        input.mappingFile = lib.mkDefault "${pkgs.moonlight-embedded}/share/moonlight/korri-inputplumber-gamecontrollerdb.txt";
      };

      services.korri.input.provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "inputplumber";
        services = lib.mkDefault [ "inputplumber.service" ];
      };
    })
  ];
}
