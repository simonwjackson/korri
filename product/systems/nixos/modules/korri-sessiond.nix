{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.sessiond;
  runtime = config.services.korri.runtime or { };
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-sessiond
      or (throw "Korri sessiond package is not available for system `${system}`. Set services.korri.sessiond.package explicitly.");

  inherit (lib) mkIf mkOption types;

  isAbsolutePath = path: lib.hasPrefix "/" path;
  isSocketPath = path: isAbsolutePath path || lib.hasPrefix "%t/" path;
  launchArtifactsDir = cfg.launchArtifactsDir;
  daemonLibraryRoot = lib.attrByPath [ "services" "korri" "daemon" "library" "root" ] null config;
  daemonLibrarySource = lib.attrByPath [ "services" "korri" "daemon" "library" "source" ] null config;
  # Inherit the rendered ordered config-graph roots from the korrid unit so
  # foreground session surfaces read the same effective config as the daemon.
  daemonKorridEnv =
    name:
    let
      userVal = lib.attrByPath [
        "systemd"
        "user"
        "services"
        "korrid"
        "environment"
        name
      ] null config;
      sysVal = lib.attrByPath [
        "systemd"
        "services"
        "korrid"
        "environment"
        name
      ] null config;
    in
    if userVal != null then userVal else sysVal;
  daemonConfigRoots = daemonKorridEnv "KORRI_CONFIG_ROOTS";
  # Mirror the dynamic config-roots signal dir as well, so sessiond resolves
  # the same effective roots as korrid after removable-media hotplug instead
  # of staying on stale static roots.
  daemonConfigRootsDir = daemonKorridEnv "KORRI_CONFIG_ROOTS_DIR";
  daemonRemovableMediaRoot = daemonKorridEnv "KORRI_REMOVABLE_MEDIA_ROOT";
  userKorridUnitPresent = lib.hasAttrByPath [
    "systemd"
    "user"
    "services"
    "korrid"
  ] config;

  waitForKorridScript = pkgs.writeShellScript "korri-sessiond-wait-for-korrid" ''
    set -eu
    attempt=0
    max=60
    while [ "$attempt" -lt "$max" ]; do
      if ${pkgs.curl}/bin/curl \
          --silent \
          --show-error \
          --fail \
          --connect-timeout 1 \
          --max-time 2 \
          http://127.0.0.1:3001/api/health > /dev/null; then
        echo "korri-sessiond: korrid loopback ready after attempt $attempt" >&2
        exit 0
      fi
      attempt=$((attempt + 1))
      ${pkgs.coreutils}/bin/sleep 0.25
    done

    echo "korri-sessiond: timed out waiting for korrid loopback" >&2
    exit 1
  '';

  kioskEnabled = lib.attrByPath [ "services" "korri" "compositor" "kiosk" "enable" ] false config;
  streamingEnabled = lib.attrByPath [ "services" "korri" "daemon" "streaming" "enable" ] false config;
  inferredRole = if kioskEnabled then "kiosk" else "source-machine";

  controlStartScript = pkgs.writeShellScript "korri-sessiond-control-start" ''
    set -eu
    : "''${KORRI_SESSIOND_SOCKET:?korri-sessiond: KORRI_SESSIOND_SOCKET is required}"

    attempt=0
    max=${toString cfg.controlStartRetries}
    while [ "$attempt" -lt "$max" ]; do
      if ${pkgs.curl}/bin/curl \
          --silent \
          --show-error \
          --fail \
          --connect-timeout 1 \
          --max-time 30 \
          --unix-socket "$KORRI_SESSIOND_SOCKET" \
          --request POST \
          "http://korri-sessiond/control/start" > /dev/null; then
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
      description = "Compatibility/default port used only when a non-socket debug path is deliberately injected.";
    };

    socketPath = mkOption {
      type = types.str;
      default = "%t/korri/sessiond.sock";
      description = "Unix socket path for same-user local sessiond IPC.";
    };

    runtimeDir = mkOption {
      type = types.str;
      default = "%t/korri";
      description = "Private user-runtime directory for sessiond sockets.";
    };

    role = mkOption {
      type = types.enum [ "kiosk" "source-machine" ];
      default = inferredRole;
      defaultText = lib.literalMD ''
        Inferred from `services.korri.compositor.kiosk.enable`: `"kiosk"` when
        true, `"source-machine"` otherwise.
      '';
      description = "Sessiond role selecting the foreground-session adapter.";
    };

    controlStartRetries = mkOption {
      type = types.ints.positive;
      default = 40;
      description = "ExecStartPost retry budget for the socket /control/start handshake.";
    };

    launchArtifactsDir = mkOption {
      type = types.str;
      default = runtime.launchArtifactsDir or "/run/korri/launch-artifacts";
      description = "Cross-session launch-artifact directory materialized by korrid and read by sessiond children.";
    };

    sunshineRuntimeStatusPath = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/korri-game-stream/status.json";
      description = "Optional source-machine runner-shaped status sidecar path.";
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Additional environment variables exported to the sessiond unit.";
    };

    path = mkOption {
      type = types.listOf types.package;
      default = [ ];
      description = "Packages added to the sessiond unit PATH and inherited by foreground children.";
    };

    esswayControl.enable = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Allow sessiond to mask/unmask the legacy system-level essway.service
        while entering/leaving the kiosk idle state. Disabled by default because
        rootless Korri user services must not control root-owned substrate units;
        platforms that still delegate this ownership to sessiond must opt in
        explicitly and provide the required privilege boundary.
      '';
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = isSocketPath cfg.socketPath;
        message = "services.korri.sessiond.socketPath must be an absolute path or %t path (got \"${cfg.socketPath}\").";
      }
      {
        assertion = isSocketPath cfg.runtimeDir;
        message = "services.korri.sessiond.runtimeDir must be an absolute path or %t path (got \"${cfg.runtimeDir}\").";
      }
      {
        assertion = isAbsolutePath launchArtifactsDir;
        message = "services.korri.sessiond.launchArtifactsDir must be an absolute path (got \"${launchArtifactsDir}\").";
      }
      {
        assertion = !(kioskEnabled && streamingEnabled);
        message = ''
          services.korri.compositor.kiosk.enable and services.korri.daemon.streaming.enable
          must not be enabled together. A host can run as either a Korri kiosk or as a
          source-machine streaming host, not both — sessiond enforces single-supervisor
          ownership.
        '';
      }
      {
        assertion = !(cfg.role == "kiosk" && streamingEnabled);
        message = ''
          services.korri.sessiond.role = "kiosk" is incompatible with
          services.korri.daemon.streaming.enable = true (only one foreground role per host).
        '';
      }
    ];

    environment.systemPackages = [ cfg.package ];

    systemd.user.services.korri-sessiond = {
      description = "Korri foreground-session supervisor (${cfg.role} role)";
      wantedBy = [ "korri-session.target" ];
      wants = lib.optionals userKorridUnitPresent [ "korrid.service" ];
      after = [ "network.target" ] ++ lib.optionals userKorridUnitPresent [ "korrid.service" ];
      path = cfg.path ++ [ pkgs.util-linux ];
      environment = {
        KORRI_SESSIOND_ROLE = cfg.role;
        KORRI_SESSIOND_PORT = toString cfg.port;
        KORRI_SESSIOND_SOCKET = cfg.socketPath;
        KORRI_SESSIOND_ESSWAY_CONTROL = if cfg.esswayControl.enable then "1" else "0";
        KORRI_LAUNCH_ARTIFACTS_DIR = launchArtifactsDir;
      }
      // (lib.optionalAttrs (daemonConfigRoots != null) {
        KORRI_CONFIG_ROOTS = daemonConfigRoots;
      })
      // (lib.optionalAttrs (daemonConfigRootsDir != null) {
        KORRI_CONFIG_ROOTS_DIR = daemonConfigRootsDir;
      })
      // (lib.optionalAttrs (daemonRemovableMediaRoot != null) {
        KORRI_REMOVABLE_MEDIA_ROOT = daemonRemovableMediaRoot;
      })
      // (lib.optionalAttrs (daemonLibraryRoot != null) {
        KORRI_LIBRARY_ROOT = daemonLibraryRoot;
      })
      // (lib.optionalAttrs (daemonLibrarySource != null) {
        KORRI_LIBRARY_SOURCE = daemonLibrarySource;
      })
      // (lib.optionalAttrs (cfg.sunshineRuntimeStatusPath != null) {
        KORRI_GAME_STREAM_STATUS_PATH = cfg.sunshineRuntimeStatusPath;
      })
      // cfg.extraEnvironment;
      serviceConfig = {
        Type = "simple";
        ExecStartPre = lib.optionals userKorridUnitPresent [
          "${waitForKorridScript}"
        ];
        ExecStart = "${cfg.package}/bin/korri-sessiond";
        ExecStartPost = "${controlStartScript}";
        Restart = "on-failure";
        RestartSec = "2s";
        RuntimeDirectory = "korri";
        RuntimeDirectoryMode = "0700";
        PrivateTmp = true;
        # Sessiond owns foreground app launches. Some launch adapters need to
        # cross the system/user boundary through tightly-scoped helpers. NixOS'
        # setuid sudo wrapper does not work inside ProtectSystem remounts, and
        # NoNewPrivileges blocks setuid before those narrow policy rules can
        # apply, so leave both disabled here and keep privilege boundaries on
        # the helpers.
        ProtectSystem = false;
        ReadWritePaths = [ launchArtifactsDir ];
        ProtectHome = false;
        NoNewPrivileges = false;
        MemoryDenyWriteExecute = false;
      };
    };
  };
}
