{
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  imageLib = flake.lib.${system}.korriImages;
  x86Platform = flakeRoot + /nix/images/platforms/x86.nix;

  liveUsb = imageLib.mkLiveUsbKioskSystem {
    platformModules = [ x86Platform ];
  };

  cfg = liveUsb.config;
  kiosk = cfg.services.korri.kiosk;
  persistence = cfg.services.korri.liveUsbPersistence or { };
in
{
  persistence = {
    enabled = persistence.enable or false;
    root = persistence.root or null;
    bootMountPoint = persistence.bootMountPoint or null;
    label = persistence.label or null;
    markerPersistent = persistence.markerPersistent or null;
    markerEphemeral = persistence.markerEphemeral or null;
  };

  kioskState = {
    home = kiosk.home;
    stateHome = kiosk.stateHome;
    dataHome = kiosk.dataHome;
    configHome = kiosk.configHome;
    environment = kiosk.environment;
    wants = cfg.systemd.services."korri-kiosk".wants or [ ];
    requires = cfg.systemd.services."korri-kiosk".requires or [ ];
    after = cfg.systemd.services."korri-kiosk".after or [ ];
  };

  persistenceService = {
    exists = cfg.systemd.services ? "korri-live-usb-persistence";
    wantedBy = cfg.systemd.services."korri-live-usb-persistence".wantedBy or [ ];
    before = cfg.systemd.services."korri-live-usb-persistence".before or [ ];
    after = cfg.systemd.services."korri-live-usb-persistence".after or [ ];
    path = map toString (cfg.systemd.services."korri-live-usb-persistence".path or [ ]);
  };

  safety = {
    fileSystems = builtins.attrNames cfg.fileSystems;
    swapDevices = cfg.swapDevices;
    services = builtins.attrNames cfg.systemd.services;
    udisks2Enabled = cfg.services.udisks2.enable or false;
    gvfsEnabled = cfg.services.gvfs.enable or false;
  };
}
