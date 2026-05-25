{
  system ? builtins.currentSystem,
  flakeRoot,
  invalidArtifact ? false,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  imageLib = flake.lib.${system}.korriImages;
  x86Platform = flakeRoot + /nix/images/platforms/x86.nix;

  mkLiveUsb =
    artifact:
    imageLib.mkLiveUsbKioskSystem {
      platformModules = [ x86Platform ];
      modules = [
        {
          services.korri.liveUsbPersistence.artifact = artifact;
        }
      ];
    };

  product = imageLib.mkLiveUsbKioskSystem {
    platformModules = [ x86Platform ];
  };

  developer = mkLiveUsb "developer";
  invalid = mkLiveUsb "diagnostic";

  summarize =
    liveUsb:
    let
      cfg = liveUsb.config;
      compositor = cfg.services.korri.compositor;
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
        artifact = persistence.artifact or null;
        scope = persistence.scope or null;
        productAllowlist = persistence.productAllowlist or [ ];
      };

      kioskState = {
        home = compositor.home;
        stateHome = compositor.stateHome;
        dataHome = compositor.dataHome;
        configHome = compositor.configHome;
        environment = compositor.environment;
        wants = cfg.systemd.services."korri-compositor".wants or [ ];
        requires = cfg.systemd.services."korri-compositor".requires or [ ];
        after = cfg.systemd.services."korri-compositor".after or [ ];
      };

      persistenceService = {
        exists = cfg.systemd.services ? "korri-live-usb-persistence";
        wantedBy = cfg.systemd.services."korri-live-usb-persistence".wantedBy or [ ];
        before = cfg.systemd.services."korri-live-usb-persistence".before or [ ];
        after = cfg.systemd.services."korri-live-usb-persistence".after or [ ];
        path = map toString (cfg.systemd.services."korri-live-usb-persistence".path or [ ]);
        environment = cfg.systemd.services."korri-live-usb-persistence".environment or { };
      };

      safety = {
        fileSystems = builtins.attrNames cfg.fileSystems;
        swapDevices = cfg.swapDevices;
        services = builtins.attrNames cfg.systemd.services;
        udisks2Enabled = cfg.services.udisks2.enable or false;
        gvfsEnabled = cfg.services.gvfs.enable or false;
        sshEnabled = cfg.services.openssh.enable or false;
      };
    };
in
if invalidArtifact then
  summarize invalid
else
  {
    product = summarize product;
    developer = summarize developer;
  }
