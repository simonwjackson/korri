{
  pkgs,
  liveUsbSystem,
  expectedArtifact ? "product",
}:

let
  lib = pkgs.lib;
  cfg = liveUsbSystem.config;
  compositorEnv = cfg.systemd.services."korri-compositor".environment or { };
  inputdEnv = cfg.systemd.services."korri-inputd".environment or { };
  inputplumber = cfg.systemd.services.inputplumber or { };
  persistence = cfg.systemd.services."korri-live-usb-persistence";
  greetd = cfg.systemd.services.greetd;
  check = message: assertion: { inherit message assertion; };
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
    (check "live USB compositor user must have an interactive debug shell" (
      cfg.users.users.${cfg.services.korri.compositor.user}.shell == pkgs.bashInteractive
    ))
    (check "live USB must use greetd auto-session" cfg.services.greetd.enable)
    (check "greetd initial session must run as korri" (
      cfg.services.greetd.settings.initial_session.user == "korri"
    ))
    (check "greetd must require persistence before login" (
      builtins.elem "korri-live-usb-persistence.service" (greetd.requires or [ ])
    ))
    (check "korri-compositor.service must not be directly wanted on live USB" (
      cfg.systemd.services."korri-compositor".wantedBy == [ ]
    ))
    (check "korri-compositor.service must require persistence before startup" (
      builtins.elem "korri-live-usb-persistence.service" (
        cfg.systemd.services."korri-compositor".requires or [ ]
      )
    ))
    (check "korri-compositor.service must start after persistence" (
      builtins.elem "korri-live-usb-persistence.service" (
        cfg.systemd.services."korri-compositor".after or [ ]
      )
    ))
    (check "persistence resolver must run before korri-compositor.service" (
      builtins.elem "korri-compositor.service" (persistence.before or [ ])
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
    (check "Moonlight state must point at artifact runtime cache path" (
      compositorEnv.KORRI_MOONLIGHT_STATE_HOME or null == "${expectedHome}/.cache/moonlight"
    ))
    (check "live USB must use InputPlumber as normalized input provider" (
      cfg.services.korri.input.provider.name == "inputplumber"
    ))
    (check "live USB must start inputplumber before inputd" (
      builtins.elem "inputplumber.service" (cfg.systemd.services."korri-inputd".after or [ ])
    ))
    (check "live USB inputd must require the InputPlumber virtual gamepad" (
      inputdEnv.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD or null == "1"
    ))
    (check "live USB Moonlight launches must require InputPlumber input" (
      compositorEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null == "1"
    ))
    (check "live USB Moonlight must use a generic mapping DB for the virtual controller" (
      lib.hasSuffix "share/moonlight/gamecontrollerdb.txt" (
        compositorEnv.KORRI_MOONLIGHT_MAPPING_FILE or ""
      )
    ))
    (check "inputplumber service must see its package data root" (
      lib.hasInfix "inputplumber" (inputplumber.environment.XDG_DATA_DIRS or "")
    ))
    (check "live USB persistence root must be exported to the compositor session" (
      compositorEnv.KORRI_LIVE_USB_PERSISTENCE_ROOT or null == cfg.services.korri.liveUsbPersistence.root
    ))
    (check "live USB artifact marker must be exported to the compositor session" (
      compositorEnv.KORRI_LIVE_USB_ARTIFACT or null == expectedArtifact
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
    (check "persistence resolver must look for the Korri persistence label" (
      persistence.environment.KORRI_LIVE_USB_PERSISTENCE_LABEL
      == cfg.services.korri.liveUsbPersistence.label
    ))
    (check "debug SSH defaults to off without injected keys" (!cfg.services.openssh.enable))
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
