{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.sessiond;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-sessiond
      or (throw "Korri sessiond package is not available for system `${system}`. Set services.korri.sessiond.package explicitly.");

  inherit (lib)
    mkIf
    mkOption
    types
    ;

  isAbsolutePath = path: lib.hasPrefix "/" path;

  # Infer role from compositor.kiosk.enable when it has been declared by
  # another loaded module; otherwise default to "kiosk" for safety so a
  # standalone sessiond module-eval is well-defined.
  kioskEnabled = lib.attrByPath [
    "services"
    "korri"
    "compositor"
    "kiosk"
    "enable"
  ] false config;
  streamingEnabled = lib.attrByPath [
    "services"
    "korri"
    "server"
    "streaming"
    "enable"
  ] false config;
  inferredRole = if kioskEnabled then "kiosk" else "source-machine";

  controlStartScript = pkgs.writeShellScript "korri-sessiond-control-start" ''
    set -eu

    if [ ! -r ${lib.escapeShellArg cfg.tokenFile} ]; then
      echo "korri-sessiond: token file not readable: ${cfg.tokenFile}" >&2
      exit 1
    fi

    token="$(${pkgs.coreutils}/bin/cat ${lib.escapeShellArg cfg.tokenFile})"
    url="http://127.0.0.1:${toString cfg.port}/control/start"

    # Bounded retry to handle the inevitable race between systemd
    # signalling ExecStartPost and the sessiond HTTP socket binding.
    # Each retry is 250ms; budget = ${toString cfg.controlStartRetries} attempts.
    attempt=0
    max=${toString cfg.controlStartRetries}
    while [ "$attempt" -lt "$max" ]; do
      if ${pkgs.curl}/bin/curl \
          --silent \
          --show-error \
          --fail \
          --max-time 5 \
          --header "x-korri-sessiond-token: $token" \
          --request POST \
          "$url" > /dev/null; then
        echo "korri-sessiond: /control/start succeeded after attempt $attempt" >&2
        exit 0
      fi
      attempt=$((attempt + 1))
      ${pkgs.coreutils}/bin/sleep 0.25
    done

    echo "korri-sessiond: /control/start did not succeed within $max attempts; sessiond remains stopped" >&2
    exit 1
  '';
in
{
  options.services.korri.sessiond = {
    enable = lib.mkEnableOption "Korri foreground-session supervisor daemon";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-sessiond";
      description = "Korri sessiond package providing the daemon binary.";
    };

    port = mkOption {
      type = types.port;
      default = 3003;
      description = "Loopback TCP port for the sessiond HTTP surface.";
    };

    tokenFile = mkOption {
      type = types.str;
      default = "/run/korri-sessiond/token";
      example = "/storage/.config/korri/sessiond-token";
      description = ''
        Path to the file containing the sessiond capability token. The unit
        passes this path via KORRI_SESSIOND_TOKEN_FILE and reads it for the
        ExecStartPost /control/start handshake. Must be an absolute path.
      '';
    };

    runtimeDir = mkOption {
      type = types.str;
      default = "/run/korri-sessiond";
      description = "Private runtime directory for sessiond.";
    };

    role = mkOption {
      type = types.enum [
        "kiosk"
        "source-machine"
      ];
      default = inferredRole;
      defaultText = lib.literalMD ''
        Inferred from `services.korri.compositor.kiosk.enable`: `"kiosk"` when
        true, `"source-machine"` otherwise.
      '';
      description = ''
        Sessiond role selecting the foreground-session adapter. Kiosk drives
        Electrobun + essway. Source-machine asserts an idle-blank invariant
        (Sway alive, no foreground app windows, no live gamescope-wl/
        gamescopereaper). This is a sessiond-local option used to set
        KORRI_SESSIOND_ROLE; it is NOT a deploy-role aggregate.
      '';
    };

    controlStartRetries = mkOption {
      type = types.ints.positive;
      default = 40;
      description = ''
        ExecStartPost retry budget for the /control/start handshake (each
        retry sleeps 250ms). Without this, every managed-launch request
        would fail closed because sessiond stays in mode `stopped` until
        /control/start fires successfully.
      '';
    };

    sunshineRuntimeStatusPath = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/korri-game-stream/status.json";
      description = ''
        Optional path the source-machine role writes its runner-shaped
        status.json sidecar to. When null on a source-machine host, the
        sessiond unit inherits KORRI_GAME_STREAM_STATUS_PATH from its
        environment if set; otherwise no sidecar is emitted.
      '';
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Additional environment variables exported to the sessiond unit.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = isAbsolutePath cfg.tokenFile;
        message = "services.korri.sessiond.tokenFile must be an absolute path (got \"${cfg.tokenFile}\").";
      }
      {
        assertion = isAbsolutePath cfg.runtimeDir;
        message = "services.korri.sessiond.runtimeDir must be an absolute path (got \"${cfg.runtimeDir}\").";
      }
      {
        assertion = !(kioskEnabled && streamingEnabled);
        message = ''
          services.korri.compositor.kiosk.enable and services.korri.server.streaming.enable
          must not be enabled together. A host can run as either a Korri kiosk or as a
          source-machine streaming host, not both \u2014 sessiond enforces single-supervisor
          ownership (origin R14).
        '';
      }
      {
        assertion = !(cfg.role == "kiosk" && streamingEnabled);
        message = ''
          services.korri.sessiond.role = "kiosk" is incompatible with
          services.korri.server.streaming.enable = true (only one foreground role per host).
        '';
      }
    ];

    environment.systemPackages = [ cfg.package ];

    systemd.tmpfiles.rules = [
      "d ${cfg.runtimeDir} 0700 root root -"
    ];

    systemd.services.korri-sessiond = {
      description = "Korri foreground-session supervisor (${cfg.role} role)";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        KORRI_SESSIOND_ROLE = cfg.role;
        KORRI_SESSIOND_PORT = toString cfg.port;
        KORRI_SESSIOND_TOKEN_FILE = cfg.tokenFile;
      }
      // (lib.optionalAttrs (cfg.sunshineRuntimeStatusPath != null) {
        KORRI_GAME_STREAM_STATUS_PATH = cfg.sunshineRuntimeStatusPath;
      })
      // cfg.extraEnvironment;

      serviceConfig = {
        Type = "simple";
        # Read the token at start time and export it; the daemon's main()
        # asserts KORRI_SESSIOND_TOKEN is set.
        ExecStart = pkgs.writeShellScript "korri-sessiond-start" ''
          set -eu
          if [ ! -r ${lib.escapeShellArg cfg.tokenFile} ]; then
            echo "korri-sessiond: token file not readable: ${cfg.tokenFile}" >&2
            exit 1
          fi
          KORRI_SESSIOND_TOKEN="$(${pkgs.coreutils}/bin/cat ${lib.escapeShellArg cfg.tokenFile})"
          export KORRI_SESSIOND_TOKEN
          exec ${cfg.package}/bin/korri-sessiond
        '';
        # /control/start handshake. Without this, sessiond stays in mode
        # "stopped" forever and every managed launch fails closed.
        ExecStartPost = "${controlStartScript}";
        Restart = "on-failure";
        RestartSec = "2s";
        # Filesystem isolation: sessiond only needs its runtime dir.
        RuntimeDirectory = lib.removePrefix "/run/" cfg.runtimeDir;
        StateDirectory = "korri-sessiond";
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        NoNewPrivileges = true;
      };
    };
  };
}
