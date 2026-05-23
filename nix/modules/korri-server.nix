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
    optionalAttrs
    types
    ;

  isSystemMode = cfg.serviceMode == "system";
  systemRuntimeDirName = "korri-game-stream";
  systemRuntimeDir = "/run/${systemRuntimeDirName}";
  serverStateDirName = "korri-server";
  serverStateDir = "/var/lib/${serverStateDirName}";
  serverCacheDirName = "korri-server";
  serverCacheDir = "/var/cache/${serverCacheDirName}";
  bunTranspilerCacheDir = "${serverCacheDir}/bun-transpiler-cache";
  userRuntimeDir = "%t/korri-game-stream";

  runtimeDir = cfg.streamHost.runtimeDir;
  intentPath = cfg.streamHost.intentPath;
  statusPath = cfg.streamHost.statusPath;
  isDefaultSystemRuntimeDir = isSystemMode && runtimeDir == systemRuntimeDir;

  configuredUserHome =
    if cfg.user != null && cfg.user != "" then
      (config.users.users.${cfg.user} or { }).home or null
    else
      null;

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

  hasPlaceholder = path: lib.hasInfix "%" path;
  isAbsolutePath = path: lib.hasPrefix "/" path;
  isUserSpecifierPath = path: lib.hasPrefix "%t/" path || lib.hasPrefix "%h/" path;

  isLoopbackHost = cfg.host == "127.0.0.1" || cfg.host == "::1" || cfg.host == "localhost";

  serverEnv = {
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
    KORRI_GAME_STREAM_RUNTIME_DIR = runtimeDir;
    KORRI_GAME_STREAM_INTENT_PATH = intentPath;
    KORRI_GAME_STREAM_STATUS_PATH = statusPath;
  }
  // optionalAttrs isSystemMode {
    HOME = serverStateDir;
    XDG_CACHE_HOME = serverCacheDir;
    BUN_RUNTIME_TRANSPILER_CACHE_PATH = bunTranspilerCacheDir;
  };
