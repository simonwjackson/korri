# Pure-Nix module-evaluation check for `services.korri.sessiond`.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-sessiond-module --no-link
{
  pkgs,
  korriSessiondModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");
  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.systemd-boot.enable = false;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
    };

  # The sessiond module reads attributes from compositor.kiosk.enable and
  # server.streaming.enable via `lib.attrByPath` defaults; we shim the
  # option names here so eval-config has enough to evaluate. Real
  # compositions import the actual compositor / server modules; this test
  # exercises the sessiond module in isolation.
  shimOptionsModule =
    { lib, ... }:
    {
      options.services.korri = {
        compositor.kiosk.enable = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
        server.streaming.enable = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
      };
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriSessiondModule
        shimOptionsModule
        baseModule
        overrides
      ];
    }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  failedAssertionMessages = cfg: map (a: a.message) (failedAssertions cfg);
  hasFailure = cfg: expected: builtins.any (m: lib.hasInfix expected m) (failedAssertionMessages cfg);

  unit = cfg: cfg.systemd.services.korri-sessiond or null;
  tokenUnit = cfg: cfg.systemd.services.korri-sessiond-token or null;
  unitEnv = cfg: (unit cfg).environment or { };
  unitPath = cfg: (unit cfg).path or [ ];
  serviceConfig = cfg: (unit cfg).serviceConfig or { };
  tokenServiceConfig = cfg: (tokenUnit cfg).serviceConfig or { };
  execStart = cfg: builtins.readFile (serviceConfig cfg).ExecStart;
  tokenExecStart = cfg: builtins.readFile (tokenServiceConfig cfg).ExecStart;
  execStartPost = cfg: builtins.readFile (serviceConfig cfg).ExecStartPost;

  baselineKiosk = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
  };

  sourceMachine = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.server.streaming.enable = true;
  };

  explicitSourceMachineOverride = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      role = "source-machine";
    };
    services.korri.compositor.kiosk.enable = true;
  };

  bothKioskAndStreaming = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
    services.korri.server.streaming.enable = true;
  };

  kioskRoleWithStreaming = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      role = "kiosk";
    };
    services.korri.server.streaming.enable = true;
  };

  relativeTokenFile = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      tokenFile = "etc/sessiond-token";
    };
  };

  customStatusPath = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      sunshineRuntimeStatusPath = "/run/korri-game-stream/status.json";
    };
    services.korri.server.streaming.enable = true;
  };

  withPath = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      path = [ pkgs.gamescope ];
    };
    services.korri.compositor.kiosk.enable = true;
  };

  # Kiosk-renderer env propagation. The kiosk image extends
  # services.korri.sessiond.extraEnvironment with the env keys the
  # renderer (Electrobun) inherits from sessiond's unit env when
  # sessiond spawns it: HOME, XDG_*_HOME, KORRI_KIOSK, inputd URLs.
  # This fixture proves extraEnvironment passes through the module so
  # the kiosk image's wiring is observable as a unit environment.
  withKioskRendererEnvironment = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      extraEnvironment = {
        HOME = "/storage";
        XDG_STATE_HOME = "/storage/.local/state";
        XDG_DATA_HOME = "/storage/.local/share";
        XDG_CONFIG_HOME = "/storage/.config";
        KORRI_KIOSK = "1";
        KORRI_DESKTOP_INPUTD_URL = "ws://127.0.0.1:3002";
        KORRI_NATIVE_BRIDGE_URL = "ws://127.0.0.1:3002";
      };
    };
    services.korri.compositor.kiosk.enable = true;
  };

  # Ordering passthrough. Kiosk image wires sessiond to start after
  # the compositor and inputd (so the wayland-1 socket and bridge are
  # up before sessiond's enterIdle spawns the renderer). The sessiond
  # module's default `after = ["network.target"]` is additive with
  # this extension, so the unit ends up with all three after-targets.
  withKioskOrdering = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
    systemd.services.korri-sessiond = {
      after = [
        "korri-compositor.service"
        "korri-inputd.service"
      ];
      wants = [ "korri-compositor.service" ];
      requires = [ "korri-inputd.service" ];
    };
  };

  withSharedGroup = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      sharedGroup = "korri-server";
      tokenReadUser = "korri-server";
    };
    services.korri.compositor.kiosk.enable = true;
  };

  withoutSharedGroup = baselineKiosk;

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "kiosk: assertions pass" (failedAssertions baselineKiosk == [ ]))
    (check "kiosk: KORRI_SESSIOND_ROLE=kiosk" ((unitEnv baselineKiosk).KORRI_SESSIOND_ROLE == "kiosk"))
    (check "source-machine: assertions pass" (failedAssertions sourceMachine == [ ]))
    (check "source-machine: KORRI_SESSIOND_ROLE=source-machine" (
      (unitEnv sourceMachine).KORRI_SESSIOND_ROLE == "source-machine"
    ))
    (check "source-machine: KORRI_SESSIOND_PORT=3003" (
      (unitEnv sourceMachine).KORRI_SESSIOND_PORT == "3003"
    ))
    (check "source-machine: token file env exported" (
      (unitEnv sourceMachine).KORRI_SESSIOND_TOKEN_FILE == "/run/korri-sessiond/token"
    ))
    (check "source-machine: launch artifacts dir env exported" (
      (unitEnv sourceMachine).KORRI_LAUNCH_ARTIFACTS_DIR == "/run/korri-launch-artifacts"
    ))
    (check "source-machine: launch artifacts dir is sandbox-writable/readable" (
      builtins.elem "/run/korri-launch-artifacts" ((serviceConfig sourceMachine).ReadWritePaths or [ ])
    ))
    (check "explicit role override beats inferred" (
      (unitEnv explicitSourceMachineOverride).KORRI_SESSIOND_ROLE == "source-machine"
    ))
    (check "kiosk + streaming: assertion fires" (
      hasFailure bothKioskAndStreaming "must not be enabled together"
    ))
    (check "kiosk role + streaming.enable: assertion fires" (
      hasFailure kioskRoleWithStreaming "incompatible with"
    ))
    (check "relative tokenFile: assertion fires" (
      hasFailure relativeTokenFile "tokenFile must be an absolute path"
    ))
    (check "ExecStart references korri-sessiond bin" (
      lib.hasInfix "korri-sessiond" (execStart baselineKiosk)
    ))
    (check "ExecStart sources the token file" (
      lib.hasInfix "/run/korri-sessiond/token" (execStart baselineKiosk)
    ))
    (check "ExecStartPost POSTs /control/start" (
      lib.hasInfix "/control/start" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost passes the sessiond capability header" (
      lib.hasInfix "x-korri-sessiond-token" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost honors the role's port" (
      lib.hasInfix "http://127.0.0.1:3003/control/start" (execStartPost baselineKiosk)
    ))
    (check "ExecStartPost has a bounded retry budget" (
      lib.hasInfix "max=40" (execStartPost baselineKiosk)
    ))
    (check "source-machine: tmpfiles creates runtime dir 0700" (
      builtins.any (
        rule: lib.hasInfix "korri-sessiond" rule && lib.hasInfix "0700" rule
      ) sourceMachine.systemd.tmpfiles.rules
    ))
    (check "source-machine: sunshineRuntimeStatusPath exported as KORRI_GAME_STREAM_STATUS_PATH" (
      (unitEnv customStatusPath).KORRI_GAME_STREAM_STATUS_PATH == "/run/korri-game-stream/status.json"
    ))
    (check "path option flows through to systemd unit PATH" (
      builtins.elem pkgs.gamescope (unitPath withPath)
    ))
    (check "util-linux is on the unit PATH for setsid (required by shell-launcher)" (
      builtins.elem pkgs.util-linux (unitPath baselineKiosk)
      && builtins.elem pkgs.util-linux (unitPath sourceMachine)
    ))
    (check "extraEnvironment: HOME propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).HOME or null == "/storage"
    ))
    (check "extraEnvironment: XDG_STATE_HOME propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).XDG_STATE_HOME or null == "/storage/.local/state"
    ))
    (check "extraEnvironment: XDG_DATA_HOME propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).XDG_DATA_HOME or null == "/storage/.local/share"
    ))
    (check "extraEnvironment: XDG_CONFIG_HOME propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).XDG_CONFIG_HOME or null == "/storage/.config"
    ))
    (check "extraEnvironment: KORRI_KIOSK propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).KORRI_KIOSK or null == "1"
    ))
    (check "extraEnvironment: KORRI_DESKTOP_INPUTD_URL propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).KORRI_DESKTOP_INPUTD_URL or null == "ws://127.0.0.1:3002"
    ))
    (check "extraEnvironment: KORRI_NATIVE_BRIDGE_URL propagates to unit environment" (
      (unitEnv withKioskRendererEnvironment).KORRI_NATIVE_BRIDGE_URL or null == "ws://127.0.0.1:3002"
    ))
    (check "ordering: after-list merges with the module's network.target default" (
      let
        after = (unit withKioskOrdering).after or [ ];
      in
      builtins.elem "network.target" after
      && builtins.elem "korri-compositor.service" after
      && builtins.elem "korri-inputd.service" after
    ))
    (check "ordering: wants-list carries korri-compositor.service" (
      builtins.elem "korri-compositor.service" ((unit withKioskOrdering).wants or [ ])
    ))
    (check "ordering: requires-list carries korri-inputd.service" (
      builtins.elem "korri-inputd.service" ((unit withKioskOrdering).requires or [ ])
    ))
    (check "token oneshot generates token via /dev/urandom" (
      lib.hasInfix "/dev/urandom" (tokenExecStart baselineKiosk)
    ))
    # Runtime-dir permission contract. The token file is group-readable
    # via sharedGroup, but that is useless unless the directory is
    # group-traversable. Without sharedGroup, the dir stays root-only.
    (check "sharedGroup unset: token oneshot creates runtime dir at 0700 root:root" (
      let
        setup = tokenExecStart baselineKiosk;
      in
      lib.hasInfix "install -d -m 0700" setup
      && lib.hasInfix "chown root:root \"$runtime_dir\"" setup
      && !lib.hasInfix "install -d -m 0755" setup
    ))
    (check "sharedGroup unset: tmpfiles creates runtime dir at 0700 root:root" (
      builtins.any (
        rule: lib.hasInfix "korri-sessiond" rule && lib.hasInfix "0700 root root" rule
      ) baselineKiosk.systemd.tmpfiles.rules
    ))
    (check "sharedGroup unset: sessiond service does not own token RuntimeDirectory" (
      !((serviceConfig baselineKiosk) ? RuntimeDirectory)
      && !((serviceConfig baselineKiosk) ? RuntimeDirectoryMode)
    ))
    (check "sharedGroup set: token oneshot creates runtime dir at 0710 root:<sharedGroup>" (
      let
        setup = tokenExecStart withSharedGroup;
      in
      lib.hasInfix "install -d -m 0710" setup
      && lib.hasInfix "chown root:korri-server \"$runtime_dir\"" setup
      && lib.hasInfix "chmod 0710 \"$runtime_dir\"" setup
    ))
    (check "sharedGroup set: tmpfiles creates runtime dir at 0710 root:<sharedGroup>" (
      builtins.any (
        rule: lib.hasInfix "korri-sessiond" rule && lib.hasInfix "0710 root korri-server" rule
      ) withSharedGroup.systemd.tmpfiles.rules
    ))
    (check "sharedGroup set: sessiond service does not own token RuntimeDirectory" (
      !((serviceConfig withSharedGroup) ? RuntimeDirectory)
      && !((serviceConfig withSharedGroup) ? RuntimeDirectoryMode)
    ))
    (check "token oneshot collapses whitespace with tr (sed would leave newlines)" (
      lib.hasInfix "tr -d '[:space:]'" (tokenExecStart baselineKiosk)
    ))
    (check "sessiond requires token oneshot before daemon start" (
      let
        requires = (unit baselineKiosk).requires or [ ];
        after = (unit baselineKiosk).after or [ ];
      in
      builtins.elem "korri-sessiond-token.service" requires
      && builtins.elem "korri-sessiond-token.service" after
    ))
    (check "token oneshot is ordered before sessiond" (
      builtins.elem "korri-sessiond.service" ((tokenUnit baselineKiosk).before or [ ])
    ))
    (check "token oneshot is ordered before korri-server" (
      builtins.elem "korri-server.service" ((tokenUnit baselineKiosk).before or [ ])
    ))
    (check "token oneshot is wanted by multi-user.target" (
      builtins.elem "multi-user.target" ((tokenUnit baselineKiosk).wantedBy or [ ])
    ))
    (check "token oneshot is sandboxed while writing only the runtime dir" (
      (tokenServiceConfig baselineKiosk).PrivateTmp or null == true
      && (tokenServiceConfig baselineKiosk).ProtectSystem or null == "strict"
      && builtins.elem "/run/korri-sessiond" ((tokenServiceConfig baselineKiosk).ReadWritePaths or [ ])
      && (tokenServiceConfig baselineKiosk).ProtectHome or null == true
      && (tokenServiceConfig baselineKiosk).NoNewPrivileges or null == true
    ))
    (check "ExecStartPre no longer owns token ACL preparation" (
      !((serviceConfig baselineKiosk) ? ExecStartPre)
    ))
    (check "sharedGroup=korri-server: token oneshot chowns to that group at mode 0640" (
      lib.hasInfix "chown root:korri-server" (tokenExecStart withSharedGroup)
      && lib.hasInfix "chmod 0640" (tokenExecStart withSharedGroup)
    ))
    (check "sharedGroup=korri-server: token oneshot asserts peer readability" (
      lib.hasInfix "runuser -u korri-server" (tokenExecStart withSharedGroup)
      && lib.hasInfix "test -r \"$token_file\"" (tokenExecStart withSharedGroup)
    ))
    (check "sharedGroup unset: token oneshot keeps token root-only at 0600" (
      lib.hasInfix "chown root:root" (tokenExecStart withoutSharedGroup)
      && lib.hasInfix "chmod 0600" (tokenExecStart withoutSharedGroup)
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-sessiond module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-sessiond-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-sessiond module checks passed."
    touch $out
  ''
