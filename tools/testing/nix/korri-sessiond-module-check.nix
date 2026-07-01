# Pure-Nix module-evaluation check for `services.korri.sessiond`.
{ pkgs, korriSessiondModule }:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");
  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule = { ... }: {
    nixpkgs.hostPlatform = hostSystem;
    boot.loader.systemd-boot.enable = false;
    boot.loader.grub.devices = [ "nodev" ];
    fileSystems."/" = { device = "/dev/null"; fsType = "ext4"; };
    system.stateVersion = "24.11";
  };

  shimOptionsModule = { lib, ... }: {
    options.services.korri = {
      runtime.launchArtifactsDir = lib.mkOption { type = lib.types.str; default = "/run/korri/launch-artifacts"; };
      compositor.kiosk.enable = lib.mkOption { type = lib.types.bool; default = false; };
      daemon.streaming.enable = lib.mkOption { type = lib.types.bool; default = false; };
      daemon.library.root = lib.mkOption { type = lib.types.str; default = "/var/lib/korri/library"; };
      daemon.library.source = lib.mkOption { type = lib.types.str; default = "proseql"; };
    };
  };

  evaluateWith = overrides: (evalConfig {
    system = hostSystem;
    modules = [ korriSessiondModule shimOptionsModule baseModule overrides ];
  }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  failedAssertionMessages = cfg: map (a: a.message) (failedAssertions cfg);
  hasFailure = cfg: expected: builtins.any (m: lib.hasInfix expected m) (failedAssertionMessages cfg);
  unit = cfg: cfg.systemd.user.services.korri-sessiond or { };
  unitEnv = cfg: (unit cfg).environment or { };
  unitPath = cfg: (unit cfg).path or [ ];
  serviceConfig = cfg: (unit cfg).serviceConfig or { };
  execStartPost = cfg: builtins.readFile (serviceConfig cfg).ExecStartPost;

  baselineKiosk = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
  };
  sourceMachine = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.daemon.streaming.enable = true;
  };
  relativeSocket = evaluateWith {
    services.korri.sessiond = { enable = true; socketPath = "relative.sock"; };
  };
  bothKioskAndStreaming = evaluateWith {
    services.korri.sessiond.enable = true;
    services.korri.compositor.kiosk.enable = true;
    services.korri.daemon.streaming.enable = true;
  };
  withPath = evaluateWith {
    services.korri.sessiond = { enable = true; path = [ pkgs.gamescope ]; };
  };
  lanePolicy = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      kioskPolicy = "lanes";
    };
  };
  esswayControlEnabled = evaluateWith {
    services.korri.sessiond = {
      enable = true;
      esswayControl.enable = true;
    };
  };

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "kiosk assertions pass" (failedAssertions baselineKiosk == [ ]))
    (check "kiosk role exported" ((unitEnv baselineKiosk).KORRI_SESSIOND_ROLE == "kiosk"))
    (check "legacy kiosk policy exported by default" ((unitEnv baselineKiosk).KORRI_SESSIOND_KIOSK_POLICY == "legacy"))
    (check "lane kiosk policy exported when selected" ((unitEnv lanePolicy).KORRI_SESSIOND_KIOSK_POLICY == "lanes"))
    (check "essway control defaults off for non-root sessiond" ((unitEnv baselineKiosk).KORRI_SESSIOND_ESSWAY_CONTROL == "0"))
    (check "essway control can be explicitly enabled" ((unitEnv esswayControlEnabled).KORRI_SESSIOND_ESSWAY_CONTROL == "1"))
    (check "sessiond is a user service" (baselineKiosk.systemd.user.services ? korri-sessiond))
    (check "sessiond wanted by korri-session.target" ((unit baselineKiosk).wantedBy == [ "korri-session.target" ]))
    (check "socket path exported" ((unitEnv baselineKiosk).KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"))
    (check "socket start post uses curl unix socket" (lib.hasInfix "--unix-socket" (execStartPost baselineKiosk)))
    (check "source-machine role inferred" ((unitEnv sourceMachine).KORRI_SESSIOND_ROLE == "source-machine"))
    (check "daemon library root is inherited by sessiond" (
      (unitEnv baselineKiosk).KORRI_LIBRARY_ROOT == "/var/lib/korri/library"
      && (unitEnv baselineKiosk).KORRI_LIBRARY_SOURCE == "proseql"
    ))
    (check "relative socket rejected" (hasFailure relativeSocket "socketPath must be an absolute path or %t path"))
    (check "kiosk and streaming conflict rejected" (hasFailure bothKioskAndStreaming "must not be enabled together"))
    (check "path option flows through" (builtins.elem pkgs.gamescope (unitPath withPath)))
    (check "util-linux is on PATH for setsid" (builtins.elem pkgs.util-linux (unitPath baselineKiosk)))
    (check "token env not exported" (!((unitEnv baselineKiosk) ? KORRI_SESSIOND_TOKEN) && !((unitEnv baselineKiosk) ? KORRI_SESSIOND_TOKEN_FILE)))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-sessiond module check failed:\n${lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures}"
else
  pkgs.writeText "korri-sessiond-module-check" "ok\n"
