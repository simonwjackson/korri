# Pure-Nix module-evaluation check for `services.korri.input`.
#
# Covers the two peer sub-trees:
#   - input.provider:   declares + (when name = "inputplumber") fully wires
#                       a host-side normalized-input provider, including
#                       loading the uinput kernel module and writing the
#                       /dev/uinput udev rule that Sunshine needs to
#                       synthesize controllers.
#   - input.inputd:     the korri-inputd WebSocket bridge daemon used by
#                       the local kiosk client; orthogonal to provider.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-input-module --no-link
{
  pkgs,
  korriInputModule,
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
      networking.hostName = "input-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriInputModule
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

  inputdUnit = cfg: cfg.systemd.user.services.korri-inputd or { };
  inputplumberUnit = cfg: cfg.systemd.services.inputplumber or { };

  # ---------------------------------------------------------------- scenarios
  baseline = evaluateWith { };

  providerInputplumber = evaluateWith {
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
    };
  };

  providerEnabledNoName = evaluateWith {
    services.korri.input.provider.enable = true;
  };

  providerWithExtraServices = evaluateWith {
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
      services = [ "platform-input.service" ];
    };
  };

  providerWithInvalidService = evaluateWith {
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
      services = [ "platform-input" ];
    };
  };

  inputdOnly = evaluateWith {
    services.korri.input.inputd.enable = true;
  };

  inputdCustomPort = evaluateWith {
    services.korri.input.inputd = {
      enable = true;
      port = 4001;
    };
  };

  inputdRemoteHostname = evaluateWith {
    services.korri.input.inputd = {
      enable = true;
      hostname = "0.0.0.0";
    };
  };

  inputdWithProvider = evaluateWith {
    services.korri.input.provider = {
      enable = true;
      name = "inputplumber";
    };
    services.korri.input.inputd.enable = true;
  };

  inputdBeforeOverride = evaluateWith {
    services.korri.input.inputd = {
      enable = true;
      before = [ "korri-compositor.service" ];
    };
  };

  # ------------------------------------------------------------------ checks
  check = message: assertion: { inherit message assertion; };

  checks = [
    # ---- option surface
    (check "korri-input exposes services.korri.input.provider option set" (
      baseline.services.korri.input ? provider
    ))
    (check "korri-input exposes services.korri.input.inputd option set" (
      baseline.services.korri.input ? inputd
    ))

    # ---- baseline (nothing enabled)
    (check "baseline: NixOS assertions pass" (korriFailedAssertions baseline == [ ]))
    (check "baseline: services.inputplumber.enable defaults to false" (
      !baseline.services.inputplumber.enable
    ))
    (check "baseline: uinput is NOT loaded by default" (
      !(builtins.elem "uinput" (baseline.boot.kernelModules or [ ]))
    ))
    (check "baseline: uhid is NOT loaded by default" (
      !(builtins.elem "uhid" (baseline.boot.kernelModules or [ ]))
    ))
    (check "baseline: no korri-inputd systemd unit" (!(baseline.systemd.user.services ? korri-inputd)))
    (check "baseline: no inputplumber systemd unit" (!(baseline.systemd.services ? inputplumber)))
    (check "baseline: udev rules do not mention uinput" (
      !(lib.hasInfix "uinput" (baseline.services.udev.extraRules or ""))
    ))

    # ---- provider with name = "inputplumber" (full-wiring path)
    (check "provider/inputplumber: NixOS assertions pass" (
      korriFailedAssertions providerInputplumber == [ ]
    ))
    (check "provider/inputplumber: enables services.inputplumber" (
      providerInputplumber.services.inputplumber.enable
    ))
    (check "provider/inputplumber: emits inputplumber.service" (
      providerInputplumber.systemd.services ? inputplumber
    ))
    (check "provider/inputplumber: loads uinput kernel module" (
      builtins.elem "uinput" providerInputplumber.boot.kernelModules
    ))
    (check "provider/inputplumber: does NOT load uhid (DualSense passthrough is opt-in)" (
      !(builtins.elem "uhid" providerInputplumber.boot.kernelModules)
    ))
    (check "provider/inputplumber: writes /dev/uinput udev rule" (
      lib.hasInfix ''KERNEL=="uinput"'' providerInputplumber.services.udev.extraRules
      && lib.hasInfix ''GROUP="input"'' providerInputplumber.services.udev.extraRules
      && lib.hasInfix ''TAG+="uaccess"'' providerInputplumber.services.udev.extraRules
    ))
    (check "provider/inputplumber: does NOT emit a korri-inputd unit on its own" (
      # provider and inputd are orthogonal: enabling provider alone must not
      # bring inputd along, since streaming hosts (aka) want the provider
      # without the local kiosk bridge.
      !(providerInputplumber.systemd.user.services ? korri-inputd)
    ))

    # ---- provider assertion: enable + null name is rejected
    (check "provider.enable without name: assertion fires" (
      builtins.any (m: lib.hasInfix "provider.name" m) (
        korriFailedAssertionMessages providerEnabledNoName
      )
    ))
    (check "provider with invalid service name: assertion fires" (
      builtins.any (m: lib.hasInfix "provider.services entries must be systemd service units" m) (
        korriFailedAssertionMessages providerWithInvalidService
      )
    ))

    # ---- provider with extra-platform services
    (check "provider/extra services: caller-supplied services are preserved" (
      providerWithExtraServices.services.korri.input.provider.services == [ "platform-input.service" ]
    ))

    # ---- inputd only (no provider)
    (check "inputd-only: NixOS assertions pass" (korriFailedAssertions inputdOnly == [ ]))
    (check "inputd-only: emits korri-inputd.service" (inputdOnly.systemd.user.services ? korri-inputd))
    (check "inputd-only: defaults to loopback bind + port 3002" (
      (inputdUnit inputdOnly).environment.KORRI_INPUT_BRIDGE_HOSTNAME or null == "127.0.0.1"
      && (inputdUnit inputdOnly).environment.KORRI_INPUT_BRIDGE_PORT or null == "3002"
    ))
    (check "inputd-only: wantedBy korri-session.target" (
      (inputdUnit inputdOnly).wantedBy or [ ] == [ "korri-session.target" ]
    ))
    (check "inputd-only: provider plumbing stays dormant" (
      !inputdOnly.services.inputplumber.enable
      && !(builtins.elem "uinput" (inputdOnly.boot.kernelModules or [ ]))
    ))

    # ---- inputd port + hostname overrides propagate
    (check "inputd port override: KORRI_INPUT_BRIDGE_PORT reflects override" (
      (inputdUnit inputdCustomPort).environment.KORRI_INPUT_BRIDGE_PORT or null == "4001"
    ))
    (check "inputd hostname override: KORRI_INPUT_BRIDGE_HOSTNAME reflects override" (
      (inputdUnit inputdRemoteHostname).environment.KORRI_INPUT_BRIDGE_HOSTNAME or null == "0.0.0.0"
    ))

    # ---- provider+inputd integration: inputd is ordered after the provider
    (check "inputd+provider: korri-inputd wants inputplumber.service" (
      builtins.elem "inputplumber.service" ((inputdUnit inputdWithProvider).wants or [ ])
    ))
    (check "inputd+provider: korri-inputd starts after inputplumber.service" (
      builtins.elem "inputplumber.service" ((inputdUnit inputdWithProvider).after or [ ])
    ))

    # ---- caller-supplied inputd.before is honored
    (check "inputd.before override: korri-inputd starts before declared units" (
      builtins.elem "korri-compositor.service" ((inputdUnit inputdBeforeOverride).before or [ ])
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-input module check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-input-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-input module checks passed."
    touch $out
  ''
