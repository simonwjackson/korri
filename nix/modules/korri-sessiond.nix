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

  # Token generation runs BEFORE sessiond binds its HTTP socket. If the
  # token file is missing it creates a fresh 32-byte hex token; otherwise
  # it preserves the existing token. When `sharedGroup` is set the file is
  # chowned to `root:<sharedGroup>` mode 0640 so peer services in that
  # group (typically korri-server) can authenticate against sessiond.
  tokenSetupScript = pkgs.writeShellScript "korri-sessiond-token-setup" ''
    set -eu
    token_file=${lib.escapeShellArg cfg.tokenFile}
    runtime_dir=${lib.escapeShellArg cfg.runtimeDir}
    ${pkgs.coreutils}/bin/install -d -m 0755 "$runtime_dir"
    if [ ! -s "$token_file" ]; then
      # 32 random bytes → 64 hex chars. coreutils' od is portable enough
      # for this; we explicitly avoid /dev/random to skip entropy stalls.
      # `tr` (not sed) collapses across line boundaries; sed's default
      # line-by-line processing leaves the newlines `od` emits between
      # 16-byte rows in the output, producing an unusable token.
      tmp="$(${pkgs.coreutils}/bin/mktemp "$runtime_dir/.token.XXXXXX")"
      ${pkgs.coreutils}/bin/head -c 32 /dev/urandom \
        | ${pkgs.coreutils}/bin/od -An -vtx1 \
        | ${pkgs.coreutils}/bin/tr -d '[:space:]' > "$tmp"
      ${pkgs.coreutils}/bin/mv "$tmp" "$token_file"
    fi
    ${
      if cfg.sharedGroup != null then
        ''
          ${pkgs.coreutils}/bin/chown root:${cfg.sharedGroup} "$token_file"
          ${pkgs.coreutils}/bin/chmod 0640 "$token_file"
        ''
      else
        ''
          ${pkgs.coreutils}/bin/chown root:root "$token_file"
          ${pkgs.coreutils}/bin/chmod 0600 "$token_file"
        ''
    }
  '';

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
    # Each retry sleeps 250ms; budget = ${toString cfg.controlStartRetries} attempts.
    #
    # `--connect-timeout 1` gives us fast retries while the socket is
    # still binding. `--max-time 30` then gives the in-flight request
    # enough headroom to complete once connected: enterHome on the
    # kiosk role spawns the renderer and waits for its status file,
    # which can take several seconds on cold cache. If --max-time is
    # shorter than the server-side handler, curl times out and the
    # retry loop fires a SECOND /control/start, which spawns ANOTHER
    # renderer in parallel — the two compete for resources and
    # neither writes its status file in time, looping forever.
    attempt=0
    max=${toString cfg.controlStartRetries}
    while [ "$attempt" -lt "$max" ]; do
      if ${pkgs.curl}/bin/curl \
          --silent \
          --show-error \
          --fail \
          --connect-timeout 1 \
          --max-time 30 \
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

    path = mkOption {
      type = types.listOf types.package;
      default = [ ];
      description = ''
        Packages added to the sessiond unit's PATH. Sessiond inherits this
        PATH when it spawns the foreground app (via the in-process shell
        launcher), so anything the default-gamescope launch path needs to
        find by name — gamescope, retroarch wrappers, emulator binaries —
        must be listed here. systemd's bare unit PATH is the same
        coreutils/findutils/grep/sed/systemd set as every other unit and
        does not include gamescope.
      '';
    };

    sharedGroup = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "korri-server";
      description = ''
        Optional Unix group that must be able to read the sessiond capability
        token file. When set, the unit's ExecStartPre generates the token (if
        absent) and chowns it to `root:<sharedGroup>` with mode `0640` so
        peer services (typically korri-server) can authenticate against
        sessiond. When null, the token stays root-only (mode 0600).
      '';
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

      # Packages on the unit's PATH. Sessiond spawns the foreground app
      # via the in-process shell launcher, which inherits this PATH, so
      # gamescope/retroarch must be discoverable by name from here.
      #
      # `pkgs.util-linux` is baked in (not exposed via `cfg.path`)
      # because sessiond's shell launcher hardcodes `setsid` to detach
      # the child into its own session/process group — see
      # korri/shared/library/shell-launcher.ts (DEFAULT_SETSID_COMMAND).
      # Without setsid, every shell-launched child dies with
      # `Executable not found in $PATH: "setsid"` and never reaches the
      # gamescope wrapper.
      path = cfg.path ++ [ pkgs.util-linux ];

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
        # Generate (if missing) and ACL the token file before the daemon
        # starts. Runs as root (no User= set on this unit), which is
        # required so the chown to root:<sharedGroup> succeeds.
        ExecStartPre = "${tokenSetupScript}";
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
        # ProtectSystem = "strict" with no ReadWritePaths would block the
        # token-generation script's write to /run; the RuntimeDirectory
        # is implicitly writable under that mode, which is exactly where
        # the token lives.
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
