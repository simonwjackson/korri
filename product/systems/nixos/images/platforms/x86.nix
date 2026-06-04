# Sway/gamescope are pinned globally for x86 compositor hosts through
# the korri-x86-compositor-overlay nixosModule (wired into
# korri-compositor in flake.nix). That overlay reaches downstream
# consumers (mountainous, bespoke nixosSystem) automatically, so this
# platform module no longer needs its own pin.
{
  config,
  lib,
  pkgs,
  ...
}:

{
  config = lib.mkMerge [
    (lib.mkIf (config.services.korri.compositor.kiosk.enable or false) {
      services.seatd.enable = lib.mkDefault true;
      systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
        lib.concatStringsSep ":" [
          "${config.services.inputplumber.package}/share"
          "/run/current-system/sw/share"
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
        environment.KORRI_MOONLIGHT_COMMAND = lib.mkDefault "${pkgs.moonlight-embedded}/bin/moonlight";
        environment.KORRI_MOONLIGHT_CLIENT = lib.mkDefault "embedded";
        environment.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS = lib.mkDefault "750";
        environment.KORRI_MOONLIGHT_MAPPING_FILE = lib.mkDefault "${pkgs.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt";
      };

      services.korri.input.provider = {
        enable = lib.mkDefault true;
        name = lib.mkDefault "inputplumber";
        services = lib.mkDefault [ "inputplumber.service" ];
      };
    })
  ];
}
