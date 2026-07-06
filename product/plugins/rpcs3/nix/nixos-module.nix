{
  config,
  lib,
  pkgs,
  ...
}:

let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  cfg = config.services.korri.rpcs3;
  inputSeat = config.services.korri.input.inputSeat or { enable = false; };
  rpcs3Command = "${cfg.package}/bin/rpcs3";
in
{
  options.services.korri.rpcs3 = {
    enable = mkEnableOption "Korri RPCS3 source-machine runtime wiring";

    package = mkOption {
      type = types.package;
      default = pkgs.rpcs3;
      defaultText = lib.literalExpression "pkgs.rpcs3";
      description = "RPCS3 package used by Korri-managed PS3 launches.";
    };

    gamesRoot = mkOption {
      type = types.str;
      default = "/srv/lakes/towada/gaming/games/sony-playstation-3";
      description = "Storage root containing PS3 JB disc folders.";
    };

    stateRoot = mkOption {
      type = types.str;
      default = "${config.services.korri.runtime.stateRoot}/rpcs3";
      defaultText = lib.literalExpression ''${config.services.korri.runtime.stateRoot}/rpcs3'';
      description = "RPCS3 state root containing dev_hdd0/dev_flash data.";
    };

    firmwareSentinel = mkOption {
      type = types.str;
      default = "dev_flash/sys/external/liblv2.sprx";
      description = "State-root-relative file that proves PS3 firmware has been installed for RPCS3.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = pkgs.stdenv.hostPlatform.isx86_64;
        message = "Korri RPCS3 source-machine runtime currently supports only x86_64-linux hosts.";
      }
    ];

    environment.systemPackages = [ cfg.package ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ cfg.package ];

    services.korri.daemon.library.platformDefaults = {
      storage = {
        "@korri:rpcs3/ps3-games" = {
          root = cfg.gamesRoot;
        };
        "@korri:rpcs3/state" = {
          root = cfg.stateRoot;
        };
      };
      sources."@korri:rpcs3/ps3-games" = {
        title = "RPCS3 PS3 disc folders";
        kind = [ "files" ];
        storage = "@korri:rpcs3/ps3-games";
        app = "@korri:rpcs3/rpcs3";
        runtime = "@korri:rpcs3/rpcs3";
      };
      launchers."@korri:rpcs3/rpcs3" = {
        plugin = "@korri:rpcs3";
        command = rpcs3Command;
        args = [
          "--no-gui"
          "{content.path}"
        ];
        systems = [ "ps3" ];
        policy.allowedCommands = [ rpcs3Command ];
        # `command` is intentionally NOT rendered into settings.plugin: the
        # Rpcs3Policy authoring surface is delivery-agnostic (command is the
        # app-record field above) and the daemon rejects unexpected policy keys.
        settings.plugin = {
          state.root = "{storage:@korri:rpcs3/state}";
          firmware.sentinel = cfg.firmwareSentinel;
        };
      }
      // lib.optionalAttrs (inputSeat.enable or false) {
        launch."with"."@korri:input-seat" = {
          runtimeSupportsExtraSeats = true;
        };
      };
      host.plugin."@korri:rpcs3" = {
        state.root = "{storage:@korri:rpcs3/state}";
        firmware.sentinel = cfg.firmwareSentinel;
      };
    };
  };
}
