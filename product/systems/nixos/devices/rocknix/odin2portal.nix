# Korri-owned AYN Odin 2 Portal appliance profile.
#
# nix-on-rocks owns the product-neutral SM8550 substrate options and modules;
# Korri owns product/device appliance facts: hostname, product device id,
# display orientation, and measured per-device policy overrides.
{ lib, ... }:

{
  networking.hostName = lib.mkForce "sobo";

  rocknix.sm8550 = {
    deviceId = "odin2portal";

    display.swayDeviceConfig = ''
      # Korri Sobo / AYN Odin 2 Portal display block (SM8550).
      # Portal exposes a single 1080x1920 DSI panel as DSI-1. The Korri
      # appliance owns the user-facing orientation; keep this local so future
      # installs do not depend on a substrate profile to set product posture.
      output DSI-1 enable
      output DSI-1 transform 90
      output DSI-1 pos 0 0
      output DSI-1 bg #000000 solid_color
      output DSI-1 allow_tearing yes
      output DSI-1 max_render_time off

      # Portal currently exposes a single touchscreen; keep the routing broad
      # until its kernel name is made stable.
      input type:touch map_to_output DSI-1
    '';

    # Odin 2 Portal audio path has not yet been physically validated end
    # to end. Leave `audio.defaultSink.pcm` at its `null` default so the
    # substrate does not silently inherit Thor's speaker PCM, UCM verb,
    # or sink name. WirePlumber's `auto_null` fallback remains the
    # default sink until live evidence promotes a measured route into
    # this profile.
    audio.defaultSink.pcm = null;
  };
}
