{
  overrides ? { },
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  nixpkgsPath = flake.inputs.nixpkgs.outPath;
  evalConfig = import (nixpkgsPath + "/nixos/lib/eval-config.nix");
  eval = evalConfig {
    inherit system;
    modules = [
      flake.nixosModules.korri
      (
        { ... }:
        {
          nixpkgs.hostPlatform = system;
          boot.loader.systemd-boot.enable = false;
          fileSystems."/" = {
            device = "/dev/null";
            fsType = "ext4";
          };
          system.stateVersion = "24.11";
          networking.hostName = "kiosk-test";
        }
      )
      overrides
    ];
  };
  failedAssertions = builtins.filter (a: !a.assertion) eval.config.assertions;
  korriFailedAssertions = builtins.filter (
    a: builtins.match ".*korri.*" a.message != null
  ) failedAssertions;

  kioskUnit = eval.config.systemd.services."korri-kiosk" or { };
  inputdUnit = eval.config.systemd.services."korri-inputd" or { };
  swayConfigPath = eval.config.services.korri.kiosk.sway.configFile or null;
  clientLauncherPath = eval.config.services.korri.kiosk.client.launcher or null;
in
{
  assertionsPassed = korriFailedAssertions == [ ];
  assertionMessages = map (a: a.message) korriFailedAssertions;
  warnings = eval.config.warnings;

  optionSurface = {
    server = eval.options.services.korri ? server;
    client = eval.options.services.korri ? client;
    inputd = eval.options.services.korri ? inputd;
    kiosk = eval.options.services.korri ? kiosk;
    cli = eval.options.services.korri ? cli;
  };

  cliEnabled = eval.config.services.korri.cli.enable or false;
  cliPackage = toString (eval.config.services.korri.cli.package or null);

  clientEnabled = eval.config.services.korri.client.enable or false;
  inputdEnabled = eval.config.services.korri.inputd.enable or false;
  kioskEnabled = eval.config.services.korri.kiosk.enable or false;

  clientSystemPackages = map toString eval.config.environment.systemPackages;

  kioskUnitExists = eval.config.systemd.services ? "korri-kiosk";
  kioskWantedBy = kioskUnit.wantedBy or [ ];
  kioskWants = kioskUnit.wants or [ ];
  kioskRequires = kioskUnit.requires or [ ];
  kioskAfter = kioskUnit.after or [ ];
  kioskServiceUser = kioskUnit.serviceConfig.User or null;
  kioskServiceGroup = kioskUnit.serviceConfig.Group or null;
  kioskExecStart = kioskUnit.serviceConfig.ExecStart or null;
  kioskRuntimeDirectory = kioskUnit.serviceConfig.RuntimeDirectory or null;
  kioskStartLimitBurst = kioskUnit.unitConfig.StartLimitBurst or null;
  kioskStartLimitIntervalSec = kioskUnit.unitConfig.StartLimitIntervalSec or null;
  kioskEnvironment = kioskUnit.environment or { };

  inputdBefore = inputdUnit.before or [ ];
  inputdAfter = inputdUnit.after or [ ];
  inputdWants = inputdUnit.wants or [ ];
  inputdEnvironment = inputdUnit.environment or { };

  swayConfig = if swayConfigPath == null then null else builtins.readFile swayConfigPath;
  clientLauncher = if clientLauncherPath == null then null else builtins.readFile clientLauncherPath;
}
