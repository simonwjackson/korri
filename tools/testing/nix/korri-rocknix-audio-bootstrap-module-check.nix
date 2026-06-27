# Pure-Nix module-evaluation check for `services.korri.rocknixAudioBootstrap`.
#
# Device-neutral: evaluates the shared ROCKNIX audio-bootstrap module against a
# minimal fixture host and asserts the rendered service scope, socket failure
# posture, and route-action contract independently from any platform adapter.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-rocknix-audio-bootstrap-module --no-link
{
  pkgs,
  korriRocknixAudioBootstrapModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "korri-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriRocknixAudioBootstrapModule
        baseModule
        overrides
      ];
    }).config;

  userScope = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "test-user-sink";
      safeVolume = "15%";
      serviceScope = "user";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "clamp-target-sink";
          onFailure = "continue";
        }
        {
          kind = "clamp-current-default-sink";
          onFailure = "continue";
        }
      ];
    };
  };

  systemScope = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:/run/korri-test/pulse/native";
      targetSink = "test-system-sink";
      serviceScope = "system";
      failOnSocketUnavailable = true;
      actions = [
        {
          kind = "clamp-target-sink";
          onFailure = "continue";
        }
      ];
    };
  };

  hardFailRoute = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:/run/korri-test/pulse/native";
      targetSink = "test-hard-fail-sink";
      serviceScope = "system";
      failOnSocketUnavailable = true;
      actions = [
        {
          kind = "clamp-target-sink";
          onFailure = "fail";
        }
      ];
    };
  };

  manualPcmRoute = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          pcm = "hw:0,0";
          description = "Manual Sink";
          onFailure = "continue";
        }
        {
          kind = "clamp-target-sink";
          onFailure = "continue";
        }
      ];
    };
  };

  defaultSinkRoute = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "fallback-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "clamp-default-sink";
          onFailure = "continue";
        }
      ];
    };
  };

  currentDefaultFailRoute = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "current-default-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "clamp-current-default-sink";
          onFailure = "fail";
        }
      ];
    };
  };

  manualPcmFailRoute = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-fail-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          pcm = "hw:1,0";
          description = "Manual Fail Sink";
          onFailure = "fail";
        }
      ];
    };
  };

  disabled = evaluateWith { };

  missingPulseServer = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      targetSink = "test-sink";
      failOnSocketUnavailable = false;
      actions = [ { kind = "clamp-target-sink"; } ];
    };
  };

  emptyPulseServer = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "";
      targetSink = "test-sink";
      failOnSocketUnavailable = false;
      actions = [ { kind = "clamp-target-sink"; } ];
    };
  };

  missingTargetSink = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      failOnSocketUnavailable = false;
      actions = [ { kind = "clamp-target-sink"; } ];
    };
  };

  emptyTargetSink = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "";
      failOnSocketUnavailable = false;
      actions = [ { kind = "clamp-target-sink"; } ];
    };
  };

  missingFailurePosture = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "test-sink";
      actions = [ { kind = "clamp-target-sink"; } ];
    };
  };

  emptyActions = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "test-sink";
      failOnSocketUnavailable = false;
      actions = [ ];
    };
  };

  missingManualPcm = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          description = "Manual Sink";
        }
      ];
    };
  };

  emptyManualPcm = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          pcm = "";
          description = "Manual Sink";
        }
      ];
    };
  };

  missingManualDescription = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          pcm = "hw:0,0";
        }
      ];
    };
  };

  emptyManualDescription = evaluateWith {
    services.korri.rocknixAudioBootstrap = {
      enable = true;
      pulseServer = "unix:%t/pulse/native";
      targetSink = "manual-sink";
      failOnSocketUnavailable = false;
      actions = [
        {
          kind = "load-alsa-sink-if-missing";
          pcm = "hw:0,0";
          description = "";
        }
      ];
    };
  };

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  userService = cfg: cfg.systemd.user.services.korri-rocknix-audio-bootstrap or { };
  systemService = cfg: cfg.systemd.services.korri-rocknix-audio-bootstrap or { };
  scriptText = service: builtins.readFile (service.serviceConfig.ExecStart or "");

  userScript = scriptText (userService userScope);
  systemScript = scriptText (systemService systemScope);
  hardFailRouteScript = scriptText (systemService hardFailRoute);
  manualPcmScript = scriptText (userService manualPcmRoute);
  defaultSinkScript = scriptText (userService defaultSinkRoute);
  currentDefaultFailScript = scriptText (userService currentDefaultFailRoute);
  manualPcmFailScript = scriptText (userService manualPcmFailRoute);

  socketFailureBlockHasExit =
    exitCode: script:
    let
      marker = "PulseAudio socket unavailable at $PULSE_SERVER";
      parts = lib.splitString marker script;
      blockTail = if builtins.length parts > 1 then builtins.elemAt parts 1 else "";
      nearbyLines = builtins.concatStringsSep "\n" (lib.take 3 (lib.splitString "\n" blockTail));
    in
    builtins.length parts == 2 && lib.hasInfix "exit ${exitCode}" nearbyLines;

  loadFailureBlockHasCommand =
    command: script:
    let
      marker = "bin/pactl load-module module-alsa-sink";
      parts = lib.splitString marker script;
      blockTail = if builtins.length parts > 1 then builtins.elemAt parts 1 else "";
      nearbyLines = builtins.concatStringsSep "\n" (lib.take 8 (lib.splitString "\n" blockTail));
    in
    builtins.length parts == 2 && lib.hasInfix command nearbyLines;

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "user scope renders only a user service" (
      userScope.systemd.user.services ? korri-rocknix-audio-bootstrap
      && !(userScope.systemd.services ? korri-rocknix-audio-bootstrap)
      && ((userService userScope).environment.PULSE_SERVER or null) == "unix:%t/pulse/native"
      && ((userService userScope).serviceConfig.Type or null) == "oneshot"
      && ((userService userScope).serviceConfig.RemainAfterExit or false) == true
    ))
    (check "system scope renders only a system service" (
      systemScope.systemd.services ? korri-rocknix-audio-bootstrap
      && !(systemScope.systemd.user.services ? korri-rocknix-audio-bootstrap)
      &&
        ((systemService systemScope).environment.PULSE_SERVER or null)
        == "unix:/run/korri-test/pulse/native"
      && ((systemService systemScope).serviceConfig.Type or null) == "oneshot"
      && ((systemService systemScope).serviceConfig.RemainAfterExit or false) == true
    ))
    (check "disabled module renders no bootstrap service" (
      !(disabled.systemd.user.services ? korri-rocknix-audio-bootstrap)
      && !(disabled.systemd.services ? korri-rocknix-audio-bootstrap)
    ))
    (check "user script carries shared sink helpers and safe volume" (
      lib.hasInfix "target_sink=test-user-sink" userScript
      && lib.hasInfix "korri_safe_default_sink_volume=15%" userScript
      && lib.hasInfix "sink_exists()" userScript
      && lib.hasInfix "clamp_named_sink()" userScript
      && lib.hasInfix "set-default-sink" userScript
      && lib.hasInfix "set-sink-volume" userScript
    ))
    (check "route actions render expected shell" (
      lib.hasInfix ''clamp_named_sink "$target_sink" || true'' userScript
      && lib.hasInfix ''set-sink-volume @DEFAULT_SINK@ "$korri_safe_default_sink_volume" >/dev/null 2>&1 || true'' userScript
      && lib.hasInfix ''set-sink-volume @DEFAULT_SINK@ "$korri_safe_default_sink_volume" >/dev/null 2>&1 || exit 1'' currentDefaultFailScript
      && lib.hasInfix ''clamp_named_sink "$target_sink" || exit 1'' hardFailRouteScript
      && lib.hasInfix "load-module module-alsa-sink" manualPcmScript
      && lib.hasInfix "device=hw:0,0" manualPcmScript
      && lib.hasInfix "sink_properties=device.description='Manual Sink'" manualPcmScript
      && loadFailureBlockHasCommand "true" manualPcmScript
      && lib.hasInfix "Manual Fail Sink" manualPcmFailScript
      && loadFailureBlockHasCommand "exit 1" manualPcmFailScript
      && lib.hasInfix "clamp_default_sink()" defaultSinkScript
      && lib.hasInfix "clamp_default_sink || true" defaultSinkScript
    ))
    (check "socket failure posture controls generated exit code" (
      socketFailureBlockHasExit "0" userScript && socketFailureBlockHasExit "1" systemScript
    ))
    (check "shared module omits default-sink helper unless requested" (
      !(lib.hasInfix "clamp_default_sink" userScript) && !(lib.hasInfix "clamp_default_sink" systemScript)
    ))
    (check "enabled module requires pulseServer" (failedAssertions missingPulseServer != [ ]))
    (check "enabled module rejects empty pulseServer" (failedAssertions emptyPulseServer != [ ]))
    (check "enabled module requires targetSink" (failedAssertions missingTargetSink != [ ]))
    (check "enabled module rejects empty targetSink" (failedAssertions emptyTargetSink != [ ]))
    (check "enabled module requires explicit socket failure posture" (
      failedAssertions missingFailurePosture != [ ]
    ))
    (check "enabled module requires at least one route action" (failedAssertions emptyActions != [ ]))
    (check "manual PCM action requires a PCM device" (failedAssertions missingManualPcm != [ ]))
    (check "manual PCM action rejects an empty PCM device" (failedAssertions emptyManualPcm != [ ]))
    (check "manual PCM action requires a description" (
      failedAssertions missingManualDescription != [ ]
    ))
    (check "manual PCM action rejects an empty description" (
      failedAssertions emptyManualDescription != [ ]
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri ROCKNIX audio-bootstrap module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-audio-bootstrap-module-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'SUMMARY'
    Korri ROCKNIX audio-bootstrap module invariants passed.
    SUMMARY
  ''
