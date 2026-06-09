{
  lib,
  ...
}:

# Federation v1 baseline (R14 / R16 of
# docs/plans/2026-05-27-001-feat-korri-library-federation-plan.md): every
# library-bearing korrid is LAN-visible by default. Federation is not
# opt-in; deploys that intentionally should not federate simply do not
# import this base.
#
# This means:
#
#   - `services.korri.daemon.host = "0.0.0.0"` (was 127.0.0.1) so the
#     federation mDNS advert resolves to a reachable address for peers.
#   - `services.korri.daemon.openFirewall = true` so the advertised port is
#     actually reachable.
#   - `services.avahi.enable = true` so the always-on advertise in
#     product/services/device/lan-stream-advertise.ts can publish via avahi (its
#     preferred backend; the bonjour-service fallback only kicks in when
#     avahi-daemon is not running, and bonjour-service in-process mDNS is
#     less reliable on firewalled systemd units).
#
# Single-machine / loopback deploys override these defaults with
# lib.mkForce.
{
  services.korri.login.enable = lib.mkDefault true;

  services.korri.daemon = {
    enable = true;
    serviceMode = "user";
    host = lib.mkDefault "0.0.0.0";
    openFirewall = lib.mkDefault true;
    firewallInterfaces = lib.mkDefault [ "lan0" ];
    # sourceOnly removed in federation v1 (R14 / zero-backwards-compat):
    # every korrid advertises a `caps: ["source"]` baseline by default,
    # so the previous headless-image opt-in is now the default behavior.
  };

  # mDNS responder for the federation advertise. The publisher in
  # product/services/device/lan-stream-advertise.ts prefers `avahi-publish-service`
  # over the bonjour-service JS fallback because avahi-daemon owns the
  # system mDNS responder and works inside locked-down systemd units that
  # cannot otherwise bind UDP/5353. The avahi NixOS module opens the
  # required UDP/5353 firewall hole automatically.
  services.avahi = {
    enable = lib.mkDefault true;
    nssmdns4 = lib.mkDefault true;
    publish = {
      enable = lib.mkDefault true;
      userServices = lib.mkDefault true;
    };
  };
}
