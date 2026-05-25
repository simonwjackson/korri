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

  checkSystem =
    name: system:
    let
      cfg = system.config;
      server = cfg.services.korri.server;
      compositor = cfg.services.korri.compositor;
      input = cfg.services.korri.input;
      compositorService = cfg.systemd.services."korri-compositor";
      inputplumberService = cfg.systemd.services.inputplumber;
      compositorEnv = compositorService.environment or { };
      systemPackageNames = map (pkg: pkg.name or "") (cfg.environment.systemPackages or [ ]);
      systemPackageText = lib.concatStringsSep "\n" systemPackageNames;
      failedNixosAssertions = builtins.filter (candidate: !candidate.assertion) cfg.assertions;
      checks = [
        (check "${name}: NixOS module assertions must pass" (failedNixosAssertions == [ ]))
        (check "${name}: server role must be enabled" server.enable)
        (check "${name}: server must run as korri-server" (server.user == "korri-server"))
        (check "${name}: server must run as a system service" (server.serviceMode == "system"))
        (check "${name}: client role must be enabled" (cfg.services.korri.client.enable or false))
        (check "${name}: kiosk surface must be enabled" compositor.kiosk.enable)
        (check "${name}: inputd must be enabled" input.inputd.enable)
        (check "${name}: kiosk compositor must run as root" (compositor.user == "root"))
        (check "${name}: kiosk compositor must not create root user" (compositor.createUser == false))
        (check "${name}: kiosk compositor must use the root runtime dir" (
          compositor.runtimeDir == "/run/user/0"
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
        (check "${name}: compositor PATH must include Moonlight substrate package" (
          lib.hasInfix "moonlight" systemPackageText
          || lib.hasInfix "moonlight" (lib.concatStringsSep "\n" (map toString compositor.path))
        ))
        (check "${name}: Moonlight command must use moonlight" (
          lib.hasInfix "moonlight" (compositor.environment.KORRI_MOONLIGHT_COMMAND or "")
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
        (check "${name}: compositor must use Wayland SDL video" (
          compositorEnv.SDL_VIDEODRIVER or null == "wayland"
        ))
        (check "${name}: compositor must not install the retired no-portal launcher seed" (
          compositorService.preStart or "" == ""
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
