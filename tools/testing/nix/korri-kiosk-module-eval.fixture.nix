{
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  nixpkgsPath = flake.inputs.nixpkgs.outPath;
  evalConfig = import (nixpkgsPath + "/nixos/lib/eval-config.nix");

  baseModule =
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
    };

  evaluateWith =
    overrides:
    let
      eval = evalConfig {
        inherit system;
        modules = [
          flake.nixosModules.korri
          baseModule
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
      clientLauncher =
        if clientLauncherPath == null then null else builtins.readFile clientLauncherPath;
    };

  # Every scenario the test file exercises. Keys mirror the intent of the
  # corresponding `it(...)` blocks. Adding a new scenario means defining it
  # here and reading `result.scenarios.<key>` from a new `it(...)`.
  scenarios = {
    baseline = evaluateWith { };

    clientPackageOnly = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.client = {
          enable = true;
          package = pkgs.writeShellScriptBin "korri-client-only" "exit 0";
        };
      }
    );

    kioskEnablesClient = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    swayPlatformFragment = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "device-korri" "exit 0"}/bin/device-korri";
          sway.extraConfig = ''
            output DEVICE-PANEL transform 90
          '';
        };
      }
    );

    existingSessionBus = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          runtimeDir = "/run/user/0";
          sessionBus = {
            mode = "existing";
            address = "unix:path=/run/user/0/bus";
            services = [ "platform-session-dbus.service" ];
          };
        };
      }
    );

    existingSessionBusMissingAddress = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          sessionBus.mode = "existing";
        };
      }
    );

    platformInputProvider = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            required = true;
            provider = {
              enable = true;
              name = "platform-input";
              services = [ "platform-input.service" ];
            };
          };
        };
      }
    );

    inputplumberProvider = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            required = true;
            provider = {
              enable = true;
              name = "inputplumber";
              services = [ "inputplumber.service" ];
            };
          };
        };
      }
    );

    inputOptOut = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            required = true;
            provider.enable = false;
            optOutReason = "automated visual fixture";
          };
        };
      }
    );

    inputRequiredWithoutProvider = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input.required = true;
          input.provider.enable = false;
        };
      }
    );

    inputProviderOrderingWithoutProvider = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input.provider = {
            enable = false;
            services = [ "platform-input.service" ];
          };
        };
      }
    );

    inputDisabled = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
          input = {
            enable = false;
            optOutReason = "non-interactive display fixture";
          };
        };
      }
    );

    rootCreateUser = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = true;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    clientCommandWithArgs = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client --profile kiosk";
        };
      }
    );

    platformUserNoGroup = evaluateWith (
      { pkgs, ... }:
      {
        users.users.platform-user = {
          isNormalUser = true;
          group = "users";
        };
        services.korri.kiosk = {
          enable = true;
          user = "platform-user";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    emptyUser = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    relativeRuntimeDir = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          runtimeDir = "korri-kiosk";
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    runtimeDirOutsideRun = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          runtimeDir = "/tmp/korri-kiosk";
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
      }
    );

    # `cliEnabledByDefault` previously duplicated `kioskEnablesClient` byte-for-byte;
    # consumers now read `scenarios.kioskEnablesClient` directly for the CLI-default
    # assertions. Kept here as a comment so the next reader sees the consolidation
    # rather than re-introducing the duplicate.

    cliOptedOut = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
        services.korri.cli.enable = false;
      }
    );

    cliPackageOverridden = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.kiosk = {
          enable = true;
          user = "root";
          createUser = false;
          client.command = "${pkgs.writeShellScriptBin "korri-kiosk-client" "exit 0"}/bin/korri-kiosk-client";
        };
        services.korri.cli.package = pkgs.writeShellScriptBin "korri-cli-stub" "exit 0";
      }
    );
  };
in
{
  inherit scenarios;
}
