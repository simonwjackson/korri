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
  targetSystem = cfg.nixpkgs.hostPlatform.system;
  systemServices = cfg.systemd.services or { };
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
  inputdService = userServices."korri-inputd" or { };
  inputdEnv = inputdService.environment or { };
  rkAudioBootstrap = systemServices.korri-rk3566-audio-bootstrap or { };
  userCompositorService = userServices."korri-compositor" or { };
  userCompositorEnv = userCompositorService.environment or { };
  userCompositorServiceConfig = userCompositorService.serviceConfig or { };
  userCompositorUnsetEnvironment = userCompositorServiceConfig.UnsetEnvironment or [ ];
  userCompositorRequires = userCompositorService.requires or [ ];
  platformDefaults = server.library.platformDefaults;
  hostAppEnvironment = ((platformDefaults.host or { }).gamescope or { }).app.environment or { };
  rkPulseServer = "unix:/run/user/2000/pulse/native";
  rkAudioBootstrapScript = rkAudioBootstrap.serviceConfig.ExecStart or "";
  # The evaluated bootstrap ExecStart points at an aarch64 shell-script
  # derivation. Grepping that artifact from this x86_64 host check would force
  # a target-platform build, so keep this as an adapter-source invariant.
  rk3566PlatformAdapterSource = builtins.readFile rk3566PlatformAdapterSourceFile;
  rk3566PlatformAdapterUsesSafeAudioVolume =
    lib.hasInfix ''rk3566SafeDefaultSinkVolume = "10%"'' rk3566PlatformAdapterSource
    && lib.hasInfix ''rk3566TargetSink = config.rocknix.device.audio.defaultSink.name'' rk3566PlatformAdapterSource
    && lib.hasInfix ''set-sink-volume "$target_sink" "$safe_default_sink_volume"'' rk3566PlatformAdapterSource
    && lib.hasInfix ''systemd.user.services.pipewire.enable = lib.mkForce false'' rk3566PlatformAdapterSource;
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
    (check "RG353M platform-default root must be ordered before mutable config" (
      lib.hasInfix "korri-platform-config-root" configRootsEnv
      && lib.hasSuffix ":/var/lib/korri/config" configRootsEnv
    ))
    (check "RG353M InputPlumber must discover product maps before package defaults" (
      lib.hasPrefix "/run/current-system/sw/share:" (inputplumberEnv.XDG_DATA_DIRS or "")
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
    (check "RG353M safe audio bootstrap targets the main-space Pulse socket" (
      systemServices ? korri-rk3566-audio-bootstrap
      && builtins.elem "multi-user.target" (rkAudioBootstrap.wantedBy or [ ])
      && builtins.elem "main-space-pipewire-pulse.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-wireplumber.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-audio-sink-bootstrap.service" (rkAudioBootstrap.after or [ ])
      && builtins.elem "main-space-audio-sink-bootstrap.service" (rkAudioBootstrap.requires or [ ])
      && builtins.elem "greetd.service" (rkAudioBootstrap.before or [ ])
      && builtins.elem "korri-rk3566-audio-bootstrap.service" (greetdService.requires or [ ])
      && builtins.elem "korri-rk3566-audio-bootstrap.service" (greetdService.after or [ ])
      && (rkAudioBootstrap.environment.XDG_RUNTIME_DIR or null) == "/run/user/2000"
      && (rkAudioBootstrap.environment.PULSE_SERVER or null) == rkPulseServer
      && lib.hasInfix "korri-rk3566-audio-bootstrap" rkAudioBootstrapScript
      && rk3566PlatformAdapterUsesSafeAudioVolume
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
    grep -q 'gamescope:' ${renderedPlatformDefaults}
    grep -q 'WAYLAND_DISPLAY: null' ${renderedPlatformDefaults}
    if grep -q 'retroarch:' ${renderedPlatformDefaults}; then
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
