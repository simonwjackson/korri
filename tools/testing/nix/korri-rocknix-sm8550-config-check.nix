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
      hardwareButtonEnv = ((cfg.systemd.services.main-space-hardware-button-handler or { }).environment or { });
      removableMountUnit = cfg.systemd.services."korri-removable-card-mount@" or { };
      removableUnmountUnit = cfg.systemd.services."korri-removable-card-unmount@" or { };
      korriRuntimeDir = "/run/user/${toString (korriUser.uid or 2000)}";
      pipewireEnv = (userServices.pipewire or { }).environment or { };
      pipewirePulseEnv = (userServices.pipewire-pulse or { }).environment or { };
      wireplumberEnv = (userServices.wireplumber or { }).environment or { };
      audioBootstrapUnit = userServices.korri-sm8550-audio-bootstrap or { };
      mainSpaceAudioDisabled = serviceName:
        let service = cfg.systemd.services.${serviceName} or { enable = false; };
        in (service.enable or true) == false;
      seatDeviceTrigger = cfg.systemd.services.korri-rocknix-seat-device-trigger or { };
      compositorUnit = userServices.korri-compositor or { };
      kioskEnvUnit = userServices."korri-kiosk-session-environment" or { };
      compositor = cfg.services.korri.compositor;
    in [
      (check "${name}: eval has no assertion failures" (builtins.filter (a: !a.assertion) cfg.assertions == [ ]))
      (check "${name}: runtime user is korri and non-root" (runtime.user == "korri" && (korriUser.uid or 0) != 0 && (korriUser.isNormalUser or false)))
      (check "${name}: korri has appliance device groups" (builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [ "audio" "input" "render" "seat" "video" ]))
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
        && lib.hasInfix ''setfacl -m u:korri:rw /dev/input/%k'' cfg.services.udev.extraRules
      ))
      (check "${name}: SM8550 DRM seat metadata is triggered before greetd" (
        cfg.systemd.services ? korri-rocknix-seat-device-trigger
        && builtins.elem "greetd.service" (seatDeviceTrigger.before or [ ])
        && lib.hasInfix "udevadm trigger --subsystem-match=drm --action=change" (seatDeviceTrigger.serviceConfig.ExecStart or "")
      ))
      (check "${name}: compositor uses the greetd/logind user session bus" (
        compositor.sessionBus.mode == "existing"
        && compositor.sessionBus.address == "unix:path=%t/bus"
        && ((cfg.systemd.user.services."korri-compositor" or { }).requires or [ ]) == [ ]
        && (sessiondEnv.DBUS_SESSION_BUS_ADDRESS or null) == "unix:path=%t/bus"
      ))
      (check "${name}: compositor does not inherit child display env" (
        builtins.all (name: builtins.elem name (compositorUnit.serviceConfig.UnsetEnvironment or [ ])) [ "DISPLAY" "WAYLAND_DISPLAY" ]
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
      (check "${name}: root main-space audio graph is disabled for Korri rootless kiosk" (
        builtins.all mainSpaceAudioDisabled [
          "main-space-pipewire"
          "main-space-pipewire-pulse"
          "main-space-wireplumber"
          "main-space-audio-sink-bootstrap"
        ]
      ))
      (check "${name}: user audio graph receives substrate UCM and Pulse env" (
        pipewireEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
        && pipewirePulseEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
        && wireplumberEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
        && lib.hasSuffix "/share/alsa/ucm2" (pipewireEnv.ALSA_CONFIG_UCM2 or "")
        && pipewireEnv.ALSA_CONFIG_UCM2 == pipewirePulseEnv.ALSA_CONFIG_UCM2
        && pipewireEnv.ALSA_CONFIG_UCM2 == wireplumberEnv.ALSA_CONFIG_UCM2
      ))
      (check "${name}: user audio bootstrap orders before Korri runtime services" (
        userServices ? korri-sm8550-audio-bootstrap
        && builtins.elem "korri-session.target" (audioBootstrapUnit.wantedBy or [ ])
        && builtins.elem "pipewire-pulse.service" (audioBootstrapUnit.after or [ ])
        && builtins.elem "wireplumber.service" (audioBootstrapUnit.after or [ ])
        && builtins.elem "korri-sessiond.service" (audioBootstrapUnit.before or [ ])
        && builtins.elem "korri-inputd.service" (audioBootstrapUnit.before or [ ])
        && (audioBootstrapUnit.environment.PULSE_SERVER or null) == "unix:%t/pulse/native"
        && (audioBootstrapUnit.environment.ALSA_CONFIG_UCM2 or null) == pipewireEnv.ALSA_CONFIG_UCM2
      ))
      (check "${name}: sessiond launches inherit Korri user Pulse socket" (
        sessiondEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
      ))
      (check "${name}: hardware buttons own volume against Korri user Pulse socket" (
        hardwareButtonEnv.XDG_RUNTIME_DIR or null == korriRuntimeDir
        && hardwareButtonEnv.PULSE_SERVER or null == "unix:${korriRuntimeDir}/pulse/native"
        && hardwareButtonEnv.DBUS_SESSION_BUS_ADDRESS or null == "unix:path=${korriRuntimeDir}/bus"
        && inputdEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
        && inputdEnv.KORRI_INPUTD_VOLUME_UP or null == "true"
        && inputdEnv.KORRI_INPUTD_VOLUME_DOWN or null == "true"
      ))
      (check "${name}: inputd terminates foreground games through sessiond" (
        inputdEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"
        && !(inputdEnv ? KORRI_INPUTD_KILL_CURRENT_GAME)
      ))
      (check "${name}: inputd PATH includes swaymsg for foreground shortcuts" (
        builtins.elem compositor.sway.package inputdPath
      ))
      (check "${name}: inputd PATH includes pactl for volume shortcuts" (
        builtins.any (pkg: (pkg.pname or "") == "pulseaudio") inputdPath
      ))
      (check "${name}: removable SD cards mount under runtime media and Korri content" (
        cfg.systemd.services ? "korri-removable-card-mount@"
        && cfg.systemd.services ? "korri-removable-card-unmount@"
        && lib.hasInfix ''KERNEL=="mmcblk*p*"'' cfg.services.udev.extraRules
        && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-card-mount@%k.service"'' cfg.services.udev.extraRules
        && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-card-unmount@%k.service"'' cfg.services.udev.extraRules
        && (removableMountUnit.environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri/cards"
        && (removableMountUnit.environment.KORRI_REMOVABLE_CONTENT_ROOT or null) == "/var/lib/korri/content/removable/cards"
        && (removableUnmountUnit.environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri/cards"
        && builtins.elem "d /run/media/korri/cards 0755 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "L+ /var/lib/korri/content/removable/cards - - - - /run/media/korri/cards" cfg.systemd.tmpfiles.rules
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
