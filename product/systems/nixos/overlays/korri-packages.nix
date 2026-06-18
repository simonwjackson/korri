# Korri-downstream substitutions into nixpkgs.
#
# This generic overlay owns shared runtime package substitutions and additive
# vendor package lanes. Plugin package overlays are composed separately by the
# product/image plugin composition seam.
{
  nix-on-rocks,
  wasm4-src,
  nixpkgs-godot,
}:

final: prev:
let
  moonlightEmbeddedKorri = final.callPackage ../../../vendor/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
  };

in
{
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
  steam-korri = final.callPackage ../../../vendor/steam-korri/package.nix { };
  libretro-wasm4 = final.callPackage ../../../vendor/libretro-wasm4/package.nix {
    inherit wasm4-src;
  };
}
