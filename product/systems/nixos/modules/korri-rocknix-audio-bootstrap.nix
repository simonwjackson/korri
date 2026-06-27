# Shared ROCKNIX audio-bootstrap service.
#
# ROCKNIX guest platforms need a small product-owned audio safety gate: wait
# for the PulseAudio-compatible graph, select a declared sink, and clamp boot
# volume before foreground launch services proceed. The polling/clamp mechanics
# are shared; topology facts, route-specific handling, and systemd ordering stay
# in platform adapters.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.rocknixAudioBootstrap;

  inherit (lib)
    mkEnableOption
    mkIf
    mkMerge
    mkOption
    types
    ;

  socketFailureExitCode = if cfg.failOnSocketUnavailable == true then "1" else "0";

  audioBootstrapScript = pkgs.writeShellScript "korri-rocknix-audio-bootstrap" ''
    set -u

    target_sink=${lib.escapeShellArg cfg.targetSink}
    korri_safe_default_sink_volume=${lib.escapeShellArg cfg.safeVolume}

    for _ in $(${pkgs.coreutils}/bin/seq 1 60); do
      if ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
        break
      fi
      ${pkgs.coreutils}/bin/sleep 0.5
    done

    if ! ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
      echo "korri-rocknix-audio-bootstrap: PulseAudio socket unavailable at $PULSE_SERVER" >&2
      exit ${socketFailureExitCode}
    fi

    sink_exists() {
      ${pkgs.pulseaudio}/bin/pactl list short sinks \
        | ${pkgs.coreutils}/bin/cut -f2 \
        | ${pkgs.gnugrep}/bin/grep -Fxq -- "$1"
    }

    clamp_named_sink() {
      sink="$1"
      for _ in $(${pkgs.coreutils}/bin/seq 1 40); do
        if sink_exists "$sink"; then
          if ${pkgs.pulseaudio}/bin/pactl set-default-sink "$sink" >/dev/null 2>&1 \
            && ${pkgs.pulseaudio}/bin/pactl set-sink-volume "$sink" "$korri_safe_default_sink_volume" >/dev/null 2>&1; then
            return 0
          fi
        fi
        ${pkgs.coreutils}/bin/sleep 0.25
      done
      echo "korri-rocknix-audio-bootstrap: target sink $sink unavailable for safe volume clamp" >&2
      return 1
    }

    ${cfg.routeBootstrapScript}
  '';

  service = {
    description = "Bootstrap Korri ROCKNIX audio sink";
    environment.PULSE_SERVER = cfg.pulseServer;
    serviceConfig = {
      Type = "oneshot";
      ExecStart = audioBootstrapScript;
      RemainAfterExit = true;
    };
  };
in
{
  key = "korri-rocknix-audio-bootstrap";

  options.services.korri.rocknixAudioBootstrap = {
    enable = mkEnableOption "Korri ROCKNIX audio sink bootstrap";

    pulseServer = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "unix:%t/pulse/native";
      description = "PulseAudio-compatible socket used by the ROCKNIX audio bootstrap service.";
    };

    targetSink = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "alsa_output.platform-sound.stereo-fallback";
      description = "Declared PulseAudio sink that platform route handling should select and clamp.";
    };

    safeVolume = mkOption {
      type = types.str;
      default = "10%";
      description = "Safe boot volume applied to the selected audio sink.";
    };

    serviceScope = mkOption {
      type = types.enum [ "user" "system" ];
      default = "user";
      description = "Whether to render the bootstrap as a systemd user service or system service.";
    };

    failOnSocketUnavailable = mkOption {
      type = types.nullOr types.bool;
      default = null;
      description = ''
        Explicit socket-unavailable failure posture. Set true for hard-gated
        platforms such as RK3566, false for best-effort user-session platforms
        such as SM8550.
      '';
    };

    routeBootstrapScript = mkOption {
      type = types.nullOr types.lines;
      default = null;
      description = ''
        Platform-owned route script appended after the shared Pulse readiness
        gate and clamp_named_sink helper are defined. The script may use
        target_sink, korri_safe_default_sink_volume, sink_exists, and
        clamp_named_sink. It must not mutate service ordering or global audio
        services; it is responsible for whether sink clamp failures are fatal.
      '';
    };
  };

  config = mkIf cfg.enable (mkMerge [
    {
      assertions = [
        {
          assertion = cfg.pulseServer != null && cfg.pulseServer != "";
          message = "services.korri.rocknixAudioBootstrap.pulseServer must be set when enabled.";
        }
        {
          assertion = cfg.targetSink != null && cfg.targetSink != "";
          message = "services.korri.rocknixAudioBootstrap.targetSink must be set when enabled.";
        }
        {
          assertion = cfg.failOnSocketUnavailable != null;
          message = "services.korri.rocknixAudioBootstrap.failOnSocketUnavailable must be set explicitly when enabled.";
        }
        {
          assertion = cfg.routeBootstrapScript != null && cfg.routeBootstrapScript != "";
          message = "services.korri.rocknixAudioBootstrap.routeBootstrapScript must be set when enabled.";
        }
      ];
    }
    (mkIf (cfg.serviceScope == "user") {
      systemd.user.services.korri-rocknix-audio-bootstrap = service;
    })
    (mkIf (cfg.serviceScope == "system") {
      systemd.services.korri-rocknix-audio-bootstrap = service;
    })
  ]);
}
