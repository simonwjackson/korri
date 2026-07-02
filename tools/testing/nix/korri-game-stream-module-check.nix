# Pure-Nix module-evaluation check for `services.korri.gameStream`.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-game-stream-module --no-link
{
  pkgs,
  korriGameStreamModule,
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

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriGameStreamModule
        baseModule
        overrides
      ];
    }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  failedAssertionMessages = cfg: map (a: a.message) (failedAssertions cfg);
  hasFailure = cfg: expected: builtins.any (m: lib.hasInfix expected m) (failedAssertionMessages cfg);

  sunshineApps = cfg: cfg.services.sunshine.applications.apps or [ ];
  firstApp = cfg: builtins.elemAt (sunshineApps cfg) 0;
  firstAppWrapper = cfg: builtins.readFile (firstApp cfg).cmd;

  baseline = evaluateWith {
    services.korri.gameStream.enable = true;
  };

  absolutePaths = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      runtimeDir = "/run/korri-game-stream";
      intentPath = "/run/korri-game-stream/next-launch.json";
      statusPath = "/run/korri-game-stream/status.json";
    };
  };

  userRuntimeSpecifierPaths = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      runtimeDir = "%t/korri-game-stream";
      intentPath = "%t/korri-game-stream/next-launch.json";
      statusPath = "%t/korri-game-stream/status.json";
    };
  };

  emptyAppName = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      appName = "";
    };
  };

  relativeRuntimeDir = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      runtimeDir = "run/korri-game-stream";
    };
  };

  homeSessionEnvFile = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      sessionEnvFile = "%h/.config/korri/game-stream.env";
    };
  };

  mismatchedIntentPath = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      runtimeDir = "/run/korri-game-stream";
      intentPath = "/tmp/next-launch.json";
    };
  };

  mismatchedStatusPath = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      runtimeDir = "/run/korri-game-stream";
      statusPath = "/tmp/status.json";
    };
  };

  sunshineDisabled = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      sunshine.enableApp = false;
    };
  };

  sessiondSocket = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      sessiond.socketPath = "%t/korri/sessiond.sock";
    };
  };

  extraEnvironment = evaluateWith {
    services.korri.gameStream = {
      enable = true;
      extraEnvironment.KORRI_ENABLED_PLUGINS = "@korri:gamescope";
    };
  };

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "baseline: NixOS assertions pass" (failedAssertions baseline == [ ]))
    (check "baseline: Sunshine app entry generated" (builtins.length (sunshineApps baseline) == 1))
    (check "baseline: Sunshine app uses Korri Stream name" (
      (firstApp baseline).name or null == "Korri Stream"
    ))
    (check "baseline: Sunshine app command is generated wrapper" (
      lib.hasInfix "korri-game-stream-runner" (firstAppWrapper baseline)
    ))
    (check "absolute paths: NixOS assertions pass" (failedAssertions absolutePaths == [ ]))
    (check "user runtime specifier paths: NixOS assertions pass" (
      failedAssertions userRuntimeSpecifierPaths == [ ]
    ))
    (check "sunshine opt-out: emits no Sunshine app" (sunshineApps sunshineDisabled == [ ]))
    (check "empty appName: assertion fires" (hasFailure emptyAppName "appName must not be empty"))
    (check "relative runtimeDir: assertion fires" (
      hasFailure relativeRuntimeDir "runtimeDir must be an absolute path or %t path"
    ))
    (check "sessionEnvFile %h: assertion fires" (
      hasFailure homeSessionEnvFile "sessionEnvFile must be an absolute path"
    ))
    (check "mismatched intentPath: assertion fires" (
      hasFailure mismatchedIntentPath "intentPath must live under runtimeDir"
    ))
    (check "mismatched statusPath: assertion fires" (
      hasFailure mismatchedStatusPath "statusPath must live under runtimeDir"
    ))
    (check "sessiond socket: NixOS assertions pass" (failedAssertions sessiondSocket == [ ]))
    (check "user runtime specifier paths: wrapper resolves %t from real user runtime" (
      lib.hasInfix "korri_user_runtime_dir=\"/run/user/$(id -u)\"" (
        firstAppWrapper userRuntimeSpecifierPaths
      )
      && lib.hasInfix "KORRI_GAME_STREAM_RUNTIME_DIR:=\"$korri_user_runtime_dir/korri-game-stream\"" (
        firstAppWrapper userRuntimeSpecifierPaths
      )
      && lib.hasInfix "KORRI_GAME_STREAM_INTENT_PATH=\"$korri_user_runtime_dir/korri-game-stream/next-launch.json\"" (
        firstAppWrapper userRuntimeSpecifierPaths
      )
      && lib.hasInfix "KORRI_GAME_STREAM_STATUS_PATH=\"$korri_user_runtime_dir/korri-game-stream/status.json\"" (
        firstAppWrapper userRuntimeSpecifierPaths
      )
      && !lib.hasInfix "%t/korri-game-stream" (firstAppWrapper userRuntimeSpecifierPaths)
    ))
    (check "sessiond socket: wrapper exports expanded KORRI_SESSIOND_SOCKET" (
      lib.hasInfix "KORRI_SESSIOND_SOCKET" (firstAppWrapper sessiondSocket)
      && lib.hasInfix "KORRI_SESSIOND_SOCKET=\"$korri_user_runtime_dir/korri/sessiond.sock\"" (
        firstAppWrapper sessiondSocket
      )
      && !lib.hasInfix "%t/korri/sessiond.sock" (firstAppWrapper sessiondSocket)
    ))
    (check "sessiond socket: no legacy URL/token env" (
      !lib.hasInfix "KORRI_SESSIOND_URL" (firstAppWrapper sessiondSocket)
      && !lib.hasInfix "KORRI_SESSIOND_TOKEN_FILE" (firstAppWrapper sessiondSocket)
    ))
    (check "extra environment: wrapper exports plugin registry env" (
      lib.hasInfix "KORRI_ENABLED_PLUGINS" (firstAppWrapper extraEnvironment)
      && lib.hasInfix "@korri:gamescope" (firstAppWrapper extraEnvironment)
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-game-stream module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-game-stream-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-game-stream module checks passed."
    touch $out
  ''
