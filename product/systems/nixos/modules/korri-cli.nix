{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.cli;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-cli
      or (throw "Korri CLI package is not available for system `${system}`. Set services.korri.cli.package explicitly.");
in
{
  # Stable module key so multiple imports (compositor + server) deduplicate
  # to a single declaration. Without this, the curried-import pattern
  # used across Korri modules treats each (import ./korri-cli.nix args)
  # call as a distinct module and emits "option already declared" errors.
  _file = ./korri-cli.nix;
  key = ./korri-cli.nix;

  options.services.korri.cli = {
    enable = lib.mkEnableOption "Korri command-line interface";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-cli";
      description = ''
        Korri CLI package to install on the system. Provides the `korri`
        binary used to drive `korri play`, `korri stream launch`, and
        `korri stream remote-launch` against a local or LAN-discovered
        Korri stream host.

        Auto-enabled by `services.korri.compositor` (when
        `compositor.kiosk.enable = true`) and `services.korri.daemon` via
        `lib.mkDefault`, so client and stream-host appliances always ship
        the CLI. Set `services.korri.cli.enable = false` to opt out if the
        deployment provides `korri` through another channel.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];
  };
}
