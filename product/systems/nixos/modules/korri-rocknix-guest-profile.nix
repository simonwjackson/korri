# Shared ROCKNIX guest-profile activation and stage10 proof-marker.
#
# ROCKNIX guest platforms must keep the nix-on-rocks boot-selected guest
# profile in sync after switch-to-configuration and stamp a proof marker that
# identifies the Korri layer. The mechanics are shared across chipsets; only
# the marker label is platform-specific.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.korri.rocknixGuestProfile;

  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;
in
{
  key = "korri-rocknix-guest-profile";

  options.services.korri.rocknixGuestProfile = {
    enable = mkEnableOption "Korri ROCKNIX guest-profile activation and stage10 proof marker";

    proofMarkerLabel = mkOption {
      type = types.str;
      example = "korri-sm8550-kiosk-system";
      description = ''
        Single-line platform identity written as the first line of
        /etc/rocknix-stage10-proof-marker when the ROCKNIX guest-profile
        integration is enabled.
      '';
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.proofMarkerLabel != "" && !(lib.hasInfix "\n" cfg.proofMarkerLabel);
        message = "services.korri.rocknixGuestProfile.proofMarkerLabel must be a non-empty single line when enabled.";
      }
    ];

    # Keep the nix-on-rocks boot-selected guest profile in sync after switches.
    # `$systemConfig` is injected by switch-to-configuration at activation time;
    # do not replace it with config.system.build.toplevel, which would recurse
    # because this activation script is part of the toplevel.
    system.activationScripts.korri-rocknix-guest-profile = {
      text = ''
        profile_dir=/nix/var/nix/profiles/per-user/root
        ${pkgs.coreutils}/bin/mkdir -p "$profile_dir"
        ${pkgs.nix}/bin/nix-env \
          --profile "$profile_dir/rocknix-guest-system" \
          --set "$systemConfig"
      '';
      deps = [ "users" ];
    };

    environment.etc."rocknix-stage10-proof-marker".text = ''
      ${cfg.proofMarkerLabel}
      target=${config.networking.hostName}
    '';
  };
}
