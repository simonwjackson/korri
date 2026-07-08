{
  melonDsPackage,
  melonDsPresenterPackage,
}:

{ ... }:

{
  config = {
    environment.systemPackages = [
      melonDsPackage
      melonDsPresenterPackage
    ];

    systemd.tmpfiles.rules = [
      "d /var/lib/korri/melonDS 0755 korri korri -"
      "d /var/lib/korri/melonDS/saves 0755 korri korri -"
      "d /var/lib/korri/melonDS/savestates 0755 korri korri -"
      "d /var/lib/korri/melonDS/cheats 0755 korri korri -"
    ];
  };
}
