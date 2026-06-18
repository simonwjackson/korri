# Korri-downstream substitutions into nixpkgs.
#
# This generic overlay owns shared runtime package substitutions and additive
# vendor package lanes. Plugin package overlays are composed separately by the
# product/image plugin composition seam.
{
  nix-on-rocks,
  fake-08-src,
  wasm4-src,
  nixpkgs-godot,
  nixpkgs-mesa,
}:

final: prev:
let
  moonlightEmbeddedKorri = final.callPackage ../../../vendor/moonlight-embedded-korri/package.nix {
    inherit nix-on-rocks;
  };

  ryubingKorri = final.callPackage ../../../vendor/ryubing-korri/package.nix {
    ryubing = prev.ryubing;
    inherit nixpkgs-mesa;
  };
in
{
  moonlight-embedded = moonlightEmbeddedKorri;
  moonlight-embedded-korri = moonlightEmbeddedKorri;

  ryubing = if prev.stdenv.hostPlatform.isAarch64 then ryubingKorri else prev.ryubing;
  ryubing-korri = ryubingKorri;

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

  libretro-fake-08 = final.callPackage ../../../vendor/libretro-fake-08/package.nix {
    inherit fake-08-src;
  };
}
