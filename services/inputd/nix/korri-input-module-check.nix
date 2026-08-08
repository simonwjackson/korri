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
    systemd.services.sunshine.serviceConfig.SupplementaryGroups = [ "render" ];
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
  mismatchedActionIdentity = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actionUid = lib.mkForce 1002;
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
  emptyAction = withInputd {
    services.korri.input.inputd = {
      enable = true;
      actions.workspace-next.command = [ ];
    };
  };
  aclFixture = pkgs.runCommand "korri-virtual-target-acl-fixture" { } ''
    mkdir -p "$out/dev/input" "$out/sys/class/input/event4/device/id" "$out/sys/class/input/event5/device/id"
    touch "$out/dev/input/event4" "$out/dev/input/event5" "$out/dev/input/not-an-event"
    printf '%s\n' 'Microsoft X-Box 360 pad' > "$out/sys/class/input/event4/device/name"
    printf '%s\n' 0003 > "$out/sys/class/input/event4/device/id/bustype"
    printf '%s\n' 045e > "$out/sys/class/input/event4/device/id/vendor"
    printf '%s\n' 028e > "$out/sys/class/input/event4/device/id/product"
    printf '%s\n' 0001 > "$out/sys/class/input/event4/device/id/version"
    printf '%s\n' 'Unrelated controller' > "$out/sys/class/input/event5/device/name"
    printf '%s\n' 0003 > "$out/sys/class/input/event5/device/id/bustype"
    printf '%s\n' 045e > "$out/sys/class/input/event5/device/id/vendor"
    printf '%s\n' 028e > "$out/sys/class/input/event5/device/id/product"
    printf '%s\n' 0001 > "$out/sys/class/input/event5/device/id/version"
  '';
  recordingSetfacl = pkgs.writeShellScript "recording-setfacl" ''
    printf '%s\n' "$*" >> "$KORRI_TEST_ACL_LOG"
  '';
  fixtureAcl = import ./virtual-target-acl.nix {
    inherit pkgs;
    deviceRoot = "${aclFixture}/dev/input";
    sysClassRoot = "${aclFixture}/sys/class/input";
    setfacl = recordingSetfacl;
  };
  providerService = providerOnly.config.systemd.services.inputplumber;
  inputdService = inputdOnly.config.systemd.services.korri-inputd;
  combinedService = combined.config.systemd.services.korri-inputd;
  combinedEnvironment = combinedService.environment;
  combinedRules = combined.config.services.udev.extraRules;
  inputdOnlyRules = inputdOnly.config.services.udev.extraRules;
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
    "render"
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
assert lib.hasInfix "Microsoft X-Box 360 pad" inputdOnlyRules;
assert lib.hasInfix "korri-virtual-target-acl" inputdOnlyRules;
assert lib.hasInfix " grant 977 1001 $env{DEVNAME}" inputdOnlyRules;
assert lib.hasInfix "korri-virtual-target-acl" inputdService.serviceConfig.ExecStartPre;
assert lib.hasSuffix " reapply 977 1001" inputdService.serviceConfig.ExecStartPre;
assert lib.hasSuffix " revoke" inputdService.serviceConfig.ExecStopPost;
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
assert hasFailedAssertion "must exactly match the action user's primary identity"
  mismatchedActionIdentity;
assert hasFailedAssertion "same-filesystem supported layout" unsafeHide;
assert hasFailedAssertion "invalid action identifier" invalidAction;
assert hasFailedAssertion "unreachable or destructive" unreachableAction;
assert hasFailedAssertion "unreachable or destructive" destructiveAction;
assert hasFailedAssertion "immutable absolute Nix-store argv" mutableAction;
assert hasFailedAssertion "immutable absolute Nix-store argv" emptyAction;
assert evaluationRejected contradictory;
assert evaluationRejected broad;
assert evaluationRejected mismatchedActionIdentity;
assert evaluationRejected unsafeHide;
assert evaluationRejected invalidAction;
assert evaluationRejected unreachableAction;
assert evaluationRejected destructiveAction;
assert evaluationRejected mutableAction;
assert evaluationRejected emptyAction;
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

  export KORRI_TEST_ACL_LOG="$TMPDIR/acl.log"
  ${fixtureAcl}/bin/korri-virtual-target-acl grant 888 889 ${aclFixture}/dev/input/event4
  if ${fixtureAcl}/bin/korri-virtual-target-acl grant 977 1001 ${aclFixture}/dev/input/event5; then
    echo "unrelated event target unexpectedly received an ACL" >&2
    exit 1
  fi
  ${fixtureAcl}/bin/korri-virtual-target-acl reapply 977 1001
  ${fixtureAcl}/bin/korri-virtual-target-acl revoke
  test "$(grep -Fc -- '-b -- ${aclFixture}/dev/input/event4' "$KORRI_TEST_ACL_LOG")" = 3
  test "$(grep -Fc -- '-m u:888:r,u:889:r,m::r -- ${aclFixture}/dev/input/event4' "$KORRI_TEST_ACL_LOG")" = 1
  test "$(grep -Fc -- '-m u:977:r,u:1001:r,m::r -- ${aclFixture}/dev/input/event4' "$KORRI_TEST_ACL_LOG")" = 1
  if grep -F 'event5' "$KORRI_TEST_ACL_LOG"; then
    echo "ACL helper touched an unrelated event node" >&2
    exit 1
  fi
  first="$(sed -n 1p "$KORRI_TEST_ACL_LOG")"
  second="$(sed -n 2p "$KORRI_TEST_ACL_LOG")"
  third="$(sed -n 3p "$KORRI_TEST_ACL_LOG")"
  fourth="$(sed -n 4p "$KORRI_TEST_ACL_LOG")"
  test "$first" = '-b -- ${aclFixture}/dev/input/event4'
  test "$second" = '-m u:888:r,u:889:r,m::r -- ${aclFixture}/dev/input/event4'
  test "$third" = '-b -- ${aclFixture}/dev/input/event4'
  test "$fourth" = '-m u:977:r,u:1001:r,m::r -- ${aclFixture}/dev/input/event4'
  touch "$out"
''
