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

  enabled = evaluateWith "aarch64-linux" (
    { pkgs, ... }:
    {
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
      };
    }
  );

  enabledKeepWarm = evaluateWith "aarch64-linux" (
    { pkgs, ... }:
    {
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
        keepWarm = true;
      };
    }
  );

  enabledKeepVisible = evaluateWith "aarch64-linux" (
    { pkgs, ... }:
    {
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
        keepVisibleDuringLaunch = true;
      };
    }
  );

  runtimeOverride = evaluateWith "aarch64-linux" (
    { pkgs, ... }:
    {
      services.korri.runtime = {
        stateRoot = "/var/lib/korri-alt";
        gamesRoot = "/var/lib/korri-alt/content/games";
        home = "/home/korri-alt";
      };
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
      };
    }
  );

  invalidPath = evaluateWith "aarch64-linux" (
    { pkgs, ... }:
    {
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
        home = "/storage/.local/share/Steam";
      };
    }
  );

  x86Enabled = evaluateWith "x86_64-linux" (
    { pkgs, ... }:
    {
      services.korri.steam = {
        enable = true;
        package = pkgs.steam-korri;
      };
    }
  );

  disabled = evaluateWith "aarch64-linux" { };

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  hasFailedAssertion =
    needle: cfg: builtins.any (a: lib.hasInfix needle a.message) (failedAssertions cfg);

  gamescopedSteamUnit = enabled.systemd.services.korri-steam-gamescope or { };
  steamWarmUnit = enabledKeepWarm.systemd.user.services.korri-steam-warm or { };
  uinputUnit = enabled.systemd.services.korri-steam-uinput or { };
  seedUnit = enabled.systemd.services.korri-steam-seed or { };
  fexRootfsUnit = enabled.systemd.services.korri-steam-prepare-fex-rootfs or { };
  udevRules = enabled.services.udev.extraRules or "";
  systemPackageNames = cfg: map (pkg: pkg.name or "") cfg.environment.systemPackages;
  sudoCommands = lib.flatten (
    map (rule: map (command: command.command or "") (rule.commands or [ ])) (
      enabled.security.sudo.extraRules or [ ]
    )
  );
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
      && !(disabled.systemd.services ? korri-steam-gamescope)
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
      && builtins.any (name: lib.hasInfix "korri-steam-recover" name) (systemPackageNames enabled)
      && builtins.any (name: lib.hasInfix "korri-steam-warm" name) (systemPackageNames enabled)
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
    (check "keepWarm adds a user-session warmup unit" (
      enabledKeepWarm.systemd.user.services ? korri-steam-warm
      && builtins.elem "korri-session.target" (steamWarmUnit.wantedBy or [ ])
      && builtins.elem "korri-compositor.service" (steamWarmUnit.after or [ ])
      && (steamWarmUnit.serviceConfig.Type or null) == "oneshot"
      && lib.hasInfix "korri-steam-warm" (serviceExec steamWarmUnit)
    ))
    (check "Steam visibility debugging defaults off and can be enabled" (
      enabled.services.korri.steam.keepVisibleDuringLaunch == false
      && enabledKeepVisible.services.korri.steam.keepVisibleDuringLaunch == true
    ))
    (check "uinput service is rendered and ordered for boot convergence" (
      enabled.systemd.services ? korri-steam-uinput
      && builtins.elem "multi-user.target" (uinputUnit.wantedBy or [ ])
      && lib.hasInfix "korri-steam-ensure-uinput" (serviceExec uinputUnit)
    ))
    (check "Steam Input devices are isolated behind a Steam-only group" (
      builtins.hasAttr "korri-steam-input" enabled.users.groups
      && lib.hasInfix "KERNEL==\"uinput\"" udevRules
      && lib.hasInfix "GROUP=\"korri-steam-input\"" udevRules
      && lib.hasInfix "ATTRS{id/vendor}==\"28de\"" udevRules
      && lib.hasInfix "ATTRS{id/product}==\"11ff\"" udevRules
      && lib.hasInfix "TAG-=\"uaccess\"" udevRules
      && lib.hasInfix "setfacl -b $env{DEVNAME}" udevRules
    ))
    (check "default Steam channel tracks Steam Deck stable on ARM64" (
      enabled.services.korri.steam.betaChannel == "steamdeck_stable"
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
      && (seedUnit.environment.STEAM_BETA or null) == "steamdeck_stable"
      && lib.hasInfix "steam-arm64-seed --apply" (serviceExec seedUnit)
    ))
    (check "gamescoped launch service carries Korri identity and avoids Deck/Gamepad UI persona" (
      enabled.systemd.services ? korri-steam-gamescope
      && (gamescopedSteamUnit.serviceConfig.User or null) == "korri"
      && (gamescopedSteamUnit.serviceConfig.Group or null) == "korri"
      && builtins.elem "korri-steam-input" (gamescopedSteamUnit.serviceConfig.SupplementaryGroups or [ ])
      && (gamescopedSteamUnit.serviceConfig.WorkingDirectory or null) == "/var/lib/korri/steam"
      && (gamescopedSteamUnit.serviceConfig.LimitNOFILE or null) == 524288
      && (gamescopedSteamUnit.environment.GAMESCOPE_WAYLAND_DISPLAY or null) == "gamescope-0"
      && (gamescopedSteamUnit.environment.PULSE_SERVER or null) == "unix:/run/user/2000/pulse/native"
      && lib.hasInfix "gamescope" (serviceExec gamescopedSteamUnit)
      && lib.hasInfix "korri-steam-guest" (serviceExec gamescopedSteamUnit)
      && !(lib.hasInfix "-gamepadui" (serviceExec gamescopedSteamUnit))
      && !(lib.hasInfix "-steamos3" (serviceExec gamescopedSteamUnit))
      && !(lib.hasInfix "-steampal" (serviceExec gamescopedSteamUnit))
      && !(lib.hasInfix "-steamdeck" (serviceExec gamescopedSteamUnit))
      && !(lib.hasInfix " -O DSI-" (serviceExec gamescopedSteamUnit))
      && !(enabled.systemd.services ? korri-steam)
      && builtins.elem "korri-steam-seed.service" (gamescopedSteamUnit.after or [ ])
      && !(builtins.elem "korri-steam-runtime-prep.service" (gamescopedSteamUnit.after or [ ]))
      && !(builtins.elem "korri-steam-runtime-prep.service" (gamescopedSteamUnit.wants or [ ]))
      && (gamescopedSteamUnit.serviceConfig.RestartForceExitStatus or [ ]) == [ 42 ]
      && (gamescopedSteamUnit.startLimitBurst or null) == 30
    ))
    (check "module exposes no non-gamescoped Steam service" (!(enabled.systemd.services ? korri-steam)))
    (check "gamescoped launch service exports the Korri user session environment" (
      (gamescopedSteamUnit.environment.XDG_RUNTIME_DIR or null) == "/run/user/2000"
      &&
        (gamescopedSteamUnit.environment.DBUS_SESSION_BUS_ADDRESS or null) == "unix:path=/run/user/2000/bus"
      && (gamescopedSteamUnit.environment.PULSE_SERVER or null) == "unix:/run/user/2000/pulse/native"
      && (gamescopedSteamUnit.environment.STEAM_HOME or null) == "/var/lib/korri/steam"
      &&
        (gamescopedSteamUnit.environment.STEAM_GAMES_ROOT or null) == "/var/lib/korri/content/games/steam"
      && (gamescopedSteamUnit.environment.STEAM_DOT or null) == "/home/korri/.steam"
      && (gamescopedSteamUnit.environment.STEAM_BETA or null) == "steamdeck_stable"
    ))
    (check "FEX rootfs service converges before gamescoped Steam launch" (
      enabled.systemd.services ? korri-steam-prepare-fex-rootfs
      && builtins.elem "multi-user.target" (fexRootfsUnit.wantedBy or [ ])
      && lib.hasInfix "korri-steam-prepare-fex-rootfs" (serviceExec fexRootfsUnit)
      && builtins.elem "korri-steam-prepare-fex-rootfs.service" (gamescopedSteamUnit.after or [ ])
      && builtins.elem "korri-steam-prepare-fex-rootfs.service" (gamescopedSteamUnit.wants or [ ])
    ))
    (check "normal Steam startup has no runtime-prep service or path watch" (
      !(enabled.systemd.services ? korri-steam-runtime-prep)
      && !(enabled.systemd.paths ? korri-steam-runtime-prep)
    ))
    (check "recovery helper is installed for explicit package-state repair" (
      builtins.any (name: lib.hasInfix "korri-steam-recover" name) (systemPackageNames enabled)
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
