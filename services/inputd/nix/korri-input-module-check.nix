{
  pkgs,
  module,
  inputdPackage,
  inputplumberKorri,
}:
let
  lib = pkgs.lib;
  identities = {
    users.groups.games.gid = 1001;
    users.users.gameplay = {
      isNormalUser = true;
      uid = 1001;
      group = "games";
    };
    services.korri.input.inputd = {
      uid = 977;
      controlGid = 977;
      actionUser = "gameplay";
      actionUid = 1001;
      actionGid = 1001;
      package = inputdPackage;
    };
  };
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
          services.korri.input.provider.package = inputplumberKorri;
        }
        extra
      ];
    };
  withInputd =
    extra:
    evaluate {
      imports = [
        identities
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
  providerOnly = evaluate {
    services.korri.input.provider.enable = true;
  };
  additionalData = pkgs.runCommand "inputplumber-module-data-fixture" { } ''
    mkdir -p "$out/share/inputplumber/devices"
    touch "$out/share/inputplumber/devices/platform-check.yaml"
  '';
  providerWithData = evaluate {
    services.korri.input.provider = {
      enable = true;
      extraDataPackages = [ additionalData ];
    };
  };
  hiddenProvider = evaluate {
    services.korri.input.provider = {
      enable = true;
      sourceHiding = {
        enable = true;
        sameFilesystem = true;
        supportedLayout = true;
      };
    };
  };
  sunshineProvider = withInputd {
    services.korri.input.provider = {
      enable = true;
      sunshine.enableUinputAccess = true;
    };
  };
  inputdOnly = withInputd {
    services.korri.input.inputd.enable = true;
  };
  combined = withInputd {
    services.korri.input.provider.enable = true;
    services.korri.input.inputd = {
      enable = true;
      requireProvider = true;
      actions.workspace-next.command = [
        "${pkgs.coreutils}/bin/true"
        "--help"
      ];
    };
  };
  contradictory = withInputd {
    services.korri.input.inputd = {
      enable = true;
      requireProvider = true;
    };
  };
  broad = withInputd {
    services.korri.input.inputd = {
      enable = true;
      allowBroadRawInput = true;
    };
  };
  unsafeHide = evaluate {
    services.korri.input.provider = {
      enable = true;
      sourceHiding.enable = true;
    };
  };
  invalidAction = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actions.not-an-action.command = [ "${pkgs.coreutils}/bin/true" ];
    };
  };
  unreachableAction = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actions.toggle-steam-visibility.command = [ "${pkgs.coreutils}/bin/true" ];
    };
  };
  destructiveAction = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actions.kill-current-game.command = [ "${pkgs.coreutils}/bin/true" ];
    };
  };
  mutableAction = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actions.workspace-next.command = [ "/usr/bin/true" ];
    };
  };
  providerService = providerOnly.config.systemd.services.inputplumber;
  inputdService = inputdOnly.config.systemd.services.korri-inputd;
  combinedService = combined.config.systemd.services.korri-inputd;
  combinedEnvironment = combinedService.environment;
  combinedRules = combined.config.services.udev.extraRules;
  dbusPackages = map toString combined.config.services.dbus.packages;
in
assert allAssertionsPass providerOnly;
assert providerOnly.config.services.inputplumber.enable;
assert providerOnly.config.services.inputplumber.package == inputplumberKorri;
assert builtins.elem "uinput" providerOnly.config.boot.kernelModules;
assert !(providerOnly.config.systemd.services ? korri-inputd);
assert providerService.environment.XDG_DATA_DIRS == "${inputplumberKorri}/share";
assert
  providerWithData.config.services.inputplumber.package.additionalDataPackages == [ additionalData ];
assert
  hiddenProvider.config.systemd.services.inputplumber.environment.HIDE_DEVICES_FROM_ROOT == "1";
