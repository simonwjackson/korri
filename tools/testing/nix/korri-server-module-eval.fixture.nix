{
  overrides ? { },
  system ? builtins.currentSystem,
  flakeRoot,
}:
let
  flake = builtins.getFlake (toString flakeRoot);
  nixpkgsPath = flake.inputs.nixpkgs.outPath;
  evalConfig = import (nixpkgsPath + "/nixos/lib/eval-config.nix");
  eval = evalConfig {
    inherit system;
    modules = [
      flake.nixosModules.korri-server
      flake.nixosModules.korri-headless-source
      (
        { ... }:
        {
          nixpkgs.hostPlatform = system;
          boot.loader.systemd-boot.enable = false;
          fileSystems."/" = {
            device = "/dev/null";
            fsType = "ext4";
          };
          system.stateVersion = "24.11";
          networking.hostName = "test-host";
          users.users.testuser = {
            isNormalUser = true;
            home = "/home/testuser";
            group = "users";
          };
        }
      )
      overrides
    ];
  };
  failedAssertions = builtins.filter (a: !a.assertion) eval.config.assertions;
  korriFailedAssertions = builtins.filter (
    a: builtins.match ".*korri.*" a.message != null
  ) failedAssertions;
in
{
  assertionsPassed = korriFailedAssertions == [ ];
  assertionMessages = map (a: a.message) korriFailedAssertions;
  warnings = eval.config.warnings;

  systemUnitExists = eval.config.systemd.services ? korri-server;
  userUnitExists = eval.config.systemd.user.services ? korri-server;

  systemWantedBy = eval.config.systemd.services.korri-server.wantedBy or null;
  userWantedBy = eval.config.systemd.user.services.korri-server.wantedBy or null;

  systemServiceUser = eval.config.systemd.services.korri-server.serviceConfig.User or null;
  systemServiceGroup = eval.config.systemd.services.korri-server.serviceConfig.Group or null;

  systemRuntimeDirectory =
    eval.config.systemd.services.korri-server.serviceConfig.RuntimeDirectory or null;
  systemRuntimeDirectoryMode =
    eval.config.systemd.services.korri-server.serviceConfig.RuntimeDirectoryMode or null;
  systemNoNewPrivileges =
    eval.config.systemd.services.korri-server.serviceConfig.NoNewPrivileges or null;
  systemProtectSystem = eval.config.systemd.services.korri-server.serviceConfig.ProtectSystem or null;
  systemRestart = eval.config.systemd.services.korri-server.serviceConfig.Restart or null;

  userServiceEnv =
    if eval.config.systemd.user.services ? korri-server then
      eval.config.systemd.user.services.korri-server.environment
    else
      null;
  systemServiceEnv =
    if eval.config.systemd.services ? korri-server then
      eval.config.systemd.services.korri-server.environment
    else
      null;

  tmpfilesRunDir =
    eval.config.systemd.tmpfiles.settings."10-korri-server"."/run/korri-game-stream".d or null;

  gameStreamRuntimeDir = eval.config.services.korri.gameStream.runtimeDir or null;
  gameStreamIntentPath = eval.config.services.korri.gameStream.intentPath or null;
  gameStreamStatusPath = eval.config.services.korri.gameStream.statusPath or null;

  gameStreamDisplayCompatEnable = eval.config.services.korri.gameStream.displayCompat.enable or null;
  gameStreamDisplayCompatDefaults =
    eval.config.services.korri.gameStream.displayCompat.defaults or null;
  gameStreamDisplayCompatExtra = eval.config.services.korri.gameStream.displayCompat.extraEnv or null;
  gameStreamWrapperScript =
    let
      apps = eval.config.services.sunshine.applications.apps or [ ];
    in
    if apps == [ ] then null else builtins.readFile (builtins.elemAt apps 0).cmd;

  firewallTcpPorts = eval.config.networking.firewall.allowedTCPPorts or [ ];
  firewallInterfaceNames = builtins.attrNames (eval.config.networking.firewall.interfaces or { });
}
