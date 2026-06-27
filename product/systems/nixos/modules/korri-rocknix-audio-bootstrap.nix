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
    concatMapStringsSep
    mkEnableOption
    mkIf
    mkMerge
    mkOption
    optionalString
    types
    ;

  socketFailureExitCode = if cfg.failOnSocketUnavailable == true then "1" else "0";
  hasClampDefaultSinkAction = builtins.any (action: action.kind == "clamp-default-sink") cfg.actions;
  failureCommand = action: if action.onFailure == "fail" then "exit 1" else "true";

  renderAction =
    action:
    if action.kind == "clamp-target-sink" then
      ''
        clamp_named_sink "$target_sink" || ${failureCommand action}
      ''
    else if action.kind == "load-alsa-sink-if-missing" then
      ''
        if ! sink_exists "$target_sink"; then
          ${pkgs.pulseaudio}/bin/pactl load-module module-alsa-sink \
            device=${lib.escapeShellArg action.pcm} \
            sink_name="$target_sink" \
            sink_properties=device.description=${lib.escapeShellArg action.description} \
            >/dev/null || {
              echo "korri-rocknix-audio-bootstrap: pactl load-module module-alsa-sink failed" >&2
              ${failureCommand action}
            }
        fi
      ''
    else if action.kind == "clamp-default-sink" then
      ''
        clamp_default_sink || ${failureCommand action}
      ''
    else if action.kind == "clamp-current-default-sink" then
      ''
        ${pkgs.pulseaudio}/bin/pactl set-sink-volume @DEFAULT_SINK@ "$korri_safe_default_sink_volume" >/dev/null 2>&1 || ${failureCommand action}
      ''
    else
      throw "Unsupported ROCKNIX audio bootstrap action kind `${action.kind}`";

  routeBootstrapScript = concatMapStringsSep "\n" renderAction cfg.actions;

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

    ${optionalString hasClampDefaultSinkAction ''
      clamp_default_sink() {
        for _ in $(${pkgs.coreutils}/bin/seq 1 40); do
          default_sink="$(${pkgs.pulseaudio}/bin/pactl get-default-sink 2>/dev/null || true)"
          case "$default_sink" in
            ""|auto_null*) ${pkgs.coreutils}/bin/sleep 0.25; continue ;;
          esac
          if ${pkgs.pulseaudio}/bin/pactl set-sink-volume "$default_sink" "$korri_safe_default_sink_volume" >/dev/null 2>&1; then
            return 0
          fi
          ${pkgs.coreutils}/bin/sleep 0.25
        done
        echo "korri-rocknix-audio-bootstrap: non-null default sink unavailable for safe volume clamp" >&2
        return 1
      }
    ''}

    ${routeBootstrapScript}
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
      type = types.enum [
        "user"
        "system"
      ];
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

    actions = mkOption {
      type = types.listOf (
        types.submodule {
          options = {
            kind = mkOption {
              type = types.enum [
                "clamp-target-sink"
                "load-alsa-sink-if-missing"
                "clamp-default-sink"
                "clamp-current-default-sink"
              ];
              description = "Route action rendered by the shared audio bootstrap script.";
            };

            onFailure = mkOption {
              type = types.enum [
                "continue"
                "fail"
              ];
              default = "continue";
              description = "Whether this route action failure should continue boot or fail the service.";
            };

            pcm = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "ALSA PCM device used by load-alsa-sink-if-missing.";
            };

            description = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "Pulse sink description used by load-alsa-sink-if-missing.";
            };
          };
        }
      );
      default = [ ];
      description = ''
        Ordered route actions rendered by the shared bootstrap script after
        Pulse readiness and helper definitions. Platform adapters select the
        actions; the module owns the shell implementation.
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
          assertion = cfg.actions != [ ];
          message = "services.korri.rocknixAudioBootstrap.actions must contain at least one route action when enabled.";
        }
      ]
      ++ map (action: {
        assertion =
          action.kind != "load-alsa-sink-if-missing"
          || (
            action.pcm != null && action.pcm != "" && action.description != null && action.description != ""
          );
        message = "load-alsa-sink-if-missing actions require non-empty pcm and description values.";
      }) cfg.actions;
    }
    (mkIf (cfg.serviceScope == "user") {
      systemd.user.services.korri-rocknix-audio-bootstrap = service;
    })
    (mkIf (cfg.serviceScope == "system") {
      systemd.services.korri-rocknix-audio-bootstrap = service;
    })
  ]);
}
