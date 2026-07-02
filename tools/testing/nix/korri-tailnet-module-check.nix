# Pure-Nix module-evaluation check for Korri-owned tailnet posture.
{
  pkgs,
  korriTailnetModule,
  korriAggregateModule,
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
      networking.hostName = lib.mkDefault "tailnet-test";
    };

  evaluate =
    modules:
    (evalConfig {
      system = hostSystem;
      inherit modules;
    }).config;

  standaloneDefault = evaluate [
    korriTailnetModule
    baseModule
  ];

  standaloneEnabled = evaluate [
    korriTailnetModule
    baseModule
    { services.korri.tailnet.enable = true; }
  ];

  standaloneCustom = evaluate [
    korriTailnetModule
    baseModule
    {
      networking.hostName = "custom-host";
      services.korri.tailnet = {
        enable = true;
        acceptDns = false;
        hostname = null;
        useRoutingFeatures = null;
        installCli = false;
      };
    }
  ];

  aggregateOnly = evaluate [
    korriAggregateModule
    baseModule
  ];

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  flags = cfg: cfg.services.tailscale.extraUpFlags or [ ];
  trustedInterfaces = cfg: cfg.networking.firewall.trustedInterfaces or [ ];
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "standalone tailnet module defaults to inert option surface" (
      failedAssertions standaloneDefault == [ ]
      && standaloneDefault.services.korri.tailnet.enable == false
      && (standaloneDefault.services.tailscale.enable or false) == false
    ))
    (check "explicit tailnet enablement owns Tailscale service" (
      failedAssertions standaloneEnabled == [ ]
      && standaloneEnabled.services.tailscale.enable
      && standaloneEnabled.services.tailscale.useRoutingFeatures == "client"
    ))
    (check "explicit tailnet enablement accepts MagicDNS and derives hostname" (
      builtins.elem "--accept-dns=true" (flags standaloneEnabled)
      && builtins.elem "--hostname=tailnet-test" (flags standaloneEnabled)
    ))
    (check "tailnet module does not globally trust the tailnet interface" (
      !(builtins.elem "tailscale0" (trustedInterfaces standaloneEnabled))
    ))
    (check "custom tailnet settings suppress optional flags" (
      !(builtins.elem "--accept-dns=true" (flags standaloneCustom))
      && !(builtins.any (flag: lib.hasPrefix "--hostname=" flag) (flags standaloneCustom))
    ))
    (check "aggregate import exposes tailnet options without enabling behavior" (
      failedAssertions aggregateOnly == [ ]
      && aggregateOnly.services.korri.tailnet.enable == false
      && (aggregateOnly.services.tailscale.enable or false) == false
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-tailnet module check failed:\n${
    lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures
  }"
else
  pkgs.runCommand "korri-tailnet-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-tailnet module checks passed."
    touch $out
  ''
