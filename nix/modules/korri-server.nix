{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.server;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-server
      or (throw "Korri server package is not available for system `${system}`. Set services.korri.server.package explicitly.");

  inherit (lib)
    mkIf
    mkOption
    types
    ;

  runtimeDir = cfg.streamHost.runtimeDir;
  intentPath = cfg.streamHost.intentPath;
  statusPath = cfg.streamHost.statusPath;
  advertiseName =
    if cfg.advertise.name != null then
      cfg.advertise.name
    else
      "Korri Stream on ${config.networking.hostName}";
  serverId = if cfg.serverId != null then cfg.serverId else config.networking.hostName;
  firewallPorts = {
    allowedTCPPorts = [ cfg.port ];
    allowedUDPPorts = lib.mkIf cfg.advertise.enable [ 5353 ];
  };
in
{
  imports = [
    (import ./korri-game-stream.nix { inherit korri; })
  ];

  options.services.korri.server = {
    enable = lib.mkEnableOption "Korri headless server control plane";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-server";
      description = "Korri server package that provides the headless control-plane runtime.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = "Address for korri-server to bind. Use an explicit LAN/VPN address for trusted-LAN clients.";
    };

    port = mkOption {
      type = types.port;
      default = 3001;
      description = "Port for the Korri server RPC API and optional LAN advertisement.";
    };

    serverId = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Stable source/server identity. Defaults to the NixOS host name.";
    };

    library = {
      source = mkOption {
        type = types.enum [
          "proseql"
          "rocknix"
        ];
        default = "proseql";
        description = "Korri library source exposed through the server catalog RPC.";
      };

      root = mkOption {
        type = types.str;
        default = "%h/.local/share/korri/library";
        description = "Library root used by korri-server. Systemd user specifiers such as %h are supported.";
      };
    };

    streamControl = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = "Enable known-game stream prepare RPCs. Keep disabled unless the host is intentionally exposed on a trusted LAN/VPN.";
      };
    };

    sourceOnly = mkOption {
      type = types.bool;
      default = true;
      description = "Use the reduced source/server RPC contract instead of exposing app-local full library RPCs.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open the server RPC port and mDNS UDP port in the NixOS firewall.";
    };

    firewallInterfaces = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "tailscale0" ];
      description = "Optional interface names to scope firewall openings to. Empty means the global firewall when openFirewall is true.";
    };

    advertise = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = "Advertise this server on the LAN with mDNS/DNS-SD.";
      };

      name = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Human-readable LAN service name. Defaults to the NixOS host name.";
      };

      capabilities = mkOption {
        type = types.listOf types.str;
        default = [
          "stream"
          "source"
        ];
        description = "Capability labels advertised through mDNS TXT records.";
      };
    };

    streamHost = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = "Wire the generic Korri Sunshine stream app/runner to this server's intent and status paths.";
      };

      appName = mkOption {
        type = types.str;
        default = "Korri Stream";
        description = "Generic Sunshine application name used by Moonlight clients.";
      };

      runtimeDir = mkOption {
        type = types.str;
        default = "%t/korri-game-stream";
        description = "User-runtime directory shared by korri-server and the Sunshine-launched stream runner.";
      };

      intentPath = mkOption {
        type = types.str;
        default = "%t/korri-game-stream/next-launch.json";
        description = "Shared one-shot launch intent path written by the server and consumed by the stream runner.";
      };

      statusPath = mkOption {
        type = types.str;
        default = "%t/korri-game-stream/status.json";
        description = "Shared runner status path read by the server and written by the stream runner.";
      };

      intentMaxAgeSeconds = mkOption {
        type = types.ints.positive;
        default = 300;
        description = "Maximum age of a pending launch intent before the runner rejects and quarantines it.";
      };
    };
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    networking.firewall = mkIf cfg.openFirewall (
      if cfg.firewallInterfaces == [ ] then
        firewallPorts
      else
        {
          interfaces = lib.genAttrs cfg.firewallInterfaces (_: firewallPorts);
        }
    );

    services.korri.gameStream = mkIf cfg.streamHost.enable {
      enable = true;
      appName = cfg.streamHost.appName;
      intentPath = intentPath;
      statusPath = statusPath;
      intentMaxAgeSeconds = cfg.streamHost.intentMaxAgeSeconds;
    };

    systemd.user.services.korri-server = {
      description = "Korri headless server control plane";
      wantedBy = [ "default.target" ];
      environment = {
        HOST = cfg.host;
        PORT = toString cfg.port;
        KORRI_SERVER_ID = serverId;
        KORRI_SERVER_NAME = advertiseName;
        KORRI_SERVER_ADVERTISE_ENABLED = if cfg.advertise.enable then "1" else "0";
        KORRI_STREAM_ADVERTISE_NAME = advertiseName;
        KORRI_STREAM_ADVERTISE_HOST_ID = serverId;
        KORRI_STREAM_ADVERTISE_PORT = toString cfg.port;
        KORRI_STREAM_ADVERTISE_CAPABILITIES = lib.concatStringsSep "," cfg.advertise.capabilities;
        KORRI_STREAM_CONTROL_ENABLED = if cfg.streamControl.enable then "1" else "0";
        KORRI_HEADLESS_SOURCE_ONLY = if cfg.sourceOnly then "1" else "0";
        KORRI_LIBRARY_SOURCE = cfg.library.source;
        KORRI_LIBRARY_ROOT = cfg.library.root;
        KORRI_GAME_STREAM_INTENT_PATH = intentPath;
        KORRI_GAME_STREAM_STATUS_PATH = statusPath;
      };
      serviceConfig = {
        ExecStartPre = "${pkgs.coreutils}/bin/install -d -m 700 ${runtimeDir}";
        ExecStart = "${cfg.package}/bin/korri-server";
        Restart = "on-failure";
        RestartSec = 2;
      };
    };
  };
}
