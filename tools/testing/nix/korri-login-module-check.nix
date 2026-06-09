# Pure-Nix module-evaluation check for `services.korri.login`.
{ pkgs, korriLoginModule }:

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
      networking.hostName = "login-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriLoginModule
        baseModule
        overrides
      ];
    }).config;

  loginEnabled = evaluateWith {
    services.korri.login.enable = true;
  };

  existingRuntimeUser = evaluateWith {
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
    services.korri.login.enable = true;
  };

  autologinDisabled = evaluateWith {
    services.korri.login = {
      enable = true;
      autologin = false;
    };
  };

  greetdSettings = cfg: cfg.services.greetd.settings or { };
  loginCommand = cfg: builtins.readFile cfg.services.korri.login.command;

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "login option is available" (loginEnabled.services.korri ? login))
    (check "login enables greetd autologin for runtime user" (
      loginEnabled.services.greetd.enable
      && (greetdSettings loginEnabled).initial_session.user == "korri"
      && (greetdSettings loginEnabled).default_session.user == "korri"
    ))
    (check "login command starts Korri user target inside greetd PAM session" (
      lib.hasInfix "systemctl --user start korri-session.target" (loginCommand loginEnabled)
      && !lib.hasInfix "--machine=" (loginCommand loginEnabled)
      && lib.hasInfix "sleep infinity" (loginCommand loginEnabled)
    ))
    (check "Korri session target is not started by generic user default.target" (
      (loginEnabled.systemd.user.targets.korri-session.wantedBy or [ ]) == [ ]
    ))
    (check "greetd is ordered after Korri setup and user sessions" (
      builtins.elem "korri-setup.service" (loginEnabled.systemd.services.greetd.requires or [ ])
      && builtins.elem "korri-setup.service" (loginEnabled.systemd.services.greetd.after or [ ])
      && builtins.elem "systemd-user-sessions.service" (loginEnabled.systemd.services.greetd.after or [ ])
    ))
    (check "greetd has enough locked-memory budget for PAM session modules" (
      (loginEnabled.systemd.services.greetd.serviceConfig.LimitMEMLOCK or null) == "64M"
    ))
    (check "login follows existing runtime user identity" (
      (greetdSettings existingRuntimeUser).initial_session.user == "simonwjackson"
      && (greetdSettings existingRuntimeUser).default_session.user == "simonwjackson"
      && lib.hasInfix "systemctl --user start korri-session.target" (loginCommand existingRuntimeUser)
      && !lib.hasInfix "--machine=" (loginCommand existingRuntimeUser)
    ))
    (check "autologin can be disabled without enabling greetd" (
      !autologinDisabled.services.greetd.enable
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-login module check failed:\n${
    lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures
  }"
else
  pkgs.writeText "korri-login-module-check" "ok\n"
