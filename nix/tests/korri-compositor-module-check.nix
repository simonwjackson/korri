# Pure-Nix module-evaluation check for `services.korri.compositor`.
#
# Each scenario evaluates a NixOS configuration that pulls in the
# korri-compositor flake module under a different option override. Reads
# from `.config.*` are non-triggering — NixOS assertions only fail builds
# when something deep (e.g. `system.build.toplevel`) consumes them, so we
# inspect `config.assertions` directly to validate which assertions are
# expected to fire under a given scenario.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-compositor-module --no-link
{
  pkgs,
  korriCompositorModule,
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
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "compositor-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriCompositorModule
        baseModule
        overrides
      ];
    }).config;

  korriFailedAssertions =
    cfg:
    builtins.filter (a: builtins.match ".*korri.*" a.message != null) (
      builtins.filter (a: !a.assertion) cfg.assertions
    );

  korriFailedAssertionMessages = cfg: map (a: a.message) (korriFailedAssertions cfg);

  swayConfigOf = cfg: builtins.readFile cfg.services.korri.compositor.sway.configFile;
  kioskLauncherOf = cfg: builtins.readFile cfg.services.korri.compositor.kiosk.launcher;
  compositorUnit = cfg: cfg.systemd.services."korri-compositor" or { };

  HARDWARE_FACT_PATTERN = "SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix";

  # ---------------------------------------------------------------- scenarios
  baseline = evaluateWith { };

  headlessCompositor = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
    };
  };

  compositorWithKiosk = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client";
        };
      };
    }
  );

  swayPlatformFragment = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "device-korri" "exit 0"}/bin/device-korri";
        };
        sway.extraConfig = ''
          output DEVICE-PANEL transform 90
        '';
      };
    }
  );

  existingSessionBus = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client";
        };
        runtimeDir = "/run/user/0";
        sessionBus = {
          mode = "existing";
          address = "unix:path=/run/user/0/bus";
          services = [ "platform-session-dbus.service" ];
        };
      };
    }
  );

  existingSessionBusMissingAddress = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client";
        };
        sessionBus.mode = "existing";
      };
    }
  );

  rootCreateUser = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = true;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client";
        };
      };
    }
  );

  clientCommandWithArgs = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client --profile kiosk";
        };
      };
    }
  );

  emptyUser = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "";
      createUser = false;
    };
  };

  relativeRuntimeDir = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
      runtimeDir = "korri-compositor";
    };
  };

  relativeHome = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
      home = "storage";
    };
  };

  emptyKioskCommand = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
      kiosk = {
        enable = true;
        command = "";
      };
    };
  };

  runtimeDirOutsideRun = evaluateWith {
    services.korri.compositor = {
      enable = true;
      user = "root";
      createUser = false;
      runtimeDir = "/tmp/korri-compositor";
    };
  };

  # Cross-tree assertion: kiosk surface without compositor substrate.
  kioskWithoutCompositor = evaluateWith {
    services.korri.compositor = {
      enable = false;
      kiosk.enable = true;
    };
  };

  # Inputd port override propagates through compositor env vars when the
  # kiosk surface is on (the compositor reads `services.korri.input.inputd.port`
  # rather than hardcoding 3002).
  kioskWithCustomInputdPort = evaluateWith (
    { pkgs, ... }:
    {
      services.korri.compositor = {
        enable = true;
        user = "root";
        createUser = false;
        kiosk = {
          enable = true;
          command = "${pkgs.writeShellScriptBin "korri-compositor-client" "exit 0"}/bin/korri-compositor-client";
        };
      };
      services.korri.input.inputd.port = 4007;
    }
  );

  # ------------------------------------------------------------------ checks
  check = message: assertion: { inherit message assertion; };

  checks = [
    # ---- option surface
    (check "korri-compositor exposes services.korri.compositor option set" (
      baseline.services.korri ? compositor
    ))
    (check "korri-compositor exposes services.korri.client option set" (
      baseline.services.korri ? client
    ))
    (check "korri-compositor exposes services.korri.cli option set" (baseline.services.korri ? cli))

    # ---- legacy unit name MUST NOT appear
    (check "korri-compositor module does not emit a legacy korri-kiosk.service unit" (
      !(compositorWithKiosk.systemd.services ? "korri-kiosk")
    ))

    # ---- headless compositor (aka shape)
    (check "headless compositor: NixOS assertions pass" (
      korriFailedAssertions headlessCompositor == [ ]
    ))
    (check "headless compositor: compositor enabled, kiosk surface disabled" (
      headlessCompositor.services.korri.compositor.enable
      && !headlessCompositor.services.korri.compositor.kiosk.enable
    ))
    (check "headless compositor: emits korri-compositor.service" (
      headlessCompositor.systemd.services ? "korri-compositor"
    ))
    (check "headless compositor: wantedBy multi-user.target" (
      (compositorUnit headlessCompositor).wantedBy or [ ] == [ "multi-user.target" ]
    ))
    (check "headless compositor: runs Sway under the configured user" (
      (compositorUnit headlessCompositor).serviceConfig.User or null == "root"
      && lib.hasInfix "sway" ((compositorUnit headlessCompositor).serviceConfig.ExecStart or "")
    ))
    (check "headless compositor: does not auto-enable the local Korri client" (
      !headlessCompositor.services.korri.client.enable
    ))
    (check "headless compositor: omits KORRI_DESKTOP_INPUTD_URL env var" (
      !((compositorUnit headlessCompositor).environment or { } ? "KORRI_DESKTOP_INPUTD_URL")
    ))
    (check "headless compositor: omits KORRI_NATIVE_BRIDGE_URL env var" (
      !((compositorUnit headlessCompositor).environment or { } ? "KORRI_NATIVE_BRIDGE_URL")
    ))
    (check "headless compositor: Sway config has no client exec line" (
      !(lib.hasInfix "exec --no-startup-id" (swayConfigOf headlessCompositor))
    ))
    (check "headless compositor: Sway config contains the generic kiosk prelude" (
      lib.hasInfix "default_border none" (swayConfigOf headlessCompositor)
      && lib.hasInfix "default_floating_border none" (swayConfigOf headlessCompositor)
      && lib.hasInfix "hide_edge_borders both" (swayConfigOf headlessCompositor)
    ))

    # ---- compositor with kiosk surface (Sobo / live-USB shape)
    (check "compositor+kiosk: NixOS assertions pass" (korriFailedAssertions compositorWithKiosk == [ ]))
    (check "compositor+kiosk: emits korri-compositor.service" (
      compositorWithKiosk.systemd.services ? "korri-compositor"
    ))
    (check "compositor+kiosk: mkDefault-enables client + cli" (
      compositorWithKiosk.services.korri.client.enable && compositorWithKiosk.services.korri.cli.enable
    ))
    (check "compositor+kiosk: runs Sway under dbus-run-session" (
      lib.hasInfix "dbus-run-session" ((compositorUnit compositorWithKiosk).serviceConfig.ExecStart or "")
      && lib.hasInfix "sway" ((compositorUnit compositorWithKiosk).serviceConfig.ExecStart or "")
    ))
    (check "compositor+kiosk: RuntimeDirectory is korri-compositor" (
      (compositorUnit compositorWithKiosk).serviceConfig.RuntimeDirectory or null == "korri-compositor"
    ))
    (check "compositor+kiosk: StartLimitBurst and IntervalSec are set" (
      (compositorUnit compositorWithKiosk).unitConfig.StartLimitBurst or null == 5
      && (compositorUnit compositorWithKiosk).unitConfig.StartLimitIntervalSec or null == 60
    ))
    (check "compositor+kiosk: KORRI_NATIVE_BRIDGE_URL points at inputd default port" (
      (compositorUnit compositorWithKiosk).environment.KORRI_NATIVE_BRIDGE_URL or null
      == "ws://127.0.0.1:3002"
    ))
    (check "compositor+kiosk: KORRI_DESKTOP_INPUTD_URL points at inputd default port" (
      (compositorUnit compositorWithKiosk).environment.KORRI_DESKTOP_INPUTD_URL or null
      == "ws://127.0.0.1:3002"
    ))
    (check "compositor+kiosk: installs the korri-cli package on PATH" (
      builtins.any (path: lib.hasInfix "-korri-cli-" (toString path)) (
        compositorWithKiosk.environment.systemPackages or [ ]
      )
    ))
    (check "compositor+kiosk: Sway config exec-launches the kiosk client wrapper" (
      lib.hasInfix "exec --no-startup-id" (swayConfigOf compositorWithKiosk)
      && lib.hasInfix "korri-compositor-kiosk-client" (swayConfigOf compositorWithKiosk)
    ))
    (check "compositor+kiosk: kiosk launcher wraps the configured client command" (
      lib.hasInfix "korri-compositor-client" (kioskLauncherOf compositorWithKiosk)
      && lib.hasInfix "while true" (kioskLauncherOf compositorWithKiosk)
      && lib.hasInfix "client exited with status" (kioskLauncherOf compositorWithKiosk)
    ))
    (check "compositor+kiosk: gamescope is on the session PATH" (
      builtins.any (path: lib.hasInfix "gamescope" (toString path)) (
        (compositorUnit compositorWithKiosk).path or [ ]
      )
    ))

    # ---- platform Sway fragments preserve the prelude AND get appended
    (check "platform sway fragments: prelude preserved" (
      lib.hasInfix "default_border none" (swayConfigOf swayPlatformFragment)
    ))
    (check "platform sway fragments: kiosk exec line still emitted" (
      lib.hasInfix "exec --no-startup-id" (swayConfigOf swayPlatformFragment)
      && lib.hasInfix "device-korri" (kioskLauncherOf swayPlatformFragment)
    ))
    (check "platform sway fragments: extra config appears verbatim" (
      lib.hasInfix "output DEVICE-PANEL transform 90" (swayConfigOf swayPlatformFragment)
    ))

    # ---- platform-owned existing session bus
    (check "existing session bus: assertions pass" (korriFailedAssertions existingSessionBus == [ ]))
    (check "existing session bus: ExecStart drops dbus-run-session" (
      !lib.hasInfix "dbus-run-session" ((compositorUnit existingSessionBus).serviceConfig.ExecStart or "")
      && lib.hasInfix "sway" ((compositorUnit existingSessionBus).serviceConfig.ExecStart or "")
    ))
    (check "existing session bus: drops RuntimeDirectory" (
      (compositorUnit existingSessionBus).serviceConfig.RuntimeDirectory or null == null
    ))
    (check "existing session bus: exposes XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS" (
      (compositorUnit existingSessionBus).environment.XDG_RUNTIME_DIR or null == "/run/user/0"
      &&
        (compositorUnit existingSessionBus).environment.DBUS_SESSION_BUS_ADDRESS or null
        == "unix:path=/run/user/0/bus"
    ))
    (check "existing session bus: requires and orders the platform unit" (
      builtins.elem "platform-session-dbus.service" ((compositorUnit existingSessionBus).requires or [ ])
      && builtins.elem "platform-session-dbus.service" ((compositorUnit existingSessionBus).after or [ ])
    ))

    # ---- NixOS assertions for substrate constraints
    (check "existing session bus without address: assertion fires" (
      builtins.any (m: lib.hasInfix "sessionBus.address" m) (
        korriFailedAssertionMessages existingSessionBusMissingAddress
      )
    ))
    (check "createUser cannot manage root: assertion fires" (
      builtins.any (m: lib.hasInfix "createUser" m) (korriFailedAssertionMessages rootCreateUser)
    ))
    (check "empty user: assertion fires" (
      builtins.any (m: lib.hasInfix "must not be empty" m) (korriFailedAssertionMessages emptyUser)
    ))
    (check "relative runtimeDir: assertion fires" (
      builtins.any (m: lib.hasInfix "absolute path" m) (korriFailedAssertionMessages relativeRuntimeDir)
    ))
    (check "relative home: assertion fires" (
      builtins.any (m: lib.hasInfix "home must be an absolute path" m) (
        korriFailedAssertionMessages relativeHome
      )
    ))
    (check "empty kiosk command: assertion fires" (
      builtins.any (m: lib.hasInfix "kiosk.command must not be empty" m) (
        korriFailedAssertionMessages emptyKioskCommand
      )
    ))
    (check "runtimeDir outside /run: assertion fires" (
      builtins.any (m: lib.hasInfix "under /run" m) (korriFailedAssertionMessages runtimeDirOutsideRun)
    ))

    # ---- cross-tree assertion: kiosk surface without compositor substrate
    (check "kiosk without compositor: assertion mentions compositor.enable" (
      builtins.any (m: lib.hasInfix "services.korri.compositor.enable" m) (
        korriFailedAssertionMessages kioskWithoutCompositor
      )
    ))
    (check "kiosk without compositor: systemd unit is NOT generated" (
      !(kioskWithoutCompositor.systemd.services ? "korri-compositor")
    ))

    # ---- compositor+kiosk auto-enables the inputd bridge and orders units
    (check "compositor+kiosk: mkDefault-enables services.korri.input.inputd" (
      compositorWithKiosk.services.korri.input.inputd.enable
    ))
    (check "compositor+kiosk: emits korri-inputd.service" (
      compositorWithKiosk.systemd.services ? korri-inputd
    ))
    (check "compositor+kiosk: compositor unit wants korri-inputd.service" (
      builtins.elem "korri-inputd.service" ((compositorUnit compositorWithKiosk).wants or [ ])
    ))
    (check "compositor+kiosk: compositor unit starts after korri-inputd.service" (
      builtins.elem "korri-inputd.service" ((compositorUnit compositorWithKiosk).after or [ ])
    ))
    (check "compositor+kiosk: inputd is ordered before korri-compositor.service" (
      builtins.elem "korri-compositor.service" (
        compositorWithKiosk.systemd.services.korri-inputd.before or [ ]
      )
    ))
    (check "headless compositor: does NOT auto-enable inputd" (
      !headlessCompositor.services.korri.input.inputd.enable
    ))
    (check "headless compositor: compositor unit does NOT wait on korri-inputd.service" (
      !builtins.elem "korri-inputd.service" ((compositorUnit headlessCompositor).after or [ ])
    ))

    # ---- inputd port option drives compositor env vars (was hardcoded 3002)
    (check "compositor reads inputd.port: KORRI_NATIVE_BRIDGE_URL reflects override" (
      (compositorUnit kioskWithCustomInputdPort).environment.KORRI_NATIVE_BRIDGE_URL or null
      == "ws://127.0.0.1:4007"
    ))
    (check "compositor reads inputd.port: KORRI_DESKTOP_INPUTD_URL reflects override" (
      (compositorUnit kioskWithCustomInputdPort).environment.KORRI_DESKTOP_INPUTD_URL or null
      == "ws://127.0.0.1:4007"
    ))

    # ---- client command arguments survive into the launcher
    (check "client command arguments survive into the launcher body" (
      lib.hasInfix "korri-compositor-client --profile kiosk" (kioskLauncherOf clientCommandWithArgs)
    ))
    (check "client command arguments do not leak into sway config (launcher path only)" (
      !(lib.hasInfix "--profile kiosk" (swayConfigOf clientCommandWithArgs))
      && lib.hasInfix "korri-compositor-kiosk-client" (swayConfigOf clientCommandWithArgs)
    ))

    # ---- generic-default hygiene
    (check "compositor+kiosk: generic defaults free of device-specific facts" (
      builtins.match ".*(${HARDWARE_FACT_PATTERN}).*" (swayConfigOf compositorWithKiosk) == null
      &&
        builtins.match ".*(${HARDWARE_FACT_PATTERN}).*" (
          builtins.toJSON ((compositorUnit compositorWithKiosk).environment or { })
        ) == null
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-compositor module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-compositor-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-compositor module checks passed."
    touch $out
  ''
