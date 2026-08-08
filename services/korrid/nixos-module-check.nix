{
  pkgs,
  module,
  korridPackage,
}:
let
  lib = pkgs.lib;
  hostConfig = pkgs.writeText "korrid-host.toml" ''
    label = "test"
  '';
  base = {
    users.groups.games.gid = 1001;
    users.users.gameplay = {
      isNormalUser = true;
      uid = 1001;
      group = "games";
    };
    services.korridLinuxHost = {
      package = korridPackage;
      uid = 976;
      gid = 976;
      gameplayUser = "gameplay";
      gameplayUid = 1001;
      gameplayGid = 1001;
      inputdUid = 977;
      controlGid = 977;
      inherit hostConfig;
    };
  };
  evaluate =
    extra:
    import "${pkgs.path}/nixos/lib/eval-config.nix" {
      system = pkgs.stdenv.hostPlatform.system;
      modules = [
        module
        base
        {
          system.stateVersion = "26.05";
          boot.loader.grub.enable = false;
          fileSystems."/" = {
            device = "none";
            fsType = "tmpfs";
          };
        }
        extra
      ];
    };
  enabled = evaluate { services.korridLinuxHost.enable = true; };
  sameUid = evaluate {
    services.korridLinuxHost = {
      enable = true;
      uid = lib.mkForce 1001;
    };
  };
  broadGame = evaluate {
    services.korridLinuxHost.enable = true;
    users.users.gameplay.extraGroups = [ "input" ];
  };
  allAssertionsPass = system: lib.all (entry: entry.assertion) system.config.assertions;
  hasFailedAssertion =
    needle: system:
    lib.any (entry: !entry.assertion && lib.hasInfix needle entry.message) system.config.assertions;
  evaluationRejected =
    system: !(builtins.tryEval system.config.system.build.toplevel.drvPath).success;
  service = enabled.config.systemd.services.korrid;
  socket = enabled.config.systemd.sockets.korrid-control;
  polkit = enabled.config.security.polkit.extraConfig;
in
assert allAssertionsPass enabled;
assert service.serviceConfig.User == "korrid";
assert service.serviceConfig.User != "gameplay";
assert service.environment.KORRID_GAMEPLAY_UID == "1001";
assert service.environment.KORRID_GAMEPLAY_GID == "1001";
assert service.environment.KORRID_CONTROL_PEER_UID == "977";
assert service.environment.KORRID_CONTROL_PEER_GID == "977";
assert service.environment.KORRID_SYSTEMD_RUN == "${pkgs.systemd}/bin/systemd-run";
assert service.environment.KORRID_SYSTEMCTL == "${pkgs.systemd}/bin/systemctl";
assert builtins.elem "korrid-control.socket" service.requires;
assert socket.socketConfig.ListenStream == "/run/korrid-control/control.sock";
assert socket.socketConfig.SocketUser == "root";
assert socket.socketConfig.SocketGroup == "korri-control";
assert socket.socketConfig.SocketMode == "0660";
assert socket.socketConfig.Service == "korrid.service";
assert enabled.config.users.groups.korri-control.gid == 977;
assert !(builtins.elem "korri-control" enabled.config.users.users.gameplay.extraGroups);
assert builtins.elem "AF_UNIX" service.serviceConfig.RestrictAddressFamilies;
assert builtins.elem "AF_INET" service.serviceConfig.RestrictAddressFamilies;
assert service.serviceConfig.ProtectProc == "invisible";
assert service.serviceConfig.ProcSubset == "pid";
assert lib.hasInfix "subject.system_unit == \"korrid.service\"" polkit;
assert lib.hasInfix "^korri-game-[0-9a-f]{32}" polkit;
assert hasFailedAssertion "service UID must differ" sameUid;
assert hasFailedAssertion "gameplay user must not hold raw input" broadGame;
assert evaluationRejected sameUid;
assert evaluationRejected broadGame;
pkgs.runCommand "korrid-linux-host-module-check" { } ''
  touch "$out"
''
