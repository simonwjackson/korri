# Image-eval check for the source-machine NixOS composition. Verifies
# the boolean-toggle composition produces a configured-correct image:
# compositor up (no kiosk), streaming on, sessiond on with role
# source-machine, game-stream wired to sessiond.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-source-machine-image --no-link
{
  pkgs,
  sourceMachineSystem,
}:

let
  lib = pkgs.lib;
  cfg = sourceMachineSystem.config;
  failedAssertions = builtins.filter (a: !a.assertion) cfg.assertions;
  unit = cfg.systemd.services.korri-sessiond or { };
  unitEnv = unit.environment or { };

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "image evaluates without assertion failures" (failedAssertions == [ ]))
    (check "compositor is enabled" (cfg.services.korri.compositor.enable == true))
    (check "kiosk client is disabled" (cfg.services.korri.compositor.kiosk.enable == false))
    (check "server.streaming is enabled" (
      cfg.services.korri.server.streaming.enable == true
    ))
    (check "sessiond is enabled" (cfg.services.korri.sessiond.enable == true))
    (check "sessiond role is source-machine" (
      cfg.services.korri.sessiond.role == "source-machine"
    ))
    (check "sessiond KORRI_SESSIOND_ROLE=source-machine" (
      unitEnv.KORRI_SESSIOND_ROLE or null == "source-machine"
    ))
    (check "sessiond exports status sidecar path for source-machine role" (
      unitEnv.KORRI_GAME_STREAM_STATUS_PATH or null != null
    ))
    (check "gameStream is enabled" (cfg.services.korri.gameStream.enable == true))
    (check "gameStream sessiond.url is configured" (
      cfg.services.korri.gameStream.sessiond.url or null != null
      && lib.hasPrefix "http://127.0.0.1:" cfg.services.korri.gameStream.sessiond.url
    ))
    (check "gameStream sessiond.tokenFile is absolute" (
      let
        tokenFile = cfg.services.korri.gameStream.sessiond.tokenFile or null;
      in
      tokenFile != null && lib.hasPrefix "/" tokenFile
    ))
    (check "Sunshine app is wired and references the game-stream runner" (
      let
        apps = cfg.services.sunshine.applications.apps or [ ];
        firstAppCmd = if apps == [ ] then null else (builtins.elemAt apps 0).cmd;
      in
      firstAppCmd != null
      && lib.hasInfix "korri-game-stream-runner" (builtins.readFile firstAppCmd)
    ))
    (check "Sunshine app wrapper exports KORRI_SESSIOND_URL" (
      let
        apps = cfg.services.sunshine.applications.apps or [ ];
        firstAppCmd = if apps == [ ] then null else (builtins.elemAt apps 0).cmd;
      in
      firstAppCmd != null
      && lib.hasInfix "KORRI_SESSIOND_URL" (builtins.readFile firstAppCmd)
    ))
  ];

  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-source-machine image check failed:\n${
    lib.concatMapStringsSep "\n" (f: "- ${f.message}") failures
  }"
else
  pkgs.runCommand "korri-source-machine-image-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-source-machine image checks passed."
    touch $out
  ''
