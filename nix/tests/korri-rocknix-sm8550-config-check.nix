{
  pkgs,
  thorSystem,
  soboSystem,
  byCompatibleSystem,
  targetPackages,
  hostPackages,
  configurations,
  hardwareFactSourceFiles,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  sourceContainsHardwareFact =
    file: builtins.match ".*(SM8550|RockNix|Odin|Thor|DSI-1|DSI-2).*" (builtins.readFile file) != null;

  # Find the retroarch-bare wrapper in a compositor PATH list. The wrapper
  # uniquely exposes both `passthru.cores` (the declared core list) and
  # `passthru.unwrapped` (the bare retroarch derivation); matching on both
  # is more robust than the pname, which gains version suffixes across
  # nixpkgs revisions (e.g. "retroarch-with-cores-1.21.0").
  findRetroarchWrappers =
    path:
    builtins.filter (
      p:
      let
        pt = p.passthru or { };
      in
      builtins.hasAttr "cores" pt && builtins.hasAttr "unwrapped" pt
    ) path;

  checkSystem =
    name: system:
    let
      cfg = system.config;
      server = cfg.services.korri.server;
      targetSystem = cfg.nixpkgs.hostPlatform.system;
      compositor = cfg.services.korri.compositor;
      input = cfg.services.korri.input;
      compositorService = cfg.systemd.services."korri-compositor";
      inputplumberService = cfg.systemd.services.inputplumber;
      rawGamepadHideService = cfg.systemd.services."rocknix-guest-hide-raw-gamepad" or { };
      udevdService = cfg.systemd.services.systemd-udevd or { };
      compositorEnv = compositorService.environment or { };
      sessiondService = cfg.systemd.services."korri-sessiond" or { };
      sessiondEnv = sessiondService.environment or { };
      sessiondAfter = sessiondService.after or [ ];
      sessiondWants = sessiondService.wants or [ ];
      sessiondRequires = sessiondService.requires or [ ];
      sessiondPath = sessiondService.path or [ ];
      systemPackageNames = map (pkg: pkg.name or "") (cfg.environment.systemPackages or [ ]);
      systemPackageText = lib.concatStringsSep "\n" systemPackageNames;
      failedNixosAssertions = builtins.filter (candidate: !candidate.assertion) cfg.assertions;
      checks = [
        (check "${name}: NixOS module assertions must pass" (failedNixosAssertions == [ ]))
        (check "${name}: evaluated target system must be aarch64-linux" (targetSystem == "aarch64-linux"))
        (check "${name}: server role must be enabled" server.enable)
        (check "${name}: server must run as korri-server" (server.user == "korri-server"))
        (check "${name}: server must run as a system service" (server.serviceMode == "system"))
        (check "${name}: client role must be enabled" (cfg.services.korri.client.enable or false))
        (check "${name}: kiosk surface must be enabled" compositor.kiosk.enable)
        (check "${name}: inputd must be enabled" input.inputd.enable)
        (check "${name}: kiosk compositor must run as root" (compositor.user == "root"))
        (check "${name}: kiosk compositor must not create root user" (compositor.createUser == false))
        (check "${name}: kiosk compositor must use /storage home" (compositor.home == "/storage"))
        (check "${name}: kiosk compositor must keep cache under /storage" (
          compositorEnv.XDG_CACHE_HOME or null == "/storage/.cache"
        ))
        (check "${name}: kiosk compositor must use the root runtime dir" (
          compositor.runtimeDir == "/run/user/0"
        ))
        (check "${name}: kiosk compositor must use the root session bus address" (
          compositor.sessionBus.address == "unix:path=/run/user/0/bus"
        ))
        (check "${name}: kiosk compositor must use the existing session bus" (
          compositor.sessionBus.mode == "existing"
        ))
        (check "${name}: kiosk compositor must wait for main-space session bus" (
          builtins.elem "main-space-session-dbus.service" compositor.sessionBus.services
        ))
        (check "${name}: normalized input provider must be InputPlumber" (
          input.provider.name == "inputplumber"
        ))
        (check "${name}: InputPlumber provider service must be ordered before compositor" (
          builtins.elem "inputplumber.service" input.provider.services
        ))
        (check "${name}: InputPlumber package override must be active" (
          lib.hasInfix "inputplumber" (toString cfg.services.inputplumber.package)
        ))
        (check "${name}: inputplumber service must see package data dirs" (
          lib.hasInfix "/share" (inputplumberService.environment.XDG_DATA_DIRS or "")
          && lib.hasInfix "/run/current-system/sw/share" (inputplumberService.environment.XDG_DATA_DIRS or "")
        ))
        (check "${name}: guest udevd must run under nspawn read-only sysfs" (
          (udevdService.unitConfig.ConditionPathIsReadWrite or null) == ""
        ))
        (check "${name}: raw SM8550 gamepad hider must wait for InputPlumber" (
          builtins.elem "inputplumber.service" (rawGamepadHideService.after or [ ])
          && lib.hasInfix "Microsoft X-Box 360 pad" (rawGamepadHideService.script or "")
          && lib.hasInfix "AYN Odin2 Gamepad" (rawGamepadHideService.script or "")
        ))
        (check "${name}: raw SM8550 gamepad hider must run before Korri input consumers" (
          builtins.elem "korri-inputd.service" (rawGamepadHideService.before or [ ])
          && builtins.elem "korri-compositor.service" (rawGamepadHideService.before or [ ])
        ))
        (check "${name}: compositor must use the SM8550-validated Gamescope version" (
          lib.versionAtLeast (lib.getVersion compositor.gamescope.package) "3.16.20"
        ))
        (check "${name}: compositor must not use the generic 3.16.17 Gamescope" (
          !lib.hasInfix "gamescope-3.16.17" (toString compositor.gamescope.package)
        ))
        (check "${name}: compositor PATH must include the selected Gamescope package" (
          builtins.elem compositor.gamescope.package compositor.path
        ))
        (check "${name}: compositor PATH must include cemu substrate package" (
          lib.hasInfix "cemu" systemPackageText
          || lib.hasInfix "cemu" (lib.concatStringsSep "\n" (map toString compositor.path))
        ))
        (check "${name}: compositor PATH must include Korri Moonlight substrate package" (
          lib.hasInfix "moonlight-embedded-korri" systemPackageText
          || lib.hasInfix "moonlight-embedded-korri" (lib.concatStringsSep "\n" (map toString compositor.path))
        ))
        (check "${name}: Moonlight command must use Korri Moonlight" (
          lib.hasInfix "moonlight-embedded-korri" (compositor.environment.KORRI_MOONLIGHT_COMMAND or "")
          && lib.hasSuffix "/bin/moonlight" (compositor.environment.KORRI_MOONLIGHT_COMMAND or "")
        ))
        (check "${name}: Moonlight must use the controller mapping database" (
          lib.hasInfix "gamecontrollerdb.txt" (compositor.environment.KORRI_MOONLIGHT_MAPPING_FILE or "")
        ))
        (check "${name}: Moonlight must use the SM8550 v4l2m2m platform" (
          compositorEnv.KORRI_MOONLIGHT_PLATFORM or null == "v4l2m2m"
        ))
        (check "${name}: Moonlight foreground launches must require normalized InputPlumber input" (
          compositorEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null == "1"
        ))

        # Kiosk renderer-ownership wiring: sessiond owns Electrobun on
        # every kiosk image. Its unit env must carry the kiosk-renderer
        # identity (HOME, XDG_*, KORRI_KIOSK, inputd URLs) so the
        # renderer inherits them when sessiond spawns it. Its PATH must
        # include the client package so korri-desktop-device resolves.
        # Its ordering must wait for the compositor's wayland socket
        # and the inputd bridge before enterIdle fires.
        (check "${name}: sessiond unit must carry HOME from the compositor's home dir" (
          sessiondEnv.HOME or null == compositor.home
        ))
        (check "${name}: sessiond unit must carry XDG_STATE_HOME from compositor.stateHome" (
          sessiondEnv.XDG_STATE_HOME or null == compositor.stateHome
        ))
        (check "${name}: sessiond unit must carry XDG_DATA_HOME from compositor.dataHome" (
          sessiondEnv.XDG_DATA_HOME or null == compositor.dataHome
        ))
        (check "${name}: sessiond unit must carry XDG_CONFIG_HOME from compositor.configHome" (
          sessiondEnv.XDG_CONFIG_HOME or null == compositor.configHome
        ))
        (check "${name}: sessiond unit must mark the kiosk renderer with KORRI_KIOSK=1" (
          sessiondEnv.KORRI_KIOSK or null == "1"
        ))
        (check "${name}: sessiond unit must carry KORRI_DESKTOP_INPUTD_URL for the renderer" (
          (sessiondEnv.KORRI_DESKTOP_INPUTD_URL or "")
          == "ws://127.0.0.1:${toString input.inputd.port}"
        ))
        (check "${name}: sessiond unit must carry KORRI_NATIVE_BRIDGE_URL for the renderer" (
          (sessiondEnv.KORRI_NATIVE_BRIDGE_URL or "")
          == "ws://127.0.0.1:${toString input.inputd.port}"
        ))
        (check "${name}: sessiond unit must carry KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER for inputplumber hosts" (
          sessiondEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null == "1"
        ))
        (check "${name}: sessiond PATH must include the client package so korri-desktop-device resolves" (
          builtins.elem cfg.services.korri.client.package sessiondPath
        ))
        (check "${name}: sessiond must start after korri-compositor.service" (
          builtins.elem "korri-compositor.service" sessiondAfter
        ))
        (check "${name}: sessiond must start after korri-inputd.service" (
          builtins.elem "korri-inputd.service" sessiondAfter
        ))
        (check "${name}: sessiond must want korri-compositor.service (soft dep)" (
          builtins.elem "korri-compositor.service" sessiondWants
        ))
        (check "${name}: sessiond must require korri-inputd.service (hard dep)" (
          builtins.elem "korri-inputd.service" sessiondRequires
        ))
        (check "${name}: compositor must use Wayland SDL video" (
          compositorEnv.SDL_VIDEODRIVER or null == "wayland"
        ))
        (check "${name}: compositor must not install the retired no-portal launcher seed" (
          compositorService.preStart or "" == ""
        ))
        # Kiosk RetroArch closure-shape: exactly one core (libretro-fake-08).
        # Adding cores here grows every kiosk image's closure for every user;
        # new libretro cores belong in their own packages with their own
        # opt-in, not appended to nix/images/kiosk.nix's wrapper list.
        (check "${name}: compositor PATH must include exactly one retroarch-bare wrapper" (
          builtins.length (findRetroarchWrappers compositor.path) == 1
        ))
        (check "${name}: kiosk RetroArch closure must contain exactly one libretro core" (
          let
            wrappers = findRetroarchWrappers compositor.path;
          in
          wrappers != [ ] && builtins.length (builtins.head wrappers).passthru.cores == 1
        ))
        (check "${name}: kiosk RetroArch's single libretro core must be fake08" (
          let
            wrappers = findRetroarchWrappers compositor.path;
            cores = if wrappers == [ ] then [ ] else (builtins.head wrappers).passthru.cores;
          in
          cores != [ ] && ((builtins.head cores).core or null) == "fake08"
        ))
      ];
    in
    checks;

  byCompatibleResult = builtins.tryEval byCompatibleSystem.config.system.build.toplevel.drvPath;

  checks = [
    (check "Thor RockNix kiosk configuration must be exposed" (
      configurations ? korri-rocknix-kiosk-thor
    ))
    (check "Sobo RockNix kiosk configuration must be exposed" (
      configurations ? korri-rocknix-kiosk-odin2portal
    ))
    (check "by-compatible RockNix kiosk configuration must be exposed" (
      configurations ? korri-rocknix-kiosk-by-compatible
    ))
    (check "Thor target system package alias must be exposed" (
      targetPackages ? korri-rocknix-kiosk-system-thor
    ))
    (check "Sobo target system package alias must be exposed" (
      targetPackages ? korri-rocknix-kiosk-system-odin2portal
    ))
    (check "Thor host rootfs package alias must be exposed" (hostPackages ? korri-rocknix-rootfs-thor))
    (check "Sobo host rootfs package alias must be exposed" (
      hostPackages ? korri-rocknix-rootfs-odin2portal
    ))
    (check "Thor target system package alias must be a derivation" (
      (targetPackages.korri-rocknix-kiosk-system-thor or null).drvPath or null != null
    ))
    (check "Sobo target system package alias must be a derivation" (
      (targetPackages.korri-rocknix-kiosk-system-odin2portal or null).drvPath or null != null
    ))
    (check "Thor host rootfs package alias must be a derivation" (
      (hostPackages.korri-rocknix-rootfs-thor or null).drvPath or null != null
    ))
    (check "Sobo host rootfs package alias must be a derivation" (
      (hostPackages.korri-rocknix-rootfs-odin2portal or null).drvPath or null != null
    ))
    (check "by-compatible profile selection must stay impure off-device" (!byCompatibleResult.success))
    (check "generic image modules must stay free of RockNix hardware facts" (
      builtins.all (file: !(sourceContainsHardwareFact file)) hardwareFactSourceFiles
    ))
  ]
  ++ (checkSystem "Thor" thorSystem)
  ++ (checkSystem "Sobo" soboSystem);
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri RockNix SM8550 config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rocknix-sm8550-config-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri RockNix SM8550 config invariants passed.
    EOF
  ''
