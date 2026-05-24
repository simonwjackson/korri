{
  overrides ? null,
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
      networking.hostName = "test-host";
      users.users.testuser = {
        isNormalUser = true;
        home = "/home/testuser";
        group = "users";
      };
    };

  evaluateWith =
    overridesModule:
    let
      eval = evalConfig {
        inherit system;
        modules = [
          flake.nixosModules.korri-server
          flake.nixosModules.korri-headless-source
          flake.nixosModules.korri-inputd
          baseModule
          overridesModule
        ];
      };
      failedAssertions = builtins.filter (a: !a.assertion) eval.config.assertions;
      korriFailedAssertions = builtins.filter (
        a: builtins.match ".*korri.*" a.message != null
      ) failedAssertions;
    in
    {
      assertionsPassed = korriFailedAssertions == [ ];
      assertionMessages = map (a: a.message) korriFailedAssertions;
      warnings = eval.config.warnings;

      systemUnitExists = eval.config.systemd.services ? korri-server;
      userUnitExists = eval.config.systemd.user.services ? korri-server;

      systemWantedBy = eval.config.systemd.services.korri-server.wantedBy or null;
      userWantedBy = eval.config.systemd.user.services.korri-server.wantedBy or null;

      systemServiceUser = eval.config.systemd.services.korri-server.serviceConfig.User or null;
      systemServiceGroup = eval.config.systemd.services.korri-server.serviceConfig.Group or null;

      systemRuntimeDirectory =
        eval.config.systemd.services.korri-server.serviceConfig.RuntimeDirectory or null;
      systemRuntimeDirectoryMode =
        eval.config.systemd.services.korri-server.serviceConfig.RuntimeDirectoryMode or null;
      systemStateDirectory =
        eval.config.systemd.services.korri-server.serviceConfig.StateDirectory or null;
      systemStateDirectoryMode =
        eval.config.systemd.services.korri-server.serviceConfig.StateDirectoryMode or null;
      systemCacheDirectory =
        eval.config.systemd.services.korri-server.serviceConfig.CacheDirectory or null;
      systemCacheDirectoryMode =
        eval.config.systemd.services.korri-server.serviceConfig.CacheDirectoryMode or null;
      systemExecStartPre = eval.config.systemd.services.korri-server.serviceConfig.ExecStartPre or null;
      systemNoNewPrivileges =
        eval.config.systemd.services.korri-server.serviceConfig.NoNewPrivileges or null;
      systemProtectSystem =
        eval.config.systemd.services.korri-server.serviceConfig.ProtectSystem or null;
      systemRestart = eval.config.systemd.services.korri-server.serviceConfig.Restart or null;

      userServiceEnv =
        if eval.config.systemd.user.services ? korri-server then
          eval.config.systemd.user.services.korri-server.environment
        else
          null;
      systemServiceEnv =
        if eval.config.systemd.services ? korri-server then
          eval.config.systemd.services.korri-server.environment
        else
          null;

      tmpfilesRunDir =
        eval.config.systemd.tmpfiles.settings."10-korri-server"."/run/korri-game-stream".d or null;

      gameStreamRuntimeDir = eval.config.services.korri.gameStream.runtimeDir or null;
      gameStreamIntentPath = eval.config.services.korri.gameStream.intentPath or null;
      gameStreamStatusPath = eval.config.services.korri.gameStream.statusPath or null;

      gameStreamDisplayCompatEnable =
        eval.config.services.korri.gameStream.displayCompat.enable or null;
      gameStreamDisplayCompatDefaults =
        eval.config.services.korri.gameStream.displayCompat.defaults or null;
      gameStreamDisplayCompatExtra =
        eval.config.services.korri.gameStream.displayCompat.extraEnv or null;
      bootKernelModules = eval.config.boot.kernelModules or [ ];
      udevExtraRules = eval.config.services.udev.extraRules or "";
      inputdServiceEnv =
        if eval.config.systemd.services ? korri-inputd then
          eval.config.systemd.services.korri-inputd.environment
        else
          null;

      gameStreamWrapperScript =
        let
          apps = eval.config.services.sunshine.applications.apps or [ ];
        in
        if apps == [ ] then null else builtins.readFile (builtins.elemAt apps 0).cmd;

      firewallTcpPorts = eval.config.networking.firewall.allowedTCPPorts or [ ];
      firewallInterfaceNames = builtins.attrNames (eval.config.networking.firewall.interfaces or { });

      systemPackages = map toString eval.config.environment.systemPackages;
      cliEnabled = eval.config.services.korri.cli.enable or false;
      cliPackage = toString (eval.config.services.korri.cli.package or null);
    };

  # Pre-enumerated scenarios. Keys mirror the intent of each `it(...)` block
  # so a test can read `scenarios.<key>` directly. Scenarios that share the
  # exact same overrides reuse the same key (e.g. `defaultUserMode` covers
  # both the user-service compatibility tests and the CLI defaults).
  scenarios = {
    defaultUserMode = evaluateWith { services.korri.server = { enable = true; }; };

    explicitSystemMode = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        group = "users";
        streamHost.enable = true;
      };
    };

    publicApiBaseUrl = evaluateWith {
      services.korri.server = {
        enable = true;
        publicApiBaseUrl = "http://192.168.1.117:3001";
      };
    };

    defaultInputd = evaluateWith { services.korri.inputd.enable = true; };

    remoteDebugInputd = evaluateWith {
      services.korri.inputd = {
        enable = true;
        hostname = "0.0.0.0";
      };
    };

    missingUser = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        library.root = "/var/lib/korri/library";
      };
    };

    rootUser = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "root";
        library.root = "/var/lib/korri/library";
      };
    };

    userSpecifierPath = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          runtimeDir = "%t/korri-game-stream";
        };
      };
    };

    relativePath = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          runtimeDir = "relative-dir";
        };
      };
    };

    mismatchedParent = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost = {
          enable = true;
          statusPath = "/tmp/status.json";
        };
      };
    };

    globalFirewall = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        host = "0.0.0.0";
        openFirewall = true;
      };
    };

    scopedFirewall = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        host = "0.0.0.0";
        openFirewall = true;
        firewallInterfaces = [ "tailscale0" ];
      };
    };

    conflictingHeadlessSource = evaluateWith {
      services.korri = {
        server = {
          enable = true;
          user = "testuser";
        };
        headlessSource = {
          enable = true;
          libraryRoot = "/home/testuser/.local/share/korri/library";
        };
      };
    };

    uinputDisabled = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost.enable = true;
      };
      services.korri.gameStream.uinput.enable = false;
    };

    displayCompatDefaults = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost.enable = true;
      };
    };

    displayCompatDisabled = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost.enable = true;
      };
      services.korri.gameStream.displayCompat.enable = false;
    };

    displayCompatExtraEnv = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        streamHost.enable = true;
      };
      services.korri.gameStream.displayCompat.extraEnv = {
        MESA_GL_VERSION_OVERRIDE = "4.5";
        SDL_VIDEODRIVER = "x11";
      };
    };

    systemModeAbsolutePathOverrides = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        group = "users";
        streamHost = {
          enable = true;
          runtimeDir = "/var/run/korri";
          intentPath = "/var/run/korri/next-launch.json";
          statusPath = "/var/run/korri/status.json";
        };
      };
    };

    cliSystemMode = evaluateWith {
      services.korri.server = {
        enable = true;
        serviceMode = "system";
        user = "testuser";
        group = "users";
      };
    };

    cliOptedOut = evaluateWith {
      services.korri.server = {
        enable = true;
      };
      services.korri.cli.enable = false;
    };

    cliOverridden = evaluateWith (
      { pkgs, ... }:
      {
        services.korri.server = {
          enable = true;
        };
        services.korri.cli.package = pkgs.writeShellScriptBin "korri-cli-stub" "exit 0";
      }
    );
  };
in
# The fixture is called in two modes:
#   * `--apply f: f { flakeRoot = ...; }` (no overrides) -> returns every
#     batched scenario so the test does one nix eval for all of them.
#   * `--apply f: f { flakeRoot = ...; overrides = <module>; }` -> returns
#     one scenario at the top level. This is for tests that need to assert
#     nix eval itself fails (e.g. library.root cannot be derived), which
#     can't be batched because a single hard failure would poison every
#     scenario in the shared attrset.
if overrides == null then
  { inherit scenarios; }
else
  evaluateWith overrides
