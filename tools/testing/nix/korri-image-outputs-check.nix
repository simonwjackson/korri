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
    serverEnabled = eval.config.services.korri.daemon.enable or false;
    clientEnabled = eval.config.services.korri.client.enable or false;
    compositorEnabled = eval.config.services.korri.compositor.enable or false;
    kioskEnabled = eval.config.services.korri.compositor.kiosk.enable or false;
    inputdEnabled = eval.config.services.korri.input.inputd.enable or false;
    serverHost = eval.config.services.korri.daemon.host or null;
    serverServiceMode = eval.config.services.korri.daemon.serviceMode or null;
    firewallTcpPorts = eval.config.networking.firewall.allowedTCPPorts or [ ];
    firewallUdpPorts = eval.config.networking.firewall.allowedUDPPorts or [ ];
    avahiEnabled = eval.config.services.avahi.enable or false;
    avahiPublishEnabled = eval.config.services.avahi.publish.enable or false;
    kioskUnitExists = eval.config.systemd.services ? "korri-compositor";
    inputProviderEnabled = eval.config.services.korri.input.provider.enable or false;
    inputProviderName = eval.config.services.korri.input.provider.name or null;
    seatdEnabled = eval.config.services.seatd.enable or false;
    inputplumberDataDirs = eval.config.systemd.services.inputplumber.environment.XDG_DATA_DIRS or "";
    kioskAfter = eval.config.systemd.services."korri-compositor".after or [ ];
    kioskUser = eval.config.services.korri.compositor.user or null;
    kioskUserExtraGroups =
      let
        user = eval.config.services.korri.compositor.user or null;
      in
      if user == null then [ ] else eval.config.users.users.${user}.extraGroups or [ ];
    kioskEnvironment = eval.config.systemd.services."korri-compositor".environment or { };
    sessiondEnvironment = eval.config.systemd.services."korri-sessiond".environment or { };
    serverPlatformDefaults = eval.config.services.korri.daemon.library.platformDefaults or { };
    kioskPath = map toString (eval.config.systemd.services."korri-compositor".path or [ ]);
    clientMainProgram = eval.config.services.korri.client.package.meta.mainProgram or null;
    steamEnabled = eval.config.programs.steam.enable or false;
    systemPackages = map toString (eval.config.environment.systemPackages or [ ]);
    swayConfig =
      if eval.config.services.korri.compositor.enable or false then
        builtins.readFile eval.config.services.korri.compositor.sway.configFile
      else
        "";
  };

  headless = imageLib.mkHeadlessSystem {
    platformModules = [ x86Platform ];
  };

  kiosk = imageLib.mkKioskSystem {
    platformModules = [ x86Platform ];
  };

  desktopLab = imageLib.mkDesktopLabSystem {
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
  desktopLabSummary = summarize desktopLab;
  liveUsbSummary = summarize liveUsb;
  liveUsbDeveloperSummary = summarize liveUsbDeveloper;
  kioskWithExternalPlatformSummary = summarize kioskWithExternalPlatform;
  kioskWithPlatformManagedUserSummary = summarize kioskWithPlatformManagedUser;
  kioskWithoutPlatformSummary = summarize kioskWithoutPlatform;

  sourceContainsHardwareFact =
    file:
    builtins.match ".*(SM8550|AYN|Odin|DSI-1|DSI-2|UCM|RockNix).*" (builtins.readFile file) != null;

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

  retroarchCoresFor =
    eval:
    let
      path = eval.config.systemd.services."korri-compositor".path or [ ];
      wrappers = findRetroarchWrappers path;
    in
    if wrappers == [ ] then [ ] else (builtins.head wrappers).passthru.cores;
  hasRetroarchCore = coreName: cores: builtins.any (core: (core.core or null) == coreName) cores;

  checks = [
    (check "headless system package must be exposed" (packages ? korri-headless-system))
    (check "kiosk system package must be exposed" (packages ? korri-kiosk-system))
    (check "desktop lab system package must be exposed" (packages ? korri-desktop-lab-system))
    (check "headless system package must be a derivation" (
      (packages.korri-headless-system or null).drvPath or null != null
    ))
    (check "kiosk system package must be a derivation" (
      (packages.korri-kiosk-system or null).drvPath or null != null
    ))
    (check "desktop lab system package must be a derivation" (
      (packages.korri-desktop-lab-system or null).drvPath or null != null
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
    (check "Product live USB must use InputPlumber provider" (
      liveUsbSummary.inputProviderName == "inputplumber"
    ))
    (check "Product live USB must enable seatd on x86" liveUsbSummary.seatdEnabled)
    (check "Product live USB client package must be x86 kiosk desktop" (
      liveUsbSummary.clientMainProgram == "korri-desktop-x86-kiosk"
    ))
    (check "Product live USB sessiond must export broker-only inputd URL" (
      liveUsbSummary.sessiondEnvironment.KORRI_DESKTOP_INPUTD_URL or null == "ws://127.0.0.1:3002"
    ))
    (check "Product live USB must use moonlight-embedded command from readable policy" (
      lib.hasInfix "moonlight-embedded" (liveUsbSummary.serverPlatformDefaults.host.moonlight.command or "")
      && lib.hasInfix "/bin/moonlight" (liveUsbSummary.serverPlatformDefaults.host.moonlight.command or "")
    ))
    (check "Product live USB must use readable Moonlight mapping policy" (
      lib.hasSuffix "share/moonlight/gamecontrollerdb.txt" (
        liveUsbSummary.serverPlatformDefaults.host.moonlight.input.mappingFile or ""
      )
    ))
    (check "Product live USB must not carry retired Moonlight launch env" (
      !(liveUsbSummary.kioskEnvironment ? KORRI_MOONLIGHT_COMMAND)
      && !(liveUsbSummary.kioskEnvironment ? KORRI_MOONLIGHT_CLIENT)
      && !(liveUsbSummary.kioskEnvironment ? KORRI_MOONLIGHT_STARTUP_OBSERVE_MS)
      && !(liveUsbSummary.kioskEnvironment ? KORRI_MOONLIGHT_MAPPING_FILE)
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
    (check "desktop lab NixOS assertions must pass" (assertionsPassed desktopLab))
    (check "desktop lab must enable the compositor substrate" desktopLabSummary.compositorEnabled)
    (check "desktop lab must keep the local Korri GUI off" (!desktopLabSummary.kioskEnabled))
    (check "desktop lab must not enable the Korri client" (!desktopLabSummary.clientEnabled))
    (check "desktop lab must not enable the Korri daemon" (!desktopLabSummary.serverEnabled))
    (check "desktop lab must not enable inputd" (!desktopLabSummary.inputdEnabled))
    (check "desktop lab must create the compositor unit" desktopLabSummary.kioskUnitExists)
    (check "desktop lab must enable seatd for the Sway session" desktopLabSummary.seatdEnabled)
    (check "desktop lab must run as the lab user" (desktopLabSummary.kioskUser == "korri-lab"))
    (check "desktop lab user must have device access groups" (
      builtins.all (group: builtins.elem group desktopLabSummary.kioskUserExtraGroups) [
        "input"
        "render"
        "seat"
        "video"
      ]
    ))
    (check "desktop lab must enable NixOS Steam support on x86" desktopLabSummary.steamEnabled)
    (check "desktop lab system packages must include Steam and compositor launch helpers" (
      let
        packagesText = lib.concatStringsSep "\n" desktopLabSummary.systemPackages;
      in
      lib.hasInfix "steam" packagesText
      && lib.hasInfix "korri-compositor-exec" packagesText
      && lib.hasInfix "korri-desktop-lab-start-steam" packagesText
    ))
    (check "desktop lab Sway config must not launch the Korri kiosk client" (
      !lib.hasInfix "korri-compositor-kiosk-client" desktopLabSummary.swayConfig
    ))
    (check "desktop lab Sway config must keep Xwayland available for Steam" (
      lib.hasInfix "xwayland enable" desktopLabSummary.swayConfig
    ))
    (check "kiosk NixOS assertions must pass" (assertionsPassed kiosk))
    (check "kiosk composition must enable server" kioskSummary.serverEnabled)
    # Federation v1 (R14 / R16) makes every korrid LAN-visible by
    # default. The kiosk image inherits these defaults from headless.nix.
    (check "kiosk server must listen on all interfaces for federation" (
      kioskSummary.serverHost == "0.0.0.0"
    ))
    (check "kiosk server must run as a system service" (kioskSummary.serverServiceMode == "system"))
    (check "kiosk composition must open the federation TCP port (3001)" (
      builtins.elem 3001 kioskSummary.firewallTcpPorts
    ))
    (check "kiosk composition must enable avahi-daemon for federation mDNS" (
      kioskSummary.avahiEnabled && kioskSummary.avahiPublishEnabled
    ))
    (check "kiosk composition must enable kiosk" kioskSummary.kioskEnabled)
    (check "kiosk composition must enable client" kioskSummary.clientEnabled)
    (check "kiosk composition must enable inputd" kioskSummary.inputdEnabled)
    (check "kiosk composition must enable input provider" kioskSummary.inputProviderEnabled)
    (check "kiosk composition must use InputPlumber provider" (
      kioskSummary.inputProviderName == "inputplumber"
    ))
    (check "kiosk composition must enable seatd on x86" kioskSummary.seatdEnabled)
    (check "kiosk composition must expose InputPlumber data dirs" (
      lib.hasInfix "inputplumber" kioskSummary.inputplumberDataDirs
      && lib.hasInfix "/run/current-system/sw/share" kioskSummary.inputplumberDataDirs
    ))
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
    # Kiosk RetroArch closure-shape: the RetroArch plugin owns the bare
    # RetroArch binary wrapper and ships the first-party mGBA, Genesis Plus GX, Mesen, and bsnes
    # libretro cores by default.
    (check "x86 kiosk RetroArch closure must contain exactly four libretro cores" (
      builtins.length (retroarchCoresFor kiosk) == 4
    ))
    (check "x86 kiosk RetroArch closure must contain mGBA, Genesis Plus GX, Mesen, and bsnes" (
      let cores = retroarchCoresFor kiosk; in
      hasRetroarchCore "mgba" cores && hasRetroarchCore "genesis-plus-gx" cores && hasRetroarchCore "mesen" cores && hasRetroarchCore "bsnes" cores
    ))
    (check "Product live USB RetroArch closure must contain exactly four libretro cores" (
      builtins.length (retroarchCoresFor liveUsb) == 4
    ))
    (check "Product live USB RetroArch closure must contain mGBA, Genesis Plus GX, Mesen, and bsnes" (
      let cores = retroarchCoresFor liveUsb; in
      hasRetroarchCore "mgba" cores && hasRetroarchCore "genesis-plus-gx" cores && hasRetroarchCore "mesen" cores && hasRetroarchCore "bsnes" cores
    ))
    (check "Developer live USB RetroArch closure must contain exactly four libretro cores" (
      builtins.length (retroarchCoresFor liveUsbDeveloper) == 4
    ))
    (check "Developer live USB RetroArch closure must contain mGBA, Genesis Plus GX, Mesen, and bsnes" (
      let cores = retroarchCoresFor liveUsbDeveloper; in
      hasRetroarchCore "mgba" cores && hasRetroarchCore "genesis-plus-gx" cores && hasRetroarchCore "mesen" cores && hasRetroarchCore "bsnes" cores
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
