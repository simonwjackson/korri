{
  nixpkgs-mesa ? null,
}:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  # RetroArch plugin-owned kiosk closure: the bare RetroArch binary plus the
  # first-party libretro cores that nixpkgs already provides. Keep this as a
  # flag-free symlinkJoin; Korri's launch materializer passes exactly one
  # `-L <core> <content>` pair per foreground launch.
  ppssppCore = pkgs.libretro.ppsspp.overrideAttrs (old: {
    # nixpkgs marks libretro-ppsspp as aarch64-linux-bad even though PPSSPP is
    # the only first-party Libretro PSP core and Sobo's SM8550 target should be
    # able to build/run it. Keep the override local to this plugin-owned bundle.
    meta = old.meta // {
      badPlatforms = [ ];
    };
  });

  canPinTurnip = pkgs.stdenv.hostPlatform.isAarch64 && nixpkgs-mesa != null;
  retroarchBinary =
    if canPinTurnip then
      pkgs.callPackage ../../turnip/packages/turnip-wrapper/default.nix {
        inherit nixpkgs-mesa;
        package = pkgs.retroarch-bare;
        executable = "retroarch";
        name = "retroarch-bare-korri-turnip-${pkgs.retroarch-bare.version or "unknown"}";
      }
    else
      pkgs.retroarch-bare;

  shaderPresetPackage = pkgs.libretro-shaders-slang;
  shaderPresetDirectory = "${shaderPresetPackage}/share/libretro/shaders/shaders_slang";
  joypadAutoconfigPackage = pkgs.retroarch-joypad-autoconfig;
  joypadAutoconfigDirectory = "${joypadAutoconfigPackage}/share/libretro/autoconfig";
  inputplumberJoypadAutoconfigPackage =
    pkgs.runCommand "korri-inputplumber-retroarch-autoconfig" { }
      ''
        mkdir -p $out/share/libretro
        cp -R --no-preserve=mode,ownership ${joypadAutoconfigDirectory} $out/share/libretro/autoconfig
        chmod -R u+w $out/share/libretro/autoconfig
        sed -i '/^input_menu_toggle_btn\(_label\)\? =/d' \
          "$out/share/libretro/autoconfig/udev/Microsoft X-Box 360 pad.cfg"
      '';
  inputplumberJoypadAutoconfigDirectory = "${inputplumberJoypadAutoconfigPackage}/share/libretro/autoconfig";

  inputplumberRetroArchPolicy = {
    drivers = {
      input = "udev";
      joypad = "udev";
    };
    paths.joypadAutoconfigDirectory = inputplumberJoypadAutoconfigDirectory;
    input = {
      autodetect = true;
      maxUsers = 4;
      menuToggleGamepadCombo = "l3-r3";
      ports."1" = {
        joypadIndex = 0;
        analogDpadMode = 1;
      };
    };
  };

  retroarchKiosk = pkgs.symlinkJoin {
    name = "korri-retroarch";
    paths = [
      retroarchBinary
      pkgs.libretro.fuse
      pkgs.libretro.mgba
      pkgs.libretro.mupen64plus
      pkgs.libretro.genesis-plus-gx
      pkgs.libretro.beetle-pce-fast
      pkgs.libretro.mesen
      pkgs.libretro.np2kai
      pkgs.libretro.pcsx-rearmed
      ppssppCore
      pkgs.libretro.bsnes
      shaderPresetPackage
      joypadAutoconfigPackage
    ];
    passthru = {
      cores = [
        pkgs.libretro.fuse
        pkgs.libretro.mgba
        pkgs.libretro.mupen64plus
        pkgs.libretro.genesis-plus-gx
        pkgs.libretro.beetle-pce-fast
        pkgs.libretro.mesen
        pkgs.libretro.np2kai
        pkgs.libretro.pcsx-rearmed
        ppssppCore
        pkgs.libretro.bsnes
      ];
      shaderPresets = shaderPresetPackage;
      shaderPresetDirectory = shaderPresetDirectory;
      joypadAutoconfig = joypadAutoconfigPackage;
      joypadAutoconfigDirectory = joypadAutoconfigDirectory;
      inputplumberJoypadAutoconfig = inputplumberJoypadAutoconfigPackage;
      inputplumberJoypadAutoconfigDirectory = inputplumberJoypadAutoconfigDirectory;
      mesaTurnip = retroarchBinary.passthru.mesaTurnip or null;
      turnipIcd = retroarchBinary.passthru.vulkanIcd or null;
      turnipPinned = retroarchBinary.passthru.turnipPinned or false;
      unwrapped = pkgs.retroarch-bare;
      wrapped = retroarchBinary;
    };
  };
in
{
  config = lib.mkIf config.services.korri.compositor.kiosk.enable {
    # Stable abs path the plugin-owned readable runtime can reference without
    # baking a per-build nix store hash into user-authored launch data.
    nixpkgs.config.allowUnfreePredicate =
      pkg: builtins.elem (lib.getName pkg) [ "libretro-genesis-plus-gx" ];

    environment.etc."korri/cores/fuse_libretro.so".source =
      "${pkgs.libretro.fuse}/lib/retroarch/cores/fuse_libretro.so";
    environment.etc."korri/cores/mgba_libretro.so".source =
      "${pkgs.libretro.mgba}/lib/retroarch/cores/mgba_libretro.so";
    environment.etc."korri/cores/mupen64plus_next_libretro.so".source =
      "${pkgs.libretro.mupen64plus}/lib/retroarch/cores/mupen64plus_next_libretro.so";
    environment.etc."korri/cores/genesis_plus_gx_libretro.so".source =
      "${pkgs.libretro.genesis-plus-gx}/lib/retroarch/cores/genesis_plus_gx_libretro.so";
    environment.etc."korri/cores/mednafen_pce_fast_libretro.so".source =
      "${pkgs.libretro.beetle-pce-fast}/lib/retroarch/cores/mednafen_pce_fast_libretro.so";
    environment.etc."korri/cores/mesen_libretro.so".source =
      "${pkgs.libretro.mesen}/lib/retroarch/cores/mesen_libretro.so";
    environment.etc."korri/cores/np2kai_libretro.so".source =
      "${pkgs.libretro.np2kai}/lib/retroarch/cores/np2kai_libretro.so";
    environment.etc."korri/cores/pcsx_rearmed_libretro.so".source =
      "${pkgs.libretro.pcsx-rearmed}/lib/retroarch/cores/pcsx_rearmed_libretro.so";
    environment.etc."korri/cores/ppsspp_libretro.so".source =
      "${ppssppCore}/lib/retroarch/cores/ppsspp_libretro.so";
    environment.etc."korri/cores/bsnes_libretro.so".source =
      "${pkgs.libretro.bsnes}/lib/retroarch/cores/bsnes_libretro.so";
    environment.etc."korri/shaders/slang".source = shaderPresetDirectory;

    services.korri.daemon.library.platformDefaults.host.plugin."@korri:retroarch" = lib.mkIf (
      config.services.korri.input.provider.name == "inputplumber"
    ) inputplumberRetroArchPolicy;

    services.korri.compositor.path = lib.mkAfter [ retroarchKiosk ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ retroarchKiosk ];
  };
}
