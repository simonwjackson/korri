# Korri-downstream substitutions into nixpkgs.
#
# Globally replaces upstream runtime package names with Korri downstream
# packages:
#   - `pkgs.gamescope` -> `gamescope-korri`
#   - `pkgs.moonlight-embedded` -> `moonlight-embedded-korri`
#   - `pkgs.sunshine` -> `sunshine-korri`
# and adds the additive `pkgs.libretro-fake-08` attribute used by the kiosk
# RetroArch closure.
#
# Applied to every nixpkgs import that backs a Korri build:
#   - the per-system `pkgs` in flake.nix (used by korri-desktop wrap variants
#     and the desktop build-graph check)
#   - the nixpkgs backing every `nixosConfiguration` produced via
#     `product/systems/nixos/images/common.nix` (rocknix-sm8550, x86 kiosk/headless, live USB),
#     so service/module code can consistently reference `pkgs.gamescope` and
#     `pkgs.moonlight-embedded` without per-call downstream rewrites.
#
# `sunshine` must be evaluated via `prev.callPackage` and explicitly threaded
# `sunshine = prev.sunshine` to avoid infinite recursion when the overlay
# value itself derives from `sunshine.overrideAttrs`.
#
# `gamescope-korri` wraps a pinned Gamescope 3.16.23 base rather than the
# channel `prev.gamescope`. SM8550 requires >= 3.16.20 for the v4l2m2m
# Moonlight path, while the x86 compositor path was validated against the same
# 3.16.23 pipewire loop-lock fix. Keeping that pin here makes `pkgs.gamescope`
# the single downstream runtime package everywhere.
#
# `retroarch-bare` is the one runtime-default override in this overlay: Korri's
# first-class patch support accepts .xdelta only because this package is built
# with RetroArch's --enable-xdelta flag and liblzma available. Keep the
# colocated check in tools/testing/nix/korri-retroarch-xdelta-check.nix green
# when changing this package.
#
# `libretro-fake-08` and `smb-remastered` are additive package lanes: no
# upstream nixpkgs attribute is replaced until the downstream package is ready
# to become a runtime default.
#
# `smb-remastered` consumes `nixpkgs-godot` (a secondary nixpkgs pin
# carrying Godot 4.6.x that the repo's main nixpkgs-25.11 pin does not
# yet ship) rather than `prev.godot`, so the upgrade can land in a
# narrow scope without bumping the rest of the substrate. See the
# vendor README for the policy.
{
  nix-on-rocks,
  fake-08-src,
  smbr-src,
  sm127-src,
  nixpkgs-godot,
}:

final: prev:
let
  pinnedGamescopePkgs =
    import
      (builtins.fetchTarball {
        url = "https://github.com/NixOS/nixpkgs/archive/0c6db2b5d257d845bbee67a38dee43bbca3bd462.tar.gz";
        sha256 = "0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3";
      })
      {
        system = prev.stdenv.hostPlatform.system;
        config.allowUnfree = true;
      };

  gamescopeKorri = final.callPackage ../../../vendor/gamescope-korri/package.nix {
    gamescope = pinnedGamescopePkgs.gamescope;
  };

  moonlightEmbeddedKorri = final.callPackage ../../../vendor/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
  };
in
{
  gamescope = gamescopeKorri;
  gamescope-korri = gamescopeKorri;

  moonlight-embedded = moonlightEmbeddedKorri;
  moonlight-embedded-korri = moonlightEmbeddedKorri;

  retroarch-bare = prev.retroarch-bare.overrideAttrs (old: {
    buildInputs = (old.buildInputs or [ ]) ++ [ final.xz ];
    configureFlags = (old.configureFlags or [ ]) ++ [ "--enable-xdelta" ];
    passthru = (old.passthru or { }) // {
      xdeltaPatches = true;
      xdeltaLzmaPackage = final.xz;
    };
  });

  sunshine = prev.callPackage ../../../vendor/sunshine-korri/package.nix {
    sunshine = prev.sunshine;
  };
  sunshine-korri = final.sunshine;
  libretro-fake-08 = final.callPackage ../../../vendor/libretro-fake-08/package.nix {
    inherit fake-08-src;
  };
  smb-remastered = final.callPackage ../../../vendor/super-mario-bros-remastered/package.nix {
    inherit smbr-src nixpkgs-godot;
  };
  super-mario-127 = final.callPackage ../../../vendor/super-mario-127/package.nix {
    inherit sm127-src;
  };
  yoshis-fabrication-station =
    final.callPackage ../../../vendor/yoshis-fabrication-station/package.nix
      { };
}
