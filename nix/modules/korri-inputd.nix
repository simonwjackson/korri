{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.inputd;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-inputd
      or (throw "Korri inputd package is not available for system `${system}`. Set services.korri.inputd.package explicitly.");
in
{
  options.services.korri.inputd = {
    enable = lib.mkEnableOption "Korri input bridge and shortcut daemon";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-inputd";
      description = "Korri inputd package to run.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3002;
      description = "TCP port for the Korri native input WebSocket bridge.";
    };

    hostname = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = "Address for the Korri native input WebSocket bridge to bind.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = ''
        Extra environment variables for korri-inputd. This is the integration
        point for device/profile-specific action commands such as
        KORRI_INPUTD_BRIGHTNESS_UP or KORRI_INPUTD_BOTTOM_KEYBOARD.
      '';
    };

    path = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = with pkgs; [
        bash
        brightnessctl
        coreutils
        procps
        pulseaudio
        systemd
      ];
      description = "Packages added to PATH for shortcut action commands.";
    };

    wants = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Additional systemd units wanted by korri-inputd.service.";
    };

    after = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "systemd-udevd.service" ];
      description = "Systemd units that korri-inputd.service starts after.";
    };

    before = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Systemd units that korri-inputd.service starts before.";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    systemd.services.korri-inputd = {
      description = "Korri input bridge and shortcut daemon";
      wantedBy = [ "multi-user.target" ];
      inherit (cfg) wants after before path;
      environment = cfg.environment // {
        KORRI_INPUT_BRIDGE_PORT = toString cfg.port;
        KORRI_INPUT_BRIDGE_HOSTNAME = cfg.hostname;
      };
      serviceConfig = {
        ExecStart = "${cfg.package}/bin/korri-inputd";
        Restart = "on-failure";
        RestartSec = 1;
      };
    };
  };
}
