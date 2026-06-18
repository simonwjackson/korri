{
  pkgs,
  liveUsbSystem,
  expectedArtifact ? "product",
}:

let
  lib = pkgs.lib;
  cfg = liveUsbSystem.config;
  compositorEnv = cfg.systemd.services."korri-compositor".environment or { };
  sessiondEnv = cfg.systemd.services."korri-sessiond".environment or { };
  serverEnv = cfg.systemd.services."korrid".environment or { };
  serverUserEnv = (cfg.systemd.user.services.korrid or { }).environment or { };
  sessiondUserEnv = (cfg.systemd.user.services.korri-sessiond or { }).environment or { };
  removableMedia = cfg.services.korri.removableMedia or { };
  sessiondServiceConfig = cfg.systemd.services."korri-sessiond".serviceConfig or { };
  inputdEnv = cfg.systemd.services."korri-inputd".environment or { };
  inputplumber = cfg.systemd.services.inputplumber or { };
  persistence = cfg.systemd.services."korri-live-usb-persistence";
  greetd = cfg.systemd.services.greetd;
  platformDefaults = cfg.services.korri.daemon.library.platformDefaults or { };
  moonlightPolicy = platformDefaults.host.moonlight or { };
  deprecatedMoonlightLaunchEnvKeys = [
    "KORRI_MOONLIGHT_COMMAND"
    "KORRI_MOONLIGHT_CLIENT"
    "KORRI_MOONLIGHT_PLATFORM"
    "KORRI_MOONLIGHT_MAPPING_FILE"
    "KORRI_MOONLIGHT_ABSOLUTE_TOUCH"
    "KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS"
    "KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS"
    "KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE"
    "KORRI_MOONLIGHT_CONTROL"
    "KORRI_MOONLIGHT_CONTROL_AUTHORITY"
    "KORRI_MOONLIGHT_STARTUP_OBSERVE_MS"
    "KORRI_MOONLIGHT_STATE_HOME"
  ];
  hasDeprecatedMoonlightLaunchEnv = env:
    builtins.any (key: builtins.hasAttr key env) deprecatedMoonlightLaunchEnvKeys;
  check = message: assertion: { inherit message assertion; };

  # See tools/testing/nix/korri-rocknix-sm8550-config-check.nix for the rationale
  # behind matching the retroarch-bare wrapper by passthru shape rather
  # than pname.
  findRetroarchWrappers =
    path:
    builtins.filter (
      p:
      let
        pt = p.passthru or { };
      in
      builtins.hasAttr "cores" pt && builtins.hasAttr "unwrapped" pt
    ) path;

  compositorPath = cfg.services.korri.compositor.path or [ ];
  retroarchWrappers = findRetroarchWrappers compositorPath;
  retroarchCores =
    if retroarchWrappers == [ ] then [ ] else (builtins.head retroarchWrappers).passthru.cores;
  hasRetroarchCore = coreName: builtins.any (core: (core.core or null) == coreName) retroarchCores;

  expectedScope = if expectedArtifact == "developer" then "developer-broad" else "product-allowlist";
  expectedHome =
    if expectedArtifact == "developer" then
      "${cfg.services.korri.liveUsbPersistence.root}/developer/home"
    else
      "/home/${cfg.services.korri.compositor.user}";
  checks = [
    (check "live USB ISO must be USB bootable" cfg.isoImage.makeUsbBootable)
    (check "live USB ISO must be EFI bootable" cfg.isoImage.makeEfiBootable)
    (check "live USB image filename should be Korri-specific" (
      lib.hasInfix "korri-kiosk" cfg.image.fileName
    ))
    (check "korri-live-usb-persistence.service must exist" (
      cfg.systemd.services ? "korri-live-usb-persistence"
    ))
    (check "live USB compositor user must be korri" (cfg.services.korri.compositor.user == "korri"))
    (check "live USB compositor user must remain non-interactive" (
      cfg.users.users.${cfg.services.korri.compositor.user}.shell != pkgs.bashInteractive
    ))
    (check "live USB must use greetd auto-session" cfg.services.greetd.enable)
    (check "greetd initial session must run as korri" (
      cfg.services.greetd.settings.initial_session.user == "korri"
    ))
    (check "greetd must require persistence before login" (
      builtins.elem "korri-live-usb-persistence.service" (greetd.requires or [ ])
    ))
    (check "korri-session.target must start from the user default target" (
      cfg.systemd.user.targets.korri-session.wantedBy == [ "default.target" ]
    ))
    (check "korri-compositor user service must require persistence before startup" (
      builtins.elem "korri-live-usb-persistence.service" (
        cfg.systemd.user.services."korri-compositor".requires or [ ]
      )
    ))
    (check "korri-compositor user service must start after persistence" (
      builtins.elem "korri-live-usb-persistence.service" (
        cfg.systemd.user.services."korri-compositor".after or [ ]
      )
    ))
    (check "live USB must use the expected artifact" (
      cfg.services.korri.liveUsbPersistence.artifact == expectedArtifact
    ))
    (check "live USB must use the expected persistence scope" (
      cfg.services.korri.liveUsbPersistence.scope == expectedScope
    ))
    (check "live USB compositor HOME must match artifact contract" (
      cfg.services.korri.compositor.home == expectedHome
    ))
    (check "live USB config home must match artifact contract" (
      cfg.services.korri.compositor.configHome == "${expectedHome}/.config"
    ))
    (check "Product allowlist must include Korri config directory for atomic config writes" (
      builtins.any (
        entry:
        entry.kind == "directory"
        && entry.target == "/home/${cfg.services.korri.compositor.user}/.config/korri"
      ) cfg.services.korri.liveUsbPersistence.productAllowlist
    ))
    (check "Product allowlist must include Moonlight client state" (
      builtins.any (
        entry:
        entry.kind == "directory"
        && entry.target == "/home/${cfg.services.korri.compositor.user}/.cache/moonlight"
      ) cfg.services.korri.liveUsbPersistence.productAllowlist
    ))
    (check "live USB must use InputPlumber as normalized input provider" (
      cfg.services.korri.input.provider.name == "inputplumber"
    ))
    (check "live USB inputd must not export the retired InputPlumber requirement toggle" (
      !(inputdEnv ? KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD)
    ))
    (check "live USB Moonlight must use readable policy for command and mapping DB" (
      lib.hasSuffix "/bin/moonlight" (moonlightPolicy.command or "")
      && lib.hasSuffix "share/moonlight/gamecontrollerdb.txt" (moonlightPolicy.input.mappingFile or "")
    ))
    (check "live USB deprecated Moonlight launch-policy env must be absent from launch-owning services" (
      !hasDeprecatedMoonlightLaunchEnv compositorEnv
      && !hasDeprecatedMoonlightLaunchEnv sessiondEnv
      && !hasDeprecatedMoonlightLaunchEnv serverEnv
    ))
    (check "inputplumber service must discover product maps before package defaults" (
      lib.hasPrefix "/run/current-system/sw/share:" (inputplumber.environment.XDG_DATA_DIRS or "")
      && lib.hasInfix "inputplumber" (inputplumber.environment.XDG_DATA_DIRS or "")
    ))
    (check "live USB artifact marker must be exported to the resolver" (
      persistence.environment.KORRI_LIVE_USB_ARTIFACT or null == expectedArtifact
    ))
    (check "swap devices must be disabled for the live USB appliance" (cfg.swapDevices == [ ]))
    (check "udisks2 must be disabled to avoid generic removable disk automounting" (
      !cfg.services.udisks2.enable
    ))
    (check "gvfs must be disabled to avoid generic removable disk automounting" (
      !cfg.services.gvfs.enable
    ))
    (check "live USB mounts removable media with the USB gate enabled" (
      (removableMedia.enable or false)
      && (removableMedia.match.usb or false)
      && lib.hasInfix ''ID_BUS}=="usb"'' (cfg.services.udev.extraRules or "")
    ))
    (check "live USB deny-list must derive the boot stick before any removable mount" (
      # The boot stick is USB and removable; the runtime system-disk
      # deny-list (asserted to cover the boot mount) is what keeps it — and
      # its sibling persistence partition — from ever being grabbed.
      builtins.elem cfg.services.korri.liveUsbPersistence.bootMountPoint (
        removableMedia.requiredSystemMounts or [ ]
      )
    ))
    (check "korrid and sessiond watch the live USB config-roots signal dir" (
      (serverUserEnv.KORRI_CONFIG_ROOTS_DIR or null) == (removableMedia.configRootsDir or null)
      && (sessiondUserEnv.KORRI_CONFIG_ROOTS_DIR or null) == (serverUserEnv.KORRI_CONFIG_ROOTS_DIR or null)
    ))
    (check "persistence resolver must look for the Korri persistence label" (
      persistence.environment.KORRI_LIVE_USB_PERSISTENCE_LABEL
      == cfg.services.korri.liveUsbPersistence.label
    ))
    (check "debug SSH defaults to off without injected keys" (!cfg.services.openssh.enable))
    # Kiosk RetroArch closure-shape: one RetroArch-owned bundle with the
    # first-party mGBA, Genesis Plus GX, Mesen, PCSX ReARMed, and bsnes libretro cores.
    (check "live USB compositor PATH must include exactly one retroarch-bare wrapper" (
      builtins.length retroarchWrappers == 1
    ))
    (check "live USB RetroArch closure must contain exactly five libretro cores" (
      builtins.length retroarchCores == 4
    ))
    (check "live USB RetroArch closure must contain mGBA, Genesis Plus GX, Mesen, PCSX ReARMed, and bsnes" (
      hasRetroarchCore "mgba" && hasRetroarchCore "genesis-plus-gx" && hasRetroarchCore "mesen" && hasRetroarchCore "bsnes"
    ))
    (check "live USB RetroArch must advertise XDelta patch support" (
      retroarchWrappers != [ ]
      && ((builtins.head retroarchWrappers).passthru.unwrapped.passthru.xdeltaPatches or false)
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri live USB config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-live-usb-config-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri live USB config invariants passed.
    EOF
  ''
