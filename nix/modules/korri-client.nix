{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.client;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-desktop
      or (throw "Korri desktop package is not available for system `${system}`. Set services.korri.client.package explicitly.");
in
{
  options.services.korri.client = {
    enable = lib.mkEnableOption "Korri client package/runtime role";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-desktop";
      description = ''
        Korri desktop package to install on the system.

        This role is package/runtime-only: compositor ownership, autostart, and
        appliance session repair belong to services.korri.kiosk. Consumers such
        as ROCKNIX should select the package variant that owns its build-time
        frontend configuration, for example korri-desktop-device.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
  };
}
