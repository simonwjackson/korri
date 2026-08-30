{
  pkgs,
  module,
  bundleModule,
  korridPackage,
  inputdPackage,
  korriBundle,
}:
let
  lib = pkgs.lib;
  deviceConfig = pkgs.writeText "korrid-host.toml" ''
    label = "test"
  '';
  base = {
    users.groups.games.gid = 1001;
    users.users.gameplay = {
      isNormalUser = true;
      uid = 1001;
      group = "games";
    };
    services.korridLinuxDevice = {
      package = korridPackage;
      uid = 976;
      gid = 976;
      gameplayUser = "gameplay";
      gameplayUid = 1001;
      gameplayGid = 1001;
      inputdUid = 977;
      controlGid = 977;
      inherit deviceConfig;
    };
  };
  evaluate =
    extra:
    import "${pkgs.path}/nixos/lib/eval-config.nix" {
      system = pkgs.stdenv.hostPlatform.system;
      modules = [
        bundleModule
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
  enabled = evaluate { services.korridLinuxDevice.enable = true; };
  bundled = evaluate {
    services.korriBundle = {
      enable = true;
      initialPackage = korriBundle;
      launcherPackage = inputdPackage;
    };
    services.korridLinuxDevice.enable = true;
  };
  customPaths = evaluate {
    services.korridLinuxDevice = {
      enable = true;
      privateStateRoot = "/srv/korri-test/recovery";
      controlSocket = "/run/korri-test/control/device.sock";
    };
  };
  sameUid = evaluate {
    services.korridLinuxDevice = {
      enable = true;
      gameplayUid = lib.mkForce 976;
    };
  };
  broadGame = evaluate {
    services.korridLinuxDevice.enable = true;
    users.users.gameplay.extraGroups = [ "input" ];
  };
  invalidPrivatePath = evaluate {
    services.korridLinuxDevice = {
      enable = true;
      privateStateRoot = "/srv/korrid/../recovery";
    };
  };
  invalidControlPath = evaluate {
    services.korridLinuxDevice = {
      enable = true;
      controlSocket = "relative/control.sock";
    };
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
  tmpfiles = enabled.config.systemd.tmpfiles.rules;
  customService = customPaths.config.systemd.services.korrid;
  customSocket = customPaths.config.systemd.sockets.korrid-control;
  customTmpfiles = customPaths.config.systemd.tmpfiles.rules;
  bundledService = bundled.config.systemd.services.korrid;
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
assert service.environment.KORRID_ADDRESS == "127.0.0.1:43117";
assert service.environment.KORRID_PRIVATE_STATE_ROOT == "/var/lib/korrid";
assert service.environment.KORRID_CONTROL_SOCKET == "/run/korrid-control/control.sock";
assert service.environment.KORRID_CONTROL_DIRECTORY == "/run/korrid-control";
assert builtins.elem "korrid-control.socket" service.requires;
assert socket.socketConfig.ListenStream == "/run/korrid-control/control.sock";
assert socket.socketConfig.SocketUser == "root";
assert socket.socketConfig.SocketGroup == "korri-control";
assert socket.socketConfig.SocketMode == "0660";
assert socket.socketConfig.Service == "korrid.service";
assert builtins.elem "systemd-tmpfiles-setup.service" socket.requires;
assert builtins.elem "systemd-tmpfiles-setup.service" socket.after;
assert builtins.elem "systemd-tmpfiles-resetup.service" socket.after;
assert builtins.elem "d /run/korrid-control 0750 root korri-control -" tmpfiles;
assert builtins.elem "d /dev/inputplumber 0700 root root -" tmpfiles;
assert builtins.elem "d /dev/inputplumber/sources 0700 root root -" tmpfiles;
assert builtins.elem "systemd-tmpfiles-setup-dev.service" service.after;
assert builtins.elem "systemd-tmpfiles-resetup.service" service.after;
assert builtins.elem "korri-input-source-guard.service" service.after;
assert builtins.elem "-/dev/inputplumber/sources" service.serviceConfig.InaccessiblePaths;
assert enabled.config.users.groups.korri-control.gid == 977;
assert !(builtins.elem "korri-control" enabled.config.users.users.gameplay.extraGroups);
assert builtins.elem "AF_UNIX" service.serviceConfig.RestrictAddressFamilies;
assert builtins.elem "AF_INET" service.serviceConfig.RestrictAddressFamilies;
assert service.serviceConfig.ProtectProc == "invisible";
assert service.serviceConfig.ProcSubset == "pid";
assert lib.hasInfix "action.id == \"org.freedesktop.systemd1.manage-units\"" polkit;
assert lib.hasInfix "subject.user == \"korrid\"" polkit;
assert !(lib.hasInfix "subject.system_unit" polkit);
assert lib.hasInfix "^korri-game-[0-9a-f]{32}" polkit;
assert allAssertionsPass bundled;
assert builtins.elem "korri-bundle-selector.service" bundledService.requires;
assert builtins.elem "korri-bundle-selector.service" bundledService.after;
assert bundledService.environment.KORRI_BUNDLE_ACTIVE == "/nix/var/nix/gcroots/korri-bundle/active";
assert bundledService.serviceConfig.ExecStart == "${inputdPackage}/bin/korri-bundle-launch korrid";
assert allAssertionsPass customPaths;
assert customSocket.socketConfig.ListenStream == "/run/korri-test/control/device.sock";
assert customService.environment.KORRID_PRIVATE_STATE_ROOT == "/srv/korri-test/recovery";
assert customService.environment.KORRID_CONTROL_SOCKET == "/run/korri-test/control/device.sock";
assert customService.environment.KORRID_CONTROL_DIRECTORY == "/run/korri-test/control";
assert builtins.elem "d /run/korri-test/control 0750 root korri-control -" customTmpfiles;
assert hasFailedAssertion "service UID must differ" sameUid;
assert hasFailedAssertion "gameplay user must not hold raw input" broadGame;
assert hasFailedAssertion "privateStateRoot must be a normalized absolute path" invalidPrivatePath;
assert hasFailedAssertion "controlSocket and its directory must be normalized absolute paths"
  invalidControlPath;
assert evaluationRejected sameUid;
assert evaluationRejected broadGame;
assert evaluationRejected invalidPrivatePath;
assert evaluationRejected invalidControlPath;
pkgs.runCommand "korrid-linux-device-module-check" { } ''
  touch "$out"
''
