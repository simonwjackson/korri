# Korri normalized-input module.
#
# Two peer sub-trees under `services.korri.input`:
#
#   provider:  host-side normalized appliance input. When name = "inputplumber"
#              the module fully self-wires (enables services.inputplumber, loads
#              the uinput kernel module, writes the /dev/uinput udev rule that
#              Sunshine needs to synthesize virtual controllers). Other names
#              are contract-only — they let platforms declare a provider exists
#              while leaving wiring to the platform.
#
#   inputd:    the korri-inputd WebSocket bridge daemon consumed by the local
#              kiosk client. Orthogonal to provider: streaming hosts (aka)
#              enable provider without inputd; local-only desktops can enable
#              inputd without provider for keyboard-shortcut testing.
#
# `uhid` is intentionally NOT loaded by default. DualSense passthrough is an
# explicit opt-in future follow-up; the validated working path is InputPlumber
# normalizing controllers to a virtual Xbox 360 over /dev/uinput.
{ korri }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.input;
  system = pkgs.stdenv.hostPlatform.system;
  packagesForSystem = korri.packages.${system} or { };
  inputdDefaultPackage =
    packagesForSystem.korri-inputd
      or (throw "Korri inputd package is not available for system `${system}`. Set services.korri.input.inputd.package explicitly.");

  isInputplumber = cfg.provider.enable && cfg.provider.name == "inputplumber";

  inherit (lib)
    mkEnableOption
    mkIf
    mkMerge
    mkOption
    types
    ;
in
{
  options.services.korri.input = {
    provider = {
      enable = mkEnableOption "host-side normalized appliance input provider";

      name = mkOption {
        type = types.nullOr (types.enum [ "inputplumber" ]);
        default = null;
        example = "inputplumber";
        description = ''
          Identifier for the normalized-input provider. Today the only
          self-wiring value is "inputplumber" — it enables services.inputplumber,
          loads the uinput kernel module, and writes the /dev/uinput udev
          rule downstream consumers (Sunshine) need. Additional values will
          be added as platforms appear that supply normalized input
          differently.
        '';
      };

      package = mkOption {
        type = types.package;
        default = pkgs.inputplumber;
        defaultText = lib.literalExpression "pkgs.inputplumber";
        description = "InputPlumber package used when provider.name = \"inputplumber\".";
      };

      services = mkOption {
        type = types.listOf types.str;
        default = [ ];
        example = [ "platform-input.service" ];
        description = ''
          Additional platform-owned service units that must be ordered before
          downstream consumers of normalized input. When name = "inputplumber"
          the module implicitly appends "inputplumber.service"; platforms do
          not need to list it themselves.
        '';
      };
    };

    inputd = {
      enable = mkEnableOption "Korri input bridge and shortcut daemon";

      package = mkOption {
        type = types.package;
        default = inputdDefaultPackage;
        defaultText = lib.literalExpression "inputs.korri.packages.\${pkgs.stdenv.hostPlatform.system}.korri-inputd";
        description = "Korri inputd package to run.";
      };

      port = mkOption {
        type = types.port;
        default = 3002;
        description = "TCP port for the Korri native input WebSocket bridge.";
      };

      hostname = mkOption {
        type = types.str;
        default = "127.0.0.1";
        description = ''
          Address for the Korri native input WebSocket bridge to bind. The
          default is loopback-only because production desktop input is brokered
          locally by the desktop process. Override deliberately for remote
          inputd debugging.
        '';
      };

      environment = mkOption {
        type = types.attrsOf types.str;
        default = { };
        description = ''
          Extra environment variables for korri-inputd. This is the integration
          point for device/profile-specific action commands such as
          KORRI_INPUTD_BRIGHTNESS_UP or KORRI_INPUTD_BOTTOM_KEYBOARD.
        '';
      };

      path = mkOption {
        type = types.listOf types.package;
        default = with pkgs; [
          bash
          brightnessctl
          coreutils
          procps
          pulseaudio
          systemd
        ];
        description = "Packages added to PATH for shortcut action commands.";
      };

      wants = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "Additional systemd units wanted by korri-inputd.service.";
      };

      after = mkOption {
        type = types.listOf types.str;
        default = [ "systemd-udevd.service" ];
        description = "Systemd units that korri-inputd.service starts after.";
      };

      before = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = ''
          Systemd units that korri-inputd.service starts before. The Korri
          compositor module sets this to ["korri-compositor.service"] via
          mkDefault when the kiosk surface is on, so normalized input is
          available before the session starts.
        '';
      };
    };
  };

  config = mkMerge [
    # Provider-level assertion: declaring `provider.enable = true` without a
    # named provider is a configuration error.
    (mkIf cfg.provider.enable {
      assertions = [
        {
          assertion = cfg.provider.name != null;
          message = ''
            services.korri.input.provider.enable = true requires
            services.korri.input.provider.name to be set. The only supported
            value today is "inputplumber".
          '';
        }
      ];
    })

    # InputPlumber full-wiring branch.
    (mkIf isInputplumber {
      services.inputplumber = {
        enable = true;
        package = cfg.provider.package;
      };

      # uinput is the OUTPUT side of normalized input: InputPlumber writes
      # virtual Xbox 360 controllers through /dev/uinput, and Sunshine reads
      # them as the streamed gamepad. uhid (the DualSense passthrough path)
      # is deliberately NOT loaded — that's a separate opt-in.
      boot.kernelModules = [ "uinput" ];

      services.udev.extraRules = ''
        # Uinput access for normalized appliance input. Owned by
        # services.korri.input.provider when name = "inputplumber".
        KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
        KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess"
      '';

      # Order downstream consumers after the provider service so /dev/uinput
      # is ready when they start. inputd does not depend on uinput itself
      # (it talks WebSocket to the local client), but ordering it after
      # inputplumber keeps the boot chain sane when both are enabled.
      services.korri.input.inputd.wants = [ "inputplumber.service" ];
      services.korri.input.inputd.after = [ "inputplumber.service" ];
    })

    # Provider-supplied platform services are forwarded into inputd's
    # dependency lists so the same boot ordering applies regardless of
    # provider name.
    (mkIf (cfg.provider.enable && cfg.provider.services != [ ]) {
      services.korri.input.inputd.wants = cfg.provider.services;
      services.korri.input.inputd.after = cfg.provider.services;
    })

    (mkIf cfg.inputd.enable {
      environment.systemPackages = [ cfg.inputd.package ];

      systemd.services.korri-inputd = {
        description = "Korri input bridge and shortcut daemon";
        wantedBy = [ "multi-user.target" ];
        inherit (cfg.inputd)
          wants
          after
          before
          path
          ;
        environment = cfg.inputd.environment // {
          KORRI_INPUT_BRIDGE_PORT = toString cfg.inputd.port;
          KORRI_INPUT_BRIDGE_HOSTNAME = cfg.inputd.hostname;
        };
        serviceConfig = {
          ExecStart = "${cfg.inputd.package}/bin/korri-inputd";
          Restart = "on-failure";
          RestartSec = 1;
        };
      };
    })
  ];
}
