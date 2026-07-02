# Source-machine stream-host composition for the RetroArch launch plugin.
#
# Keeps RetroArch-owned package/closure contributions in the plugin tree while
# letting product image and downstream NixOS module compositions import one
# stream-host-safe module. Mirrors product/plugins/gamescope/nix/source-machine-module.nix.
#
# The kiosk closure module (./nixos-module.nix) is gated on
# services.korri.compositor.enable, which is true on source machines (they keep
# kiosk.enable = false), so importing it here provisions /etc/korri/bin/retroarch,
# /etc/korri/cores/*.so, /etc/korri/shaders/slang, joypad autoconfig, and the
# sessiond PATH entry without a kiosk GUI.
#
# nixpkgs-mesa Turnip pinning is an aarch64/kiosk concern; headless x86 stream
# hosts default it off, so no plugin args are threaded here. Runtime plugin
# enablement (KORRI_ENABLED_PLUGINS) stays with the host/image so multiple
# source-machine plugin modules do not collide on that single env string.
{ ... }:
{
  imports = [ (import ./nixos-module.nix { }) ];
}
