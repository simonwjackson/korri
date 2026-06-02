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
  desktopAppCommand = pkgs.writeShellScript "korri-sunshine-desktop-app" ''
    set -eu
    echo "korri-sunshine-desktop-app: keeping existing compositor session alive for Moonlight" >&2
    trap 'exit 0' INT TERM
    while true; do
      ${pkgs.coreutils}/bin/sleep 3600 &
      wait $! || true
    done
  '';

  runtimeDir = cfg.streaming.runtimeDir;
  intentPath = cfg.streaming.intentPath;
  statusPath = cfg.streaming.statusPath;
  launchArtifactsDir = cfg.launchArtifactsDir;
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
    # Federation v1: every korri-server advertises unconditionally
    # (cfg.advertise.enable retired in R14 / zero-backwards-compat).
    # mDNS firewall opening is always needed on library-bearing hosts.
    allowedUDPPorts = [ 5353 ];
  };

  hasPlaceholder = path: lib.hasInfix "%" path;
  isAbsolutePath = path: lib.hasPrefix "/" path;
  isUserSpecifierPath = path: lib.hasPrefix "%t/" path || lib.hasPrefix "%h/" path;

  isLoopbackHost = cfg.host == "127.0.0.1" || cfg.host == "::1" || cfg.host == "localhost";

  publicApiBaseUrlRaw = cfg.publicApiBaseUrl;
  hasPublicApiBaseUrl = publicApiBaseUrlRaw != null;
  publicApiBaseUrlHasWhitespace =
    hasPublicApiBaseUrl
    && lib.any (char: lib.hasInfix char publicApiBaseUrlRaw) [
      " "
      "\t"
      "\n"
      "\r"
    ];
  publicApiBaseUrlMatch =
    if hasPublicApiBaseUrl && !publicApiBaseUrlHasWhitespace then
      builtins.match "^(https?)://([^/?#]*)(/[^?#]*)?(\\?[^#]*)?(#.*)?$" publicApiBaseUrlRaw
    else
      null;
  publicApiBaseUrlParts =
    if publicApiBaseUrlMatch == null then
      null
    else
      {
        scheme = builtins.elemAt publicApiBaseUrlMatch 0;
        authority = builtins.elemAt publicApiBaseUrlMatch 1;
        query = builtins.elemAt publicApiBaseUrlMatch 3;
        fragment = builtins.elemAt publicApiBaseUrlMatch 4;
      };
  publicApiBaseUrlHasCredentials =
    publicApiBaseUrlParts != null && lib.hasInfix "@" publicApiBaseUrlParts.authority;
  publicApiBaseUrlHostMatch =
    if publicApiBaseUrlParts == null || publicApiBaseUrlHasCredentials then
      null
    else if lib.hasPrefix "[" publicApiBaseUrlParts.authority then
      builtins.match "^(\\[[^]]+\\])(:[0-9]+)?$" publicApiBaseUrlParts.authority
    else
      builtins.match "^([^:]+)(:[0-9]+)?$" publicApiBaseUrlParts.authority;
  publicApiBaseUrlHost =
    if publicApiBaseUrlHostMatch == null then
      null
    else
      lib.toLower (builtins.elemAt publicApiBaseUrlHostMatch 0);
  publicApiBaseUrlHasQueryOrFragment =
    publicApiBaseUrlParts != null
    && (
      (publicApiBaseUrlParts.query != null && publicApiBaseUrlParts.query != "")
      || (publicApiBaseUrlParts.fragment != null && publicApiBaseUrlParts.fragment != "")
    );
  publicApiBaseUrlIsPrivateHttpHost =
    if publicApiBaseUrlHost == null then
      false
    else if publicApiBaseUrlHost == "localhost" || publicApiBaseUrlHost == "[::1]" then
      true
    else if
      lib.hasSuffix ".local" publicApiBaseUrlHost || lib.hasSuffix ".lan" publicApiBaseUrlHost
    then
      true
    else
      let
        ipv4 = builtins.match "^([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})$" publicApiBaseUrlHost;
      in
      if ipv4 == null then
        false
      else
        let
          octets = map lib.toInt ipv4;
          a = builtins.elemAt octets 0;
          b = builtins.elemAt octets 1;
        in
        lib.all (o: o >= 0 && o <= 255) octets
        && (
          a == 127
          || a == 10
          || (a == 172 && b >= 16 && b <= 31)
          || (a == 192 && b == 168)
          || (a == 169 && b == 254)
        );

  serverEnv = {
    HOST = cfg.host;
    PORT = toString cfg.port;
    KORRI_SERVER_ID = serverId;
    KORRI_SERVER_NAME = advertiseName;
    # KORRI_SERVER_ADVERTISE_ENABLED removed in federation v1 (R14).
    KORRI_STREAM_ADVERTISE_NAME = advertiseName;
    KORRI_STREAM_ADVERTISE_HOST_ID = serverId;
    KORRI_STREAM_ADVERTISE_PORT = toString cfg.port;
    KORRI_STREAM_ADVERTISE_CAPABILITIES = lib.concatStringsSep "," cfg.advertise.capabilities;
    KORRI_STREAM_CONTROL_ENABLED = if cfg.streamControl.enable then "1" else "0";
    # KORRI_HEADLESS_SOURCE_ONLY retired in federation v1 (R14).
    KORRI_LIBRARY_SOURCE = cfg.library.source;
    KORRI_LIBRARY_ROOT = cfg.library.root;
    KORRI_LAUNCH_ARTIFACTS_DIR = launchArtifactsDir;
    KORRI_GAME_STREAM_RUNTIME_DIR = runtimeDir;
  }
  // optionalAttrs (cfg.sessiond.url != null) {
    KORRI_SESSIOND_URL = cfg.sessiond.url;
  }
  // optionalAttrs (cfg.sessiond.tokenFile != null) {
    KORRI_SESSIOND_TOKEN_FILE = cfg.sessiond.tokenFile;
  }
  // optionalAttrs (cfg.publicApiBaseUrl != null) {
    KORRI_PUBLIC_API_BASE_URL = cfg.publicApiBaseUrl;
  }
  // {
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

    publicApiBaseUrl = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "http://192.168.1.117:3001";
      description = ''
        Absolute base URL clients should use to reach this server's HTTP API
        (e.g. game asset byte routes returned by `app.library.list`). Required
        for production deployments that serve resolved game assets to remote
        clients. Plain http is accepted for loopback (`127.0.0.1`, `localhost`),
        RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`),
        link-local (`169.254.0.0/16`), and `.local`/`.lan` mDNS hostnames;
        public hosts require https. Must not contain credentials, query, or
        fragment data.
      '';
    };

    launchArtifactsDir = mkOption {
      type = types.str;
      default = if isSystemMode then "/run/korri-launch-artifacts" else "%t/korri-launch-artifacts";
      description = ''
        Shared launch-artifact directory used by Korri's app config materializer.
        It must be outside /tmp because managed foreground children run through
        sessiond with PrivateTmp enabled.
      '';
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

    sessiond = {
      # When set, korri-server's local Launcher routes managed-launch
      # requests through korri-sessiond (`createSessionLauncherFromEnv()`
      # in korri/shared/library/launcher-layer-live.ts). Without this,
      # the server falls back to the in-process shell launcher, which
      # spawns from the server unit's bare PATH and cannot see
      # gamescope/retroarch — fatal for any default-gamescope launch.
      url = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "http://127.0.0.1:3003";
        description = ''
          Loopback HTTP URL of the local korri-sessiond. When set together
          with `tokenFile`, korri-server exports `KORRI_SESSIOND_URL` and
          `KORRI_SESSIOND_TOKEN_FILE` so its Launcher delegates managed
          launches to sessiond instead of the bare shell launcher.
        '';
      };

      tokenFile = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "/run/korri-sessiond/token";
        description = ''
          Absolute path to the sessiond capability-token file readable by
          the korri-server user. Required alongside `url`. Typically
          generated by korri-sessiond's `ExecStartPre` and shared via a
          group-readable mode (see `services.korri.sessiond.sharedGroup`).
        '';
      };
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
      # `enable` was retired in federation v1 (R14 / zero-backwards-compat).
      # Every library-bearing korri-server advertises unconditionally;
      # devices that should not participate in federation should not run
      # this service. The `name` and `capabilities` sub-options remain.

      name = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Human-readable LAN service name. Defaults to the NixOS host name.";
      };

      capabilities = mkOption {
        type = types.listOf types.str;
        default = [
          "source"
          "stream"
        ];
        description = "Capability labels advertised through mDNS TXT records. Federation requires `source`.";
      };
    };

    streaming = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = ''
          Wire the generic Korri Sunshine stream app/runner to this server's
          intent and status paths. Requires `services.korri.compositor.enable`
          (the Sway substrate that hosts the Sunshine session) and
          `services.korri.input.provider.enable` (host-side normalized
          appliance input). When enabled, the module writes a default
          Sunshine gamepad backend (`services.sunshine.settings.gamepad =
          "x360"`, the InputPlumber + /dev/uinput validated path).
        '';
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
        default = "${cfg.streaming.runtimeDir}/next-launch.json";
        defaultText = lib.literalExpression ''"''${runtimeDir}/next-launch.json"'';
        description = "Shared one-shot launch intent path written by the server and consumed by the stream runner.";
      };

      statusPath = mkOption {
        type = types.str;
        default = "${cfg.streaming.runtimeDir}/status.json";
        defaultText = lib.literalExpression ''"''${runtimeDir}/status.json"'';
        description = "Shared runner status path read by the server and written by the stream runner.";
      };

      audio = {
        enable = lib.mkEnableOption "PulseAudio-compatible audio capture for Korri Sunshine streaming";

        pulseServer = mkOption {
          type = types.nullOr types.str;
          default = null;
          example = "unix:/run/user/1000/pulse/native";
          description = ''
            Opaque PulseAudio-compatible server address passed to
            `korri-sunshine.service` as `PULSE_SERVER` when streaming audio is
            enabled. Korri does not derive, discover, or validate this value;
            the host config owns the streaming user, audio stack, and socket
            location. The host config is responsible for ensuring the socket is
            reachable when `korri-sunshine.service` starts, for example via
            lingering, system-level pipewire-pulse, or explicit service
            ordering.
          '';
        };
      };

      desktop = {
        enable = mkOption {
          type = types.bool;
          default = true;
          description = ''
            Add a persistent Sunshine Desktop app that attaches Moonlight to the
            already-running Korri compositor session without requiring a pending
            Korri launch intent. This is the manual desktop/Steam lab entrypoint
            for aka-style hosts.
          '';
        };

        name = mkOption {
          type = types.str;
          default = "Desktop";
          description = "Sunshine application name for the persistent compositor desktop stream.";
        };

        outputLog = mkOption {
          type = types.str;
          default = "$HOME/.local/state/korri/desktop-stream.log";
          description = "Sunshine app output log path for the persistent desktop stream.";
        };
      };

    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        # Sessiond wiring is both-or-neither. A url without a tokenFile
        # (or vice versa) silently falls back to shell-launcher in
        # createSessionLauncherFromEnv() and the default-gamescope launch
        # path explodes with ENOENT — louder failure at eval time.
        assertion =
          (cfg.sessiond.url == null && cfg.sessiond.tokenFile == null)
          || (cfg.sessiond.url != null && cfg.sessiond.tokenFile != null);
        message = ''
          services.korri.server.sessiond.url and
          services.korri.server.sessiond.tokenFile must be set together. Set
          both to delegate managed launches to korri-sessiond, or leave both
          null to use the in-process shell launcher.
        '';
      }
      {
        assertion = isUserSpecifierPath launchArtifactsDir || isAbsolutePath launchArtifactsDir;
        message = ''
          services.korri.server.launchArtifactsDir must be an absolute path or a
          supported user-manager specifier path (got "${launchArtifactsDir}").
        '';
      }
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
          services.korri.server.streaming.runtimeDir = "${runtimeDir}" uses a systemd
          user specifier such as %t or %h, which is unsafe in
          serviceMode = "system" because it resolves against the system manager rather
          than the configured user. Use an absolute path like /run/korri-game-stream.
        '';
      }
      {
        assertion = !isSystemMode || !(hasPlaceholder intentPath);
        message = ''
          services.korri.server.streaming.intentPath = "${intentPath}" uses a systemd
          user specifier that is unsafe in serviceMode = "system". Use an absolute path
          under services.korri.server.streaming.runtimeDir.
        '';
      }
      {
        assertion = !isSystemMode || !(hasPlaceholder statusPath);
        message = ''
          services.korri.server.streaming.statusPath = "${statusPath}" uses a systemd
          user specifier that is unsafe in serviceMode = "system". Use an absolute path
          under services.korri.server.streaming.runtimeDir.
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath runtimeDir;
        message = ''
          services.korri.server.streaming.runtimeDir must be an absolute path in
          serviceMode = "system" (got "${runtimeDir}").
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath intentPath;
        message = ''
          services.korri.server.streaming.intentPath must be an absolute path in
          serviceMode = "system" (got "${intentPath}").
        '';
      }
      {
        assertion = !isSystemMode || isAbsolutePath statusPath;
        message = ''
          services.korri.server.streaming.statusPath must be an absolute path in
          serviceMode = "system" (got "${statusPath}").
        '';
      }
      {
        assertion =
          !cfg.streaming.enable
          || isUserSpecifierPath intentPath
          || lib.hasPrefix "${runtimeDir}/" intentPath;
        message = ''
          services.korri.server.streaming.intentPath = "${intentPath}" must live under
          services.korri.server.streaming.runtimeDir = "${runtimeDir}" so the
          tmpfiles-managed private runtime directory protects intent ownership.
        '';
      }
      {
        assertion =
          !cfg.streaming.enable
          || isUserSpecifierPath statusPath
          || lib.hasPrefix "${runtimeDir}/" statusPath;
        message = ''
          services.korri.server.streaming.statusPath = "${statusPath}" must live under
          services.korri.server.streaming.runtimeDir = "${runtimeDir}" so the
          tmpfiles-managed private runtime directory protects status ownership.
        '';
      }
      {
        assertion = !cfg.streaming.audio.enable || cfg.streaming.audio.pulseServer != null;
        message = ''
          services.korri.server.streaming.audio.enable = true requires
          services.korri.server.streaming.audio.pulseServer to be set. Korri treats
          the PulseAudio-compatible server address as host-owned configuration and
          does not derive, discover, or validate it.
        '';
      }
      {
        assertion = !cfg.streaming.desktop.enable || cfg.streaming.desktop.name != "";
        message = "services.korri.server.streaming.desktop.name must not be empty when desktop streaming is enabled.";
      }
      # New cross-tree precondition: streaming needs a managed compositor
      # substrate and a host-side normalized input provider. Both are
      # required even on headless aka because Sunshine launches inside a
      # Sway session and consumes /dev/uinput virtual controllers.
      {
        assertion = !cfg.streaming.enable || (config.services.korri.compositor.enable or false);
        message = ''
          services.korri.server.streaming.enable = true requires
          services.korri.compositor.enable = true. Streaming hosts run
          Sunshine inside a managed Sway session; enable the compositor
          substrate even on headless appliances.
        '';
      }
      {
        assertion = !cfg.streaming.enable || (config.services.korri.input.provider.enable or false);
        message = ''
          services.korri.server.streaming.enable = true requires
          services.korri.input.provider.enable = true. Streaming hosts need
          host-side normalized appliance input (Xbox 360 over /dev/uinput
          via InputPlumber) so Sunshine can synthesize streamed controllers.
        '';
      }
      # The Korri-owned korri-sunshine.service reuses upstream's rendered
      # sunshine.conf / apps.json plumbing, firewall, udev rules, avahi mDNS
      # publisher, and uinput kernel-module load. Those only land when the
      # upstream module is enabled. We default it to true (see below) but a
      # host that explicitly disables it leaves korri-sunshine without
      # discovery, firewall, or input plumbing.
      {
        assertion = !cfg.streaming.enable || (config.services.sunshine.enable or false);
        message = ''
          services.korri.server.streaming.enable = true requires
          services.sunshine.enable = true. The Korri-owned korri-sunshine.service
          depends on the upstream sunshine module for config rendering,
          firewall ports, /dev/uinput udev rules, the avahi mDNS publisher,
          and the uinput kernel module load.
        '';
      }
      {
        assertion = !hasPublicApiBaseUrl || !publicApiBaseUrlHasWhitespace;
        message = "services.korri.server.publicApiBaseUrl must not contain whitespace.";
      }
      {
        assertion = !hasPublicApiBaseUrl || publicApiBaseUrlParts != null;
        message = ''
          services.korri.server.publicApiBaseUrl must be an absolute http or https URL
          (got "${toString publicApiBaseUrlRaw}").
        '';
      }
      {
        assertion = !hasPublicApiBaseUrl || !publicApiBaseUrlHasCredentials;
        message = "services.korri.server.publicApiBaseUrl must not contain credentials.";
      }
      {
        assertion = !hasPublicApiBaseUrl || publicApiBaseUrlParts == null || publicApiBaseUrlHost != null;
        message = "services.korri.server.publicApiBaseUrl must include a host.";
      }
      {
        assertion = !hasPublicApiBaseUrl || !publicApiBaseUrlHasQueryOrFragment;
        message = "services.korri.server.publicApiBaseUrl must not contain query or fragment data.";
      }
      {
        assertion =
          !hasPublicApiBaseUrl
          || publicApiBaseUrlParts == null
          || publicApiBaseUrlParts.scheme != "http"
          || publicApiBaseUrlIsPrivateHttpHost;
        message = ''
          services.korri.server.publicApiBaseUrl must use https outside loopback or RFC1918 private networks
          (got "${toString publicApiBaseUrlRaw}").
        '';
      }
    ];

    warnings =
      lib.optional (isSystemMode && cfg.openFirewall && !isLoopbackHost && cfg.firewallInterfaces == [ ])
        ''
          services.korri.server is exposing host "${cfg.host}" on the global firewall in
          system mode. Set services.korri.server.firewallInterfaces to a trusted
          interface (e.g. [ "tailscale0" ]) to scope LAN exposure.
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

    services.korri.gameStream = mkIf cfg.streaming.enable {
      enable = true;
      appName = cfg.streaming.appName;
      runtimeDir = runtimeDir;
      intentPath = intentPath;
      statusPath = statusPath;
    };

    services.sunshine.applications.apps = mkIf cfg.streaming.desktop.enable (
      lib.mkAfter [
        {
          name = cfg.streaming.desktop.name;
          cmd = desktopAppCommand;
          output = cfg.streaming.desktop.outputLog;
          "auto-detach" = false;
          "wait-all" = true;
        }
      ]
    );

    # Default Sunshine to the InputPlumber + /dev/uinput-validated Xbox 360
    # backend when streaming is on. `lib.mkDefault` ensures host overrides
    # (e.g. `services.sunshine.settings.gamepad = "ds5"` for a DualSense
    # passthrough opt-in once uhid is wired) still win.
    services.sunshine.settings.gamepad = mkIf cfg.streaming.enable (lib.mkDefault "x360");

    # Default Sunshine itself to the Korri downstream build (carries the
    # runtime-settings protocol, live FPS, proof-gated resolution, and seamless
    # h264_vaapi bitrate patches) whenever streaming is on. Priority 900 sits
    # between `mkDefault` (1000, used by nixpkgs' sunshine module to set
    # `pkgs.sunshine`) and any explicit host assignment, so callers that really
    # want stock nixpkgs Sunshine can override with a normal assignment.
    # Downstream flakes that import this module via
    # `inputs.korri.nixosModules.korri-server` (or the aggregate `korri`) get
    # the patched build without composing the overlay themselves.
    services.sunshine.package = mkIf cfg.streaming.enable (
      lib.mkOverride 900 packagesForSystem.sunshine-korri
    );

    # On a streaming-role host we own the Sunshine lifecycle ourselves via
    # `systemd.services.korri-sunshine` (see below). Upstream's
    # `systemd.user.services.sunshine` unit is gated on a logged-in
    # graphical session, which never appears on a headless appliance.
    # Force-disable its autostart so the user unit stays defined (for
    # ad-hoc debugging) but never tries to claim sunshine's ports.
    services.sunshine.autoStart = mkIf cfg.streaming.enable (lib.mkForce false);

    # Default-enable the upstream module so we inherit its supporting
    # plumbing: sunshine.conf + apps.json formatters, firewall ports, udev
    # rules for /dev/uinput, the avahi mDNS publisher, and the uinput
    # kernel module load. Hosts can still disable explicitly.
    services.sunshine.enable = mkIf cfg.streaming.enable (lib.mkDefault true);

    # Korri-owned system unit that runs Sunshine inside the
    # korri-compositor's Sway session. Mirrors the architecture of
    # korri-compositor.service: boot-scoped, runs as the compositor user,
    # inherits the compositor's WAYLAND_DISPLAY / XDG_RUNTIME_DIR /
    # DBUS_SESSION_BUS_ADDRESS / HOME so it can attach to Sway. The Sunshine
    # config file is rendered locally with the same `pkgs.formats.keyValue`
    # formatter the upstream module uses, which is content-addressed and
    # therefore produces an identical store path for identical settings.
    systemd.services.korri-sunshine = mkIf cfg.streaming.enable (
      let
        compositorCfg = config.services.korri.compositor;
        compositorUnit = config.systemd.services.korri-compositor;
        # The compositor's environment block sets PATH (coreutils + dbus +
        # sway + ...). systemd's default service module also sets PATH at
        # the same priority, which collides during module merge. Sunshine
        # itself doesn't shell out to compositor tools — it captures the
        # wayland socket and encodes — so dropping PATH from the inherited
        # env and letting systemd's default win is both correct and avoids
        # the conflict.
        compositorEnv = lib.filterAttrs (n: _: n != "PATH") (compositorUnit.environment or { });
        sunshineCfg = config.services.sunshine;
        sunshineBin =
          if sunshineCfg.capSysAdmin then
            "${config.security.wrapperDir}/sunshine"
          else
            lib.getExe sunshineCfg.package;
        sunshineSettingsFormat = pkgs.formats.keyValue { };
        sunshineConfigFile = sunshineSettingsFormat.generate "sunshine.conf" sunshineCfg.settings;
        waitForWaylandSocket = pkgs.writeShellScript "korri-sunshine-wait-for-wayland" ''
          set -eu
          : "''${XDG_RUNTIME_DIR:?korri-sunshine: XDG_RUNTIME_DIR is required}"
          : "''${WAYLAND_DISPLAY:?korri-sunshine: WAYLAND_DISPLAY is required}"
          socket="$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY"
          for _ in $(seq 1 100); do
            if [ -S "$socket" ]; then
              exit 0
            fi
            sleep 0.1
          done
          echo "korri-sunshine: timed out waiting for $socket after 10s" >&2
          exit 1
        '';
      in
      {
        description = "Korri Sunshine game stream host";
        wantedBy = [ "multi-user.target" ];
        wants = [
          "korri-compositor.service"
          "network.target"
        ];
        requires = [ "korri-compositor.service" ];
        after = [
          "korri-compositor.service"
          "network.target"
        ];
        # Inherit the compositor's session env (HOME, XDG_*) and pin
        # WAYLAND_DISPLAY to sway's default first-allocated socket name
        # so sunshine can attach to `$XDG_RUNTIME_DIR/wayland-1`. Hosts
        # whose sway picks a different socket name need to override this
        # via `systemd.services.korri-sunshine.environment.WAYLAND_DISPLAY`.
        environment =
          compositorEnv
          // {
            WAYLAND_DISPLAY = "wayland-1";
            # Enable Sunshine's Korri runtime-settings protocol surface for
            # managed stream hosts. Capability acks still gate the actual
            # operations per active encoder/session, but without this process
            # env the patched Sunshine build intentionally advertises nothing
            # after a clean rebuild.
            SUNSHINE_LIVE_SETTINGS_MVP = "1";
          }
          // optionalAttrs (cfg.streaming.audio.enable && cfg.streaming.audio.pulseServer != null) {
            PULSE_SERVER = cfg.streaming.audio.pulseServer;
          };
        unitConfig = {
          StartLimitBurst = 5;
          StartLimitIntervalSec = 500;
        };
        serviceConfig = {
          ExecStartPre = "${waitForWaylandSocket}";
          ExecStart = "${sunshineBin} ${sunshineConfigFile}";
          Restart = "on-failure";
          RestartSec = 5;
          User = compositorCfg.user;
          Group = if compositorCfg.group != null then compositorCfg.group else compositorCfg.user;
          WorkingDirectory = compositorCfg.home;
        };
      }
    );

    systemd.tmpfiles.rules = mkIf isSystemMode [
      "d ${launchArtifactsDir} 0750 ${cfg.user} ${if cfg.group != null then cfg.group else cfg.user} -"
    ];

    systemd.tmpfiles.settings =
      mkIf (isSystemMode && cfg.streaming.enable && isDefaultSystemRuntimeDir)
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
          ExecStartPre = [
            "${pkgs.coreutils}/bin/install -d -m 700 ${runtimeDir}"
            "${pkgs.coreutils}/bin/install -d -m 700 ${launchArtifactsDir}"
          ];
          ExecStart = "${cfg.package}/bin/korri-server";
          Restart = "on-failure";
          RestartSec = 2;
        };
      };
    };

    systemd.services.korri-server = mkIf isSystemMode {
      description = "Korri headless server control plane";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = serverEnv;
      serviceConfig = {
        ExecStartPre = [
          "${pkgs.coreutils}/bin/install -d -m 700 ${cfg.library.root}"
          "${pkgs.coreutils}/bin/install -d -m 700 ${bunTranspilerCacheDir}"
          "${pkgs.coreutils}/bin/install -d -m 750 ${launchArtifactsDir}"
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
        ReadWritePaths = [ launchArtifactsDir ];
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
}
