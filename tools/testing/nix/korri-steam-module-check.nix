# Pure-Nix module-evaluation check for `services.korri.steam`.
#
# Device-neutral: evaluates the Korri-owned Steam adapter against minimal NixOS
# fixtures and asserts option defaults, rendered packages/services, launch
# hardening, and path/architecture assertions. The composed SM8550 posture is
# asserted by korri-rocknix-sm8550-config-check.
{
  pkgs,
  korriSteamModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  check = message: assertion: { inherit message assertion; };

  fakeSteamOverlay = final: prev: {
    steam-korri =
      prev.runCommand "fake-steam-korri"
        {
          passthru = {
            rocknixSteamHasRunCapsule = true;
          };
        }
        ''
          mkdir -p "$out/bin"
          cat > "$out/bin/steam-arm64-fhs" <<'EOF'
          #!/usr/bin/env sh
          exit 0
          EOF
          chmod +x "$out/bin/steam-arm64-fhs"
        '';
  };

  baseModule =
    hostSystem:
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      nixpkgs.config.allowUnfree = true;
      nixpkgs.overlays = [ fakeSteamOverlay ];
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "steam-module-test";
    };

  evaluateWith =
    hostSystem: overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriSteamModule
        (baseModule hostSystem)
        overrides
      ];
    }).config;

  enabled = evaluateWith "aarch64-linux" {
    services.korri.steam.enable = true;
  };

  enabledKeepWarm = evaluateWith "aarch64-linux" {
    services.korri.steam = {
      enable = true;
      keepWarm = true;
    };
  };

  experimentalWrapper = evaluateWith "aarch64-linux" {
    services.korri.steam = {
      enable = true;
      enableExperimentalPerGameGamescopeWrapper = true;
    };
  };

  runtimeOverride = evaluateWith "aarch64-linux" {
    services.korri.runtime = {
      stateRoot = "/var/lib/korri-alt";
      gamesRoot = "/var/lib/korri-alt/content/games";
      home = "/home/korri-alt";
    };
    services.korri.steam.enable = true;
  };

  invalidPath = evaluateWith "aarch64-linux" {
    services.korri.steam = {
      enable = true;
      home = "/storage/.local/share/Steam";
    };
  };

  x86Enabled = evaluateWith "x86_64-linux" {
    services.korri.steam.enable = true;
  };

  disabled = evaluateWith "aarch64-linux" { };

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  hasFailedAssertion =
    needle: cfg: builtins.any (a: lib.hasInfix needle a.message) (failedAssertions cfg);

  steamUnit = enabled.systemd.services.korri-steam or { };
  steamWarmUnit = enabledKeepWarm.systemd.user.services.korri-steam-warm or { };
  uinputUnit = enabled.systemd.services.korri-steam-uinput or { };
  seedUnit = enabled.systemd.services.korri-steam-seed or { };
  fexRootfsUnit = enabled.systemd.services.korri-steam-prepare-fex-rootfs or { };
  runtimePrepUnit = enabled.systemd.services.korri-steam-runtime-prep or { };
  runtimePrepPath = enabled.systemd.paths.korri-steam-runtime-prep or { };
  systemPackageNames = cfg: map (pkg: pkg.name or "") cfg.environment.systemPackages;
  sudoCommands = lib.flatten (map (rule: map (command: command.command or "") (rule.commands or [ ])) (enabled.security.sudo.extraRules or [ ]));
  serviceExec =
    unit:
    let
      normalize = raw: if builtins.isList raw then lib.concatStringsSep "\n" raw else raw;
    in
    lib.concatStringsSep "\n" [
      (normalize (unit.serviceConfig.ExecStartPre or ""))
      (normalize (unit.serviceConfig.ExecStart or ""))
    ];
  pathChangedText =
    pathUnit:
    let
      raw = pathUnit.pathConfig.PathChanged or "";
    in
    if builtins.isList raw then lib.concatStringsSep "\n" raw else raw;

  checks = [
    (check "enabled aarch64 module evaluates without failed assertions" (
      failedAssertions enabled == [ ]
    ))
    (check "enable = false contributes no Steam package or services" (
      !(disabled.systemd.services ? korri-steam)
      && !(disabled.systemd.services ? korri-steam-uinput)
      && !(builtins.any (name: lib.hasInfix "steam" name) (systemPackageNames disabled))
    ))
    (check "default paths derive from korri-runtime" (
      enabled.services.korri.steam.home == "/var/lib/korri/steam"
      && enabled.services.korri.steam.gamesRoot == "/var/lib/korri/content/games/steam"
      && enabled.services.korri.steam.dotDir == "/home/korri/.steam"
      && enabled.services.korri.steam.fexRootfs == "/var/lib/korri/steam/fex-rootfs"
    ))
    (check "runtime path overrides flow into Steam defaults" (
      runtimeOverride.services.korri.steam.home == "/var/lib/korri-alt/steam"
      && runtimeOverride.services.korri.steam.gamesRoot == "/var/lib/korri-alt/content/games/steam"
      && runtimeOverride.services.korri.steam.dotDir == "/home/korri-alt/.steam"
    ))
    (check "enabled module installs package, launchers, and uinput helper" (
      builtins.any (name: lib.hasInfix "fake-steam-korri" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-guest" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-app" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-service-control" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-warm" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-launch-options" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-ensure-uinput" name) (systemPackageNames enabled)
    ))
    (check "Steam app launcher can bracket the managed system service" (
      builtins.any (command: lib.hasInfix "korri-steam-service-control start" command) sudoCommands
      && builtins.any (command: lib.hasInfix "korri-steam-service-control stop" command) sudoCommands
    ))
    (check "keepWarm defaults off for device-neutral Steam configs" (
      enabled.services.korri.steam.keepWarm == false
      && !(enabled.systemd.user.services ? korri-steam-warm)
    ))
    (check "per-game Gamescope LaunchOptions wrapper is disabled by default" (
      enabled.services.korri.steam.enableExperimentalPerGameGamescopeWrapper == false
      && experimentalWrapper.services.korri.steam.enableExperimentalPerGameGamescopeWrapper == true
    ))
    (check "keepWarm adds a user-session warmup unit" (
      enabledKeepWarm.systemd.user.services ? korri-steam-warm
      && builtins.elem "korri-session.target" (steamWarmUnit.wantedBy or [ ])
      && builtins.elem "korri-compositor.service" (steamWarmUnit.after or [ ])
      && (steamWarmUnit.serviceConfig.Type or null) == "oneshot"
      && lib.hasInfix "korri-steam-warm" (serviceExec steamWarmUnit)
    ))
    (check "uinput service is rendered and ordered for boot convergence" (
      enabled.systemd.services ? korri-steam-uinput
      && builtins.elem "multi-user.target" (uinputUnit.wantedBy or [ ])
      && lib.hasInfix "korri-steam-ensure-uinput" (serviceExec uinputUnit)
    ))
    (check "seed service downloads ARM64 Steam payloads before launch" (
      enabled.systemd.services ? korri-steam-seed
      && builtins.elem "multi-user.target" (seedUnit.wantedBy or [ ])
      && (seedUnit.serviceConfig.User or null) == "korri"
      && (seedUnit.serviceConfig.Group or null) == "korri"
      && (seedUnit.serviceConfig.WorkingDirectory or null) == "-/var/lib/korri/steam"
      && lib.hasInfix "install -d" (serviceExec seedUnit)
      && lib.hasInfix "/var/lib/korri/steam" (serviceExec seedUnit)
      && (seedUnit.environment.STEAM_HOME or null) == "/var/lib/korri/steam"
      && (seedUnit.environment.STEAM_GAMES_ROOT or null) == "/var/lib/korri/content/games/steam"
      && (seedUnit.environment.STEAM_DOT or null) == "/home/korri/.steam"
      && lib.hasInfix "steam-arm64-seed --apply" (serviceExec seedUnit)
    ))
    (check "launch service carries Korri identity and fd hardening" (
      enabled.systemd.services ? korri-steam
      && (steamUnit.serviceConfig.User or null) == "korri"
      && (steamUnit.serviceConfig.Group or null) == "korri"
      && (steamUnit.serviceConfig.WorkingDirectory or null) == "/var/lib/korri/steam"
      && (steamUnit.serviceConfig.LimitNOFILE or null) == 524288
      && lib.hasInfix "korri-steam-guest" (serviceExec steamUnit)
      && builtins.elem "korri-steam-seed.service" (steamUnit.after or [ ])
      && builtins.elem "korri-steam-seed.service" (steamUnit.wants or [ ])
    ))
    (check "launch service exports the Korri user session environment" (
      (steamUnit.environment.XDG_RUNTIME_DIR or null) == "/run/user/2000"
      && (steamUnit.environment.DBUS_SESSION_BUS_ADDRESS or null) == "unix:path=/run/user/2000/bus"
      && (steamUnit.environment.STEAM_HOME or null) == "/var/lib/korri/steam"
      && (steamUnit.environment.STEAM_GAMES_ROOT or null) == "/var/lib/korri/content/games/steam"
      && (steamUnit.environment.STEAM_DOT or null) == "/home/korri/.steam"
    ))
    (check "FEX rootfs service converges before Steam launch" (
      enabled.systemd.services ? korri-steam-prepare-fex-rootfs
      && builtins.elem "multi-user.target" (fexRootfsUnit.wantedBy or [ ])
      && lib.hasInfix "korri-steam-prepare-fex-rootfs" (serviceExec fexRootfsUnit)
      && builtins.elem "korri-steam-prepare-fex-rootfs.service" (steamUnit.after or [ ])
      && builtins.elem "korri-steam-prepare-fex-rootfs.service" (steamUnit.wants or [ ])
    ))
    (check "runtime prep service repairs Proton payloads as the Korri user" (
      enabled.systemd.services ? korri-steam-runtime-prep
      && (runtimePrepUnit.serviceConfig.User or null) == "korri"
      && (runtimePrepUnit.serviceConfig.Group or null) == "korri"
      && (runtimePrepUnit.serviceConfig.WorkingDirectory or null) == "-/var/lib/korri/steam"
      && lib.hasInfix "install -d" (serviceExec runtimePrepUnit)
      && (runtimePrepUnit.environment.STEAM_HOME or null) == "/var/lib/korri/steam"
      && (runtimePrepUnit.environment.FEX_ROOTFS or null) == "/var/lib/korri/steam/fex-rootfs"
      && (runtimePrepUnit.environment.FEX_WRAPPER_BIN or null) == "/usr/bin/FEX"
      && lib.hasInfix "steam-guest-runtime-prep --apply" (serviceExec runtimePrepUnit)
    ))
    (check "runtime prep path watches mutable Proton and Sniper updates" (
      enabled.systemd.paths ? korri-steam-runtime-prep
      && builtins.elem "multi-user.target" (runtimePrepPath.wantedBy or [ ])
      && (runtimePrepPath.pathConfig.Unit or null) == "korri-steam-runtime-prep.service"
      && lib.hasInfix "Proton 11.0 (ARM64)/proton" (pathChangedText runtimePrepPath)
      && lib.hasInfix "Proton 10.0/proton" (pathChangedText runtimePrepPath)
      && lib.hasInfix "SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap" (
        pathChangedText runtimePrepPath
      )
      && lib.hasInfix "SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb" (
        pathChangedText runtimePrepPath
      )
    ))
    (check "tmpfiles create Korri-owned Steam state" (
      builtins.elem "d /var/lib/korri/steam 0750 korri korri -" enabled.systemd.tmpfiles.rules
      && builtins.elem "d /var/lib/korri/content/games/steam 0750 korri korri -" enabled.systemd.tmpfiles.rules
      && builtins.elem "d /home/korri/.steam 0700 korri korri -" enabled.systemd.tmpfiles.rules
      && builtins.elem "d /var/lib/korri/steam/fex-data 0750 korri korri -" enabled.systemd.tmpfiles.rules
    ))
    (check "invalid /storage Steam home fails the path assertion" (
      hasFailedAssertion "services.korri.steam.home must live under services.korri.runtime.stateRoot" invalidPath
    ))
    (check "enabling on x86 fails the aarch64 assertion" (
      hasFailedAssertion "services.korri.steam requires the aarch64 Steam run capsule" x86Enabled
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Steam module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-steam-module-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri Steam module invariants passed.
    EOF
  ''
