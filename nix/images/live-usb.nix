{ korri, nixpkgs }:

{
  lib,
  pkgs,
  ...
}:

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
      baseName = lib.mkDefault "korri-kiosk-live";
      fileName = lib.mkDefault "korri-kiosk-live-${pkgs.stdenv.hostPlatform.system}.iso";
    };

    isoImage = {
      makeUsbBootable = lib.mkDefault true;
      makeEfiBootable = lib.mkDefault true;
    };
  };
}
