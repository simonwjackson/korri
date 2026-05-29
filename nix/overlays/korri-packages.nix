# Korri-downstream substitutions into nixpkgs.
#
# Points `pkgs.moonlight-embedded` and `pkgs.sunshine` at the Korri-downstream
# packages defined under `packages/`, adds the additive `pkgs.SDL2-korri`
# package used by Moonlight, and adds the additive `pkgs.libretro-fake-08`
# attribute used by the kiosk RetroArch closure.
# Applied to every nixpkgs import that backs a Korri build:
#   - the per-system `pkgs` in flake.nix (used by korri-desktop wrap variants
#     and the desktop build-graph check)
#   - the nixpkgs backing every `nixosConfiguration` produced via
#     `nix/images/common.nix` (rocknix-sm8550, x86 kiosk/headless, live USB),
#     so service-level defaults like `services.sunshine.package` and the
#     `services.korri.compositor.path` Moonlight entries pick up the Korri
#     patches without needing per-call rewrites.
#
# `sunshine` must be evaluated via `prev.callPackage` and explicitly threaded
# `sunshine = prev.sunshine` to avoid infinite recursion when the overlay
# value itself derives from `sunshine.overrideAttrs`.
#
# `SDL2-korri` is deliberately additive rather than a global `pkgs.SDL2`
# replacement. Today only Moonlight needs the Batocera/Knulli mali fbdev path,
# and redefining the global SDL2 alias would widen the blast radius to Sunshine,
# desktop shells, libretro cores, and any future nixpkgs consumer. If that
# broader substitution becomes desirable, make it as a separate step with its
# own closure and device evidence.
#
# `libretro-fake-08` is also purely additive: no upstream nixpkgs attribute of
# that name exists, so a plain `final.callPackage` is sufficient.
{ nix-on-rocks, fake-08-src }:

final: prev: {
  SDL2-korri = final.callPackage ../../packages/SDL2-korri/package.nix { };

  moonlight-embedded = final.callPackage ../../packages/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
    SDL2 = final.SDL2-korri;
  };
  sunshine = prev.callPackage ../../packages/sunshine-korri/package.nix {
    sunshine = prev.sunshine;
  };
  libretro-fake-08 = final.callPackage ../../packages/libretro-fake-08/package.nix {
    inherit fake-08-src;
  };
}
