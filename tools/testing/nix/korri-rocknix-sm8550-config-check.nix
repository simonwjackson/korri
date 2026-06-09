{
  pkgs,
  products,
  byCompatibleProduct,
  thorSystem,
  soboSystem,
  byCompatibleSystem,
  targetPackages,
  hostPackages,
  configurations,
  hardwareFactSourceFiles,
  sm8550PlatformAdapterSourceFile,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  sourceContainsHardwareFact =
    file: builtins.match ".*(SM8550|RockNix|Odin|Thor|DSI-1|DSI-2).*" (builtins.readFile file) != null;

  stripComment = line: let i = builtins.match "([^#]*)#.*" line; in if i == null then line else builtins.head i;
  lineSetsLiteral = value: line: builtins.match ".*[^!=][[:space:]]*=[[:space:]]*\"${value}\".*" (stripComment line) != null;
  containsQuotedAssignment = value: file: builtins.any (line: lineSetsLiteral value line) (lib.splitString "\n" (builtins.readFile file));
  sm8550PlatformAdapterFreeOfHardwareLiterals =
    !(containsQuotedAssignment "v4l2m2m" sm8550PlatformAdapterSourceFile)
    && !(containsQuotedAssignment "pulseaudio" sm8550PlatformAdapterSourceFile);

  checkSystem = name: system:
    let
      cfg = system.config;
      runtime = cfg.services.korri.runtime;
      korriUser = cfg.users.users.${runtime.user} or { };
      userServices = cfg.systemd.user.services or { };
      sessiondEnv = (userServices.korri-sessiond or { }).environment or { };
      daemonEnv = (userServices.korrid or { }).environment or { };
      inputdEnv = (userServices.korri-inputd or { }).environment or { };
      compositor = cfg.services.korri.compositor;
    in [
      (check "${name}: eval has no assertion failures" (builtins.filter (a: !a.assertion) cfg.assertions == [ ]))
      (check "${name}: runtime user is korri and non-root" (runtime.user == "korri" && (korriUser.uid or 0) != 0 && (korriUser.isNormalUser or false)))
      (check "${name}: korri has appliance device groups" (builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [ "input" "render" "seat" "video" ]))
      (check "${name}: compositor/sessiond/inputd/korrid are user services" (
        userServices ? "korri-compositor" && userServices ? korri-sessiond && userServices ? korri-inputd && userServices ? korrid
      ))
      (check "${name}: no legacy system Korri daemons" (
        !(cfg.systemd.services ? "korri-compositor") && !(cfg.systemd.services ? korri-sessiond) && !(cfg.systemd.services ? korri-inputd) && !(cfg.systemd.services ? korrid)
      ))
      (check "${name}: greetd requires korri-setup" (builtins.elem "korri-setup.service" (cfg.systemd.services.greetd.requires or [ ])))
      (check "${name}: compositor uses logind runtime" (compositor.runtimeDir == "%t" && compositor.home == "/home/korri"))
      (check "${name}: sessiond socket env is %t path" (sessiondEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"))
      (check "${name}: daemon socket env is %t path" (daemonEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"))
      (check "${name}: inputd websocket is loopback" (inputdEnv.KORRI_INPUT_BRIDGE_HOSTNAME or null == "127.0.0.1"))
      (check "${name}: launcher artifacts use root setup path" (runtime.launchArtifactsDir == "/run/korri/launch-artifacts"))
    ];

  checks = [
    (check "SM8550 adapter does not hard-code substrate literals" sm8550PlatformAdapterFreeOfHardwareLiterals)
  ] ++ (checkSystem "Odin 2 Portal" thorSystem) ++ (checkSystem "Sobo" soboSystem);

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri SM8550 kiosk config check failed:\n${lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures}"
else
  pkgs.runCommand "korri-rocknix-sm8550-config-check" { } ''
    echo "All ${toString (builtins.length checks)} SM8550 config checks passed."
    touch $out
  ''
