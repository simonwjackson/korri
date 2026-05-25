{
  pkgs,
  packages,
  apps,
  imageLib,
  x86Platform,
  liveUsbConfigCheck,
  liveUsbDeveloperConfigCheck,
  liveUsbVmSmokeCheck,
  hardwareFactSourceFiles,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  failedAssertions = eval: builtins.filter (candidate: !candidate.assertion) eval.config.assertions;
  assertionsPassed = eval: failedAssertions eval == [ ];

  summarize = eval: {
    serverEnabled = eval.config.services.korri.server.enable or false;
    clientEnabled = eval.config.services.korri.client.enable or false;
    kioskEnabled = eval.config.services.korri.compositor.kiosk.enable or false;
    inputdEnabled = eval.config.services.korri.input.inputd.enable or false;
    serverHost = eval.config.services.korri.server.host or null;
    serverServiceMode = eval.config.services.korri.server.serviceMode or null;
    firewallTcpPorts = eval.config.networking.firewall.allowedTCPPorts or [ ];
    firewallUdpPorts = eval.config.networking.firewall.allowedUDPPorts or [ ];
    kioskUnitExists = eval.config.systemd.services ? "korri-compositor";
    inputProviderEnabled = eval.config.services.korri.input.provider.enable or false;
    kioskAfter = eval.config.systemd.services."korri-compositor".after or [ ];
    kioskUser = eval.config.services.korri.compositor.user or null;
    kioskUserExtraGroups =
      let
        user = eval.config.services.korri.compositor.user or null;
      in
      if user == null then [ ] else eval.config.users.users.${user}.extraGroups or [ ];
    kioskEnvironment = eval.config.systemd.services."korri-compositor".environment or { };
    kioskPath = map toString (eval.config.systemd.services."korri-compositor".path or [ ]);
    clientMainProgram = eval.config.services.korri.client.package.meta.mainProgram or null;
  };

  headless = imageLib.mkHeadlessSystem {
    platformModules = [ x86Platform ];
  };

  kiosk = imageLib.mkKioskSystem {
    platformModules = [ x86Platform ];
  };

  liveUsb = imageLib.mkLiveUsbKioskSystem {
    platformModules = [ x86Platform ];
  };

  liveUsbDeveloper = imageLib.mkLiveUsbKioskSystem {
    platformModules = [ x86Platform ];
    modules = [
      {
        services.korri.liveUsbPersistence.artifact = "developer";
      }
    ];
  };

  kioskWithExternalPlatform = imageLib.mkKioskSystem {
    platformModules = [
      x86Platform
      (
        { ... }:
        {
          services.korri.input.provider.services = [ "external-normalized-input.service" ];
        }
      )
    ];
  };

  kioskWithPlatformManagedUser = imageLib.mkKioskSystem {
    platformModules = [
      x86Platform
      (
        { ... }:
        {
          services.korri.compositor = {
            user = "platform-kiosk";
            createUser = false;
          };
          users.users.platform-kiosk = {
            isSystemUser = true;
            group = "platform-kiosk";
          };
          users.groups.platform-kiosk = { };
        }
      )
    ];
  };

  kioskWithoutPlatform = imageLib.mkKioskSystem { };

  headlessSummary = summarize headless;
  kioskSummary = summarize kiosk;
  liveUsbSummary = summarize liveUsb;
  liveUsbDeveloperSummary = summarize liveUsbDeveloper;
  kioskWithExternalPlatformSummary = summarize kioskWithExternalPlatform;
  kioskWithPlatformManagedUserSummary = summarize kioskWithPlatformManagedUser;
  kioskWithoutPlatformSummary = summarize kioskWithoutPlatform;

  sourceContainsHardwareFact =
    file:
    builtins.match ".*(SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix).*" (builtins.readFile file) != null;

  checks = [
    (check "headless system package must be exposed" (packages ? korri-headless-system))
    (check "kiosk system package must be exposed" (packages ? korri-kiosk-system))
    (check "headless system package must be a derivation" (
      (packages.korri-headless-system or null).drvPath or null != null
    ))
    (check "kiosk system package must be a derivation" (
      (packages.korri-kiosk-system or null).drvPath or null != null
    ))
    (check "live USB ISO package must be exposed" (packages ? korri-kiosk-live-iso))
    (check "live USB Developer ISO package must be exposed" (packages ? korri-kiosk-live-developer-iso))
    (check "live USB ISO package must be a derivation" (
      (packages.korri-kiosk-live-iso or null).drvPath or null != null
    ))
    (check "live USB Developer ISO package must be a derivation" (
      (packages.korri-kiosk-live-developer-iso or null).drvPath or null != null
    ))
    (check "live USB Product config check must be a derivation" (
      liveUsbConfigCheck.drvPath or null != null
    ))
    (check "live USB Developer config check must be a derivation" (
      liveUsbDeveloperConfigCheck.drvPath or null != null
    ))
    (check "live USB VM smoke check must be a derivation" (liveUsbVmSmokeCheck.drvPath or null != null))
    (check "live USB VM app must be exposed" (apps ? korri-live-usb-vm))
    (check "live USB QEMU app must be exposed" (apps ? korri-live-usb-qemu))
    (check "live USB QEMU persistence app must be exposed" (apps ? korri-live-usb-qemu-persistence))
    (check "live USB Developer QEMU app must be exposed" (apps ? korri-live-usb-developer-qemu))
    (check "live USB Developer QEMU persistence app must be exposed" (
      apps ? korri-live-usb-developer-qemu-persistence
    ))
    (check "live USB VM app must have an app program" (
      (apps.korri-live-usb-vm.type or null) == "app" && (apps.korri-live-usb-vm.program or null) != null
    ))
    (check "Product live USB NixOS assertions must pass" (assertionsPassed liveUsb))
    (check "Developer live USB NixOS assertions must pass" (assertionsPassed liveUsbDeveloper))
    (check "Product live USB must enable kiosk" liveUsbSummary.kioskEnabled)
    (check "Product live USB must enable client" liveUsbSummary.clientEnabled)
    (check "Product live USB must enable inputd" liveUsbSummary.inputdEnabled)
    (check "Product live USB must enable input provider" liveUsbSummary.inputProviderEnabled)
    (check "Product live USB client package must be x86 kiosk desktop" (
      liveUsbSummary.clientMainProgram == "korri-desktop-x86-kiosk"
    ))
    (check "Product live USB must export broker-only inputd URL" (
      liveUsbSummary.kioskEnvironment.KORRI_DESKTOP_INPUTD_URL or null == "ws://127.0.0.1:3002"
    ))
    (check "Product live USB must use moonlight-embedded command" (
      lib.hasInfix "moonlight-embedded" (liveUsbSummary.kioskEnvironment.KORRI_MOONLIGHT_COMMAND or "")
      && lib.hasInfix "/bin/moonlight" (liveUsbSummary.kioskEnvironment.KORRI_MOONLIGHT_COMMAND or "")
    ))
    (check "Product live USB must mark embedded Moonlight client" (
      liveUsbSummary.kioskEnvironment.KORRI_MOONLIGHT_CLIENT or null == "embedded"
    ))
    (check "Product live USB must keep the startup observe window" (
      liveUsbSummary.kioskEnvironment.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS or null == "750"
    ))
    (check "Product live USB PATH must include moonlight-embedded" (
      lib.hasInfix "moonlight-embedded" (lib.concatStringsSep "\n" liveUsbSummary.kioskPath)
    ))
    (check "Product live USB PATH must not include Moonlight Qt" (
      !lib.hasInfix "moonlight-qt" (lib.concatStringsSep "\n" liveUsbSummary.kioskPath)
    ))
    (check "Product live USB must allow mDNS UDP" (builtins.elem 5353 liveUsbSummary.firewallUdpPorts))
    (check "Product live USB must expose no TCP firewall ports" (
      liveUsbSummary.firewallTcpPorts == [ ]
    ))
    (check "Product live USB ISO must be USB bootable" liveUsb.config.isoImage.makeUsbBootable)
    (check "Product live USB ISO must be EFI bootable" liveUsb.config.isoImage.makeEfiBootable)
    (check "Product live USB image filename must be Korri-specific" (
      lib.hasInfix "korri-kiosk" liveUsb.config.image.fileName
      && !lib.hasInfix "developer" liveUsb.config.image.fileName
    ))
    (check "Product live USB persistence artifact must be product" (
      liveUsb.config.services.korri.liveUsbPersistence.artifact == "product"
    ))
    (check "Product live USB persistence scope must be allowlist" (
      liveUsb.config.services.korri.liveUsbPersistence.scope == "product-allowlist"
    ))
    (check "Product live USB boot menu label must name Product ISO" (
      lib.hasInfix "Product ISO" liveUsb.config.isoImage.appendToMenuLabel
    ))
    (check "Developer live USB image filename must name developer" (
      lib.hasInfix "developer" liveUsbDeveloper.config.image.fileName
    ))
    (check "Developer live USB persistence artifact must be developer" (
      liveUsbDeveloper.config.services.korri.liveUsbPersistence.artifact == "developer"
    ))
    (check "Developer live USB persistence scope must be broad" (
      liveUsbDeveloper.config.services.korri.liveUsbPersistence.scope == "developer-broad"
    ))
    (check "Developer live USB boot menu label must name Developer ISO" (
      lib.hasInfix "Developer ISO" liveUsbDeveloper.config.isoImage.appendToMenuLabel
    ))
    (check "Developer live USB must export artifact marker" (
      liveUsbDeveloperSummary.kioskEnvironment.KORRI_LIVE_USB_ARTIFACT or null == "developer"
    ))
    (check "headless NixOS assertions must pass" (assertionsPassed headless))
    (check "headless composition must enable server" headlessSummary.serverEnabled)
    (check "headless server must run as a system service" (
      headlessSummary.serverServiceMode == "system"
    ))
    (check "headless composition must not enable client" (!headlessSummary.clientEnabled))
    (check "headless composition must not enable kiosk" (!headlessSummary.kioskEnabled))
    (check "headless composition must not enable inputd" (!headlessSummary.inputdEnabled))
    (check "headless composition must not create compositor unit" (!headlessSummary.kioskUnitExists))
    (check "kiosk NixOS assertions must pass" (assertionsPassed kiosk))
    (check "kiosk composition must enable server" kioskSummary.serverEnabled)
    (check "kiosk server must listen locally" (kioskSummary.serverHost == "127.0.0.1"))
    (check "kiosk server must run as a system service" (kioskSummary.serverServiceMode == "system"))
    (check "kiosk composition must expose no TCP firewall ports" (kioskSummary.firewallTcpPorts == [ ]))
    (check "kiosk composition must enable kiosk" kioskSummary.kioskEnabled)
    (check "kiosk composition must enable client" kioskSummary.clientEnabled)
    (check "kiosk composition must enable inputd" kioskSummary.inputdEnabled)
    (check "kiosk composition must enable input provider" kioskSummary.inputProviderEnabled)
    (check "kiosk composition must use the compositor user" (
      kioskSummary.kioskUser == "korri-compositor"
    ))
    (check "kiosk user must have device access groups" (
      builtins.all (group: builtins.elem group kioskSummary.kioskUserExtraGroups) [
        "input"
        "render"
        "seat"
        "video"
      ]
    ))
    (check "external platform provider services must order before compositor" (
      assertionsPassed kioskWithExternalPlatform
      && builtins.elem "external-normalized-input.service" kioskWithExternalPlatformSummary.kioskAfter
    ))
    (check "platform-managed kiosk user must stay under platform ownership" (
      assertionsPassed kioskWithPlatformManagedUser
      && kioskWithPlatformManagedUserSummary.kioskUser == "platform-kiosk"
      && kioskWithPlatformManagedUserSummary.kioskUserExtraGroups == [ ]
    ))
    (check "kiosk without platform must default input provider on" (
      assertionsPassed kioskWithoutPlatform && kioskWithoutPlatformSummary.inputProviderEnabled
    ))
    (check "generic image modules and x86 defaults must not contain RockNix hardware facts" (
      builtins.all (file: !(sourceContainsHardwareFact file)) hardwareFactSourceFiles
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri image outputs check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-image-outputs-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri image output invariants passed.
    EOF
  ''
