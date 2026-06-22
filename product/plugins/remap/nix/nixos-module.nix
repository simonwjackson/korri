{ config, lib, pkgs, ... }:

let
  cfg = config.services.korri.remap;
in
{
  key = "korri-remap";

  options.services.korri.remap = {
    enable = lib.mkEnableOption "Korri launch-scoped Remap native wrapper";

    runnerUser = lib.mkOption {
      type = lib.types.str;
      default = "korri-remap-runner";
      readOnly = true;
      description = "Dedicated low-privilege identity used only for Remap-wrapped child processes.";
    };

    runnerGroup = lib.mkOption {
      type = lib.types.str;
      default = "korri-remap-runner";
      readOnly = true;
      description = "Primary group for the Remap runner identity.";
    };

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./remap-bridge.nix { };
      defaultText = lib.literalExpression "product/plugins/remap/nix/remap-bridge.nix";
      description = "Package providing the korri-remap-bridge launch wrapper.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.runnerUser == "korri-remap-runner";
        message = "services.korri.remap.runnerUser is fixed to korri-remap-runner.";
      }
    ];

    boot.kernelModules = [ "uinput" ];

    environment.systemPackages = [ cfg.package ];
    environment.variables.KORRI_REMAP_NATIVE_DRIVER = "enabled";

    security.wrappers.korri-remap-bridge = {
      source = "${cfg.package}/bin/korri-remap-bridge";
      owner = "root";
      group = "root";
      setuid = true;
      permissions = "u+rx,g+x,o+x";
    };

    users.groups.${cfg.runnerGroup} = { };
    users.users.${cfg.runnerUser} = {
      isSystemUser = true;
      group = cfg.runnerGroup;
      home = "/var/empty";
      createHome = false;
      shell = "${pkgs.shadow}/bin/nologin";
      extraGroups = [ "render" "video" ];
    };

    services.udev.extraRules = ''
      # Remap-owned synthetic devices are hidden from normal libinput/Sway
      # discovery. The privileged wrapper grants per-launch ACLs only to the
      # dedicated korri-remap-runner identity after device creation.
      ACTION=="add|change", SUBSYSTEM=="input", KERNEL=="event*", ATTR{name}=="Korri Remap*", ENV{LIBINPUT_IGNORE_DEVICE}="1", ENV{ID_INPUT}="0", ENV{ID_INPUT_KEY}="0", ENV{ID_INPUT_KEYBOARD}="0", ENV{ID_INPUT_JOYSTICK}="0", MODE="0600", GROUP="root", TAG-="uaccess", TAG-="seat"
      ACTION=="add|change", SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="Korri Remap*", ENV{LIBINPUT_IGNORE_DEVICE}="1", ENV{ID_INPUT}="0", ENV{ID_INPUT_KEY}="0", ENV{ID_INPUT_KEYBOARD}="0", ENV{ID_INPUT_JOYSTICK}="0", MODE="0600", GROUP="root", TAG-="uaccess", TAG-="seat"
    '';
  };
}
