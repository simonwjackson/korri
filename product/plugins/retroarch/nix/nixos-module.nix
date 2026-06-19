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

  system = pkgs.stdenv.hostPlatform.system;
  cpuName = pkgs.stdenv.hostPlatform.parsed.cpu.name;
  canPinTurnip = pkgs.stdenv.hostPlatform.isAarch64 && nixpkgs-mesa != null;
  mesaTurnip = if canPinTurnip then nixpkgs-mesa.legacyPackages.${system}.mesa else null;
  turnipIcd =
    if canPinTurnip then "${mesaTurnip}/share/vulkan/icd.d/freedreno_icd.${cpuName}.json" else null;

  retroarchBinary =
    if canPinTurnip then
      pkgs.symlinkJoin {
        name = "retroarch-bare-korri-turnip-${pkgs.retroarch-bare.version or "unknown"}";
        pname = "retroarch-bare";
        version = pkgs.retroarch-bare.version or "unknown";
        paths = [ pkgs.retroarch-bare ];
        nativeBuildInputs = [ pkgs.makeWrapper ];
        postBuild = ''
          rm -f "$out/bin/retroarch"
          makeWrapper ${pkgs.retroarch-bare}/bin/retroarch "$out/bin/retroarch" \
            --set VK_DRIVER_FILES ${turnipIcd} \
            --set VK_ICD_FILENAMES ${turnipIcd}
        '';
        passthru = (pkgs.retroarch-bare.passthru or { }) // {
          inherit mesaTurnip turnipIcd;
          turnipPinned = true;
          unwrapped = pkgs.retroarch-bare;
        };
        meta = (pkgs.retroarch-bare.meta or { }) // {
          description = "${
            pkgs.retroarch-bare.meta.description or "RetroArch"
          } (Korri: Turnip pinned to Mesa ${mesaTurnip.version})";
        };
      }
    else
      pkgs.retroarch-bare;

  retroarchKiosk = pkgs.symlinkJoin {
    name = "korri-retroarch";
    paths = [
      retroarchBinary
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
    passthru = {
      cores = [
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
      inherit mesaTurnip turnipIcd;
      turnipPinned = canPinTurnip;
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

    services.korri.compositor.path = lib.mkAfter [ retroarchKiosk ];
    systemd.user.services.korri-sessiond.path = lib.mkAfter [ retroarchKiosk ];
  };
}
