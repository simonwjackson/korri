{
  lib,
  ...
}:

{
  imports = [ ./headless.nix ];

  services.korri.client.enable = lib.mkDefault true;

  services.korri.compositor = {
    enable = true;
    kiosk.enable = true;
  };

  # Kiosk appliance images require host-side normalized appliance input via
  # the canonical InputPlumber provider. Platforms can override by setting
  # `services.korri.input.provider.name` to something else (or disabling the
  # provider entirely if a downstream test image deliberately runs without it).
  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
  };
}
