{
  lib,
  ...
}:

{
  imports = [ ./headless.nix ];

  services.korri.client.enable = lib.mkDefault true;

  services.korri.kiosk = {
    enable = true;
    input.required = lib.mkDefault true;
  };
}
