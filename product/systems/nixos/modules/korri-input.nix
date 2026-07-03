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

  korriBacklightStep = pkgs.writeShellApplication {
    name = "korri-backlight-step";
    runtimeInputs = with pkgs; [ coreutils ];
    text = ''
      usage() {
        echo "usage: korri-backlight-step [+N|-N][%]" >&2
      }

      step="''${1:-}"
      case "$step" in
        +*|-*) ;;
        *) usage; exit 64 ;;
      esac

      sign="''${step:0:1}"
      amount="''${step:1}"
      amount="''${amount%\%}"
      if [ -z "$amount" ]; then
        usage
        exit 64
      fi
      case "$amount" in
        *[!0-9]*) usage; exit 64 ;;
      esac

      backlight_root="''${KORRI_BACKLIGHT_ROOT:-/sys/class/backlight}"
      adjusted=0
      found=0

      for device in "$backlight_root"/*; do
        [ -d "$device" ] || continue
        found=1

        brightness_file="$device/brightness"
        max_file="$device/max_brightness"
        device_name="$(basename "$device")"

        if [ ! -r "$brightness_file" ] || [ ! -r "$max_file" ] || [ ! -w "$brightness_file" ]; then
          echo "korri-backlight-step: skipping $device_name; brightness is not readable/writable" >&2
          continue
        fi

        current="$(cat "$brightness_file")"
        max="$(cat "$max_file")"
        case "$current:$max" in
          *[!0-9:]*|:*)
            echo "korri-backlight-step: skipping $device_name; non-numeric brightness" >&2
            continue
            ;;
        esac
        if [ "$max" -le 0 ]; then
          echo "korri-backlight-step: skipping $device_name; max_brightness is $max" >&2
          continue
        fi

        delta=$(((max * amount + 99) / 100))
        if [ "$delta" -lt 1 ]; then
          delta=1
        fi

        if [ "$sign" = "+" ]; then
          next=$((current + delta))
        else
          next=$((current - delta))
        fi

        if [ "$next" -lt 1 ]; then
          next=1
        fi
        if [ "$next" -gt "$max" ]; then
          next="$max"
        fi

        if printf '%s\n' "$next" >"$brightness_file"; then
          adjusted=$((adjusted + 1))
          echo "korri-backlight-step: $device_name $current -> $next / $max" >&2
        else
          echo "korri-backlight-step: failed to write $device_name" >&2
        fi
      done

      if [ "$found" -eq 0 ]; then
        echo "korri-backlight-step: no backlight devices under $backlight_root" >&2
        exit 1
      fi
      if [ "$adjusted" -eq 0 ]; then
        echo "korri-backlight-step: no writable backlight devices adjusted" >&2
        exit 1
      fi
    '';
  };

  # Featherweight Wayland layer-shell overlay renderer that inputd spawns for the
  # hold ring + decision menu. inputd already runs with the compositor wayland
  # environment, so it owns the renderer directly.
  overlayRenderer = import ../../../services/device/overlay-renderer/package.nix {
    inherit pkgs;
  };

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
  # Stable module key so multiple imports (e.g. via nixosModules.korri-compositor
  # composite + nixosModules.korri-daemon composite) deduplicate to a single
  # declaration.
  _file = ./korri-input.nix;
  key = ./korri-input.nix;

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

      extraDataPackages = mkOption {
        type = types.listOf types.package;
        default = [ ];
        example = lib.literalExpression "[ inputplumberDataPackage ]";
        description = ''
          Packages whose share directories are prepended to InputPlumber's
          XDG_DATA_DIRS before the resolved provider package. Platform adapters
          use this for device-map packages that must override the default
          InputPlumber data bundled in the active service package.
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
    (mkIf cfg.inputd.enable {
      services.korri.input.inputd = {
        environment = {
          KORRI_INPUTD_BRIGHTNESS_UP = lib.mkDefault "korri-backlight-step +5";
          KORRI_INPUTD_BRIGHTNESS_DOWN = lib.mkDefault "korri-backlight-step -5";
          # Decision overlay: inputd spawns this renderer for the hold ring and
          # the tap decision menu (drives it over stdin; gates the game via the
          # InputPlumber intercept). Override/unset to disable the overlay.
          KORRI_OVERLAY_RENDERER_BIN =
            lib.mkDefault "${overlayRenderer}/bin/korri-overlay-renderer";
        };
        path = [
          korriBacklightStep
          pkgs.glib # gdbus, for the InputPlumber intercept ui_* event stream
        ];
      };
    })

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
        {
          assertion = lib.all (service: lib.hasSuffix ".service" service) cfg.provider.services;
          message = ''
            services.korri.input.provider.services entries must be systemd service units
            ending in .service.
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

      systemd.services.inputplumber.environment.XDG_DATA_DIRS =
        (if cfg.provider.extraDataPackages == [ ] then lib.mkOverride 60 else lib.mkOverride 45)
          (
            lib.concatStringsSep ":" (
              (map (pkg: "${pkg}/share") cfg.provider.extraDataPackages)
              ++ [ "${config.services.inputplumber.package}/share" ]
            )
          );

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

      # Inputd always consumes the normalized InputPlumber virtual gamepad as
      # Korri's standard gamepad path; declaring the provider supplies the
      # runtime and boot ordering, not a per-device opt-in flag.
    })

    # Provider-supplied platform services are forwarded into inputd's
    # dependency lists so the same boot ordering applies regardless of
    # provider name.
    (mkIf (cfg.provider.enable && cfg.provider.services != [ ]) {
      services.korri.input.inputd.wants = cfg.provider.services;
      services.korri.input.inputd.after = cfg.provider.services;
    })

    (mkIf cfg.inputd.enable {
      assertions = [
        {
          assertion =
            cfg.inputd.hostname == "127.0.0.1"
            || cfg.inputd.hostname == "localhost"
            || cfg.inputd.hostname == "::1";
          message = "services.korri.input.inputd.hostname must be loopback-only for appliance profiles.";
        }
      ];

      environment.systemPackages = [ cfg.inputd.package ];

      systemd.user.services.korri-inputd = {
        description = "Korri input bridge and shortcut daemon";
        wantedBy = [ "korri-session.target" ];
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
          NoNewPrivileges = true;
          PrivateTmp = true;
          MemoryDenyWriteExecute = false;
        };
      };
    })
  ];
}
