{ zquestClassicPackage }:

{
  config,
  lib,
  ...
}:

{
  config = {
    environment.systemPackages = [ zquestClassicPackage ];

    systemd.tmpfiles.rules = [
      "d /storage/saves/zquest-classic 0755 korri korri -"
      "d /storage/saves/zquest-classic/saves 0755 korri korri -"
    ];
  };
}
