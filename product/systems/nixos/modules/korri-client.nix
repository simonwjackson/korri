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
    packagesForSystem.korri-chromium-kiosk
      or (throw "Korri Chromium kiosk package is not available for system `${system}`. Set services.korri.client.package explicitly.");
in
{
  # Stable module key so multiple imports (e.g. via nixosModules.korri-compositor
  # composite + nixosModules.korri-daemon composite + aggregate korri)
  # deduplicate to a single declaration.
  _file = ./korri-client.nix;
  key = ./korri-client.nix;

  options.services.korri.client = {
    enable = lib.mkEnableOption "Korri client package/runtime role";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-chromium-kiosk";
      description = ''
        Korri Chromium kiosk package to install on the system.

        This role is package/runtime-only: compositor ownership, autostart, and
        appliance session repair belong to services.korri.compositor (with
        services.korri.compositor.kiosk.enable = true for the local GUI surface).
        Consumers such as ROCKNIX should select the package variant that owns
        its build-time frontend configuration, for example korri-chromium-kiosk.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
  };
}
