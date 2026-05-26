# Points `pkgs.moonlight-embedded` and `pkgs.sunshine` at the Korri-downstream
# packages defined under `packages/`. Applied to every nixpkgs import that
# backs a Korri build:
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
{ nix-on-rocks }:

final: prev: {
  moonlight-embedded = final.callPackage ../../packages/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
  };
  sunshine = prev.callPackage ../../packages/sunshine-korri/package.nix {
    sunshine = prev.sunshine;
  };
}
