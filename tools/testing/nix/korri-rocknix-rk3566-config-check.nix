{
  pkgs,
  products,
  rg353mSystem,
  rk3566PlatformAdapterSourceFile,
  targetPackages,
  hostPackages,
  configurations,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  rg353mProduct = products.rg353m;
  cfg = rg353mSystem.config;
  server = cfg.services.korri.daemon;
  runtime = cfg.services.korri.runtime;
  runtimeUser = cfg.users.users.${runtime.user} or { };
  targetSystem = cfg.nixpkgs.hostPlatform.system;
  systemServices = cfg.systemd.services or { };
  rocknixGuestProfile = cfg.services.korri.rocknixGuestProfile or { };
  rocknixGuestDeviceAccess = cfg.services.korri.rocknixGuestDeviceAccess or { };
  rocknixAudioBootstrap = cfg.services.korri.rocknixAudioBootstrap or { };
  userServices = cfg.systemd.user.services or { };
  userSockets = cfg.systemd.user.sockets or { };
  sessiondService = userServices."korri-sessiond" or { };
  sessiondEnv = sessiondService.environment or { };
  userServerService = userServices.korrid or { };
  userServerEnv = userServerService.environment or { };
  configRootsEnv = userServerEnv.KORRI_CONFIG_ROOTS or "";
  greetdService = systemServices.greetd or { };
  inputplumberService = systemServices.inputplumber or { };
  inputplumberEnv = inputplumberService.environment or { };
  inputplumberPackage = cfg.services.inputplumber.package or { };
  inputplumberDataPackage = lib.findFirst (
    package: lib.hasInfix "inputplumber-data-xb360" (package.name or "")
  ) null cfg.environment.systemPackages;
  inputdUnit = userServices.korri-inputd or { };
  inputdEnv = inputdUnit.environment or { };
  inputdWants = inputdUnit.wants or [ ];
  inputdAfter = inputdUnit.after or [ ];
  rawGamepadHideService = systemServices.korri-rk3566-hide-raw-gamepad-devices or { };
  udevRules = cfg.services.udev.extraRules or "";
  udevRuleLines = lib.splitString "\n" udevRules;
  hasUdevRuleWith = needles:
    builtins.any (line: builtins.all (needle: lib.hasInfix needle line) needles) udevRuleLines;
  rkAudioBootstrap = systemServices.korri-rocknix-audio-bootstrap or { };
  userCompositorService = userServices."korri-compositor" or { };
  userCompositorEnv = userCompositorService.environment or { };
  userCompositorServiceConfig = userCompositorService.serviceConfig or { };
  userCompositorUnsetEnvironment = userCompositorServiceConfig.UnsetEnvironment or [ ];
  userCompositorRequires = userCompositorService.requires or [ ];
  platformDefaults = server.library.platformDefaults;
  hostDefaults = platformDefaults.host or { };
  hostAppEnvironment = lib.attrByPath [
    "launch"
    "with"
    "@korri:gamescope"
    "app"
    "environment"
  ] { } hostDefaults;
  retroarchPolicy = (hostDefaults.plugin or { })."@korri:retroarch" or { };
  rkPulseServer = "unix:/run/user/2000/pulse/native";
  rkAudioBootstrapScript = rkAudioBootstrap.serviceConfig.ExecStart or "";
  # The evaluated bootstrap ExecStart points at an aarch64 shell-script
  # derivation. Grepping that artifact from this x86_64 host check would force
  # a target-platform build, so assert shared-module posture through evaluated
  # config and keep only adapter-topology checks as source invariants.
  rk3566PlatformAdapterSource = builtins.readFile rk3566PlatformAdapterSourceFile;
  rk3566PlatformAdapterKeepsMainSpaceAudioTopology =
    lib.hasInfix "rk3566TargetSink = config.rocknix.device.audio.defaultSink.name" rk3566PlatformAdapterSource
    && lib.hasInfix "systemd.user.services.pipewire.enable = lib.mkForce false" rk3566PlatformAdapterSource;
  systemServiceEnabled =
    serviceName:
    let
      service = systemServices.${serviceName} or { enable = false; };
    in
    (service.enable or true) != false;
  renderedPlatformDefaults =
    (pkgs.formats.yaml { }).generate "00-korri-platform-defaults.yaml"
      platformDefaults;

  checks = [
    (check "RG353M kiosk configuration must be exposed" (
      lib.hasAttr rg353mProduct.configName configurations
    ))
    (check "RG353M target system package must be exposed" (
      lib.hasAttr rg353mProduct.kioskSystemPackageName targetPackages
    ))
    (check "RG353M host rootfs package must be exposed" (
      lib.hasAttr rg353mProduct.rootfsPackageName hostPackages
    ))
    (check "RG353M target system package must be a derivation" (
      (targetPackages.${rg353mProduct.kioskSystemPackageName} or null).drvPath or null != null
    ))
    (check "RG353M host rootfs package must be a derivation" (
      (hostPackages.${rg353mProduct.rootfsPackageName} or null).drvPath or null != null
    ))
    (check "RG353M evaluated target system must be aarch64-linux" (targetSystem == "aarch64-linux"))
    (check "RG353M server role must be enabled" server.enable)
    (check "RG353M server must run as a user service" (server.serviceMode == "user"))
    (check "RG353M sessiond must not set retired force-Xwayland env" (
      !(sessiondEnv ? KORRI_GAMESCOPE_FORCE_XWAYLAND)
    ))
    (check "RG353M korrid must not set retired force-Xwayland env" (
      !(userServerEnv ? KORRI_GAMESCOPE_FORCE_XWAYLAND)
    ))
    (check "RG353M platform defaults must unset WAYLAND_DISPLAY at the host Gamescope app layer" (
      hostAppEnvironment ? WAYLAND_DISPLAY && hostAppEnvironment.WAYLAND_DISPLAY == null
    ))
    (check "RG353M compositor must not force Mesa's loader driver" (
      !(userCompositorEnv ? MESA_LOADER_DRIVER_OVERRIDE)
    ))
    (check "RG353M compositor must not force Gallium's driver" (!(userCompositorEnv ? GALLIUM_DRIVER)))
    (check "RG353M compositor must not inherit app display sockets" (
      builtins.elem "DISPLAY" userCompositorUnsetEnvironment
      && builtins.elem "WAYLAND_DISPLAY" userCompositorUnsetEnvironment
    ))
    (check "RG353M compositor must not require the retired main-space bus unit" (
      !(builtins.elem "main-space-session-dbus.service" userCompositorRequires)
    ))
    (check "RG353M compositor stays root-owned while guest device-access is unadopted" (
      cfg.services.korri.compositor.user == "root"
      && cfg.services.korri.compositor.createUser == false
    ))
    (check "RG353M runtime user keeps normalized input group access" (
      builtins.elem "input" (runtimeUser.extraGroups or [ ])
      && hasUdevRuleWith [
        ''KERNEL=="uinput"''
        ''GROUP="input"''
        ''MODE="0660"''
      ]
    ))
    (check "RG353M RockNIX guest device-access module remains explicitly unadopted" (
      (rocknixGuestDeviceAccess.enable or false) == false
      && !(systemServices ? korri-rocknix-seat-device-trigger)
      && !(systemServices ? korri-rocknix-device-acl-fallback)
      && !(lib.hasInfix ''TAG+="master-of-seat"'' udevRules)
      && !(hasUdevRuleWith [
        ''KERNEL=="event*"''
        ''TAG+="uaccess"''
      ])
      && !(hasUdevRuleWith [
        ''setfacl -m u:''
        ''/dev/input/%k''
      ])
    ))
    (check "RG353M RockNIX guest profile module must be enabled" (
      (rocknixGuestProfile.enable or false) == true
      && (rocknixGuestProfile.proofMarkerLabel or null) == "korri-rk3566-kiosk-system"
    ))
    (check "RG353M platform-default root must be ordered before mutable config" (
      lib.hasInfix "korri-platform-config-root" configRootsEnv
      && lib.hasSuffix ":/var/lib/korri/config" configRootsEnv
    ))
    (check "RG353M InputPlumber provider must be enabled" (
      cfg.services.korri.input.provider.enable
      && (cfg.services.korri.input.provider.name or null) == "inputplumber"
    ))
    (check "RG353M inputd must start after InputPlumber and raw-node hiding" (
      builtins.elem "inputplumber.service" inputdWants
      && builtins.elem "inputplumber.service" inputdAfter
      && builtins.elem "korri-rk3566-hide-raw-gamepad-devices.service" inputdWants
      && builtins.elem "korri-rk3566-hide-raw-gamepad-devices.service" inputdAfter
    ))
    (check "RG353M raw gamepad hide service must run after InputPlumber" (
      builtins.elem "inputplumber.service" (rawGamepadHideService.after or [ ])
      && builtins.elem "inputplumber.service" (rawGamepadHideService.requires or [ ])
    ))
    (check "RG353M InputPlumber package must be present" ((inputplumberPackage.name or "") != ""))
    (check "RG353M InputPlumber data root must carry the handheld xb360 posture" (
      inputplumberDataPackage != null
    ))
    (check "RG353M InputPlumber must discover product maps before package defaults" (
      inputplumberDataPackage != null
      &&
        (inputplumberEnv.XDG_DATA_DIRS or "") == lib.concatStringsSep ":" [
          "${inputplumberDataPackage}/share"
          "${inputplumberPackage}/share"
        ]
    ))
    (check "RG353M raw physical gamepad event nodes must be hidden from apps" (
      lib.hasInfix ''KERNEL=="event*", ATTRS{name}=="retrogame_joypad"'' udevRules
      && lib.hasInfix ''MODE="0000"'' udevRules
    ))
    (check "RG353M raw physical gamepad joydev nodes must be hidden from apps" (
      lib.hasInfix ''KERNEL=="js*"'' udevRules && lib.hasInfix ''MODE="0000"'' udevRules
    ))
    (check "RG353M RetroArch must use the shared InputPlumber autoconfig baseline" (
      (retroarchPolicy.drivers.input or null) == "udev"
      && (retroarchPolicy.drivers.joypad or null) == "udev"
      && (retroarchPolicy.input.autodetect or false) == true
      && (retroarchPolicy.input.maxUsers or 0) == 4
      && (retroarchPolicy.input.menuToggleGamepadCombo or null) == "l3-r3"
      && (retroarchPolicy.input.ports."1".joypadIndex or null) == 0
      && (retroarchPolicy.input.ports."1".analogDpadMode or null) == 1
      && lib.hasSuffix "/share/libretro/autoconfig" (
        retroarchPolicy.paths.joypadAutoconfigDirectory or ""
      )
    ))
    (check "RG353M keeps only the substrate main-space audio graph enabled" (
      systemServiceEnabled "main-space-pipewire"
      && systemServiceEnabled "main-space-pipewire-pulse"
      && systemServiceEnabled "main-space-wireplumber"
      && (cfg.rocknix.session.runtimeDir.uid or null) == 2000
      && ((userServices.pipewire or { }).enable or true) == false
      && ((userServices.pipewire-pulse or { }).enable or true) == false
      && ((userServices.wireplumber or { }).enable or true) == false
      && ((userSockets.pipewire or { }).enable or true) == false
      && ((userSockets.pipewire-pulse or { }).enable or true) == false
    ))
    (check "RG353M shared audio bootstrap module is wired with hard-fail posture" (
      (rocknixAudioBootstrap.enable or false) == true
      && (rocknixAudioBootstrap.pulseServer or null) == rkPulseServer
      && (rocknixAudioBootstrap.targetSink or null) == cfg.rocknix.device.audio.defaultSink.name
      && (rocknixAudioBootstrap.safeVolume or null) == "10%"
      && (rocknixAudioBootstrap.serviceScope or null) == "system"
      && (rocknixAudioBootstrap.failOnSocketUnavailable or false) == true
      && builtins.any (
        action: (action.kind or null) == "clamp-target-sink" && (action.onFailure or null) == "fail"
      ) (rocknixAudioBootstrap.actions or [ ])
    ))
    (check "RG353M safe audio bootstrap targets the main-space Pulse socket" (
      systemServices ? korri-rocknix-audio-bootstrap
      && builtins.elem "multi-user.target" (rkAudioBootstrap.wantedBy or [ ])
      && builtins.elem "main-space-pipewire-pulse.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-wireplumber.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-audio-sink-bootstrap.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-audio-sink-bootstrap.service" (rkAudioBootstrap.requires or [ ])
      && builtins.elem "greetd.service" (rkAudioBootstrap.before or [ ])
      && builtins.elem "korri-rocknix-audio-bootstrap.service" (greetdService.requires or [ ])
      && builtins.elem "korri-rocknix-audio-bootstrap.service" (greetdService.after or [ ])
      && (rkAudioBootstrap.environment.XDG_RUNTIME_DIR or null) == "/run/user/2000"
      && (rkAudioBootstrap.environment.PULSE_SERVER or null) == rkPulseServer
      && lib.hasInfix "korri-rocknix-audio-bootstrap" rkAudioBootstrapScript
      && rk3566PlatformAdapterKeepsMainSpaceAudioTopology
    ))
    (check "RG353M sessiond inherits the main-space Pulse socket" (
      sessiondEnv.PULSE_SERVER or null == rkPulseServer
    ))
    (check "RG353M inputd controls the main-space Pulse default sink" (
      inputdEnv.PULSE_SERVER or null == rkPulseServer
      && !(inputdEnv ? KORRI_INPUTD_VOLUME_UP)
      && !(inputdEnv ? KORRI_INPUTD_VOLUME_DOWN)
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri RK3566 kiosk config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rk3566-kiosk-config-check" { } ''
    set -eu
    mkdir -p "$out"
    grep -q 'host:' ${renderedPlatformDefaults}
    grep -q 'launch:' ${renderedPlatformDefaults}
    grep -q '@korri:gamescope' ${renderedPlatformDefaults}
    grep -q 'WAYLAND_DISPLAY: null' ${renderedPlatformDefaults}
    grep -q 'input_driver\|input:' ${renderedPlatformDefaults}
    grep -q '@korri:retroarch' ${renderedPlatformDefaults}
    if grep -q '^  gamescope:' ${renderedPlatformDefaults}; then
      echo "platform defaults must not use retired host.gamescope" >&2
      exit 1
    fi
    if grep -q 'apps:' ${renderedPlatformDefaults} && grep -q 'retroarch:' ${renderedPlatformDefaults}; then
      echo "platform defaults must not define an apps.retroarch record" >&2
      exit 1
    fi
    if grep -q 'audio_device\|sysdefault:CARD' ${renderedPlatformDefaults}; then
      echo "platform defaults must not hard-code RetroArch hardware audio devices" >&2
      exit 1
    fi
    if grep -q 'KORRI_GAMESCOPE_FORCE_XWAYLAND' ${renderedPlatformDefaults}; then
      echo "retired force-Xwayland env leaked into platform defaults" >&2
      exit 1
    fi
    cat > "$out/summary.txt" <<'EOF'
    Korri RockNix RK3566 config invariants passed.
    EOF
  ''
