# Pure-Nix module-evaluation check for `services.korri.rocknixGuestProfile`.
#
# Device-neutral: evaluates the shared ROCKNIX guest-profile module against a
# minimal fixture host and asserts the activation script and stage10 proof
# marker contracts independently from any platform adapter.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-rocknix-guest-profile-module --no-link
{
  pkgs,
  korriRocknixGuestProfileModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "korri-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriRocknixGuestProfileModule
        baseModule
        overrides
      ];
    }).config;

  enabled = evaluateWith {
    services.korri.rocknixGuestProfile = {
      enable = true;
      proofMarkerLabel = "korri-test-system";
    };
  };

  disabled = evaluateWith { };

  emptyLabel = evaluateWith {
    services.korri.rocknixGuestProfile = {
      enable = true;
      proofMarkerLabel = "";
    };
  };

  missingLabelTryEval = builtins.tryEval (
    (evaluateWith {
      services.korri.rocknixGuestProfile.enable = true;
    }).environment.etc."rocknix-stage10-proof-marker".text
  );

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  activationScript = cfg: cfg.system.activationScripts.korri-rocknix-guest-profile or { };
  proofMarker = cfg: cfg.environment.etc."rocknix-stage10-proof-marker" or { };

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "enabled module renders the guest-profile activation script" (
      enabled.system.activationScripts ? korri-rocknix-guest-profile
      && lib.hasInfix "rocknix-guest-system" ((activationScript enabled).text or "")
      && lib.hasInfix "nix-env" ((activationScript enabled).text or "")
      && lib.hasInfix "$systemConfig" ((activationScript enabled).text or "")
      && builtins.elem "users" ((activationScript enabled).deps or [ ])
    ))
    (check "enabled module renders the stage10 proof marker" (
      enabled.environment.etc ? "rocknix-stage10-proof-marker"
      && lib.hasPrefix "korri-test-system" ((proofMarker enabled).text or "")
      && lib.hasInfix "target=korri-test" ((proofMarker enabled).text or "")
    ))
    (check "disabled module renders no guest-profile activation script" (
      !(disabled.system.activationScripts ? korri-rocknix-guest-profile)
    ))
    (check "disabled module renders no stage10 proof marker" (
      !(disabled.environment.etc ? "rocknix-stage10-proof-marker")
    ))
    (check "enabled module requires a proof marker label" (!missingLabelTryEval.success))
    (check "enabled module rejects an empty proof marker label" (failedAssertions emptyLabel != [ ]))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri ROCKNIX guest-profile module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-guest-profile-module-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'SUMMARY'
    Korri ROCKNIX guest-profile module invariants passed.
    SUMMARY
  ''
