# Pure-Nix module-evaluation check for `services.korri.daemon` / `korrid`.
{ pkgs, korriDaemonModule }:

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
    networking.hostName = "daemon-test";
  };

  evaluateWith = overrides: (evalConfig {
    system = hostSystem;
    modules = [ korriDaemonModule baseModule overrides ];
  }).config;

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  userUnit = cfg: cfg.systemd.user.services.korrid or { };
  env = cfg: (userUnit cfg).environment or { };

  defaultUserMode = evaluateWith { services.korri.daemon.enable = true; };
  socketPaired = evaluateWith {
    services.korri.daemon = {
      enable = true;
      sessiond.socketPath = "%t/korri/sessiond.sock";
    };
  };
  streamControl = evaluateWith {
    services.korri.daemon = { enable = true; streamControl.enable = true; };
  };

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "daemon assertions pass" (failedAssertions defaultUserMode == [ ]))
    (check "option namespace is services.korri.daemon" (defaultUserMode.services.korri ? daemon))
    (check "korrid user service emitted" (defaultUserMode.systemd.user.services ? korrid))
    (check "korrid wanted by korri-session.target" ((userUnit defaultUserMode).wantedBy == [ "korri-session.target" ]))
    (check "ExecStart points at korrid binary" (lib.hasInfix "/bin/korrid" ((userUnit defaultUserMode).serviceConfig.ExecStart or "")))
    (check "daemon identity env uses KORRI_DAEMON_*" ((env defaultUserMode).KORRI_DAEMON_ID == "daemon-test" && (env defaultUserMode).KORRI_DAEMON_NAME == "Korri Stream on daemon-test"))
    (check "legacy KORRI_SERVER_* env absent" (!((env defaultUserMode) ? KORRI_SERVER_ID) && !((env defaultUserMode) ? KORRI_SERVER_NAME)))
    (check "sessiond socket env exported" ((env socketPaired).KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"))
    (check "legacy sessiond URL/token env absent" (!((env socketPaired) ? KORRI_SESSIOND_URL) && !((env socketPaired) ? KORRI_SESSIOND_TOKEN_FILE)))
    (check "stream control env still exported" ((env streamControl).KORRI_STREAM_CONTROL_ENABLED == "1"))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korrid module check failed:\n${lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures}"
else
  pkgs.writeText "korri-daemon-module-check" "ok\n"
