# Pure-Nix module-evaluation check for `services.korri.daemon` / `korrid`.
{ pkgs, korriDaemonModule }:

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
      networking.hostName = "daemon-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriDaemonModule
        baseModule
        overrides
      ];
    }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  userUnit = cfg: cfg.systemd.user.services.korrid or { };
  systemUnit = cfg: cfg.systemd.services.korrid or { };
  env = cfg: (userUnit cfg).environment or { };

  defaultUserMode = evaluateWith { services.korri.daemon.enable = true; };
  socketPaired = evaluateWith {
    services.korri.daemon = {
      enable = true;
      sessiond.socketPath = "%t/korri/sessiond.sock";
    };
  };
  streamControl = evaluateWith {
    services.korri.daemon = {
      enable = true;
      streamControl.enable = true;
    };
  };
  withPlatformDefaults = evaluateWith {
    services.korri.daemon = {
      enable = true;
      library.platformDefaults.apps.retroarch.command = "retroarch";
    };
  };
  withExtraConfigRoots = evaluateWith {
    services.korri.daemon.enable = true;
    services.korri.config.roots = [ "/run/media/korri/0a1b-2c3d" ];
  };
  withExplicitRootsDir = evaluateWith {
    services.korri.daemon.enable = true;
    services.korri.config.rootsDir = "/run/korri/config-roots.d";
  };
  withRemovableMedia =
    (evalConfig {
      system = hostSystem;
      modules = [
        korriDaemonModule
        ../../../product/systems/nixos/modules/korri-removable-media.nix
        baseModule
        {
          services.korri.daemon.enable = true;
          services.korri.removableMedia.enable = true;
        }
      ];
    }).config;
  systemMode = evaluateWith {
    services.korri.daemon = {
      enable = true;
      serviceMode = "system";
    };
  };
  systemModeExistingRuntimeUser = evaluateWith {
    users.users.simonwjackson = {
      isNormalUser = true;
      home = "/home/simonwjackson";
      group = "users";
    };
    users.groups.users = { };
    services.korri.runtime = {
      user = "simonwjackson";
      group = "users";
      home = "/home/simonwjackson";
      createUser = false;
    };
    services.korri.daemon = {
      enable = true;
      serviceMode = "system";
    };
  };
  streamingBase = {
    services.korri.daemon = {
      enable = true;
      streaming.enable = true;
    };
    services.korri.compositor.enable = true;
    services.korri.input.provider.enable = true;
  };
  streamingLiveSettings = evaluateWith streamingBase;
  streamingLiveSettingsDisabled = evaluateWith (
    lib.recursiveUpdate streamingBase {
      services.korri.daemon.streaming.runtimeSettings.enable = false;
    }
  );
  korriSunshineSystemUnit = cfg: cfg.systemd.services."korri-sunshine" or { };
  korriSunshineUserUnit = cfg: cfg.systemd.user.services."korri-sunshine" or { };
  sunshineUserEnv = cfg: (cfg.systemd.user.services.sunshine or { }).environment or { };

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "daemon assertions pass" (failedAssertions defaultUserMode == [ ]))
    (check "option namespace is services.korri.daemon" (defaultUserMode.services.korri ? daemon))
    (check "korrid user service emitted" (defaultUserMode.systemd.user.services ? korrid))
    (check "korrid wanted by korri-session.target" (
      (userUnit defaultUserMode).wantedBy == [ "korri-session.target" ]
    ))
    (check "ExecStart points at korrid binary" (
      lib.hasInfix "/bin/korrid" ((userUnit defaultUserMode).serviceConfig.ExecStart or "")
    ))
    (check "daemon identity env uses KORRI_DAEMON_*" (
      (env defaultUserMode).KORRI_DAEMON_ID == "daemon-test"
      && (env defaultUserMode).KORRI_DAEMON_NAME == "Korri Stream on daemon-test"
    ))
    (check "legacy KORRI_SERVER_* env absent" (
      !((env defaultUserMode) ? KORRI_SERVER_ID) && !((env defaultUserMode) ? KORRI_SERVER_NAME)
    ))
    (check "sessiond socket env exported" (
      (env socketPaired).KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"
    ))
    (check "legacy sessiond URL/token env absent" (
      !((env socketPaired) ? KORRI_SESSIOND_URL) && !((env socketPaired) ? KORRI_SESSIOND_TOKEN_FILE)
    ))
    (check "stream control env still exported" (
      (env streamControl).KORRI_STREAM_CONTROL_ENABLED == "1"
    ))
    (check "user-mode library root defaults to Korri product state" (
      defaultUserMode.services.korri.daemon.library.root == "/var/lib/korri/library"
      && (env defaultUserMode).KORRI_LIBRARY_ROOT == "/var/lib/korri/library"
    ))
    (check "system-mode library root defaults to Korri product state" (
      systemMode.services.korri.daemon.library.root == "/var/lib/korri/library"
    ))
    (check "system-mode daemon owns library tmpfiles and hardening" (
      lib.elem "d /var/lib/korri/library 0700 korri korri -" systemMode.systemd.tmpfiles.rules
      && lib.elem "/var/lib/korri/library" ((systemUnit systemMode).serviceConfig.ReadWritePaths or [ ])
    ))
    (check "config local root defaults to Korri product state config dir" (
      defaultUserMode.services.korri.config.localRoot == "/var/lib/korri/config"
    ))
    (check "KORRI_CONFIG_ROOTS exports the local config root by default" (
      (env defaultUserMode).KORRI_CONFIG_ROOTS == "/var/lib/korri/config"
    ))
    (check "platform defaults render a read-only store root ordered first" (
      let
        roots = (env withPlatformDefaults).KORRI_CONFIG_ROOTS;
      in
      lib.hasPrefix "/nix/store" roots
      && lib.hasInfix "korri-platform-config-root" roots
      && lib.hasSuffix ":/var/lib/korri/config" roots
    ))
    (check "platform defaults are not installed into the mutable library root" (
      !(lib.any (
        cmd: lib.hasInfix "platform.korri.yaml" cmd && lib.hasInfix "/var/lib/korri/library" cmd
      ) ((userUnit withPlatformDefaults).serviceConfig.ExecStartPre or [ ]))
    ))
    (check "extra operator config roots are appended last" (
      lib.hasSuffix ":/run/media/korri/0a1b-2c3d" (env withExtraConfigRoots).KORRI_CONFIG_ROOTS
    ))
    (check "dynamic config-roots dir is not exported by default" (
      !((env defaultUserMode) ? KORRI_CONFIG_ROOTS_DIR)
    ))
    (check "explicit config rootsDir exports KORRI_CONFIG_ROOTS_DIR" (
      (env withExplicitRootsDir).KORRI_CONFIG_ROOTS_DIR == "/run/korri/config-roots.d"
    ))
    (check "removable-media enablement defaults the dynamic roots dir" (
      (env withRemovableMedia).KORRI_CONFIG_ROOTS_DIR == "/run/korri/config-roots.d"
    ))
    (check "system-mode daemon owns config-root tmpfiles and hardening" (
      lib.elem "d /var/lib/korri/config 0700 korri korri -" systemMode.systemd.tmpfiles.rules
      && lib.elem "/var/lib/korri/config" ((systemUnit systemMode).serviceConfig.ReadWritePaths or [ ])
    ))
    (check "system-mode daemon defaults to runtime identity" (
      systemMode.services.korri.daemon.user == "korri"
      && systemMode.services.korri.daemon.group == "korri"
      && (systemUnit systemMode).serviceConfig.User == "korri"
      && (systemUnit systemMode).serviceConfig.Group == "korri"
    ))
    (check "existing runtime user can own system-mode daemon paths" (
      systemModeExistingRuntimeUser.services.korri.runtime.createUser == false
      && systemModeExistingRuntimeUser.services.korri.daemon.user == "simonwjackson"
      && systemModeExistingRuntimeUser.services.korri.daemon.group == "users"
      && lib.elem "d /var/lib/korri/library 0700 simonwjackson users -" systemModeExistingRuntimeUser.systemd.tmpfiles.rules
      && (systemUnit systemModeExistingRuntimeUser).serviceConfig.User == "simonwjackson"
      && (systemUnit systemModeExistingRuntimeUser).serviceConfig.Group == "users"
    ))
    (check "streaming defaults to the Korri downstream Sunshine package" (
      streamingLiveSettings.services.sunshine.package.pname == "sunshine-korri"
    ))
    (check "streaming emits Korri Sunshine as a user-session service" (
      streamingLiveSettings.systemd.user.services ? "korri-sunshine"
      && !(streamingLiveSettings.systemd.services ? "korri-sunshine")
      && (korriSunshineUserUnit streamingLiveSettings).wantedBy == [ "korri-session.target" ]
      && (korriSunshineUserUnit streamingLiveSettings).requires == [ "korri-compositor.service" ]
    ))
    (check "streaming enables Sunshine live settings gate by default" (
      (((korriSunshineUserUnit streamingLiveSettings).environment or { }).SUNSHINE_LIVE_SETTINGS_MVP
        or null
      ) == "1"
      && ((sunshineUserEnv streamingLiveSettings).SUNSHINE_LIVE_SETTINGS_MVP or null) == "1"
    ))
    (check "streaming live settings rollback keeps patched Sunshine but disables gate" (
      streamingLiveSettingsDisabled.services.sunshine.package.pname == "sunshine-korri"
      && !(
        ((korriSunshineUserUnit streamingLiveSettingsDisabled).environment or { })
        ? SUNSHINE_LIVE_SETTINGS_MVP
      )
      && !((sunshineUserEnv streamingLiveSettingsDisabled) ? SUNSHINE_LIVE_SETTINGS_MVP)
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korrid module check failed:\n${lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures}"
else
  pkgs.writeText "korri-daemon-module-check" "ok\n"
