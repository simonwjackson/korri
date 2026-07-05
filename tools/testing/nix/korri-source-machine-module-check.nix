# Pure-Nix module-evaluation check for the downstream-consumable
# `inputs.korri.nixosModules.korri-source-machine` shape.
{
  pkgs,
  korriSourceMachineModule,
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
      networking.hostName = "aka";
      users.groups.users = { };
      users.users.simonwjackson = {
        isNormalUser = true;
        home = "/home/simonwjackson";
        group = "users";
      };
    };

  akaOverrides = {
    services.korri.runtime = {
      user = "simonwjackson";
      group = "users";
      home = "/home/simonwjackson";
      stateRoot = "/var/lib/korri";
      createUser = false;
    };
    services.korri.daemon = {
      serverId = "aka";
      publicApiBaseUrl = "http://aka:3001";
    };
  };

  evaluateWith =
    overrides:
    evalConfig {
      system = hostSystem;
      modules = [
        korriSourceMachineModule
        baseModule
        akaOverrides
        overrides
      ];
    };

  evaluated = evaluateWith { };
  cfg = evaluated.config;
  options = evaluated.options;
  socketDriftCfg =
    (evaluateWith {
      services.korri.daemon.sessiond.socketPath = lib.mkForce "%t/korri/other.sock";
    }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  failedAssertionMessages = cfg: map (a: a.message) (failedAssertions cfg);
  hasFailure = cfg: expected: builtins.any (m: lib.hasInfix expected m) (failedAssertionMessages cfg);
  daemonEnv = cfg.systemd.user.services.korrid.environment or { };
  sessiondEnv = cfg.systemd.user.services.korri-sessiond.environment or { };
  tailnetFlags = cfg.services.tailscale.extraUpFlags or [ ];
  sunshineApps = cfg.services.sunshine.applications.apps or [ ];
  firstAppWrapper =
    if sunshineApps == [ ] then "" else builtins.readFile (builtins.elemAt sunshineApps 0).cmd;

  packageMatches = expected: package: (package.pname or package.name or "") == expected;
  hasPackage = expected: packages: builtins.any (packageMatches expected) packages;
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "exported source-machine module evaluates for aka-style runtime identity" (
      failedAssertions cfg == [ ]
    ))
    (check "runtime identity override reaches compositor" (
      cfg.services.korri.compositor.user == "simonwjackson"
      && cfg.services.korri.compositor.group == "users"
      && cfg.services.korri.compositor.home == "/home/simonwjackson"
      && cfg.services.korri.compositor.createUser == false
      && cfg.systemd.user.services."korri-compositor".environment.HOME == "/home/simonwjackson"
      &&
        cfg.systemd.user.services."korri-compositor".serviceConfig.WorkingDirectory == "/home/simonwjackson"
    ))
    (check "exported source-machine module wires sessiond socket delegation" (
      cfg.services.korri.sessiond.socketPath == "%t/korri/sessiond.sock"
      && cfg.services.korri.daemon.sessiond.socketPath == cfg.services.korri.sessiond.socketPath
      && cfg.services.korri.gameStream.sessiond.socketPath == cfg.services.korri.sessiond.socketPath
      && daemonEnv.KORRI_SESSIOND_SOCKET == cfg.services.korri.sessiond.socketPath
      && sessiondEnv.KORRI_SESSIOND_SOCKET == cfg.services.korri.sessiond.socketPath
      && sessiondEnv.SWAYSOCK == "${cfg.services.korri.compositor.runtimeDir}/sway-ipc.sock"
      &&
        cfg.systemd.user.services."korri-compositor".environment.SWAYSOCK
        == "${cfg.services.korri.compositor.runtimeDir}/sway-ipc.sock"
      && lib.hasInfix "KORRI_SESSIOND_SOCKET=\"$korri_user_runtime_dir/korri/sessiond.sock\"" firstAppWrapper
      && lib.hasInfix "KORRI_GAME_STREAM_RUNTIME_DIR:=\"$korri_user_runtime_dir/korri-game-stream\"" firstAppWrapper
      && lib.hasInfix "KORRI_GAME_STREAM_STATUS_PATH=\"$korri_user_runtime_dir/korri-game-stream/status.json\"" firstAppWrapper
      && !lib.hasInfix "%t/korri" firstAppWrapper
    ))
    (check "exported source-machine module rejects socket drift" (
      hasFailure socketDriftCfg "requires sessiond, daemon, and gameStream"
    ))
    (check "exported source-machine module remains headless but graphical" (
      cfg.services.korri.daemon.streaming.enable
      && cfg.services.korri.compositor.enable
      && !cfg.services.korri.compositor.kiosk.enable
      && !cfg.services.korri.client.enable
      && cfg.services.korri.gameStream.enable
      && cfg.services.korri.input.provider.enable
      && cfg.services.korri.sessiond.role == "source-machine"
    ))
    (check "exported source-machine module enables stream-control source RPCs" (
      cfg.services.korri.daemon.streamControl.enable
      && daemonEnv.KORRI_STREAM_CONTROL_ENABLED == "1"
    ))
    (check "exported source-machine module enables Korri tailnet posture" (
      cfg.services.korri.tailnet.enable
      && cfg.services.tailscale.enable
      && builtins.elem "--accept-dns=true" tailnetFlags
      && builtins.elem "--hostname=aka" tailnetFlags
      && (daemonEnv.KORRI_PUBLIC_API_BASE_URL or null) == "http://aka:3001"
    ))
    (check "exported source-machine module opens advertised daemon port" (
      builtins.elem cfg.services.korri.daemon.port cfg.networking.firewall.allowedTCPPorts
      && !(cfg.networking.firewall.interfaces ? tailscale0)
      && !(cfg.networking.firewall.interfaces ? lan0)
      && !(builtins.elem "tailscale0" (cfg.networking.firewall.trustedInterfaces or [ ]))
    ))
    (check "exported source-machine module provisions the RetroArch closure at stable /etc/korri paths" (
      (cfg.environment.etc."korri/bin/retroarch".source or null) != null
      && (cfg.environment.etc."korri/cores/mgba_libretro.so".source or null) != null
      && (cfg.environment.etc."korri/shaders/slang".source or null) != null
      && hasPackage "korri-retroarch" cfg.systemd.user.services.korri-sessiond.path
    ))
    (check "exported source-machine module enables Gamescope plugin runtime path" (
      lib.hasInfix "@korri:gamescope" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
      && lib.hasInfix "@korri:gamescope" (sessiondEnv.KORRI_ENABLED_PLUGINS or "")
      && sessiondEnv.KORRI_STREAM_SURFACE_APP_IDS == "gamescope"
      && lib.hasInfix "@korri:gamescope" firstAppWrapper
      && hasPackage "gamescope-korri" cfg.systemd.user.services.korri-sessiond.path
      && hasPackage "gamescope-korri" cfg.services.korri.gameStream.path
      && lib.hasInfix "coreutils" firstAppWrapper
      && lib.hasInfix "util-linux" firstAppWrapper
    ))
    (check "exported source-machine module exposes opt-in RPCS3 runtime wiring" (
      (options.services.korri.rpcs3.enable.isDefined or false)
      && cfg.services.korri.rpcs3.enable == false
      && !lib.hasInfix "@korri:rpcs3" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
    ))
    (check "source-machine compositor uses the canonical logind runtime root" (
      cfg.services.korri.compositor.runtimeDir == "%t"
      && sessiondEnv.XDG_RUNTIME_DIR == "%t"
    ))
    (check "source-machine shares the existing user session bus" (
      cfg.services.korri.compositor.sessionBus.mode == "existing"
      && cfg.services.korri.compositor.sessionBus.address == "unix:path=%t/bus"
      &&
        cfg.systemd.user.services."korri-compositor".environment.DBUS_SESSION_BUS_ADDRESS
        == "unix:path=%t/bus"
      && sessiondEnv.DBUS_SESSION_BUS_ADDRESS == "unix:path=%t/bus"
    ))
    # PipeWire defaults are x86-gated in source-machine.nix, so this assertion
    # only applies when the module is evaluated for x86_64-linux. On other host
    # systems the source-machine module intentionally leaves audio to the
    # substrate, and this check is vacuously satisfied.
    (check "source-machine provides x86 PipeWire audio defaults" (
      hostSystem != "x86_64-linux"
      || (
        cfg.services.pipewire.enable
        && cfg.services.pipewire.pulse.enable
        && cfg.services.pipewire.alsa.enable
        && cfg.services.pipewire.alsa.support32Bit
        && cfg.services.pipewire.jack.enable
        && cfg.services.pipewire.wireplumber.enable
        && !cfg.services.pulseaudio.enable
        && cfg.security.rtkit.enable
      )
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-source-machine exported module check failed:\n${
    lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures
  }"
else
  pkgs.runCommand "korri-source-machine-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-source-machine module checks passed."
    touch $out
  ''