in
{
  imports = [
    (import ./korri-game-stream.nix { inherit korri; })
    korri.nixosModules.korri-cli
  ];

  options.services.korri.server = {
    enable = lib.mkEnableOption "Korri headless server control plane";

    package = mkOption {
      type = types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-server";
      description = "Korri server package that provides the headless control-plane runtime.";
    };

    serviceMode = mkOption {
      type = types.enum [
        "system"
        "user"
      ];
      default = "user";
      description = ''
        Lifecycle scope for the korri-server unit.

        `"user"` (default) emits a `systemd.user.services.korri-server` unit that
        starts when the configured user's manager reaches `default.target`. This
        preserves existing behavior for hosts where Korri is co-located with an
        interactive session.

        `"system"` emits a boot-scoped `systemd.services.korri-server` unit that
        starts under `multi-user.target` and runs as the configured non-root
        `services.korri.server.user`. Use this for always-on stream hosts.
        Sunshine and `services.korri.gameStream` remain session-scoped in both
        modes.
      '';
    };

    user = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "korri";
      description = ''
        Unix user the korri-server unit runs as in `serviceMode = "system"`.
        Must be a configured non-root user that matches the user expected to
        launch the Sunshine-backed stream runner, because the launch-intent
        trust contract relies on shared ownership.
      '';
    };

    group = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "users";
      description = "Unix group the korri-server unit runs as in `serviceMode = \"system\"`.";
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
        default =
          if isSystemMode then
            (
              if configuredUserHome != null then
                "${configuredUserHome}/.local/share/korri/library"
              else
                throw ''
                  services.korri.server.library.root could not be derived because
                  services.korri.server.user="${toString cfg.user}" has no declared
                  home directory. Set services.korri.server.library.root explicitly to
                  an absolute path that the configured user can read and write.
                ''
            )
          else
            "%h/.local/share/korri/library";
        defaultText = lib.literalExpression ''
          if serviceMode == "system" then "''${configuredUser.home}/.local/share/korri/library"
          else "%h/.local/share/korri/library"
        '';
        description = ''
          Library root used by korri-server.

          In `serviceMode = "user"`, defaults to `%h/.local/share/korri/library`
          which the user manager expands per session.

          In `serviceMode = "system"`, the systemd specifier `%h` resolves to
          root's home and is unsafe. The default is derived from
          `config.users.users.<services.korri.server.user>.home`. If that home
          cannot be resolved, set this option explicitly to an absolute path.
        '';
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
        default = if isSystemMode then systemRuntimeDir else userRuntimeDir;
        defaultText = lib.literalExpression ''
          if serviceMode == "system" then "/run/korri-game-stream"
          else "%t/korri-game-stream"
        '';
        description = ''
          Private runtime directory shared by korri-server and the Sunshine-launched
          stream runner.

          In system mode the default is `/run/korri-game-stream`, created and owned
          via `systemd.tmpfiles` so its lifetime is decoupled from the server unit.

          In user mode the default is `%t/korri-game-stream`, expanded by the user
          manager to `$XDG_RUNTIME_DIR/korri-game-stream`.
        '';
      };

      intentPath = mkOption {
        type = types.str;
        default = "${cfg.streamHost.runtimeDir}/next-launch.json";
        defaultText = lib.literalExpression ''"''${runtimeDir}/next-launch.json"'';
        description = "Shared one-shot launch intent path written by the server and consumed by the stream runner.";
      };

      statusPath = mkOption {
        type = types.str;
        default = "${cfg.streamHost.runtimeDir}/status.json";
        defaultText = lib.literalExpression ''"''${runtimeDir}/status.json"'';
        description = "Shared runner status path read by the server and written by the stream runner.";
      };

    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = !isSystemMode || (cfg.user != null && cfg.user != "");
        message = ''
          services.korri.server.serviceMode = "system" requires services.korri.server.user
          to be set to a configured non-root Unix user. The system service must run as
          the same user expected to launch the Sunshine-backed stream runner, because
          the launch-intent trust contract relies on shared file ownership.
        '';
      }
      {
        assertion = !isSystemMode || cfg.user != "root";
        message = ''
          services.korri.server.user = "root" is not supported when serviceMode = "system".
          Configure a non-root Unix user that owns the Sunshine session and the Korri
          library directory.
        '';
      }
      {
        assertion = !isSystemMode || !(hasPlaceholder runtimeDir);
        message = ''
          services.korri.server.streamHost.runtimeDir = "${runtimeDir}" uses a systemd
          user specifier such as %t or %h, which is unsafe in
          serviceMode = "system" because it resolves against the system manager rather
          than the configured user. Use an absolute path like /run/korri-game-stream.
        '';
      }
      {
        assertion = !isSystemMode || !(hasPlaceholder intentPath);
        message = ''
          services.korri.server.streamHost.intentPath = "${intentPath}" uses a systemd
          user specifier that is unsafe in serviceMode = "system". Use an absolute path
          under services.korri.server.streamHost.runtimeDir.
        '';
      }
      {
        assertion = !isSystemMode || !(hasPlaceholder statusPath);
        message = ''
          services.korri.server.streamHost.statusPath = "${statusPath}" uses a systemd
          user specifier that is unsafe in serviceMode = "system". Use an absolute path
          under services.korri.server.streamHost.runtimeDir.
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath runtimeDir;
        message = ''
          services.korri.server.streamHost.runtimeDir must be an absolute path in
          serviceMode = "system" (got "${runtimeDir}").
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath intentPath;
        message = ''
          services.korri.server.streamHost.intentPath must be an absolute path in
          serviceMode = "system" (got "${intentPath}").
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath statusPath;
        message = ''
          services.korri.server.streamHost.statusPath must be an absolute path in
          serviceMode = "system" (got "${statusPath}").
        '';
      }
      {
        assertion =
          !cfg.streamHost.enable
          || isUserSpecifierPath intentPath
          || lib.hasPrefix "${runtimeDir}/" intentPath;
        message = ''
          services.korri.server.streamHost.intentPath = "${intentPath}" must live under
          services.korri.server.streamHost.runtimeDir = "${runtimeDir}" so the
          tmpfiles-managed private runtime directory protects intent ownership.
        '';
      }
      {
        assertion =
          !cfg.streamHost.enable
          || isUserSpecifierPath statusPath
          || lib.hasPrefix "${runtimeDir}/" statusPath;
        message = ''
          services.korri.server.streamHost.statusPath = "${statusPath}" must live under
          services.korri.server.streamHost.runtimeDir = "${runtimeDir}" so the
          tmpfiles-managed private runtime directory protects status ownership.
        '';
      }
    ];

    warnings =
      lib.optional (isSystemMode && cfg.openFirewall && !isLoopbackHost && cfg.firewallInterfaces == [ ])
        ''
          services.korri.server is exposing host "${cfg.host}" on the global firewall in
          system mode. Set services.korri.server.firewallInterfaces to a trusted
          interface (e.g. [ "tailscale0" ]) to scope LAN exposure.
        ''
      ++
        lib.optional
          (
            (config.services.korri.headlessSource.enable or false)
            && (config.services.korri.headlessSource.port or null) == cfg.port
          )
          ''
            services.korri.server and services.korri.headlessSource are both enabled on
            port ${toString cfg.port}. The legacy headlessSource module is superseded by
            services.korri.server -- disable one of them to avoid binding the same port
            and advertising duplicate mDNS records.
          '';

    environment.systemPackages = [ cfg.package ];

    services.korri.cli.enable = lib.mkDefault true;

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
      runtimeDir = runtimeDir;
      intentPath = intentPath;
      statusPath = statusPath;
    };

    systemd.tmpfiles.settings =
      mkIf (isSystemMode && cfg.streamHost.enable && isDefaultSystemRuntimeDir)
        {
          "10-korri-server".${systemRuntimeDir}.d = {
            user = cfg.user;
            group = if cfg.group != null then cfg.group else cfg.user;
            mode = "0700";
            age = "-";
          };
        };

    systemd.user.services = mkIf (!isSystemMode) {
      korri-server = {
        description = "Korri headless server control plane";
        wantedBy = [ "default.target" ];
        environment = serverEnv;
        serviceConfig = {
          ExecStartPre = "${pkgs.coreutils}/bin/install -d -m 700 ${runtimeDir}";
          ExecStart = "${cfg.package}/bin/korri-server";
          Restart = "on-failure";
          RestartSec = 2;
        };
      };
    };

    systemd.services = mkIf isSystemMode {
      korri-server = {
        description = "Korri headless server control plane";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" ];
        environment = serverEnv;
        serviceConfig = {
          ExecStartPre = [
            "${pkgs.coreutils}/bin/install -d -m 700 ${cfg.library.root}"
            "${pkgs.coreutils}/bin/install -d -m 700 ${bunTranspilerCacheDir}"
          ];
          ExecStart = "${cfg.package}/bin/korri-server";
          Restart = "on-failure";
          RestartSec = 2;
          User = cfg.user;
          Group = if cfg.group != null then cfg.group else cfg.user;
          StateDirectory = serverStateDirName;
          StateDirectoryMode = "0700";
          CacheDirectory = serverCacheDirName;
          CacheDirectoryMode = "0700";
          NoNewPrivileges = true;
          PrivateTmp = true;
          ProtectSystem = "strict";
          ProtectHome = "read-only";
          ProtectKernelTunables = true;
          ProtectKernelModules = true;
          ProtectControlGroups = true;
          RestrictSUIDSGID = true;
          RestrictRealtime = true;
          LockPersonality = true;
          MemoryDenyWriteExecute = false;
          SystemCallArchitectures = "native";
          RestrictAddressFamilies = [
            "AF_UNIX"
            "AF_INET"
            "AF_INET6"
            "AF_NETLINK"
          ];
        }
        // optionalAttrs isDefaultSystemRuntimeDir {
          RuntimeDirectory = systemRuntimeDirName;
          RuntimeDirectoryMode = "0700";
          RuntimeDirectoryPreserve = "yes";
        };
      };
    };
  };
}
