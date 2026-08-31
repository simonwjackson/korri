{
  pkgs,
  module,
  sunshinePackage,
  inputdPackage,
  inputplumberKorri,
  korridPackage,
  korriBundle,
}:
let
  lib = pkgs.lib;
  evaluate =
    extra:
    import "${pkgs.path}/nixos/lib/eval-config.nix" {
      system = pkgs.stdenv.hostPlatform.system;
      modules = [
        module
        {
          system.stateVersion = "26.05";
          boot.loader.grub.enable = false;
          fileSystems."/" = {
            device = "none";
            fsType = "tmpfs";
          };
          networking.hostName = "consumer";
          users.groups.games.gid = 1001;
          users.users.gameplay = {
            isNormalUser = true;
            group = "games";
            home = "/home/gameplay";
          };
          services.korriBundle = {
            initialPackage = korriBundle;
            launcherPackage = inputdPackage;
          };
          services.korriLinuxInput = {
            provider.package = inputplumberKorri;
            inputd.package = inputdPackage;
          };
          services.korridLinuxDevice.package = korridPackage;
          services.korriLinuxHost = {
            enable = true;
            gameplayUser = "gameplay";
            gameplayUid = 1001;
            gameplayGroup = "games";
            gameplayGid = 1001;
            firewallInterfaces = [ "tailscale0" ];
            sunshine.package = sunshinePackage;
          };
        }
        extra
      ];
    };
  allAssertionsPass =
    system:
    lib.all (
      entry: if entry.assertion then true else builtins.trace entry.message false
    ) system.config.assertions;
  hasFailedAssertion =
    needle: system:
    lib.any (entry: !entry.assertion && lib.hasInfix needle entry.message) system.config.assertions;
  evaluationRejected =
    system: !(builtins.tryEval system.config.system.build.toplevel.drvPath).success;
  valid = evaluate { };
  noValidation = evaluate {
    services.korriLinuxHost.validation.enable = false;
  };
  noRuntimeSettings = evaluate {
    services.korriLinuxHost.sunshine.runtimeSettings.enable = false;
  };
  wrongGameplayUid = evaluate {
    users.users.gameplay.uid = lib.mkForce 1002;
  };
  stockSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce pkgs.sunshine;
  };
  lookalikeSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce (pkgs.sunshine.overrideAttrs (_: {
      pname = "sunshine-korri";
    }));
  };
  strippedApprovedSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce (sunshinePackage.overrideAttrs (_: {
      patches = [ ];
    }));
  };
  collidingIdentity = evaluate {
    services.korriLinuxHost.serviceIdentities.inputdUid = lib.mkForce 1001;
  };
  invalidLabel = evaluate {
    services.korriLinuxHost.label = "bad label";
  };
  cfg = valid.config;
  inputd = cfg.systemd.services.korri-inputd;
  korrid = cfg.systemd.services.korrid;
  sunshine = cfg.systemd.services.sunshine;
  x11 = cfg.systemd.services.x11-headless;
  deviceConfig = cfg.services.korridLinuxDevice.deviceConfig;
  sunshineExec = pkgs.writeText "korri-linux-host-sunshine-exec" sunshine.serviceConfig.ExecStart;
  udevRules = pkgs.writeText "korri-linux-host-udev-rules" cfg.services.udev.extraRules;
in
assert allAssertionsPass valid;
assert cfg.services.korriBundle.enable;
assert cfg.services.korriLinuxInput.provider.enable;
assert !cfg.services.korriLinuxInput.provider.sourceHiding.enable;
assert cfg.services.korriLinuxInput.inputd.enable;
assert cfg.services.korridLinuxDevice.enable;
assert cfg.services.inputplumber.enable;
assert cfg.services.sunshine.enable;
assert !cfg.services.sunshine.autoStart;
assert !cfg.systemd.user.services.sunshine.enable;
assert cfg.services.sunshine.package == sunshinePackage;
assert cfg.services.korriLinuxHost.sunshine.runtimeSettings.enable;
assert sunshine.environment.SUNSHINE_LIVE_SETTINGS_MVP == "1";
assert noRuntimeSettings.config.services.sunshine.package == sunshinePackage;
assert
  noRuntimeSettings.config.systemd.services.sunshine.serviceConfig.ExecStart
  == "${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf";
