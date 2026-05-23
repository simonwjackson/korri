{ config, lib, pkgs, ... }:

{
  config = lib.mkIf (config.services.korri.kiosk.enable or false) {
    services.seatd.enable = lib.mkDefault true;

    users.users.${config.services.korri.kiosk.user}.extraGroups = lib.mkIf config.services.korri.kiosk.createUser (lib.mkDefault [
      "input"
      "render"
      "seat"
      "video"
    ]);

    services.korri.kiosk = {
      wants = lib.mkDefault [ "seatd.service" ];
      after = lib.mkDefault [ "seatd.service" ];
      path = [ pkgs.moonlight-embedded ];
      environment.KORRI_DESKTOP_INPUTD_URL = lib.mkDefault "ws://127.0.0.1:${toString config.services.korri.inputd.port}";
      environment.KORRI_MOONLIGHT_COMMAND = lib.mkDefault "${pkgs.moonlight-embedded}/bin/moonlight";
      input.provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "x86-seat-input";
        services = lib.mkDefault [ "seatd.service" ];
      };
    };
  };
}
