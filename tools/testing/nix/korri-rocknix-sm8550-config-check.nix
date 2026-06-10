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
      inputdUnit = userServices.korri-inputd or { };
      inputdEnv = inputdUnit.environment or { };
      inputdPath = inputdUnit.path or [ ];
      kioskEnvUnit = userServices."korri-kiosk-session-environment" or { };
      compositor = cfg.services.korri.compositor;
    in [
      (check "${name}: eval has no assertion failures" (builtins.filter (a: !a.assertion) cfg.assertions == [ ]))
      (check "${name}: runtime user is korri and non-root" (runtime.user == "korri" && (korriUser.uid or 0) != 0 && (korriUser.isNormalUser or false)))
      (check "${name}: korri has appliance device groups" (builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [ "input" "render" "seat" "video" ]))
      (check "${name}: no lingering before login-created Korri sessions" (
        (cfg.users.users.root.linger or false) != true
        && ((korriUser.linger or false) != true)
        && ((cfg.systemd.user.targets.korri-session.wantedBy or [ ]) == [ ])
        && !(builtins.elem "korri-session.target" (cfg.systemd.user.targets.default.wants or [ ]))
        && builtins.elem "L+ /home/korri/.config/systemd/user/default.target.wants/korri-session.target - - - - /etc/systemd/user/korri-session.target" cfg.systemd.tmpfiles.rules
      ))
      (check "${name}: setup owns product state subdirectories" (
        builtins.elem "d /var/lib/korri/content 0750 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "d /var/lib/korri/library 0750 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "d /home/korri/.local/state/korri 0700 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "Z /home/korri/.local/state/korri 0700 korri korri -" cfg.systemd.tmpfiles.rules
      ))
      (check "${name}: compositor/sessiond/inputd/korrid are user services" (
        userServices ? "korri-compositor" && userServices ? korri-sessiond && userServices ? korri-inputd && userServices ? korrid
      ))
      (check "${name}: no legacy system Korri daemons" (
        !(cfg.systemd.services ? "korri-compositor") && !(cfg.systemd.services ? korri-sessiond) && !(cfg.systemd.services ? korri-inputd) && !(cfg.systemd.services ? korrid)
      ))
      (check "${name}: greetd requires korri-setup" (builtins.elem "korri-setup.service" (cfg.systemd.services.greetd.requires or [ ])))
      (check "${name}: compositor identity follows Korri runtime" (
        compositor.user == runtime.user
        && compositor.group == runtime.group
        && compositor.createUser == false
      ))
      (check "${name}: compositor uses logind runtime" (compositor.runtimeDir == "%t" && compositor.home == "/home/korri"))
      (check "${name}: SM8550 DRM is tagged for logind seats" (
        lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"'' cfg.services.udev.extraRules
      ))
      (check "${name}: SM8550 evdev input is readable by Korri inputd" (
        lib.hasInfix ''SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess"'' cfg.services.udev.extraRules
      ))
      (check "${name}: compositor uses the greetd/logind user session bus" (
        compositor.sessionBus.mode == "existing"
        && compositor.sessionBus.address == "unix:path=%t/bus"
        && ((cfg.systemd.user.services."korri-compositor" or { }).requires or [ ]) == [ ]
        && (sessiondEnv.DBUS_SESSION_BUS_ADDRESS or null) == "unix:path=%t/bus"
      ))
      (check "${name}: kiosk seeds user-manager display environment" (
        builtins.hasAttr "korri-kiosk-session-environment" userServices
        && builtins.elem "korri-compositor.service" (kioskEnvUnit.before or [ ])
        && builtins.elem "korri-sessiond.service" (kioskEnvUnit.before or [ ])
      ))
      (check "${name}: sessiond does not control root-owned essway" (
        (sessiondEnv.KORRI_SESSIOND_ESSWAY_CONTROL or null) == "0"
      ))
      (check "${name}: sessiond socket env is %t path" (sessiondEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"))
      (check "${name}: daemon socket env is %t path" (daemonEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"))
      (check "${name}: legacy sessiond URL/token env absent" (
        !(sessiondEnv ? KORRI_SESSIOND_URL) && !(sessiondEnv ? KORRI_SESSIOND_TOKEN_FILE)
        && !(daemonEnv ? KORRI_SESSIOND_URL) && !(daemonEnv ? KORRI_SESSIOND_TOKEN_FILE)
      ))
      (check "${name}: Moonlight product launches require InputPlumber" (
        (sessiondEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null) == "1"
        && (daemonEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null) == "1"
      ))
      (check "${name}: inputd websocket is loopback" (inputdEnv.KORRI_INPUT_BRIDGE_HOSTNAME or null == "127.0.0.1"))
      (check "${name}: inputd PATH includes swaymsg for foreground shortcuts" (
        builtins.elem compositor.sway.package inputdPath
      ))
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
