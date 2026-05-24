{
  config,
  lib,
  pkgs,
  ...
}:

{
  config = lib.mkIf (config.services.korri.kiosk.enable or false) {
    services.seatd.enable = lib.mkDefault true;
    services.inputplumber.enable = lib.mkDefault true;
    systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
      lib.concatStringsSep ":" [
        "${config.services.inputplumber.package}/share"
        "/run/current-system/sw/share"
      ]
    );
    networking.firewall.allowedUDPPorts = [ 5353 ];

    users.users.${config.services.korri.kiosk.user}.extraGroups =
      lib.mkIf config.services.korri.kiosk.createUser
        (
          lib.mkDefault [
            "input"
            "render"
            "seat"
            "video"
          ]
        );

    services.korri.kiosk = {
      wants = lib.mkDefault [
        "seatd.service"
        "inputplumber.service"
      ];
      after = lib.mkDefault [
        "seatd.service"
        "inputplumber.service"
      ];
      path = [ pkgs.moonlight-embedded ];
      environment.KORRI_DESKTOP_INPUTD_URL = lib.mkDefault "ws://127.0.0.1:${toString config.services.korri.inputd.port}";
      environment.KORRI_MOONLIGHT_COMMAND = lib.mkDefault "${pkgs.moonlight-embedded}/bin/moonlight";
      environment.KORRI_MOONLIGHT_CLIENT = lib.mkDefault "embedded";
      environment.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS = lib.mkDefault "750";
      environment.KORRI_MOONLIGHT_MAPPING_FILE = lib.mkDefault "${pkgs.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt";
      input.provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "inputplumber";
        services = lib.mkDefault [ "inputplumber.service" ];
      };
    };
  };
}
