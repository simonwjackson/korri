{ config, lib, ... }:

{
  config = lib.mkIf (config.services.korri.kiosk.enable or false) {
    services.seatd.enable = lib.mkDefault true;

    users.users.korri-kiosk.extraGroups = lib.mkDefault [
      "input"
      "render"
      "seat"
      "video"
    ];

    services.korri.kiosk = {
      wants = lib.mkDefault [ "seatd.service" ];
      after = lib.mkDefault [ "seatd.service" ];
      input.provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "x86-seat-input";
        services = lib.mkDefault [ "seatd.service" ];
      };
    };
  };
}
