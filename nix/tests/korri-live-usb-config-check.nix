{ pkgs, liveUsbSystem }:

let
  lib = pkgs.lib;
  cfg = liveUsbSystem.config;
  kioskEnv = cfg.systemd.services."korri-kiosk".environment or { };
  inputdEnv = cfg.systemd.services."korri-inputd".environment or { };
  inputplumber = cfg.systemd.services.inputplumber or { };
  persistence = cfg.systemd.services."korri-live-usb-persistence";
  greetd = cfg.systemd.services.greetd;
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "live USB ISO must be USB bootable" cfg.isoImage.makeUsbBootable)
    (check "live USB ISO must be EFI bootable" cfg.isoImage.makeEfiBootable)
    (check "live USB image filename should be Korri-specific" (
      lib.hasInfix "korri-kiosk" cfg.image.fileName
    ))
    (check "korri-live-usb-persistence.service must exist" (
      cfg.systemd.services ? "korri-live-usb-persistence"
    ))
    (check "live USB kiosk user must be korri" (cfg.services.korri.kiosk.user == "korri"))
    (check "live USB kiosk user must have an interactive debug shell" (
      cfg.users.users.${cfg.services.korri.kiosk.user}.shell == pkgs.bashInteractive
    ))
    (check "live USB must use greetd auto-session" cfg.services.greetd.enable)
    (check "greetd initial session must run as korri" (
      cfg.services.greetd.settings.initial_session.user == "korri"
    ))
    (check "greetd must require persistence before login" (
      builtins.elem "korri-live-usb-persistence.service" (greetd.requires or [ ])
    ))
    (check "korri-kiosk.service must not be directly wanted on live USB" (
      cfg.systemd.services."korri-kiosk".wantedBy == [ ]
    ))
    (check "korri-kiosk.service must require persistence before startup" (
      builtins.elem "korri-live-usb-persistence.service" (
        cfg.systemd.services."korri-kiosk".requires or [ ]
      )
    ))
    (check "korri-kiosk.service must start after persistence" (
      builtins.elem "korri-live-usb-persistence.service" (cfg.systemd.services."korri-kiosk".after or [ ])
    ))
    (check "persistence resolver must run before korri-kiosk.service" (
      builtins.elem "korri-kiosk.service" (persistence.before or [ ])
    ))
    (check "live USB defaults to the Product artifact" (
      cfg.services.korri.liveUsbPersistence.artifact == "product"
    ))
    (check "Product live USB must use allowlisted persistence" (
      cfg.services.korri.liveUsbPersistence.scope == "product-allowlist"
    ))
    (check "Product kiosk HOME must stay ephemeral" (
      cfg.services.korri.kiosk.home == "/home/${cfg.services.korri.kiosk.user}"
    ))
    (check "Product config home must stay outside the persistence root" (
      cfg.services.korri.kiosk.configHome == "/home/${cfg.services.korri.kiosk.user}/.config"
    ))
    (check "Product allowlist must include Korri config directory for atomic config writes" (
      builtins.any (entry:
        entry.kind == "directory"
        && entry.target == "/home/${cfg.services.korri.kiosk.user}/.config/korri"
      ) cfg.services.korri.liveUsbPersistence.productAllowlist
    ))
    (check "Product allowlist must include Moonlight client state" (
      builtins.any (entry:
        entry.kind == "directory"
        && entry.target == "/home/${cfg.services.korri.kiosk.user}/.cache/moonlight"
      ) cfg.services.korri.liveUsbPersistence.productAllowlist
    ))
    (check "Moonlight state must point at Product runtime cache path" (
      kioskEnv.KORRI_MOONLIGHT_STATE_HOME or null
      == "/home/${cfg.services.korri.kiosk.user}/.cache/moonlight"
    ))
    (check "live USB must use InputPlumber as normalized input provider" (
      cfg.services.korri.kiosk.input.provider.name == "inputplumber"
    ))
    (check "live USB must start inputplumber before inputd" (
      builtins.elem "inputplumber.service" (cfg.systemd.services."korri-inputd".after or [ ])
    ))
    (check "live USB inputd must require the InputPlumber virtual gamepad" (
      inputdEnv.KORRI_INPUTD_REQUIRE_INPUTPLUMBER_GAMEPAD or null == "1"
    ))
    (check "live USB Moonlight launches must require InputPlumber input" (
      kioskEnv.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER or null == "1"
    ))
    (check "live USB Moonlight must use a generic mapping DB for the virtual controller" (
      lib.hasSuffix "share/moonlight/gamecontrollerdb.txt" (kioskEnv.KORRI_MOONLIGHT_MAPPING_FILE or "")
    ))
    (check "inputplumber service must see its package data root" (
      lib.hasInfix "inputplumber" (inputplumber.environment.XDG_DATA_DIRS or "")
    ))
    (check "live USB persistence root must be exported to the kiosk" (
      kioskEnv.KORRI_LIVE_USB_PERSISTENCE_ROOT or null == cfg.services.korri.liveUsbPersistence.root
    ))
    (check "live USB artifact marker must be exported to the kiosk" (
      kioskEnv.KORRI_LIVE_USB_ARTIFACT or null == "product"
    ))
    (check "live USB artifact marker must be exported to the resolver" (
      persistence.environment.KORRI_LIVE_USB_ARTIFACT or null == "product"
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
    (check "Sway config must disable borders" (
      lib.hasInfix "default_border none" (builtins.readFile cfg.services.korri.kiosk.sway.configFile)
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
