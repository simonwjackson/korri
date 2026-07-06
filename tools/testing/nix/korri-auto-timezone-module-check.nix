# Pure-Nix module-evaluation check for the Korri auto-timezone policy module.
#
# Device-neutral: evaluates the shared auto-timezone module against a minimal
# fixture host and asserts the product contract — timezone stays imperative
# (`time.timeZone = null`) and the upstream tzupdate oneshot + re-check timer
# are wired — independently from any platform adapter.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-auto-timezone-module --no-link
{
  pkgs,
  korriAutoTimezoneModule,
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

  evaluated =
    (evalConfig {
      system = hostSystem;
      modules = [
        korriAutoTimezoneModule
        baseModule
      ];
    }).config;

  tzupdateService = evaluated.systemd.services.tzupdate or null;
  tzupdateTimer = evaluated.systemd.timers.tzupdate or null;

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "timezone stays imperative so tzupdate/timedatectl may set it" (
      evaluated.time.timeZone == null
    ))
    (check "tzupdate oneshot runs at boot after network-online" (
      tzupdateService != null
      && builtins.elem "multi-user.target" (tzupdateService.wantedBy or [ ])
      && builtins.elem "network-online.target" (tzupdateService.after or [ ])
    ))
    (check "tzupdate re-check timer is enabled for border-crossing devices" (
      tzupdateTimer != null && (tzupdateTimer.enable or false)
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri auto-timezone module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-auto-timezone-module-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'SUMMARY'
    Korri auto-timezone module invariants passed.
    SUMMARY
  ''
