# Korri-downstream substitutions into nixpkgs.
#
# Points `pkgs.moonlight-embedded` and `pkgs.sunshine` at the Korri-downstream
# packages defined under `packages/`, and adds the additive
# `pkgs.libretro-fake-08` attribute used by the kiosk RetroArch closure.
# Applied to every nixpkgs import that backs a Korri build:
#   - the per-system `pkgs` in flake.nix (used by korri-desktop wrap variants
#     and the desktop build-graph check)
#   - the nixpkgs backing every `nixosConfiguration` produced via
#     `product/systems/nixos/images/common.nix` (rocknix-sm8550, x86 kiosk/headless, live USB),
#     so service-level defaults like `services.sunshine.package` and the
#     `services.korri.compositor.path` Moonlight entries pick up the Korri
#     patches without needing per-call rewrites.
#
# `sunshine` must be evaluated via `prev.callPackage` and explicitly threaded
# `sunshine = prev.sunshine` to avoid infinite recursion when the overlay
# value itself derives from `sunshine.overrideAttrs`.
#
# `libretro-fake-08` and `gamescope-korri` are additive package lanes: no
# upstream nixpkgs attribute is replaced until the downstream package is ready to
# become a runtime default.
{ nix-on-rocks, fake-08-src }:

final: prev: {
  moonlight-embedded = final.callPackage ../../../../packages/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
  };
  sunshine = prev.callPackage ../../../../packages/sunshine-korri/package.nix {
    sunshine = prev.sunshine;
  };
  libretro-fake-08 = final.callPackage ../../../../packages/libretro-fake-08/package.nix {
    inherit fake-08-src;
  };
  gamescope-korri = final.callPackage ../../../../packages/gamescope-korri/package.nix {
    gamescope = prev.gamescope;
  };
}
