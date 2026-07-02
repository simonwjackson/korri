{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.tailnet;
  inherit (lib)
    mkIf
    mkOption
    types
    optional
    optionals
    ;

  tailscaleFlags =
    optional cfg.acceptDns "--accept-dns=true"
    ++ optionals (cfg.hostname != null && cfg.hostname != "") [ "--hostname=${cfg.hostname}" ];
in
{
  key = "korri-tailnet";

  options.services.korri.tailnet = {
    enable = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Enable Korri's product-level tailnet client posture. Product profiles
        turn this on deliberately; importing the Korri aggregate only exposes
        the option surface and does not silently join or reconfigure a host.
      '';
    };

    package = mkOption {
      type = types.package;
      default = pkgs.tailscale;
      defaultText = "pkgs.tailscale";
      description = "Tailscale package used for the Korri tailnet client.";
    };

    acceptDns = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Accept Tailscale DNS/MagicDNS configuration so short tailnet peer names
        resolve through the trusted tailnet instead of falling through to LAN
        search domains.
      '';
    };

    hostname = mkOption {
      type = types.nullOr types.str;
      default = config.networking.hostName;
      defaultText = "config.networking.hostName";
      description = "Tailnet hostname advertised by this Korri device.";
    };

    useRoutingFeatures = mkOption {
      type = types.nullOr (
        types.enum [
          "none"
          "client"
          "server"
          "both"
        ]
      );
      default = "client";
      description = ''
        NixOS Tailscale routing feature mode for Korri devices. Product
        profiles default to client mode; platform adapters that need routing
        server behavior must opt in explicitly.
      '';
    };

    installCli = mkOption {
      type = types.bool;
      default = true;
      description = "Install the Tailscale CLI in the system profile.";
    };
  };

  config = mkIf cfg.enable {
    services.tailscale = {
      enable = true;
      package = cfg.package;
      extraUpFlags = tailscaleFlags;
      extraSetFlags = tailscaleFlags;
    }
    // lib.optionalAttrs (cfg.useRoutingFeatures != null) {
      useRoutingFeatures = cfg.useRoutingFeatures;
    };

    environment.systemPackages = mkIf cfg.installCli [ cfg.package ];
  };
}
