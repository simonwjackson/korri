{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-desktop
      or (throw "Korri desktop package is not available for system `${system}`. Set services.korri.package explicitly.");
in
{
  options.services.korri = {
    enable = lib.mkEnableOption "Korri frontend";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-desktop";
      description = ''
        Korri desktop package to install on the system.

        Consumers such as ROCKNIX should select the package variant that owns
        its build-time frontend configuration, for example korri-desktop-device.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
  };
}
