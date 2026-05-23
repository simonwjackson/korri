{
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  imageLib = flake.lib.${system}.korriImages;
  x86Platform = flakeRoot + /nix/images/platforms/x86.nix;

  summarize = eval: {
    assertionsPassed = builtins.filter (a: !a.assertion) eval.config.assertions == [ ];
    assertionMessages = map (a: a.message) (builtins.filter (a: !a.assertion) eval.config.assertions);
    serverEnabled = eval.config.services.korri.server.enable or false;
    clientEnabled = eval.config.services.korri.client.enable or false;
    kioskEnabled = eval.config.services.korri.kiosk.enable or false;
    inputdEnabled = eval.config.services.korri.inputd.enable or false;
    serverHost = eval.config.services.korri.server.host or null;
    serverServiceMode = eval.config.services.korri.server.serviceMode or null;
    firewallTcpPorts = eval.config.networking.firewall.allowedTCPPorts or [ ];
    firewallUdpPorts = eval.config.networking.firewall.allowedUDPPorts or [ ];
    kioskUnitExists = eval.config.systemd.services ? "korri-kiosk";
    inputProviderEnabled = eval.config.services.korri.kiosk.input.provider.enable or false;
    kioskAfter = eval.config.systemd.services."korri-kiosk".after or [ ];
    kioskUser = eval.config.services.korri.kiosk.user or null;
    kioskUserExtraGroups =
      let
        user = eval.config.services.korri.kiosk.user or null;
      in
      if user == null then [ ] else eval.config.users.users.${user}.extraGroups or [ ];
    kioskEnvironment = eval.config.systemd.services."korri-kiosk".environment or { };
    kioskPath = map toString (eval.config.systemd.services."korri-kiosk".path or [ ]);
    clientMainProgram = eval.config.services.korri.client.package.meta.mainProgram or null;
    systemName = eval.config.system.name;
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

  kioskWithExternalPlatform = imageLib.mkKioskSystem {
    platformModules = [
      x86Platform
      (
        { ... }:
        {
          services.korri.kiosk.input.provider = {
            name = "external-normalized-input";
            services = [ "external-normalized-input.service" ];
          };
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
          services.korri.kiosk = {
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
in
{
  packageAttrs = builtins.attrNames (flake.packages.${system} or { });
  checkAttrs = builtins.attrNames (flake.checks.${system} or { });
  appAttrs = builtins.attrNames (flake.apps.${system} or { });
  packageDrvPaths = {
    headless = (flake.packages.${system}.korri-headless-system or null).drvPath or null;
    kiosk = (flake.packages.${system}.korri-kiosk-system or null).drvPath or null;
    liveIso = (flake.packages.${system}.korri-kiosk-live-iso or null).drvPath or null;
  };
  checkDrvPaths = {
    liveConfig = (flake.checks.${system}.korri-live-usb-config or null).drvPath or null;
    vmSmoke = (flake.checks.${system}.korri-live-usb-vm-smoke or null).drvPath or null;
  };
  headless = summarize headless;
  kiosk = summarize kiosk;
  liveUsb = (summarize liveUsb) // {
    imageFileName = liveUsb.config.image.fileName or null;
    makeUsbBootable = liveUsb.config.isoImage.makeUsbBootable or false;
    makeEfiBootable = liveUsb.config.isoImage.makeEfiBootable or false;
  };
  kioskWithExternalPlatform = summarize kioskWithExternalPlatform;
  kioskWithPlatformManagedUser = summarize kioskWithPlatformManagedUser;
  kioskWithoutPlatform = summarize kioskWithoutPlatform;
}
