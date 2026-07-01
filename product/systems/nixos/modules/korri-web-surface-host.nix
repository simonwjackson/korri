{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.webSurfaceHost;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-web-surface-host
      or (throw "Korri web-surface-host package is not available for system `${system}`. Set services.korri.webSurfaceHost.package explicitly.");

  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    optionalAttrs
    types
    ;
in
{
  _file = ./korri-web-surface-host.nix;
  key = ./korri-web-surface-host.nix;

  options.services.korri.webSurfaceHost = {
    enable = mkEnableOption "Korri web-surface host service";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-web-surface-host";
      description = "Korri web-surface host package to run.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Host address for the web-surface host.";
    };

    port = mkOption {
      type = types.port;
      default = 8099;
      description = "TCP port for the web-surface host.";
    };

    upstreamBaseUrl = mkOption {
      type = types.str;
      default = "http://127.0.0.1:${toString config.services.korri.daemon.port}";
      description = "Loopback korrid upstream URL proxied under /api.";
    };

    inputdUrl = mkOption {
      type = types.str;
      default = "ws://127.0.0.1:${toString config.services.korri.input.inputd.port}";
      description = "inputd WebSocket URL inlined into the web runtime config.";
    };

    statusFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Optional renderer readiness status file written by the host when the page beacons ready.";
    };

    environment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables for korri-web-surface-host.";
    };
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    systemd.user.services.korri-web-surface-host = {
      description = "Korri web-surface host";
      wantedBy = [ "korri-session.target" ];
      after = [ "korrid.service" ];
      wants = [ "korrid.service" ];
      before = [ "korri-sessiond.service" ];
      environment = {
        KORRI_WEB_SURFACE_HOST = cfg.host;
        KORRI_WEB_SURFACE_PORT = toString cfg.port;
        KORRI_LOOPBACK_BASE_URL = cfg.upstreamBaseUrl;
        KORRI_DESKTOP_INPUTD_URL = cfg.inputdUrl;
        KORRI_DESKTOP_PROFILE = "device";
      }
      // optionalAttrs (cfg.statusFile != null) {
        KORRI_DESKTOP_STATUS_FILE = cfg.statusFile;
      }
      // cfg.environment;
      serviceConfig = {
        ExecStart = "${cfg.package}/bin/korri-web-surface-host";
        Restart = "on-failure";
        RestartSec = 1;
        NoNewPrivileges = true;
      };
    };
  };
}
