{ pkgs, liveUsbSystem }:

let
  lib = pkgs.lib;
  cfg = liveUsbSystem.config;
  kioskEnv = cfg.systemd.services."korri-kiosk".environment or { };
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
    (check "Korri kiosk HOME must be rooted in live USB persistence" (
      cfg.services.korri.kiosk.home == "${cfg.services.korri.liveUsbPersistence.root}/home"
    ))
    (check "Korri config home must be rooted in live USB persistence" (
      cfg.services.korri.kiosk.configHome == "${cfg.services.korri.liveUsbPersistence.root}/home/.config"
    ))
    (check "Moonlight state must be rooted in live USB persistence" (
      kioskEnv.KORRI_MOONLIGHT_STATE_HOME or null
      == "${cfg.services.korri.liveUsbPersistence.root}/home/.cache/moonlight"
    ))
    (check "live USB persistence root must be exported to the kiosk" (
      kioskEnv.KORRI_LIVE_USB_PERSISTENCE_ROOT or null == cfg.services.korri.liveUsbPersistence.root
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
