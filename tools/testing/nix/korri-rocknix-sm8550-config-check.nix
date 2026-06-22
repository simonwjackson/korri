{ pkgs
, products
, byCompatibleProduct
, thorSystem
, soboSystem
, byCompatibleSystem
, targetPackages
, hostPackages
, configurations
, hardwareFactSourceFiles
, sm8550PlatformAdapterSourceFile
,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  sourceContainsHardwareFact =
    file: builtins.match ".*(SM8550|RockNix|Odin|Thor|DSI-1|DSI-2).*" (builtins.readFile file) != null;

  stripComment =
    line:
    let
      i = builtins.match "([^#]*)#.*" line;
    in
    if i == null then line else builtins.head i;
  lineSetsLiteral =
    value: line:
    builtins.match ".*[^!=][[:space:]]*=[[:space:]]*\"${value}\".*" (stripComment line) != null;
  containsQuotedAssignment =
    value: file:
    builtins.any (line: lineSetsLiteral value line) (lib.splitString "\n" (builtins.readFile file));
  sm8550PlatformAdapterSource = builtins.readFile sm8550PlatformAdapterSourceFile;
  sm8550PlatformAdapterFreeOfHardwareLiterals =
    !(containsQuotedAssignment "v4l2m2m" sm8550PlatformAdapterSourceFile)
    && !(containsQuotedAssignment "pulseaudio" sm8550PlatformAdapterSourceFile);
  sm8550PlatformAdapterFreeOfSubstrateSteam =
    !(lib.hasInfix "substratePackages.steam" sm8550PlatformAdapterSource);
  # The evaluated bootstrap ExecStart points at an aarch64 shell-script
  # derivation. Grepping that artifact from this x86_64 host check would force
  # a target-platform build, so keep this as an adapter-source invariant.
  sm8550PlatformAdapterUsesSafeAudioVolume =
    lib.hasInfix ''korriSafeDefaultSinkVolume = "10%"'' sm8550PlatformAdapterSource
    && lib.hasInfix ''set-sink-volume "$sink" "$korri_safe_default_sink_volume"'' sm8550PlatformAdapterSource
    && lib.hasInfix ''set-sink-volume "$default_sink" "$korri_safe_default_sink_volume"'' sm8550PlatformAdapterSource
    && lib.hasInfix ''auto_null*)'' sm8550PlatformAdapterSource
    && !(lib.hasInfix ''set-sink-volume "$sink" 70%'' sm8550PlatformAdapterSource)
    && !(lib.hasInfix ''set-sink-volume "$target_sink" 70%'' sm8550PlatformAdapterSource);

  soboAudioRoute = soboSystem.config.rocknix.device.audio.route;

  checkSystem =
    name: system:
    let
      cfg = system.config;
      systemServices = cfg.systemd.services or { };
      runtime = cfg.services.korri.runtime;
      korriUser = cfg.users.users.${runtime.user} or { };
      userServices = cfg.systemd.user.services or { };
      sessiond = cfg.services.korri.sessiond or { };
      sessiondUnit = userServices.korri-sessiond or { };
      sessiondEnv = sessiondUnit.environment or { };
      daemonEnv = (userServices.korrid or { }).environment or { };
      activationScripts = cfg.system.activationScripts or { };
      inputdUnit = userServices.korri-inputd or { };
      inputdEnv = inputdUnit.environment or { };
      inputdPath = inputdUnit.path or [ ];
      inputdWants = inputdUnit.wants or [ ];
      inputdAfter = inputdUnit.after or [ ];
      inputplumberService = systemServices.inputplumber or { };
      inputplumberEnv = inputplumberService.environment or { };
      inputplumberPackage = cfg.services.inputplumber.package or { };
      removableMountUnit = cfg.systemd.services."korri-removable-media-mount@" or { };
      removableUnmountUnit = cfg.systemd.services."korri-removable-media-unmount@" or { };
      removableColdplugUnit = cfg.systemd.services.korri-removable-media-coldplug or { };
      removableMedia = cfg.services.korri.removableMedia or { };
      platformDefaults = cfg.services.korri.daemon.library.platformDefaults or { };
      hostDefaults = platformDefaults.host or { };
      retroarchPolicy = (hostDefaults.plugin or { })."@korri:retroarch" or { };
      yfsPlatformLauncher = lib.attrByPath [
        "launchers"
        "@korri:yoshis-fabrication-station/level"
      ] { } platformDefaults;
      yfsLauncherSettings = lib.attrByPath [ "settings" "plugin" ] { } yfsPlatformLauncher;
      yfsRemapBindings = lib.attrByPath [
        "launch"
        "with"
        "@korri:remap"
        "bindings"
      ] { } yfsPlatformLauncher;
      steam = cfg.services.korri.steam or { };
      audioRoute = cfg.rocknix.device.audio.route;
      expectedAudioTargetSink =
        if audioRoute.kind == "wireplumber-ucm" then
          audioRoute.expectedSink
        else if audioRoute.kind == "manual-pcm" then
          audioRoute.sinkName
        else
          cfg.rocknix.sm8550.audio.defaultSink.name;
      steamUnit = cfg.systemd.services.korri-steam or { };
      steamGamescopeUnit = cfg.systemd.services.korri-steam-gamescope or { };
      steamWarmUnit = userServices.korri-steam-warm or { };
      steamUinputUnit = cfg.systemd.services.korri-steam-uinput or { };
      pipewireEnv = (userServices.pipewire or { }).environment or { };
      pipewirePulseEnv = (userServices.pipewire-pulse or { }).environment or { };
      wireplumberEnv = (userServices.wireplumber or { }).environment or { };
      audioBootstrapUnit = userServices.korri-sm8550-audio-bootstrap or { };
      mainSpaceAudioDisabled =
        serviceName:
        let
          service = cfg.systemd.services.${serviceName} or { enable = false; };
        in
        (service.enable or true) == false;
      seatDeviceTrigger = cfg.systemd.services.korri-rocknix-seat-device-trigger or { };
      compositorUnit = userServices.korri-compositor or { };
      kioskEnvUnit = userServices."korri-kiosk-session-environment" or { };
      compositor = cfg.services.korri.compositor;
      hasPackagePname =
        pname: packages: builtins.any (pkg: (pkg.pname or pkg.name or "") == pname) packages;
      findRetroarchWrappers =
        path:
        builtins.filter
          (
            p:
            let
              pt = p.passthru or { };
            in
            builtins.hasAttr "cores" pt && builtins.hasAttr "unwrapped" pt
          )
          path;
      retroarchCoresFor =
        path: lib.concatLists (map (wrapper: wrapper.passthru.cores or [ ]) (findRetroarchWrappers path));
      fake08CoreSource = "${targetPackages.libretro-fake-08}/lib/retroarch/cores/fake08_libretro.so";
      hasCore = coreName: cores: builtins.any (core: (core.core or null) == coreName) cores;
    in
    [
      (check "${name}: eval has no assertion failures" (
        builtins.filter (a: !a.assertion) cfg.assertions == [ ]
      ))
      (check "${name}: runtime user is korri and non-root" (
        runtime.user == "korri" && (korriUser.uid or 0) != 0 && (korriUser.isNormalUser or false)
      ))
      (check "${name}: korri has appliance device groups" (
        builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [
          "audio"
          "input"
          "render"
          "seat"
          "video"
        ]
      ))
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
        && builtins.elem "d /var/lib/korri/config 0750 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "d /home/korri/.local/state/korri 0700 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "Z /home/korri/.local/state/korri 0700 korri korri -" cfg.systemd.tmpfiles.rules
      ))
      (check "${name}: korrid exports ordered config-graph roots" (
        let
          roots = daemonEnv.KORRI_CONFIG_ROOTS or "";
        in
        lib.hasInfix "korri-platform-config-root" roots && lib.hasSuffix ":/var/lib/korri/config" roots
      ))
      (check "${name}: sessiond inherits the config-graph roots" (
        (sessiondEnv.KORRI_CONFIG_ROOTS or null) == (daemonEnv.KORRI_CONFIG_ROOTS or "")
      ))
      (check "${name}: korrid enables first-party plugin resources" (
        lib.hasInfix "@korri:neverball" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
        && lib.hasInfix "@korri:remap" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
        && lib.hasInfix "@korri:turnip" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
        && lib.hasInfix "@korri:yoshis-fabrication-station" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
        && lib.hasPrefix "/" (daemonEnv.KORRI_NIX_COMMAND or "")
        && lib.hasSuffix "/bin/nix" (daemonEnv.KORRI_NIX_COMMAND or "")
        && (daemonEnv.KORRI_PLUGIN_RESOURCE_ROOT or null) == "/var/lib/korri/plugins/resources"
      ))
      (check "${name}: korrid and sessiond share the dynamic config-roots dir" (
        (daemonEnv.KORRI_CONFIG_ROOTS_DIR or null) == "/run/korri/config-roots.d"
        && (sessiondEnv.KORRI_CONFIG_ROOTS_DIR or null) == (daemonEnv.KORRI_CONFIG_ROOTS_DIR or null)
      ))
      (check "${name}: compositor/sessiond/inputd/korrid are user services" (
        userServices ? "korri-compositor"
        && userServices ? korri-sessiond
        && userServices ? korri-inputd
        && userServices ? korrid
      ))
      (check "${name}: no legacy system Korri daemons" (
        !(cfg.systemd.services ? "korri-compositor")
        && !(cfg.systemd.services ? korri-sessiond)
        && !(cfg.systemd.services ? korri-inputd)
        && !(cfg.systemd.services ? korrid)
      ))
      (check "${name}: greetd requires korri-setup" (
        builtins.elem "korri-setup.service" (cfg.systemd.services.greetd.requires or [ ])
      ))
      (check "${name}: compositor identity follows Korri runtime" (
        compositor.user == runtime.user
        && compositor.group == runtime.group
        && compositor.createUser == false
      ))
      (check "${name}: compositor uses logind runtime" (
        compositor.runtimeDir == "%t" && compositor.home == "/home/korri"
      ))
      (check "${name}: SM8550 DRM is tagged for logind seats" (
        lib.hasInfix ''SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"'' cfg.services.udev.extraRules
      ))
      (check "${name}: SM8550 evdev input is readable by Korri inputd" (
        lib.hasInfix ''SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess"'' cfg.services.udev.extraRules
        && lib.hasInfix "setfacl -m u:korri:rw /dev/input/%k" cfg.services.udev.extraRules
      ))
      (check "${name}: SM8550 DRM/input/tty access is prepared around greetd" (
        cfg.systemd.services ? korri-rocknix-seat-device-trigger
        && cfg.systemd.services ? korri-rocknix-device-acl-fallback
        && builtins.elem "greetd.service" (seatDeviceTrigger.before or [ ])
        && builtins.elem "greetd.service" (
          (cfg.systemd.services.korri-rocknix-device-acl-fallback or { }).after or [ ]
        )
        && (
          let
            raw = seatDeviceTrigger.serviceConfig.ExecStart or [ ];
            execLines = lib.concatStringsSep "\n" (if builtins.isList raw then raw else [ raw ]);
          in
          lib.hasInfix "korri-rocknix-seat-device-setup" execLines
        )
        && (
          let
            raw =
              (cfg.systemd.services.korri-rocknix-device-acl-fallback or { }).serviceConfig.ExecStart or [ ];
            execLines = lib.concatStringsSep "\n" (if builtins.isList raw then raw else [ raw ]);
          in
          lib.hasInfix "korri-rocknix-device-acl-fallback" execLines
        )
      ))
      (check "${name}: SM8550 sound-card udev hydration is owned by substrate" (
        systemServices ? rocknix-sound-card-udev-hydrate
        && builtins.elem "rocknix-sound-card-udev-hydrate.service" (seatDeviceTrigger.after or [ ])
        && builtins.elem "rocknix-sound-card-udev-hydrate.service" (seatDeviceTrigger.wants or [ ])
        && !(lib.hasInfix "SOUND_INITIALIZED=1" sm8550PlatformAdapterSource)
        && !(lib.hasInfix ''/run/udev/data/+sound:'' sm8550PlatformAdapterSource)
      ))
      (check "${name}: compositor uses the greetd/logind user session bus" (
        compositor.sessionBus.mode == "existing"
        && compositor.sessionBus.address == "unix:path=%t/bus"
        && !(builtins.elem "main-space-session-dbus.service" ((cfg.systemd.user.services."korri-compositor" or { }).requires or [ ]))
        && (sessiondEnv.DBUS_SESSION_BUS_ADDRESS or null) == "unix:path=%t/bus"
      ))
      (check "${name}: compositor uses wlroots direct session on host-bound DRM" (
        (compositor.environment.WLR_SESSION or null) == "direct"
        && (compositor.environment.LIBSEAT_BACKEND or null) == "builtin"
      ))
      (check "${name}: compositor does not inherit child display env" (
        builtins.all (name: builtins.elem name (compositorUnit.serviceConfig.UnsetEnvironment or [ ])) [
          "DISPLAY"
          "WAYLAND_DISPLAY"
        ]
      ))
      (check "${name}: kiosk seeds user-manager display environment" (
        builtins.hasAttr "korri-kiosk-session-environment" userServices
        && builtins.elem "korri-compositor.service" (kioskEnvUnit.before or [ ])
        && builtins.elem "korri-sessiond.service" (kioskEnvUnit.before or [ ])
      ))
      (check "${name}: sessiond uses declarative kiosk display environment" (
        (sessiondEnv.DISPLAY or null) == ":0"
        && (sessiondEnv.WAYLAND_DISPLAY or null) == "wayland-1"
        && (sessiondEnv.GDK_BACKEND or null) == "x11"
      ))
      (check "${name}: stale manual sessiond display drop-in is removed" (
        builtins.hasAttr "korri-remove-legacy-sessiond-display-dropin" activationScripts
        &&
          lib.hasInfix "/home/korri/.config/systemd/user/korri-sessiond.service.d/display.conf"
            activationScripts."korri-remove-legacy-sessiond-display-dropin".text
      ))
      (check "${name}: sessiond does not control root-owned essway" (
        (sessiondEnv.KORRI_SESSIOND_ESSWAY_CONTROL or null) == "0"
      ))
      (check "${name}: sessiond socket env is %t path" (
        sessiondEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"
      ))
      (check "${name}: daemon socket env is %t path" (
        daemonEnv.KORRI_SESSIOND_SOCKET or null == "%t/korri/sessiond.sock"
      ))
      (check "${name}: legacy sessiond URL/token env absent" (
        !(sessiondEnv ? KORRI_SESSIOND_URL)
        && !(sessiondEnv ? KORRI_SESSIOND_TOKEN_FILE)
        && !(daemonEnv ? KORRI_SESSIOND_URL)
        && !(daemonEnv ? KORRI_SESSIOND_TOKEN_FILE)
      ))
      (check "${name}: InputPlumber provider must be enabled" (
        cfg.services.korri.input.provider.enable
        && (cfg.services.korri.input.provider.name or null) == "inputplumber"
        && builtins.elem "inputplumber.service" inputdWants
        && builtins.elem "inputplumber.service" inputdAfter
      ))
      (check "${name}: InputPlumber package must carry the handheld xb360 posture" (
        lib.hasInfix "xb360" (inputplumberPackage.name or "")
      ))
      (check "${name}: InputPlumber must read the xb360 package before system defaults" (
        lib.hasPrefix "${inputplumberPackage}/share:" (inputplumberEnv.XDG_DATA_DIRS or "")
      ))
      (check "${name}: Moonlight product launches require InputPlumber" (
        (sessiondEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null) == "1"
        && (daemonEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null) == "1"
      ))
      (check "${name}: RetroArch must use the handheld input baseline" (
        (retroarchPolicy.drivers.input or null) == "udev"
        && (retroarchPolicy.drivers.joypad or null) == "udev"
        && (retroarchPolicy.input.autodetect or false) == true
        && (retroarchPolicy.input.maxUsers or 0) == 4
        && (retroarchPolicy.input.ports."1".joypadIndex or null) == 0
        && (retroarchPolicy.input.ports."1".analogDpadMode or null) == 1
      ))
      (check "${name}: Switch emulator is installed and available to the compositor" (
        hasPackagePname "ryubing" cfg.environment.systemPackages
        && hasPackagePname "ryubing" compositor.path
      ))
      (check "${name}: YFS direct launcher is installed and available to sessiond" (
        hasPackagePname "yoshis-fabrication-station" cfg.environment.systemPackages
        && hasPackagePname "yoshis-fabrication-station" sessiond.path
      ))
      (check "${name}: Remap native wrapper is enabled for launch-scoped controls" (
        (cfg.services.korri.remap.enable or false)
        && cfg.security.wrappers ? korri-remap-bridge
        && hasPackagePname "korri-remap-bridge" cfg.environment.systemPackages
      ))
      (check "${name}: YFS platform launcher override remains launchable" (
        !(yfsPlatformLauncher ? plugin)
        && (yfsPlatformLauncher.command or null) == "yfs-launch"
        && (yfsPlatformLauncher.args or [ ]) == [
          "--viewport-aspect=1:1"
          "--zoom=auto-area"
          "--cache-root=/tmp/korri-remap-runner-yfs-cache"
          "--browser-env=XDG_RUNTIME_DIR=/run/user/2000"
          "--browser-env=WAYLAND_DISPLAY=wayland-1"
          "--browser-env=HOME=/tmp"
          "--browser-env=XDG_CACHE_HOME=/tmp/korri-remap-runner-cache"
          "--browser-env=USER=korri-remap-runner"
          "--browser-env=LOGNAME=korri-remap-runner"
          "{content.path}"
        ]
        && (yfsPlatformLauncher.env.KORRI_YFS_SETTINGS or null) == "{settings.plugin}"
        && builtins.elem "yfs-launch" (yfsPlatformLauncher.policy.allowedCommands or [ ])
      ))
      (check "${name}: YFS launcher uses explicit Remap controls" (
        (yfsRemapBindings."p1.dpad.up" or null) == "key.up"
        && (yfsRemapBindings."p1.dpad.down" or null) == "key.down"
        && (yfsRemapBindings."p1.dpad.left" or null) == "key.left"
        && (yfsRemapBindings."p1.dpad.right" or null) == "key.right"
        && (yfsRemapBindings."p1.stick.left.up" or null) == "key.up"
        && (yfsRemapBindings."p1.stick.left.down" or null) == "key.down"
        && (yfsRemapBindings."p1.stick.left.left" or null) == "key.left"
        && (yfsRemapBindings."p1.stick.left.right" or null) == "key.right"
        && (yfsRemapBindings."p1.stick.right.up" or null) == "key.up"
        && (yfsRemapBindings."p1.stick.right.down" or null) == "key.down"
        && (yfsRemapBindings."p1.stick.right.left" or null) == "key.left"
        && (yfsRemapBindings."p1.stick.right.right" or null) == "key.right"
        && (yfsRemapBindings."p1.button.south" or null) == "key.z"
        && (yfsRemapBindings."p1.button.west" or null) == "key.a"
        && (yfsRemapBindings."p1.button.east" or null) == "key.x"
        && (yfsRemapBindings."p1.button.north" or null) == "key.a"
        && (yfsRemapBindings."p1.button.start" or null) == "key.p"
      ))
      (check "${name}: YFS launcher defaults use square viewport and auto-area zoom" (
        (yfsLauncherSettings.viewport.aspect or null) == "1:1"
        && (yfsLauncherSettings.viewport.policy or null) == "expand-only"
        && (yfsLauncherSettings.zoom.mode or null) == "auto-area"
      ))
      (check "${name}: PICO-8 fake-08 core is exposed at the stable launch path" (
        (cfg.environment.etc."korri/cores/fake08_libretro.so".source or null) == fake08CoreSource
      ))
      (check "${name}: RetroArch Fuse core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/fuse_libretro.so" (
          cfg.environment.etc."korri/cores/fuse_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch mGBA core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/mgba_libretro.so" (
          cfg.environment.etc."korri/cores/mgba_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch Mupen64Plus-Next core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/mupen64plus_next_libretro.so" (
          cfg.environment.etc."korri/cores/mupen64plus_next_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch Genesis Plus GX core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/genesis_plus_gx_libretro.so" (
          cfg.environment.etc."korri/cores/genesis_plus_gx_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch Beetle PCE Fast core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/mednafen_pce_fast_libretro.so" (
          cfg.environment.etc."korri/cores/mednafen_pce_fast_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch Mesen core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/mesen_libretro.so" (
          cfg.environment.etc."korri/cores/mesen_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch NP2Kai core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/np2kai_libretro.so" (
          cfg.environment.etc."korri/cores/np2kai_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch PCSX ReARMed core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/pcsx_rearmed_libretro.so" (
          cfg.environment.etc."korri/cores/pcsx_rearmed_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch PPSSPP core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/ppsspp_libretro.so" (
          cfg.environment.etc."korri/cores/ppsspp_libretro.so".source or ""
        )
      ))
      (check "${name}: RetroArch bsnes core is exposed at the stable launch path" (
        lib.hasSuffix "/lib/retroarch/cores/bsnes_libretro.so" (
          cfg.environment.etc."korri/cores/bsnes_libretro.so".source or ""
        )
      ))
      (check
        "${name}: compositor RetroArch closure contains Fuse, mGBA, Mupen64Plus-Next, Genesis Plus GX, Beetle PCE Fast, Mesen, NP2Kai, PCSX ReARMed, PPSSPP, and bsnes cores"
        (
          let
            wrappers = findRetroarchWrappers compositor.path;
            cores = retroarchCoresFor compositor.path;
          in
          builtins.length wrappers == 1
          && builtins.length cores == 10
          && hasCore "fuse" cores
          && hasCore "mgba" cores
          && hasCore "mupen64plus-next" cores
          && hasCore "genesis-plus-gx" cores
          && hasCore "mednafen-pce-fast" cores
          && hasCore "mesen" cores
          && hasCore "np2kai" cores
          && hasCore "pcsx-rearmed" cores
          && hasCore "ppsspp" cores
          && hasCore "bsnes" cores
        )
      )
      (check
        "${name}: sessiond RetroArch closure contains Fuse, mGBA, Mupen64Plus-Next, Genesis Plus GX, Beetle PCE Fast, Mesen, NP2Kai, PCSX ReARMed, PPSSPP, and bsnes cores"
        (
          let
            sessiondPath = sessiondUnit.path or [ ];
            wrappers = findRetroarchWrappers sessiondPath;
            cores = retroarchCoresFor sessiondPath;
          in
          builtins.length wrappers == 1
          && builtins.length cores == 10
          && hasCore "fuse" cores
          && hasCore "mgba" cores
          && hasCore "mupen64plus-next" cores
          && hasCore "genesis-plus-gx" cores
          && hasCore "mednafen-pce-fast" cores
          && hasCore "mesen" cores
          && hasCore "np2kai" cores
          && hasCore "pcsx-rearmed" cores
          && hasCore "ppsspp" cores
          && hasCore "bsnes" cores
        )
      )
      (check "${name}: RetroArch is pinned to a Mesa >= 26 Turnip ICD" (
        let
          sessiondPath = sessiondUnit.path or [ ];
          wrapper = lib.findFirst (pkg: (pkg.passthru or { }) ? cores) null sessiondPath;
          icd = wrapper.passthru.turnipIcd or "";
          mesaVersion = (wrapper.passthru.mesaTurnip or { }).version or "0";
        in
        wrapper != null
        && (wrapper.passthru.turnipPinned or false)
        && lib.hasSuffix "share/vulkan/icd.d/freedreno_icd.aarch64.json" icd
        && lib.versionAtLeast mesaVersion "26"
      ))
      # Mesa 25.2.6 Turnip is pathologically slow for Ryujinx on Adreno
      # (validated on bandai 2026-06-11: 4-vs-60-FPS class delta, see
      # docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md).
      # Pin the contract: the installed ryubing must carry a Mesa >= 26
      # freedreno (Turnip) ICD via the ryubing-korri wrapper.
      (check "${name}: ryubing is pinned to a Mesa >= 26 Turnip ICD" (
        let
          ryu = lib.findFirst (pkg: (pkg.pname or "") == "ryubing") null cfg.environment.systemPackages;
          icd = ryu.passthru.vulkanIcd or "";
          mesaVersion = (ryu.passthru.mesaTurnip or { }).version or "0";
        in
        ryu != null
        && (ryu.passthru.turnipPinned or false)
        && lib.hasSuffix "share/vulkan/icd.d/freedreno_icd.aarch64.json" icd
        && lib.versionAtLeast mesaVersion "26"
      ))
      (check "${name}: inputd websocket is loopback" (
        inputdEnv.KORRI_INPUT_BRIDGE_HOSTNAME or null == "127.0.0.1"
      ))
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
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (compositorUnit.requires or [ ])
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (sessiondUnit.requires or [ ])
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (inputdUnit.requires or [ ])
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (compositorUnit.after or [ ])
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (sessiondUnit.after or [ ])
        && builtins.elem "korri-sm8550-audio-bootstrap.service" (inputdUnit.after or [ ])
        && (audioBootstrapUnit.environment.PULSE_SERVER or null) == "unix:%t/pulse/native"
        && (audioBootstrapUnit.environment.ALSA_CONFIG_UCM2 or null) == pipewireEnv.ALSA_CONFIG_UCM2
      ))
      (check "${name}: user audio bootstrap follows substrate route and clamps safe volume" (
        sm8550PlatformAdapterUsesSafeAudioVolume
        && lib.hasInfix "alsaucm -c" sm8550PlatformAdapterSource
        && lib.hasInfix "set _verb" sm8550PlatformAdapterSource
        && lib.hasInfix "set _enadev" sm8550PlatformAdapterSource
        && lib.hasInfix "substrateAudioRouteHasFullUcm" sm8550PlatformAdapterSource
      ))
      (check "${name}: sessiond launches inherit Korri user Pulse socket" (
        sessiondEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
      ))
      (check "${name}: inputd owns power/lid buttons via the product fake-suspend toggle" (
        lib.hasSuffix "korri-fakesuspend-toggle" (inputdEnv.KORRI_INPUTD_POWER_SUSPEND or "")
        && lib.hasSuffix "korri-fakesuspend-toggle suspend" (inputdEnv.KORRI_INPUTD_LID_CLOSED or "")
        && lib.hasSuffix "korri-fakesuspend-toggle resume" (inputdEnv.KORRI_INPUTD_LID_OPENED or "")
        && inputdEnv.PULSE_SERVER or null == "unix:%t/pulse/native"
        # Volume is no longer overridden; inputd falls back to its built-in
        # pactl set-sink-volume default against the Korri user Pulse socket.
        && !(inputdEnv ? KORRI_INPUTD_VOLUME_UP)
        && !(inputdEnv ? KORRI_INPUTD_VOLUME_DOWN)
        # The substrate power-state request channel is group-writable by the
        # Korri runtime group so the toggle can drop enter/exit markers
        # without root or polkit.
        && (cfg.rocknix.power.requestGroup or null) == runtime.group
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
        cfg.systemd.services ? "korri-removable-media-mount@"
        && cfg.systemd.services ? "korri-removable-media-unmount@"
        && lib.hasInfix ''KERNEL=="mmcblk*p*"'' cfg.services.udev.extraRules
        && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-media-mount@%k.service"'' cfg.services.udev.extraRules
        && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-media-unmount@%k.service"'' cfg.services.udev.extraRules
        # The media root is the fixed cross-device contract: card fragments
        # reference their own content by absolute path, so every Korri
        # device must mount media at the same prefix.
        && (removableMountUnit.environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri"
        &&
        (removableMountUnit.environment.KORRI_REMOVABLE_CONTENT_ROOT or null)
        == "/var/lib/korri/content/removable/cards"
        && (removableUnmountUnit.environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri"
        && builtins.elem "d /run/media/korri 0755 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "L+ /var/lib/korri/content/removable/cards - - - - /run/media/korri" cfg.systemd.tmpfiles.rules
        && builtins.elem "multi-user.target" (removableColdplugUnit.wantedBy or [ ])
        && lib.hasInfix "korri-removable-media-coldplug" (
          removableColdplugUnit.serviceConfig.ExecStart or ""
        )
      ))
      (check "${name}: Korri Steam owns the SM8550 Steam posture" (
        (steam.enable or false)
        && ((steam.package or { }).rocknixSteamHasRunCapsule or false)
        && (steam.home or null) == "/var/lib/korri/steam"
        && (steam.gamesRoot or null) == "/var/lib/korri/content/games/steam"
        && (steam.dotDir or null) == "/home/korri/.steam"
        && (steam.fexRootfs or null) == "/var/lib/korri/steam/fex-rootfs"
        && (steam.keepWarm or false)
        && (steam.appAudioSinkName or null) == expectedAudioTargetSink
      ))
      (check "${name}: Korri Steam launch services are hardened" (
        cfg.systemd.services ? korri-steam-uinput
        && cfg.systemd.services ? korri-steam
        && builtins.elem "multi-user.target" (steamUinputUnit.wantedBy or [ ])
        && (steamUnit.serviceConfig.User or null) == runtime.user
        && (steamUnit.serviceConfig.WorkingDirectory or null) == "/var/lib/korri/steam"
        && (steamUnit.serviceConfig.LimitNOFILE or null) == 524288
        && (steamUnit.environment.XDG_RUNTIME_DIR or null) == "/run/user/2000"
        && (steamUnit.environment.PULSE_SERVER or null) == "unix:/run/user/2000/pulse/native"
        && (steamGamescopeUnit.environment.PULSE_SERVER or null) == "unix:/run/user/2000/pulse/native"
      ))
      (check "${name}: Korri Steam is warmed from the real user session" (
        userServices ? korri-steam-warm
        && builtins.elem "korri-session.target" (steamWarmUnit.wantedBy or [ ])
        && builtins.elem "korri-compositor.service" (steamWarmUnit.after or [ ])
        && (steamWarmUnit.serviceConfig.Type or null) == "oneshot"
        && lib.hasInfix "korri-steam-warm" (steamWarmUnit.serviceConfig.ExecStart or "")
      ))
      (check "${name}: old substrate Steam launcher/service is absent" (
        !(cfg.systemd.services ? main-space-steam-uinput)
        && !(builtins.any
          (
            pkg: lib.hasInfix "rocknix-steam-guest" (pkg.name or "")
          )
          cfg.environment.systemPackages)
      ))
      (check "${name}: Korri Steam tmpfiles create state under Korri roots" (
        builtins.elem "d /var/lib/korri/steam 0750 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "d /var/lib/korri/content/games/steam 0750 korri korri -" cfg.systemd.tmpfiles.rules
        && builtins.elem "d /home/korri/.steam 0700 korri korri -" cfg.systemd.tmpfiles.rules
      ))
      (check "${name}: removable media excludes the guest system disk and USB transport" (
        # match.usb off: the positive gate only admits mmcblk*p* cards, so
        # sda-class UFS devices never match; the runtime deny-list must
        # additionally derive the system disk from the guest root, which is
        # the /dev/sda19 bind (validated on bandai 2026-06-11: /storage is a
        # plain directory in the guest, not a mount).
        (removableMedia.enable or false)
        && (removableMedia.match.mmc or false)
        && !(removableMedia.match.usb or true)
        && (removableMedia.requiredSystemMounts or [ ]) == [ "/" ]
        && !(lib.hasInfix ''ID_BUS}=="usb"'' cfg.services.udev.extraRules)
      ))
      (check "${name}: sessiond can write mounted removable media" (
        # Games spawn under sessiond's ProtectSystem=strict sandbox; emulator
        # save data lives on the card, so mediaRoot must be in ReadWritePaths
        # (bandai 2026-06-11: LibHac save-indexer EROFS abort without it).
        builtins.elem (removableMedia.mediaRoot or "") (
          ((userServices.korri-sessiond or { }).serviceConfig or { }).ReadWritePaths or [ ]
        )
      ))
      (check "${name}: launcher artifacts use root setup path" (
        runtime.launchArtifactsDir == "/run/korri/launch-artifacts"
      ))
    ];

  checks = [
    (check "SM8550 adapter does not hard-code substrate literals" sm8550PlatformAdapterFreeOfHardwareLiterals)
    (check "SM8550 adapter does not explicitly install substrate Steam" sm8550PlatformAdapterFreeOfSubstrateSteam)
    (check "SM8550 adapter declares the safe audio bootstrap volume" sm8550PlatformAdapterUsesSafeAudioVolume)
    (check "Sobo declares the substrate WirePlumber UCM speaker route" (
      soboAudioRoute.kind == "wireplumber-ucm"
        && soboAudioRoute.expectedSink == "alsa_output.platform-sound.HiFi__Speaker__sink"
        && soboAudioRoute.pcm == null
    ))
  ]
  ++ (checkSystem "Odin 2 Portal" thorSystem)
  ++ (checkSystem "Sobo" soboSystem);

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri SM8550 kiosk config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-sm8550-config-check" { } ''
    echo "All ${toString (builtins.length checks)} SM8550 config checks passed."
    touch $out
  ''
