{
  lib,
  ...
}:

{
  users.groups.korri-server = { };

  users.users.korri-server = {
    isSystemUser = true;
    group = "korri-server";
    home = "/var/lib/korri-server";
    createHome = true;
  };

  services.korri.server = {
    enable = true;
    serviceMode = "system";
    user = "korri-server";
    group = "korri-server";
    host = lib.mkDefault "127.0.0.1";
    openFirewall = lib.mkDefault false;
    # sourceOnly removed in federation v1 (R14 / zero-backwards-compat):
    # every korri-server advertises a `caps: ["source"]` baseline by default,
    # so the previous headless-image opt-in is now the default behavior.
  };
}
