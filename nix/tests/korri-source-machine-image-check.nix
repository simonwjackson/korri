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
  # Use the image-evaluated pkgs for package-identity comparisons against
  # the sessiond unit's PATH (same instance the module saw at eval time).
  imagePkgs = sourceMachineSystem.pkgs;
  failedAssertions = builtins.filter (a: !a.assertion) cfg.assertions;
  unit = cfg.systemd.services.korri-sessiond or { };
  unitEnv = unit.environment or { };
  unitPath = unit.path or [ ];
  sourceUser = cfg.users.users.korri-source or { };
  serverUser = cfg.users.users.korri-server or { };
  serverUnit = cfg.systemd.services.korri-server or { };
  serverEnv = serverUnit.environment or { };

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
    (check "sessiond sharedGroup is set to korri-sessiond-clients" (
      cfg.services.korri.sessiond.sharedGroup or null == "korri-sessiond-clients"
    ))
    # Runtime-dir mode must permit korri-sessiond-clients members to
    # TRAVERSE the directory and reach the 0640 token file. 0700
    # root:root would silently break every cross-user managed launch.
    (check "sessiond runtime dir at 0710 root:korri-sessiond-clients (group-traversable)" (
      builtins.any (rule:
        lib.hasInfix "korri-sessiond" rule
        && lib.hasInfix "0710 root korri-sessiond-clients" rule
      ) (cfg.systemd.tmpfiles.rules or [ ])
    ))
    (check "sessiond RuntimeDirectoryMode is 0710 (matches sharedGroup)" (
      (unit.serviceConfig or { }).RuntimeDirectoryMode or null == "0710"
    ))
    (check "korri-sessiond-clients group is declared" (
      cfg.users.groups ? korri-sessiond-clients
    ))
    (check "korri-source user is in korri-sessiond-clients group" (
      builtins.elem "korri-sessiond-clients" (sourceUser.extraGroups or [ ])
    ))
    (check "korri-server user is in korri-sessiond-clients group" (
      builtins.elem "korri-sessiond-clients" (serverUser.extraGroups or [ ])
    ))
    # The token-file chown/chmod shape (root:<sharedGroup> 0640) is proven
    # by korri-sessiond-module-check.nix's `withSharedGroup` fixture for
    # arbitrary group values; this image only needs to assert its
    # sharedGroup choice, which the previous check already does.

    # Server-side sessiond delegation: source-machine wires both
    # gameStream.sessiond AND server.sessiond so the kiosk/source-machine
    # asymmetry is closed. Without server.sessiond, korri-server's
    # Launcher falls back to a bare-PATH shell launcher and dies on
    # gamescope ENOENT.
    (check "server.sessiond.url is configured to the in-image sessiond" (
      cfg.services.korri.server.sessiond.url or null
      == "http://127.0.0.1:${toString cfg.services.korri.sessiond.port}"
    ))
    (check "server.sessiond.tokenFile matches sessiond.tokenFile" (
      cfg.services.korri.server.sessiond.tokenFile or null
      == cfg.services.korri.sessiond.tokenFile
    ))
    (check "server unit env exports KORRI_SESSIOND_URL" (
      lib.hasPrefix "http://127.0.0.1:" (serverEnv.KORRI_SESSIOND_URL or "")
    ))
    (check "server unit env exports KORRI_SESSIOND_TOKEN_FILE" (
      lib.hasPrefix "/" (serverEnv.KORRI_SESSIOND_TOKEN_FILE or "")
    ))
    # PATH/env contract on sessiond's unit. Source-machine sessiond does
    # not spawn Electrobun, but its in-process shell launcher still uses
    # setsid to detach children into their own session/process group.
    # util-linux is baked in by the module so this is a regression guard
    # rather than an image-level addition.
    (check "sessiond unit PATH includes util-linux (for setsid)" (
      builtins.elem imagePkgs.util-linux unitPath
    ))
    (check "sessiond unit env carries KORRI_GAME_STREAM_STATUS_PATH for sidecar emission" (
      lib.hasPrefix "/" (unitEnv.KORRI_GAME_STREAM_STATUS_PATH or "")
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