assert
  sunshineProvider.config.systemd.services.sunshine.serviceConfig.SupplementaryGroups == [
    "korri-sunshine-uinput"
  ];
assert
  !(builtins.elem "korri-sunshine-uinput" sunshineProvider.config.users.users.gameplay.extraGroups);
assert allAssertionsPass inputdOnly;
assert inputdOnly.config.systemd.services ? korri-inputd;
assert !inputdOnly.config.services.inputplumber.enable;
assert inputdService.serviceConfig.RestrictAddressFamilies == [ "AF_UNIX" ];
assert inputdService.serviceConfig.IPAddressDeny == "any";
assert inputdService.serviceConfig.Delegate == "pids";
assert
  inputdService.serviceConfig.CapabilityBoundingSet == [
    "CAP_SETUID"
    "CAP_SETGID"
  ];
assert
  inputdService.serviceConfig.AmbientCapabilities == [
    "CAP_SETUID"
    "CAP_SETGID"
  ];
assert builtins.elem "/dev/uinput" inputdService.serviceConfig.InaccessiblePaths;
assert !(inputdService.environment ? KORRI_INPUTD_KILL_CURRENT_GAME);
assert allAssertionsPass combined;
assert builtins.elem "inputplumber.service" combinedService.after;
assert builtins.elem "inputplumber.service" combinedService.wants;
assert combined.config.users.users.korri-inputd.uid == 977;
assert combined.config.users.users.korri-inputd.group == "korri-control";
assert combinedEnvironment.KORRI_INPUTD_CONTROL_GID == "977";
assert combinedEnvironment.KORRI_INPUTD_ACTION_UID == "1001";
assert combinedEnvironment.KORRI_INPUTD_ACTION_GID == "1001";
assert
  (builtins.fromJSON (
    builtins.unsafeDiscardStringContext combinedEnvironment.KORRI_INPUTD_WORKSPACE_NEXT
  )) == {
    executable = "${pkgs.coreutils}/bin/true";
    argv = [ "--help" ];
    environment = { };
  };
assert lib.hasInfix "Microsoft X-Box 360 pad" combinedRules;
assert lib.hasInfix "045e" combinedRules;
assert lib.hasInfix "028e" combinedRules;
assert !(lib.hasInfix "SUBSYSTEM==\"input\", KERNEL==\"event*\", MODE" combinedRules);
assert lib.any (path: lib.hasInfix "korri-inputplumber-dbus-policy" path) dbusPackages;
assert hasFailedAssertion "requires its configured provider" contradictory;
assert hasFailedAssertion "broad raw-input" broad;
assert hasFailedAssertion "same-filesystem supported layout" unsafeHide;
assert hasFailedAssertion "invalid action identifier" invalidAction;
assert hasFailedAssertion "unreachable or destructive" unreachableAction;
assert hasFailedAssertion "unreachable or destructive" destructiveAction;
assert hasFailedAssertion "immutable absolute Nix-store argv" mutableAction;
assert evaluationRejected contradictory;
assert evaluationRejected broad;
assert evaluationRejected unsafeHide;
assert evaluationRejected invalidAction;
assert evaluationRejected unreachableAction;
assert evaluationRejected destructiveAction;
assert evaluationRejected mutableAction;
pkgs.runCommand "korri-input-module-check" { } ''
  set -euo pipefail
  test -f ${providerWithData.config.services.inputplumber.package}/share/inputplumber/devices/platform-check.yaml
  policy_package="${
    lib.findFirst (path: lib.hasInfix "korri-inputplumber-dbus-policy" path) "" dbusPackages
  }"
  policy="$policy_package/share/dbus-1/system.d/korri-inputplumber.conf"
  test -f "$policy"
  grep -F '<deny own="org.shadowblip.InputPlumber"/>' "$policy" >/dev/null
  grep -F '<deny send_destination="org.shadowblip.InputPlumber" send_type="method_call"/>' "$policy" >/dev/null
  touch "$out"
''
