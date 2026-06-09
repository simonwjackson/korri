# Image-eval check for the rootless source-machine composition.
{ pkgs, sourceMachineSystem }:

let
  lib = pkgs.lib;
  cfg = sourceMachineSystem.config;
  imagePkgs = sourceMachineSystem.pkgs;
  failedAssertions = builtins.filter (a: !a.assertion) cfg.assertions;
  sessiondUnit = cfg.systemd.user.services.korri-sessiond or { };
  sessiondEnv = sessiondUnit.environment or { };
  sessiondPath = sessiondUnit.path or [ ];
  daemonUnit = cfg.systemd.user.services.korrid or { };
  daemonEnv = daemonUnit.environment or { };
  compositorUnit = cfg.systemd.user.services."korri-compositor" or { };
  inputdUnit = cfg.systemd.user.services.korri-inputd or { };
  sunshineUnit = cfg.systemd.services."korri-sunshine" or { };
  sunshineEnv = sunshineUnit.environment or { };
  korriUser = cfg.users.users.korri or { };
  firstAppCmd = let apps = cfg.services.sunshine.applications.apps or [ ]; in if apps == [ ] then null else (builtins.elemAt apps 0).cmd;
  firstAppWrapper = if firstAppCmd == null then "" else builtins.readFile firstAppCmd;

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "image evaluates without assertion failures" (failedAssertions == [ ]))
    (check "runtime user is korri" (cfg.services.korri.runtime.user == "korri" && cfg.users.users ? korri))
    (check "korri is a normal stable runtime user" ((korriUser.isNormalUser or false) == true && (korriUser.uid or 0) != 0))
    (check "korri user has appliance runtime groups" (builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [ "input" "render" "seat" "video" ]))
    (check "compositor, sessiond and daemon are user services" (
      cfg.systemd.user.services ? "korri-compositor" && cfg.systemd.user.services ? korri-sessiond && cfg.systemd.user.services ? korrid
    ))
    (check "root setup service is required by greetd" (
      builtins.elem "korri-setup.service" (cfg.systemd.services.greetd.requires or [ ])
    ))
    (check "sessiond role is source-machine" (cfg.services.korri.sessiond.role == "source-machine" && sessiondEnv.KORRI_SESSIOND_ROLE == "source-machine"))
    (check "sessiond socket path is exported" (sessiondEnv.KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"))
    (check "daemon uses sessiond socket" (daemonEnv.KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"))
    (check "gameStream uses sessiond socket" (cfg.services.korri.gameStream.sessiond.socketPath == "%t/korri/sessiond.sock"))
    (check "Sunshine wrapper exports KORRI_SESSIOND_SOCKET" (lib.hasInfix "KORRI_SESSIOND_SOCKET" firstAppWrapper))
    (check "Sunshine uses Korri downstream runtime-settings package" (cfg.services.sunshine.package.pname == "sunshine-korri"))
    (check "Sunshine live-settings gate is persistent Nix config" (sunshineEnv.SUNSHINE_LIVE_SETTINGS_MVP == "1"))
    (check "legacy sessiond URL/token env absent" (
      !(daemonEnv ? KORRI_SESSIOND_URL) && !(daemonEnv ? KORRI_SESSIOND_TOKEN_FILE) && !lib.hasInfix "KORRI_SESSIOND_URL" firstAppWrapper && !lib.hasInfix "KORRI_SESSIOND_TOKEN_FILE" firstAppWrapper
    ))
    (check "sessiond PATH includes util-linux" (builtins.elem imagePkgs.util-linux sessiondPath))
    (check "compositor participates in korri-session.target" ((compositorUnit.wantedBy or [ ]) == [ "korri-session.target" ]))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-source-machine image check failed:\n${lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures}"
else
  pkgs.runCommand "korri-source-machine-image-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-source-machine image checks passed."
    touch $out
  ''
