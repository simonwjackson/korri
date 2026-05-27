# Pure-Nix module-evaluation check for `services.korri.sessiond`.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-sessiond-module --no-link
{
  pkgs,
  korriSessiondModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");
  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.systemd-boot.enable = false;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
    };

  # The sessiond module reads attributes from compositor.kiosk.enable and
  # server.streaming.enable via `lib.attrByPath` defaults; we shim the
  # option names here so eval-config has enough to evaluate. Real
  # compositions import the actual compositor / server modules; this test
  # exercises the sessiond module in isolation.
  shimOptionsModule =
    { lib, ... }:
    {
      options.services.korri = {
        compositor.kiosk.enable = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
        server.streaming.enable = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
      };
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriSessiondModule
        shimOptionsModule
        baseModule
        overrides
      ];
    }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  failedAssertionMessages = cfg: map (a: a.message) (failedAssertions cfg);
  hasFailure = cfg: expected: builtins.any (m: lib.hasInfix expected m) (failedAssertionMessages cfg);

  unit = cfg: cfg.systemd.services.korri-sessiond or null;
  unitEnv = cfg: (unit cfg).environment or { };
  unitPath = cfg: (unit cfg).path or [ ];
  serviceConfig = cfg: (unit cfg).serviceConfig or { };
  execStart = cfg: builtins.readFile (serviceConfig cfg).ExecStart;
  execStartPre = cfg: builtins.readFile (serviceConfig cfg).ExecStartPre;
  execStartPost = cfg: builtins.readFile (serviceConfig cfg).ExecStartPost;

  baselineKiosk = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
  };

  sourceMachine = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.server.streaming.enable = true;
  };

  explicitSourceMachineOverride = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      role = "source-machine";
    };
    services.korri.compositor.kiosk.enable = true;
  };

  bothKioskAndStreaming = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
    services.korri.server.streaming.enable = true;
  };

  kioskRoleWithStreaming = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      role = "kiosk";
    };
    services.korri.server.streaming.enable = true;
  };

  relativeTokenFile = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      tokenFile = "etc/sessiond-token";
    };
  };

  customStatusPath = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      sunshineRuntimeStatusPath = "/run/korri-game-stream/status.json";
    };
    services.korri.server.streaming.enable = true;
  };

  withPath = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      path = [ pkgs.gamescope ];
    };
    services.korri.compositor.kiosk.enable = true;
  };

  withSharedGroup = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      sharedGroup = "korri-server";
    };
    services.korri.compositor.kiosk.enable = true;
  };

  withoutSharedGroup = baselineKiosk;

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "kiosk: assertions pass" (failedAssertions baselineKiosk == [ ]))
    (check "kiosk: KORRI_SESSIOND_ROLE=kiosk" (
      (unitEnv baselineKiosk).KORRI_SESSIOND_ROLE == "kiosk"
    ))
    (check "source-machine: assertions pass" (failedAssertions sourceMachine == [ ]))
    (check "source-machine: KORRI_SESSIOND_ROLE=source-machine" (
      (unitEnv sourceMachine).KORRI_SESSIOND_ROLE == "source-machine"
    ))
    (check "source-machine: KORRI_SESSIOND_PORT=3003" (
      (unitEnv sourceMachine).KORRI_SESSIOND_PORT == "3003"
    ))
    (check "source-machine: token file env exported" (
      (unitEnv sourceMachine).KORRI_SESSIOND_TOKEN_FILE == "/run/korri-sessiond/token"
    ))
    (check "explicit role override beats inferred" (
      (unitEnv explicitSourceMachineOverride).KORRI_SESSIOND_ROLE == "source-machine"
    ))
    (check "kiosk + streaming: assertion fires" (
      hasFailure bothKioskAndStreaming "must not be enabled together"
    ))
    (check "kiosk role + streaming.enable: assertion fires" (
      hasFailure kioskRoleWithStreaming "incompatible with"
    ))
    (check "relative tokenFile: assertion fires" (
      hasFailure relativeTokenFile "tokenFile must be an absolute path"
    ))
    (check "ExecStart references korri-sessiond bin" (
      lib.hasInfix "korri-sessiond" (execStart baselineKiosk)
    ))
    (check "ExecStart sources the token file" (
      lib.hasInfix "/run/korri-sessiond/token" (execStart baselineKiosk)
    ))
    (check "ExecStartPost POSTs /control/start" (
      lib.hasInfix "/control/start" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost passes the sessiond capability header" (
      lib.hasInfix "x-korri-sessiond-token" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost honors the role's port" (
      lib.hasInfix "http://127.0.0.1:3003/control/start" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost has a bounded retry budget" (
      lib.hasInfix "max=40" (execStartPost baselineKiosk)
    ))
    (check "source-machine: tmpfiles creates runtime dir 0700" (
      builtins.any (rule: lib.hasInfix "korri-sessiond" rule && lib.hasInfix "0700" rule)
        sourceMachine.systemd.tmpfiles.rules
    ))
    (check "source-machine: sunshineRuntimeStatusPath exported as KORRI_GAME_STREAM_STATUS_PATH" (
      (unitEnv customStatusPath).KORRI_GAME_STREAM_STATUS_PATH == "/run/korri-game-stream/status.json"
    ))
    (check "path option flows through to systemd unit PATH" (
      builtins.elem pkgs.gamescope (unitPath withPath)
    ))
    (check "ExecStartPre generates token via /dev/urandom" (
      lib.hasInfix "/dev/urandom" (execStartPre baselineKiosk)
    ))
    (check "ExecStartPre collapses whitespace with tr (sed would leave newlines)" (
      lib.hasInfix "tr -d '[:space:]'" (execStartPre baselineKiosk)
    ))
    (check "ExecStartPre is wired before ExecStart" (
      (serviceConfig baselineKiosk).ExecStartPre != null
    ))
    (check "sharedGroup=korri-server: ExecStartPre chowns to that group at mode 0640" (
      lib.hasInfix "chown root:korri-server" (execStartPre withSharedGroup)
      && lib.hasInfix "chmod 0640" (execStartPre withSharedGroup)
    ))
    (check "sharedGroup unset: ExecStartPre keeps token root-only at 0600" (
      lib.hasInfix "chown root:root" (execStartPre withoutSharedGroup)
      && lib.hasInfix "chmod 0600" (execStartPre withoutSharedGroup)
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-sessiond module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-sessiond-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-sessiond module checks passed."
    touch $out
  ''
