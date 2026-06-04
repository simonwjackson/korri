{ korri, nixpkgs }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.liveUsbPersistence;
  isDeveloper = cfg.artifact == "developer";
  artifactSuffix = lib.optionalString isDeveloper "-developer";
  menuLabel = if isDeveloper then " Developer ISO" else " Product ISO";
in

{
  imports = [
    (nixpkgs.outPath + "/nixos/modules/installer/cd-dvd/iso-image.nix")
    (import ./live-usb-runtime.nix { inherit korri; })
  ];

  config = {
    # This image is a live USB/ISO appliance. It deliberately exposes an ISO
    # artifact that can be written to removable media; it is not an installer for
    # the target machine's internal disk.
    image = {
      baseName = lib.mkDefault "korri-kiosk-live${artifactSuffix}";
      fileName = lib.mkDefault "korri-kiosk-live${artifactSuffix}-${pkgs.stdenv.hostPlatform.system}.iso";
    };

    isoImage = {
      makeUsbBootable = lib.mkDefault true;
      makeEfiBootable = lib.mkDefault true;
      appendToMenuLabel = lib.mkDefault menuLabel;
    };
  };
}