assert
  !(builtins.hasAttr "SUNSHINE_LIVE_SETTINGS_MVP" noRuntimeSettings.config.systemd.services.sunshine.environment);
assert cfg.hardware.graphics.enable;
assert builtins.elem "uinput" cfg.boot.kernelModules;
assert cfg.users.users.korri-inputd.uid == 977;
assert cfg.users.groups.korri-control.gid == 977;
assert cfg.users.users.korrid.uid == 976;
assert cfg.users.groups.korrid.gid == 976;
assert cfg.users.groups.korri-sunshine-uinput.gid == 979;
assert builtins.elem "render" cfg.users.users.gameplay.extraGroups;
assert builtins.elem "video" cfg.users.users.gameplay.extraGroups;
assert !(builtins.elem "input" cfg.users.users.gameplay.extraGroups);
assert !(builtins.elem "uinput" cfg.users.users.gameplay.extraGroups);
assert inputd.serviceConfig.User == "korri-inputd";
assert korrid.serviceConfig.User == "korrid";
assert korrid.environment.KORRID_SUNSHINE_PRIVATE_STATE_ROOT == "/home/gameplay/.config/sunshine";
assert cfg.services.korridLinuxDevice.sunshinePrivateStateRoot == "/home/gameplay/.config/sunshine";
assert sunshine.serviceConfig.User == "gameplay";
assert sunshine.serviceConfig.WorkingDirectory == "/home/gameplay";
assert sunshine.environment.DISPLAY == ":0";
assert sunshine.environment.HOME == "/home/gameplay";
assert sunshine.environment.XDG_CONFIG_HOME == "/home/gameplay/.config";
assert
  sunshine.serviceConfig.ExecStart
  == "${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf";
assert sunshine.serviceConfig.ProtectSystem == "strict";
assert sunshine.serviceConfig.ProtectHome == "read-only";
assert builtins.elem "/home/gameplay/.config/sunshine" sunshine.serviceConfig.ReadWritePaths;
assert x11.serviceConfig.User == "gameplay";
assert x11.serviceConfig.PrivateDevices;
assert !(builtins.elem "/dev/inputplumber/sources" (x11.serviceConfig.InaccessiblePaths or [ ]));
assert builtins.elem "korri-input-source-guard.service" sunshine.requires;
assert builtins.elem "x11-headless.service" sunshine.requires;
assert builtins.elem "/dev/inputplumber/sources" sunshine.serviceConfig.InaccessiblePaths;
assert builtins.elem 39217 cfg.networking.firewall.interfaces.tailscale0.allowedTCPPorts;
assert builtins.hasAttr "workspace-next" cfg.services.korriLinuxInput.inputd.actions;
assert builtins.length cfg.services.korriLinuxInput.inputd.actions.workspace-next.command == 1;
assert lib.hasSuffix "/bin/korri-input-action-fixture" (
  builtins.head cfg.services.korriLinuxInput.inputd.actions.workspace-next.command
);
assert noValidation.config.services.korriLinuxInput.inputd.actions == { };
assert hasFailedAssertion "gameplay identity" wrongGameplayUid;
assert evaluationRejected wrongGameplayUid;
assert hasFailedAssertion "exact approved sunshine-korri" stockSunshine;
assert evaluationRejected stockSunshine;
assert hasFailedAssertion "exact approved sunshine-korri" lookalikeSunshine;
assert evaluationRejected lookalikeSunshine;
assert hasFailedAssertion "exact approved sunshine-korri" strippedApprovedSunshine;
assert evaluationRejected strippedApprovedSunshine;
assert hasFailedAssertion "differ from the gameplay identity" collidingIdentity;
assert evaluationRejected invalidLabel;
pkgs.runCommand "korri-linux-host-module-check" { } ''
  grep -F 'id = "inputd-gate"' ${deviceConfig} >/dev/null
  grep -F 'DISPLAY = ":0"' ${deviceConfig} >/dev/null
  grep -F '${sunshinePackage}/bin/sunshine' ${sunshineExec} >/dev/null
  grep -F 'TAG-="uaccess"' ${udevRules} >/dev/null
  touch "$out"
''
