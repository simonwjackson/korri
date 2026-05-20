{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.headlessSource;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  defaultPackage =
    packagesForSystem.korri-headless-tools
      or (throw "Korri headless tools package is not available for system `${system}`. Set services.korri.headlessSource.package explicitly.");

  inherit (lib)
    mkIf
    mkOption
    types
    ;

  advertiseName =
    if cfg.advertise.name != null then
      cfg.advertise.name
    else
      "Korri Stream on ${config.networking.hostName}";
  advertiseHostId =
    if cfg.advertise.hostId != null then cfg.advertise.hostId else config.networking.hostName;
in
{
  options.services.korri.headlessSource = {
    enable = lib.mkEnableOption "Korri headless source RPC API";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-headless-tools";
      description = "Korri package that provides the headless RPC API and LAN advertiser.";
    };

    host = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Address for the headless RPC API to bind.";
    };

    port = mkOption {
      type = types.port;
      default = 3001;
      description = "Port for the headless RPC API and LAN advertisement.";
    };

    librarySource = mkOption {
      type = types.enum [
        "proseql"
        "rocknix"
      ];
      default = "proseql";
      description = "Korri library source exposed through the source catalog RPC.";
    };

    libraryRoot = mkOption {
      type = types.str;
      default = "%h/.local/share/korri/library";
      description = "Library root used by the headless RPC API. Systemd user specifiers such as %h are supported.";
    };

    streamControl = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Enable the prepare RPC that stages known library game ids for the generic Sunshine stream app.";
      };
    };

    sourceOnly = mkOption {
      type = types.bool;
      default = true;
      description = "Disable legacy full-library RPC listing so LAN clients use the minimized source catalog.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open the RPC port and mDNS UDP port in the NixOS firewall.";
    };

    advertise = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Advertise this source on the LAN with mDNS/DNS-SD.";
      };

      name = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Human-readable LAN service name. Defaults to the NixOS host name.";
      };

      hostId = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Stable source identity advertised to clients. Defaults to the NixOS host name.";
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
  };

  config = mkIf cfg.enable {
    environment.systemPackages = [ cfg.package ];

    networking.firewall = mkIf cfg.openFirewall {
      allowedTCPPorts = [ cfg.port ];
      allowedUDPPorts = lib.mkIf cfg.advertise.enable [ 5353 ];
    };

    systemd.user.services.korri-api = {
      description = "Korri headless source RPC API";
      wantedBy = [ "default.target" ];
      serviceConfig = {
        ExecStartPre = "${pkgs.coreutils}/bin/install -d -m 700 ${cfg.libraryRoot}";
        ExecStart = "${cfg.package}/bin/korri-api";
        Restart = "on-failure";
        RestartSec = 2;
        Environment = [
          "HOST=${cfg.host}"
          "PORT=${toString cfg.port}"
          "KORRI_STREAM_CONTROL_ENABLED=${if cfg.streamControl.enable then "1" else "0"}"
          "KORRI_HEADLESS_SOURCE_ONLY=${if cfg.sourceOnly then "1" else "0"}"
          "KORRI_LIBRARY_SOURCE=${cfg.librarySource}"
          "KORRI_LIBRARY_ROOT=${cfg.libraryRoot}"
        ];
      };
    };

    systemd.user.services.korri-lan-stream-advertise = mkIf cfg.advertise.enable {
      description = "Advertise this host as a Korri stream source";
      after = [ "korri-api.service" ];
      wants = [ "korri-api.service" ];
      wantedBy = [ "default.target" ];
      serviceConfig = {
        ExecStart = "${cfg.package}/bin/korri-lan-stream-advertise";
        Restart = "on-failure";
        RestartSec = 2;
        Environment = [
          "KORRI_STREAM_ADVERTISE_NAME=${advertiseName}"
          "KORRI_STREAM_ADVERTISE_HOST_ID=${advertiseHostId}"
          "KORRI_STREAM_ADVERTISE_PORT=${toString cfg.port}"
          "KORRI_STREAM_ADVERTISE_CAPABILITIES=${lib.concatStringsSep "," cfg.advertise.capabilities}"
        ];
      };
    };
  };
}
